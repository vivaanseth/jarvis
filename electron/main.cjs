const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, dialog, shell, clipboard, Notification, screen, nativeImage, safeStorage, powerMonitor } = require('electron');
const { Store } = require('./services/store.cjs');
const { SecretStore } = require('./services/secret-store.cjs');
const { askAI, askAIStream, planAI, listModels, DEFAULT_MODELS, PROVIDERS } = require('./services/ai-service.cjs');
const { TASK_PROFILES, selectAIRoute } = require('./services/ai-routing.cjs');
const { freeModelStatus, cloneTaskDefaults, cloneWaterfallDefaults, confirmedCredentialSlots, reconcileProviderRoutes } = require('./services/free-model-policy.cjs');
const { CapabilityRegistry } = require('./services/capability-registry.cjs');
const { maxRisk, requiresConfirmation } = require('./services/safety-policy.cjs');
const { parseCommand, preview } = require('./services/command-engine.cjs');
const { executeNative, canonical } = require('./services/native-actions.cjs');
const { nearestAnchor } = require('./services/orb-placement.cjs');
const { ActionCoordinator } = require('./services/action-coordinator.cjs');
const { calculate, weather } = require('./services/local-information.cjs');
const { SpotifyService } = require('./services/spotify-service.cjs');
const { AppleAutomationService } = require('./services/apple-automation.cjs');
const { BrowserBridge } = require('./services/browser-bridge.cjs');
const { GoogleService } = require('./services/google-service.cjs');
const { NativeBridgeClient } = require('./services/native-bridge.cjs');
const { RoutineScheduler } = require('./services/scheduler.cjs');
const { LocalResourceMonitor } = require('./services/local-resource-monitor.cjs');
const { AttachmentService } = require('./services/attachment-service.cjs');
const { WhisperService } = require('./services/whisper-service.cjs');
const { DiagnosticsService } = require('./services/diagnostics.cjs');
const { StructuredLogger } = require('./services/logger.cjs');
const { classifyRequestDisposition } = require('./services/request-disposition.cjs');
const { requestDisposition: normalizeRequestDisposition, requestInput: normalizeRequestInput } = require('./services/contracts.cjs');
const { resolveSiteRequest } = require('./services/site-registry.cjs');
const { WebSearchService } = require('./services/web-search-service.cjs');
const { ConnectorRegistry } = require('./services/connector-registry.cjs');
const { ConnectorHealthSupervisor } = require('./services/connector-health-supervisor.cjs');
const { GitHubService } = require('./services/github-service.cjs');
const { MicrosoftService } = require('./services/microsoft-service.cjs');
const { NotionService } = require('./services/notion-service.cjs');
const { TodoistService } = require('./services/todoist-service.cjs');
const execFileAsync = promisify(execFile);

app.name = 'Jarvis';
if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

let store; let secretStore; let spotifyService; let googleService; let webSearchService; let githubService; let microsoftService; let notionService; let todoistService; let connectorRegistry; let connectorHealthSupervisor; let appleAutomation; let browserBridge; let nativeBridge; let routineScheduler; let attachmentService; let whisperService; let diagnosticsService; let logger; let mainWindow; let orbWindow; let tray; let timerInterval; let sessionActivity = []; const sessionAttachments = new Map(); const attachmentCloudApprovals = new Set(); let orbMode = 'collapsed'; let orbDragging = false; let orbMouseCandidate = null; let orbFocusFallbackArmed = false; let lastOrbAnchor = null; let activeConversationId = null; let activeAIController = null; let voiceListening = false; let voiceTarget = 'orb'; let voiceBackend = 'unavailable'; let whisperRecording = false; let ollamaStatus = { available: false, hasRecommendedModel: false, models: [], checkedAt: null, error: 'Not checked yet.' }; let lastAIRouteStatus = null; let lastDiagnosticReport = null; let nativePermissionStatus = {}; let nativeSpeechCapabilities = {}; let lastResearch = null; let currentActionProgress = null;
const routineCoordinator = new ActionCoordinator();
const capabilityRegistry = new CapabilityRegistry();
const localResourceMonitor = new LocalResourceMonitor();
const pendingPlans = new Map();
const AI_CAPABILITIES = ['openApp','openFolder','findFiles','readTextFile','writeTextFile','moveFile','renameFile','duplicateFile','revealFile','readClipboard','copyToClipboard','calculate','searchWeb','researchWeb','openSearchResult','openURL','openDirections','getWeather','searchSpotify','spotifyPlay','spotifyPause','spotifyResume','spotifyNext','spotifyPrevious','startTimer','showNotification','searchContacts','createReminder','createCalendarEvent','sendEmail','sendMessage','saveMemory','recallMemory','createNote','runShortcut','listShortcuts','searchEmail','readEmailThread','createEmailDraft','searchDrive','searchGoogleContacts','listGoogleTasks','createGoogleTask','updateGoogleTask','deleteGoogleTask','browserListTabs','browserOpenTab','browserActivateTab','browserCloseTab','browserMoveTab','browserPinTab','browserMuteTab','browserReadPage','browserClick','browserFill','submitWebForm','getFrontAppContext','readScreenText','inspectTrash','createLocalTask','listLocalTasks','completeLocalTask','githubSearchRepositories','githubListIssues','githubCreateIssue','notionSearch','notionCreatePage','todoistListTasks','todoistCreateTask','todoistCompleteTask','microsoftSearchMail','microsoftListTasks','microsoftCreateTask','minimizeWindow','maximizeWindow','closeWindow','gitStatus','gitLog','runDeveloperCommand','applyCodePatch'];
const rendererPath = file => path.join(__dirname, 'renderer', file);
const ORB_SIZE = 76;
const ORB_MARGIN = 16;
const PACKAGED_RUNTIME = app.isPackaged || fs.existsSync(path.join(process.resourcesPath || '', 'app', 'package.json'));
const baseHandle = ipcMain.handle.bind(ipcMain);
const baseOn = ipcMain.on.bind(ipcMain);

function assertTrustedSender(event) {
  const senderId = event?.sender?.id;
  const allowedIds = [mainWindow?.webContents?.id, orbWindow?.webContents?.id].filter(Boolean);
  if (!allowedIds.includes(senderId)) throw new Error('IPC request rejected: untrusted renderer.');
  const senderURL = String(event.senderFrame?.url || event.sender?.getURL?.() || '');
  let parsed;
  try { parsed = new URL(senderURL); } catch { throw new Error('IPC request rejected: invalid renderer URL.'); }
  if (parsed.protocol !== 'file:' || path.dirname(decodeURIComponent(parsed.pathname)) !== path.join(__dirname, 'renderer')) throw new Error('IPC request rejected: renderer origin is not trusted.');
}

function trustedHandle(channel, listener) { baseHandle(channel, (event, ...args) => { assertTrustedSender(event); return listener(event, ...args); }); }
function trustedOn(channel, listener) { baseOn(channel, (event, ...args) => { assertTrustedSender(event); return listener(event, ...args); }); }

async function applicationSignatureHealth() {
  if (process.platform !== 'darwin') return { state: 'degraded', summary: `Jarvis is running on ${process.platform}. macOS code-signature checks do not apply.`, remediation: 'Use the signed installer published for this platform when available.', metadata: { packaged: PACKAGED_RUNTIME, platform: process.platform } };
  if (!PACKAGED_RUNTIME) return { state: 'degraded', summary: 'Jarvis is running in developer mode.', remediation: 'Install the signed build into /Applications for stable permissions.', metadata: { packaged: false } };
  const bundle = path.dirname(path.dirname(path.dirname(process.execPath)));
  try {
    await execFileAsync('/usr/bin/codesign', ['--verify', '--deep', '--strict', bundle], { timeout: 15_000, maxBuffer: 64_000 });
    const details = await execFileAsync('/usr/bin/codesign', ['-dv', '--verbose=2', bundle], { timeout: 15_000, maxBuffer: 64_000 }).catch(error => ({ stderr: error.stderr || '' }));
    const team = String(details.stderr || '').match(/TeamIdentifier=(.+)/)?.[1]?.trim() || null;
    const installed = bundle.startsWith('/Applications/'); const stable = installed && team && team !== 'not set';
    return { state: stable ? 'ready' : 'degraded', summary: stable ? 'Installed application signature is valid and stable.' : !installed ? 'The bundle is valid but is running outside /Applications.' : 'Application signature is valid for development but has no Personal Team identity.', remediation: !installed ? 'Run script/install_local.sh.' : 'Sign into Xcode and configure .jarvis-signing.env before the final install.', metadata: { packaged: true, installed, teamIdentifier: team || 'none' } };
  } catch (error) { return { state: 'unavailable', summary: 'Application signature verification failed.', remediation: 'Rebuild Jarvis with script/package_electron.sh.', metadata: { packaged: true } }; }
}

function storedAIRoute(state = store.snapshot()) {
  const configured = Array.isArray(state.preferences.aiWaterfall) ? state.preferences.aiWaterfall : [];
  if (configured.length) return configured;
  const provider = state.preferences.aiProvider;
  if (!PROVIDERS[provider]) return [];
  return [{ id: crypto.randomUUID(), provider, model: state.preferences.aiModel || DEFAULT_MODELS[provider] || '', baseURL: state.preferences.aiBaseURL || '', enabled: true }];
}

function catalogFor(provider, state = store.snapshot()) {
  return Array.isArray(state.preferences.aiFreeCatalogs?.[provider]?.models) ? state.preferences.aiFreeCatalogs[provider].models : null;
}

function routeFreeStatus(entry, state = store.snapshot()) {
  if (entry?.provider === 'mistral' && state.preferences.aiFreeTierConfirmations?.mistral !== true) return { verified: false, source: 'https://docs.mistral.ai/getting-started/quickstarts/studio/activate-and-generate-api-key', reason: 'Confirm that this key belongs to a Mistral Free mode workspace with no Scale billing.' };
  if (entry?.provider === 'mistral') {
    const checkedAt = Date.parse(state.preferences.aiFreeCatalogs?.mistral?.checkedAt || '');
    if (!Number.isFinite(checkedAt) || Date.now() - checkedAt > 7 * 24 * 60 * 60_000) return { verified: false, source: 'https://docs.mistral.ai/getting-started/quickstarts/studio/activate-and-generate-api-key', reason: 'Reload Mistral’s live model catalog; free availability verification expires after seven days.' };
  }
  if (entry?.provider === 'nvidia' && state.preferences.aiFreeTierConfirmations?.nvidia !== true) return { verified: false, source: 'https://docs.api.nvidia.com/nim/re/docs/run-anywhere', reason: 'Confirm NVIDIA Developer Program use for free prototyping before enabling this route.' };
  if (entry?.provider === 'nvidia') { const checkedAt = Date.parse(state.preferences.aiFreeCatalogs?.nvidia?.checkedAt || ''); if (!Number.isFinite(checkedAt) || Date.now() - checkedAt > 7 * 24 * 60 * 60_000) return { verified: false, source: 'https://docs.api.nvidia.com/nim/re/docs/run-anywhere', reason: 'Reload NVIDIA’s live model catalog; developer-access verification expires after seven days.' }; }
  return freeModelStatus(entry?.provider, entry?.model, catalogFor(entry?.provider, state));
}

function providerStoredKeyCount(provider, state = store.snapshot()) {
  if (['ollama','lmstudio'].includes(provider)) return 1;
  if (provider === 'gemini') {
    const pooled = Array.from({ length: 5 }, (_, index) => secretStore?.has(`ai.key.gemini.${index}`)).filter(Boolean).length;
    if (pooled) return pooled;
  }
  return secretStore?.has(`ai.key.${provider}`) || (state.preferences.aiProvider === provider && secretStore?.has('ai.apiKey')) ? 1 : 0;
}

function providerKeyCount(provider, state = store.snapshot()) {
  if (['ollama','lmstudio'].includes(provider)) return 1;
  if (provider === 'gemini') return confirmedCredentialSlots(Array.from({ length: 5 }, (_, index) => secretStore?.has(`ai.key.gemini.${index}`)), state.preferences.aiFreeTierConfirmations?.gemini).filter(Boolean).length;
  if (['groq', 'mistral', 'nvidia'].includes(provider) && state.preferences.aiFreeTierConfirmations?.[provider] !== true) return 0;
  return providerStoredKeyCount(provider, state);
}

function hasAIKey(provider, state = store.snapshot()) {
  return providerKeyCount(provider, state) > 0;
}

async function refreshOllamaStatus() {
  try {
    const models = await listModels({ provider: 'ollama', key: null, baseURL: 'http://127.0.0.1:11434' });
    ollamaStatus = { available: true, hasRecommendedModel: models.some(item => item.id === 'qwen2.5:1.5b' || item.id.startsWith('qwen2.5:1.5b-')), models: models.map(item => item.id).slice(0, 30), checkedAt: new Date().toISOString(), error: null };
  } catch (error) { ollamaStatus = { available: false, hasRecommendedModel: false, models: [], checkedAt: new Date().toISOString(), error: error.message }; }
  return ollamaStatus;
}

async function providerKeys(provider, state = store.snapshot()) {
  if (['ollama','lmstudio'].includes(provider)) return [];
  if (provider === 'gemini') {
    const keys = [];
    const eligible = confirmedCredentialSlots(Array.from({ length: 5 }, (_, index) => secretStore?.has(`ai.key.gemini.${index}`)), state.preferences.aiFreeTierConfirmations?.gemini);
    for (let index = 0; index < 5; index += 1) { const key = eligible[index] ? await secretStore.get(`ai.key.gemini.${index}`) : null; if (key) keys.push(key); }
    if (keys.length) return keys;
  }
  if (['groq', 'mistral', 'nvidia'].includes(provider) && state.preferences.aiFreeTierConfirmations?.[provider] !== true) return [];
  const key = await secretStore.get(`ai.key.${provider}`) || (state.preferences.aiProvider === provider ? await secretStore.get('ai.apiKey') : null);
  return key ? [key] : [];
}

function hasAIRoute(state = store.snapshot()) {
  const taskRoutes = Object.values(state.preferences.aiTaskRoutes || {});
  return [...storedAIRoute(state), ...taskRoutes].some(entry => entry?.enabled !== false && PROVIDERS[entry?.provider] && routeFreeStatus(entry, state).verified && hasAIKey(entry.provider, state));
}

