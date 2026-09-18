import React, { useState, useEffect } from 'react';
import {
  Keyboard,
  RotateCcw,
  Search,
  AlertTriangle,
  Check,
  Edit2,
  X,
  Command,
  Info,
} from 'lucide-react';
import { KeybindingItem } from '../types/launcher';
import { DEFAULT_KEYBINDINGS } from '../config/keybindings';

interface KeybindingsManagerProps {
  keybindings: KeybindingItem[];
  onUpdateKeybindings: (updated: KeybindingItem[]) => void;
}

export const KeybindingsManager: React.FC<KeybindingsManagerProps> = ({
  keybindings,
  onUpdateKeybindings,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [recordedKeys, setRecordedKeys] = useState<string[]>([]);
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Helper to format key names
  const normalizeKey = (e: KeyboardEvent): string | null => {
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
      return null;
    }
    if (e.key === ' ') return 'Space';
    if (e.key === '`') return '`';
    if (e.key.length === 1) return e.key.toUpperCase();
    return e.key;
  };

  // Keyboard capture event listener
  useEffect(() => {
    if (!recordingId) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === 'Escape') {
        setRecordingId(null);
        setRecordedKeys([]);
        setConflictWarning(null);
        return;
      }

      const keys: string[] = [];
      if (e.ctrlKey || e.metaKey) keys.push('Ctrl');
      if (e.altKey) keys.push('Alt');
      if (e.shiftKey) keys.push('Shift');

      const primary = normalizeKey(e);
      if (primary) {
        keys.push(primary);
        // Check for conflicts
        const conflict = keybindings.find(
          (k) =>
            k.id !== recordingId &&
            k.keys.length === keys.length &&
            k.keys.every((val, idx) => val.toLowerCase() === keys[idx].toLowerCase())
        );

        if (conflict) {
          setConflictWarning(`Shortcut already used by "${conflict.name}"`);
        } else {
          setConflictWarning(null);
        }

        setRecordedKeys(keys);
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, [recordingId, keybindings]);

  const handleApplyRecorded = () => {
    if (!recordingId || recordedKeys.length === 0) return;

    const updated = keybindings.map((item) =>
      item.id === recordingId ? { ...item, keys: recordedKeys } : item
    );

    onUpdateKeybindings(updated);
    setRecordingId(null);
    setRecordedKeys([]);
    setConflictWarning(null);
    setStatusMessage('Keybinding updated successfully.');
    setTimeout(() => setStatusMessage(null), 2500);
  };

  const handleResetSingle = (id: string) => {
    const original = DEFAULT_KEYBINDINGS.find((d) => d.id === id);
    if (!original) return;

    const updated = keybindings.map((item) =>
      item.id === id ? { ...item, keys: [...original.defaultKeys] } : item
    );
    onUpdateKeybindings(updated);
    setStatusMessage(`Reset to default: ${original.defaultKeys.join(' + ')}`);
    setTimeout(() => setStatusMessage(null), 2500);
  };

  const handleResetAll = () => {
    onUpdateKeybindings(DEFAULT_KEYBINDINGS);
    setStatusMessage('All keybindings reset to launcher defaults.');
    setTimeout(() => setStatusMessage(null), 2500);
  };

  const categories = ['all', 'Game & Launch', 'Navigation', 'Tools & Display'];

  const filteredKeybindings = keybindings.filter((item) => {
    const matchesCategory =
      selectedCategory === 'all' || item.category === selectedCategory;
    const matchesSearch =
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.keys.join(' ').toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Top Banner & Action Controls */}
      <div className="p-5 rounded-2xl bg-neutral-900 border border-neutral-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-primary-600/20 border border-primary-600/40 flex items-center justify-center text-primary-400">
            <Keyboard size={24} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-neutral-100 font-['Chakra_Petch'] flex items-center gap-2">
              <span>KEYBOARD SHORTCUTS & INPUT CONTROLS</span>
            </h2>
            <p className="text-xs text-neutral-400">
              Customize launcher global hotkeys for instant console toggle, quick launch, navigation, and screenshots.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {statusMessage && (
            <div className="text-xs font-mono text-primary-400 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-900/50 border border-primary-900">
              <Check size={14} />
              <span>{statusMessage}</span>
            </div>
          )}
          <button
            onClick={handleResetAll}
            className="px-3.5 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-xs font-semibold text-neutral-300 hover:text-neutral-100 flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RotateCcw size={14} />
            <span>Reset All Defaults</span>
          </button>
        </div>
      </div>

      {/* Search & Category Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search shortcut name or action..."
            className="w-full pl-9 pr-8 py-2 bg-neutral-900/80 border border-neutral-800 rounded-xl text-xs text-neutral-100 focus:outline-none focus:border-primary-600 placeholder-neutral-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                selectedCategory === cat
                  ? 'bg-primary-600/20 border border-primary-600/50 text-primary-300'
                  : 'bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-neutral-200'
              }`}
            >
              {cat === 'all' ? 'All Shortcuts' : cat}
            </button>
          ))}
        </div>
      </div>

      {/* Recording Dialog / Overlay banner when actively capturing keys */}
      {recordingId && (
        <div className="p-4 rounded-xl bg-primary-900/40 border border-primary-600/60 shadow-lg shadow-primary-900/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in duration-150">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-bold text-primary-300">
              <Command size={16} className="animate-pulse" />
              <span>Recording New Keybinding...</span>
            </div>
            <p className="text-xs text-neutral-300">
              Press the desired combination on your keyboard (e.g. <span className="font-mono text-primary-200">F12</span>, <span className="font-mono text-primary-200">Ctrl + M</span>, <span className="font-mono text-primary-200">F5</span>). Press <span className="font-mono text-amber-300">Esc</span> to cancel.
            </p>
            {conflictWarning && (
              <div className="flex items-center gap-1.5 text-xs text-amber-400 font-medium pt-1">
                <AlertTriangle size={14} />
                <span>{conflictWarning}</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-neutral-900 px-3 py-1.5 rounded-lg border border-primary-600/50 font-mono text-xs text-neutral-100">
              {recordedKeys.length > 0 ? (
                recordedKeys.map((k, idx) => (
                  <React.Fragment key={k + idx}>
                    <kbd className="px-2 py-0.5 rounded bg-neutral-800 text-primary-300 font-bold border border-neutral-700">
                      {k}
                    </kbd>
                    {idx < recordedKeys.length - 1 && <span className="text-neutral-500">+</span>}
                  </React.Fragment>
                ))
              ) : (
                <span className="text-neutral-400 italic">Waiting for keys...</span>
              )}
            </div>

            <button
              onClick={handleApplyRecorded}
              disabled={recordedKeys.length === 0}
              className="px-3.5 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-400 text-neutral-950 font-bold text-xs transition-colors disabled:opacity-50 flex items-center gap-1 cursor-pointer"
            >
              <Check size={14} />
              <span>Save</span>
            </button>

            <button
              onClick={() => {
                setRecordingId(null);
                setRecordedKeys([]);
                setConflictWarning(null);
              }}
              className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Keybindings Table */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 overflow-hidden shadow-xl">
        <div className="divide-y divide-neutral-800/80">
          {filteredKeybindings.map((item) => {
            const isRecordingThis = recordingId === item.id;
            const isModified =
              item.keys.join(',') !== item.defaultKeys.join(',');

            return (
              <div
                key={item.id}
                className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors ${
                  isRecordingThis
                    ? 'bg-primary-900/20'
                    : 'hover:bg-neutral-800/40'
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-neutral-100 font-mono">
                      {item.name}
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-neutral-800 text-neutral-400 border border-neutral-700/60">
                      {item.category}
                    </span>
                    {isModified && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-primary-900 text-primary-300 border border-primary-900 font-semibold">
                        CUSTOM
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-neutral-400">
                    {item.description}
                  </p>
                </div>

                {/* Right: Key Badges & Actions */}
                <div className="flex items-center gap-3 self-end sm:self-auto flex-shrink-0">
                  <div className="flex items-center gap-1.5 font-mono text-xs">
                    {item.keys.map((k, idx) => (
                      <React.Fragment key={k + idx}>
                        <kbd className="px-2.5 py-1.5 rounded-lg bg-neutral-950 border border-neutral-700/80 text-neutral-200 font-bold shadow-inner tracking-wider">
                          {k}
                        </kbd>
                        {idx < item.keys.length - 1 && (
                          <span className="text-neutral-500 font-bold">+</span>
                        )}
                      </React.Fragment>
                    ))}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => {
                        setRecordingId(item.id);
                        setRecordedKeys([]);
                        setConflictWarning(null);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-xs font-semibold text-neutral-200 flex items-center gap-1 transition-colors cursor-pointer"
                      title="Click and press keys to rebind" aria-label="Click and press keys to rebind"
                    >
                      <Edit2 size={13} />
                      <span>Rebind</span>
                    </button>

                    {isModified && (
                      <button
                        onClick={() => handleResetSingle(item.id)}
                        className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-neutral-200 transition-colors"
                        title="Reset to default shortcut" aria-label="Reset to default shortcut"
                      >
                        <RotateCcw size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Helper Footer Note */}
      <div className="p-4 rounded-xl bg-neutral-900/40 border border-neutral-800/80 flex items-start gap-3 text-xs text-neutral-400">
        <Info size={16} className="text-primary-400 flex-shrink-0 mt-0.5" />
        <p>
          Launcher hotkeys are registered globally within the Surface Client window. You can toggle the JVM Developer Console with <kbd className="px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-200 font-mono text-[11px]">F12</kbd> or launch and terminate running instances with <kbd className="px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-200 font-mono text-[11px]">F5</kbd> at any time.
        </p>
      </div>
    </div>
  );
};
