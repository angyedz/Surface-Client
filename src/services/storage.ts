/**
 * Versioned local storage for launcher state.
 *
 * Earlier builds shipped sample instances, friends and screenshots that were
 * later removed by matching on their contents. That guesswork is replaced by a
 * schema version: when it changes, everything the launcher owns is cleared once
 * and rebuilt from real data.
 */

const SCHEMA_VERSION = 3;
const VERSION_KEY = 'surface_schema_version';
const PREFIX = 'surface_';

export const StorageKeys = {
  instances: 'surface_instances',
  activeInstance: 'surface_active_instance_id',
  accounts: 'surface_accounts',
  activeAccount: 'surface_active_account_id',
  username: 'surface_username',
  skins: 'surface_skins',
  friends: 'surface_friends_list',
  keybindings: 'surface_keybindings',
  weeklyPlaytime: 'surface_weekly_playtime',
  newsLikes: 'surface_news_user_likes',
} as const;

/** Drops state written by an incompatible earlier schema. Runs once per upgrade. */
export function migrateStorage(): void {
  try {
    const stored = Number(localStorage.getItem(VERSION_KEY) || '0');
    if (stored === SCHEMA_VERSION) return;

    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith(PREFIX) && key !== VERSION_KEY) {
        keys.push(key);
      }
    }
    keys.forEach((key) => localStorage.removeItem(key));
    localStorage.setItem(VERSION_KEY, String(SCHEMA_VERSION));
  } catch (error) {
    console.warn('Storage migration skipped:', error);
  }
}

export function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch (error) {
    console.warn(`Could not read ${key}:`, error);
    return fallback;
  }
}

export function saveJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`Could not persist ${key}:`, error);
  }
}

export function loadString(key: string, fallback = ''): string {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function saveString(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    console.warn(`Could not persist ${key}:`, error);
  }
}
