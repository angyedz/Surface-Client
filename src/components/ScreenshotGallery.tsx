import React, { useState } from 'react';
import {
  Camera,
  Trash2,
  Maximize2,
  X,
  Calendar,
  FolderOpen,
  RefreshCw,
  Image as ImageIcon,
  Check,
  AlertCircle,
} from 'lucide-react';
import { useEscapeKey } from '../hooks/useDismissable';
import { InGameScreenshot } from '../types/launcher';
import { openInstanceFolder } from '../services/launcherCore';

interface ScreenshotGalleryProps {
  screenshots: InGameScreenshot[];
  instanceName: string;
  instanceId: string;
  onDeleteScreenshot: (id: string) => void;
  onRefresh: () => void;
}

export const ScreenshotGallery: React.FC<ScreenshotGalleryProps> = ({
  screenshots,
  instanceName,
  instanceId,
  onDeleteScreenshot,
  onRefresh,
}) => {
  const [selectedScreenshot, setSelectedScreenshot] = useState<InGameScreenshot | null>(null);
  const [folderNotice, setFolderNotice] = useState<string | null>(null);

  /** Opens the instance's screenshots folder in the system file manager. */
  const handleOpenFolder = async () => {
    try {
      const path = await openInstanceFolder(instanceId, 'screenshots');
      setFolderNotice(path);
    } catch (error) {
      setFolderNotice(String(error));
    }
    setTimeout(() => setFolderNotice(null), 4000);
  };

  useEscapeKey(() => {
    setSelectedScreenshot(null);
  }, Boolean(selectedScreenshot));

  return (
    <div className="space-y-4">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-neutral-900/80 border border-neutral-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-neutral-400/20 border border-neutral-400/40 flex items-center justify-center text-neutral-400">
            <Camera size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-neutral-100 font-['Chakra_Petch'] uppercase tracking-wider">
                IN-GAME SCREENSHOT GALLERY
              </h3>
              <span className="px-2 py-0.5 rounded bg-neutral-800 text-[10px] font-mono text-neutral-200 font-bold">
                {screenshots.length} captured
              </span>
            </div>
            <p className="text-xs text-neutral-400">
              Read from the instance's <span className="font-mono text-neutral-300">screenshots</span> folder
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {folderNotice && (
            <span className="text-[11px] font-mono text-neutral-200 flex items-center gap-1 bg-neutral-800/60 px-2.5 py-1 rounded-lg border border-neutral-800 max-w-[320px] truncate">
              <Check size={12} /> {folderNotice}
            </span>
          )}

          <button
            onClick={handleOpenFolder}
            className="px-3 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-xs font-semibold text-neutral-200 flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Open the screenshots folder" aria-label="Open the screenshots folder"
          >
            <FolderOpen size={14} />
            <span>Open Directory</span>
          </button>

          <button
            onClick={onRefresh}
            className="px-3.5 py-1.5 rounded-xl btn-primary text-xs font-bold flex items-center gap-1.5"
          >
            <RefreshCw size={14} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Screenshots Grid */}
      {screenshots.length === 0 ? (
        <div className="p-10 rounded-2xl bg-neutral-900/40 border border-neutral-800/80 text-center space-y-3">
          <ImageIcon size={36} className="mx-auto text-neutral-600" />
          <div className="text-sm font-semibold text-neutral-300">No screenshots captured yet</div>
          <p className="text-xs text-neutral-500 max-w-sm mx-auto">
            Press <kbd className="px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-300 font-mono text-[10px]">F2</kbd> while playing. Screenshots appear here straight from the instance folder.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {screenshots.map((ss) => (
            <div
              key={ss.id}
              className="group relative rounded-xl overflow-hidden border border-neutral-800 bg-neutral-900/90 hover:border-neutral-400/60 transition-all shadow-md flex flex-col justify-between"
            >
              {/* Image Preview Container */}
              <div
                onClick={() => setSelectedScreenshot(ss)}
                className="relative h-40 w-full overflow-hidden cursor-pointer bg-neutral-950"
              >
                <img
                  src={ss.url}
                  alt={ss.filename}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-neutral-950/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2.5 justify-between">
                  <span className="text-[10px] font-mono text-white bg-black/60 px-2 py-0.5 rounded">
                    {ss.resolution}
                  </span>
                  <div className="p-1 rounded bg-black/70 text-neutral-200">
                    <Maximize2 size={13} />
                  </div>
                </div>
              </div>

              {/* Card Meta & Actions */}
              <div className="p-3 space-y-1.5 bg-neutral-900">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-semibold text-neutral-200 truncate">
                    {ss.filename}
                  </span>
                  <span className="text-[10px] font-mono text-neutral-500 flex-shrink-0 ml-2">
                    {ss.fileSize}
                  </span>
                </div>

                <div className="flex items-center justify-between text-[11px] text-neutral-400">
                  <span className="truncate">{ss.biome || ss.caption || instanceName}</span>
                  <span className="text-[10px] text-neutral-500 font-mono">{ss.date} {ss.time}</span>
                </div>

                {/* Bottom Action Buttons */}
                <div className="pt-2 border-t border-neutral-800/80 flex items-center justify-between gap-2">
                  <button
                    onClick={() => setSelectedScreenshot(ss)}
                    className="text-[11px] text-neutral-400 hover:text-neutral-200 font-semibold cursor-pointer"
                  >
                    View Full
                  </button>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={handleOpenFolder}
                      className="p-1 rounded text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-colors cursor-pointer"
                      title="Show in the file manager"
                      aria-label="Show in the file manager"
                    >
                      <FolderOpen size={13} />
                    </button>
                    <button
                      onClick={() => onDeleteScreenshot(ss.id)}
                      className="p-1 rounded text-neutral-400 hover:text-red-400 hover:bg-neutral-800 transition-colors cursor-pointer"
                      title="Delete screenshot from directory" aria-label="Delete screenshot from directory"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Full Resolution Lightbox Modal */}
      {selectedScreenshot && (
        <div
          className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4"
          onClick={(event) => {
            // Only a click on the backdrop itself closes the dialog.
            if (event.target === event.currentTarget) setSelectedScreenshot(null);
          }}
        >
          <div className="glass-heavy rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-4 border-b border-neutral-800 bg-neutral-950 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Camera size={18} className="text-neutral-400" />
                <div>
                  <h4 className="font-mono text-sm font-bold text-neutral-100 truncate">
                    {selectedScreenshot.filename}
                  </h4>
                  <p className="text-[11px] font-mono text-neutral-400">
                    Captured: {selectedScreenshot.date} {selectedScreenshot.time} • {selectedScreenshot.resolution} • {selectedScreenshot.fileSize}
                    {selectedScreenshot.shader ? ` • ${selectedScreenshot.shader}` : ''}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleOpenFolder}
                  className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-xs font-semibold text-neutral-200 flex items-center gap-1.5 transition-colors"
                >
                  <FolderOpen size={14} />
                  <span>Show in folder</span>
                </button>

                <button
                  onClick={() => {
                    const idToDelete = selectedScreenshot.id;
                    setSelectedScreenshot(null);
                    onDeleteScreenshot(idToDelete);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-red-950/60 hover:bg-red-900 border border-red-800 text-xs font-semibold text-red-300 flex items-center gap-1.5 transition-colors"
                >
                  <Trash2 size={14} />
                  <span>Delete</span>
                </button>

                <button
                  onClick={() => setSelectedScreenshot(null)}
                  className="p-1.5 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 rounded-lg transition-colors ml-2"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Modal Image Display */}
            <div className="flex-1 bg-black flex items-center justify-center p-2 overflow-hidden">
              <img
                src={selectedScreenshot.url}
                alt={selectedScreenshot.filename}
                className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-2xl"
              />
            </div>

            {/* Modal Footer Info */}
            <div className="p-3 bg-neutral-950 border-t border-neutral-800 flex items-center justify-between text-xs text-neutral-400 font-mono">
              <span>Instance: {instanceName}</span>
              <span>Saved in: .minecraft/screenshots/{selectedScreenshot.filename}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
