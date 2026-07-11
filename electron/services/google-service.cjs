const http = require('node:http');
const crypto = require('node:crypto');

const FEATURE_SCOPES = Object.freeze({
  profile: ['openid', 'email', 'profile'],
  gmail: ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.compose', 'https://www.googleapis.com/auth/gmail.send'],
  calendar: ['https://www.googleapis.com/auth/calendar.events'],
  drive: ['https://www.googleapis.com/auth/drive.metadata.readonly', 'https://www.googleapis.com/auth/drive.file'],
  contacts: ['https://www.googleapis.com/auth/contacts.readonly'],
  tasks: ['https://www.googleapis.com/auth/tasks']
});
const base64url = value => Buffer.from(value).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

class GoogleService {
  constructor({ secretStore, shell, fetchImpl = fetch }) { this.secretStore = secretStore; this.shell = shell; this.fetch = fetchImpl; }

  async connect(clientId, features = ['gmail', 'calendar', 'drive', 'contacts', 'tasks']) {
    const id = String(clientId || '').trim();
    if (!/^[A-Za-z0-9_.-]+\.apps\.googleusercontent\.com$/.test(id)) throw new Error('Enter a Google OAuth Desktop client ID.');
    const selected = [...new Set(['profile', ...features.filter(name => FEATURE_SCOPES[name])])];
    const scopes = [...new Set(selected.flatMap(name => FEATURE_SCOPES[name]))];
    const verifier = base64url(crypto.randomBytes(64)); const challenge = base64url(crypto.createHash('sha256').update(verifier).digest()); const state = base64url(crypto.randomBytes(24));
    const callback = await this.#callback(state);
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search = new URLSearchParams({ client_id: id, redirect_uri: callback.redirectURI, response_type: 'code', scope: scopes.join(' '), code_challenge: challenge, code_challenge_method: 'S256', access_type: 'offline', prompt: 'consent', state });
    await this.shell.openExternal(url.toString());
    let result; try { result = await callback.promise; } finally { callback.close(); }
    const token = await this.#token(new URLSearchParams({ client_id: id, code: result.code, code_verifier: verifier, grant_type: 'authorization_code', redirect_uri: callback.redirectURI }));
    await this.#save(token, id, selected); return this.profile();
  }

