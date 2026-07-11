const test = require('node:test');
const assert = require('node:assert/strict');
const { GoogleService, FEATURE_SCOPES } = require('../services/google-service.cjs');

function response(status, body) { return { ok: status >= 200 && status < 300, status, json: async () => body }; }

test('Google connector separates feature scopes', () => {
  assert.ok(FEATURE_SCOPES.gmail.includes('https://www.googleapis.com/auth/gmail.send'));
  assert.ok(FEATURE_SCOPES.calendar.includes('https://www.googleapis.com/auth/calendar.events'));
  assert.equal(FEATURE_SCOPES.drive.includes('https://www.googleapis.com/auth/drive'), false);
});

test('Google Gmail search uses encrypted bearer token supplied by the secret store', async () => {
  const secrets = new Map([['google.accessToken', 'token'], ['google.expiresAt', String(Date.now() + 60_000)]]); const calls = [];
  const service = new GoogleService({
    secretStore: { get: async key => secrets.get(key) || null, set: async (key, value) => secrets.set(key, value), remove: key => secrets.delete(key) }, shell: { openExternal: async () => {} },
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, options });
      if (url.includes('/messages?')) return response(200, { messages: [{ id: 'm1' }] });
      if (url.includes('/messages/m1')) return response(200, { id: 'm1', snippet: 'Project update', payload: { headers: [{ name: 'Subject', value: 'Atlas' }, { name: 'From', value: 'alex@example.com' }] } });
      throw new Error(`unexpected ${url}`);
    }
  });
  const messages = await service.searchMail('Atlas');
  assert.equal(messages[0].subject, 'Atlas');
  assert.equal(calls[0].options.headers.authorization, 'Bearer token');
});
