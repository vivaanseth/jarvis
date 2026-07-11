const orb = document.querySelector('#orb');
const orbButton = document.querySelector('#orb-button');
const input = document.querySelector('#orb-input');
const result = document.querySelector('#orb-result');
const stateLabel = document.querySelector('#orb-state');
let idleTimer;
let stateTimer;
let mode = 'collapsed';
let drag = null;
let suppressActivationClick = false;
const friendlyError = error => String(error?.message || error || 'Voice input failed.').replace(/^Error invoking remote method '[^']+': Error:\s*/i,'');

function setVisualState(visual, label) {
  clearTimeout(stateTimer);
  orb.dataset.state = visual;
  stateLabel.textContent = label;
  if (['success', 'error'].includes(visual)) stateTimer = setTimeout(() => {
    orb.dataset.state = 'idle';
    stateLabel.textContent = 'Systems ready';
  }, 1800);
}

function resetIdle() {
  clearTimeout(idleTimer);
  if (mode === 'expanded' && !input.value) idleTimer = setTimeout(collapse, 8000);
}

function applyExpandedState({ requestWindow = true, focus = true } = {}) {
  clearTimeout(idleTimer);
  mode = 'expanded';
  orb.classList.remove('collapsed');
  if (requestWindow) window.jarvis.expandOrb();
  if (focus) requestAnimationFrame(() => input.focus());
  resetIdle();
}

function collapse() {
  if (mode !== 'expanded') return;
  clearTimeout(idleTimer);
  mode = 'collapsed';
  orb.classList.add('collapsed');
  input.blur();
  window.jarvis.collapseOrb();
}

function hide() {
  clearTimeout(idleTimer);
  mode = 'hidden';
  orb.classList.add('collapsed');
  input.blur();
  window.jarvis.hideOrb();
}

orbButton.addEventListener('pointerdown', event => {
  if (mode !== 'collapsed' || event.button !== 0) return;
  drag = { pointerId: event.pointerId, startX: event.screenX, startY: event.screenY, offsetX: event.clientX, offsetY: event.clientY, moved: false };
  orbButton.setPointerCapture(event.pointerId);
  window.jarvis.moveOrb({ phase: 'start' });
});
orbButton.addEventListener('pointermove', event => {
  if (!drag || drag.pointerId !== event.pointerId) return;
  if (!drag.moved && Math.hypot(event.screenX - drag.startX, event.screenY - drag.startY) < 5) return;
  drag.moved = true;
  window.jarvis.moveOrb({ phase: 'move', x: event.screenX - drag.offsetX, y: event.screenY - drag.offsetY, screenX: event.screenX, screenY: event.screenY });
});
function finishOrbPointer(event) {
  if (!drag || drag.pointerId !== event.pointerId) return;
  const moved = drag.moved;
  if (orbButton.hasPointerCapture(event.pointerId)) orbButton.releasePointerCapture(event.pointerId);
  drag = null;
  suppressActivationClick = moved;
  window.jarvis.moveOrb({ phase: 'end' });
}
orbButton.addEventListener('pointerup', finishOrbPointer);
orbButton.addEventListener('pointercancel', event => { if (drag?.pointerId === event.pointerId) { drag = null; window.jarvis.moveOrb({ phase: 'end' }); } });
orbButton.addEventListener('click', () => {
  if (suppressActivationClick) { suppressActivationClick = false; return; }
  window.jarvis.activateOrb();
});
document.querySelector('#collapse').addEventListener('click', collapse);
document.querySelector('#hide').addEventListener('click', hide);
document.querySelector('#quit').addEventListener('click', () => window.jarvis.quitApp());
document.querySelector('#open-main').addEventListener('click', () => window.jarvis.showMain());
document.querySelector('#voice').addEventListener('click', async () => {
  try { await window.jarvis.toggleSpeech(); }
  catch (error) { setVisualState('error', 'Voice unavailable'); result.textContent = friendlyError(error); }
});

async function runOrbCommand(text) {
  if (!text) return;
  clearTimeout(idleTimer);
  setVisualState('reviewing', 'Routing request');
  result.textContent = 'Matching local actions or starting a conversation…';
  const dispatched = await window.jarvis.dispatchRequest(text, { source: 'orb' });
  if (['localReply', 'conversation', 'actionResult'].includes(dispatched.kind)) {
    setVisualState('success', dispatched.kind === 'localReply' ? 'Ready' : 'Response complete');
    result.textContent = dispatched.answer || dispatched.message;
    input.value = '';
    return resetIdle();
  }
  const command = dispatched.command;
  if (command.requiresConfirmation && !confirm(`${command.interpretation}\n\n${command.action}`)) {
    setVisualState('idle', 'Systems ready');
    result.textContent = 'Action canceled.';
    return resetIdle();
  }
  setVisualState('processing', 'Executing');
  const response = await window.jarvis.execute(text, command.requiresConfirmation, { planId: command.parameters?.planId });
  setVisualState(response.ok ? 'success' : 'error', response.ok ? 'Action complete' : 'Attention required');
  result.textContent = response.message;
  if (response.ok) input.value = '';
  resetIdle();
}

document.querySelector('#orb-form').addEventListener('submit', async event => {
  event.preventDefault();
  try { await runOrbCommand(input.value.trim()); }
  catch (error) { setVisualState('error', 'Attention required'); result.textContent = friendlyError(error); resetIdle(); }
});

input.addEventListener('input', resetIdle);
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') { event.preventDefault(); collapse(); }
});

// Main owns window geometry. Focus notifications only synchronize the renderer;
// they must never request another expand or they form an IPC feedback loop.
window.jarvis.onFocusInput(() => applyExpandedState({ requestWindow: false, focus: true }));
window.jarvis.onTimer(timer => {
  document.querySelector('#timer').textContent = timer && ['running', 'paused'].includes(timer.state)
    ? `${timer.state === 'paused' ? 'Paused · ' : ''}${Math.floor(timer.remaining / 60)}:${String(timer.remaining % 60).padStart(2, '0')}` : '';
});
window.jarvis.onSpeechTranscript(payload => { input.value = payload.text || ''; setVisualState('listening', 'Listening on-device'); resetIdle(); if (payload.final === true) runOrbCommand(input.value.trim()).catch(error => { setVisualState('error', 'Attention required'); result.textContent = friendlyError(error); }); });
window.jarvis.onSpeechState(payload => { document.querySelector('#voice').classList.toggle('active', payload.listening); setVisualState(payload.listening ? 'listening' : 'idle', payload.listening ? 'Listening on-device' : 'Systems ready'); });
window.jarvis.onSpeechError(message => { setVisualState('error', 'Voice unavailable'); result.textContent = message; });
window.jarvis.onAssistantStream(payload => { if (!result.dataset.streaming) { result.textContent = ''; result.dataset.streaming = 'true'; } result.textContent += payload.delta; if (payload.done) delete result.dataset.streaming; });
