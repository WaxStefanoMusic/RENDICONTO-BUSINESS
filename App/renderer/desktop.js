'use strict';
/* ==========================================================================
   Livello desktop: sostituisce le parti che nel browser erano impossibili.
   Caricato DOPO core.js, ne riassegna le funzioni interessate.
   ========================================================================== */
const D = window.rendiconto;

FSA = true;                      // niente File System Access API: qui c'è Node
let siteMode = 'browse';         // 'browse' | 'docs'  (solo tab sito)
let boundsRAF = null;

/* --------------------------------------------------------------------------
   1. Cartelle collegate — sorveglianza nativa, nessun permesso da rinnovare
   -------------------------------------------------------------------------- */
getDirHandle = async function (tabId) {
  const t = tabById(tabId);
  return t?.watch?.path ? { __desktop: true } : null;
};

pickFolderFor = async function (tabId) {
  const dir = await D.pickFolder('Cartella da sorvegliare per «' + (tabById(tabId)?.name || '') + '»');
  if (!dir) return;
  const t = tabById(tabId);
  t.watch = { name: dir.split(/[\\/]/).pop() || dir, path: dir, enabled: true, lastScan: null, count: 0 };
  save(); render();
  await D.watchFolder(tabId, dir);
  toast('Cartella collegata: ' + dir, 'ok');
  scanFolder(tabId, true);
};

unlinkFolder = async function (tabId) {
  await D.unwatchFolder(tabId);
  const t = tabById(tabId); if (t) delete t.watch;
  save(); render();
};

/** legge dal disco solo i file non ancora presenti nel tab */
scanFolder = async function (tabId) {
  const t = tabById(tabId);
  if (!t || !t.watch?.path) return 0;
  let files;
  try { files = await D.scanFolder(t.watch.path); }
  catch (e) { t.watch.error = e.message; save(); if (currentTab() === tabId) render(); return 0; }
  delete t.watch.error;

  const known = new Set(docsOf(tabId).map(d => d.key));
  const nuovi = files.filter(f => !known.has(f.relPath + '|' + f.size));
  const items = [];
  for (const f of nuovi) {
    const ab = await D.readFile(f.fullPath, 64 * 1024 * 1024);
    if (!ab) { console.warn('file troppo grande, saltato:', f.fullPath); continue; }
    items.push({ name: f.name, path: f.relPath, data: new Uint8Array(ab), lastModified: f.mtime, fullPath: f.fullPath });
  }
  const added = await addDocuments(tabId, items);
  added.forEach((d, i) => { d.fullPath = items[i]?.fullPath; });
  t.watch.lastScan = new Date().toISOString();
  t.watch.count = files.length;
  save();
  const abbinati = (added.abbinati || []).length;
  if (added.length || abbinati) {
    const m = [added.length ? added.length + ' nuovi documenti' : '',
               abbinati ? abbinati + ' abbinati alle righe esistenti' : ''].filter(Boolean).join(' · ');
    toast(m + ' da «' + t.name + '»', 'ok');
    D.notify('Rendicontazione Business — ' + t.name, m);
  }
  render();
  return added.length + abbinati;
};

/* la sorveglianza è nativa: teniamo solo una scansione lenta di sicurezza */
startWatch = function (tabId) {
  stopWatch(tabId);
  const t = tabById(tabId); if (!t?.watch?.path) return;
  D.watchFolder(tabId, t.watch.path);
  watchers.set(tabId, setInterval(() => { if (tabById(tabId)?.watch?.enabled) scanFolder(tabId); }, 10 * 60 * 1000));
};
stopWatch = function (tabId) {
  if (watchers.has(tabId)) { clearInterval(watchers.get(tabId)); watchers.delete(tabId); }
  D.unwatchFolder(tabId);
};

D.onFolderChanged(({ tabId }) => { const t = tabById(tabId); if (t?.watch?.enabled) scanFolder(tabId); });

/* --------------------------------------------------------------------------
   2. Download dai portali → import automatico nel tab che li ha generati
   -------------------------------------------------------------------------- */
D.onDownloadStart(({ tabId, fileName }) => setNavStatus('⬇ scarico ' + fileName + '…', tabId));

/* L'import di un download è asincrono (lettura file + analisi del PDF) e
   arriva per evento: chi ha avviato la raccolta deve poterlo attendere, o
   conterebbe i documenti prima che siano entrati. */
const importiInCorso = new Set();
async function attendiImport() {
  for (let i = 0; i < 30 && importiInCorso.size; i++) await Promise.allSettled([...importiInCorso]);
}
function registraImport(p) { importiInCorso.add(p); p.finally(() => importiInCorso.delete(p)); return p; }

D.onDownloadDone(payload => registraImport(importaDownload(payload)));

/* Scelta valida per l'intero scaricamento in corso: con dodici bollette in fila
   non ha senso chiedere dodici volte. La imposta scaricaDocumenti(); per un
   download singolo, avviato a mano dal browser incorporato, resta null e si
   chiede sul momento. */
let sceltaScaricamento = null;

/** chiede se limitarsi a salvare il file o anche metterlo in rendicontazione */
function chiediCosaFarne(titolo, quanti) {
  const corpo = `
    <p style="margin:0 0 12px">${quanti > 1
      ? `Sto per scaricare <b>${quanti} documenti</b>.`
      : `È arrivato <b>${esc(titolo)}</b>.`}</p>
    <div class="scelta-doc">
      <div class="voce"><b>Scarica</b><span>Salva soltanto il file nella cartella del tab. La rendicontazione non cambia.</span></div>
      <div class="voce"><b>Contabilizza</b><span>Salva il file <i>e</i> crea la riga nella sezione Automatica, con importo, scadenza e consumo letti dal documento.</span></div>
    </div>`;
  return chiediScelta('Scarica o contabilizza?', corpo, [
    { label: 'Annulla', valore: null },
    { label: 'Scarica', valore: 'scarica' },
    { label: 'Contabilizza', valore: 'contabilizza', primary: true },
  ]).then(r => r.scelta);
}

async function importaDownload({ tabId, filePath, fileName, url }) {
  const t = tabId && tabById(tabId);
  const target = t ? tabId : (S.tabs.find(x => x.type === 'files')?.id || null);
  if (!target) { toast('Scaricato ' + fileName + ' (nessun tab a cui associarlo)', 'err'); return; }

  const cosa = sceltaScaricamento || await chiediCosaFarne(fileName, 1);
  if (cosa !== 'contabilizza') {
    setNavStatus('⬇ scaricato: ' + fileName + (cosa ? '' : ' (annullato)'), target);
    toast('Scaricato: ' + fileName + ' — non contabilizzato', 'ok');
    return;
  }

  const ab = await D.readFile(filePath, 64 * 1024 * 1024);
  if (!ab) { toast('File troppo grande: ' + fileName, 'err'); return; }
  const added = await addDocuments(target, [{ name: fileName, path: 'Download/' + fileName, data: new Uint8Array(ab), lastModified: Date.now() }]);
  added.forEach(d => { d.fullPath = filePath; if (url) d.sourceUrl = url; });
  save();
  const d = added[0];
  setNavStatus(added.length ? '✓ importato: ' + fileName + (d?.amount != null ? ' — ' + fmtEur(d.amount) : '') : '· già presente: ' + fileName, target);
  if (added.length) {
    toast('Importato: ' + fileName + (d?.amount != null ? ' — ' + fmtEur(d.amount) : ''), 'ok');
    D.notify('Documento importato', fileName + (d?.amount != null ? '\n' + fmtEur(d.amount) : ''));
  }
  render();
}

D.onDownloadFailed(({ fileName, state }) => toast('Download non riuscito (' + state + '): ' + fileName, 'err'));

