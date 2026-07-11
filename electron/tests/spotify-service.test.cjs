const test = require('node:test');
const assert = require('node:assert/strict');
const { SpotifyService, SCOPES } = require('../services/spotify-service.cjs');

function response(status, body) { return { ok: status >= 200 && status < 300, status, json: async () => body }; }

test('Spotify declares least-privilege playback and private playlist scopes', () => {
  for (const scope of ['user-read-playback-state', 'user-modify-playback-state', 'playlist-modify-private']) assert.ok(SCOPES.includes(scope));
  assert.equal(SCOPES.includes('playlist-modify-public'), false);
});

test('Spotify search and playback use bearer API calls without a client secret', async () => {
  const secrets = new Map([['spotify.accessToken', 'token'], ['spotify.expiresAt', String(Date.now() + 60_000)]]);
  const calls = [];
  const service = new SpotifyService({
    secretStore: { get: async key => secrets.get(key) || null, set: async (key, value) => secrets.set(key, value), remove: key => secrets.delete(key) },
    shell: { openExternal: async () => {} },
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, options });
      if (url.includes('/search?')) return response(200, { tracks: { items: [{ type: 'track', name: 'Midnight', uri: 'spotify:track:1', artists: [{ name: 'Atlas' }] }] } });
      if (url.endsWith('/me/player/play')) return response(204, {});
      throw new Error(`unexpected ${url}`);
    }
  });
  assert.match(await service.play('Midnight'), /Playing Midnight by Atlas/);
  assert.equal(calls[0].options.headers.authorization, 'Bearer token');
  assert.equal(JSON.parse(calls[1].options.body).uris[0], 'spotify:track:1');
});
