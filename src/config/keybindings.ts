import { KeybindingItem } from '../types/launcher';

/**
 * The launcher's own shortcuts. These are application configuration, not
 * content: they ship with the app and are the baseline every user's custom
 * bindings are reset to.
 */
export const DEFAULT_KEYBINDINGS: KeybindingItem[] = [
  {
    id: 'toggle_console',
    name: 'Toggle Developer Console',
    description: 'Open or close the live Minecraft JVM log console and process telemetry',
    category: 'Game & Launch',
    keys: ['F12'],
    defaultKeys: ['F12'],
  },
  {
    id: 'quick_launch',
    name: 'Quick Launch / Stop Game',
    description: 'Spawn the active Minecraft instance or terminate active process',
    category: 'Game & Launch',
    keys: ['F5'],
    defaultKeys: ['F5'],
  },
  {
    id: 'toggle_fullscreen',
    name: 'Toggle Fullscreen Mode',
    description: 'Switch between windowed and fullscreen',
    category: 'Tools & Display',
    keys: ['F11'],
    defaultKeys: ['F11'],
  },
  {
    id: 'open_modrinth',
    name: 'Open Modrinth Store',
    description: 'Navigate to Modrinth mods, shaders, and resource packs catalog',
    category: 'Navigation',
    keys: ['Ctrl', 'M'],
    defaultKeys: ['Ctrl', 'M'],
  },
  {
    id: 'open_instances',
    name: 'Open Instances & Packs',
    description: 'Navigate to instance manager and modpack profiles overview',
    category: 'Navigation',
    keys: ['Ctrl', 'I'],
    defaultKeys: ['Ctrl', 'I'],
  },
  {
    id: 'open_skins',
    name: 'Open 3D Skin Studio',
    description: 'Open the 3D voxel skin studio and cape customizer',
    category: 'Navigation',
    keys: ['Ctrl', 'K'],
    defaultKeys: ['Ctrl', 'K'],
  },
  {
    id: 'open_settings',
    name: 'Open Launch Settings',
    description: 'Access hardware RAM allocation, JVM flags, and Java binaries',
    category: 'Navigation',
    keys: ['Ctrl', ','],
    defaultKeys: ['Ctrl', ','],
  },
  {
    id: 'open_screenshots',
    name: 'In-Game Screenshots Gallery',
    description: 'Jump to the instance screenshots gallery and photo manager',
    category: 'Tools & Display',
    keys: ['Ctrl', 'G'],
    defaultKeys: ['Ctrl', 'G'],
  },
  {
    id: 'export_modpack',
    name: 'Export Active Modpack (.mrpack)',
    description: 'Package the current instance profile and mods into a standard .mrpack file',
    category: 'Tools & Display',
    keys: ['Ctrl', 'E'],
    defaultKeys: ['Ctrl', 'E'],
  },
];
