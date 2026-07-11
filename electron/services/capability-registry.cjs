const { riskFor, confirmationFor } = require('./safety-policy.cjs');
const { actionRequest } = require('./contracts.cjs');

const string = (description, options = {}) => ({ type: 'string', description, ...options });
const number = (description, options = {}) => ({ type: 'number', description, ...options });
const boolean = description => ({ type: 'boolean', description });
const ROUTINE_CAPABILITIES = new Set(['openApp', 'openFolder', 'startTimer', 'wait', 'openURL', 'searchWeb', 'spotifyPlay', 'runShortcut', 'createNote', 'takeScreenshot']);
const PERMISSIONS = Object.freeze({ createReminder: ['reminders'], createCalendarEvent: ['calendar'], showUpcoming: ['calendar'], searchContacts: ['contacts'], minimizeWindow: ['accessibility'], maximizeWindow: ['accessibility'], closeWindow: ['accessibility'] });
const CONNECTIONS = Object.freeze({ searchEmail: ['google'], readEmailThread: ['google'], createEmailDraft: ['google'], searchDrive: ['google'], searchGoogleContacts: ['google'], listGoogleTasks: ['google'], createGoogleTask: ['google'], updateGoogleTask: ['google'], deleteGoogleTask: ['google'], researchWeb: ['tavily'], openSearchResult: ['tavily'], githubSearchRepositories: ['github'], githubListIssues: ['github'], githubCreateIssue: ['github'], notionSearch: ['notion'], notionCreatePage: ['notion'], todoistListTasks: ['todoist'], todoistCreateTask: ['todoist'], todoistCompleteTask: ['todoist'], microsoftSearchMail: ['microsoft'], microsoftListTasks: ['microsoft'], microsoftCreateTask: ['microsoft'], browserListTabs: ['browser'], browserOpenTab: ['browser'], browserActivateTab: ['browser'], browserCloseTab: ['browser'], browserMoveTab: ['browser'], browserPinTab: ['browser'], browserMuteTab: ['browser'], browserReadPage: ['browser'], browserClick: ['browser'], browserFill: ['browser'], submitWebForm: ['browser'] });

