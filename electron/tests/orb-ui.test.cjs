const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const script = fs.readFileSync(path.join(root, 'renderer', 'orb.js'), 'utf8');
const markup = fs.readFileSync(path.join(root, 'renderer', 'orb.html'), 'utf8');
const preload = fs.readFileSync(path.join(root, 'preload.cjs'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'renderer', 'orb.css'), 'utf8');
const main = fs.readFileSync(path.join(root, 'main.cjs'), 'utf8');

test('floating assistant exposes full-window, collapse, hide, and quit controls', () => {
  assert.match(markup, /id="open-main"/);
  assert.match(markup, /id="collapse"/);
  assert.match(markup, /id="hide"/);
  assert.match(markup, /id="quit"/);
  assert.match(preload, /quitApp/);
  assert.match(main, /setActivationPolicy\('regular'\)/);
  assert.match(main, /app\.dock\.show\(\)/);
});

test('focus synchronization cannot feed back into another expand request', () => {
  assert.match(script, /onFocusInput\(\(\) => applyExpandedState\(\{ requestWindow: false/);
  assert.equal((script.match(/window\.jarvis\.expandOrb\(\)/g) || []).length, 1);
});

test('corner orb opens immediately on a click and distinguishes dragging', () => {
  assert.match(script, /pointerdown/);
  assert.match(script, /pointermove/);
  assert.match(script, /orbButton\.addEventListener\('click'/);
  assert.match(script, /window\.jarvis\.activateOrb\(\)/);
  assert.match(script, /suppressActivationClick = moved/);
  assert.doesNotMatch(script, /dblclick|clickTimer/);
  assert.match(preload, /moveOrb/);
  assert.match(preload, /activateOrb/);
  assert.match(main, /acceptFirstMouse: true/);
  assert.match(main, /webContents\.on\('before-mouse-event'/);
  assert.match(main, /if \(shouldActivate\) activateOrb\(\)/);
  assert.match(main, /orbWindow\.on\('focus'.*activateOrb/s);
  assert.match(main, /orbFocusFallbackArmed/);
  assert.match(main, /orbMouseCandidate === null/);
  assert.match(main, /input\.clickCount/);
  assert.match(styles, /\.orb \{[^}]*-webkit-app-region: no-drag/);
  assert.doesNotMatch(styles, /\.orb \{[^}]*-webkit-app-region: drag/);
});