async function hydratedAIRoute(state = store.snapshot()) {
  const route = [];
  for (const entry of storedAIRoute(state)) {
    const keys = await providerKeys(entry.provider, state);
    route.push({ ...entry, key: keys[0] || null, keys });
  }
  return route;
}

async function routedAIRequest(text, state = store.snapshot()) {
  const verifiedWaterfall = storedAIRoute(state).filter(entry => routeFreeStatus(entry, state).verified);
  const verifiedTasks = Object.fromEntries(Object.entries(state.preferences.aiTaskRoutes || {}).map(([profile, entry]) => [profile, { ...entry, enabled: entry?.enabled === true && routeFreeStatus(entry, state).verified }]));
  const selected = selectAIRoute(text, verifiedTasks, verifiedWaterfall);
  const hydrated = [];
  for (const entry of selected.route) {
    const keys = await providerKeys(entry.provider, state);
    if (!keys.length && !['ollama','lmstudio'].includes(entry.provider)) continue;
    hydrated.push({ ...entry, key: keys[0] || null, keys });
  }
  const directAvailable = selected.override && hydrated[0]?.taskProfile === selected.profile;
  return { ...selected, override: directAvailable, route: hydrated };
}

function disableUnavailableRoutes(error) {
  const unavailable = (error?.attempts || []).filter(item => Number(item.status) === 404 || /model_(?:not_found|unavailable)|MODEL_NOT_FOUND/i.test(String(item.code || '')));
  if (!unavailable.length) return false;
  const state = store.snapshot();
  const matches = entry => unavailable.some(item => item.provider === entry.provider && item.model === entry.model);
  const aiWaterfall = storedAIRoute(state).map(entry => matches(entry) ? { ...entry, enabled: false, disabledReason: 'No longer available in the verified-free catalog.' } : entry);
  const aiTaskRoutes = Object.fromEntries(Object.entries(state.preferences.aiTaskRoutes || {}).map(([profile, entry]) => [profile, matches(entry) ? { ...entry, enabled: false, disabledReason: 'No longer available in the verified-free catalog.' } : entry]));
  store.updatePreferences({ aiWaterfall, aiTaskRoutes });
  return true;
}

function reconcileProviderFreeRoutes(provider) {
  const state = store.snapshot();
  const reconciled = reconcileProviderRoutes(provider, storedAIRoute(state), state.preferences.aiTaskRoutes, catalogFor(provider, state));
  const aiWaterfall = reconciled.waterfall;
  const aiTaskRoutes = reconciled.taskRoutes;
  if (reconciled.changed) store.updatePreferences({ aiWaterfall, aiTaskRoutes });
  return reconciled.changed;
}

function safeAIRoute(state = store.snapshot()) {
  return storedAIRoute(state).map(entry => { const freeStatus = routeFreeStatus(entry, state); return { ...entry, credentialSaved: hasAIKey(entry.provider, state), freeStatus }; });
}

function requireVerifiedFree(entry, state, label) {
  const status = routeFreeStatus(entry, state);
  if (!status.verified) throw new Error(`${label} is blocked by Free-Only Lock: ${status.reason}`);
  return status;
}

