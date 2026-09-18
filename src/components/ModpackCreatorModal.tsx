import React, { useState, useEffect } from 'react';
import {
  Package,
  Plus,
  X,
  Upload,
  Sparkles,
  Layers,
  Cpu,
  Check,
  Zap,
  Leaf,
} from 'lucide-react';
import { useEscapeKey } from '../hooks/useDismissable';
import { InstanceProfile, ModLoader, MinecraftVersion, InstalledMod } from '../types/launcher';
import { importModpackFile } from '../services/modpackService';
import { fetchOfficialMinecraftVersions, fetchDynamicLoaderVersions } from '../services/mojangApi';
import { resolveModDependency } from '../services/dependencySolver';
import { AVAILABLE_INSTANCE_ICONS } from './InstanceIcon';

interface ModpackCreatorModalProps {
  onClose: () => void;
  onCreateInstance: (instance: InstanceProfile) => void;
}

export const ModpackCreatorModal: React.FC<ModpackCreatorModalProps> = ({
  onClose,
  onCreateInstance,
}) => {
  const [tab, setTab] = useState<'scratch' | 'templates' | 'import'>('scratch');

  // Scratch Form State
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [mcVersion, setMcVersion] = useState('');
  const [loader, setLoader] = useState<ModLoader>('fabric');
  const [icon, setIcon] = useState('rocket');
  const [bannerUrl, setBannerUrl] = useState('');

  // Dynamic versions
  const [allVersions, setAllVersions] = useState<MinecraftVersion[]>([]);
  const [currentLoaderVersions, setCurrentLoaderVersions] = useState<string[]>([]);
  const [selectedLoaderVersion, setSelectedLoaderVersion] = useState<string>('');

  useEffect(() => {
    fetchOfficialMinecraftVersions().then((v) => {
      if (!v || v.length === 0) return;
      setAllVersions(v);
      // Default to whatever Mojang currently calls the latest release rather
      // than to a version number written into the source.
      setMcVersion((current) => current || v.find((entry) => entry.type === 'release')?.id || v[0].id);
    });
  }, []);

  useEffect(() => {
    fetchDynamicLoaderVersions(loader).then((versions) => {
      if (versions && versions.length > 0) {
        setCurrentLoaderVersions(versions);
        setSelectedLoaderVersion(versions[0]);
      }
    });
  }, [loader]);

  // Import State
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const loaderVersion = selectedLoaderVersion || currentLoaderVersions[0] || 'latest';

  /**
   * Starter presets. A preset is a list of Modrinth slugs, resolved against the
   * live API when it is picked, so the jars it installs are the current builds
   * for that Minecraft version rather than a snapshot frozen into the source.
   */
  const TEMPLATES = {
    performance: {
      label: 'Performance (Fabric)',
      description: 'Sodium, Lithium and Fabric API, resolved from Modrinth.',
      icon: 'zap',
      loader: 'fabric' as ModLoader,
      slugs: ['fabric-api', 'sodium', 'lithium'],
    },
    shaders: {
      label: 'Shaders (Fabric)',
      description: 'Iris and Sodium, plus the Fabric API they need.',
      icon: 'sparkles',
      loader: 'fabric' as ModLoader,
      slugs: ['fabric-api', 'sodium', 'iris'],
    },
    vanilla: {
      label: 'Vanilla',
      description: 'No loader and no mods: the game as Mojang ships it.',
      icon: 'box',
      loader: 'vanilla' as ModLoader,
      slugs: [] as string[],
    },
  };

  const [templateBusy, setTemplateBusy] = useState<string | null>(null);

  const handleSelectTemplate = async (key: keyof typeof TEMPLATES) => {
    const template = TEMPLATES[key];
    const targetVersion = mcVersion || allVersions[0]?.id;
    if (!targetVersion) {
      setImportError('Minecraft versions are still loading.');
      return;
    }

    setTemplateBusy(key);
    setImportError(null);
    try {
      const loaderVersions = await fetchDynamicLoaderVersions(template.loader, targetVersion);
      const mods = (
        await Promise.all(
          template.slugs.map((slug) => resolveModDependency(slug, targetVersion, template.loader))
        )
      ).filter((mod): mod is InstalledMod => mod !== null);

      const missing = template.slugs.length - mods.length;
      if (missing > 0) {
        setImportError(`${missing} mod(s) have no build for ${targetVersion} and were skipped.`);
      }

      const selected = allVersions.find((v) => v.id === targetVersion);
      onCreateInstance({
        id: `instance-${Date.now()}`,
        name: `${template.label} ${targetVersion}`,
        description: template.description,
        mcVersion: targetVersion,
        loader: template.loader,
        loaderVersion: loaderVersions[0] || '',
        icon: template.icon,
        memoryMinMb: 2048,
        memoryMaxMb: 4096,
        jvmArgs: '-XX:+UseG1GC',
        javaPath: 'auto',
        javaVersion: selected?.defaultJava || 21,
        resolutionWidth: 1280,
        resolutionHeight: 720,
        fullscreen: false,
        totalPlayTimeMinutes: 0,
        installedMods: mods,
      });
      onClose();
    } catch (error: any) {
      setImportError(error?.message || String(error));
    } finally {
      setTemplateBusy(null);
    }
  };

  const handleCreateScratch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const selectedVer = allVersions.find((v) => v.id === mcVersion);
    const javaVer = selectedVer?.defaultJava || 21;

    const newInstance: InstanceProfile = {
      id: `instance-${Date.now()}`,
      name: name.trim(),
      description: description.trim() || `Custom ${loader} modpack for Minecraft ${mcVersion}`,
      mcVersion,
      loader,
      loaderVersion,
      icon,
      banner: bannerUrl.trim() || undefined,
      totalPlayTimeMinutes: 0,
      memoryMinMb: 2048,
      memoryMaxMb: 4096,
      jvmArgs: '-XX:+UseG1GC -XX:+ParallelRefProcEnabled',
      javaPath: 'auto',
      javaVersion: javaVer,
      resolutionWidth: 1920,
      resolutionHeight: 1080,
      fullscreen: false,
      installedMods: [],
    };

    onCreateInstance(newInstance);
    onClose();
  };

  const handleFileDrop = async (file: File) => {
    setIsImporting(true);
    setImportError(null);
    try {
      const imported = await importModpackFile(file);
      onCreateInstance(imported);
      onClose();
    } catch (err: any) {
      setImportError(err.message || 'Failed to import modpack.');
    } finally {
      setIsImporting(false);
    }
  };

  useEscapeKey(() => {
    onClose();
  }, true);

  return (
    <div
          className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4"
          onClick={(event) => {
            // Only a click on the backdrop itself closes the dialog.
            if (event.target === event.currentTarget) onClose();
          }}
        >
      <div className="glass-heavy rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="p-5 border-b border-neutral-800 bg-neutral-950/60 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary-500/20 border border-primary-500/40 flex items-center justify-center text-primary-400">
              <Package size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-neutral-100 font-['Chakra_Petch']">
                CREATE NEW MODPACK / INSTANCE
              </h2>
              <p className="text-xs text-neutral-400">
                Setup a custom Minecraft installation or import an official Modrinth .mrpack
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 rounded-lg transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex border-b border-neutral-800 bg-neutral-950 px-5 text-xs font-semibold">
          <button
            onClick={() => setTab('scratch')}
            className={`py-3 px-4 border-b-2 transition-colors ${
              tab === 'scratch'
                ? 'border-primary-400 text-primary-300'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Custom Scratch
          </button>
          <button
            onClick={() => setTab('templates')}
            className={`py-3 px-4 border-b-2 transition-colors ${
              tab === 'templates'
                ? 'border-primary-400 text-primary-300'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Pre-configured Packs
          </button>
          <button
            onClick={() => setTab('import')}
            className={`py-3 px-4 border-b-2 transition-colors ${
              tab === 'import'
                ? 'border-primary-400 text-primary-300'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Import .mrpack / Zip
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1">
          {tab === 'scratch' && (
            <form onSubmit={handleCreateScratch} className="space-y-4 text-xs">
              <div>
                <label className="block font-mono text-neutral-400 uppercase tracking-wider mb-1.5">
                  Instance / Modpack Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Surface Speedrun 1.16.5, Survival SMP, Create Tech"
                  required
                  className="w-full px-3.5 py-2.5 bg-neutral-950 border border-neutral-700 rounded-xl text-neutral-100 focus:outline-none focus:border-primary-500 font-mono text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Minecraft Version */}
                <div>
                  <label className="block font-mono text-neutral-400 uppercase tracking-wider mb-1.5">
                    Minecraft Version
                  </label>
                  <select
                    value={mcVersion}
                    onChange={(e) => setMcVersion(e.target.value)}
                    className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded-xl text-neutral-100 font-mono focus:outline-none focus:border-primary-500 cursor-pointer"
                  >
                    {allVersions.slice(0, 35).map((v) => (
                      <option key={v.id} value={v.id} className="bg-neutral-900">
                        {v.id} ({v.type})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Mod Loader */}
                <div>
                  <label className="block font-mono text-neutral-400 uppercase tracking-wider mb-1.5">
                    Mod Loader
                  </label>
                  <select
                    value={loader}
                    onChange={(e) => setLoader(e.target.value as ModLoader)}
                    className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded-xl text-neutral-100 capitalize font-mono focus:outline-none focus:border-primary-500 cursor-pointer"
                  >
                    <option value="fabric" className="bg-neutral-900">Fabric (Recommended)</option>
                    <option value="forge" className="bg-neutral-900">Forge</option>
                    <option value="neoforge" className="bg-neutral-900">NeoForge</option>
                    <option value="quilt" className="bg-neutral-900">Quilt</option>
                    <option value="vanilla" className="bg-neutral-900">Vanilla (No Mods)</option>
                  </select>
                </div>
              </div>

              {/* Specific Loader Version (Fabric, NeoForge, Quilt, Forge) */}
              {loader !== 'vanilla' && currentLoaderVersions.length > 0 && (
                <div>
                  <label className="block font-mono text-neutral-400 uppercase tracking-wider mb-1.5">
                    {loader.toUpperCase()} Build / Version
                  </label>
                  <select
                    value={selectedLoaderVersion || currentLoaderVersions[0]}
                    onChange={(e) => setSelectedLoaderVersion(e.target.value)}
                    className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded-xl text-neutral-100 font-mono text-xs focus:outline-none focus:border-primary-500 cursor-pointer"
                  >
                    {currentLoaderVersions.map((lv, idx) => (
                      <option key={lv} value={lv} className="bg-neutral-900">
                        v{lv} {idx === 0 ? '• (Latest Stable)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Icon Selector */}
              <div>
                <label className="block font-mono text-neutral-400 uppercase tracking-wider mb-1.5">
                  Choose Icon
                </label>
                <div className="grid grid-cols-6 gap-2">
                  {AVAILABLE_INSTANCE_ICONS.map((item) => {
                    const IconComp = item.component;
                    const isSelected = icon === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setIcon(item.id)}
                        title={item.label}
                        className={`h-9 rounded-xl flex items-center justify-center border transition-all ${
                          isSelected
                            ? 'bg-primary-500/20 border-primary-400 text-primary-300 shadow-md'
                            : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-neutral-200 hover:border-neutral-700'
                        }`}
                      >
                        <IconComp size={16} />
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block font-mono text-neutral-400 uppercase tracking-wider mb-1.5">
                  Summary / Notes
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional notes or server IP..."
                  className="w-full px-3.5 py-2 bg-neutral-950 border border-neutral-700 rounded-xl text-neutral-100 focus:outline-none focus:border-primary-500 font-mono text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-neutral-400 hover:text-neutral-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!name.trim()}
                  className="px-5 py-2 rounded-xl bg-primary-500 hover:bg-primary-400 text-neutral-950 font-bold text-xs shadow-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  <Plus size={16} />
                  <span>Create Modpack</span>
                </button>
              </div>
            </form>
          )}

          {tab === 'templates' && (
            <div className="space-y-3">
              <p className="text-xs text-neutral-400">
                Each preset resolves its mods from Modrinth for{' '}
                <span className="font-mono text-primary-300">{mcVersion || '…'}</span> when you pick it.
              </p>

              {(Object.keys(TEMPLATES) as Array<keyof typeof TEMPLATES>).map((key) => (
                <button
                  key={key}
                  type="button"
                  disabled={templateBusy !== null}
                  onClick={() => handleSelectTemplate(key)}
                  className="w-full p-4 rounded-xl panel-inset glass-card-hover text-left flex items-start gap-3.5 disabled:opacity-50"
                >
                  <div className="p-2.5 rounded-xl bg-primary-500/20 border border-primary-500/40 text-primary-300">
                    <Zap size={22} />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-sm font-bold text-neutral-100">{TEMPLATES[key].label}</h3>
                    <p className="text-xs text-neutral-400 mt-1">{TEMPLATES[key].description}</p>
                  </div>
                  {templateBusy === key && (
                    <div className="w-4 h-4 border-2 border-primary-400 border-t-transparent rounded-full animate-spin mt-1" />
                  )}
                </button>
              ))}
            </div>
          )}

          {tab === 'import' && (
            <div className="space-y-4 text-center">
              {importError && (
                <div className="p-3 rounded-xl bg-red-950/50 border border-red-800 text-xs text-red-300">
                  {importError}
                </div>
              )}

              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (e.dataTransfer.files?.[0]) {
                    handleFileDrop(e.dataTransfer.files[0]);
                  }
                }}
                onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = '.mrpack,.zip,.json';
                  input.onchange = (e: any) => {
                    if (e.target.files?.[0]) handleFileDrop(e.target.files[0]);
                  };
                  input.click();
                }}
                className="border-2 border-dashed border-neutral-800 hover:border-primary-500 rounded-2xl p-8 bg-neutral-950/60 hover:bg-neutral-950 transition-all cursor-pointer group"
              >
                <Upload size={32} className="mx-auto text-neutral-500 group-hover:text-primary-400 transition-colors" />
                <div className="text-sm font-bold text-neutral-200 mt-2">
                  Drop .mrpack, .zip, or .json file here
                </div>
                <p className="text-xs text-neutral-500 mt-1 font-mono">
                  Compatible with Modrinth modpack format (.mrpack) and standard mod archive zips
                </p>
              </div>

              {isImporting && (
                <div className="flex items-center justify-center gap-2 text-xs text-primary-400 font-mono">
                  <div className="w-4 h-4 border-2 border-primary-400 border-t-transparent rounded-full animate-spin" />
                  <span>Unpacking modpack index and hashing files...</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
