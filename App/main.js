'use strict';
/* ==========================================================================
   Gestionale Contabile & Fiscale SNC — processo principale Electron
   - una sola finestra che si adatta a qualunque schermo, risoluzione e scala
   - i dati stanno in un file JSON nella cartella dell'app, con una copia
     di sicurezza al giorno
   - aggiornamenti automatici dalle Release GitHub
   ========================================================================== */
const { app, BrowserWindow, ipcMain, dialog, shell, Menu, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');

/* Il nome resta quello della prima versione: così la cartella dei dati e
   l'aggiornamento automatico continuano a valere per chi l'ha già installata. */
app.setName('Rendicontazione Business');
const TITOLO = 'Gestionale Contabile & Fiscale SNC';

const USER = app.getPath('userData');
const STATE_FILE = path.join(USER, 'window-state.json');
const DATI_FILE = path.join(USER, 'gestionale-dati.json');
const COPIE_DIR = path.join(USER, 'copie-di-sicurezza');
const COPIE_DA_TENERE = 30;

let win = null;
let uiZoom = 1;
let zoomMode = 'auto';   // 'auto' | 'manuale'

const send = (ch, payload) => { if (win && !win.isDestroyed()) win.webContents.send(ch, payload); };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* -------------------------------------------------------------------------
   Dati
   ------------------------------------------------------------------------- */
function leggiDati() {
  try { return fs.readFileSync(DATI_FILE, 'utf8').replace(/^﻿/, ''); } catch (_) { return null; }
}

/* Scrittura atomica: prima un file temporaneo, poi lo si rinomina. Se il PC
   si spegne a metà, resta intatta la versione precedente. */
function scriviDati(json) {
  fs.mkdirSync(USER, { recursive: true });
  const tmp = DATI_FILE + '.tmp';
  fs.writeFileSync(tmp, json, 'utf8');
  fs.renameSync(tmp, DATI_FILE);
  copiaDelGiorno();
}

/* Una copia al giorno, le ultime 30: un errore scoperto tardi si recupera */
let ultimaCopia = '';
function copiaDelGiorno() {
  const oggi = new Date().toISOString().slice(0, 10);
  if (ultimaCopia === oggi) return;
  try {
    fs.mkdirSync(COPIE_DIR, { recursive: true });
    const dest = path.join(COPIE_DIR, `gestionale-${oggi}.json`);
    if (!fs.existsSync(dest)) fs.copyFileSync(DATI_FILE, dest);
    ultimaCopia = oggi;
    const vecchie = fs.readdirSync(COPIE_DIR).filter((f) => /^gestionale-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
    for (const f of vecchie.slice(0, Math.max(0, vecchie.length - COPIE_DA_TENERE))) fs.unlinkSync(path.join(COPIE_DIR, f));
  } catch (_) { /* la copia è un di più: non deve mai bloccare il salvataggio */ }
}

ipcMain.on('dati:leggi', (e) => { e.returnValue = leggiDati(); });
ipcMain.on('dati:scrivi', (e, json) => {
  try { scriviDati(String(json)); e.returnValue = true; }
  catch (err) { e.returnValue = false; dialog.showErrorBox(TITOLO, 'Salvataggio non riuscito:\n' + err.message); }
});

ipcMain.handle('backup:esporta', async (_e, { nome, json }) => {
  const r = await dialog.showSaveDialog(win, {
    title: 'Esporta backup', defaultPath: path.join(app.getPath('documents'), nome),
    filters: [{ name: 'Backup JSON', extensions: ['json'] }],
  });
  if (r.canceled || !r.filePath) return { ok: false };
  fs.writeFileSync(r.filePath, json, 'utf8');
  return { ok: true, percorso: r.filePath };
});

/* riepiloghi per il commercialista: solo CSV, il contenuto lo prepara la pagina */
ipcMain.handle('file:esporta', async (_e, { nome, contenuto, tipo }) => {
  if (tipo !== 'csv') return { ok: false };
  const r = await dialog.showSaveDialog(win, {
    title: 'Salva riepilogo per il commercialista',
    defaultPath: path.join(app.getPath('documents'), path.basename(String(nome || 'riepilogo.csv'))),
    filters: [{ name: 'Foglio Excel (CSV)', extensions: ['csv'] }],
  });
  if (r.canceled || !r.filePath) return { ok: false };
  fs.writeFileSync(r.filePath, String(contenuto), 'utf8');
  shell.showItemInFolder(r.filePath);
  return { ok: true, percorso: r.filePath };
});

ipcMain.handle('backup:importa', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Ripristina backup', defaultPath: app.getPath('documents'), properties: ['openFile'],
    filters: [{ name: 'Backup JSON', extensions: ['json'] }],
  });
  if (r.canceled || !r.filePaths[0]) return { ok: false };
  try { return { ok: true, contenuto: fs.readFileSync(r.filePaths[0], 'utf8').replace(/^﻿/, '') }; }
  catch (err) { return { ok: false, errore: 'File non leggibile: ' + err.message }; }
});