  async #callback(expectedState) {
    let resolveCallback; let rejectCallback; const promise = new Promise((resolve, reject) => { resolveCallback = resolve; rejectCallback = reject; });
    const server = http.createServer((request, response) => {
      const url = new URL(request.url, 'http://127.0.0.1'); if (url.pathname !== '/callback') return response.writeHead(404).end('Not found');
      const error = url.searchParams.get('error'); const code = url.searchParams.get('code'); const state = url.searchParams.get('state');
      if (error || !code || state !== expectedState) { response.writeHead(400, { 'content-type': 'text/plain' }).end('Google connection failed. You may close this tab.'); rejectCallback(new Error(error ? `Google authorization was denied: ${error}` : 'Google returned an invalid authorization response.')); }
      else { response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end('<!doctype html><title>Google connected</title><style>body{font:16px system-ui;background:#07111f;color:#dff6ff;display:grid;place-items:center;height:100vh}</style><main><h1>Google connected.</h1><p>You can close this tab and return to Jarvis.</p></main>'); resolveCallback({ code }); }
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const { port } = server.address(); const timeout = setTimeout(() => rejectCallback(new Error('Google authorization timed out.')), 300_000);
    return { redirectURI: `http://127.0.0.1:${port}/callback`, promise, close: () => { clearTimeout(timeout); server.close(); } };
  }

  async #token(parameters) {
    const response = await this.fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: parameters });
    const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error_description || body.error || `Google token request failed (${response.status}).`); return body;
  }

  async #save(token, clientId, features) {
    await this.secretStore.set('google.accessToken', token.access_token);
    if (token.refresh_token) await this.secretStore.set('google.refreshToken', token.refresh_token);
    await this.secretStore.set('google.expiresAt', String(Date.now() + Math.max(60, Number(token.expires_in || 3600) - 60) * 1000));
    await this.secretStore.set('google.clientId', clientId); await this.secretStore.set('google.features', JSON.stringify(features));
  }

  async #accessToken() {
    const access = await this.secretStore.get('google.accessToken'); const expires = Number(await this.secretStore.get('google.expiresAt') || 0);
    if (access && expires > Date.now()) return access;
    const refresh = await this.secretStore.get('google.refreshToken'); const clientId = await this.secretStore.get('google.clientId');
    if (!refresh || !clientId) throw new Error('Connect Google in Jarvis first.');
    const token = await this.#token(new URLSearchParams({ client_id: clientId, refresh_token: refresh, grant_type: 'refresh_token' }));
    await this.#save(token, clientId, JSON.parse(await this.secretStore.get('google.features') || '[]')); return token.access_token;
  }

  async #api(url, options = {}) {
    const token = await this.#accessToken();
    const response = await this.fetch(url, { ...options, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(options.headers || {}) } });
    const body = response.status === 204 ? null : await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401) this.secretStore.remove('google.accessToken');
      throw new Error(body?.error?.message || `Google request failed (${response.status}). Confirm that this API is enabled for your OAuth project.`);
    }
    return body;
  }

  profile() { return this.#api('https://www.googleapis.com/oauth2/v3/userinfo'); }

  async searchMail(query, limit = 8) {
    const list = await this.#api(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${new URLSearchParams({ q: query, maxResults: String(limit) })}`);
    const messages = await Promise.all((list.messages || []).slice(0, limit).map(item => this.#api(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${item.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`)));
    return messages.map(message => { const headers = Object.fromEntries((message.payload?.headers || []).map(header => [header.name.toLowerCase(), header.value])); return { id: message.id, subject: headers.subject || '(no subject)', from: headers.from || '', date: headers.date || '', snippet: message.snippet || '' }; });
  }

  async readMailThread(threadId) {
    const thread = await this.#api(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(threadId)}?format=full`);
    return { id: thread.id, messages: (thread.messages || []).map(message => { const headers = Object.fromEntries((message.payload?.headers || []).map(header => [header.name.toLowerCase(), header.value])); const parts = [message.payload, ...(message.payload?.parts || [])]; const bodyPart = parts.find(part => part.mimeType === 'text/plain' && part.body?.data); const body = bodyPart?.body?.data ? Buffer.from(bodyPart.body.data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8').slice(0, 20_000) : message.snippet || ''; return { id: message.id, from: headers.from || '', to: headers.to || '', subject: headers.subject || '', date: headers.date || '', body, attachments: parts.filter(part => part.filename).map(part => ({ name: part.filename, mimeType: part.mimeType, size: part.body?.size || 0 })) }; }) };
  }

  async createDraft(to, subject, body) {
    const raw = base64url(`To: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}`);
    const draft = await this.#api('https://gmail.googleapis.com/gmail/v1/users/me/drafts', { method: 'POST', body: JSON.stringify({ message: { raw } }) });
    return { id: draft.id, messageId: draft.message?.id, summary: `Gmail draft created for ${to}.` };
  }

  async sendMail(to, subject, body) {
    const raw = base64url(`To: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}`);
    await this.#api('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', { method: 'POST', body: JSON.stringify({ raw }) }); return `Email sent to ${to}.`;
  }

  async upcomingCalendar(days = 7) {
    const end = new Date(Date.now() + days * 86400000).toISOString();
    const result = await this.#api(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${new URLSearchParams({ timeMin: new Date().toISOString(), timeMax: end, singleEvents: 'true', orderBy: 'startTime', maxResults: '30' })}`);
    return (result.items || []).map(item => ({ id: item.id, title: item.summary || '(untitled)', start: item.start?.dateTime || item.start?.date, end: item.end?.dateTime || item.end?.date, link: item.htmlLink }));
  }

  async createCalendarEvent(title, start, end) {
    const result = await this.#api('https://www.googleapis.com/calendar/v3/calendars/primary/events', { method: 'POST', body: JSON.stringify({ summary: title, start: { dateTime: start }, end: { dateTime: end || new Date(new Date(start).getTime() + 3600000).toISOString() } }) });
    return `Saved “${result.summary}” to Google Calendar.`;
  }

  async updateCalendarEvent(id, patch) { const result = await this.#api(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) }); return `Updated “${result.summary || 'calendar event'}”.`; }
  async deleteCalendarEvent(id) { await this.#api(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(id)}`, { method: 'DELETE' }); return 'Google Calendar event deleted.'; }

  async searchDrive(query, limit = 20) {
    const escaped = String(query).replace(/['\\]/g, '\\$&');
    const params = new URLSearchParams({ q: `name contains '${escaped}' and trashed = false`, pageSize: String(limit), fields: 'files(id,name,mimeType,modifiedTime,webViewLink)' });
    return (await this.#api(`https://www.googleapis.com/drive/v3/files?${params}`)).files || [];
  }

  driveMetadata(id) { return this.#api(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?fields=id,name,mimeType,modifiedTime,size,webViewLink,webContentLink,owners(displayName,emailAddress)`); }

  async searchContacts(query, limit = 20) {
    const params = new URLSearchParams({ query: String(query), readMask: 'names,emailAddresses,phoneNumbers,organizations', pageSize: String(limit) });
    const result = await this.#api(`https://people.googleapis.com/v1/people:searchContacts?${params}`);
    return (result.results || []).map(item => ({ resourceName: item.person?.resourceName, name: item.person?.names?.[0]?.displayName || '', emails: (item.person?.emailAddresses || []).map(value => value.value), phones: (item.person?.phoneNumbers || []).map(value => value.value), organization: item.person?.organizations?.[0]?.name || '' }));
  }

  async #defaultTaskList() { const value = await this.#api('https://tasks.googleapis.com/tasks/v1/users/@me/lists?maxResults=20'); const list = (value.items || [])[0]; if (!list) throw new Error('Google Tasks has no task list.'); return list; }
  async listTasks(showCompleted = false) { const list = await this.#defaultTaskList(); const value = await this.#api(`https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(list.id)}/tasks?${new URLSearchParams({ showCompleted: String(Boolean(showCompleted)), showHidden: String(Boolean(showCompleted)), maxResults: '100' })}`); return (value.items || []).map(item => ({ ...item, taskListId: list.id, taskListTitle: list.title })); }
  async createTask(title, due = null) { const list = await this.#defaultTaskList(); return this.#api(`https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(list.id)}/tasks`, { method: 'POST', body: JSON.stringify({ title, ...(due ? { due } : {}) }) }); }
  async updateTask(taskListId, id, patch) { return this.#api(`https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(taskListId)}/tasks/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) }); }
  async deleteTask(taskListId, id) { await this.#api(`https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(taskListId)}/tasks/${encodeURIComponent(id)}`, { method: 'DELETE' }); return 'Google task deleted.'; }

  disconnect() { for (const key of ['google.accessToken', 'google.refreshToken', 'google.expiresAt', 'google.clientId', 'google.features']) this.secretStore.remove(key); }
}

module.exports = { GoogleService, FEATURE_SCOPES };
