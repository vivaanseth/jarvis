const os = require('node:os');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

function cpuTotals(cpus) {
  return cpus.reduce((sum, cpu) => {
    const total = Object.values(cpu.times).reduce((value, time) => value + time, 0);
    return { idle: sum.idle + cpu.times.idle, total: sum.total + total };
  }, { idle: 0, total: 0 });
}

async function defaultCPUSampler(delayMs = 300) {
  const before = cpuTotals(os.cpus());
  await new Promise(resolve => setTimeout(resolve, delayMs));
  const after = cpuTotals(os.cpus());
  const total = Math.max(1, after.total - before.total);
  return Math.max(0, Math.min(100, 100 * (1 - ((after.idle - before.idle) / total))));
}

async function defaultMemorySampler() {
  try {
    const { stdout } = await execFileAsync('/usr/bin/memory_pressure', ['-Q'], { timeout: 3_000, maxBuffer: 32_000 });
    const match = stdout.match(/System-wide memory free percentage:\s*(\d+)%/i);
    if (match) return Number(match[1]);
  } catch {}
  return Math.round((os.freemem() / Math.max(1, os.totalmem())) * 100);
}

class LocalResourceMonitor {
  constructor({ cpuSampler = defaultCPUSampler, memorySampler = defaultMemorySampler, thresholds = {} } = {}) {
    this.cpuSampler = cpuSampler;
    this.memorySampler = memorySampler;
    this.thresholds = { maxCPUPercent: 55, minMemoryPercent: 30, abortCPUPercent: 82, abortMemoryPercent: 20, minSpeedLimit: 90, ...thresholds };
    this.thermalState = 'unknown';
    this.speedLimit = 100;
    this.onBattery = false;
    this.activeLease = null;
    this.lastAssessment = { allowed: false, code: 'NOT_CHECKED', reason: 'Local compute has not been checked yet.', cpuPercent: null, memoryFreePercent: null, thermalState: 'unknown', speedLimit: 100, onBattery: false, active: false, checkedAt: null };
  }

  updatePower({ thermalState, speedLimit, onBattery } = {}) {
    if (thermalState) this.thermalState = thermalState;
    if (Number.isFinite(speedLimit)) this.speedLimit = speedLimit;
    if (typeof onBattery === 'boolean') this.onBattery = onBattery;
    if (this.activeLease && (['serious', 'critical'].includes(this.thermalState) || this.speedLimit < 80 || (this.onBattery && this.activeLease.preferences.localAIAllowOnBattery !== true))) this.activeLease.abort('macOS reported thermal, power, or speed pressure.');
  }

  async assess(preferences = {}, { ignoreActive = false } = {}) {
    const staticStatus = { allowed: true, code: 'READY', reason: 'Resources are within the safe local-inference budget.', cpuPercent: null, memoryFreePercent: null, thermalState: this.thermalState, speedLimit: this.speedLimit, onBattery: this.onBattery, active: Boolean(this.activeLease), checkedAt: new Date().toISOString() };
    if (preferences.localAIEnabled === false) Object.assign(staticStatus, { allowed: false, code: 'DISABLED', reason: 'Local AI is disabled.' });
    else if (!ignoreActive && this.activeLease) Object.assign(staticStatus, { allowed: false, code: 'LOCAL_BUSY', reason: 'A local model request is already running.' });
    else if (preferences.localAIAllowOnBattery !== true && this.onBattery) Object.assign(staticStatus, { allowed: false, code: 'ON_BATTERY', reason: 'Local AI waits for AC power.' });
    else if (['fair', 'serious', 'critical'].includes(this.thermalState)) Object.assign(staticStatus, { allowed: false, code: 'THERMAL_PRESSURE', reason: `macOS thermal state is ${this.thermalState}.` });
    else if (this.speedLimit < Number(preferences.localAIMinSpeedLimit || this.thresholds.minSpeedLimit)) Object.assign(staticStatus, { allowed: false, code: 'CPU_THROTTLED', reason: `macOS limited CPU speed to ${this.speedLimit}%.` });
    if (!staticStatus.allowed) {
      this.lastAssessment = staticStatus;
      return staticStatus;
    }
    const cpuPercent = Number((await this.cpuSampler()).toFixed(1));
    const memoryFreePercent = Number(await this.memorySampler());
    const status = { ...staticStatus, cpuPercent, memoryFreePercent };
    if (cpuPercent >= Number(preferences.localAIMaxCPUPercent || this.thresholds.maxCPUPercent)) Object.assign(status, { allowed: false, code: 'CPU_BUSY', reason: `System CPU usage is ${cpuPercent}%.` });
    else if (memoryFreePercent < Number(preferences.localAIMinMemoryPercent || this.thresholds.minMemoryPercent)) Object.assign(status, { allowed: false, code: 'MEMORY_PRESSURE', reason: `Free memory pressure budget is ${memoryFreePercent}%.` });
    this.lastAssessment = status;
    return status;
  }

  async acquire(preferences = {}) {
    const assessment = await this.assess(preferences);
    if (!assessment.allowed) return { allowed: false, assessment };
    const controller = new AbortController();
    let polling = false;
    const abort = reason => { if (!controller.signal.aborted) controller.abort(new Error(reason)); };
    const interval = setInterval(async () => {
      if (polling || controller.signal.aborted) return;
      polling = true;
      try {
        const current = await this.assess(preferences, { ignoreActive: true });
        if ((Number.isFinite(current.cpuPercent) && current.cpuPercent >= this.thresholds.abortCPUPercent) || (Number.isFinite(current.memoryFreePercent) && current.memoryFreePercent < this.thresholds.abortMemoryPercent) || ['serious', 'critical'].includes(current.thermalState) || current.speedLimit < 80) abort('Local inference stopped because system resource pressure increased.');
      } finally { polling = false; }
    }, 1_500);
    const release = () => { clearInterval(interval); if (this.activeLease?.controller === controller) this.activeLease = null; };
    this.activeLease = { controller, abort, release, preferences: { ...preferences } };
    return { allowed: true, assessment, signal: controller.signal, release };
  }

  status() { return { ...this.lastAssessment, thermalState: this.thermalState, speedLimit: this.speedLimit, onBattery: this.onBattery, active: Boolean(this.activeLease) }; }

  shutdown() {
    if (!this.activeLease) return;
    this.activeLease.abort('Jarvis is shutting down.');
    this.activeLease.release();
  }
}

module.exports = { LocalResourceMonitor, cpuTotals, defaultCPUSampler, defaultMemorySampler };
