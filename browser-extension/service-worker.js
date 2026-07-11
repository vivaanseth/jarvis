let port;

function connect() {
  if (port) return port;
  port = chrome.runtime.connectNative('com.local.jarvis.browser');
  port.onMessage.addListener(handleRequest);
  port.onDisconnect.addListener(() => { port = null; chrome.storage.local.set({ connected: false }); });
  chrome.storage.local.set({ connected: true });
  return port;
}

async function permitted(url) {
  const origin = new URL(url).origin + '/*';
  return chrome.permissions.contains({ origins: [origin] });
}

async function activeTab() { return (await chrome.tabs.query({ active: true, currentWindow: true }))[0]; }

async function handleRequest(request) {
  const reply = result => port?.postMessage({ id: request.id, ok: true, result });
  const fail = error => port?.postMessage({ id: request.id, ok: false, error: error.message || String(error) });
  try {
    const params = request.params || {};
    if (request.method === 'browser.listTabs') return reply((await chrome.tabs.query({})).map(({ id, title, url, active, pinned, mutedInfo }) => ({ id, title, url, active, pinned, muted: mutedInfo?.muted || false })));
    if (request.method === 'browser.openTab') return reply(await chrome.tabs.create({ url: params.url, active: params.active !== false }));
    if (request.method === 'browser.activateTab') { await chrome.tabs.update(Number(params.tabId), { active: true }); return reply(true); }
    if (request.method === 'browser.closeTab') { await chrome.tabs.remove(Number(params.tabId)); return reply(true); }
    if (request.method === 'browser.moveTab') return reply(await chrome.tabs.move(Number(params.tabId), { index: Math.max(0, Number(params.index || 0)) }));
    if (request.method === 'browser.pinTab') return reply(await chrome.tabs.update(Number(params.tabId), { pinned: Boolean(params.pinned) }));
    if (request.method === 'browser.muteTab') return reply(await chrome.tabs.update(Number(params.tabId), { muted: Boolean(params.muted) }));
    const tab = params.tabId ? await chrome.tabs.get(Number(params.tabId)) : await activeTab();
    if (!tab?.id || !/^https?:/.test(tab.url || '')) throw new Error('Choose a normal web page first.');
    if (!(await permitted(tab.url))) throw new Error(`Grant Jarvis access to ${new URL(tab.url).origin} from the extension toolbar first.`);
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content-script.js'] });
    const response = await chrome.tabs.sendMessage(tab.id, { method: request.method, params });
    if (!response?.ok) throw new Error(response?.error || 'The page did not accept that browser action.');
    reply(response.result);
  } catch (error) { fail(error); }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'connect') { connect(); sendResponse({ ok: true }); return; }
  if (message.type === 'grant') {
    activeTab().then(tab => chrome.permissions.request({ origins: [new URL(tab.url).origin + '/*'] })).then(granted => {
      if (!granted) return sendResponse({ ok: false, error: 'Site access was not granted.' });
      return chrome.scripting.executeScript({ target: { tabId: message.tabId }, files: ['content-script.js'] }).then(() => sendResponse({ ok: true }));
    }).catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }
});

connect();
