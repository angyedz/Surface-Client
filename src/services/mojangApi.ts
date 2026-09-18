/**
 * Live version metadata: Minecraft releases from Mojang, loader builds from
 * each loader's own meta service. Nothing here falls back to a bundled list —
 * when a service is unreachable the caller is told, so the UI can say so
 * instead of showing a stale menu of versions that may not exist.
 */

import { MinecraftVersion, ModLoader } from '../types/launcher';

const MOJANG_MANIFEST_URL = 'https://launchermeta.mojang.com/mc/game/version_manifest_v2.json';
const FABRIC_META = 'https://meta.fabricmc.net/v2/versions';
const QUILT_META = 'https://meta.quiltmc.org/v3/versions';
const NEOFORGE_MAVEN =
  'https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge';
const FORGE_PROMOTIONS =
  'https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json';

const CACHE_TTL_MS = 1000 * 60 * 60 * 2;
const REQUEST_TIMEOUT_MS = 8000;

interface CacheEntry<T> {
  timestamp: number;
  value: T;
}

function readCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const entry: CacheEntry<T> = JSON.parse(raw);
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) return null;
    return entry.value;
  } catch {
    return null;
  }
}

function writeCache<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify({ timestamp: Date.now(), value }));
  } catch (error) {
    console.warn(`Could not cache ${key}:`, error);
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`${url} answered ${response.status}`);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Fetches once, serving the cached copy while it is fresh and falling back to a
 * stale copy only when the network fails outright.
 */
async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const fresh = readCache<T>(key);
  if (fresh) return fresh;

  try {
    const value = await load();
    writeCache(key, value);
    return value;
  } catch (error) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        console.warn(`Using the last cached copy of ${key}:`, error);
        return (JSON.parse(raw) as CacheEntry<T>).value;
      }
    } catch {
      /* fall through to the rethrow below */
    }
    throw error;
  }
}

export interface MojangManifestResponse {
  latest: { release: string; snapshot: string };
  versions: {
    id: string;
    type: 'release' | 'snapshot' | 'old_beta' | 'old_alpha';
    url: string;
    releaseTime: string;
  }[];
}

/**
 * The Java major version a release needs, following Mojang's own thresholds:
 * 1.20.5 and newer need 21, 1.17 needs 16, 1.18-1.20.4 need 17, older need 8.
 */
export function getDefaultJavaForVersion(versionId: string): number {
  const match = /^1\.(\d+)(?:\.(\d+))?/.exec(versionId);
  if (!match) {
    // Snapshots and other identifiers track the current release requirement.
    return 21;
  }

  const minor = Number(match[1]);
  const patch = Number(match[2] ?? 0);

  if (minor > 20 || (minor === 20 && patch >= 5)) return 21;
  if (minor >= 18) return 17;
  if (minor === 17) return 16;
  return 8;
}

function recommendedLoaderFor(versionId: string, type: string): ModLoader {
  if (type !== 'release') return 'vanilla';
  const minor = Number(/^1\.(\d+)/.exec(versionId)?.[1] ?? 0);
  if (minor >= 16) return 'fabric';
  if (minor >= 7) return 'forge';
  return 'vanilla';
}

export async function fetchOfficialMinecraftVersions(): Promise<MinecraftVersion[]> {
  return cached('surface_cache_mc_versions', async () => {
    const data = await fetchJson<MojangManifestResponse>(MOJANG_MANIFEST_URL);
    return data.versions.map<MinecraftVersion>((version) => ({
      id: version.id,
      type: version.type,
      releaseTime: version.releaseTime.split('T')[0],
      recommendedLoader: recommendedLoaderFor(version.id, version.type),
      defaultJava: getDefaultJavaForVersion(version.id),
    }));
  });
}

/**
 * The version the launcher defaults to when the user has not picked one.
 *
 * Mojang names it in the manifest, so nothing in the interface has to carry a
 * version number that goes stale the week after it is written.
 */
export async function fetchLatestRelease(): Promise<string> {
  const versions = await fetchOfficialMinecraftVersions();
  const release = versions.find((version) => version.type === 'release');
  if (!release) {
    throw new Error('the version manifest contains no release build');
  }
  return release.id;
}

/** Fabric loader builds, narrowed to the ones that support `mcVersion`. */
export async function fetchFabricLoaderVersions(mcVersion?: string): Promise<string[]> {
  const url = mcVersion ? `${FABRIC_META}/loader/${mcVersion}` : `${FABRIC_META}/loader`;
  return cached(`surface_cache_fabric_${mcVersion || 'all'}`, async () => {
    const data = await fetchJson<{ loader?: { version: string }; version?: string }[]>(url);
    return data.map((entry) => entry.loader?.version ?? entry.version ?? '').filter(Boolean);
  });
}

export async function fetchQuiltLoaderVersions(mcVersion?: string): Promise<string[]> {
  const url = mcVersion ? `${QUILT_META}/loader/${mcVersion}` : `${QUILT_META}/loader`;
  return cached(`surface_cache_quilt_${mcVersion || 'all'}`, async () => {
    const data = await fetchJson<{ loader?: { version: string }; version?: string }[]>(url);
    return data.map((entry) => entry.loader?.version ?? entry.version ?? '').filter(Boolean);
  });
}

/** NeoForge builds; their version prefix encodes the Minecraft minor release. */
export async function fetchNeoForgeVersions(mcVersion?: string): Promise<string[]> {
  return cached(`surface_cache_neoforge_${mcVersion || 'all'}`, async () => {
    const data = await fetchJson<{ versions: string[] }>(NEOFORGE_MAVEN);
    const all = [...data.versions].reverse();
    if (!mcVersion) return all;

    // NeoForge 21.1.x targets Minecraft 1.21.1, 20.4.x targets 1.20.4, ...
    const parts = mcVersion.split('.');
    const prefix = `${parts[1] ?? ''}.${parts[2] ?? '0'}.`;
    const matching = all.filter((version) => version.startsWith(prefix));
    return matching.length > 0 ? matching : all;
  });
}

/** Forge's promotion feed lists a recommended and latest build per release. */
export async function fetchForgeVersions(mcVersion?: string): Promise<string[]> {
  return cached(`surface_cache_forge_${mcVersion || 'all'}`, async () => {
    const data = await fetchJson<{ promos: Record<string, string> }>(FORGE_PROMOTIONS);
    const entries = Object.entries(data.promos);
    const matching = mcVersion
      ? entries.filter(([key]) => key.startsWith(`${mcVersion}-`))
      : entries;
    // "recommended" before "latest", newest Minecraft release first.
    return matching
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([, build]) => build)
      .filter((value, index, list) => list.indexOf(value) === index);
  });
}

export async function fetchDynamicLoaderVersions(
  loader: ModLoader,
  mcVersion?: string
): Promise<string[]> {
  switch (loader) {
    case 'fabric':
      return fetchFabricLoaderVersions(mcVersion);
    case 'quilt':
      return fetchQuiltLoaderVersions(mcVersion);
    case 'neoforge':
      return fetchNeoForgeVersions(mcVersion);
    case 'forge':
      return fetchForgeVersions(mcVersion);
    default:
      return [];
  }
}
