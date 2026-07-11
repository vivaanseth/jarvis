const LOCAL_REPLIES = Object.freeze([
  { pattern: /^(?:hi|hello|hey|hiya|howdy)(?:\s+(?:there|jarvis))?[!.?]*$/i, reply: 'Hello. What can I help with?' },
  { pattern: /^(?:thanks|thank you|thank you jarvis|thanks jarvis)[!.?]*$/i, reply: 'You’re welcome.' },
  { pattern: /^(?:goodbye|bye|see you|see you later|good night)(?:\s+jarvis)?[!.?]*$/i, reply: 'Goodbye.' }
]);

const CONVERSATION_OPENERS = /^(?:who|what|when|where|why|which|how(?:\s+do|\s+does|\s+did|\s+can|\s+could|\s+would|\s+should|\s+is|\s+are|\s+was|\s+were|\s+many|\s+much|\s+long|\s+old)?|explain|tell me|teach me|describe|compare|analy[sz]e|brainstorm|translate|summari[sz]e|rewrite|rephrase|draft|write)\b/i;
const CONTENT_WRITING = /^(?:write|draft|rewrite|rephrase|polish|compose|summari[sz]e|translate)\b(?!.*\b(?:file|folder|calendar|reminder|shortcut)\b)/i;
const ACTION_VERB = /\b(?:organize|move|rename|duplicate|delete|trash|download|upload|install|uninstall|schedule|book|send|post|publish|submit|open|launch|quit|close|hide|switch|set|turn|lock|restart|shut\s*down|run|execute|create)\b/i;
const ACTION_OBJECT = /\b(?:apps?|applications?|files?|folders?|finder|browser|tabs?|calendar|events?|reminders?|messages?|emails?|notifications?|spotify|music|volume|mac|computer|display|settings|shortcuts?|terminal|project|trash|clipboard|screenshots?)\b/i;
const POLITE_ACTION = /^(?:please\s+)?(?:can|could|would|will)\s+you\b/i;
const SEQUENCE = /\b(?:and then|then|after that|followed by)\b/i;

function localReplyFor(input) {
  const text = String(input || '').trim().replace(/\s+/g, ' ');
  return LOCAL_REPLIES.find(entry => entry.pattern.test(text))?.reply || null;
}

function classifyRequestDisposition(input) {
  const startedAt = performance.now();
  const text = String(input || '').trim().replace(/\s+/g, ' ');
  const localReply = localReplyFor(text);
  if (localReply) return Object.freeze({ kind: 'localReply', confidence: 1, reasons: ['exact social phrase'], reply: localReply, durationMs: performance.now() - startedAt });
  if (!text) return Object.freeze({ kind: 'conversation', confidence: 0, reasons: ['empty input'], reply: null, durationMs: performance.now() - startedAt });
  if (CONTENT_WRITING.test(text)) return Object.freeze({ kind: 'conversation', confidence: .96, reasons: ['content-generation request'], reply: null, durationMs: performance.now() - startedAt });
  if (CONVERSATION_OPENERS.test(text) && !POLITE_ACTION.test(text)) return Object.freeze({ kind: 'conversation', confidence: .94, reasons: ['conversational opener'], reply: null, durationMs: performance.now() - startedAt });

  let actionScore = 0; const reasons = [];
  if (ACTION_VERB.test(text)) { actionScore += .5; reasons.push('action verb'); }
  if (ACTION_OBJECT.test(text)) { actionScore += .25; reasons.push('device or integration target'); }
  if (POLITE_ACTION.test(text)) { actionScore += .2; reasons.push('direct assistant instruction'); }
  if (SEQUENCE.test(text)) { actionScore += .15; reasons.push('multi-step sequence'); }
  if (/^(?:please\s+)?(?:organize|move|rename|duplicate|delete|trash|download|upload|install|uninstall|schedule|book|send|post|publish|submit|open|launch|quit|close|hide|switch|set|turn|lock|restart|run|create)\b/i.test(text)) actionScore += .15;
  actionScore = Math.min(1, actionScore);
  if (actionScore >= .75) return Object.freeze({ kind: 'actionCandidate', confidence: actionScore, reasons, reply: null, durationMs: performance.now() - startedAt });
  return Object.freeze({ kind: 'conversation', confidence: Math.max(.75, 1 - actionScore), reasons: reasons.length ? ['action score below execution threshold', ...reasons] : ['ordinary conversation'], reply: null, durationMs: performance.now() - startedAt });
}

module.exports = { LOCAL_REPLIES, localReplyFor, classifyRequestDisposition };
