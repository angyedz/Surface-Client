import {
  InstanceProfile,
  InstalledMod,
  DependencyIssue,
  ModDependency,
  ModLoader,
} from '../types/launcher';
import { getModrinthProject, getProjectVersions } from './modrinthApi';

export interface DependencyGraphNode {
  modId: string;
  title: string;
  slug: string;
  iconUrl?: string;
  status: 'installed' | 'missing' | 'conflict';
  requiredBy: string[]; // titles of mods that require this
  dependencies: {
    projectId: string;
    slug?: string;
    title: string;
    type: 'required' | 'optional' | 'incompatible';
    isSatisfied: boolean;
  }[];
}

export interface DependencyAnalysisResult {
  isHealthy: boolean;
  issues: DependencyIssue[];
  missingCount: number;
  conflictCount: number;
  nodes: DependencyGraphNode[];
  healthScore: number; // 0 to 100
}

/**
 * Validates whether a mod is present in the installed mods list
 */
export function isModPresent(
  installedMods: InstalledMod[],
  projectIdOrSlug: string
): InstalledMod | undefined {
  const norm = projectIdOrSlug.toLowerCase();
  return installedMods.find(
    (m) =>
      m.modrinthId.toLowerCase() === norm ||
      m.slug.toLowerCase() === norm ||
      m.title.toLowerCase() === norm
  );
}

/**
 * Runs a comprehensive dependency and compatibility analysis on an instance
 */
export function analyzeInstanceDependencies(instance: InstanceProfile): DependencyAnalysisResult {
  const issues: DependencyIssue[] = [];
  const nodes: DependencyGraphNode[] = [];
  const installedMods = instance.installedMods.filter((m) => m.enabled);

  for (const mod of instance.installedMods) {
    if (!mod.enabled) continue;

    // 1. Check Loader Compatibility
    if (instance.loader !== 'vanilla' && mod.loaders && mod.loaders.length > 0) {
      const loaderMatch = mod.loaders.some(
        (l) => l.toLowerCase() === instance.loader.toLowerCase() || (instance.loader === 'neoforge' && l === 'forge')
      );
      if (!loaderMatch) {
        issues.push({
          type: 'wrong_loader',
          severity: 'error',
          sourceMod: mod,
          message: `Mod "${mod.title}" is designed for [${mod.loaders.join(', ')}] but instance uses [${instance.loader}].`,
          canAutoFix: false,
        });
      }
    }

    // 2. Check Minecraft Version Compatibility
    if (mod.gameVersions && mod.gameVersions.length > 0) {
      const versionMatch = mod.gameVersions.some(
        (v) => v === instance.mcVersion || instance.mcVersion.startsWith(v.split('.').slice(0, 2).join('.'))
      );
      if (!versionMatch) {
        issues.push({
          type: 'wrong_version',
          severity: 'warning',
          sourceMod: mod,
          message: `Mod "${mod.title}" is marked for [${mod.gameVersions.join(', ')}] while instance is [${instance.mcVersion}]. It may still work.`,
          canAutoFix: false,
        });
      }
    }

    // 3. Required dependencies, as declared by the mod file's own Modrinth metadata
    const combinedRequired = mod.dependencies?.filter((d) => d.dependencyType === 'required') || [];

    // Check if required dependencies are satisfied
    const nodeDeps: DependencyGraphNode['dependencies'] = [];

    for (const req of combinedRequired) {
      const targetId = req.projectSlug || req.projectId;
      const targetTitle = req.projectTitle || req.projectSlug || req.projectId;
      const found = isModPresent(installedMods, targetId);

      nodeDeps.push({
        projectId: req.projectId,
        slug: req.projectSlug,
        title: targetTitle,
        type: 'required',
        isSatisfied: Boolean(found),
      });

      if (!found) {
        issues.push({
          type: 'missing_required',
          severity: 'error',
          sourceMod: mod,
          targetProjectId: req.projectId,
          targetProjectTitle: targetTitle,
          message: `"${mod.title}" requires "${targetTitle}" which is not installed.`,
          canAutoFix: true,
        });
      }
    }

    // 4. Conflicts, as declared by the mod's own metadata
    const incompatible = mod.dependencies?.filter((d) => d.dependencyType === 'incompatible') || [];
    for (const conflict of incompatible) {
      const target = conflict.projectSlug || conflict.projectId;
      const found = isModPresent(installedMods, target);
      if (found) {
        issues.push({
          type: 'conflict',
          severity: 'error',
          sourceMod: mod,
          targetProjectId: conflict.projectId,
          targetProjectTitle: conflict.projectTitle || found.title,
          message: `"${mod.title}" is marked incompatible with "${found.title}".`,
          canAutoFix: false,
        });
      }
    }

    // Build graph node
    nodes.push({
      modId: mod.id,
      title: mod.title,
      slug: mod.slug,
      iconUrl: mod.iconUrl,
      status: 'installed',
      requiredBy: [],
      dependencies: nodeDeps,
    });
  }

  // Calculate back-references for nodes
  for (const node of nodes) {
    for (const dep of node.dependencies) {
      const targetNode = nodes.find(
        (n) => n.slug === dep.slug || n.modId === dep.projectId || n.title === dep.title
      );
      if (targetNode && !targetNode.requiredBy.includes(node.title)) {
        targetNode.requiredBy.push(node.title);
      }
    }
  }

  const missingCount = issues.filter((i) => i.type === 'missing_required').length;
  const conflictCount = issues.filter((i) => i.type === 'conflict').length;
  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;

  const totalMods = installedMods.length;
  let score = 100;
  if (totalMods > 0) {
    score = Math.max(0, 100 - errorCount * 25 - warningCount * 5);
  }

  return {
    isHealthy: errorCount === 0,
    issues,
    missingCount,
    conflictCount,
    nodes,
    healthScore: score,
  };
}

