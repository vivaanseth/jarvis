const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'app.js'), 'utf8');
const preload = fs.readFileSync(path.join(__dirname, '..', 'preload.cjs'), 'utf8');
const main = fs.readFileSync(path.join(__dirname, '..', 'main.cjs'), 'utf8');

test('connections expose OpenRouter, Groq, Mistral, model loading, and ordered drag controls', () => {
  assert.match(app, /openrouter: \{ name: 'OpenRouter'/);
  assert.match(app, /groq: \{ name: 'Groq'/);
  assert.match(app, /mistral: \{ name: 'Mistral'/);
  assert.match(app, /Free mode \/ no Scale billing/);
  assert.match(app, /id="ai-waterfall-form"/);
  assert.match(app, /draggable="true"/);
  assert.match(app, /class="field ai-route-model"/);
  assert.match(app, /move-ai-route/);
  assert.match(preload, /saveAIWaterfall/);
  assert.match(preload, /listAIModels/);
});

test('Gemini is one provider with five credential slots and task-specific overrides', () => {
  assert.match(app, /class="gemini-key-pool"/);
  assert.match(app, /Array\.from\(\{length:5\}/);
  assert.match(app, /data-slot="\$\{index\}"/);
  assert.match(app, /class="ai-task-row/);
  assert.match(app, /taskRoutes:aiDraft\.taskRoutes/);
  assert.match(app, /apiKeys:provider==='gemini'/);
  assert.match(app, /ZERO-TOKEN ROUTING/);
});

test('free routing UI exposes seven lanes, confirmations, preset, and verification states', () => {
  assert.match(app, /Object\.keys\(ai\.taskProfiles\|\|\{\}\)\.map\(aiTaskRouteRow\)/);
  assert.match(app, /class="ai-free-confirm"/);
  assert.match(app, /Free-Only Lock/);
  assert.match(app, /id="apply-free-preset"/);
  assert.match(app, /VERIFIED FREE/);
  assert.match(app, /confirmations:aiDraft\.confirmations/);
});

test('Connections exposes adaptive local compute status and safety controls', () => {
  assert.match(app, /Adaptive local compute/);
  assert.match(app, /localAIEnabled/);
  assert.match(app, /localAIAllowOnBattery/);
  assert.match(app, /checkLocalResources/);
  assert.match(app, /2 CPU threads/);
  assert.match(preload, /ai:check-local-resources/);
});

test('validated provider keys can be saved independently from routing', () => {
  assert.match(app, /id="save-ai-credentials"/);
  assert.match(app, /saveAICredentials/);
  assert.match(preload, /connection:save-ai-credentials/);
  assert.match(main, /async function saveAICredentials/);
  assert.match(main, /if \(supplied\.length\) await saveAICredentials/);
  assert.match(main, /\.\.\.storedAIRoute\(state\), \.\.\.taskRoutes/);
});
