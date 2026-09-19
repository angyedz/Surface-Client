import React, { useState, useEffect } from 'react';
import {
  Sliders,
  Cpu,
  Terminal,
  Monitor,
  FolderOpen,
  Wifi,
  Copy,
  Download,
  Check,
  Zap,
  Sparkles,
  HelpCircle,
  FileCode,
  Keyboard,
} from 'lucide-react';
import { InstanceProfile, KeybindingItem, SystemSpecs, PlayerAccount } from '../types/launcher';
import { configureLogPaths, configureNetworkProxy, getDefaultLogPaths, listJavaInstallations, installJava, JavaInstallation, previewLaunchCommand, toLaunchOptions } from '../services/launcherCore';
import { loadString, saveString } from '../services/storage';
import { saveGeneratedFile } from '../services/modpackService';
import { KeybindingsManager } from './KeybindingsManager';

function buildProxyUrl(url: string, username: string, password: string): string {
  if (!url || (!username && !password)) return url;
  const parsed = new URL(url);
  parsed.username = username;
  parsed.password = password;
  return parsed.toString();
}

interface LaunchSettingsViewProps {
  instance?: InstanceProfile | null;
  username: string;
  account?: PlayerAccount | null;
  onOpenAccountManager?: () => void;
  onUpdateInstance: (updated: InstanceProfile) => void;
  keybindings: KeybindingItem[];
  onUpdateKeybindings: (updated: KeybindingItem[]) => void;
  initialTab?: 'config' | 'keybindings';
  systemSpecs?: SystemSpecs | null;
}

