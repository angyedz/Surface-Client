import React, { useState, useEffect, useTransition } from 'react';
import {
  Search,
  Download,
  Check,
  Filter,
  ExternalLink,
  Sparkles,
  Layers,
  Heart,
  Calendar,
  AlertCircle,
  HelpCircle,
  X,
  FileCode,
  ShieldAlert,
  Star,
  Zap,
  Cpu,
  Compass,
  Leaf,
  Wrench,
  BookOpen,
  Box,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { useEscapeKey } from '../hooks/useDismissable';
import { ModrinthProject, ModrinthVersion, InstanceProfile, ModLoader, MinecraftVersion } from '../types/launcher';
import { searchModrinthProjects, getModrinthProject, getProjectVersions, SearchFilters } from '../services/modrinthApi';
import { fetchOfficialMinecraftVersions } from '../services/mojangApi';
import { resolveModDependency } from '../services/dependencySolver';

interface ModrinthBrowserProps {
  activeInstance?: InstanceProfile | null;
  onInstallMod: (modrinthProject: ModrinthProject, version?: ModrinthVersion, autoDependencies?: boolean) => Promise<void>;
  onUninstallMod?: (modrinthIdOrSlug: string) => void;
  isInstallingModId?: string | null;
}

export const ModrinthBrowser: React.FC<ModrinthBrowserProps> = ({
  activeInstance,
  onInstallMod,
  onUninstallMod,
  isInstallingModId,
}) => {
  // Filter options follow Mojang's live manifest, not a bundled list.
  const [gameVersions, setGameVersions] = useState<MinecraftVersion[]>([]);

  useEffect(() => {
    fetchOfficialMinecraftVersions()
      .then((versions) => setGameVersions(versions.filter((v) => v.type === 'release')))
      .catch((error) => console.warn('Could not load Minecraft versions:', error));
  }, []);

  const [searchQuery, setSearchQuery] = useState('');
  const [projectType, setProjectType] = useState<'mod' | 'resourcepack' | 'shader' | 'modpack'>('mod');
  const [filterVersion, setFilterVersion] = useState<string>(activeInstance?.mcVersion || 'all');
  const [filterLoader, setFilterLoader] = useState<ModLoader | 'all'>(activeInstance?.loader || 'all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterPopularity, setFilterPopularity] = useState<string>('all');
  const [filterRating, setFilterRating] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'downloads' | 'relevance' | 'follows' | 'newest'>('downloads');

  const [projects, setProjects] = useState<ModrinthProject[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [searchOffset, setSearchOffset] = useState(0);
  const [totalHits, setTotalHits] = useState(0);

  // Selected project for detail modal
  const [selectedProject, setSelectedProject] = useState<ModrinthProject | null>(null);
  const [projectVersions, setProjectVersions] = useState<ModrinthVersion[]>([]);
  const [isLoadingVersions, setIsLoadingVersions] = useState(false);

  // Search execution
  const executeSearch = async (offset = 0, append = false) => {
    if (append) setIsLoadingMore(true);
    else setIsLoading(true);
    try {
      const filters: SearchFilters = {
        query: searchQuery,
        projectType,
        gameVersion: filterVersion === 'all' ? undefined : filterVersion,
        loader: filterLoader === 'all' ? undefined : (filterLoader as ModLoader),
        category: filterCategory === 'all' ? undefined : filterCategory,
        sortBy,
        limit: 24,
        offset,
      };
      const res = await searchModrinthProjects(filters);
      setProjects((previous) => (append ? [...previous, ...res.hits] : res.hits));
      setSearchOffset(offset);
      setTotalHits(res.total_hits);
    } catch (e) {
      console.error(e);
    } finally {
      if (append) setIsLoadingMore(false);
      else setIsLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchOffset(0);
      executeSearch(0, false);
    }, 280);
    return () => clearTimeout(timer);
  }, [searchQuery, projectType, filterVersion, filterLoader, filterCategory, sortBy]);

  const loadMoreProjects = () => {
    if (isLoading || isLoadingMore || projects.length >= totalHits) return;
    executeSearch(searchOffset + 24, true);
  };

  // Load project versions when opened in modal
  const handleOpenProjectModal = async (project: ModrinthProject) => {
    setSelectedProject(project);
    setIsLoadingVersions(true);
    try {
      const loaders = activeInstance?.loader && activeInstance.loader !== 'vanilla' ? [activeInstance.loader] : undefined;
      const mcVersions = activeInstance?.mcVersion ? [activeInstance.mcVersion] : undefined;
      const versions = await getProjectVersions(
        project.project_id,
        loaders,
        mcVersions
      );
      setProjectVersions(versions);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingVersions(false);
    }
  };

  // Pre-install: directly install with automatic dependency resolution
  const handleInitiateInstall = (project: ModrinthProject) => {
    onInstallMod(project, undefined, true);
  };

  const isModInstalled = (project: ModrinthProject) => {
    return (
      activeInstance?.installedMods?.some(
        (m) =>
          m.modrinthId === project.project_id ||
          m.slug.toLowerCase() === project.slug.toLowerCase()
      ) ?? false
    );
  };

  const categoriesList = [
    { id: 'all', name: 'All Categories', icon: Filter },
    { id: 'optimization', name: 'Optimization', icon: Zap },
    { id: 'technology', name: 'Technology', icon: Cpu },
    { id: 'magic', name: 'Magic', icon: Sparkles },
    { id: 'adventure', name: 'Adventure', icon: Compass },
    { id: 'decoration', name: 'Decoration', icon: Leaf },
    { id: 'utility', name: 'Utility', icon: Wrench },
    { id: 'library', name: 'Library & API', icon: BookOpen },
    { id: 'storage', name: 'Storage', icon: Box },
  ];

  // Client-side filtering by popularity (downloads) and rating (followers)
  const displayedProjects = projects.filter((p) => {
    if (filterPopularity === '10m' && p.downloads < 10000000) return false;
    if (filterPopularity === '5m' && p.downloads < 5000000) return false;
    if (filterPopularity === '1m' && p.downloads < 1000000) return false;
    if (filterPopularity === '100k' && p.downloads < 100000) return false;

    if (filterRating === '50k' && p.followers < 50000) return false;
    if (filterRating === '20k' && p.followers < 20000) return false;
    if (filterRating === '5k' && p.followers < 5000) return false;
    if (filterRating === '1k' && p.followers < 1000) return false;

    return true;
  });

  const activeFiltersCount =
    (filterCategory !== 'all' ? 1 : 0) +
    (filterPopularity !== 'all' ? 1 : 0) +
    (filterRating !== 'all' ? 1 : 0) +
    (filterVersion !== 'all' && filterVersion !== activeInstance?.mcVersion ? 1 : 0) +
    (filterLoader !== 'all' && filterLoader !== (activeInstance?.loader || 'all') ? 1 : 0) +
    (searchQuery.trim() ? 1 : 0);

  const handleResetFilters = () => {
    setSearchQuery('');
    setFilterCategory('all');
    setFilterPopularity('all');
    setFilterRating('all');
    setFilterVersion(activeInstance?.mcVersion || 'all');
    setFilterLoader(activeInstance?.loader || 'all');
    setSortBy('downloads');
  };

  useEscapeKey(() => {
    setSelectedProject(null);
  }, Boolean(selectedProject));

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-neutral-950">
      {/* Top Search and Filters Bar */}
      <div className="p-5 border-b border-neutral-800/80 bg-neutral-900/60 space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search Modrinth mods, shaders, resource packs (e.g. Sodium, Iris, Create, JEI)..."
              className="w-full pl-10 pr-4 py-2.5 bg-neutral-950 border border-neutral-700/80 rounded-xl text-xs text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 font-mono"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Project Type Switcher */}
          <div className="flex items-center gap-1 bg-neutral-950 p-1 rounded-xl border border-neutral-800 text-xs">
            {(['mod', 'resourcepack', 'shader'] as const).map((type) => (
              <button
                key={type}
                onClick={() => setProjectType(type)}
                className={`px-3 py-1.5 rounded-lg font-medium capitalize transition-colors ${
                  projectType === type
                    ? 'bg-primary-500/20 text-primary-300 border border-primary-500/40 shadow-sm'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                {type === 'resourcepack' ? 'Resource Packs' : type === 'shader' ? 'Shaders' : 'Mods'}
              </button>
            ))}
          </div>
        </div>

        {/* Second Row Filters: Minecraft Version, Loader, Category, Rating, Popularity, Sort */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            {/* Version filter */}
            <div className="flex items-center gap-1.5 bg-neutral-950 px-2.5 py-1.5 rounded-lg border border-neutral-800 text-neutral-300">
              <span className="text-[11px] text-neutral-500 font-mono">MC:</span>
              <select
                value={filterVersion}
                onChange={(e) => setFilterVersion(e.target.value)}
                className="bg-transparent text-xs text-neutral-200 font-mono focus:outline-none cursor-pointer"
              >
                <option value="all">Any Version</option>
                {gameVersions.map((v) => (
                  <option key={v.id} value={v.id} className="bg-neutral-900 text-neutral-100">
                    {v.id} {activeInstance?.mcVersion && v.id === activeInstance.mcVersion ? '(Active)' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Loader filter */}
            <div className="flex items-center gap-1.5 bg-neutral-950 px-2.5 py-1.5 rounded-lg border border-neutral-800 text-neutral-300">
              <span className="text-[11px] text-neutral-500 font-mono">Loader:</span>
              <select
                value={filterLoader}
                onChange={(e) => setFilterLoader(e.target.value as any)}
                className="bg-transparent text-xs text-neutral-200 capitalize focus:outline-none cursor-pointer"
              >
                <option value="all">All Loaders</option>
                <option value="fabric" className="bg-neutral-900">Fabric</option>
                <option value="forge" className="bg-neutral-900">Forge</option>
                <option value="neoforge" className="bg-neutral-900">NeoForge</option>
                <option value="quilt" className="bg-neutral-900">Quilt</option>
              </select>
            </div>

            {/* Category filter */}
            <div className="flex items-center gap-1.5 bg-neutral-950 px-2.5 py-1.5 rounded-lg border border-neutral-800 text-neutral-300">
              <span className="text-[11px] text-neutral-500 font-mono">Category:</span>
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="bg-transparent text-xs text-neutral-200 focus:outline-none cursor-pointer"
              >
                {categoriesList.map((c) => (
                  <option key={c.id} value={c.id} className="bg-neutral-900 text-neutral-100">
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Rating / Followers filter dropdown */}
            <div className="flex items-center gap-1.5 bg-neutral-950 px-2.5 py-1.5 rounded-lg border border-neutral-800 text-neutral-300">
              <span className="text-[11px] text-neutral-500 font-mono flex items-center gap-1">
                <Heart size={11} className="text-neutral-400" /> Rating:
              </span>
              <select
                value={filterRating}
                onChange={(e) => setFilterRating(e.target.value)}
                className="bg-transparent text-xs text-neutral-200 focus:outline-none cursor-pointer"
              >
                <option value="all" className="bg-neutral-900">Any Rating</option>
                <option value="50k" className="bg-neutral-900">50K+ Followers (Top Tier)</option>
                <option value="20k" className="bg-neutral-900">20K+ Followers (Highly Rated)</option>
                <option value="5k" className="bg-neutral-900">5K+ Followers (Popular)</option>
                <option value="1k" className="bg-neutral-900">1K+ Followers (Community)</option>
              </select>
            </div>

            {/* Popularity / Downloads filter dropdown */}
            <div className="flex items-center gap-1.5 bg-neutral-950 px-2.5 py-1.5 rounded-lg border border-neutral-800 text-neutral-300">
              <span className="text-[11px] text-neutral-500 font-mono flex items-center gap-1">
                <Download size={11} className="text-primary-400" /> Popularity:
              </span>
              <select
                value={filterPopularity}
                onChange={(e) => setFilterPopularity(e.target.value)}
                className="bg-transparent text-xs text-neutral-200 focus:outline-none cursor-pointer"
              >
                <option value="all" className="bg-neutral-900">Any Popularity</option>
                <option value="10m" className="bg-neutral-900">10M+ Downloads</option>
                <option value="5m" className="bg-neutral-900">5M+ Downloads</option>
                <option value="1m" className="bg-neutral-900">1M+ Downloads</option>
                <option value="100k" className="bg-neutral-900">100K+ Downloads</option>
              </select>
            </div>
          </div>

          {/* Right side: Sort and Reset */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-neutral-950 px-2.5 py-1.5 rounded-lg border border-neutral-800 text-neutral-300">
              <span className="text-[11px] text-neutral-500 font-mono">Sort:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="bg-transparent text-xs text-neutral-200 focus:outline-none cursor-pointer"
              >
                <option value="downloads" className="bg-neutral-900">Most Downloads</option>
                <option value="relevance" className="bg-neutral-900">Relevance</option>
                <option value="follows" className="bg-neutral-900">Most Followers</option>
                <option value="newest" className="bg-neutral-900">Recently Updated</option>
              </select>
            </div>

            {activeFiltersCount > 0 && (
              <button
                onClick={handleResetFilters}
                className="px-2.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-[11px] font-semibold text-neutral-300 flex items-center gap-1 transition-colors cursor-pointer"
                title="Reset all active filters" aria-label="Reset all active filters"
              >
                <RotateCcw size={12} />
                <span>Reset ({activeFiltersCount})</span>
              </button>
            )}
          </div>
        </div>

        {/* Third Row: Quick Category Pills with SVG icons */}
        <div className="flex items-center gap-1.5 overflow-x-auto pt-1 pb-0.5 scrollbar-none">
          {categoriesList.map((cat) => {
            const IconComponent = cat.icon;
            const isSelected = filterCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setFilterCategory(cat.id)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-primary-500/20 border border-primary-500/50 text-primary-300 shadow-sm'
                    : 'bg-neutral-950 border border-neutral-800/80 text-neutral-400 hover:text-neutral-200 hover:border-neutral-700'
                }`}
              >
                <IconComponent size={13} />
                <span>{cat.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Grid View of Modrinth Projects */}
      <div className="flex-1 overflow-y-auto p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="text-xs font-mono text-neutral-400">
            Showing {displayedProjects.length} results {activeInstance ? `for ${activeInstance.name} (Minecraft ${activeInstance.mcVersion})` : ''}
          </div>
          {isLoading && (
            <div className="flex items-center gap-2 text-xs text-primary-400 font-mono">
              <div className="w-3.5 h-3.5 border-2 border-primary-400 border-t-transparent rounded-full animate-spin" />
              <span>Fetching Modrinth...</span>
            </div>
          )}
        </div>

        {displayedProjects.length === 0 && !isLoading ? (
          <div className="py-16 text-center space-y-3">
            <Filter size={36} className="mx-auto text-neutral-600" />
            <div className="text-sm font-semibold text-neutral-300">No mods found matching your filters</div>
            <p className="text-xs text-neutral-500 max-w-sm mx-auto">
              Try adjusting the category, rating, or popularity thresholds, or change the Minecraft version filter.
            </p>
            <button
              onClick={handleResetFilters}
              className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-xs font-semibold text-neutral-200 transition-colors cursor-pointer"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {displayedProjects.map((proj) => {
              const installed = isModInstalled(proj);
              const isInstalling = isInstallingModId === proj.project_id || isInstallingModId === proj.slug;

              return (
                <div
                  key={proj.project_id}
                  className="p-4 rounded-xl bg-neutral-900/80 hover:bg-neutral-900 border border-neutral-800/90 hover:border-neutral-700 transition-all flex flex-col justify-between group shadow-lg"
                >
                  <div className="space-y-3">
                    {/* Top Row: Icon, Title, Author */}
                    <div className="flex items-start gap-3">
                      {proj.icon_url ? (
                        <img
                          src={proj.icon_url}
                          alt={proj.title}
                          className="w-12 h-12 rounded-xl object-contain bg-neutral-950 p-1 border border-neutral-800 flex-shrink-0"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-neutral-800 border border-neutral-700 flex items-center justify-center font-bold text-sm text-primary-400 flex-shrink-0">
                          {proj.title.slice(0, 2)}
                        </div>
                      )}

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <h3
                            onClick={() => handleOpenProjectModal(proj)}
                            className="font-bold text-sm text-neutral-100 truncate group-hover:text-primary-400 cursor-pointer transition-colors"
                          >
                            {proj.title}
                          </h3>
                        </div>
                        <div className="text-[11px] text-neutral-400 truncate">
                          by <span className="text-neutral-300 font-medium">{proj.author}</span>
                        </div>

                        {/* Badges */}
                        <div className="flex items-center gap-2 mt-1 text-[10px] font-mono text-neutral-400">
                          <span className="flex items-center gap-1 text-primary-400/90">
                            <Download size={11} /> {(proj.downloads / 1000000).toFixed(1)}M
                          </span>
                          <span>•</span>
                          <span className="flex items-center gap-1 text-neutral-400/90">
                            <Heart size={11} /> {(proj.followers / 1000).toFixed(0)}k
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Description */}
                    <p className="text-xs text-neutral-300 line-clamp-2 leading-relaxed">
                      {proj.description}
                    </p>

                    {/* Categories Chips */}
                    <div className="flex flex-wrap gap-1">
                      {proj.categories.slice(0, 3).map((cat) => (
                        <span
                          key={cat}
                          className="px-2 py-0.5 rounded bg-neutral-950 text-neutral-400 border border-neutral-800 text-[10px] font-mono uppercase"
                        >
                          {cat}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Actions Footer */}
                  <div className="pt-4 mt-3 border-t border-neutral-800/80 flex items-center justify-between gap-2">
                    <button
                      onClick={() => handleOpenProjectModal(proj)}
                      className="text-xs text-neutral-400 hover:text-neutral-200 font-medium transition-colors"
                    >
                      Details & Changelog
                    </button>

                    {installed ? (
                      <div className="flex items-center gap-1.5">
                        <span className="px-3 py-1.5 rounded-lg bg-primary-900/60 border border-primary-900 text-primary-400 text-xs font-semibold flex items-center gap-1.5">
                          <Check size={14} />
                          <span>Installed</span>
                        </span>
                        {onUninstallMod && (
                          <button
                            onClick={() => onUninstallMod(proj.project_id || proj.slug)}
                            className="p-1.5 rounded-lg bg-neutral-800/80 hover:bg-red-950/60 text-neutral-400 hover:text-red-300 border border-neutral-700 hover:border-red-800 transition-colors cursor-pointer"
                            title={`Remove ${proj.title} from ${activeInstance?.name || 'Instance'}`}
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    ) : (
                      <button
                        onClick={() => handleInitiateInstall(proj)}
                        disabled={isInstalling}
                        className="px-3.5 py-1.5 rounded-lg bg-primary-500 hover:bg-primary-400 text-neutral-950 text-xs font-bold flex items-center gap-1.5 transition-colors shadow-md shadow-primary-900 cursor-pointer disabled:opacity-50"
                      >
                        {isInstalling ? (
                          <>
                            <div className="w-3.5 h-3.5 border-2 border-neutral-950 border-t-transparent rounded-full animate-spin" />
                            <span>Installing...</span>
                          </>
                        ) : (
                          <>
                            <Download size={14} />
                            <span>Install</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {projects.length > 0 && projects.length < totalHits && (
          <div className="flex justify-center pt-6">
            <button
              type="button"
              onClick={loadMoreProjects}
              disabled={isLoadingMore}
              className="px-5 py-2.5 rounded-xl bg-neutral-900 border border-neutral-700 text-xs font-semibold text-neutral-200 hover:bg-neutral-800 disabled:opacity-50 transition-colors"
            >
              {isLoadingMore ? 'Loading more…' : `Load more (${projects.length} / ${totalHits})`}
            </button>
          </div>
        )}
      </div>

      {/* Mod Detail Modal */}
      {selectedProject && (
        <div
          className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4"
          onMouseDown={(event) => {
            // Only a click on the backdrop itself closes the dialog.
            if (event.target === event.currentTarget) setSelectedProject(null);
          }}
        >
          <div className="glass-heavy rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="p-5 border-b border-neutral-800 flex items-start justify-between bg-neutral-950/60">
              <div className="flex items-center gap-3.5">
                {selectedProject.icon_url ? (
                  <img
                    src={selectedProject.icon_url}
                    alt={selectedProject.title}
                    className="w-14 h-14 rounded-xl object-contain bg-neutral-900 p-1 border border-neutral-800"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-xl bg-neutral-800 flex items-center justify-center font-bold text-lg text-primary-400">
                    {selectedProject.title.slice(0, 2)}
                  </div>
                )}
                <div>
                  <h2 className="text-lg font-bold text-neutral-100 flex items-center gap-2">
                    {selectedProject.title}
                    <a
                      href={`https://modrinth.com/mod/${selectedProject.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-neutral-500 hover:text-primary-400"
                    >
                      <ExternalLink size={14} />
                    </a>
                  </h2>
                  <div className="text-xs text-neutral-400">
                    Created by <span className="text-neutral-200 font-semibold">{selectedProject.author}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-[11px] font-mono text-neutral-400">
                    <span>{selectedProject.downloads.toLocaleString()} downloads</span>
                    <span>•</span>
                    <span className="capitalize">{selectedProject.client_side} on client</span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setSelectedProject(null)}
                className="p-2 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 rounded-lg transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              <div>
                <h4 className="text-xs font-mono uppercase tracking-wider text-neutral-400 mb-2">Description</h4>
                <p className="text-xs text-neutral-300 leading-relaxed whitespace-pre-line bg-neutral-950/50 p-4 rounded-xl border border-neutral-800/80">
                  {selectedProject.body || selectedProject.description}
                </p>
              </div>

              {/* Compatible Versions list */}
              <div>
                <h4 className="text-xs font-mono uppercase tracking-wider text-neutral-400 mb-2">
                  Versions compatible with Minecraft {activeInstance?.mcVersion || 'any'}
                </h4>
                {isLoadingVersions ? (
                  <div className="p-4 text-center text-xs text-neutral-400 font-mono">
                    Querying Modrinth versions...
                  </div>
                ) : projectVersions.length === 0 ? (
                  <div className="p-4 text-center text-xs text-neutral-500 bg-neutral-950 rounded-xl">
                    No release versions found specifically tagged for this version.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {projectVersions.map((v) => (
                      <div
                        key={v.id}
                        className="p-3 rounded-xl bg-neutral-950 border border-neutral-800 flex items-center justify-between text-xs"
                      >
                        <div>
                          <div className="font-semibold text-neutral-200 flex items-center gap-2">
                            <span>{v.name}</span>
                            <span className="px-1.5 py-0.5 rounded bg-neutral-800 text-[10px] font-mono text-neutral-400 uppercase">
                              {v.version_type}
                            </span>
                          </div>
                          <div className="text-[10px] text-neutral-500 font-mono mt-0.5">
                            Loaders: {v.loaders.join(', ')} • MC: {v.game_versions.join(', ')}
                          </div>
                        </div>

                        <button
                          onClick={() => {
                            setSelectedProject(null);
                            onInstallMod(selectedProject, v);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-primary-500 hover:bg-primary-400 text-neutral-950 font-bold text-xs flex items-center gap-1 transition-colors"
                        >
                          <Download size={13} />
                          <span>Install File</span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-neutral-800 bg-neutral-950/60 flex items-center justify-between">
              <span className="text-xs text-neutral-400">
                Target Instance: <strong className="text-neutral-200">{activeInstance?.name || 'No Profile'}</strong>
              </span>

              <div className="flex items-center gap-2">
                {isModInstalled(selectedProject) && onUninstallMod && (
                  <button
                    onClick={() => {
                      onUninstallMod(selectedProject.project_id || selectedProject.slug);
                      setSelectedProject(null);
                    }}
                    className="px-3.5 py-2 rounded-lg bg-red-950/60 hover:bg-red-900 border border-red-800 text-red-300 text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 size={13} />
                    <span>Uninstall</span>
                  </button>
                )}
                <button
                  onClick={() => setSelectedProject(null)}
                  className="px-4 py-2 rounded-lg text-xs text-neutral-300 hover:bg-neutral-800 transition-colors cursor-pointer"
                >
                  Close
                </button>
                <button
                  onClick={() => {
                    const p = selectedProject;
                    setSelectedProject(null);
                    handleInitiateInstall(p);
                  }}
                  className="px-5 py-2 rounded-lg bg-primary-500 hover:bg-primary-400 text-neutral-950 text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Download size={14} />
                  <span>{isModInstalled(selectedProject) ? 'Reinstall Latest' : 'Install Latest'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
