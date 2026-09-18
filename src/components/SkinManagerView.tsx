import React, { useState } from 'react';
import {
  Shirt,
  Upload,
  Search,
  Check,
  Download,
  Sparkles,
  Trash2,
  User,
  Layers,
  Palette,
  AlertCircle,
} from 'lucide-react';
import { SkinProfile } from '../types/launcher';
import { SkinCanvas3D } from './SkinCanvas3D';
import { fetchSkinByUsername, processSkinUpload } from '../services/skinService';

interface SkinManagerViewProps {
  skins: SkinProfile[];
  onSaveSkins: (skins: SkinProfile[]) => void;
  onSetActiveSkin: (skin: SkinProfile) => void;
  activeUsername: string;
}

export const SkinManagerView: React.FC<SkinManagerViewProps> = ({
  skins,
  onSaveSkins,
  onSetActiveSkin,
  activeUsername,
}) => {
  const activeSkin = skins.find((s) => s.active) || skins[0];

  const [currentModel, setCurrentModel] = useState<'classic' | 'slim'>(activeSkin?.model || 'classic');
  const [currentSkinUrl, setCurrentSkinUrl] = useState<string>(activeSkin?.skinUrl || '');
  const [currentCapeUrl, setCurrentCapeUrl] = useState<string | undefined>(activeSkin?.capeUrl);
  const [currentCapeName, setCurrentCapeName] = useState<string>(activeSkin?.capeName || 'None');
  const [skinName, setSkinName] = useState<string>(activeSkin?.name || 'Custom Skin');

  const [usernameInput, setUsernameInput] = useState('');
  const [isFetchingUser, setIsFetchingUser] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isSuccessFeedback, setIsSuccessFeedback] = useState(false);

  // Apply to current active skin profile
  const handleApplyChanges = () => {
    const updatedSkins = skins.map((s) =>
      s.id === activeSkin.id
        ? {
            ...s,
            name: skinName,
            model: currentModel,
            skinUrl: currentSkinUrl,
            capeUrl: currentCapeUrl,
            capeName: currentCapeName,
          }
        : s
    );
    onSaveSkins(updatedSkins);
    setIsSuccessFeedback(true);
    setTimeout(() => setIsSuccessFeedback(false), 2500);
  };

  // Save as new preset
  const handleSaveAsNew = () => {
    const newSkin: SkinProfile = {
      id: `skin-${Date.now()}`,
      name: skinName || 'My New Skin',
      model: currentModel,
      skinUrl: currentSkinUrl,
      capeUrl: currentCapeUrl,
      capeName: currentCapeName,
      isLocal: true,
      active: true,
    };
    const updated = skins.map((s) => ({ ...s, active: false })).concat(newSkin);
    onSaveSkins(updated);
    onSetActiveSkin(newSkin);
    setIsSuccessFeedback(true);
    setTimeout(() => setIsSuccessFeedback(false), 2500);
  };

  // Switch active preset
  const handleSelectPreset = (skin: SkinProfile) => {
    setCurrentModel(skin.model);
    setCurrentSkinUrl(skin.skinUrl);
    setCurrentCapeUrl(skin.capeUrl);
    setCurrentCapeName(skin.capeName || 'None');
    setSkinName(skin.name);
    onSetActiveSkin(skin);
  };

  // Delete preset
  const handleDeletePreset = (skinId: string) => {
    if (skins.length <= 1) return;
    const remaining = skins.filter((s) => s.id !== skinId);
    if (remaining.length > 0 && !remaining.some((s) => s.active)) {
      remaining[0].active = true;
    }
    onSaveSkins(remaining);
  };

  // Fetch skin by username
  const handleFetchUsername = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!usernameInput.trim()) return;
    setIsFetchingUser(true);
    setUploadError(null);
    try {
      const res = await fetchSkinByUsername(usernameInput.trim());
      setCurrentSkinUrl(res.skinUrl);
      setSkinName(`${usernameInput.trim()}'s Skin`);
      setCurrentModel(res.model);
    } catch (err: any) {
      setUploadError(err.message || 'Failed to fetch player skin.');
    } finally {
      setIsFetchingUser(false);
    }
  };

  // Handle local PNG drag-and-drop or file upload
  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    setUploadError(null);
    try {
      const result = await processSkinUpload(file);
      setCurrentSkinUrl(result.dataUrl);
      setSkinName(file.name.replace(/\.[^/.]+$/, ''));
      if (result.isSlimHint) {
        setCurrentModel('slim');
      }
    } catch (err: any) {
      setUploadError(err.message || 'Invalid skin file.');
    }
  };

  return (
    <div className="flex-1 flex flex-col lg:flex-row h-full overflow-hidden bg-neutral-950">
      {/* Left Area: 3D Interactive Canvas */}
      <div className="w-full lg:w-[420px] bg-neutral-900/40 border-r border-neutral-800/80 p-6 flex flex-col justify-between items-center select-none relative">
        <div className="w-full flex items-center justify-between text-xs font-mono text-neutral-400 pb-2">
          <span className="flex items-center gap-1.5 text-neutral-300">
            <Shirt size={14} className="text-primary-400" />
            <span>Interactive 3D Preview</span>
          </span>
          <span>Click & Drag to Rotate</span>
        </div>

        {/* 3D Skin Renderer */}
        <div className="w-full flex-1 flex items-center justify-center min-h-[360px]">
          <SkinCanvas3D
            skinUrl={currentSkinUrl}
            capeUrl={currentCapeUrl}
            model={currentModel}
            showLayers={true}
            autoRotate={true}
          />
        </div>

        {/* Skin Status Info */}
        <div className="w-full p-3 rounded-xl bg-neutral-900 border border-neutral-800 text-xs flex items-center justify-between">
          <div>
            <div className="font-bold text-neutral-100">{skinName}</div>
            <div className="text-[11px] text-neutral-400 font-mono">
              Model: <span className="capitalize text-primary-400">{currentModel}</span> • Cape: {currentCapeName}
            </div>
          </div>

          <button
            onClick={handleApplyChanges}
            className="px-3 py-1.5 rounded-lg bg-primary-500 hover:bg-primary-400 text-neutral-950 font-bold text-xs flex items-center gap-1 transition-colors"
          >
            {isSuccessFeedback ? (
              <>
                <Check size={14} />
                <span>Applied!</span>
              </>
            ) : (
              <span>Apply Skin</span>
            )}
          </button>
        </div>
      </div>

      {/* Right Area: Skin Controls, Import & Library */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Top Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-neutral-800">
              <div>
                <h1 className="text-xl font-bold text-neutral-100 font-['Chakra_Petch']">
                  SKIN STUDIO & CLOAKROOM
                </h1>
                <p className="text-xs text-neutral-400">
                  Customize your Minecraft avatar, load skins by nickname, upload textures, and attach capes.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleSaveAsNew}
                  className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-xs font-semibold text-neutral-200 transition-colors cursor-pointer"
                >
                  Save as New Preset
                </button>
              </div>
            </div>

            {uploadError && (
              <div className="p-3 rounded-xl bg-red-950/40 border border-red-800 text-xs text-red-300 flex items-center gap-2">
                <AlertCircle size={16} className="text-red-400 flex-shrink-0" />
                <span>{uploadError}</span>
              </div>
            )}

        {/* Section 1: Model Arm Type */}
        <div className="space-y-2">
          <label className="text-xs font-mono uppercase tracking-wider text-neutral-400">
            Player Model Format
          </label>
          <div className="grid grid-cols-2 gap-3 max-w-sm">
            <button
              type="button"
              onClick={() => setCurrentModel('classic')}
              className={`p-3 rounded-xl border text-xs font-semibold flex flex-col items-center gap-1 transition-all ${
                currentModel === 'classic'
                  ? 'bg-primary-500/20 border-primary-500 text-primary-300 shadow-md'
                  : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <span className="font-bold text-sm">Classic (Steve)</span>
              <span className="text-[10px] font-mono text-neutral-500">4-pixel arms (Standard)</span>
            </button>

            <button
              type="button"
              onClick={() => setCurrentModel('slim')}
              className={`p-3 rounded-xl border text-xs font-semibold flex flex-col items-center gap-1 transition-all ${
                currentModel === 'slim'
                  ? 'bg-primary-500/20 border-primary-500 text-primary-300 shadow-md'
                  : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <span className="font-bold text-sm">Slim (Alex)</span>
              <span className="text-[10px] font-mono text-neutral-500">3-pixel arms (Fitted)</span>
            </button>
          </div>
        </div>

        {/* Section 2: Import Skin by Minecraft Nickname */}
        <div className="space-y-2">
          <label className="text-xs font-mono uppercase tracking-wider text-neutral-400">
            Load Skin by Minecraft Username
          </label>
          <form onSubmit={handleFetchUsername} className="flex gap-2 max-w-md">
            <div className="relative flex-1">
              <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
              <input
                type="text"
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value)}
                placeholder="e.g. Notch, Technoblade, Mumbo..."
                className="w-full pl-9 pr-3 py-2 bg-neutral-900 border border-neutral-700/80 rounded-xl text-xs text-neutral-100 placeholder-neutral-500 font-mono focus:outline-none focus:border-primary-500"
              />
            </div>
            <button
              type="submit"
              disabled={isFetchingUser || !usernameInput.trim()}
              className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-xs font-semibold text-neutral-100 rounded-xl transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              {isFetchingUser ? (
                <div className="w-3.5 h-3.5 border-2 border-primary-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <Search size={14} />
              )}
              <span>Fetch Skin</span>
            </button>
          </form>
        </div>

        {/* Section 3: Upload Custom Skin PNG */}
        <div className="space-y-2">
          <label className="text-xs font-mono uppercase tracking-wider text-neutral-400">
            Upload Custom Skin File (PNG 64x64 or 64x32)
          </label>
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              handleFileUpload(e.dataTransfer.files);
            }}
            className="border-2 border-dashed border-neutral-800 hover:border-primary-500/60 rounded-2xl p-6 text-center bg-neutral-900/40 hover:bg-neutral-900/70 transition-all cursor-pointer group"
            onClick={() => {
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = 'image/png';
              input.onchange = (e: any) => handleFileUpload(e.target.files);
              input.click();
            }}
          >
            <Upload size={28} className="mx-auto text-neutral-500 group-hover:text-primary-400 transition-colors" />
            <div className="text-xs font-semibold text-neutral-300 mt-2">
              Drop skin PNG here or click to browse
            </div>
            <p className="text-[11px] text-neutral-500 font-mono mt-1">
              Supports modern 64x64 and legacy 64x32 Minecraft Java formats
            </p>
          </div>
        </div>

        {/* Section 4: cape selection */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-mono uppercase tracking-wider text-neutral-400">
              Cape
            </label>
            <span className="text-[10px] font-mono text-primary-400 bg-primary-500/10 px-2 py-0.5 rounded-full border border-primary-500/20">
              Active: {currentCapeName}
            </span>
          </div>

          {/* A cape is part of the Mojang account or a local PNG the user picks;
              the launcher has no catalogue of its own to offer. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => {
                setCurrentCapeUrl(undefined);
                setCurrentCapeName('None');
              }}
              className={`p-2.5 rounded-xl border text-xs text-left transition-all flex items-center justify-between ${
                !currentCapeUrl
                  ? 'bg-primary-900/40 border-primary-500 text-primary-300'
                  : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <span className="font-medium">No cape</span>
              {!currentCapeUrl && <Check size={14} className="text-primary-400 flex-shrink-0" />}
            </button>

            <label className="p-2.5 rounded-xl border border-neutral-800 bg-neutral-900 text-xs text-neutral-400 hover:text-neutral-200 cursor-pointer flex items-center justify-between">
              <span className="font-medium truncate">Use a cape image (.png)</span>
              <input
                type="file"
                accept="image/png"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = () => {
                    setCurrentCapeUrl(String(reader.result));
                    setCurrentCapeName(file.name.replace(/\.png$/i, ''));
                  };
                  reader.readAsDataURL(file);
                }}
              />
            </label>
          </div>
        </div>

        {/* Section 5: Saved Skins Library */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-mono uppercase tracking-wider text-neutral-400">
              Saved Skins Library ({skins.length})
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {skins.map((skin) => (
              <div
                key={skin.id}
                className={`p-3 rounded-xl border transition-all flex items-center justify-between ${
                  skin.active
                    ? 'bg-primary-900/30 border-primary-500/60 text-primary-200'
                    : 'bg-neutral-900 border-neutral-800 text-neutral-300 hover:border-neutral-700'
                }`}
              >
                <div
                  onClick={() => handleSelectPreset(skin)}
                  className="flex items-center gap-3 cursor-pointer min-w-0 flex-1"
                >
                  <img
                    src={skin.skinUrl}
                    alt={skin.name}
                    className="w-9 h-9 rounded-lg object-cover bg-neutral-950 border border-neutral-800"
                  />
                  <div className="truncate">
                    <div className="text-xs font-semibold truncate">{skin.name}</div>
                    <div className="text-[10px] text-neutral-500 font-mono capitalize">
                      {skin.model} • {skin.capeName || 'No Cape'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 ml-2">
                  {skin.active ? (
                    <span className="text-[10px] font-mono text-primary-400 font-bold px-2 py-0.5 rounded bg-primary-900/40 border border-primary-900">
                      ACTIVE
                    </span>
                  ) : (
                    <button
                      onClick={() => handleSelectPreset(skin)}
                      className="px-2.5 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-[11px] font-medium text-neutral-200 transition-colors"
                    >
                      Use
                    </button>
                  )}

                  {skins.length > 1 && (
                    <button
                      onClick={() => handleDeletePreset(skin.id)}
                      className="p-1.5 text-neutral-500 hover:text-red-400 transition-colors"
                      title="Delete Preset" aria-label="Delete Preset"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