export const LaunchSettingsView: React.FC<LaunchSettingsViewProps> = ({
  instance,
  username,
  account,
  onOpenAccountManager,
  onUpdateInstance,
  keybindings,
  onUpdateKeybindings,
  initialTab = 'config',
  systemSpecs,
}) => {
  const [activeSettingsTab, setActiveSettingsTab] = useState<'config' | 'keybindings'>(initialTab);
  const [minRam, setMinRam] = useState(instance?.memoryMinMb || 2048);
  const [maxRam, setMaxRam] = useState(instance?.memoryMaxMb || 4096);
  const [jvmArgs, setJvmArgs] = useState(instance?.jvmArgs || '-XX:+UseG1GC');
  const [javaVersion, setJavaVersion] = useState(instance?.javaVersion || 21);
  const [javaPath, setJavaPath] = useState(instance?.javaPath || 'auto');
  const [javaInstallations, setJavaInstallations] = useState<JavaInstallation[]>([]);
  const [installingJava, setInstallingJava] = useState<number | null>(null);
  const [width, setWidth] = useState(instance?.resolutionWidth || 1920);
  const [height, setHeight] = useState(instance?.resolutionHeight || 1080);
  const [fullscreen, setFullscreen] = useState(instance?.fullscreen || false);
  const [autoConnect, setAutoConnect] = useState(instance?.serverAutoConnect || '');
  const [gameDir, setGameDir] = useState(instance?.gameDir || './.minecraft');
  const [proxyUrl, setProxyUrl] = useState(() => loadString('surface_network_proxy'));
  const [proxyUsername, setProxyUsername] = useState(() => loadString('surface_network_proxy_username'));
  const [proxyPassword, setProxyPassword] = useState(() => loadString('surface_network_proxy_password'));
  const [proxyStatus, setProxyStatus] = useState('');
  const [launcherLogPath, setLauncherLogPath] = useState(() => loadString('surface_launcher_log_path'));
  const [modsLogPath, setModsLogPath] = useState(() => loadString('surface_mods_log_path'));
  const [defaultLogPaths, setDefaultLogPaths] = useState<{ launcher: string; mods: string } | null>(null);
  const [logStatus, setLogStatus] = useState('');

  const [copiedCmd, setCopiedCmd] = useState(false);
  const [savedFeedback, setSavedFeedback] = useState(false);

  useEffect(() => {
    listJavaInstallations().then(setJavaInstallations).catch(() => setJavaInstallations([]));
    getDefaultLogPaths().then(setDefaultLogPaths).catch(() => undefined);
  }, []);

  useEffect(() => {
    configureLogPaths(launcherLogPath.trim() || null, modsLogPath.trim() || null).catch(() => undefined);
  }, []);

  const handleLogSave = async () => {
    try {
      await configureLogPaths(launcherLogPath.trim() || null, modsLogPath.trim() || null);
      saveString('surface_launcher_log_path', launcherLogPath.trim());
      saveString('surface_mods_log_path', modsLogPath.trim());
      setLogStatus('Log paths applied');
    } catch (error) {
      setLogStatus(String(error));
    }
    window.setTimeout(() => setLogStatus(''), 2500);
  };

  const handleInstallJava = async (major: number) => {
    setInstallingJava(major);
    try {
      const installed = await installJava(major);
      setJavaInstallations((current) => [installed, ...current.filter((item) => item.major !== major)]);
      setJavaVersion(major);
      setJavaPath(installed.path);
    } catch (error) {
      setLogStatus(String(error));
    } finally {
      setInstallingJava(null);
    }
  };

  useEffect(() => {
    try {
      configureNetworkProxy(buildProxyUrl(proxyUrl.trim(), proxyUsername, proxyPassword) || null).catch(() => undefined);
    } catch {
      // Invalid values are reported when the user presses Apply.
    }
  }, []);

  const handleProxySave = async () => {
    const value = proxyUrl.trim();
    let configuredValue = value;
    try {
      configuredValue = buildProxyUrl(value, proxyUsername, proxyPassword);
      await configureNetworkProxy(configuredValue || null);
      saveString('surface_network_proxy', value);
      saveString('surface_network_proxy_username', proxyUsername);
      saveString('surface_network_proxy_password', proxyPassword);
      setProxyStatus(value ? 'Proxy enabled' : 'Direct connection enabled');
    } catch (error) {
      setProxyStatus(String(error));
    }
    window.setTimeout(() => setProxyStatus(''), 2500);
  };

  // Hardware specs calculation
  const totalHardwareRamMb = systemSpecs?.total_memory_mb || 16384;
  const totalHardwareRamGb = Math.max(8, Math.round(totalHardwareRamMb / 1024));
  const maxRamSliderLimit = totalHardwareRamGb * 1024;
  const isHighMemory = maxRam > totalHardwareRamMb * 0.85;

  // Sync state whenever the active instance changes
  useEffect(() => {
    if (instance) {
      setMinRam(instance.memoryMinMb);
      setMaxRam(instance.memoryMaxMb);
      setJvmArgs(instance.jvmArgs);
      setJavaVersion(instance.javaVersion);
      setJavaPath(instance.javaPath);
      setWidth(instance.resolutionWidth);
      setHeight(instance.resolutionHeight);
      setFullscreen(instance.fullscreen);
      setAutoConnect(instance.serverAutoConnect || '');
      setGameDir(instance.gameDir || './.minecraft');
    }
  }, [instance?.id]);

  const handleSave = () => {
    if (!instance) return;
    const updated: InstanceProfile = {
      ...instance,
      memoryMinMb: minRam,
      memoryMaxMb: maxRam,
      jvmArgs,
      javaVersion,
      javaPath,
      resolutionWidth: width,
      resolutionHeight: height,
      fullscreen,
      serverAutoConnect: autoConnect.trim() || undefined,
      gameDir: gameDir.trim() || './.minecraft',
    };
    onUpdateInstance(updated);
    setSavedFeedback(true);
    setTimeout(() => setSavedFeedback(false), 2000);
  };

  // Where the last exported launch script was written.
  const [scriptPath, setScriptPath] = useState<string | null>(null);

  // The preview is whatever the native core would actually run.
  const [currentCmd, setCurrentCmd] = useState('Select an instance to see its launch command.');
  const [cmdParts, setCmdParts] = useState<string[]>([]);

  useEffect(() => {
    if (!instance) return;
    let cancelled = false;

    previewLaunchCommand(
      toLaunchOptions(
        {
          ...instance,
          memoryMinMb: minRam,
          memoryMaxMb: maxRam,
          jvmArgs,
          javaVersion,
          javaPath,
          resolutionWidth: width,
          resolutionHeight: height,
          fullscreen,
          serverAutoConnect: autoConnect,
        },
        account || null,
        username
      )
    )
      .then((parts) => {
        if (cancelled) return;
        setCmdParts(parts);
        setCurrentCmd(parts.join(' '));
      })
      .catch((error) => {
        if (!cancelled) setCurrentCmd(String(error));
      });

    return () => {
      cancelled = true;
    };
  }, [
    instance,
    minRam,
    maxRam,
    jvmArgs,
    javaVersion,
    javaPath,
    width,
    height,
    fullscreen,
    autoConnect,
    account,
    username,
  ]);

  const handleCopyCmd = () => {
    if (!instance) return;
    navigator.clipboard.writeText(currentCmd);
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 2000);
  };

  // Every argument is quoted on export: the java binary and the game directory
  // both sit under paths that routinely contain spaces, and an unquoted script
  // silently splits them into separate arguments.
  const quoteForShell = (part: string) => `'${part.replace(/'/g, `'\\''`)}'`;
  const quoteForBatch = (part: string) => `"${part.replace(/"/g, '""')}"`;

  const handleDownloadScript = async (os: 'windows' | 'linux') => {
    if (!instance || cmdParts.length === 0) return;
    const quote = os === 'windows' ? quoteForBatch : quoteForShell;
    const command = cmdParts.map(quote).join(' ');
    const content =
      os === 'windows'
        ? `@echo off\r\nREM Surface Client launch script for ${instance.name}\r\n${command}\r\npause\r\n`
        : `#!/usr/bin/env bash\nset -e\n# Surface Client launch script for ${instance.name}\n${command}\n`;
    const blob = new Blob([content], { type: 'text/plain' });
    const path = await saveGeneratedFile(
      blob,
      `launch-${instance.id}.${os === 'windows' ? 'bat' : 'sh'}`
    );
    setScriptPath(path);
  };

  // RAM Presets
  const applyRamPreset = (min: number, max: number) => {
    setMinRam(min);
    setMaxRam(max);
  };

  // JVM Arg Presets
  const jvmPresets = [
    {
      name: "Aikar's G1GC (Optimized)",
      args: '-XX:+UseG1GC -XX:+ParallelRefProcEnabled -XX:MaxGCPauseMillis=200 -XX:+UnlockExperimentalVMOptions -XX:+DisableExplicitGC -XX:+AlwaysPreTouch',
    },
    {
      name: 'Shenandoah Low-Latency',
      args: '-XX:+UseShenandoahGC -XX:ShenandoahGCMode=iu -XX:+AlwaysPreTouch',
    },
    {
      name: 'ZGC Generational (Java 21)',
      args: '-XX:+UseZGC -XX:+ZGenerational -XX:+AlwaysPreTouch',
    },
    {
      name: 'Default Vanilla',
      args: '-XX:+UseG1GC',
    },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-neutral-950">
      {/* Tab Switcher */}
      <div className="flex items-center gap-2 border-b border-neutral-800 pb-3">
        <button
          onClick={() => setActiveSettingsTab('config')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            activeSettingsTab === 'config'
              ? 'bg-primary-500/20 text-primary-300 border border-primary-500/40 shadow-sm'
              : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900 border border-transparent'
          }`}
        >
          <Sliders size={16} />
          <span>Launch Configuration</span>
        </button>

        <button
          onClick={() => setActiveSettingsTab('keybindings')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            activeSettingsTab === 'keybindings'
              ? 'bg-primary-600/20 text-primary-300 border border-primary-600/40 shadow-sm'
              : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900 border border-transparent'
          }`}
        >
          <Keyboard size={16} />
          <span>Keybindings & Shortcuts</span>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400">
            {keybindings.length}
          </span>
        </button>
      </div>

      {activeSettingsTab === 'keybindings' ? (
        <KeybindingsManager
          keybindings={keybindings}
          onUpdateKeybindings={onUpdateKeybindings}
        />
      ) : (
        <>
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-neutral-900 border border-neutral-800">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-xl bg-primary-500/20 border border-primary-500/40 flex items-center justify-center text-primary-400">
                <Sliders size={24} />
              </div>
              <div>
                <h1 className="text-xl font-bold text-neutral-100 font-['Chakra_Petch']">
                  LAUNCH SETTINGS & JVM PROFILE
                </h1>
                <p className="text-xs text-neutral-400">
                  Hardware memory allocation, Java runtime, display resolution, and command scripts for <strong className="text-neutral-200">{instance?.name || 'No Profile'}</strong>
                </p>
              </div>
            </div>

            <button
              onClick={handleSave}
              className="px-6 py-2.5 rounded-xl bg-primary-500 hover:bg-primary-400 text-neutral-950 font-bold text-xs shadow-lg shadow-primary-900/60 transition-colors flex items-center gap-2 cursor-pointer self-start sm:self-auto"
            >
              {savedFeedback ? (
                <>
                  <Check size={16} />
                  <span>Saved Settings!</span>
                </>
              ) : (
                <span>Apply & Save</span>
              )}
            </button>
          </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: RAM and Java */}
        <div className="space-y-6">
          {/* Active Account Identity Card */}
          <div className="p-4 rounded-2xl bg-neutral-900/80 border border-neutral-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img
                src={account?.avatarUrl || `https://mc-heads.net/avatar/${username}/36`}
                alt={username}
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src = 'https://mc-heads.net/avatar/MHF_Steve/36';
                }}
                className="w-10 h-10 rounded-xl bg-neutral-950 object-cover ring-1 ring-white/10"
              />
              <div>
                <div className="text-xs font-bold text-neutral-200 flex items-center gap-2">
                  <span>{username || 'No Player'}</span>
                  {account && (
                    <span
                      className={`text-[9px] font-mono px-1.5 py-0.5 rounded font-bold uppercase ${
                        account.type === 'offline'
                          ? 'bg-neutral-800 text-neutral-400 border border-neutral-700'
                          : 'bg-primary-500/20 text-primary-400 border border-primary-500/30'
                      }`}
                    >
                      {account.type === 'offline' ? 'Offline' : 'Mojang Licensed'}
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-neutral-500 font-mono mt-0.5">
                  UUID: {account?.uuid || 'Unregistered'}
                </div>
              </div>
            </div>

            {onOpenAccountManager && (
              <button
                type="button"
                onClick={onOpenAccountManager}
                className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-medium transition-colors cursor-pointer"
              >
                Управление
              </button>
            )}
          </div>

          {/* Section 1: Memory Allocation */}
          <div className="p-5 rounded-2xl bg-neutral-900/80 border border-neutral-800 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-bold text-neutral-200">
                <Cpu size={16} className="text-primary-400" />
                <span>Memory Allocation (RAM)</span>
              </div>
              <span className="font-mono text-xs text-primary-400 font-bold">
                {(maxRam / 1024).toFixed(1)} GB ({maxRam} MB)
              </span>
            </div>

            {/* Hardware spec info badge */}
            {systemSpecs ? (
              <div className="p-2.5 rounded-xl bg-neutral-950 border border-neutral-800 flex items-center justify-between text-[11px] font-mono">
                <span className="text-neutral-400 truncate max-w-[220px]" title={systemSpecs.cpu_name}>
                  {systemSpecs.cpu_name}
                </span>
                <span className="text-primary-400 font-semibold shrink-0">
                  {totalHardwareRamGb} GB RAM Installed ({Math.round(systemSpecs.available_memory_mb / 1024)} GB Free)
                </span>
              </div>
            ) : null}

            {/* High Memory warning if > 85% */}
            {isHighMemory && (
              <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-mono">
                ⚠️ Allocating &gt;85% of total hardware memory ({totalHardwareRamGb} GB) may cause operating system instability or background apps to crash.
              </div>
            )}

            {/* Slider Max RAM */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-neutral-400 font-mono">
                <span>Maximum RAM (-Xmx)</span>
                <span>{(maxRam / 1024).toFixed(1)} GB</span>
              </div>
              <input
                type="range"
                min={1024}
                max={maxRamSliderLimit}
                step={512}
                value={maxRam}
                onChange={(e) => setMaxRam(Number(e.target.value))}
                className="w-full accent-primary-500 cursor-pointer h-2 bg-neutral-950 rounded-lg"
              />
              <div className="flex justify-between text-[10px] font-mono text-neutral-500">
                <span>1 GB</span>
                <span>4 GB</span>
                <span>8 GB</span>
                <span>{totalHardwareRamGb} GB (Max HW)</span>
              </div>
            </div>

            {/* Slider Min RAM */}
            <div className="space-y-2 pt-2 border-t border-neutral-800">
              <div className="flex items-center justify-between text-xs text-neutral-400 font-mono">
                <span>Initial RAM (-Xms)</span>
                <span>{(minRam / 1024).toFixed(1)} GB</span>
              </div>
              <input
                type="range"
                min={512}
                max={maxRam}
                step={512}
                value={minRam}
                onChange={(e) => setMinRam(Number(e.target.value))}
                className="w-full accent-primary-600 cursor-pointer h-2 bg-neutral-950 rounded-lg"
              />
            </div>

            {/* Quick Memory Presets */}
            <div className="pt-2">
              <span className="text-[11px] font-mono text-neutral-400 uppercase tracking-wider block mb-2">
                Quick Presets
              </span>
              <div className={`grid ${totalHardwareRamGb >= 16 ? 'grid-cols-4' : 'grid-cols-3'} gap-2`}>
                <button
                  type="button"
                  onClick={() => applyRamPreset(1024, 2048)}
                  className="p-2 rounded-lg bg-neutral-950 hover:bg-neutral-800 border border-neutral-800 text-xs text-neutral-300 font-medium transition-colors"
                >
                  Vanilla (2GB)
                </button>
                <button
                  type="button"
                  onClick={() => applyRamPreset(2048, 4096)}
                  className="p-2 rounded-lg bg-neutral-950 hover:bg-neutral-800 border border-neutral-800 text-xs text-primary-400 font-medium transition-colors"
                >
                  Standard (4GB)
                </button>
                <button
                  type="button"
                  onClick={() => applyRamPreset(4096, 8192)}
                  className="p-2 rounded-lg bg-neutral-950 hover:bg-neutral-800 border border-neutral-800 text-xs text-primary-400 font-medium transition-colors"
                >
                  Heavy (8GB)
                </button>
                {totalHardwareRamGb >= 16 && (
                  <button
                    type="button"
                    onClick={() => {
                      const safeCap = Math.floor(totalHardwareRamGb * 0.75) * 1024;
                      applyRamPreset(4096, safeCap);
                    }}
                    className="p-2 rounded-lg bg-neutral-950 hover:bg-neutral-800 border border-neutral-800 text-xs text-neutral-400 font-medium transition-colors"
                  >
                    Optimal ({Math.floor(totalHardwareRamGb * 0.75)}GB)
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Section 2: Java Runtime */}
          <div className="p-5 rounded-2xl bg-neutral-900/80 border border-neutral-800 space-y-4">
            <div className="flex items-center gap-2 text-sm font-bold text-neutral-200">
              <Zap size={16} className="text-primary-400" />
              <span>Java Runtime Environment</span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {[25, 21, 17, 8].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => { setJavaVersion(v); setJavaPath('auto'); }}
                  className={`p-3 rounded-xl border text-xs font-semibold flex flex-col items-center gap-0.5 transition-all ${
                    javaVersion === v
                      ? 'bg-primary-500/20 border-primary-500 text-primary-300'
                      : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  <span className="font-bold text-sm">Java {v}</span>
                  <span className="text-[10px] font-mono text-neutral-500">
                    {v === 25 ? 'Latest JVM' : v === 21 ? 'MC 1.20.5+' : v === 17 ? 'MC 1.18 - 1.20.4' : 'MC 1.8 - 1.16'}
                  </span>
                </button>
              ))}
            </div>

            <div className="rounded-xl border border-neutral-800 bg-neutral-950/70 p-3 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-neutral-300 font-semibold">Detected runtimes</span>
                <span className="text-neutral-500 font-mono">{javaInstallations.length}</span>
              </div>
              {javaInstallations.length === 0 ? (
                <p className="text-[11px] text-amber-300">No Java runtime detected. Install Java for this Minecraft version.</p>
              ) : (
                <div className="space-y-1.5 max-h-28 overflow-y-auto">
                  {javaInstallations.map((java) => (
                    <button
                      key={java.path}
                      type="button"
                      onClick={() => { setJavaPath(java.path); setJavaVersion(java.major); }}
                      className={`w-full text-left rounded-lg border px-2.5 py-2 text-[11px] transition-colors ${
                        javaPath === java.path ? 'border-primary-500/60 bg-primary-500/10 text-primary-200' : 'border-neutral-800 bg-neutral-900 text-neutral-400 hover:text-neutral-200'
                      }`}
                    >
                      <div className="flex justify-between gap-2"><span>Java {java.major}</span><span>{java.vendor}</span></div>
                      <div className="truncate font-mono text-neutral-500">{java.path}</div>
                    </button>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-4 gap-1.5 pt-1">
                {[8, 17, 21, 25].map((major) => (
                  <button key={major} type="button" onClick={() => handleInstallJava(major)} disabled={installingJava !== null} className="rounded-lg border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-[10px] text-neutral-300 hover:border-primary-500/60 disabled:opacity-50">
                    {installingJava === major ? 'Downloading…' : `Install ${major}`}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-mono text-neutral-400 uppercase tracking-wider mb-1.5">
                Java Executable Path
              </label>
              <input
                type="text"
                value={javaPath}
                onChange={(e) => setJavaPath(e.target.value)}
                placeholder="auto (Managed by Surface Client)"
                className="w-full px-3.5 py-2 bg-neutral-950 border border-neutral-700 rounded-xl text-xs text-neutral-100 font-mono focus:outline-none focus:border-primary-500"
              />
              <span className="text-[10px] text-neutral-500 font-mono mt-1 block">
                Leave as 'auto' to let Surface Client manage the optimal HotSpot VM binary.
              </span>
            </div>
          </div>
        </div>

        {/* Right Column: JVM Flags & Window/Display */}
        <div className="space-y-6">
          {/* Section 3: JVM Arguments & Garbage Collector */}
          <div className="p-5 rounded-2xl bg-neutral-900/80 border border-neutral-800 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-bold text-neutral-200">
                <Terminal size={16} className="text-primary-400" />
                <span>JVM Arguments & Garbage Collector</span>
              </div>
            </div>

            {/* Presets */}
            <div className="flex flex-wrap gap-1.5">
              {jvmPresets.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => setJvmArgs(p.args)}
                  className="px-2.5 py-1 rounded-lg bg-neutral-950 hover:bg-neutral-800 border border-neutral-800 text-[11px] text-neutral-300 transition-colors"
                >
                  {p.name}
                </button>
              ))}
            </div>

            <div>
              <textarea
                rows={3}
                value={jvmArgs}
                onChange={(e) => setJvmArgs(e.target.value)}
                className="w-full p-3 bg-neutral-950 border border-neutral-700 rounded-xl text-xs text-neutral-100 font-mono focus:outline-none focus:border-primary-500 leading-relaxed"
                placeholder="-XX:+UseG1GC -XX:+ParallelRefProcEnabled..."
              />
            </div>
          </div>

          {/* Section 4: Resolution & Window Settings */}
          <div className="p-5 rounded-2xl bg-neutral-900/80 border border-neutral-800 space-y-4">
            <div className="flex items-center gap-2 text-sm font-bold text-neutral-200">
              <Monitor size={16} className="text-neutral-400" />
              <span>Window Resolution & Display</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-mono text-neutral-400 uppercase tracking-wider mb-1.5">
                  Width (px)
                </label>
                <input
                  type="number"
                  value={width}
                  onChange={(e) => setWidth(Number(e.target.value))}
                  className="w-full px-3.5 py-2 bg-neutral-950 border border-neutral-700 rounded-xl text-xs text-neutral-100 font-mono focus:outline-none focus:border-primary-500"
                />
              </div>

              <div>
                <label className="block text-xs font-mono text-neutral-400 uppercase tracking-wider mb-1.5">
                  Height (px)
                </label>
                <input
                  type="number"
                  value={height}
                  onChange={(e) => setHeight(Number(e.target.value))}
                  className="w-full px-3.5 py-2 bg-neutral-950 border border-neutral-700 rounded-xl text-xs text-neutral-100 font-mono focus:outline-none focus:border-primary-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2.5 text-xs text-neutral-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={fullscreen}
                  onChange={(e) => setFullscreen(e.target.checked)}
                  className="w-4 h-4 rounded accent-primary-500 cursor-pointer"
                />
                <span>Start in Fullscreen Mode</span>
              </label>

              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setWidth(1920);
                    setHeight(1080);
                  }}
                  className="px-2 py-1 bg-neutral-950 text-[10px] font-mono text-neutral-400 rounded border border-neutral-800 hover:text-neutral-200"
                >
                  1080p
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setWidth(2560);
                    setHeight(1440);
                  }}
                  className="px-2 py-1 bg-neutral-950 text-[10px] font-mono text-neutral-400 rounded border border-neutral-800 hover:text-neutral-200"
                >
                  1440p
                </button>
              </div>
            </div>

            {/* Auto-connect server */}
            <div className="pt-2 border-t border-neutral-800">
              <label className="block text-xs font-mono text-neutral-400 uppercase tracking-wider mb-1.5">
                Auto-Connect to Multiplayer Server
              </label>
              <div className="relative">
                <Wifi size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                <input
                  type="text"
                  value={autoConnect}
                  onChange={(e) => setAutoConnect(e.target.value)}
                  placeholder="e.g. mc.hypixel.net, 127.0.0.1:25565"
                  className="w-full pl-9 pr-3 py-2 bg-neutral-950 border border-neutral-700 rounded-xl text-xs text-neutral-100 font-mono focus:outline-none focus:border-primary-500"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Logs */}
      <div className="p-5 rounded-2xl bg-neutral-900 border border-neutral-800 space-y-3">
        <div>
          <h3 className="text-sm font-bold text-neutral-200">Log files</h3>
          <p className="text-xs text-neutral-500">Leave a field empty to use the default path.</p>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <label className="space-y-1">
            <span className="text-[11px] text-neutral-400">Launcher log</span>
            <input value={launcherLogPath} onChange={(event) => setLauncherLogPath(event.target.value)} placeholder={defaultLogPaths?.launcher || 'Default launcher.log path'} className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded-xl text-xs text-neutral-100 font-mono focus:outline-none focus:border-primary-500" />
          </label>
          <label className="space-y-1">
            <span className="text-[11px] text-neutral-400">Mods and dependencies log</span>
            <input value={modsLogPath} onChange={(event) => setModsLogPath(event.target.value)} placeholder={defaultLogPaths?.mods || 'Default mods.log path'} className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded-xl text-xs text-neutral-100 font-mono focus:outline-none focus:border-primary-500" />
          </label>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] text-neutral-500">Logs are written by the native launcher.</span>
          <div className="flex items-center gap-3">
            {logStatus && <span className="text-[11px] text-primary-300">{logStatus}</span>}
            <button type="button" onClick={handleLogSave} className="px-4 py-2 rounded-xl bg-primary-500/15 border border-primary-500/40 text-primary-200 text-xs font-semibold hover:bg-primary-500/25 transition-colors">Apply log paths</button>
          </div>
        </div>
      </div>

      {/* Network */}
      <div className="p-5 rounded-2xl bg-neutral-900 border border-neutral-800 space-y-3">
        <div>
          <h3 className="text-sm font-bold text-neutral-200">Download proxy</h3>
          <p className="text-xs text-neutral-500">Optional. Used for Mojang metadata and game files.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={proxyUrl}
            onChange={(event) => setProxyUrl(event.target.value)}
            placeholder="socks5h://host:port or http://host:port"
            className="flex-1 px-3.5 py-2 bg-neutral-950 border border-neutral-700 rounded-xl text-xs text-neutral-100 font-mono focus:outline-none focus:border-primary-500"
            spellCheck={false}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input
            type="text"
            value={proxyUsername}
            onChange={(event) => setProxyUsername(event.target.value)}
            placeholder="Username (optional)"
            autoComplete="username"
            className="px-3.5 py-2 bg-neutral-950 border border-neutral-700 rounded-xl text-xs text-neutral-100 font-mono focus:outline-none focus:border-primary-500"
          />
          <input
            type="password"
            value={proxyPassword}
            onChange={(event) => setProxyPassword(event.target.value)}
            placeholder="Password (optional)"
            autoComplete="current-password"
            className="px-3.5 py-2 bg-neutral-950 border border-neutral-700 rounded-xl text-xs text-neutral-100 font-mono focus:outline-none focus:border-primary-500"
          />
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleProxySave}
            className="px-4 py-2 rounded-xl bg-primary-500/15 border border-primary-500/40 text-primary-200 text-xs font-semibold hover:bg-primary-500/25 transition-colors"
          >
            Apply proxy
          </button>
        </div>
        <div className="flex items-center justify-between gap-3 text-[11px] text-neutral-500">
          <span>Leave empty for a direct connection.</span>
          {proxyStatus && <span className="text-primary-300">{proxyStatus}</span>}
        </div>
      </div>

      {/* Section 5: Command Generator & Launch Scripts */}
      <div className="p-5 rounded-2xl bg-neutral-900 border border-neutral-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-neutral-200 flex items-center gap-2">
              <FileCode size={16} className="text-primary-400" />
              <span>Full Generated Launch Command</span>
            </h3>
            <p className="text-xs text-neutral-400">
              The exact Java execution string Surface Client uses to run this profile
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyCmd}
              className="px-3.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-xs text-neutral-200 font-medium flex items-center gap-1.5 transition-colors"
            >
              {copiedCmd ? <Check size={14} className="text-primary-400" /> : <Copy size={14} />}
              <span>{copiedCmd ? 'Copied!' : 'Copy Command'}</span>
            </button>

            <button
              onClick={() => handleDownloadScript('windows')}
              className="px-3.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-xs text-neutral-200 font-medium flex items-center gap-1.5 transition-colors"
            >
              <Download size={14} />
              <span>Download .bat (Win)</span>
            </button>

            <button
              onClick={() => handleDownloadScript('linux')}
              className="px-3.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-xs text-neutral-200 font-medium flex items-center gap-1.5 transition-colors"
            >
              <Download size={14} />
              <span>Download .sh (Mac/Linux)</span>
            </button>
          </div>

          {scriptPath && (
            <p className="mt-2 text-[11px] font-mono text-neutral-400 break-all">
              Saved to {scriptPath}
            </p>
          )}
        </div>

        <div className="p-3.5 bg-neutral-950 rounded-xl border border-neutral-800 font-mono text-[11px] text-primary-400/90 break-all select-all leading-relaxed max-h-28 overflow-y-auto">
          {currentCmd}
        </div>
      </div>
    </>
  )}
</div>
  );
};