/* --------------------------------------------------------------------------
   3. Tab sito — browser vero incorporato, sessione persistente
   -------------------------------------------------------------------------- */
/* l'oggetto del contextBridge è immutabile: teniamo noi il registro delle view */
const shownViews = new Set();
function showSiteView(tabId, url, bounds) { shownViews.add(tabId); return D.showView(tabId, url, bounds); }

viewSite = function (t) {
  const list = sortDocs(docsDiTab(t.id));
  const T = totals(list);
  const w = t.watch;
  const vista = vistaDi(t);
  const browsing = vista === 'naviga';
  siteMode = browsing ? 'browse' : 'docs';
  document.body.classList.toggle('browsing', browsing);

  return `
  ${browsing ? '' : annoBarHTML(`${list.length} document${list.length === 1 ? 'o' : 'i'} · <b>${fmtEur(T.total)}</b>`)}
  <div class="sitehead">
    ${segmentiHTML(t)}
    <div class="spacer"></div>
    <span class="navstatus" id="navstatus"></span>
    <button class="sm" id="sEdit" title="Modifica sito">✎</button>
  </div>
  ${vista === 'tabella' ? tabellaHTML(t) : browsing ? `
  <div class="navbar noprint">
    <button class="sm ghost" id="nBack"  title="Indietro">‹</button>
    <button class="sm ghost" id="nFwd"   title="Avanti">›</button>
    <button class="sm ghost" id="nRel"   title="Ricarica">↻</button>
    <button class="sm ghost" id="nHome"  title="Pagina iniziale del sito">⌂</button>
    <input id="nUrl" spellcheck="false" value="${esc(t.url)}">
    <button class="sm ghost zm" id="nZoomOut" title="Riduci la pagina del sito (Ctrl+Shift+-)">A−</button>
    <button class="sm ghost zm" id="nZoomIn"  title="Ingrandisci la pagina del sito (Ctrl+Shift+=)">A+</button>
    <button class="sm ghost" id="nExt"   title="Apri in Brave/browser esterno">↗</button>
  </div>
  <div id="viewport" class="viewport"></div>
  <div class="browsefoot noprint">
    <span class="led ${t.lettura?.loginRichiesto ? 'err' : 'on'}"></span>
    <b>Sessione salvata</b> — il login resta attivo anche dopo la chiusura dell'app.
    <div class="spacer"></div>
    <button class="sm primary" id="lLeggi" title="Legge importi e scadenze dalla pagina aperta, senza scaricare file">🔎 Leggi questa pagina</button>
    <button class="sm" id="lScarica" title="Scarica i documenti presenti nella pagina e analizzali">⬇ Documenti</button>
    <button class="sm" id="lAuto">${t.lettura?.enabled ? '⏸ Auto ' + (t.lettura.minuti || 60) + ' min' : '▶ Auto'}</button>
    <button class="sm" id="bDlDir">📂 Download</button>
    <button class="sm danger" id="bLogout">Esci</button>
  </div>`
  : `
  <div class="panel">
    <div class="siteinfo">
      <div class="favi">${t.icon || '🌐'}</div>
      <div style="flex:1;min-width:220px">
        <h2 style="margin:0">${esc(t.name)}</h2>
        <span class="siteurl">${esc(t.url)}</span>
        ${t.note ? `<div class="hint" style="margin-top:4px">${esc(t.note)}</div>` : ''}
      </div>
    </div>
    <div class="hr"></div>
    ${letturaBarHTML(t)}
    <div class="watchbar noprint" style="margin-top:10px">
      <span class="led ${w?.enabled ? (w.error ? 'err' : 'on') : ''}"></span>
      ${w ? `<b>Cartella collegata:</b> ${esc(w.path || w.name)}
          <span style="color:var(--ink-2)">· ${w.error ? ('⚠ ' + esc(w.error)) : (w.lastScan ? ('ultimo controllo ' + new Date(w.lastScan).toLocaleTimeString('it-IT')) : 'in attesa…')}</span>
          <div class="spacer"></div>
          <button class="sm" id="wScan">↻ Controlla ora</button>
          <button class="sm" id="wToggle">${w.enabled ? '⏸ Pausa' : '▶ Riprendi'}</button>
          <button class="sm danger" id="wUnlink">Scollega</button>`
        : `<b>Sorveglianza cartella</b>
          <span style="color:var(--ink-2)">· utile se scarichi i documenti di questo portale con un altro browser.</span>
          <div class="spacer"></div>
          <button class="sm primary" id="wPick">📂 Collega cartella</button>`}
    </div>
    <div style="margin-top:12px">${dropzoneHTML(t.id)}</div>
  </div>
  ${docsPanel(t, list, T)}`}
  `;
};

bindSite = function (t) {
  const on = (id, fn) => { const e = $(id); if (e) e.onclick = fn; };
  bindSegmenti(t); bindAnno();           // Naviga | Tabella manuale | Documenti
  on('#sEdit',   () => siteDialog(t));

  if (vistaDi(t) === 'tabella') { D.hideViews(); bindTabella(t); return; }

  bindLettura(t);

  if (siteMode !== 'browse') {
    D.hideViews();
    on('#wPick',   () => pickFolderFor(t.id));
    on('#wScan',   () => { toast('Controllo in corso…'); scanFolder(t.id); });
    on('#wToggle', () => { t.watch.enabled = !t.watch.enabled; save(); refreshWatchers(); render(); });
    on('#wUnlink', () => unlinkFolder(t.id));
    on('#btnAggiorna', () => aggiornaTab(t.id));
    bindDropzone(t.id);
    bindRows();
    return;
  }

  const vp = $('#viewport');
  const push = () => {
    const r = vp.getBoundingClientRect();
    D.setBounds(t.id, { x: r.left, y: r.top, width: r.width, height: r.height });
  };
  showSiteView(t.id, t.url, (() => { const r = vp.getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height }; })());

  if (window.__ro) window.__ro.disconnect();
  window.__ro = new ResizeObserver(() => { cancelAnimationFrame(boundsRAF); boundsRAF = requestAnimationFrame(push); });
  window.__ro.observe(vp);
  window.__ro.observe(document.body);

  on('#nBack',  () => D.viewAct(t.id, 'back'));
  on('#nFwd',   () => D.viewAct(t.id, 'forward'));
  on('#nRel',   () => D.viewAct(t.id, 'reload'));
  on('#nHome',  () => D.viewAct(t.id, 'home', t.url));
  on('#nExt',   () => D.viewAct(t.id, 'external', t.url));
  on('#nZoomIn',  async () => D.zoomSet({ siteZoom: (await D.zoomGet()).siteZoom + 0.1 }));
  on('#nZoomOut', async () => D.zoomSet({ siteZoom: (await D.zoomGet()).siteZoom - 0.1 }));
  on('#bDlDir', async () => D.openFolder(await D.downloadDir(t.id)));
  on('#bLogout', () => modal('Uscire da tutti i portali?',
    '<p style="margin:0">Verranno cancellati cookie e sessioni salvate: al prossimo accesso dovrai rifare il login su ogni sito. I documenti già importati restano.</p>',
    [{ label: 'Annulla' }, { label: 'Esci da tutti', danger: true, fn: async () => { await D.clearSession(); toast('Sessioni cancellate'); render(); } }]));

  const url = $('#nUrl');
  url.onkeydown = e => {
    if (e.key !== 'Enter') return;
    let v = url.value.trim();
    if (v && !/^https?:\/\//i.test(v)) v = 'https://' + v;
    D.viewAct(t.id, 'load', v);
  };
};

