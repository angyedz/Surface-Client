import React, { useState } from 'react';
import {
  Package,
  Terminal,
  BarChart3,
  Camera,
  Layers,
  Plus,
} from 'lucide-react';
import {
  InstanceProfile,
  LaunchStatus,
  InGameScreenshot,
  WeeklyPlaytimeDay,
} from '../types/launcher';
import { HeroLaunchpad } from './HeroLaunchpad';
import { PlaytimeChart } from './PlaytimeChart';
import { ScreenshotGallery } from './ScreenshotGallery';

interface PlayViewProps {
  instance?: InstanceProfile | null;
  instances: InstanceProfile[];
  onSelectInstance: (instance: InstanceProfile) => void;
  launchStatus: LaunchStatus;
  launchProgress: number;
  launchPid?: number;
  playTimeSeconds: number;
  launchStageText: string;
  onLaunch: () => void;
  onStop: () => void;
  onOpenMods: () => void;
  onOpenSettings: () => void;
  onOpenConsole: () => void;
  onExportMrpack: () => void;
  screenshots: InGameScreenshot[];
  onDeleteScreenshot: (id: string) => void;
  onRefreshScreenshots: () => void;
  weeklyPlaytime: WeeklyPlaytimeDay[];
}

export const PlayView: React.FC<PlayViewProps> = ({
  instance,
  instances,
  onSelectInstance,
  launchStatus,
  launchProgress,
  launchPid,
  playTimeSeconds,
  launchStageText,
  onLaunch,
  onStop,
  onOpenMods,
  onOpenSettings,
  onOpenConsole,
  onExportMrpack,
  screenshots,
  onDeleteScreenshot,
  onRefreshScreenshots,
  weeklyPlaytime,
}) => {
  const [activeTab, setActiveTab] = useState<'mods' | 'analytics' | 'screenshots'>('mods');

  if (!instance) {
    return (
      <div className="flex-1 overflow-y-auto p-6 flex items-center justify-center select-none font-['Plus_Jakarta_Sans',sans-serif]">
        <div className="max-w-md w-full p-8 rounded-3xl bg-neutral-900/80 border border-white/10 text-center space-y-6 shadow-2xl">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-primary-500/20 border border-primary-500/40 flex items-center justify-center text-primary-400 shadow-lg shadow-primary-900/40">
            <Package size={32} />
          </div>

          <div className="space-y-2">
            <h2 className="text-xl font-bold text-neutral-100 font-['Chakra_Petch'] tracking-wide">
              NO MINECRAFT PROFILES
            </h2>
            <p className="text-xs text-neutral-400 leading-relaxed">
              You haven't installed any Minecraft profiles yet. Create a fresh profile with Fabric, NeoForge, Forge, Quilt or Vanilla release builds.
            </p>
          </div>

          <div className="space-y-3 pt-2">
            <button
              onClick={onOpenMods}
              className="w-full py-3 rounded-xl bg-primary-500 hover:bg-primary-400 text-neutral-950 font-bold text-xs shadow-lg shadow-primary-900/60 transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <Plus size={16} />
              <span>Create First Profile</span>
            </button>
            <button
              onClick={onOpenSettings}
              className="w-full py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-300 font-medium text-xs border border-white/10 transition-colors cursor-pointer"
            >
              Configure Hardware Settings
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isRunning = launchStatus === 'running';
  const activeMods = instance.installedMods.filter((m) => m.enabled);

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 select-none">
      {/* 1. HERO LAUNCHPAD: Clean space stage with Voxel Earth, Astronaut, calm Launch button */}
      <HeroLaunchpad
        instance={instance}
        instances={instances}
        onSelectInstance={onSelectInstance}
        launchStatus={launchStatus}
        launchProgress={launchProgress}
        launchStageText={launchStageText}
        onLaunch={onLaunch}
        onStop={onStop}
        onOpenSettings={onOpenSettings}
      />

      {/* 2. In-Game Window when running */}
      {isRunning && (
        <div className="rounded-2xl border border-primary-500/30 bg-neutral-950/80 overflow-hidden">
          <div className="bg-neutral-900/80 px-4 py-2 border-b border-white/5 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-neutral-300">
              <span className="w-2 h-2 rounded-full bg-primary-400 animate-pulse" />
              <span className="font-semibold text-primary-400">
                Minecraft {instance.mcVersion}
              </span>
              <span className="text-neutral-500">•</span>
              <span className="text-neutral-400">Running process</span>
            </div>
            <button
              onClick={onOpenConsole}
              className="px-2.5 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Terminal size={12} />
              <span>Console</span>
            </button>
          </div>

          {/* Live session facts, not a stock photo of someone else's game. */}
          <div className="panel-inset p-4 grid grid-cols-3 gap-4 font-mono text-xs">
            <div>
              <div className="text-neutral-500 uppercase text-[10px]">Process</div>
              <div className="text-neutral-200">{launchPid ? `PID ${launchPid}` : '—'}</div>
            </div>
            <div>
              <div className="text-neutral-500 uppercase text-[10px]">Session</div>
              <div className="text-neutral-200">
                {String(Math.floor(playTimeSeconds / 3600)).padStart(2, '0')}:
                {String(Math.floor((playTimeSeconds % 3600) / 60)).padStart(2, '0')}:
                {String(playTimeSeconds % 60).padStart(2, '0')}
              </div>
            </div>
            <div>
              <div className="text-neutral-500 uppercase text-[10px]">Memory</div>
              <div className="text-neutral-200">{instance.memoryMaxMb} MB max</div>
            </div>
          </div>
        </div>
      )}

      {/* 3. Minimalist Bottom Panel: Tabs for Mods, Playtime, Screenshots */}
      <div className="space-y-4">
        {/* Navigation Tabs */}
        <div className="flex items-center justify-between border-b border-white/5 pb-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('mods')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'mods'
                  ? 'bg-white/10 text-white font-semibold'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Package size={13} />
              <span>Installed Mods ({instance.installedMods.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('analytics')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'analytics'
                  ? 'bg-white/10 text-white font-semibold'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <BarChart3 size={13} />
              <span>Playtime</span>
            </button>
            <button
              onClick={() => setActiveTab('screenshots')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'screenshots'
                  ? 'bg-white/10 text-white font-semibold'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Camera size={13} />
              <span>Screenshots ({screenshots.length})</span>
            </button>
          </div>

          <div className="text-xs text-neutral-500 font-mono">
            {instance.name}
          </div>
        </div>

        {/* TAB 1: INSTALLED MODS */}
        {activeTab === 'mods' && (
          <div className="rounded-2xl p-4 border border-white/5 bg-neutral-900/40 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold text-neutral-200">
                  Installed Mods in {instance.name}
                </h3>
                <p className="text-[11px] text-neutral-400">
                  {activeMods.length} of {instance.installedMods.length} mods enabled
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={onOpenMods}
                  className="px-3 py-1.5 rounded-lg bg-primary-500 hover:bg-primary-400 text-neutral-950 font-semibold text-xs transition-colors cursor-pointer flex items-center gap-1"
                >
                  <Plus size={13} />
                  <span>Browse Mods</span>
                </button>
                <button
                  onClick={onExportMrpack}
                  className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs transition-colors cursor-pointer"
                >
                  Export .mrpack
                </button>
              </div>
            </div>

            {instance.installedMods.length === 0 ? (
              <div className="py-8 text-center text-xs text-neutral-500">
                No mods installed in this profile. Click "Browse Mods" to add mods.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {instance.installedMods.map((mod) => (
                  <div
                    key={mod.id}
                    className="p-2.5 rounded-xl bg-neutral-950/60 border border-white/5 flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      {mod.iconUrl ? (
                        <img
                          src={mod.iconUrl}
                          alt={mod.title}
                          className="w-6 h-6 rounded object-cover"
                        />
                      ) : (
                        <div className="w-6 h-6 rounded bg-neutral-800 flex items-center justify-center text-neutral-400">
                          <Package size={13} />
                        </div>
                      )}
                      <div className="truncate">
                        <span className="text-xs font-medium text-neutral-200 block truncate">
                          {mod.title}
                        </span>
                        <span className="text-[10px] text-neutral-500 font-mono">
                          v{mod.versionNumber}
                        </span>
                      </div>
                    </div>

                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                        mod.enabled
                          ? 'text-primary-400 bg-primary-500/10'
                          : 'text-neutral-500 bg-neutral-800'
                      }`}
                    >
                      {mod.enabled ? 'On' : 'Off'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: PLAYTIME ANALYTICS */}
        {activeTab === 'analytics' && (
          <div className="rounded-2xl p-4 border border-white/5 bg-neutral-900/40">
            <PlaytimeChart data={weeklyPlaytime} />
          </div>
        )}

        {/* TAB 3: IN-GAME SCREENSHOTS */}
        {activeTab === 'screenshots' && (
          <div className="rounded-2xl p-4 border border-white/5 bg-neutral-900/40">
            <ScreenshotGallery
              screenshots={screenshots}
              instanceName={instance.name}
              instanceId={instance.id}
              onDeleteScreenshot={onDeleteScreenshot}
              onRefresh={onRefreshScreenshots}
            />
          </div>
        )}
      </div>
    </div>
  );
};
