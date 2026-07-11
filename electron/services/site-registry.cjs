const SITE_DEFINITIONS = Object.freeze([
  { id: 'chatgpt', name: 'ChatGPT', aliases: ['chatgpt', 'chat gpt', 'the chatgpt website'], url: 'https://chatgpt.com' },
  { id: 'gmail', name: 'Gmail', aliases: ['gmail', 'google mail'], url: 'https://mail.google.com' },
  { id: 'drive', name: 'Google Drive', aliases: ['google drive', 'drive'], url: 'https://drive.google.com' },
  { id: 'calendar', name: 'Google Calendar', aliases: ['google calendar'], url: 'https://calendar.google.com' },
  { id: 'youtube', name: 'YouTube', aliases: ['youtube', 'you tube'], url: 'https://www.youtube.com', searchTemplate: 'https://www.youtube.com/results?search_query={query}' },
  { id: 'github', name: 'GitHub', aliases: ['github', 'git hub'], url: 'https://github.com', searchTemplate: 'https://github.com/search?q={query}' },
  { id: 'reddit', name: 'Reddit', aliases: ['reddit'], url: 'https://www.reddit.com' },
  { id: 'spotify', name: 'Spotify Web Player', aliases: ['spotify web', 'spotify web player'], url: 'https://open.spotify.com', searchTemplate: 'https://open.spotify.com/search/{query}' },
  { id: 'maps', name: 'Apple Maps', aliases: ['apple maps', 'maps'], url: 'https://maps.apple.com' },
  { id: 'wikipedia', name: 'Wikipedia', aliases: ['wikipedia'], url: 'https://www.wikipedia.org', searchTemplate: 'https://en.wikipedia.org/w/index.php?search={query}' }
]);

function normalizeRequestText(input) {
  let value = String(input || '').trim().replace(/[\s]+/g, ' ').replace(/[.?!]+$/g, '').trim();
  value = value.replace(/^(?:please\s+|jarvis[, ]+|hey jarvis[, ]+)/i, '');
  value = value.replace(/^(?:can|could|would|will) you (?:please )?/i, '');
  value = value.replace(/^i (?:want|need) you to /i, '');
  value = value.replace(/^open up\b/i, 'open');
  return value.trim();
}

function allSites(customSites = []) {
  const extras = (Array.isArray(customSites) ? customSites : []).filter(item => item && /^https:\/\//i.test(item.url || '')).map(item => ({
    id: String(item.id || item.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    name: String(item.name || item.url), aliases: [String(item.name || '')].concat(item.aliases || []).filter(Boolean), url: String(item.url), searchTemplate: item.searchTemplate || null
  }));
  return [...SITE_DEFINITIONS, ...extras];
}

function resolveSiteRequest(input, customSites = []) {
  const normalized = normalizeRequestText(input);
  if (/^(?:how|why|what|where|when|who)\b/i.test(normalized)) return null;
  const match = normalized.match(/^(?:open|launch|go to|show)\s+(?:the\s+)?(.+?)(?:\s+website|\s+site)?$/i);
  if (!match) return null;
  const target = match[1].trim().toLowerCase();
  if (/\bapp(?:lication)?$/.test(target)) return null;
  const site = allSites(customSites).find(item => item.aliases.some(alias => alias.toLowerCase() === target) || item.name.toLowerCase() === target);
  return site ? { capabilityId: 'openURL', parameters: { url: site.url }, confidence: .995, site } : null;
}

function searchURL(siteId, query, customSites = []) {
  const site = allSites(customSites).find(item => item.id === siteId);
  if (!site?.searchTemplate) return null;
  return site.searchTemplate.replace('{query}', encodeURIComponent(String(query || '')));
}

module.exports = { SITE_DEFINITIONS, normalizeRequestText, resolveSiteRequest, searchURL, allSites };
