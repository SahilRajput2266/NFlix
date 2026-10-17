const path = require('path');
const fs = require('fs');
const ffmpeg = require('@ffmpeg-installer/ffmpeg');
const ffprobe = require('@ffprobe-installer/ffprobe');

const ROOT_DIR = path.resolve(__dirname, '..');

// Native .env parser
const envFile = path.join(ROOT_DIR, '.env');
if (fs.existsSync(envFile)) {
  const content = fs.readFileSync(envFile, 'utf8');
  content.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const idx = trimmed.indexOf('=');
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim();
      process.env[key] = val;
    }
  });
}

module.exports = {
  PORT: process.env.PORT || 4000,
  TMDB_API_KEY: process.env.TMDB_API_KEY || '0fd277f90c948d5d3d39c5b1242cec88',
  TMDB_ACCESS_TOKEN: process.env.TMDB_ACCESS_TOKEN || '',
  ROOT_DIR,
  STORAGE_DIR: path.join(ROOT_DIR, 'storage'),
  RAW_UPLOADS_DIR: path.join(ROOT_DIR, 'storage', 'raw'),
  HLS_OUTPUT_DIR: path.join(ROOT_DIR, 'storage', 'hls'),
  JOBS_FILE: path.join(ROOT_DIR, 'storage', 'jobs.json'),

  FFMPEG_PATH: ffmpeg.path,
  FFPROBE_PATH: ffprobe.path,

  HLS_SEGMENT_TIME: 4,

  STREAM_PROFILES: [
    {
      name: '360p',
      width: 640,
      height: 360,
      videoBitrate: '800k',
      audioBitrate: '96k',
      bandwidth: 896000
    },
    {
      name: '720p',
      width: 1280,
      height: 720,
      videoBitrate: '2400k',
      audioBitrate: '128k',
      bandwidth: 2528000
    },
    {
      name: '1080p',
      width: 1920,
      height: 1080,
      videoBitrate: '4500k',
      audioBitrate: '192k',
      bandwidth: 4692000
    }
  ]
};
