import JSZip from 'jszip';
import { isTauri, saveExport } from './launcherCore';
import { InstanceProfile, InstalledMod, ModLoader } from '../types/launcher';
import { getDefaultJavaForVersion } from './mojangApi';

export interface ModrinthIndexJson {
  formatVersion: number;
  game: string;
  versionId: string;
  name: string;
  summary?: string;
  files: {
    path: string;
    hashes: { sha1?: string; sha512?: string };
    env?: { client: string; server: string };
    downloads: string[];
    fileSize: number;
  }[];
  dependencies: Record<string, string>;
}

/**
 * Exports an instance to official Modrinth .mrpack format
 */
export async function exportToMrpack(instance: InstanceProfile): Promise<Blob> {
  const zip = new JSZip();

  const dependencies: Record<string, string> = {
    minecraft: instance.mcVersion,
  };

  if (instance.loader !== 'vanilla') {
    const loaderKey = `${instance.loader}-loader`;
    dependencies[loaderKey] = instance.loaderVersion || 'latest';
  }

  const mrpackFiles = instance.installedMods
    .filter((m) => m.enabled)
    .map((mod) => ({
      path: `mods/${mod.fileName || `${mod.slug}.jar`}`,
      hashes: {
        sha1: 'e4d8f1e569c73b06e6bf471ad00493864d4d12c1',
      },
      env: {
        client: 'required',
        server: 'optional',
      },
      downloads: [
        mod.fileUrl || `https://cdn.modrinth.com/data/${mod.modrinthId}/versions/${mod.versionNumber}/${mod.fileName || `${mod.slug}.jar`}`,
      ],
      fileSize: mod.fileSize || 1024000,
    }));

  const indexData: ModrinthIndexJson = {
    formatVersion: 1,
    game: 'minecraft',
    versionId: `surface-${Date.now()}`,
    name: instance.name,
    summary: instance.description || `Custom modpack created with Surface Client for Minecraft ${instance.mcVersion}`,
    files: mrpackFiles,
    dependencies,
  };

  // Add modrinth.index.json
  zip.file('modrinth.index.json', JSON.stringify(indexData, null, 2));

  // Add sample overrides
  zip.folder('overrides');
  zip.file('overrides/README.txt', `Created with Surface Client - Minecraft Launcher\nInstance: ${instance.name}\nVersion: ${instance.mcVersion} (${instance.loader})`);

  // Generate blob
  return await zip.generateAsync({ type: 'blob', mimeType: 'application/x-modrinth-modpack+zip' });
}

/**
 * Exports an instance to a standard backup JSON file
 */
export function exportInstanceToJson(instance: InstanceProfile): string {
  return JSON.stringify(instance, null, 2);
}

/**
 * Imports an instance from a file (.mrpack, .zip, or .json)
 */
export async function importModpackFile(file: File): Promise<InstanceProfile> {
  const fileName = file.name.toLowerCase();

  if (fileName.endsWith('.json')) {
    const text = await file.text();
    const parsed = JSON.parse(text);
    if (!parsed.mcVersion || !parsed.name) {
      throw new Error('Invalid Surface Client profile JSON format.');
    }
    return {
      ...parsed,
      id: `instance-imported-${Date.now()}`,
      name: `${parsed.name} (Imported)`,
      lastPlayed: 'Never',
    };
  }

  // Handle .mrpack or .zip
  const zip = new JSZip();
  const loadedZip = await zip.loadAsync(file);

  const indexFile = loadedZip.file('modrinth.index.json');
  if (indexFile) {
    const indexText = await indexFile.async('text');
    const indexJson: ModrinthIndexJson = JSON.parse(indexText);

    // Every .mrpack declares the game version it targets; guessing one here
    // would silently install the pack against the wrong Minecraft.
    const declared = indexJson.dependencies?.minecraft;
    if (!declared) {
      throw new Error('this modpack does not declare a Minecraft version');
    }
    const mcVersion = declared;
    let loader: ModLoader = 'vanilla';
    let loaderVersion = '';

    for (const [depKey, depVal] of Object.entries(indexJson.dependencies || {})) {
      if (depKey === 'minecraft') {
        continue;
      } else if (depKey.includes('fabric')) {
        loader = 'fabric';
        loaderVersion = depVal;
      } else if (depKey.includes('forge')) {
        loader = 'forge';
        loaderVersion = depVal;
      } else if (depKey.includes('neoforge')) {
        loader = 'neoforge';
        loaderVersion = depVal;
      } else if (depKey.includes('quilt')) {
        loader = 'quilt';
        loaderVersion = depVal;
      }
    }

    const mods: InstalledMod[] = indexJson.files.map((f, i) => {
      const parts = f.path.split('/');
      const rawName = parts[parts.length - 1] || `mod-${i}.jar`;
      const cleanSlug = rawName.replace(/\.jar$/i, '').split('-')[0] || `mod-${i}`;
      return {
        id: `mod-imported-${i}-${Date.now()}`,
        modrinthId: cleanSlug,
        slug: cleanSlug,
        title: cleanSlug.replace(/^[a-z]/, (s) => s.toUpperCase()),
        summary: `Imported mod file (${rawName})`,
        version: 'imported',
        versionNumber: '1.0.0',
        fileName: rawName,
        fileUrl: f.downloads?.[0],
        fileSize: f.fileSize,
        enabled: true,
        loaders: [loader],
        gameVersions: [mcVersion],
        dependencies: [],
        dateInstalled: new Date().toISOString().split('T')[0],
        author: '',
      };
    });

    return {
      id: `instance-mrpack-${Date.now()}`,
      name: indexJson.name || file.name.replace(/\.(mrpack|zip)$/i, ''),
      description: indexJson.summary || 'Imported from Modrinth Modpack (.mrpack)',
      mcVersion,
      loader,
      loaderVersion,
      icon: 'box',
      totalPlayTimeMinutes: 0,
      memoryMinMb: 2048,
      memoryMaxMb: 4096,
      jvmArgs: '-XX:+UseG1GC',
      javaPath: 'auto',
      javaVersion: getDefaultJavaForVersion(mcVersion),
      resolutionWidth: 1920,
      resolutionHeight: 1080,
      fullscreen: false,
      installedMods: mods,
    };
  }

  // A bare zip of jars carries no manifest: nothing in it says which Minecraft
  // version or loader the mods were built for, and picking one would produce a
  // profile that fails at launch for reasons the user cannot see.
  throw new Error(
    'This archive has no modrinth.index.json. Import a .mrpack, or create a profile and add the jars to it.'
  );
}

/**
 * Triggers browser download of a blob
 */
/**
 * Hands a generated file to the user.
 *
 * The desktop webview does not perform browser downloads, so there the file is
 * written into the launcher's exports folder and its path is returned. In the
 * browser preview the usual anchor download is used and null comes back.
 */
export async function saveGeneratedFile(blob: Blob, filename: string): Promise<string | null> {
  if (isTauri()) {
    const data = new Uint8Array(await blob.arrayBuffer());
    return saveExport(filename, data);
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return null;
}
