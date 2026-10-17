const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const config = require('./config');
const videoRoutes = require('./routes/videoRoutes');
const torrentRoutes = require('./routes/torrentRoutes');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

[config.RAW_UPLOADS_DIR, config.HLS_OUTPUT_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

app.use(express.static(path.join(__dirname, 'public')));

app.use('/storage/hls', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.path.endsWith('.m3u8')) {
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  } else if (req.path.endsWith('.ts')) {
    res.setHeader('Content-Type', 'video/mp2t');
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
  }
  next();
}, express.static(config.HLS_OUTPUT_DIR));

app.use('/api/videos', videoRoutes);
app.use('/api/torrent', torrentRoutes);
app.use('/api/catalog', require('./routes/catalogRoutes'));

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ONLINE',
    system: 'Distributed HLS Streaming Platform',
    transcoderEngine: 'FFmpeg (Multi-Bitrate ABR)',
    timestamp: new Date().toISOString()
  });
});

app.listen(config.PORT, () => {
  console.log('==================================================');
  console.log(`Distributed Stream Engine running on http://localhost:${config.PORT}`);
  console.log(`HLS Edge Distributor active at /storage/hls`);
  console.log('==================================================');
});

