// ==UserScript==
// @name         Instagram Chat Exporter (locale)
// @namespace    https://local.instagram-chat-exporter/
// @version      0.2.0
// @description  Esporta la chat Instagram aperta in Markdown, JSON o testo compatto per AI.
// @author       Alessandro
// @match        https://www.instagram.com/direct/*
// @match        https://instagram.com/direct/*
// @run-at       document-idle
// @grant        GM_setClipboard
// @grant        GM_download
// ==/UserScript==

(function () {
  'use strict';

  const APP_ID = 'ice-instagram-chat-exporter';
  const STATE = { inverted: false, messages: [] };

  // Seconda barriera oltre a @match: lo script non si avvia fuori dai Direct di Instagram.
  const isInstagramDirect = () =>
    /(^|\.)instagram\.com$/i.test(location.hostname) &&
    location.pathname.startsWith('/direct/');

  if (!isInstagramDirect() || document.getElementById(APP_ID)) return;

  const normalize = (value) => (value || '').replace(/\s+/g, ' ').trim();

  function escapeMarkdown(value) {
    return value.replace(/\\/g, '\\\\').replace(/([*_`[\]])/g, '\\$1');
  }

  function contactName(context = findConversationContext()) {
    const main = context?.pane || document.querySelector('main');
    const candidates = [
      main?.querySelector('header h1, header h2, header [role="heading"]'),
      document.querySelector('main h1, main h2'),
      document.querySelector('header [role="heading"]')
    ];
    return normalize(candidates.find(Boolean)?.textContent) || 'Contatto Instagram';
  }

  function isVisible(element) {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
  }

  function findConversationContext() {
    const main = document.querySelector('main');
    if (!main) return null;

    const composer = [...main.querySelectorAll('textarea, [contenteditable="true"], input')]
      .filter(isVisible)
      .find((element) => /scrivi|messaggio|message/i.test([
        element.getAttribute('placeholder'),
        element.getAttribute('aria-label'),
        element.getAttribute('data-placeholder')
      ].filter(Boolean).join(' ')));

    if (!composer) return null;
    const composerRect = composer.getBoundingClientRect();
    const minimumPaneWidth = Math.min(480, innerWidth * 0.42);
    const ancestors = [];
    for (let node = composer.parentElement; node && node !== document.body; node = node.parentElement) {
      const rect = node.getBoundingClientRect();
      if (rect.width >= minimumPaneWidth && rect.left <= composerRect.left + 40 && rect.right >= composerRect.right - 40) {
        ancestors.push(node);
      }
      if (node === main) break;
    }

    // Il più grande antenato che conserva il bordo sinistro del composer è il pannello
    // della conversazione; un antenato che si sposta molto più a sinistra include l'inbox.
    const pane = ancestors
      .filter((node) => node.getBoundingClientRect().left >= composerRect.left - 90)
      .sort((a, b) => b.getBoundingClientRect().height - a.getBoundingClientRect().height)[0]
      || composer.closest('form')?.parentElement
      || main;

    const paneRect = pane.getBoundingClientRect();
    return {
      main,
      pane,
      composer,
      bounds: {
        left: Math.max(paneRect.left, composerRect.left - 45),
        right: Math.min(paneRect.right, composerRect.right + 45),
        middle: (Math.max(paneRect.left, composerRect.left - 45) + Math.min(paneRect.right, composerRect.right + 45)) / 2
      }
    };
  }

  function isInsideHorizontalBounds(element, bounds) {
    const rect = element.getBoundingClientRect();
    const overlap = Math.max(0, Math.min(rect.right, bounds.right) - Math.max(rect.left, bounds.left));
    return overlap >= Math.min(rect.width * 0.7, 120) && rect.right > bounds.middle;
  }

  function hasBubbleAppearance(element) {
    const style = getComputedStyle(element);
    const radius = Math.max(
      parseFloat(style.borderTopLeftRadius) || 0,
      parseFloat(style.borderTopRightRadius) || 0,
      parseFloat(style.borderBottomLeftRadius) || 0,
      parseFloat(style.borderBottomRightRadius) || 0
    );
    const background = style.backgroundColor;
    return radius >= 8 && background && !/rgba?\(0, 0, 0(?:, 0)?\)|transparent/i.test(background);
  }

  function directTextLength(element) {
    return [...element.childNodes]
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => normalize(node.textContent))
      .join('').length;
  }

  function candidateRows(context) {
    const { pane, bounds, composer } = context;
    const roleRows = [...pane.querySelectorAll('[role="row"]')]
      .filter((row) => isVisible(row) && isInsideHorizontalBounds(row, bounds))
      .filter((row) => !row.contains(composer))
      .filter((row) => ![...row.querySelectorAll('[role="row"]')].some((child) => child !== row && isInsideHorizontalBounds(child, bounds)));
    if (roleRows.length) return roleRows;

    // Ripiego: risale dai nodi di testo alla bolla visiva più vicina. Usare una
    // sola bolla per messaggio impedisce di esportare gli stessi testi annidati.
    const bubbles = new Set();
    const textElements = [...pane.querySelectorAll('span, div')]
      .filter((element) => directTextLength(element) > 0 && isVisible(element));

    for (const textElement of textElements) {
      let node = textElement;
      while (node && node !== pane && !hasBubbleAppearance(node)) node = node.parentElement;
      if (!node || node === pane || node.contains(composer)) continue;
      const rect = node.getBoundingClientRect();
      if (!isInsideHorizontalBounds(node, bounds)) continue;
      if (rect.width > (bounds.right - bounds.left) * 0.86 || rect.height > 600) continue;
      bubbles.add(node);
    }
    return [...bubbles];
  }

  function cleanRowText(row) {
    const clone = row.cloneNode(true);
    clone.querySelectorAll('svg, button, input, textarea, [role="button"]').forEach((node) => node.remove());
    const lines = (clone.innerText || '')
      .split(/\n+/)
      .map(normalize)
      .filter(Boolean)
      .filter((line) => !/^(Mi piace|Rispondi|Inoltra|Altro|Visualizzato|Invio\.\.\.)$/i.test(line));
    const withoutStandaloneTimes = lines.filter((line) =>
      !/^(?:(?:lun|mar|mer|merc|gio|ven|sab|dom)(?:edì|edì|coledì|vedì|ato|enica)?\s+)?\d{1,2}:\d{2}$/i.test(line)
      && !/^(?:oggi|ieri)$/i.test(line)
    );
    return [...new Set(withoutStandaloneTimes)].join('\n').trim();
  }

  function messageVisualRect(row, bounds) {
    const candidates = [row, ...row.querySelectorAll('div, span')]
      .filter((element) => isVisible(element) && hasBubbleAppearance(element))
      .filter((element) => normalize(element.innerText))
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width <= (bounds.right - bounds.left) * 0.86 && rect.height <= 600;
      })
      .sort((a, b) => {
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        return (ar.width * ar.height) - (br.width * br.height);
      });
    return (candidates[0] || row).getBoundingClientRect();
  }

  function extractMessages() {
    const context = findConversationContext();
    if (!context) return [];

    const { bounds, composer } = context;
    const found = [];
    const fingerprints = new Map();

    for (const row of candidateRows(context)) {
      if (row.closest(`#${APP_ID}`) || row.contains(composer) || row.querySelector('textarea, input, [contenteditable="true"]')) continue;
      const text = cleanRowText(row);
      if (!text || text.length > 10000) continue;

      const rect = messageVisualRect(row, bounds);
      const center = rect.left + rect.width / 2;
      const edgeBias = (rect.right - bounds.middle) - (bounds.middle - rect.left);
      let sender = center > bounds.middle || edgeBias > 0 ? 'me' : 'user';
      if (STATE.inverted) sender = sender === 'me' ? 'user' : 'me';

      // Instagram può replicare lo stesso nodo in wrapper sovrapposti. Deduplica
      // per testo/mittente/posizione con una piccola tolleranza verticale.
      const fingerprint = `${sender}|${text}`;
      const previousTop = fingerprints.get(fingerprint);
      if (previousTop !== undefined && Math.abs(previousTop - rect.top) < 12) continue;
      fingerprints.set(fingerprint, rect.top);

      found.push({
        sender,
        text,
        order: rect.top,
        timestamp: row.querySelector('time')?.getAttribute('datetime') || null
      });
    }

    return found
      .sort((a, b) => a.order - b.order)
      .map(({ order, ...message }) => message);
  }

  function exportPayload() {
    const messages = STATE.messages;
    return {
      format: 'instagram-chat-export/v1',
      platform: 'instagram',
      contact: contactName(),
      exportedAt: new Date().toISOString(),
      source: location.href,
      scope: 'messaggi attualmente caricati nella pagina',
      messages
    };
  }

  function asMarkdown(payload) {
    const body = payload.messages.map((message) => {
      const label = message.sender === 'me' ? 'IO' : 'UTENTE';
      const time = message.timestamp ? ` · ${message.timestamp}` : '';
      return `**${label}**${time}\n${escapeMarkdown(message.text)}`;
    }).join('\n\n');
    return `# Conversazione Instagram\n\nContatto: ${escapeMarkdown(payload.contact)}\nEsportata: ${payload.exportedAt}\n\n${body}\n`;
  }

  function asAiText(payload) {
    return payload.messages
      .map((message) => `${message.sender === 'me' ? 'IO' : 'UTENTE'}: ${message.text.replace(/\n+/g, ' ')}`)
      .join('\n');
  }

  function safeFilename(value) {
    return normalize(value).replace(/[<>:"/\\|?*\x00-\x1F]/g, '-').slice(0, 80) || 'chat-instagram';
  }

  function download(name, contents, mime) {
    const blobUrl = URL.createObjectURL(new Blob([contents], { type: `${mime};charset=utf-8` }));
    const filename = `${safeFilename(contactName())}-${new Date().toISOString().slice(0, 10)}.${name}`;
    if (typeof GM_download === 'function') {
      GM_download({ url: blobUrl, name: filename, saveAs: true, onload: () => URL.revokeObjectURL(blobUrl) });
    } else {
      const anchor = Object.assign(document.createElement('a'), { href: blobUrl, download: filename });
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    }
  }

  async function copy(value) {
    if (typeof GM_setClipboard === 'function') GM_setClipboard(value, 'text');
    else await navigator.clipboard.writeText(value);
    setStatus('Copiato negli appunti.');
  }

  function setStatus(message, error = false) {
    const status = document.querySelector(`#${APP_ID} [data-status]`);
    if (!status) return;
    status.textContent = message;
    status.style.color = error ? '#ff8b8b' : '#a8e6b0';
  }

  function refresh() {
    STATE.messages = extractMessages();
    const count = document.querySelector(`#${APP_ID} [data-count]`);
    if (count) count.textContent = `${STATE.messages.length} messaggi rilevati`;
    setStatus(STATE.messages.length
      ? 'Controlla l’anteprima prima di esportare.'
      : 'Nessun messaggio rilevato: apri una chat e scorri per caricarla.', !STATE.messages.length);
    renderPreview();
  }

  function renderPreview() {
    const preview = document.querySelector(`#${APP_ID} [data-preview]`);
    if (!preview) return;
    preview.textContent = STATE.messages.slice(-8).map((message) =>
      `${message.sender === 'me' ? 'IO' : 'UTENTE'}: ${message.text.replace(/\n+/g, ' ')}`
    ).join('\n\n') || 'Anteprima vuota';
  }

  function requireMessages(action) {
    refresh();
    if (!STATE.messages.length) return;
    action(exportPayload());
  }

  function installUi() {
    const root = document.createElement('section');
    root.id = APP_ID;
    root.innerHTML = `
      <button data-toggle type="button" aria-label="Apri Instagram Chat Exporter">⇩ Chat</button>
      <div data-panel hidden>
        <header><strong>Chat Exporter</strong><button data-close type="button" aria-label="Chiudi">×</button></header>
        <div data-count>0 messaggi rilevati</div>
        <pre data-preview>Anteprima vuota</pre>
        <div class="ice-grid">
          <button data-action="refresh">Aggiorna</button>
          <button data-action="invert">Inverti IO/UTENTE</button>
          <button data-action="copy">Copia per AI</button>
          <button data-action="md">Scarica Markdown</button>
          <button data-action="json">Scarica JSON</button>
        </div>
        <small data-status>I dati restano in questo browser.</small>
      </div>`;

    const style = document.createElement('style');
    style.textContent = `
      #${APP_ID}{position:fixed;right:18px;bottom:18px;z-index:2147483647;font:13px/1.4 system-ui,sans-serif;color:#f5f5f5}
      #${APP_ID}>[data-toggle]{border:0;border-radius:999px;padding:11px 15px;background:#7c3aed;color:white;font-weight:700;box-shadow:0 5px 20px #0006;cursor:pointer}
      #${APP_ID} [data-panel]{position:absolute;right:0;bottom:48px;width:min(390px,calc(100vw - 30px));padding:14px;border:1px solid #444;border-radius:14px;background:#18181b;box-shadow:0 12px 40px #0008}
      #${APP_ID} header{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;font-size:15px}
      #${APP_ID} header button{border:0;background:transparent;color:#ddd;font-size:22px;cursor:pointer}
      #${APP_ID} [data-count]{margin-bottom:8px;color:#ddd}
      #${APP_ID} pre{max-height:220px;overflow:auto;white-space:pre-wrap;padding:10px;border-radius:9px;background:#09090b;color:#e4e4e7;font:11px/1.45 ui-monospace,monospace}
      #${APP_ID} .ice-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin:10px 0}
      #${APP_ID} .ice-grid button{border:1px solid #555;border-radius:8px;padding:8px;background:#27272a;color:white;cursor:pointer}
      #${APP_ID} .ice-grid button:hover{background:#3f3f46}
      #${APP_ID} [data-status]{display:block;color:#a8e6b0}
    `;
    document.head.appendChild(style);
    document.body.appendChild(root);

    const panel = root.querySelector('[data-panel]');
    root.querySelector('[data-toggle]').addEventListener('click', () => { panel.hidden = !panel.hidden; if (!panel.hidden) refresh(); });
    root.querySelector('[data-close]').addEventListener('click', () => { panel.hidden = true; });
    root.addEventListener('click', (event) => {
      const action = event.target.dataset.action;
      if (action === 'refresh') refresh();
      if (action === 'invert') { STATE.inverted = !STATE.inverted; refresh(); }
      if (action === 'copy') requireMessages((payload) => copy(asAiText(payload)));
      if (action === 'md') requireMessages((payload) => download('md', asMarkdown(payload), 'text/markdown'));
      if (action === 'json') requireMessages((payload) => download('json', JSON.stringify(payload, null, 2), 'application/json'));
    });
  }

  installUi();
})();