D.onNav(({ tabId, url, canGoBack, canGoForward, loading }) => {
  if (currentTab() !== tabId || siteMode !== 'browse') return;
  const u = $('#nUrl'); if (u && document.activeElement !== u) u.value = url || '';
  const b = $('#nBack'), f = $('#nFwd'), r = $('#nRel');
  if (b) b.disabled = !canGoBack;
  if (f) f.disabled = !canGoForward;
  if (r) r.textContent = loading ? '×' : '↻';
});
D.onViewError(({ tabId, desc }) => setNavStatus('⚠ ' + desc, tabId));

function setNavStatus(msg, tabId) {
  if (tabId && currentTab() !== tabId) return;
  const el = $('#navstatus'); if (!el) return;
  el.textContent = msg;
  clearTimeout(el.__t);
  el.__t = setTimeout(() => { el.textContent = ''; }, 9000);
}

/* --------------------------------------------------------------------------
   3-bis. Lettura del portale SENZA scaricare documenti
   Le voci vengono lette dalla pagina già autenticata e trasformate in
   documenti "virtuali": hanno importo, data e stato, ma nessun file.
   -------------------------------------------------------------------------- */
const letture = new Map();   // tabId -> intervallo

const PAGATO_RE  = /\b(pagat[ao]|saldat[ao]|addebitat[ao]|incassat[ao]|riscoss[ao]|regolat[ao])\b/i;
const APERTO_RE  = /\b(da\s*pagare|non\s*pagat[ao]|in\s*scadenza|scadut[ao]|insolut[ao]|attesa\s*di\s*pagamento)\b/i;
const RUMORE_RE  = /\b(saldo\s*(del\s*)?conto|credito\s*residuo|totale\s*consumi|kwh|smc\b|lettura|autolettura|consumo\s*medio|risparmi)\b/i;

function numeroDocumento(testo) {
  const m = testo.match(/\b(?:n\.?|n°|numero|fattura|bolletta|documento)\s*[:#]?\s*([A-Z0-9][A-Z0-9\-\/_]{4,24})\b/i);
  return m ? m[1].toUpperCase() : '';
}

/** una riga della pagina -> voce di spesa, oppure null se non è una bolletta */
function rigaADocumento(row) {
  const testo = row.text;
  if (RUMORE_RE.test(testo) && !/bollett|fattur|import/i.test(testo)) return null;
  const amt = detectAmount(testo);
  if (!amt || amt.amount <= 0 || amt.confidence < 15) return null;
  const dts = detectDates(testo);
  const docDate = dts.docDate;
  if (!docDate) return null;
  return {
    amount: amt.amount,
    conf: amt.confidence,
    docDate,
    dueDate: dts.dueDate && dts.dueDate !== docDate ? dts.dueDate : null,
    numero: numeroDocumento(testo),
    stato: PAGATO_RE.test(testo) ? 'pagato' : (APERTO_RE.test(testo) ? 'da_pagare' : null),
    testo,
    href: row.href || null,
  };
}

/**
 * Legge il portale e aggiorna la rendicontazione.
 * @param {string} tabId
 * @param {{background?:boolean, silenzioso?:boolean}} opt
 */
async function leggiSito(tabId, opt = {}) {
  const t = tabById(tabId);
  if (!t || t.type !== 'site') return { nuovi: 0 };
  t.lettura = t.lettura || { enabled: false, minuti: 60 };

  // feedback immediato: la lettura può richiedere qualche secondo e i toast
  // finiscono dietro al browser incorporato, che è un livello sopra il DOM
  const btn = $('#lLeggi');
  if (btn && !opt.silenzioso) { btn.disabled = true; btn.dataset.old = btn.textContent; btn.textContent = '⏳ Lettura…'; }
  if (!opt.silenzioso) setNavStatus('⏳ Sto leggendo la pagina…', tabId);
  const ripristina = () => { if (btn) { btn.disabled = false; if (btn.dataset.old) btn.textContent = btn.dataset.old; } };

  let res;
  try {
    res = await D.webExtract(tabId, t.url, !!opt.background);
  } catch (e) {
    ripristina();
    t.lettura.errore = e.message; save();
    if (!opt.silenzioso) { setNavStatus('⚠ ' + e.message, tabId); render(); }
    return { errore: e.message };
  }
  ripristina();

  t.lettura.ultima = new Date().toISOString();
  delete t.lettura.errore;

  if (!res || res.loginRequired) {
    t.lettura.loginRichiesto = true;
    t.lettura.righe = 0;
    save();
    if (!opt.silenzioso) { toast('Sessione scaduta: rifai l\'accesso al portale', 'err'); render(); }
    else D.notify('Rendicontazione Business — ' + t.name, 'Sessione scaduta: serve un nuovo accesso al portale');
    return { loginRichiesto: true };
  }
  delete t.lettura.loginRichiesto;
  t.lettura.righe = res.rows.length;

  const esistenti = docsOf(tabId);
  let nuovi = 0, aggiornati = 0, riconosciute = 0;

  for (const row of res.rows) {
    const v = rigaADocumento(row);
    if (!v) continue;
    riconosciute++;
    const key = 'web|' + v.docDate + '|' + v.amount.toFixed(2) + '|' + v.numero;
    const gia = esistenti.find(d => d.key === key);

    if (gia) {
      // lo stato sul portale è la fonte più attendibile, ma non tocchiamo
      // ciò che l'utente ha corretto a mano
      if (v.stato && !gia.statoManuale && gia.status !== v.stato) { gia.status = v.stato; aggiornati++; }
      if (v.dueDate && !gia.dueDate) gia.dueDate = v.dueDate;
      continue;
    }

    const id = uid();
    const doc = {
      id, tabId, key,
      name: (v.numero ? 'Bolletta ' + v.numero : 'Bolletta ' + fmtDate(v.docDate)),
      path: 'Letto dal sito',
      size: 0, mime: '',
      addedAt: new Date().toISOString(),
      docDate: v.docDate, dueDate: v.dueDate, amount: v.amount,
      category: categoriaPer(tabId, t.name + ' ' + t.url + ' ' + v.testo),
      status: v.stato || 'da_pagare',
      note: '', textLen: v.testo.length,
      auto: { amount: true, conf: v.conf, snippet: v.testo.slice(0, 160) },
      virtuale: true, sourceUrl: v.href || res.url,
    };
    try { await DB.set('blobs', 'txt:' + id, v.testo); } catch (_) {}
    S.docs.push(doc);
    esistenti.push(doc);
    nuovi++;
  }

  t.lettura.nuovi = nuovi;
  t.lettura.diag = res.diag || {};
  t.lettura.docLinks = (res.docLinks || []).length;
  save();

  /* Ripiego automatico: scatta solo se la pagina non contiene NESSUNA riga
     riconoscibile — non basta "zero voci nuove", altrimenti a ogni rilettura
     di un portale già acquisito si scaricherebbero i PDF in doppione. */
  if (riconosciute === 0 && opt.scaricaSeVuoto !== false) {
    // i pulsanti «Apri» hanno la precedenza sui link: sono la via usata dai
    // portali che generano l'indirizzo del PDF solo al momento del clic
    if (res.apribili > 0) {
      const esito = await raccogliDocumenti(tabId, opt);
      return { nuovi: 0, aggiornati, righe: res.rows.length, scaricati: esito.scaricati, viaClic: true };
    }
    if ((res.docLinks || []).length) {
      const esito = await scaricaDocumenti(tabId, res.docLinks, opt);
      return { nuovi: 0, aggiornati, righe: res.rows.length, scaricati: esito.completati, viaDownload: true };
    }
  }

  if (!opt.silenzioso) {
    if (nuovi || aggiornati) {
      const msg = (nuovi ? nuovi + ' voci lette dal portale' : '') + (nuovi && aggiornati ? ' · ' : '') + (aggiornati ? aggiornati + ' aggiornate' : '');
      toast(msg, 'ok'); setNavStatus('✓ ' + msg, tabId);
    } else if (riconosciute) {
      const msg = riconosciute + ' voci già presenti, nessuna novità';
      toast(msg); setNavStatus('· ' + msg, tabId);
    } else {
      esitoVuotoDialog(t, res);
    }
    render();
  } else if (nuovi || aggiornati) {
    D.notify('Rendicontazione Business — ' + t.name, (nuovi ? nuovi + ' nuove bollette' : '') + (nuovi && aggiornati ? ' · ' : '') + (aggiornati ? aggiornati + ' aggiornate' : ''));
    render();
  }
  return { nuovi, aggiornati, righe: res.rows.length };
}

/** preme i pulsanti «Apri» e cattura i PDF che si aprono in finestra */
async function raccogliDocumenti(tabId, opt = {}) {
  const t = tabById(tabId);
  // il conteggio da riferire è quanti documenti sono davvero entrati in
  // rendicontazione: i percorsi sono tre (download, recupero da disco,
  // evento asincrono) e sommarli a mano darebbe numeri sbagliati
  const primaN = docsOf(tabId).length;
  if (!opt.silenzioso) setNavStatus('⬇ Nessun importo nella pagina: apro i documenti uno a uno…', tabId);
  let esito;
  try {
    esito = await D.webCollectDocs(tabId, { max: 15, skip: t.raccolti || [] });
  } catch (e) {
    if (!opt.silenzioso) { toast('Raccolta non riuscita: ' + e.message, 'err'); setNavStatus('⚠ ' + e.message, tabId); }
    return { scaricati: 0 };
  }
  if (esito.errore) {
    if (!opt.silenzioso) { toast(esito.errore, 'err'); setNavStatus('⚠ ' + esito.errore, tabId); }
    return { acquisiti: 0, scaricati: 0 };
  }
  await attendiImport();   // i documenti scaricati stanno ancora entrando

  /* Documenti già sul disco ma non più in rendicontazione: si reimportano dal
     file, senza riscaricarli. Capita dopo un ripristino o una cancellazione. */
  let recuperati = 0;
  for (const v of (esito.voci || [])) {
    if (v.stato !== 'gia-presente' || !v.filePath) continue;
    const nome = v.filePath.split(/[\\/]/).pop();
    if (docsOf(tabId).some(d => d.fullPath === v.filePath || d.path === 'Download/' + nome)) continue;
    const ab = await D.readFile(v.filePath, 64 * 1024 * 1024);
    if (!ab) continue;
    const added = await addDocuments(tabId, [{ name: nome, path: 'Download/' + nome, data: new Uint8Array(ab), lastModified: Date.now() }]);
    added.forEach(d => { d.fullPath = v.filePath; if (v.url) d.sourceUrl = v.url; });
    recuperati += added.length;
  }

  /* L'etichetta della riga ("Apri la bolletta Luce 1/05/2026 - 31/05/2026")
     è il dato più affidabile per datare e intitolare il documento: dentro al
     PDF le date sono molte e ambigue (delibere, periodi, scadenze). */
  for (const v of (esito.voci || [])) {
    if (!v.url && !v.filePath) continue;
    const d = S.docs.find(x => x.tabId === tabId && (x.sourceUrl === v.url || (v.filePath && x.fullPath === v.filePath)));
    if (!d) continue;
    const titolo = (v.etichetta || '').replace(/^\s*(apri|scarica|visualizza|vedi)\s+(la\s+|il\s+)?/i, '').trim();
    if (titolo) d.name = titolo.charAt(0).toUpperCase() + titolo.slice(1);
    const date = (v.etichetta || '').match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/g) || [];
    if (date.length) {
      const p = date[0].split(/[\/\-.]/).map(Number);
      const y = p[2] < 100 ? 2000 + p[2] : p[2];
      const iso = `${y}-${String(p[1]).padStart(2, '0')}-${String(p[0]).padStart(2, '0')}`;
      if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) d.docDate = iso;
    }
  }

  // ricorda quali voci sono state prese, così ai giri successivi si saltano
  const prese = (esito.voci || []).filter(v => v.stato === 'completed' || v.stato === 'gia-presente').map(v => v.etichetta);
  t.raccolti = [...new Set([...(t.raccolti || []), ...prese])].slice(-400);
  save();

  const n = Math.max(0, docsOf(tabId).length - primaN);
  const msg = n
    ? n + (n === 1 ? ' documento acquisito e analizzato' : ' documenti acquisiti e analizzati')
    : (esito.trovati ? 'Documenti già in rendicontazione' : 'Nessun documento apribile in questa pagina');
  if (!opt.silenzioso) { toast(msg, n ? 'ok' : ''); setNavStatus((n ? '✓ ' : '· ') + msg, tabId); }
  else if (n) D.notify('Rendicontazione Business — ' + t.name, msg);
  render();
  return { acquisiti: n, scaricati: esito.scaricati || 0, recuperati, trovati: esito.trovati || 0 };
}

