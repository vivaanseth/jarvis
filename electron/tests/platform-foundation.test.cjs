const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Store } = require('../services/store.cjs');
const { CapabilityRegistry } = require('../services/capability-registry.cjs');
const { riskFor, confirmationFor, assertRiskInvariant } = require('../services/safety-policy.cjs');
const { calculate } = require('../services/local-information.cjs');
const { ActionCoordinator } = require('../services/action-coordinator.cjs');
const { RoutineScheduler, nextOccurrence } = require('../services/scheduler.cjs');

test('SQLite is canonical while preserving a portable state snapshot', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-sqlite-'));
  const store = new Store(root);
  store.add('memories', { id: 'memory-1', text: 'The Atlas project uses pnpm', createdAt: new Date().toISOString() });
  const conversation = store.createConversation('Atlas');
  store.addMessage(conversation.id, 'user', 'Remember Atlas');
  assert.ok(fs.existsSync(path.join(root, 'jarvis.sqlite')));
  assert.equal(fs.statSync(path.join(root, 'jarvis.sqlite')).mode & 0o777, 0o600);
  assert.ok(fs.existsSync(path.join(root, 'state.json')));
  assert.equal(store.search('Atlas').some(item => item.kind === 'memory'), true);
  store.close();
  const restored = new Store(root);
  assert.equal(restored.snapshot().messages.length, 1);
  restored.close();
});

test('capability registry validates strict structured inputs', () => {
  const registry = new CapabilityRegistry();
  assert.equal(registry.validate('startTimer', { seconds: 1500, label: 'Focus' }), true);
  assert.throws(() => registry.validate('startTimer', { seconds: 0 }), /requires label|outside/);
  assert.throws(() => registry.validate('openApp', { target: 'Safari', shell: true }), /does not accept shell/);
  assert.throws(() => registry.validate('imaginary', {}), /Unsupported capability/);
});

test('risk and confirmation are independent of AI-provided values', () => {
  assert.equal(riskFor('sendEmail'), 'high');
  assert.equal(confirmationFor('sendEmail', { confirmMediumRisk: false }), 'at-execution');
  assert.throws(() => assertRiskInvariant({ capabilityId: 'sendEmail', risk: 'low', confirmation: 'none' }), /cannot be downgraded/);
});

test('calculator is local, bounded, and does not evaluate code', () => {
  assert.equal(calculate('(12 + 8) * 2.5'), 50);
  assert.equal(calculate('10 % 3'), 1);
  assert.throws(() => calculate('process.exit()'), /Use numbers/);
  assert.throws(() => calculate('1 / 0'), /Division by zero/);
});

test('serial coordinator preserves completed history and stops after failure', async () => {
  const coordinator = new ActionCoordinator(); const seen = [];
  const result = await coordinator.run([{ id: 1 }, { id: 2 }, { id: 3 }], async step => { seen.push(step.id); if (step.id === 2) throw new Error('failed'); return step.id; });
  assert.deepEqual(seen, [1, 2]);
  assert.equal(result.status, 'partial');
  assert.deepEqual(result.completed.map(item => item.status), ['succeeded', 'failed']);
});

test('scheduler computes selected weekdays and runs due low-risk routines once', async () => {
  const monday = new Date('2026-07-06T08:00:00');
  assert.equal(new Date(nextOccurrence({ hour: 9, minute: 30, days: [1] }, monday)).getDay(), 1);
  const runs = []; const schedules = [{ id: 's1', routineId: 'r1', enabled: true, hour: 8, minute: 0, days: [1], nextRunAt: '2026-07-06T07:59:00' }];
  const scheduler = new RoutineScheduler({ getState: () => ({ schedules, routines: [{ id: 'r1', name: 'Morning', confirm: false }] }), saveSchedule: value => Object.assign(schedules[0], value), onRun: async routine => runs.push(routine.name), onSuggestion: () => {}, now: () => monday });
  await scheduler.tick(); assert.deepEqual(runs, ['Morning']); assert.ok(schedules[0].nextRunAt > monday.toISOString()); scheduler.stop();
});