function sanitizeAIRoute(input, state = store.snapshot()) {
  if (!Array.isArray(input)) throw new Error('The AI waterfall must be an ordered list.');
  return input.slice(0, 24).map((source, index) => {
    const provider = String(source?.provider || '');
    if (!PROVIDERS[provider]) throw new Error(`AI route ${index + 1} has an unsupported provider.`);
    const model = String(source?.model || DEFAULT_MODELS[provider] || '').trim().slice(0, 220);
    if (!model) throw new Error(`Choose a model for AI route ${index + 1}.`);
    const baseURL = String(source?.baseURL || '').trim().slice(0, 500);
    if (provider === 'openaiCompatible' && !/^https:\/\//i.test(baseURL)) throw new Error('Custom OpenAI-compatible routes require an HTTPS base URL.');
    if (provider === 'ollama' && baseURL && !/^http:\/\/(127\.0\.0\.1|\[::1\]|localhost)(:\d+)?$/i.test(baseURL)) throw new Error('Ollama routes must use a loopback address.');
    if (provider === 'lmstudio' && baseURL && !/^http:\/\/(127\.0\.0\.1|\[::1\]|localhost)(:\d+)?\/v1$/i.test(baseURL)) throw new Error('LM Studio routes must use a loopback /v1 address.');
    const route = { id: /^[a-zA-Z0-9_-]{1,80}$/.test(String(source?.id || '')) ? String(source.id) : crypto.randomUUID(), provider, model, baseURL, enabled: source?.enabled !== false };
    if (route.enabled) requireVerifiedFree(route, state, `AI route ${index + 1}`);
    return route;
  });
}

function sanitizeAITaskRoutes(input, current = {}, state = store.snapshot()) {
  const result = {};
  for (const profile of Object.keys(TASK_PROFILES)) {
    const source = input?.[profile] || current?.[profile] || {};
    const provider = String(source.provider || 'gemini');
    if (!PROVIDERS[provider]) throw new Error(`${TASK_PROFILES[profile].name} has an unsupported provider.`);
    const model = String(source.model || DEFAULT_MODELS[provider] || '').trim().slice(0, 220);
    if (!model) throw new Error(`Choose a model for ${TASK_PROFILES[profile].name}.`);
    const baseURL = String(source.baseURL || '').trim().slice(0, 500);
    if (provider === 'openaiCompatible' && !/^https:\/\//i.test(baseURL)) throw new Error(`${TASK_PROFILES[profile].name} requires an HTTPS base URL.`);
    if (provider === 'lmstudio' && baseURL && !/^http:\/\/(127\.0\.0\.1|\[::1\]|localhost)(:\d+)?\/v1$/i.test(baseURL)) throw new Error(`${TASK_PROFILES[profile].name} requires a loopback LM Studio /v1 URL.`);
    const route = { enabled: source.enabled === true, provider, model, baseURL, fallbackPolicy: source.fallbackPolicy === 'none' ? 'none' : 'waterfall' };
    if (route.enabled) requireVerifiedFree(route, state, TASK_PROFILES[profile].name);
    result[profile] = route;
  }
  return result;
}

async function saveAICredentials(keys = {}, confirmationsInput = null) {
  for (const provider of Object.keys(PROVIDERS)) {
    if (provider === 'gemini' && Array.isArray(keys?.gemini)) {
      for (let index = 0; index < 5; index += 1) { const supplied = String(keys.gemini[index] || '').trim(); if (supplied) await secretStore.set(`ai.key.gemini.${index}`, supplied); }
    } else {
      const supplied = String(keys?.[provider] || '').trim();
      if (supplied) await secretStore.set(`ai.key.${provider}`, supplied);
    }
  }
  if (confirmationsInput) {
    const current = store.snapshot().preferences.aiFreeTierConfirmations || {};
    store.updatePreferences({ aiFreeTierConfirmations: {
      gemini: Array.from({ length: 5 }, (_, index) => confirmationsInput.gemini?.[index] === true || (confirmationsInput.gemini?.[index] == null && current.gemini?.[index] === true)),
      groq: confirmationsInput.groq === true || (confirmationsInput.groq == null && current.groq === true),
      mistral: confirmationsInput.mistral === true || (confirmationsInput.mistral == null && current.mistral === true)
      ,nvidia: confirmationsInput.nvidia === true || (confirmationsInput.nvidia == null && current.nvidia === true)
    } });
  }
  broadcast();
  return publicState().connectionStatus.ai;
}

async function saveAIRoute(routeInput, keys = {}, taskRoutesInput = null, confirmationsInput = null) {
  await saveAICredentials(keys, confirmationsInput);
  const state = store.snapshot();
  const route = sanitizeAIRoute(routeInput, state);
  const taskRoutes = sanitizeAITaskRoutes(taskRoutesInput, state.preferences.aiTaskRoutes, state);
  const first = route[0];
  store.updatePreferences({ aiWaterfall: route, aiTaskRoutes: taskRoutes, aiProvider: first?.provider || 'none', aiModel: first?.model || '', aiBaseURL: first?.baseURL || '' });
  lastAIRouteStatus = null;
  broadcast();
  return publicState().connectionStatus.ai;
}

function publicState() {
  const state = store.snapshot();
  state.activeConversationId = activeConversationId;
  state.attachments = (state.attachments || []).map(item => ({ ...item, cloudApproved: attachmentCloudApprovals.has(item.id), text: undefined, excerpt: String(item.text || '').slice(0, 240) }));
  if (!state.preferences.activityTrackingEnabled) state.activity = sessionActivity;
  state.connectionStatus = {
    ai: { connected: hasAIRoute(state), provider: safeAIRoute(state)[0]?.provider || 'none', route: safeAIRoute(state), credentials: Object.fromEntries(Object.keys(PROVIDERS).map(provider => [provider, providerStoredKeyCount(provider, state) > 0])), credentialCounts: Object.fromEntries(Object.keys(PROVIDERS).map(provider => [provider, providerKeyCount(provider, state)])), storedCredentialCounts: Object.fromEntries(Object.keys(PROVIDERS).map(provider => [provider, providerStoredKeyCount(provider, state)])), credentialSlots: { gemini: Array.from({ length: 5 }, (_, index) => Boolean(secretStore?.has(`ai.key.gemini.${index}`))) }, freeTierConfirmations: state.preferences.aiFreeTierConfirmations, taskProfiles: TASK_PROFILES, taskRouteStatuses: Object.fromEntries(Object.entries(state.preferences.aiTaskRoutes || {}).map(([profile, entry]) => [profile, routeFreeStatus(entry, state)])), recommended: { waterfall: cloneWaterfallDefaults(), taskRoutes: cloneTaskDefaults() }, localCompute: localResourceMonitor.status(), ollama: { ...ollamaStatus }, lastRoute: lastAIRouteStatus },
    spotify: { connected: connectorRegistry?.record('spotify')?.state === 'ready' },
    google: { connected: connectorRegistry?.record('google')?.state === 'ready' }
  };
  state.connectionStatus.browser = { connected: browserBridge?.connected || false, extensionId: 'eadpekpcegaonnlpkminfmfcmdhbfhoj' };
  state.connectionStatus.native = { connected: nativeBridge?.available || false, bridge: nativeBridge?.status?.() || {}, permissions: { ...nativePermissionStatus }, speech: { ...nativeSpeechCapabilities, backend: voiceBackend }, whisper: whisperService?.status?.() || {} };
  state.connectionStatus.diagnostics = lastDiagnosticReport ? { generatedAt: lastDiagnosticReport.generatedAt, summary: lastDiagnosticReport.summary, checks: lastDiagnosticReport.checks } : null;
  state.connectorDefinitions = connectorRegistry?.definitions?.() || [];
  state.connectionRecords = connectorRegistry?.records?.() || [];
  state.contextDock = { research: lastResearch, actionProgress: currentActionProgress, localResources: localResourceMonitor.status() };
  return state;
}

function broadcast() {
  const state = publicState();
  for (const window of [mainWindow, orbWindow]) if (window && !window.isDestroyed()) window.webContents.send('state:changed', state);
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1180, height: 780, minWidth: 880, minHeight: 620, title: 'Jarvis',
    backgroundColor: '#111217', show: false,
    titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 18, y: 18 },
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('close', event => {
    if (!app.isQuitting && store?.snapshot().preferences.keepJarvisAvailable) { event.preventDefault(); mainWindow.hide(); }
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  mainWindow.webContents.on('will-navigate', event => event.preventDefault());
  mainWindow.loadFile(rendererPath('index.html'));
}

function nearestOrbAnchor(bounds) {
  const area = screen.getDisplayMatching(bounds).workArea;
  return nearestAnchor(bounds, area, ORB_SIZE, ORB_MARGIN);
}

function snapOrbToNearestAnchor(bounds = orbWindow?.getBounds()) {
  if (!bounds || !orbWindow || orbWindow.isDestroyed()) return;
  const target = nearestOrbAnchor(bounds);
  lastOrbAnchor = { x: target.x, y: target.y };
  orbWindow.setBounds({ x: target.x, y: target.y, width: ORB_SIZE, height: ORB_SIZE }, false);
  saveOrbPosition();
}

function restoredOrbBounds() {
  const display = screen.getPrimaryDisplay(); const area = display.workArea; const saved = store.snapshot().preferences.orbPosition;
  const raw = { x: saved ? Math.round(area.x + saved.x * Math.max(1, area.width - ORB_SIZE)) : area.x + area.width - ORB_SIZE - ORB_MARGIN, y: saved ? Math.round(area.y + saved.y * Math.max(1, area.height - ORB_SIZE)) : area.y + area.height - ORB_SIZE - ORB_MARGIN, width: ORB_SIZE, height: ORB_SIZE };
  const anchor = nearestOrbAnchor(raw); lastOrbAnchor = { x: anchor.x, y: anchor.y };
  return { x: anchor.x, y: anchor.y, width: ORB_SIZE, height: ORB_SIZE };
}

function saveOrbPosition() {
  if (!orbWindow || orbWindow.isDestroyed()) return;
  const bounds = orbWindow.getBounds(); const area = screen.getDisplayMatching(bounds).workArea;
  store.updatePreferences({ orbPosition: { x: Math.max(0, Math.min(1, (bounds.x - area.x) / Math.max(1, area.width - bounds.width))), y: Math.max(0, Math.min(1, (bounds.y - area.y) / Math.max(1, area.height - bounds.height))) } });
}

function createOrbWindow() {
  orbWindow = new BrowserWindow({ ...restoredOrbBounds(), frame: false, transparent: true, resizable: false, alwaysOnTop: true, skipTaskbar: true, hasShadow: false, movable: true, acceptFirstMouse: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  orbWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  orbWindow.webContents.on('will-navigate', event => event.preventDefault());
  // Handle a tap below the DOM layer. Frameless transparent windows can lose a
  // renderer click while inactive, but Electron still reports the native mouse
  // stream here. Movement remains available to the renderer's drag/snap path.
  orbWindow.webContents.on('before-mouse-event', (event, input) => {
    if (input.type === 'mouseDown' && input.button === 'left' && Number(input.clickCount || 0) >= 2) { event.preventDefault(); orbMouseCandidate = null; hideOrb(); return; }
    if (orbMode !== 'collapsed') return;
    if (input.type === 'mouseDown' && input.button === 'left') { orbMouseCandidate = { x: input.x, y: input.y, moved: false }; return; }
    if (input.type === 'mouseMove' && orbMouseCandidate && Math.hypot(input.x - orbMouseCandidate.x, input.y - orbMouseCandidate.y) >= 5) { orbMouseCandidate.moved = true; return; }
    if (input.type === 'mouseUp' && input.button === 'left' && orbMouseCandidate) {
      const shouldActivate = !orbMouseCandidate.moved;
      orbMouseCandidate = null;
      if (shouldActivate) activateOrb();
    }
  });
  // A frameless transparent window can receive focus before Chromium delivers
  // the first renderer click. Use focus as a delayed native fallback while
  // preserving pointer drag detection.
  orbWindow.on('focus', () => setTimeout(() => {
    if (orbFocusFallbackArmed && orbMode === 'collapsed' && !orbDragging && orbMouseCandidate === null) activateOrb();
  }, 90));
  orbWindow.on('moved', () => { if (orbMode === 'collapsed' && !orbDragging) saveOrbPosition(); });
  orbWindow.once('ready-to-show', () => {
    if (store.snapshot().preferences.showFloatingAssistant) orbWindow.showInactive();
    // Chromium may focus a transparent window once while it is first attached.
    // Arm the fallback only after that launch transition has settled.
    setTimeout(() => { orbFocusFallbackArmed = true; }, 500);
  });
  orbWindow.loadFile(rendererPath('orb.html'));
}

function expandOrb(focus = true) {
  if (!orbWindow || orbWindow.isDestroyed() || orbMode === 'expanding' || orbMode === 'expanded') {
    if (focus && orbWindow && !orbWindow.isDestroyed()) { orbWindow.show(); orbWindow.focus(); orbWindow.webContents.send('command:focus'); }
    return;
  }
  orbMode = 'expanding';
  const area = screen.getDisplayMatching(orbWindow.getBounds()).workArea; const current = orbWindow.getBounds();
  const width = 420, height = 286;
  lastOrbAnchor = { x: current.x, y: current.y };
  const horizontal = current.x + current.width / 2 < area.x + area.width / 3 ? current.x : current.x + current.width / 2 > area.x + area.width * 2 / 3 ? current.x + current.width - width : current.x + current.width / 2 - width / 2;
  const vertical = current.y + current.height / 2 < area.y + area.height / 3 ? current.y : current.y + current.height / 2 > area.y + area.height * 2 / 3 ? current.y + current.height - height : current.y + current.height / 2 - height / 2;
  orbWindow.setBounds({ x: Math.max(area.x + 12, Math.min(Math.round(horizontal), area.x + area.width - width - 12)), y: Math.max(area.y + 12, Math.min(Math.round(vertical), area.y + area.height - height - 12)), width, height }, true);
  orbWindow.show(); orbMode = 'expanded'; if (focus) { orbWindow.focus(); orbWindow.webContents.send('command:focus'); }
}

function activateOrb() {
  if (!orbWindow || orbWindow.isDestroyed()) return;
  const bounds = orbWindow.getBounds();
  const visiblyCollapsed = bounds.width <= ORB_SIZE + 4 && bounds.height <= ORB_SIZE + 4;
  if (!orbWindow.isVisible()) orbWindow.show();
  if (visiblyCollapsed || orbMode === 'hidden' || orbMode === 'collapsing') orbMode = 'collapsed';
  if (orbMode === 'expanded' && !visiblyCollapsed) {
    orbWindow.show(); orbWindow.focus(); orbWindow.webContents.send('command:focus');
    return;
  }
  expandOrb(true);
}

function collapseOrb() {
  if (!orbWindow || orbWindow.isDestroyed() || orbMode === 'collapsed' || orbMode === 'collapsing') return;
  orbMode = 'collapsing';
  const current = orbWindow.getBounds();
  const target = lastOrbAnchor || nearestOrbAnchor(current);
  orbWindow.setBounds({ x: target.x, y: target.y, width: ORB_SIZE, height: ORB_SIZE }, false); orbMode = 'collapsed'; saveOrbPosition();
}

function hideOrb() {
  if (!orbWindow || orbWindow.isDestroyed()) return;
  if (orbMode === 'expanded' || orbMode === 'expanding') {
    const target = lastOrbAnchor || nearestOrbAnchor(orbWindow.getBounds());
    orbWindow.setBounds({ x: target.x, y: target.y, width: ORB_SIZE, height: ORB_SIZE }, false);
    saveOrbPosition();
  }
  orbMode = 'hidden';
  orbWindow.hide();
}

function createTray() {
  // macOS uses the white SVG as the source artwork. Electron's nativeImage does
  // not decode SVG files, so the checked-in PNG is its 2x raster counterpart.
  const iconFile = path.join(__dirname, 'assets', 'JarvisTrayTemplate.png');
  const icon = fs.existsSync(iconFile)
    ? nativeImage.createFromPath(iconFile).resize({ width: 18, height: 18 })
    : nativeImage.createEmpty();
  icon.setTemplateImage(true);
  tray = new Tray(icon); tray.setToolTip('Jarvis');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Jarvis', accelerator: 'Alt+Space', click: () => { mainWindow.show(); mainWindow.focus(); } },
    { label: 'Show Floating Assistant', click: activateOrb },
    { type: 'separator' }, { label: 'Quit Jarvis', click: () => { app.isQuitting = true; app.quit(); } }
  ]));
  tray.on('click', activateOrb);
}

function registerShortcuts() {
  globalShortcut.register('Alt+Space', activateOrb);
  globalShortcut.register('Alt+Shift+Space', () => { voiceTarget = 'orb'; activateOrb(); toggleVoice().catch(error => orbWindow.webContents.send('speech:error', error.message)); });
}

async function toggleVoice() {
  if (!nativeBridge?.available) throw new Error('Voice needs the native companion. Install full Xcode and run script/build_native_bridge.sh.');
  if (voiceListening) {
    if (whisperRecording) {
      const recording = await nativeBridge.request('audio.record.stop'); whisperRecording = false; voiceListening = false;
      notifySpeechState({ listening: false, processing: true, backend: voiceBackend });
      if (!recording.path || Number(recording.bytes || 0) < 1_000) throw new Error('No usable microphone audio was recorded.');
      const lease = await localResourceMonitor.acquire({ ...store.snapshot().preferences, localAIEnabled: true, localAIAllowOnBattery: true, localAIMaxCPUPercent: voiceBackend === 'whisperTiny' ? 72 : 60, localAIMinMemoryPercent: voiceBackend === 'whisperTiny' ? 18 : 25, localAIMinSpeedLimit: 80 });
      if (!lease.allowed) { fs.rmSync(recording.path, { force: true }); throw new Error(`Local speech paused: ${lease.assessment.reason} Type the command or retry after system load drops.`); }
      try {
        const result = await whisperService.transcribe(recording.path, voiceBackend === 'whisperTiny' ? 'tiny' : 'base', { signal: lease.signal });
        if (!result.text) throw new Error('No speech was detected.');
        emitSpeechTranscript({ text: result.text, final: true, backend: result.backend });
      } finally { lease.release(); fs.rmSync(recording.path, { force: true }); notifySpeechState({ listening: false, processing: false, backend: voiceBackend }); }
    } else { await nativeBridge.request('speech.stop'); voiceListening = false; notifySpeechState({ listening: false, backend: voiceBackend }); }
    return voiceListening;
  }

  if (nativePermissionStatus.microphone !== 'authorized') {
    nativePermissionStatus = await nativeBridge.request('permissions.request', { kind: 'microphone' }, 120_000);
    if (nativePermissionStatus.microphone !== 'authorized') throw new Error('Microphone access was not granted. Open Connections to enable it.');
  }
  await refreshNativeSpeechCapabilities();
  if (nativePermissionStatus.speech === 'authorized' && nativeSpeechCapabilities.onDevice) {
    const started = await nativeBridge.request('speech.start', { wakeWord: false, allowNetwork: false });
    voiceBackend = 'appleOnDevice'; nativeSpeechCapabilities = { ...nativeSpeechCapabilities, activeMode: voiceBackend, locale: started.locale || nativeSpeechCapabilities.locale };
  } else {
    const whisper = whisperService.status();
    const normal = await localResourceMonitor.assess({ ...store.snapshot().preferences, localAIEnabled: true, localAIAllowOnBattery: true, localAIMaxCPUPercent: 60, localAIMinMemoryPercent: 25, localAIMinSpeedLimit: 80 });
    const tiny = !normal.allowed && whisper.tiny;
    if (whisper.binary && (normal.allowed ? whisper.base : whisper.tiny)) {
      voiceBackend = tiny ? 'whisperTiny' : 'whisperBase'; await nativeBridge.request('audio.record.start'); whisperRecording = true;
    } else if (nativePermissionStatus.speech === 'authorized' && nativeSpeechCapabilities.available && store.snapshot().preferences.allowOnlineSpeechFallback === true) {
      const started = await nativeBridge.request('speech.start', { wakeWord: false, allowNetwork: true });
      voiceBackend = 'appleOnline'; nativeSpeechCapabilities = { ...nativeSpeechCapabilities, activeMode: voiceBackend, locale: started.locale || nativeSpeechCapabilities.locale };
    } else {
      const reason = !whisper.binary ? 'whisper-cli is not installed' : !whisper.base && !whisper.tiny ? 'offline speech models are not installed' : normal.reason;
      throw new Error(`On-device Apple Speech is unavailable and ${reason}. Open Connections to install offline speech or explicitly enable Apple online Speech.`);
    }
  }
  voiceListening = true;
  notifySpeechState({ listening: true, backend: voiceBackend, maximumSeconds: whisperRecording ? 30 : null });
  logger?.info('voice', 'started', { backend: voiceBackend });
  return voiceListening;
}

function notifySpeechState(payload) {
  for (const window of [mainWindow, orbWindow]) if (window && !window.isDestroyed()) window.webContents.send('speech:state', payload);
}

function emitSpeechTranscript(payload) {
  const target = voiceTarget === 'main' && mainWindow && !mainWindow.isDestroyed() ? mainWindow : orbWindow;
  if (target && !target.isDestroyed()) target.webContents.send('speech:transcript', payload);
}

async function refreshNativePermissions() {
  if (!nativeBridge?.available) { nativePermissionStatus = {}; return nativePermissionStatus; }
  nativePermissionStatus = await nativeBridge.request('permissions.status');
  broadcast();
  return nativePermissionStatus;
}

async function refreshNativeSpeechCapabilities() {
  if (!nativeBridge?.available) { nativeSpeechCapabilities = {}; return nativeSpeechCapabilities; }
  nativeSpeechCapabilities = await nativeBridge.request('speech.capabilities');
  broadcast();
  return nativeSpeechCapabilities;
}

async function requestVoicePermissions() {
  if (!nativeBridge?.available) throw new Error('Voice needs the signed native companion. Rebuild Jarvis with full Xcode first.');
  app.focus({ steal: true });
  nativePermissionStatus = await nativeBridge.request('permissions.requestVoice', {}, 120_000);
  broadcast();
  const missing = ['microphone', 'speech'].filter(kind => nativePermissionStatus[kind] !== 'authorized');
  if (missing.length) {
    const error = new Error(`${missing.map(kind => kind === 'speech' ? 'Speech Recognition' : 'Microphone').join(' and ')} access was not granted. Use the Privacy Settings button in Connections to enable it.`);
    error.code = 'VOICE_PERMISSION_DENIED';
    throw error;
  }
  return nativePermissionStatus;
}

function record(command, status, message, startedAt, metadata = {}) {
  const item = { id: crypto.randomUUID(), command: command.originalText, intent: command.intent, status, message, riskLevel: command.riskLevel, startedAt, completedAt: new Date().toISOString(), durationMs: Date.now() - new Date(startedAt).getTime(), ...metadata };
  if (store.snapshot().preferences.activityTrackingEnabled) {
    store.add('activity', item);
    store.add('actionRuns', { ...item, summary: message });
  } else sessionActivity.unshift(item);
  broadcast(); return item;
}

function setTimer(seconds, label = 'Focus') {
  const timer = { id: crypto.randomUUID(), label, state: 'running', startedAt: new Date().toISOString(), endAt: new Date(Date.now() + seconds * 1000).toISOString(), remaining: seconds };
  store.setTimer(timer); startTimerLoop(); broadcast(); return timer;
}

function startTimerLoop() {
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    const timer = store.snapshot().timer; if (!timer || timer.state !== 'running') return;
    const remaining = Math.max(0, Math.ceil((new Date(timer.endAt).getTime() - Date.now()) / 1000));
    if (remaining === 0) {
      clearInterval(timerInterval); store.setTimer({ ...timer, state: 'completed', remaining: 0, completedAt: new Date().toISOString() });
      new Notification({ title: 'Timer complete', body: `${timer.label} is finished.` }).show();
    } else { store.state.timer.remaining = remaining; }
    const current = store.snapshot().timer; for (const window of [mainWindow, orbWindow]) if (window && !window.isDestroyed()) window.webContents.send('timer:tick', current);
  }, 1000);
}