/** scarica i documenti indicati e lascia che il normale import li analizzi */
async function scaricaDocumenti(tabId, docLinks, opt = {}) {
  const t = tabById(tabId);
  const gia = new Set(t.scaricati || []);
  const urls = docLinks.map(l => l.href).filter(h => !gia.has(h));
  if (!urls.length) {
    if (!opt.silenzioso) { toast('Documenti già scaricati in precedenza'); setNavStatus('· documenti già scaricati', tabId); }
    return { completati: 0 };
  }
  /* si chiede una volta sola per tutto il gruppo; la lettura automatica di
     sfondo (silenzioso) contabilizza, che è il suo scopo */
  const cosa = opt.silenzioso ? 'contabilizza' : await chiediCosaFarne(t.name, urls.length);
  if (!cosa) { setNavStatus('· scaricamento annullato', tabId); return { completati: 0 }; }
  sceltaScaricamento = cosa;

  if (!opt.silenzioso) setNavStatus('⬇ scarico ' + urls.length + ' documenti…', tabId);
  let esito = { avviati: 0, completati: 0 };
  try { esito = await D.webDownloadDocs(tabId, urls); }
  catch (e) { if (!opt.silenzioso) setNavStatus('⚠ ' + e.message, tabId); sceltaScaricamento = null; return { completati: 0 }; }
  await attendiImport();
  sceltaScaricamento = null;

  t.scaricati = [...gia, ...urls].slice(-300);
  save();
  const msg = esito.completati
    ? esito.completati + (cosa === 'contabilizza' ? ' documenti scaricati e analizzati' : ' documenti scaricati')
    : 'Nessun documento scaricabile trovato';
  if (!opt.silenzioso) { toast(msg, esito.completati ? 'ok' : 'err'); setNavStatus((esito.completati ? '✓ ' : '· ') + msg, tabId); }
  else if (esito.completati) D.notify('Rendicontazione Business — ' + t.name, msg);
  render();
  return esito;
}

