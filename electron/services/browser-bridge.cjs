const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const crypto = require('node:crypto');

class BrowserBridge {
  constructor(root) {
    this.root = root;
    this.socketPath = path.join(root, 'browser.sock');
    this.server = null; this.client = null; this.pending = new Map(); this.connected = false;
  }

  start() {
    try { fs.unlinkSync(this.socketPath); } catch {}
    this.server = net.createServer(socket => {
      if (this.client) this.client.destroy();
      this.client = socket; this.connected = true; let buffer = '';
      this.onStatus?.(true);
      socket.setEncoding('utf8');
      socket.on('data', chunk => {
        buffer += chunk;
        while (buffer.includes('\n')) {
          const index = buffer.indexOf('\n'); const line = buffer.slice(0, index); buffer = buffer.slice(index + 1);
          if (!line) continue;
          try {
            const message = JSON.parse(line); const pending = this.pending.get(message.id);
            if (pending) { clearTimeout(pending.timer); this.pending.delete(message.id); message.ok === false ? pending.reject(new Error(message.error || 'Browser request failed.')) : pending.resolve(message.result); }
          } catch {}
        }
      });
      socket.on('close', () => { if (this.client === socket) { this.client = null; this.connected = false; this.onStatus?.(false); } });
      socket.on('error', () => {});
    });
    this.server.listen(this.socketPath, () => fs.chmodSync(this.socketPath, 0o600));
  }

  request(method, params = {}, timeout = 20_000) {
    if (!this.client || !this.connected) return Promise.reject(new Error('The Jarvis Chrome extension is not connected. Open its toolbar button once.'));
    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('The browser request timed out.')); }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      this.client.write(`${JSON.stringify({ id, method, params })}\n`);
    });
  }

  installNativeHost(extensionId, hostPath) {
    if (!/^[a-p]{32}$/.test(extensionId)) throw new Error('Invalid Chrome extension ID.');
    const directory = path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome', 'NativeMessagingHosts');
    fs.mkdirSync(directory, { recursive: true });
    const file = path.join(directory, 'com.local.jarvis.browser.json');
    fs.writeFileSync(file, JSON.stringify({ name: 'com.local.jarvis.browser', description: 'Jarvis browser bridge', path: hostPath, type: 'stdio', allowed_origins: [`chrome-extension://${extensionId}/`] }, null, 2), { mode: 0o600 });
    return file;
  }

  stop() {
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error('Browser bridge closed.')); }
    this.pending.clear(); this.client?.destroy(); this.server?.close();
    try { fs.unlinkSync(this.socketPath); } catch {}
  }
}

module.exports = { BrowserBridge };
