// Netflix Dynamic TMDB Cloud Controller - Information Page, Player & Downloads
const categoriesContainer = document.getElementById('categoriesContainer');
const heroBackdrop = document.getElementById('heroBackdrop');
const heroTitle = document.getElementById('heroTitle');
const heroDuration = document.getElementById('heroDuration');
const heroGenre = document.getElementById('heroGenre');
const heroSynopsis = document.getElementById('heroSynopsis');
const heroPlayBtn = document.getElementById('heroPlayBtn');
const heroInfoBtn = document.getElementById('heroInfoBtn');

// Movie Detail Sheet Elements
const movieDetailModal = document.getElementById('movieDetailModal');
const detailBackdrop = document.getElementById('detailBackdrop');
const detailTitle = document.getElementById('detailTitle');
const detailTagline = document.getElementById('detailTagline');
const detailMatchScore = document.getElementById('detailMatchScore');
const detailYear = document.getElementById('detailYear');
const detailMaturity = document.getElementById('detailMaturity');
const detailRuntime = document.getElementById('detailRuntime');
const detailOverview = document.getElementById('detailOverview');
const detailCast = document.getElementById('detailCast');
const detailDirector = document.getElementById('detailDirector');
const detailGenres = document.getElementById('detailGenres');
const detailPlayBtn = document.getElementById('detailPlayBtn');
const detailDownloadBtn = document.getElementById('detailDownloadBtn');
const closeDetailBtn = document.getElementById('closeDetailBtn');
const downloadDrawer = document.getElementById('downloadDrawer');
const downloadLinksList = document.getElementById('downloadLinksList');

// Theater Video Player Elements
const playerModal = document.getElementById('playerModal');
const playerTitle = document.getElementById('playerTitle');
const playerMeta = document.getElementById('playerMeta');
const closePlayerBtn = document.getElementById('closePlayerBtn');
const cloudEmbedIframe = document.getElementById('cloudEmbedIframe');

// Search Bar Elements
const movieSearchInput = document.getElementById('movieSearchInput');
const searchDropdown = document.getElementById('searchDropdown');
const netflixHeader = document.getElementById('netflixHeader');

let currentActiveMovie = null;
let liveCatalogCache = [];

// Header Blur on Scroll
window.addEventListener('scroll', () => {
  if (window.scrollY > 40) {
    netflixHeader.classList.add('scrolled');
  } else {
    netflixHeader.classList.remove('scrolled');
  }
});

// Anti-Redirect Protection
window.addEventListener('beforeunload', (e) => {
  if (playerModal && playerModal.classList.contains('active')) {
    e.preventDefault();
    e.returnValue = '';
  }
});

// Load Live Categories from TMDB Backend API
async function loadNetflixCatalog() {
  try {
    const res = await fetch('/api/catalog/categories');
    const data = await res.json();

    if (!data.success || !data.categories) {
      categoriesContainer.innerHTML = '<div class="loading-spinner-wrap"><span>Connecting to TMDB Cloud...</span></div>';
      return;
    }

    liveCatalogCache = [];
    data.categories.forEach(cat => {
      cat.movies.forEach(m => {
        if (!liveCatalogCache.find(x => x.id === m.id)) {
          liveCatalogCache.push(m);
        }
      });
    });

    const heroMovie = liveCatalogCache[0];
    if (heroMovie) {
      setupHero(heroMovie);
    }

    renderCategories(data.categories);

  } catch (err) {
    console.error('Catalog load error:', err);
    categoriesContainer.innerHTML = '<div class="loading-spinner-wrap"><span>Loading live catalog...</span></div>';
  }
}

function setupHero(movie) {
  heroTitle.textContent = movie.title.toUpperCase();
  heroBackdrop.style.backgroundImage = `url("${movie.backdrop}")`;
  heroDuration.textContent = movie.duration;
  heroGenre.textContent = movie.genre;
  heroSynopsis.textContent = movie.synopsis;

  heroPlayBtn.onclick = () => openMoviePlayer(movie);
  heroInfoBtn.onclick = () => openMovieInformationPage(movie.id);
}

