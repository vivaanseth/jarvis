const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync, backup } = require('node:sqlite');
const { cloneTaskDefaults, cloneWaterfallDefaults } = require('./free-model-policy.cjs');

const COLLECTIONS = [
  'routines', 'activity', 'memories', 'notes', 'trustedProjects', 'favoriteFolders',
  'appAliases', 'conversations', 'messages', 'connections', 'schedules', 'actionRuns',
  'actionSteps', 'attachments', 'tasks', 'focusSessions', 'rssFeeds', 'savedSites'
];
const MUTABLE_COLLECTIONS = COLLECTIONS.filter(name => name !== 'activity');

const defaultState = () => ({
  schemaVersion: 3,
  preferences: {
    onboardingComplete: false,
    setupStep: 0,
    setupSkipped: [],
    demoMode: false,
    showFloatingAssistant: true,
    keepJarvisAvailable: false,
    defaultBrowser: 'System Default',
    searchEngine: 'Google',
    preferredEditor: 'Visual Studio Code',
    preferredMusicApp: 'Spotify',
    appearance: 'dark',
    accent: 'indigo',
    reduceMotion: false,
    voiceInputEnabled: true,
    voicePermissionPromptAttempted: false,
    allowOnlineSpeechFallback: false,
    voiceBackendPreference: 'automatic',
    voiceLocale: 'en-US',
    whisperModelPreference: 'base',
    whisperModelsAcknowledged: false,
    wakeWordEnabled: false,
    spokenRepliesEnabled: false,
    automaticMemoryEnabled: true,
    memoryExcludedCategories: [],
    conversationHistoryEnabled: true,
    activityTrackingEnabled: true,
    insightsEnabled: true,
    developerModeEnabled: false,
    confirmMediumRisk: true,
    screenContextEnabled: false,
    attachmentCloudApprovalMode: 'per-request',
    aiProvider: 'none',
    aiModel: '',
    aiBaseURL: '',
    aiRoutingVersion: 4,
    aiWaterfall: cloneWaterfallDefaults(),
    aiTaskRoutes: cloneTaskDefaults(),
    aiFreeTierConfirmations: { gemini: [false, false, false, false, false], groq: false, mistral: false, nvidia: false },
    aiFreeCatalogs: {},
    localAIEnabled: true,
    localAIModel: 'qwen2.5:1.5b',
    localAIAllowOnBattery: false,
    localAIMaxCPUPercent: 55,
    localAIMinMemoryPercent: 30,
    localAIMinSpeedLimit: 90,
    localAIThreads: 2,
    localAIContextTokens: 2048,
    spotifyClientId: '',
    googleClientId: '', microsoftClientId: '', tavilyFreePlanConfirmed: false,
    orbPosition: null,
    timeSavingEstimates: { openApp: 5, openFolder: 6, searchWeb: 10, startRoutine: 15, createNote: 12, createReminder: 20, gitStatus: 15, default: 5 }
  },
  routines: [
    { id: crypto.randomUUID(), name: 'Coding Setup', icon: '⌘', confirm: false, steps: [
      { id: crypto.randomUUID(), kind: 'openApp', target: 'preferred editor' },
      { id: crypto.randomUUID(), kind: 'openApp', target: 'Terminal' },
      { id: crypto.randomUUID(), kind: 'openApp', target: 'browser' },
      { id: crypto.randomUUID(), kind: 'openFolder', target: 'preferred project' }
    ]},
    { id: crypto.randomUUID(), name: 'Focus Mode', icon: '◴', confirm: true, steps: [
      { id: crypto.randomUUID(), kind: 'startTimer', seconds: 1500, label: 'Focus' },
      { id: crypto.randomUUID(), kind: 'openApp', target: 'preferred editor' }
    ]}
  ],
  activity: [], memories: [], notes: [], trustedProjects: [], favoriteFolders: [],
  appAliases: [], conversations: [], messages: [], connections: [], schedules: [],
    actionRuns: [], actionSteps: [], attachments: [], tasks: [], focusSessions: [], rssFeeds: [], savedSites: [], timer: null
});

function safeJSON(value, fallback = null) {
  try { return JSON.parse(value); } catch { return fallback; }
}

class Store {
  constructor(root) {
    this.root = root;
    this.file = path.join(root, 'state.json');
    this.backup = path.join(root, 'state.backup.json');
    this.databaseFile = path.join(root, 'jarvis.sqlite');
    this.databaseBackup = path.join(root, 'jarvis.backup.sqlite');
    this.memoryFile = path.join(root, 'memory.md');
    this.memoryBackup = path.join(root, 'memory.backup.md');
    fs.mkdirSync(root, { recursive: true, mode: 0o700 });
    this.db = this.#openDatabase();
    this.#createSchema();
    this.state = this.#load();
    this.#writeMemoryMarkdown(this.state.memories);
    this.#secureDatabaseFiles();
  }

