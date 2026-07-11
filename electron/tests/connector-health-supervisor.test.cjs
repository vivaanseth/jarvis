const test = require('node:test');
const assert = require('node:assert/strict');
const { ConnectorHealthSupervisor, publicError } = require('../services/connector-health-supervisor.cjs');

class Registry {
  constructor(records = []) { this.values = new Map(records.map(record => [record.connectorId, { ...record }])); }
  record(id) { return this.values.get(id) || null; }
  records() { return [...this.values.values()]; }
  upsert(id, patch) { const value = { connectorId: id, ...(this.record(id) || {}), ...patch }; this.values.set(id, value); return value; }
}

test('connector health marks successful checks ready without persisting secrets', async () => {
  const registry = new Registry([{ connectorId: 'github', state: 'checking', accountLabel: 'GitHub', grantedFeatures: ['issues'] }]);
  const health = new ConnectorHealthSupervisor({ registry, checks: { github: async () => ({ accountLabel: 'octocat' }) } });
  const result = await health.refresh('github');
  assert.equal(result.state, 'ready');
  assert.equal(result.accountLabel, 'octocat');
  assert.equal(JSON.stringify(result).includes('token'), false);
});

test('connector health distinguishes authentication and transient failures', async () => {
  const authRegistry = new Registry([{ connectorId: 'notion', state: 'checking' }]);
  const auth = new ConnectorHealthSupervisor({ registry: authRegistry, checks: { notion: async () => { throw new Error('401 invalid token'); } } });
  assert.equal((await auth.refresh('notion')).state, 'needsSetup');

  const transientRegistry = new Registry([{ connectorId: 'todoist', state: 'checking' }]);
  const transient = new ConnectorHealthSupervisor({ registry: transientRegistry, checks: { todoist: async () => { throw new Error('Network connection reset'); } } });
  assert.equal((await transient.refresh('todoist')).state, 'degraded');
});

test('diagnostic error text redacts bearer credentials', () => {
  assert.equal(publicError(new Error('Bearer secret-value rejected')), 'Bearer [REDACTED] rejected');
});
