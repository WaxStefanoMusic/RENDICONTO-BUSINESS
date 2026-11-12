'use strict';
/* ==========================================================================
   Rendicontazione Business — processo principale Electron
   - una WebContentsView per ogni tab "sito", tutte sulla stessa sessione
     persistente: il login si fa una volta sola e resta salvato per sempre
   - i download dei portali vengono dirottati nella cartella del tab
     e segnalati al renderer, che li importa e li classifica da solo
   - le cartelle collegate sono sorvegliate nativamente (fs.watch)
   ========================================================================== */
const { app, BrowserWindow, WebContentsView, session, ipcMain, dialog, shell, Menu, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');

/* Deve precedere qualsiasi getPath('userData'): fissa la cartella dati a
   %APPDATA%\Rendicontazione sia in sviluppo sia da eseguibile installato, così
   il login ai portali fatto con una versione vale anche per l'altra. */
app.setName('Rendicontazione Business');

const PARTITION = 'persist:portali';
const STATE_FILE = path.join(app.getPath('userData'), 'window-state.json');
const CONFIG_FILE = path.join(app.getPath('userData'), 'config.json');
const VECCHI_DOWNLOAD = path.join(app.getPath('userData'), 'downloads');

/* -------------------------------------------------------------------------
   Dove finiscono i documenti scaricati.
   Di norma accanto all'applicazione, in una cartella «Documenti»: è il posto
   che l'utente si aspetta e trova senza cercare. Se non è scrivibile (una
   installazione in Program Files protetto, una chiavetta in sola lettura) si
   ripiega sui Documenti dell'utente, senza far fallire nulla.
   ------------------------------------------------------------------------- */
/* Nome della cartella in cui electron-builder scrive gli eseguibili: vedi
   «directories.output» in package.json. */
const CARTELLA_BUILD = 'Installer';

/* Provando l'app appena compilata si finisce dentro la cartella di build
   (`Installer\win-unpacked`, o `Installer` per la versione portatile). I
   documenti però non devono stare lì: quella cartella viene rigenerata a ogni
   compilazione. In quel caso si risale alla cartella del progetto, quella che
   contiene package.json. Un'installazione vera non passa mai di qui. */
function fuoriDallaCartellaBuild(dir) {
  const parti = path.resolve(dir).split(path.sep);
  const i = parti.lastIndexOf(CARTELLA_BUILD);
  if (i <= 0) return dir;
  const sopra = parti.slice(0, i).join(path.sep);
  try { return fs.existsSync(path.join(sopra, 'package.json')) ? sopra : dir; } catch (_) { return dir; }
}
function cartellaApp() {
  if (process.env.PORTABLE_EXECUTABLE_DIR) return fuoriDallaCartellaBuild(process.env.PORTABLE_EXECUTABLE_DIR);
  if (app.isPackaged) return fuoriDallaCartellaBuild(path.dirname(app.getPath('exe')));
  return app.getAppPath();
}
function scrivibile(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const p = path.join(dir, '.prova-scrittura');
    fs.writeFileSync(p, '');
    fs.unlinkSync(p);
    return true;
  } catch (_) { return false; }
}
function leggiConfig() {
  // il BOM lasciato da certi editor manderebbe in errore JSON.parse, facendo
  // perdere in silenzio la cartella scelta dall'utente
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8').replace(/^\uFEFF/, '')); } catch (_) { return {}; }
}
function scriviConfig(c) {
  try { fs.writeFileSync(CONFIG_FILE, JSON.stringify(c, null, 2)); } catch (_) {}
}
function calcolaDownloadRoot() {
  const cfg = leggiConfig();
  if (cfg.downloadRoot && scrivibile(cfg.downloadRoot)) return { dir: cfg.downloadRoot, scelta: true };
  const accanto = path.join(cartellaApp(), 'Documenti');
  if (scrivibile(accanto)) return { dir: accanto, scelta: false };
  const ripiego = path.join(app.getPath('documents'), 'Rendicontazione Business');
  scrivibile(ripiego);
  return { dir: ripiego, scelta: false, ripiego: true };
}
let DOWNLOAD_ROOT = calcolaDownloadRoot().dir;

/** nomi dei tab, per dare alle cartelle un nome leggibile invece di un codice */
const nomiTab = new Map();
/** file spostati all'avvio dalla vecchia cartella: il renderer aggiorna i percorsi */
let migrazioneIniziale = [];
/* Le annualità. Dentro la cartella di ogni tab c'è una sottocartella per anno,
   dal 2025 in avanti, così i documenti si archiviano nell'anno giusto invece di
   ammucchiarsi tutti insieme. Si arriva fino all'anno prossimo perché le
   scadenze si programmano in anticipo: a dicembre serve già la cartella nuova. */
const PRIMO_ANNO = 2025;
function anniCartelle() {
  const ultimo = Math.max(new Date().getFullYear() + 1, PRIMO_ANNO);
  const out = [];
  for (let a = PRIMO_ANNO; a <= ultimo; a++) out.push(String(a));
  return out;
}
const annoValido = a => (/^\d{4}$/.test(String(a || '')) ? String(a) : null);

function dirDiTab(tabId, anno) {
  const nome = nomiTab.get(tabId);
  const base = path.join(DOWNLOAD_ROOT, sanitize(nome || tabId));
  const a = annoValido(anno);
  return a ? path.join(base, a) : base;
}

/* Un file può stare nella cartella dell'anno oppure, se ci è finito prima che
   le annualità esistessero, direttamente in quella del tab: si guarda in tutte
   e due prima di riscriverlo, o se ne farebbero due copie. */
function cercaNelTab(tabId, nome) {
  const base = dirDiTab(tabId);
  const cerca = [base, ...anniCartelle().map(a => path.join(base, a))];
  for (const dir of cerca) {
    const p = path.join(dir, nome);
    try { if (fs.existsSync(p)) return p; } catch (_) {}
  }
  return null;
}

let win = null;
let uiZoom = 1;            // fattore di zoom dell'interfaccia
let zoomMode = 'auto';     // 'auto' | 'manuale'
let siteZoom = 1;          // zoom delle pagine dei portali
/** tabId -> { view, bounds, dir } */
const views = new Map();
/** tabId -> { dir, watcher, timer } */
const watches = new Map();
/** tabId dell'unica view attualmente visibile */
let visibleTab = null;

const send = (ch, payload) => { if (win && !win.isDestroyed()) win.webContents.send(ch, payload); };

/* -------------------------------------------------------------------------
   Sessione condivisa: UA da Chrome normale (alcuni portali rifiutano Electron)
   ------------------------------------------------------------------------- */
