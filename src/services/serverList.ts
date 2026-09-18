/**
 * The saved server list.
 *
 * Servers are whatever the user adds; the launcher ships with none. Their live
 * player counts, MOTD and latency come from a real Server List Ping, never from
 * stored numbers.
 */

import { QuickServer } from '../types/launcher';
import { loadJson, saveJson } from './storage';

const STORAGE_KEY = 'surface_servers_list';

export function loadServers(): QuickServer[] {
  return loadJson<QuickServer[]>(STORAGE_KEY, []);
}

export function saveServers(servers: QuickServer[]): void {
  saveJson(STORAGE_KEY, servers);
}

/** Builds an entry from the address the user typed. */
export function createServerEntry(name: string, address: string): QuickServer {
  const cleanAddress = address.trim().replace(/^\w+:\/\//, '');
  const cleanName = name.trim() || cleanAddress;
  return {
    id: `srv_${cleanAddress.toLowerCase()}`,
    name: cleanName,
    ip: cleanAddress,
    // The first two letters stand in until the server's own favicon arrives.
    shortLabel: cleanName.slice(0, 2).toUpperCase(),
    badgeColor: 'from-primary-600 to-primary-900',
    playersOnline: 0,
    maxPlayers: 0,
    pingMs: 0,
    description: '',
    iconType: 'custom',
    category: 'all',
  };
}
