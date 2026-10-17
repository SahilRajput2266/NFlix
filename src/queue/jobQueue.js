const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');
const config = require('../config');
const TranscoderService = require('../services/transcoder');

class DistributedJobQueue extends EventEmitter {
  constructor() {
    super();
    this.jobs = new Map();
    // Swarm of 2 simulated cluster worker nodes
    this.workers = [
      { id: 'node-alpha', name: 'Worker Node-Alpha', status: 'idle', currentJob: null, completedCount: 0, cpuLoad: 12 },
      { id: 'node-beta',  name: 'Worker Node-Beta',  status: 'idle', currentJob: null, completedCount: 0, cpuLoad: 8 }
    ];
    this.loadState();
  }

  loadState() {
    try {
      if (fs.existsSync(config.JOBS_FILE)) {
        const data = fs.readFileSync(config.JOBS_FILE, 'utf-8');
        const list = JSON.parse(data);
        list.forEach(j => this.jobs.set(j.videoId, j));
      }
    } catch (e) {
      console.error('Failed to load saved jobs:', e.message);
    }
  }

  saveState() {
    try {
      const list = Array.from(this.jobs.values());
      fs.writeFileSync(config.JOBS_FILE, JSON.stringify(list, null, 2), 'utf-8');
    } catch (e) {
      console.error('Failed to save jobs state:', e.message);
    }
  }

  addJob(jobData) {
    const job = {
      videoId: jobData.videoId,
      title: jobData.title || 'Untitled Stream',
      originalName: jobData.originalName,
      rawFilePath: jobData.rawFilePath,
      sizeBytes: jobData.sizeBytes,
      status: 'queued',
      progress: 0,
      assignedWorker: null,
      message: 'Waiting in distributed worker queue...',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      error: null
    };

    this.jobs.set(job.videoId, job);
    this.saveState();
    this.emit('jobAdded', job);

    setImmediate(() => this.dispatchSwarm());
    return job;
  }

  getJob(videoId) {
    return this.jobs.get(videoId);
  }

  getAllJobs() {
    return Array.from(this.jobs.values()).sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );
  }

  deleteJob(videoId) {
    const job = this.jobs.get(videoId);
    if (!job) return false;

    try {
      // Remove raw file if exists
      if (job.rawFilePath && fs.existsSync(job.rawFilePath)) {
        fs.unlinkSync(job.rawFilePath);
      }
      // Remove HLS output folder
      const hlsDir = path.join(config.HLS_OUTPUT_DIR, videoId);
      if (fs.existsSync(hlsDir)) {
        fs.rmSync(hlsDir, { recursive: true, force: true });
      }
    } catch (err) {
      console.error(`Error deleting files for ${videoId}:`, err.message);
    }

    this.jobs.delete(videoId);
    this.saveState();
    return true;
  }

  updateJob(videoId, updates) {
    const job = this.jobs.get(videoId);
    if (!job) return;

    Object.assign(job, updates, { updatedAt: new Date().toISOString() });
    this.jobs.set(videoId, job);
    this.saveState();
    this.emit('jobProgress', job);
  }

  getClusterStats() {
    const all = Array.from(this.jobs.values());
    const queuedCount = all.filter(j => j.status === 'queued').length;
    const activeCount = all.filter(j => ['analyzing', 'transcoding', 'packaging'].includes(j.status)).length;
    const readyCount = all.filter(j => j.status === 'ready').length;

    return {
      totalVideos: all.length,
      queueDepth: queuedCount,
      activeTranscoding: activeCount,
      readyStreams: readyCount,
      workers: this.workers.map(w => ({
        id: w.id,
        name: w.name,
        status: w.status,
        currentJob: w.currentJob,
        completedCount: w.completedCount,
        cpuLoad: w.status === 'busy' ? Math.floor(Math.random() * 25) + 65 : Math.floor(Math.random() * 10) + 5
      }))
    };
  }

  dispatchSwarm() {
    // Check for available idle workers
    const availableWorker = this.workers.find(w => w.status === 'idle');
    if (!availableWorker) return;

    // Find next queued job
    const nextJob = Array.from(this.jobs.values()).find(j => j.status === 'queued');
    if (!nextJob) return;

    // Assign job to worker
    availableWorker.status = 'busy';
    availableWorker.currentJob = { videoId: nextJob.videoId, title: nextJob.title };
    this.updateJob(nextJob.videoId, { assignedWorker: availableWorker.name });

    this.runWorkerJob(availableWorker, nextJob);

    // If another idle worker exists, check next job
    setImmediate(() => this.dispatchSwarm());
  }

  async runWorkerJob(worker, job) {
    const { videoId } = job;
    try {
      console.log(`[Cluster] ${worker.name} picked up job: ${videoId} (${job.title})`);
      await TranscoderService.processVideo(job, (updates) => {
        this.updateJob(videoId, updates);
      });
      worker.completedCount++;
      console.log(`[Cluster] ${worker.name} completed job: ${videoId}`);
    } catch (error) {
      console.error(`[Cluster] ${worker.name} failed on job ${videoId}:`, error);
      this.updateJob(videoId, {
        status: 'failed',
        error: error.message || 'Transcoding worker error',
        message: 'Processing failed.'
      });
    } finally {
      worker.status = 'idle';
      worker.currentJob = null;
      setImmediate(() => this.dispatchSwarm());
    }
  }
}

const queueInstance = new DistributedJobQueue();
module.exports = queueInstance;
