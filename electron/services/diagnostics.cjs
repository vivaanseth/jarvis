const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { connectionHealth, diagnosticReport } = require('./contracts.cjs');

const SECRET_PATTERN = /(api[-_ ]?key|authorization|access[-_ ]?token|refresh[-_ ]?token|secret|password|credential)/i;

function redact(value, key = '') {
  if (SECRET_PATTERN.test(key)) return '[REDACTED]';
  if (Array.isArray(value)) return value.map(item => redact(item));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, redact(item, name)]));
  if (typeof value === 'string') {
    return value
      .replace(/\bAIza[0-9A-Za-z_-]{20,}\b/g, '[REDACTED]')
      .replace(/\b(?:gsk|sk-or-v1|sk)-[0-9A-Za-z_-]{12,}\b/g, '[REDACTED]')
      .replace(/\b(?:nvapi-|tvly-|github_pat_|gh[pousr]_|secret_|ntn_)[0-9A-Za-z_-]{12,}\b/g, '[REDACTED]')
      .replace(/Bearer\s+[0-9A-Za-z._~-]+/gi, 'Bearer [REDACTED]');
  }
  return value;
}

async function timed(service, check) {
  const started = Date.now();
  try {
    const result = await check();
    return connectionHealth(service, { ...result, latencyMs: Date.now() - started });
  } catch (error) {
    return connectionHealth(service, {
      state: 'unavailable', latencyMs: Date.now() - started,
      summary: error.message || `${service} check failed.`,
      remediation: error.remediation || 'Open Connections and retry this check.'
    });
  }
}

class DiagnosticsService {
  constructor({ appVersion, root, checks = {} }) {
    this.appVersion = appVersion; this.root = root; this.checks = checks;
  }

  async run() {
    const entries = Object.entries(this.checks);
    const checks = await Promise.all(entries.map(([name, check]) => timed(name, check)));
    const storage = await timed('storage', async () => {
      fs.accessSync(this.root, fs.constants.R_OK | fs.constants.W_OK);
      const stat = fs.statSync(this.root);
      return { state: stat.isDirectory() ? 'ready' : 'unavailable', summary: 'Application data is readable and writable.', metadata: { location: '~/Library/Application Support/Jarvis' } };
    });
    return diagnosticReport([...checks, storage], { appVersion: this.appVersion, platform: `${os.type()} ${os.release()}`, architecture: os.arch() });
  }

  export(report, destination) {
    const safe = redact(report);
    const target = path.resolve(destination);
    fs.writeFileSync(target, `${JSON.stringify(safe, null, 2)}\n`, { mode: 0o600 });
    return target;
  }
}

module.exports = { DiagnosticsService, redact, timed };
