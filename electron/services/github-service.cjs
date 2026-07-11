class GitHubService {
  constructor({ secretStore, fetchImpl = fetch }) { this.secretStore = secretStore; this.fetch = fetchImpl; }
  async connect(token) { await this.secretStore.set('connector.github.token', String(token || '').trim()); const profile = await this.request('/user'); return { accountLabel: profile.login, features: ['repositories','issues','pullRequests','workflows','notifications'] }; }
  async request(endpoint, options = {}) { const token = await this.secretStore.get('connector.github.token'); if (!token) throw new Error('Connect GitHub first.'); const response = await this.fetch(`https://api.github.com${endpoint}`, { ...options, headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'content-type': 'application/json', ...(options.headers || {}) } }); const body = response.status === 204 ? null : await response.json().catch(() => ({})); if (!response.ok) throw new Error(body?.message || `GitHub request failed (${response.status}).`); return body; }
  searchRepositories(query) { return this.request(`/search/repositories?${new URLSearchParams({ q: query, per_page: '10' })}`).then(value => value.items || []); }
  listIssues(repository, state = 'open') { return this.request(`/repos/${repository}/issues?${new URLSearchParams({ state, per_page: '20' })}`); }
  createIssue(repository, title, body = '') { return this.request(`/repos/${repository}/issues`, { method: 'POST', body: JSON.stringify({ title, body }) }); }
  disconnect() { this.secretStore.remove('connector.github.token'); }
}

module.exports = { GitHubService };
