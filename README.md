# Instagram Chat Exporter per Tampermonkey

Userscript locale per esportare i messaggi **attualmente caricati** in una conversazione di Instagram Web.

## Installazione

1. Installa Tampermonkey su Chrome o Edge.
2. Apri la dashboard di Tampermonkey e scegli **Crea un nuovo script**.
3. Cancella il contenuto proposto e incolla tutto il file `instagram-chat-exporter.user.js`.
4. Salva con `Ctrl+S`.
5. Apri `https://www.instagram.com/direct/inbox/` e seleziona una chat.

In basso a destra comparirà il pulsante **⇩ Chat**. Lo userscript è autorizzato dal blocco `@match` a funzionare esclusivamente nelle pagine `/direct/` di `instagram.com`; contiene anche un controllo runtime aggiuntivo sul dominio e sul percorso.

## Formati

- **Copia per AI**: formato più compatto, con righe `IO:` e `UTENTE:`. È quello consigliato per consumare meno token.
- **Markdown**: leggibile sia dall'utente sia da un modello AI.
- **JSON**: archivio strutturato, adatto a elaborazioni software future.

## Uso corretto

Instagram carica progressivamente la cronologia. Prima dell'esportazione, scorri verso l'alto nella conversazione finché sono stati caricati tutti i messaggi desiderati, quindi premi **Aggiorna** e controlla l'anteprima.

Il riconoscimento del mittente usa la posizione del messaggio: destra = `IO`, sinistra = `UTENTE`. Se nell'anteprima risultasse capovolto, usa **Inverti IO/UTENTE**.

Dalla versione 0.2.0 l'area della conversazione viene individuata a partire dal campo **Scrivi un messaggio...**. In questo modo lo script esclude automaticamente inbox, note, schede profilo e anteprime delle altre chat. Se il campo di composizione non è presente, l'esportazione viene fermata invece di analizzare l'intera pagina.

Dalla versione 0.2.1 il pulsante è posizionato in alto a destra per evitare sovrapposizioni con widget presenti in basso. Viene inoltre reinserito automaticamente se la navigazione interna di Instagram ricostruisce la pagina.

La versione 0.2.2 usa la barra di composizione soltanto per ricavare i confini orizzontali della chat e cerca le bolle nell'intera area principale. Questo evita sia i falsi positivi della sidebar sia il caso in cui risultino zero messaggi.

La versione 0.2.3 aggiunge un riconoscimento geometrico dei testi allineati a sinistra e a destra. Viene usato quando Instagram disegna le bolle tramite wrapper o pseudo-elementi non rilevabili dagli stili del browser.

La versione 0.2.4 usa direttamente `raw.githubusercontent.com` per installazione e aggiornamenti, evitando redirect che possono produrre una copia incompleta dello userscript in Tampermonkey.

La versione 0.3.0 elimina la dipendenza da classi, ruoli e stile delle bolle Instagram: estrae direttamente i testi foglia presenti nella colonna della conversazione.

## Privacy e limiti

- Lo script non invia dati a server esterni e non include librerie remote.
- Gli allegati non vengono scaricati; può essere esportato soltanto l'eventuale testo visibile.
- Instagram può modificare la struttura delle proprie pagine. Per questo è importante controllare l'anteprima.
- Esporta e condividi conversazioni soltanto quando ne hai titolo, rimuovendo dati personali non necessari.
