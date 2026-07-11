const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { WebSearchService } = require('../services/web-search-service.cjs');
const { ConnectorRegistry } = require('../services/connector-registry.cjs');
const { PROVIDERS, listModels, askAI } = require('../services/ai-service.cjs');

const root = path.join(__dirname, '..', '..');
const response = (status, body) => ({ ok: status >= 200 && status < 300, status, headers: { get: () => null }, text: async () => JSON.stringify(body), json: async () => body, body: null });

test('public repository includes license, security policy, contribution guide, CI, and secret scanning', () => {
  for (const file of ['LICENSE','SECURITY.md','CONTRIBUTING.md','.github/workflows/ci.yml','script/check_secrets.sh']) assert.equal(fs.existsSync(path.join(root, file)), true, file);
  const packageJSON = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(packageJSON.license, 'MIT');
  assert.match(packageJSON.scripts.check, /check_secrets/);
});

test('Tavily results are bounded, cited, and marked untrusted', async () => {
  const service = new WebSearchService({ secretStore: { get: async () => 'test-key', has: () => true }, fetchImpl: async () => response(200, { results: [{ title: 'Source', url: 'https://example.com/a', content: 'External content', score: .9 }, { title: 'Unsafe', url: 'http://example.com', content: 'ignored' }] }) });
  const result = await service.search('Jarvis research');
  assert.equal(result.provider, 'tavily');
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].citationId, 'S1');
  assert.equal(result.results[0].untrusted, true);
});

test('connector availability requires a ready record with the granted feature', () => {
  const state = { connections: [{ id: 'g', connectorId: 'google', state: 'ready', grantedFeatures: ['gmail'] }] };
  const registry = new ConnectorRegistry({ store: { snapshot: () => state }, secretStore: {} });
  assert.equal(registry.available('searchEmail'), true);
  assert.equal(registry.available('searchDrive'), false);
  assert.equal(registry.available('researchWeb'), true);
});

test('NVIDIA NIM and loopback-only LM Studio are supported providers', async () => {
  assert.ok(PROVIDERS.nvidia);
  assert.ok(PROVIDERS.lmstudio);
  const previous = global.fetch;
  try {
    global.fetch = async url => response(200, { data: [{ id: String(url).includes('nvidia') ? 'meta/llama-3.1-8b-instruct' : 'local-model' }] });
    const nvidia = await listModels({ provider: 'nvidia', key: 'test-key' });
    const local = await listModels({ provider: 'lmstudio', baseURL: 'http://127.0.0.1:1234/v1' });
    assert.equal(nvidia[0].free, true);
    assert.equal(local[0].id, 'local-model');
    await assert.rejects(() => listModels({ provider: 'lmstudio', baseURL: 'http://example.com/v1' }), /loopback/);
  } finally { global.fetch = previous; }
});

test('LM Studio obeys the local resource gate before inference', async () => {
  const monitor = { acquire: async () => ({ allowed: false, assessment: { code: 'CPU_BUSY', reason: 'CPU is busy.' } }) };
  await assert.rejects(() => askAI({ route: [{ provider: 'lmstudio', model: 'local-model', baseURL: 'http://127.0.0.1:1234/v1', enabled: true }], text: 'hello', resourceMonitor: monitor, localPreferences: {} }), error => error.code === 'CPU_BUSY');
});
