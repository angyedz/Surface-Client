import { QuickServer } from '../types/launcher';
import { isTauri, pingServer } from './launcherCore';

export interface LiveServerStatus {
  isOnline: boolean;
  playersOnline: number;
  maxPlayers: number;
  pingMs: number;
  motdClean: string;
  iconBase64?: string;
  versionName?: string;
}

const SERVER_CACHE: Record<string, { data: LiveServerStatus; timestamp: number }> = {};
const CACHE_TTL_MS = 1000 * 30; // 30 seconds cache for live server status

/**
 * Fetches real, live Minecraft server status (players online, max players, ping, MOTD, and favicon)
 */
/**
 * Live status for one server.
 *
 * In the desktop app this is a real Server List Ping from the native core, so
 * the latency shown is the launcher's own round trip. In the browser preview
 * there is no socket available and a public status API stands in.
 */
export async function fetchLiveServerStatus(ip: string): Promise<LiveServerStatus> {
  const cleanIp = ip.trim().toLowerCase();

  const cached = SERVER_CACHE[cleanIp];
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const offline: LiveServerStatus = {
    isOnline: false,
    playersOnline: 0,
    maxPlayers: 0,
    pingMs: 0,
    motdClean: 'Server offline or unreachable.',
  };

  try {
    if (isTauri()) {
      const status = await pingServer(cleanIp);
      const result: LiveServerStatus = status.online
        ? {
            isOnline: true,
            playersOnline: status.players_online ?? 0,
            maxPlayers: status.players_max ?? 0,
            pingMs: status.latency_ms ?? 0,
            motdClean: status.motd || '',
            iconBase64: status.favicon,
            versionName: status.version_name,
          }
        : { ...offline, motdClean: status.error || offline.motdClean };

      SERVER_CACHE[cleanIp] = { data: result, timestamp: Date.now() };
      return result;
    }

    const startTime = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const response = await fetch(
      `https://api.mcstatus.io/v2/status/java/${encodeURIComponent(cleanIp)}`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);

    if (response.ok) {
      const data = await response.json();
      if (data.online) {
        const result: LiveServerStatus = {
          isOnline: true,
          playersOnline: data.players?.online ?? 0,
          maxPlayers: data.players?.max ?? 0,
          pingMs: Date.now() - startTime,
          motdClean: data.motd?.clean || data.motd?.raw || '',
          iconBase64: data.icon || undefined,
          versionName: data.version?.name_clean || data.version?.name_raw,
        };
        SERVER_CACHE[cleanIp] = { data: result, timestamp: Date.now() };
        return result;
      }
    }
  } catch (error) {
    console.warn(`Could not reach ${cleanIp}:`, error);
  }

  SERVER_CACHE[cleanIp] = { data: offline, timestamp: Date.now() };
  return offline;
}

/**
 * Enriches an array of servers with real-time ping and player counts in parallel
 */
export async function refreshAllServersStatus(servers: QuickServer[]): Promise<QuickServer[]> {
  const updated = await Promise.all(
    servers.map(async (server) => {
      try {
        const status = await fetchLiveServerStatus(server.ip);
        if (status.isOnline) {
          return {
            ...server,
            isOnline: true,
            playersOnline: status.playersOnline,
            maxPlayers: status.maxPlayers,
            pingMs: status.pingMs,
            description: status.motdClean || server.description,
            iconBase64: status.iconBase64,
            versionName: status.versionName,
            lastChecked: Date.now(),
          };
        } else {
          return {
            ...server,
            isOnline: false,
            pingMs: 999,
            lastChecked: Date.now(),
          };
        }
      } catch (e) {
        return server;
      }
    })
  );

  return updated;
}