function portalSession() {
  const ses = session.fromPartition(PARTITION);
  if (!ses.__configured) {
    ses.__configured = true;
    const ua = ses.getUserAgent()
      .replace(/ Electron\/[\d.]+/, '')
      .replace(new RegExp(' ' + app.getName().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\/[\\d.]+', 'i'), '');
    ses.setUserAgent(ua);
    ses.on('will-download', (event, item) => {
      const src = item.getURL();
      // i download avviati dall'app sanno già a quale tab appartengono;
      // quelli avviati dall'utente si attribuiscono alla scheda che sta guardando
      const tabId = attesi.get(src) || findTabForDownload();
      /* il documento appena scaricato non è ancora stato letto: la sua scadenza
         non si conosce, quindi si archivia nell'anno su cui si sta lavorando */
      const dir = tabId ? dirDiTab(tabId, annoDaUsare()) : path.join(DOWNLOAD_ROOT, 'Altri documenti');
      fs.mkdirSync(dir, { recursive: true });
      const target = uniquePath(path.join(dir, sanitize(item.getFilename())));
      item.setSavePath(target);
      send('download:start', { tabId, fileName: path.basename(target) });
      item.on('done', (_e, state) => {
        attesi.delete(src);
        const risolvi = risolutori.get(src); if (risolvi) { risolutori.delete(src); risolvi(state); }
        if (state === 'completed') send('download:done', { tabId, filePath: target, fileName: path.basename(target), url: src });
        else send('download:failed', { tabId, fileName: path.basename(target), state });
      });
    });
  }
  return ses;
}
/** il download appartiene alla view attualmente attiva (unica navigabile) */
function findTabForDownload() { return visibleTab; }

/** url -> tabId, per i download avviati dall'app invece che dall'utente */
const attesi = new Map();
/** url -> resolve(), per attendere la fine di ogni download */
const risolutori = new Map();
/** raccolta documenti in corso: { tabId, urls:Set, finestre:[] } */
let raccolta = null;
/** progetto attualmente aperto e stato delle modifiche non salvate */
let progettoPath = null;
let modificato = false;

/* solo i caratteri vietati da Windows; spazi e trattini restano leggibili */
function sanitize(name) {
  return String(name || 'documento')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
    .replace(/[. ]+$/, '')
    .slice(0, 180) || 'documento';
}
/* Spostamento della cartella documenti e utilità sui percorsi: stanno in
   sposta.js perché quel codice ha già cancellato dati e va collaudato da solo,
   senza avviare l'app. */
const { stessaCartella, dentroA, uniquePath, spostaDocumenti } = require('./sposta');

/* -------------------------------------------------------------------------
   Adattamento allo schermo: dimensione finestra, zoom, cambi di DPI
   ------------------------------------------------------------------------- */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** Zoom suggerito in base allo spazio logico disponibile.
 *  Un 4K a 100% espone 3840 punti logici: senza ingrandire, i testi sarebbero
 *  illeggibili. A 150% ne espone 2560 e serve un ritocco più lieve. */
function autoZoomFor(display) {
  const w = display.workArea.width;
  if (w >= 3400) return 1.60;
  if (w >= 2800) return 1.30;
  if (w >= 2200) return 1.15;
  if (w <= 1000) return 0.80;   // portatili piccoli o scala di Windows alta
  if (w <= 1400) return 0.90;
  return 1;
}

/* Dimensione minima della finestra: 900×600 su uno schermo normale, ma mai più
   grande dello spazio davvero disponibile. Su un 1366×768 al 150% ci sono circa
   910×480 punti: un minimo fisso farebbe uscire la finestra dallo schermo. */
function minSizeFor(display) {
  const wa = display.workArea;
  return { w: Math.min(900, wa.width), h: Math.min(600, wa.height) };
}

/** riporta una posizione salvata dentro lo schermo, se nel frattempo è diventato più piccolo */
function fitBounds(b, display) {
  const wa = display.workArea;
  const width = Math.min(b.width, wa.width), height = Math.min(b.height, wa.height);
  const x = clamp(b.x, wa.x, wa.x + wa.width - width), y = clamp(b.y, wa.y, wa.y + wa.height - height);
  return { x, y, width, height };
}

function defaultBounds(display) {
  const wa = display.workArea;
  const m = minSizeFor(display);
  const width = clamp(Math.round(wa.width * 0.86), m.w, 1800);
  const height = clamp(Math.round(wa.height * 0.88), m.h, 1150);
  return { width, height, x: Math.round(wa.x + (wa.width - width) / 2), y: Math.round(wa.y + (wa.height - height) / 2) };
}

function readState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch (_) { return {}; }
}
let stateTimer = null;
function saveState() {
  clearTimeout(stateTimer);
  stateTimer = setTimeout(() => {
    if (!win || win.isDestroyed()) return;
    const s = { ...win.getNormalBounds(), maximized: win.isMaximized(), uiZoom, zoomMode, siteZoom };
    try { fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2)); } catch (_) {}
  }, 500);
}

/** una posizione salvata vale solo se ricade ancora su uno schermo collegato */
function boundsAreVisible(b) {
  if (!b || !Number.isFinite(b.x) || !Number.isFinite(b.width)) return false;
  const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
  return screen.getAllDisplays().some(d => {
    const a = d.workArea;
    return cx >= a.x && cx <= a.x + a.width && cy >= a.y && cy <= a.y + a.height;
  });
}

function currentDisplay() {
  try { return win ? screen.getDisplayMatching(win.getBounds()) : screen.getPrimaryDisplay(); }
  catch (_) { return screen.getPrimaryDisplay(); }
}

function applyUiZoom(z, { persist = true, fromAuto = false } = {}) {
  uiZoom = clamp(z, 0.6, 2.5);
  if (!fromAuto) zoomMode = 'manuale';
  if (win && !win.isDestroyed()) win.webContents.setZoomFactor(uiZoom);
  for (const [id, v] of views) if (id === visibleTab) applyBounds(id, v.bounds);
  send('ui:zoom', { uiZoom, zoomMode, siteZoom, auto: autoZoomFor(currentDisplay()) });
  if (persist) saveState();
}
function applySiteZoom(z) {
  siteZoom = clamp(z, 0.5, 3);
  for (const [, v] of views) { try { v.view?.webContents.setZoomFactor(siteZoom); } catch (_) {} }
  send('ui:zoom', { uiZoom, zoomMode, siteZoom, auto: autoZoomFor(currentDisplay()) });
  saveState();
}

/* -------------------------------------------------------------------------
   Finestra
   ------------------------------------------------------------------------- */
