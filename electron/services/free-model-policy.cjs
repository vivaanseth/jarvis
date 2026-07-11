const FREE_MODEL_SOURCES = Object.freeze({
  gemini: 'https://ai.google.dev/gemini-api/docs/pricing',
  groq: 'https://console.groq.com/docs/rate-limits',
  mistral: 'https://docs.mistral.ai/getting-started/quickstarts/studio/activate-and-generate-api-key',
  nvidia: 'https://docs.api.nvidia.com/nim/re/docs/run-anywhere',
  openrouter: 'https://openrouter.ai/docs/cookbook/get-started/free-models-router-playground',
  ollama: 'local',
  lmstudio: 'local'
});

const VERIFIED_FREE_MODELS = Object.freeze({
  gemini: Object.freeze(['gemini-3.5-flash', 'gemini-3.1-flash-lite']),
  groq: Object.freeze([
    'llama-3.1-8b-instant',
    'llama-3.3-70b-versatile',
    'openai/gpt-oss-120b',
    'openai/gpt-oss-20b',
    'qwen/qwen3-32b',
    'qwen/qwen3.6-27b',
    'meta-llama/llama-4-scout-17b-16e-instruct',
    'groq/compound',
    'groq/compound-mini'
  ]),
  mistral: Object.freeze(['mistral-small-latest']),
  nvidia: Object.freeze([]),
  openrouter: Object.freeze(['openrouter/free']),
  ollama: Object.freeze([]),
  lmstudio: Object.freeze([])
});

const DEFAULT_TASK_ROUTES = Object.freeze({
  quick: Object.freeze({ enabled: true, provider: 'ollama', model: 'qwen2.5:1.5b', baseURL: 'http://127.0.0.1:11434', fallbackPolicy: 'waterfall' }),
  heavy: Object.freeze({ enabled: true, provider: 'gemini', model: 'gemini-3.5-flash', baseURL: '', fallbackPolicy: 'waterfall' }),
  coding: Object.freeze({ enabled: true, provider: 'groq', model: 'openai/gpt-oss-120b', baseURL: '', fallbackPolicy: 'waterfall' }),
  research: Object.freeze({ enabled: true, provider: 'gemini', model: 'gemini-3.5-flash', baseURL: '', fallbackPolicy: 'waterfall' }),
  writing: Object.freeze({ enabled: true, provider: 'mistral', model: 'mistral-small-latest', baseURL: '', fallbackPolicy: 'waterfall' }),
  summarize: Object.freeze({ enabled: true, provider: 'ollama', model: 'qwen2.5:1.5b', baseURL: 'http://127.0.0.1:11434', fallbackPolicy: 'waterfall' }),
  actionPlan: Object.freeze({ enabled: true, provider: 'gemini', model: 'gemini-3.1-flash-lite', baseURL: '', fallbackPolicy: 'waterfall' })
});

const DEFAULT_FREE_WATERFALL = Object.freeze([
  Object.freeze({ id: 'free-gemini-balanced', provider: 'gemini', model: 'gemini-3.5-flash', baseURL: '', enabled: true }),
  Object.freeze({ id: 'free-groq-balanced', provider: 'groq', model: 'llama-3.3-70b-versatile', baseURL: '', enabled: true }),
  Object.freeze({ id: 'free-mistral-small', provider: 'mistral', model: 'mistral-small-latest', baseURL: '', enabled: true }),
  Object.freeze({ id: 'free-openrouter-router', provider: 'openrouter', model: 'openrouter/free', baseURL: '', enabled: true })
]);

function zeroPrice(value) {
  const number = Number(value);
  return value != null && Number.isFinite(number) && number === 0;
}

function registryAllows(provider, model, catalogEntry = null) {
  if (provider === 'ollama' || provider === 'lmstudio') return true;
  if (provider === 'mistral') return Boolean(VERIFIED_FREE_MODELS.mistral.includes(model) || (model && catalogEntry));
  if (provider === 'nvidia') return Boolean(model && catalogEntry);
  if (provider === 'openrouter') {
    if (model === 'openrouter/free') return true;
    return Boolean(catalogEntry?.free && zeroPrice(catalogEntry?.pricing?.prompt) && zeroPrice(catalogEntry?.pricing?.completion));
  }
  return Boolean(VERIFIED_FREE_MODELS[provider]?.includes(model));
}

function freeModelStatus(provider, model, catalog = null) {
  const source = FREE_MODEL_SOURCES[provider] || '';
  if (provider === 'openaiCompatible') return { verified: false, source, reason: 'Custom cloud endpoints cannot be verified as zero-cost.' };
  const catalogEntry = Array.isArray(catalog) ? catalog.find(item => (typeof item === 'string' ? item : item?.id) === model) : null;
  if (!registryAllows(provider, model, catalogEntry)) return { verified: false, source, reason: `${model || 'This model'} is not in Jarvis’s verified-free registry.` };
  if (['ollama','lmstudio'].includes(provider) || (provider === 'openrouter' && model === 'openrouter/free')) return { verified: true, source, reason: ['ollama','lmstudio'].includes(provider) ? 'Runs locally.' : 'OpenRouter’s official zero-cost router.' };
  if (!Array.isArray(catalog)) return { verified: false, source, reason: 'Load this provider’s live model catalog to verify availability.' };
  const entry = catalogEntry;
  if (!entry) return { verified: false, source, reason: 'This verified-free model is not present in the provider’s live catalog.' };
  if (provider === 'openrouter' && !registryAllows(provider, model, entry)) return { verified: false, source, reason: 'OpenRouter reports a non-zero price for this model.' };
  return { verified: true, source, reason: provider === 'mistral' ? 'Available in the live catalog for a user-confirmed Mistral Free mode workspace.' : 'Verified free and currently available.' };
}

function cloneTaskDefaults() { return Object.fromEntries(Object.entries(DEFAULT_TASK_ROUTES).map(([id, route]) => [id, { ...route }])); }
function cloneWaterfallDefaults() { return DEFAULT_FREE_WATERFALL.map(route => ({ ...route })); }
function confirmedCredentialSlots(storedSlots = [], confirmations = []) { return storedSlots.map((stored, index) => Boolean(stored && confirmations[index] === true)); }
function reconcileProviderRoutes(provider, waterfall = [], taskRoutes = {}, catalog = null) {
  let changed = false;
  const reconcile = entry => {
    if (!entry || entry.provider !== provider || entry.enabled === false || freeModelStatus(provider, entry.model, catalog).verified) return entry;
    changed = true;
    return { ...entry, enabled: false, disabledReason: 'No longer available in the verified-free catalog.' };
  };
  const nextWaterfall = waterfall.map(reconcile);
  const nextTaskRoutes = Object.fromEntries(Object.entries(taskRoutes).map(([profile, entry]) => [profile, reconcile(entry)]));
  return { changed, waterfall: nextWaterfall, taskRoutes: nextTaskRoutes };
}

module.exports = {
  FREE_MODEL_SOURCES,
  VERIFIED_FREE_MODELS,
  DEFAULT_TASK_ROUTES,
  DEFAULT_FREE_WATERFALL,
  registryAllows,
  freeModelStatus,
  confirmedCredentialSlots,
  reconcileProviderRoutes,
  cloneTaskDefaults,
  cloneWaterfallDefaults
};
