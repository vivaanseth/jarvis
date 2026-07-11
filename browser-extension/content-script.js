(() => {
  if (globalThis.__jarvisBridgeInstalled) return;
  globalThis.__jarvisBridgeInstalled = true;
  const sensitive = element => {
    const text = `${element.type || ''} ${element.name || ''} ${element.id || ''} ${element.autocomplete || ''} ${element.getAttribute?.('aria-label') || ''}`.toLowerCase();
    return element.type === 'password' || /(password|passcode|otp|one.?time|verification|security.?code|credit|debit|card.?number|cvv|cvc|expiry|captcha|recovery|secret|token)/.test(text);
  };
  const visible = element => Boolean(element && element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden');
  const describe = element => ({ tag: element.tagName.toLowerCase(), text: (element.innerText || element.value || element.getAttribute('aria-label') || '').trim().slice(0, 300), role: element.getAttribute('role'), name: element.getAttribute('name'), type: element.type });
  const candidates = selector => [...document.querySelectorAll(selector)].filter(visible).slice(0, 200);
  const byLabel = label => {
    const needle = String(label || '').trim().toLowerCase();
    return candidates('button,a,input,textarea,select,[role="button"],[role="link"],[contenteditable="true"]').find(element => (element.innerText || element.value || element.getAttribute('aria-label') || element.title || '').trim().toLowerCase().includes(needle));
  };
  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    try {
      const params = request.params || {}; let result;
      if (request.method === 'browser.readPage') result = { url: location.href, title: document.title, text: (document.body.innerText || '').replace(/\n{3,}/g, '\n\n').slice(0, 80_000), headings: candidates('h1,h2,h3').map(describe), links: candidates('a[href]').slice(0, 80).map(element => ({ text: describe(element).text, href: element.href })) };
      else if (request.method === 'browser.click') { const element = byLabel(params.label); if (!element) throw new Error(`No visible control matched “${params.label}”.`); if (sensitive(element)) throw new Error('Jarvis will not interact with sensitive authentication or payment controls.'); if (/submit|purchase|buy|book|send|post|confirm|place order|subscribe|accept/i.test(describe(element).text)) throw new Error('This is a consequential submit control and requires an exact final confirmation flow.'); element.click(); result = describe(element); }
      else if (request.method === 'browser.type') { const element = byLabel(params.label); if (!element || !('value' in element)) throw new Error(`No editable field matched “${params.label}”.`); if (sensitive(element)) throw new Error('Jarvis will not type passwords, payment details, one-time codes, or secrets.'); element.focus(); element.value = String(params.text || '').slice(0, 20_000); element.dispatchEvent(new Event('input', { bubbles: true })); element.dispatchEvent(new Event('change', { bubbles: true })); result = describe(element); }
      else if (request.method === 'browser.submit') { const element = byLabel(params.label); if (!element) throw new Error(`No visible submit control matched “${params.label}”.`); if (sensitive(element)) throw new Error('Jarvis will not interact with sensitive authentication or payment controls.'); if (params.confirmed !== true || !String(params.summary || '').trim()) throw new Error('A reviewed final confirmation is required before submitting.'); element.click(); result = describe(element); }
      else throw new Error('Unsupported page action.');
      sendResponse({ ok: true, result });
    } catch (error) { sendResponse({ ok: false, error: error.message }); }
  });
})();
