const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const APPROVED_COMMANDS = {
  'git status': ['/usr/bin/git', ['status', '--short', '--branch']],
  'git log': ['/usr/bin/git', ['log', '--oneline', '-n', '10']],
  'npm test': ['/usr/bin/env', ['npm', 'test']],
  'npm run dev': ['/usr/bin/env', ['npm', 'run', 'dev']],
  'python3 --version': ['/usr/bin/python3', ['--version']],
  'node --version': ['/usr/bin/env', ['node', '--version']]
};

const protectedPaths = new Set(['/', '/System', '/Library', '/Applications', '/Users', os.homedir()]);

function canonical(target) {
  const absolute = path.resolve(target.replace(/^~(?=\/|$)/, os.homedir()));
  try { return fs.realpathSync.native(absolute); } catch { return absolute; }
}

function inside(root, candidate) {
  const relative = path.relative(canonical(root), canonical(candidate));
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}

function safeTrashTarget(target) {
  const resolved = canonical(target);
  if (protectedPaths.has(resolved) || path.dirname(resolved) === '/') throw new Error('Jarvis refuses broad or system-level Trash targets.');
  return resolved;
}

function run(executable, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd: options.cwd, shell: false, stdio: [options.input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'] });
    if (options.input !== undefined) { child.stdin.end(String(options.input)); }
    let output = ''; const cap = 32_000;
    const append = chunk => { output = (output + chunk.toString()).slice(-cap); };
    child.stdout.on('data', append); child.stderr.on('data', append);
    const timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error('Action timed out.')); }, options.timeout || 20_000);
    const abort = () => { child.kill('SIGTERM'); const error = new Error('Action cancelled.'); error.name = 'AbortError'; reject(error); };
    if (options.signal) { if (options.signal.aborted) return abort(); options.signal.addEventListener('abort', abort, { once: true }); }
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
      if (code === 0) resolve(output.trim()); else reject(new Error(output.trim() || `Action exited with status ${code}.`));
    });
  });
}

function appName(target, preferences) {
  const value = String(target || '').toLowerCase();
  if (value.includes('preferred editor')) return preferences.preferredEditor || 'Visual Studio Code';
  if (value.includes('preferred music')) return preferences.preferredMusicApp || 'Music';
  if (value === 'browser' || value.includes('preferred browser')) return preferences.defaultBrowser === 'System Default' ? 'Safari' : preferences.defaultBrowser;
  return target;
}

function knownFolder(target, electronApp, state) {
  const value = String(target).toLowerCase().replace(/^my /, '').replace(/ folder$/, '');
  const keys = { downloads: 'downloads', desktop: 'desktop', documents: 'documents', pictures: 'pictures', movies: 'videos', music: 'music', home: 'home' };
  if (keys[value]) return electronApp.getPath(keys[value]);
  return state.favoriteFolders.find(item => item.name.toLowerCase() === value || item.path.toLowerCase().includes(value))?.path;
}

function approvedProject(project, state) {
  if (!project && state.trustedProjects.length === 1) return canonical(state.trustedProjects[0].path);
  const match = state.trustedProjects.find(item => item.name.toLowerCase() === String(project).toLowerCase() || canonical(item.path) === canonical(project || '.'));
  if (!match) throw new Error('Choose this project as a trusted folder in Settings first.');
  const root = canonical(match.path);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw new Error('The trusted project folder is unavailable.');
  return root;
}

function approvedFilePath(target, state) {
  const resolved = canonical(String(target || ''));
  const roots = [...state.trustedProjects, ...state.favoriteFolders].map(item => item.path);
  if (!roots.some(root => inside(root, resolved))) throw new Error('Add the containing folder to Trusted projects or Favorites first.');
  return resolved;
}

