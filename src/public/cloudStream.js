// Netflix Dynamic TMDB Cloud Controller - TV Shows, Episodes, Smart Fallback & Watchlist
const categoriesContainer = document.getElementById('categoriesContainer');
const heroBackdrop = document.getElementById('heroBackdrop');
const heroTitle = document.getElementById('heroTitle');
const heroDuration = document.getElementById('heroDuration');
const heroGenre = document.getElementById('heroGenre');
const heroSynopsis = document.getElementById('heroSynopsis');
const heroPlayBtn = document.getElementById('heroPlayBtn');
const heroInfoBtn = document.getElementById('heroInfoBtn');

// Movie / TV Detail Sheet Elements
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
const detailTrailerBtn = document.getElementById('detailTrailerBtn');
const detailDownloadBtn = document.getElementById('detailDownloadBtn');
const detailAddListBtn = document.getElementById('detailAddListBtn');
const closeDetailBtn = document.getElementById('closeDetailBtn');
const downloadDrawer = document.getElementById('downloadDrawer');
const downloadLinksList = document.getElementById('downloadLinksList');

// TV Episodes Elements
const detailEpisodesSection = document.getElementById('detailEpisodesSection');
const seasonSelectDropdown = document.getElementById('seasonSelectDropdown');
const episodesListGrid = document.getElementById('episodesListGrid');

// Theater Video Player Elements
const playerModal = document.getElementById('playerModal');
const playerTitle = document.getElementById('playerTitle');
const playerMeta = document.getElementById('playerMeta');
const closePlayerBtn = document.getElementById('closePlayerBtn');
const cloudEmbedIframe = document.getElementById('cloudEmbedIframe');
const theaterEpNav = document.getElementById('theaterEpNav');
const playerEpBadge = document.getElementById('playerEpBadge');
const playerNextEpBtn = document.getElementById('playerNextEpBtn');

// Trailer Modal Elements
const trailerModal = document.getElementById('trailerModal');
const trailerTitle = document.getElementById('trailerTitle');
const trailerIframe = document.getElementById('trailerIframe');
const closeTrailerBtn = document.getElementById('closeTrailerBtn');

// Toast & Watchlist Elements
const netflixToast = document.getElementById('netflixToast');
const myListSection = document.getElementById('myListSection');
const myListGrid = document.getElementById('myListGrid');
const navMyList = document.getElementById('navMyList');

// Search Bar Elements
const movieSearchInput = document.getElementById('movieSearchInput');
const searchDropdown = document.getElementById('searchDropdown');
const netflixHeader = document.getElementById('netflixHeader');

let currentActiveMovie = null;
let liveCatalogCache = [];
let currentSeasonNum = 1;
let currentEpisodeNum = 1;
let currentServerIndex = 0;

// Ordered chain for smart failover
const SERVERS_ORDER = [
  { id: '2embed', name: 'Server 1 (2Embed Multi)' },
  { id: 'vidlink', name: 'Server 2 (VidLink Pro)' },
  { id: 'multiembed', name: 'Server 3 (MultiEmbed Hindi)' },
  { id: 'embedsu', name: 'Server 4 (Embed.su)' },
  { id: 'smashy', name: 'Server 5 (SmashyStream)' },
  { id: 'autoembed', name: 'Server 6 (AutoEmbed FHD)' },
  { id: 'vidsrcto', name: 'Server 7 (VidSrc)' },
  { id: 'vidsrcme', name: 'Server 8 (VidSrc.me)' }
];

// Header Blur on Scroll
window.addEventListener('scroll', () => {
  if (window.scrollY > 40) {
    netflixHeader.classList.add('scrolled');
  } else {
    netflixHeader.classList.remove('scrolled');
  }
});

// Toast Notification Helper
function showToast(message) {
  if (!netflixToast) return;
  netflixToast.textContent = message;
  netflixToast.classList.add('active');
  setTimeout(() => {
    netflixToast.classList.remove('active');
  }, 2800);
}

// Anti-Redirect Protection
window.addEventListener('beforeunload', (e) => {
  if (playerModal && playerModal.classList.contains('active')) {
    e.preventDefault();
    e.returnValue = '';
  }
});

// ===================================================
// WATCHLIST ("MY LIST") ENGINE
// ===================================================
function getMyList() {
  try {
    return JSON.parse(localStorage.getItem('nflix_watchlist') || '[]');
  } catch (e) {
    return [];
  }
}

function saveMyList(list) {
  try {
    localStorage.setItem('nflix_watchlist', JSON.stringify(list));
  } catch (e) {}
}

function isInMyList(id) {
  const list = getMyList();
  return list.some(item => String(item.id) === String(id));
}