/**
 * Resolves a missing dependency by fetching its details and best matching file from Modrinth
 */
export async function resolveModDependency(
  projectIdOrSlug: string,
  mcVersion: string,
  loader: ModLoader
): Promise<InstalledMod | null> {
  const project = await getModrinthProject(projectIdOrSlug);
  if (!project) {
    console.warn(`Modrinth has no project called ${projectIdOrSlug}`);
    return null;
  }

  const versions = await getProjectVersions(project.project_id, [loader], [mcVersion]);
  const best = versions[0];
  const file = best?.files.find((f) => f.primary) || best?.files[0];

  // Without a downloadable file there is nothing to install; say so rather than
  // writing a placeholder entry that would fail at launch time.
  if (!best || !file) {
    console.warn(`${project.title} has no ${loader} build for Minecraft ${mcVersion}`);
    return null;
  }

  const subDeps: ModDependency[] = (best.dependencies || [])
    .filter((d) => d.dependency_type === 'required' && d.project_id)
    .map((d) => ({
      projectId: d.project_id as string,
      versionId: d.version_id || undefined,
      fileName: d.file_name || undefined,
      dependencyType: 'required' as const,
    }));

  const projectId = project.project_id;
  const slug = project.slug;
  const title = project.title;
  const summary = project.description;
  const author = project.author;
  const iconUrl = project.icon_url || undefined;
  const versionNumber = best.version_number;
  const versionName = best.name;
  const fileName = file.filename;
  const fileUrl = file.url;
  const fileSize = file.size;
  const sha1 = file.hashes?.sha1;

  const newMod: InstalledMod = {
    id: `mod-${slug}-${best.id}`,
    modrinthId: projectId,
    slug,
    title,
    summary,
    version: versionName,
    versionNumber,
    fileName,
    fileUrl,
    fileSize,
    sha1,
    iconUrl,
    enabled: true,
    loaders: best.loaders as ModLoader[],
    gameVersions: best.game_versions,
    dependencies: subDeps,
    dateInstalled: new Date().toISOString().split('T')[0],
    author,
  };

  return newMod;
}

/**
 * Recursively solves and installs all missing dependencies for an instance
 */
export async function solveAllDependencies(
  instance: InstanceProfile,
  onProgress?: (step: string) => void
): Promise<{
  resolvedMods: InstalledMod[];
  updatedInstance: InstanceProfile;
  remainingIssues: DependencyIssue[];
  resolvedCount: number;
}> {
  const resolvedMods: InstalledMod[] = [];
  let currentInstance = { ...instance, installedMods: [...instance.installedMods] };
  let iterations = 0;
  const maxIterations = 5; // prevent infinite loops

  while (iterations < maxIterations) {
    iterations++;
    const analysis = analyzeInstanceDependencies(currentInstance);
    const missing = analysis.issues.filter((i) => i.type === 'missing_required' && i.canAutoFix);

    if (missing.length === 0) {
      break;
    }

    const uniqueMissingIds = Array.from(
      new Set(missing.map((m) => m.targetProjectId || m.targetProjectTitle!))
    );

    for (const depId of uniqueMissingIds) {
      onProgress?.(`Solving dependency: ${depId}...`);
      const mod = await resolveModDependency(depId, currentInstance.mcVersion, currentInstance.loader);
      if (mod) {
        resolvedMods.push(mod);
        currentInstance.installedMods.push(mod);
      }
    }
  }

  const finalAnalysis = analyzeInstanceDependencies(currentInstance);

  return {
    resolvedMods,
    updatedInstance: currentInstance,
    remainingIssues: finalAnalysis.issues,
    resolvedCount: resolvedMods.length,
  };
}
