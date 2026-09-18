import React, { useState, useEffect, useRef } from 'react';
import {
  Terminal,
  X,
  Play,
  Square,
  Maximize2,
  Minimize2,
  RefreshCw,
  Cpu,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Flame,
  Gamepad2,
} from 'lucide-react';
import { InstanceProfile, LaunchState, LogEntry } from '../types/launcher';

interface RunningGameOverlayProps {
  instance?: InstanceProfile | null;
  launchState: LaunchState;
  onStopGame: () => void;
  onCloseConsole: () => void;
}

export const RunningGameOverlay: React.FC<RunningGameOverlayProps> = ({
  instance,
  launchState,
  onStopGame,
  onCloseConsole,
}) => {
  const [filterLevel, setFilterLevel] = useState<'ALL' | 'INFO' | 'WARN' | 'ERROR'>('ALL');
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [launchState.logs]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseConsole();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCloseConsole]);

  const filteredLogs = launchState.logs.filter((log: LogEntry) => {
    if (filterLevel === 'ALL') return true;
    return log.level === filterLevel;
  });

  const canStop = launchState.status === 'running' && launchState.pid != null;
  const statusLabel = launchState.status === 'running' ? 'Running' : launchState.stage || 'Not running';
  const emptyLogLabel = launchState.status === 'running'
    ? 'Waiting for Minecraft process output…'
    : launchState.status === 'verifying_dependencies' || launchState.status === 'spawning_jvm'
      ? 'Starting Minecraft…'
      : 'Game is not launched';

  const formatUptime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onCloseConsole();
        }
      }}
    >
      <div className="bg-neutral-900 border border-neutral-700/80 rounded-2xl w-full max-w-5xl h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Console header */}
        <div className="h-11 pl-4 pr-2 bg-neutral-950 border-b border-neutral-800 flex items-center justify-between select-none">
          <div className="flex items-center gap-2 text-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-primary-300" />
            <span className="font-semibold text-neutral-100">{instance?.name || 'Minecraft'}</span>
            <span className="text-neutral-600">{instance?.mcVersion || ''}</span>
          </div>

          {/* Telemetry chips */}
          <div className="flex items-center gap-3 text-xs font-mono">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-neutral-900 border border-neutral-800 text-neutral-300">
              <Activity size={13} className="text-primary-400" />
              <span>PID {launchState.pid ?? '—'}</span>
            </div>

            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-neutral-900 border border-neutral-800 text-neutral-300">
              <Cpu size={13} className="text-primary-400" />
              <span>{instance?.memoryMaxMb ?? 0} MB</span>
            </div>

            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-neutral-900 border border-neutral-800 text-primary-400 font-bold">
              <span>{formatUptime(launchState.playTimeSeconds)}</span>
            </div>

            <button
              onClick={onStopGame}
              disabled={!canStop}
              className={`px-3 py-1 rounded border text-xs font-semibold flex items-center gap-1 transition-colors ${
                canStop
                  ? 'bg-red-950/80 hover:bg-red-900 border-red-700 text-red-300 cursor-pointer'
                  : 'bg-neutral-900 border-neutral-800 text-neutral-600 cursor-not-allowed'
              }`}
              title={canStop ? 'Stop running instance' : statusLabel}
              aria-label={canStop ? 'Stop running instance' : statusLabel}
            >
              <Square size={12} className="fill-current" />
              <span>Stop</span>
            </button>

            <button
              onClick={onCloseConsole}
              className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white transition-colors cursor-pointer"
              title="Close window (Esc)" aria-label="Close window (Esc)"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Tab Subheader */}
        <div className="px-4 py-2 bg-neutral-950/80 border-b border-neutral-800/80 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <div className="px-3 py-1 rounded-lg bg-neutral-800 text-primary-300 font-mono font-medium flex items-center gap-1.5">
              <Terminal size={14} />
              <span>Process Terminal Logs ({launchState.logs.length})</span>
          </div>

          <div className="flex items-center gap-1 bg-neutral-900 p-0.5 rounded-lg border border-neutral-800 font-mono text-[11px]">
              {(['ALL', 'INFO', 'WARN', 'ERROR'] as const).map((lvl) => (
                <button
                  key={lvl}
                  onClick={() => setFilterLevel(lvl)}
                  className={`px-2 py-0.5 rounded transition-colors ${
                    filterLevel === lvl
                      ? 'bg-neutral-800 text-neutral-100 font-bold'
                      : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  {lvl}
                </button>
              ))}
          </div>
        </div>
        </div>

        {/* Content View */}
        <div className="flex-1 overflow-hidden flex flex-col bg-neutral-950">
          <div className="flex-1 overflow-y-auto p-4 font-mono text-xs space-y-1 select-text">
              {filteredLogs.length === 0 && (
                <div className="h-full flex items-center justify-center text-neutral-500">
                  {emptyLogLabel}
                </div>
              )}
              {filteredLogs.map((log: LogEntry) => {
                let colorClass = 'text-neutral-300';
                if (log.level === 'WARN') colorClass = 'text-amber-400';
                if (log.level === 'ERROR') colorClass = 'text-red-400 font-semibold';
                if (log.message.includes('Fabric Loader') || log.message.includes('Loading')) {
                  colorClass = 'text-primary-400';
                }

                return (
                  <div key={log.id} className="flex items-start gap-2 leading-relaxed">
                    <span className="text-neutral-600 select-none text-[11px]">{log.timestamp}</span>
                    <span
                      className={`text-[10px] px-1 py-0.2 rounded border font-mono ${
                        log.level === 'INFO'
                          ? 'border-neutral-800 text-neutral-400'
                          : log.level === 'WARN'
                          ? 'border-amber-800 bg-amber-950/40 text-amber-300'
                          : 'border-red-800 bg-red-950/60 text-red-300'
                      }`}
                    >
                      {log.level}
                    </span>
                    <span className="text-neutral-500 select-none">[{log.logger || 'main'}]</span>
                    <span className={`break-all ${colorClass}`}>{log.message}</span>
                  </div>
                );
              })}
              <div ref={logsEndRef} />
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 bg-neutral-950 border-t border-neutral-800 flex items-center justify-between text-xs font-mono">
          <div className="text-neutral-500 flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${canStop ? 'bg-primary-400' : 'bg-neutral-600'}`} />
            <span>{canStop ? `Process ID: ${launchState.pid}` : 'Game is not launched'}</span>
            <span>•</span>
            <span>Logs stream active</span>
          </div>

          <button
            onClick={onCloseConsole}
            className="text-neutral-400 hover:text-neutral-200 text-xs font-sans transition-colors"
          >
            Hide to Background (Game continues running)
          </button>
        </div>
      </div>
    </div>
  );
};
