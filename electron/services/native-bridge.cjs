const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

class NativeBridgeClient {
  constructor(root, options = {}) {
    this.root = root; this.child = null; this.pending = new Map(); this.available = false; this.compatible = false;
    this.onEvent = null; this.onStatus = null; this.expectedProtocol = options.expectedProtocol || 2;
    this.restartCount = 0; this.stopping = false; this.lastError = null; this.lastPing = null;
  }

  executableCandidates() {
    return [process.env.JARVIS_NATIVE_BRIDGE, path.join(this.root, '.build', 'release', 'JarvisNativeBridge'), path.join(process.resourcesPath || '', 'native', 'JarvisNativeBridge')].filter(Boolean);
  }

  start(restarting = false) {
    const executable = this.executableCandidates().find(candidate => fs.existsSync(candidate));
    if (!executable) { this.lastError = 'The signed native companion is not installed.'; this.onStatus?.(this.status()); return false; }
    this.stopping = false;
    if (!restarting) this.restartCount = 0;
    this.child = spawn(executable, [], { cwd: this.root, shell: false, stdio: ['pipe', 'pipe', 'pipe'] }); this.available = true;
    this.compatible = false; this.lastError = null; this.onStatus?.(this.status());
    let buffer = '';
    this.child.stdout.setEncoding('utf8'); this.child.stdout.on('data', chunk => {
      buffer += chunk;
      while (buffer.includes('\n')) {
        const index = buffer.indexOf('\n'); const line = buffer.slice(0, index); buffer = buffer.slice(index + 1); if (!line) continue;
        try {
          const message = JSON.parse(line);
          if (message.event) { this.onEvent?.(message.event, message.payload || {}); continue; }
          const pending = this.pending.get(message.id); if (!pending) continue;
          clearTimeout(pending.timer); this.pending.delete(message.id); message.ok ? pending.resolve(message.result) : pending.reject(new Error(message.error || 'Native bridge request failed.'));
        } catch {}
      }
    });
    let errorOutput = ''; this.child.stderr.setEncoding('utf8'); this.child.stderr.on('data', chunk => { errorOutput = (errorOutput + chunk).slice(-4_000); });
    this.child.on('exit', () => {
      this.available = false; this.compatible = false; this.child = null; this.lastError = errorOutput.trim() || 'The native companion exited unexpectedly.';
      for (const pending of this.pending.values()) pending.reject(new Error('Native bridge exited.')); this.pending.clear(); this.onStatus?.(this.status());
      if (!this.stopping && this.restartCount < 1) { this.restartCount += 1; setTimeout(() => this.start(true), 250); }
    });
    this.child.on('error', error => { this.available = false; this.compatible = false; this.lastError = error.message; this.onStatus?.(this.status()); });
    setTimeout(() => this.health().catch(() => {}), 100);
    return true;
  }

  status() { return { available: this.available, compatible: this.compatible, expectedProtocol: this.expectedProtocol, protocolVersion: this.lastPing?.version || null, restartCount: this.restartCount, lastError: this.lastError, lastPingAt: this.lastPing?.checkedAt || null }; }

  async health() {
    const result = await this.request('ping', {}, 5_000);
    this.lastPing = { ...result, checkedAt: new Date().toISOString() };
    this.compatible = Number(result.version) === this.expectedProtocol;
    if (!this.compatible) { this.lastError = `Native companion protocol ${result.version || 'unknown'} does not match required protocol ${this.expectedProtocol}.`; throw new Error(this.lastError); }
    this.lastError = null; this.onStatus?.(this.status()); return this.status();
  }

  request(method, params = {}, timeout = 60_000) {
    if (!this.child || !this.available) return Promise.reject(new Error('The signed native companion is not built. Install full Xcode and run script/build_native_bridge.sh.'));
    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('Native bridge request timed out.')); }, timeout);
      this.pending.set(id, { resolve, reject, timer }); this.child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
    });
  }

  stop() { this.stopping = true; this.child?.kill('SIGTERM'); this.child = null; this.available = false; this.compatible = false; this.onStatus?.(this.status()); }
}

module.exports = { NativeBridgeClient };
