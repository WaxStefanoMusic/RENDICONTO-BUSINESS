# Gestionale Contabile & Fiscale SNC

App desktop (Electron, Windows) per tenere sotto controllo la contabilità semplificata di una
S.N.C.:

1. **Dashboard**: ricavi, costi deducibili, utile fiscale, carico di imposte e INPS, ripartizione
   tra i soci.
2. **Entrate**: corrispettivi e fatture emesse, con scorporo IVA 22% e regimi non imponibili
   (art. 8 Svizzera/extra-UE, art. 41 UE).
3. **Acquisti & spese**: categorie con le regole di detraibilità IVA e deducibilità del costo
   (caffè, telefonia, auto promiscua…), reverse charge TD17/TD18 e bolle doganali.
4. **Liquidazione IVA trimestrale (LIPE)**: debito/credito per trimestre, interessi 1%, riporto
   del credito, scadenze F24.
5. **Imposte dei soci & INPS**: imputazione per trasparenza, IRPEF a scaglioni, addizionali,
   INPS commercianti, IRAP.
6. **Guida**: strumenti gratuiti dell'Agenzia delle Entrate e adempimenti con l'estero.

Le cifre sono **stime di controllo**: non sostituiscono le dichiarazioni ufficiali. Aliquote e
soglie si modificano nelle impostazioni e vanno verificate ogni anno.

## Dati e privacy
Ragione sociale, nomi e quote dei soci, costo del commercialista e aliquote si inseriscono al
primo avvio nelle **Impostazioni** e restano **solo sul computer**: il codice di questa
repository contiene soltanto valori generici e dati di esempio inventati.

I movimenti si salvano in `%APPDATA%\Rendicontazione Business\gestionale-dati.json`, con una
copia di sicurezza al giorno (le ultime 30) in `copie-di-sicurezza`. Dal menu **File** si
esporta e si ripristina un backup.

## Struttura
- `App/renderer/` — interfaccia (`index.html`, `app.js`, `app.css` generato).
- `App/src/tailwind.css` — sorgente degli stili: `npm run css` rigenera `renderer/app.css`
  (Tailwind gira in locale, niente CDN: l'app funziona senza rete).
- `App/main.js`, `App/preload.js` — finestra, salvataggio, menu, aggiornamenti.

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
ridimensionata per stare nello schermo, layout da telefono a 4K); l'installer è DPI-aware.

## Aggiornamenti automatici
L'app installata controlla le Release di questa repository all'avvio e ogni sei ore, scarica la
nuova versione in sottofondo e chiede se installarla subito o alla chiusura (menu **? →
Controlla aggiornamenti…**). La versione portatile non si aggiorna da sé.

Per pubblicare una nuova versione: alzare `version` in `App/package.json`, compilare con
`npm run dist` e caricare in una Release `vX.Y.Z` l'installer `.exe`, il suo `.blockmap` e
`latest.yml` (oppure `npm run release` con `GH_TOKEN` impostato).
