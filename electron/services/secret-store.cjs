const fs = require('node:fs');
const path = require('node:path');

class SecretStore {
  constructor(root, safeStorage) {
    this.file = path.join(root, 'secrets.json');
    this.safeStorage = safeStorage;
    this.values = this.#load();
  }

  #load() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch { return {}; }
  }

  #save() {
    const temp = `${this.file}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(this.values, null, 2), { mode: 0o600 });
    fs.renameSync(temp, this.file);
  }

  async set(key, value) {
    if (!this.safeStorage || !(await this.safeStorage.isAsyncEncryptionAvailable())) throw new Error('macOS Keychain encryption is unavailable.');
    const encrypted = await this.safeStorage.encryptStringAsync(String(value));
    this.values[key] = encrypted.toString('base64');
    this.#save();
  }

  async get(key) {
    const encoded = this.values[key];
    if (!encoded) return null;
    if (!this.safeStorage || !(await this.safeStorage.isAsyncEncryptionAvailable())) throw new Error('macOS Keychain encryption is unavailable.');
    const decrypted = await this.safeStorage.decryptStringAsync(Buffer.from(encoded, 'base64'));
    if (decrypted.shouldReEncrypt) await this.set(key, decrypted.result);
    return decrypted.result;
  }

  has(key) { return Boolean(this.values[key]); }
  list() { return Object.keys(this.values); }
  remove(key) { delete this.values[key]; this.#save(); }
}

module.exports = { SecretStore };
