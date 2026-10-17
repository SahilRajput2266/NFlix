const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const config = require('../config');
const PlaylistBuilder = require('./playlistBuilder');
const EncryptionService = require('./encryptionService');

ffmpeg.setFfmpegPath(config.FFMPEG_PATH);
ffmpeg.setFfprobePath(config.FFPROBE_PATH);

class TranscoderService {
  static probeVideo(filePath) {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) return reject(err);
        resolve(metadata);
      });
    });
  }

  static extractPoster(inputPath, outputDir, durationSecs) {
    return new Promise((resolve) => {
      const posterPath = path.join(outputDir, 'poster.jpg');
      const seekTime = Math.min(2, Math.max(0.5, (durationSecs || 5) * 0.2));

      ffmpeg(inputPath)
        .seekInput(seekTime)
        .frames(1)
        .outputOptions(['-q:v 2'])
        .output(posterPath)
        .on('end', () => resolve(posterPath))
        .on('error', () => resolve(null))
        .run();
    });
  }

  static transcodeProfile(inputPath, outputDir, profile, keyInfoPath, onProgress) {
    return new Promise((resolve, reject) => {
      const profileDir = path.join(outputDir, profile.name);
      if (!fs.existsSync(profileDir)) {
        fs.mkdirSync(profileDir, { recursive: true });
      }

      const playlistPath = path.join(profileDir, 'index.m3u8');
      const segmentPattern = path.join(profileDir, 'segment_%03d.ts');

      const options = [
        '-codec:v libx264',
        '-codec:a aac',
        '-pix_fmt yuv420p',
        '-preset veryfast',
        '-g 48',
        '-sc_threshold 0',
        `-hls_time ${config.HLS_SEGMENT_TIME}`,
        '-hls_playlist_type vod',
        `-hls_segment_filename ${segmentPattern}`
      ];

      // Attach AES-128 DRM encryption if keyinfo is present
      if (keyInfoPath && fs.existsSync(keyInfoPath)) {
        const normalizedKeyInfo = keyInfoPath.replace(/\\/g, '/');
        options.push(`-hls_key_info_file ${normalizedKeyInfo}`);
      }

      ffmpeg(inputPath)
        .size(`${profile.width}x${profile.height}`)
        .videoBitrate(profile.videoBitrate)
        .audioBitrate(profile.audioBitrate)
        .outputOptions(options)
        .output(playlistPath)
        .on('progress', (progress) => {
          if (onProgress && progress.percent) {
            onProgress(Math.round(progress.percent));
          }
        })
        .on('end', () => {
          resolve({ profile: profile.name, playlistPath });
        })
        .on('error', (err) => {
          reject(err);
        })
        .run();
    });
  }

  static async processVideo(job, onUpdate) {
    const { videoId, rawFilePath } = job;
    const outputDir = path.join(config.HLS_OUTPUT_DIR, videoId);

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    onUpdate({ status: 'analyzing', progress: 5, message: 'Analyzing source stream metadata...' });
    const metadata = await this.probeVideo(rawFilePath);

    const videoStream = metadata.streams.find(s => s.codec_type === 'video');
    const sourceHeight = videoStream ? videoStream.height : 1080;
    const duration = metadata.format ? metadata.format.duration : 10;

    onUpdate({ status: 'analyzing', progress: 10, message: 'Extracting video poster thumbnail...' });
    await this.extractPoster(rawFilePath, outputDir, duration);

    // Setup AES-128 Encryption & DRM keys
    onUpdate({ status: 'analyzing', progress: 12, message: 'Generating AES-128 DRM cipher keys...' });
    const { keyInfoPath, iv } = EncryptionService.setupVideoEncryption(videoId);

    let eligibleProfiles = config.STREAM_PROFILES.filter(p => p.height <= Math.max(sourceHeight, 360));
    if (eligibleProfiles.length === 0) {
      eligibleProfiles = [config.STREAM_PROFILES[0]];
    }

    const totalProfiles = eligibleProfiles.length;
    let completedProfiles = 0;

    for (let i = 0; i < totalProfiles; i++) {
      const profile = eligibleProfiles[i];
      onUpdate({
        status: 'transcoding',
        currentProfile: profile.name,
        progress: Math.round((completedProfiles / totalProfiles) * 80) + 15,
        message: `Encrypting & Transcoding ${profile.name} (AES-128 CBC)...`
      });

      await this.transcodeProfile(rawFilePath, outputDir, profile, keyInfoPath, (pct) => {
        const stepBase = (completedProfiles / totalProfiles) * 80 + 15;
        const stepSize = (1 / totalProfiles) * 80;
        const overall = Math.min(95, Math.round(stepBase + (pct / 100) * stepSize));
        onUpdate({
          status: 'transcoding',
          currentProfile: profile.name,
          profilePercent: pct,
          progress: overall,
          message: `Encrypting ${profile.name} (${pct}%)`
        });
      });

      completedProfiles++;
    }

    onUpdate({ status: 'packaging', progress: 96, message: 'Generating Master HLS Manifest...' });
    const masterPath = PlaylistBuilder.createMasterPlaylist(outputDir, eligibleProfiles);

    onUpdate({
      status: 'ready',
      progress: 100,
      message: 'Processing complete. Stream is AES-128 DRM protected.',
      masterPlaylist: `/storage/hls/${videoId}/master.m3u8`,
      posterUrl: `/storage/hls/${videoId}/poster.jpg`,
      duration: Math.round(duration),
      isEncrypted: true,
      encryptionMethod: 'AES-128-CBC',
      encryptionIv: iv,
      profiles: eligibleProfiles.map(p => p.name)
    });

    return { masterPath, profiles: eligibleProfiles };
  }
}

module.exports = TranscoderService;
