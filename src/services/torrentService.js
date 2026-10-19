const https = require('https');
const path = require('path');
const fs = require('fs');
const torrentStream = require('torrent-stream');

const TORRENT_CACHE_DIR = path.resolve(__dirname, '../../storage/torrent-cache');
if (!fs.existsSync(TORRENT_CACHE_DIR)) {
  fs.mkdirSync(TORRENT_CACHE_DIR, { recursive: true });
}

// Map of active torrent engines: infoHash -> { engine, lastAccess, file, ready }
const activeEngines = new Map();

const DEFAULT_TRACKERS = [
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://open.stealth.si:80/announce',
  'udp://tracker.torrent.eu.org:451/announce',
  'udp://open.demonii.com:1337/announce',
  'udp://exodus.desync.com:6969/announce',
  'udp://tracker.qu.ax:6969/announce',
  'udp://tracker.nyaa.vc:6969/announce',
  'udp://explodie.org:6969/announce',
  'udp://tracker.corpscorp.online:80/announce'
];

/**
 * Fetch available torrent streams for a movie or TV show using open Stremio protocol (Torrentio)
 */
async function fetchTorrentioStreams(imdbId, type = 'movie', season = 1, episode = 1, debridKey = process.env.REALDEBRID_API_KEY) {
  return new Promise((resolve) => {
    let cleanImdb = String(imdbId).trim();
    if (!cleanImdb.startsWith('tt')) {
      cleanImdb = 'tt' + cleanImdb;
    }

    const configPrefix = debridKey ? `realdebrid=${debridKey.trim()}/` : '';
    const endpoint = type === 'tv'
      ? `https://torrentio.strem.fun/${configPrefix}stream/series/${cleanImdb}:${season}:${episode}.json`
      : `https://torrentio.strem.fun/${configPrefix}stream/movie/${cleanImdb}.json`;

    https.get(endpoint, { timeout: 8000 }, (res) => {
      let rawData = '';
      res.on('data', chunk => rawData += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(rawData);
          if (!json.streams || !Array.isArray(json.streams)) {
            return resolve([]);
          }

          const parsed = json.streams.map((s, idx) => {
            const rawTitle = s.title || '';
            const nameLine = s.name || '';
            
            const seedersMatch = rawTitle.match(/👤\s*(\d+)/);
            const seeders = seedersMatch ? parseInt(seedersMatch[1], 10) : 0;

            const sizeMatch = rawTitle.match(/💾\s*([\d\.]+\s*[GM]B)/i);
            const size = sizeMatch ? sizeMatch[1] : '';

            let quality = '1080p FHD';
            if (/4k|2160p|uhd/i.test(nameLine + rawTitle)) quality = '4K Ultra HD';
            else if (/1080p/i.test(nameLine + rawTitle)) quality = '1080p FHD';
            else if (/720p/i.test(nameLine + rawTitle)) quality = '720p HD';

            const isHindi = /hindi|hin\b/i.test(rawTitle);
            const isDualAudio = /dual[\s\-_.]*audio/i.test(rawTitle);
            const isMultiAudio = /multi[\s\-_.]*audio|multi/i.test(rawTitle);
            const isTelugu = /telugu/i.test(rawTitle);
            const isTamil = /tamil/i.test(rawTitle);

            let audioBadge = 'English';
            let language = 'English';

            if (isHindi && isDualAudio) {
              audioBadge = '🇮🇳 Hindi + English Dual Audio';
              language = 'Hindi + English Dual Audio';
            } else if (isHindi) {
              audioBadge = '🇮🇳 Hindi Dubbed';
              language = 'Hindi Dubbed';
            } else if (isDualAudio) {
              audioBadge = '🎧 Dual Audio';
              language = 'Dual Audio';
            } else if (isTelugu) {
              audioBadge = 'Telugu Audio';
              language = 'Telugu';
            } else if (isTamil) {
              audioBadge = 'Tamil Audio';
              language = 'Tamil';
            } else if (/spanish|castellano/i.test(rawTitle)) {
              audioBadge = 'Spanish Audio';
              language = 'Spanish';
            } else if (/french|vf\b/i.test(rawTitle)) {
              audioBadge = 'French Audio';
              language = 'French';
            } else if (/russian|rus\b/i.test(rawTitle)) {
              audioBadge = 'Russian Audio';
              language = 'Russian';
            } else if (isMultiAudio) {
              audioBadge = '🌐 Multi-Language';
              language = 'Multi-Language';
            }

            const firstLine = rawTitle.split('\n')[0].replace(/[\.[\]]/g, ' ').trim();

            return {
              id: s.infoHash || ('stream-' + idx),
              infoHash: s.infoHash,
              url: s.url || null,
              fileIdx: s.fileIdx !== undefined ? s.fileIdx : 0,
              quality,
              audioBadge,
              language,
              isHindi: isHindi || isDualAudio,
              seeders,
              size,
              title: firstLine,
              filename: (s.behaviorHints && s.behaviorHints.filename) || firstLine,
              sources: s.sources || []
            };
          });

          // Sort: Hindi/Dual audio first, then highest seeders
          parsed.sort((a, b) => {
            if (a.isHindi && !b.isHindi) return -1;
            if (!a.isHindi && b.isHindi) return 1;
            return b.seeders - a.seeders;
          });

          resolve(parsed);
        } catch (e) {
          console.error('Torrentio JSON parse error:', e.message);
          resolve([]);
        }
      });
    }).on('error', (err) => {
      console.error('Torrentio request error:', err.message);
      resolve([]);
    });
  });
}

