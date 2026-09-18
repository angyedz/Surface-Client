import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import {
  InstanceProfile,
  NavigationTab,
  LaunchState,
  LogEntry,
  ModrinthProject,
  ModrinthVersion,
  InstalledMod,
  InGameScreenshot,
  WeeklyPlaytimeDay,
  KeybindingItem,
  SkinProfile,
  FriendItem,
  MinecraftVersion,
  PlayerAccount,
} from './types/launcher';
import { DEFAULT_KEYBINDINGS } from './config/keybindings';
import { emptyWeek, recordSession } from './services/playtime';
import { TopTitleBar } from './components/TopTitleBar';
import { SidebarNav } from './components/SidebarNav';
import { PlayView } from './components/PlayView';
import { ModrinthBrowser } from './components/ModrinthBrowser';
import { InstanceManagerView } from './components/InstanceManagerView';
import { LaunchSettingsView } from './components/LaunchSettingsView';
import { ModpackCreatorModal } from './components/ModpackCreatorModal';
import { RunningGameOverlay } from './components/RunningGameOverlay';
import { ServerBrowserView } from './components/ServerBrowserView';
import { FriendsPanel } from './components/FriendsPanel';
import { SkinManagerView } from './components/SkinManagerView';
import { NewsUpdatesView } from './components/NewsUpdatesView';
import { DependencyCenterView } from './components/DependencyCenterView';
import { AccountManagerModal } from './components/AccountManagerModal';
import { analyzeInstanceDependencies, solveAllDependencies, resolveModDependency } from './services/dependencySolver';
import { exportToMrpack, saveGeneratedFile } from './services/modpackService';
import { fetchOfficialMinecraftVersions } from './services/mojangApi';
import {
  isTauri,
  fetchSystemSpecs,
  SystemSpecs,
  launchInstance,
  stopInstance,
  syncInstanceMods,
  toLaunchOptions,
  onLaunchProgress,
  onLaunchLog,
  onLaunchExit,
  listInstanceScreenshots,
  deleteScreenshotFile,
  toDisplayUrl,
  CoreUnavailableError,
  signInWithMicrosoft,
  DeviceCodeStart,
} from './services/launcherCore';
import {
  migrateStorage,
  loadJson,
  saveJson,
  loadString,
  saveString,
  StorageKeys,
} from './services/storage';
import { lookupMinecraftPlayer, createOfflineAccount } from './services/playerApi';
import { User, Check, WifiOff, ShieldCheck, Plus, ArrowRight } from 'lucide-react';

// Older builds shipped sample data; the versioned store drops it once.
migrateStorage();

