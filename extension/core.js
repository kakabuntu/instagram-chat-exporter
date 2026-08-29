(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.InstagramExporterCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function normalize(value) {
    return (value || '').replace(/\s+/g, ' ').trim();
  }

  function isMetaText(value) {
    const text = normalize(value);
    return !text
      || /^(?:oggi|ieri)$/i.test(text)
      || /^(?:(?:lun|mar|mer|merc|gio|ven|sab|dom)\w*\s+)?\d{1,2}:\d{2}$/i.test(text)
      || /^(?:visualizza profilo|instagram|visualizzato|invio\.\.\.)$/i.test(text);
  }

  function escapeMarkdown(value) {
    return value.replace(/\\/g, '\\\\').replace(/([*_`[\]])/g, '\\$1');
  }

  function asAiText(messages) {
    return messages.map((message) =>
      `${message.sender === 'me' ? 'IO' : 'UTENTE'}: ${normalize(message.text)}`
    ).join('\n');
  }

  function asMarkdown(payload) {
    const body = payload.messages.map((message) => {
      const label = message.sender === 'me' ? 'IO' : 'UTENTE';
      return `**${label}**\n${escapeMarkdown(message.text)}`;
    }).join('\n\n');
    return `# Conversazione Instagram\n\nContatto: ${escapeMarkdown(payload.contact)}\nEsportata: ${payload.exportedAt}\n\n${body}\n`;
  }

  function safeFilename(value) {
    return normalize(value).replace(/[<>:"/\\|?*\x00-\x1F]/g, '-').slice(0, 80) || 'chat-instagram';
  }

  function dedupeMessages(messages) {
    const result = [];
    for (const message of messages) {
      const previous = result[result.length - 1];
      if (previous && previous.sender === message.sender && previous.text === message.text
        && Math.abs((previous.top || 0) - (message.top || 0)) < 10) continue;
      result.push(message);
    }
    return result;
  }

  return { normalize, isMetaText, asAiText, asMarkdown, safeFilename, dedupeMessages };
});

