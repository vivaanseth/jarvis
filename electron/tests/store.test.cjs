const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Store } = require('../services/store.cjs');

test('persists an atomic snapshot and recovers from backup', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-store-'));
  const store = new Store(root); store.updatePreferences({ onboardingComplete: true }); store.add('notes', { id: 'note-1', title: 'Local', body: '' });
  const restored = new Store(root); assert.equal(restored.snapshot().preferences.onboardingComplete, true); assert.equal(restored.snapshot().notes[0].title, 'Local');
  fs.writeFileSync(path.join(root, 'state.json'), '{bad json');
  const recovered = new Store(root); assert.equal(recovered.snapshot().preferences.onboardingComplete, true);
  fs.rmSync(root, { recursive: true, force: true });
});

test('rejects unsupported collections', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-store-')); const store = new Store(root);
  assert.throws(() => store.add('secrets', {}), /Unsupported collection/); fs.rmSync(root, { recursive: true, force: true });
});

test('mirrors memories to an atomic human-readable Markdown file', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-memory-')); const store = new Store(root);
  const memory = { id: 'memory-1', text: 'The staging server requires the VPN.', automatic: true, createdAt: '2026-06-30T20:15:00.000Z' };
  store.add('memories', memory);
  const markdown = fs.readFileSync(path.join(root, 'memory.md'), 'utf8');
  assert.match(markdown, /# Jarvis Memory/); assert.match(markdown, /staging server requires the VPN/); assert.match(markdown, /2026-06-30 20:15 UTC/); assert.match(markdown, /automatic/);
  assert.equal(fs.existsSync(path.join(root, 'memory.backup.md')), true);
  store.remove('memories', memory.id);
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'memory.md'), 'utf8'), /staging server/);
  fs.rmSync(root, { recursive: true, force: true });
});

test('migrates null routing to seven task lanes and the ordered free waterfall', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-routing-null-'));
  fs.writeFileSync(path.join(root, 'state.json'), JSON.stringify({ preferences: { aiTaskRoutes: null, aiWaterfall: [], aiRoutingVersion: 1 } }));
  const preferences = new Store(root).snapshot().preferences;
  assert.equal(Object.keys(preferences.aiTaskRoutes).length, 7);
  assert.deepEqual(preferences.aiWaterfall.map(item => item.provider), ['gemini', 'groq', 'mistral', 'openrouter']);
  assert.equal(preferences.aiRoutingVersion, 4);
  assert.equal(preferences.aiTaskRoutes.quick.model, 'qwen2.5:1.5b');
  assert.equal(preferences.aiTaskRoutes.summarize.provider, 'ollama');
  fs.rmSync(root, { recursive: true, force: true });
});

test('migration preserves existing task choices and adds missing lanes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-routing-custom-'));
  fs.writeFileSync(path.join(root, 'state.json'), JSON.stringify({ preferences: { aiRoutingVersion: 1, aiWaterfall: [{ id: 'custom', provider: 'ollama', model: 'qwen-local', enabled: true }], aiTaskRoutes: { heavy: { enabled: false, provider: 'ollama', model: 'deep-local' }, coding: { enabled: true, provider: 'ollama', model: 'code-local' }, research: { enabled: false, provider: 'ollama', model: 'research-local' } } } }));
  const preferences = new Store(root).snapshot().preferences;
  assert.equal(preferences.aiTaskRoutes.coding.model, 'code-local');
  assert.equal(preferences.aiTaskRoutes.quick.model, 'qwen2.5:1.5b');
  assert.equal(preferences.aiWaterfall[0].model, 'qwen-local');
  fs.rmSync(root, { recursive: true, force: true });
});

test('version two defaults migrate small lanes to Ollama without replacing custom routes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-routing-v2-'));
  fs.writeFileSync(path.join(root, 'state.json'), JSON.stringify({ preferences: { aiRoutingVersion: 2, aiTaskRoutes: {
    quick: { enabled: true, provider: 'groq', model: 'llama-3.1-8b-instant', fallbackPolicy: 'waterfall' },
    summarize: { enabled: true, provider: 'ollama', model: 'my-private-summary-model', fallbackPolicy: 'waterfall' }
  } } }));
  const preferences = new Store(root).snapshot().preferences;
  assert.equal(preferences.aiRoutingVersion, 4);
  assert.equal(preferences.aiTaskRoutes.quick.model, 'qwen2.5:1.5b');
  assert.equal(preferences.aiTaskRoutes.summarize.model, 'my-private-summary-model');
  fs.rmSync(root, { recursive: true, force: true });
});

test('initialized databases without a routing-version row still receive the free waterfall migration', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-routing-db-'));
  const legacy = new Store(root);
  legacy.updatePreferences({ aiWaterfall: [], aiTaskRoutes: null });
  legacy.db.prepare("DELETE FROM preferences WHERE key = 'aiRoutingVersion'").run();
  legacy.db.close();
  const preferences = new Store(root).snapshot().preferences;
  assert.deepEqual(preferences.aiWaterfall.map(item => item.provider), ['gemini', 'groq', 'mistral', 'openrouter']);
  assert.equal(Object.keys(preferences.aiTaskRoutes).length, 7);
  fs.rmSync(root, { recursive: true, force: true });
});

test('version three recommended routing adds Mistral without replacing custom routing', () => {
  const recommendedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-routing-v3-default-'));
  fs.writeFileSync(path.join(recommendedRoot, 'state.json'), JSON.stringify({ preferences: { aiRoutingVersion: 3, aiWaterfall: [
    { id: 'g', provider: 'gemini', model: 'gemini-3.5-flash', enabled: true },
    { id: 'q', provider: 'groq', model: 'llama-3.3-70b-versatile', enabled: true },
    { id: 'o', provider: 'openrouter', model: 'openrouter/free', enabled: true }
  ], aiTaskRoutes: { writing: { enabled: true, provider: 'groq', model: 'llama-3.3-70b-versatile', fallbackPolicy: 'waterfall' } } } }));
  const recommended = new Store(recommendedRoot).snapshot().preferences;
  assert.deepEqual(recommended.aiWaterfall.map(item => item.provider), ['gemini', 'groq', 'mistral', 'openrouter']);
  assert.equal(recommended.aiTaskRoutes.writing.provider, 'mistral');
  assert.equal(recommended.aiFreeTierConfirmations.mistral, false);
  fs.rmSync(recommendedRoot, { recursive: true, force: true });

  const customRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-routing-v3-custom-'));
  fs.writeFileSync(path.join(customRoot, 'state.json'), JSON.stringify({ preferences: { aiRoutingVersion: 3, aiWaterfall: [{ id: 'custom', provider: 'ollama', model: 'mine', enabled: true }], aiTaskRoutes: { writing: { enabled: true, provider: 'ollama', model: 'writer-local' } } } }));
  const custom = new Store(customRoot).snapshot().preferences;
  assert.deepEqual(custom.aiWaterfall.map(item => item.provider), ['ollama']);
  assert.equal(custom.aiTaskRoutes.writing.model, 'writer-local');
  fs.rmSync(customRoot, { recursive: true, force: true });
});