/** spiega perché la lettura non ha prodotto voci e offre le alternative */
function esitoVuotoDialog(t, res) {
  const d = res.diag || {};
  const link = res.docLinks || [];
  modal('Nessun importo trovato in questa pagina', `
    <p style="margin:0 0 12px">Ho analizzato <b>${d.nodi || 0}</b> elementi della pagina
      <span class="tag">${esc((res.url || '').replace(/^https?:\/\//, '').slice(0, 70))}</span>.</p>
    <div class="tablewrap"><table><tbody>
      <tr><td>Elementi con una data</td><td class="num">${d.conData || 0}</td></tr>
      <tr><td>Elementi con un importo in €</td><td class="num">${d.conImporto || 0}</td></tr>
      <tr><td>Elementi con data <b>e</b> importo (righe candidate)</td><td class="num">${d.entrambi || 0}</td></tr>
      <tr><td>Link a documenti scaricabili</td><td class="num">${link.length}</td></tr>
      <tr><td>Pulsanti che aprono un documento</td><td class="num">${res.apribili || 0}</td></tr>
    </tbody></table></div>
    <div class="hint" style="margin-top:12px">
      ${d.conImporto ? '' : 'La pagina non espone importi come testo: spesso i valori sono dentro il PDF, in un\'immagine o in un grafico.<br>'}
      ${res.apribili ? `Ho però trovato <b>${res.apribili}</b> pulsanti che aprono un documento: posso premerli uno a uno e catturare i PDF.`
        : link.length ? `Ho però trovato <b>${link.length}</b> documenti scaricabili: posso prenderli e leggerne il contenuto.`
                    : 'Prova a spostarti sulla sezione che elenca le bollette e premi di nuovo, oppure scarica un documento a mano: verrà importato da solo.'}
    </div>
    ${link.length && !res.apribili ? `<div class="hint" style="margin-top:8px">Esempi: ${link.slice(0, 3).map(l => esc((l.label || l.href).slice(0, 46))).join(' · ')}</div>` : ''}
  `, res.apribili
      ? [{ label: 'Chiudi' }, { label: `⬇ Apri e acquisisci ${res.apribili} documenti`, primary: true, fn: () => raccogliDocumenti(t.id) }]
      : link.length
      ? [{ label: 'Chiudi' }, { label: `⬇ Scarica ${link.length} documenti`, primary: true, fn: () => scaricaDocumenti(t.id, link) }]
      : [{ label: 'Chiudi' }]);
}

function avviaLettura(tabId) {
  fermaLettura(tabId);
  const t = tabById(tabId);
  if (!t?.lettura?.enabled) return;
  const min = clamp(+t.lettura.minuti || 60, 5, 1440);
  letture.set(tabId, setInterval(() => {
    if (tabById(tabId)?.lettura?.enabled) leggiSito(tabId, { background: true, silenzioso: true });
  }, min * 60 * 1000));
}
function fermaLettura(tabId) {
  if (letture.has(tabId)) { clearInterval(letture.get(tabId)); letture.delete(tabId); }
}

/** riquadro comune alle due modalità del tab sito */
function letturaBarHTML(t) {
  const l = t.lettura || {};
  const stato = l.loginRichiesto ? 'err' : (l.enabled ? 'on' : '');
  const quando = l.ultima ? new Date(l.ultima).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : null;
  return `<div class="watchbar noprint">
    <span class="led ${stato}"></span>
    <b>Lettura senza download</b>
    <span style="color:var(--ink-2)">${
      l.loginRichiesto ? '· ⚠ sessione scaduta, rifai l\'accesso'
      : quando ? `· ultima ${esc(quando)}${l.righe != null ? ` · ${l.righe} righe analizzate` : ''}`
      : '· legge importi e scadenze direttamente dalla pagina, senza salvare file'}</span>
    <div class="spacer"></div>
    <button class="sm primary" id="lLeggi">🔎 Leggi ora</button>
    <button class="sm" id="lScarica" title="Scarica i documenti presenti nella pagina e analizzali">⬇ Scarica documenti</button>
    <button class="sm" id="lAuto">${l.enabled ? '⏸ Auto attiva (' + (l.minuti || 60) + ' min)' : '▶ Attiva automatico'}</button>
    ${l.enabled ? `<select class="sm" id="lMin" title="Ogni quanto controllare">
      ${[15, 30, 60, 180, 360, 720, 1440].map(m => `<option value="${m}" ${(l.minuti || 60) === m ? 'selected' : ''}>${m < 60 ? m + ' min' : (m / 60) + ' h'}</option>`).join('')}
    </select>` : ''}
  </div>`;
}

/** cerca i documenti nella pagina aperta e li scarica, senza passare dalla lettura */
async function scaricaDaSito(tabId) {
  const t = tabById(tabId);
  const btn = $('#lScarica');
  if (btn) { btn.disabled = true; btn.dataset.old = btn.textContent; btn.textContent = '⏳ Cerco…'; }
  setNavStatus('⏳ Cerco documenti nella pagina…', tabId);
  let res = null;
  try { res = await D.webExtract(tabId, t.url, false); } catch (e) { setNavStatus('⚠ ' + e.message, tabId); }
  if (btn) { btn.disabled = false; if (btn.dataset.old) btn.textContent = btn.dataset.old; }
  if (!res) return;
  if (res.loginRequired) { toast('Sessione scaduta: rifai l\'accesso', 'err'); setNavStatus('⚠ sessione scaduta', tabId); return; }
  if (res.apribili > 0) { await raccogliDocumenti(tabId); return; }
  if (!res.docLinks?.length) {
    setNavStatus('· nessun documento scaricabile in questa pagina', tabId);
    esitoVuotoDialog(t, res);
    return;
  }
  await scaricaDocumenti(tabId, res.docLinks);
}

function bindLettura(t) {
  const on = (id, fn) => { const e = $(id); if (e) e.onclick = fn; };
  on('#lLeggi', () => leggiSito(t.id));
  on('#lScarica', () => scaricaDaSito(t.id));
  on('#lAuto', () => {
    t.lettura = t.lettura || { minuti: 60 };
    t.lettura.enabled = !t.lettura.enabled;
    save(); avviaLettura(t.id); render();
    if (t.lettura.enabled) { toast('Aggiornamento automatico attivo', 'ok'); leggiSito(t.id, { background: true, silenzioso: true }); }
  });
  const sel = $('#lMin');
  if (sel) sel.onchange = e => { t.lettura.minuti = +e.target.value; save(); avviaLettura(t.id); render(); };
}

/* --------------------------------------------------------------------------
   3-ter. Progetti: Nuovo / Carica / Salva / Salva come
   Il file di progetto è autosufficiente: contiene tab, spese, impostazioni e —
   quando la dimensione lo consente — anche i documenti allegati, così può
   essere spostato su un altro computer senza perdere nulla.
   -------------------------------------------------------------------------- */
const LIMITE_ALLEGATI = 80 * 1024 * 1024;   // oltre, il progetto salva solo i dati
let progettoPath = null;
let modificato = false;

/* ogni salvataggio dello stato segna il progetto come da salvare */
const _save = save;
save = function () { segnaModificato(true); return _save(); };

/* Nessun rinvio: la guardia sul cambio di valore fa già in modo che l'avviso
   parta una sola volta per transizione, e un rinvio qui lasciava il titolo
   della finestra disallineato rispetto allo stato reale. */
function segnaModificato(v) {
  if (modificato === v) return;
  modificato = v;
  D.progettoStato({ modificato: v }).catch(() => {});
}

function b64daBytes(u8) {
  let s = '';
  const passo = 0x8000;
  for (let i = 0; i < u8.length; i += passo) s += String.fromCharCode.apply(null, u8.subarray(i, i + passo));
  return btoa(s);
}
function bytesDaB64(b64) {
  const s = atob(b64);
  const u8 = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
  return u8;
}

