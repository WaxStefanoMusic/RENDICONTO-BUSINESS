# Gestionale Contabile & Fiscale SNC

App desktop (Electron, Windows) per tenere sotto controllo la contabilità semplificata di una
S.N.C.:

1. **Dashboard**: ricavi, costi deducibili, utile fiscale, carico di imposte e INPS, ripartizione
   tra i soci con il netto in tasca di ognuno (all'anno e al mese) e il riquadro «Cosa pagare e
   quando»: tutti i versamenti dovuti per l'anno, ognuno con la sua data (spostata al lunedì se
   cade nel fine settimana). L'IVA della società trimestre per trimestre con l'acconto del 27
   dicembre; un riquadro per la società (INAIL in 4 rate, IRAP) e uno per ogni socio (INPS fisso
   in 4 rate, anche del collaboratore familiare, e IRPEF, addizionali e INPS sul reddito a giugno
   e novembre dell'anno dopo, già al netto dei crediti); in fondo il totale per trimestre della
   società e dei soci.
2. **Fatture Emesse**: scorporo IVA 22% e regimi non imponibili (art. 8 Svizzera/extra-UE,
   art. 41 UE).
3. **Corrispettivi**: incassi del registratore telematico, con scorporo IVA; caricamento dei PDF
   del Registro Corrispettivi (vedi sotto).
4. **Fatture Ricevute Fornitori**: merce e servizi comprati in Italia per la rivendita.
5. **Autofatture/Fatture Estere**: acquisti da fornitori UE ed extra-UE: reverse charge TD18
   (merce UE) e TD17 (servizi esteri) con il termine di invio dell'autofattura allo SDI, bolle
   doganali dalla Svizzera.
6. **Abbonamenti/Acquisti/Spese**: le altre spese, con le regole di detraibilità IVA e
   deducibilità del costo (caffè, telefonia, auto promiscua…).
7. **Polizze/Assicurazioni**: premi esenti IVA con compagnia, numero e periodo di copertura;
   costo deducibile per intero (attività, negozio, furgone), al 20% (auto usata anche
   privatamente) o per niente (polizze personali dei soci). Avvisi di rinnovo nel tab e nella
   dashboard quando una polizza scade entro 45 giorni.
8. **Estratto Conto Scalare**: oneri del fido, commissioni e spese e interessi passivi del conto, ognuno
   nell'anno in cui viene addebitato.
9. **Carta Business**: i pagamenti con la carta aziendale che hanno solo scontrino o ricevuta,
   dall'estratto conto (PDF, ZIP, Excel o CSV), divisi per mese con il riepilogo in alto.
10. **Commercialista**: parcelle con cassa, IVA e ritenuta d'acconto 20%, scadenze F24 codice
   1040 da spuntare, riepilogo dell'anno in CSV per Excel.
11. **Liquidazione IVA trimestrale (LIPE)**: debito/credito per trimestre, interessi 1%, riporto
   del credito, scadenze F24. L'1% vale anche per il 4° trimestre (versato a marzo con la
   dichiarazione IVA), da cui si toglie l'acconto del 27 dicembre: calcolato col metodo storico
   (88% del 4° trimestre dell'anno prima, non dovuto sotto 103,29 €) o inserito a mano.
12. **Imposte dei soci & INPS**: imputazione per trasparenza, IRPEF a scaglioni, addizionale regionale a
    scaglioni e comunale con la sua soglia di esenzione (da impostare per la propria regione e il
    proprio comune),
    INPS artigiani/commercianti (contributo fisso sul minimale, aliquota della prima fascia e
    un punto in più oltre, massimale più basso per chi ha contributi prima del 1996), premio
    INAIL dei soci (costo della società, deducibile anche IRAP), IRAP e netto in tasca di ogni
    socio dopo imposte, contributi e quota IRAP, all'anno e al mese. Per ogni anno si inseriscono le altre
    detrazioni IRPEF dei soci e gli acconti già versati (IRPEF, INPS, addizionale comunale, IRAP):
    l'app mostra saldo, 1° e 2° acconto dell'anno dopo e quanto versare a giugno. Quando la dichiarazione della società è
    presentata se ne inseriscono il reddito e le ritenute d'acconto (quadro RN): valgono al posto
    del reddito calcolato dalle registrazioni. Il regime contabile (semplificato o ordinario) si
    sceglie nelle impostazioni. I contributi INPS del collaboratore familiare si deducono dal
    reddito del titolare solo se lo si spunta (come nella sua dichiarazione). I crediti dei saldi
    (IRPEF, INPS, addizionale comunale, IRAP) si usano in compensazione nell'F24: l'app mostra
    quanto resta da versare a giugno e a novembre e il credito che avanza.
13. **Guida**: strumenti gratuiti dell'Agenzia delle Entrate e adempimenti con l'estero.

### Importazione delle fatture elettroniche
Nei tab Fatture Emesse, Fornitori, Autofatture/Fatture Estere, Abbonamenti/Acquisti/Spese, Polizze e
Commercialista il pulsante **Importa fatture XML** (o il trascinamento dei file sulla finestra) legge le fatture
elettroniche in formato FatturaPA: `.xml`, `.p7m` firmati e gli `.zip` scaricati in blocco da
«Fatture e Corrispettivi», anche annidati. Data, numero, controparte, imponibile e IVA per
aliquota, ritenuta e cassa previdenziale si leggono dal file; l'app propone dove registrare
ognuna (emessa o ricevuta in base alla Partita IVA della società, parcelle con ritenuta nel tab
Commercialista, autofatture TD17/TD18/TD19 e fornitori esteri nel tab Autofatture/Fatture Estere, bollette e telefonia tra le
spese) e chiede conferma. Note di credito in negativo, doppioni e file di metadati dello SDI
vengono riconosciuti. Tutto avviene sul computer: nessun file viene inviato.

Il file XML di ogni fattura importata (estratto dal `.p7m` se firmato) viene conservato in
`allegati/fatture/<anno>` nella cartella dei dati. Dal pulsante **XML** della riga, dal menu
del tasto destro o col doppio clic la fattura si apre in forma leggibile: soggetti, righe,
riepilogo IVA, ritenuta e cassa, pagamento con IBAN, documenti collegati e allegati incorporati
(i PDF si aprono), più il testo XML originale. Per le fatture importate prima della 2.6 basta
reimportare lo stesso file: l'app lo collega senza registrarle di nuovo.

### Ricerca e spostamento delle fatture
Ogni tab con un elenco ha una **barra di ricerca** (Ctrl+F): filtra per descrizione, cliente o
fornitore, Partita IVA, data o importo e segnala i risultati negli altri anni. Sopra ogni
tabella tre riquadri sommano **Totale, Imponibile e IVA** delle righe visibili: tutto l'anno,
oppure solo i risultati della ricerca.

Con il **tasto destro** su una fattura si apre un menu per spostarla in un altro tab (fatture
emesse, fornitori, autofatture/estere, spese, commercialista): la voce viene convertita tenendo
importi e collegamento all'XML. Per le fatture importate si può spuntare «anche le altre»:
l'app sposta subito tutte quelle della stessa ditta e crea una **regola**, così le prossime
fatture importate di quel cliente o fornitore vengono proposte direttamente in quel tab. Le
regole si vedono e si tolgono nelle Impostazioni.

### PDF delle polizze e delle quietanze
Le compagnie di solito non mandano fatture elettroniche ma ricevute di pagamento, quietanze e
schede di polizza in PDF. Nel tab Polizze/Assicurazioni il pulsante **Carica PDF / ZIP** (o il
trascinamento dei file sul tab) le legge, anche dentro archivi ZIP, pure annidati:
compagnia, numero di polizza, premio lordo pagato, periodo coperto (anche scritto «g. m. a.»),
data del pagamento e cosa copre, con la targa e il tipo di veicolo. Il tipo viene proposto da
solo (autocarro o furgone = attività, autovettura = auto promiscua al 20%, vita e infortuni =
personale). Prima di registrare, ogni campo si controlla e si corregge; una ricevuta già
registrata (stessa polizza e stesso periodo) viene riconosciuta e saltata. Il PDF si copia in
`allegati/polizze/<anno>` e si riapre dal pulsante 📎 della riga. Le fatture XML trovate negli
ZIP passano all'importazione delle fatture elettroniche.

### Estratto conto scalare
Il PDF del conteggio delle competenze del conto (anche dentro uno ZIP) si carica nel tab Estratto
Conto Scalare. Dal 2016 (art. 120 TUB, delibera CICR 343/2016) gli interessi debitori si calcolano
al 31 dicembre e diventano esigibili il **1° marzo dell'anno dopo**, mentre gli oneri del fido
(CFA), le commissioni e le spese si addebitano subito con la valuta del conteggio. L'app registra
quindi due voci: gli oneri con la data della valuta e gli interessi dell'anno con la data del 1°
marzo successivo (modificabile se la banca li addebita in un altro giorno). Con la contabilità
semplificata per cassa ognuna conta nell'anno in cui viene addebitata. Si leggono anche fido,
tasso, interessi dei trimestri e saldo; le somme si verificano (trimestri = interessi da
addebitare, CFA + spese = oneri). Gli interessi passivi sono deducibili dal reddito ma non
dall'IRAP: il calcolo dell'IRAP li riaggiunge. I PDF si copiano in `allegati/scalare/<anno>`.

### Estratto conto della Carta Business
Molti pagamenti con la carta aziendale non hanno la fattura ma solo lo scontrino o la ricevuta.
Nel tab Carta Business il pulsante **Carica estratto conto** (o il trascinamento) legge i
movimenti da:
- **PDF** della banca: righe con data, descrizione e importo, anche su due colonne
  addebiti/accrediti; saldo iniziale, saldo finale e «Totale movimenti» servono a verificare che
  la lettura sia completa;
- **Excel .xlsx**, **CSV** e i «.xls» in HTML esportati dall'home banking (colonne Data,
  Descrizione/Causale e Importo, oppure Addebiti e Accrediti);
