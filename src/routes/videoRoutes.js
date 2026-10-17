const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const jobQueue = require('../queue/jobQueue');
const playbackService = require('../services/playbackService');
const EncryptionService = require('../services/encryptionService');

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(config.RAW_UPLOADS_DIR)) {
      fs.mkdirSync(config.RAW_UPLOADS_DIR, { recursive: true });
    }
    cb(null, config.RAW_UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const videoId = uuidv4();
    req.generatedVideoId = videoId;
    cb(null, `${videoId}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const validMimes = ['video/mp4', 'video/mkv', 'video/webm', 'video/quicktime', 'video/x-matroska'];
    if (validMimes.includes(file.mimetype) || file.originalname.match(/\.(mp4|mov|mkv|webm)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid video format. Supported: MP4, MOV, MKV, WEBM.'));
    }
  }
});

// Upload new video
router.post('/upload', upload.single('video'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No video file uploaded' });
    }

    const videoId = req.generatedVideoId;
    const title = req.body.title || req.file.originalname.replace(/\.[^/.]+$/, '');

    const job = jobQueue.addJob({
      videoId,
      title,
      originalName: req.file.originalname,
      rawFilePath: req.file.path,
      sizeBytes: req.file.size
    });

    res.status(201).json({
      success: true,
      message: 'Video accepted for distributed AES-128 transcoding',
      job
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// List all videos
router.get('/', (req, res) => {
  const jobs = jobQueue.getAllJobs();
  const playbacks = playbackService.getAllPlayback();
  const playbackMap = new Map(playbacks.map(p => [p.videoId, p]));

  const enrichedVideos = jobs.map(v => {
    const pb = playbackMap.get(v.videoId);
    return {
      ...v,
      playback: pb || null
    };
  });

  res.json({ success: true, count: enrichedVideos.length, videos: enrichedVideos });
});

// Continue watching videos list
router.get('/continue-watching', (req, res) => {
  const playbacks = playbackService.getAllPlayback().filter(p => p.progressPercent > 2 && p.progressPercent < 95);
  const jobs = jobQueue.getAllJobs();
  const jobMap = new Map(jobs.map(j => [j.videoId, j]));

  const continueList = playbacks
    .map(pb => {
      const video = jobMap.get(pb.videoId);
      if (!video || video.status !== 'ready') return null;
      return {
        ...video,
        playback: pb
      };
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.playback.lastWatchedAt) - new Date(a.playback.lastWatchedAt));

  res.json({ success: true, count: continueList.length, videos: continueList });
});

// Cluster & Worker Swarm Telemetry
router.get('/cluster-stats', (req, res) => {
  const stats = jobQueue.getClusterStats();
  res.json({ success: true, stats });
});

// Video Status
router.get('/:videoId/status', (req, res) => {
  const job = jobQueue.getJob(req.params.videoId);
  if (!job) {
    return res.status(404).json({ success: false, message: 'Video not found' });
  }
  const playback = playbackService.getPlayback(req.params.videoId);
  res.json({ success: true, video: { ...job, playback } });
});

// Secure DRM Key Server (Delivers 16-byte raw AES-128 key)
router.get('/:videoId/key', (req, res) => {
  const key = EncryptionService.getKey(req.params.videoId);
  if (!key) {
    return res.status(404).send('DRM Encryption Key Not Found');
  }
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.send(key);
});

// Heartbeat Telemetry
router.post('/:videoId/heartbeat', (req, res) => {
  const { currentTime, duration, profile } = req.body;
  const record = playbackService.recordHeartbeat(req.params.videoId, {
    currentTime: parseFloat(currentTime),
    duration: parseFloat(duration),
    profile
  });
  res.json({ success: true, playback: record });
});

// Delete stream
router.delete('/:videoId', (req, res) => {
  const deleted = jobQueue.deleteJob(req.params.videoId);
  if (!deleted) {
    return res.status(404).json({ success: false, message: 'Video not found' });
  }
  playbackService.deletePlayback(req.params.videoId);
  res.json({ success: true, message: 'Stream deleted successfully' });
});

module.exports = router;
