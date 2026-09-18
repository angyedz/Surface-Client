import React, { useState, useEffect } from 'react';
import {
  X,
  Minus,
  Search,
  UserPlus,
  Users,
  Send,
  MessageSquare,
  Gamepad2,
  Check,
  Clock,
  Sparkles,
  ExternalLink,
  Shield,
  Circle,
} from 'lucide-react';
import { FriendItem } from '../types/launcher';
import { motion, AnimatePresence } from 'motion/react';
import { lookupMinecraftPlayer, MinecraftPlayerProfile } from '../services/playerApi';

interface FriendsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  username: string;
  avatarUrl?: string;
  friends: FriendItem[];
  onAddFriend: (name: string) => void;
}

interface ChatMessage {
  id: string;
  sender: string;
  text: string;
  time: string;
  isMe: boolean;
}

export interface FriendRequestItem {
  id: string;
  username: string;
  rank: string;
  mutual: number;
}

export const FriendsPanel: React.FC<FriendsPanelProps> = ({
  isOpen,
  onClose,
  username,
  avatarUrl,
  friends,
  onAddFriend,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'list' | 'requests' | 'add'>('list');
  const [activeChatFriend, setActiveChatFriend] = useState<FriendItem | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [newFriendName, setNewFriendName] = useState('');
  const [isValidatingPlayer, setIsValidatingPlayer] = useState(false);
  const [verifiedPlayer, setVerifiedPlayer] = useState<MinecraftPlayerProfile | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);

  useEffect(() => {
    const trimmed = newFriendName.trim();
    if (trimmed.length < 3) {
      setVerifiedPlayer(null);
      setLookupError(null);
      setIsValidatingPlayer(false);
      return;
    }

    setIsValidatingPlayer(true);
    setLookupError(null);

    const timer = setTimeout(async () => {
      try {
        const result = await lookupMinecraftPlayer(trimmed);
        if (result && result.rawId !== 'offline') {
          setVerifiedPlayer(result);
          setLookupError(null);
        } else {
          setVerifiedPlayer(result);
          setLookupError('Unverified player (Not found in Mojang database)');
        }
      } catch (err) {
        setLookupError('Failed to verify player with Mojang API');
      } finally {
        setIsValidatingPlayer(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [newFriendName]);
  const [messages, setMessages] = useState<Record<string, ChatMessage[]>>(() => {
    try {
      const saved = localStorage.getItem('surface_chat_messages');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error(e);
    }
    return {};
  });

  const [pendingRequests, setPendingRequests] = useState<FriendRequestItem[]>(() => {
    try {
      const saved = localStorage.getItem('surface_pending_friend_requests');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error(e);
    }
    return [];
  });

  // Persist messages to LocalStorage
  React.useEffect(() => {
    try {
      localStorage.setItem('surface_chat_messages', JSON.stringify(messages));
    } catch (e) {
      console.error(e);
    }
  }, [messages]);

  // Persist requests to LocalStorage
  React.useEffect(() => {
    try {
      localStorage.setItem('surface_pending_friend_requests', JSON.stringify(pendingRequests));
    } catch (e) {
      console.error(e);
    }
  }, [pendingRequests]);

  if (!isOpen) return null;

  const filteredFriends = friends.filter((f) =>
    f.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const onlineCount = friends.filter((f) => f.status !== 'offline').length;

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !activeChatFriend) return;

    const newMsg: ChatMessage = {
      id: `msg_${Date.now()}`,
      sender: username,
      text: chatInput.trim(),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isMe: true,
    };

    setMessages((prev) => ({
      ...prev,
      [activeChatFriend.id]: [...(prev[activeChatFriend.id] || []), newMsg],
    }));

    setChatInput('');
  };

  const handleAddFriendSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newFriendName.trim()) {
      onAddFriend(newFriendName.trim());
      setNewFriendName('');
      setActiveTab('list');
    }
  };

  const handleAcceptRequest = (id: string, reqUsername: string) => {
    setPendingRequests((prev) => prev.filter((r) => r.id !== id));
    onAddFriend(reqUsername);
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 15 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 15 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className="fixed bottom-6 right-6 w-96 max-w-[calc(100vw-2rem)] h-[540px] z-50 rounded-2xl overflow-hidden shadow-[0_25px_60px_rgba(0,0,0,0.75)] border border-white/15 flex flex-col bg-neutral-950/90 text-neutral-100 font-['Plus_Jakarta_Sans',sans-serif]"
    >
      {/* Top Banner (Vibrant Emerald Frosted Glass like Lunar Client) */}
      <div className="bg-gradient-to-r from-primary-500 via-primary-600 to-primary-600 px-4 py-3 flex items-center justify-between shadow-lg relative overflow-hidden flex-shrink-0">
        <div className="absolute inset-0 bg-white/10 pointer-events-none" />
        <div className="flex items-center gap-3 relative z-10">
          <div className="relative">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt="avatar"
                className="w-9 h-9 rounded-lg object-cover bg-neutral-900 border-2 border-white/40 shadow-md"
              />
            ) : (
              <div className="w-9 h-9 rounded-lg bg-neutral-950/80 border-2 border-white/40 flex items-center justify-center text-white font-bold text-sm shadow-md">
                {username.slice(0, 2).toUpperCase()}
              </div>
            )}
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-primary-300 border-2 border-neutral-900" />
          </div>

          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-sm text-neutral-950 tracking-wide font-['Chakra_Petch'] uppercase">
                {username}
              </span>
            </div>
            <span className="text-[11px] text-primary-900 font-semibold tracking-tight">
              Online playing Launcher
            </span>
          </div>
        </div>

        {/* Window controls */}
        <div className="flex items-center gap-1 relative z-10 text-neutral-950">
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-black/15 transition-colors cursor-pointer"
            title="Minimize" aria-label="Minimize"
          >
            <Minus size={15} />
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-black/20 transition-colors cursor-pointer"
            title="Close Friends" aria-label="Close Friends"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* Sub Header: Search bar & navigation tabs */}
      <div className="p-3 bg-neutral-900/80 border-b border-white/10 space-y-2.5 flex-shrink-0">
        {/* Search Bar */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            placeholder="Search for Surface Client users..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-neutral-950/70 border border-white/10 rounded-xl text-xs text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-primary-500/60 transition-colors"
          />
        </div>

        {/* Action Tabs Bar */}
        <div className="flex items-center justify-between text-[11px] text-neutral-400 font-semibold px-0.5">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('requests')}
              className={`hover:text-neutral-200 transition-colors flex items-center gap-1 ${
                activeTab === 'requests' ? 'text-primary-400' : ''
              }`}
            >
              <span>Requests</span>
              {pendingRequests.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-primary-500 text-neutral-950 font-bold text-[9px]">
                  {pendingRequests.length}
                </span>
              )}
            </button>
            <span>•</span>
            <button
              onClick={() => setActiveTab('list')}
              className={`hover:text-neutral-200 transition-colors ${
                activeTab === 'list' ? 'text-primary-400 font-bold' : ''
              }`}
            >
              Friends List
            </button>
            <span>•</span>
            <button
              onClick={() => setActiveTab('add')}
              className={`hover:text-neutral-200 transition-colors flex items-center gap-0.5 ${
                activeTab === 'add' ? 'text-primary-400' : ''
              }`}
            >
              <UserPlus size={12} />
              <span>Add</span>
            </button>
          </div>

          <span className="text-[10px] font-mono text-neutral-400">
            {onlineCount}/{friends.length} online
          </span>
        </div>
      </div>

      {/* Main Panel Content Area */}
      <div className="flex-1 overflow-y-auto p-2.5 relative">
        {/* TAB 1: FRIENDS LIST */}
        {activeTab === 'list' && (
          <div className="space-y-1.5">
            <div className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-neutral-400 flex items-center justify-between">
              <span>Friends ({friends.length})</span>
            </div>

            {filteredFriends.length === 0 ? (
              <div className="py-12 text-center text-xs text-neutral-400">
                No friends found matching "{searchQuery}"
              </div>
            ) : (
              filteredFriends.map((friend) => (
                <div
                  key={friend.id}
                  className="group p-2 rounded-xl bg-neutral-900/40 hover:bg-white/5 border border-transparent hover:border-white/10 transition-all flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-2.5 truncate">
                    {/* Friend Avatar */}
                    <div className="relative flex-shrink-0">
                      <img
                        src={friend.avatarUrl}
                        alt={friend.username}
                        className="w-8 h-8 rounded-lg object-cover bg-neutral-800 border border-white/10"
                      />
                      <span
                        className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-neutral-950 ${
                          friend.status === 'online_launcher'
                            ? 'bg-primary-400'
                            : friend.status === 'playing'
                            ? 'bg-amber-400'
                            : 'bg-neutral-600'
                        }`}
                      />
                    </div>

                    {/* Friend Name and Details */}
                    <div className="truncate">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-neutral-200 group-hover:text-white truncate">
                          {friend.username}
                        </span>
                        {friend.rank && (
                          <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-white/10 text-primary-300 font-bold">
                            {friend.rank}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-neutral-400 truncate font-mono">
                        {friend.status === 'offline'
                          ? `Last seen ${friend.lastSeen || 'recently'}`
                          : friend.gameDetails || 'Online in Launcher'}
                      </p>
                    </div>
                  </div>

                  {/* Actions: Direct Whisper / Chat & Join */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => setActiveChatFriend(friend)}
                      className="p-1.5 rounded-lg text-neutral-400 hover:text-primary-300 hover:bg-primary-500/20 transition-colors cursor-pointer"
                      title={`Whisper to ${friend.username}`}
                    >
                      <Send size={13} />
                    </button>
                    {friend.status === 'playing' && (
                      <button
                        className="p-1.5 rounded-lg text-amber-400 hover:text-amber-200 hover:bg-amber-500/20 transition-colors cursor-pointer"
                        title="Join Friend Server" aria-label="Join Friend Server"
                      >
                        <Gamepad2 size={13} />
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* TAB 2: PENDING REQUESTS */}
        {activeTab === 'requests' && (
          <div className="space-y-2">
            <div className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-neutral-400">
              Incoming Requests ({pendingRequests.length})
            </div>

            {pendingRequests.length === 0 ? (
              <div className="py-12 text-center text-xs text-neutral-400">
                No pending friend requests.
              </div>
            ) : (
              pendingRequests.map((req) => (
                <div
                  key={req.id}
                  className="p-2.5 rounded-xl bg-neutral-900/50 border border-white/10 flex items-center justify-between gap-2"
                >
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-neutral-200">{req.username}</span>
                      <span className="text-[9px] font-mono px-1 rounded bg-white/10 text-primary-300 font-bold">
                        {req.rank}
                      </span>
                    </div>
                    <span className="text-[10px] text-neutral-400">{req.mutual} mutual friends</span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleAcceptRequest(req.id, req.username)}
                      className="px-2 py-1 rounded bg-primary-500 hover:bg-primary-400 text-neutral-950 font-bold text-[11px] transition-colors cursor-pointer"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => setPendingRequests((prev) => prev.filter((r) => r.id !== req.id))}
                      className="p-1 rounded text-neutral-400 hover:text-neutral-200 hover:bg-white/10 transition-colors cursor-pointer"
                    >
                      <X size={13} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* TAB 3: ADD FRIEND */}
        {activeTab === 'add' && (
          <div className="p-3 space-y-4">
            <div>
              <h4 className="text-xs font-bold text-neutral-200">Send Friend Request</h4>
              <p className="text-[11px] text-neutral-400 mt-0.5">
                Enter the Minecraft username or Surface Client tag of the player you wish to add.
              </p>
            </div>

            <form onSubmit={handleAddFriendSubmit} className="space-y-3">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Username (e.g. Technoblade, Notch)"
                  value={newFriendName}
                  onChange={(e) => setNewFriendName(e.target.value)}
                  autoFocus
                  className="w-full px-3 py-2 bg-neutral-950 border border-white/10 rounded-xl text-xs text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-primary-500 font-mono"
                />
                {isValidatingPlayer && (
                  <div className="absolute right-3 top-2.5 w-3.5 h-3.5 border-2 border-primary-400 border-t-transparent rounded-full animate-spin" />
                )}
              </div>

              {/* Verified Mojang Profile Preview */}
              {verifiedPlayer && (
                <div className={`p-2.5 rounded-xl border flex items-center justify-between text-xs animate-in fade-in duration-200 ${
                  verifiedPlayer.rawId !== 'offline'
                    ? 'bg-primary-900/20 border-primary-500/40 text-primary-300'
                    : 'bg-neutral-900 border-white/10 text-neutral-400'
                }`}>
                  <div className="flex items-center gap-2.5 truncate">
                    <img
                      src={verifiedPlayer.avatarUrl}
                      alt={verifiedPlayer.username}
                      className="w-8 h-8 rounded-lg object-cover ring-1 ring-white/10"
                    />
                    <div className="truncate">
                      <div className="font-bold text-neutral-200 truncate flex items-center gap-1.5">
                        <span>{verifiedPlayer.username}</span>
                        {verifiedPlayer.rawId !== 'offline' && (
                          <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-primary-500/20 text-primary-400 border border-primary-500/30">
                            Mojang Verified
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-neutral-500 font-mono truncate">
                        UUID: {verifiedPlayer.uuid.slice(0, 16)}...
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {lookupError && (
                <div className="p-2 rounded-lg bg-amber-950/30 border border-amber-800/40 text-[11px] text-amber-300 font-mono flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  <span>{lookupError}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={!newFriendName.trim() || isValidatingPlayer}
                className="w-full py-2 rounded-xl bg-primary-500 hover:bg-primary-400 text-neutral-950 font-bold text-xs shadow-lg transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                <UserPlus size={14} />
                <span>Add Friend</span>
              </button>
            </form>
          </div>
        )}

        {/* INLINE DIRECT CHAT MODAL OVERLAY */}
        {activeChatFriend && (
          <div className="absolute inset-0 bg-neutral-950/95 z-20 flex flex-col p-3 animate-in fade-in zoom-in-95 duration-150">
            {/* Chat header */}
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <div className="flex items-center gap-2">
                <img
                  src={activeChatFriend.avatarUrl}
                  alt="avatar"
                  className="w-6 h-6 rounded-md object-cover"
                />
                <div>
                  <span className="text-xs font-bold text-neutral-100">
                    {activeChatFriend.username}
                  </span>
                  <span className="text-[10px] text-primary-400 ml-1.5 font-mono">
                    {activeChatFriend.status}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setActiveChatFriend(null)}
                className="p-1 rounded text-neutral-400 hover:text-neutral-200 hover:bg-white/10 cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>

            {/* Chat messages */}
            <div className="flex-1 overflow-y-auto py-2.5 space-y-2 text-xs">
              {(messages[activeChatFriend.id] || []).map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${msg.isMe ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[80%] px-3 py-1.5 rounded-xl ${
                      msg.isMe
                        ? 'bg-primary-500 text-neutral-950 font-medium rounded-br-none'
                        : 'bg-neutral-800 text-neutral-200 rounded-bl-none'
                    }`}
                  >
                    <span>{msg.text}</span>
                  </div>
                  <span className="text-[9px] text-neutral-400 font-mono mt-0.5 px-1">
                    {msg.time}
                  </span>
                </div>
              ))}
            </div>

            {/* Chat input form */}
            <form onSubmit={handleSendMessage} className="pt-2 border-t border-white/10 flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder={`Whisper to ${activeChatFriend.username}...`}
                autoFocus
                className="flex-1 px-3 py-1.5 bg-neutral-900 border border-white/10 rounded-xl text-xs text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-primary-500"
              />
              <button
                type="submit"
                disabled={!chatInput.trim()}
                className="p-2 rounded-xl bg-primary-500 hover:bg-primary-400 text-neutral-950 disabled:opacity-40 transition-colors cursor-pointer"
              >
                <Send size={13} />
              </button>
            </form>
          </div>
        )}
      </div>
    </motion.div>
  );
};
