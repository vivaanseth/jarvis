class TodoistService {
  constructor({ secretStore, fetchImpl = fetch }) { this.secretStore = secretStore; this.fetch = fetchImpl; }
  async connect(token) { await this.secretStore.set('connector.todoist.token', String(token || '').trim()); await this.request('/projects'); return { accountLabel: 'Todoist', features: ['projects','tasks'] }; }
  async request(endpoint, options = {}) { const token = await this.secretStore.get('connector.todoist.token'); if (!token) throw new Error('Connect Todoist first.'); const response = await this.fetch(`https://api.todoist.com/rest/v1${endpoint}`, { ...options, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(options.headers || {}) } }); const body = response.status === 204 ? null : await response.json().catch(() => ({})); if (!response.ok) throw new Error(body?.error || body?.error_tag || `Todoist request failed (${response.status}).`); return body; }
  listTasks(projectId = '') { return this.request(`/tasks${projectId ? `?project_id=${encodeURIComponent(projectId)}` : ''}`).then(value => Array.isArray(value) ? value : value?.results || []); }
  createTask(content, options = {}) { return this.request('/tasks', { method: 'POST', body: JSON.stringify({ content, ...(options.projectId ? { project_id: options.projectId } : {}), ...(options.dueString ? { due_string: options.dueString } : {}) }) }); }
  completeTask(id) { return this.request(`/tasks/${encodeURIComponent(id)}/close`, { method: 'POST' }); }
  disconnect() { this.secretStore.remove('connector.todoist.token'); }
}

module.exports = { TodoistService };