/* Allegati (PDF dei corrispettivi, XML delle fatture elettroniche): una copia
   nella cartella dei dati, così restano consultabili anche se l'originale
   viene spostato o cancellato. Si accettano solo PDF e XML, e solo percorsi
   dentro la cartella degli allegati. */
const ALLEGATI_DIR = path.join(USER, 'allegati');
const dentroAllegati = (rel) => {
  const p = path.resolve(ALLEGATI_DIR, String(rel || ''));
  return p.startsWith(ALLEGATI_DIR + path.sep) ? p : null;
};
// un XML comincia con «<», dopo un eventuale BOM UTF-8 e qualche spazio; o è UTF-16
const sembraXml = (b) => {
  if ((b[0] === 0xff && b[1] === 0xfe) || (b[0] === 0xfe && b[1] === 0xff)) return true;
  let i = b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf ? 3 : 0;
  while (i < b.length && i < 64 && /\s/.test(String.fromCharCode(b[i]))) i++;
  return b[i] === 0x3c;
};
ipcMain.handle('allegato:salva', async (_e, { cartella, nome, bytes }) => {
  const dati = Buffer.from(bytes || []);
  const estensione = dati.subarray(0, 5).toString('latin1') === '%PDF-' ? '.pdf' : sembraXml(dati) ? '.xml' : null;
  if (!estensione) return { ok: false, errore: 'non è un PDF né un XML' };
  const pulito = (s) => String(s || '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/^\.+/, '').trim().slice(0, 120);
  const sotto = String(cartella || '').split(/[\\/]+/).map(pulito).filter(Boolean);
  const base = (pulito(nome) || 'documento').replace(/\.(pdf|xml)$/i, '');
  const rel = path.join(...(sotto.length ? sotto : ['varie']), base + estensione);
  const dest = dentroAllegati(rel);
  if (!dest) return { ok: false, errore: 'nome non valido' };
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, dati);
  return { ok: true, rel: rel.split(path.sep).join('/') };
});
ipcMain.handle('allegato:apri', async (_e, rel) => {
  const p = dentroAllegati(rel);
  if (!p || !/\.pdf$/i.test(p) || !fs.existsSync(p)) return { ok: false, errore: 'Il PDF allegato non si trova più nella cartella dei dati.' };
  const err = await shell.openPath(p);
  return err ? { ok: false, errore: err } : { ok: true };
});
// l'XML di una fattura, per mostrarla nell'app
ipcMain.handle('allegato:leggi', async (_e, rel) => {
  const p = dentroAllegati(rel);
  if (!p || !/\.xml$/i.test(p) || !fs.existsSync(p)) return { ok: false, errore: 'Il file XML non si trova più nella cartella dei dati.' };
  if (fs.statSync(p).size > 60 * 1024 * 1024) return { ok: false, errore: 'File troppo grande.' };
  return { ok: true, bytes: fs.readFileSync(p) };
});

/* -------------------------------------------------------------------------
   Adattamento allo schermo: dimensione finestra, zoom, cambi di DPI
   ------------------------------------------------------------------------- */
/** Zoom suggerito in base allo spazio logico disponibile.
 *  Un 4K al 100% espone 3840 punti logici: senza ingrandire i testi sarebbero
 *  minuscoli. Su un portatile piccolo o con scala alta si riduce un poco. */
function autoZoomFor(display) {
  const w = display.workArea.width;
  if (w >= 3400) return 1.60;
  if (w >= 2800) return 1.30;
  if (w >= 2200) return 1.15;
  if (w <= 1000) return 0.80;
  if (w <= 1400) return 0.90;
  return 1;
}

/* Dimensione minima: 900×600 su uno schermo normale, ma mai più dello spazio
   disponibile (un 1366×768 al 150% offre circa 910×480 punti). */
function minSizeFor(display) {
  const wa = display.workArea;
  return { w: Math.min(900, wa.width), h: Math.min(600, wa.height) };
}

function fitBounds(b, display) {
  const wa = display.workArea;
  const width = Math.min(b.width, wa.width), height = Math.min(b.height, wa.height);
  return { width, height, x: clamp(b.x, wa.x, wa.x + wa.width - width), y: clamp(b.y, wa.y, wa.y + wa.height - height) };
}

function defaultBounds(display) {
  const wa = display.workArea, m = minSizeFor(display);
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
    const s = { ...win.getNormalBounds(), maximized: win.isMaximized(), uiZoom, zoomMode };
    try { fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2)); } catch (_) {}
  }, 500);
}

