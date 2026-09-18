import React, { useState, useEffect } from 'react';
import {
  Globe,
  Wifi,
  Users,
  Copy,
  Check,
  Play,
  Search,
  Plus,
  RefreshCw,
  Server,
  Activity,
} from 'lucide-react';
import { useEscapeKey } from '../hooks/useDismissable';
import { loadServers, saveServers, createServerEntry } from '../services/serverList';
import { QuickServer, InstanceProfile } from '../types/launcher';
import { refreshAllServersStatus } from '../services/serverStatusApi';

interface ServerBrowserViewProps {
  activeInstance?: InstanceProfile | null;
  onLaunchServer: (serverIp: string) => void;
}

export const ServerBrowserView: React.FC<ServerBrowserViewProps> = ({
  activeInstance,
  onLaunchServer,
}) => {
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [servers, setServers] = useState<QuickServer[]>(() => loadServers());

  const [search, setSearch] = useState('');
  const [copiedIp, setCopiedIp] = useState<string | null>(null);
  const [isPinging, setIsPinging] = useState(false);
  const [customServerModal, setCustomServerModal] = useState(false);
  const [newServerName, setNewServerName] = useState('');
  const [newServerIp, setNewServerIp] = useState('');

  // Persist servers list to localStorage
  useEffect(() => {
    saveServers(servers);
  }, [servers]);

  // Query live ping and player counts on mount
  const handleRefreshPing = async () => {
    setIsPinging(true);
    try {
      const updated = await refreshAllServersStatus(servers);
      setServers(updated);
    } catch (err) {
      console.error('Failed to ping servers:', err);
    } finally {
      setIsPinging(false);
    }
  };

  useEffect(() => {
    handleRefreshPing();
  }, []);

  const filtered = servers.filter((s) => {
    const matchesSearch =
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.ip.toLowerCase().includes(search.toLowerCase()) ||
      s.description.toLowerCase().includes(search.toLowerCase());
    const matchesCategory =
      activeCategory === 'all' || s.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  const handleCopy = (ip: string) => {
    navigator.clipboard.writeText(ip);
    setCopiedIp(ip);
    setTimeout(() => setCopiedIp(null), 2000);
  };

  const handleAddCustom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newServerName || !newServerIp) return;
    const newServer = createServerEntry(newServerName, newServerIp);
    const updated = [newServer, ...servers];
    setServers(updated);
    setNewServerName('');
    setNewServerIp('');
    setCustomServerModal(false);

    // Immediately trigger ping for newly added server
    refreshAllServersStatus(updated).then(setServers);
  };

  useEscapeKey(() => {
    setCustomServerModal(false);
  }, customServerModal);

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6 select-none font-['Plus_Jakarta_Sans',sans-serif]">
      {/* Header Banner */}
      <div className="relative rounded-2xl overflow-hidden p-6 border border-white/10 bg-gradient-to-r from-neutral-900/90 via-neutral-900/70 to-neutral-950/90 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary-500/10 border border-primary-500/30 flex items-center justify-center text-primary-400">
            <Globe size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-neutral-100 font-['Chakra_Petch'] flex items-center gap-2">
              Multiplayer Server Network
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-primary-500/20 text-primary-400 border border-primary-500/30 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-primary-400 animate-pulse" />
                Live Status API
              </span>
            </h2>
            <p className="text-xs text-neutral-400 mt-0.5">
              Live Minecraft servers with real player statistics compatible with {activeInstance ? `${activeInstance.name} (MC ${activeInstance.mcVersion})` : 'all versions'}.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleRefreshPing}
            disabled={isPinging}
            className="px-3.5 py-2 rounded-xl bg-neutral-800/80 hover:bg-neutral-700 border border-white/10 text-xs font-semibold text-neutral-300 flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            title="Refresh Server Pings" aria-label="Refresh Server Pings"
          >
            <RefreshCw size={13} className={isPinging ? 'animate-spin text-primary-400' : ''} />
            <span>{isPinging ? 'Pinging...' : 'Refresh'}</span>
          </button>

          <button
            onClick={() => setCustomServerModal(true)}
            className="px-4 py-2 rounded-xl bg-primary-500 hover:bg-primary-400 text-neutral-950 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-md"
          >
            <Plus size={15} />
            <span>Add Server</span>
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by server name, server IP (e.g. hypixel, minemen), or gamemode..."
          className="w-full pl-11 pr-4 py-2.5 bg-neutral-900/80 border border-white/10 rounded-xl text-xs text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-primary-500/60"
        />
      </div>

      {/* Category Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {[
          { id: 'all', label: 'All Servers' },
          { id: 'minigames', label: 'Minigames' },
          { id: 'pvp', label: 'PvP & Practice' },
          { id: 'survival', label: 'Survival & SMP' },
          { id: 'mmorpg', label: 'MMORPG' },
          { id: 'skyblock', label: 'Skyblock' },
          { id: 'anarchy', label: 'Anarchy' },
        ].map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
              activeCategory === cat.id
                ? 'bg-primary-500 text-neutral-950 font-bold shadow-md shadow-primary-900'
                : 'bg-neutral-900/80 hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 border border-white/5'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Server Grid Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((srv) => (
          <div
            key={srv.id}
            className="rounded-2xl p-5 border border-white/10 bg-neutral-900/60 hover:bg-neutral-900/85 transition-all hover:border-primary-500/30 shadow-lg flex flex-col justify-between gap-4 group"
          >
            <div>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  {srv.iconBase64 ? (
                    <img
                      src={srv.iconBase64}
                      alt={srv.name}
                      className="w-10 h-10 rounded-xl object-contain bg-black/40 border border-white/20 shadow-md flex-shrink-0"
                    />
                  ) : (
                    <div
                      className={`w-10 h-10 rounded-xl bg-gradient-to-br ${srv.badgeColor} flex items-center justify-center font-black text-white text-sm shadow-md border border-white/20 flex-shrink-0`}
                    >
                      {srv.shortLabel}
                    </div>
                  )}

                  <div className="truncate">
                    <div className="flex items-center gap-1.5">
                      <h3 className="font-bold text-sm text-neutral-100 group-hover:text-primary-300 transition-colors truncate">
                        {srv.name}
                      </h3>
                      {srv.isOnline !== false ? (
                        <span className="w-2 h-2 rounded-full bg-primary-400 animate-pulse flex-shrink-0" title="Online" aria-label="Online" />
                      ) : (
                        <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" title="Offline" aria-label="Offline" />
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] font-mono text-neutral-400 truncate">
                      <span className="truncate">{srv.ip}</span>
                      <button
                        onClick={() => handleCopy(srv.ip)}
                        className="hover:text-white transition-colors cursor-pointer flex-shrink-0"
                        title="Copy IP" aria-label="Copy IP"
                      >
                        {copiedIp === srv.ip ? (
                          <Check size={12} className="text-primary-400" />
                        ) : (
                          <Copy size={12} />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Ping Badge */}
                <div
                  className={`flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded-full border flex-shrink-0 ${
                    srv.isOnline !== false
                      ? srv.pingMs < 60
                        ? 'bg-primary-900/60 border-primary-500/30 text-primary-400'
                        : 'bg-amber-950/60 border-amber-500/30 text-amber-400'
                      : 'bg-red-950/60 border-red-500/30 text-red-400'
                  }`}
                >
                  <Wifi size={11} />
                  <span>{srv.isOnline !== false ? `${srv.pingMs} ms` : 'Offline'}</span>
                </div>
              </div>

              <p className="text-xs text-neutral-400 mt-3 line-clamp-2 leading-relaxed">
                {srv.motdClean || srv.description}
              </p>
            </div>

            <div className="pt-3 border-t border-white/5 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-[11px] font-mono text-neutral-400">
                <Users size={12} className="text-neutral-500" />
                <span>
                  {srv.isOnline !== false
                    ? `${srv.playersOnline.toLocaleString()} / ${srv.maxPlayers.toLocaleString()}`
                    : 'Unreachable'}
                </span>
              </div>

              <button
                onClick={() => onLaunchServer(srv.ip)}
                className="px-3.5 py-1.5 rounded-lg bg-primary-500 hover:bg-primary-400 text-neutral-950 font-bold text-xs flex items-center gap-1.5 shadow-md transition-colors cursor-pointer"
              >
                <Play size={12} fill="currentColor" />
                <span>Direct Join</span>
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Add Custom Server Modal */}
      {customServerModal && (
        <div
          className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
          onClick={(event) => {
            // Only a click on the backdrop itself closes the dialog.
            if (event.target === event.currentTarget) setCustomServerModal(false);
          }}
        >
          <div className="bg-neutral-900 border border-white/10 rounded-2xl w-full max-w-sm p-5 shadow-2xl animate-in zoom-in-95 duration-150">
            <h3 className="text-base font-bold text-neutral-100 flex items-center gap-2">
              <Globe size={18} className="text-primary-400" />
              Add Multiplayer Server
            </h3>
            <p className="text-xs text-neutral-400 mt-1">
              Add your private realm, SMP, or favorite server with live ping checking.
            </p>

            <form onSubmit={handleAddCustom} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-mono text-neutral-400 uppercase tracking-wider mb-1">
                  Server Name
                </label>
                <input
                  type="text"
                  value={newServerName}
                  onChange={(e) => setNewServerName(e.target.value)}
                  placeholder="e.g. My Survival SMP"
                  required
                  className="w-full px-3 py-2 bg-neutral-950 border border-white/10 rounded-lg text-xs text-neutral-100 focus:outline-none focus:border-primary-500"
                />
              </div>

              <div>
                <label className="block text-xs font-mono text-neutral-400 uppercase tracking-wider mb-1">
                  Server IP Address / Domain
                </label>
                <input
                  type="text"
                  value={newServerIp}
                  onChange={(e) => setNewServerIp(e.target.value)}
                  placeholder="e.g. play.myserver.net:25565"
                  required
                  className="w-full px-3 py-2 bg-neutral-950 border border-white/10 rounded-lg text-xs text-neutral-100 focus:outline-none focus:border-primary-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCustomServerModal(false)}
                  className="px-3 py-1.5 text-xs text-neutral-400 hover:text-neutral-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-bold bg-primary-500 hover:bg-primary-400 text-neutral-950 rounded-lg shadow-md cursor-pointer"
                >
                  Save & Check Ping
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
