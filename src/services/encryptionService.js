const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const config = require('../config');

const KEYS_DIR = path.join(config.STORAGE_DIR, 'keys');
if (!fs.existsSync(KEYS_DIR)) {
  fs.mkdirSync(KEYS_DIR, { recursive: true });
}

class EncryptionService {
  static setupVideoEncryption(videoId) {
    const keyPath = path.join(KEYS_DIR, `${videoId}.key`);
    const keyInfoPath = path.join(KEYS_DIR, `${videoId}.keyinfo`);

    // 16 bytes (128-bit) symmetric AES key
    const aesKey = crypto.randomBytes(16);
    fs.writeFileSync(keyPath, aesKey);

    // 16 bytes initialization vector in hex format
    const iv = crypto.randomBytes(16).toString('hex');

    // URI where client Hls.js player will request the decryption key
    const keyUri = `/api/videos/${videoId}/key`;

    // Keyinfo file format expected by FFmpeg:
    // Line 1: Key URI
    // Line 2: Path to file containing the binary key
    // Line 3: IV (optional, but standard for AES-128-CBC)
    // IMPORTANT: FFmpeg on Windows requires forward slashes or escaped paths in keyinfo
    const normalizedKeyPath = keyPath.replace(/\\/g, '/');
    const keyInfoContent = `${keyUri}\n${normalizedKeyPath}\n${iv}\n`;

    fs.writeFileSync(keyInfoPath, keyInfoContent, 'utf-8');

    return {
      keyPath,
      keyInfoPath,
      keyUri,
      iv
    };
  }

  static getKey(videoId) {
    const keyPath = path.join(KEYS_DIR, `${videoId}.key`);
    if (fs.existsSync(keyPath)) {
      return fs.readFileSync(keyPath);
    }
    return null;
  }
}

module.exports = EncryptionService;
