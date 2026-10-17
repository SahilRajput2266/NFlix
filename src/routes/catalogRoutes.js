const express = require('express');
const router = express.Router();
const tmdbService = require('../services/tmdbService');

// 1. GET /api/catalog/categories - Modular live categories from TMDB
router.get('/categories', async (req, res) => {
  try {
    const [latest, trending, action, scifi] = await Promise.all([
      tmdbService.getLatestReleases(),
      tmdbService.getTrending(),
      tmdbService.getMoviesByGenre(28, 'Action'),
      tmdbService.getMoviesByGenre(878, 'Sci-Fi')
    ]);

    res.json({
      success: true,
      categories: [
        {
          id: 'latest',
          title: '🔥 Latest Releases (2024 - 2025)',
          movies: latest.length > 0 ? latest.slice(0, 12) : trending.slice(0, 12)
        },
        {
          id: 'top10',
          title: '🏆 Top 10 Movies in India Today',
          isRanked: true,
          movies: trending.slice(0, 10)
        },
        {
          id: 'action',
          title: '💥 Action & Blockbusters',
          movies: action.slice(0, 12)
        },
        {
          id: 'scifi',
          title: '🌌 Mind-Bending Sci-Fi & Space',
          movies: scifi.slice(0, 12)
        }
      ]
    });
  } catch (err) {
    console.error('Error fetching categories:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. GET /api/catalog/movie/:id - Detailed Information for Movie Info Page
router.get('/movie/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const details = await tmdbService.getMovieDetails(id);
    if (!details) {
      return res.status(404).json({ success: false, message: 'Movie not found' });
    }

    const imdbId = details.imdbId || (String(id).startsWith('tt') ? id : `tt${id}`);

    // Download Mirrors
    const downloadOptions = [
      {
        quality: '1080p Full HD (Web-DL)',
        size: '2.4 GB',
        format: 'MP4 / H.264',
        url: `https://player.autoembed.co/embed/movie/${imdbId}`,
        type: 'stream'
      },
      {
        quality: '720p HD (Compressed)',
        size: '1.1 GB',
        format: 'MP4 / AAC',
        url: `https://vidsrc.to/embed/movie/${imdbId}`,
        type: 'stream'
      },
      {
        quality: '480p Mobile Saver',
        size: '650 MB',
        format: 'MP4 / 2ch',
        url: `https://www.2embed.cc/embed/${imdbId}`,
        type: 'stream'
      }
    ];

    res.json({
      success: true,
      movie: {
        ...details,
        imdbId: imdbId,
        downloads: downloadOptions
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. GET /api/catalog/search?q=... - Real-Time Live Search
router.get('/search', async (req, res) => {
  const q = (req.query.q || '').trim();
  try {
    const results = await tmdbService.search(q);
    const sliced = results.slice(0, 10);
    res.json({
      success: true,
      query: q,
      count: results.length,
      results: sliced,
      movies: sliced
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. GET /api/catalog/trending
router.get('/trending', async (req, res) => {
  try {
    const movies = await tmdbService.getTrending();
    res.json({ success: true, count: movies.length, movies });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
