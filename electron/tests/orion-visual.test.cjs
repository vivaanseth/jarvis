const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', 'renderer');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const orb = fs.readFileSync(path.join(root, 'orb.html'), 'utf8');
const orbScript = fs.readFileSync(path.join(root, 'orb.js'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');

test('main core preserves the Orion 24-tick graticule and twin sweep arcs', () => {
  assert.match(app, /function reactorTicks\(count = 24\)/);
  assert.match(app, /class="reactor-ring ring-one"/);
  assert.match(app, /class="reactor-ring ring-two"/);
  assert.match(styles, /\.reactor-ticks i\.major/);
});

test('floating core is circular instrumentation, not a planetary orbit', () => {
  assert.equal((orb.match(/<i><\/i>/g) || []).length, 12);
  assert.match(orb, /class="orb-sweep sweep-one"/);
  assert.doesNotMatch(orb, /planet|ellipse/i);
});

test('floating core maps command lifecycle to visual states', () => {
  for (const state of ['reviewing', 'processing', 'success', 'error']) assert.match(orbScript, new RegExp(`'${state}'`));
});
