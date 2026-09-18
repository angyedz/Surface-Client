export type ModLoader = 'vanilla' | 'fabric' | 'forge' | 'neoforge' | 'quilt';

export type AccountType = 'offline' | 'mojang' | 'microsoft';

export interface PlayerAccount {
  id: string;
  username: string;
  type: AccountType;
  uuid: string;
  avatarUrl: string;
  skinUrl?: string;
  createdAt: number;
  /** Minecraft session token; absent for offline accounts. */
  accessToken?: string;
  /** Microsoft refresh token used to renew the session silently. */
  refreshToken?: string;
  /** Unix seconds after which the session token must be refreshed. */
  expiresAt?: number;
}

export interface MinecraftVersion {
  id: string;
  type: 'release' | 'snapshot' | 'old_beta' | 'old_alpha';
  releaseTime: string;
  recommendedLoader?: ModLoader;
  defaultJava: number; // e.g. 8, 17, 21
}

export interface ModDependency {
  projectId: string;
  projectSlug?: string;
  projectTitle?: string;
  versionId?: string;
  dependencyType: 'required' | 'optional' | 'incompatible';
  fileName?: string;
}

export interface SystemSpecs {
  total_memory_mb: number;
  available_memory_mb: number;
  cpu_count: number;
  cpu_name: string;
  os_name: string;
  os_version: string;
}

export interface InstalledMod {
  id: string; // unique local ID
  modrinthId: string;
  slug: string;
  title: string;
  summary: string;
  version: string;
  versionNumber: string;
  fileName: string;
  fileUrl?: string;
  fileSize?: number;
  /** Checksum from Modrinth, verified after every download. */
  sha1?: string;
  iconUrl?: string;
  enabled: boolean;
  loaders: ModLoader[];
  gameVersions: string[];
  dependencies: ModDependency[];
  dateInstalled: string;
  author: string;
}

export interface InstanceProfile {
  id: string;
  name: string;
  description?: string;
  mcVersion: string;
  loader: ModLoader;
  loaderVersion: string;
  icon: string;
  banner?: string;
  installedMods: InstalledMod[];
  lastPlayed?: string;
  totalPlayTimeMinutes: number;
  
  // Launch parameters
  memoryMinMb: number;
  memoryMaxMb: number;
  jvmArgs: string;
  javaPath: string;
  javaVersion: number;
  resolutionWidth: number;
  resolutionHeight: number;
  fullscreen: boolean;
  serverAutoConnect?: string;
  gameDir?: string;
}

export interface ModrinthProject {
  project_id: string;
  project_type: 'mod' | 'modpack' | 'resourcepack' | 'shader';
  slug: string;
  title: string;
  description: string;
  categories: string[];
  client_side: 'required' | 'optional' | 'unsupported';
  server_side: 'required' | 'optional' | 'unsupported';
  body?: string;
  downloads: number;
  followers: number;
  icon_url: string | null;
  author: string;
  versions?: string[];
  loaders?: string[];
  gallery?: { url: string; title?: string }[];
  license?: { id: string; name: string };
  date_modified?: string;
}

export interface ModrinthVersion {
  id: string;
  project_id: string;
  name: string;
  version_number: string;
  changelog?: string;
  game_versions: string[];
  version_type: 'release' | 'beta' | 'alpha';
  loaders: string[];
  files: {
    url: string;
    filename: string;
    primary: boolean;
    size: number;
    hashes: { sha1?: string; sha512?: string };
  }[];
  dependencies: {
    project_id: string | null;
    version_id: string | null;
    file_name: string | null;
    dependency_type: 'required' | 'optional' | 'incompatible' | 'embedded';
  }[];
}

export interface SkinProfile {
  id: string;
  name: string;
  model: 'classic' | 'slim'; // Steve vs Alex
  skinUrl: string; // Base64 data URL or external URL
  capeUrl?: string;
  capeName?: string;
  isLocal: boolean;
  active: boolean;
}

export type NavigationTab =
  | 'play'
  | 'instances'
  | 'modrinth'
  | 'servers'
  | 'skins'
  | 'news'
  | 'dependency_solver'
  | 'settings'
  | 'console';

export interface QuickServer {
  id: string;
  name: string;
  ip: string;
  shortLabel: string;
  badgeColor: string;
  playersOnline: number;
  maxPlayers: number;
  pingMs: number;
  description: string;
  iconType: 'hypixel' | 'minemen' | 'gomme' | 'cubecraft' | 'anarchy' | 'custom' | string;
  category?: 'all' | 'minigames' | 'pvp' | 'survival' | 'mmorpg' | 'skyblock' | 'anarchy';
  isOnline?: boolean;
  motdClean?: string;
  iconBase64?: string;
  versionName?: string;
  lastChecked?: number;
}

export interface FriendItem {
  id: string;
  username: string;
  avatarUrl: string;
  status: 'online_launcher' | 'playing' | 'offline';
  gameDetails?: string;
  lastSeen?: string;
  unreadCount?: number;
  rank?: string;
}

export interface ChatMessage {
  id: string;
  sender: string;
  text: string;
  time: string;
  isMe: boolean;
}

export interface NewsItem {
  id: string;
  title: string;
  category: string;
  date: string;
  bannerUrl: string;
  summary: string;
  badge?: string;
  readTime: string;
  articleUrl?: string;
}

export type LaunchStatus =
  | 'idle'
  | 'verifying_dependencies'
  | 'downloading_assets'
  | 'building_classpath'
  | 'spawning_jvm'
  | 'running'
  | 'crashed'
  | 'finished';

export interface LaunchState {
  status: LaunchStatus;
  stage: string;
  progress: number;
  logs: LogEntry[];
  playTimeSeconds: number;
  pid?: number;
  error?: string;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
  thread: string;
  logger: string;
  message: string;
}

export interface DependencyIssue {
  type: 'missing_required' | 'conflict' | 'wrong_loader' | 'wrong_version';
  severity: 'error' | 'warning';
  sourceMod: InstalledMod;
  targetProjectId?: string;
  targetProjectTitle?: string;
  message: string;
  suggestedVersion?: string;
  canAutoFix: boolean;
}

export interface KeybindingItem {
  id: string;
  name: string;
  description: string;
  category: 'Game & Launch' | 'Navigation' | 'Tools & Display';
  keys: string[]; // e.g. ['Ctrl', '`'] or ['F12']
  defaultKeys: string[];
}

export interface InGameScreenshot {
  id: string;
  instanceId: string;
  filename: string;
  url: string;
  date: string;
  time: string;
  fileSize: string;
  resolution: string;
  biome?: string;
  shader?: string;
  caption?: string;
}

export interface WeeklyPlaytimeDay {
  day: string; // 'Mon', 'Tue', ...
  dayName: string;
  fullDate: string;
  hours: number;
  minutes: number;
  sessions: number;
}