const CAPABILITIES = [
  ['openApp', 'Open an installed macOS application.', { target: string('Application name') }, ['target']],
  ['switchApp', 'Bring an installed application to the foreground.', { target: string('Application name') }, ['target']],
  ['hideApp', 'Hide an application.', { target: string('Application name') }, ['target']],
  ['quitApp', 'Quit an application.', { target: string('Application name') }, ['target']],
  ['openFolder', 'Open a known or favorite folder in Finder.', { target: string('Folder name or trusted path') }, ['target']],
  ['findFiles', 'Search Spotlight for files by name or content.', { query: string('Search terms'), root: string('Optional trusted root') }, ['query']],
  ['calculate', 'Calculate an arithmetic expression locally.', { expression: string('Arithmetic expression') }, ['expression']],
  ['readTextFile', 'Read a bounded text file inside a trusted root.', { path: string('Canonical file path') }, ['path']],
  ['writeTextFile', 'Create or replace a text file after showing a diff.', { path: string('Canonical path'), content: string('New UTF-8 content') }, ['path', 'content']],
  ['moveFile', 'Move a file between trusted locations.', { source: string('Source path'), destination: string('Destination path') }, ['source', 'destination']],
  ['renameFile', 'Rename a file inside a trusted location.', { path: string('Source path'), name: string('New file name') }, ['path', 'name']],
  ['duplicateFile', 'Duplicate a file inside a trusted location.', { path: string('Source path'), destination: string('Destination path') }, ['path', 'destination']],
  ['revealFile', 'Reveal an approved file in Finder.', { path: string('Canonical file path') }, ['path']],
  ['readClipboard', 'Read the current clipboard only after an explicit request.', {}, []],
  ['copyToClipboard', 'Copy user-provided text to the clipboard.', { text: string('Text to copy') }, ['text']],
  ['trashFile', 'Move an approved file or folder to Trash.', { target: string('Canonical target path') }, ['target']],
  ['searchWeb', 'Open a web search without AI.', { query: string('Search query'), engine: string('Search engine') }, ['query']],
  ['searchSpotify', 'Search Spotify without starting playback.', { query: string('Spotify query') }, ['query']],
  ['searchEmail', 'Search connected Gmail messages.', { query: string('Gmail search query') }, ['query']],
  ['searchDrive', 'Search connected Google Drive metadata.', { query: string('Drive filename query') }, ['query']],
  ['browserListTabs', 'List tab titles and URLs through the optional Chrome bridge.', {}, []],
  ['browserReadPage', 'Read visible text from the current approved Chrome page.', {}, []],
  ['browserClick', 'Click an ordinary approved control in the current Chrome page.', { label: string('Visible control label'), origin: string('Approved HTTPS origin') }, ['label']],
  ['browserFill', 'Fill a non-sensitive field in the current approved Chrome page.', { label: string('Visible field label'), text: string('Value to type'), origin: string('Approved HTTPS origin') }, ['label', 'text']],
  ['submitWebForm', 'Submit a reviewed form on an approved Chrome origin.', { label: string('Visible submit control label'), origin: string('Approved HTTPS origin'), summary: string('Exact submission summary') }, ['label', 'summary']],
  ['openURL', 'Open an HTTPS URL in the default browser.', { url: string('HTTPS URL') }, ['url']],
  ['researchWeb', 'Research a topic from browser-retrieved sources and return citations.', { query: string('Research question') }, ['query']],
  ['openSearchResult', 'Open a cited HTTPS result from the latest research.', { url: string('Cited HTTPS result URL') }, ['url']],
  ['getWeather', 'Get current weather without AI.', { location: string('City or place') }, ['location']],
  ['openDirections', 'Open map directions.', { destination: string('Destination'), origin: string('Optional origin') }, ['destination']],
  ['spotifySearch', 'Search Spotify for music or podcasts.', { query: string('Spotify query'), types: string('Comma-separated item types') }, ['query']],
  ['spotifyPlay', 'Play a Spotify item or search result.', { query: string('Track, artist, album, or playlist') }, ['query']],
  ['spotifyPause', 'Pause Spotify playback.', {}, []],
  ['spotifyResume', 'Resume Spotify playback.', {}, []],
  ['spotifyNext', 'Skip to the next Spotify item.', {}, []],
  ['spotifyPrevious', 'Return to the previous Spotify item.', {}, []],
  ['createPlaylist', 'Create a private Spotify playlist.', { name: string('Playlist name'), description: string('Optional description') }, ['name']],
  ['startTimer', 'Start a local timer.', { seconds: number('Duration in seconds', { minimum: 1, maximum: 604800 }), label: string('Timer label') }, ['seconds']],
  ['wait', 'Wait briefly between routine steps.', { seconds: number('Delay in seconds', { minimum: 1, maximum: 300 }) }, ['seconds']],
  ['createReminder', 'Create an Apple or Google reminder/task.', { title: string('Reminder title'), date: string('Optional ISO date'), destination: string('Apple or Google') }, ['title']],
  ['createCalendarEvent', 'Create a calendar event.', { title: string('Event title'), date: string('Optional ISO start'), start: string('Optional ISO start'), end: string('ISO end'), destination: string('Apple or Google') }, ['title']],
  ['sendEmail', 'Send an email after exact recipient and content confirmation.', { to: string('Recipient'), subject: string('Subject'), body: string('Body') }, ['to', 'subject', 'body']],
  ['readEmailThread', 'Read a connected Gmail thread.', { threadId: string('Gmail thread identifier') }, ['threadId']],
  ['createEmailDraft', 'Create a reviewed Gmail draft without sending it.', { to: string('Recipient'), subject: string('Subject'), body: string('Body') }, ['to', 'subject', 'body']],
  ['sendMessage', 'Send a message after exact recipient and content confirmation.', { to: string('Recipient'), body: string('Message') }, ['to', 'body']],
  ['showNotification', 'Show a local macOS notification.', { title: string('Notification title'), body: string('Notification body') }, ['body']],
  ['searchContacts', 'Search local Contacts after permission is granted.', { query: string('Name, email, or phone query') }, ['query']],
  ['saveMemory', 'Save a durable local fact.', { text: string('Fact'), category: string('Memory category'), importance: number('Importance', { minimum: 0, maximum: 1 }), automatic: boolean('Saved by the local classifier'), sensitive: boolean('Sensitive content marker') }, ['text']],
  ['recallMemory', 'Search local memories.', { query: string('Recall query') }, ['query']],
  ['createNote', 'Create a local Jarvis note.', { title: string('Title'), body: string('Optional body'), destination: string('Jarvis or Apple Notes') }, ['title']],
  ['startRoutine', 'Run a saved routine.', { routine: string('Routine name') }, ['routine']],
  ['runShortcut', 'Run an exact allowlisted macOS Shortcut.', { name: string('Saved shortcut name') }, ['name']],
  ['listShortcuts', 'List the names of locally available macOS Shortcuts.', {}, []],
  ['applyCodePatch', 'Apply a reviewed patch inside a trusted project.', { project: string('Trusted project'), patch: string('Unified diff') }, ['project', 'patch']],
  ['runDeveloperCommand', 'Run an approved structured developer recipe.', { command: string('Approved recipe'), project: string('Trusted project') }, ['command']],
  ['gitStatus', 'Read Git working tree status in a trusted project.', { project: string('Trusted project') }, []],
  ['gitLog', 'Read recent Git history in a trusted project.', { project: string('Trusted project') }, []]
  ,['showTime', 'Read the current local time.', {}, []]
  ,['showDate', 'Read the current local date.', {}, []]
  ,['batteryStatus', 'Read local battery and charging status.', {}, []]
  ,['diskSpace', 'Read local startup-disk space.', {}, []]
  ,['startScreenSaver', 'Start the macOS screen saver.', {}, []]
  ,['sleepDisplay', 'Put the displays to sleep.', {}, []]
  ,['currentTrack', 'Read the current Spotify track.', {}, []]
  ,['openTrash', 'Open the Trash folder in Finder.', {}, []]
  ,['listApplications', 'List locally installed applications.', {}, []]
  ,['setVolume', 'Set output volume.', { percent: number('Volume percent', { minimum: 0, maximum: 100 }) }, ['percent']]
  ,['mute', 'Mute audio output.', {}, []]
  ,['unmute', 'Unmute audio output.', {}, []]
  ,['adjustVolume', 'Adjust output volume.', { delta: number('Volume change', { minimum: -100, maximum: 100 }) }, ['delta']]
  ,['openSystemSettings', 'Open a public System Settings pane.', { pane: string('Settings pane') }, ['pane']]
  ,['takeScreenshot', 'Open the visible macOS screenshot interface.', {}, []]
  ,['lockScreen', 'Lock this Mac.', {}, []]
  ,['restartMac', 'Restart this Mac.', {}, []]
  ,['shutDownMac', 'Shut down this Mac.', {}, []]
  ,['showUpcoming', 'Read upcoming calendar events.', { range: string('Time range'), destination: string('Apple or Google') }, []]
  ,['showActivity', 'Read recent Jarvis activity.', {}, []]
  ,['showTodaySummary', 'Summarize successful Jarvis actions today.', {}, []]
  ,['showRecentApps', 'Read recently opened applications.', {}, []]
  ,['pauseTimer', 'Pause the active local timer.', {}, []]
  ,['resumeTimer', 'Resume the paused local timer.', {}, []]
  ,['stopTimer', 'Stop the active local timer.', {}, []]
  ,['timerStatus', 'Read the active timer state.', {}, []]
  ,['searchYouTube', 'Search YouTube in the browser.', { query: string('Search query') }, ['query']]
  ,['searchWikipedia', 'Search Wikipedia in the browser.', { query: string('Search query') }, ['query']]
  ,['searchGitHub', 'Search GitHub in the browser.', { query: string('Search query') }, ['query']]
  ,['searchChatGPT', 'Open ChatGPT and copy a query without submitting it.', { query: string('Query') }, ['query']]
  ,['setBrightness', 'Open public display controls.', {}, []]
  ,['toggleDoNotDisturb', 'Open public Focus controls.', {}, []]
  ,['openProject', 'Open a trusted project in an approved editor.', { project: string('Trusted project'), editor: string('Editor') }, []]
  ,['openTerminal', 'Open Terminal for manual review.', { prefill: string('Optional copied command') }, []]
  ,['minimizeWindow', 'Minimize the focused window through Accessibility.', {}, []]
  ,['maximizeWindow', 'Raise and zoom the focused window through Accessibility.', {}, []]
  ,['closeWindow', 'Close the focused window through Accessibility.', {}, []]
  ,['browserOpenTab', 'Open an HTTPS URL in a Chrome tab.', { url: string('HTTPS URL'), active: boolean('Activate the new tab') }, ['url']]
  ,['browserActivateTab', 'Activate a specific Chrome tab.', { tabId: number('Chrome tab identifier') }, ['tabId']]
  ,['browserCloseTab', 'Close a specific Chrome tab.', { tabId: number('Chrome tab identifier') }, ['tabId']]
  ,['browserMoveTab', 'Move a Chrome tab to another position.', { tabId: number('Chrome tab identifier'), index: number('Destination index', { minimum: 0, maximum: 1000 }) }, ['tabId','index']]
  ,['browserPinTab', 'Pin or unpin a Chrome tab.', { tabId: number('Chrome tab identifier'), pinned: boolean('Pinned state') }, ['tabId','pinned']]
  ,['browserMuteTab', 'Mute or unmute a Chrome tab.', { tabId: number('Chrome tab identifier'), muted: boolean('Muted state') }, ['tabId','muted']]
  ,['getFrontAppContext', 'Read only the front Finder path or browser URL.', { app: string('Finder or browser name') }, ['app']]
  ,['readScreenText', 'Capture one screen image and extract text locally with Vision OCR.', {}, []]
  ,['inspectTrash', 'Inspect Trash item counts and sizes without deleting anything.', {}, []]
  ,['createLocalTask', 'Create a local Jarvis task.', { title: string('Task title'), due: string('Optional ISO due time') }, ['title']]
  ,['listLocalTasks', 'List local Jarvis tasks.', { includeCompleted: boolean('Include completed tasks') }, []]
  ,['completeLocalTask', 'Complete or reopen a local Jarvis task.', { id: string('Task identifier'), completed: boolean('Completed state') }, ['id','completed']]
  ,['deleteLocalTask', 'Delete a local Jarvis task.', { id: string('Task identifier') }, ['id']]
  ,['searchGoogleContacts', 'Search connected Google Contacts.', { query: string('Contact query') }, ['query']]
  ,['listGoogleTasks', 'List connected Google Tasks.', { showCompleted: boolean('Show completed tasks') }, []]
  ,['createGoogleTask', 'Create a Google task.', { title: string('Task title'), due: string('Optional RFC 3339 due time') }, ['title']]
  ,['updateGoogleTask', 'Update a Google task.', { taskListId: string('Task list identifier'), id: string('Task identifier'), title: string('Optional title'), status: string('Optional status') }, ['taskListId','id']]
  ,['deleteGoogleTask', 'Delete a Google task.', { taskListId: string('Task list identifier'), id: string('Task identifier') }, ['taskListId','id']]
  ,['githubSearchRepositories', 'Search repositories through GitHub.', { query: string('Repository query') }, ['query']]
  ,['githubListIssues', 'List issues for a GitHub repository.', { repository: string('owner/repository'), state: string('open or closed') }, ['repository']]
  ,['githubCreateIssue', 'Create a GitHub issue after final confirmation.', { repository: string('owner/repository'), title: string('Issue title'), body: string('Issue body') }, ['repository','title']]
  ,['notionSearch', 'Search pages shared with the Notion integration.', { query: string('Notion search query') }, ['query']]
  ,['notionCreatePage', 'Create a page under an explicitly shared Notion page.', { parentId: string('Shared parent page identifier'), title: string('Page title'), content: string('Page content') }, ['parentId','title']]
  ,['todoistListTasks', 'List Todoist tasks.', { projectId: string('Optional project identifier') }, []]
  ,['todoistCreateTask', 'Create a Todoist task.', { title: string('Task title'), projectId: string('Optional project identifier'), dueString: string('Optional natural-language due date') }, ['title']]
  ,['todoistCompleteTask', 'Complete a Todoist task.', { id: string('Todoist task identifier') }, ['id']]
  ,['microsoftSearchMail', 'Search connected Outlook mail.', { query: string('Mail query') }, ['query']]
  ,['microsoftListTasks', 'List connected Microsoft To Do tasks.', {}, []]
  ,['microsoftCreateTask', 'Create a Microsoft To Do task.', { title: string('Task title'), dueDateTime: string('Optional ISO due time') }, ['title']]
].map(([id, description, properties, required]) => ({
  id, description,
  inputSchema: { type: 'object', additionalProperties: false, properties, required },
  risk: riskFor(id),
  confirmation: confirmationFor(id),
  permissions: PERMISSIONS[id] || [], connections: CONNECTIONS[id] || [], executorId: id, routineEligible: ROUTINE_CAPABILITIES.has(id), aliases: []
}));

