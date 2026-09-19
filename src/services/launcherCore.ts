/**
 * Typed access to the native launcher core.
 *
 * Every function here maps onto a Tauri command implemented in `src-tauri`.
 * The browser dev server has no core at all, so each call reports that plainly
 * instead of pretending the action succeeded.
 */

import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { listen as tauriListen } from '@tauri-apps/api/event';
import { InstanceProfile, PlayerAccount } from '../types/launcher';

export const isTauri = (): boolean =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export class CoreUnavailableError extends Error {
  constructor() {
    super('The launcher core is only available in the desktop app, not in the browser preview.');
    this.name = 'CoreUnavailableError';
  }
}

async function invokeCore<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri()) {
    throw new CoreUnavailableError();
  }
  return invoke<T>(command, args);
}

// --- system -----------------------------------------------------------------

export interface SystemSpecs {
  total_memory_mb: number;
  available_memory_mb: number;
  cpu_count: number;
  cpu_name: string;
  os_name: string;
  os_version: string;
}

export interface JavaInstallation {
  path: string;
  version: string;
  major: number;
  vendor: string;
}

export interface LauncherPaths {
  root: string;
  instances: string;
  libraries: string;
  assets: string;
}

export const fetchSystemSpecs = () => invokeCore<SystemSpecs>('get_system_specs');
export const listJavaInstallations = () => invokeCore<JavaInstallation[]>('list_java_installations');
export const installJava = (major: number) => invokeCore<JavaInstallation>('install_java', { major });
export const getLauncherPaths = () => invokeCore<LauncherPaths>('get_launcher_paths');
export const configureNetworkProxy = (proxyUrl: string | null) =>
  invokeCore<void>('configure_network_proxy', { proxyUrl });
export const configureLogPaths = (launcherPath: string | null, modsPath: string | null) =>
  invokeCore<void>('configure_log_paths', { launcherPath, modsPath });
export const getDefaultLogPaths = () =>
  invokeCore<{ launcher: string; mods: string }>('get_default_log_paths');
export const discoverRunningInstances = (instanceIds: string[]) =>
  invokeCore<string[]>('discover_running_instances', { instanceIds });
export const listForgeVersions = (mcVersion?: string) =>
  invokeCore<string[]>('list_forge_versions', { mcVersion });

// --- launching --------------------------------------------------------------

export interface LaunchProgressEvent {
  instance_id: string;
  status: string;
  stage: string;
  progress: number;
}

export interface LaunchLogEvent {
  instance_id: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
  logger: string;
  thread: string;
  message: string;
}

export interface LaunchExitEvent {
  instance_id: string;
  code: number | null;
  crashed: boolean;
}

export interface LaunchedGame {
  pid: number;
  java_path: string;
  command: string[];
}

/** Translates an instance profile and account into the core's launch options. */
export function toLaunchOptions(instance: InstanceProfile, account: PlayerAccount | null, username: string) {
  const isOffline = !account || account.type === 'offline';
  return {
    instance_id: instance.id,
    instance_name: instance.name,
    mc_version: instance.mcVersion,
    loader: instance.loader,
    loader_version: instance.loaderVersion,
    memory_min_mb: instance.memoryMinMb,
    memory_max_mb: instance.memoryMaxMb,
    jvm_args: instance.jvmArgs || '',
    java_path: instance.javaPath || 'auto',
    java_version: instance.javaVersion || null,
    resolution_width: instance.resolutionWidth || null,
    resolution_height: instance.resolutionHeight || null,
    fullscreen: Boolean(instance.fullscreen),
    server_auto_connect: instance.serverAutoConnect || null,
    username: account?.username || username || 'Player',
    uuid: account?.uuid || '',
    access_token: account?.accessToken || '0',
    user_type: isOffline ? 'legacy' : 'msa',
  };
}

export const launchInstance = (options: ReturnType<typeof toLaunchOptions>) =>
  invokeCore<LaunchedGame>('launch_instance', { options });

/** The command line the core would run, without starting anything. */
export const previewLaunchCommand = (options: ReturnType<typeof toLaunchOptions>) =>
  invokeCore<string[]>('preview_launch_command', { options });

export const stopInstance = (instanceId: string) =>
  invokeCore<boolean>('stop_instance', { instanceId });

export const isInstanceRunning = (instanceId: string) =>
  invokeCore<boolean>('is_instance_running', { instanceId });

export interface MinecraftInstallStatus {
  versionId: string;
  jarPath: string;
  exists: boolean;
  size: number;
}

export const isMinecraftVersionInstalled = (versionId: string) =>
  invokeCore<MinecraftInstallStatus>('is_minecraft_version_installed', { versionId });
