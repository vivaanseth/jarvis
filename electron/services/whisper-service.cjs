const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const https = require('node:https');
const { spawn } = require('node:child_process');

const MODELS = Object.freeze({
  base: {
    file: 'ggml-base.en-q5_1.bin', size: 59_721_011,
    sha256: '4baf70dd0d7c4247ba2b81fafd9c01005ac77c2f9ef064e00dcf195d0e2fdd2f',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en-q5_1.bin?download=true'
  },
  tiny: {
    file: 'ggml-tiny.en-q5_1.bin', size: 32_166_155,
    sha256: 'c77c5766f1cef09b6b7d47f21b546cbddd4157886b3b5d6d4f709e91e66c7c2b',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en-q5_1.bin?download=true'
  }
});

function digest(file) {
  const hash = crypto.createHash('sha256'); const descriptor = fs.openSync(file, 'r'); const buffer = Buffer.alloc(1024 * 1024);
  try { let count; do { count = fs.readSync(descriptor, buffer, 0, buffer.length, null); if (count) hash.update(buffer.subarray(0, count)); } while (count); }
  finally { fs.closeSync(descriptor); }
  return hash.digest('hex');
}

function download(url, destination, onProgress) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers: { 'User-Agent': 'Jarvis/1.0' } }, response => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode)) { response.resume(); return download(new URL(response.headers.location, url).toString(), destination, onProgress).then(resolve, reject); }
      if (response.statusCode !== 200) { response.resume(); return reject(new Error(`Model download failed with HTTP ${response.statusCode}.`)); }
      const total = Number(response.headers['content-length'] || 0); let received = 0;
      const stream = fs.createWriteStream(destination, { mode: 0o600 });
      response.on('data', chunk => { received += chunk.length; onProgress?.({ received, total }); });
      response.pipe(stream); stream.on('finish', () => stream.close(resolve)); stream.on('error', reject);
    });
    request.on('error', reject); request.setTimeout(120_000, () => request.destroy(new Error('Model download timed out.')));
  });
}

class WhisperService {
  constructor(root) { this.root = path.join(root, 'Models', 'Whisper'); fs.mkdirSync(this.root, { recursive: true, mode: 0o700 }); this.active = null; }
  binary() {
    return [process.env.JARVIS_WHISPER_CLI, '/opt/homebrew/bin/whisper-cli', '/usr/local/bin/whisper-cli', path.join(process.resourcesPath || '', 'native', 'whisper-cli')].find(candidate => candidate && fs.existsSync(candidate)) || null;
  }
  modelPath(name) { const model = MODELS[name]; if (!model) throw new Error('Unknown Whisper model.'); return path.join(this.root, model.file); }
  verified(name) { const file = this.modelPath(name); return fs.existsSync(file) && fs.statSync(file).size === MODELS[name].size && digest(file) === MODELS[name].sha256; }
  status() { return { binary: Boolean(this.binary()), base: this.verified('base'), tiny: this.verified('tiny'), modelDirectory: this.root, active: Boolean(this.active) }; }
  installBinary() {
    if (this.binary()) return Promise.resolve(this.status());
    const brew = ['/opt/homebrew/bin/brew', '/usr/local/bin/brew'].find(candidate => fs.existsSync(candidate));
    if (!brew) return Promise.reject(new Error('Homebrew is not installed. Install whisper.cpp manually, then return to Connections.'));
    return new Promise((resolve, reject) => {
      const child = spawn(brew, ['install', 'whisper-cpp'], { shell: false, stdio: ['ignore', 'pipe', 'pipe'] }); let output = '';
      const append = chunk => { output = (output + chunk.toString()).slice(-16_000); }; child.stdout.on('data', append); child.stderr.on('data', append);
      const timer = setTimeout(() => child.kill('SIGTERM'), 10 * 60_000);
      child.on('error', error => { clearTimeout(timer); reject(error); });
      child.on('close', code => { clearTimeout(timer); if (code !== 0) reject(new Error(output.trim() || `Homebrew exited with status ${code}.`)); else if (!this.binary()) reject(new Error('Homebrew finished, but whisper-cli was not found.')); else resolve(this.status()); });
    });
  }
  async install(name, onProgress) {
    const model = MODELS[name]; if (!model) throw new Error('Unknown Whisper model.');
    const target = this.modelPath(name); const temp = `${target}.download`;
    try { fs.rmSync(temp, { force: true }); await download(model.url, temp, onProgress); if (fs.statSync(temp).size !== model.size || digest(temp) !== model.sha256) throw new Error('The downloaded Whisper model failed checksum verification.'); fs.renameSync(temp, target); return this.status(); }
    catch (error) { fs.rmSync(temp, { force: true }); throw error; }
  }
  remove(name) { fs.rmSync(this.modelPath(name), { force: true }); return this.status(); }
  transcribe(audioPath, name = 'base', options = {}) {
    const binary = this.binary(); if (!binary) return Promise.reject(new Error('whisper-cli is not installed. Install whisper.cpp with Homebrew or rebuild the packaged native tools.'));
    const model = this.modelPath(name); if (!this.verified(name)) return Promise.reject(new Error(`The verified ${name}.en Whisper model is not installed.`));
    if (this.active) return Promise.reject(new Error('A local transcription is already running.'));
    return new Promise((resolve, reject) => {
      const child = spawn(binary, ['-m', model, '-f', path.resolve(audioPath), '-t', '2', '-l', 'en', '--no-timestamps', '--print-progress', 'false'], { shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
      this.active = child; let output = ''; const append = chunk => { output = (output + chunk.toString()).slice(-120_000); }; child.stdout.on('data', append); child.stderr.on('data', append);
      const timer = setTimeout(() => child.kill('SIGTERM'), options.timeout || 120_000);
      const abort = () => child.kill('SIGTERM'); options.signal?.addEventListener('abort', abort, { once: true });
      child.on('error', error => { clearTimeout(timer); this.active = null; reject(error); });
      child.on('close', code => { clearTimeout(timer); options.signal?.removeEventListener('abort', abort); this.active = null; if (options.signal?.aborted) return reject(Object.assign(new Error('Transcription cancelled.'), { name: 'AbortError' })); if (code !== 0) return reject(new Error(output.trim() || `whisper-cli exited with status ${code}.`)); const text = output.split('\n').map(line => line.replace(/^\s*\[[^\]]+\]\s*/, '').trim()).filter(line => line && !/^(whisper_|system_info|main:)/.test(line)).join(' ').trim(); resolve({ text, backend: name === 'tiny' ? 'whisperTiny' : 'whisperBase' }); });
    });
  }
}

module.exports = { WhisperService, MODELS, digest, download };
