const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const electronRoot = path.join(__dirname, '..');
const svg = fs.readFileSync(path.join(electronRoot, 'assets', 'JarvisTrayTemplate.svg'), 'utf8');
const png = fs.readFileSync(path.join(electronRoot, 'assets', 'JarvisTrayTemplate.png'));
const main = fs.readFileSync(path.join(electronRoot, 'main.cjs'), 'utf8');

test('tray uses a white SVG source with a macOS template raster', () => {
  assert.match(svg, /<svg/); assert.match(svg, /#fff/);
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  assert.match(main, /JarvisTrayTemplate\.png/);
  assert.match(main, /setTemplateImage\(true\)/);
});