function renderCategories(categories) {
  categoriesContainer.innerHTML = categories.map(cat => {
    const rowId = `row-${cat.id}`;
    const isRanked = !!cat.isRanked;

    let cardsHtml = '';
    if (isRanked) {
      cardsHtml = cat.movies.map((m, idx) => {
        const rankNum = idx + 1;
        return `
          <div class="top10-card" data-movie-id="${m.id}" title="${escapeHtml(m.title)}">
            <div class="rank-number">${rankNum}</div>
            <div class="top10-poster" style="background-image: url('${m.poster}');">
              <div class="card-overlay-badges"><span class="badge-n-logo">N</span></div>
            </div>
          </div>
        `;
      }).join('');
    } else {
      cardsHtml = cat.movies.map(m => {
        return `
          <div class="netflix-card" data-movie-id="${m.id}" title="${escapeHtml(m.title)}">
            <div class="card-poster" style="background-image: url('${m.poster}');">
              <div class="card-overlay-badges">
                <span class="badge-n-logo">N</span>
              </div>
            </div>
            <div class="card-info-pane">
              <div class="card-btn-row">
                <div style="display:flex; gap:6px;">
                  <button class="btn-circle-play" data-play-id="${m.id}">&#9654;</button>
                  <button class="btn-circle-sub" title="Add to My List">+</button>
                </div>
                <span class="maturity-rating">16+</span>
              </div>
              <div class="card-title">${escapeHtml(m.title)}</div>
              <div class="card-meta-line">
                <span class="match-score">${m.matchScore}</span>
                <span>${m.year}</span>
                <span class="quality-badge">4K</span>
              </div>
              <div class="card-genre-tags">${escapeHtml(m.genre)}</div>
            </div>
          </div>
        `;
      }).join('');
    }

    return `
      <section id="${rowId}" class="netflix-row">
        <div class="row-header-wrap">
          <h2 class="netflix-row-title">${cat.title}</h2>
        </div>
        <div class="row-carousel-wrap">
          <button class="carousel-arrow left" onclick="scrollRow('${rowId}-grid', -1)">&#10094;</button>
          <div id="${rowId}-grid" class="cards-carousel">
            ${cardsHtml}
          </div>
          <button class="carousel-arrow right" onclick="scrollRow('${rowId}-grid', 1)">&#10095;</button>
        </div>
      </section>
    `;
  }).join('');

  // Attach click listeners to cards via delegation
  categoriesContainer.querySelectorAll('[data-movie-id]').forEach(card => {
    card.addEventListener('click', (e) => {
      // Don't open info if clicked on play button directly
      if (e.target.closest('[data-play-id]')) {
        const playId = e.target.closest('[data-play-id]').getAttribute('data-play-id');
        openMoviePlayerById(playId);
        return;
      }
      const movieId = card.getAttribute('data-movie-id');
      openMovieInformationPage(movieId);
    });
  });
}

window.scrollRow = function(gridId, direction) {
  const grid = document.getElementById(gridId);
  if (!grid) return;
  const scrollAmount = grid.clientWidth * 0.75;
  grid.scrollBy({ left: direction * scrollAmount, behavior: 'smooth' });
};

// ===================================================
// 1. OPEN MOVIE INFORMATION PAGE (POPUP SHEET)
// ===================================================
window.openMovieInformationPage = async function(id) {
  if (searchDropdown) searchDropdown.classList.remove('active');
  downloadDrawer.style.display = 'none';

  // Instant local preview from cache if available
  const cached = liveCatalogCache.find(m => String(m.id) === String(id));
  if (cached) {
    populateDetailModal(cached);
  }

  movieDetailModal.classList.add('active');

  // Fetch full live metadata including cast & downloads
  try {
    const res = await fetch(`/api/catalog/movie/${id}`);
    const data = await res.json();
    if (data.success && data.movie) {
      currentActiveMovie = data.movie;
      populateDetailModal(data.movie);
    }
  } catch (err) {
    console.error('Movie details fetch error:', err);
  }
};