- **ZIP** con dentro questi file, anche annidati.

Ogni pagamento diventa una spesa con il tipo proposto dalla descrizione: carburante, hotel e
ristoranti in trasferta (costo al 75%), commissioni e canoni, merce e servizi. Senza fattura l'IVA
non si detrae: l'importo pagato va tutto a costo, deducibile secondo il tipo. Ricariche, accrediti
e rimborsi della carta restano nell'elenco ma non sono spese; un pagamento che ha anche la fattura,
già registrata in un altro tab, si segna «Già fatturata» e non conta due volte. Il tipo cambiato
dalla riga vale anche per le altre spese dello stesso esercente e viene ricordato per i prossimi
estratti. In alto, accanto a spese, costo deducibile e ricariche, il saldo della carta a inizio anno e
l'ultimo segnato, letti dagli estratti in PDF. Ricaricare un estratto che si sovrappone a uno già caricato aggiunge solo i movimenti
nuovi; i movimenti «da contabilizzare» vengono confermati dall'estratto successivo. I PDF si
copiano in `allegati/carta/<anno>`.

### PDF del Registro Corrispettivi
Nel tab Corrispettivi il pulsante **Carica PDF corrispettivi** (o il trascinamento) legge i PDF
prodotti dall'app Registro Corrispettivi:
- il **riepilogativo** registra tutti i mesi con incassi, ognuno diviso per aliquota (4%, 10%,
  22%) più le operazioni esenti, e resta nel tab come controllo: confronta i totali dell'anno,
  aliquota per aliquota, con quelli registrati;
