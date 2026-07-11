const fs = require('node:fs');
const path = require('node:path');
const { redact } = require('./diagnostics.cjs');

class StructuredLogger {
  constructor(root, options = {}) {
    this.file = path.join(root, 'jarvis.log.jsonl'); this.maximum = options.maximum || 2_000_000;
    fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  }
  write(level, category, event, metadata = {}) {
    try {
      if (fs.existsSync(this.file) && fs.statSync(this.file).size > this.maximum) fs.renameSync(this.file, `${this.file}.previous`);
      const entry = redact({ at: new Date().toISOString(), level, category, event, metadata });
      fs.appendFileSync(this.file, `${JSON.stringify(entry)}\n`, { mode: 0o600 });
    } catch {}
  }
  info(category, event, metadata) { this.write('info', category, event, metadata); }
  warn(category, event, metadata) { this.write('warn', category, event, metadata); }
  error(category, event, metadata) { this.write('error', category, event, metadata); }
}

module.exports = { StructuredLogger };
