(function () {
  'use strict';

  const core = globalThis.InstagramExporterCore;
  const HOST_ID = 'ice-extension-host';
  const state = {
    meElement: null,
    userElement: null,
    root: null,
    stage: 0,
    messages: [],
    cleanupCalibration: null
  };

  if (!core || document.getElementById(HOST_ID)) return;

  function isDirect() {
    return /(^|\.)instagram\.com$/i.test(location.hostname) && location.pathname.startsWith('/direct/');
  }

  function directText(element) {
    return [...element.childNodes]
      .filter((node) => node.nodeType === 3)
      .map((node) => core.normalize(node.textContent))
      .filter(Boolean)
      .join(' ');
  }

  function isVisible(element) {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
  }

  function textElementAt(target, x, y) {
    if (!(target instanceof Element)) return null;
    const candidates = [target, ...target.querySelectorAll('span, div')]
      .filter((element) => isVisible(element) && core.normalize(element.innerText))
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
      })
      .sort((a, b) => {
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        return (ar.width * ar.height) - (br.width * br.height);
      });
    return candidates[0] || target;
  }

  function commonAncestor(a, b) {
    const ancestors = new Set();
    for (let node = a; node; node = node.parentElement) ancestors.add(node);
    for (let node = b; node; node = node.parentElement) {
      if (ancestors.has(node)) return node;
    }
    return document.body;
  }

  function contactName() {
    const rootRect = state.root?.getBoundingClientRect();
    const headings = [...document.querySelectorAll('header h1, header h2, header [role="heading"], main h1, main h2')]
      .filter(isVisible)
      .filter((element) => !rootRect || element.getBoundingClientRect().left >= rootRect.left - 40);
    return core.normalize(headings[0]?.textContent) || 'Contatto Instagram';
  }

  function extractMessages() {
    if (!state.root || !state.meElement?.isConnected || !state.userElement?.isConnected) return [];

    const myRect = state.meElement.getBoundingClientRect();
    const userRect = state.userElement.getBoundingClientRect();
    const left = Math.min(myRect.left, userRect.left) - 100;
    const right = Math.max(myRect.right, userRect.right) + 100;
    const divider = (myRect.left + myRect.right + userRect.left + userRect.right) / 4;
    const meIsRight = (myRect.left + myRect.right) > (userRect.left + userRect.right);
    const candidates = [...state.root.querySelectorAll('span, div')]
      .filter((element) => directText(element).length >= 2 && isVisible(element))
      .filter((element) => !element.closest('button, [role="button"], header, nav, form'))
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const center = rect.left + rect.width / 2;
        return center >= left && center <= right && Math.abs(center - divider) >= 35;
      });

    const messages = candidates.map((element) => {
      const text = core.normalize(directText(element));
      const rect = element.getBoundingClientRect();
      const onRight = rect.left + rect.width / 2 > divider;
      return {
        sender: onRight === meIsRight ? 'me' : 'user',
        text,
        top: rect.top,
        left: rect.left
      };
    }).filter((message) => !core.isMetaText(message.text));

    return core.dedupeMessages(messages.sort((a, b) => a.top - b.top || a.left - b.left))
      .map(({ top, left: ignoredLeft, ...message }) => message);
  }

  function payload() {
    return {
      format: 'instagram-chat-export/v2',
      platform: 'instagram',
      contact: contactName(),
      exportedAt: new Date().toISOString(),
      source: location.href,
      scope: 'messaggi caricati nel DOM dopo calibrazione manuale',
      messages: state.messages
    };
  }

  function download(extension, contents, mime) {
    const url = URL.createObjectURL(new Blob([contents], { type: `${mime};charset=utf-8` }));
    const anchor = Object.assign(document.createElement('a'), {
      href: url,
      download: `${core.safeFilename(contactName())}-${new Date().toISOString().slice(0, 10)}.${extension}`
    });
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function ui() {
    return document.getElementById(HOST_ID)?.shadowRoot;
  }

  function setStatus(text, error = false) {
    const element = ui()?.querySelector('[data-status]');
    if (!element) return;
    element.textContent = text;
    element.classList.toggle('error', error);
  }

  function render() {
    const shadow = ui();
    if (!shadow) return;
    shadow.querySelector('[data-count]').textContent = `${state.messages.length} messaggi rilevati`;
    shadow.querySelector('[data-preview]').textContent = state.messages.slice(-8).map((message) =>
      `${message.sender === 'me' ? 'IO' : 'UTENTE'}: ${message.text}`
    ).join('\n\n') || 'Prima calibra la conversazione';
    const ready = state.messages.length > 0;
    shadow.querySelectorAll('[data-export]').forEach((button) => { button.disabled = !ready; });
  }

  function refresh() {
    state.messages = extractMessages();
    render();
    setStatus(state.messages.length
      ? 'Anteprima pronta. Controlla IO/UTENTE prima di esportare.'
      : 'Nessun testo rilevato: ripeti la calibrazione.', !state.messages.length);
  }

  function stopCalibration() {
    state.cleanupCalibration?.();
    state.cleanupCalibration = null;
    document.documentElement.style.cursor = '';
  }

  function startCalibration() {
    stopCalibration();
    state.stage = 1;
    state.meElement = null;
    state.userElement = null;
    state.root = null;
    state.messages = [];
    render();
    setStatus('1/2 — clicca sul testo di un TUO messaggio nella chat.');
    document.documentElement.style.cursor = 'crosshair';

    const onClick = (event) => {
      if (event.composedPath().includes(document.getElementById(HOST_ID))) return;
      const selected = textElementAt(event.target, event.clientX, event.clientY);
      if (!selected || !core.normalize(selected.innerText)) return;
      event.preventDefault();
      event.stopImmediatePropagation();

      if (state.stage === 1) {
        state.meElement = selected;
        state.stage = 2;
        setStatus('2/2 — ora clicca sul testo di un messaggio dell’UTENTE.');
        return;
      }

      state.userElement = selected;
      state.root = commonAncestor(state.meElement, state.userElement);
      state.stage = 0;
      stopCalibration();
      refresh();
    };

    document.addEventListener('click', onClick, true);
    state.cleanupCalibration = () => document.removeEventListener('click', onClick, true);
  }

  function mount() {
    if (!isDirect() || document.getElementById(HOST_ID) || !document.body) return;
    const host = document.createElement('div');
    host.id = HOST_ID;
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        :host{all:initial} .toggle{position:fixed;right:18px;top:88px;z-index:2147483647;border:0;border-radius:999px;padding:11px 15px;background:#7c3aed;color:#fff;font:700 13px system-ui;box-shadow:0 5px 20px #0006;cursor:pointer}
        .panel{position:fixed;right:18px;top:138px;z-index:2147483647;width:min(410px,calc(100vw - 36px));padding:14px;border:1px solid #444;border-radius:14px;background:#18181b;color:#f5f5f5;box-shadow:0 12px 40px #0008;font:13px/1.4 system-ui}
        .panel[hidden]{display:none} header{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;font-size:15px} header button{border:0;background:transparent;color:#ddd;font-size:22px;cursor:pointer}
        pre{max-height:220px;overflow:auto;white-space:pre-wrap;padding:10px;border-radius:9px;background:#09090b;color:#e4e4e7;font:11px/1.45 ui-monospace,monospace}
        .grid{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin:10px 0}.grid button{border:1px solid #555;border-radius:8px;padding:9px;background:#27272a;color:#fff;cursor:pointer}.grid button:hover:not(:disabled){background:#3f3f46}.grid button:disabled{opacity:.45;cursor:not-allowed}
        [data-calibrate]{grid-column:1/-1;background:#6d28d9!important;font-weight:700}[data-status]{display:block;color:#a8e6b0}.error{color:#ff8b8b!important}
      </style>
      <button class="toggle" type="button">⇩ Chat</button>
      <section class="panel" hidden>
        <header><strong>Instagram Chat Exporter</strong><button data-close type="button">×</button></header>
        <div data-count>0 messaggi rilevati</div>
        <pre data-preview>Prima calibra la conversazione</pre>
        <div class="grid">
          <button data-calibrate type="button">Calibra: IO → UTENTE</button>
          <button data-refresh type="button">Aggiorna</button>
          <button data-invert type="button">Inverti IO/UTENTE</button>
          <button data-copy data-export disabled type="button">Copia per AI</button>
          <button data-md data-export disabled type="button">Scarica Markdown</button>
          <button data-json data-export disabled type="button">Scarica JSON</button>
        </div>
        <small data-status>I dati restano nel browser.</small>
      </section>`;
    document.body.appendChild(host);

    const panel = shadow.querySelector('.panel');
    shadow.querySelector('.toggle').addEventListener('click', () => { panel.hidden = !panel.hidden; });
    shadow.querySelector('[data-close]').addEventListener('click', () => { panel.hidden = true; stopCalibration(); });
    shadow.querySelector('[data-calibrate]').addEventListener('click', startCalibration);
    shadow.querySelector('[data-refresh]').addEventListener('click', refresh);
    shadow.querySelector('[data-invert]').addEventListener('click', () => {
      state.messages = state.messages.map((message) => ({ ...message, sender: message.sender === 'me' ? 'user' : 'me' }));
      render();
    });
    shadow.querySelector('[data-copy]').addEventListener('click', async () => {
      await navigator.clipboard.writeText(core.asAiText(state.messages));
      setStatus('Copiato negli appunti.');
    });
    shadow.querySelector('[data-md]').addEventListener('click', () => download('md', core.asMarkdown(payload()), 'text/markdown'));
    shadow.querySelector('[data-json]').addEventListener('click', () => download('json', JSON.stringify(payload(), null, 2), 'application/json'));
  }

  function sync() {
    const host = document.getElementById(HOST_ID);
    if (!isDirect()) { host?.remove(); stopCalibration(); return; }
    if (!host) mount();
  }

  sync();
  setInterval(sync, 1500);
})();

