// NFlix Distributed Stream Engine - Playback & Telemetry Manager
let hlsInstance = null;
let activeVideo = null;
let telemetryInterval = null;
let heartbeatInterval = null;

// Toast Notification
function showToast(message) {
  let toast = document.getElementById('toastNotification');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toastNotification';
    toast.style.cssText = 'position:fixed; bottom:24px; right:24px; background:#E50914; color:#fff; padding:12px 22px; border-radius:6px; font-weight:600; font-size:0.9rem; z-index:9999; box-shadow:0 8px 24px rgba(0,0,0,0.8); transition:opacity 0.3s;';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.style.opacity = '1';
  clearTimeout(toast.hideTimeout);
  toast.hideTimeout = setTimeout(() => {
    toast.style.opacity = '0';
  }, 3200);
}

// Check Continue Watching row
async function fetchContinueWatching() {
  try {
    const res = await fetch('/api/videos');
    const data = await res.json();
    if (!data.success) return;

    const continueRow = document.getElementById('continueRow');
    const continueGrid = document.getElementById('continueGrid');
    if (!continueRow || !continueGrid) return;

    const inProgress = (data.videos || []).filter(v => v.playback && v.playback.progressPercent > 2 && v.playback.progressPercent < 95);

    if (inProgress.length === 0) {
      continueRow.style.display = 'none';
      return;
    }

    continueRow.style.display = 'block';
    continueGrid.innerHTML = inProgress.map(v => {
      const pb = v.playback;
      const poster = v.posterUrl || 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=600&q=80';
      return '<div class="nflix-card" onclick="openHlsStream(\'' + v.videoId + '\')">' +
        '<div class="card-poster" style="background-image: url(\'' + poster + '\');">' +
          '<div style="position:absolute; bottom:0; left:0; width:100%; height:4px; background:rgba(255,255,255,0.3);">' +
            '<div style="width:' + pb.progressPercent + '%; height:100%; background:#E50914;"></div>' +
          '</div>' +
        '</div>' +
        '<div class="card-info-pane">' +
          '<div class="card-title">' + v.title + '</div>' +
          '<div class="card-meta-line">' +
            '<span class="match-score">' + pb.progressPercent + '% watched</span>' +
            '<span>' + formatTime(pb.currentTime) + '</span>' +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('');
  } catch (e) {
    // ignore
  }
}

window.openHlsStream = async function(videoId) {
  try {
    const res = await fetch('/api/videos/' + videoId + '/status');
    const data = await res.json();
    if (!data.success || !data.video) return;

    const video = data.video;
    const playerModal = document.getElementById('playerModal');
    const playerTitle = document.getElementById('playerTitle');
    const playerMeta = document.getElementById('playerMeta');
    const videoPlayer = document.getElementById('videoPlayer');
    const cloudEmbedIframe = document.getElementById('cloudEmbedIframe');

    if (cloudEmbedIframe) cloudEmbedIframe.style.display = 'none';
    if (videoPlayer) videoPlayer.style.display = 'block';

    playerTitle.textContent = video.title;
    playerMeta.textContent = 'Native Transcoded HLS &bull; AES-128 DRM Protected';
    playerModal.classList.add('active');

    const streamUrl = '/storage/hls/' + videoId + '/master.m3u8';
    const savedTime = (video.playback && video.playback.currentTime > 2) ? video.playback.currentTime : 0;

    if (Hls.isSupported()) {
      if (hlsInstance) hlsInstance.destroy();
      hlsInstance = new Hls({ debug: false, enableWorker: true });
      hlsInstance.loadSource(streamUrl);
      hlsInstance.attachMedia(videoPlayer);

      hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
        if (savedTime > 0) {
          videoPlayer.currentTime = savedTime;
          showToast('Resumed from ' + formatTime(savedTime));
        }
        videoPlayer.play().catch(e => console.log('Autoplay:', e));
      });
    } else if (videoPlayer.canPlayType('application/vnd.apple.mpegurl')) {
      videoPlayer.src = streamUrl;
      videoPlayer.play();
    }
  } catch (err) {
    alert('Failed to play stream: ' + err.message);
  }
};

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return m + ':' + (s < 10 ? '0' : '') + s;
}

fetchContinueWatching();
