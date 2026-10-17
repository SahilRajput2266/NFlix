const config = require('../config');

const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMG_POSTER = 'https://image.tmdb.org/t/p/w500';
const TMDB_IMG_BACKDROP = 'https://image.tmdb.org/t/p/original';

// In-memory cache for speed and resilience
const cache = new Map();
const CACHE_TTL = 300000; // 5 minutes

function getCached(key) {
  const item = cache.get(key);
  if (item && (Date.now() - item.time < CACHE_TTL)) {
    return item.data;
  }
  return null;
}

function setCache(key, data) {
  cache.set(key, { data, time: Date.now() });
}

// Safe fetch with timeout and Bearer Auth
async function fetchWithTimeout(url, ms = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      'Accept': 'application/json'
    };

    if (config.TMDB_ACCESS_TOKEN) {
      headers['Authorization'] = `Bearer ${config.TMDB_ACCESS_TOKEN}`;
    }

    const res = await fetch(url, {
      signal: controller.signal,
      headers
    });
    clearTimeout(timer);
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${errBody}`);
    }
    return await res.json();
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

// Format TMDB item
function formatTmdbMovie(m) {
  const poster = m.poster_path
    ? `${TMDB_IMG_POSTER}${m.poster_path}`
    : 'https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=500&q=80';

  const backdrop = m.backdrop_path
    ? `${TMDB_IMG_BACKDROP}${m.backdrop_path}`
    : (m.poster_path ? `${TMDB_IMG_BACKDROP}${m.poster_path}` : poster);

  const rating = m.vote_average ? m.vote_average.toFixed(1) : '7.5';
  const matchScore = Math.min(99, Math.round(parseFloat(rating) * 11 + 5)) + '% Match';
  const year = m.release_date ? m.release_date.split('-')[0] : '2024';

  const genreMap = {
    28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime',
    99: 'Documentary', 18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History',
    27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi',
    10770: 'TV Movie', 53: 'Thriller', 10752: 'War', 37: 'Western'
  };

  const genres = (m.genre_ids || [])
    .map(id => genreMap[id])
    .filter(Boolean)
    .slice(0, 3)
    .join(' / ') || 'Action / Drama';

  return {
    id: m.id,
    tmdbId: m.id,
    imdbId: m.imdb_id || (m.external_ids ? m.external_ids.imdb_id : null),
    title: m.title || m.original_title,
    year: year,
    rating: rating,
    matchScore: matchScore,
    duration: m.runtime ? `${Math.floor(m.runtime / 60)}h ${m.runtime % 60}m` : '2h 10m',
    genre: genres,
    synopsis: m.overview || 'Streaming in Ultra HD with Dolby Atmos sound.',
    poster: poster,
    backdrop: backdrop
  };
}

class TmdbService {
  constructor() {
    this.apiKey = config.TMDB_API_KEY;
  }

  buildUrl(endpoint, extraParams = '') {
    const sep = endpoint.includes('?') ? '&' : '?';
    return `${TMDB_BASE}${endpoint}${sep}api_key=${this.apiKey}${extraParams ? '&' + extraParams : ''}`;
  }

  async getTrending() {
    const cacheKey = 'trending';
    const cached = getCached(cacheKey);
    if (cached) return cached;

    try {
      const url = this.buildUrl('/trending/movie/day');
      const data = await fetchWithTimeout(url);
      if (data && data.results) {
        const formatted = data.results.map(formatTmdbMovie);
        setCache(cacheKey, formatted);
        return formatted;
      }
    } catch (e) {
      console.log('TMDB trending fallback to Cinemeta:', e.message);
      return this.getCinemetaFallback('catalog/movie/top.json');
    }
    return [];
  }

  async getLatestReleases() {
    const cacheKey = 'now_playing';
    const cached = getCached(cacheKey);
    if (cached) return cached;

    try {
      const url = this.buildUrl('/movie/now_playing');
      const data = await fetchWithTimeout(url);
      if (data && data.results) {
        const formatted = data.results.map(formatTmdbMovie);
        setCache(cacheKey, formatted);
        return formatted;
      }
    } catch (e) {
      console.log('TMDB now_playing fallback to Cinemeta:', e.message);
      return this.getCinemetaFallback('catalog/movie/top.json');
    }
    return [];
  }

  async getTopRated() {
    const cacheKey = 'top_rated';
    const cached = getCached(cacheKey);
    if (cached) return cached;

    try {
      const url = this.buildUrl('/movie/top_rated');
      const data = await fetchWithTimeout(url);
      if (data && data.results) {
        const formatted = data.results.map(formatTmdbMovie);
        setCache(cacheKey, formatted);
        return formatted;
      }
    } catch (e) {
      return this.getCinemetaFallback('catalog/movie/top.json');
    }
    return [];
  }

  async getMoviesByGenre(genreId, fallbackGenre = 'Action') {
    const cacheKey = `genre_${genreId}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    try {
      const url = this.buildUrl('/discover/movie', `with_genres=${genreId}&sort_by=popularity.desc`);
      const data = await fetchWithTimeout(url);
      if (data && data.results) {
        const formatted = data.results.map(formatTmdbMovie);
        setCache(cacheKey, formatted);
        return formatted;
      }
    } catch (e) {
      return this.getCinemetaFallback(`catalog/movie/top/genre=${fallbackGenre}.json`);
    }
    return [];
  }

  // Full Details with Cast, Director, IMDb ID, and Trailer Key
  async getMovieDetails(id) {
    const cacheKey = `movie_${id}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    try {
      let tmdbId = id;
      // If it's an IMDb ID (starts with tt), find the TMDB id
      if (String(id).startsWith('tt')) {
        const findUrl = this.buildUrl(`/find/${id}`, 'external_source=imdb_id');
        const findRes = await fetchWithTimeout(findUrl).catch(() => null);
        if (findRes && findRes.movie_results && findRes.movie_results.length > 0) {
          tmdbId = findRes.movie_results[0].id;
        }
      }

      const url = this.buildUrl(`/movie/${tmdbId}`, 'append_to_response=credits,videos,external_ids');
      const m = await fetchWithTimeout(url);

      const cast = (m.credits && m.credits.cast)
        ? m.credits.cast.slice(0, 8).map(c => ({
            name: c.name,
            character: c.character,
            profile: c.profile_path ? `${TMDB_IMG_POSTER}${c.profile_path}` : null
          }))
        : [];

      const directorObj = (m.credits && m.credits.crew)
        ? m.credits.crew.find(cr => cr.job === 'Director')
        : null;

      const trailerObj = (m.videos && m.videos.results)
        ? m.videos.results.find(v => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser'))
        : null;

      const imdbId = (m.external_ids && m.external_ids.imdb_id) || m.imdb_id || (String(id).startsWith('tt') ? id : null);

      const formatted = {
        ...formatTmdbMovie(m),
        tmdbId: m.id,
        imdbId: imdbId || `tt${m.id}`,
        genresList: m.genres ? m.genres.map(g => g.name) : ['Action'],
        cast: cast,
        director: directorObj ? directorObj.name : 'Renowned Filmmaker',
        trailerKey: trailerObj ? trailerObj.key : null,
        tagline: m.tagline || ''
      };

      setCache(cacheKey, formatted);
      return formatted;
    } catch (e) {
      console.log('TMDB details fallback to Cinemeta:', e.message);
      if (String(id).startsWith('tt')) {
        return this.getCinemetaDetails(id);
      }
      return null;
    }
  }

  async search(query) {
    if (!query) return [];
    try {
      const url = this.buildUrl('/search/movie', `query=${encodeURIComponent(query)}`);
      const data = await fetchWithTimeout(url);
      if (data && data.results && data.results.length > 0) {
        return data.results.slice(0, 10).map(formatTmdbMovie);
      }
    } catch (e) {
      // Fallback to Cinemeta search
    }
    return this.getCinemetaFallback(`catalog/movie/top/search=${encodeURIComponent(query)}.json`);
  }

  // Resilient fallback to Cinemeta API
  async getCinemetaFallback(endpoint) {
    try {
      const res = await fetchWithTimeout(`https://v3-cinemeta.strem.io/${endpoint}`, 5000);
      if (res && res.metas) {
        return res.metas.map(m => ({
          id: m.id,
          tmdbId: m.id,
          imdbId: m.id,
          title: m.name,
          year: m.releaseInfo || m.year || '2024',
          rating: m.imdbRating || '7.5',
          matchScore: Math.min(99, Math.round(parseFloat(m.imdbRating || '7.5') * 11 + 5)) + '% Match',
          duration: m.runtime || '2h 10m',
          genre: Array.isArray(m.genres) ? m.genres.join(' / ') : (m.genre || 'Action'),
          synopsis: m.description || 'Streaming in Ultra HD.',
          poster: m.poster || 'https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=500&q=80',
          backdrop: m.background || m.poster
        }));
      }
    } catch (err) {}
    return [];
  }

  async getCinemetaDetails(imdbId) {
    try {
      const res = await fetchWithTimeout(`https://v3-cinemeta.strem.io/meta/movie/${imdbId}.json`, 5000);
      if (res && res.meta) {
        const m = res.meta;
        return {
          id: m.id,
          tmdbId: m.id,
          imdbId: m.id,
          title: m.name,
          year: m.year || '2024',
          rating: m.imdbRating || '7.8',
          matchScore: '98% Match',
          duration: m.runtime || '2h 15m',
          genre: Array.isArray(m.genres) ? m.genres.join(' / ') : 'Action / Adventure',
          synopsis: m.description || 'Streaming in 4K Ultra HD.',
          poster: m.poster,
          backdrop: m.background || m.poster,
          cast: (m.cast || []).slice(0, 6).map(c => ({ name: c, character: 'Starring', profile: null })),
          director: (m.director && m.director[0]) || 'Filmmaker',
          tagline: ''
        };
      }
    } catch (e) {}
    return null;
  }
}

module.exports = new TmdbService();
