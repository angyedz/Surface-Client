import React, { useState, useEffect } from 'react';
import {
  GitFork,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Sparkles,
  RefreshCw,
  ArrowRight,
  ShieldCheck,
  ShieldAlert,
  PackageCheck,
  Download,
  Trash2,
  Power,
} from 'lucide-react';
import { InstanceProfile, InstalledMod, DependencyIssue } from '../types/launcher';
import { analyzeInstanceDependencies, solveAllDependencies, DependencyAnalysisResult } from '../services/dependencySolver';

interface DependencyCenterViewProps {
  instance?: InstanceProfile | null;
  onUpdateInstance: (updated: InstanceProfile) => void;
  onOpenModrinth: () => void;
}

export const DependencyCenterView: React.FC<DependencyCenterViewProps> = ({
  instance,
  onUpdateInstance,
  onOpenModrinth,
}) => {
  if (!instance) {
    return (
      <div className="flex-1 overflow-y-auto p-6 flex items-center justify-center select-none font-['Plus_Jakarta_Sans',sans-serif]">
        <div className="max-w-md w-full p-8 rounded-3xl bg-neutral-900/80 border border-white/10 text-center space-y-4 shadow-2xl">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-primary-600/20 border border-primary-600/40 flex items-center justify-center text-primary-400">
            <GitFork size={28} />
          </div>
          <h3 className="text-base font-bold text-neutral-200">No Profile Selected</h3>
          <p className="text-xs text-neutral-400 leading-relaxed">
            Create or select a Minecraft profile to analyze mod dependencies, conflicts, and missing libraries.
          </p>
          <button
            onClick={onOpenModrinth}
            className="px-5 py-2.5 rounded-xl bg-primary-500 hover:bg-primary-400 text-neutral-950 font-bold text-xs shadow-lg transition-colors cursor-pointer"
          >
            Explore Modrinth Store
          </button>
        </div>
      </div>
    );
  }

  const [isSolving, setIsSolving] = useState(false);
  const [solvingProgressText, setSolvingProgressText] = useState('');
  const [analysis, setAnalysis] = useState<DependencyAnalysisResult>(() =>
    analyzeInstanceDependencies(instance)
  );

  useEffect(() => {
    if (instance) {
      setAnalysis(analyzeInstanceDependencies(instance));
    }
  }, [instance]);

  const reanalyze = () => {
    if (instance) {
      setAnalysis(analyzeInstanceDependencies(instance));
    }
  };

  // Run full automated resolution
  const handleAutoResolve = async () => {
    setIsSolving(true);
    try {
      const result = await solveAllDependencies(instance, (step) => {
        setSolvingProgressText(step);
      });
      onUpdateInstance(result.updatedInstance);
      setAnalysis(analyzeInstanceDependencies(result.updatedInstance));
    } catch (err) {
      console.error('Failed to auto-solve dependencies:', err);
    } finally {
      setIsSolving(false);
      setSolvingProgressText('');
    }
  };

  const handleToggleMod = (modId: string) => {
    const updatedMods = instance.installedMods.map((m) =>
      m.id === modId ? { ...m, enabled: !m.enabled } : m
    );
    const updated = { ...instance, installedMods: updatedMods };
    onUpdateInstance(updated);
    setAnalysis(analyzeInstanceDependencies(updated));
  };

  const handleDeleteMod = (modId: string) => {
    const updatedMods = instance.installedMods.filter((m) => m.id !== modId);
    const updated = { ...instance, installedMods: updatedMods };
    onUpdateInstance(updated);
    setAnalysis(analyzeInstanceDependencies(updated));
  };

  const missingIssues = analysis.issues.filter((i) => i.type === 'missing_required');
  const conflictIssues = analysis.issues.filter((i) => i.type === 'conflict');
  const otherIssues = analysis.issues.filter((i) => i.type === 'wrong_loader' || i.type === 'wrong_version');

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-neutral-950">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-2xl bg-neutral-900 border border-neutral-800">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-primary-500/20 border border-primary-500/40 flex items-center justify-center text-primary-400">
            <GitFork size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-neutral-100 font-['Chakra_Petch']">
              MOD DEPENDENCY SOLVER
            </h1>
            <p className="text-xs text-neutral-400">
              Graph-based automated dependency resolution and conflict engine for <strong className="text-neutral-200">{instance.name}</strong>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={reanalyze}
            className="p-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 border border-neutral-700 transition-colors"
            title="Refresh Analysis" aria-label="Refresh Analysis"
          >
            <RefreshCw size={16} />
          </button>

          {missingIssues.length > 0 && (
            <button
              onClick={handleAutoResolve}
              disabled={isSolving}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-400 hover:to-primary-600 text-neutral-950 font-bold text-xs shadow-lg shadow-primary-900/60 border border-primary-400/50 flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
            >
              {isSolving ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-neutral-950 border-t-transparent rounded-full animate-spin" />
                  <span>{solvingProgressText || 'Solving graph...'}</span>
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  <span>Auto-Resolve All ({missingIssues.length} missing)</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Health Gauge & Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Health Score */}
        <div className="p-4 rounded-xl bg-neutral-900/80 border border-neutral-800 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-mono text-neutral-500 uppercase">Dependency Health</div>
            <div className="text-2xl font-black font-mono mt-0.5 text-neutral-100 flex items-center gap-2">
              <span className={analysis.healthScore >= 90 ? 'text-primary-400' : analysis.healthScore >= 60 ? 'text-amber-400' : 'text-red-400'}>
                {analysis.healthScore}%
              </span>
              <span className="text-xs font-normal text-neutral-400">
                {analysis.isHealthy ? 'Stable' : 'Attention Needed'}
              </span>
            </div>
          </div>
          {analysis.isHealthy ? (
            <ShieldCheck size={28} className="text-primary-400" />
          ) : (
            <ShieldAlert size={28} className="text-amber-400 animate-pulse" />
          )}
        </div>

        {/* Missing Required Deps */}
        <div className="p-4 rounded-xl bg-neutral-900/80 border border-neutral-800">
          <div className="text-[11px] font-mono text-neutral-500 uppercase">Missing Required</div>
          <div className="text-2xl font-black font-mono mt-0.5 text-neutral-100 flex items-center gap-2">
            <span className={missingIssues.length > 0 ? 'text-amber-400' : 'text-neutral-400'}>
              {missingIssues.length}
            </span>
            <span className="text-xs text-neutral-400 font-sans">dependencies</span>
          </div>
        </div>

        {/* Incompatibility Conflicts */}
        <div className="p-4 rounded-xl bg-neutral-900/80 border border-neutral-800">
          <div className="text-[11px] font-mono text-neutral-500 uppercase">Incompatibilities</div>
          <div className="text-2xl font-black font-mono mt-0.5 text-neutral-100 flex items-center gap-2">
            <span className={conflictIssues.length > 0 ? 'text-red-400' : 'text-neutral-400'}>
              {conflictIssues.length}
            </span>
            <span className="text-xs text-neutral-400 font-sans">conflicts detected</span>
          </div>
        </div>

        {/* Total Mods Analyzed */}
        <div className="p-4 rounded-xl bg-neutral-900/80 border border-neutral-800">
          <div className="text-[11px] font-mono text-neutral-500 uppercase">Active Mods</div>
          <div className="text-2xl font-black font-mono mt-0.5 text-neutral-100 flex items-center gap-2">
            <span className="text-primary-400">
              {instance.installedMods.filter((m) => m.enabled).length}
            </span>
            <span className="text-xs text-neutral-400 font-sans">verified files</span>
          </div>
        </div>
      </div>

      {/* Critical Action Banner if missing */}
      {missingIssues.length > 0 && (
        <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-500/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-amber-200">
          <div className="flex items-center gap-3">
            <AlertTriangle size={20} className="text-amber-400 flex-shrink-0" />
            <div>
              <span className="font-bold text-neutral-100">Surface Client can fix this automatically:</span>
              <p className="text-amber-300/80 text-[11px] mt-0.5">
                We will pull official Modrinth versions for Minecraft {instance.mcVersion} and {instance.loader} loader.
              </p>
            </div>
          </div>
          <button
            onClick={handleAutoResolve}
            disabled={isSolving}
            className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-xs uppercase tracking-wider flex-shrink-0 transition-colors cursor-pointer"
          >
            Resolve Now
          </button>
        </div>
      )}

      {/* Issues Breakdown List */}
      {analysis.issues.length > 0 ? (
        <div className="space-y-3">
          <h2 className="text-xs font-mono uppercase tracking-wider text-neutral-400">
            Detected Dependency Issues ({analysis.issues.length})
          </h2>

          <div className="space-y-2">
            {analysis.issues.map((issue, idx) => (
              <div
                key={idx}
                className="p-4 rounded-xl bg-neutral-900 border border-neutral-800 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs"
              >
                <div className="flex items-start gap-3">
                  {issue.type === 'missing_required' ? (
                    <AlertTriangle size={18} className="text-amber-400 flex-shrink-0 mt-0.5" />
                  ) : issue.type === 'conflict' ? (
                    <XCircle size={18} className="text-red-400 flex-shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle size={18} className="text-yellow-400 flex-shrink-0 mt-0.5" />
                  )}

                  <div>
                    <div className="font-semibold text-neutral-100 flex items-center gap-2">
                      <span>{issue.message}</span>
                    </div>
                    <div className="text-[11px] text-neutral-500 font-mono mt-0.5">
                      Source mod: {issue.sourceMod.title} (v{issue.sourceMod.versionNumber})
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end md:self-center">
                  {issue.canAutoFix && (
                    <button
                      onClick={handleAutoResolve}
                      className="px-3 py-1.5 rounded-lg bg-primary-500 hover:bg-primary-400 text-neutral-950 font-bold text-xs flex items-center gap-1 transition-colors"
                    >
                      <Download size={13} />
                      <span>Download & Fix</span>
                    </button>
                  )}

                  {issue.type === 'conflict' && (
                    <button
                      onClick={() => handleToggleMod(issue.sourceMod.id)}
                      className="px-3 py-1.5 rounded-lg bg-red-950/80 hover:bg-red-900 border border-red-700 text-red-200 text-xs transition-colors"
                    >
                      Disable {issue.sourceMod.title}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="p-8 rounded-2xl bg-neutral-900/40 border border-neutral-800 text-center space-y-2">
          <CheckCircle2 size={36} className="mx-auto text-primary-400" />
          <h3 className="text-sm font-bold text-neutral-100">Perfect Dependency State!</h3>
          <p className="text-xs text-neutral-400 max-w-md mx-auto">
            All required APIs, libraries, and loader hooks are present. No conflicting mods or mismatched Minecraft versions found.
          </p>
        </div>
      )}

      {/* Dependency Graph & Hierarchy View */}
      <div className="space-y-3">
        <h2 className="text-xs font-mono uppercase tracking-wider text-neutral-400">
          Mod Dependency Graph & Requirements
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {analysis.nodes.map((node) => (
            <div
              key={node.modId}
              className="p-4 rounded-xl bg-neutral-900 border border-neutral-800 space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  {node.iconUrl ? (
                    <img
                      src={node.iconUrl}
                      alt={node.title}
                      className="w-7 h-7 rounded-lg object-contain bg-neutral-950 p-0.5 border border-neutral-800"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-lg bg-neutral-800 text-xs font-bold text-primary-400 flex items-center justify-center">
                      {node.title.slice(0, 2)}
                    </div>
                  )}
                  <span className="font-bold text-xs text-neutral-100">{node.title}</span>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleToggleMod(node.modId)}
                    className="p-1 text-neutral-400 hover:text-neutral-200"
                    title="Toggle Mod" aria-label="Toggle Mod"
                  >
                    <Power size={14} />
                  </button>
                  <button
                    onClick={() => handleDeleteMod(node.modId)}
                    className="p-1 text-neutral-500 hover:text-red-400"
                    title="Delete Mod" aria-label="Delete Mod"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {/* Sub-dependencies list */}
              <div className="space-y-1.5 pt-1 border-t border-neutral-800/80">
                {node.dependencies.length === 0 ? (
                  <div className="text-[11px] text-neutral-500 italic">
                    Independent (No external dependencies required)
                  </div>
                ) : (
                  node.dependencies.map((dep, dIdx) => (
                    <div
                      key={dIdx}
                      className="flex items-center justify-between text-xs font-mono px-2 py-1 rounded bg-neutral-950/60 border border-neutral-800/60"
                    >
                      <div className="flex items-center gap-1.5">
                        <ArrowRight size={12} className="text-neutral-500" />
                        <span className="text-neutral-300">{dep.title}</span>
                      </div>

                      {dep.isSatisfied ? (
                        <span className="text-[10px] text-primary-400 flex items-center gap-1">
                          <CheckCircle2 size={12} /> Satisfied
                        </span>
                      ) : (
                        <span className="text-[10px] text-amber-400 flex items-center gap-1">
                          <AlertTriangle size={12} /> Missing!
                        </span>
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* Required by */}
              {node.requiredBy.length > 0 && (
                <div className="text-[10px] text-neutral-500 font-mono">
                  Required by: <span className="text-neutral-300">{node.requiredBy.join(', ')}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
