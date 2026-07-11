const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'app.js'), 'utf8');
const main = fs.readFileSync(path.join(__dirname, '..', 'main.cjs'), 'utf8');

test('routine creation uses the inline editor instead of unsupported browser prompts', () => {
  assert.match(app, /id="routine-editor"/);
  assert.match(app, /id="add-routine-step"/);
  assert.match(app, /async function saveRoutine/);
  assert.doesNotMatch(app, /\bprompt\(/);
});

test('routine editor only offers step kinds supported by the serial executor', () => {
  for (const kind of ['openApp', 'openFolder', 'startTimer', 'openURL', 'searchWeb', 'spotifyPlay', 'runShortcut']) assert.match(app, new RegExp(`value="${kind}"`));
});

test('routine confirmation preference is surfaced during command preview', () => {
  assert.match(main, /function parsedPreview/);
  assert.match(main, /routine\?\.confirm/);
  assert.match(main, /command\.requiresConfirmation = true/);
});