function createWindow() {
  const st = readState();
  const display = boundsAreVisible(st) ? screen.getDisplayMatching(st) : screen.getPrimaryDisplay();
  const b = boundsAreVisible(st) ? fitBounds(st, display) : defaultBounds(display);
  const m = minSizeFor(display);

  zoomMode = st.zoomMode === 'manuale' ? 'manuale' : 'auto';
  siteZoom = clamp(+st.siteZoom || 1, 0.5, 3);
  uiZoom = zoomMode === 'manuale' ? clamp(+st.uiZoom || 1, 0.6, 2.5) : autoZoomFor(display);

  win = new BrowserWindow({
    x: b.x, y: b.y, width: b.width, height: b.height,
    minWidth: m.w, minHeight: m.h,
    backgroundColor: '#f9f9f7',
    show: false,
    title: 'Rendicontazione Business — fatture, corrispettivi e scadenze',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      zoomFactor: uiZoom,
    },
  });
  if (st.maximized) win.maximize();

  Menu.setApplicationMenu(buildMenu());
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => { win.webContents.setZoomFactor(uiZoom); aggiornaTitolo(); win.show(); });

  /* I documenti si aprono in una finestra figlia. Chromium ricorda lo zoom per
     ORIGINE, e l'interfaccia gira ingrandita (su 4K al 150% lo zoom è 1,5):
     senza questo, un PDF si apriva ingrandito quanto l'app. Un documento va
     visto al 100%, punto. */
  win.webContents.setWindowOpenHandler(() => ({
    action: 'allow',
    overrideBrowserWindowOptions: {
      width: 1100, height: 850, autoHideMenuBar: true,
      webPreferences: { zoomFactor: 1, contextIsolation: true, sandbox: true },
    },
  }));
  win.webContents.on('did-create-window', (figlia) => {
    const azzera = () => { try { figlia.webContents.setZoomFactor(1); } catch (_) {} };
    azzera();
    figlia.webContents.on('did-finish-load', azzera);
    figlia.webContents.on('dom-ready', azzera);
  });

  win.on('closed', () => { win = null; views.clear(); });

  /* trascinando la finestra su un altro monitor (risoluzione o scala diverse)
     lo zoom automatico e la dimensione minima si adeguano al nuovo schermo */
  let ultimoSchermo = display.id;
  const reflow = () => {
    const d = currentDisplay();
    if (d.id !== ultimoSchermo) {
      ultimoSchermo = d.id;
      const m2 = minSizeFor(d);
      win.setMinimumSize(m2.w, m2.h);
      if (zoomMode === 'auto') applyUiZoom(autoZoomFor(d), { fromAuto: true, persist: false });
    }
    for (const [id, v] of views) if (id === visibleTab) applyBounds(id, v.bounds);
    saveState();
  };
  win.on('resize', reflow);
  win.on('move', reflow);                    // spostamento su un monitor con DPI diverso
  win.on('maximize', reflow);
  win.on('unmaximize', reflow);
  win.on('enter-full-screen', reflow);
  win.on('leave-full-screen', reflow);
}

/* cambi di risoluzione, scala di Windows o monitor collegati/scollegati */
function onDisplaysChanged() {
  if (!win || win.isDestroyed()) return;
  if (zoomMode === 'auto') applyUiZoom(autoZoomFor(currentDisplay()), { fromAuto: true });
  const d = currentDisplay();
  const m = minSizeFor(d);
  win.setMinimumSize(m.w, m.h);
  if (!boundsAreVisible(win.getNormalBounds())) {
    win.setBounds(defaultBounds(screen.getPrimaryDisplay()));
  } else if (!win.isMaximized() && !win.isFullScreen()) {
    const nb = win.getNormalBounds(), f = fitBounds(nb, d);
    if (f.width !== nb.width || f.height !== nb.height || f.x !== nb.x || f.y !== nb.y) win.setBounds(f);
  }
  for (const [id, v] of views) if (id === visibleTab) applyBounds(id, v.bounds);
}

function buildMenu() {
  return Menu.buildFromTemplate([
    { label: 'File', submenu: [
      { label: 'Nuovo', accelerator: 'CommandOrControl+N', click: () => send('menu:nuovo') },
      { label: 'Carica…', accelerator: 'CommandOrControl+O', click: () => send('menu:carica') },
      { type: 'separator' },
      { label: 'Salva', accelerator: 'CommandOrControl+S', click: () => send('menu:salva') },
      { label: 'Salva come…', accelerator: 'CommandOrControl+Shift+S', click: () => send('menu:salvaCome') },
      { type: 'separator' },
      { label: 'Apri cartella download', click: () => { fs.mkdirSync(DOWNLOAD_ROOT, { recursive: true }); shell.openPath(DOWNLOAD_ROOT); } },
      { type: 'separator' },
      { role: 'quit', label: 'Esci' },
    ]},
    { label: 'Visualizza', submenu: [
      { label: 'Interfaccia più grande', accelerator: 'CommandOrControl+=', click: () => applyUiZoom(uiZoom + 0.1) },
      { label: 'Interfaccia più piccola', accelerator: 'CommandOrControl+-', click: () => applyUiZoom(uiZoom - 0.1) },
      { label: 'Dimensione automatica', accelerator: 'CommandOrControl+0', click: () => { zoomMode = 'auto'; applyUiZoom(autoZoomFor(currentDisplay()), { fromAuto: true }); } },
      { type: 'separator' },
      { label: 'Pagina del sito: ingrandisci', accelerator: 'CommandOrControl+Shift+=', click: () => applySiteZoom(siteZoom + 0.1) },
      { label: 'Pagina del sito: riduci', accelerator: 'CommandOrControl+Shift+-', click: () => applySiteZoom(siteZoom - 0.1) },
      { label: 'Pagina del sito: normale', accelerator: 'CommandOrControl+Shift+0', click: () => applySiteZoom(1) },
      { type: 'separator' },
      { role: 'togglefullscreen', label: 'Schermo intero' },
      { role: 'reload', label: 'Ricarica interfaccia' },
      { role: 'toggleDevTools', label: 'Strumenti sviluppatore' },
    ]},
    { label: 'Modifica', submenu: [
      { role: 'undo', label: 'Annulla' }, { role: 'redo', label: 'Ripeti' }, { type: 'separator' },
      { role: 'cut', label: 'Taglia' }, { role: 'copy', label: 'Copia' }, { role: 'paste', label: 'Incolla' },
      { role: 'selectAll', label: 'Seleziona tutto' },
    ]},
  ]);
}

/* -------------------------------------------------------------------------
   Browser incorporato (una view per tab sito)
   ------------------------------------------------------------------------- */