async function costruisciProgetto() {
  const pesoTotale = S.docs.reduce((a, d) => a + (d.size || 0), 0);
  const conAllegati = pesoTotale <= LIMITE_ALLEGATI;
  const allegati = {}, testi = {};
  if (conAllegati) {
    for (const d of S.docs) {
      try {
        const b = await DB.get('blobs', d.id);
        if (b) allegati[d.id] = { mime: b.type || d.mime || '', dati: b64daBytes(new Uint8Array(await b.arrayBuffer())) };
        const t = await DB.get('blobs', 'txt:' + d.id);
        if (t) testi[d.id] = t;
      } catch (_) {}
    }
  }
  return {
    app: 'rendiconto-business', versione: 1,
    salvatoIl: new Date().toISOString(),
    conAllegati, pesoAllegati: pesoTotale,
    stato: JSON.parse(JSON.stringify(S)),
    allegati, testi,
  };
}

async function applicaProgetto(obj) {
  if (!obj || !['rendiconto-business','rendiconto'].includes(obj.app) || !obj.stato?.tabs) throw new Error('Non è un progetto di rendicontazione');
  // via le watch e le view del progetto precedente
  watchers.forEach(v => clearInterval(v)); watchers.clear();
  letture.forEach(v => clearInterval(v)); letture.clear();
  for (const id of [...shownViews]) { D.destroyView(id); shownViews.delete(id); }
  await DB.clear('blobs').catch(() => {});

  S = Object.assign(DEFAULT_STATE(), obj.stato);
  S.settings = Object.assign(DEFAULT_STATE().settings, obj.stato.settings || {});
  S.settings.filter = Object.assign(DEFAULT_STATE().settings.filter, obj.stato.settings?.filter || {});
  S.settings.quick = Object.assign(DEFAULT_STATE().settings.quick, obj.stato.settings?.quick || {});

  for (const [id, a] of Object.entries(obj.allegati || {})) {
    try { await DB.set('blobs', id, new Blob([bytesDaB64(a.dati)], { type: a.mime || '' })); } catch (_) {}
  }
  for (const [id, t] of Object.entries(obj.testi || {})) {
    try { await DB.set('blobs', 'txt:' + id, t); } catch (_) {}
  }
  document.documentElement.dataset.theme = S.settings.theme || 'light';
  _save();
  refreshWatchers();
  for (const t of S.tabs) if (t.lettura?.enabled) avviaLettura(t.id);
  render();
  if (obj.conAllegati === false) {
    toast('Progetto caricato senza i documenti allegati: erano troppo voluminosi al momento del salvataggio', 'err');
  }
}

/** true se si può procedere (nessuna modifica in sospeso, o l'utente ha deciso) */
async function confermaAbbandono(azione) {
  if (!modificato) return true;
  const r = await D.progettoConferma(
    'Ci sono modifiche non salvate',
    `Vuoi salvare il progetto prima di ${azione}?`,
    ['Salva', 'Non salvare', 'Annulla']);
  if (r === 2) return false;
  if (r === 0) return await salvaProgetto();
  return true;
}

async function nuovoProgetto() {
  if (!(await confermaAbbandono('creare un nuovo progetto'))) return;
  watchers.forEach(v => clearInterval(v)); watchers.clear();
  letture.forEach(v => clearInterval(v)); letture.clear();
  for (const id of [...shownViews]) { D.destroyView(id); shownViews.delete(id); }
  await DB.clear('blobs').catch(() => {});
  await DB.clear('handles').catch(() => {});
  const tema = S.settings.theme;
  S = DEFAULT_STATE();
  S.settings.theme = tema;
  _save();
  progettoPath = null;
  await D.progettoStato({ filePath: null, modificato: false });
  modificato = false;
  render();
  toast('Nuovo progetto', 'ok');
}

async function caricaProgetto(percorso) {
  if (!percorso) {
    if (!(await confermaAbbandono('caricare un altro progetto'))) return;
    percorso = await D.progettoScegliApri();
    if (!percorso) return;
  }
  try {
    const { testo } = await D.progettoLeggi(percorso);
    await applicaProgetto(JSON.parse(testo));
    progettoPath = percorso;
    modificato = false;
    await D.progettoStato({ filePath: percorso, modificato: false });
    toast('Progetto caricato: ' + percorso.split(/[\\/]/).pop(), 'ok');
  } catch (e) {
    toast('Caricamento non riuscito: ' + e.message, 'err');
  }
}

async function salvaProgetto() {
  if (!progettoPath) return salvaProgettoCome();
  return scriviProgetto(progettoPath);
}

async function salvaProgettoCome() {
  const suggerito = progettoPath ? null : ('Rendicontazione Business ' + todayISO());
  const percorso = await D.progettoScegliSalva(suggerito);
  if (!percorso) return false;
  return scriviProgetto(percorso);
}

async function scriviProgetto(percorso) {
  try {
    toast('Salvataggio in corso…');
    const p = await costruisciProgetto();
    const r = await D.progettoScrivi(percorso, JSON.stringify(p));
    progettoPath = r.filePath;
    modificato = false;
    const kb = Math.round(r.byte / 1024);
    toast('Salvato: ' + r.filePath.split(/[\\/]/).pop() + ' (' + (kb > 1024 ? (kb / 1024).toFixed(1) + ' MB' : kb + ' KB') + ')'
      + (p.conAllegati ? '' : ' — allegati esclusi, troppo voluminosi'), 'ok');
    return true;
  } catch (e) {
    toast('Salvataggio non riuscito: ' + e.message, 'err');
    return false;
  }
}

D.onMenu(azione => {
  if (azione === 'nuovo') nuovoProgetto();
  else if (azione === 'carica') caricaProgetto();
  else if (azione === 'salva') salvaProgetto();
  else if (azione === 'salvaCome') salvaProgettoCome();
});

/* Il pulsante «Aggiorna» della sezione Automatica: sui tab sito interroga anche
   il portale, poi lascia fare al resto (cartella collegata e riletture). */
const _aggiornaTab = aggiornaTab;
aggiornaTab = async function (tabId) {
  const t = tabById(tabId);
  const b = $('#btnAggiorna');
  if (b) { b.disabled = true; b.dataset.old = b.textContent; b.textContent = '⏳ Aggiorno…'; }
  if (t && t.type === 'site') {
    try { await leggiSito(tabId, { background: true, silenzioso: true }); } catch (_) {}
  }
  if (b) { b.disabled = false; if (b.dataset.old) b.textContent = b.dataset.old; }
  return _aggiornaTab(tabId);
};

/* --------------------------------------------------------------------------
   3-quater. Cartella dei documenti scaricati
   Sta accanto all'applicazione, non sepolta in AppData: si trova senza cercare
   e ogni tab ha la sua sottocartella con il proprio nome.
   -------------------------------------------------------------------------- */
/** tiene allineati i nomi delle cartelle a quelli dei tab */
function sincronizzaNomiCartelle() {
  const nomi = {};
  for (const t of S.tabs) if (t.type !== 'summary') nomi[t.id] = t.name;
  // insieme ai nomi passa l'anno di lavoro: i documenti scaricati vanno nella sua cartella
  if (Object.keys(nomi).length) D.docsNomiTab(nomi, annoAttivo()).catch(() => {});
}

/** dopo uno spostamento i percorsi memorizzati vanno corretti */
function aggiornaPercorsi(mosse) {
  if (!mosse || !mosse.length) return 0;
  const mappa = new Map(mosse.map(m => [m.da, m.a]));
  let n = 0;
  for (const d of S.docs) {
    if (d.fullPath && mappa.has(d.fullPath)) { d.fullPath = mappa.get(d.fullPath); n++; }
  }
  if (n) save();
  return n;
}

/* Applica la nuova cartella. Un solo punto, usato sia dal percorso scritto a
   mano sia da quello scelto con «Sfoglia…»: il risultato dev'essere identico. */
