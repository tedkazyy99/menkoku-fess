export interface SongTrack {
  title: string;
  artist: string;
  fullQuery: string;
  artwork: string;
}

interface CacheEntry {
  timestamp: number;
  data: SongTrack[];
}

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes cache
const memoryCache = new Map<string, CacheEntry>();

export async function searchMusic(query: string): Promise<SongTrack[]> {
  const cleanQuery = query.trim().toLowerCase();
  if (!cleanQuery || cleanQuery.length < 2) {
    return [];
  }

  // Check in-memory cache
  const cached = memoryCache.get(cleanQuery);
  const now = Date.now();
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const endpoint = `https://itunes.apple.com/search?term=${encodeURIComponent(cleanQuery)}&entity=song&limit=5&country=ID`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000); // 4s timeout

  try {
    const res = await fetch(endpoint, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      return [];
    }

    const payload = (await res.json()) as {
      resultCount?: number;
      results?: Array<{
        trackName?: string;
        artistName?: string;
        artworkUrl100?: string;
        artworkUrl60?: string;
      }>;
    };

    const results: SongTrack[] = (payload.results || [])
      .filter((item) => item.trackName && item.artistName)
      .map((item) => {
        const title = item.trackName || "";
        const artist = item.artistName || "";
        return {
          title,
          artist,
          fullQuery: `${artist} - ${title}`,
          artwork: item.artworkUrl100 || item.artworkUrl60 || "",
        };
      });

    // Save to cache
    memoryCache.set(cleanQuery, {
      timestamp: now,
      data: results,
    });

    return results;
  } catch (err: any) {
    if (err.name === "AbortError") {
      console.warn(`[Music Search] Timeout fetching from iTunes for query: "${cleanQuery}"`);
    } else {
      console.error(`[Music Search Error]`, err.message);
    }
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}

