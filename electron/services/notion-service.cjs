class NotionService {
  constructor({ secretStore, fetchImpl = fetch }) { this.secretStore = secretStore; this.fetch = fetchImpl; }
  async connect(token) { await this.secretStore.set('connector.notion.token', String(token || '').trim()); const profile = await this.request('/users/me'); return { accountLabel: profile.name || profile.bot?.owner?.user?.name || 'Notion integration', features: ['pages','databases'] }; }
  async request(endpoint, options = {}) { const token = await this.secretStore.get('connector.notion.token'); if (!token) throw new Error('Connect Notion first.'); const response = await this.fetch(`https://api.notion.com/v1${endpoint}`, { ...options, headers: { authorization: `Bearer ${token}`, 'notion-version': '2026-03-11', 'content-type': 'application/json', ...(options.headers || {}) } }); const body = response.status === 204 ? null : await response.json().catch(() => ({})); if (!response.ok) throw new Error(body?.message || `Notion request failed (${response.status}).`); return body; }
  search(query) { return this.request('/search', { method: 'POST', body: JSON.stringify({ query, page_size: 20, sort: { direction: 'descending', timestamp: 'last_edited_time' } }) }).then(value => value.results || []); }
  createPage(parentId, title, content = '') { return this.request('/pages', { method: 'POST', body: JSON.stringify({ parent: { page_id: parentId }, properties: { title: { title: [{ text: { content: title } }] } }, children: content ? [{ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content } }] } }] : [] }) }); }
  disconnect() { this.secretStore.remove('connector.notion.token'); }
}

module.exports = { NotionService };