  #openDatabase() {
    try { return new DatabaseSync(this.databaseFile); }
    catch (error) {
      if (!fs.existsSync(this.databaseBackup)) throw error;
      const damaged = `${this.databaseFile}.damaged-${Date.now()}`;
      try { fs.renameSync(this.databaseFile, damaged); } catch {}
      fs.copyFileSync(this.databaseBackup, this.databaseFile);
      return new DatabaseSync(this.databaseFile);
    }
  }

  #createSchema() {
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = FULL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS preferences (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS collection_items (
        collection TEXT NOT NULL,
        id TEXT NOT NULL,
        position INTEGER NOT NULL DEFAULT 0,
        payload TEXT NOT NULL,
        created_at TEXT,
        updated_at TEXT,
        PRIMARY KEY (collection, id)
      );
      CREATE INDEX IF NOT EXISTS collection_items_order ON collection_items(collection, position);
      CREATE TABLE IF NOT EXISTS timer_state (singleton INTEGER PRIMARY KEY CHECK(singleton = 1), payload TEXT);
      CREATE VIRTUAL TABLE IF NOT EXISTS local_search USING fts5(kind, item_id UNINDEXED, title, body, tokenize='unicode61');
    `);
  }

  #legacyState() {
    for (const file of [this.file, this.backup]) {
      try {
        if (fs.existsSync(file)) {
          const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
          if (parsed && typeof parsed === 'object') return parsed;
        }
      } catch {}
    }
    return null;
  }

  #merge(base, value) {
    const merged = { ...base, ...(value || {}), preferences: { ...base.preferences, ...((value || {}).preferences || {}) } };
    const routingVersion = Number(merged.preferences.aiRoutingVersion || 0);
    const savedTasks = merged.preferences.aiTaskRoutes && typeof merged.preferences.aiTaskRoutes === 'object' ? merged.preferences.aiTaskRoutes : {};
    merged.preferences.aiTaskRoutes = Object.fromEntries(Object.entries(cloneTaskDefaults()).map(([profile, defaults]) => [profile, { ...defaults, ...(savedTasks[profile] || {}), fallbackPolicy: savedTasks[profile]?.fallbackPolicy === 'none' ? 'none' : 'waterfall' }]));
    if (routingVersion < 3) {
      if (!savedTasks.quick || (savedTasks.quick.provider === 'groq' && savedTasks.quick.model === 'llama-3.1-8b-instant')) merged.preferences.aiTaskRoutes.quick = { ...cloneTaskDefaults().quick };
      if (!savedTasks.summarize || (savedTasks.summarize.provider === 'gemini' && savedTasks.summarize.model === 'gemini-3.1-flash-lite')) merged.preferences.aiTaskRoutes.summarize = { ...cloneTaskDefaults().summarize };
    }
    if (routingVersion < 4) {
      const writing = savedTasks.writing;
      if (!writing || (writing.provider === 'groq' && writing.model === 'llama-3.3-70b-versatile')) merged.preferences.aiTaskRoutes.writing = { ...cloneTaskDefaults().writing };
      const route = merged.preferences.aiWaterfall;
      const legacyRecommended = Array.isArray(route) && route.length === 3
        && route[0]?.provider === 'gemini' && route[0]?.model === 'gemini-3.5-flash'
        && route[1]?.provider === 'groq' && route[1]?.model === 'llama-3.3-70b-versatile'
        && route[2]?.provider === 'openrouter' && route[2]?.model === 'openrouter/free';
      if (legacyRecommended) merged.preferences.aiWaterfall = cloneWaterfallDefaults();
    }
    if (routingVersion < 2 && (!Array.isArray(merged.preferences.aiWaterfall) || !merged.preferences.aiWaterfall.length)) merged.preferences.aiWaterfall = cloneWaterfallDefaults();
    if (!Array.isArray(merged.preferences.aiWaterfall)) merged.preferences.aiWaterfall = cloneWaterfallDefaults();
    const confirmations = merged.preferences.aiFreeTierConfirmations || {};
    merged.preferences.aiFreeTierConfirmations = { gemini: Array.from({ length: 5 }, (_, index) => confirmations.gemini?.[index] === true), groq: confirmations.groq === true, mistral: confirmations.mistral === true, nvidia: confirmations.nvidia === true };
    if (!merged.preferences.aiFreeCatalogs || typeof merged.preferences.aiFreeCatalogs !== 'object') merged.preferences.aiFreeCatalogs = {};
    merged.preferences.aiRoutingVersion = 4;
    for (const collection of COLLECTIONS) if (!Array.isArray(merged[collection])) merged[collection] = [];
    merged.schemaVersion = 3;
    return merged;
  }

  #load() {
    const initialized = this.db.prepare("SELECT value FROM metadata WHERE key = 'initialized'").get();
    if (!initialized) {
      const initial = this.#merge(defaultState(), this.#legacyState());
      this.#persistDatabase(initial);
      this.#writeSnapshot(initial);
      return initial;
    }

    const state = defaultState();
    state.preferences.aiRoutingVersion = 0;
    state.routines = [];
    for (const collection of COLLECTIONS) state[collection] = [];
    for (const row of this.db.prepare('SELECT key, value FROM preferences').all()) {
      state.preferences[row.key] = safeJSON(row.value, row.value);
    }
    for (const row of this.db.prepare('SELECT collection, payload FROM collection_items ORDER BY collection, position').all()) {
      if (COLLECTIONS.includes(row.collection)) {
        const item = safeJSON(row.payload);
        if (item) state[row.collection].push(item);
      }
    }
    const timer = this.db.prepare('SELECT payload FROM timer_state WHERE singleton = 1').get();
    state.timer = timer?.payload ? safeJSON(timer.payload) : null;
    const merged = this.#merge(defaultState(), state);
    if (Number(state.preferences.aiRoutingVersion || 0) < 4) {
      this.#persistDatabase(merged);
      this.#writeSnapshot(merged);
    }
    return merged;
  }

  #persistDatabase(state) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const setMeta = this.db.prepare('INSERT OR REPLACE INTO metadata(key, value) VALUES (?, ?)');
      setMeta.run('initialized', 'true');
      setMeta.run('schemaVersion', String(state.schemaVersion || 3));
      this.db.exec('DELETE FROM preferences; DELETE FROM collection_items; DELETE FROM timer_state; DELETE FROM local_search;');
      const setPreference = this.db.prepare('INSERT INTO preferences(key, value) VALUES (?, ?)');
      for (const [key, value] of Object.entries(state.preferences || {})) setPreference.run(key, JSON.stringify(value));
      const addItem = this.db.prepare('INSERT INTO collection_items(collection, id, position, payload, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)');
      for (const collection of COLLECTIONS) {
        for (const [position, source] of (state[collection] || []).entries()) {
          const item = source.id ? source : { ...source, id: crypto.randomUUID() };
          addItem.run(collection, item.id, position, JSON.stringify(item), item.createdAt || null, item.updatedAt || null);
        }
      }
      if (state.timer) this.db.prepare('INSERT INTO timer_state(singleton, payload) VALUES (1, ?)').run(JSON.stringify(state.timer));
      this.#rebuildSearch(state);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  #rebuildSearch(state) {
    const insert = this.db.prepare('INSERT INTO local_search(kind, item_id, title, body) VALUES (?, ?, ?, ?)');
    for (const memory of state.memories || []) insert.run('memory', memory.id, memory.category || 'Memory', memory.text || '');
    for (const note of state.notes || []) insert.run('note', note.id, note.title || 'Untitled Note', note.body || '');
    for (const message of state.messages || []) insert.run('message', message.id, message.role || 'message', message.content || '');
    for (const entry of state.activity || []) insert.run('activity', entry.id, entry.command || entry.intent || 'Activity', entry.message || '');
  }

  #writeSnapshot(state) {
    const temp = `${this.file}.tmp`;
    if (fs.existsSync(this.file)) fs.copyFileSync(this.file, this.backup);
    fs.writeFileSync(temp, JSON.stringify(state, null, 2), { mode: 0o600 });
    fs.renameSync(temp, this.file);
  }

  #secureDatabaseFiles() {
    for (const file of [this.databaseFile, `${this.databaseFile}-wal`, `${this.databaseFile}-shm`, this.databaseBackup, this.file, this.backup, this.memoryFile, this.memoryBackup]) {
      try { fs.chmodSync(file, 0o600); } catch {}
    }
    try { fs.chmodSync(this.root, 0o700); } catch {}
  }

  #memoryMarkdown(memories) {
    const entries = memories.map(item => {
      const timestamp = item.createdAt || item.updatedAt || new Date().toISOString();
      const date = Number.isNaN(new Date(timestamp).getTime()) ? 'Unknown date' : new Date(timestamp).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
      const body = String(item.text || '').trim().replace(/\r\n/g, '\n').replace(/\n/g, '\n  ');
      const category = item.category ? ` · ${item.category}` : '';
      const source = item.provenance?.source ? ` · source: ${item.provenance.source}` : '';
      const confidence = Number.isFinite(item.confidence) ? ` · confidence: ${Math.round(item.confidence * 100)}%` : '';
      return `- **${date}**${item.pinned ? ' · pinned' : ''}${item.automatic ? ' _(automatic)_' : ''}${category}${source}${confidence}  \n  ${body}`;
    });
    return `# Jarvis Memory\n\n> Automatically maintained by Jarvis on this Mac. Add or remove memories inside the app.\n\n## Saved memories\n\n${entries.length ? entries.join('\n\n') : '_No saved memories yet._'}\n`;
  }

  #writeMemoryMarkdown(memories) {
    const content = this.#memoryMarkdown(memories || []);
    try { if (fs.existsSync(this.memoryFile) && fs.readFileSync(this.memoryFile, 'utf8') === content) return; } catch {}
    const temp = `${this.memoryFile}.tmp`;
    if (fs.existsSync(this.memoryFile)) fs.copyFileSync(this.memoryFile, this.memoryBackup);
    fs.writeFileSync(temp, content, { mode: 0o600 });
    fs.renameSync(temp, this.memoryFile);
  }

  snapshot() { return structuredClone(this.state); }

  save() {
    this.state.schemaVersion = 3;
    this.#persistDatabase(this.state);
    this.#writeSnapshot(this.state);
    this.#writeMemoryMarkdown(this.state.memories);
    this.#secureDatabaseFiles();
  }

  async backupDatabase() {
    try { fs.unlinkSync(this.databaseBackup); } catch {}
    await backup(this.db, this.databaseBackup);
    this.#secureDatabaseFiles();
    return this.databaseBackup;
  }

  updatePreferences(patch) { this.state.preferences = { ...this.state.preferences, ...patch }; this.save(); return this.snapshot(); }
  setTimer(timer) { this.state.timer = timer; this.save(); }

  add(collection, item) {
    if (!COLLECTIONS.includes(collection)) throw new Error('Unsupported collection');
    const value = item.id ? item : { ...item, id: crypto.randomUUID() };
    this.state[collection].unshift(value); this.save(); return value;
  }

  update(collection, id, patch) {
    if (!MUTABLE_COLLECTIONS.includes(collection)) throw new Error('Unsupported collection');
    const index = this.state[collection].findIndex(item => item.id === id);
    if (index < 0) throw new Error('Item not found');
    this.state[collection][index] = { ...this.state[collection][index], ...patch, updatedAt: new Date().toISOString() };
    this.save(); return this.state[collection][index];
  }

  remove(collection, id) {
    if (!MUTABLE_COLLECTIONS.includes(collection)) throw new Error('Unsupported collection');
    this.state[collection] = this.state[collection].filter(item => item.id !== id); this.save();
  }

  clearActivity() { this.state.activity = []; this.state.actionRuns = []; this.state.actionSteps = []; this.save(); }

  search(query, kinds = ['memory', 'note', 'message', 'activity'], limit = 12) {
    const normalized = String(query || '').trim().replace(/["']/g, ' ');
    if (!normalized) return [];
    try {
      const placeholders = kinds.map(() => '?').join(',');
      return this.db.prepare(`SELECT kind, item_id AS id, title, body, rank FROM local_search WHERE local_search MATCH ? AND kind IN (${placeholders}) ORDER BY rank LIMIT ?`).all(`${normalized}*`, ...kinds, limit);
    } catch { return []; }
  }

  createConversation(title = 'New conversation', privateMode = false) {
    const now = new Date().toISOString();
    const conversation = { id: crypto.randomUUID(), title, privateMode, archived: false, createdAt: now, updatedAt: now };
    if (!privateMode && this.state.preferences.conversationHistoryEnabled !== false) this.add('conversations', conversation);
    return conversation;
  }

  addMessage(conversationId, role, content, metadata = {}, privateMode = false) {
    const message = { id: crypto.randomUUID(), conversationId, role, content, metadata, createdAt: new Date().toISOString() };
    if (!privateMode && this.state.preferences.conversationHistoryEnabled !== false) this.add('messages', message);
    return message;
  }

  close() { try { this.db.close(); } catch {} }
}

module.exports = { Store, defaultState, COLLECTIONS };
