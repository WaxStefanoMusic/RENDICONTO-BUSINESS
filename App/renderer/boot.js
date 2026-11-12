/* deve girare PRIMA di core.js: impedisce l'avvio automatico della versione web,
   perché nel desktop l'inizializzazione la fa desktop.js dopo aver installato
   le proprie versioni delle funzioni. */
window.__DESKTOP__ = true;