function isVideoFile(name) {
  return /\.(mp4|mkv|webm|avi|mov|m4v)$/i.test(name);
}

function purgeOldTorrentFiles() {
  try {
    if (fs.existsSync(TORRENT_CACHE_DIR)) {
      const items = fs.readdirSync(TORRENT_CACHE_DIR);
      for (const item of items) {
        const fullPath = path.join(TORRENT_CACHE_DIR, item);
        try {
          fs.rmSync(fullPath, { recursive: true, force: true });
        } catch (e) {}
      }
      console.log('[TorrentEngine] Cleaned disk cache to prevent storage fill-up');
    }
  } catch (err) {
    console.error('[TorrentEngine] Cache purge error:', err.message);
  }
}

// Purge any stale cache on startup
purgeOldTorrentFiles();

function getOrCreateTorrentEngine(infoHash, customTrackers = []) {
  const hash = String(infoHash).toLowerCase().trim();

  if (activeEngines.has(hash)) {
    const entry = activeEngines.get(hash);
    entry.lastAccess = Date.now();
    if (entry.idleTimer) {
      clearTimeout(entry.idleTimer);
      entry.idleTimer = null;
    }
    return entry;
  }

  const magnetUri = 'magnet:?xt=urn:btih:' + hash + '&tr=' + DEFAULT_TRACKERS.concat(customTrackers).join('&tr=');

  const engine = torrentStream(magnetUri, {
    connections: 50,
    uploads: 0,
    tmp: TORRENT_CACHE_DIR,
    trackers: DEFAULT_TRACKERS
  });

  const entry = {
    infoHash: hash,
    engine,
    file: null,
    ready: false,
    activeReaders: 0,
    idleTimer: null,
    lastAccess: Date.now()
  };

  engine.on('ready', () => {
    let maxFile = null;
    let maxLen = 0;

    engine.files.forEach(file => {
      if (file.length > maxLen && isVideoFile(file.name)) {
        maxFile = file;
        maxLen = file.length;
      }
    });

    if (maxFile) {
      entry.file = maxFile;
      entry.ready = true;
      // CRITICAL: Deselect ALL files so torrent-stream DOES NOT download the full 10-50GB movie to disk!
      // Only bytes requested on-demand by file.createReadStream({start, end}) will be buffered in live memory.
      engine.files.forEach(f => f.deselect());
      engine.deselect();
      console.log('[TorrentEngine] Live streaming ready (On-Demand only):', maxFile.name);
    }
  });

  activeEngines.set(hash, entry);
  return entry;
}

function releaseTorrentEngine(infoHash) {
  const hash = String(infoHash).toLowerCase().trim();
  const entry = activeEngines.get(hash);
  if (!entry) return;

  entry.activeReaders = Math.max(0, entry.activeReaders - 1);
  if (entry.activeReaders === 0) {
    if (entry.idleTimer) clearTimeout(entry.idleTimer);
    // If no active viewer for 90 seconds, completely delete downloaded torrent chunks from disk
    entry.idleTimer = setTimeout(() => {
      console.log('[TorrentEngine] Releasing engine & wiping temp files from disk for:', hash);
      try {
        if (typeof entry.engine.remove === 'function') {
          entry.engine.remove(() => {
            console.log('[TorrentEngine] Deleted disk files for:', hash);
          });
        } else {
          entry.engine.destroy();
        }
      } catch (e) {}
      activeEngines.delete(hash);
    }, 90 * 1000);
  }
}

// Inactive engine periodic cleanup (Every 3 minutes, remove idle engines and free disk)
setInterval(() => {
  const now = Date.now();
  for (const [hash, entry] of activeEngines.entries()) {
    if (entry.activeReaders === 0 && (now - entry.lastAccess > 3 * 60 * 1000)) {
      console.log('[TorrentEngine] Idle cleanup - wiping torrent disk files:', hash);
      try {
        if (typeof entry.engine.remove === 'function') {
          entry.engine.remove(() => {});
        } else {
          entry.engine.destroy();
        }
      } catch (e) {}
      activeEngines.delete(hash);
    }
  }
  // If no engines are running, ensure cache directory is clean
  if (activeEngines.size === 0) {
    purgeOldTorrentFiles();
  }
}, 3 * 60 * 1000);

module.exports = {
  fetchTorrentioStreams,
  getOrCreateTorrentEngine,
  releaseTorrentEngine,
  purgeOldTorrentFiles
};
