const status = document.querySelector('#status');
chrome.storage.local.get('connected').then(value => status.textContent = value.connected ? 'Connected to the local Jarvis app.' : 'Jarvis is not connected yet.');
document.querySelector('#connect').onclick = () => chrome.runtime.sendMessage({ type: 'connect' }).then(result => { status.textContent = result?.ok ? 'Connected to the local Jarvis app.' : result?.error || 'Connection failed.'; });
document.querySelector('#grant').onclick = async () => { const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); const result = await chrome.runtime.sendMessage({ type: 'grant', tabId: tab.id }); status.textContent = result?.ok ? `Access granted to ${new URL(tab.url).origin}.` : result?.error || 'Site access was not granted.'; };
