const DEFINITIONS = Object.freeze([
  { id: 'google', name: 'Google Workspace', short: 'GO', authKind: 'oauthPkce', features: ['gmail','calendar','drive','contacts','tasks'] },
  { id: 'spotify', name: 'Spotify', short: 'SP', authKind: 'oauthPkce', features: ['playback','library'] },
  { id: 'tavily', name: 'Tavily Search', short: 'TV', authKind: 'apiKey', features: ['research'] },
  { id: 'github', name: 'GitHub', short: 'GH', authKind: 'token', features: ['repositories','issues','pullRequests','workflows','notifications'] },
  { id: 'microsoft', name: 'Microsoft 365', short: 'MS', authKind: 'oauthPkce', features: ['mail','calendar','files','people','tasks'] },
  { id: 'notion', name: 'Notion', short: 'NO', authKind: 'token', features: ['pages','databases'] },
  { id: 'todoist', name: 'Todoist', short: 'TD', authKind: 'token', features: ['projects','tasks'] },
  { id: 'browser', name: 'Chrome Bridge', short: 'WEB', authKind: 'nativeHost', features: ['tabs','pages','forms'] },
  { id: 'native', name: 'Native Mac', short: 'MAC', authKind: 'systemPermission', features: ['speech','contacts','ocr','windows'] }
]);

const CAPABILITY_BINDINGS = Object.freeze({
  researchWeb: ['tavily'], openSearchResult: ['tavily'],
  searchEmail: ['google:gmail'], readEmailThread: ['google:gmail'], createEmailDraft: ['google:gmail'],
  searchDrive: ['google:drive'], searchGoogleContacts: ['google:contacts'], listGoogleTasks: ['google:tasks'], createGoogleTask: ['google:tasks'], completeGoogleTask: ['google:tasks'],
  githubSearchRepositories: ['github:repositories'], githubListIssues: ['github:issues'], githubCreateIssue: ['github:issues'],
  notionSearch: ['notion:pages'], notionCreatePage: ['notion:pages'],
  todoistListTasks: ['todoist:tasks'], todoistCreateTask: ['todoist:tasks'], todoistCompleteTask: ['todoist:tasks'],
  microsoftSearchMail: ['microsoft:mail'], microsoftListTasks: ['microsoft:tasks'], microsoftCreateTask: ['microsoft:tasks'],
  browserListTabs: ['browser:tabs'], browserReadPage: ['browser:pages'], browserClick: ['browser:forms'], browserFill: ['browser:forms'], submitWebForm: ['browser:forms']
});

class ConnectorRegistry {
  constructor({ store, secretStore }) { this.store = store; this.secretStore = secretStore; }
  definitions() { return DEFINITIONS.map(item => ({ ...item })); }
  records() { return this.store.snapshot().connections || []; }
  record(id) { return this.records().find(item => item.connectorId === id) || null; }
  upsert(connectorId, patch = {}) {
    const previous = this.record(connectorId); const now = new Date().toISOString();
    const value = { id: previous?.id || `connector-${connectorId}`, connectorId, accountLabel: '', grantedFeatures: [], grantedScopes: [], state: 'checking', lastCheckedAt: now, remediation: '', ...previous, ...patch, updatedAt: now };
    previous ? this.store.update('connections', previous.id, value) : this.store.add('connections', value); return value;
  }
  remove(connectorId) { const previous = this.record(connectorId); if (previous) this.store.remove('connections', previous.id); }
  available(capabilityId) {
    if (capabilityId === 'researchWeb') return true;
    const requirements = CAPABILITY_BINDINGS[capabilityId] || [];
    if (!requirements.length) return true;
    return requirements.some(requirement => { const [connectorId, feature] = requirement.split(':'); const record = this.record(connectorId); return record?.state === 'ready' && (!feature || record.grantedFeatures?.includes(feature)); });
  }
  availableCapabilityIds(ids) { return ids.filter(id => this.available(id)); }
}

module.exports = { ConnectorRegistry, CONNECTOR_DEFINITIONS: DEFINITIONS, CAPABILITY_BINDINGS };
