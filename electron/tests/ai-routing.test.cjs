const test = require('node:test');
const assert = require('node:assert/strict');
const { TASK_PROFILES, classifyAITask, selectAIRoute } = require('../services/ai-routing.cjs');

const cases = [
  ['Answer briefly: who invented the telephone?', 'quick'],
  ['Who invented the telephone?', 'quick'],
  ['Use the best model and think deeply about this architecture review', 'heavy'],
  ['Debug this compile error and write integration tests', 'coding'],
  ['Research this topic and compare sources', 'research'],
  ['Rewrite this paragraph in a warmer tone', 'writing'],
  ['Summarize this report and extract the action items', 'summarize'],
  ['Organize these files by project then open the newest one', 'actionPlan'],
  ['How are you doing today?', 'quick']
];

test('all seven task lanes classify locally with confidence and reasons', () => {
  assert.equal(Object.keys(TASK_PROFILES).length, 7);
  for (const [input, expected] of cases) {
    const classification = classifyAITask(input);
    assert.equal(classification.profile, expected, input);
    if (expected !== 'default') {
      assert.ok(classification.confidence >= .75, input);
      assert.ok(classification.reasons.length > 0, input);
    }
  }
});

test('ambiguous prompts use the default waterfall', () => {
  const result = classifyAITask('Research and rewrite this source as integration test code');
  assert.equal(result.profile, 'default');
});

test('task routes prepend the exact model then use a deduplicated waterfall', () => {
  const waterfall = [
    { id: 'duplicate', provider: 'gemini', model: 'gemini-3.5-flash', enabled: true },
    { id: 'fallback', provider: 'groq', model: 'llama-3.3-70b-versatile', enabled: true }
  ];
  const taskRoutes = { heavy: { enabled: true, provider: 'gemini', model: 'gemini-3.5-flash', fallbackPolicy: 'waterfall' } };
  const heavy = selectAIRoute('Think deeply about this architecture', taskRoutes, waterfall);
  assert.equal(heavy.override, true);
  assert.equal(heavy.route[0].id, 'task-heavy');
  assert.equal(heavy.route.length, 2);
  assert.equal(heavy.route[1].provider, 'groq');
  assert.equal(heavy.route[0].generation.maxOutputTokens, 4096);
});

test('unmatched prompts retain the ordered waterfall', () => {
  const waterfall = [{ id: 'first', provider: 'groq', model: 'fast' }, { id: 'second', provider: 'openrouter', model: 'openrouter/free' }];
  const ordinary = selectAIRoute('Consider these unrelated details without a specific requested task and continue only when enough additional context has been provided later', {}, waterfall);
  assert.equal(ordinary.override, false);
  assert.deepEqual(ordinary.route.map(item => item.id), ['first', 'second']);
});

test('brief ordinary conversation uses the local quick lane', () => {
  const result = classifyAITask('Hello Jarvis, how are you?');
  assert.equal(result.profile, 'quick');
  assert.match(result.reasons.join(' '), /brief general conversation/);
});
