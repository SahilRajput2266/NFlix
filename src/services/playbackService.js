const fs = require('fs');
const path = require('path');
const config = require('../config');

const PLAYBACK_FILE = path.join(config.STORAGE_DIR, 'playback.json');

class PlaybackService {
  constructor() {
    this.history = new Map();
    this.loadState();
  }

  loadState() {
    try {
      if (fs.existsSync(PLAYBACK_FILE)) {
        const data = fs.readFileSync(PLAYBACK_FILE, 'utf-8');
        const items = JSON.parse(data);
        items.forEach(item => this.history.set(item.videoId, item));
      }
    } catch (e) {
      console.error('Error loading playback history:', e.message);
    }
  }

  saveState() {
    try {
      const items = Array.from(this.history.values());
      fs.writeFileSync(PLAYBACK_FILE, JSON.stringify(items, null, 2), 'utf-8');
    } catch (e) {
      console.error('Error saving playback history:', e.message);
    }
  }

  recordHeartbeat(videoId, { currentTime, duration, profile }) {
    if (!duration || duration <= 0) return;
    const progressPercent = Math.min(100, Math.round((currentTime / duration) * 100));

    const record = {
      videoId,
      currentTime: Math.round(currentTime),
      duration: Math.round(duration),
      progressPercent,
      profile: profile || 'Auto',
      lastWatchedAt: new Date().toISOString()
    };

    this.history.set(videoId, record);
    this.saveState();
    return record;
  }

  getPlayback(videoId) {
    return this.history.get(videoId) || null;
  }

  getAllPlayback() {
    return Array.from(this.history.values());
  }

  deletePlayback(videoId) {
    this.history.delete(videoId);
    this.saveState();
  }
}

const playbackInstance = new PlaybackService();
module.exports = playbackInstance;
