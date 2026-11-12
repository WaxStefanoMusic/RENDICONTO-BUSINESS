'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('gestionale', {
  // i dati si leggono in modo sincrono all'avvio: la pagina parte già piena
  leggiDati:  ()      => ipcRenderer.sendSync('dati:leggi'),
  scriviDati: (json)  => ipcRenderer.sendSync('dati:scrivi', json),

  esportaBackup: (nome, json) => ipcRenderer.invoke('backup:esporta', { nome, json }),
  importaBackup: ()           => ipcRenderer.invoke('backup:importa'),
  esportaFile:   (nome, contenuto, tipo) => ipcRenderer.invoke('file:esporta', { nome, contenuto, tipo }),
  salvaAllegato: (cartella, nome, bytes) => ipcRenderer.invoke('allegato:salva', { cartella, nome, bytes }),
  apriAllegato:  (rel)          => ipcRenderer.invoke('allegato:apri', rel),

  onMenu: (cb) => {
    const h = (_e, cmd) => cb(cmd);
    ipcRenderer.on('menu', h);
    return () => ipcRenderer.off('menu', h);
  },
});
