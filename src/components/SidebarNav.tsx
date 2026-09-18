import React from 'react';
import {
  Gamepad2,
  Package,
  Compass,
  Sliders,
  Shirt,
  Newspaper,
  ListChecks,
} from 'lucide-react';
import { InstanceProfile, NavigationTab } from '../types/launcher';

interface SidebarNavProps {
  activeTab: NavigationTab;
  onSelectTab: (tab: NavigationTab) => void;
  activeInstance?: InstanceProfile | null;
}

export const SidebarNav: React.FC<SidebarNavProps> = ({
  activeTab,
  onSelectTab,
  activeInstance,
}) => {
  const navItems: {
    id: NavigationTab;
    label: string;
    icon: React.ReactNode;
  }[] = [
    {
      id: 'play',
      label: 'Launchpad',
      icon: <Gamepad2 size={18} />,
    },
    {
      id: 'instances',
      label: 'Instances',
      icon: <Package size={18} />,
    },
    {
      id: 'modrinth',
      label: 'Mods',
      icon: <Compass size={18} />,
    },
    {
      id: 'installed_mods',
      label: 'Installed Mods',
      icon: <ListChecks size={18} />,
    },
    {
      id: 'skins',
      label: 'Wardrobe',
      icon: <Shirt size={18} />,
    },
    {
      id: 'news',
      label: 'News',
      icon: <Newspaper size={18} />,
    },
  ];

  return (
    <aside className="w-16 lg:w-48 glass-bar border-r flex flex-col justify-between p-2 select-none z-20">
      {/* Navigation Items */}
      <div className="space-y-1">
        <div className="hidden lg:block px-3 py-1.5 text-[11px] font-medium text-neutral-500 uppercase tracking-wider">
          Menu
        </div>

        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={`w-full flex items-center justify-center lg:justify-start gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                isActive
                  ? 'bg-primary-500/15 text-primary-300 border border-primary-500/30'
                  : 'text-neutral-400 hover:text-neutral-200 hover:bg-white/5 border border-transparent'
              }`}
              title={item.label}
            >
              <span className={isActive ? 'text-primary-400' : 'text-neutral-400'}>
                {item.icon}
              </span>
              <span className="hidden lg:inline">{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Bottom Section: Settings */}
      <div className="pt-2 border-t border-white/5 space-y-1">
        <button
          onClick={() => onSelectTab('settings')}
          className={`w-full flex items-center justify-center lg:justify-start gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all cursor-pointer ${
            activeTab === 'settings'
              ? 'bg-primary-500/15 text-primary-300 border border-primary-500/30'
              : 'text-neutral-400 hover:text-neutral-200 hover:bg-white/5 border border-transparent'
          }`}
          title="Settings" aria-label="Settings"
        >
          <Sliders size={18} />
          <span className="hidden lg:inline">Settings</span>
        </button>

        <div className="hidden lg:block px-3 py-1 text-[10px] text-neutral-600 font-mono">
          Surface 3.4
        </div>
      </div>
    </aside>
  );
};
