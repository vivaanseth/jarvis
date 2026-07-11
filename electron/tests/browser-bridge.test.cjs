const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { once } = require('node:events');
const { BrowserBridge } = require('../services/browser-bridge.cjs');

test('browser bridge performs request/response over a user-only Unix socket', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-browser-')); const bridge = new BrowserBridge(root); bridge.start();
  if (!bridge.server.listening) await once(bridge.server, 'listening');
  const client = net.createConnection(bridge.socketPath); await once(client, 'connect');
  client.setEncoding('utf8');
  const request = bridge.request('browser.listTabs');
  const [chunk] = await once(client, 'data'); const message = JSON.parse(chunk.trim());
  client.write(`${JSON.stringify({ id: message.id, ok: true, result: [{ title: 'Jarvis' }] })}\n`);
  assert.deepEqual(await request, [{ title: 'Jarvis' }]);
  assert.equal(fs.statSync(bridge.socketPath).mode & 0o777, 0o600);
  client.destroy(); bridge.stop();
});

test('browser extension blocks sensitive fields and consequential submits', () => {
  const script = fs.readFileSync(path.join(__dirname, '..', '..', 'browser-extension', 'content-script.js'), 'utf8');
  assert.match(script, /password\|passcode\|otp/);
  assert.match(script, /credit\|debit\|card/);
  assert.match(script, /submit\|purchase\|buy\|book\|send\|post/);
  assert.doesNotMatch(script, /document\.cookie/);
});
