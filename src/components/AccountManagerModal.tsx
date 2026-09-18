import React, { useState, useEffect } from 'react';
import {
  X,
  User,
  ShieldCheck,
  Plus,
  Trash2,
  Check,
  AlertCircle,
  WifiOff,
  ArrowRight,
} from 'lucide-react';
import { PlayerAccount } from '../types/launcher';
import { createOfflineAccount } from '../services/playerApi';
import { signInWithMicrosoft, DeviceCodeStart } from '../services/launcherCore';

interface AccountManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: PlayerAccount[];
  activeAccount?: PlayerAccount | null;
  onSelectAccount: (account: PlayerAccount) => void;
  onAddAccount: (account: PlayerAccount) => void;
  onDeleteAccount: (accountId: string) => void;
}

export const AccountManagerModal: React.FC<AccountManagerModalProps> = ({
  isOpen,
  onClose,
  accounts,
  activeAccount,
  onSelectAccount,
  onAddAccount,
  onDeleteAccount,
}) => {
  const [activeTab, setActiveTab] = useState<'offline' | 'licensed'>('offline');
  const [deviceCode, setDeviceCode] = useState<DeviceCodeStart | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [offlineName, setOfflineName] = useState('');
  const [licenseError, setLicenseError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCreateOffline = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = offlineName.trim();
    if (!clean) return;

    const newAccount = createOfflineAccount(clean);
    onAddAccount(newAccount);
    setOfflineName('');
  };

  const handleMicrosoftSignIn = async () => {
    setIsSigningIn(true);
    setLicenseError(null);
    try {
      const session = await signInWithMicrosoft(setDeviceCode);
      onAddAccount({
        id: `acc_ms_${session.uuid}`,
        username: session.username,
        type: 'microsoft',
        uuid: session.uuid,
        avatarUrl: `https://mc-heads.net/avatar/${session.uuid}/64`,
        skinUrl: `https://mc-heads.net/skin/${session.uuid}`,
        createdAt: Date.now(),
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
        expiresAt: session.expires_at,
      });
    } catch (error: any) {
      setLicenseError(error?.message || String(error));
    } finally {
      setIsSigningIn(false);
      setDeviceCode(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="glass-heavy rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 border-b border-neutral-800 flex items-center justify-between bg-neutral-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary-500/20 border border-primary-500/40 flex items-center justify-center text-primary-400">
              <User size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-neutral-100 font-['Chakra_Petch'] flex items-center gap-2">
                <span>ACCOUNT & IDENTITY MANAGER</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-400 font-mono">
                  {accounts.length} {accounts.length === 1 ? 'account' : 'accounts'}
                </span>
              </h2>
              <p className="text-xs text-neutral-400">
                Переключайтесь между профилями или добавляйте оффлайн и лицензионные аккаунты
              </p>
            </div>
          </div>

          {accounts.length > 0 && (
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-neutral-100 transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Section: Existing Accounts */}
          <div>
            <div className="text-xs font-mono uppercase tracking-wider text-neutral-400 mb-3 flex items-center justify-between">
              <span>Сохраненные аккаунты</span>
              <span className="text-[11px] text-neutral-500 font-sans">
                Кликните для переключения
              </span>
            </div>

            {accounts.length === 0 ? (
              <div className="p-6 rounded-2xl bg-neutral-950/60 border border-dashed border-neutral-800 text-center space-y-2">
                <div className="text-sm font-semibold text-neutral-300">Нет добавленных аккаунтов</div>
                <p className="text-xs text-neutral-500">
                  Создайте оффлайн аккаунт без валидаций или привяжите лицензию Mojang ниже.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {accounts.map((acc) => {
                  const isActive = activeAccount?.id === acc.id;
                  const isOffline = acc.type === 'offline';

                  return (
                    <div
                      key={acc.id}
                      onClick={() => onSelectAccount(acc)}
                      className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between group ${
                        isActive
                          ? 'bg-primary-900/40 border-primary-500/80 shadow-lg shadow-primary-900/20'
                          : 'bg-neutral-950/70 border-neutral-800/80 hover:border-neutral-700'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <img
                          src={acc.avatarUrl || `https://mc-heads.net/avatar/${acc.username}/40`}
                          alt={acc.username}
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).src = 'https://mc-heads.net/avatar/MHF_Steve/40';
                          }}
                          className="w-10 h-10 rounded-xl bg-neutral-900 object-cover ring-1 ring-white/10 flex-shrink-0"
                        />
                        <div className="truncate">
                          <div className="font-bold text-xs text-neutral-100 flex items-center gap-1.5 truncate">
                            <span className="truncate">{acc.username}</span>
                            {isActive && (
                              <span className="w-1.5 h-1.5 rounded-full bg-primary-400 flex-shrink-0" />
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {isOffline ? (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-semibold bg-neutral-800 text-neutral-400 border border-neutral-700">
                                OFFLINE
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-semibold bg-primary-500/20 text-primary-400 border border-primary-500/30 flex items-center gap-1">
                                <ShieldCheck size={10} />
                                <span>MOJANG</span>
                              </span>
                            )}
                            <span className="text-[10px] text-neutral-500 font-mono truncate max-w-[90px]">
                              {acc.uuid.slice(0, 8)}...
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {isActive ? (
                          <span className="px-2 py-1 rounded-lg bg-primary-500/20 text-primary-400 text-[10px] font-bold">
                            Active
                          </span>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteAccount(acc.id);
                            }}
                            className="p-1.5 rounded-lg text-neutral-500 hover:text-red-400 hover:bg-red-950/40 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                            title="Удалить аккаунт" aria-label="Удалить аккаунт"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Section: Add New Account */}
          <div className="pt-2 border-t border-neutral-800/80">
            <div className="text-xs font-mono uppercase tracking-wider text-neutral-400 mb-3">
              Добавить новый аккаунт
            </div>

            {/* Account Type Tabs */}
            <div className="flex rounded-xl bg-neutral-950 p-1 border border-neutral-800 mb-4">
              <button
                type="button"
                onClick={() => setActiveTab('offline')}
                className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  activeTab === 'offline'
                    ? 'bg-neutral-800 text-white shadow-sm'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                <WifiOff size={14} />
                <span>Offline / Пиратский (Без валидаций)</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('licensed')}
                className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  activeTab === 'licensed'
                    ? 'bg-primary-500/20 border border-primary-500/40 text-primary-300 shadow-sm'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                <ShieldCheck size={14} />
                <span>Mojang Лицензия (С проверкой)</span>
              </button>
            </div>

            {/* Offline Tab Form */}
            {activeTab === 'offline' && (
              <form onSubmit={handleCreateOffline} className="space-y-4">
                <div className="p-4 rounded-2xl bg-neutral-950/60 border border-neutral-800/80 space-y-3">
                  <div className="text-xs text-neutral-400 leading-relaxed">
                    Для оффлайн аккаунта не требуется пароль и проверка Mojang. Вы можете ввести любой никнейм и мгновенно начать играть.
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-neutral-900 border border-neutral-800 flex items-center justify-center overflow-hidden flex-shrink-0">
                      {offlineName.trim() ? (
                        <img
                          src={`https://mc-heads.net/avatar/${offlineName.trim()}/48`}
                          alt="Skin Head"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).src = 'https://mc-heads.net/avatar/MHF_Steve/48';
                          }}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <User size={20} className="text-neutral-600" />
                      )}
                    </div>

                    <div className="flex-1">
                      <input
                        type="text"
                        placeholder="Введите любой никнейм (например, Player_1, Notch...)"
                        value={offlineName}
                        onChange={(e) => setOfflineName(e.target.value)}
                        autoFocus
                        maxLength={16}
                        className="w-full px-3.5 py-2.5 bg-neutral-900 border border-neutral-700 focus:border-primary-500 rounded-xl text-xs text-neutral-100 font-mono outline-none"
                      />
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={!offlineName.trim()}
                  className="w-full py-2.5 rounded-xl bg-neutral-100 hover:bg-white text-neutral-950 font-bold text-xs shadow-md transition-all cursor-pointer disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  <Plus size={15} />
                  <span>Создать оффлайн аккаунт</span>
                </button>
              </form>
            )}

            {/* Licensed Tab Form */}
            {activeTab === 'licensed' && (
              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-neutral-950/60 border border-neutral-800/80 space-y-3">
                  <div className="text-xs text-neutral-400 leading-relaxed">
                    Вход выполняется через Microsoft: лаунчер покажет код, вы вводите его на
                    странице Microsoft в браузере. Пароль в лаунчер не вводится.
                  </div>

                  {deviceCode && (
                    <div className="p-3.5 rounded-xl bg-primary-900/30 border border-primary-500/40 space-y-2">
                      <div className="text-[11px] text-neutral-300">
                        Откройте{' '}
                        <a
                          href={deviceCode.verification_uri}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary-300 underline"
                        >
                          {deviceCode.verification_uri}
                        </a>{' '}
                        и введите код:
                      </div>
                      <div className="font-mono text-lg font-bold tracking-[0.2em] text-primary-200">
                        {deviceCode.user_code}
                      </div>
                      <div className="text-[10px] text-neutral-400">Ожидание подтверждения…</div>
                    </div>
                  )}

                  {licenseError && (
                    <div className="p-3.5 rounded-xl bg-red-950/30 border border-red-800/60 text-xs text-red-300 flex items-center gap-2">
                      <AlertCircle size={14} className="text-red-400 flex-shrink-0" />
                      <span>{licenseError}</span>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleMicrosoftSignIn}
                  disabled={isSigningIn}
                  className="w-full py-2.5 rounded-xl btn-primary font-bold text-xs flex items-center justify-center gap-2 disabled:opacity-40"
                >
                  <ShieldCheck size={16} />
                  <span>{isSigningIn ? 'Ожидание Microsoft…' : 'Войти через Microsoft'}</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-neutral-800 bg-neutral-950/60 flex items-center justify-between text-xs text-neutral-500">
          <span>Surface Client Account Subsystem</span>
          {accounts.length > 0 && (
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-medium cursor-pointer"
            >
              Закрыть
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