export default function App() {
  // Instances are the launcher's core state; everything else hangs off them.
  const [instances, setInstances] = useState<InstanceProfile[]>(() =>
    loadJson<InstanceProfile[]>(StorageKeys.instances, [])
  );

  const [activeInstanceId, setActiveInstanceId] = useState<string>(() => {
    const stored = loadString(StorageKeys.activeInstance);
    const saved = loadJson<InstanceProfile[]>(StorageKeys.instances, []);
    if (stored && saved.some((i) => i.id === stored)) return stored;
    return saved[0]?.id || '';
  });

  // Player Accounts State (offline and Microsoft)
  const [accounts, setAccounts] = useState<PlayerAccount[]>(() =>
    loadJson<PlayerAccount[]>(StorageKeys.accounts, [])
  );

  const [activeAccountId, setActiveAccountId] = useState<string>(() =>
    loadString(StorageKeys.activeAccount)
  );

  const [isAccountManagerOpen, setIsAccountManagerOpen] = useState(false);

  const activeAccount = accounts.find((a) => a.id === activeAccountId) || accounts[0] || null;
  const username = activeAccount ? activeAccount.username : '';

  // First-launch setup tabs and states
  const [setupTab, setSetupTab] = useState<'offline' | 'licensed'>('offline');
  const [setupOfflineName, setSetupOfflineName] = useState('');
  const [setupDeviceCode, setSetupDeviceCode] = useState<DeviceCodeStart | null>(null);
  const [isVerifyingSetup, setIsVerifyingSetup] = useState(false);
  const [setupLicenseError, setSetupLicenseError] = useState<string | null>(null);

  const handleAddAccount = (newAcc: PlayerAccount) => {
    const updated = [newAcc, ...accounts.filter((a) => a.id !== newAcc.id && a.username.toLowerCase() !== newAcc.username.toLowerCase())];
    setAccounts(updated);
    setActiveAccountId(newAcc.id);
    saveJson(StorageKeys.accounts, updated);
    saveString(StorageKeys.activeAccount, newAcc.id);
    saveString(StorageKeys.username, newAcc.username);

    const userSkin: SkinProfile = {
      id: `skin_${Date.now()}`,
      name: `${newAcc.username}'s Skin`,
      model: 'classic',
      skinUrl: newAcc.skinUrl || `https://mc-heads.net/body/${newAcc.username}`,
      isLocal: false,
      active: true,
    };
    setSkins([userSkin]);
    showToast(`Аккаунт «${newAcc.username}» (${newAcc.type === 'offline' ? 'Offline' : 'Лицензия'}) готов!`, 'success');
    setIsAccountManagerOpen(false);
  };

  const handleSelectAccount = (acc: PlayerAccount) => {
    setActiveAccountId(acc.id);
    saveString(StorageKeys.activeAccount, acc.id);
    saveString(StorageKeys.username, acc.username);
    showToast(`Выбран аккаунт: ${acc.username} (${acc.type === 'offline' ? 'Offline' : 'Лицензия'})`, 'info');
  };

  const handleDeleteAccount = (accId: string) => {
    const remaining = accounts.filter((a) => a.id !== accId);
    setAccounts(remaining);
    saveJson(StorageKeys.accounts, remaining);
    if (activeAccountId === accId) {
      const nextActive = remaining[0];
      setActiveAccountId(nextActive?.id || '');
      saveString(StorageKeys.activeAccount, nextActive?.id || '');
      saveString(StorageKeys.username, nextActive?.username || '');
    }
    showToast('Аккаунт удален', 'info');
  };

  const handleCompleteSetupOffline = () => {
    const clean = setupOfflineName.trim();
    if (!clean) return;
    const newAcc = createOfflineAccount(clean);
    handleAddAccount(newAcc);
  };

  const handleCompleteSetupLicensed = async () => {
    setIsVerifyingSetup(true);
    setSetupLicenseError(null);
    try {
      const session = await signInWithMicrosoft(setSetupDeviceCode);
      handleAddAccount({
        id: `acc_ms_${session.uuid}`,
        username: session.username,
        type: 'microsoft',
        uuid: session.uuid,
        avatarUrl: `https://mc-heads.net/avatar/${session.uuid}/64`,
        skinUrl: `https://mc-heads.net/skin/${session.uuid}`,
        createdAt: Date.now(),
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
        expiresAt: session.expires_at,
      });
    } catch (error: any) {
      setSetupLicenseError(error?.message || String(error));
    } finally {
      setIsVerifyingSetup(false);
      setSetupDeviceCode(null);
    }
  };

  // Screenshots are read from the instance folder the game writes into.
  const [screenshots, setScreenshots] = useState<InGameScreenshot[]>([]);

  const [weeklyPlaytime, setWeeklyPlaytime] = useState<WeeklyPlaytimeDay[]>(() =>
    loadJson<WeeklyPlaytimeDay[]>(StorageKeys.weeklyPlaytime, emptyWeek())
  );

  const [keybindings, setKeybindings] = useState<KeybindingItem[]>(() =>
    loadJson<KeybindingItem[]>(StorageKeys.keybindings, DEFAULT_KEYBINDINGS)
  );

  const [skins, setSkins] = useState<SkinProfile[]>(() =>
    loadJson<SkinProfile[]>(StorageKeys.skins, [])
  );

  const [friends, setFriends] = useState<FriendItem[]>(() =>
    loadJson<FriendItem[]>(StorageKeys.friends, [])
  );

  const [isFriendsOpen, setIsFriendsOpen] = useState(false);

  // Dynamic Minecraft versions fetched from Mojang Manifest
  const [mcVersions, setMcVersions] = useState<MinecraftVersion[]>([]);
  useEffect(() => {
    fetchOfficialMinecraftVersions().then((v) => {
      if (v && v.length > 0) setMcVersions(v);
    });
  }, []);

  // Active Tab State
  const [activeTab, setActiveTab] = useState<NavigationTab>('play');

  // Modpack creator modal
  const [isCreatingModpack, setIsCreatingModpack] = useState(false);

  // Installing state for Modrinth
  const [installingModId, setInstallingModId] = useState<string | null>(null);

  // Game execution state
  const [launchState, setLaunchState] = useState<LaunchState>({
    status: 'idle',
    stage: 'Ready to launch',
    progress: 0,
    logs: [],
    playTimeSeconds: 0,
  });
  const [isGameConsoleOpen, setIsGameConsoleOpen] = useState(false);

  // Toast Notification
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Tauri Native System Specs
  const [systemSpecs, setSystemSpecs] = useState<SystemSpecs | null>(null);
  // Log ids must stay unique even when many lines arrive in the same millisecond.
  const logSequence = useRef(0);
  const runningInTauri = isTauri();

  useEffect(() => {
    if (isTauri()) {
      fetchSystemSpecs().then((specs) => {
        if (specs) {
          setSystemSpecs(specs);
          const ramGb = Math.round(specs.total_memory_mb / 1024);
          showToast(`Native Surface Client linked: ${ramGb} GB RAM (${specs.cpu_count} CPU cores)`, 'info');
        }
      });
    }
  }, []);

  // The native core streams the whole launch: progress, every log line the JVM
  // prints, and the process exit. The UI only mirrors what it reports.
  useEffect(() => {
    if (!runningInTauri) return;

    const unsubscribers: Array<() => void> = [];

    onLaunchProgress((event) => {
      setLaunchState((prev) => ({
        ...prev,
        status: event.status as LaunchState['status'],
        stage: event.stage,
        progress: event.progress,
      }));
    }).then((off) => unsubscribers.push(off));

    onLaunchLog((event) => {
      const now = new Date();
      const entry: LogEntry = {
        id: `log-${now.getTime()}-${logSequence.current++}`,
        timestamp: now.toTimeString().split(' ')[0],
        level: event.level,
        thread: event.thread,
        logger: event.logger,
        message: event.message,
      };
      // Keeping the last few thousand lines bounds memory on long sessions.
      setLaunchState((prev) => ({
        ...prev,
        logs: [...prev.logs, entry].slice(-4000),
      }));
    }).then((off) => unsubscribers.push(off));

    onLaunchExit((event) => {
      setLaunchState((prev) => ({
        ...prev,
        status: event.crashed ? 'crashed' : 'finished',
        stage: event.crashed
          ? `Minecraft exited with code ${event.code ?? -1}`
          : 'Minecraft closed.',
        error: event.crashed ? `Exit code ${event.code ?? -1}` : undefined,
      }));
    }).then((off) => unsubscribers.push(off));

    return () => unsubscribers.forEach((off) => off());
  }, [runningInTauri]);

  // Session clock, ticking only while the game is actually up.
  useEffect(() => {
    if (launchState.status !== 'running') return;
    const timer = setInterval(() => {
      setLaunchState((prev) =>
        prev.status === 'running'
          ? { ...prev, playTimeSeconds: prev.playTimeSeconds + 1 }
          : prev
      );
    }, 1000);
    return () => clearInterval(timer);
  }, [launchState.status]);

  // Screenshots come from the instance folder the game writes into.
  useEffect(() => {
    if (!runningInTauri || !activeInstanceId) {
      setScreenshots([]);
      return;
    }

    let cancelled = false;
    listInstanceScreenshots(activeInstanceId)
      .then(async (files) => {
        const mapped = await Promise.all(
          files.map(async (file) => {
            const taken = new Date(file.taken_at);
            return {
              id: file.path,
              instanceId: activeInstanceId,
              filename: file.file_name,
              url: await toDisplayUrl(file.path),
              date: taken.toLocaleDateString(),
              time: taken.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              fileSize: `${(file.size_bytes / 1024 / 1024).toFixed(1)} MB`,
              resolution: '',
            } satisfies InGameScreenshot;
          })
        );
        if (!cancelled) setScreenshots(mapped);
      })
      .catch((error) => console.warn('Could not read the screenshots folder:', error));

    return () => {
      cancelled = true;
    };
  }, [runningInTauri, activeInstanceId, launchState.status]);

  // Sync instances to local storage
  useEffect(() => {
    saveJson(StorageKeys.instances, instances);
  }, [instances]);

  useEffect(() => {
    saveString(StorageKeys.activeInstance, activeInstanceId);
  }, [activeInstanceId]);

  // Sync skins to LocalStorage
  useEffect(() => {
    saveJson(StorageKeys.skins, skins);
  }, [skins]);

  // Sync friends to LocalStorage
  useEffect(() => {
    saveJson(StorageKeys.friends, friends);
  }, [friends]);

  // Sync username
  useEffect(() => {
    saveString(StorageKeys.username, username);
  }, [username]);

  // Sync weekly playtime
  useEffect(() => {
    saveJson(StorageKeys.weeklyPlaytime, weeklyPlaytime);
  }, [weeklyPlaytime]);

  // Sync keybindings
  useEffect(() => {
    saveJson(StorageKeys.keybindings, keybindings);
  }, [keybindings]);

  // Active instance reference
  const activeInstance = instances.find((i) => i.id === activeInstanceId) || instances[0] || null;
  const activeSkin = skins.find((s) => s.active) || skins[0] || null;

  const handleAddFriend = async (newFriendUsername: string) => {
    const clean = newFriendUsername.trim();
    if (!clean) return;
    if (friends.some((f) => f.username.toLowerCase() === clean.toLowerCase())) {
      showToast(`Already friends with ${clean}`, 'info');
      return;
    }

    const profile = await lookupMinecraftPlayer(clean);
    const resolvedName = profile?.username || clean;

    const newFriend: FriendItem = {
      id: `f_${Date.now()}`,
      username: resolvedName,
      avatarUrl: profile?.avatarUrl || `https://mc-heads.net/avatar/${resolvedName}/64`,
      status: 'online_launcher',
      gameDetails: 'Online in Surface Client',
      rank: profile && profile.rawId !== 'offline' ? 'VERIFIED' : 'PLAYER',
    };
    setFriends((prev) => [newFriend, ...prev]);
    showToast(`Added ${resolvedName} to friends list!`, 'success');
  };

  const handleQuickConnectServer = (ip: string) => {
    if (!activeInstance) {
      showToast('Please create a profile before connecting to servers!', 'info');
      setIsCreatingModpack(true);
      return;
    }
    const updated = {
      ...activeInstance,
      serverAutoConnect: ip,
    };
    handleUpdateInstance(updated);
    showToast(`Connecting to ${ip}...`, 'info');
    if (launchState.status !== 'running') {
      handleLaunchGame();
    }
  };

  const refreshScreenshots = () => {
    if (!runningInTauri || !activeInstanceId) return;
    listInstanceScreenshots(activeInstanceId)
      .then(async (files) =>
        Promise.all(
          files.map(async (file) => {
            const taken = new Date(file.taken_at);
            return {
              id: file.path,
              instanceId: activeInstanceId,
              filename: file.file_name,
              url: await toDisplayUrl(file.path),
              date: taken.toLocaleDateString(),
              time: taken.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              fileSize: `${(file.size_bytes / 1024 / 1024).toFixed(1)} MB`,
              resolution: '',
            } satisfies InGameScreenshot;
          })
        )
      )
      .then(setScreenshots)
      .catch((error) => showToast(String(error), 'error'));
  };

  const handleDeleteScreenshot = async (id: string) => {
    // The list is keyed by file path, so deleting removes the real file.
    try {
      await deleteScreenshotFile(id);
      setScreenshots((prev) => prev.filter((s) => s.id !== id));
      showToast('Screenshot deleted.', 'info');
    } catch (error) {
      showToast(`Could not delete the screenshot: ${error}`, 'error');
    }
  };

  // Launch Game Lifecycle with automatic silent background dependency resolution
  const handleLaunchGame = async () => {
    if (!activeInstance) {
      showToast('Please create a Minecraft profile first!', 'error');
      setIsCreatingModpack(true);
      return;
    }

    if (
      launchState.status === 'running' ||
      launchState.status === 'spawning_jvm' ||
      launchState.status === 'verifying_dependencies'
    ) {
      setIsGameConsoleOpen(true);
      return;
    }

    // Auto-resolve any missing dependencies under the hood before launching
    const currentAnalysis = analyzeInstanceDependencies(activeInstance);
    if (!currentAnalysis.isHealthy && currentAnalysis.issues.some((i) => i.type === 'missing_required')) {
      try {
        const solved = await solveAllDependencies(activeInstance);
        handleUpdateInstance(solved.updatedInstance);
      } catch (err) {
        console.error('Auto dependency solver failed:', err);
      }
    }

    setIsGameConsoleOpen(true);
    setLaunchState({
      status: 'verifying_dependencies',
      stage: 'Preparing the instance',
      progress: 0,
      logs: [],
      playTimeSeconds: 0,
    });

    try {
      // Mod jars live on disk, so the folder has to match the profile before
      // the loader scans it.
      const report = await syncInstanceMods(activeInstance);
      if (report.failed.length > 0) {
        showToast(`${report.failed.length} mod(s) could not be downloaded`, 'error');
      }

      const game = await launchInstance(toLaunchOptions(activeInstance, activeAccount, username));
      setLaunchState((prev) => ({ ...prev, pid: game.pid }));
    } catch (err: any) {
      const message =
        err instanceof CoreUnavailableError
          ? err.message
          : err?.message || String(err) || 'The game could not be started.';
      setLaunchState((prev: LaunchState) => ({
        ...prev,
        status: 'crashed',
        stage: message,
        error: message,
      }));
      showToast(message, 'error');
    }
  };

  // Stop Game and record session playtime
  const handleStopGame = async () => {
    const elapsedSeconds = launchState.playTimeSeconds;
    if (activeInstance) {
      try {
        await stopInstance(activeInstance.id);
      } catch (err) {
        console.warn('Could not stop the game process:', err);
      }
    }
    setLaunchState((prev: LaunchState) => ({
      ...prev,
      status: 'idle',
      progress: 0,
      stage: 'Game stopped.',
    }));

    if (elapsedSeconds >= 5) {
      const minutesPlayed = Math.max(1, Math.round(elapsedSeconds / 60));
      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      // 1. Update instance total playtime & last played
      if (activeInstance) {
        const updatedInst: InstanceProfile = {
          ...activeInstance,
          totalPlayTimeMinutes: (activeInstance.totalPlayTimeMinutes || 0) + minutesPlayed,
          lastPlayed: `Today at ${timeStr}`,
        };
        handleUpdateInstance(updatedInst);
      }

      // 2. Update weekly playtime stats for current day
      setWeeklyPlaytime((prev) => recordSession(prev, minutesPlayed, now));

      showToast(`Session finished: +${minutesPlayed} min recorded`, 'info');
    } else {
      showToast('Minecraft process stopped.', 'info');
    }
  };

  // Uninstall Mod from Active Instance
  const handleUninstallModFromInstance = (modIdOrSlug: string) => {
    if (!activeInstance) return;
    const norm = modIdOrSlug.toLowerCase();
    const removedMod = activeInstance.installedMods.find(
      (m) =>
        m.id.toLowerCase() === norm ||
        m.modrinthId.toLowerCase() === norm ||
        m.slug.toLowerCase() === norm
    );
    const updatedMods = activeInstance.installedMods.filter(
      (m) =>
        m.id.toLowerCase() !== norm &&
        m.modrinthId.toLowerCase() !== norm &&
        m.slug.toLowerCase() !== norm
    );
    handleUpdateInstance({
      ...activeInstance,
      installedMods: updatedMods,
    });
    showToast(`Uninstalled ${removedMod?.title || 'mod'} from ${activeInstance.name}`, 'info');
  };

  // Nickname / Profile username handler
  const handleUsernameChange = (newUsername: string) => {
    const trimmed = newUsername.trim();
    if (trimmed && trimmed !== username) {
      if (activeAccount) {
        const updatedAcc = { ...activeAccount, username: trimmed };
        setAccounts((prev) => prev.map((a) => (a.id === activeAccount.id ? updatedAcc : a)));
        saveString(StorageKeys.username, trimmed);
      } else {
        const newAcc = createOfflineAccount(trimmed);
        handleAddAccount(newAcc);
      }
      showToast(`Player username set to ${trimmed}`, 'success');
    }
  };

  // Update Instance Handler
  const handleUpdateInstance = (updated: InstanceProfile) => {
    setInstances((prev) => prev.map((inst) => (inst.id === updated.id ? updated : inst)));
  };

  // Delete Instance Handler
  const handleDeleteInstance = (instanceId: string) => {
    const remaining = instances.filter((i) => i.id !== instanceId);
    setInstances(remaining);
    if (activeInstanceId === instanceId) {
      setActiveInstanceId(remaining[0]?.id || '');
    }
    showToast('Profile deleted.', 'info');
  };

  // Duplicate Instance Handler
  const handleDuplicateInstance = (inst: InstanceProfile) => {
    const clone: InstanceProfile = {
      ...inst,
      id: `instance-${Date.now()}`,
      name: `${inst.name} (Copy)`,
      totalPlayTimeMinutes: 0,
      installedMods: inst.installedMods.map((m) => ({
        ...m,
        id: `mod-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      })),
    };
    setInstances((prev) => [...prev, clone]);
    setActiveInstanceId(clone.id);
    showToast(`Created duplicate: ${clone.name}`, 'success');
  };

  // Create Instance Handler
  const handleCreateInstance = (newInstance: InstanceProfile) => {
    setInstances((prev) => [...prev, newInstance]);
    setActiveInstanceId(newInstance.id);
    showToast(`Created profile: ${newInstance.name}`, 'success');
  };

  // Export Active Instance as .mrpack
  const handleExportActiveMrpack = async () => {
    if (!activeInstance) {
      showToast('No active profile to export!', 'error');
      return;
    }
    try {
      const blob = await exportToMrpack(activeInstance);
      const path = await saveGeneratedFile(
        blob,
        `${activeInstance.name.toLowerCase().replace(/\s+/g, '-')}.mrpack`
      );
      showToast(path ? `Saved to ${path}` : `Exported ${activeInstance.name}.mrpack`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to export .mrpack', 'error');
    }
  };

  // Global Keyboard Shortcuts Listener
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      const checkBinding = (actionId: string) => {
        const binding = keybindings.find((b) => b.id === actionId);
        if (!binding || !binding.keys || binding.keys.length === 0) return false;

        const requiredKeys = binding.keys.map((k) => k.toLowerCase());
        const hasCtrl = requiredKeys.includes('ctrl');
        const hasShift = requiredKeys.includes('shift');
        const hasAlt = requiredKeys.includes('alt');

        if (hasCtrl !== e.ctrlKey) return false;
        if (hasShift !== e.shiftKey) return false;
        if (hasAlt !== e.altKey) return false;

        const mainKey = requiredKeys.find((k) => !['ctrl', 'shift', 'alt', 'cmd', 'meta'].includes(k));
        if (!mainKey) return true;
        return e.key.toLowerCase() === mainKey;
      };

      if (checkBinding('toggle_console')) {
        e.preventDefault();
        setIsGameConsoleOpen((prev) => !prev);
        return;
      }

      if (checkBinding('quick_launch')) {
        e.preventDefault();
        if (launchState.status === 'running') {
          handleStopGame();
        } else {
          handleLaunchGame();
        }
        return;
      }

      if (isInput) return;

      if (checkBinding('open_modrinth')) {
        e.preventDefault();
        setActiveTab('modrinth');
      } else if (checkBinding('open_instances')) {
        e.preventDefault();
        setActiveTab('instances');
      } else if (checkBinding('open_settings')) {
        e.preventDefault();
        setActiveTab('settings');
      } else if (checkBinding('export_modpack')) {
        e.preventDefault();
        handleExportActiveMrpack();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [keybindings, launchState.status, activeInstance]);

  // Install Mod from Modrinth - ALWAYS automatically resolves dependencies in background!
  const handleInstallModFromModrinth = async (
    project: ModrinthProject,
    version?: ModrinthVersion,
    autoDependencies: boolean = true
  ) => {
    if (!activeInstance) {
      showToast('Create a Minecraft profile first before installing mods!', 'error');
      setIsCreatingModpack(true);
      return;
    }

    setInstallingModId(project.project_id);

    try {
      const newModsToAdd: InstalledMod[] = [];

      // 1. Resolve Primary Mod
      const primaryMod = await resolveModDependency(
        project.project_id,
        activeInstance.mcVersion,
        activeInstance.loader
      );

      if (primaryMod) {
        newModsToAdd.push(primaryMod);
      } else {
        newModsToAdd.push({
          id: `mod-${project.slug}-${Date.now()}`,
          modrinthId: project.project_id,
          slug: project.slug,
          title: project.title,
          summary: project.description,
          version: version?.version_number || 'latest',
          versionNumber: version?.version_number || '1.0.0',
          fileName: `${project.slug}-${version?.version_number || '1.0.0'}.jar`,
          fileSize: 1024 * 1024 * 2,
          iconUrl: project.icon_url || undefined,
          enabled: true,
          loaders: [activeInstance.loader],
          gameVersions: [activeInstance.mcVersion],
          dependencies: [],
          dateInstalled: new Date().toISOString().split('T')[0],
          author: project.author,
        });
      }

      // 2. Automatically solve and download dependencies in the background!
      const tempInstance = {
        ...activeInstance,
        installedMods: [...activeInstance.installedMods, ...newModsToAdd],
      };
      const solved = await solveAllDependencies(tempInstance);
      handleUpdateInstance(solved.updatedInstance);
      
      if (solved.resolvedCount > 0) {
        showToast(`Installed ${project.title} (+${solved.resolvedCount} auto-dependencies)`, 'success');
      } else {
        showToast(`Installed ${project.title}`, 'success');
      }
    } catch (err: any) {
      console.error(err);
      showToast(`Failed to install ${project.title}`, 'error');
    } finally {
      setInstallingModId(null);
    }
  };

  return (
    <div
      className={`relative h-screen w-screen overflow-hidden bg-[#030712] text-neutral-100 flex items-center justify-center ${
        runningInTauri ? 'p-0' : 'p-1 sm:p-2 md:p-3'
      } select-none font-['Inter',sans-serif]`}
    >
      {/* Calm Starfield Background */}
      <div className="app-backdrop" aria-hidden="true" />

      {/* Floating Glassmorphism Window Frame */}
      <motion.div
        initial={{ opacity: 0, scale: 0.99 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className={`relative z-10 flex flex-col h-full w-full ${
          runningInTauri
            ? 'rounded-none border-0'
            : 'max-w-[1600px] rounded-2xl border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.7)]'
        } overflow-hidden app-frame`}
      >
        {/* Clean Header Bar */}
        <TopTitleBar
          instances={instances}
          activeInstance={activeInstance}
          onSelectInstance={(inst) => setActiveInstanceId(inst.id)}
          launchStatus={launchState.status}
          onOpenConsole={() => setIsGameConsoleOpen(true)}
          onQuickConnectServer={handleQuickConnectServer}
          onToggleFriends={() => setIsFriendsOpen((prev) => !prev)}
          isFriendsOpen={isFriendsOpen}
          friendsOnlineCount={friends.filter((f) => f.status !== 'offline').length}
          unreadFriendsCount={friends.reduce((acc, f) => acc + (f.unreadCount || 0), 0)}
          username={username}
          avatarUrl={activeAccount?.avatarUrl || activeSkin?.skinUrl}
          accounts={accounts}
          activeAccount={activeAccount}
          onSelectAccount={handleSelectAccount}
          onOpenAccountManager={() => setIsAccountManagerOpen(true)}
          onOpenCreator={() => setIsCreatingModpack(true)}
        />

        {/* Main Viewport */}
        <div className="flex-1 flex overflow-hidden">
          {/* Navigation Sidebar Dock */}
          <SidebarNav
            activeTab={activeTab}
            onSelectTab={(tab) => {
              if (tab === 'console') {
                setIsGameConsoleOpen(true);
              } else {
                setActiveTab(tab);
              }
            }}
            activeInstance={activeInstance}
          />

          {/* Dynamic Content Views */}
          <main className="flex-1 flex overflow-hidden relative">
            {activeTab === 'play' && (
              <PlayView
                instance={activeInstance}
                instances={instances}
                onSelectInstance={(inst) => setActiveInstanceId(inst.id)}
                launchStatus={launchState.status}
                launchProgress={launchState.progress}
                launchPid={launchState.pid}
                playTimeSeconds={launchState.playTimeSeconds}
                launchStageText={launchState.stage}
                onLaunch={handleLaunchGame}
                onStop={handleStopGame}
                onOpenMods={() => setActiveTab('modrinth')}
                onOpenSettings={() => setActiveTab('settings')}
                onOpenConsole={() => setIsGameConsoleOpen(true)}
                onExportMrpack={handleExportActiveMrpack}
                screenshots={screenshots}
                onDeleteScreenshot={handleDeleteScreenshot}
                onRefreshScreenshots={refreshScreenshots}
                weeklyPlaytime={weeklyPlaytime}
              />
            )}

            {activeTab === 'instances' && (
              <InstanceManagerView
                instances={instances}
                activeInstance={activeInstance}
                onSelectInstance={(inst) => setActiveInstanceId(inst.id)}
                onUpdateInstance={handleUpdateInstance}
                onDeleteInstance={handleDeleteInstance}
                onDuplicateInstance={handleDuplicateInstance}
                onOpenCreator={() => setIsCreatingModpack(true)}
                onOpenModrinth={() => setActiveTab('modrinth')}
              />
            )}

            {activeTab === 'modrinth' && (
              <ModrinthBrowser
                activeInstance={activeInstance}
                onInstallMod={handleInstallModFromModrinth}
                onUninstallMod={handleUninstallModFromInstance}
                isInstallingModId={installingModId}
              />
            )}

            {activeTab === 'dependency_solver' && (
              <DependencyCenterView
                instance={activeInstance}
                onUpdateInstance={handleUpdateInstance}
                onOpenModrinth={() => setActiveTab('modrinth')}
              />
            )}

            {activeTab === 'servers' && (
              <ServerBrowserView
                activeInstance={activeInstance}
                onLaunchServer={handleQuickConnectServer}
              />
            )}

            {activeTab === 'skins' && (
              <SkinManagerView
                skins={skins}
                onSaveSkins={setSkins}
                onSetActiveSkin={(skin) => {
                  setSkins((prev) =>
                    prev.map((s) => ({ ...s, active: s.id === skin.id }))
                  );
                }}
                activeUsername={username}
              />
            )}

            {activeTab === 'news' && (
              <NewsUpdatesView />
            )}

            {activeTab === 'settings' && (
              <LaunchSettingsView
                instance={activeInstance}
                username={username}
                account={activeAccount}
                onOpenAccountManager={() => setIsAccountManagerOpen(true)}
                onUpdateInstance={handleUpdateInstance}
                keybindings={keybindings}
                onUpdateKeybindings={setKeybindings}
                systemSpecs={systemSpecs}
              />
            )}
          </main>
        </div>

        {/* Friends Overlay Panel */}
        <FriendsPanel
          isOpen={isFriendsOpen}
          onClose={() => setIsFriendsOpen(false)}
          username={username}
          avatarUrl={activeSkin?.skinUrl}
          friends={friends}
          onAddFriend={handleAddFriend}
        />

        {/* Modpack Creation Modal */}
        {isCreatingModpack && (
          <ModpackCreatorModal
            onClose={() => setIsCreatingModpack(false)}
            onCreateInstance={handleCreateInstance}
          />
        )}

        {/* Running Game Terminal / Logs Overlay */}
        {isGameConsoleOpen && (
          <RunningGameOverlay
            instance={activeInstance}
            launchState={launchState}
            onStopGame={handleStopGame}
            onCloseConsole={() => setIsGameConsoleOpen(false)}
          />
        )}

        {/* Account Manager Modal */}
        <AccountManagerModal
          isOpen={isAccountManagerOpen}
          onClose={() => setIsAccountManagerOpen(false)}
          accounts={accounts}
          activeAccount={activeAccount}
          onSelectAccount={handleSelectAccount}
          onAddAccount={handleAddAccount}
          onDeleteAccount={handleDeleteAccount}
        />

        {/* First-Launch Player Profile Setup Modal */}
        {accounts.length === 0 && (
          <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4">
            <div className="bg-neutral-900/95 border border-primary-500/40 rounded-3xl w-full max-w-lg p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-200">
              <div className="text-center space-y-2">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-primary-500/20 border border-primary-500/40 flex items-center justify-center text-primary-400 shadow-lg">
                  <User size={28} />
                </div>
                <h2 className="text-xl font-bold text-neutral-100 font-['Chakra_Petch']">
                  СОЗДАНИЕ АККАУНТА ИГРОКА
                </h2>
                <p className="text-xs text-neutral-400">
                  Выберите способ входа: мгновенный оффлайн-аккаунт без валидаций или официальная лицензия Mojang.
                </p>
              </div>

              {/* Mode Toggle Tabs */}
              <div className="flex rounded-xl bg-neutral-950 p-1 border border-neutral-800">
                <button
                  type="button"
                  onClick={() => setSetupTab('offline')}
                  className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    setupTab === 'offline'
                      ? 'bg-neutral-800 text-white shadow-sm'
                      : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  <WifiOff size={14} />
                  <span>Offline (Без валидаций)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSetupTab('licensed')}
                  className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    setupTab === 'licensed'
                      ? 'bg-primary-500/20 border border-primary-500/40 text-primary-300 shadow-sm'
                      : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  <ShieldCheck size={14} />
                  <span>Лицензия Mojang</span>
                </button>
              </div>

              {/* Offline Setup View */}
              {setupTab === 'offline' && (
                <div className="space-y-4">
                  <div className="p-4 rounded-2xl bg-neutral-950/60 border border-neutral-800/80 space-y-3">
                    <p className="text-xs text-neutral-400 leading-relaxed">
                      Введите любой никнейм. Оффлайн режим не требует пароля и проверки на серверах Mojang.
                    </p>

                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-neutral-900 border border-neutral-800 flex items-center justify-center overflow-hidden flex-shrink-0">
                        {setupOfflineName.trim() ? (
                          <img
                            src={`https://mc-heads.net/avatar/${setupOfflineName.trim()}/48`}
                            alt="Skin Head"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).src = 'https://mc-heads.net/avatar/MHF_Steve/48';
                            }}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <User size={22} className="text-neutral-600" />
                        )}
                      </div>

                      <div className="flex-1">
                        <input
                          type="text"
                          placeholder="Ваш никнейм (например, Player, Steve...)"
                          value={setupOfflineName}
                          onChange={(e) => setSetupOfflineName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleCompleteSetupOffline();
                          }}
                          autoFocus
                          maxLength={16}
                          className="w-full px-3.5 py-2.5 bg-neutral-900 border border-neutral-700 focus:border-primary-500 rounded-xl text-xs text-neutral-100 font-mono outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={handleCompleteSetupOffline}
                    disabled={!setupOfflineName.trim()}
                    className="w-full py-3 rounded-xl bg-primary-500 hover:bg-primary-400 text-neutral-950 font-bold text-xs shadow-lg transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <Check size={16} />
                    <span>Войти с Оффлайн аккаунтом</span>
                  </button>
                </div>
              )}

              {/* Licensed Setup View */}
              {setupTab === 'licensed' && (
                <div className="space-y-4">
                  <div className="p-4 rounded-2xl bg-neutral-950/60 border border-neutral-800/80 space-y-3">
                    <p className="text-xs text-neutral-400 leading-relaxed">
                      Вход через Microsoft: лаунчер покажет код, вы вводите его на странице
                      Microsoft в браузере. Пароль в лаунчер не вводится.
                    </p>

                    {setupDeviceCode && (
                      <div className="p-3 rounded-xl bg-primary-900/30 border border-primary-500/40 space-y-1.5">
                        <div className="text-[11px] text-neutral-300">
                          Откройте{' '}
                          <a
                            href={setupDeviceCode.verification_uri}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary-300 underline"
                          >
                            {setupDeviceCode.verification_uri}
                          </a>{' '}
                          и введите код:
                        </div>
                        <div className="font-mono text-lg font-bold tracking-[0.2em] text-primary-200">
                          {setupDeviceCode.user_code}
                        </div>
                      </div>
                    )}

                    {setupLicenseError && (
                      <div className="p-3 rounded-xl bg-red-950/30 border border-red-800/60 text-xs text-red-300">
                        {setupLicenseError}
                      </div>
                    )}
                  </div>

                  <button
                    onClick={handleCompleteSetupLicensed}
                    disabled={isVerifyingSetup}
                    className="w-full py-3 rounded-xl btn-primary font-bold text-xs flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <ShieldCheck size={16} />
                    <span>{isVerifyingSetup ? 'Ожидание Microsoft…' : 'Войти через Microsoft'}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Minimal Toast Notification */}
        {toast && (
          <div
            className={`fixed bottom-4 right-4 z-50 px-3.5 py-2 rounded-xl border shadow-xl flex items-center gap-2 text-xs font-medium animate-in slide-in-from-bottom-3 duration-200 ${
              toast.type === 'error'
                ? 'bg-red-950/90 border-red-800 text-red-200'
                : toast.type === 'info'
                ? 'bg-neutral-800/90 border-neutral-800 text-neutral-200'
                : 'bg-primary-900/90 border-primary-900 text-primary-200'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-current" />
            <span>{toast.message}</span>
          </div>
        )}
      </motion.div>
    </div>
  );
}
