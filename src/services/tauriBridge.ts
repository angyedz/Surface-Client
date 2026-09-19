/**
 * Tauri Bridge Service for Surface Client
 * Provides safe abstractions for Tauri v2 native features:
 * Window controls, IPC commands, and native system monitoring.
 */

import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';

export const isTauri = (): boolean => {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
};

export interface SystemSpecs {
  total_memory_mb: number;
  available_memory_mb: number;
  cpu_count: number;
  cpu_name: string;
  os_name: string;
  os_version: string;
}

/**
 * Minimize the native application window
 */
export async function minimizeWindow(): Promise<void> {
  if (isTauri()) {
    try {
      await getCurrentWindow().minimize();
    } catch (err) {
      console.warn('Failed to minimize window:', err);
    }
  }
}

/**
 * Toggle Maximize / Restore the native application window
 */
export async function toggleMaximizeWindow(): Promise<void> {
  if (isTauri()) {
    try {
      await getCurrentWindow().toggleMaximize();
    } catch (err) {
      console.warn('Failed to toggle maximize window:', err);
    }
  }
}

/**
 * Close the native application window
 */
export async function closeWindow(): Promise<void> {
  if (isTauri()) {
    try {
      await getCurrentWindow().close();
    } catch (err) {
      console.warn('Failed to close window:', err);
    }
  }
}

/**
 * Fetch native host system hardware specs (RAM, CPU cores, OS)
 */
export async function fetchSystemSpecs(): Promise<SystemSpecs | null> {
  if (isTauri()) {
    try {
      return await invoke<SystemSpecs>('get_system_specs');
    } catch (err) {
      console.warn('Failed to invoke get_system_specs:', err);
    }
  }
  return null;
}