function toggleMyList(movie) {
  if (!movie) return;
  let list = getMyList();
  const exists = list.some(item => String(item.id) === String(movie.id));

  if (exists) {
    list = list.filter(item => String(item.id) !== String(movie.id));
    saveMyList(list);
    showToast(`Removed "${movie.title}" from My List`);
  } else {
    list.unshift({
      id: movie.id,
      tmdbId: movie.tmdbId || movie.id,
      type: movie.type || 'movie',
      title: movie.title,
      poster: movie.poster,
      backdrop: movie.backdrop,
      year: movie.year,
      matchScore: movie.matchScore,
      genre: movie.genre
    });
    saveMyList(list);
    showToast(`✓ Added "${movie.title}" to My List`);
  }

  updateMyListBtn(movie.id);
  renderMyList();
}

function updateMyListBtn(id) {
  if (!detailAddListBtn) return;
  if (isInMyList(id)) {
    detailAddListBtn.innerHTML = '&#10003;'; // Checkmark
    detailAddListBtn.title = 'In My List';
    detailAddListBtn.style.color = '#46d369';
  } else {
    detailAddListBtn.innerHTML = '+';
    detailAddListBtn.title = 'Add to My List';
    detailAddListBtn.style.color = '#ffffff';
  }
}

function renderMyList() {
  const list = getMyList();
  if (!myListSection || !myListGrid) return;

  if (list.length === 0) {
    myListSection.style.display = 'none';
    return;
  }

  myListSection.style.display = 'block';
  myListGrid.innerHTML = list.map(m => `
    <div class="netflix-card" data-movie-id="${m.id}" data-media-type="${m.type || 'movie'}" title="${escapeHtml(m.title)}">
      <div class="card-poster" style="background-image: url('${m.poster}');">
        <div class="card-overlay-badges">
          <span class="badge-n-logo">N</span>
        </div>
      </div>
      <div class="card-info-pane">
        <div class="card-btn-row">
          <div style="display:flex; gap:6px;">
            <button class="btn-circle-play" data-play-id="${m.id}">&#9654;</button>
          </div>
          <span class="maturity-rating">16+</span>
        </div>
        <div class="card-title">${escapeHtml(m.title)}</div>
        <div class="card-meta-line">
          <span class="match-score">${m.matchScore || '96% Match'}</span>
          <span>${m.year || '2024'}</span>
          <span class="quality-badge">4K</span>
        </div>
        <div class="card-genre-tags">${escapeHtml(m.genre || 'Trending')}</div>
      </div>
    </div>
  `).join('');

  attachCardListeners(myListGrid);
}

if (navMyList) {
  navMyList.addEventListener('click', (e) => {
    e.preventDefault();
    renderMyList();
    if (myListSection) {
      myListSection.scrollIntoView({ behavior: 'smooth' });
    }
  });
}

// ===================================================
// LOAD LIVE CATALOG FROM TMDB
// ===================================================
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
        if (!liveCatalogCache.find(x => String(x.id) === String(m.id))) {
          liveCatalogCache.push(m);
        }
      });
    });

    const heroMovie = liveCatalogCache[0];
    if (heroMovie) {
      setupHero(heroMovie);
    }

    renderCategories(data.categories);
    renderMyList();

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
  heroInfoBtn.onclick = () => openMovieInformationPage(movie.id, movie.type);
}

