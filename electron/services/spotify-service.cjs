const http = require('node:http');
const crypto = require('node:crypto');

const SCOPES = [
  'user-read-private', 'user-read-playback-state', 'user-read-currently-playing',
  'user-modify-playback-state', 'user-library-read', 'user-library-modify',
  'playlist-read-private', 'playlist-modify-private'
];

const base64url = buffer => buffer.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

class SpotifyService {
  constructor({ secretStore, shell, fetchImpl = fetch }) { this.secretStore = secretStore; this.shell = shell; this.fetch = fetchImpl; }

  async connect(clientId) {
    const id = String(clientId || '').trim();
    if (!/^[A-Za-z0-9]{16,64}$/.test(id)) throw new Error('Enter the Client ID from your Spotify developer app.');
    const verifier = base64url(crypto.randomBytes(64));
    const challenge = base64url(crypto.createHash('sha256').update(verifier).digest());
    const state = base64url(crypto.randomBytes(24));
    const callback = await this.#listenForCallback(state);
    const authorize = new URL('https://accounts.spotify.com/authorize');
    authorize.search = new URLSearchParams({ response_type: 'code', client_id: id, scope: SCOPES.join(' '), redirect_uri: callback.redirectURI, code_challenge_method: 'S256', code_challenge: challenge, state });
    await this.shell.openExternal(authorize.toString());
    let result;
    try { result = await callback.promise; } finally { callback.close(); }
    const token = await this.#tokenRequest(new URLSearchParams({ client_id: id, grant_type: 'authorization_code', code: result.code, redirect_uri: callback.redirectURI, code_verifier: verifier }));
    await this.#saveToken(token, id);
    return this.profile();
  }

  async #listenForCallback(expectedState) {
    let server; let timeout;
    let resolveCallback; let rejectCallback;
    const promise = new Promise((resolve, reject) => { resolveCallback = resolve; rejectCallback = reject; });
    server = http.createServer((request, response) => {
      const url = new URL(request.url, 'http://127.0.0.1');
      if (url.pathname !== '/callback') { response.writeHead(404).end('Not found'); return; }
      const error = url.searchParams.get('error'); const state = url.searchParams.get('state'); const code = url.searchParams.get('code');
      if (error || state !== expectedState || !code) {
        response.writeHead(400, { 'content-type': 'text/plain' }).end('Spotify connection failed. You may close this tab.');
        rejectCallback(new Error(error ? `Spotify authorization was denied: ${error}` : 'Spotify returned an invalid authorization response.'));
      } else {
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end('<!doctype html><title>Spotify connected</title><style>body{font:16px system-ui;background:#07111f;color:#dff6ff;display:grid;place-items:center;height:100vh}</style><main><h1>Spotify connected.</h1><p>You can close this tab and return to Jarvis.</p></main>');
        resolveCallback({ code });
      }
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Could not start the local Spotify callback.');
    timeout = setTimeout(() => rejectCallback(new Error('Spotify authorization timed out.')), 300_000);
    return { redirectURI: `http://127.0.0.1:${address.port}/callback`, promise, close: () => { clearTimeout(timeout); server.close(); } };
  }

  async #tokenRequest(parameters) {
    const response = await this.fetch('https://accounts.spotify.com/api/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: parameters });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error_description || body.error || `Spotify token request failed (${response.status}).`);
    return body;
  }

  async #saveToken(token, clientId) {
    await this.secretStore.set('spotify.accessToken', token.access_token);
    if (token.refresh_token) await this.secretStore.set('spotify.refreshToken', token.refresh_token);
    await this.secretStore.set('spotify.expiresAt', String(Date.now() + Math.max(60, Number(token.expires_in || 3600) - 60) * 1000));
    await this.secretStore.set('spotify.clientId', clientId);
  }

  async #accessToken() {
    const access = await this.secretStore.get('spotify.accessToken');
    const expires = Number(await this.secretStore.get('spotify.expiresAt') || 0);
    if (access && expires > Date.now()) return access;
    const refresh = await this.secretStore.get('spotify.refreshToken'); const clientId = await this.secretStore.get('spotify.clientId');
    if (!refresh || !clientId) throw new Error('Connect Spotify in Jarvis first.');
    const token = await this.#tokenRequest(new URLSearchParams({ client_id: clientId, grant_type: 'refresh_token', refresh_token: refresh }));
    await this.#saveToken(token, clientId); return token.access_token;
  }

  async #api(path, options = {}) {
    const token = await this.#accessToken();
    const response = await this.fetch(`https://api.spotify.com/v1${path}`, { ...options, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(options.headers || {}) } });
    if (response.status === 204) return null;
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401) { this.secretStore.remove('spotify.accessToken'); }
      const message = body.error?.message || `Spotify request failed (${response.status}).`;
      if (response.status === 403) throw new Error(`${message} Spotify Web API playback may require Premium.`);
      if (response.status === 404) throw new Error(`${message} Open Spotify on a playback device first.`);
      throw new Error(message);
    }
    return body;
  }

  async profile() { return this.#api('/me'); }
  async current() { return this.#api('/me/player/currently-playing'); }

  async search(query, types = 'track,album,artist,playlist,show,episode', limit = 8) {
    const params = new URLSearchParams({ q: String(query), type: types, limit: String(limit) });
    return this.#api(`/search?${params}`);
  }

  async play(query) {
    const result = await this.search(query, 'track,album,artist,playlist', 5);
    const item = result.tracks?.items?.[0] || result.albums?.items?.[0] || result.artists?.items?.[0] || result.playlists?.items?.find(Boolean);
    if (!item) throw new Error(`Spotify found no result for “${query}”.`);
    const body = item.type === 'track' ? { uris: [item.uri] } : { context_uri: item.uri };
    await this.#api('/me/player/play', { method: 'PUT', body: JSON.stringify(body) });
    return `Playing ${item.name}${item.artists?.length ? ` by ${item.artists.map(artist => artist.name).join(', ')}` : ''}.`;
  }

  async control(action) {
    const spec = { pause: ['PUT', '/me/player/pause'], resume: ['PUT', '/me/player/play'], next: ['POST', '/me/player/next'], previous: ['POST', '/me/player/previous'] }[action];
    if (!spec) throw new Error('Unsupported Spotify control.');
    await this.#api(spec[1], { method: spec[0] }); return `Spotify ${action} completed.`;
  }

  async createPrivatePlaylist(name, description = '') {
    const user = await this.profile();
    const playlist = await this.#api(`/users/${encodeURIComponent(user.id)}/playlists`, { method: 'POST', body: JSON.stringify({ name, description, public: false }) });
    return `Created private playlist “${playlist.name}”.`;
  }

  disconnect() {
    for (const key of ['spotify.accessToken', 'spotify.refreshToken', 'spotify.expiresAt', 'spotify.clientId']) this.secretStore.remove(key);
  }
}

module.exports = { SpotifyService, SCOPES };