async function applicaCartellaDocumenti(percorso) {
  const esito = await D.docsImpostaRoot(percorso);
  if (!esito) { modal('Spostamento non riuscito', '<p style="margin:0">nessuna risposta dal programma</p>'); return false; }
  if (esito.errore) {
    modal('Spostamento non riuscito', `<p style="margin:0 0 10px">${esc(esito.errore)}</p>
      <p class="riga-scontro">${esc(percorso)}</p>`);
    return false;
  }
  if (esito.uguale) { toast('È già la cartella attuale: non ho spostato niente'); return true; }
  const n = aggiornaPercorsi(esito.mosse);
  toast('Documenti ora in ' + esito.root + (n ? ` · ${n} percorsi aggiornati` : ''), 'ok');
  render();
  return true;
}

/* Resta per compatibilità con i collaudi e con eventuali richiami: sceglie con
   la finestra di sistema e applica subito. */
async function cambiaCartellaDocumenti(scelta) {
  const s = scelta || await D.docsScegliRoot();
  if (!s) return;
  return applicaCartellaDocumenti(s.percorso);
}

/* --------------------------------------------------------------------------
   I file spariti dal disco — tipicamente dopo una reinstallazione, che si
   porta via la cartella dei documenti quando questa sta dentro il percorso di
   installazione. L'app conserva comunque una copia di ogni documento nel suo
   archivio: da lì si possono rimettere al loro posto.
   -------------------------------------------------------------------------- */
async function documentiMancanti() {
  const out = [];
  for (const t of S.tabs.filter(x => x.type !== 'summary')) {
    const docs = docsOf(t.id).filter(d => d.file && d.file.nome);
    if (!docs.length) continue;
    let files = [];
    try { files = (await D.scanFolder(await D.downloadDir(t.id))) || []; } catch (_) {}
    const presenti = new Set(files.map(f => String(f.name).toLowerCase()));
    for (const d of docs) if (!presenti.has(String(d.file.nome).toLowerCase())) out.push(d);
  }
  return out;
}

async function ripristinaDaArchivio() {
  const mancanti = await documentiMancanti();
  if (!mancanti.length) { toast('Tutti i documenti sono già al loro posto', 'ok'); return 0; }
  let fatti = 0, senzaCopia = 0;
  for (const d of mancanti) {
    const b = await DB.get('blobs', d.id).catch(() => null);
    if (!b) { senzaCopia++; continue; }
    const dati = new Uint8Array(await b.arrayBuffer());
    // rimesso sul disco nell'annualità che gli compete, che è quella della sua scadenza
    const r = await D.docsScriviFile(d.tabId, d.file.nome, dati, annoDi(d));
    if (r && r.path) { d.fullPath = r.path; fatti++; }
  }
  if (fatti) save();
  render();
  toast(fatti
    ? `${fatti} documenti rimessi sul disco${senzaCopia ? ` · ${senzaCopia} senza copia in archivio` : ''}`
    : 'Nessun documento ripristinabile: manca la copia in archivio', fatti ? 'ok' : 'err');
  return fatti;
}

/* all'avvio si conta soltanto, senza toccare nulla: decide l'utente */
async function avvisaFileMancanti() {
  const mancanti = await documentiMancanti();
  if (!mancanti.length) return;
  toast(`${mancanti.length} document${mancanti.length === 1 ? 'o non è' : 'i non sono'} più nella cartella sul disco `
      + '— si possono ripristinare da 📂 Cartella documenti', 'err');
}

async function cartellaDocumentiDialog() {
  const info = await D.docsRoot();
  const mancanti = await documentiMancanti();
  modal('Dove finiscono i documenti scaricati', `
    ${mancanti.length ? `<div class="avviso-mancanti">
      <b>${mancanti.length} document${mancanti.length === 1 ? 'o' : 'i'} non ${mancanti.length === 1 ? 'è' : 'sono'} più in questa cartella.</b>
      Succede reinstallando l'app, se i documenti stanno nel percorso di installazione.
      L'app ne conserva comunque una copia nel suo archivio: puoi rimetterli al loro posto.
    </div>` : ''}
    <label class="fld">Cartella dei documenti
      <input id="docsPercorso" value="${esc(info.root)}" spellcheck="false"
             style="font-family:ui-monospace,Consolas,monospace;font-size:12.5px"></label>
    <div class="hint" style="margin-top:8px">
      Puoi <b>scriverlo o incollarlo</b> qui e premere «Sposta qui», oppure usare
      «Sfoglia…». Scrivendolo a mano finisce esattamente il percorso che vedi:
      la finestra di Windows a volte restituisce la cartella superiore.
    </div>
    <div class="hint" style="margin-top:12px">
      Dentro c'è una sottocartella per ogni tab, con il suo nome: le fatture di
      «Octopus Energy» stanno in <code>Octopus Energy</code>. Rinominando un tab,
      la cartella lo segue.
      ${info.scrivibile ? '' : '<br><b>Attenzione:</b> la cartella attuale non risulta scrivibile.'}
    </div>
    <div class="hint" style="margin-top:10px">
      Di norma è <code>${esc(info.accantoApp)}</code>, cioè accanto al programma.
      Se aggiorni l'app reinstallandola, sposta prima questa cartella altrove
      oppure scegline una fuori dalla cartella di installazione.
    </div>
  `, [{ label: 'Chiudi' },
      { label: '📂 Apri', fn: () => { D.openFolder(info.root); return false; } },
      ...(mancanti.length ? [{ label: `↺ Ripristina ${mancanti.length} file`, fn: () => ripristinaDaArchivio() }] : []),
      { label: 'Sfoglia…', fn: () => sfogliaCartellaDocumenti() },
      { label: 'Sposta qui', primary: true, fn: () => spostaInPercorsoScritto() }]);
}

/** applica il percorso scritto a mano nel campo della finestra */
async function spostaInPercorsoScritto() {
  const campo = $('#docsPercorso');
  const percorso = (campo?.value || '').trim();
  if (!percorso) { toast('Scrivi un percorso', 'err'); return false; }
  const info = await D.docsRoot();
  if (percorso.toLowerCase() === String(info.root).toLowerCase()) {
    toast('È già la cartella attuale: non ho spostato niente');
    return;
  }
  /* false tiene aperta la finestra: se qualcosa non va, il messaggio d'errore
     deve restare a schermo. Restituendo altro il gestore dei pulsanti chiude
     tutto e l'utente non vede niente — sembra che il pulsante non funzioni. */
  return (await applicaCartellaDocumenti(percorso)) ? undefined : false;
}

/** apre il selettore di Windows e riporta la scelta nel campo, senza applicarla */
async function sfogliaCartellaDocumenti() {
  const s = await D.docsScegliRoot();
  if (!s) return false;
  const campo = $('#docsPercorso');
  if (campo) { campo.value = s.percorso; campo.focus(); }
  toast('Controlla il percorso e premi «Sposta qui»');
  return false;                       // la finestra resta aperta
}

/* --------------------------------------------------------------------------
   4. Adattamento allo schermo
   -------------------------------------------------------------------------- */
/* dopo un cambio di zoom i pixel CSS cambiano valore: la view va riposizionata
   solo quando il layout si è assestato, altrimenti resta sfalsata */
function repositionView() {
  const t = tabById(currentTab());
  if (!t || t.type !== 'site' || siteMode !== 'browse') return;
  const vp = $('#viewport'); if (!vp) return;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const r = vp.getBoundingClientRect();
    D.setBounds(t.id, { x: r.left, y: r.top, width: r.width, height: r.height });
  }));
}
D.onZoom(() => repositionView());
window.addEventListener('resize', repositionView);