/** una posizione salvata vale solo se ricade ancora su uno schermo collegato */
function boundsAreVisible(b) {
  if (!b || !Number.isFinite(b.x) || !Number.isFinite(b.width)) return false;
  const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
  return screen.getAllDisplays().some((d) => {
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
  if (persist) saveState();
}
const zoomAutomatico = () => { zoomMode = 'auto'; applyUiZoom(autoZoomFor(currentDisplay()), { fromAuto: true }); };

/* -------------------------------------------------------------------------
   Finestra
   ------------------------------------------------------------------------- */
function createWindow() {
  const st = readState();
  const display = boundsAreVisible(st) ? screen.getDisplayMatching(st) : screen.getPrimaryDisplay();
  const b = boundsAreVisible(st) ? fitBounds(st, display) : defaultBounds(display);
  const m = minSizeFor(display);

  zoomMode = st.zoomMode === 'manuale' ? 'manuale' : 'auto';
  uiZoom = zoomMode === 'manuale' ? clamp(+st.uiZoom || 1, 0.6, 2.5) : autoZoomFor(display);

  win = new BrowserWindow({
    x: b.x, y: b.y, width: b.width, height: b.height,
    minWidth: m.w, minHeight: m.h,
    backgroundColor: '#f8fafc',
    show: false,
    title: TITOLO,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      zoomFactor: uiZoom,
      spellcheck: false,
    },
  });
  if (st.maximized) win.maximize();

  Menu.setApplicationMenu(buildMenu());
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => { win.webContents.setZoomFactor(uiZoom); win.show(); });

  // la pagina non deve navigare altrove; i link esterni si aprono nel browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://')) { e.preventDefault(); if (/^https?:\/\//i.test(url)) shell.openExternal(url); }
  });

  // Ctrl+rotellina: zoom dell'interfaccia
  win.webContents.on('zoom-changed', (_e, dir) => applyUiZoom(uiZoom + (dir === 'in' ? 0.1 : -0.1)));

  win.on('closed', () => { win = null; });

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
    saveState();
  };
  for (const ev of ['resize', 'move', 'maximize', 'unmaximize']) win.on(ev, reflow);
}

/* cambi di risoluzione, scala di Windows o monitor collegati/scollegati */
function onDisplaysChanged() {
  if (!win || win.isDestroyed()) return;
  const d = currentDisplay();
  if (zoomMode === 'auto') applyUiZoom(autoZoomFor(d), { fromAuto: true });
  const m = minSizeFor(d);
  win.setMinimumSize(m.w, m.h);
  if (!boundsAreVisible(win.getNormalBounds())) {
    win.setBounds(defaultBounds(screen.getPrimaryDisplay()));
  } else if (!win.isMaximized() && !win.isFullScreen()) {
    const nb = win.getNormalBounds(), f = fitBounds(nb, d);
    if (f.width !== nb.width || f.height !== nb.height || f.x !== nb.x || f.y !== nb.y) win.setBounds(f);
  }
}

function buildMenu() {
  return Menu.buildFromTemplate([
    { label: 'File', submenu: [
      { label: 'Esporta backup…', accelerator: 'CommandOrControl+S', click: () => send('menu', 'esporta') },
      { label: 'Ripristina backup…', accelerator: 'CommandOrControl+O', click: () => send('menu', 'importa') },
      { type: 'separator' },
      { label: 'Impostazioni della società…', accelerator: 'CommandOrControl+,', click: () => send('menu', 'impostazioni') },
      { label: 'Stampa…', accelerator: 'CommandOrControl+P', click: () => send('menu', 'stampa') },
      { type: 'separator' },
      { label: 'Apri cartella dei dati', click: () => { fs.mkdirSync(USER, { recursive: true }); shell.openPath(USER); } },
      { label: 'Apri copie di sicurezza', click: () => { fs.mkdirSync(COPIE_DIR, { recursive: true }); shell.openPath(COPIE_DIR); } },
      { type: 'separator' },
      { role: 'quit', label: 'Esci' },
    ]},
    { label: 'Modifica', submenu: [
      { role: 'undo', label: 'Annulla' }, { role: 'redo', label: 'Ripeti' }, { type: 'separator' },
      { role: 'cut', label: 'Taglia' }, { role: 'copy', label: 'Copia' }, { role: 'paste', label: 'Incolla' },
      { role: 'selectAll', label: 'Seleziona tutto' },
    ]},
    { label: 'Visualizza', submenu: [
      { label: 'Interfaccia più grande', accelerator: 'CommandOrControl+=', click: () => applyUiZoom(uiZoom + 0.1) },
      { label: 'Interfaccia più piccola', accelerator: 'CommandOrControl+-', click: () => applyUiZoom(uiZoom - 0.1) },
      { label: 'Dimensione automatica', accelerator: 'CommandOrControl+0', click: zoomAutomatico },
      { type: 'separator' },
      { role: 'togglefullscreen', label: 'Schermo intero' },
      { role: 'reload', label: 'Ricarica' },
      { role: 'toggleDevTools', label: 'Strumenti sviluppatore' },
    ]},
    { label: '?', submenu: [
      { label: 'Controlla aggiornamenti…', click: () => cercaAggiornamenti(true) },
      { label: 'Informazioni', click: () => dialog.showMessageBox(win, {
        type: 'info', title: TITOLO, buttons: ['Chiudi'],
        message: TITOLO + ' ' + app.getVersion(),
        detail: 'Contabilità semplificata, liquidazione IVA trimestrale, imposte dei soci e INPS.\n\nDati:\n' + DATI_FILE,
      }) },
    ]},
  ]);
}