function ensureView(tabId, url) {
  let v = views.get(tabId);
  if (v && v.view && !v.view.webContents.isDestroyed()) return v;

  const view = new WebContentsView({
    webPreferences: { partition: PARTITION, contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  const dir = dirDiTab(tabId);
  fs.mkdirSync(dir, { recursive: true });
  v = { view, bounds: { x: 0, y: 0, width: 0, height: 0 } };
  views.set(tabId, v);

  const wc = view.webContents;
  const nav = () => send('view:nav', {
    tabId, url: wc.getURL(), title: wc.getTitle(),
    canGoBack: wc.navigationHistory.canGoBack(), canGoForward: wc.navigationHistory.canGoForward(),
    loading: wc.isLoading(),
  });
  ['did-navigate', 'did-navigate-in-page', 'page-title-updated', 'did-start-loading', 'did-stop-loading'].forEach(e => wc.on(e, nav));
  wc.on('did-fail-load', (_e, code, desc, u, isMain) => { if (isMain && code !== -3) send('view:error', { tabId, code, desc, url: u }); });

  // popup (login, SPID, PDF in nuova finestra) -> finestra figlia sulla stessa sessione.
  // Durante una raccolta la finestra nasce invisibile: serve solo a rivelare
  // l'indirizzo del documento, che viene scaricato e poi la si chiude.
  wc.setWindowOpenHandler(() => ({
    action: 'allow',
    overrideBrowserWindowOptions: raccolta
      ? { show: false, width: 900, height: 700, webPreferences: { partition: PARTITION, contextIsolation: true, sandbox: true } }
      : { width: 1100, height: 800, parent: win, autoHideMenuBar: true, webPreferences: { partition: PARTITION, contextIsolation: true, sandbox: true } },
  }));
  wc.on('did-create-window', (childWin) => {
    if (!raccolta) return;
    try { childWin.hide(); } catch (_) {}
    raccolta.aperte++;
    raccolta.finestre.push(childWin);
  });

  wc.on('did-finish-load', () => { try { wc.setZoomFactor(siteZoom); } catch (_) {} });
  if (url) wc.loadURL(url).catch(() => {});
  return v;
}

/* Il renderer misura in pixel CSS, che con lo zoom non coincidono con i punti
   logici usati da setBounds: la conversione è  punti = css * zoomFactor.
   I bordi si arrotondano verso l'esterno per non lasciare fessure di 1 px. */
function applyBounds(tabId, b) {
  const v = views.get(tabId); if (!v || !v.view || !win || win.isDestroyed()) return;
  const s = win.webContents.zoomFactor || 1;
  const x = Math.floor(b.x * s), y = Math.floor(b.y * s);
  const right = Math.ceil((b.x + b.width) * s), bottom = Math.ceil((b.y + b.height) * s);
  v.view.setBounds({ x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) });
}
function hideAll() {
  if (!win) return;
  for (const [, v] of views) { if (v.view) { try { win.contentView.removeChildView(v.view); } catch (_) {} } }
  visibleTab = null;
}

/* -------------------------------------------------------------------------
   IPC
   ------------------------------------------------------------------------- */
ipcMain.handle('view:show', (_e, { tabId, url, bounds }) => {
  portalSession();
  hideAll();
  const v = ensureView(tabId, url);
  win.contentView.addChildView(v.view);
  visibleTab = tabId;
  v.bounds = bounds; applyBounds(tabId, bounds);
  const wc = v.view.webContents;
  if (!wc.getURL() && url) wc.loadURL(url).catch(() => {});
  return { url: wc.getURL(), dir: dirDiTab(tabId) };
});
ipcMain.handle('view:bounds', (_e, { tabId, bounds }) => {
  const v = views.get(tabId); if (!v) return;
  v.bounds = bounds; if (visibleTab === tabId) applyBounds(tabId, bounds);
});
ipcMain.handle('view:hide', () => hideAll());
ipcMain.handle('view:destroy', (_e, { tabId }) => {
  const v = views.get(tabId); if (!v) return;
  if (v.view) {
    try { win.contentView.removeChildView(v.view); } catch (_) {}
    try { v.view.webContents.close(); } catch (_) {}
  }
  views.delete(tabId); if (visibleTab === tabId) visibleTab = null;
});
ipcMain.handle('view:act', (_e, { tabId, action, url }) => {
  const v = views.get(tabId); if (!v || !v.view) return;
  const wc = v.view.webContents, h = wc.navigationHistory;
  if (action === 'back' && h.canGoBack()) h.goBack();
  else if (action === 'forward' && h.canGoForward()) h.goForward();
  else if (action === 'reload') wc.reload();
  else if (action === 'stop') wc.stop();
  else if (action === 'home' && url) wc.loadURL(url).catch(() => {});
  else if (action === 'load' && url) wc.loadURL(url).catch(() => {});
  else if (action === 'devtools') wc.openDevTools({ mode: 'detach' });
  else if (action === 'external') shell.openExternal(wc.getURL() || url);
});

/* -------------------------------------------------------------------------
   Lettura della pagina senza scaricare nulla
   Gira dentro la pagina del portale (sessione già autenticata) e restituisce
   le righe che contengono sia una data sia un importo: sono le voci di una
   lista bollette in qualunque portale, senza selettori su misura.
   NB: si usa textContent, non innerText — quest'ultimo richiede il layout e
   restituisce stringa vuota nelle finestre nascoste o non dipinte.
   ------------------------------------------------------------------------- */
const EXTRACT_JS = `(() => {
  const norm = s => (s || '').replace(/\\s+/g, ' ').trim();
  /* Il testo si ricompone nodo per nodo inserendo uno spazio.
     Né textContent né innerText vanno bene: se il sorgente non ha spazi fra
     due <span> adiacenti restituiscono "142,30Pagata", e i confini di parola
     saltano (\\bpagata\\b non aggancia più). innerText inoltre resta vuoto
     nelle finestre nascoste, dove non c'è layout. */
  const testo = el => {
    let s = '';
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    let n;
    while ((n = w.nextNode())) { const v = n.nodeValue; if (v && v.trim()) s += v.trim() + ' '; }
    return norm(s);
  };
  const out = { url: location.href, title: document.title, loginRequired: false, rows: [], docLinks: [], diag: {} };

  if (document.querySelector('input[type=password]') ||
      /(^|\\/)(login|signin|sign-in|accedi|auth)(\\/|$|\\?)/i.test(location.pathname + location.search)) {
    out.loginRequired = true;
    return out;
  }

  const MESI = 'gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre';
  const AMT  = /(?:€|\\bEUR\\b)\\s*\\d|\\d[\\d.,]*\\s*(?:€|\\bEUR\\b)/i;
  const DATE = new RegExp('\\\\b\\\\d{1,2}[\\\\/\\\\-.]\\\\d{1,2}[\\\\/\\\\-.]\\\\d{2,4}\\\\b|\\\\b\\\\d{1,2}\\\\s+(' + MESI + ')\\\\s+\\\\d{4}\\\\b', 'i');

  const cand = [];
  const nodi = document.querySelectorAll('li, tr, article, section, div, a, dl');
  for (let i = 0; i < nodi.length && cand.length < 900; i++) {
    const el = nodi[i];
    const t = testo(el);
    if (t.length < 12 || t.length > 400) continue;
    if (!AMT.test(t) || !DATE.test(t)) continue;
    cand.push({ el, t });
  }
  // conserva solo i contenitori più interni: scarta chi ne racchiude un altro
  const interni = cand.filter(c => !cand.some(o => o !== c && c.el !== o.el && c.el.contains(o.el)));

  const visti = new Set();
  for (const c of interni) {
    if (visti.has(c.t)) continue;
    visti.add(c.t);
    const link = [...c.el.querySelectorAll('a[href]')].map(a => a.href);
    if (c.el.tagName === 'A' && c.el.href) link.unshift(c.el.href);
    const doc = link.find(h => /\\.pdf($|\\?)|download|bolletta|fattura|invoice|documento/i.test(h));
    out.rows.push({ text: c.t, href: doc || link[0] || null });
    if (out.rows.length >= 120) break;
  }

  /* Ripiego: link che sembrano documenti scaricabili. Serve quando la pagina
     non espone gli importi come testo (grafica, canvas, valori solo nel PDF). */
  const ESCLUDI = /(logout|esci|login|accedi|assistenza|supporto|privacy|cookie|termini|contatti|faq|impostazioni)/i;
  const DOCU = /(\\.pdf($|\\?)|\\/download|scarica|bolletta|fattura|invoice|documento|ricevut)/i;
  const visto2 = new Set();
  for (const a of document.querySelectorAll('a[href]')) {
    const href = a.href || '';
    const label = testo(a).slice(0, 80);
    if (!href || !/^https?:/i.test(href)) continue;
    if (ESCLUDI.test(href + ' ' + label)) continue;
    if (!DOCU.test(href) && !DOCU.test(label)) continue;
    if (visto2.has(href)) continue;
    visto2.add(href);
    out.docLinks.push({ href, label });
    if (out.docLinks.length >= 25) break;
  }

  /* numeri utili per capire perché una pagina non dà risultati */
  let conData = 0, conImporto = 0;
  for (const el of nodi) {
    const t = testo(el);
    if (t.length < 12 || t.length > 400) continue;
    if (AMT.test(t)) conImporto++;
    if (DATE.test(t)) conData++;
  }
  /* pulsanti che aprono un documento (senza link nell'HTML): vanno cliccati */
  const APRI = /^(apri|scarica|download|visualizza|vedi|pdf|apri pdf|scarica pdf)$/i;
  const ETICHETTA = /(apri|scarica|visualizz|download)\\s+(la\\s+)?(bollett|fattur|document|ricevut)/i;
  const SOLO_DATA = /\\b\\d{1,2}[\\/\\-.]\\d{1,2}[\\/\\-.]\\d{2,4}\\b/;
  let apribili = 0;
  for (const el of document.querySelectorAll('button, a[role=button], a[href="#"], [role=button]')) {
    const tx = testo(el), aria = el.getAttribute('aria-label') || '';
    if (!APRI.test(tx) && !ETICHETTA.test(aria)) continue;
    const riga = el.closest('tr, li') || el.parentElement?.parentElement || el.parentElement;
    const tr = riga ? testo(riga) : '';
    if (!SOLO_DATA.test(tr) && !SOLO_DATA.test(aria)) continue;
    apribili++;
  }

  out.diag = { nodi: nodi.length, conData, conImporto, entrambi: interni.length, apribili };
  out.apribili = apribili;
  out.pageText = (document.body ? testo(document.body) : '').slice(0, 20000);
  return out;
})()`;

async function extractFrom(wc, navigateTo) {
  if (navigateTo) { try { await wc.loadURL(navigateTo); } catch (_) { /* redirect o abort: si legge comunque */ } }
  let last = null;
  for (let i = 0; i < 7; i++) {
    await new Promise(r => setTimeout(r, i === 0 ? 1800 : 1400));
    try { last = await wc.executeJavaScript(EXTRACT_JS, true); } catch (_) { continue; }
    if (last && (last.loginRequired || (last.rows && last.rows.length))) return last;
  }
  return last || { url: wc.getURL(), rows: [], loginRequired: false };
}

ipcMain.handle('web:extract', async (_e, { tabId, url, background }) => {
  const v = views.get(tabId);
  // lettura manuale: si usa la pagina che l'utente ha davanti, senza spostarla
  if (!background && v && v.view && !v.view.webContents.isDestroyed()) {
    const wc = v.view.webContents;
    const stessaPagina = !url || wc.getURL().startsWith(url.split('?')[0]);
    return extractFrom(wc, stessaPagina ? null : url);
  }
  // lettura in sottofondo: finestra nascosta sulla stessa sessione autenticata
  const hidden = new BrowserWindow({
    show: false, width: 1400, height: 1000,
    webPreferences: { partition: PARTITION, contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  try {
    return await extractFrom(hidden.webContents, url);
  } finally {
    try { if (!hidden.isDestroyed()) hidden.destroy(); } catch (_) {}
  }
});

/* Scarica in autonomia i documenti indicati, sulla sessione già autenticata.
   Ogni file passa dal normale flusso di import, quindi viene analizzato e
   classificato come se lo avessi scaricato a mano. */
ipcMain.handle('web:downloadDocs', async (_e, { tabId, urls }) => {
  const ses = portalSession();
  const lista = [...new Set((urls || []).filter(u => /^https?:/i.test(u)))].slice(0, 12);
  if (!lista.length) return { avviati: 0, completati: 0 };

  // la cartella di destinazione deve esistere anche senza view aperta
  if (!views.has(tabId)) {
    fs.mkdirSync(dirDiTab(tabId), { recursive: true });
    views.set(tabId, { view: null, bounds: null, soloCartella: true });
  }

  const esiti = lista.map(u => {
    attesi.set(u, tabId);
    const atteso = new Promise(res => {
      risolutori.set(u, res);
      setTimeout(() => { if (risolutori.has(u)) { risolutori.delete(u); attesi.delete(u); res('timeout'); } }, 90000);
    });
    try { ses.downloadURL(u); } catch (err) { attesi.delete(u); risolutori.delete(u); return Promise.resolve('errore'); }
    return atteso;
  });

  const stati = await Promise.all(esiti);
  return { avviati: lista.length, completati: stati.filter(s => s === 'completed').length, stati };
});

/* -------------------------------------------------------------------------
   Raccolta documenti a colpi di clic
   Molti portali non espongono il PDF come link: un <button> chiama
   window.open() e solo dopo la finestra viene puntata su un indirizzo firmato
   e temporaneo. L'unico modo per arrivarci è premere il pulsante e leggere
   dove va a finire la finestra che si apre.
   ------------------------------------------------------------------------- */
const MARK_JS = `(() => {
  const norm = s => (s || '').replace(/\\s+/g, ' ').trim();
  const APRI = /^(apri|scarica|download|visualizza|vedi|pdf|apri pdf|scarica pdf)$/i;
  const ETICHETTA = /(apri|scarica|visualizz|download)\\s+(la\\s+)?(bollett|fattur|document|ricevut)/i;
  const DATA = /\\b\\d{1,2}[\\/\\-.]\\d{1,2}[\\/\\-.]\\d{2,4}\\b/;

  document.querySelectorAll('[data-rendiconto-doc]').forEach(e => e.removeAttribute('data-rendiconto-doc'));

  const grezzi = [];
  for (const el of document.querySelectorAll('button, a[role=button], a[href="#"], [role=button]')) {
    const testo = norm(el.textContent);
    const aria = el.getAttribute('aria-label') || '';
    if (!APRI.test(testo) && !ETICHETTA.test(aria)) continue;
    const riga = el.closest('tr, li') || el.parentElement?.parentElement || el.parentElement;
    const testoRiga = norm(riga ? riga.textContent : '') || aria;
    // deve trovarsi accanto a una data: è così che si distingue una bolletta
    if (!DATA.test(testoRiga) && !DATA.test(aria)) continue;
    grezzi.push({ el, aria, testoRiga });
  }

  /* Molti portali annidano il pulsante vero dentro un contenitore che ha
     l'aria-label ma nessun gestore di clic: premerlo non fa niente. Si tengono
     quindi solo gli elementi più interni, recuperando l'etichetta dagli avi. */
  const interni = grezzi.filter(c => !grezzi.some(o => o !== c && c.el.contains(o.el)));

  const trovati = [];
  for (const c of interni) {
    let etichetta = c.aria;
    if (!ETICHETTA.test(etichetta)) {
      let p = c.el.parentElement;
      for (let d = 0; d < 4 && p; d++, p = p.parentElement) {
        const a = p.getAttribute && p.getAttribute('aria-label');
        if (a && ETICHETTA.test(a)) { etichetta = a; break; }
      }
    }
    if (!etichetta) etichetta = c.testoRiga;
    c.el.setAttribute('data-rendiconto-doc', String(trovati.length));
    trovati.push({ etichetta: etichetta.slice(0, 120), riga: c.testoRiga.slice(0, 160) });
    if (trovati.length >= 40) break;
  }
  return trovati;
})()`;

ipcMain.handle('web:collectDocs', async (_e, { tabId, max, skip }) => {
  const daSaltare = new Set(skip || []);
  const v = views.get(tabId);
  if (!v || !v.view || v.view.webContents.isDestroyed()) return { errore: 'La pagina del portale non è aperta' };
  const wc = v.view.webContents;

  let candidati = [];
  try { candidati = await wc.executeJavaScript(MARK_JS, true); } catch (e) { return { errore: e.message }; }
  if (!candidati.length) return { trovati: 0, scaricati: 0, voci: [] };

  const limite = Math.min(candidati.length, max || 15);
  // una raccolta alla volta: sono clic su una pagina condivisa, e due giri
  // sovrapposti si ruberebbero le finestre a vicenda
  if (raccolta) return { errore: 'Raccolta già in corso, attendi che finisca' };
  const R = raccolta = { tabId, urls: new Set(), finestre: [], aperte: 0 };
  const voci = [];
  let clicRiusciti = 0, urlVisti = 0;

  try {
    for (let i = 0; i < limite; i++) {
      if (daSaltare.has(candidati[i].etichetta)) { voci.push({ ...candidati[i], stato: 'gia-presente' }); continue; }
      try {
        const ok = await wc.executeJavaScript(
          `(() => {
             const e = document.querySelector('[data-rendiconto-doc="${i}"]');
             if (!e) return false;
             e.scrollIntoView({ block: 'center' });
             const b = e.matches('button, a') ? e : (e.querySelector('button, a') || e);
             b.click();
             return true;
           })()`, true);
        if (ok) clicRiusciti++;
      } catch (_) { continue; }

      // la finestra nasce vuota e solo dopo punta al documento (il portale deve
      // prima farsi firmare l'indirizzo dal proprio archivio): si attende
      let url = null;
      for (let k = 0; k < 60 && !url; k++) {
        await new Promise(r => setTimeout(r, 250));
        for (const f of R.finestre) {
          if (f.isDestroyed()) continue;
          const u = f.webContents.getURL();
          if (u && /^https?:/i.test(u) && u !== 'about:blank' && !R.urls.has(u)) { url = u; break; }
        }
      }
      // chiude le finestre aperte da questo giro
      for (const f of R.finestre) { try { if (!f.isDestroyed()) f.destroy(); } catch (_) {} }
      R.finestre.length = 0;

      if (!url) continue;
      urlVisti++;
      R.urls.add(url);

      /* Documento già scaricato in passato? Il nome nell'indirizzo lo dice.
         Si restituisce comunque il percorso: se la voce non è più in
         rendicontazione (cancellata, archivio azzerato) va reimportata dal
         file che è già sul disco, senza riscaricare nulla. */
      const nomeProbabile = decodeURIComponent((url.split('?')[0].split('/').pop() || ''));
      // può stare in una qualsiasi delle annualità: si cercano tutte
      const suDisco = nomeProbabile ? cercaNelTab(tabId, sanitize(nomeProbabile)) : null;
      if (suDisco) {
        voci.push({ ...candidati[i], url, stato: 'gia-presente', filePath: suDisco });
        continue;
      }

      attesi.set(url, tabId);
      const atteso = new Promise(res => {
        risolutori.set(url, res);
        setTimeout(() => { if (risolutori.has(url)) { risolutori.delete(url); res('timeout'); } }, 60000);
      });
      try { portalSession().downloadURL(url); } catch (_) { continue; }
      const stato = await atteso;
      voci.push({ etichetta: candidati[i].etichetta, riga: candidati[i].riga, url, stato });
    }
  } finally {
    for (const f of R.finestre) { try { if (!f.isDestroyed()) f.destroy(); } catch (_) {} }
    if (raccolta === R) raccolta = null;
    try { await wc.executeJavaScript(`document.querySelectorAll('[data-rendiconto-doc]').forEach(e=>e.removeAttribute('data-rendiconto-doc'))`, true); } catch (_) {}
  }

  return { trovati: candidati.length, scaricati: voci.filter(v2 => v2.stato === 'completed').length, voci,
           diag: { clicRiusciti, finestreAperte: R.aperte, urlVisti } };
});

ipcMain.handle('session:clear', async () => {
  const ses = portalSession();
  await ses.clearStorageData({ storages: ['cookies', 'localstorage', 'indexdb', 'websql', 'serviceworkers', 'cachestorage'] });
  await ses.clearCache();
  for (const [id] of views) { try { views.get(id).view?.webContents.close(); } catch (_) {} }
  views.clear(); visibleTab = null;
  return true;
});

/* --- cartelle ---------------------------------------------------------- */
ipcMain.handle('folder:pick', async (_e, { title } = {}) => {
  const r = await dialog.showOpenDialog(win, {
    title: title || 'Scegli la cartella da sorvegliare',
    properties: ['openDirectory', 'createDirectory'],
  });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('folder:downloadDir', (_e, { tabId, anno }) => {
  const dir = dirDiTab(tabId, anno);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
});
ipcMain.handle('folder:open', (_e, { dir }) => shell.openPath(dir || DOWNLOAD_ROOT));

/* --- cartella dei documenti scaricati ------------------------------------ */
ipcMain.handle('docs:root', () => ({
  root: DOWNLOAD_ROOT,
  accantoApp: path.join(cartellaApp(), 'Documenti'),
  scelta: !!leggiConfig().downloadRoot,
  scrivibile: scrivibile(DOWNLOAD_ROOT),
}));

/* Cartelle già preparate in questa sessione: evita di ricontrollare il disco
   a ogni ridisegno. Si azzera quando cambia la cartella dei documenti. */
let cartelleTabPronte = new Set();

/* Anno su cui si sta lavorando (quello scelto nella barra «Anno di scadenza»).
   Serve ai documenti che l'app scarica da sola: al momento del salvataggio la
   loro scadenza non è ancora stata letta, e finirebbero senza annualità. Se non
   è stato scelto un anno vale quello corrente. */
let annoDiLavoro = '';
const annoDaUsare = a => annoValido(a) || annoDiLavoro || String(new Date().getFullYear());

/** crea la cartella di un tab e le sue annualità; true se ne ha create */
function assicuraCartellaTab(tabId) {
  const dir = dirDiTab(tabId);
  if (cartelleTabPronte.has(dir)) return false;
  let creata = false;
  try {
    if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); creata = true; }
    for (const a of anniCartelle()) {
      const anno = path.join(dir, a);
      if (!fs.existsSync(anno)) { fs.mkdirSync(anno, { recursive: true }); creata = true; }
    }
    cartelleTabPronte.add(dir);
  } catch (_) {}
  return creata;
}

/* I nomi dei tab danno alle cartelle un nome comprensibile. Qui si fa anche
   un'altra cosa: la cartella di ogni tab viene creata SUBITO, senza aspettare
   il primo documento. Aprendo «Documenti» si trova già tutto pronto, una
   cartella per tab, e ci si possono mettere dentro i file a mano. */
ipcMain.handle('docs:nomiTab', (_e, { nomi, anno }) => {
  let spostate = 0, create = 0;
  if (annoValido(anno) || anno === '') annoDiLavoro = annoValido(anno) || '';
  try { fs.mkdirSync(DOWNLOAD_ROOT, { recursive: true }); } catch (_) {}
  for (const [id, nome] of Object.entries(nomi || {})) {
    const precedente = nomiTab.get(id);
    nomiTab.set(id, nome);
    if (precedente && precedente !== nome) {
      const da = path.join(DOWNLOAD_ROOT, sanitize(precedente));
      const a = path.join(DOWNLOAD_ROOT, sanitize(nome));
      try {
        if (fs.existsSync(da) && !fs.existsSync(a)) { fs.renameSync(da, a); spostate++; }
        cartelleTabPronte.delete(da);
      } catch (_) {}
    }
    if (assicuraCartellaTab(id)) create++;
  }
  return { spostate, create };
});


/* La scelta della cartella e il cambio vero e proprio sono separati: così il
   cambio si può collaudare senza aprire una finestra di dialogo, e il percorso
   che finisce nella configurazione è esattamente quello chiesto. */
function cambiaRoot(scelta) {
  const nuova = path.resolve(String(scelta || ''));
  if (!nuova) return { errore: 'Percorso non valido' };
  if (stessaCartella(nuova, DOWNLOAD_ROOT)) return { root: DOWNLOAD_ROOT, mosse: [], uguale: true };
  if (!scrivibile(nuova)) return { errore: 'Quella cartella non è scrivibile' };
  if (dentroA(nuova, DOWNLOAD_ROOT))
    return { errore: 'Quella cartella sta dentro a quella attuale: scegline una fuori, altrimenti i documenti finirebbero dentro sé stessi.' };
  /* qualunque errore va riportato, non fatto esplodere: un'eccezione qui
     chiuderebbe l'app nel bel mezzo di uno spostamento di file */
  /* si spostano SOLO le cartelle dell'app: una per tab, più «Altri documenti».
     Quello che c'era già nella cartella non è nostro e non si tocca. */
  const proprie = [...nomiTab.values()].map(sanitize).concat('Altri documenti');
  let mosse = [];
  try { mosse = spostaDocumenti(DOWNLOAD_ROOT, nuova, proprie); }
  catch (e) { return { errore: 'Spostamento non riuscito: ' + e.message }; }
  DOWNLOAD_ROOT = nuova;
  scriviConfig({ ...leggiConfig(), downloadRoot: nuova });
  /* nella nuova sede le cartelle dei tab vanno rifatte subito, altrimenti
     resterebbe una cartella vuota finché non arriva un documento */
  cartelleTabPronte = new Set();
  for (const id of nomiTab.keys()) assicuraCartellaTab(id);
  return { root: DOWNLOAD_ROOT, mosse };
}
ipcMain.handle('docs:impostaRoot', (_e, { percorso }) => cambiaRoot(percorso));

/* Sceglie soltanto: non sposta niente. Il selettore di Windows, a seconda di
   come ci si muove dentro, può restituire la cartella GENITORE di quella che
   si crede di aver scelto — e non c'è modo di impedirglielo. Perciò il
   percorso torna al chiamante, che lo mostra e chiede conferma. */
ipcMain.handle('docs:scegliRoot', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Dove salvare i documenti scaricati',
    defaultPath: DOWNLOAD_ROOT,
    properties: ['openDirectory', 'createDirectory'],
  });
  if (r.canceled || !r.filePaths || !r.filePaths.length) return null;
  const percorso = path.resolve(r.filePaths[0]);
  return {
    percorso,
    uguale: stessaCartella(percorso, DOWNLOAD_ROOT),
    dentro: dentroA(percorso, DOWNLOAD_ROOT),
    scrivibile: scrivibile(percorso),
    attuale: DOWNLOAD_ROOT,
  };
});

/** al primo avvio porta via i documenti dalla vecchia cartella nascosta */
function migraVecchiDownload() {
  if (!fs.existsSync(VECCHI_DOWNLOAD)) return [];
  if (path.resolve(VECCHI_DOWNLOAD) === path.resolve(DOWNLOAD_ROOT)) return [];
  /* 'tutto': questa cartella sta dentro i dati dell'app ed è interamente sua,
     quindi qui si può portare via ogni cosa senza rischiare roba altrui */
  const mosse = spostaDocumenti(VECCHI_DOWNLOAD, DOWNLOAD_ROOT, 'tutto');
  if (mosse.length) console.log('documenti spostati dalla vecchia cartella:', mosse.length);
  return mosse;
}

const SKIP = /^(\.|~\$)|\.(tmp|crdownload|part|partial|lnk|ini|db)$/i;
async function listDir(dir, base = dir, depth = 0, out = []) {
  if (depth > 5) return out;
  let entries = [];
  try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch (_) { return out; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (SKIP.test(e.name)) continue;
    if (e.isDirectory()) await listDir(full, base, depth + 1, out);
    else if (e.isFile()) {
      try {
        const st = await fsp.stat(full);
        out.push({ name: e.name, fullPath: full, relPath: path.relative(base, full).replace(/\\/g, '/'), size: st.size, mtime: st.mtimeMs });
      } catch (_) {}
    }
    if (out.length > 5000) break;
  }
  return out;
}
ipcMain.handle('folder:scan', (_e, { dir }) => listDir(dir));
ipcMain.handle('file:read', async (_e, { fullPath, maxBytes }) => {
  const st = await fsp.stat(fullPath);
  if (maxBytes && st.size > maxBytes) return null;
  const b = await fsp.readFile(fullPath);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
});
/* Riscrive sul disco un documento partendo dalla copia che l'app tiene in
   archivio: serve dopo una reinstallazione, che porta via la cartella dei
   documenti se questa sta dentro il percorso di installazione. */
ipcMain.handle('docs:scriviFile', async (_e, { tabId, nome, dati, anno }) => {
  try {
    const pulito = sanitize(nome);
    // se c'è già, in una qualunque annualità, si tiene quello: niente doppioni
    const esistente = cercaNelTab(tabId, pulito);
    if (esistente) return { path: esistente, gia: true };
    const dir = dirDiTab(tabId, annoDaUsare(anno));
    fs.mkdirSync(dir, { recursive: true });
    const target = path.join(dir, pulito);
    await fsp.writeFile(target, Buffer.from(dati));
    return { path: target };
  } catch (e) { return { errore: e.message }; }
});

ipcMain.handle('file:open', (_e, { fullPath }) => shell.openPath(fullPath));
ipcMain.handle('file:reveal', (_e, { fullPath }) => shell.showItemInFolder(fullPath));

ipcMain.handle('folder:watch', (_e, { tabId, dir }) => {
  stopWatch(tabId);
  if (!dir || !fs.existsSync(dir)) return false;
  try {
    const w = fs.watch(dir, { recursive: true }, () => {
      const st = watches.get(tabId); if (!st) return;
      clearTimeout(st.timer);
      // attesa: i browser scrivono .crdownload e rinominano solo alla fine
      st.timer = setTimeout(() => send('folder:changed', { tabId, dir }), 2500);
    });
    w.on('error', () => stopWatch(tabId));
    watches.set(tabId, { dir, watcher: w, timer: null });
    return true;
  } catch (_) { return false; }
});
function stopWatch(tabId) {
  const st = watches.get(tabId);
  if (!st) return;
  clearTimeout(st.timer);
  try { st.watcher.close(); } catch (_) {}
  watches.delete(tabId);
}
ipcMain.handle('folder:unwatch', (_e, { tabId }) => stopWatch(tabId));

/* -------------------------------------------------------------------------
   Progetti: Nuovo / Carica / Salva / Salva come
   Il file di progetto contiene la rendicontazione completa (tab, spese,
   impostazioni) e, se non è troppo grande, anche i documenti allegati.
   ------------------------------------------------------------------------- */
const FILTRI_PROGETTO = [
  { name: 'Progetto rendicontazione', extensions: ['json'] },
  { name: 'Tutti i file', extensions: ['*'] },
];

function nomeProgetto() {
  return progettoPath ? path.basename(progettoPath, path.extname(progettoPath)) : 'senza nome';
}
function aggiornaTitolo() {
  if (!win || win.isDestroyed()) return;
  win.setTitle(`${modificato ? '• ' : ''}${nomeProgetto()} — Rendicontazione Business`);
}

ipcMain.handle('progetto:scegliSalva', async (_e, { suggerito } = {}) => {
  const base = progettoPath || path.join(app.getPath('documents'), (suggerito || 'Rendicontazione Business') + '.json');
  const r = await dialog.showSaveDialog(win, {
    title: 'Salva il progetto',
    defaultPath: base,
    filters: FILTRI_PROGETTO,
    properties: ['createDirectory', 'showOverwriteConfirmation'],
  });
  return r.canceled ? null : r.filePath;
});

ipcMain.handle('progetto:scegliApri', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Carica un progetto',
    defaultPath: progettoPath || app.getPath('documents'),
    filters: FILTRI_PROGETTO,
    properties: ['openFile'],
  });
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle('progetto:scrivi', async (_e, { filePath, contenuto }) => {
  await fsp.writeFile(filePath, contenuto, 'utf8');
  progettoPath = filePath;
  modificato = false;
  aggiornaTitolo();
  return { filePath, byte: Buffer.byteLength(contenuto, 'utf8') };
});

ipcMain.handle('progetto:leggi', async (_e, { filePath }) => {
  const testo = await fsp.readFile(filePath, 'utf8');
  return { filePath, testo };
});

ipcMain.handle('progetto:stato', (_e, { filePath, modificato: m } = {}) => {
  if (filePath !== undefined) progettoPath = filePath;
  if (m !== undefined) modificato = !!m;
  aggiornaTitolo();
  return { progettoPath, modificato, nome: nomeProgetto() };
});

ipcMain.handle('progetto:conferma', async (_e, { titolo, messaggio, pulsanti }) => {
  const r = await dialog.showMessageBox(win, {
    type: 'question', buttons: pulsanti, defaultId: 0, cancelId: pulsanti.length - 1,
    title: titolo, message: titolo, detail: messaggio, noLink: true,
  });
  return r.response;
});

/* --- adattamento allo schermo -------------------------------------------- */
ipcMain.handle('ui:zoomGet', () => {
  const d = currentDisplay();
  return {
    uiZoom, zoomMode, siteZoom,
    auto: autoZoomFor(d),
    schermo: {
      logico: `${d.workArea.width}×${d.workArea.height}`,
      fisico: `${Math.round(d.bounds.width * d.scaleFactor)}×${Math.round(d.bounds.height * d.scaleFactor)}`,
      scala: d.scaleFactor,
    },
  };
});
ipcMain.handle('ui:zoomSet', (_e, { uiZoom: z, mode, siteZoom: sz }) => {
  if (sz != null) applySiteZoom(sz);
  if (mode === 'auto') { zoomMode = 'auto'; applyUiZoom(autoZoomFor(currentDisplay()), { fromAuto: true }); }
  else if (z != null) applyUiZoom(z);
  return { uiZoom, zoomMode, siteZoom };
});

ipcMain.handle('app:info', () => {
  const m = migrazioneIniziale; migrazioneIniziale = [];
  return {
    version: app.getVersion(), electron: process.versions.electron, chrome: process.versions.chrome,
    userData: app.getPath('userData'), downloadRoot: DOWNLOAD_ROOT, migrazione: m,
  };
});
ipcMain.handle('app:notify', (_e, { title, body }) => {
  const { Notification } = require('electron');
  if (Notification.isSupported()) new Notification({ title, body }).show();
});

/* -------------------------------------------------------------------------
   Ciclo di vita
   ------------------------------------------------------------------------- */
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(() => {
    fs.mkdirSync(DOWNLOAD_ROOT, { recursive: true });
    migrazioneIniziale = migraVecchiDownload();
    portalSession();
    createWindow();
    screen.on('display-metrics-changed', onDisplaysChanged);
    screen.on('display-added', onDisplaysChanged);
    screen.on('display-removed', onDisplaysChanged);
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });
  app.on('window-all-closed', () => { for (const id of [...watches.keys()]) stopWatch(id); if (process.platform !== 'darwin') app.quit(); });
}