function populateDetailModal(movie) {
  currentActiveMovie = movie;
  detailTitle.textContent = movie.title;
  detailBackdrop.style.backgroundImage = `url("${movie.backdrop || movie.poster}")`;
  detailTagline.textContent = movie.tagline || (movie.genre ? movie.genre.split('/')[0].trim() : 'Streaming Now');
  detailMatchScore.textContent = movie.matchScore || '98% Match';
  detailYear.textContent = movie.year || '2024';
  detailRuntime.textContent = movie.duration || '2h 15m';
  detailOverview.textContent = movie.synopsis || 'Full story description streaming in 4K Ultra HD with spatial audio.';

  // Cast
  if (movie.cast && movie.cast.length > 0) {
    detailCast.textContent = movie.cast.map(c => c.name).slice(0, 6).join(', ');
  } else {
    detailCast.textContent = 'Ensemble Cast & Stars';
  }

  // Director
  detailDirector.textContent = movie.director || 'Visionary Filmmaker';

  // Genres
  detailGenres.textContent = movie.genre || (movie.genresList ? movie.genresList.join(', ') : 'Action, Drama');

  // Wire Play and Download buttons
  detailPlayBtn.onclick = () => {
    movieDetailModal.classList.remove('active');
    openMoviePlayer(movie);
  };

  detailDownloadBtn.onclick = () => {
    toggleDownloadDrawer(movie);
  };
}

function toggleDownloadDrawer(movie) {
  if (downloadDrawer.style.display === 'block') {
    downloadDrawer.style.display = 'none';
    return;
  }

  downloadDrawer.style.display = 'block';
  const imdb = movie.imdbId || (String(movie.id).startsWith('tt') ? movie.id : `tt${movie.id}`);

  const mirrors = [
    { quality: '1080p FHD (Direct Stream DL)', size: '2.4 GB', url: `https://player.autoembed.co/embed/movie/${imdb}` },
    { quality: '720p HD (Compressed MP4)', size: '1.2 GB', url: `https://vidsrc.to/embed/movie/${imdb}` },
    { quality: '480p Mobile Saver', size: '650 MB', url: `https://www.2embed.cc/embed/${imdb}` }
  ];

  downloadLinksList.innerHTML = mirrors.map(m => `
    <div class="download-link-card">
      <div>
        <div class="dl-quality">${m.quality}</div>
        <div class="dl-meta">Estimated Size: ${m.size} &bull; Fast Mirror</div>
      </div>
      <a href="${m.url}" target="_blank" class="dl-btn">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
        Download Link
      </a>
    </div>
  `).join('');
}

closeDetailBtn.addEventListener('click', () => {
  movieDetailModal.classList.remove('active');
});

// ===================================================
// 2. THEATER VIDEO PLAYER
// ===================================================
window.openMoviePlayerById = function(id) {
  const movie = liveCatalogCache.find(m => String(m.id) === String(id));
  if (movie) {
    openMoviePlayer(movie);
  } else {
    openMovieInformationPage(id);
  }
};

window.openMoviePlayer = function(movie) {
  currentActiveMovie = movie;
  if (searchDropdown) searchDropdown.classList.remove('active');
  if (movieDetailModal) movieDetailModal.classList.remove('active');

  playerTitle.textContent = movie.title;
  playerMeta.innerHTML = `${movie.year || '2024'} &bull; ${movie.duration || '2h 10m'} &bull; ${movie.genre || 'Action'} &bull; <span style="color:#46d369; font-weight:700;">${movie.matchScore || '98% Match'}</span>`;

  cloudEmbedIframe.style.display = 'block';

  const pillbox = document.getElementById('serversPillbox');
  if (pillbox) pillbox.scrollLeft = 0;

  switchEmbedServer('2embed');

  playerModal.classList.add('active');

  // Background enrich with genuine IMDb ID if not yet present
  if (!movie.imdbId && movie.id) {
    fetch(`/api/catalog/movie/${movie.id}`)
      .then(r => r.json())
      .then(d => {
        if (d.success && d.movie && d.movie.imdbId) {
          movie.imdbId = d.movie.imdbId;
          if (currentActiveMovie && String(currentActiveMovie.id) === String(movie.id)) {
            currentActiveMovie.imdbId = d.movie.imdbId;
          }
        }
      })
      .catch(() => {});
  }
};

