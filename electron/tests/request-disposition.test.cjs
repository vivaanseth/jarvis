const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyRequestDisposition } = require('../services/request-disposition.cjs');

test('social phrases receive instant deterministic replies', () => {
  assert.deepEqual(['hi', 'Hello Jarvis!', 'hey there'].map(text => classifyRequestDisposition(text).kind), ['localReply', 'localReply', 'localReply']);
  assert.equal(classifyRequestDisposition('thanks').reply, 'You’re welcome.');
  assert.equal(classifyRequestDisposition('goodbye').reply, 'Goodbye.');
});

test('questions and content work are conversation, not device plans', () => {
  for (const text of ['What is photosynthesis?', 'How do I open a terminal?', 'Write a poem about rain', 'Rewrite this paragraph', 'Summarize this report']) {
    assert.equal(classifyRequestDisposition(text).kind, 'conversation', text);
  }
});

test('only strongly action-shaped unmatched requests enter planning', () => {
  assert.equal(classifyRequestDisposition('Organize these files by project then open the newest one').kind, 'actionCandidate');
  assert.equal(classifyRequestDisposition('Could you move these files into the project folder?').kind, 'actionCandidate');
  assert.equal(classifyRequestDisposition('I was thinking about organizing my files').kind, 'conversation');
});
