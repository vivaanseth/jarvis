const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCommand, preview, duration, dateFrom, riskFor, importantMemoryCandidate } = require('../services/command-engine.cjs');

const examples = [
  ['Open Safari', 'openApp'], ['Open my Downloads folder', 'openFolder'], ['Start a 25 minute focus timer', 'startTimer'],
  ['Remind me to call Alex tomorrow at 9am', 'createReminder'], ['Create a note called Launch ideas', 'createNote'],
  ['Search YouTube for macOS shortcuts', 'searchYouTube'], ['Google local-first software', 'searchWeb'], ['Set volume to 35', 'setVolume'],
  ['Take a screenshot', 'takeScreenshot'], ['Lock my Mac', 'lockScreen'], ['Start Coding Setup', 'startRoutine'],
  ['git status in my Jarvis project', 'gitStatus'], ['Remember that the staging URL changed', 'saveMemory'],
  ['What is 12 * (4 + 2)?', 'calculate'], ['Weather in San Francisco', 'getWeather'],
  ['Directions to Golden Gate Park', 'openDirections'], ['Play Midnight City on Spotify', 'spotifyPlay'],
  ['List my Chrome tabs', 'browserListTabs'], ['Search my Gmail for Atlas', 'searchEmail'],
  ['Search my Google Drive for roadmap', 'searchDrive'], ['Email alex@example.com saying Hello there', 'sendEmail'],
  ['What time is it?', 'showTime'], ['What is the date?', 'showDate'], ['Battery status', 'batteryStatus'],
  ['Disk space', 'diskSpace'], ['Start screen saver', 'startScreenSaver'], ['Sleep display', 'sleepDisplay'],
  ['What is playing?', 'currentTrack'], ['Open Trash', 'openTrash'], ['List installed apps', 'listApplications'],
  ['Open Gmail', 'openURL'], ['Open privacy settings', 'openSystemSettings']
];

for (const [input, intent] of examples) test(`parses: ${input}`, () => assert.equal(parseCommand(input, { routines: ['Coding Setup'], projects: ['Jarvis'] }).intent, intent));
test('extracts durations', () => { assert.equal(duration('25 minutes'), 1500); assert.equal(duration('2 hours'), 7200); assert.equal(duration('9 seconds'), 9); });
test('extracts a future date', () => { const value = dateFrom('tomorrow at 9:30am', new Date('2026-06-30T12:00:00-07:00')); assert.ok(value); assert.equal(new Date(value).getDate(), 1); });
test('unknown commands remain low-confidence and cannot execute', () => { const command = parseCommand('transmogrify the moon'); assert.equal(command.intent, 'unknown'); assert.ok(command.confidence < .5); });
test('high risk cannot be downgraded', () => { const command = preview(parseCommand('Trash /System'), { confirmMediumRisk: false }); assert.equal(riskFor(command.intent), 'high'); assert.equal(command.requiresConfirmation, true); });
test('calendar writes require confirmation', () => assert.equal(preview(parseCommand('Add team sync tomorrow at 2pm'), { confirmMediumRisk: false }).requiresConfirmation, true));
test('an exact new-note command creates an untitled local note', () => assert.equal(parseCommand('New note').parameters.title, 'Untitled Note'));

test('automatically classifies durable personal facts as local memory', () => {
  for (const text of ['I prefer Spotify for music', 'My project is called Atlas', 'The staging URL is available only through the VPN', 'Our deadline is October 14']) {
    const command = parseCommand(text, { automaticMemoryEnabled: true });
    assert.equal(command.intent, 'saveMemory'); assert.equal(command.parameters.automatic, true); assert.ok(command.parameters.category); assert.ok(command.parameters.importance >= .8);
  }
});

test('automatic memory ignores ordinary commands, questions, and secrets', () => {
  for (const text of ['Open Safari', 'What is my favorite browser?', 'My API key is abc123', 'The password is hunter2']) assert.equal(importantMemoryCandidate(text), null);
});

test('automatic memory can be disabled without affecting explicit Remember commands', () => {
  assert.equal(parseCommand('I prefer Spotify for music', { automaticMemoryEnabled: false }).intent, 'unknown');
  assert.equal(parseCommand('Remember that I prefer Spotify for music', { automaticMemoryEnabled: false }).intent, 'saveMemory');
});

test('natural website requests resolve consistently without treating help questions as actions', () => {
  for (const text of ['Open ChatGPT', 'Please open ChatGPT', 'Could you open ChatGPT?', 'I want you to open up the ChatGPT website.']) {
    const command = parseCommand(text);
    assert.equal(command.intent, 'openURL', text);
    assert.equal(command.parameters.url, 'https://chatgpt.com', text);
  }
  assert.equal(parseCommand('How do I open ChatGPT?').intent, 'unknown');
  assert.equal(parseCommand('Open the ChatGPT app').intent, 'openApp');
});
