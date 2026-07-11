const { DEFAULT_TASK_ROUTES } = require('./free-model-policy.cjs');

const TASK_PROFILES = Object.freeze({
  quick: { name: 'Quick answer', description: 'Brief factual answers and explicitly concise requests.', examples: ['Answer briefly', 'Who invented the telephone?'], generation: { temperature: 0.2, maxOutputTokens: 512 } },
  heavy: { name: 'Deep reasoning', description: 'Architecture, tradeoffs, complex analysis, and explicit best-model requests.', examples: ['Think deeply about this architecture', 'Compare the tradeoffs'], generation: { temperature: 0.2, maxOutputTokens: 4096 } },
  coding: { name: 'Coding', description: 'Implementation, debugging, refactoring, tests, and code review.', examples: ['Debug this stack trace', 'Write integration tests'], generation: { temperature: 0.1, maxOutputTokens: 4096 } },
  research: { name: 'Research & synthesis', description: 'Evidence, sources, investigation, and document comparison.', examples: ['Research this topic', 'Compare these sources'], generation: { temperature: 0.2, maxOutputTokens: 4096 } },
  writing: { name: 'Writing & creative', description: 'Drafting, rewriting, tone, stories, and polished content.', examples: ['Rewrite this professionally', 'Draft a short story'], generation: { temperature: 0.7, maxOutputTokens: 4096 } },
  summarize: { name: 'Summarize & extract', description: 'Summaries, key points, and structured extraction.', examples: ['Summarize this report', 'Extract the action items'], generation: { temperature: 0.1, maxOutputTokens: 2048 } },
  actionPlan: { name: 'Action & tool planning', description: 'Requests that need Jarvis capabilities after local routing has been checked.', examples: ['Organize these files by project', 'Find this document and open it'], generation: { temperature: 0, maxOutputTokens: 2048 } }
});

const SIGNALS = Object.freeze({
  quick: [
    { weight: 1, reason: 'explicit concise-answer request', pattern: /\b(quick answer|answer (?:quickly|briefly)|in one sentence|short answer|be concise|just tell me)\b/i }
  ],
  heavy: [
    { weight: 1, reason: 'explicit deep-reasoning request', pattern: /\b(use (?:the )?(?:best|strongest|deep reasoning) model|think deeply|deep reasoning|reason step by step)\b/i },
    { weight: .86, reason: 'complex analysis language', pattern: /\b(architecture (?:analysis|review)|complex reasoning|analy[sz]e deeply|tradeoffs?|thorough comparison|root cause analysis)\b/i }
  ],
  coding: [
    { weight: 1, reason: 'explicit coding-model request', pattern: /\b(use (?:the )?coding model|coding task)\b/i },
    { weight: .9, reason: 'software implementation language', pattern: /\b(implement|debug|refactor|code review|review (?:this )?code|unit tests?|integration tests?|compile error|stack trace|codebase|repository|write (?:a |the )?(?:function|class|test|script))\b/i }
  ],
  research: [
    { weight: 1, reason: 'explicit research-model request', pattern: /\b(use (?:the )?research model|research task)\b/i },
    { weight: .9, reason: 'research and evidence language', pattern: /\b(research|investigate|literature review|source synthesis|compare sources|find evidence|cite sources|analy[sz]e (?:this )?(?:paper|study|dataset))\b/i }
  ],
  writing: [
    { weight: 1, reason: 'explicit writing-model request', pattern: /\b(use (?:the )?writing model|creative writing)\b/i },
    { weight: .88, reason: 'drafting or rewriting language', pattern: /\b(draft|rewrite|rephrase|polish (?:this|the)|change the tone|write (?:a |an )?(?:story|essay|article|post|letter|speech|poem)|make this sound)\b/i }
  ],
  summarize: [
    { weight: 1, reason: 'explicit summarization-model request', pattern: /\b(use (?:the )?summarization model|summarization task)\b/i },
    { weight: .92, reason: 'summary or extraction language', pattern: /\b(summari[sz]e|tl;?dr|key points|extract (?:the )?(?:action items|facts|dates|names|requirements)|condense|give me the gist)\b/i }
  ],
  actionPlan: [
    { weight: 1, reason: 'explicit action-planning request', pattern: /\b(use (?:the )?(?:action|tool) planning model|plan (?:the )?actions)\b/i },
    { weight: .84, reason: 'multi-step device action language', pattern: /\b(organize|find .{0,50} and open|download .{0,50} and (?:move|open)|create .{0,50} then|schedule .{0,50} and|open .{0,50} then)\b/i }
  ]
});

function classifyAITask(input) {
  const text = String(input || '').trim();
  if (!text) return { profile: 'default', confidence: 0, reasons: [] };
  const scores = [];
  for (const [profile, signals] of Object.entries(SIGNALS)) {
    let score = 0; const reasons = [];
    for (const signal of signals) if (signal.pattern.test(text)) { score = Math.max(score, signal.weight); reasons.push(signal.reason); }
    scores.push({ profile, confidence: score, reasons });
  }
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= 18 && /^(?:who|what|when|where|which|how (?:many|much|old|long))\b/i.test(text)) {
    const quick = scores.find(item => item.profile === 'quick');
    quick.confidence = Math.max(quick.confidence, .78); quick.reasons.push('short factual question');
  }
  if (words.length <= 18 && scores.every(item => item.confidence === 0)) {
    const quick = scores.find(item => item.profile === 'quick');
    quick.confidence = .76; quick.reasons.push('brief general conversation');
  }
  scores.sort((a, b) => b.confidence - a.confidence);
  const [first, second] = scores;
  if (!first || first.confidence < .75 || (second && first.confidence - second.confidence < .15)) return { profile: 'default', confidence: first?.confidence || 0, reasons: first?.reasons || [] };
  return first;
}

function routeKey(route) { return `${route.provider}\n${route.model}\n${route.baseURL || ''}`; }

function selectAIRoute(text, taskRoutes = {}, waterfall = []) {
  const classification = classifyAITask(text);
  const override = taskRoutes?.[classification.profile];
  const generation = TASK_PROFILES[classification.profile]?.generation || { temperature: 0.3, maxOutputTokens: 2048 };
  const enabledWaterfall = waterfall.filter(item => item?.enabled !== false).map(item => ({ ...item, generation }));
  if (classification.profile !== 'default' && override?.enabled && override.provider && override.model) {
    const direct = { id: `task-${classification.profile}`, provider: override.provider, model: override.model, baseURL: override.baseURL || '', enabled: true, generation, taskProfile: classification.profile };
    const fallback = override.fallbackPolicy === 'waterfall' ? enabledWaterfall.filter(item => routeKey(item) !== routeKey(direct)) : [];
    return { profile: classification.profile, override: true, classification, route: [direct, ...fallback] };
  }
  return { profile: 'default', override: false, classification, route: enabledWaterfall };
}

function taskRouteDefaults() { return Object.fromEntries(Object.entries(DEFAULT_TASK_ROUTES).map(([profile, route]) => [profile, { ...route }])); }

module.exports = { TASK_PROFILES, SIGNALS, classifyAITask, selectAIRoute, taskRouteDefaults };
