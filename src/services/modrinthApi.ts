import { ModrinthProject, ModrinthVersion, ModLoader } from '../types/launcher';

const MODRINTH_BASE_URL = 'https://api.modrinth.com/v2';
// Modrinth asks every client to identify itself, and rate-limits those that don't.
const MODRINTH_USER_AGENT = 'SurfaceClient/1.0.0 (minecraft-launcher)';

export interface SearchFilters {
  query?: string;
  gameVersion?: string;
  loader?: ModLoader;
  projectType?: 'mod' | 'modpack' | 'resourcepack' | 'shader';
  category?: string;
  sortBy?: 'relevance' | 'downloads' | 'follows' | 'newest' | 'updated';
  limit?: number;
  offset?: number;
}

export async function searchModrinthProjects(filters: SearchFilters): Promise<{ hits: ModrinthProject[]; total_hits: number }> {
  const facets: string[][] = [];

  if (filters.projectType) {
    facets.push([`project_type:${filters.projectType}`]);
  } else {
    facets.push(['project_type:mod']);
  }

  if (filters.gameVersion && filters.gameVersion !== 'all') {
    facets.push([`versions:${filters.gameVersion}`]);
  }

  if (filters.loader && filters.loader !== 'vanilla') {
    facets.push([`categories:${filters.loader}`]);
  }

  if (filters.category && filters.category !== 'all') {
    facets.push([`categories:${filters.category}`]);
  }

  const queryParams = new URLSearchParams();
  if (filters.query?.trim()) {
    queryParams.set('query', filters.query.trim());
  }
  if (facets.length > 0) {
    queryParams.set('facets', JSON.stringify(facets));
  }
  if (filters.sortBy) {
    queryParams.set('index', filters.sortBy);
  }
  queryParams.set('limit', String(filters.limit || 20));
  queryParams.set('offset', String(filters.offset || 0));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(`${MODRINTH_BASE_URL}/search?${queryParams.toString()}`, {
      headers: { 'User-Agent': MODRINTH_USER_AGENT },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Modrinth search failed with status ${response.status}`);
    }

    const data = await response.json();
    return {
      hits: data.hits.map((hit: any) => ({
        project_id: hit.project_id,
        project_type: hit.project_type,
        slug: hit.slug,
        author: hit.author,
        title: hit.title,
        description: hit.description,
        categories: hit.categories || [],
        client_side: hit.client_side,
        server_side: hit.server_side,
        downloads: hit.downloads || 0,
        followers: hit.follows || 0,
        icon_url: hit.icon_url,
        versions: hit.versions || [],
        loaders:
          hit.categories?.filter((c: string) =>
            ['fabric', 'forge', 'neoforge', 'quilt'].includes(c)
          ) || [],
        date_modified: hit.date_modified,
      })),
      total_hits: data.total_hits,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function getModrinthProject(idOrSlug: string): Promise<ModrinthProject | null> {
  try {
    const response = await fetch(`${MODRINTH_BASE_URL}/project/${idOrSlug}`, {
      headers: { 'User-Agent': MODRINTH_USER_AGENT },
    });
    if (response.ok) {
      const data = await response.json();
      return {
        project_id: data.id,
        project_type: data.project_type,
        slug: data.slug,
        title: data.title,
        description: data.description,
        body: data.body,
        categories: data.categories || [],
        client_side: data.client_side,
        server_side: data.server_side,
        downloads: data.downloads,
        followers: data.followers,
        icon_url: data.icon_url,
        author: data.team,
        loaders: data.loaders,
        versions: data.versions,
        gallery: data.gallery,
        license: data.license,
        date_modified: data.updated,
      };
    }
  } catch (e) {
    console.warn(`Could not load the Modrinth project ${idOrSlug}:`, e);
  }

  return null;
}

export async function getProjectVersions(
  idOrSlug: string,
  loaders?: ModLoader[],
  gameVersions?: string[]
): Promise<ModrinthVersion[]> {
  const queryParams = new URLSearchParams();
  if (loaders && loaders.length > 0 && !loaders.includes('vanilla')) {
    queryParams.set('loaders', JSON.stringify(loaders));
  }
  if (gameVersions && gameVersions.length > 0) {
    queryParams.set('game_versions', JSON.stringify(gameVersions));
  }

  const url = `${MODRINTH_BASE_URL}/project/${idOrSlug}/version${
    queryParams.toString() ? '?' + queryParams.toString() : ''
  }`;

  const response = await fetch(url, { headers: { 'User-Agent': MODRINTH_USER_AGENT } });
  if (!response.ok) {
    throw new Error(`Modrinth returned ${response.status} for ${idOrSlug}`);
  }

  const list = await response.json();
  return list.map((version: any) => ({
    id: version.id,
    project_id: version.project_id,
    name: version.name,
    version_number: version.version_number,
    changelog: version.changelog,
    game_versions: version.game_versions,
    version_type: version.version_type,
    loaders: version.loaders,
    files: version.files,
    dependencies: version.dependencies || [],
  }));
}
