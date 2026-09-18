import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Terminal,
  ChevronDown,
  Check,
  Minus,
  Maximize2,
  X,
  Users,
  Edit2,
  Plus,
} from 'lucide-react';
import { InstanceProfile, LaunchStatus, PlayerAccount } from '../types/launcher';
import { InstanceIcon } from './InstanceIcon';
import { loadServers } from '../services/serverList';
import { useDismissable } from '../hooks/useDismissable';
import {
  minimizeWindow,
  toggleMaximizeWindow,
  closeWindow,
  isTauri,
} from '../services/tauriBridge';

interface TopTitleBarProps {
  instances: InstanceProfile[];
  activeInstance?: InstanceProfile | null;
  onSelectInstance: (instance: InstanceProfile) => void;
  launchStatus: LaunchStatus;
  onOpenConsole: () => void;
  onQuickConnectServer: (ip: string) => void;
  onToggleFriends?: () => void;
  isFriendsOpen?: boolean;
  friendsOnlineCount?: number;
  unreadFriendsCount?: number;
  username?: string;
  avatarUrl?: string;
  onChangeUsername?: (name: string) => void;
  onOpenCreator?: () => void;
  accounts?: PlayerAccount[];
  activeAccount?: PlayerAccount | null;
  onSelectAccount?: (account: PlayerAccount) => void;
  onOpenAccountManager?: () => void;
}