/* -------------------------------------------------------------------------
   Aggiornamenti automatici (come in App Preventivi)

   Le versioni nuove stanno nelle Release della repository GitHub
   RENDICONTO-BUSINESS, insieme a «latest.yml» che dice qual è l'ultima. L'app
   lo legge all'avvio e poi ogni sei ore, scarica in sottofondo e si fa viva
   SOLO quando il pacchetto è pronto. Decide l'utente: «Installa adesso»
   chiude e riapre l'app aggiornata, «Alla prossima chiusura» la applica
   uscendo. La versione portatile non si aggiorna da sé: si riscarica.
   ------------------------------------------------------------------------- */
let controlloChiesto = false;
const aggiornabile = () => app.isPackaged && !process.env.PORTABLE_EXECUTABLE_DIR;

function installaAggiornamento() {
  // prima si chiude la finestra (la pagina salva all'uscita), poi parte l'installazione
  if (!win || win.isDestroyed()) { autoUpdater.quitAndInstall(false, true); return; }
  win.once('closed', () => setTimeout(() => autoUpdater.quitAndInstall(false, true), 300));
  win.close();
}

function preparaAggiornamenti() {
  if (!aggiornabile()) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-downloaded', (info) => {
    const r = dialog.showMessageBoxSync(win, {
      type: 'question', noLink: true, defaultId: 0, cancelId: 1,
      buttons: ['Installa adesso', 'Alla prossima chiusura'],
      title: 'Aggiornamento pronto',
      message: 'È pronta la versione ' + info.version + '.',
      detail: 'È già stata scaricata. Installandola adesso l\'app si chiude e si riapre aggiornata; i dati restano come sono.',
    });
    if (r === 0) installaAggiornamento();
  });
  autoUpdater.on('update-not-available', () => {
    if (!controlloChiesto) return;
    controlloChiesto = false;
    dialog.showMessageBox(win, { type: 'info', buttons: ['Chiudi'], title: TITOLO,
      message: 'Sei già all\'ultima versione.', detail: 'Versione installata: ' + app.getVersion() });
  });
  // senza rete non è successo niente di grave: si riproverà; lo si dice solo a chi ha chiesto
  autoUpdater.on('error', (e) => {
    if (!controlloChiesto) return;
    controlloChiesto = false;
    dialog.showMessageBox(win, { type: 'warning', buttons: ['Chiudi'], title: TITOLO,
      message: 'Non sono riuscito a controllare gli aggiornamenti.', detail: String((e && e.message) || e) });
  });

  cercaAggiornamenti();
  setInterval(cercaAggiornamenti, 6 * 60 * 60 * 1000);
}

function cercaAggiornamenti(chiestoDallUtente) {
  if (chiestoDallUtente) controlloChiesto = true;
  if (!aggiornabile()) {
    if (chiestoDallUtente) dialog.showMessageBox(win, { type: 'info', buttons: ['Chiudi'], title: TITOLO,
      message: 'Gli aggiornamenti automatici valgono per l\'app installata.',
      detail: process.env.PORTABLE_EXECUTABLE_DIR
        ? 'Questa è la versione portatile: scarica la nuova da GitHub (RENDICONTO-BUSINESS → Releases).'
        : 'Questa copia gira dai sorgenti, quindi non c\'è niente da aggiornare.' });
    controlloChiesto = false;
    return;
  }
  autoUpdater.checkForUpdates().catch(() => {});
}

/* -------------------------------------------------------------------------
   Ciclo di vita
   ------------------------------------------------------------------------- */
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(() => {
    createWindow();
    preparaAggiornamenti();
    screen.on('display-metrics-changed', onDisplaysChanged);
    screen.on('display-added', onDisplaysChanged);
    screen.on('display-removed', onDisplaysChanged);
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}
