const express = require('express');
const router = express.Router();
const { fetchTorrentioStreams, getOrCreateTorrentEngine } = require('../services/torrentService');

/**
 * GET /api/torrent/streams/:imdbId
 * Returns list of available torrent streams with Hindi, Dual Audio, Seeders, 4K/1080p
 */
router.get('/streams/:imdbId', async (req, res) => {
  const { imdbId } = req.params;
  const { type = 'movie', season = 1, episode = 1 } = req.query;

  try {
    const streams = await fetchTorrentioStreams(imdbId, type, parseInt(season, 10), parseInt(episode, 10));
    return res.json({
      success: true,
      count: streams.length,
      streams
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/torrent/play/:infoHash
 * HTTP range stream for HTML5 video player
 */
router.get('/play/:infoHash', (req, res) => {
  const { infoHash } = req.params;
  if (!infoHash) {
    return res.status(400).send('infoHash required');
  }

  const entry = getOrCreateTorrentEngine(infoHash);

  const startStreaming = (file) => {
    const total = file.length;
    const range = req.headers.range;

    let mimeType = 'video/mp4';
    if (/\.mkv$/i.test(file.name)) mimeType = 'video/x-matroska';
    else if (/\.webm$/i.test(file.name)) mimeType = 'video/webm';

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : total - 1;
      const chunkSize = (end - start) + 1;

      res.writeHead(206, {
        'Content-Range': 'bytes ' + start + '-' + end + '/' + total,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': mimeType,
        'Cache-Control': 'no-cache'
      });

      const stream = file.createReadStream({ start, end });
      stream.pipe(res);
      stream.on('error', (err) => {
        console.error('[Stream Error]', err.message);
        if (!res.headersSent) res.status(500).end();
      });
    } else {
      res.writeHead(200, {
        'Content-Length': total,
        'Content-Type': mimeType,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-cache'
      });

      const stream = file.createReadStream();
      stream.pipe(res);
      stream.on('error', (err) => {
        console.error('[Stream Error]', err.message);
        if (!res.headersSent) res.status(500).end();
      });
    }
  };

  if (entry.ready && entry.file) {
    startStreaming(entry.file);
  } else {
    // Wait for engine ready event (timeout 30s)
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      if (!res.headersSent) {
        res.status(504).json({ error: 'Torrent metadata timeout. Try another stream with more seeders.' });
      }
    }, 30000);

    const onReadyCheck = setInterval(() => {
      if (entry.ready && entry.file) {
        clearInterval(onReadyCheck);
        clearTimeout(timer);
        if (!timedOut && !res.headersSent) {
          startStreaming(entry.file);
        }
      }
    }, 300);
  }
});

/**
 * GET /api/torrent/stats/:infoHash
 * Live torrent speed and peer stats
 */
router.get('/stats/:infoHash', (req, res) => {
  const { infoHash } = req.params;
  const entry = getOrCreateTorrentEngine(infoHash);
  if (!entry || !entry.engine) {
    return res.json({ peers: 0, speed: 0, ready: false });
  }

  const swarm = entry.engine.swarm;
  const peers = swarm ? swarm.wires.length : 0;
  const speed = swarm ? swarm.downloadSpeed() : 0;
  const downloaded = entry.engine.torrent ? entry.engine.torrent.downloaded : 0;

  res.json({
    infoHash,
    ready: entry.ready,
    fileName: entry.file ? entry.file.name : 'Connecting to Swarm...',
    fileSize: entry.file ? entry.file.length : 0,
    peers,
    speedKBps: (speed / 1024).toFixed(1),
    downloadedMB: (downloaded / (1024 * 1024)).toFixed(1)
  });
});

module.exports = router;