async function zoomDialog() {
  const z = await D.zoomGet();
  const pct = v => Math.round(v * 100) + '%';
  const opts = [0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];
  modal('Dimensione dell\'interfaccia', `
    <div class="hint" style="margin:0 0 14px">
      Schermo rilevato: <b>${esc(z.schermo.fisico)}</b> pixel reali
      · <b>${esc(z.schermo.logico)}</b> punti utilizzabili
      · scala di Windows <b>${pct(z.schermo.scala)}</b>.<br>
      Valore consigliato per questo schermo: <b>${pct(z.auto)}</b>.
    </div>
    <label class="fld">Interfaccia dell'app
      <select id="zUi">
        <option value="auto" ${z.zoomMode === 'auto' ? 'selected' : ''}>Automatica (${pct(z.auto)}) — si adatta da sola cambiando monitor</option>
        ${opts.map(v => `<option value="${v}" ${z.zoomMode !== 'auto' && Math.abs(v - z.uiZoom) < 0.02 ? 'selected' : ''}>${pct(v)}</option>`).join('')}
      </select></label>
    <label class="fld" style="margin-top:12px">Pagine dei portali
      <select id="zSite">
        ${opts.map(v => `<option value="${v}" ${Math.abs(v - z.siteZoom) < 0.02 ? 'selected' : ''}>${pct(v)}</option>`).join('')}
      </select></label>
    <div class="hint" style="margin-top:12px">
      Scorciatoie: <b>Ctrl +</b> / <b>Ctrl −</b> / <b>Ctrl 0</b> per l'interfaccia,
      le stesse con <b>Maiusc</b> per la pagina del sito.
      La scelta viene ricordata insieme a posizione e dimensione della finestra.
    </div>
  `, [{ label: 'Chiudi' }], () => {
    $('#zUi').onchange = e => {
      const v = e.target.value;
      D.zoomSet(v === 'auto' ? { mode: 'auto' } : { uiZoom: parseFloat(v) });
    };
    $('#zSite').onchange = e => D.zoomSet({ siteZoom: parseFloat(e.target.value) });
  });
}

/* pulsante nell'intestazione */
(() => {
  const b = document.createElement('button');
  b.className = 'ghost'; b.id = 'btnZoom'; b.textContent = '⤢';
  b.title = 'Dimensione interfaccia (adatta lo schermo, 4K compresi)';
  b.onclick = zoomDialog;
  $('#btnSettings').before(b);
})();

/* --------------------------------------------------------------------------
   5. Ritocchi
   -------------------------------------------------------------------------- */
// le finestre modali sono DOM: vanno sopra la view solo se questa è nascosta
const _modalObs = new MutationObserver(() => {
  const hidden = $('#overlay').hidden;
  if (!hidden) D.hideViews();
  else if (currentTab() && tabById(currentTab())?.type === 'site' && siteMode === 'browse') render();
});
_modalObs.observe($('#overlay'), { attributes: true, attributeFilter: ['hidden'] });

// apertura documenti: file dal disco, voci lette dal sito -> pagina d'origine
const _openDoc = openDoc;
openDoc = async function (d) {
  if (d.virtuale) {
    const t = tabById(d.tabId);
    if (!t) { toast('Tab di origine non più presente', 'err'); return; }
    S.active = d.tabId; t.vista = 'naviga'; save(); render();
    setTimeout(() => D.viewAct(d.tabId, 'load', d.sourceUrl || t.url), 400);
    return;
  }
  if (d.fullPath) {
    if (!(await D.openFile(d.fullPath))) return;      // stringa vuota = aperto
    // il file non c'è più dov'era: può essersi spostata la cartella
    if (await riallineaPercorsi(d.tabId)) {
      const agg = S.docs.find(x => x.id === d.id);
      if (agg && agg.fullPath && agg.fullPath !== d.fullPath && !(await D.openFile(agg.fullPath))) {
        toast('La cartella dei documenti si era spostata: percorsi aggiornati', 'ok');
        return;
      }
    }
  }
  return _openDoc(d);
};

/* Rimette in riga i percorsi di un tab quando la cartella dei documenti è stata
   spostata o rinominata da fuori: i file si ritrovano per nome nella cartella
   attuale del tab. Senza questo si ripiegherebbe sulla copia in archivio, che
   apre ma non è il file sul disco. */
async function riallineaPercorsi(tabId) {
  let dir = null, files = null;
  try { dir = await D.downloadDir(tabId); } catch (_) {}
  if (!dir) return 0;
  try { files = await D.scanFolder(dir); } catch (_) {}
  if (!files || !files.length) return 0;

  const perNome = new Map();
  for (const f of files) perNome.set(String(f.name).toLowerCase(), f.fullPath);

  let n = 0;
  for (const d of docsOf(tabId)) {
    if (!d.fullPath) continue;
    const nuovo = perNome.get(d.fullPath.split(/[\\/]/).pop().toLowerCase());
    if (nuovo && nuovo !== d.fullPath) { d.fullPath = nuovo; n++; }
  }
  if (n) save();
  return n;
}

// se cambio lo stato a mano, la lettura automatica non deve sovrascriverlo
const _bindRows = bindRows;
bindRows = function () {
  _bindRows();
  $$('#view tbody tr[data-id] select[data-f="status"]').forEach(sel => {
    sel.addEventListener('change', () => {
      const d = S.docs.find(x => x.id === sel.closest('tr').dataset.id);
      if (d && d.virtuale) { d.statoManuale = true; save(); }
    });
  });
};

const _render = render;
render = function () {
  for (const id of [...shownViews]) {
    if (!tabById(id)) { D.destroyView(id); shownViews.delete(id); }
  }
  sincronizzaNomiCartelle();
  const t = tabById(currentTab());
  if (!t || t.type !== 'site') { document.body.classList.remove('browsing'); D.hideViews(); }
  _render();
};

/* --------------------------------------------------------------------------
   6. Avvio
   -------------------------------------------------------------------------- */
(async () => {
  await window.__init();
  for (const t of S.tabs) {
    if (t.watch?.path && t.watch.enabled) D.watchFolder(t.id, t.watch.path);
    if (t.lettura?.enabled) {
      avviaLettura(t.id);
      // un primo controllo poco dopo l'avvio, senza bloccare l'interfaccia.
      // Si ricontrolla l'impostazione: nel frattempo può essere stata spenta.
      setTimeout(() => {
        if (tabById(t.id)?.lettura?.enabled) leggiSito(t.id, { background: true, silenzioso: true });
      }, 8000);
    }
  }
  // all'avvio non c'è nulla di «non salvato»: il ripristino dall'archivio
  // locale non è una modifica del progetto
  modificato = false;
  await D.progettoStato({ modificato: false });

  const i = await D.info();
  console.log('Rendicontazione Business desktop', i.version, '· Electron', i.electron, '· Chromium', i.chrome);
  console.log('documenti scaricati in', i.downloadRoot);

  // documenti portati via dalla vecchia cartella nascosta: si aggiornano i percorsi
  const n = aggiornaPercorsi(i.migrazione);
  if (n) toast(n + ' documenti spostati nella nuova cartella accanto all\'app', 'ok');

  // pulsante nell'intestazione per raggiungerla al volo
  const b = document.createElement('button');
  b.className = 'ghost'; b.id = 'btnDocs'; b.textContent = '📂';
  b.title = 'Cartella dei documenti scaricati';
  b.onclick = cartellaDocumentiDialog;
  $('#btnZoom').before(b);

  /* Dopo una reinstallazione la cartella dei documenti può essere sparita:
     l'app non se ne accorgerebbe finché non provi ad aprire un file. */
  setTimeout(() => avvisaFileMancanti().catch(() => {}), 1500);
})();
