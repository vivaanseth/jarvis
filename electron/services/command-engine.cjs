const crypto = require('node:crypto');
const { riskFor, requiresConfirmation: needsConfirmation } = require('./safety-policy.cjs');
const { normalizeRequestText, resolveSiteRequest } = require('./site-registry.cjs');

function duration(text) {
  const match = text.match(/(\d+)\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?)/i);
  if (!match) return null;
  const value = Number(match[1]);
  return /hour|hr/i.test(match[2]) ? value * 3600 : /second|sec/i.test(match[2]) ? value : value * 60;
}

function dateFrom(text, now = new Date()) {
  const match = [...text.matchAll(/(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/gi)].at(-1);
  if (!match) return null;
  let hour = Number(match[1]); const minute = Number(match[2] || 0); const marker = (match[3] || '').toLowerCase();
  if (marker === 'pm' && hour !== 12) hour += 12; if (marker === 'am' && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return null;
  const result = new Date(now); result.setSeconds(0, 0);
  if (/tomorrow/i.test(text)) result.setDate(result.getDate() + 1);
  result.setHours(hour, minute, 0, 0);
  if (!/tomorrow/i.test(text) && result < now) result.setDate(result.getDate() + 1);
  return result.toISOString();
}

function strip(text, prefixes) {
  const prefix = prefixes.find(value => text.toLowerCase().startsWith(value.toLowerCase()));
  return (prefix ? text.slice(prefix.length) : text).trim().replace(/^[\s.:"']+|[\s.:"']+$/g, '');
}

function result(originalText, intent, parameters = {}, confidence = .95) {
  const riskLevel = riskFor(intent);
  return { id: crypto.randomUUID(), originalText, intent, parameters, confidence, riskLevel, requiresConfirmation: needsConfirmation(intent) };
}

function classifyMemory(input) {
  const text = String(input || '').trim().replace(/\s+/g, ' ');
  if (text.length < 12 || text.length > 500 || /\?$/.test(text)) return null;
  if (/\b(password|passcode|api[- ]?key|secret key|access token|refresh token|private key|seed phrase|recovery code|one[- ]?time code|otp|social security|ssn|bank account|routing number|credit card|debit card|cvv|cvc|diagnosis|medical condition|prescription|blood pressure|insurance number)\b/i.test(text)) return null;
  const durablePatterns = [
    ['identity', .95, /\b(my name is|call me|i live in|i am based in|i'm based in|my birthday is|my email is|my phone number is|my address is|my time ?zone is|i work at|i study at)\b/i],
    ['preference', .82, /\b(i prefer|i like|i love|i dislike|i hate|my favou?rite|i always|i never|please always|please never|from now on|i use .{1,60} for)\b/i],
    ['project', .88, /\b(i am working on|i'm working on|we are working on|we're working on|my project|our project|project is called)\b/i],
    ['person', .86, /\b(my (?:boss|manager|partner|wife|husband|mother|father|sister|brother|doctor|teacher) is)\b/i],
    ['deadline', .95, /\b(deadline|due date|is due|renewal date|anniversary|recurring meeting|this is important|do not forget|don't forget)\b/i],
    ['workflow', .88, /\b(staging|production|server|repository|repo|workspace|vpn|website|url)\b.{0,80}\b(is|uses|requires|lives|located|runs)\b/i]
  ];
  const match = durablePatterns.find(([, , pattern]) => pattern.test(text));
  return match ? { text, category: match[0], importance: match[1], sensitive: false } : null;
}

function importantMemoryCandidate(input) { return classifyMemory(input)?.text || null; }

function parseCommand(input, context = {}) {
  const originalText = String(input || '').trim();
  const text = normalizeRequestText(originalText); const lower = text.toLowerCase().replace(/\s+/g, ' ');
  if (!text) return result(text, 'unknown', {}, 0);
  const site = resolveSiteRequest(originalText, context.customSites);
  if (site) return result(originalText, site.capabilityId, site.parameters, site.confidence);
  if (/^(what time is it|what(?:'s| is) the time|current time|tell me the time)\??$/.test(lower)) return result(text, 'showTime', {}, .99);
  if (/^(what(?:'s| is) (?:on|in) (?:my|the) clipboard|read (?:my|the) clipboard)\??$/.test(lower)) return result(text, 'readClipboard', {}, .98);
  const clipboardCopy = text.match(/^copy\s+(.+?)\s+to (?:my|the) clipboard$/i);
  if (clipboardCopy) return result(text, 'copyToClipboard', { text: clipboardCopy[1] }, .98);
  if (/^(what day is it|what(?:'s| is) the date|current date|today(?:'s| is the) date)\??$/.test(lower)) return result(text, 'showDate', {}, .99);
  if (/^(battery|battery status|how much battery|what(?:'s| is) my battery(?: level)?)\??$/.test(lower)) return result(text, 'batteryStatus', {}, .99);
  if (/^(disk space|storage status|how much (disk|storage) space|free disk space)\??$/.test(lower)) return result(text, 'diskSpace', {}, .98);
  if (/^(start|open|show)( the)? screen ?saver$/.test(lower)) return result(text, 'startScreenSaver', {}, .99);
  if (/^(sleep|turn off)( the| my)? display$|^display sleep$/.test(lower)) return result(text, 'sleepDisplay', {}, .98);
  if (/^(what(?:'s| is) playing|current (song|track)|name this song)\??$/.test(lower)) return result(text, 'currentTrack', {}, .97);
  if (/^(open|show)( my)? trash( folder)?$/.test(lower)) return result(text, 'openTrash', {}, .99);
  if (/^(list|show) (my )?(installed )?(apps|applications)$/.test(lower)) return result(text, 'listApplications', {}, .98);
  if (/what did i do today|today summary/.test(lower)) return result(text, 'showTodaySummary');
  if (/recent commands|activity history|show activity/.test(lower)) return result(text, 'showActivity');
  if (/recent apps|recently used apps/.test(lower)) return result(text, 'showRecentApps');
  if (/^remember( that)? |^save this idea|^save this to memory/.test(lower)) { const memoryText = strip(text, ['Remember that ', 'Remember ', 'Save this idea: ', 'Save this to memory: ']); const classification = classifyMemory(memoryText); return result(text, 'saveMemory', { text: memoryText, category: classification?.category || 'miscellaneous', importance: classification?.importance || .8, automatic: false }); }
  if (/^recall |what do you remember/.test(lower)) return result(text, 'recallMemory', { query: strip(text, ['Recall ', 'What do you remember about ']) });
  if (lower.includes('git status')) return result(text, 'gitStatus', { project: projectFrom(text, context) }, .99);
  if (lower.includes('git log')) return result(text, 'gitLog', { project: projectFrom(text, context) }, .98);
  if (/^(calculate|what is)\s+[\d\s()+\-*/.%]+\??$/i.test(text)) return result(text, 'calculate', { expression: text.replace(/^(calculate|what is)\s+/i, '').replace(/\?$/, '').trim() }, .99);
  if (/^(what(?:'s| is) the )?weather( like)?( in| for)? /i.test(text)) return result(text, 'getWeather', { location: text.replace(/^(what(?:'s| is) the )?weather( like)?( in| for)? /i, '').trim() }, .98);
  if (/^(directions|navigate|take me) to /i.test(text)) return result(text, 'openDirections', { destination: text.replace(/^(directions|navigate|take me) to /i, '').trim() }, .97);
  if (/^(find|search for|locate) (a |the )?(file|document|folder)s? (called|named|matching)?/i.test(text)) return result(text, 'findFiles', { query: text.replace(/^(find|search for|locate) (a |the )?(file|document|folder)s? (called|named|matching)?/i, '').trim() }, .93);
  if (/^run (the )?.+ shortcut$/i.test(text)) return result(text, 'runShortcut', { name: text.replace(/^run (the )?/i, '').replace(/ shortcut$/i, '').trim() }, .95);
  if (/^(list|show) (my )?(macos )?shortcuts$/i.test(text)) return result(text, 'listShortcuts', {}, .98);
  if (/^(minimize|hide) (the )?(current |focused )?window$/i.test(text)) return result(text, 'minimizeWindow', {}, .98);
  if (/^(maximize|zoom) (the )?(current |focused )?window$/i.test(text)) return result(text, 'maximizeWindow', {}, .98);
  if (/^close (the )?(current |focused )?window$/i.test(text)) return result(text, 'closeWindow', {}, .97);
  if (/^open https:\/\//i.test(text)) return result(text, 'openURL', { url: text.replace(/^open /i, '').trim() }, .99);
  if (/^(list|show) (my )?(chrome )?tabs$/i.test(text)) return result(text, 'browserListTabs', {}, .98);
  if (/^(read|summarize|what is on) (this|the current) (page|tab)$/i.test(text)) return result(text, 'browserReadPage', {}, .94);
  if (/^(pause|stop) (spotify|music|playback)$/i.test(text)) return result(text, 'spotifyPause', {}, .98);
  if (/^(resume|continue) (spotify|music|playback)$/i.test(text)) return result(text, 'spotifyResume', {}, .98);
  if (/^(next|skip)( song| track)?$/i.test(text)) return result(text, 'spotifyNext', {}, .97);
  if (/^(previous|last)( song| track)?$/i.test(text)) return result(text, 'spotifyPrevious', {}, .97);
  if (/^(play|listen to) .+( on spotify)?$/i.test(text)) return result(text, 'spotifyPlay', { query: text.replace(/^(play|listen to) /i, '').replace(/ on spotify$/i, '').trim() }, .95);
  if (/^run (npm run dev|npm test|python3 --version|node --version)$/i.test(text)) return result(text, 'runDeveloperCommand', { command: text.slice(4), project: projectFrom(text, context) }, .94);
  if (/^run /i.test(text)) return result(text, 'openTerminal', { prefill: text.slice(4) }, .86);
  if (/open.*terminal/i.test(text)) return result(text, 'openTerminal');
  if (/^open my .*project/i.test(text)) return result(text, 'openProject', { project: projectFrom(text, context), editor: text.match(/ in (.+)$/i)?.[1] || '' }, .94);
  if (/^start .*?(timer|session)|pomodoro/i.test(text)) {
    const seconds = duration(text) || (/pomodoro/i.test(text) ? 1500 : 0);
    const label = text.replace(/start\s+(a\s+)?\d+\s*(minute|min|hour|second)s?/i, '').replace(/(timer|session)$/i, '').trim() || 'Focus';
    return result(text, 'startTimer', { seconds, label }, seconds ? .98 : .62);
  }
  if (/pause.*timer/i.test(text)) return result(text, 'pauseTimer');
  if (/resume.*timer/i.test(text)) return result(text, 'resumeTimer');
  if (/(stop|cancel).*timer/i.test(text)) return result(text, 'stopTimer');
  if (/time is left|timer status/i.test(text)) return result(text, 'timerStatus');
  if (/remind me|create a reminder|add reminder/i.test(text)) {
    const title = strip(text, ['Remind me to ', 'Create a reminder to ', 'Add reminder to ']).replace(/\s+(today|tomorrow)?\s*at\s+\d{1,2}(:\d{2})?\s*(am|pm)?\s*$/i, '');
    return result(text, 'createReminder', { title: title || 'Reminder', date: dateFrom(text) }, dateFrom(text) ? .96 : .68);
  }
  if (/calendar event/i.test(text) || (/^add /i.test(text) && /(tomorrow| at )/i.test(text))) {
    const title = strip(text, ['Create a calendar event for ', 'Add a calendar event for ', 'Add ']).replace(/\s+(today|tomorrow)?\s*at\s+\d{1,2}(:\d{2})?\s*(am|pm)?\s*$/i, '');
    return result(text, 'createCalendarEvent', { title: title || 'Event', date: dateFrom(text), destination: /google calendar/i.test(text) ? 'google' : 'apple' }, dateFrom(text) ? .94 : .68);
  }
  const email = text.match(/^email\s+([^\s]+@[^\s]+)\s+(?:about\s+(.+?)\s+)?(?:saying|that says)\s+(.+)$/i);
  if (email) return result(text, 'sendEmail', { to: email[1], subject: email[2] || 'Message from Jarvis', body: email[3] }, .96);
  const message = text.match(/^(?:message|text)\s+(.+?)\s+(?:saying|that says)\s+(.+)$/i);
  if (message) return result(text, 'sendMessage', { to: message[1].trim(), body: message[2].trim() }, .94);
  const notification = text.match(/^(?:notify me|show a notification)(?: saying| that says| to)?\s+(.+)$/i);
  if (notification) return result(text, 'showNotification', { title: 'Jarvis', body: notification[1].trim() }, .95);
  if (/^(?:find|search) (?:my )?contacts for /i.test(text)) return result(text, 'searchContacts', { query: text.replace(/^(?:find|search) (?:my )?contacts for /i, '').trim() }, .96);
  if (/what do i have|upcoming events/.test(lower)) return result(text, 'showUpcoming', { range: lower.includes('tomorrow') ? 'tomorrow' : 'upcoming' });
  if (/what(?:'s| is) on my google calendar|google calendar events/.test(lower)) return result(text, 'showUpcoming', { range: lower.includes('tomorrow') ? 'tomorrow' : 'upcoming', destination: 'google' }, .97);
  if (/^search (my )?(email|gmail) for /i.test(text)) return result(text, 'searchEmail', { query: text.replace(/^search (my )?(email|gmail) for /i, '').trim() }, .98);
  if (/^search (my )?(google )?drive for /i.test(text)) return result(text, 'searchDrive', { query: text.replace(/^search (my )?(google )?drive for /i, '').trim() }, .98);
  if (/^(create (a )?note|new note)/i.test(text)) {
    const untitled = /^(create (a )?note|new note)$/i.test(text.trim());
    return result(text, 'createNote', { title: untitled ? 'Untitled Note' : strip(text, ['Create a note called ', 'Create note called ', 'Create a note ', 'Create note ', 'New note ']) || 'Untitled Note', destination: /apple notes/i.test(text) ? 'appleNotes' : 'jarvis' });
  }
  const searches = [
    [/^search youtube for |^youtube /i, 'searchYouTube'], [/^search wikipedia for |^wikipedia /i, 'searchWikipedia'],
    [/^search github for |^github /i, 'searchGitHub'], [/^search spotify for |^spotify search /i, 'searchSpotify'],
    [/^search chatgpt for |^ask chatgpt /i, 'searchChatGPT'], [/^google |^search the web for |^search for /i, 'searchWeb']
  ];
  for (const [pattern, intent] of searches) if (pattern.test(text)) return result(text, intent, { query: text.replace(pattern, '').trim() });
  if (/set volume/i.test(text)) return result(text, 'setVolume', { percent: Math.min(100, Math.max(0, Number(text.match(/\d+/)?.[0] || 50))) });
  if (/^mute$|mute my mac|mute volume/i.test(text)) return result(text, 'mute');
  if (/unmute/i.test(text)) return result(text, 'unmute');
  if (/raise volume|volume up/i.test(text)) return result(text, 'adjustVolume', { delta: 10 });
  if (/lower volume|volume down/i.test(text)) return result(text, 'adjustVolume', { delta: -10 });
  if (/brightness/i.test(text)) return result(text, 'setBrightness');
  if (/do not disturb/i.test(text)) return result(text, 'toggleDoNotDisturb');
  if (/(bluetooth|wi-?fi|battery|sound|display|keyboard|mouse|trackpad|printer|wallpaper|notification|privacy|system) settings/i.test(text)) {
    const panes = [['bluetooth','Bluetooth'],['wi-fi','Wi-Fi'],['wifi','Wi-Fi'],['battery','Battery'],['sound','Sound'],['display','Displays'],['keyboard','Keyboard'],['trackpad','Trackpad'],['mouse','Mouse'],['printer','Printers'],['wallpaper','Wallpaper'],['notification','Notifications'],['privacy','Privacy']];
    return result(text, 'openSystemSettings', { pane: panes.find(([needle]) => lower.includes(needle))?.[1] || 'General' });
  }
  if (/screenshot/i.test(text)) return result(text, 'takeScreenshot');
  if (/lock (my )?(screen|mac)/i.test(text)) return result(text, 'lockScreen');
  if (/restart/i.test(text)) return result(text, 'restartMac');
  if (/shut ?down/i.test(text)) return result(text, 'shutDownMac');
  const duplicate = text.match(/^duplicate\s+(.+?)\s+(?:as|to)\s+(.+)$/i);
  if (duplicate) return result(text, 'duplicateFile', { path: duplicate[1].replace(/^['"]|['"]$/g, ''), destination: duplicate[2].replace(/^['"]|['"]$/g, '') }, .92);
  const reveal = text.match(/^reveal\s+(.+?)\s+in finder$/i);
  if (reveal) return result(text, 'revealFile', { path: reveal[1].replace(/^['"]|['"]$/g, '') }, .94);
  if (/^(delete|trash) /i.test(text)) return result(text, 'trashFile', { target: text.replace(/^(delete|trash) /i, '').trim() });
  if (/^(start |open my )/i.test(text)) {
    const candidate = strip(text, ['Start ', 'Open my ']);
    const routine = (context.routines || []).find(name => candidate.toLowerCase() === name.toLowerCase() || candidate.toLowerCase().startsWith(`${name.toLowerCase()} with `) || name.toLowerCase().includes(candidate.toLowerCase()));
    const input = routine && candidate.toLowerCase().startsWith(`${routine.toLowerCase()} with `) ? candidate.slice(routine.length + 6).trim() : '';
    if (routine || /focus mode|coding setup|school mode/i.test(candidate)) return result(text, 'startRoutine', { routine: routine || candidate, input });
  }
  if (/^quit /i.test(text)) return result(text, 'quitApp', { target: strip(text, ['Quit ']) });
  if (/^hide /i.test(text)) return result(text, 'hideApp', { target: strip(text, ['Hide ']) });
  if (/^switch to /i.test(text)) return result(text, 'switchApp', { target: strip(text, ['Switch to ']) });
  if (/^(open|launch|start) /i.test(text)) {
    let target = strip(text, ['Open ', 'Launch ', 'Start ']).replace(/^the\s+/i, '').replace(/\s+app(?:lication)?$/i, '');
    const alias = (context.appAliases || []).find(item => String(item.alias || item.name || '').toLowerCase() === target.toLowerCase());
    if (alias?.target) target = alias.target;
    if (/downloads|desktop|documents|pictures|movies|music|folder/i.test(target)) return result(text, 'openFolder', { target });
    return result(text, 'openApp', { target });
  }
  if (lower === 'play music') return result(text, 'openApp', { target: 'preferred music app' }, .84);
  const automaticMemory = context.automaticMemoryEnabled !== false ? classifyMemory(text) : null;
  if (automaticMemory && Array.isArray(context.memoryExcludedCategories) && context.memoryExcludedCategories.includes(automaticMemory.category)) return result(text, 'unknown', {}, .2);
  if (automaticMemory) return result(text, 'saveMemory', { ...automaticMemory, automatic: true }, .86);
  return result(text, 'unknown', {}, .2);
}

function projectFrom(text, context) {
  return (context.projects || []).find(name => text.toLowerCase().includes(name.toLowerCase())) || text.match(/ in my (.+?)( project|$)/i)?.[1] || '';
}

function preview(command, prefs = {}) {
  const p = command.parameters; const target = p.target || p.targets || p.query || p.title || p.routine || p.project || '';
  const descriptions = {
    openApp: [`Open an application`, `Open ${target}.`], openFolder: ['Open a folder', `Open ${target} in Finder.`],
    startTimer: ['Start a timer', `Start ${p.label || 'Focus'} for ${Math.round((p.seconds || 0) / 60)} minutes.`],
    saveMemory: [p.automatic ? 'Save an important fact automatically' : 'Save a memory', `Remember “${p.text}” on this Mac.`],
    askAI: ['Ask Jarvis', 'Answer conversationally using the configured provider and relevant local context.'],
    createReminder: ['Create a reminder', `Save “${p.title}” for ${p.date ? new Date(p.date).toLocaleString() : 'an unselected time'}.`],
    createCalendarEvent: ['Create a calendar event', `Save “${p.title}” for ${p.date ? new Date(p.date).toLocaleString() : 'an unselected time'} in Calendar.`],
    trashFile: ['Move an item to Trash', `Move “${target}” to Trash. It will not be permanently deleted.`],
    restartMac: ['Restart this Mac', 'Restart now. Unsaved work may be lost.'], shutDownMac: ['Shut down this Mac', 'Shut down now. Unsaved work may be lost.'],
    setBrightness: ['Open display controls', 'Open Displays settings; Jarvis will not use a private brightness API.'],
    toggleDoNotDisturb: ['Open Focus controls', 'Open Focus settings; Jarvis will not use brittle UI scripting.'],
    calculate: ['Calculate locally', `Calculate ${p.expression} without an AI service.`],
    getWeather: ['Check current weather', `Retrieve current conditions for ${p.location} without an AI service.`],
    openDirections: ['Open directions', `Open directions to ${p.destination} in Maps.`],
    findFiles: ['Search files', `Search Spotlight for “${p.query}”.`],
    runShortcut: ['Run a macOS Shortcut', `Run the exact saved shortcut “${p.name}”.`],
    spotifyPlay: ['Play on Spotify', `Find and play “${p.query}”, using web fallback when account playback is unavailable.`],
    spotifyPause: ['Pause Spotify', 'Pause current Spotify playback.'],
    spotifyResume: ['Resume Spotify', 'Resume Spotify playback.'],
    spotifyNext: ['Next Spotify item', 'Skip to the next item.'],
    spotifyPrevious: ['Previous Spotify item', 'Return to the previous item.'],
    sendEmail: ['Send an email', `Send to ${p.to} with subject “${p.subject}”: ${p.body}`],
    sendMessage: ['Send a message', `Send to ${p.to}: ${p.body}`],
    browserListTabs: ['List Chrome tabs', 'Read tab titles and URLs through the optional Jarvis Chrome extension.'],
    browserReadPage: ['Read the current page', 'Read visible text from the current Chrome tab after site permission is granted.'],
    readClipboard: ['Read the clipboard', 'Read only the clipboard item currently on this Mac.'],
    copyToClipboard: ['Copy text', `Copy “${p.text}” to the clipboard.`],
    showNotification: ['Show a notification', p.body],
    searchContacts: ['Search Contacts', `Search local Contacts for “${p.query}”.`],
    minimizeWindow: ['Minimize the focused window', 'Minimize the currently focused window using Accessibility.'],
    maximizeWindow: ['Maximize the focused window', 'Raise and maximize the currently focused window using Accessibility.'],
    closeWindow: ['Close the focused window', 'Close the currently focused window using Accessibility.'],
    duplicateFile: ['Duplicate a file', `Copy “${p.path}” to “${p.destination}” inside trusted folders.`],
    revealFile: ['Reveal a file', `Show “${p.path}” in Finder.`],
    showTime: ['Check the time locally', 'Read the current Mac time without contacting AI.'],
    showDate: ['Check the date locally', 'Read the current Mac date without contacting AI.'],
    batteryStatus: ['Check battery status', 'Read macOS battery and charging status locally.'],
    diskSpace: ['Check disk space', 'Read available startup-disk space locally.'],
    startScreenSaver: ['Start the screen saver', 'Open the macOS screen saver now.'],
    sleepDisplay: ['Sleep the display', 'Turn off the display; keyboard or pointer input wakes it.'],
    currentTrack: ['Identify current music', 'Read the current Spotify track locally.'],
    openTrash: ['Open Trash', 'Open your Trash folder in Finder.'],
    listApplications: ['List installed apps', 'List applications in the local Applications folder.']
  };
  const [interpretation, action] = descriptions[command.intent] || [command.intent.replace(/[A-Z]/g, m => ` ${m}`).replace(/^./, m => m.toUpperCase()), target ? `${command.intent}: ${target}` : command.intent];
  return { ...command, interpretation, action, requiresConfirmation: needsConfirmation(command.intent, prefs) };
}

module.exports = { parseCommand, preview, riskFor, needsConfirmation, duration, dateFrom, importantMemoryCandidate, classifyMemory };
