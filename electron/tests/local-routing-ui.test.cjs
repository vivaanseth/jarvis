const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const main = fs.readFileSync(path.join(root, 'main.cjs'), 'utf8');
const preload = fs.readFileSync(path.join(root, 'preload.cjs'), 'utf8');
const app = fs.readFileSync(path.join(root, 'renderer', 'app.js'), 'utf8');
const orb = fs.readFileSync(path.join(root, 'renderer', 'orb.js'), 'utf8');

test('typed, voice, orb, and buttons share one request dispatcher', () => {
  assert.doesNotMatch(main, /command:parse-local/);
  assert.doesNotMatch(preload, /parseLocal/);
  assert.doesNotMatch(app, /parseLocal/);
  assert.match(app, /dispatchRequest\(text,'voice'\)/);
  assert.match(app, /dispatchCapability/);
  assert.match(orb, /dispatchRequest\(text, \{ source: 'orb' \}\)/);
  assert.match(orb, /window\.jarvis\.dispatchRequest/);
  assert.match(preload, /request:dispatch/);
  assert.match(preload, /dispatchCapability/);
});

test('command center uses contextual real state instead of a separate local-command mode', () => {
  assert.doesNotMatch(app, /LOCAL_ACTION_GROUPS/);
  assert.doesNotMatch(app, /ON DEVICE · ZERO AI TOKENS/);
  assert.match(app, /function contextualDock/);
  assert.match(app, /ACTIVE PLAN/);
  assert.match(app, /RESEARCH SOURCES/);
  assert.match(app, /CURRENT TASK/);
});

test('voice requests microphone and Speech Recognition explicitly before listening', () => {
  const native = fs.readFileSync(path.join(__dirname, '..', '..', 'Sources', 'JarvisNativeBridge', 'main.swift'), 'utf8');
  const helperInfo = fs.readFileSync(path.join(__dirname, '..', '..', 'Sources', 'JarvisNativeBridge', 'Info.plist'), 'utf8');
  assert.match(main, /permissions\.requestVoice/);
  assert.match(main, /requestVoicePermissions\(\)/);
  assert.doesNotMatch(main, /voicePermissionPromptAttempted/);
  assert.match(main, /Permission prompts are user initiated from Setup or Connections/);
  assert.match(preload, /permissions:request-voice/);
  assert.match(app, /Request both permissions/);
  assert.match(app, /Microphone settings/);
  assert.match(native, /case "permissions\.requestVoice"/);
  assert.match(native, /requiresOnDeviceRecognition = onDevice/);
  assert.match(native, /allowNetwork/);
  assert.match(helperInfo, /NSMicrophoneUsageDescription/);
  assert.match(helperInfo, /NSSpeechRecognitionUsageDescription/);
  assert.match(main, /whisperService\.transcribe/);
  assert.match(main, /Apple online Speech/);
  assert.match(main, /await refreshNativeSpeechCapabilities\(\)/);
  assert.match(main, /setTimeout\(\(\) => refreshNativeSpeechCapabilities/);
  assert.match(main, /speech:open-dictation-settings/);
  assert.match(app, /Allow Apple Speech transcription/);
  assert.match(app, /friendlyError/);
});
