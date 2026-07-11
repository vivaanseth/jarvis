const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_TASK_ROUTES, DEFAULT_FREE_WATERFALL, freeModelStatus, registryAllows, confirmedCredentialSlots, reconcileProviderRoutes } = require('../services/free-model-policy.cjs');

test('every preset task and waterfall model is in the verified-free registry', () => {
  for (const route of [...Object.values(DEFAULT_TASK_ROUTES), ...DEFAULT_FREE_WATERFALL]) assert.equal(registryAllows(route.provider, route.model), true, `${route.provider}/${route.model}`);
});

test('strict policy rejects paid and unverifiable cloud routes', () => {
  assert.equal(freeModelStatus('openaiCompatible', 'anything', []).verified, false);
  assert.equal(freeModelStatus('gemini', 'gemini-3.1-pro-preview', [{ id: 'gemini-3.1-pro-preview' }]).verified, false);
  assert.equal(freeModelStatus('openrouter', 'paid/model', [{ id: 'paid/model', free: false, pricing: { prompt: '1', completion: '1' } }]).verified, false);
});

test('registry models still require live availability while local and free router do not', () => {
  assert.equal(freeModelStatus('gemini', 'gemini-3.5-flash').verified, false);
  assert.equal(freeModelStatus('gemini', 'gemini-3.5-flash', [{ id: 'gemini-3.5-flash', free: true }]).verified, true);
  assert.equal(freeModelStatus('openrouter', 'openrouter/free').verified, true);
  assert.equal(freeModelStatus('ollama', 'llama3.2').verified, true);
});

test('specific OpenRouter models require explicit zero pricing', () => {
  assert.equal(freeModelStatus('openrouter', 'example/model:free', [{ id: 'example/model:free', free: true, pricing: { prompt: '0', completion: '0' } }]).verified, true);
  assert.equal(freeModelStatus('openrouter', 'example/model:free', [{ id: 'example/model:free', free: true, pricing: { prompt: '0', completion: '0.1' } }]).verified, false);
});

test('Gemini credential eligibility is confirmed independently per slot', () => {
  assert.deepEqual(confirmedCredentialSlots([true, true, false, true, true], [true, false, true, true, false]), [true, false, false, true, false]);
});

test('catalog drift disables stale routes without replacing their models', () => {
  const waterfall = [{ id: 'gemini', provider: 'gemini', model: 'gemini-3.5-flash', enabled: true }, { id: 'or', provider: 'openrouter', model: 'openrouter/free', enabled: true }];
  const tasks = { heavy: { provider: 'gemini', model: 'gemini-3.5-flash', enabled: true } };
  const reconciled = reconcileProviderRoutes('gemini', waterfall, tasks, [{ id: 'gemini-3.1-flash-lite', free: true }]);
  assert.equal(reconciled.changed, true);
  assert.equal(reconciled.waterfall[0].enabled, false);
  assert.equal(reconciled.waterfall[0].model, 'gemini-3.5-flash');
  assert.equal(reconciled.waterfall[1].enabled, true);
  assert.equal(reconciled.taskRoutes.heavy.enabled, false);
});
