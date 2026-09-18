import React from 'react';
import {
  Zap,
  Cpu,
  Gem,
  Swords,
  Rocket,
  Sparkles,
  Map,
  Leaf,
  Shield,
  Box,
  Flame,
  Terminal,
  Compass,
  Package,
  Layers,
  Wrench,
  Gamepad2,
  Folder,
  Hammer,
  Mountain,
  Star,
  LucideProps,
} from 'lucide-react';

const ICON_MAP: Record<string, React.ComponentType<LucideProps>> = {
  zap: Zap,
  cpu: Cpu,
  gem: Gem,
  swords: Swords,
  rocket: Rocket,
  sparkles: Sparkles,
  map: Map,
  leaf: Leaf,
  shield: Shield,
  box: Box,
  flame: Flame,
  terminal: Terminal,
  compass: Compass,
  package: Package,
  layers: Layers,
  wrench: Wrench,
  gamepad: Gamepad2,
  folder: Folder,
  hammer: Hammer,
  mountain: Mountain,
  star: Star,
  // Emoji fallbacks to prevent any emoji from ever rendering:
  '⚡': Zap,
  '⚙️': Cpu,
  '💎': Gem,
  '⚔️': Swords,
  '🚀': Rocket,
  '✨': Sparkles,
  '🌟': Star,
  '🔮': Sparkles,
  '🗺️': Map,
  '🌿': Leaf,
  '🛡️': Shield,
  '📦': Box,
  '🔥': Flame,
  '📁': Folder,
  '💻': Terminal,
  '🎮': Gamepad2,
};

interface InstanceIconProps {
  icon?: string;
  className?: string;
  size?: number;
}

export const InstanceIcon: React.FC<InstanceIconProps> = ({
  icon = 'box',
  className = 'text-primary-400',
  size = 20,
}) => {
  const normalizedKey = (icon || 'box').toLowerCase().trim();
  const IconComponent = ICON_MAP[normalizedKey] || ICON_MAP[icon] || Box;

  return <IconComponent size={size} className={className} />;
};

export const AVAILABLE_INSTANCE_ICONS = [
  { id: 'rocket', label: 'Rocket', component: Rocket },
  { id: 'zap', label: 'Lightning', component: Zap },
  { id: 'cpu', label: 'Processor', component: Cpu },
  { id: 'gem', label: 'Diamond', component: Gem },
  { id: 'swords', label: 'Swords', component: Swords },
  { id: 'sparkles', label: 'Magic', component: Sparkles },
  { id: 'map', label: 'Adventure', component: Map },
  { id: 'leaf', label: 'Nature', component: Leaf },
  { id: 'shield', label: 'Shield', component: Shield },
  { id: 'box', label: 'Package', component: Box },
  { id: 'flame', label: 'Flame', component: Flame },
  { id: 'terminal', label: 'Terminal', component: Terminal },
];