- il **mensile** registra il suo mese dal riquadro «Calcolo IVA» e dalla riga del totale.

Ricaricare un PDF aggiornato sostituisce i mesi già registrati invece di sommarli; i
corrispettivi degli stessi mesi inseriti a mano si possono togliere per non contarli due volte.
POS, bonifici e assegni sono conteggiati all'aliquota impostata nel Registro, ricavata dal PDF.

Le cifre delle tabelle del Registro usano le cifre «tabulari» di Segoe UI, che il PDF scrive senza
il carattere corrispondente: il lettore le riconosce dal numero del glifo e verifica ogni lettura
(colonne = totale del mese, mesi = totale annuo, aliquote = «Calcolo IVA»).

I PDF vengono copiati in `allegati/corrispettivi/<anno>` nella cartella dei dati e si riaprono
dal pulsante 📎. La lettura avviene con pdf.js incluso nell'app (`App/renderer/lib`).

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
- `App/renderer/` — interfaccia (`index.html`, `app.js`, `fatturapa.js` lettore delle fatture elettroniche,
  `corrispettivi-pdf.js` lettore dei PDF del Registro Corrispettivi, `polizze-pdf.js` lettore delle
  ricevute e quietanze delle polizze, `carta-estratto.js` lettore degli estratti conto della carta, `scalare-pdf.js` lettore
  dell'estratto conto scalare, `lib/` pdf.js, `app.css` generato).
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