async function executeNative(command, context) {
  const { shell, app, store, clipboard } = context;
  const state = store.snapshot(); const p = command.parameters || {};
  const openWeb = url => state.preferences.defaultBrowser && state.preferences.defaultBrowser !== 'System Default' ? run('/usr/bin/open', ['-a', state.preferences.defaultBrowser, url]).then(() => undefined) : shell.openExternal(url);
  switch (command.intent) {
    case 'openApp':
    case 'switchApp': return run('/usr/bin/open', ['-a', appName(p.target || p.targets, state.preferences)]).then(() => 'Application opened.');
    case 'hideApp': return run('/usr/bin/osascript', ['-e', `tell application ${JSON.stringify(appName(p.target, state.preferences))} to hide`]).then(() => 'Application hidden.');
    case 'quitApp': return run('/usr/bin/osascript', ['-e', `tell application ${JSON.stringify(appName(p.target, state.preferences))} to quit`]).then(() => 'Application quit.');
    case 'openFolder': {
      const folder = knownFolder(p.target, app, state);
      if (!folder) throw new Error('Add that folder to Favorites in Settings first.');
      return shell.openPath(folder).then(error => { if (error) throw new Error(error); return 'Folder opened in Finder.'; });
    }
    case 'openProject': {
      const root = approvedProject(p.project, state);
      await run('/usr/bin/open', ['-a', appName(p.editor || 'preferred editor', state.preferences), root]); return 'Project opened.';
    }
    case 'findFiles': {
      const args = [];
      if (p.root) args.push('-onlyin', approvedProject(p.root, state));
      args.push(String(p.query || '').slice(0, 200));
      const output = await run('/usr/bin/mdfind', args, { timeout: 15_000 });
      const matches = output.split('\n').filter(Boolean).slice(0, 20);
      return matches.length ? matches.join('\n') : 'No matching files were found.';
    }
    case 'readTextFile': {
      const target = approvedFilePath(p.path, state);
      const stats = fs.statSync(target); if (!stats.isFile() || stats.size > 2_000_000) throw new Error('Jarvis reads text files up to 2 MB.');
      if (fs.readFileSync(target).includes(0)) throw new Error('That appears to be a binary file.');
      return fs.readFileSync(target, 'utf8');
    }
    case 'writeTextFile': {
      const target = approvedFilePath(p.path, state); const content = String(p.content || '');
      if (Buffer.byteLength(content) > 2_000_000) throw new Error('Jarvis writes text files up to 2 MB.');
      if (!fs.existsSync(path.dirname(target))) throw new Error('The destination folder does not exist.');
      const temp = `${target}.jarvis-${process.pid}.tmp`; fs.writeFileSync(temp, content, { mode: fs.existsSync(target) ? fs.statSync(target).mode : 0o600 }); fs.renameSync(temp, target); return `Saved ${path.basename(target)}.`;
    }
    case 'moveFile': {
      const source = approvedFilePath(p.source, state); const destination = approvedFilePath(p.destination, state);
      if (!fs.existsSync(source)) throw new Error('The source item does not exist.'); if (fs.existsSync(destination)) throw new Error('The destination already exists.');
      fs.renameSync(source, destination); return `Moved ${path.basename(source)} to ${destination}.`;
    }
    case 'renameFile': {
      const source = approvedFilePath(p.path, state); const name = String(p.name || '').trim();
      if (!name || name.includes('/') || name === '.' || name === '..') throw new Error('The new file name is invalid.');
      const destination = approvedFilePath(path.join(path.dirname(source), name), state); if (fs.existsSync(destination)) throw new Error('An item with that name already exists.');
      fs.renameSync(source, destination); return `Renamed the item to ${name}.`;
    }
    case 'duplicateFile': {
      const source = approvedFilePath(p.path, state); const destination = approvedFilePath(p.destination, state);
      if (!fs.existsSync(source) || !fs.statSync(source).isFile()) throw new Error('The source file does not exist.');
      if (fs.existsSync(destination)) throw new Error('The duplicate destination already exists.');
      fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL); return `Duplicated ${path.basename(source)} as ${path.basename(destination)}.`;
    }
    case 'revealFile': {
      const target = approvedFilePath(p.path, state); await shell.showItemInFolder(target); return `Revealed ${path.basename(target)} in Finder.`;
    }
    case 'openURL': {
      const url = new URL(p.url); if (url.protocol !== 'https:') throw new Error('Jarvis opens HTTPS links only.');
      await openWeb(url.toString()); return 'Link opened in your browser.';
    }
    case 'openDirections': {
      const destination = String(p.destination || '').trim(); if (!destination) throw new Error('A destination is required.');
      const components = new URLSearchParams({ daddr: destination }); if (p.origin) components.set('saddr', p.origin);
      await openWeb(`https://maps.apple.com/?${components}`); return `Opened directions to ${destination}.`;
    }
    case 'runShortcut': {
      const name = String(p.name || '').trim(); if (!name || name.length > 120 || /[\r\n\0]/.test(name)) throw new Error('That Shortcut name is invalid.');
      await run('/usr/bin/shortcuts', ['run', name], { timeout: 120_000 }); return `Shortcut “${name}” completed.`;
    }
    case 'listShortcuts': {
      const output = await run('/usr/bin/shortcuts', ['list'], { timeout: 30_000 }); return output || 'No macOS Shortcuts were found.';
    }
    case 'searchWeb': case 'searchYouTube': case 'searchWikipedia': case 'searchGitHub': case 'searchSpotify': case 'searchChatGPT': {
      const webBases = { Google: 'https://www.google.com/search?q=', DuckDuckGo: 'https://duckduckgo.com/?q=', Bing: 'https://www.bing.com/search?q=' };
      const bases = { searchWeb: webBases[state.preferences.searchEngine] || webBases.Google, searchYouTube: 'https://www.youtube.com/results?search_query=', searchWikipedia: 'https://en.wikipedia.org/w/index.php?search=', searchGitHub: 'https://github.com/search?q=', searchSpotify: 'https://open.spotify.com/search/', searchChatGPT: 'https://chatgpt.com/' };
      if (command.intent === 'searchChatGPT') clipboard.writeText(p.query || '');
      await openWeb(bases[command.intent] + (command.intent === 'searchChatGPT' ? '' : encodeURIComponent(p.query || '')));
      return command.intent === 'searchChatGPT' ? 'ChatGPT opened and the query was copied. Paste it when you are ready.' : 'Search opened in your browser.';
    }
    case 'setVolume': return run('/usr/bin/osascript', ['-e', `set volume output volume ${Number(p.percent)}`]).then(() => `Volume set to ${p.percent}%.`);
    case 'mute': return run('/usr/bin/osascript', ['-e', 'set volume with output muted']).then(() => 'Audio muted.');
    case 'unmute': return run('/usr/bin/osascript', ['-e', 'set volume without output muted']).then(() => 'Audio unmuted.');
    case 'adjustVolume': return run('/usr/bin/osascript', ['-e', `set volume output volume ((output volume of (get volume settings)) + ${Number(p.delta)})`]).then(() => 'Volume adjusted.');
    case 'setBrightness': return shell.openExternal('x-apple.systempreferences:com.apple.Displays-Settings.extension').then(() => 'Displays settings opened.');
    case 'toggleDoNotDisturb': return shell.openExternal('x-apple.systempreferences:com.apple.Focus-Settings.extension').then(() => 'Focus settings opened.');
    case 'openSystemSettings': {
      const panes = { Bluetooth: 'com.apple.BluetoothSettings', 'Wi-Fi': 'com.apple.wifi-settings-extension', Battery: 'com.apple.Battery-Settings.extension', Sound: 'com.apple.Sound-Settings.extension', Displays: 'com.apple.Displays-Settings.extension', Keyboard: 'com.apple.Keyboard-Settings.extension', Trackpad: 'com.apple.Trackpad-Settings.extension', Mouse: 'com.apple.Mouse-Settings.extension', Printers: 'com.apple.Print-Scan-Settings.extension', Wallpaper: 'com.apple.Wallpaper-Settings.extension', Notifications: 'com.apple.Notifications-Settings.extension', Privacy: 'com.apple.settings.PrivacySecurity.extension', General: 'com.apple.systempreferences.GeneralSettings' };
      await shell.openExternal(`x-apple.systempreferences:${panes[p.pane] || panes.General}`); return `${p.pane || 'General'} settings opened.`;
    }
    case 'takeScreenshot': return run('/usr/sbin/screencapture', ['-i']).then(() => 'Screenshot interface opened.');
    case 'batteryStatus': {
      const output = await run('/usr/bin/pmset', ['-g', 'batt']);
      const status = output.split('\n').find(line => /\d+%/.test(line))?.trim();
      return status || 'Battery status is unavailable on this Mac.';
    }
    case 'diskSpace': {
      const output = await run('/bin/df', ['-h', '/']);
      const columns = output.trim().split('\n').at(-1)?.trim().split(/\s+/) || [];
      return columns.length >= 5 ? `Startup disk: ${columns[3]} available of ${columns[1]} (${columns[4]} used).` : output;
    }
    case 'startScreenSaver': return run('/usr/bin/open', ['/System/Library/CoreServices/ScreenSaverEngine.app']).then(() => 'Screen saver started.');
    case 'sleepDisplay': return run('/usr/bin/pmset', ['displaysleepnow']).then(() => 'Display sleep requested.');
    case 'currentTrack': {
      if (!fs.existsSync('/Applications/Spotify.app')) throw new Error('Spotify desktop is not installed.');
      const output = await run('/usr/bin/osascript', ['-e', 'tell application "Spotify" to if player state is playing then return (name of current track) & " — " & (artist of current track) else return "Spotify is not currently playing."']);
      return output || 'Spotify is not currently playing.';
    }
    case 'openTrash': return shell.openPath(path.join(os.homedir(), '.Trash')).then(error => { if (error) throw new Error(error); return 'Trash opened in Finder.'; });
    case 'inspectTrash': {
      const root = path.join(os.homedir(), '.Trash'); let count = 0; let bytes = 0; const stack = [root];
      while (stack.length && count < 5_000) { const current = stack.pop(); let entries = []; try { entries = fs.readdirSync(current, { withFileTypes: true }); } catch { continue; } for (const entry of entries) { const child = path.join(current, entry.name); count += 1; if (entry.isDirectory()) stack.push(child); else { try { bytes += fs.statSync(child).size; } catch {} } if (count >= 5_000) break; } }
      return `Trash contains ${count}${count >= 5_000 ? '+' : ''} item${count === 1 ? '' : 's'}, approximately ${(bytes / 1024 / 1024).toFixed(1)} MB in scanned files. Nothing was deleted.`;
    }
    case 'getFrontAppContext': {
      const target = String(p.app || '').trim().toLowerCase();
      const scripts = { finder: 'tell application "Finder" to if (count of Finder windows) > 0 then return POSIX path of (target of front Finder window as alias)', safari: 'tell application "Safari" to if (count of documents) > 0 then return URL of front document', chrome: 'tell application "Google Chrome" to return URL of active tab of front window', 'google chrome': 'tell application "Google Chrome" to return URL of active tab of front window', edge: 'tell application "Microsoft Edge" to return URL of active tab of front window', 'microsoft edge': 'tell application "Microsoft Edge" to return URL of active tab of front window', brave: 'tell application "Brave Browser" to return URL of active tab of front window' };
      if (!scripts[target]) throw new Error('Front-app context supports Finder, Safari, Chrome, Edge, and Brave.');
      const output = await run('/usr/bin/osascript', ['-e', scripts[target]], { timeout: 8_000 }); return output || 'The selected app has no open window.';
    }
    case 'listApplications': {
      const applications = fs.readdirSync('/Applications', { withFileTypes: true }).filter(item => item.isDirectory() && item.name.endsWith('.app')).map(item => item.name.replace(/\.app$/, '')).sort((a, b) => a.localeCompare(b)).slice(0, 80);
      return applications.length ? applications.join('\n') : 'No applications were found in /Applications.';
    }
    case 'spotifyPlay': {
      const query = String(p.query || '').trim(); if (!query) throw new Error('Tell me what to play.');
      const webTrack = query.match(/^https:\/\/open\.spotify\.com\/(track|album|playlist)\/([A-Za-z0-9]+)/i);
      const uri = /^spotify:(track|album|playlist):[A-Za-z0-9]+$/i.test(query) ? query : webTrack ? `spotify:${webTrack[1].toLowerCase()}:${webTrack[2]}` : null;
      if (fs.existsSync('/Applications/Spotify.app')) {
        if (uri) { await run('/usr/bin/osascript', ['-e', `tell application "Spotify" to play track ${JSON.stringify(uri)}`]); return 'Spotify playback started.'; }
        await run('/usr/bin/open', [`spotify:search:${encodeURIComponent(query)}`]);
        return `Spotify opened to results for “${query}”. Directly starting an arbitrary search result is a Premium Web API feature, so Jarvis will not pretend it played one.`;
      }
      await openWeb(`https://open.spotify.com/search/${encodeURIComponent(query)}`); return `Opened Spotify results for “${query}” in the web player.`;
    }
    case 'spotifyPause':
    case 'spotifyResume':
    case 'spotifyNext':
    case 'spotifyPrevious': {
      if (!fs.existsSync('/Applications/Spotify.app')) throw new Error('Spotify desktop is not installed. Connect Spotify in Jarvis or use the web player.');
      const commands = { spotifyPause: 'pause', spotifyResume: 'play', spotifyNext: 'next track', spotifyPrevious: 'previous track' };
      await run('/usr/bin/osascript', ['-e', `tell application "Spotify" to ${commands[command.intent]}`]); return 'Spotify playback updated.';
    }
    case 'lockScreen': return run('/System/Library/CoreServices/Menu Extras/User.menu/Contents/Resources/CGSession', ['-suspend']).then(() => 'Screen locked.');
    case 'restartMac': return run('/usr/bin/osascript', ['-e', 'tell application "System Events" to restart']).then(() => 'Restart requested.');
    case 'shutDownMac': return run('/usr/bin/osascript', ['-e', 'tell application "System Events" to shut down']).then(() => 'Shut down requested.');
    case 'trashFile': {
      const target = safeTrashTarget(p.target); if (!fs.existsSync(target)) throw new Error('That item does not exist.');
      await shell.trashItem(target); return 'Item moved to Trash.';
    }
    case 'openTerminal': {
      if (p.prefill) clipboard.writeText(p.prefill);
      await run('/usr/bin/open', ['-a', 'Terminal']); return p.prefill ? 'Terminal opened and the unsupported command was copied for manual review.' : 'Terminal opened.';
    }
    case 'gitStatus': case 'gitLog': case 'runDeveloperCommand': {
      if (!state.preferences.developerModeEnabled) throw new Error('Enable Developer mode in Settings first.');
      const key = command.intent === 'gitStatus' ? 'git status' : command.intent === 'gitLog' ? 'git log' : p.command;
      const spec = APPROVED_COMMANDS[key]; if (!spec) throw new Error('That developer command is not approved.');
      const cwd = approvedProject(p.project, state);
      if (!inside(cwd, cwd)) throw new Error('Command escaped the trusted project root.');
      return (await run(spec[0], spec[1], { cwd, timeout: 30_000 })) || 'Command completed successfully.';
    }
    case 'applyCodePatch': {
      if (!state.preferences.developerModeEnabled) throw new Error('Enable Developer mode in Settings first.');
      const cwd = approvedProject(p.project, state); const patchText = String(p.patch || '');
      if (!patchText || Buffer.byteLength(patchText) > 500_000 || !/^diff --git /m.test(patchText)) throw new Error('Jarvis accepts unified Git patches up to 500 KB.');
      const changed = (await run('/usr/bin/git', ['diff', '--name-only'], { cwd, timeout: 15_000 })).split('\n').filter(Boolean);
      const touched = [...patchText.matchAll(/^\+\+\+ b\/(.+)$/gm)].map(match => match[1]);
      if (touched.some(file => changed.includes(file))) throw new Error('The patch overlaps uncommitted changes. Review or commit them first.');
      await run('/usr/bin/git', ['apply', '--check', '--whitespace=nowarn', '-'], { cwd, input: patchText, timeout: 20_000 });
      await run('/usr/bin/git', ['apply', '--whitespace=nowarn', '-'], { cwd, input: patchText, timeout: 20_000 }); return `Applied a reviewed patch to ${touched.length} file${touched.length === 1 ? '' : 's'}.`;
    }
    default: throw new Error('This action is handled by Jarvis itself.');
  }
}

module.exports = { executeNative, canonical, inside, safeTrashTarget, approvedFilePath, APPROVED_COMMANDS };
