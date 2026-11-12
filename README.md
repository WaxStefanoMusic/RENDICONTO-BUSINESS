# Rendicontazione Business

App desktop (Electron, Windows) per la rendicontazione dell'attività: fatture emesse e ricevute,
fatture estere/autofatture, abbonamenti, commercialista, deducibili/detraibili, bollette luce e
corrispettivi, con riepilogo Ricavi / Costi / Saldo e avvisi di scadenza.

## Struttura
- `rendiconto.html` — sorgente dell'interfaccia (funziona anche aperto nel browser).
- `App/` — app desktop Electron. `node App/sync-core.js` rigenera `App/renderer/core.js` e
  `styles.css` da `rendiconto.html`: non modificare i file generati.

## Sviluppo
```
cd App
npm install
avvia.cmd
```

## Installer
```
cd App
npm run dist
```
Produce in `App/Installer/` l'installer NSIS e la versione portatile.

L'interfaccia si adatta a qualunque risoluzione e scala di Windows (zoom automatico, finestra
ridimensionata per stare nello schermo); l'installer è DPI-aware.

I dati restano solo sul computer (`%APPDATA%\Rendicontazione Business`) e non sono nel repository.

## Aggiornamenti automatici
L'app installata controlla le Release di questa repository all'avvio e ogni sei ore, scarica la
nuova versione in sottofondo e chiede se installarla subito o alla chiusura (menu **? →
Controlla aggiornamenti…**). La versione portatile non si aggiorna da sé.

Per pubblicare una nuova versione: alzare `version` in `App/package.json`, compilare con
`npm run dist` e caricare in una Release `vX.Y.Z` l'installer `.exe`, il suo `.blockmap` e
`latest.yml` (oppure `npm run release` con `GH_TOKEN` impostato).
