import React, { useCallback, useRef, useState } from 'react';
import {
  Play,
  Square,
  ChevronDown,
  CheckCircle2,
} from 'lucide-react';
import { InstanceProfile, LaunchStatus } from '../types/launcher';
import { useDismissable } from '../hooks/useDismissable';

interface HeroLaunchpadProps {
  instance: InstanceProfile;
  instances: InstanceProfile[];
  onSelectInstance: (instance: InstanceProfile) => void;
  launchStatus: LaunchStatus;
  launchProgress: number;
  launchStageText: string;
  onLaunch: () => void;
  onStop: () => void;
  onOpenSettings: () => void;
  isInstalled: boolean;
}

export const HeroLaunchpad: React.FC<HeroLaunchpadProps> = ({
  instance,
  instances,
  onSelectInstance,
  launchStatus,
  launchProgress,
  launchStageText,
  onLaunch,
  onStop,
  onOpenSettings,
  isInstalled,
}) => {
  const [showVersionDropdown, setShowVersionDropdown] = useState(false);
  const launchGroupRef = useRef<HTMLDivElement>(null);
  const closeVersionDropdown = useCallback(() => setShowVersionDropdown(false), []);
  useDismissable(launchGroupRef, closeVersionDropdown, showVersionDropdown);
  const isRunning = launchStatus === 'running';
  const isLaunching =
    launchStatus !== 'idle' &&
    launchStatus !== 'running' &&
    launchStatus !== 'crashed' &&
    launchStatus !== 'finished';

  return (
    <div className="relative rounded-2xl border border-white/10 bg-neutral-900/60 select-none">
      {/* Background Star Speckles */}
      <div
        className="absolute inset-0 rounded-2xl overflow-hidden opacity-25 mix-blend-screen pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(circle at 15% 30%, rgba(255,255,255,0.7) 1px, transparent 1px),
                            radial-gradient(circle at 75% 25%, rgba(255,255,255,0.6) 1.5px, transparent 1.5px),
                            radial-gradient(circle at 45% 70%, rgba(255,255,255,0.4) 1px, transparent 1px),
                            radial-gradient(circle at 88% 80%, rgba(255,255,255,0.5) 1.2px, transparent 1.2px)`,
          backgroundSize: '240px 240px',
        }}
      />

      {/* Main Hero Visual Stage */}
      <div className="relative px-6 py-8 md:py-10 flex flex-col md:flex-row items-center justify-between gap-6">
        {/* LEFT: 3D Voxel Earth & Astronaut */}
        <div className="flex items-center gap-4 lg:gap-6 relative z-10">
          {/* 3D Voxel Earth */}
          <div
            className="relative w-20 h-20 lg:w-28 lg:h-28 flex-shrink-0"
          >
            <svg
              viewBox="0 0 120 120"
              className="w-full h-full drop-shadow-md"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* Earth Cube Faces Isometric */}
              <polygon points="60,10 105,35 60,60 15,35" fill="#2563EB" />
              <polygon points="60,10 85,24 70,38 45,24" fill="#10B981" />
              <polygon points="25,30 45,24 55,36 35,42" fill="#059669" />
              <polygon points="75,20 95,30 85,42 65,32" fill="#34D399" />
              <polygon points="30,18 45,10 60,18 45,26" fill="#FFFFFF" fillOpacity="0.85" />
              <polygon points="70,32 85,24 100,32 85,40" fill="#E2E8F0" fillOpacity="0.9" />

              <polygon points="15,35 60,60 60,108 15,83" fill="#1D4ED8" />
              <polygon points="15,45 35,56 35,72 15,62" fill="#047857" />
              <polygon points="40,70 60,82 60,102 40,90" fill="#065F46" />

              <polygon points="60,60 105,35 105,83 60,108" fill="#1E40AF" />
              <polygon points="65,68 85,56 85,74 65,85" fill="#059669" />
              <polygon points="85,48 105,38 105,55 85,65" fill="#10B981" />
            </svg>
          </div>

          {/* Voxel Astronaut Character */}
          <div
            className="relative w-14 h-24 lg:w-18 lg:h-30 flex-shrink-0"
          >
            <svg
              viewBox="0 0 70 120"
              className="w-full h-full drop-shadow-md"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <rect x="20" y="8" width="30" height="28" rx="3" fill="#E2E8F0" stroke="#94A3B8" strokeWidth="1.5" />
              <rect x="25" y="14" width="20" height="14" rx="2" fill="#0F172A" />
              <rect x="27" y="16" width="16" height="10" rx="1" fill="#0369A1" />
              <path d="M 28 17 L 34 17 L 30 24 Z" fill="#FFFFFF" fillOpacity="0.7" />

              <rect x="18" y="38" width="34" height="34" rx="2" fill="#F1F5F9" />
              <rect x="28" y="44" width="14" height="12" rx="1.5" fill="#CBD5E1" />
              <circle cx="32" cy="50" r="1.5" fill="#10B981" />
              <circle cx="38" cy="50" r="1.5" fill="#3B82F6" />

              <rect x="8" y="38" width="8" height="28" rx="2" fill="#E2E8F0" />
              <rect x="8" y="66" width="8" height="6" rx="1" fill="#64748B" />

              <rect x="54" y="38" width="8" height="28" rx="2" fill="#E2E8F0" />
              <rect x="54" y="66" width="8" height="6" rx="1" fill="#64748B" />

              <rect x="22" y="74" width="11" height="34" rx="1" fill="#CBD5E1" />
              <rect x="20" y="108" width="13" height="6" rx="1.5" fill="#475569" />

              <rect x="37" y="74" width="11" height="34" rx="1" fill="#CBD5E1" />
              <rect x="37" y="108" width="13" height="6" rx="1.5" fill="#475569" />
            </svg>
          </div>
        </div>

        {/* CENTER: Clean Minimalist Launch Button */}
        <div ref={launchGroupRef} className="flex flex-col items-center text-center relative z-20">
          <div className="relative inline-flex items-stretch rounded-xl overflow-hidden shadow-lg border border-white/10">
            {isRunning ? (
              <button
                onClick={onStop}
                className="px-8 py-3.5 bg-red-600 hover:bg-red-500 text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2.5 cursor-pointer active:scale-[0.99]"
              >
                <Square size={16} fill="currentColor" />
                <div className="flex flex-col text-left">
                  <span className="leading-tight text-xs font-bold uppercase">STOP MINECRAFT</span>
                  <span className="text-[10px] text-red-200">Running ({instance.mcVersion})</span>
                </div>
              </button>
            ) : (
              <button
                onClick={onLaunch}
                disabled={isLaunching}
                className="px-10 py-3.5 bg-primary-500 hover:bg-primary-400 text-neutral-950 font-bold text-sm tracking-wide transition-all flex items-center justify-center gap-3 cursor-pointer active:scale-[0.99] disabled:opacity-80"
              >
                {isLaunching ? (
                  <>
                    <div className="w-4 h-4 border-2 border-neutral-950 border-t-transparent rounded-full animate-spin" />
                    <div className="flex flex-col text-left">
                      <span className="leading-tight text-xs font-bold">LAUNCHING...</span>
                      <span className="text-[10px] text-neutral-900 font-mono">
                        {launchStageText}
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <Play size={18} fill="currentColor" />
                    <div className="flex flex-col text-left">
                      <span className="leading-tight text-xs font-bold uppercase">
                        {isInstalled ? `PLAY ${instance.mcVersion}` : `INSTALL ${instance.mcVersion}`}
                      </span>
                      <span className="text-[10px] text-neutral-900 font-medium">
                        {isInstalled ? `${instance.loader.toUpperCase()} • Ready` : 'Download required files first'}
                      </span>
                    </div>
                  </>
                )}
              </button>
            )}

            {/* Version & Instance Picker Dropdown Toggle */}
            <button
              onClick={() => setShowVersionDropdown(!showVersionDropdown)}
              className={`px-3 flex items-center justify-center transition-colors cursor-pointer border-l border-white/10 ${
                isRunning
                  ? 'bg-red-700 hover:bg-red-800 text-white'
                  : 'bg-primary-600 hover:bg-primary-700 text-neutral-950'
              }`}
              title="Switch Instance" aria-label="Switch Instance"
            >
              <ChevronDown
                size={16}
                className={`transition-transform duration-200 ${showVersionDropdown ? 'rotate-180' : ''}`}
              />
            </button>
          </div>

          {/* Version / Instance Dropdown Menu */}
          {showVersionDropdown && (
            <div className="absolute top-full mt-2 w-64 bg-neutral-900/95 border border-white/10 rounded-xl shadow-2xl overflow-hidden py-1 z-50 text-left">
              <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-neutral-500 border-b border-white/5">
                Select Profile
              </div>
              <div className="max-h-48 overflow-y-auto py-1">
                {instances.map((inst) => (
                  <button
                    key={inst.id}
                    onClick={() => {
                      onSelectInstance(inst);
                      setShowVersionDropdown(false);
                    }}
                    className={`w-full px-3 py-2 flex items-center justify-between text-left hover:bg-white/5 transition-colors cursor-pointer text-xs ${
                      inst.id === instance.id ? 'text-primary-400 font-semibold' : 'text-neutral-300'
                    }`}
                  >
                    <div className="truncate">
                      <div className="font-medium truncate">{inst.name}</div>
                      <div className="text-[10px] text-neutral-500 font-mono">
                        {inst.mcVersion} • {inst.loader}
                      </div>
                    </div>
                    {inst.id === instance.id && (
                      <CheckCircle2 size={14} className="text-primary-400 flex-shrink-0 ml-2" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Clean Sub-label: Instance memory, mods count, playtime & settings */}
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-xs font-mono">
            <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/5 text-neutral-300">
              {instance.memoryMaxMb / 1024} GB RAM
            </span>
            <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/5 text-neutral-300">
              {instance.installedMods.length} mods
            </span>
            <span className="px-2 py-0.5 rounded-md bg-primary-500/10 border border-primary-500/20 text-primary-400">
              {Math.floor(instance.totalPlayTimeMinutes / 60) > 0
                ? `${Math.floor(instance.totalPlayTimeMinutes / 60)}h ${instance.totalPlayTimeMinutes % 60}m`
                : `${instance.totalPlayTimeMinutes % 60}m`}
            </span>
            <button
              onClick={onOpenSettings}
              className="px-2 py-0.5 rounded-md bg-white/5 hover:bg-white/10 border border-white/5 text-neutral-400 hover:text-neutral-200 transition-colors cursor-pointer"
              title="Launch configuration" aria-label="Launch configuration"
            >
              Settings
            </button>
          </div>
        </div>

        {/* RIGHT: 3D Voxel Rocket & Moon */}
        <div className="flex items-center gap-4 lg:gap-6 relative z-10">
          {/* Voxel Rocket */}
          <div
            className="relative w-16 h-24 lg:w-20 lg:h-28 flex-shrink-0"
          >
            <svg
              viewBox="0 0 90 120"
              className="w-full h-full drop-shadow-md"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <polygon points="45,10 60,25 45,35 30,25" fill="#EF4444" />
              <polygon points="30,25 45,35 45,45 30,35" fill="#DC2626" />
              <polygon points="45,35 60,25 60,35 45,45" fill="#B91C1C" />

              <polygon points="30,35 45,45 45,85 30,75" fill="#F8FAFC" />
              <polygon points="45,45 60,35 60,75 45,85" fill="#E2E8F0" />
              <circle cx="45" cy="55" r="5" fill="#0284C7" stroke="#38BDF8" strokeWidth="1" />

              <polygon points="30,62 45,70 45,76 30,68" fill="#10B981" />
              <polygon points="45,70 60,62 60,68 45,76" fill="#059669" />

              <polygon points="18,70 30,65 30,85 18,85" fill="#EF4444" />
              <polygon points="60,65 72,70 72,85 60,85" fill="#DC2626" />

              <polygon points="40,92 50,92 45,108" fill="#F59E0B" />
            </svg>
          </div>

          {/* Voxel Moon */}
          <div
            className="relative w-16 h-16 lg:w-22 lg:h-22 flex-shrink-0"
          >
            <svg
              viewBox="0 0 100 100"
              className="w-full h-full drop-shadow-md"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <polygon points="50,15 85,35 50,55 15,35" fill="#E2E8F0" />
              <polygon points="15,35 50,55 50,95 15,75" fill="#94A3B8" />
              <polygon points="50,55 85,35 85,75 50,95" fill="#64748B" />

              <rect x="35" y="30" width="10" height="6" rx="1" fill="#CBD5E1" />
              <rect x="25" y="55" width="10" height="10" rx="1" fill="#64748B" />
              <rect x="62" y="60" width="12" height="8" rx="1" fill="#475569" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
};
