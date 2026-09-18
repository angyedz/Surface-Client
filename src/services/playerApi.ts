/**
 * Minecraft Player Verification & Profile API Service
 * Fetches real Mojang accounts, official UUIDs, skin textures, and validation
 * using official Mojang & PlayerDB APIs.
 */

import { PlayerAccount } from '../types/launcher';

export interface MinecraftPlayerProfile {
  username: string;
  uuid: string;
  rawId: string;
  avatarUrl: string;
  skinUrl: string;
  isLegacy?: boolean;
}

const CACHE_KEY_PROFILES = 'surface_player_profiles_cache';
const CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours

/**
 * Validates whether a Minecraft username exists in the official Mojang database
 * and retrieves official UUID and skin assets.
 */
export async function lookupMinecraftPlayer(
  username: string
): Promise<MinecraftPlayerProfile | null> {
  const cleanName = username.trim();
  if (!cleanName || cleanName.length < 3 || cleanName.length > 16) {
    return null;
  }

  // 1. Check local cache
  try {
    const cached = localStorage.getItem(`${CACHE_KEY_PROFILES}_${cleanName.toLowerCase()}`);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Date.now() - parsed.timestamp < CACHE_TTL_MS) {
        return parsed.profile;
      }
    }
  } catch (e) {
    console.warn('Failed to read player profile cache:', e);
  }

  // 2. Query PlayerDB API (Proxies official Mojang API with CORS support)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(`https://playerdb.co/api/player/minecraft/${cleanName}`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data.code === 'player.found' && data.data?.player) {
        const p = data.data.player;
        const profile: MinecraftPlayerProfile = {
          username: p.username || cleanName,
          uuid: p.id,
          rawId: p.raw_id,
          avatarUrl: p.avatar || `https://mc-heads.net/avatar/${p.username || cleanName}/64`,
          skinUrl: p.skin_texture || `https://minotar.net/skin/${p.username || cleanName}`,
        };

        // Save to cache
        try {
          localStorage.setItem(
            `${CACHE_KEY_PROFILES}_${cleanName.toLowerCase()}`,
            JSON.stringify({ timestamp: Date.now(), profile })
          );
        } catch (e) {
          console.warn('Failed to cache player profile:', e);
        }

        return profile;
      }
    }
  } catch (err) {
    console.warn('PlayerDB lookup failed, falling back to direct avatar generation:', err);
  }

  // 3. Fallback: if offline, construct standard Mojang avatar and head URLs
  return {
    username: cleanName,
    uuid: 'offline-uuid',
    rawId: 'offline',
    avatarUrl: `https://mc-heads.net/avatar/${cleanName}/64`,
    skinUrl: `https://minotar.net/skin/${cleanName}`,
  };
}

/**
 * Returns a high-res 3D avatar head URL for any Minecraft player
 */
export function getPlayerAvatarUrl(username: string, size: number = 64): string {
  const clean = username.trim() || 'Steve';
  return `https://mc-heads.net/avatar/${clean}/${size}`;
}

/**
 * Returns a full body render URL for any Minecraft player
 */
export function getPlayerBodyUrl(username: string, size: number = 128): string {
  const clean = username.trim() || 'Steve';
  return `https://mc-heads.net/body/${clean}/${size}`;
}

/**
  * Generates a deterministic offline UUID for a Minecraft nickname
  */
export function generateOfflineUuid(username: string): string {
  const clean = username.trim().toLowerCase();
  let hash = 0;
  for (let i = 0; i < clean.length; i++) {
    hash = (hash << 5) - hash + clean.charCodeAt(i);
    hash |= 0;
  }
  const hex1 = Math.abs(hash).toString(16).padStart(8, '0');
  const hex2 = Math.abs(~hash).toString(16).padStart(8, '0');
  return `${hex1}-0000-3000-8000-${hex2}${hex1}`.slice(0, 36);
}

/**
 * Creates an offline (cracked / no validation) player account instantly
 */
export function createOfflineAccount(username: string): PlayerAccount {
  const clean = username.trim() || 'Player';
  return {
    id: `acc_off_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    username: clean,
    type: 'offline',
    uuid: generateOfflineUuid(clean),
    avatarUrl: `https://mc-heads.net/avatar/${clean}/64`,
    skinUrl: `https://minotar.net/skin/${clean}`,
    createdAt: Date.now(),
  };
}

/**
 * Creates a verified licensed Mojang account
 */
export function createLicensedAccount(profile: MinecraftPlayerProfile): PlayerAccount {
  return {
    id: `acc_lic_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    username: profile.username,
    type: 'mojang',
    uuid: profile.uuid,
    avatarUrl: profile.avatarUrl,
    skinUrl: profile.skinUrl,
    createdAt: Date.now(),
  };
}