class CapabilityRegistry {
  constructor(definitions = CAPABILITIES) { this.definitions = new Map(definitions.map(item => [item.id, Object.freeze({ ...item })])); }
  get(id) { return this.definitions.get(id); }
  list() { return [...this.definitions.values()]; }
  schemas(ids) { return (ids || [...this.definitions.keys()]).map(id => this.get(id)).filter(Boolean).map(({ id, description, inputSchema }) => ({ id, description, inputSchema })); }
  request(source) { const request = actionRequest(source); this.validate(request.capabilityId, request.parameters); return request; }
  preview(id, input = {}) { const capability = this.get(id); if (!capability) throw new Error(`Unsupported capability: ${id}`); return { capabilityId: id, description: capability.description, parameters: structuredClone(input), risk: capability.risk, confirmation: capability.confirmation }; }
  routineCapabilities() { return this.list().filter(item => item.routineEligible); }
  validate(id, input = {}) {
    const capability = this.get(id);
    if (!capability) throw new Error(`Unsupported capability: ${id}`);
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error(`${id} input must be an object.`);
    for (const name of capability.inputSchema.required || []) if (input[name] === undefined || input[name] === '') throw new Error(`${id} requires ${name}.`);
    if (capability.inputSchema.additionalProperties === false) for (const name of Object.keys(input)) if (!capability.inputSchema.properties[name]) throw new Error(`${id} does not accept ${name}.`);
    for (const [name, value] of Object.entries(input)) {
      const field = capability.inputSchema.properties[name]; if (!field) continue;
      if (value == null && !(capability.inputSchema.required || []).includes(name)) continue;
      if (field.type === 'string' && typeof value !== 'string') throw new Error(`${name} must be text.`);
      if (field.type === 'number' && (!Number.isFinite(value) || value < (field.minimum ?? -Infinity) || value > (field.maximum ?? Infinity))) throw new Error(`${name} is outside its allowed range.`);
      if (field.type === 'boolean' && typeof value !== 'boolean') throw new Error(`${name} must be true or false.`);
    }
    return true;
  }
}

module.exports = { CapabilityRegistry, CAPABILITIES };
