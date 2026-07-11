const crypto = require('node:crypto');

class WebSearchService {
  constructor({ secretStore, fetchImpl = fetch }) { this.secretStore = secretStore; this.fetch = fetchImpl; this.cooldownUntil = 0; }

  async search(query, options = {}) {
    const q = String(query || '').trim().slice(0, 500);
    if (!q) throw new Error('Enter something to research.');
    const key = await this.secretStore.get('connector.tavily.token');
    if (!key) return { provider: 'browser', query: q, results: [], fallbackURL: `https://www.google.com/search?q=${encodeURIComponent(q)}`, retrievedAt: new Date().toISOString(), untrusted: true };
    if (Date.now() < this.cooldownUntil) { const error = new Error('Tavily is cooling down after reaching its free quota. Browser search is still available.'); error.code = 'QUOTA_COOLDOWN'; throw error; }
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await this.fetch('https://api.tavily.com/search', { method: 'POST', signal: controller.signal, headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify({ query: q, search_depth: options.depth === 'advanced' ? 'advanced' : 'basic', max_results: Math.min(10, Math.max(1, Number(options.limit || 6))), include_answer: false, include_raw_content: false }) });
      const body = await response.json().catch(() => ({}));
      if (response.status === 401 || response.status === 403) { const error = new Error('Tavily rejected this API key. Reconnect it in Connections.'); error.code = 'AUTHENTICATION_FAILED'; throw error; }
      if (response.status === 429) { this.cooldownUntil = Date.now() + 15 * 60_000; const error = new Error('Tavily’s free quota is temporarily exhausted.'); error.code = 'QUOTA_EXHAUSTED'; throw error; }
      if (!response.ok) throw new Error(`Tavily search failed (${response.status}).`);
      const retrievedAt = new Date().toISOString();
      const results = (body.results || []).slice(0, 10).filter(item => /^https:\/\//i.test(item.url || '')).map((item, index) => ({ id: crypto.randomUUID(), citationId: `S${index + 1}`, title: String(item.title || 'Untitled').slice(0, 300), url: String(item.url), snippet: String(item.content || '').slice(0, 1_500), score: Number(item.score || 0), provider: 'tavily', retrievedAt, untrusted: true }));
      return { provider: 'tavily', query: q, results, retrievedAt, untrusted: true };
    } catch (error) {
      if (error.name === 'AbortError') { const timeoutError = new Error('Tavily search timed out.'); timeoutError.code = 'TIMEOUT'; throw timeoutError; }
      throw error;
    } finally { clearTimeout(timeout); }
  }

  async health() {
    const connected = this.secretStore.has('connector.tavily.token');
    const confirmed = this.secretStore.has('connector.tavily.freeConfirmed');
    const coolingDown = Date.now() < this.cooldownUntil;
    const state = !connected || !confirmed ? 'needsSetup' : coolingDown ? 'degraded' : 'ready';
    const summary = !connected ? 'Tavily is optional and not connected.' : !confirmed ? 'Confirm that this key is on Tavily’s free plan before using it.' : coolingDown ? 'Tavily is connected but cooling down.' : 'Tavily grounded search is connected.';
    return { state, summary, remediation: connected && !confirmed ? 'Reconnect Tavily and confirm the free plan.' : '', metadata: { freePlanConfirmed: confirmed, cooldownUntil: this.cooldownUntil || null } };
  }
}

module.exports = { WebSearchService };
