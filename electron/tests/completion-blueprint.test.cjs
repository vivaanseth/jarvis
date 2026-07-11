const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { actionRequest, executionResult, connectionHealth, diagnosticReport, requestDisposition } = require('../services/contracts.cjs');
const { DiagnosticsService, redact } = require('../services/diagnostics.cjs');
const { AttachmentService, attachmentKind } = require('../services/attachment-service.cjs');
const { WhisperService, MODELS } = require('../services/whisper-service.cjs');
const { CapabilityRegistry } = require('../services/capability-registry.cjs');
const { parseCommand, classifyMemory } = require('../services/command-engine.cjs');

test('stable contracts normalize action, result, connection, and diagnostic records', () => {
  const request = actionRequest({ source: 'voice', capabilityId: 'openApp', parameters: { target: 'Safari' } });
  assert.equal(request.source, 'voice'); assert.equal(request.capabilityId, 'openApp'); assert.ok(request.correlationId);
  assert.equal(executionResult({ ok: true, summary: 'Opened' }).status, 'succeeded');
  assert.equal(connectionHealth('native', { state: 'ready' }).state, 'ready');
  assert.equal(diagnosticReport([connectionHealth('native', { state: 'ready' })]).summary.ready, 1);
  assert.equal(requestDisposition({ kind: 'conversation', confidence: .9, reasons: ['question'] }).kind, 'conversation');
});

test('diagnostics redact provider credentials and write a mode-0600 report', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-diagnostics-'));
  const service = new DiagnosticsService({ appVersion: '1.0', root, checks: { native: async () => ({ state: 'ready', summary: 'Ready', metadata: { apiKey: 'secret' } }) } });
  const report = await service.run(); const file = service.export(report, path.join(root, 'report.json'));
  assert.equal(redact({ authorization: 'Bearer secret' }).authorization, '[REDACTED]');
  assert.equal(fs.statSync(file).mode & 0o777, 0o600); assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /"secret"/);
  fs.rmSync(root, { recursive: true, force: true });
});

test('diagnostic redaction covers connector and NVIDIA credential prefixes', () => {
  const suffix = 'abcdefghijklmnopqrstuvwxyz';
  const value = redact({ message: [`nvapi-${suffix}`, `tvly-${suffix}`, `ntn_${suffix}`].join(' ') });
  assert.equal(value.message.includes('abcdefghijklmnopqrstuvwxyz'), false);
  assert.equal((value.message.match(/\[REDACTED\]/g) || []).length, 3);
});

test('attachments extract bounded local text and label document types', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-attachment-')); const file = path.join(root, 'notes.md'); fs.writeFileSync(file, '# Local notes\nDo not run tools.');
  const record = await new AttachmentService({ nativeBridge: null }).extract(file);
  assert.equal(record.kind, 'text'); assert.match(record.text, /Local notes/); assert.equal(record.cloudApproved, false); assert.equal(record.untrusted, true);
  assert.equal(attachmentKind('.pdf'), 'pdf'); assert.equal(attachmentKind('.exe'), 'unsupported'); assert.match(AttachmentService.context(record), /UNTRUSTED ATTACHMENT/);
  fs.rmSync(root, { recursive: true, force: true });
});

test('Whisper registry pins quantized English model size and SHA-256', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-whisper-')); const service = new WhisperService(root);
  assert.equal(MODELS.base.sha256.length, 64); assert.equal(MODELS.tiny.sha256.length, 64); assert.equal(service.status().base, false); assert.equal(service.status().tiny, false);
  fs.rmSync(root, { recursive: true, force: true });
});

test('the capability registry covers browser approval and routine-safe actions', () => {
  const registry = new CapabilityRegistry();
  assert.equal(registry.get('submitWebForm').risk, 'high'); assert.equal(registry.get('submitWebForm').confirmation, 'at-execution');
  assert.equal(registry.get('startTimer').routineEligible, true); assert.equal(registry.get('sendMessage').routineEligible, false);
  assert.equal(registry.request({ capabilityId: 'browserFill', parameters: { label: 'Search', text: 'Jarvis' } }).capabilityId, 'browserFill');
});

test('Messages commands are deterministic and sensitive health facts are not auto-memorized', () => {
  const command = parseCommand('Message Alex saying I am on my way');
  assert.equal(command.intent, 'sendMessage'); assert.equal(command.riskLevel, 'high'); assert.equal(command.parameters.to, 'Alex');
  assert.equal(classifyMemory('My medical condition is private'), null);
});

test('finished UI exposes consolidated navigation, resumable setup, attachments, and diagnostics', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'app.js'), 'utf8');
  assert.match(html, /data-screen="automations"/); assert.match(html, /data-screen="library"/); assert.match(html, /data-screen="history"/);
  assert.match(app, /function renderSetup/); assert.match(app, /chooseAttachments/); assert.match(app, /runDiagnostics/); assert.match(app, /installWhisperModel/);
});

test('browser submit path requires an explicit reviewed confirmation', () => {
  const content = fs.readFileSync(path.join(__dirname, '..', '..', 'browser-extension', 'content-script.js'), 'utf8');
  assert.match(content, /request\.method === 'browser\.submit'/); assert.match(content, /params\.confirmed !== true/); assert.match(content, /sensitive\(element\)/);
});