export const isInstanceReady = (instanceId: string) =>
  invokeCore<boolean>('is_instance_ready', { instanceId });

type Unlisten = () => void;

async function listen<T>(event: string, handler: (payload: T) => void): Promise<Unlisten> {
  if (!isTauri()) return () => {};
  const unlisten = await tauriListen<T>(event, (e) => handler(e.payload));
  return unlisten;
}

export const onLaunchProgress = (handler: (e: LaunchProgressEvent) => void) =>
  listen<LaunchProgressEvent>('launch://progress', handler);

export const onLaunchLog = (handler: (e: LaunchLogEvent) => void) =>
  listen<LaunchLogEvent>('launch://log', handler);

export const onLaunchExit = (handler: (e: LaunchExitEvent) => void) =>
  listen<LaunchExitEvent>('launch://exit', handler);

// --- instance content -------------------------------------------------------

export interface ModFilePayload {
  file_name: string;
  url: string;
  sha1?: string;
  enabled: boolean;
}

export interface ModSyncReport {
  downloaded: string[];
  removed: string[];
  failed: string[];
}

/** Makes the instance's mods folder match its mod list, downloading what is missing. */
export function syncInstanceMods(instance: InstanceProfile): Promise<ModSyncReport> {
  const mods: ModFilePayload[] = instance.installedMods
    .filter((mod) => Boolean(mod.fileUrl))
    .map((mod) => ({
      file_name: mod.fileName,
      url: mod.fileUrl as string,
      sha1: mod.sha1,
      enabled: mod.enabled,
    }));
  return invokeCore<ModSyncReport>('sync_instance_mods', { instanceId: instance.id, mods });
}

export interface CoreScreenshot {
  file_name: string;
  path: string;
  size_bytes: number;
  taken_at: number;
}

export const listInstanceScreenshots = (instanceId: string) =>
  invokeCore<CoreScreenshot[]>('list_instance_screenshots', { instanceId });
export const listInstanceModFiles = (instanceId: string) =>
  invokeCore<string[]>('list_instance_mod_files', { instanceId });

/** Writes a file into the launcher's exports folder; returns the saved path. */
export const saveExport = (fileName: string, data: Uint8Array) =>
  invokeCore<string>('save_export', { fileName, data: Array.from(data) });

/** Reveals one of an instance's folders in the system file manager. */
export const openInstanceFolder = (instanceId: string, kind: 'root' | 'mods' | 'screenshots') =>
  invokeCore<string>('open_instance_folder', { instanceId, kind });

export const deleteScreenshotFile = (path: string) =>
  invokeCore<void>('delete_screenshot', { path });

/** Converts an absolute file path into a URL the webview is allowed to render. */
export async function toDisplayUrl(path: string): Promise<string> {
  if (!isTauri()) return path;
  return convertFileSrc(path);
}

// --- accounts ---------------------------------------------------------------

export interface DeviceCodeStart {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
  message: string;
}

export interface MinecraftSession {
  username: string;
  uuid: string;
  access_token: string;
  refresh_token?: string;
  expires_at: number;
}

export type DeviceCodePoll =
  | { state: 'pending' }
  | { state: 'slow_down'; interval: number }
  | { state: 'complete'; session: MinecraftSession };

export const startDeviceCodeSignIn = () => invokeCore<DeviceCodeStart>('auth_start_device_code');

export const pollDeviceCodeSignIn = (deviceCode: string) =>
  invokeCore<DeviceCodePoll>('auth_poll_device_code', { deviceCode });

export const refreshSession = (refreshToken: string) =>
  invokeCore<MinecraftSession>('auth_refresh_session', { refreshToken });

export const offlineUuid = (username: string) => invokeCore<string>('offline_uuid', { username });

/**
 * Drives the device code flow to completion, reporting the code the user has to
 * type. Resolves with the signed-in Minecraft session.
 */
export async function signInWithMicrosoft(
  onCode: (start: DeviceCodeStart) => void,
  shouldCancel: () => boolean = () => false
): Promise<MinecraftSession> {
  const start = await startDeviceCodeSignIn();
  onCode(start);

  let intervalSeconds = Math.max(start.interval, 1);
  const deadline = Date.now() + start.expires_in * 1000;

  while (Date.now() < deadline) {
    if (shouldCancel()) {
      throw new Error('Sign-in cancelled.');
    }
    await new Promise((resolve) => setTimeout(resolve, intervalSeconds * 1000));

    const result = await pollDeviceCodeSignIn(start.device_code);
    if (result.state === 'complete') {
      return result.session;
    }
    if (result.state === 'slow_down') {
      intervalSeconds += result.interval;
    }
  }

  throw new Error('The sign-in code expired before it was used.');
}
