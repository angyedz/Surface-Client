import React, { useEffect, useMemo, useState } from 'react';
import { Box, Search, Trash2, Power, FolderOpen } from 'lucide-react';
import { InstanceProfile, InstalledMod } from '../types/launcher';
import { listInstanceModFiles, openInstanceFolder } from '../services/launcherCore';

interface InstalledModsViewProps {
  instance?: InstanceProfile | null;
  onUpdateInstance: (instance: InstanceProfile) => void;
  onUninstall: (id: string) => void;
}

export const InstalledModsView: React.FC<InstalledModsViewProps> = ({ instance, onUpdateInstance, onUninstall }) => {
  const [query, setQuery] = useState('');
  const [folderError, setFolderError] = useState('');
  const [diskFiles, setDiskFiles] = useState<string[]>([]);
  useEffect(() => {
    if (!instance) { setDiskFiles([]); return; }
    listInstanceModFiles(instance.id).then(setDiskFiles).catch(() => setDiskFiles([]));
  }, [instance?.id, instance?.installedMods]);
  const managedFiles = new Set((instance?.installedMods || []).map((mod) => mod.fileName));
  const externalFiles = diskFiles.filter((file) => !managedFiles.has(file) && !managedFiles.has(file.replace(/\.disabled$/, '')));
  const mods = useMemo(() => {
    const value = query.trim().toLowerCase();
    return (instance?.installedMods || []).filter((mod) =>
      !value || [mod.title, mod.slug, mod.versionNumber, mod.author].join(' ').toLowerCase().includes(value)
    );
  }, [instance?.installedMods, query]);

  const toggleMod = (mod: InstalledMod) => {
    if (!instance) return;
    onUpdateInstance({
      ...instance,
      installedMods: instance.installedMods.map((item) => item.id === mod.id ? { ...item, enabled: !item.enabled } : item),
    });
  };

  const handleOpenModsFolder = async () => {
    if (!instance) return;
    try {
      await openInstanceFolder(instance.id, 'mods');
      setFolderError('');
    } catch (error) {
      setFolderError(String(error));
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-neutral-950 p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-neutral-100">Installed Mods</h1>
          <p className="text-xs text-neutral-500 mt-1">{instance ? `${instance.name} · Minecraft ${instance.mcVersion}` : 'Select an instance first'}</p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button type="button" onClick={handleOpenModsFolder} disabled={!instance} className="px-3 py-2.5 rounded-xl bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 disabled:opacity-40 text-xs text-neutral-300 flex items-center gap-2 transition-colors" title="Open mods folder">
            <FolderOpen size={14} />
            <span className="hidden md:inline">Open mods folder</span>
          </button>
          <div className="relative w-full sm:w-72">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search installed mods…" className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-neutral-900 border border-neutral-800 text-xs text-neutral-100 outline-none focus:border-neutral-500" />
          </div>
        </div>
      </div>
      {folderError && <p className="text-xs text-red-300">Could not open mods folder: {folderError}</p>}
      {externalFiles.length > 0 && <div className="rounded-2xl border border-amber-900/60 bg-amber-950/20 p-4"><p className="text-xs font-semibold text-amber-200">Mods found in folder but not in the launcher list</p><div className="mt-2 space-y-1">{externalFiles.map((file) => <div key={file} className="text-[11px] font-mono text-amber-100/80">{file}</div>)}</div></div>}

      {!instance || mods.length === 0 ? (
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 py-20 text-center">
          <Box size={34} className="mx-auto text-neutral-600" />
          <p className="text-sm text-neutral-300 mt-3">{instance ? 'No installed mods match this search.' : 'No instance selected.'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {mods.map((mod) => (
            <div key={mod.id} className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4 flex gap-3">
              {mod.iconUrl ? <img src={mod.iconUrl} alt="" className="w-12 h-12 rounded-xl object-cover bg-neutral-950" /> : <div className="w-12 h-12 rounded-xl bg-neutral-800 flex items-center justify-center text-neutral-400"><Box size={20} /></div>}
              <div className="min-w-0 flex-1">
                <div className="flex justify-between gap-2"><h2 className="font-semibold text-sm text-neutral-100 truncate">{mod.title}</h2><span className={`text-[10px] ${mod.enabled ? 'text-emerald-300' : 'text-neutral-500'}`}>{mod.enabled ? 'ON' : 'OFF'}</span></div>
                <p className="text-[11px] text-neutral-500 truncate">{mod.versionNumber} · {mod.author || 'Unknown author'}</p>
                <div className="flex gap-1.5 mt-3">
                  <button onClick={() => toggleMod(mod)} className="px-2 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-[11px] text-neutral-300 flex items-center gap-1"><Power size={12} /> {mod.enabled ? 'Disable' : 'Enable'}</button>
                  <button onClick={() => onUninstall(mod.id)} className="p-1.5 rounded-lg bg-neutral-800 hover:bg-red-950 text-neutral-400 hover:text-red-300" title="Uninstall mod"><Trash2 size={13} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