export const TopTitleBar: React.FC<TopTitleBarProps> = ({
  instances,
  activeInstance,
  onSelectInstance,
  launchStatus,
  onOpenConsole,
  onQuickConnectServer,
  onToggleFriends,
  isFriendsOpen,
  friendsOnlineCount = 0,
  unreadFriendsCount = 0,
  username = 'Player',
  avatarUrl,
  onChangeUsername,
  onOpenCreator,
  accounts = [],
  activeAccount,
  onSelectAccount,
  onOpenAccountManager,
}) => {
  // Only the first few saved servers fit in the title bar. Read once rather
  // than parsing local storage on every render.
  const [quickServers, setQuickServers] = useState(() => loadServers().slice(0, 4));
  useEffect(() => {
    setQuickServers(loadServers().slice(0, 4));
  }, [instances]);

  // One menu at a time: opening either closes the other.
  const [openMenu, setOpenMenu] = useState<'instance' | 'account' | null>(null);
  const instanceMenuRef = useRef<HTMLDivElement | null>(null);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const closeMenu = useCallback(() => setOpenMenu(null), []);

  useDismissable(instanceMenuRef, closeMenu, openMenu === 'instance');
  useDismissable(accountMenuRef, closeMenu, openMenu === 'account');

  const showInstanceMenu = openMenu === 'instance';
  const showAccountMenu = openMenu === 'account';
  const isRunning = launchStatus === 'running';

  return (
    <header className="relative h-12 glass-bar border-b px-4 flex items-center justify-between z-30 select-none">
      {/*
        The drag region is its own layer behind the controls. On the whole
        header it swallows every mousedown, so buttons inside it started a
        window drag instead of opening their menu.
      */}
      <div data-tauri-drag-region className="absolute inset-0 z-0" />
      {/* Brand Logo & Active Instance Selector */}
      <div className="relative z-10 flex items-center gap-3">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-primary-500/20 border border-primary-500/30 flex items-center justify-center">
            <span className="font-mono font-bold text-[11px] text-primary-400">SC</span>
          </div>
          <span className="font-semibold text-xs tracking-wide text-neutral-200">
            Surface Client
          </span>
        </div>

        <div className="h-4 w-px bg-white/10 mx-1" />

        {/* Profile Switcher Dropdown */}
        <div className="relative" ref={instanceMenuRef}>
          {activeInstance ? (
            <button
              onClick={() => setOpenMenu(showInstanceMenu ? null : 'instance')}
              aria-haspopup="menu"
              aria-expanded={showInstanceMenu}
              className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 text-xs text-neutral-300 transition-colors cursor-pointer"
            >
              <div className="w-4 h-4 flex items-center justify-center text-neutral-400">
                <InstanceIcon icon={activeInstance.icon} size={13} />
              </div>
              <span className="font-medium text-neutral-200 truncate max-w-[120px]">
                {activeInstance.name}
              </span>
              <ChevronDown size={12} className="text-neutral-500" />
            </button>
          ) : (
            <button
              onClick={onOpenCreator}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary-500/20 hover:bg-primary-500/30 border border-primary-500/40 text-xs text-primary-300 transition-colors cursor-pointer"
            >
              <span className="font-medium">+ Create Profile</span>
            </button>
          )}

          {showInstanceMenu && activeInstance && (
            <div role="menu"
              className="absolute top-full left-0 mt-1.5 w-56 glass-heavy rounded-xl overflow-hidden py-1 z-50">
              <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-neutral-500 border-b border-white/5 flex items-center justify-between">
                <span>Switch Instance</span>
                {onOpenCreator && (
                  <button
                    onClick={() => {
                      closeMenu();
                      onOpenCreator();
                    }}
                    className="text-primary-400 hover:underline cursor-pointer"
                  >
                    + New
                  </button>
                )}
              </div>
              <div className="max-h-48 overflow-y-auto py-1">
                {instances.map((inst) => (
                  <button
                    key={inst.id}
                    onClick={() => {
                      onSelectInstance(inst);
                      closeMenu();
                    }}
                    className={`w-full px-3 py-1.5 flex items-center justify-between text-left hover:bg-white/5 transition-colors cursor-pointer text-xs ${
                      inst.id === activeInstance.id
                        ? 'text-primary-400 font-medium'
                        : 'text-neutral-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <InstanceIcon icon={inst.icon} size={13} />
                      <span className="truncate">{inst.name}</span>
                    </div>
                    {inst.id === activeInstance.id && <Check size={12} />}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Middle: quick connect chips for the servers the user saved */}
      <div className="relative z-10 hidden md:flex items-center gap-1.5">
        {quickServers.length > 0 && (
          <span className="text-[10px] text-neutral-500 font-mono uppercase mr-1">
            Quick Play:
          </span>
        )}
        {quickServers.map((srv) => (
          <button
            key={srv.id}
            onClick={() => onQuickConnectServer(srv.ip)}
            className="px-2 py-0.5 rounded-md bg-white/5 hover:bg-white/10 text-[11px] font-medium text-neutral-400 hover:text-neutral-200 transition-colors cursor-pointer"
            title={`Launch ${srv.name} (${srv.ip})`}
          >
            {srv.name}
          </button>
        ))}
      </div>

      {/* Right Controls: Friends, Console & Window Controls */}
      <div className="relative z-10 flex items-center gap-2">
        {/* Player Profile & Account Switcher Chip */}
        <div className="relative" ref={accountMenuRef}>
          <button
            onClick={() => setOpenMenu(showAccountMenu ? null : 'account')}
            aria-haspopup="menu"
            aria-expanded={showAccountMenu}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 text-xs text-neutral-300 hover:text-white transition-colors cursor-pointer group"
            title="Switch player account or add offline/licensed account" aria-label="Switch player account or add offline/licensed account"
          >
            <img
              src={avatarUrl || (activeAccount?.avatarUrl || `https://mc-heads.net/avatar/${username}/24`)}
              alt={username}
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = 'https://mc-heads.net/avatar/MHF_Steve/24';
              }}
              className="w-4 h-4 rounded object-cover ring-1 ring-white/10"
            />
            <span className="font-semibold text-[11px] text-neutral-200 group-hover:text-primary-300 max-w-[85px] truncate">
              {username || 'No Account'}
            </span>
            {activeAccount && (
              <span
                className={`text-[8px] font-mono px-1 py-0.5 rounded font-bold uppercase ${
                  activeAccount.type === 'offline'
                    ? 'bg-neutral-800 text-neutral-400 border border-neutral-700'
                    : 'bg-primary-500/20 text-primary-400 border border-primary-500/30'
                }`}
              >
                {activeAccount.type === 'offline' ? 'OFF' : 'LIC'}
              </span>
            )}
            <ChevronDown size={11} className="text-neutral-500 group-hover:text-neutral-300" />
          </button>

          {/* Account Switcher Dropdown */}
          {showAccountMenu && (
            <div role="menu"
              className="absolute top-full right-0 mt-1.5 w-60 glass-heavy rounded-2xl overflow-hidden py-1 z-50">
              <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-neutral-500 border-b border-white/5 flex items-center justify-between">
                <span>Player Accounts</span>
                {onOpenAccountManager && (
                  <button
                    onClick={() => {
                      closeMenu();
                      onOpenAccountManager();
                    }}
                    className="text-primary-400 hover:text-primary-300 font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <Plus size={12} />
                    <span>Manage</span>
                  </button>
                )}
              </div>

              <div className="max-h-52 overflow-y-auto py-1">
                {accounts.length === 0 ? (
                  <div className="p-3 text-center text-xs text-neutral-500">
                    No accounts found
                  </div>
                ) : (
                  accounts.map((acc) => {
                    const isSelected = activeAccount ? acc.id === activeAccount.id : acc.username === username;
                    return (
                      <button
                        key={acc.id}
                        onClick={() => {
                          if (onSelectAccount) onSelectAccount(acc);
                          closeMenu();
                        }}
                        className={`w-full px-3 py-2 flex items-center justify-between text-left hover:bg-white/5 transition-colors cursor-pointer text-xs ${
                          isSelected ? 'bg-primary-900/30 text-primary-300 font-medium' : 'text-neutral-300'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <img
                            src={acc.avatarUrl || `https://mc-heads.net/avatar/${acc.username}/24`}
                            alt={acc.username}
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).src = 'https://mc-heads.net/avatar/MHF_Steve/24';
                            }}
                            className="w-5 h-5 rounded bg-neutral-800 object-cover flex-shrink-0"
                          />
                          <div className="truncate">
                            <div className="truncate text-xs font-semibold">{acc.username}</div>
                            <div className="text-[9px] font-mono text-neutral-500 flex items-center gap-1">
                              <span>{acc.type === 'offline' ? 'Offline' : 'Mojang'}</span>
                              <span>•</span>
                              <span>{acc.uuid.slice(0, 6)}...</span>
                            </div>
                          </div>
                        </div>

                        {isSelected && <Check size={14} className="text-primary-400 flex-shrink-0" />}
                      </button>
                    );
                  })
                )}
              </div>

              {onOpenAccountManager && (
                <div className="p-1.5 border-t border-white/5 bg-neutral-950/40">
                  <button
                    onClick={() => {
                      closeMenu();
                      onOpenAccountManager();
                    }}
                    className="w-full py-1.5 px-2 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-white text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Plus size={13} />
                    <span>+ Add Offline / Licensed Account</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Friends Panel Trigger Button */}
        {onToggleFriends && (
          <button
            onClick={onToggleFriends}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs transition-colors cursor-pointer ${
              isFriendsOpen
                ? 'bg-primary-500/20 text-primary-300 border-primary-500/40 shadow-sm'
                : 'bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-white border-white/5'
            }`}
            title="Friends & Social" aria-label="Friends & Social"
          >
            <div className="relative">
              <Users size={14} className={isFriendsOpen ? 'text-primary-400' : 'text-neutral-400'} />
              {unreadFriendsCount > 0 && (
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-primary-400 animate-ping" />
              )}
            </div>
            <span className="hidden sm:inline font-medium text-[11px]">Friends</span>
            <span className="px-1.5 py-0.2 rounded-full bg-primary-500/20 text-primary-400 text-[10px] font-mono font-bold">
              {friendsOnlineCount}
            </span>
          </button>
        )}

        {/* Live Console Button */}
        <button
          onClick={onOpenConsole}
          className={`p-1.5 rounded-lg border text-xs transition-colors cursor-pointer ${
            isRunning
              ? 'bg-primary-500/15 text-primary-400 border-primary-500/30'
              : 'bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-neutral-200 border-white/5'
          }`}
          title="Game Console" aria-label="Game Console"
        >
          <Terminal size={14} />
        </button>

        {/* Minimal Window controls */}
        <div className="flex items-center gap-1 pl-2 border-l border-white/5 text-neutral-500">
          <button
            onClick={() => minimizeWindow()}
            className="p-1 rounded hover:bg-white/10 hover:text-neutral-300 transition-colors cursor-pointer"
            title="Minimize" aria-label="Minimize"
          >
            <Minus size={12} />
          </button>
          <button
            onClick={() => toggleMaximizeWindow()}
            className="p-1 rounded hover:bg-white/10 hover:text-neutral-300 transition-colors cursor-pointer"
            title="Maximize / Restore" aria-label="Maximize / Restore"
          >
            <Maximize2 size={11} />
          </button>
          <button
            onClick={() => closeWindow()}
            className="p-1 rounded hover:bg-red-500/20 hover:text-red-400 transition-colors cursor-pointer"
            title="Close" aria-label="Close"
          >
            <X size={12} />
          </button>
        </div>
      </div>
    </header>
  );
};
