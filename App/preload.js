'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const on = (ch, cb) => { const h = (_e, p) => cb(p); ipcRenderer.on(ch, h); return () => ipcRenderer.off(ch, h); };

contextBridge.exposeInMainWorld('rendiconto', {
  isDesktop: true,

  // browser incorporato
  showView:    (tabId, url, bounds) => ipcRenderer.invoke('view:show', { tabId, url, bounds }),
  setBounds:   (tabId, bounds)      => ipcRenderer.invoke('view:bounds', { tabId, bounds }),
  hideViews:   ()                   => ipcRenderer.invoke('view:hide'),
  destroyView: (tabId)              => ipcRenderer.invoke('view:destroy', { tabId }),
  viewAct:     (tabId, action, url) => ipcRenderer.invoke('view:act', { tabId, action, url }),
  onNav:       (cb) => on('view:nav', cb),
  onViewError: (cb) => on('view:error', cb),

  // lettura della pagina senza download
  webExtract: (tabId, url, background) => ipcRenderer.invoke('web:extract', { tabId, url, background }),
  webDownloadDocs: (tabId, urls) => ipcRenderer.invoke('web:downloadDocs', { tabId, urls }),
  webCollectDocs:  (tabId, opts = {}) => ipcRenderer.invoke('web:collectDocs', { tabId, ...opts }),

  // sessione
  clearSession: () => ipcRenderer.invoke('session:clear'),

  // cartelle e file
  pickFolder:      (title)        => ipcRenderer.invoke('folder:pick', { title }),
  downloadDir:     (tabId, anno)  => ipcRenderer.invoke('folder:downloadDir', { tabId, anno }),
  openFolder:      (dir)          => ipcRenderer.invoke('folder:open', { dir }),
  scanFolder:      (dir)          => ipcRenderer.invoke('folder:scan', { dir }),
  readFile:        (fullPath, maxBytes) => ipcRenderer.invoke('file:read', { fullPath, maxBytes }),
  openFile:        (fullPath)     => ipcRenderer.invoke('file:open', { fullPath }),
  revealFile:      (fullPath)     => ipcRenderer.invoke('file:reveal', { fullPath }),
  watchFolder:     (tabId, dir)   => ipcRenderer.invoke('folder:watch', { tabId, dir }),
  unwatchFolder:   (tabId)        => ipcRenderer.invoke('folder:unwatch', { tabId }),
  onFolderChanged: (cb) => on('folder:changed', cb),

  // download dai portali
  onDownloadStart:  (cb) => on('download:start', cb),
  onDownloadDone:   (cb) => on('download:done', cb),
  onDownloadFailed: (cb) => on('download:failed', cb),

  // progetti: Nuovo / Carica / Salva / Salva come
  progettoScegliSalva: (suggerito) => ipcRenderer.invoke('progetto:scegliSalva', { suggerito }),
  progettoScegliApri:  ()          => ipcRenderer.invoke('progetto:scegliApri'),
  progettoScrivi:      (filePath, contenuto) => ipcRenderer.invoke('progetto:scrivi', { filePath, contenuto }),
  progettoLeggi:       (filePath)  => ipcRenderer.invoke('progetto:leggi', { filePath }),
  progettoStato:       (opts = {}) => ipcRenderer.invoke('progetto:stato', opts),
  progettoConferma:    (titolo, messaggio, pulsanti) => ipcRenderer.invoke('progetto:conferma', { titolo, messaggio, pulsanti }),
  onMenu: (cb) => {
    const off = ['nuovo', 'carica', 'salva', 'salvaCome'].map(a => on('menu:' + a, () => cb(a)));
    return () => off.forEach(f => f());
  },

  // cartella dei documenti scaricati
  docsRoot:       ()          => ipcRenderer.invoke('docs:root'),
  docsScegliRoot: ()          => ipcRenderer.invoke('docs:scegliRoot'),
  docsImpostaRoot:(percorso)  => ipcRenderer.invoke('docs:impostaRoot', { percorso }),
  docsNomiTab:    (nomi, anno)=> ipcRenderer.invoke('docs:nomiTab', { nomi, anno }),
  docsScriviFile: (tabId, nome, dati, anno) => ipcRenderer.invoke('docs:scriviFile', { tabId, nome, dati, anno }),

  // adattamento allo schermo
  zoomGet: ()            => ipcRenderer.invoke('ui:zoomGet'),
  zoomSet: (opts)        => ipcRenderer.invoke('ui:zoomSet', opts),
  onZoom:  (cb) => on('ui:zoom', cb),

  // varie
  info:   ()             => ipcRenderer.invoke('app:info'),
  notify: (title, body)  => ipcRenderer.invoke('app:notify', { title, body }),
});