function renderCategories(categories) {
  categoriesContainer.innerHTML = categories.map(cat => {
    const rowId = `row-${cat.id}`;
    const isRanked = !!cat.isRanked;

    let cardsHtml = '';
    if (isRanked) {
      cardsHtml = cat.movies.map((m, idx) => {
        const rankNum = idx + 1;
        const isTv = m.type === 'tv';
        const isTen = rankNum === 10;
        return `
          <div class="top10-card ${isTen ? 'rank-10-card' : ''}" data-movie-id="${m.id}" data-media-type="${m.type || 'movie'}" title="${escapeHtml(m.title)}">
            <div class="top10-rank-wrap rank-${rankNum}">
              <span class="rank-number">${rankNum}</span>
            </div>
            <div class="top10-poster-wrap">
              <div class="top10-poster" style="background-image: url('${m.poster}');">
                <div class="card-overlay-badges">
                  <span class="badge-n-logo">${isTv ? 'SERIES' : 'N'}</span>
                  <span class="badge-top10-rank">TOP 10</span>
                </div>
                <div class="top10-hover-pane">
                  <div class="card-btn-row">
                    <div style="display:flex; gap:6px;">
                      <button class="btn-circle-play" data-play-id="${m.id}" data-media-type="${m.type || 'movie'}" title="Play">&#9654;</button>
                      <button class="btn-circle-sub" data-list-id="${m.id}" title="Add to My List">+</button>
                    </div>
                    <span class="maturity-rating">${isTv ? 'TV-MA' : '16+'}</span>
                  </div>
                  <div class="card-title">${escapeHtml(m.title)}</div>
                  <div class="card-meta-line">
                    <span class="match-score">${m.matchScore || '98% Match'}</span>
                    <span>${m.year || '2024'}</span>
                    <span class="quality-badge">4K</span>
                  </div>
                  <div class="card-genre-tags">${escapeHtml(m.genre || '')}</div>
                </div>
              </div>
            </div>
          </div>
        `;
      }).join('');
    } else {
      cardsHtml = cat.movies.map(m => {
        const isTv = m.type === 'tv';
        return `
          <div class="netflix-card" data-movie-id="${m.id}" data-media-type="${m.type || 'movie'}" title="${escapeHtml(m.title)}">
            <div class="card-poster" style="background-image: url('${m.poster}');">
              <div class="card-overlay-badges">
                <span class="badge-n-logo">${isTv ? 'SERIES' : 'N'}</span>
              </div>
            </div>
            <div class="card-info-pane">
              <div class="card-btn-row">
                <div style="display:flex; gap:6px;">
                  <button class="btn-circle-play" data-play-id="${m.id}" data-media-type="${m.type || 'movie'}">&#9654;</button>
                  <button class="btn-circle-sub" data-list-id="${m.id}" title="Add to My List">+</button>
                </div>
                <span class="maturity-rating">${isTv ? 'TV-MA' : '16+'}</span>
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

  attachCardListeners(categoriesContainer);
}

function attachCardListeners(container) {
  container.querySelectorAll('[data-movie-id]').forEach(card => {
    card.addEventListener('click', (e) => {
      // Play button click
      const playBtn = e.target.closest('[data-play-id]');
      if (playBtn) {
        const playId = playBtn.getAttribute('data-play-id');
        openMoviePlayerById(playId);
        return;
      }
      // Add to list click
      const listBtn = e.target.closest('[data-list-id]');
      if (listBtn) {
        const listId = listBtn.getAttribute('data-list-id');
        const item = liveCatalogCache.find(x => String(x.id) === String(listId));
        if (item) toggleMyList(item);
        return;
      }

      const movieId = card.getAttribute('data-movie-id');
      const mediaType = card.getAttribute('data-media-type') || 'movie';
      openMovieInformationPage(movieId, mediaType);
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
// 1. MOVIE & TV SHOW DETAIL SHEET
// ===================================================
window.openMovieInformationPage = async function(id, mediaType = 'movie') {
  if (searchDropdown) searchDropdown.classList.remove('active');
  downloadDrawer.style.display = 'none';

  // Instant local preview from cache
  const cached = liveCatalogCache.find(m => String(m.id) === String(id));
  if (cached) {
    populateDetailModal(cached);
  }

  movieDetailModal.classList.add('active');

  const endpoint = mediaType === 'tv' ? `/api/catalog/tv/${id}` : `/api/catalog/movie/${id}`;
  try {
    const res = await fetch(endpoint);
    const data = await res.json();
    const item = data.movie || data.tv;
    if (data.success && item) {
      currentActiveMovie = item;
      currentActiveMovie.type = mediaType;
      populateDetailModal(item);
    }
  } catch (err) {
    console.error('Details fetch error:', err);
  }
};

function populateDetailModal(movie) {
  currentActiveMovie = movie;
  const isTv = movie.type === 'tv' || !!movie.seasons;

  detailTitle.textContent = movie.title;
  detailBackdrop.style.backgroundImage = `url("${movie.backdrop || movie.poster}")`;
  detailTagline.textContent = movie.tagline || (movie.genre ? movie.genre.split('/')[0].trim() : 'Streaming Now');
  detailMatchScore.textContent = movie.matchScore || '98% Match';
  detailYear.textContent = movie.year || '2024';
  detailRuntime.textContent = movie.duration || (isTv ? 'TV Series' : '2h 15m');
  detailOverview.textContent = movie.synopsis || 'Streaming in 4K Ultra HD with spatial audio.';

  // Cast
  if (movie.cast && movie.cast.length > 0) {
    detailCast.textContent = movie.cast.map(c => c.name).slice(0, 6).join(', ');
  } else {
    detailCast.textContent = 'Ensemble Cast & Stars';
  }

  // Director
  detailDirector.textContent = movie.director || 'Executive Producers';

  // Genres
  detailGenres.textContent = movie.genre || (movie.genresList ? movie.genresList.join(', ') : 'Action, Drama');

  // Watchlist button state
  updateMyListBtn(movie.id);
  detailAddListBtn.onclick = () => toggleMyList(currentActiveMovie);

  // Trailer button
  if (movie.trailerKey) {
    detailTrailerBtn.style.display = 'inline-flex';
    detailTrailerBtn.onclick = () => openTrailerModal(movie.title, movie.trailerKey);
  } else {
    detailTrailerBtn.style.display = 'none';
  }

  // Primary Actions: Play and Download
  detailPlayBtn.onclick = () => {
    movieDetailModal.classList.remove('active');
    openMoviePlayer(movie, 1, 1);
  };

  detailDownloadBtn.onclick = () => {
    toggleDownloadDrawer(movie);
  };

  // TV Episodes Management
  if (isTv) {
    setupTvEpisodes(movie);
  } else {
    detailEpisodesSection.style.display = 'none';
  }
}

function setupTvEpisodes(tv) {
  detailEpisodesSection.style.display = 'block';
  const seasons = tv.seasons || [{ seasonNumber: 1, name: 'Season 1' }];

  seasonSelectDropdown.innerHTML = seasons.map(s => `
    <option value="${s.seasonNumber}">${s.name || 'Season ' + s.seasonNumber}</option>
  `).join('');

  seasonSelectDropdown.onchange = (e) => {
    loadSeasonEpisodes(tv.id, e.target.value);
  };

  loadSeasonEpisodes(tv.id, seasons[0].seasonNumber);
}

async function loadSeasonEpisodes(tvId, seasonNumber) {
  episodesListGrid.innerHTML = '<div style="color:#888888; padding: 20px 0;">Loading episodes...</div>';
  try {
    const res = await fetch(`/api/catalog/tv/${tvId}/season/${seasonNumber}`);
    const data = await res.json();
    if (data.success && data.episodes && data.episodes.length > 0) {
      renderEpisodes(tvId, seasonNumber, data.episodes);
    } else {
      episodesListGrid.innerHTML = '<div style="color:#888888; padding: 20px 0;">Episodes available via direct player stream.</div>';
    }
  } catch (err) {
    episodesListGrid.innerHTML = '<div style="color:#888888; padding: 20px 0;">Episodes stream active in player.</div>';
  }
}

function renderEpisodes(tvId, seasonNum, episodes) {
  episodesListGrid.innerHTML = episodes.map(ep => {
    const thumbStyle = ep.still ? `background-image: url('${ep.still}');` : '';
    return `
      <div class="episode-card" onclick="playTvEpisode('${tvId}', ${seasonNum}, ${ep.episodeNumber})">
        <div class="ep-num">${ep.episodeNumber}</div>
        <div class="ep-thumb-wrap" style="${thumbStyle}">
          <div class="ep-play-overlay">&#9654;</div>
        </div>
        <div class="ep-info">
          <div class="ep-title-row">
            <span class="ep-name">${escapeHtml(ep.name)}</span>
            <span class="ep-runtime">${ep.runtime}</span>
          </div>
          <p class="ep-desc">${escapeHtml(ep.overview)}</p>
        </div>
      </div>
    `;
  }).join('');
}

window.playTvEpisode = function(tvId, season, episode) {
  if (movieDetailModal) movieDetailModal.classList.remove('active');
  const tv = liveCatalogCache.find(m => String(m.id) === String(tvId)) || currentActiveMovie;
  if (tv) {
    tv.type = 'tv';
    openMoviePlayer(tv, season, episode);
  }
};

function toggleDownloadDrawer(movie) {
  if (downloadDrawer.style.display === 'block') {
    downloadDrawer.style.display = 'none';
    return;
  }

  downloadDrawer.style.display = 'block';
  const targetId = movie.imdbId || movie.tmdbId || movie.id;

  const mirrors = [
    { quality: '1080p FHD (Direct Stream DL)', size: '2.4 GB', url: `https://player.autoembed.co/embed/movie/${targetId}` },
    { quality: '720p HD (Compressed MP4)', size: '1.2 GB', url: `https://vidsrc.to/embed/movie/${targetId}` },
    { quality: '480p Mobile Saver', size: '650 MB', url: `https://www.2embed.cc/embed/${targetId}` }
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
// 2. THEATER VIDEO PLAYER (MOVIES & TV EPISODES)
// ===================================================
window.openMoviePlayerById = function(id) {
  const movie = liveCatalogCache.find(m => String(m.id) === String(id));
  if (movie) {
    openMoviePlayer(movie, 1, 1);
  } else {
    openMovieInformationPage(id);
  }
};

window.openMoviePlayer = function(movie, season = 1, episode = 1) {
  currentActiveMovie = movie;
  currentSeasonNum = season;
  currentEpisodeNum = episode;

  if (searchDropdown) searchDropdown.classList.remove('active');
  if (movieDetailModal) movieDetailModal.classList.remove('active');

  const isTv = movie.type === 'tv' || !!movie.seasons;

  playerTitle.textContent = movie.title;
  playerMeta.innerHTML = `${movie.year || '2024'} &bull; ${movie.duration || '2h 10m'} &bull; ${movie.genre || 'Action'} &bull; <span style="color:#46d369; font-weight:700;">${movie.matchScore || '98% Match'}</span>`;

  // Episode Nav
  if (isTv) {
    theaterEpNav.style.display = 'flex';
    playerEpBadge.textContent = `S${season} E${episode}`;
    playerNextEpBtn.onclick = () => {
      openMoviePlayer(movie, season, episode + 1);
      showToast(`Loading Episode ${episode + 1}...`);
    };
  } else {
    theaterEpNav.style.display = 'none';
  }

  // Open Player Modal
  playerModal.classList.add('active');

  // Launch Stremio / Torrent engine directly
  initTorrentPlaybackForMovie(movie, isTv ? 'tv' : 'movie', season, episode);
};

// Dummy functions for backwards compatibility without erroring
window.autoSwitchToNextServer = function() {};
window.switchEmbedServer = function() {};
window.openDirectCinemaWindow = function() {};
window.SERVERS_ORDER = [];

// Smart Auto-Fallback Switcher
window.autoSwitchToNextServer = function() {
  currentServerIndex = (currentServerIndex + 1) % SERVERS_ORDER.length;
  const nextServer = SERVERS_ORDER[currentServerIndex];
  switchEmbedServer(nextServer.id);
  showToast(`Switched to ${nextServer.name}`);
};

window.switchEmbedServer = function(serverType, btn) {
  // Sync dropdown & Hindi button active state
  const srvSelect = document.getElementById('playerServerSelect');
  if (srvSelect) srvSelect.value = serverType;
  const hindiBtn = document.getElementById('playerHindiBtn');
  if (hindiBtn) {
    if (serverType === 'multiembed') {
      hindiBtn.classList.add('active');
    } else {
      hindiBtn.classList.remove('active');
    }
  }
  if (!currentActiveMovie) return;

  const rawId = currentActiveMovie.tmdbId || currentActiveMovie.id;
  const isDirectImdb = String(rawId).startsWith('tt');
  const hasRealImdb = currentActiveMovie.imdbId && String(currentActiveMovie.imdbId).startsWith('tt') && !String(currentActiveMovie.imdbId).startsWith(`tt${rawId}`);
  const realImdb = isDirectImdb ? String(rawId) : (hasRealImdb ? currentActiveMovie.imdbId : null);
  const tmdbId = isDirectImdb ? '' : String(rawId).replace(/^tt/, '');
  const isTv = currentActiveMovie.type === 'tv' || !!currentActiveMovie.seasons;
  const s = currentSeasonNum;
  const e = currentEpisodeNum;

  // Update active pill button
  document.querySelectorAll('.server-pill').forEach(p => p.classList.remove('active'));
  const foundIdx = SERVERS_ORDER.findIndex(srv => srv.id === serverType);
  if (foundIdx !== -1) currentServerIndex = foundIdx;

  if (btn) {
    btn.classList.add('active');
  } else {
    const srvBtn = document.getElementById('srvBtn' + serverType.charAt(0).toUpperCase() + serverType.slice(1));
    if (srvBtn) srvBtn.classList.add('active');
    else {
      const defBtn = document.getElementById('srvBtn2Embed');
      if (defBtn) defBtn.classList.add('active');
    }
  }

  let streamUrl = '';

  if (isTv) {
    // TV Series Streaming URLs (Season + Episode)
    if (serverType === '2embed') {
      streamUrl = `https://www.2embed.cc/embedtv/${tmdbId || realImdb}&s=${s}&e=${e}`;
    } else if (serverType === 'vidlink') {
      streamUrl = `https://vidlink.pro/tv/${tmdbId || realImdb}/${s}/${e}`;
    } else if (serverType === 'multiembed') {
      streamUrl = realImdb ? `https://multiembed.mov/?video_id=${realImdb}&tmdb=1&s=${s}&e=${e}` : `https://multiembed.mov/?video_id=${tmdbId}&tmdb=1&s=${s}&e=${e}`;
    } else if (serverType === 'embedsu') {
      streamUrl = `https://embed.su/embed/tv/${tmdbId || realImdb}/${s}/${e}`;
    } else if (serverType === 'smashy') {
      streamUrl = `https://embed.smashystream.com/playere.php?tmdb=${tmdbId || realImdb}&season=${s}&episode=${e}`;
    } else if (serverType === 'autoembed') {
      streamUrl = `https://player.autoembed.co/embed/tv/${tmdbId || realImdb}/${s}/${e}`;
    } else if (serverType === 'vidsrcto') {
      streamUrl = `https://vidsrc.to/embed/tv/${tmdbId || realImdb}/${s}/${e}`;
    } else if (serverType === 'vidsrcme') {
      streamUrl = `https://vidsrc.me/embed/tv?tmdb=${tmdbId || realImdb}&season=${s}&episode=${e}`;
    }
  } else {
    // Movie Streaming URLs
    if (serverType === '2embed') {
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
  }

  // Clear frame first for clean reload
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
  const isTv = currentActiveMovie.type === 'tv' || !!currentActiveMovie.seasons;

  let streamUrl = '';
  if (isTv) {
    streamUrl = `https://www.2embed.cc/embedtv/${tmdbId || realImdb}&s=${currentSeasonNum}&e=${currentEpisodeNum}`;
  } else {
    streamUrl = realImdb ? `https://www.2embed.cc/embed/${realImdb}` : `https://www.2embed.cc/embed/${tmdbId}`;
  }
  window.open(streamUrl, '_blank');
};

closePlayerBtn.addEventListener('click', () => {
  if (torrentStatsInterval) {
    clearInterval(torrentStatsInterval);
    torrentStatsInterval = null;
  }
  const videoEl = document.getElementById('nativeTorrentVideo');
  if (videoEl) {
    videoEl.pause();
    videoEl.removeAttribute('src');
    videoEl.load();
  }
  const loadingOverlay = document.getElementById('torrentLoadingOverlay');
  if (loadingOverlay) loadingOverlay.classList.remove('hidden');

  closeTorrentStreamsDrawer();
  playerModal.classList.remove('active');
  currentActiveMovie = null;
  currentTorrentStreams = [];
});

// ===================================================
// 3. TRAILER PREVIEW MODAL
// ===================================================
function openTrailerModal(title, trailerKey) {
  if (!trailerKey) return;
  trailerTitle.textContent = `${title} — Official Trailer`;
  trailerIframe.src = `https://www.youtube-nocookie.com/embed/${trailerKey}?autoplay=1`;
  trailerModal.classList.add('active');
}

closeTrailerBtn.addEventListener('click', () => {
  trailerIframe.src = '';
  trailerModal.classList.remove('active');
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (trailerModal.classList.contains('active')) {
      closeTrailerBtn.click();
    } else if (playerModal.classList.contains('active')) {
      closePlayerBtn.click();
    } else if (movieDetailModal.classList.contains('active')) {
      closeDetailBtn.click();
    }
  }
});

movieDetailModal.addEventListener('click', (e) => {
  if (e.target === movieDetailModal) {
    movieDetailModal.classList.remove('active');
  }
});

// NOTE: Backdrop click intentionally disabled for playerModal so clicking sides does NOT close the video
// Video player can ONLY be closed by clicking the explicit close button (#closePlayerBtn)

trailerModal.addEventListener('click', (e) => {
  if (e.target === trailerModal) {
    closeTrailerBtn.click();
  }
});

// ===================================================
// 4. SEARCH BAR WITH AUTO-SUGGESTIONS
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
        openMovieInformationPage(m.id, m.type || 'movie');
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
        <div class="dropdown-meta"><span>Instant Media Information</span></div>
      </div>
      <div class="dropdown-play-icon">&#9654;</div>
    `;

    customItem.onclick = () => {
      openMovieInformationPage(targetImdb, 'movie');
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

// Initial Catalog Load
loadNetflixCatalog();


// ===================================================
// STREMIO / TORRENT P2P STREAMING CONTROLLER
// ===================================================
// STREMIO / TORRENTIO P2P STREAM ENGINE & DUAL-AUDIO
// ===================================================

let currentTorrentStreams = [];
let currentActiveInfoHash = null;
let torrentStatsInterval = null;

async function initTorrentPlaybackForMovie(movie, type, season, episode) {
  const loadingOverlay = document.getElementById('torrentLoadingOverlay');
  const loadingTitle = document.getElementById('torrentLoadingTitle');
  const loadingSub = document.getElementById('torrentLoadingSub');
  const streamTitleEl = document.getElementById('torrentStreamTitle');
  const langSelect = document.getElementById('playerLanguageSelect');
  const streamsBtnLabel = document.getElementById('streamsBtnLabel');
  const videoEl = document.getElementById('nativeTorrentVideo');

  if (loadingOverlay) {
    loadingOverlay.classList.remove('hidden');
    if (loadingTitle) loadingTitle.textContent = 'Connecting to P2P Swarm...';
    if (loadingSub) loadingSub.textContent = 'Searching Stremio torrent swarms for "' + movie.title + '"';
  }
  if (streamTitleEl) streamTitleEl.textContent = 'Searching streams for ' + movie.title + '...';
  if (langSelect) {
    langSelect.innerHTML = '<option value="auto">⏳ Detecting Audio Languages...</option>';
  }

  // 1. Resolve IMDb ID
  let imdbId = movie.imdbId;
  const rawId = movie.tmdbId || movie.id;
  if (!imdbId || !String(imdbId).startsWith('tt')) {
    if (String(rawId).startsWith('tt')) {
      imdbId = String(rawId);
    } else {
      try {
        const tmdbId = String(rawId).replace(/^tt/, '');
        const res = await fetch('/api/catalog/' + type + '/' + tmdbId);
        const data = await res.json();
        const item = data.movie || data.tv;
        if (data.success && item && item.imdbId) {
          imdbId = item.imdbId;
          movie.imdbId = imdbId;
          if (currentActiveMovie && String(currentActiveMovie.id) === String(movie.id)) {
            currentActiveMovie.imdbId = imdbId;
          }
        }
      } catch (e) {
        console.error('Error resolving IMDb ID:', e);
      }
    }
  }

  if (!imdbId) {
    if (loadingTitle) loadingTitle.textContent = 'Stream Unavailable';
    if (loadingSub) loadingSub.textContent = 'Could not find IMDb identifier for this title.';
    return;
  }

  // 2. Fetch Stremio / Torrent streams
  try {
    const res = await fetch('/api/torrent/streams/' + imdbId + '?type=' + type + '&season=' + season + '&episode=' + episode);
    const data = await res.json();

    if (!data.success || !data.streams || data.streams.length === 0) {
      if (loadingTitle) loadingTitle.textContent = 'No Active Torrents Found';
      if (loadingSub) loadingSub.textContent = 'No peers/seeds currently available for this title.';
      if (streamsBtnLabel) streamsBtnLabel.textContent = 'Streams (0)';
      return;
    }

    currentTorrentStreams = data.streams;
    if (streamsBtnLabel) streamsBtnLabel.textContent = 'Streams (' + currentTorrentStreams.length + ')';

    // 3. Group streams by detected languages
    const langMap = new Map();
    currentTorrentStreams.forEach(s => {
      const lang = s.language || (s.isHindi ? 'Hindi Dubbed' : 'English');
      if (!langMap.has(lang)) {
        langMap.set(lang, []);
      }
      langMap.get(lang).push(s);
    });

    let defaultLang = 'English';
    if (langMap.has('Hindi Dubbed')) {
      defaultLang = 'Hindi Dubbed';
    } else if (langMap.has('Hindi + English Dual Audio')) {
      defaultLang = 'Hindi + English Dual Audio';
    } else if (langMap.has('Dual Audio')) {
      defaultLang = 'Dual Audio';
    }

    const langOptions = [];
    for (const [langName, list] of langMap.entries()) {
      const topSeed = list[0].seeders || 0;
      let badge = '🌐 ';
      if (langName.includes('Hindi')) badge = '🇮🇳 ';
      else if (langName.includes('English')) badge = '🇬🇧 ';
      else if (langName.includes('Dual')) badge = '🎧 ';
      langOptions.push('<option value="' + escapeHtml(langName) + '">' + badge + escapeHtml(langName) + ' (' + list.length + ' streams · ' + topSeed + ' seeds)</option>');
    }

    if (langSelect) {
      langSelect.innerHTML = langOptions.join('');
      langSelect.value = defaultLang;
    }

    // 4. Play best stream for default language
    const streamsForLang = langMap.get(defaultLang) || currentTorrentStreams;
    const bestStream = streamsForLang[0];
    playTorrentStream(bestStream.infoHash, bestStream.title, bestStream.audioBadge);

    // Pre-render drawer list
    renderTorrentStreamsList(currentTorrentStreams);

  } catch (err) {
    console.error('Failed to load torrent streams:', err);
    if (loadingTitle) loadingTitle.textContent = 'Stream Connection Failed';
    if (loadingSub) loadingSub.textContent = err.message;
  }
}

window.switchTorrentLanguage = function(selectedLang) {
  if (!currentTorrentStreams || currentTorrentStreams.length === 0) return;

  const matching = currentTorrentStreams.filter(s => {
    const l = s.language || (s.isHindi ? 'Hindi Dubbed' : 'English');
    return l.toLowerCase() === selectedLang.toLowerCase();
  });

  if (matching.length > 0) {
    const best = matching[0];
    playTorrentStream(best.infoHash, best.title, best.audioBadge);
    showToast('Switched audio to: ' + selectedLang + ' (' + best.quality + ')');
  } else {
    showToast('No streams found for language: ' + selectedLang);
  }
};

window.toggleTorrentStreamsDrawer = function() {
  const drawer = document.getElementById('torrentStreamsDrawer');
  if (!drawer) return;
  if (drawer.style.display === 'flex') {
    closeTorrentStreamsDrawer();
  } else {
    openTorrentStreamsDrawer();
  }
};

window.openTorrentStreamsDrawer = function() {
  const drawer = document.getElementById('torrentStreamsDrawer');
  if (drawer) {
    drawer.style.display = 'flex';
    renderTorrentStreamsList(currentTorrentStreams);
  }
};

window.closeTorrentStreamsDrawer = function() {
  const drawer = document.getElementById('torrentStreamsDrawer');
  if (drawer) drawer.style.display = 'none';
};

window.filterTorrentDrawer = function(filterType, btn) {
  document.querySelectorAll('.drawer-filter-chip').forEach(c => c.classList.remove('active'));
  if (btn) btn.classList.add('active');

  if (filterType === 'all') {
    renderTorrentStreamsList(currentTorrentStreams);
  } else if (filterType === 'hindi') {
    renderTorrentStreamsList(currentTorrentStreams.filter(s => s.isHindi || (s.language && s.language.includes('Hindi'))));
  } else if (filterType === 'dual') {
    renderTorrentStreamsList(currentTorrentStreams.filter(s => (s.audioBadge && s.audioBadge.includes('Dual')) || (s.language && s.language.includes('Dual'))));
  } else if (filterType === '1080p') {
    renderTorrentStreamsList(currentTorrentStreams.filter(s => s.quality.includes('1080p')));
  } else if (filterType === '4k') {
    renderTorrentStreamsList(currentTorrentStreams.filter(s => s.quality.includes('4K')));
  }
};

function renderTorrentStreamsList(streams) {
  const listContainer = document.getElementById('torrentStreamsList');
  if (!listContainer) return;

  if (streams.length === 0) {
    listContainer.innerHTML = '<div class="torrent-empty-state"><span>No matching streams for this filter.</span></div>';
    return;
  }

  listContainer.innerHTML = streams.map(s => {
    return `
      <div class="torrent-stream-card ${s.isHindi ? 'is-hindi' : ''}" onclick="playTorrentStream('${s.infoHash}', '${escapeHtml(s.title)}', '${escapeHtml(s.audioBadge)}', '${escapeHtml(s.language || '')}')">
        <div class="stream-card-left">
          <div class="stream-badge-row">
            <span class="badge-quality">${s.quality}</span>
            <span class="badge-audio">${s.audioBadge}</span>
          </div>
          <div class="stream-file-title" title="${escapeHtml(s.filename)}">${escapeHtml(s.title)}</div>
          <div class="stream-meta-line">
            <span class="meta-seeders">&#128101; ${s.seeders} Seeders</span>
            <span>&#128190; ${s.size || 'Direct'}</span>
            <span>File: ${escapeHtml((s.filename || '').slice(0, 35))}...</span>
          </div>
        </div>
        <div class="stream-card-right">
          <button class="btn-play-torrent">&#9654; Stream Now</button>
        </div>
      </div>
    `;
  }).join('');
}

window.playTorrentStream = function(infoHash, title, audioBadge, streamLang) {
  currentActiveInfoHash = infoHash;
  closeTorrentStreamsDrawer();

  const loadingOverlay = document.getElementById('torrentLoadingOverlay');
  const loadingTitle = document.getElementById('torrentLoadingTitle');
  const loadingSub = document.getElementById('torrentLoadingSub');
  const videoEl = document.getElementById('nativeTorrentVideo');
  const streamTitleEl = document.getElementById('torrentStreamTitle');
  const langSelect = document.getElementById('playerLanguageSelect');

  // Sync language select if specified
  if (streamLang && langSelect && langSelect.value !== streamLang) {
    langSelect.value = streamLang;
  }

  if (loadingOverlay) {
    loadingOverlay.classList.remove('hidden');
    if (loadingTitle) loadingTitle.textContent = 'Buffering ' + (audioBadge || 'Stream') + '...';
    if (loadingSub) loadingSub.textContent = title;
  }

  if (streamTitleEl) streamTitleEl.textContent = title + (audioBadge ? ' • ' + audioBadge : '');

  if (videoEl) {
    videoEl.src = '/api/torrent/play/' + infoHash;
    videoEl.load();

    const hideOverlay = () => {
      if (loadingOverlay) loadingOverlay.classList.add('hidden');
    };

    videoEl.onplaying = hideOverlay;
    videoEl.oncanplay = hideOverlay;
    videoEl.onloadeddata = hideOverlay;

    videoEl.play().catch(e => {
      console.log('Autoplay deferred:', e.message);
    });
  }

  startTorrentStatsPolling(infoHash);
};

function startTorrentStatsPolling(infoHash) {
  if (torrentStatsInterval) clearInterval(torrentStatsInterval);

  const speedPill = document.getElementById('torrentSpeedPill');
  const peersPill = document.getElementById('torrentPeersPill');

  torrentStatsInterval = setInterval(async () => {
    if (!currentActiveInfoHash || currentActiveInfoHash !== infoHash) {
      clearInterval(torrentStatsInterval);
      return;
    }
    try {
      const res = await fetch('/api/torrent/stats/' + infoHash);
      const data = await res.json();
      if (data.success && data.stats) {
        if (speedPill) speedPill.textContent = '⚡ ' + data.stats.downloadSpeed;
        if (peersPill) peersPill.textContent = '👥 ' + data.stats.peers + ' Peers';
        
        // If speed > 0 and video is playing, ensure overlay is hidden
        if (data.stats.numPeers > 0) {
          const loadingOverlay = document.getElementById('torrentLoadingOverlay');
          const videoEl = document.getElementById('nativeTorrentVideo');
          if (loadingOverlay && videoEl && !videoEl.paused && videoEl.currentTime > 0) {
            loadingOverlay.classList.add('hidden');
          }
        }
      }
    } catch (e) {
      // Swarm stats poll fail silently
    }
  }, 2500);
}
