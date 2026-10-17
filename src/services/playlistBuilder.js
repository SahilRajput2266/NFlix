const fs = require('fs');
const path = require('path');

class PlaylistBuilder {
  static createMasterPlaylist(outputDir, activeProfiles) {
    let content = '#EXTM3U\n#EXT-X-VERSION:3\n\n';

    activeProfiles.forEach(profile => {
      content += `#EXT-X-STREAM-INF:BANDWIDTH=${profile.bandwidth},RESOLUTION=${profile.width}x${profile.height},NAME="${profile.name}"\n`;
      content += `${profile.name}/index.m3u8\n\n`;
    });

    const masterPath = path.join(outputDir, 'master.m3u8');
    fs.writeFileSync(masterPath, content.trim(), 'utf-8');
    return masterPath;
  }
}

module.exports = PlaylistBuilder;
