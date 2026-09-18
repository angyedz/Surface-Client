import { NewsItem } from '../types/launcher';

const MOJANG_NEWS_URL = 'https://launchercontent.mojang.com/news.json';
const CACHE_KEY_NEWS = 'surface_minecraft_news_cache';
const CACHE_TTL_MS = 1000 * 60 * 60 * 3; // 3 hours

export interface MojangNewsEntry {
  title: string;
  tag?: string;
  category?: string;
  date: string;
  text: string;
  playPageImage?: {
    url: string;
    title?: string;
  };
  newsPageImage?: {
    url: string;
    title?: string;
  };
  readMoreLink?: string;
}

/**
 * Fetches real, live Minecraft news, patch notes, and dev updates from Mojang Launcher Feed
 */
export async function fetchLiveMinecraftNews(): Promise<NewsItem[]> {
  // Check local cache
  try {
    const cached = localStorage.getItem(CACHE_KEY_NEWS);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Date.now() - parsed.timestamp < CACHE_TTL_MS && Array.isArray(parsed.news)) {
        return parsed.news;
      }
    }
  } catch (e) {
    console.warn('Failed to read news cache:', e);
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(MOJANG_NEWS_URL, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data: { entries: MojangNewsEntry[] } = await res.json();
      if (Array.isArray(data.entries) && data.entries.length > 0) {
        const mappedNews: NewsItem[] = data.entries.slice(0, 9).map((entry, idx) => {
          // Construct absolute image URL from Mojang CDN
          const relativeImg = entry.newsPageImage?.url || entry.playPageImage?.url;
          const imgUrl = relativeImg
            ? relativeImg.startsWith('http')
              ? relativeImg
              : `https://launchercontent.mojang.com${relativeImg}`
            : '';

          const cleanDate = entry.date ? new Date(entry.date).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          }) : 'Recent';

          return {
            id: `mojang_news_${idx}_${Date.now()}`,
            title: entry.title,
            category: entry.category || entry.tag || 'Minecraft Update',
            badge: entry.tag || 'Official',
            date: cleanDate,
            bannerUrl: imgUrl,
            summary: entry.text || 'Read the official Minecraft patch notes and changelog.',
            readTime: '3 min read',
            articleUrl: entry.readMoreLink || 'https://www.minecraft.net/en-us/articles',
          };
        });

        try {
          localStorage.setItem(
            CACHE_KEY_NEWS,
            JSON.stringify({ timestamp: Date.now(), news: mappedNews })
          );
        } catch (e) {
          console.warn('Failed to cache news:', e);
        }

        return mappedNews;
      }
    }
  } catch (err) {
    console.warn('Could not load the Minecraft news feed:', err);
  }

  return [];
}
