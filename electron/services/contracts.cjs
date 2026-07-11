const crypto = require('node:crypto');

const RISK_LEVELS = Object.freeze(['low', 'medium', 'high']);
const CONFIRMATION_POLICIES = Object.freeze(['none', 'plan', 'at-execution']);
const VOICE_BACKENDS = Object.freeze(['appleOnDevice', 'whisperBase', 'whisperTiny', 'appleOnline', 'unavailable']);
const CONNECTION_STATES = Object.freeze(['ready', 'degraded', 'unavailable', 'needsSetup', 'checking']);
const REQUEST_DISPOSITIONS = Object.freeze(['localReply', 'conversation', 'localAction', 'actionCandidate']);
const REQUEST_SOURCES = Object.freeze(['typed', 'voice', 'orb', 'button', 'routine', 'ai', 'schedule']);

function boundedText(value, maximum = 20_000) {
  return String(value ?? '').replace(/\0/g, '').slice(0, maximum);
}

function actionRequest(source = {}) {
  const capabilityId = boundedText(source.capabilityId || source.intent, 100).trim();
  if (!capabilityId || !/^[a-z][a-zA-Z0-9]{1,99}$/.test(capabilityId)) throw new Error('ActionRequest requires a valid capability identifier.');
  const parameters = source.parameters || source.input || {};
  if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters)) throw new Error('ActionRequest parameters must be an object.');
  return Object.freeze({
    id: source.id || crypto.randomUUID(),
    correlationId: source.correlationId || crypto.randomUUID(),
    source: REQUEST_SOURCES.includes(source.source) ? source.source : 'typed',
    capabilityId,
    parameters: structuredClone(parameters),
    attachmentIds: Array.isArray(source.attachmentIds) ? source.attachmentIds.slice(0, 20).map(value => boundedText(value, 100)) : [],
    context: source.context && typeof source.context === 'object' ? structuredClone(source.context) : {},
    createdAt: source.createdAt || new Date().toISOString()
  });
}

function requestInput(source = {}) {
  const text = boundedText(source.text, 32_000).trim();
  const capabilityId = source.capabilityId == null ? null : boundedText(source.capabilityId, 100).trim();
  if (!text && !capabilityId) throw new Error('RequestInput requires text or a capability identifier.');
  if (capabilityId && !/^[a-z][a-zA-Z0-9]{1,99}$/.test(capabilityId)) throw new Error('RequestInput has an invalid capability identifier.');
  const parameters = source.parameters || {};
  if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters)) throw new Error('RequestInput parameters must be an object.');
  return Object.freeze({
    id: source.id || crypto.randomUUID(),
    correlationId: source.correlationId || crypto.randomUUID(),
    source: REQUEST_SOURCES.includes(source.source) ? source.source : 'typed',
    text,
    capabilityId,
    parameters: structuredClone(parameters),
    attachmentIds: Array.isArray(source.attachmentIds) ? source.attachmentIds.slice(0, 20).map(value => boundedText(value, 100)) : [],
    conversationId: source.conversationId == null ? null : boundedText(source.conversationId, 100),
    privateMode: source.privateMode === true,
    context: source.context && typeof source.context === 'object' ? structuredClone(source.context) : {},
    createdAt: source.createdAt || new Date().toISOString()
  });
}

function executionResult(source = {}) {
  return Object.freeze({
    ok: source.ok === true,
    status: source.status || (source.ok ? 'succeeded' : 'failed'),
    summary: boundedText(source.summary || source.message, 32_000),
    output: source.output === undefined ? null : structuredClone(source.output),
    sideEffects: Array.isArray(source.sideEffects) ? source.sideEffects.slice(0, 50).map(item => boundedText(item, 500)) : [],
    recoverable: source.recoverable !== false,
    durationMs: Math.max(0, Number(source.durationMs || 0)),
    completedAt: source.completedAt || new Date().toISOString()
  });
}

function connectionHealth(service, source = {}) {
  const state = CONNECTION_STATES.includes(source.state) ? source.state : 'unavailable';
  return Object.freeze({
    service: boundedText(service, 100), state,
    summary: boundedText(source.summary, 500),
    remediation: boundedText(source.remediation, 1_000),
    latencyMs: Number.isFinite(source.latencyMs) ? Math.max(0, source.latencyMs) : null,
    checkedAt: source.checkedAt || new Date().toISOString(),
    metadata: source.metadata && typeof source.metadata === 'object' ? structuredClone(source.metadata) : {}
  });
}

function diagnosticReport(checks, source = {}) {
  const values = Array.isArray(checks) ? checks : [];
  return Object.freeze({
    id: source.id || crypto.randomUUID(),
    generatedAt: source.generatedAt || new Date().toISOString(),
    appVersion: boundedText(source.appVersion || 'unknown', 50),
    platform: boundedText(source.platform || process.platform, 50),
    architecture: boundedText(source.architecture || process.arch, 50),
    checks: values,
    summary: {
      ready: values.filter(item => item.state === 'ready').length,
      degraded: values.filter(item => item.state === 'degraded').length,
      needsSetup: values.filter(item => item.state === 'needsSetup').length,
      unavailable: values.filter(item => item.state === 'unavailable').length
    }
  });
}

function requestDisposition(source = {}) {
  if (!REQUEST_DISPOSITIONS.includes(source.kind)) throw new Error('RequestDisposition requires a supported kind.');
  return Object.freeze({
    kind: source.kind,
    confidence: Math.max(0, Math.min(1, Number(source.confidence || 0))),
    reasons: Array.isArray(source.reasons) ? source.reasons.slice(0, 8).map(value => boundedText(value, 200)) : [],
    reply: source.reply == null ? null : boundedText(source.reply, 2_000),
    durationMs: Math.max(0, Number(source.durationMs || 0))
  });
}

module.exports = {
  RISK_LEVELS, CONFIRMATION_POLICIES, VOICE_BACKENDS, CONNECTION_STATES, REQUEST_DISPOSITIONS, REQUEST_SOURCES,
  requestInput, actionRequest, executionResult, connectionHealth, diagnosticReport, requestDisposition, boundedText
};
