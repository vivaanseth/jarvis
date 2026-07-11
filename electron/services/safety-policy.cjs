const RISK = Object.freeze({ low: 0, medium: 1, high: 2 });

const INTENT_RISKS = Object.freeze({
  quitApp: 'medium', closeWindow: 'medium', moveFile: 'medium', renameFile: 'medium', duplicateFile: 'medium', writeTextFile: 'medium',
  createReminder: 'medium', createCalendarEvent: 'medium', updateCalendarEvent: 'medium',
  completeReminder: 'medium', createPlaylist: 'medium', addToPlaylist: 'medium',
  saveSpotifyItem: 'medium', applyCodePatch: 'medium', gitStatus: 'medium', gitLog: 'medium',
  runDeveloperCommand: 'medium', runShortcut: 'medium', sendEmail: 'high', sendMessage: 'high',
  submitWebForm: 'high', purchase: 'high', bookReservation: 'high', trashFile: 'high',
  lockScreen: 'high', restartMac: 'high', shutDownMac: 'high', toggleDoNotDisturb: 'high',
  deleteCalendarEvent: 'high', deleteReminder: 'high', removePlaylistItem: 'high'
  ,createEmailDraft: 'medium', githubCreateIssue: 'high', notionCreatePage: 'medium'
  ,todoistCreateTask: 'medium', todoistCompleteTask: 'medium', microsoftCreateTask: 'medium'
  ,createLocalTask: 'medium', completeLocalTask: 'medium', deleteLocalTask: 'high'
  ,browserCloseTab: 'medium', deleteGoogleTask: 'high', updateGoogleTask: 'medium'
});

function riskFor(intent) { return INTENT_RISKS[intent] || 'low'; }

function maxRisk(...levels) {
  return levels.filter(Boolean).reduce((highest, current) => RISK[current] > RISK[highest] ? current : highest, 'low');
}

function confirmationFor(intent, preferences = {}) {
  const risk = riskFor(intent);
  if (risk === 'high') return 'at-execution';
  if (['createReminder', 'createCalendarEvent'].includes(intent)) return 'plan';
  if (risk === 'medium' && preferences.confirmMediumRisk !== false) return 'plan';
  return 'none';
}

function requiresConfirmation(intent, preferences = {}) { return confirmationFor(intent, preferences) !== 'none'; }

function assertRiskInvariant(step, preferences = {}) {
  const expected = riskFor(step.capabilityId || step.intent);
  if (RISK[step.risk || 'low'] < RISK[expected]) throw new Error(`Risk for ${step.capabilityId || step.intent} cannot be downgraded.`);
  const confirmation = confirmationFor(step.capabilityId || step.intent, preferences);
  if (confirmation === 'at-execution' && step.confirmation !== 'at-execution') throw new Error('High-risk actions require confirmation at execution.');
  return true;
}

module.exports = { RISK, INTENT_RISKS, riskFor, maxRisk, confirmationFor, requiresConfirmation, assertRiskInvariant };
