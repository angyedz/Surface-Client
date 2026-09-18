import React, { useState, useEffect } from 'react';
import {
  Package,
  Plus,
  Share2,
  Trash2,
  Copy,
  Power,
  Search,
  CheckCircle2,
  AlertTriangle,
  FolderOpen,
  Sliders,
  ExternalLink,
  Sparkles,
  Download,
  FileCode,
  Edit2,
  X,
} from 'lucide-react';
import { useEscapeKey } from '../hooks/useDismissable';
import { InstanceProfile, InstalledMod } from '../types/launcher';
import { exportToMrpack, exportInstanceToJson, saveGeneratedFile } from '../services/modpackService';
import { solveAllDependencies } from '../services/dependencySolver';
import { InstanceIcon, AVAILABLE_INSTANCE_ICONS } from './InstanceIcon';

interface InstanceManagerViewProps {
  instances: InstanceProfile[];
  activeInstance?: InstanceProfile | null;
  onSelectInstance: (instance: InstanceProfile) => void;
  onUpdateInstance: (instance: InstanceProfile) => void;
  onDeleteInstance: (instanceId: string) => void;
  onDuplicateInstance: (instance: InstanceProfile) => void;
  onOpenCreator: () => void;
  onOpenModrinth: () => void;
}

export const InstanceManagerView: React.FC<InstanceManagerViewProps> = ({
  instances,
  activeInstance,
  onSelectInstance,
  onUpdateInstance,
  onDeleteInstance,
  onDuplicateInstance,
  onOpenCreator,
  onOpenModrinth,
}) => {
  const [modSearch, setModSearch] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [exportFeedback, setExportFeedback] = useState<string | null>(null);

  // Edit Instance Profile State
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editName, setEditName] = useState(activeInstance?.name || '');
  const [editDesc, setEditDesc] = useState(activeInstance?.description || '');
  const [editIcon, setEditIcon] = useState(activeInstance?.icon || 'zap');

  useEffect(() => {
    if (activeInstance) {
      setEditName(activeInstance.name);
      setEditDesc(activeInstance.description || '');
      setEditIcon(activeInstance.icon);
    }
    setIsEditingProfile(false);
  }, [activeInstance?.id]);

  const handleSaveProfileEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeInstance || !editName.trim()) return;
    onUpdateInstance({
      ...activeInstance,
      name: editName.trim(),
      description: editDesc.trim(),
      icon: editIcon,
    });
    setIsEditingProfile(false);
    setExportFeedback('Profile updated successfully!');
    setTimeout(() => setExportFeedback(null), 2500);
  };

  const handleAutoResolve = async () => {
    if (!activeInstance) return;
    setIsResolving(true);
    try {
      const solved = await solveAllDependencies(activeInstance);
      onUpdateInstance(solved.updatedInstance);
      if (solved.resolvedCount > 0) {
        setExportFeedback(`Auto-downloaded and resolved ${solved.resolvedCount} missing dependencies!`);
      } else {
        setExportFeedback('All mod dependencies are already satisfied and healthy.');
      }
      setTimeout(() => setExportFeedback(null), 3500);
    } catch (e) {
      console.error(e);
    } finally {
      setIsResolving(false);
    }
  };

  const handleToggleMod = (modId: string) => {
    if (!activeInstance) return;
    const updated = {
      ...activeInstance,
      installedMods: activeInstance.installedMods.map((m) =>
        m.id === modId ? { ...m, enabled: !m.enabled } : m
      ),
    };
    onUpdateInstance(updated);
  };

  const handleDeleteMod = (modId: string) => {
    if (!activeInstance) return;
    const updated = {
      ...activeInstance,
      installedMods: activeInstance.installedMods.filter((m) => m.id !== modId),
    };
    onUpdateInstance(updated);
  };

  // Export as .mrpack
  const handleExportMrpack = async () => {
    if (!activeInstance) return;
    setIsExporting(true);
    try {
      const blob = await exportToMrpack(activeInstance);
      const path = await saveGeneratedFile(
        blob,
        `${activeInstance.name.toLowerCase().replace(/\s+/g, '-')}.mrpack`
      );
      setExportFeedback(path ? `Saved to ${path}` : 'Exported .mrpack');
      setTimeout(() => setExportFeedback(null), 3000);
    } catch (e) {
      console.error(e);
    } finally {
      setIsExporting(false);
    }
  };

  // Export as JSON profile
  const handleExportJson = async () => {
    if (!activeInstance) return;
    const jsonStr = exportInstanceToJson(activeInstance);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const path = await saveGeneratedFile(
      blob,
      `${activeInstance.name.toLowerCase().replace(/\s+/g, '-')}-profile.json`
    );
    setExportFeedback(path ? `Saved to ${path}` : 'Exported profile JSON');
    setTimeout(() => setExportFeedback(null), 3000);
  };

  const filteredMods = (activeInstance?.installedMods || []).filter(
    (m) =>
      m.title.toLowerCase().includes(modSearch.toLowerCase()) ||
      m.slug.toLowerCase().includes(modSearch.toLowerCase()) ||
      m.fileName.toLowerCase().includes(modSearch.toLowerCase())
  );

  useEscapeKey(() => {
    setIsEditingProfile(false);
  }, isEditingProfile);

  return (
    <div className="flex-1 flex flex-col lg:flex-row h-full overflow-hidden bg-neutral-950">
      {/* Left List of Profiles / Modpacks */}
      <div className="w-full lg:w-72 bg-neutral-900/40 border-r border-neutral-800/80 p-4 flex flex-col justify-between overflow-y-auto select-none">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-mono uppercase tracking-wider text-neutral-400">
              Profiles & Modpacks ({instances.length})
            </h2>
            <button
              onClick={onOpenCreator}
              className="p-1 text-primary-400 hover:bg-neutral-800 rounded-lg transition-colors"
              title="Create New Modpack" aria-label="Create New Modpack"
            >
              <Plus size={16} />
            </button>
          </div>

          <div className="space-y-1.5">
            {instances.map((inst) => {
              const isSelected = activeInstance ? inst.id === activeInstance.id : false;
              return (
                <div
                  key={inst.id}
                  onClick={() => onSelectInstance(inst)}
                  className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between group ${
                    isSelected
                      ? 'bg-primary-900/40 border-primary-500/80 text-primary-200 shadow-md shadow-primary-900/30'
                      : 'bg-neutral-900/80 border-neutral-800/80 text-neutral-300 hover:border-neutral-700'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-neutral-950 border border-neutral-800 flex items-center justify-center flex-shrink-0">
                      <InstanceIcon icon={inst.icon} size={18} />
                    </div>
                    <div className="truncate">
                      <div className="font-bold text-xs truncate">{inst.name}</div>
                      <div className="text-[10px] text-neutral-500 font-mono">
                        {inst.mcVersion} • {inst.loader} • {inst.installedMods.length} mods
                      </div>
                    </div>
                  </div>

                  {isSelected && (
                    <span className="w-2 h-2 rounded-full bg-primary-400 flex-shrink-0 ml-1" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <button
          onClick={onOpenCreator}
          className="mt-4 w-full py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-xs font-semibold text-neutral-100 flex items-center justify-center gap-1.5 transition-colors"
        >
          <Plus size={15} />
          <span>New Modpack / Instance</span>
        </button>
      </div>

      {/* Right Area: Selected Instance Mod List & Export Manager */}
      {activeInstance ? (
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Instance Header Banner */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-2xl bg-neutral-900 border border-neutral-800">
          <div className="flex items-center gap-3.5">
            <div className="p-3 bg-neutral-950 rounded-xl border border-neutral-800 shadow-lg flex items-center justify-center">
              <InstanceIcon icon={activeInstance.icon} size={28} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-neutral-100 font-['Chakra_Petch']">
                  {activeInstance.name}
                </h1>
                <span className="px-2 py-0.5 rounded bg-neutral-800 text-[11px] font-mono text-primary-400 font-semibold uppercase">
                  {activeInstance.loader} {activeInstance.mcVersion}
                </span>
              </div>
              <p className="text-xs text-neutral-400 mt-0.5">
                {activeInstance.description || 'Custom Minecraft modpack'}
              </p>
            </div>
          </div>

          {/* Action Buttons for this Instance */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleExportMrpack}
              disabled={isExporting}
              className="px-3.5 py-2 rounded-xl bg-primary-500 hover:bg-primary-400 text-neutral-950 font-bold text-xs flex items-center gap-1.5 transition-colors shadow-md shadow-primary-900 cursor-pointer disabled:opacity-50"
              title="Export as standard Modrinth Modpack format" aria-label="Export as standard Modrinth Modpack format"
            >
              <Share2 size={14} />
              <span>{isExporting ? 'Exporting...' : 'Export .mrpack'}</span>
            </button>

            <button
              onClick={() => setIsEditingProfile(true)}
              className="px-3.5 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-xs font-semibold text-neutral-200 flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Edit Profile Name, Description, and Icon" aria-label="Edit Profile Name, Description, and Icon"
            >
              <Edit2 size={14} />
              <span>Edit</span>
            </button>

            <button
              onClick={handleExportJson}
              className="px-3.5 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-xs font-semibold text-neutral-200 flex items-center gap-1.5 transition-colors"
              title="Backup instance profile as JSON" aria-label="Backup instance profile as JSON"
            >
              <FileCode size={14} />
              <span>Export JSON</span>
            </button>

            <button
              onClick={() => onDuplicateInstance(activeInstance)}
              className="p-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-300 transition-colors"
              title="Duplicate / Clone Profile" aria-label="Duplicate / Clone Profile"
            >
              <Copy size={16} />
            </button>

            {instances.length > 1 && (
              <button
                onClick={() => onDeleteInstance(activeInstance.id)}
                className="p-2 rounded-xl bg-red-950/40 hover:bg-red-900 border border-red-800 text-red-300 transition-colors"
                title="Delete Profile" aria-label="Delete Profile"
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
        </div>

        {exportFeedback && (
          <div className="p-3 rounded-xl bg-primary-900/60 border border-primary-900 text-xs text-primary-300 flex items-center gap-2">
            <CheckCircle2 size={16} className="text-primary-400" />
            <span>{exportFeedback}</span>
          </div>
        )}

        {/* Installed Mods Management Bar */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Package size={16} className="text-primary-400" />
              <h2 className="text-sm font-bold text-neutral-200 uppercase tracking-wider font-mono">
                Installed Mods ({activeInstance.installedMods.length})
              </h2>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleAutoResolve}
                disabled={isResolving}
                className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-xs font-medium text-amber-300 flex items-center gap-1.5 transition-colors disabled:opacity-50"
                title="Automatically scan and download missing required mod dependencies" aria-label="Automatically scan and download missing required mod dependencies"
              >
                {isResolving ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                    <span>Resolving...</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={14} />
                    <span>Auto-Download Dependencies</span>
                  </>
                )}
              </button>

              <button
                onClick={onOpenModrinth}
                className="px-3.5 py-1.5 rounded-lg bg-primary-500/20 hover:bg-primary-500/30 border border-primary-500/40 text-primary-300 text-xs font-bold flex items-center gap-1.5 transition-colors"
              >
                <Plus size={14} />
                <span>Add from Modrinth</span>
              </button>
            </div>
          </div>

          {/* Search bar inside installed mods */}
          <div className="relative">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500" />
            <input
              type="text"
              value={modSearch}
              onChange={(e) => setModSearch(e.target.value)}
              placeholder="Filter installed mods by name or jar filename..."
              className="w-full pl-9 pr-4 py-2 bg-neutral-900 border border-neutral-800 rounded-xl text-xs text-neutral-100 placeholder-neutral-500 font-mono focus:outline-none focus:border-primary-500"
            />
          </div>

          {/* Mods Table */}
          {filteredMods.length === 0 ? (
            <div className="p-10 rounded-2xl bg-neutral-900/40 border border-neutral-800 text-center space-y-3">
              <Package size={36} className="mx-auto text-neutral-600" />
              <div className="text-sm font-bold text-neutral-300">No mods installed in this profile</div>
              <p className="text-xs text-neutral-500 max-w-sm mx-auto">
                Open Modrinth Store to browse thousands of mods with automatic dependency resolution.
              </p>
              <button
                onClick={onOpenModrinth}
                className="px-4 py-2 rounded-lg bg-primary-500 hover:bg-primary-400 text-neutral-950 font-bold text-xs transition-colors inline-block"
              >
                Browse Modrinth Catalog
              </button>
            </div>
          ) : (
            <div className="border border-neutral-800 rounded-2xl overflow-hidden bg-neutral-900/60 divide-y divide-neutral-800/80">
              {filteredMods.map((mod) => (
                <div
                  key={mod.id}
                  className={`p-3.5 flex items-center justify-between gap-3 transition-colors ${
                    mod.enabled ? 'hover:bg-neutral-800/40' : 'bg-neutral-950/50 opacity-60'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {mod.iconUrl ? (
                      <img
                        src={mod.iconUrl}
                        alt={mod.title}
                        className="w-9 h-9 rounded-lg object-contain bg-neutral-950 p-0.5 border border-neutral-800 flex-shrink-0"
                      />
                    ) : (
                      <div className="w-9 h-9 rounded-lg bg-neutral-800 flex items-center justify-center text-xs font-bold text-primary-400 flex-shrink-0">
                        {mod.title.slice(0, 2)}
                      </div>
                    )}

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-neutral-100 truncate">{mod.title}</span>
                        <span className="text-[10px] font-mono text-neutral-400 bg-neutral-950 px-1.5 py-0.2 rounded border border-neutral-800">
                          v{mod.versionNumber}
                        </span>
                      </div>
                      <div className="text-[11px] text-neutral-400 font-mono truncate mt-0.5">
                        {mod.fileName} • {((mod.fileSize || 1024000) / 1024 / 1024).toFixed(2)} MB
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggleMod(mod.id)}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                        mod.enabled
                          ? 'bg-primary-900/60 text-primary-400 border border-primary-900'
                          : 'bg-neutral-800 text-neutral-400'
                      }`}
                      title={mod.enabled ? 'Disable Mod' : 'Enable Mod'}
                    >
                      <Power size={12} />
                      <span>{mod.enabled ? 'Enabled' : 'Disabled'}</span>
                    </button>

                    <button
                      onClick={() => handleDeleteMod(mod.id)}
                      className="p-1.5 rounded-lg text-neutral-500 hover:text-red-400 hover:bg-neutral-800 transition-colors"
                      title="Remove Mod from Instance" aria-label="Remove Mod from Instance"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-6 flex items-center justify-center select-none font-['Plus_Jakarta_Sans',sans-serif]">
          <div className="max-w-md w-full p-8 rounded-2xl bg-neutral-900/60 border border-neutral-800 text-center space-y-4">
            <Package size={40} className="mx-auto text-neutral-600" />
            <h3 className="text-base font-bold text-neutral-200">No Profile Selected</h3>
            <p className="text-xs text-neutral-400 leading-relaxed">
              Create a new Minecraft profile to start managing mods, resolving dependencies, and exporting packs.
            </p>
            <button
              onClick={onOpenCreator}
              className="px-5 py-2.5 rounded-xl bg-primary-500 hover:bg-primary-400 text-neutral-950 font-bold text-xs shadow-lg transition-colors cursor-pointer inline-flex items-center gap-2"
            >
              <Plus size={16} />
              <span>Create New Profile</span>
            </button>
          </div>
        </div>
      )}

      {/* Edit Profile Modal */}
      {isEditingProfile && (
        <div
          className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4"
          onClick={(event) => {
            // Only a click on the backdrop itself closes the dialog.
            if (event.target === event.currentTarget) setIsEditingProfile(false);
          }}
        >
          <div className="glass-heavy rounded-2xl w-full max-w-md p-6 shadow-2xl animate-in zoom-in-95 duration-150 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <h3 className="text-sm font-bold text-neutral-100 flex items-center gap-2">
                <Edit2 size={16} className="text-primary-400" />
                <span>Edit Profile Settings</span>
              </h3>
              <button
                onClick={() => setIsEditingProfile(false)}
                className="text-neutral-400 hover:text-neutral-200 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveProfileEdit} className="space-y-4">
              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-neutral-400 mb-1.5">
                  Instance Name
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                  placeholder="e.g. My Survival SMP"
                  className="w-full px-3.5 py-2 bg-neutral-950 border border-neutral-700 rounded-xl text-xs text-neutral-100 focus:outline-none focus:border-primary-500"
                />
              </div>

              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-neutral-400 mb-1.5">
                  Description / Notes
                </label>
                <textarea
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  rows={2}
                  placeholder="Custom modpack notes or description..."
                  className="w-full px-3.5 py-2 bg-neutral-950 border border-neutral-700 rounded-xl text-xs text-neutral-100 focus:outline-none focus:border-primary-500 resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-neutral-400 mb-1.5">
                  Icon
                </label>
                <div className="grid grid-cols-6 gap-2">
                  {AVAILABLE_INSTANCE_ICONS.map((item) => {
                    const IconComp = item.component;
                    const isSelected = editIcon === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setEditIcon(item.id)}
                        className={`h-9 rounded-xl flex items-center justify-center border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-primary-500/20 border-primary-400 text-primary-300'
                            : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-neutral-200'
                        }`}
                        title={item.label}
                      >
                        <IconComp size={16} />
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-800">
                <button
                  type="button"
                  onClick={() => setIsEditingProfile(false)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-neutral-400 hover:text-neutral-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-primary-500 hover:bg-primary-400 text-neutral-950 font-bold text-xs shadow-md transition-colors cursor-pointer"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