window.switchEmbedServer = function(serverType, btn) {
  if (!currentActiveMovie) return;

  const rawId = currentActiveMovie.tmdbId || currentActiveMovie.id;
  const isDirectImdb = String(rawId).startsWith('tt');
  const hasRealImdb = currentActiveMovie.imdbId && String(currentActiveMovie.imdbId).startsWith('tt') && !String(currentActiveMovie.imdbId).startsWith(`tt${rawId}`);
  const realImdb = isDirectImdb ? String(rawId) : (hasRealImdb ? currentActiveMovie.imdbId : null);
  const tmdbId = isDirectImdb ? '' : String(rawId).replace(/^tt/, '');

  document.querySelectorAll('.server-pill').forEach(p => p.classList.remove('active'));
  if (btn) {
    btn.classList.add('active');
  } else {
    const srvBtn = document.getElementById('srvBtn2Embed');
    if (srvBtn) srvBtn.classList.add('active');
  }

  let streamUrl = '';

  if (serverType === '2embed') {
    // 2Embed works with real IMDb ID or numeric TMDB ID
    streamUrl = realImdb ? `https://www.2embed.cc/embed/${realImdb}` : `https://www.2embed.cc/embed/${tmdbId}`;
  } else if (serverType === 'vidlink') {
    streamUrl = `https://vidlink.pro/movie/${tmdbId || realImdb}`;
  } else if (serverType === 'multiembed') {
    streamUrl = realImdb ? `https://multiembed.mov/?video_id=${realImdb}&tmdb=1` : `https://multiembed.mov/?video_id=${tmdbId}&tmdb=1`;
  } else if (serverType === 'embedsu') {
    streamUrl = `https://embed.su/embed/movie/${tmdbId || realImdb}`;
  } else if (serverType === 'smashy') {
    streamUrl = `https://embed.smashystream.com/playere.php?tmdb=${tmdbId || realImdb}`;
  } else if (serverType === 'autoembed') {
    streamUrl = realImdb ? `https://player.autoembed.co/embed/movie/${realImdb}` : `https://player.autoembed.co/embed/movie/${tmdbId}`;
  } else if (serverType === 'vidsrcto') {
    streamUrl = realImdb ? `https://vidsrc.to/embed/movie/${realImdb}` : `https://vidsrc.to/embed/movie/${tmdbId}`;
  } else if (serverType === 'vidsrcme') {
    streamUrl = realImdb ? `https://vidsrc.me/embed/movie?imdb=${realImdb}` : `https://vidsrc.me/embed/movie?tmdb=${tmdbId}`;
  }

  // Clear frame first to ensure clean reload without cache deadlock
  cloudEmbedIframe.src = 'about:blank';
  setTimeout(() => {
    cloudEmbedIframe.src = streamUrl;
  }, 40);
};

window.openDirectCinemaWindow = function() {
  if (!currentActiveMovie) return;
  const rawId = currentActiveMovie.tmdbId || currentActiveMovie.id;
  const realImdb = currentActiveMovie.imdbId && String(currentActiveMovie.imdbId).startsWith('tt') ? currentActiveMovie.imdbId : null;
  const tmdbId = String(rawId).replace(/^tt/, '');
  const streamUrl = realImdb ? `https://www.2embed.cc/embed/${realImdb}` : `https://www.2embed.cc/embed/${tmdbId}`;
  window.open(streamUrl, '_blank');
};

closePlayerBtn.addEventListener('click', () => {
  cloudEmbedIframe.src = '';
  cloudEmbedIframe.style.display = 'none';
  playerModal.classList.remove('active');
  currentActiveMovie = null;
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (playerModal.classList.contains('active')) {
      closePlayerBtn.click();
    } else if (movieDetailModal.classList.contains('active')) {
      closeDetailBtn.click();
    }
  }
});

// Close modals when clicking backdrop outside dialog
movieDetailModal.addEventListener('click', (e) => {
  if (e.target === movieDetailModal) {
    movieDetailModal.classList.remove('active');
  }
});

