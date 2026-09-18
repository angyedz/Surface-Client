import React, { useState, useEffect } from 'react';
import {
  Newspaper,
  ExternalLink,
  ArrowRight,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { useEscapeKey } from '../hooks/useDismissable';
import { NewsItem } from '../types/launcher';
import { fetchLiveMinecraftNews } from '../services/newsService';

export const NewsUpdatesView: React.FC = () => {
  const [stories, setStories] = useState<NewsItem[]>([]);
  const [selectedStory, setSelectedStory] = useState<NewsItem | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadNews = async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await fetchLiveMinecraftNews();
      setStories(data);
      if (data.length === 0) {
        setLoadError('The Minecraft news feed is unreachable right now.');
      }
    } catch (e) {
      console.error('Could not load the news feed:', e);
      setLoadError('The Minecraft news feed is unreachable right now.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadNews();
  }, []);

  const featured = stories[0] || null;

  useEscapeKey(() => {
    setSelectedStory(null);
  }, Boolean(selectedStory));

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6 select-none font-['Plus_Jakarta_Sans',sans-serif]">
      {!featured && !isLoading && (
        <div className="panel rounded-2xl p-10 text-center space-y-2">
          <Newspaper size={28} className="mx-auto text-neutral-500" />
          <p className="text-sm text-neutral-300">
            {loadError || 'No Minecraft news to show yet.'}
          </p>
          <button onClick={loadNews} className="btn-primary px-4 py-2 rounded-lg text-xs font-semibold">
            Try again
          </button>
        </div>
      )}

      {/* Featured Headline */}
      {featured && (
      <div className="relative rounded-2xl overflow-hidden p-8 border border-white/10 bg-gradient-to-r from-primary-900/60 via-neutral-900/90 to-neutral-950/95 shadow-2xl flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="space-y-2 max-w-xl">
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full bg-primary-500/20 text-primary-300 border border-primary-500/40 text-xs font-mono font-bold flex items-center gap-1.5">
              <Sparkles size={12} />
              {featured.badge || 'OFFICIAL NEWS'}
            </span>
            <span className="text-xs font-mono text-neutral-400">Mojang Launcher Feed</span>
          </div>
          <h2 className="text-2xl lg:text-3xl font-black text-neutral-100 font-['Chakra_Petch'] tracking-wide">
            {featured.title}
          </h2>
          <p className="text-xs text-neutral-300 line-clamp-2 leading-relaxed">
            {featured.summary}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={loadNews}
            disabled={isLoading}
            className="p-2.5 rounded-xl bg-neutral-800/80 hover:bg-neutral-700 text-neutral-300 border border-white/10 transition-colors cursor-pointer"
            title="Refresh News" aria-label="Refresh News"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin text-primary-400' : ''} />
          </button>

          <button
            onClick={() => setSelectedStory(featured)}
            className="px-5 py-2.5 rounded-xl bg-primary-500 hover:bg-primary-400 text-neutral-950 font-bold text-xs flex items-center gap-2 shadow-lg transition-colors cursor-pointer"
          >
            <span>Read Article</span>
            <ArrowRight size={14} />
          </button>
        </div>
      </div>
      )}

      {/* Stories Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {stories.map((story) => {
          return (
            <div
              key={story.id}
              onClick={() => setSelectedStory(story)}
              className="rounded-2xl overflow-hidden border border-white/10 bg-neutral-900/60 hover:bg-neutral-900/90 transition-all hover:border-primary-500/40 shadow-lg flex flex-col justify-between cursor-pointer group"
            >
              {/* Image box */}
              <div className="relative h-44 overflow-hidden bg-neutral-950">
                <img
                  src={story.bannerUrl}
                  alt={story.title}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 brightness-85"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-transparent to-transparent" />

                <div className="absolute top-3 left-3">
                  <span className="px-2.5 py-0.5 rounded-full bg-neutral-900/80 border border-white/10 text-[10px] font-mono font-bold text-primary-400">
                    {story.badge || story.category}
                  </span>
                </div>
              </div>

              {/* Story Details */}
              <div className="p-4 space-y-2.5">
                <div className="flex items-center gap-2 text-[11px] font-mono text-neutral-400">
                  <span>{story.date}</span>
                  <span>•</span>
                  <span>{story.readTime}</span>
                </div>

                <h3 className="font-bold text-sm text-neutral-100 group-hover:text-primary-300 transition-colors line-clamp-1">
                  {story.title}
                </h3>

                <p className="text-xs text-neutral-400 line-clamp-2 leading-relaxed">
                  {story.summary}
                </p>

                <div className="pt-2 border-t border-white/5 flex items-center justify-between text-xs text-neutral-400">
                  <span className="text-primary-400 font-semibold group-hover:underline flex items-center gap-1 text-[11px]">
                    Read More <ArrowRight size={12} />
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Story Detail Modal */}
      {selectedStory && (
        <div
          className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4"
          onMouseDown={(event) => {
            // Only a click on the backdrop itself closes the dialog.
            if (event.target === event.currentTarget) setSelectedStory(null);
          }}
        >
          <div className="glass-heavy rounded-3xl w-full max-w-xl max-h-[85vh] overflow-y-auto p-6 shadow-2xl animate-in zoom-in-95 duration-150 space-y-4">
            <div className="relative h-56 rounded-2xl overflow-hidden">
              <img
                src={selectedStory.bannerUrl}
                alt={selectedStory.title}
                className="w-full h-full object-cover brightness-75"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-neutral-950/40 to-transparent" />
              <div className="absolute bottom-4 left-4 right-4">
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-primary-500 text-neutral-950 uppercase">
                  {selectedStory.badge}
                </span>
                <h2 className="text-xl font-bold text-white mt-1">
                  {selectedStory.title}
                </h2>
                <span className="text-xs font-mono text-neutral-300">
                  {selectedStory.date} • {selectedStory.readTime}
                </span>
              </div>
            </div>

            <p className="text-xs leading-relaxed text-neutral-300">
              {selectedStory.summary}
            </p>

            <div className="p-3.5 rounded-xl bg-neutral-950/80 border border-white/10 text-xs text-neutral-300 space-y-1">
              <span className="font-bold text-primary-400 font-mono">Mojang Official Announcement</span>
              <p className="text-neutral-400">
                You can read the entire article, snapshot changelog, and developer comments on the official website.
              </p>
            </div>

            <div className="flex items-center justify-between pt-2">
              {selectedStory.articleUrl ? (
                <a
                  href={selectedStory.articleUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="px-4 py-2 rounded-xl bg-primary-500 hover:bg-primary-400 text-neutral-950 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <span>Open on Minecraft.net</span>
                  <ExternalLink size={13} />
                </a>
              ) : (
                <div />
              )}

              <button
                onClick={() => setSelectedStory(null)}
                className="px-5 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-bold transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