async function runInternal(command, confirmed) {
  const p = command.parameters || {}; const state = store.snapshot();
  switch (command.intent) {
    case 'startTimer': setTimer(p.seconds, p.label); return 'Timer started.';
    case 'pauseTimer': await controlTimer('pause'); return 'Timer paused.';
    case 'resumeTimer': await controlTimer('resume'); return 'Timer resumed.';
    case 'stopTimer': await controlTimer('stop'); return 'Timer stopped.';
    case 'timerStatus': return state.timer ? `${state.timer.label}: ${Math.ceil((state.timer.remaining || 0) / 60)} minutes remaining.` : 'No timer is running.';
    case 'showTime': return `It is ${new Intl.DateTimeFormat(undefined, { timeStyle: 'short' }).format(new Date())}.`;
    case 'showDate': return `Today is ${new Intl.DateTimeFormat(undefined, { dateStyle: 'full' }).format(new Date())}.`;
    case 'readClipboard': { const value = clipboard.readText().slice(0, 20_000); return value || 'The text clipboard is empty.'; }
    case 'copyToClipboard': clipboard.writeText(String(p.text || '').slice(0, 200_000)); return 'Copied to the clipboard.';
    case 'calculate': return `${p.expression} = ${calculate(p.expression)}`;
    case 'getWeather': return weather(p.location);
    case 'researchWeb': {
      try {
        lastResearch = await webSearchService.search(p.query, { limit: 8, depth: 'basic' });
      } catch (error) {
        if (!['QUOTA_EXHAUSTED','QUOTA_COOLDOWN','TIMEOUT'].includes(error.code)) throw error;
        lastResearch = { provider: 'browser', query: p.query, results: [], fallbackURL: `https://www.google.com/search?q=${encodeURIComponent(p.query)}`, retrievedAt: new Date().toISOString(), untrusted: true, warning: error.message };
      }
      if (!lastResearch.results.length) { await shell.openExternal(lastResearch.fallbackURL); broadcast(); return `${lastResearch.warning ? `${lastResearch.warning} ` : ''}Opened browser search results for “${p.query}”.`; }
      broadcast(); return [`Research results for “${p.query}” (untrusted source content):`, ...lastResearch.results.map(item => `[${item.citationId}] ${item.title}\n${item.url}\n${item.snippet}`)].join('\n\n');
    }
    case 'openSearchResult': {
      const target = new URL(p.url); if (target.protocol !== 'https:') throw new Error('Research results must use HTTPS.');
      if (!lastResearch?.results?.some(item => item.url === target.toString())) throw new Error('Open a URL from the latest research results only.');
      await shell.openExternal(target.toString()); return 'Research source opened.';
    }
    case 'searchSpotify': {
      if (!secretStore.has('spotify.refreshToken')) return executeNative(command, { shell, app, store, clipboard });
      const results = await spotifyService.search(p.query, 'track,album,artist,playlist', 5);
      const items = [results.tracks, results.albums, results.artists, results.playlists].flatMap(group => group?.items || []).filter(Boolean).slice(0, 8);
      return items.length ? items.map(item => `${item.type}: ${item.name}${item.artists?.length ? ` — ${item.artists.map(artist => artist.name).join(', ')}` : ''}`).join('\n') : 'Spotify found no matching items.';
    }
    case 'spotifyPlay': return secretStore.has('spotify.refreshToken') ? spotifyService.play(p.query) : executeNative(command, { shell, app, store, clipboard });
    case 'spotifyPause': return secretStore.has('spotify.refreshToken') ? spotifyService.control('pause') : executeNative(command, { shell, app, store, clipboard });
    case 'spotifyResume': return secretStore.has('spotify.refreshToken') ? spotifyService.control('resume') : executeNative(command, { shell, app, store, clipboard });
    case 'spotifyNext': return secretStore.has('spotify.refreshToken') ? spotifyService.control('next') : executeNative(command, { shell, app, store, clipboard });
    case 'spotifyPrevious': return secretStore.has('spotify.refreshToken') ? spotifyService.control('previous') : executeNative(command, { shell, app, store, clipboard });
    case 'createPlaylist': return spotifyService.createPrivatePlaylist(p.name, p.description);
    case 'saveMemory': {
      const normalized = String(p.text || '').trim().toLowerCase();
      if (state.memories.some(item => item.text.trim().toLowerCase() === normalized)) return 'That fact is already in Memory.';
      const category = p.category || 'miscellaneous';
      if (p.automatic && (state.preferences.memoryExcludedCategories || []).includes(category)) return `Automatic memory is disabled for ${category}.`;
      const related = state.memories.find(item => item.category === category && item.text.trim().toLowerCase() !== normalized);
      store.add('memories', { id: crypto.randomUUID(), text: p.text, category, importance: Number(p.importance || .8), confidence: Number(command.confidence || .9), reason: p.automatic ? `Matched the durable ${category} memory rule.` : 'You explicitly asked Jarvis to remember this.', automatic: Boolean(p.automatic), pinned: false, sensitive: false, contradictionOf: related?.id || null, provenance: { source: p.automatic ? 'automatic-command-classifier' : 'explicit-user-request', commandId: command.id }, createdAt: new Date().toISOString(), lastUsedAt: null, expiresAt: null });
      return p.automatic ? 'That seemed important, so I saved it to local Memory.' : 'Saved to Memory.';
    }
    case 'recallMemory': {
      const words = String(p.query || '').toLowerCase(); const found = state.memories.filter(item => item.text.toLowerCase().includes(words)).slice(0, 5);
      return found.length ? found.map(item => item.text).join('\n') : 'I could not find a matching memory.';
    }
    case 'createNote': {
      if (p.destination === 'appleNotes') return appleAutomation.createAppleNote(p.title, p.body || '');
      store.add('notes', { id: crypto.randomUUID(), title: p.title, body: p.body || '', createdAt: new Date().toISOString() }); return 'Local Jarvis note created.';
    }
    case 'showNotification': new Notification({ title: p.title || 'Jarvis', body: p.body }).show(); return 'Notification shown.';
    case 'searchContacts': { const contacts = await nativeBridge.request('contacts.search', { query: p.query }); return contacts.length ? contacts.map(item => `${item.name}${item.emails?.length ? ` — ${item.emails.join(', ')}` : ''}${item.phones?.length ? ` — ${item.phones.join(', ')}` : ''}`).join('\n') : 'No matching contacts found.'; }
    case 'showActivity': return publicState().activity.length ? publicState().activity.slice(0, 8).map(a => `${a.status}: ${a.command}`).join('\n') : 'No activity yet.';
    case 'showTodaySummary': {
      const today = new Date().toDateString(); const items = publicState().activity.filter(a => new Date(a.completedAt).toDateString() === today && a.status === 'success');
      return items.length ? `You completed ${items.length} Jarvis action${items.length === 1 ? '' : 's'} today.` : 'No successful actions recorded today.';
    }
    case 'showRecentApps': return state.activity.filter(a => ['openApp', 'switchApp'].includes(a.intent)).slice(0, 5).map(a => a.command).join('\n') || 'No recent apps recorded.';
    case 'askAI': return runAIRequest(p.text || command.originalText, Boolean(p.privateMode));
    case 'startRoutine': return runRoutine(p.routine, confirmed, p.input || '');
    case 'showUpcoming': {
      if (p.destination === 'google') { const events = await googleService.upcomingCalendar(p.range === 'tomorrow' ? 2 : 7); return events.length ? events.map(item => `${new Date(item.start).toLocaleString()} — ${item.title}`).join('\n') : 'No upcoming Google Calendar events found.'; }
      return appleAutomation.upcoming(p.range);
    }
    case 'createReminder': return appleAutomation.createReminder(p.title, p.date);
    case 'createCalendarEvent': return p.destination === 'google' ? googleService.createCalendarEvent(p.title, p.date || p.start, p.end) : appleAutomation.createCalendarEvent(p.title, p.date || p.start, p.end);
    case 'sendEmail': return secretStore.has('google.refreshToken') ? googleService.sendMail(p.to, p.subject, p.body) : appleAutomation.sendEmail(p.to, p.subject, p.body);
    case 'sendMessage': return appleAutomation.sendMessage(p.to, p.body);
    case 'searchEmail': { const messages = await googleService.searchMail(p.query); return messages.length ? messages.map(item => `${item.from} — ${item.subject}\n${item.snippet}`).join('\n\n') : 'No matching Gmail messages found.'; }
    case 'readEmailThread': { const thread = await googleService.readMailThread(p.threadId); return thread.messages.map(item => `${item.from} — ${item.subject}\n${item.body}`).join('\n\n---\n\n'); }
    case 'createEmailDraft': { const draft = await googleService.createDraft(p.to, p.subject, p.body); return draft.summary; }
    case 'searchDrive': { const files = await googleService.searchDrive(p.query); return files.length ? files.map(item => `${item.name} — ${item.webViewLink || item.mimeType}`).join('\n') : 'No matching Google Drive files found.'; }
    case 'searchGoogleContacts': { const contacts = await googleService.searchContacts(p.query); return contacts.length ? contacts.map(item => `${item.name}${item.emails.length ? ` — ${item.emails.join(', ')}` : ''}${item.phones.length ? ` — ${item.phones.join(', ')}` : ''}`).join('\n') : 'No matching Google contacts found.'; }
    case 'listGoogleTasks': { const tasks = await googleService.listTasks(Boolean(p.showCompleted)); return tasks.length ? tasks.map(item => `${item.status === 'completed' ? '✓' : '○'} ${item.title} [${item.id}]`).join('\n') : 'No Google tasks found.'; }
    case 'createGoogleTask': { const task = await googleService.createTask(p.title, p.due); return `Created Google task “${task.title}”.`; }
    case 'updateGoogleTask': { const patch = {}; if (p.title) patch.title = p.title; if (p.status) patch.status = p.status; const task = await googleService.updateTask(p.taskListId, p.id, patch); return `Updated Google task “${task.title}”.`; }
    case 'deleteGoogleTask': return googleService.deleteTask(p.taskListId, p.id);
    case 'githubSearchRepositories': { const repos = await githubService.searchRepositories(p.query); return repos.length ? repos.map(item => `${item.full_name} — ${item.html_url}\n${item.description || ''}`).join('\n\n') : 'No GitHub repositories found.'; }
    case 'githubListIssues': { const issues = await githubService.listIssues(p.repository, p.state || 'open'); return issues.length ? issues.map(item => `#${item.number} ${item.title} — ${item.html_url}`).join('\n') : 'No matching GitHub issues found.'; }
    case 'githubCreateIssue': { if (!confirmed) { const error = new Error('Review and confirm this GitHub issue immediately before creation.'); error.code = 'CONFIRMATION_REQUIRED'; throw error; } const issue = await githubService.createIssue(p.repository, p.title, p.body || ''); return `Created GitHub issue #${issue.number}: ${issue.html_url}`; }
    case 'notionSearch': { const pages = await notionService.search(p.query); return pages.length ? pages.map(item => `${item.object}: ${item.url || item.id}`).join('\n') : 'No shared Notion pages found.'; }
    case 'notionCreatePage': { const page = await notionService.createPage(p.parentId, p.title, p.content || ''); return `Created Notion page: ${page.url || page.id}`; }
    case 'todoistListTasks': { const tasks = await todoistService.listTasks(p.projectId || ''); return tasks.length ? tasks.map(item => `○ ${item.content} [${item.id}]`).join('\n') : 'No Todoist tasks found.'; }
    case 'todoistCreateTask': { const task = await todoistService.createTask(p.title, p); return `Created Todoist task “${task.content}”.`; }
    case 'todoistCompleteTask': await todoistService.completeTask(p.id); return 'Todoist task completed.';
    case 'microsoftSearchMail': { const messages = await microsoftService.searchMail(p.query); return messages.length ? messages.map(item => `${item.from?.emailAddress?.name || ''} — ${item.subject}\n${item.bodyPreview || ''}`).join('\n\n') : 'No Outlook messages found.'; }
    case 'microsoftListTasks': { const tasks = await microsoftService.listTasks(); return tasks.length ? tasks.map(item => `${item.status === 'completed' ? '✓' : '○'} ${item.title} — ${item.listName}`).join('\n') : 'No Microsoft To Do tasks found.'; }
    case 'microsoftCreateTask': { const task = await microsoftService.createTask(p.title, p.dueDateTime); return `Created Microsoft To Do task “${task.title}”.`; }
    case 'createLocalTask': { const task = { id: crypto.randomUUID(), title: p.title, due: p.due || null, completed: false, source: 'local', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; store.add('tasks', task); return `Created local task “${task.title}”.`; }
    case 'listLocalTasks': { const tasks = state.tasks.filter(item => p.includeCompleted || !item.completed); return tasks.length ? tasks.map(item => `${item.completed ? '✓' : '○'} ${item.title} [${item.id}]`).join('\n') : 'No local tasks found.'; }
    case 'completeLocalTask': { const task = state.tasks.find(item => item.id === p.id); if (!task) throw new Error('Local task not found.'); store.update('tasks', p.id, { completed: p.completed !== false, completedAt: p.completed === false ? null : new Date().toISOString() }); return p.completed === false ? 'Local task reopened.' : 'Local task completed.'; }
    case 'deleteLocalTask': store.remove('tasks', p.id); return 'Local task deleted.';
    case 'browserListTabs': {
      const tabs = await browserBridge.request('browser.listTabs');
      return tabs.length ? tabs.slice(0, 30).map(tab => `${tab.active ? 'Current' : 'Tab'}: ${tab.title || 'Untitled'} — ${tab.url}`).join('\n') : 'Chrome has no open tabs.';
    }
    case 'browserOpenTab': { const url = new URL(p.url); if (url.protocol !== 'https:') throw new Error('Jarvis opens HTTPS tabs only.'); await browserBridge.request('browser.openTab', { url: url.toString(), active: p.active !== false }); return 'Chrome tab opened.'; }
    case 'browserActivateTab': await browserBridge.request('browser.activateTab', { tabId: p.tabId }); return 'Chrome tab activated.';
    case 'browserCloseTab': await browserBridge.request('browser.closeTab', { tabId: p.tabId }); return 'Chrome tab closed.';
    case 'browserMoveTab': await browserBridge.request('browser.moveTab', { tabId: p.tabId, index: p.index }); return 'Chrome tab moved.';
    case 'browserPinTab': await browserBridge.request('browser.pinTab', { tabId: p.tabId, pinned: p.pinned }); return p.pinned ? 'Chrome tab pinned.' : 'Chrome tab unpinned.';
    case 'browserMuteTab': await browserBridge.request('browser.muteTab', { tabId: p.tabId, muted: p.muted }); return p.muted ? 'Chrome tab muted.' : 'Chrome tab unmuted.';
    case 'browserReadPage': {
      const page = await browserBridge.request('browser.readPage');
      return `${page.title}\n${page.url}\n\n${page.text.slice(0, 20_000)}`;
    }
    case 'readScreenText': { if (!state.preferences.screenContextEnabled) throw new Error('Enable on-request screen context in Settings first.'); const result = await nativeBridge.request('screen.ocr', {}); return result.text || 'No text was detected on screen.'; }
    case 'minimizeWindow': await nativeBridge.request('window.action', { action: 'minimize' }); return 'Focused window minimized.';
    case 'maximizeWindow': await nativeBridge.request('window.action', { action: 'maximize' }); return 'Focused window raised.';
    case 'closeWindow': await nativeBridge.request('window.action', { action: 'close' }); return 'Focused window closed.';
    case 'browserClick': { const result = await browserBridge.request('browser.click', { label: p.label }); return `Clicked ${result.text || p.label}.`; }
    case 'browserFill': { const result = await browserBridge.request('browser.type', { label: p.label, text: p.text }); return `Filled ${result.name || result.text || p.label}.`; }
    case 'submitWebForm': { if (!confirmed) { const error = new Error('Review and confirm this web submission first.'); error.code = 'CONFIRMATION_REQUIRED'; throw error; } const result = await browserBridge.request('browser.submit', { label: p.label, confirmed: true, summary: p.summary }); return `Submitted ${result.text || p.label}.`; }
    default: return executeNative(command, { shell, app, store, clipboard, signal: command.signal });
  }
}

function ensureConversation(privateMode = false) {
  if (!privateMode && activeConversationId && store.snapshot().conversations.some(item => item.id === activeConversationId)) return activeConversationId;
  const conversation = store.createConversation('Jarvis conversation', privateMode);
  if (!privateMode) activeConversationId = conversation.id;
  return conversation.id;
}

function emitAssistantStream(payload) {
  for (const window of [mainWindow, orbWindow]) if (window && !window.isDestroyed()) window.webContents.send('assistant:stream', payload);
}

async function runAIRequest(text, privateMode = false, attachmentIds = []) {
  if (activeAIController) throw new Error('Another AI request is already running.');
  const requestId = crypto.randomUUID(); const started = performance.now(); let firstTokenAt = null; let partial = '';
  const conversationId = ensureConversation(privateMode);
  const snapshot = store.snapshot();
  const history = snapshot.messages.filter(item => item.conversationId === conversationId).slice(-16);
  const options = await aiOptions(text, privateMode, attachmentIds);
  options.history = history; const memories = options.memories;
  store.addMessage(conversationId, 'user', text, { memoryCount: memories.length, requestId }, privateMode);
  emitAssistantStream({ requestId, reset: true, delta: '', done: false });
  const controller = new AbortController(); activeAIController = controller;
  try {
    const response = await askAIStream({ ...options, signal: controller.signal }, (delta, provider) => {
      if (firstTokenAt == null) firstTokenAt = performance.now(); partial += delta;
      emitAssistantStream({ requestId, delta, done: false, provider });
    });
    disableUnavailableRoutes(response);
    const timings = { routingMs: options.routingDurationMs || 0, firstTokenMs: firstTokenAt == null ? null : Math.round(firstTokenAt - started), completionMs: Math.round(performance.now() - started) };
    lastAIRouteStatus = { ok: true, provider: response.provider, model: response.model, routeIndex: response.routeIndex, credentialIndex: response.credentialIndex, credentialCount: response.credentialCount, taskProfile: options.taskProfile, classificationConfidence: options.classification?.confidence || 0, override: options.override, fellBack: options.override && response.routeIndex > 0, attempts: response.attempts, localResourceStatus: response.localResourceStatus || localResourceMonitor.status(), timings, at: new Date().toISOString() };
    store.addMessage(conversationId, 'assistant', response.answer, { requestId, provider: response.provider, model: response.model, routeIndex: response.routeIndex, credentialIndex: response.credentialIndex, credentialCount: response.credentialCount, taskProfile: options.taskProfile, classificationConfidence: options.classification?.confidence || 0, override: options.override, fellBack: options.override && response.routeIndex > 0, attempts: response.attempts, memories: memories.map(item => item.id), timings }, privateMode);
    emitAssistantStream({ requestId, delta: '', done: true, timings });
    logger.info('ai', 'conversation-complete', { requestId, provider: response.provider, model: response.model, ...timings });
    broadcast();
    return response.answer;
  } catch (error) {
    disableUnavailableRoutes(error);
    const timings = { routingMs: options.routingDurationMs || 0, firstTokenMs: firstTokenAt == null ? null : Math.round(firstTokenAt - started), completionMs: Math.round(performance.now() - started) };
    lastAIRouteStatus = { ok: false, attempts: error.attempts || [], message: error.message, timings, at: new Date().toISOString() };
    const content = partial || error.message;
    store.addMessage(conversationId, 'assistant', content, { requestId, failed: !partial, interrupted: Boolean(partial), timings }, privateMode);
    emitAssistantStream({ requestId, delta: '', done: true, interrupted: Boolean(partial), error: error.message, timings });
    logger.warn('ai', 'conversation-failed', { requestId, code: error.code || 'AI_FAILED', partial: Boolean(partial), ...timings });
    broadcast();
    throw error;
  } finally { if (activeAIController === controller) activeAIController = null; }
}

async function aiOptions(text, privateMode = false, attachmentIds = []) {
  const snapshot = store.snapshot();
  const routingStarted = performance.now();
  const routing = await routedAIRequest(text, snapshot);
  const records = attachmentIds.slice(0, 20).map(id => snapshot.attachments.find(item => item.id === id) || sessionAttachments.get(id)).filter(Boolean);
  const unapproved = records.filter(item => !attachmentCloudApprovals.has(item.id));
  let route = routing.route;
  if (unapproved.length) route = route.filter(item => ['ollama','lmstudio'].includes(item.provider));
  if (records.length && !route.length) {
    const error = new Error('These attachments are local-only. Approve their content for the selected cloud provider, or make the local Ollama route available.');
    error.code = 'ATTACHMENT_CLOUD_APPROVAL_REQUIRED'; throw error;
  }
  const attachmentContext = records.map(item => AttachmentService.context(item)).join('\n\n---\n\n');
  const enrichedText = attachmentContext ? `${text}\n\n${attachmentContext}` : text;
  return { route, taskProfile: routing.profile, classification: routing.classification, override: routing.override, generation: routing.generation, history: privateMode ? [] : snapshot.messages.slice(0, 16).reverse(), text: enrichedText, displayText: text, attachments: records.map(item => item.id), memories: privateMode || snapshot.preferences.automaticMemoryEnabled === false ? [] : store.search(text, ['memory'], 5), resourceMonitor: localResourceMonitor, localPreferences: snapshot.preferences, routingDurationMs: Math.round(performance.now() - routingStarted) };
}

async function planPreview(text, privateMode = false, attachmentIds = []) {
  const local = parsedPreview(text);
  if (local.intent !== 'askAI' || !hasAIRoute()) return local;
  const options = await aiOptions(text, privateMode, attachmentIds);
  if (activeAIController) throw new Error('Another AI request is already running.');
  const controller = new AbortController(); activeAIController = controller; options.signal = controller.signal;
  let planned;
  try {
    planned = ['quick', 'summarize'].includes(options.taskProfile)
      ? { kind: 'answer', ...(await askAI(options)) }
      : await planAI({ ...options, capabilities: capabilityRegistry.schemas(connectorRegistry.availableCapabilityIds(AI_CAPABILITIES)) });
    disableUnavailableRoutes(planned);
    lastAIRouteStatus = { ok: true, provider: planned.provider, model: planned.model, routeIndex: planned.routeIndex, credentialIndex: planned.credentialIndex, credentialCount: planned.credentialCount, taskProfile: options.taskProfile, classificationConfidence: options.classification?.confidence || 0, override: options.override, fellBack: options.override && planned.routeIndex > 0, attempts: planned.attempts || [], localResourceStatus: planned.localResourceStatus || localResourceMonitor.status(), at: new Date().toISOString() };
  } catch (error) {
    disableUnavailableRoutes(error);
    lastAIRouteStatus = { ok: false, attempts: error.attempts || [], message: error.message, at: new Date().toISOString() };
    broadcast();
    throw error;
  } finally { if (activeAIController === controller) activeAIController = null; }
  const planId = crypto.randomUUID();
  if (planned.kind === 'answer') {
    const command = { ...local, id: crypto.randomUUID(), intent: 'cachedAIAnswer', parameters: { planId }, interpretation: 'Answer with Jarvis', action: 'Return a conversational answer. No device action will run.', confidence: .96, riskLevel: 'low', requiresConfirmation: false };
    pendingPlans.set(planId, { id: planId, kind: 'answer', text, answer: planned.answer, provider: planned.provider, model: planned.model, taskProfile: options.taskProfile, override: options.override, memories: options.memories, attachments: options.attachments, privateMode, command, createdAt: Date.now() });
    return command;
  }
  for (const step of planned.steps) {
    if (!AI_CAPABILITIES.includes(step.capabilityId)) throw new Error(`The proposed capability “${step.capabilityId}” is not available to AI planning.`);
    capabilityRegistry.validate(step.capabilityId, step.input || {});
  }
  const highRiskSteps = planned.steps.filter(step => capabilityRegistry.get(step.capabilityId).risk === 'high');
  if (highRiskSteps.length && planned.steps.length > 1) throw new Error('High-risk actions must run as a separate one-step plan so confirmation happens immediately before execution.');
  const riskLevel = planned.steps.reduce((risk, step) => maxRisk(risk, capabilityRegistry.get(step.capabilityId).risk), 'low');
  const requires = planned.steps.some(step => requiresConfirmation(step.capabilityId, store.snapshot().preferences));
  const command = { id: crypto.randomUUID(), originalText: text, intent: 'executePlan', parameters: { planId }, confidence: .93, riskLevel, requiresConfirmation: requires, interpretation: planned.summary, action: planned.steps.map((step, index) => `${index + 1}. ${capabilityRegistry.get(step.capabilityId).description}`).join('\n') };
  pendingPlans.set(planId, { id: planId, kind: 'plan', text, steps: planned.steps, provider: planned.provider, model: planned.model, taskProfile: options.taskProfile, override: options.override, memories: options.memories, attachments: options.attachments, privateMode, command, createdAt: Date.now() });
  return command;
}

async function executePendingPlan(plan, confirmed) {
  const conversationId = ensureConversation(plan.privateMode);
  store.addMessage(conversationId, 'user', plan.text, { memoryCount: plan.memories.length }, plan.privateMode);
  if (plan.kind === 'answer') {
    const requestId = crypto.randomUUID();
    emitAssistantStream({ requestId, reset: true, delta: '', done: false });
    emitAssistantStream({ requestId, delta: plan.answer, done: false });
    emitAssistantStream({ requestId, delta: '', done: true });
    store.addMessage(conversationId, 'assistant', plan.answer, { provider: plan.provider, model: plan.model, memories: plan.memories.map(item => item.id) }, plan.privateMode);
    pendingPlans.delete(plan.id); return plan.answer;
  }
  currentActionProgress = { id: plan.id, summary: plan.command.interpretation, status: 'running', completed: 0, total: plan.steps.length, steps: plan.steps.map(step => ({ capabilityId: step.capabilityId, status: 'pending' })) }; broadcast();
  const outcome = await routineCoordinator.run(plan.steps, async (step, execution) => {
    currentActionProgress.steps[execution.index] = { capabilityId: step.capabilityId, status: 'running' }; broadcast();
    capabilityRegistry.validate(step.capabilityId, step.input || {});
    const startedAt = new Date().toISOString();
    try {
      const output = await runInternal({ id: crypto.randomUUID(), originalText: plan.text, intent: step.capabilityId, parameters: step.input || {}, confidence: 1, riskLevel: capabilityRegistry.get(step.capabilityId).risk, requiresConfirmation: requiresConfirmation(step.capabilityId, store.snapshot().preferences) }, confirmed);
      currentActionProgress.steps[execution.index] = { capabilityId: step.capabilityId, status: 'succeeded', output }; currentActionProgress.completed += 1; broadcast();
      if (store.snapshot().preferences.activityTrackingEnabled) store.add('actionSteps', { id: crypto.randomUUID(), runId: execution.runId, index: execution.index, capabilityId: step.capabilityId, status: 'succeeded', output, startedAt, completedAt: new Date().toISOString() });
      return output;
    } catch (error) {
      currentActionProgress.steps[execution.index] = { capabilityId: step.capabilityId, status: 'failed', message: error.message }; broadcast();
      if (store.snapshot().preferences.activityTrackingEnabled) store.add('actionSteps', { id: crypto.randomUUID(), runId: execution.runId, index: execution.index, capabilityId: step.capabilityId, status: 'failed', message: error.message, startedAt, completedAt: new Date().toISOString() });
      throw error;
    }
  });
  const lines = outcome.completed.map(item => `${item.status === 'succeeded' ? '✓' : '×'} ${item.step.capabilityId}${item.output ? ` — ${item.output}` : item.message ? ` — ${item.message}` : ''}`);
  const answer = `${outcome.status === 'succeeded' ? 'Plan completed.' : 'Plan completed partially.'}\n${lines.join('\n')}`;
  currentActionProgress = { ...currentActionProgress, status: outcome.status, completedAt: new Date().toISOString() };
  store.addMessage(conversationId, 'assistant', answer, { provider: plan.provider, model: plan.model, actionPlan: plan.id }, plan.privateMode); pendingPlans.delete(plan.id); return answer;
}

async function runRoutine(name, confirmed, suppliedInput = '') {
  const routine = store.snapshot().routines.find(item => item.name.toLowerCase() === String(name).toLowerCase() || item.name.toLowerCase().includes(String(name).toLowerCase()));
  if (!routine) throw new Error('That routine was not found.');
  if (routine.enabled === false) throw new Error('That routine is disabled. Enable it in Automations first.');
  if (routine.confirm && !confirmed) { const error = new Error('This routine needs confirmation.'); error.code = 'CONFIRMATION_REQUIRED'; throw error; }
  if (routine.prompt && !String(suppliedInput).trim()) throw new Error(`${routine.prompt} Start it as “Start ${routine.name} with …”.`);
  const substitute = value => String(value || '').replaceAll('{{input}}', String(suppliedInput || '').trim());
  const outcome = await routineCoordinator.run(routine.steps, async (step, execution) => {
    const startedAt = new Date().toISOString();
    try {
      const parameters = step.kind === 'openURL' ? { url: substitute(step.target) } : step.kind === 'searchWeb' || step.kind === 'spotifyPlay' ? { query: substitute(step.target) } : step.kind === 'runShortcut' ? { name: substitute(step.target) } : step.kind === 'createNote' ? { title: substitute(step.title || step.target), destination: 'jarvis' } : step.kind === 'startTimer' ? { seconds: step.seconds, label: substitute(step.label || routine.name) } : step.kind === 'wait' ? { seconds: step.seconds } : step.kind === 'takeScreenshot' ? {} : { target: substitute(step.target) };
      if (!capabilityRegistry.get(step.kind)?.routineEligible) throw new Error(`${step.kind} is not available in routines.`);
      capabilityRegistry.validate(step.kind, parameters);
      const output = step.kind === 'wait' ? await new Promise((resolve, reject) => { const timer = setTimeout(() => resolve(`Waited ${step.seconds} seconds.`), step.seconds * 1000); execution.signal.addEventListener('abort', () => { clearTimeout(timer); reject(Object.assign(new Error('Routine wait cancelled.'), { name: 'AbortError' })); }, { once: true }); }) : await runInternal({ id: crypto.randomUUID(), intent: step.kind, parameters, originalText: routine.name, riskLevel: capabilityRegistry.get(step.kind).risk, requiresConfirmation: requiresConfirmation(step.kind, store.snapshot().preferences), signal: execution.signal }, confirmed);
      if (store.snapshot().preferences.activityTrackingEnabled) store.add('actionSteps', { id: crypto.randomUUID(), runId: execution.runId, index: execution.index, capabilityId: step.kind, status: 'succeeded', preview: step.target || step.label || step.kind, output, startedAt, completedAt: new Date().toISOString() });
      return output;
    } catch (error) {
      if (store.snapshot().preferences.activityTrackingEnabled) store.add('actionSteps', { id: crypto.randomUUID(), runId: execution.runId, index: execution.index, capabilityId: step.kind, status: 'failed', preview: step.target || step.label || step.kind, message: error.message, startedAt, completedAt: new Date().toISOString() });
      throw error;
    }
  }, { continueOnError: routine.continueOnError === true });
  const summary = `${routine.name}: ${outcome.status}. Completed ${outcome.completed.filter(item => item.status === 'succeeded').length} of ${routine.steps.length} steps.`;
  if (routine.notifyOnCompletion) new Notification({ title: routine.name, body: summary }).show();
  return summary;
}

async function controlTimer(action) {
  const timer = store.snapshot().timer; if (!timer) return null;
  if (action === 'pause' && timer.state === 'running') store.setTimer({ ...timer, state: 'paused', remaining: Math.max(0, Math.ceil((new Date(timer.endAt) - Date.now()) / 1000)) });
  if (action === 'resume' && timer.state === 'paused') store.setTimer({ ...timer, state: 'running', endAt: new Date(Date.now() + timer.remaining * 1000).toISOString() });
  if (action === 'stop') store.setTimer(null);
  startTimerLoop(); broadcast(); return store.snapshot().timer;
}

function commandContext() { const state = store.snapshot(); return { routines: state.routines.filter(r => r.enabled !== false).map(r => r.name), projects: state.trustedProjects.map(p => p.name), appAliases: state.appAliases || [], customSites: state.savedSites || [], automaticMemoryEnabled: state.preferences.automaticMemoryEnabled, memoryExcludedCategories: state.preferences.memoryExcludedCategories || [] }; }

function localPreview(text) {
  const original = String(text || '');
  let command = preview(parseCommand(original, commandContext()), store.snapshot().preferences);
  if (command.intent === 'startRoutine') {
    const name = String(command.parameters.routine || '').toLowerCase();
    const routine = store.snapshot().routines.find(item => item.name.toLowerCase() === name || item.name.toLowerCase().includes(name));
    if (routine?.confirm) command.requiresConfirmation = true;
  }
  return { ...command, routing: command.intent === 'unknown' ? 'none' : 'local' };
}

function capabilityCommand(capabilityId, parameters, originalText = '') {
  capabilityRegistry.validate(capabilityId, parameters || {});
  const definition = capabilityRegistry.get(capabilityId);
  return { id: crypto.randomUUID(), originalText: originalText || definition.description, intent: capabilityId, parameters: structuredClone(parameters || {}), confidence: 1, riskLevel: definition.risk, requiresConfirmation: requiresConfirmation(capabilityId, store.snapshot().preferences), interpretation: definition.description, action: definition.description, routing: 'local' };
}

function parsedPreview(text) {
  const original = String(text || '');
  const command = localPreview(original);
  if (command.intent !== 'unknown' || !original.trim()) return command;
  return { ...command, intent: 'askAI', parameters: { text: original }, confidence: .9, riskLevel: 'low', requiresConfirmation: false, interpretation: 'Ask Jarvis', action: hasAIRoute() ? 'No local command matched. Use the configured AI waterfall and relevant local memory.' : 'No local command matched. Connect an AI provider to answer this request.', routing: 'ai' };
}

app.whenReady().then(async () => {
  if (process.platform === 'darwin') {
    app.setActivationPolicy('regular');
    app.dock.show();
  }
  store = new Store(path.join(app.getPath('appData'), 'Jarvis'));
  secretStore = new SecretStore(path.join(app.getPath('appData'), 'Jarvis'), safeStorage);
  logger = new StructuredLogger(path.join(app.getPath('appData'), 'Jarvis'));
  whisperService = new WhisperService(path.join(app.getPath('appData'), 'Jarvis'));
  const updateLocalPower = values => {
    localResourceMonitor.updatePower(values);
    if (mainWindow || orbWindow) broadcast();
  };
  updateLocalPower({ thermalState: powerMonitor.getCurrentThermalState(), onBattery: powerMonitor.isOnBatteryPower() });
  powerMonitor.on('thermal-state-change', (_event, details = {}) => updateLocalPower({ thermalState: details.state || details }));
  powerMonitor.on('speed-limit-change', (_event, details = {}) => updateLocalPower({ speedLimit: Number(details.limit ?? details) }));
  powerMonitor.on('on-battery', () => updateLocalPower({ onBattery: true }));
  powerMonitor.on('on-ac', () => updateLocalPower({ onBattery: false }));
  powerMonitor.on('resume', () => updateLocalPower({ thermalState: powerMonitor.getCurrentThermalState(), onBattery: powerMonitor.isOnBatteryPower() }));
  spotifyService = new SpotifyService({ secretStore, shell });
  googleService = new GoogleService({ secretStore, shell });
  webSearchService = new WebSearchService({ secretStore });
  githubService = new GitHubService({ secretStore });
  microsoftService = new MicrosoftService({ secretStore, shell });
  notionService = new NotionService({ secretStore });
  todoistService = new TodoistService({ secretStore });
  connectorRegistry = new ConnectorRegistry({ store, secretStore });
  if (secretStore.has('google.refreshToken')) connectorRegistry.upsert('google', { state: 'checking', accountLabel: 'Google account', grantedFeatures: JSON.parse(await secretStore.get('google.features') || '[]') });
  if (secretStore.has('spotify.refreshToken')) connectorRegistry.upsert('spotify', { state: 'checking', accountLabel: 'Spotify account', grantedFeatures: ['playback','library'] });
  if (secretStore.has('connector.tavily.token')) connectorRegistry.upsert('tavily', { state: 'checking', accountLabel: 'Tavily Free', grantedFeatures: ['research'] });
  if (secretStore.has('connector.github.token')) connectorRegistry.upsert('github', { state: 'checking', accountLabel: 'GitHub', grantedFeatures: ['repositories','issues','pullRequests','workflows','notifications'] });
  if (secretStore.has('microsoft.refreshToken')) connectorRegistry.upsert('microsoft', { state: 'checking', accountLabel: 'Microsoft 365', grantedFeatures: JSON.parse(await secretStore.get('microsoft.features') || '[]') });
  if (secretStore.has('connector.notion.token')) connectorRegistry.upsert('notion', { state: 'checking', accountLabel: 'Notion integration', grantedFeatures: ['pages','databases'] });
  if (secretStore.has('connector.todoist.token')) connectorRegistry.upsert('todoist', { state: 'checking', accountLabel: 'Todoist', grantedFeatures: ['projects','tasks'] });
  connectorHealthSupervisor = new ConnectorHealthSupervisor({
    registry: connectorRegistry,
    timeoutMs: 10_000,
    onChange: () => { if (mainWindow || orbWindow) broadcast(); },
    checks: {
      google: async record => { const profile = await googleService.profile(); return { accountLabel: profile.name || profile.email || record.accountLabel, grantedFeatures: record.grantedFeatures }; },
      spotify: async record => { const profile = await spotifyService.profile(); return { accountLabel: profile.display_name || profile.id || record.accountLabel, grantedFeatures: record.grantedFeatures }; },
      tavily: async record => { const health = await webSearchService.health(); return { ...health, accountLabel: record.accountLabel, grantedFeatures: record.grantedFeatures }; },
      github: async record => { const profile = await githubService.request('/user'); return { accountLabel: profile.login || record.accountLabel, grantedFeatures: record.grantedFeatures }; },
      microsoft: async record => { const profile = await microsoftService.request('/me?$select=displayName,userPrincipalName'); return { accountLabel: profile.displayName || profile.userPrincipalName || record.accountLabel, grantedFeatures: record.grantedFeatures }; },
      notion: async record => { const profile = await notionService.request('/users/me'); return { accountLabel: profile.name || profile.bot?.owner?.user?.name || record.accountLabel, grantedFeatures: record.grantedFeatures }; },
      todoist: async record => { await todoistService.request('/projects'); return { accountLabel: record.accountLabel, grantedFeatures: record.grantedFeatures }; }
    }
  });
  appleAutomation = new AppleAutomationService();
  browserBridge = new BrowserBridge(path.join(app.getPath('appData'), 'Jarvis'));
  browserBridge.onStatus = () => broadcast(); browserBridge.start();
  nativeBridge = new NativeBridgeClient(path.join(__dirname, '..'), { expectedProtocol: 2 });
  nativeBridge.onStatus = status => { logger?.info('native', 'status', status); if (mainWindow || orbWindow) broadcast(); };
  nativeBridge.onEvent = (event, payload) => {
    if (event === 'speech.transcript') {
      emitSpeechTranscript(payload);
      if (payload.final) { voiceListening = false; notifySpeechState({ listening: false, backend: voiceBackend }); }
    }
    if (event === 'speech.error') for (const window of [mainWindow, orbWindow]) if (window && !window.isDestroyed()) window.webContents.send('speech:error', payload.message);
  };
  nativeBridge.start();
  attachmentService = new AttachmentService({ nativeBridge });
  createMainWindow(); createOrbWindow(); createTray(); registerShortcuts(); startTimerLoop();
  diagnosticsService = new DiagnosticsService({ appVersion: app.getVersion(), root: path.join(app.getPath('appData'), 'Jarvis'), checks: {
    application: applicationSignatureHealth,
    nativeCompanion: async () => { const status = await nativeBridge.health(); return { state: status.compatible ? 'ready' : 'unavailable', summary: status.compatible ? `Native protocol ${status.protocolVersion} is ready.` : status.lastError, metadata: status }; },
    voicePermissions: async () => { const permissions = await refreshNativePermissions(); const ready = permissions.microphone === 'authorized'; return { state: ready ? (permissions.speech === 'authorized' ? 'ready' : 'degraded') : 'needsSetup', summary: ready ? 'Microphone access is available.' : 'Microphone access is required.', remediation: ready ? (permissions.speech === 'authorized' ? '' : 'Speech permission is optional when offline Whisper is installed.') : 'Request Microphone access in Connections.', metadata: permissions }; },
    offlineSpeech: async () => { const status = whisperService.status(); return { state: status.binary && (status.base || status.tiny) ? 'ready' : 'needsSetup', summary: status.binary && (status.base || status.tiny) ? 'Offline Whisper is available.' : 'Offline Whisper needs a binary and verified model.', remediation: 'Install whisper.cpp and the verified models from Connections.', metadata: status }; },
    localAI: async () => { const [resources, ollama] = await Promise.all([localResourceMonitor.assess(store.snapshot().preferences), refreshOllamaStatus()]); const ready = resources.allowed && ollama.available && ollama.hasRecommendedModel; return { state: ready ? 'ready' : 'degraded', summary: !ollama.available ? 'Ollama is not reachable on this Mac.' : !ollama.hasRecommendedModel ? 'Ollama is running, but qwen2.5:1.5b is not installed.' : resources.reason, remediation: !ollama.available ? 'Open Ollama and retry.' : !ollama.hasRecommendedModel ? 'Install qwen2.5:1.5b in Ollama.' : '', metadata: { ...ollama, code: resources.code, cpuPercent: resources.cpuPercent, memoryFreePercent: resources.memoryFreePercent, thermalState: resources.thermalState, onBattery: resources.onBattery } }; },
    cloudAI: async () => ({ state: hasAIRoute() ? 'ready' : 'needsSetup', summary: hasAIRoute() ? 'At least one verified-free AI route is available.' : 'No verified-free cloud route is ready.', remediation: 'Save and verify a free provider route in Connections.' }),
    browserBridge: async () => ({ state: browserBridge.connected ? 'ready' : 'needsSetup', summary: browserBridge.connected ? 'Chrome extension bridge is connected.' : 'Chrome extension bridge is not connected.', remediation: 'Open extension setup from Connections.' }),
    google: async () => { const record = await connectorHealthSupervisor.refresh('google'); return { state: record.state, summary: record.state === 'ready' ? `Google is connected as ${record.accountLabel}.` : 'Google is optional and not ready.', remediation: record.remediation, metadata: { grantedFeatures: record.grantedFeatures || [] } }; },
    spotify: async () => { const installed = fs.existsSync('/Applications/Spotify.app'); const record = connectorRegistry.record('spotify'); const checked = record ? await connectorHealthSupervisor.refresh('spotify') : null; return { state: installed || checked?.state === 'ready' ? 'ready' : 'needsSetup', summary: installed ? 'Spotify desktop control is available without Premium.' : checked?.state === 'ready' ? `Spotify OAuth is connected as ${checked.accountLabel}.` : 'Spotify is optional and not installed.', remediation: checked?.remediation || '', metadata: { desktopInstalled: installed, oauthConnected: checked?.state === 'ready' } }; },
    tavily: async () => { const record = await connectorHealthSupervisor.refresh('tavily'); return { state: record.state, summary: record.state === 'ready' ? 'Tavily grounded research is ready.' : 'Tavily is optional and not ready.', remediation: record.remediation }; },
    github: async () => { const record = await connectorHealthSupervisor.refresh('github'); return { state: record.state, summary: record.state === 'ready' ? `GitHub is connected as ${record.accountLabel}.` : 'GitHub is optional and not ready.', remediation: record.remediation, metadata: { grantedFeatures: record.grantedFeatures || [] } }; },
    microsoft: async () => { const record = await connectorHealthSupervisor.refresh('microsoft'); return { state: record.state, summary: record.state === 'ready' ? `Microsoft 365 is connected as ${record.accountLabel}.` : 'Microsoft 365 is optional and not ready.', remediation: record.remediation, metadata: { grantedFeatures: record.grantedFeatures || [] } }; },
    notion: async () => { const record = await connectorHealthSupervisor.refresh('notion'); return { state: record.state, summary: record.state === 'ready' ? `Notion is connected as ${record.accountLabel}.` : 'Notion is optional and not ready.', remediation: record.remediation }; },
    todoist: async () => { const record = await connectorHealthSupervisor.refresh('todoist'); return { state: record.state, summary: record.state === 'ready' ? 'Todoist is connected.' : 'Todoist is optional and not ready.', remediation: record.remediation }; },
    shortcuts: async () => ({ state: fs.existsSync('/usr/bin/shortcuts') ? 'ready' : 'unavailable', summary: fs.existsSync('/usr/bin/shortcuts') ? 'macOS Shortcuts is available.' : 'The Shortcuts command is unavailable.' }),
    windows: async () => ({ state: mainWindow && orbWindow && tray ? 'ready' : 'unavailable', summary: mainWindow && orbWindow && tray ? 'Main window, tray, and floating assistant are available.' : 'A Jarvis window component is missing.' })
  } });
  logger.info('lifecycle', 'ready', { version: app.getVersion(), packaged: PACKAGED_RUNTIME });
  refreshNativeSpeechCapabilities().catch(() => {});
  setTimeout(() => refreshNativeSpeechCapabilities().catch(() => {}), 3_000);
  // Permission prompts are user initiated from Setup or Connections. Launch-time
  // prompts are easy to miss and can be attributed to the wrong app by macOS.
  refreshNativePermissions().catch(() => {});
  localResourceMonitor.assess(store.snapshot().preferences).then(() => broadcast()).catch(() => {});
  refreshOllamaStatus().then(() => broadcast()).catch(() => {});
  connectorHealthSupervisor.refreshAll().then(() => broadcast()).catch(error => logger.warn('connections', 'health-refresh-failed', { message: error.message }));
  routineScheduler = new RoutineScheduler({
    getState: () => { const state = store.snapshot(); state.routines = state.routines.map(routine => ({ ...routine, confirm: routine.confirm || Boolean(routine.prompt) || routine.steps.some(step => requiresConfirmation(step.kind, state.preferences)) })); return state; },
    saveSchedule: schedule => { const existing = store.snapshot().schedules.some(item => item.id === schedule.id); existing ? store.update('schedules', schedule.id, schedule) : store.add('schedules', schedule); broadcast(); },
    onRun: async routine => { const startedAt = new Date().toISOString(); try { const message = await runRoutine(routine.name, true); record({ originalText: `Scheduled ${routine.name}`, intent: 'startRoutine', riskLevel: 'low' }, 'success', message, startedAt, { scheduled: true }); } catch (error) { record({ originalText: `Scheduled ${routine.name}`, intent: 'startRoutine', riskLevel: 'low' }, 'failed', error.message, startedAt, { scheduled: true }); } },
    onSuggestion: (routine, lateness) => new Notification({ title: `${routine.name} is ready`, body: lateness > 300_000 ? 'A scheduled run was missed while Jarvis was unavailable. Open Jarvis to run it.' : 'This routine requires confirmation. Open Jarvis to review it.' }).show()
  });
  routineScheduler.start();
  app.on('activate', () => { if (!mainWindow) createMainWindow(); else { mainWindow.show(); mainWindow.focus(); } });

  trustedHandle('state:get', () => publicState());
  trustedHandle('clipboard:write', (_e, value) => { clipboard.writeText(String(value || '').slice(0, 200_000)); return true; });
  trustedHandle('request:dispatch', async (_e, payload = {}) => {
    const request = normalizeRequestInput(payload); const text = request.text; const privateMode = request.privateMode; const attachmentIds = request.attachmentIds;
    const localStarted = performance.now(); const command = request.capabilityId ? capabilityCommand(request.capabilityId, request.parameters, text) : localPreview(text);
    try {
      if (command.intent !== 'unknown' && command.confidence >= .8) {
        const disposition = normalizeRequestDisposition({ kind: 'localAction', confidence: command.confidence, reasons: [request.capabilityId ? 'structured capability request' : 'deterministic capability match'], durationMs: performance.now() - localStarted });
        if (!command.requiresConfirmation && command.riskLevel === 'low') {
          const startedAt = new Date().toISOString(); const message = store.snapshot().preferences.demoMode ? `Demo only: would ${command.action.charAt(0).toLowerCase()}${command.action.slice(1)}` : await runInternal(command, false);
          if (!privateMode) record(command, store.snapshot().preferences.demoMode ? 'demo' : 'success', message, startedAt, { source: request.source, correlationId: request.correlationId });
          return { kind: 'actionResult', disposition, ok: true, answer: message, message, command, state: publicState() };
        }
        return { kind: 'localAction', disposition, command };
      }
      const disposition = normalizeRequestDisposition(classifyRequestDisposition(text));
      if (disposition.kind === 'localReply') {
        const conversationId = ensureConversation(privateMode);
        store.addMessage(conversationId, 'user', text, { localReply: true }, privateMode);
        store.addMessage(conversationId, 'assistant', disposition.reply, { localReply: true, timings: { routingMs: Math.round(performance.now() - localStarted), firstTokenMs: 0, completionMs: Math.round(performance.now() - localStarted) } }, privateMode);
        broadcast(); return { kind: 'localReply', disposition, answer: disposition.reply, state: publicState() };
      }
      if (disposition.kind === 'conversation') {
        const answer = await runAIRequest(text, privateMode, attachmentIds);
        return { kind: 'conversation', disposition, answer, state: publicState() };
      }
      if (!hasAIRoute()) { const error = new Error('This looks like a device action I do not recognize yet. Connect a free AI planner or name the app, site, file, or capability more directly.'); error.code = 'ACTION_UNRESOLVED'; throw error; }
      const planned = await planPreview(text, privateMode, attachmentIds);
      return { kind: 'actionCandidate', disposition, command: planned };
    } finally { for (const id of attachmentIds) attachmentCloudApprovals.delete(id); }
  });
  trustedHandle('command:parse', async (_e, payload) => {
    const attachmentIds = typeof payload === 'string' ? [] : Array.isArray(payload?.attachmentIds) ? payload.attachmentIds : [];
    try { return await planPreview(typeof payload === 'string' ? payload : String(payload?.text || ''), typeof payload === 'string' ? false : Boolean(payload?.privateMode), attachmentIds); }
    finally { for (const id of attachmentIds) attachmentCloudApprovals.delete(id); }
  });
  trustedHandle('command:execute', async (_e, payload) => {
    const startedAt = new Date().toISOString(); const planned = payload.planId ? pendingPlans.get(payload.planId) : null; const command = planned?.command || parsedPreview(payload.text);
    if (command.intent === 'askAI') command.parameters.privateMode = Boolean(payload.privateMode);
    try {
      if (command.confidence < .5 || command.intent === 'unknown') throw new Error('I do not support that command yet. Try opening an app, starting a timer, searching, or running a routine.');
      if (command.confidence < .8) throw new Error('I am not confident enough to act. Please add a little more detail.');
      if (payload.privateMode && command.intent === 'saveMemory') throw new Error('Private Mode does not write to Memory. Turn it off before saving this fact.');
      if (!['askAI', 'cachedAIAnswer', 'executePlan'].includes(command.intent)) {
        if (!capabilityRegistry.get(command.intent)) throw new Error(`The command maps to an unavailable capability: ${command.intent}.`);
        capabilityRegistry.validate(command.intent, command.parameters || {});
      }
      if (command.requiresConfirmation && !payload.confirmed) { const error = new Error('Review and confirm this action first.'); error.code = 'CONFIRMATION_REQUIRED'; throw error; }
      if (store.snapshot().preferences.demoMode) { const message = `Demo only: would ${command.action.charAt(0).toLowerCase()}${command.action.slice(1)}`; if (!payload.privateMode) record(command, 'demo', message, startedAt); return { ok: true, message, command, state: publicState() }; }
      const message = planned ? await executePendingPlan(planned, Boolean(payload.confirmed)) : await runInternal(command, Boolean(payload.confirmed)); if (!payload.privateMode) record(command, 'success', message, startedAt); return { ok: true, message, command, state: publicState() };
    } catch (error) {
      if (error.code !== 'CONFIRMATION_REQUIRED' && !payload.privateMode) record(command, 'failed', error.message, startedAt);
      return { ok: false, code: error.code || 'ACTION_FAILED', message: error.message, command, state: publicState() };
    }
  });
  trustedHandle('preferences:update', async (_e, patch) => {
    const allowed = ['onboardingComplete','setupStep','setupSkipped','demoMode','showFloatingAssistant','keepJarvisAvailable','defaultBrowser','searchEngine','preferredEditor','preferredMusicApp','appearance','accent','reduceMotion','voiceInputEnabled','voiceBackendPreference','voiceLocale','whisperModelPreference','whisperModelsAcknowledged','spokenRepliesEnabled','allowOnlineSpeechFallback','automaticMemoryEnabled','memoryExcludedCategories','conversationHistoryEnabled','activityTrackingEnabled','insightsEnabled','developerModeEnabled','confirmMediumRisk','screenContextEnabled','attachmentCloudApprovalMode','localAIEnabled','localAIAllowOnBattery','aiProvider','aiModel','aiBaseURL','spotifyClientId','googleClientId','microsoftClientId','tavilyFreePlanConfirmed'];
    const safe = Object.fromEntries(Object.entries(patch || {}).filter(([key]) => allowed.includes(key)));
    if (safe.activityTrackingEnabled === false) { store.clearActivity(); sessionActivity = []; }
    store.updatePreferences(safe);
    if ('localAIEnabled' in safe || 'localAIAllowOnBattery' in safe) await localResourceMonitor.assess(store.snapshot().preferences);
    if ('showFloatingAssistant' in safe) safe.showFloatingAssistant ? orbWindow.showInactive() : orbWindow.hide();
    if ('keepJarvisAvailable' in safe && PACKAGED_RUNTIME) app.setLoginItemSettings({ openAtLogin: Boolean(safe.keepJarvisAvailable), openAsHidden: true });
    broadcast(); return publicState();
  });
  trustedHandle('ai:list-models', async (_e, payload = {}) => {
    const provider = String(payload.provider || '');
    if (!PROVIDERS[provider]) throw new Error('Choose a supported AI provider.');
    const rawSupplied = Array.isArray(payload.apiKeys) ? payload.apiKeys.map(value => String(value || '').trim()) : [String(payload.apiKey || '').trim()];
    const supplied = rawSupplied.filter(Boolean);
    if (provider === 'mistral' && payload.confirmations?.mistral !== true && store.snapshot().preferences.aiFreeTierConfirmations?.mistral !== true) throw new Error('Confirm Mistral Free mode with no Scale billing before loading models.');
    if (provider === 'nvidia' && payload.confirmations?.nvidia !== true && store.snapshot().preferences.aiFreeTierConfirmations?.nvidia !== true) throw new Error('Confirm NVIDIA Developer Program free prototyping use before loading models.');
    let keys;
    if (['ollama','lmstudio'].includes(provider)) keys = [];
    else if (supplied.length) keys = supplied;
    else if (['groq', 'mistral', 'nvidia'].includes(provider) && payload.confirmations?.[provider] === true) { const stored = await secretStore.get(`ai.key.${provider}`); keys = stored ? [stored] : []; }
    else keys = await providerKeys(provider);
    const models = await listModels({ provider, key: keys, baseURL: String(payload.baseURL || '').trim() });
    if (supplied.length) await saveAICredentials({ [provider]: provider === 'gemini' ? rawSupplied : supplied[0] }, payload.confirmations || null);
    const snapshot = store.snapshot();
    store.updatePreferences({ aiFreeCatalogs: { ...(snapshot.preferences.aiFreeCatalogs || {}), [provider]: { checkedAt: new Date().toISOString(), models } } });
    reconcileProviderFreeRoutes(provider);
    broadcast();
    return models;
  });
  trustedHandle('ai:check-local-resources', async () => {
    await Promise.all([localResourceMonitor.assess(store.snapshot().preferences), refreshOllamaStatus()]);
    broadcast();
    return localResourceMonitor.status();
  });
  trustedHandle('ollama:install-recommended', async () => {
    const response = await fetch('http://127.0.0.1:11434/api/pull', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'qwen2.5:1.5b', stream: false }), signal: AbortSignal.timeout(15 * 60_000) });
    if (!response.ok) throw new Error(`Ollama model installation failed with HTTP ${response.status}.`);
    await response.text(); await refreshOllamaStatus(); broadcast(); return ollamaStatus;
  });
  trustedHandle('connection:save-ai-waterfall', (_e, payload = {}) => saveAIRoute(payload.route || [], payload.keys || {}, payload.taskRoutes || null, payload.confirmations || null));
  trustedHandle('connection:save-ai-credentials', (_e, payload = {}) => saveAICredentials(payload.keys || {}, payload.confirmations || null));
  trustedHandle('connection:save-ai', async (_e, payload = {}) => {
    const provider = String(payload.provider || '');
    return saveAIRoute([{ id: crypto.randomUUID(), provider, model: String(payload.model || DEFAULT_MODELS[provider] || ''), baseURL: String(payload.baseURL || ''), enabled: true }], { [provider]: payload.apiKey }, null, payload.confirmations || null);
  });
  trustedHandle('connection:disconnect-ai', () => {
    for (const provider of Object.keys(PROVIDERS)) secretStore.remove(`ai.key.${provider}`);
    for (let index = 0; index < 5; index += 1) secretStore.remove(`ai.key.gemini.${index}`);
    secretStore.remove('ai.apiKey');
    store.updatePreferences({ aiWaterfall: cloneWaterfallDefaults(), aiTaskRoutes: cloneTaskDefaults(), aiFreeTierConfirmations: { gemini: [false, false, false, false, false], groq: false, mistral: false, nvidia: false }, aiProvider: 'none', aiModel: '', aiBaseURL: '' });
    lastAIRouteStatus = null;
    broadcast(); return true;
  });
  trustedHandle('connection:connect-spotify', async (_e, clientId) => { store.updatePreferences({ spotifyClientId: String(clientId || '').trim() }); const profile = await spotifyService.connect(clientId); connectorRegistry.upsert('spotify', { state: 'ready', accountLabel: profile.display_name || profile.id, grantedFeatures: ['playback','library'], grantedScopes: ['user-read-playback-state','user-modify-playback-state','playlist-modify-private'] }); broadcast(); return { id: profile.id, displayName: profile.display_name || profile.id, product: profile.product }; });
  trustedHandle('connection:disconnect-spotify', () => { spotifyService.disconnect(); connectorRegistry.remove('spotify'); broadcast(); return true; });
  trustedHandle('connection:connect-google', async (_e, payload = {}) => { const clientId = String(payload.clientId || '').trim(); const features = payload.features || ['gmail','calendar','drive','contacts','tasks']; store.updatePreferences({ googleClientId: clientId }); const profile = await googleService.connect(clientId, features); connectorRegistry.upsert('google', { state: 'ready', accountLabel: profile.name || profile.email, grantedFeatures: features, grantedScopes: features }); broadcast(); return { email: profile.email, name: profile.name || profile.email }; });
  trustedHandle('connection:disconnect-google', () => { googleService.disconnect(); connectorRegistry.remove('google'); broadcast(); return true; });
  trustedHandle('connection:connect-service', async (_e, payload = {}) => {
    const id = String(payload.connectorId || ''); const token = String(payload.token || '').trim(); let result;
    if (id === 'tavily') {
      if (payload.freePlanConfirmed !== true) throw new Error('Confirm that this Tavily key belongs to the free Researcher plan.');
      if (!token) throw new Error('Enter a Tavily API key.');
      await secretStore.set('connector.tavily.token', token); await secretStore.set('connector.tavily.freeConfirmed', 'true'); store.updatePreferences({ tavilyFreePlanConfirmed: true });
      try { await webSearchService.search('Jarvis connection test', { limit: 1 }); } catch (error) { secretStore.remove('connector.tavily.token'); secretStore.remove('connector.tavily.freeConfirmed'); throw error; }
      result = { accountLabel: 'Tavily Free', features: ['research'] };
    } else if (id === 'github') result = await githubService.connect(token);
    else if (id === 'notion') result = await notionService.connect(token);
    else if (id === 'todoist') result = await todoistService.connect(token);
    else if (id === 'microsoft') { store.updatePreferences({ microsoftClientId: String(payload.clientId || '').trim() }); result = await microsoftService.connect(payload.clientId, payload.features); }
    else throw new Error('That connector is not supported.');
    connectorRegistry.upsert(id, { state: 'ready', accountLabel: result.accountLabel, grantedFeatures: result.features || [], grantedScopes: result.scopes || result.features || [], remediation: '' }); broadcast(); return result;
  });
  trustedHandle('connection:disconnect-service', (_e, connectorId) => {
    const id = String(connectorId || '');
    if (id === 'tavily') { secretStore.remove('connector.tavily.token'); secretStore.remove('connector.tavily.freeConfirmed'); store.updatePreferences({ tavilyFreePlanConfirmed: false }); }
    else if (id === 'github') githubService.disconnect(); else if (id === 'notion') notionService.disconnect(); else if (id === 'todoist') todoistService.disconnect(); else if (id === 'microsoft') microsoftService.disconnect(); else throw new Error('That connector is not supported.');
    connectorRegistry.remove(id); broadcast(); return true;
  });
  trustedHandle('connection:install-browser', async () => {
    const host = PACKAGED_RUNTIME ? path.join(process.resourcesPath, 'browser-host.cjs') : path.join(__dirname, 'browser-host.cjs');
    const extension = PACKAGED_RUNTIME ? path.join(process.resourcesPath, 'browser-extension') : path.join(__dirname, '..', 'browser-extension');
    browserBridge.installNativeHost('eadpekpcegaonnlpkminfmfcmdhbfhoj', host);
    await shell.openPath(extension);
    return { extensionId: 'eadpekpcegaonnlpkminfmfcmdhbfhoj', folder: extension };
  });
  trustedHandle('native:status', () => ({ available: nativeBridge.available, listening: voiceListening }));
  trustedHandle('native:request', async (_e, request = {}) => {
    const allowed = new Set(['permissions.status', 'permissions.request', 'speech.speak', 'screen.ocr', 'window.action']);
    if (!allowed.has(request.method)) throw new Error('That native method is not exposed to the renderer.');
    const result = await nativeBridge.request(request.method, request.params || {});
    if (request.method.startsWith('permissions.')) { nativePermissionStatus = result; broadcast(); }
    return result;
  });
  trustedHandle('permissions:request-voice', () => requestVoicePermissions());
  trustedHandle('permissions:open-settings', async (_e, kind = 'microphone') => {
    const pane = kind === 'speech' ? 'Privacy_SpeechRecognition' : 'Privacy_Microphone';
    await shell.openExternal(`x-apple.systempreferences:com.apple.preference.security?${pane}`);
    return true;
  });
  trustedHandle('speech:open-dictation-settings', async () => {
    await shell.openExternal('x-apple.systempreferences:com.apple.Keyboard-Settings.extension');
    return true;
  });
  trustedHandle('speech:toggle', event => { voiceTarget = event.sender.id === mainWindow?.webContents.id ? 'main' : 'orb'; return toggleVoice(); });
  trustedHandle('conversation:new', (_e, privateMode = false) => { const conversation = store.createConversation('New conversation', Boolean(privateMode)); activeConversationId = privateMode ? null : conversation.id; broadcast(); return conversation; });
  trustedHandle('conversation:open', (_e, id) => { const value = store.snapshot().conversations.find(item => item.id === String(id || '')); if (!value) throw new Error('Conversation not found.'); activeConversationId = value.id; broadcast(); return value; });
  trustedHandle('conversation:rename', (_e, payload = {}) => { const title = String(payload.title || '').trim().slice(0, 100); if (!title) throw new Error('Conversation title is required.'); const value = store.update('conversations', String(payload.id || ''), { title }); broadcast(); return value; });
  trustedHandle('conversation:delete', (_e, id) => { const conversationId = String(id || ''); store.remove('conversations', conversationId); for (const message of store.snapshot().messages.filter(item => item.conversationId === conversationId)) store.remove('messages', message.id); if (activeConversationId === conversationId) activeConversationId = null; broadcast(); return true; });
  trustedHandle('attachment:choose', async (_e, payload = {}) => {
    const result = await dialog.showOpenDialog(mainWindow, { title: 'Attach local documents', properties: ['openFile', 'multiSelections'], filters: [{ name: 'Supported documents', extensions: ['txt','md','markdown','json','csv','tsv','js','cjs','mjs','ts','tsx','jsx','css','html','swift','py','rb','go','rs','java','kt','sh','zsh','yaml','yml','toml','xml','sql','pdf','png','jpg','jpeg','heic','tiff','tif','gif','webp'] }] });
    if (result.canceled) return [];
    const values = [];
    for (const file of result.filePaths.slice(0, 10)) {
      const record = await attachmentService.extract(file);
      if (payload.privateMode) sessionAttachments.set(record.id, record); else store.add('attachments', record);
      values.push({ ...record, text: undefined, excerpt: record.text.slice(0, 240) });
    }
    broadcast(); return values;
  });
  trustedHandle('attachment:remove', (_e, payload = {}) => { const id = String(payload.id || payload || ''); attachmentCloudApprovals.delete(id); if (sessionAttachments.has(id)) sessionAttachments.delete(id); else if (store.snapshot().attachments.some(item => item.id === id)) store.remove('attachments', id); broadcast(); return true; });
  trustedHandle('attachment:approve-cloud', (_e, ids = []) => { for (const id of Array.isArray(ids) ? ids : []) if (sessionAttachments.has(id) || store.snapshot().attachments.some(item => item.id === id)) attachmentCloudApprovals.add(id); broadcast(); return true; });
  trustedHandle('whisper:status', () => whisperService.status());
  trustedHandle('whisper:install-binary', async () => { const status = await whisperService.installBinary(); broadcast(); return status; });
  trustedHandle('whisper:install', async (event, name) => { const model = ['base','tiny'].includes(name) ? name : 'base'; const status = await whisperService.install(model, progress => event.sender.send('whisper:progress', { model, ...progress })); broadcast(); return status; });
  trustedHandle('whisper:remove', (_e, name) => { const status = whisperService.remove(['base','tiny'].includes(name) ? name : 'base'); broadcast(); return status; });
  trustedHandle('diagnostics:run', async () => { lastDiagnosticReport = await diagnosticsService.run(); logger.info('diagnostics', 'completed', lastDiagnosticReport.summary); broadcast(); return lastDiagnosticReport; });
  trustedHandle('diagnostics:export', async () => { if (!lastDiagnosticReport) lastDiagnosticReport = await diagnosticsService.run(); const result = await dialog.showSaveDialog(mainWindow, { title: 'Export Jarvis diagnostics', defaultPath: `Jarvis-Diagnostics-${new Date().toISOString().slice(0,10)}.json`, filters: [{ name: 'JSON', extensions: ['json'] }] }); if (result.canceled || !result.filePath) return null; return diagnosticsService.export(lastDiagnosticReport, result.filePath); });
  trustedHandle('collection:add', (_e, { collection, item }) => { const value = { ...item, id: crypto.randomUUID(), createdAt: new Date().toISOString() }; store.add(collection, value); broadcast(); return value; });
  trustedHandle('collection:update', (_e, { collection, id, patch }) => { const value = store.update(collection, id, patch); broadcast(); return value; });
  trustedHandle('collection:remove', (_e, { collection, id }) => { store.remove(collection, id); if (collection === 'routines') for (const schedule of store.snapshot().schedules.filter(item => item.routineId === id)) store.remove('schedules', schedule.id); broadcast(); return true; });
  trustedHandle('activity:clear', () => { store.clearActivity(); sessionActivity = []; broadcast(); return true; });
  trustedHandle('memory:open-file', async () => { const error = await shell.openPath(store.memoryFile); if (error) throw new Error(error); return true; });
  trustedHandle('dialog:choose-folder', async (_e, kind) => { const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory', 'createDirectory'], title: kind === 'project' ? 'Choose a trusted project' : 'Choose a favorite folder' }); if (result.canceled) return null; const folder = canonical(result.filePaths[0]); const item = { id: crypto.randomUUID(), name: path.basename(folder), path: folder, createdAt: new Date().toISOString() }; store.add(kind === 'project' ? 'trustedProjects' : 'favoriteFolders', item); broadcast(); return item; });
  trustedHandle('data:export', async () => {
    const result = await dialog.showSaveDialog(mainWindow, { defaultPath: 'Jarvis Export.json' }); if (result.canceled) return false;
    const exported = publicState(); delete exported.connectionStatus;
    fs.writeFileSync(result.filePath, JSON.stringify({ ...exported, exportedAt: new Date().toISOString(), secretsIncluded: false }, null, 2), { mode: 0o600 }); return true;
  });
  trustedHandle('data:import', async () => {
    const result = await dialog.showOpenDialog(mainWindow, { properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }] }); if (result.canceled) return false;
    const file = result.filePaths[0]; const stats = fs.statSync(file); if (stats.size > 20_000_000) throw new Error('Jarvis imports JSON files up to 20 MB.');
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!data || typeof data !== 'object' || Number(data.schemaVersion || 1) > 3) throw new Error('This Jarvis export version is not supported.');
    const keys = ['routines','memories','notes','trustedProjects','favoriteFolders','appAliases','conversations','messages','schedules'];
    const clean = value => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Imported collection items must be objects.');
      const entries = Object.entries(value).filter(([key]) => !['__proto__','prototype','constructor'].includes(key));
      const item = Object.fromEntries(entries); if (JSON.stringify(item).length > 1_000_000) throw new Error('An imported item is too large.'); return item;
    };
    await store.backupDatabase();
    for (const key of keys) if (Array.isArray(data[key])) { if (data[key].length > 10_000) throw new Error(`${key} contains too many items.`); store.state[key] = data[key].map(clean); }
    for (const key of ['trustedProjects','favoriteFolders']) store.state[key] = store.state[key].filter(item => { const resolved = canonical(String(item.path || '')); return resolved.startsWith(`${app.getPath('home')}${path.sep}`) && resolved !== app.getPath('home'); }).map(item => ({ ...item, path: canonical(item.path) }));
    store.save(); broadcast(); return true;
  });
  trustedHandle('timer:control', (_e, action) => controlTimer(action));
  trustedHandle('action:cancel', () => { const error = Object.assign(new Error('Cancelled by the user.'), { code: 'USER_CANCELLED' }); if (activeAIController) activeAIController.abort(error); return routineCoordinator.cancel() || Boolean(activeAIController); });
  trustedOn('window:show-main', () => { mainWindow.show(); mainWindow.focus(); });
  trustedOn('window:hide-orb', hideOrb); trustedOn('window:collapse-orb', collapseOrb); trustedOn('window:expand-orb', activateOrb); trustedOn('orb:activate', event => { if (event.sender.id === orbWindow?.webContents.id) activateOrb(); });
  trustedOn('orb:drag', (event, payload = {}) => {
    if (!orbWindow || orbWindow.isDestroyed() || event.sender.id !== orbWindow.webContents.id || orbMode !== 'collapsed') return;
    if (payload.phase === 'start') { orbDragging = true; return; }
    if (payload.phase === 'move' && Number.isFinite(payload.x) && Number.isFinite(payload.y) && Number.isFinite(payload.screenX) && Number.isFinite(payload.screenY)) {
      orbDragging = true;
      const area = screen.getDisplayNearestPoint({ x: Math.round(payload.screenX), y: Math.round(payload.screenY) }).workArea;
      const x = Math.max(area.x, Math.min(Math.round(payload.x), area.x + area.width - ORB_SIZE));
      const y = Math.max(area.y, Math.min(Math.round(payload.y), area.y + area.height - ORB_SIZE));
      orbWindow.setPosition(x, y, false);
      return;
    }
    if (payload.phase === 'end') { orbDragging = false; snapOrbToNearestAnchor(); }
  });
  trustedOn('app:quit', () => { app.isQuitting = true; app.quit(); });
});

app.on('second-instance', () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } });
app.on('before-quit', () => { app.isQuitting = true; globalShortcut.unregisterAll(); clearInterval(timerInterval); localResourceMonitor.shutdown(); routineScheduler?.stop(); nativeBridge?.stop(); browserBridge?.stop(); store?.close(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin' || !store?.snapshot().preferences.keepJarvisAvailable) app.quit(); });
