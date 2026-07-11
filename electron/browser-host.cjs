#!/usr/local/bin/node
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const socket = net.createConnection(path.join(os.homedir(), 'Library', 'Application Support', 'Jarvis', 'browser.sock'));
let input = Buffer.alloc(0); let output = '';

function writeNative(message) {
  const body = Buffer.from(JSON.stringify(message)); const header = Buffer.alloc(4); header.writeUInt32LE(body.length, 0);
  process.stdout.write(Buffer.concat([header, body]));
}

process.stdin.on('data', chunk => {
  input = Buffer.concat([input, chunk]);
  while (input.length >= 4) {
    const length = input.readUInt32LE(0); if (length > 16 * 1024 * 1024) process.exit(2);
    if (input.length < length + 4) break;
    const body = input.subarray(4, length + 4); input = input.subarray(length + 4);
    try { socket.write(`${body.toString('utf8')}\n`); } catch (error) { writeNative({ ok: false, error: error.message }); }
  }
});

socket.setEncoding('utf8');
socket.on('data', chunk => {
  output += chunk;
  while (output.includes('\n')) {
    const index = output.indexOf('\n'); const line = output.slice(0, index); output = output.slice(index + 1);
    if (!line) continue;
    try { writeNative(JSON.parse(line)); } catch {}
  }
});
socket.on('error', error => { writeNative({ ok: false, error: `Jarvis is unavailable: ${error.message}` }); process.exit(1); });
process.stdin.on('end', () => socket.end());