playerModal.addEventListener('click', (e) => {
  if (e.target === playerModal) {
    closePlayerBtn.click();
  }
});

// ===================================================
// 3. SEARCH BAR WITH AUTO-SUGGESTIONS
// ===================================================
let searchDebounce = null;
const searchToggleBtn = document.getElementById('searchToggleBtn');

if (searchToggleBtn) {
  searchToggleBtn.addEventListener('click', () => {
    movieSearchInput.focus();
    if (movieSearchInput.value.trim().length > 0 && searchDropdown.children.length > 0) {
      searchDropdown.classList.add('active');
    }
  });
}

movieSearchInput.addEventListener('input', (e) => {
  const query = e.target.value.trim();
  clearTimeout(searchDebounce);

  if (query.length === 0) {
    searchDropdown.classList.remove('active');
    searchDropdown.innerHTML = '';
    return;
  }

  searchDebounce = setTimeout(async () => {
    try {
      const res = await fetch(`/api/catalog/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      const list = (data.success && (data.results || data.movies)) ? (data.results || data.movies) : [];
      renderSearchSuggestions(list, query);
    } catch (err) {
      console.error('Search error:', err);
    }
  }, 200);
});

movieSearchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    const firstItem = searchDropdown.querySelector('.dropdown-item');
    if (firstItem) {
      firstItem.click();
    }
  } else if (e.key === 'Escape') {
    searchDropdown.classList.remove('active');
  }
});

movieSearchInput.addEventListener('focus', () => {
  if (movieSearchInput.value.trim().length > 0 && searchDropdown.children.length > 0) {
    searchDropdown.classList.add('active');
  }
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.search-box-wrap')) {
    searchDropdown.classList.remove('active');
  }
});

function renderSearchSuggestions(results, query) {
  searchDropdown.innerHTML = '';
  searchDropdown.classList.add('active');

  if (results && results.length > 0) {
    results.forEach(m => {
      const item = document.createElement('div');
      item.className = 'dropdown-item';

      item.innerHTML = `
        <div class="dropdown-thumb" style="background-image: url('${m.poster}');"></div>
        <div class="dropdown-info">
          <div class="dropdown-title">${highlightMatch(m.title, query)}</div>
          <div class="dropdown-meta">
            <span class="match-score">${m.matchScore || '95% Match'}</span>
            <span>${m.year || '2024'}</span>
            <span>${m.genre || 'Action'}</span>
          </div>
        </div>
        <div class="dropdown-play-icon">&#9654;</div>
      `;

      item.onclick = () => {
        if (!liveCatalogCache.find(x => String(x.id) === String(m.id))) {
          liveCatalogCache.push(m);
        }
        openMovieInformationPage(m.id);
        searchDropdown.classList.remove('active');
      };

      searchDropdown.appendChild(item);
    });
  } else {
    const customItem = document.createElement('div');
    customItem.className = 'dropdown-item';
    const isImdb = query.startsWith('tt') && query.length >= 7;
    const targetImdb = isImdb ? query : 'tt15239678';

    customItem.innerHTML = `
      <div class="dropdown-info">
        <div class="dropdown-title">Explore "${escapeHtml(query)}" via Cloud</div>
        <div class="dropdown-meta"><span>Instant Movie Information</span></div>
      </div>
      <div class="dropdown-play-icon">&#9654;</div>
    `;

    customItem.onclick = () => {
      openMovieInformationPage(targetImdb);
      searchDropdown.classList.remove('active');
    };

    searchDropdown.appendChild(customItem);
  }
}

function highlightMatch(text, query) {
  if (!query) return escapeHtml(text);
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const idx = lowerText.indexOf(lowerQuery);
  if (idx === -1) return escapeHtml(text);

  const before = text.slice(0, idx);
  const match = text.slice(idx, idx + query.length);
  const after = text.slice(idx + query.length);

  return escapeHtml(before) + '<span class="search-highlight">' + escapeHtml(match) + '</span>' + escapeHtml(after);
}

function escapeHtml(str) {
  return (str || '').replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  })[m]);
}

// Kickoff catalog fetch
loadNetflixCatalog();
