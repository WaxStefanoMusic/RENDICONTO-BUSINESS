'use strict';
/* ==========================================================================
   Gestionale Contabile & Fiscale SNC — logica dell'interfaccia

   Tutto quello che riguarda la società (ragione sociale, soci, quote, costo
   del commercialista, aliquote) sta nelle IMPOSTAZIONI salvate su questo
   computer: il codice contiene solo valori generici di partenza.

   I dati si salvano in un file nella cartella dell'app (versione desktop) o,
   aprendo la pagina in un browser, nella memoria locale del browser.
   ========================================================================== */

const $ = (id) => document.getElementById(id);
const DESKTOP = !!window.gestionale;

// ---------------------------------------------------------------------------
// Regole fiscali degli acquisti
// ---------------------------------------------------------------------------
const CATEGORIE_SPESA = {
  merce_100_100:    { label: 'Merce / mobili da rivendere, affitto, utenze, cancelleria', ivaDetPct: 1.0, costoDedPct: 1.0,  badge: 'IVA 100% | Costo 100%' },
  furgone_100_100:  { label: 'Furgone commerciale N1 / trasporto mobili & carburante',    ivaDetPct: 1.0, costoDedPct: 1.0,  badge: 'IVA 100% | Costo 100%' },
  caffe_0_75:       { label: 'Capsule caffè / acqua / bar / somministrazione ufficio',    ivaDetPct: 0.0, costoDedPct: 0.75, badge: 'IVA 0% (va a costo) | Costo 75%' },
  omaggi_0_100:     { label: 'Omaggi / ospitalità clienti / rappresentanza',              ivaDetPct: 0.0, costoDedPct: 1.0,  badge: 'IVA 0% | Costo 100% (entro 1,5% ricavi)' },
  tel_mob_50_80:    { label: 'Telefonia mobile aziendale',                                ivaDetPct: 0.5, costoDedPct: 0.8,  badge: 'IVA 50% | Costo 80%' },
  tel_fisso_100_80: { label: 'Telefonia fissa & internet negozio',                        ivaDetPct: 1.0, costoDedPct: 0.8,  badge: 'IVA 100% | Costo 80%' },
  auto_40_20:       { label: 'Auto promiscua soci & carburante / manutenzione',           ivaDetPct: 0.4, costoDedPct: 0.2,  badge: 'IVA 40% | Costo 20%' },
  esente_0_100:     { label: 'Spese bancarie / assicurazioni / esenti art. 10',           ivaDetPct: 0.0, costoDedPct: 1.0,  badge: 'Esente IVA | Costo 100%' },
};

// ---------------------------------------------------------------------------
// Impostazioni di partenza: generiche, da personalizzare al primo avvio
// ---------------------------------------------------------------------------
const IMPOSTAZIONI_BASE = () => ({
  configurate: false,
  ragione: 'La mia S.N.C.',
  attivita: 'Vendita al dettaglio • 2 soci + collaboratore familiare',
  s1Nome: 'Socio 1',
  s1Quota: 50,
  s2Nome: 'Socio 2',
  collabNome: 'Collaboratore familiare',
  commLordo: 0,
  commImp: 0,
  commSw: 100,
  irpef1: 23, irpef2: 35, irpef3: 43,
  addiz: 2.2,
  irap: 3.9, irapDed: 8000,
  inpsMin: 18555, inpsFisso: 4515, inpsAliq: 24.48,
});

const STATO_VUOTO = () => ({
  v: 2,
  isDemo: false,
  anno: new Date().getFullYear(),
  creditoIvaPrec: {},          // anno -> credito IVA dell'anno precedente
  socio2Inps: true,
  collabInps: false,
  impostazioni: IMPOSTAZIONI_BASE(),
  entrate: [],
  acquisti: [],
});

// Esempio dimostrativo: nomi inventati, date nell'anno scelto
function datiEsempio(anno) {
  const d = (md) => `${anno}-${md}`;
  return {
    entrate: [
      { id: 1, data: d('01-31'), tipo: 'Corrispettivi', desc: 'Corrispettivi negozio gennaio', regime: 'IT_22', totale: 14640 },
      { id: 2, data: d('02-18'), tipo: 'Fattura', desc: 'Fatt. n. 1 - Arredo soggiorno cliente Rossi', regime: 'IT_22', totale: 6100 },
      { id: 3, data: d('02-28'), tipo: 'Corrispettivi', desc: 'Corrispettivi negozio febbraio', regime: 'IT_22', totale: 15860 },
      { id: 4, data: d('03-14'), tipo: 'Fattura', desc: 'Fatt. n. 2 - Esportazione cucina cliente in Svizzera (bolla dog.)', regime: 'CH_ART8', totale: 12500 },
      { id: 5, data: d('03-31'), tipo: 'Corrispettivi', desc: 'Corrispettivi negozio marzo', regime: 'IT_22', totale: 17080 },
      { id: 6, data: d('05-20'), tipo: 'Corrispettivi', desc: 'Corrispettivi negozio 2° trimestre', regime: 'IT_22', totale: 46360 },
      { id: 7, data: d('08-25'), tipo: 'Corrispettivi', desc: 'Corrispettivi negozio 3° trimestre', regime: 'IT_22', totale: 42700 },
      { id: 8, data: d('10-15'), tipo: 'Fattura', desc: 'Fatt. n. 18 - Camera matrimoniale su misura cliente Bianchi', regime: 'IT_22', totale: 8540 },
    ],
    acquisti: [
      { id: 101, data: d('01-15'), desc: 'Fornitura cucine e soggiorni - Mobilificio Alfa Srl', provenienza: 'IT', categoria: 'merce_100_100', imponibile: 28000, iva: 6160 },
      { id: 102, data: d('02-10'), desc: 'Illuminazione design - Fornitore tedesco GmbH', provenienza: 'UE_MERCE', categoria: 'merce_100_100', imponibile: 4500, iva: 0 },
      { id: 103, data: d('02-22'), desc: 'Capsule caffè e acqua per clienti/ufficio', provenienza: 'IT', categoria: 'caffe_0_75', imponibile: 180, iva: 39.6 },
      { id: 104, data: d('03-05'), desc: 'Gasolio furgone consegna mobili (autocarro N1)', provenienza: 'IT', categoria: 'furgone_100_100', imponibile: 650, iva: 143 },
      { id: 105, data: d('04-12'), desc: 'Importazione complementi in legno dalla Svizzera + bolla doganale', provenienza: 'CH_BOLLA', categoria: 'merce_100_100', imponibile: 3200, iva: 704 },
      { id: 106, data: d('05-18'), desc: 'Fornitura camere e armadi - Arredi Beta SpA', provenienza: 'IT', categoria: 'merce_100_100', imponibile: 34000, iva: 7480 },
      { id: 107, data: d('06-10'), desc: 'Bollette energia elettrica e riscaldamento showroom', provenienza: 'IT', categoria: 'merce_100_100', imponibile: 2400, iva: 528 },
      { id: 108, data: d('07-15'), desc: 'Abbonamento telefonia mobile aziendale', provenienza: 'IT', categoria: 'tel_mob_50_80', imponibile: 400, iva: 88 },
      { id: 109, data: d('09-10'), desc: 'Fornitura divani e poltrone autunno - Salotti Gamma', provenienza: 'IT', categoria: 'merce_100_100', imponibile: 22000, iva: 4840 },
    ],
  };
}

// ---------------------------------------------------------------------------
// Salvataggio
// ---------------------------------------------------------------------------
const STORAGE_KEY = 'gestionale_snc_v2';

function normalizza(s) {
  const base = STATO_VUOTO();
  const st = Object.assign(base, s || {});
  st.impostazioni = Object.assign(IMPOSTAZIONI_BASE(), (s && s.impostazioni) || {});
  st.entrate = Array.isArray(st.entrate) ? st.entrate : [];
  st.acquisti = Array.isArray(st.acquisti) ? st.acquisti : [];
  // il credito IVA prima era un numero unico: diventa per anno
  if (typeof st.creditoIvaPrec !== 'object' || st.creditoIvaPrec === null) {
    const v = +st.creditoIvaPrec || 0;
    st.creditoIvaPrec = v ? { [st.anno]: v } : {};
  }
  st.anno = +st.anno || new Date().getFullYear();
  return st;
}

function loadState() {
  try {
    const raw = DESKTOP ? window.gestionale.leggiDati() : localStorage.getItem(STORAGE_KEY);
    if (raw) return normalizza(JSON.parse(raw));
  } catch (e) { console.error('Lettura dati non riuscita:', e); }
  return STATO_VUOTO();
}

let saveTimer = null;
function saveState() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(salvaSubito, 200);
}
function salvaSubito() {
  clearTimeout(saveTimer);
  const json = JSON.stringify(appState, null, 2);
  try {
    if (DESKTOP) window.gestionale.scriviDati(json);
    else localStorage.setItem(STORAGE_KEY, json);
  } catch (e) { showToast('Salvataggio non riuscito: ' + e.message, true); }
}
window.addEventListener('beforeunload', salvaSubito);

let appState = loadState();
const imp = () => appState.impostazioni;

// ---------------------------------------------------------------------------
// Utilità
// ---------------------------------------------------------------------------
/* useGrouping 'always': in italiano Intl ometterebbe il punto delle migliaia
   sotto i 10.000 («5000,00 €»), che in contabilità confonde */
const EURO = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', useGrouping: 'always' });
const fmtEuro = (n) => EURO.format(n || 0);
const fmtPct = (n) => new Intl.NumberFormat('it-IT', { maximumFractionDigits: 2 }).format(n || 0) + '%';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtData = (iso) => { const [y, m, d] = String(iso || '').split('-'); return d ? `${d}/${m}/${y}` : iso; };
const oggi = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const quotaS1 = () => Math.min(100, Math.max(0, +imp().s1Quota || 0));
const quotaS2 = () => 100 - quotaS1();
const annoDi = (iso) => +String(iso || '').slice(0, 4);

function getTrimestre(dateStr) {
  const month = parseInt(String(dateStr || '').split('-')[1], 10) || 1;
  return Math.ceil(month / 3);
}

/* Le scadenze fiscali che cadono di sabato o domenica slittano al lunedì */
function scadenza(anno, mese, giorno) {
  const d = new Date(anno, mese - 1, giorno);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
}

// ---------------------------------------------------------------------------
// Notifiche e conferme
// ---------------------------------------------------------------------------
let toastTimer = null;
function showToast(msg, isError = false) {
  const t = $('toast');
  $('toast-icon').textContent = isError ? '!' : '✓';
  $('toast-icon').className = isError ? 'text-rose-400 font-bold' : 'text-emerald-400 font-bold';
  $('toast-msg').textContent = msg;
  t.classList.remove('hidden'); t.classList.add('flex');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.classList.add('hidden'); t.classList.remove('flex'); }, 3500);
}

const apri = (el) => { el.classList.remove('hidden'); el.classList.add('flex'); };
const chiudi = (el) => { el.classList.add('hidden'); el.classList.remove('flex'); };

let confirmCallback = null;
function openConfirmModal(title, desc, onConfirm, okLabel = 'Conferma') {
  $('confirm-title').textContent = title;
  $('confirm-desc').textContent = desc;
  $('confirm-ok').textContent = okLabel;
  confirmCallback = onConfirm;
  apri($('confirm-modal'));
  $('confirm-cancel').focus();
}
$('confirm-cancel').addEventListener('click', () => { chiudi($('confirm-modal')); confirmCallback = null; });
$('confirm-ok').addEventListener('click', () => {
  chiudi($('confirm-modal'));
  const cb = confirmCallback; confirmCallback = null;
  if (cb) cb();
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!$('confirm-modal').classList.contains('hidden')) { chiudi($('confirm-modal')); confirmCallback = null; }
  else if (!$('settings-modal').classList.contains('hidden') && imp().configurate) chiudi($('settings-modal'));
});

// ---------------------------------------------------------------------------
// Azioni dell'intestazione
// ---------------------------------------------------------------------------
function askResetToDemo() {
  openConfirmModal(
    `Caricare i dati di esempio per il ${appState.anno}?`,
    `I movimenti del ${appState.anno} verranno sostituiti da quelli dimostrativi. Gli altri anni e le impostazioni restano come sono.`,
    () => {
      const es = datiEsempio(appState.anno);
      appState.entrate = appState.entrate.filter((x) => annoDi(x.data) !== appState.anno).concat(es.entrate.map((x) => ({ ...x, id: x.id + Date.now() })));
      appState.acquisti = appState.acquisti.filter((x) => annoDi(x.data) !== appState.anno).concat(es.acquisti.map((x) => ({ ...x, id: x.id + Date.now() })));
      appState.isDemo = true;
      saveState(); renderAll();
      showToast('Dati di esempio caricati.');
    }, 'Carica esempio');
}

function askClearAll() {
  openConfirmModal(
    `Svuotare i movimenti del ${appState.anno}?`,
    `Verranno cancellati corrispettivi, fatture e acquisti del ${appState.anno}. Impostazioni e altri anni restano. Se vuoi conservarli, esporta prima un backup.`,
    () => {
      appState.entrate = appState.entrate.filter((x) => annoDi(x.data) !== appState.anno);
      appState.acquisti = appState.acquisti.filter((x) => annoDi(x.data) !== appState.anno);
      appState.isDemo = false;
      saveState(); renderAll();
      showToast(`Anno ${appState.anno} svuotato: pronto per i tuoi dati reali.`);
    }, 'Svuota');
}

async function exportDataJSON() {
  salvaSubito();
  const json = JSON.stringify(appState, null, 2);
  const nome = `gestionale-snc-backup-${oggi()}.json`;
  if (DESKTOP) {
    const r = await window.gestionale.esportaBackup(nome, json);
    if (r && r.ok) showToast('Backup salvato: ' + r.percorso);
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  showToast('Backup scaricato.');
}

function applicaBackup(testo) {
  let dati;
  try { dati = JSON.parse(testo); } catch (_) { showToast('Il file non è un backup valido.', true); return; }
  if (!dati || !Array.isArray(dati.entrate) || !Array.isArray(dati.acquisti)) { showToast('Il file non contiene entrate e acquisti.', true); return; }
  openConfirmModal('Ripristinare questo backup?',
    `Contiene ${dati.entrate.length} entrate e ${dati.acquisti.length} acquisti. Tutti i dati attuali verranno sostituiti.`,
    () => {
      appState = normalizza(dati);
      if (!dati.impostazioni) appState.impostazioni = { ...imp(), configurate: true };
      saveState(); syncControlsFromState(); renderAll();
      showToast('Backup ripristinato.');
    }, 'Ripristina');
}

async function importDataJSON() {
  if (DESKTOP) {
    const r = await window.gestionale.importaBackup();
    if (r && r.ok) applicaBackup(r.contenuto);
    else if (r && r.errore) showToast(r.errore, true);
    return;
  }
  $('restore-input').click();
}
$('restore-input').addEventListener('change', async (e) => {
  const f = e.target.files[0]; e.target.value = '';
  if (f) applicaBackup(await f.text());
});

// ---------------------------------------------------------------------------
// Impostazioni
// ---------------------------------------------------------------------------
const CAMPI_IMP = [
  ['set-ragione', 'ragione', 't'], ['set-attivita', 'attivita', 't'],
  ['set-s1-nome', 's1Nome', 't'], ['set-s1-quota', 's1Quota', 'n'],
  ['set-s2-nome', 's2Nome', 't'], ['set-collab-nome', 'collabNome', 't'],
  ['set-comm-lordo', 'commLordo', 'n'], ['set-comm-imp', 'commImp', 'n'], ['set-comm-sw', 'commSw', 'n'],
  ['set-irpef1', 'irpef1', 'n'], ['set-irpef2', 'irpef2', 'n'], ['set-irpef3', 'irpef3', 'n'],
  ['set-addiz', 'addiz', 'n'], ['set-irap', 'irap', 'n'], ['set-irap-ded', 'irapDed', 'n'],
  ['set-inps-min', 'inpsMin', 'n'], ['set-inps-fisso', 'inpsFisso', 'n'], ['set-inps-aliq', 'inpsAliq', 'n'],
];

function aggiornaQuotaS2Form() {
  const q = Math.min(100, Math.max(0, +$('set-s1-quota').value || 0));
  $('set-s2-quota').textContent = fmtPct(100 - q);
}
$('set-s1-quota').addEventListener('input', aggiornaQuotaS2Form);

function openSettings() {
  for (const [id, k] of CAMPI_IMP) $(id).value = imp()[k] ?? '';
  aggiornaQuotaS2Form();
  // al primo avvio non si può chiudere senza salvare: servono i dati veri
  document.querySelectorAll('[data-action="close-settings"]').forEach((b) => b.classList.toggle('hidden', !imp().configurate));
  apri($('settings-modal'));
  $('set-ragione').focus();
}

$('form-settings').addEventListener('submit', (e) => {
  e.preventDefault();
  const nuovo = { ...imp(), configurate: true };
  for (const [id, k, tipo] of CAMPI_IMP) {
    const v = $(id).value;
    nuovo[k] = tipo === 'n' ? (parseFloat(v) || 0) : v.trim();
  }
  nuovo.s1Quota = Math.min(100, Math.max(0, nuovo.s1Quota));
  appState.impostazioni = nuovo;
  saveState(); chiudi($('settings-modal')); renderAll();
  showToast('Impostazioni salvate su questo computer.');
});

// ---------------------------------------------------------------------------
// Navigazione
// ---------------------------------------------------------------------------
const TAB_ON = 'tab-btn whitespace-nowrap px-3.5 py-2.5 text-xs sm:text-sm font-semibold rounded-t-xl border-b-2 border-amber-400 text-amber-400 bg-slate-800/60 transition';
const TAB_OFF = 'tab-btn whitespace-nowrap px-3.5 py-2.5 text-xs sm:text-sm font-medium rounded-t-xl border-b-2 border-transparent text-slate-400 hover:text-slate-200 transition';

function switchTab(name) {
  document.querySelectorAll('.tab-content').forEach((el) => el.classList.add('hidden'));
  $('tab-' + name).classList.remove('hidden');
  document.querySelectorAll('nav .tab-btn').forEach((b) => {
    b.className = b.dataset.tab === name ? TAB_ON : TAB_OFF;
    // su uno schermo stretto la barra scorre: la sezione aperta deve restare visibile
    if (b.dataset.tab === name) b.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });
  try { sessionStorage.setItem('tab', name); } catch (_) {}
  window.scrollTo({ top: 0 });
}

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-tab]');
  if (t) { switchTab(t.dataset.tab); return; }
  const a = e.target.closest('[data-action]');
  if (!a) return;
  const id = +a.dataset.id;
  switch (a.dataset.action) {
    case 'demo': askResetToDemo(); break;
    case 'clear': askClearAll(); break;
    case 'export': exportDataJSON(); break;
    case 'import': importDataJSON(); break;
    case 'open-settings': openSettings(); break;
    case 'close-settings': chiudi($('settings-modal')); break;
    case 'del-entrata': deleteEntrata(id); break;
    case 'del-acquisto': deleteAcquisto(id); break;
  }
});

// ---------------------------------------------------------------------------
// Calcoli
// ---------------------------------------------------------------------------
function calcEntrataBreakdown(item) {
  const tot = parseFloat(item.totale) || 0;
  if (item.regime === 'IT_22') {
    const imponibile = tot / 1.22;
    return { imponibile, iva: tot - imponibile, totale: tot };
  }
  return { imponibile: tot, iva: 0, totale: tot };   // art. 8 / art. 41: non imponibile
}

function calcAcquistoBreakdown(item) {
  const im = parseFloat(item.imponibile) || 0;
  const ivaDoc = parseFloat(item.iva) || 0;
  const rule = CATEGORIE_SPESA[item.categoria] || CATEGORIE_SPESA.merce_100_100;
  let ivaDebitoRC = 0, ivaDetraibile = 0, ivaIndetraibile = 0, notaEstero = '';

  if (item.provenienza === 'UE_MERCE' || item.provenienza === 'CH_SERVIZI') {
    const ivaRC = im * 0.22;                        // reverse charge: IVA calcolata sull'imponibile
    ivaDebitoRC = ivaRC;
    ivaDetraibile = ivaRC * rule.ivaDetPct;
    ivaIndetraibile = ivaRC - ivaDetraibile;
    notaEstero = item.provenienza === 'UE_MERCE' ? 'Reverse charge UE (TD18 entro il 15 del mese successivo)' : 'Reverse charge servizi extra-UE (TD17)';
  } else {
    ivaDetraibile = ivaDoc * rule.ivaDetPct;
    ivaIndetraibile = ivaDoc - ivaDetraibile;
    if (item.provenienza === 'CH_BOLLA') notaEstero = 'Importazione dalla Svizzera (bolla doganale)';
  }
  // l'IVA indetraibile diventa parte del costo
  const costoDeducibile = (im + ivaIndetraibile) * rule.costoDedPct;
  return { imponibile: im, ivaDocumento: ivaDoc, ivaDebitoRC, ivaDetraibile, ivaIndetraibile, costoDeducibile, rule, notaEstero };
}

function calcolaIrpefScaglioni(imponibile) {
  if (imponibile <= 0) return 0;
  const a1 = imp().irpef1 / 100, a2 = imp().irpef2 / 100, a3 = imp().irpef3 / 100;
  let irpef;
  if (imponibile <= 28000) irpef = imponibile * a1;
  else if (imponibile <= 50000) irpef = 28000 * a1 + (imponibile - 28000) * a2;
  else irpef = 28000 * a1 + 22000 * a2 + (imponibile - 50000) * a3;
  // detrazione per redditi d'impresa (semplificata)
  let detrazione = 0;
  if (imponibile <= 5500) detrazione = 1265;
  else if (imponibile <= 28000) detrazione = 500 + 765 * ((28000 - imponibile) / 22500);
  else if (imponibile <= 50000) detrazione = 500 * ((50000 - imponibile) / 22000);
  return Math.max(0, irpef - detrazione);
}

function calcolaInpsCommercianti(redditoQuota, attivo) {
  if (!attivo) return { fisso: 0, eccedenza: 0, totale: 0 };
  const fisso = +imp().inpsFisso || 0;
  const min = +imp().inpsMin || 0;
  const eccedenza = redditoQuota > min ? (redditoQuota - min) * (imp().inpsAliq / 100) : 0;
  return { fisso, eccedenza, totale: fisso + eccedenza };
}

// ---------------------------------------------------------------------------
// Anteprime dei moduli
// ---------------------------------------------------------------------------
function updateEntrataPreview() {
  const b = calcEntrataBreakdown({ totale: $('ent-totale').value, regime: $('ent-regime').value });
  $('ent-preview').innerHTML = `Anteprima scorporo: imponibile <strong>${fmtEuro(b.imponibile)}</strong> + IVA a debito <strong>${fmtEuro(b.iva)}</strong>`;
}
$('ent-totale').addEventListener('input', updateEntrataPreview);
$('ent-regime').addEventListener('change', updateEntrataPreview);

function updateAcquistoPreview() {
  const prov = $('acq-provenienza').value;
  const ivaInput = $('acq-iva');
  if (prov === 'UE_MERCE' || prov === 'CH_SERVIZI') {
    ivaInput.value = '0.00'; ivaInput.disabled = true; ivaInput.classList.add('bg-slate-100');
    $('lbl-acq-iva').textContent = 'IVA in fattura (0 € - reverse charge)';
  } else {
    ivaInput.disabled = false; ivaInput.classList.remove('bg-slate-100');
    $('lbl-acq-iva').textContent = prov === 'CH_BOLLA' ? 'IVA pagata in bolla doganale (€)' : 'IVA in fattura (€)';
  }
  const b = calcAcquistoBreakdown({ imponibile: $('acq-imponibile').value, iva: ivaInput.value, provenienza: prov, categoria: $('acq-categoria').value });
  let html = `Regola applicata: <strong>${b.rule.badge}</strong> → IVA detraibile: <strong class="text-emerald-700">${fmtEuro(b.ivaDetraibile)}</strong> | Costo deducibile: <strong class="text-slate-900">${fmtEuro(b.costoDeducibile)}</strong>`;
  if (b.ivaIndetraibile > 0) html += ` <span class="text-amber-700">(include ${fmtEuro(b.ivaIndetraibile)} di IVA indetraibile portata a costo)</span>`;
  if (b.notaEstero) html += `<br><span class="text-indigo-700 font-semibold">Adempimento estero: ${b.notaEstero}</span>`;
  $('acq-preview').innerHTML = html;
}
['acq-imponibile', 'acq-iva', 'acq-provenienza', 'acq-categoria'].forEach((id) => {
  $(id).addEventListener('input', updateAcquistoPreview);
  $(id).addEventListener('change', updateAcquistoPreview);
});

$('acq-categoria').innerHTML = Object.entries(CATEGORIE_SPESA)
  .map(([k, r]) => `<option value="${k}">${esc(r.label)} (${esc(r.badge)})</option>`).join('');

// ---------------------------------------------------------------------------
// Inserimento e cancellazione
// ---------------------------------------------------------------------------
function dataDefault() {
  // proponendo una data, si resta nell'anno che si sta guardando
  const t = oggi();
  return annoDi(t) === appState.anno ? t : `${appState.anno}-01-01`;
}

function avvisaSeAltroAnno(data) {
  const a = annoDi(data);
  if (a !== appState.anno) showToast(`Registrato nel ${a}: cambia anno in alto per vederlo.`);
}

$('form-entrata').addEventListener('submit', function (e) {
  e.preventDefault();
  const nuovo = {
    id: Date.now(), data: $('ent-data').value, tipo: $('ent-tipo').value,
    desc: $('ent-desc').value.trim(), regime: $('ent-regime').value,
    totale: parseFloat($('ent-totale').value) || 0,
  };
  appState.entrate.push(nuovo);
  appState.entrate.sort((a, b) => a.data.localeCompare(b.data));
  saveState(); this.reset();
  $('ent-data').value = nuovo.data;          // spesso si registrano più voci dello stesso giorno
  updateEntrataPreview(); renderAll();
  if (annoDi(nuovo.data) === appState.anno) showToast('Entrata registrata.'); else avvisaSeAltroAnno(nuovo.data);
  $('ent-desc').focus();
});

$('form-acquisto').addEventListener('submit', function (e) {
  e.preventDefault();
  const nuovo = {
    id: Date.now(), data: $('acq-data').value, desc: $('acq-desc').value.trim(),
    provenienza: $('acq-provenienza').value, categoria: $('acq-categoria').value,
    imponibile: parseFloat($('acq-imponibile').value) || 0, iva: parseFloat($('acq-iva').value) || 0,
  };
  appState.acquisti.push(nuovo);
  appState.acquisti.sort((a, b) => a.data.localeCompare(b.data));
  saveState(); this.reset();
  $('acq-data').value = nuovo.data;
  updateAcquistoPreview(); renderAll();
  if (annoDi(nuovo.data) === appState.anno) showToast('Spesa registrata con le regole fiscali applicate.'); else avvisaSeAltroAnno(nuovo.data);
  $('acq-desc').focus();
});

function deleteEntrata(id) {
  const x = appState.entrate.find((v) => v.id === id);
  if (!x) return;
  openConfirmModal('Eliminare questa entrata?', `${fmtData(x.data)} — ${x.desc} (${fmtEuro(x.totale)})`, () => {
    appState.entrate = appState.entrate.filter((v) => v.id !== id);
    saveState(); renderAll(); showToast('Entrata eliminata.');
  }, 'Elimina');
}

function deleteAcquisto(id) {
  const x = appState.acquisti.find((v) => v.id === id);
  if (!x) return;
  openConfirmModal('Eliminare questa spesa?', `${fmtData(x.data)} — ${x.desc} (${fmtEuro(x.imponibile)} + IVA)`, () => {
    appState.acquisti = appState.acquisti.filter((v) => v.id !== id);
    saveState(); renderAll(); showToast('Spesa eliminata.');
  }, 'Elimina');
}

// ---------------------------------------------------------------------------
// Controlli collegati allo stato
// ---------------------------------------------------------------------------
function popolaAnni() {
  const anni = new Set([new Date().getFullYear(), new Date().getFullYear() - 1, appState.anno]);
  for (const x of [...appState.entrate, ...appState.acquisti]) if (annoDi(x.data)) anni.add(annoDi(x.data));
  $('sel-anno').innerHTML = [...anni].sort((a, b) => b - a).map((a) => `<option value="${a}">${a}</option>`).join('');
  $('sel-anno').value = appState.anno;
}

function syncControlsFromState() {
  popolaAnni();
  $('iva-credito-prec').value = appState.creditoIvaPrec[appState.anno] || 0;
  $('toggle-socio2-inps').checked = !!appState.socio2Inps;
  $('toggle-collab-inps').checked = !!appState.collabInps;
}

$('sel-anno').addEventListener('change', () => {
  appState.anno = +$('sel-anno').value;
  saveState(); syncControlsFromState();
  $('ent-data').value = dataDefault(); $('acq-data').value = dataDefault();
  renderAll();
});
$('iva-credito-prec').addEventListener('change', () => {
  appState.creditoIvaPrec[appState.anno] = parseFloat($('iva-credito-prec').value) || 0;
  saveState(); renderAll();
});
$('toggle-socio2-inps').addEventListener('change', () => { appState.socio2Inps = $('toggle-socio2-inps').checked; saveState(); renderAll(); });
$('toggle-collab-inps').addEventListener('change', () => { appState.collabInps = $('toggle-collab-inps').checked; saveState(); renderAll(); });

// ---------------------------------------------------------------------------
// Disegno
// ---------------------------------------------------------------------------
const riga = (lbl, val, cls = 'font-semibold text-slate-900', extra = '') =>
  `<div class="flex justify-between gap-3 ${extra}"><span class="text-slate-600">${lbl}</span><span class="${cls} text-right whitespace-nowrap">${val}</span></div>`;

const barra = (lbl, val, pct, colBar, colTxt) => `
  <div>
    <div class="flex justify-between gap-3 text-xs font-semibold mb-1">
      <span class="text-slate-700">${lbl}</span><span class="${colTxt} whitespace-nowrap">${fmtEuro(val)}</span>
    </div>
    <div class="w-full bg-slate-100 rounded-full h-3.5 overflow-hidden">
      <div class="${colBar} h-3.5 rounded-full transition-all duration-500" style="width:${Math.max(0, Math.min(100, pct))}%"></div>
    </div>
  </div>`;

function renderTesti() {
  const s = imp();
  const anno = appState.anno;
  document.title = `${s.ragione} — Contabilità & Fisco ${anno}`;
  $('hdr-ragione').textContent = `${s.ragione} — Contabilità & Fisco`;
  $('hdr-attivita').textContent = s.attivita || '';
  $('hdr-badge').textContent = `Semplificata ${anno}`;
  document.querySelectorAll('[data-anno]').forEach((el) => { el.textContent = anno; });
  document.querySelectorAll('[data-s1-nome]').forEach((el) => { el.textContent = s.s1Nome; });
  document.querySelectorAll('[data-s2-nome]').forEach((el) => { el.textContent = s.s2Nome; });
  document.querySelectorAll('[data-collab-nome]').forEach((el) => { el.textContent = s.collabNome || 'Collaboratore familiare'; });
  document.querySelectorAll('[data-s1-quota]').forEach((el) => { el.textContent = fmtPct(quotaS1()); });
  document.querySelectorAll('[data-s2-quota]').forEach((el) => { el.textContent = fmtPct(quotaS2()); });
  $('kpi-utile-sub').textContent = `Imputato ${fmtPct(quotaS1())} a ${s.s1Nome} / ${fmtPct(quotaS2())} a ${s.s2Nome}`;
  $('txt-inps-s1').textContent = `Socio amministratore che lavora in negozio. Contributo fisso sul minimale (~${fmtEuro(s.inpsFisso)}/anno) + ${fmtPct(s.inpsAliq)} sulla quota di reddito oltre ${fmtEuro(s.inpsMin)}.`;
  $('txt-inps-collab').textContent = `Nessuno stipendio. Se attivo, conta i contributi INPS minimali (~${fmtEuro(s.inpsFisso)}/anno), deducibili dal reddito di ${s.s1Nome}.`;
  $('lbl-socio2-inps').textContent = appState.socio2Inps ? 'INPS attivo' : 'Non attivo';
  $('lbl-collab-inps').textContent = appState.collabInps ? 'INPS attivo' : 'Cessato';

  const risparmio = Math.max(0, (+s.commImp || 0) - (+s.commSw || 0));
  const box = $('box-risparmio');
  if (+s.commLordo > 0) {
    box.classList.remove('hidden'); box.classList.add('flex');
    $('txt-risparmio').innerHTML = `Rispetto ai <strong>${fmtEuro(s.commLordo)} lordi</strong> (${fmtEuro(s.commImp)} imponibili) pagati finora, gestendo la contabilità in autonomia risparmi circa <strong>${fmtEuro(risparmio)} netti/anno</strong> (al netto di ~${fmtEuro(s.commSw)} di software per le fatture elettroniche).`;
  } else { box.classList.add('hidden'); box.classList.remove('flex'); }

  $('txt-guida-strategia').innerHTML = `Usa questa app tutto l'anno per tenere sotto controllo IVA trimestrale, spese deducibili e tasse previste. A fine anno puoi compilare da solo i modelli gratuiti dell'Agenzia delle Entrate oppure portare il riepilogo già ordinato a un CAF o a un commercialista online chiedendo solo l'invio telematico (in media <strong>600 € – 900 €</strong>${+s.commLordo > 0 ? ` invece di ${fmtEuro(s.commLordo)}` : ''}).`;
}

function renderAll() {
  const anno = appState.anno;
  const s = imp();
  renderTesti();
  $('demo-banner').classList.toggle('hidden', !appState.isDemo);

  const entrate = appState.entrate.filter((x) => annoDi(x.data) === anno);
  const acquisti = appState.acquisti.filter((x) => annoDi(x.data) === anno);

  // 1. Entrate
  let totRicaviImp = 0, totIvaDebitoVendite = 0, countFatture = 0;
  const ivaTrim = { 1: { debito: 0, credito: 0 }, 2: { debito: 0, credito: 0 }, 3: { debito: 0, credito: 0 }, 4: { debito: 0, credito: 0 } };
  const REGIME = {
    IT_22: '<span class="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[11px] whitespace-nowrap">IT IVA 22%</span>',
    CH_ART8: '<span class="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 text-[11px] font-semibold whitespace-nowrap">Svizzera art. 8 (0%)</span>',
    UE_ART41: '<span class="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 text-[11px] font-semibold whitespace-nowrap">UE VIES art. 41 (0%)</span>',
  };
  let html = '';
  for (const item of entrate) {
    const b = calcEntrataBreakdown(item);
    const q = getTrimestre(item.data);
    totRicaviImp += b.imponibile; totIvaDebitoVendite += b.iva; ivaTrim[q].debito += b.iva;
    if (item.tipo === 'Fattura') countFatture++;
    html += `<tr class="hover:bg-slate-50/80 transition">
      <td class="py-3 px-4 whitespace-nowrap text-slate-600">${fmtData(item.data)}</td>
      <td class="py-3 px-4 font-semibold text-slate-500">Q${q}</td>
      <td class="py-3 px-4"><span class="font-semibold ${item.tipo === 'Fattura' ? 'text-amber-700' : 'text-slate-700'}">${esc(item.tipo)}</span></td>
      <td class="py-3 px-4 font-medium text-slate-900 min-w-[200px]">${esc(item.desc)}</td>
      <td class="py-3 px-4">${REGIME[item.regime] || esc(item.regime)}</td>
      <td class="py-3 px-4 text-right font-semibold text-slate-900 whitespace-nowrap">${fmtEuro(b.imponibile)}</td>
      <td class="py-3 px-4 text-right text-rose-600 whitespace-nowrap">${fmtEuro(b.iva)}</td>
      <td class="py-3 px-4 text-right font-bold text-slate-900 whitespace-nowrap">${fmtEuro(b.totale)}</td>
      <td class="py-3 px-4 text-center"><button data-action="del-entrata" data-id="${item.id}" class="text-rose-500 hover:text-rose-700 text-xs font-semibold px-2 py-1 rounded-lg hover:bg-rose-50">Elimina</button></td>
    </tr>`;
  }
  $('tbody-entrate').innerHTML = html || `<tr><td colspan="9" class="py-8 text-center text-slate-400 text-xs">Nessuna entrata nel ${anno}. Usa il modulo qui sopra per inserire corrispettivi o fatture emesse.</td></tr>`;
  $('count-fatture-attive').textContent = countFatture;
  $('tot-entrate-imp').textContent = fmtEuro(totRicaviImp);
  $('tot-entrate-iva').textContent = fmtEuro(totIvaDebitoVendite);

  // 2. Acquisti
  let totCostiDeducibili = 0, totIvaDetraibile = 0;
  const PROV = {
    IT: '',
    UE_MERCE: '<span class="inline-block mt-1 px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-[10px] font-bold">UE • Autofattura TD18</span>',
    CH_BOLLA: '<span class="inline-block mt-1 px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[10px] font-bold">Svizzera • Bolla doganale</span>',
    CH_SERVIZI: '<span class="inline-block mt-1 px-2 py-0.5 rounded bg-purple-50 text-purple-700 text-[10px] font-bold">Extra-UE • Autofattura TD17</span>',
  };
  html = '';
  for (const item of acquisti) {
    const b = calcAcquistoBreakdown(item);
    const q = getTrimestre(item.data);
    totCostiDeducibili += b.costoDeducibile; totIvaDetraibile += b.ivaDetraibile;
    ivaTrim[q].debito += b.ivaDebitoRC; ivaTrim[q].credito += b.ivaDetraibile;
    html += `<tr class="hover:bg-slate-50/80 transition">
      <td class="py-3 px-4 whitespace-nowrap text-slate-600">${fmtData(item.data)}</td>
      <td class="py-3 px-4 font-semibold text-slate-500">Q${q}</td>
      <td class="py-3 px-4 min-w-[220px]"><div class="font-medium text-slate-900">${esc(item.desc)}</div>${PROV[item.provenienza] || ''}</td>
      <td class="py-3 px-4 text-xs text-slate-600 min-w-[140px]">${b.rule.badge}</td>
      <td class="py-3 px-4 text-right font-medium text-slate-800 whitespace-nowrap">${fmtEuro(b.imponibile)}</td>
      <td class="py-3 px-4 text-right text-slate-500 whitespace-nowrap">${fmtEuro(b.ivaDocumento)}</td>
      <td class="py-3 px-4 text-right font-semibold text-emerald-700 whitespace-nowrap">${fmtEuro(b.ivaDetraibile)}</td>
      <td class="py-3 px-4 text-right font-bold text-slate-900 whitespace-nowrap">${fmtEuro(b.costoDeducibile)}</td>
      <td class="py-3 px-4 text-center"><button data-action="del-acquisto" data-id="${item.id}" class="text-rose-500 hover:text-rose-700 text-xs font-semibold px-2 py-1 rounded-lg hover:bg-rose-50">Elimina</button></td>
    </tr>`;
  }
  $('tbody-acquisti').innerHTML = html || `<tr><td colspan="9" class="py-8 text-center text-slate-400 text-xs">Nessun acquisto nel ${anno}. Inserisci fornitori, spese del negozio o acquisti esteri.</td></tr>`;
  $('tot-acq-iva-det').textContent = fmtEuro(totIvaDetraibile);
  $('tot-acq-costo-ded').textContent = fmtEuro(totCostiDeducibili);

  // 3. Liquidazione IVA trimestrale
  let riporto = +appState.creditoIvaPrec[anno] || 0;
  const TRIM = [
    { q: 1, nome: '1° trimestre (gen-mar)', scad: scadenza(anno, 5, 16), cod: '6031', magg: true },
    { q: 2, nome: '2° trimestre (apr-giu)', scad: scadenza(anno, 8, 20), cod: '6032', magg: true },
    { q: 3, nome: '3° trimestre (lug-set)', scad: scadenza(anno, 11, 16), cod: '6033', magg: true },
    { q: 4, nome: '4° trimestre (ott-dic)', scad: scadenza(anno + 1, 3, 16) + ' (dich. IVA)', cod: '6099', magg: false },
  ];
  html = '';
  for (const t of TRIM) {
    const deb = ivaTrim[t.q].debito;
    const credTot = ivaTrim[t.q].credito + riporto;
    const diff = deb - credTot;
    let daVersare = 0, interessi = 0;
    if (diff > 0) { interessi = t.magg ? diff * 0.01 : 0; daVersare = diff + interessi; riporto = 0; }
    else riporto = Math.abs(diff);
    const debito = daVersare > 0;
    html += `<div class="p-5 rounded-2xl border ${debito ? 'border-rose-200 bg-rose-50/30' : 'border-emerald-200 bg-emerald-50/30'} flex flex-col justify-between space-y-4">
      <div>
        <div class="flex items-center justify-between gap-2">
          <span class="text-xs font-bold uppercase text-slate-500">Cod. F24: ${t.cod}</span>
          <span class="text-[11px] font-semibold px-2 py-0.5 rounded-full ${debito ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'}">${debito ? 'A debito' : 'A credito'}</span>
        </div>
        <h3 class="text-base font-bold text-slate-900 mt-1">${t.nome}</h3>
        <p class="text-[11px] text-slate-500">Scadenza: ${t.scad}</p>
        <div class="mt-4 space-y-1.5 text-xs">
          ${riga('IVA a debito (+ RC):', fmtEuro(deb))}
          ${riga('IVA a credito (+ riporto):', fmtEuro(credTot), 'font-semibold text-emerald-700')}
          ${interessi > 0 ? riga('Interessi trim. 1%:', fmtEuro(interessi), 'font-semibold text-slate-700') : ''}
        </div>
      </div>
      <div class="pt-3 border-t border-slate-200/80 flex justify-between items-baseline gap-2">
        <span class="text-xs font-bold text-slate-700">${debito ? 'Da versare F24:' : 'Credito riportato:'}</span>
        <span class="text-lg font-extrabold ${debito ? 'text-rose-600' : 'text-emerald-700'} whitespace-nowrap">${fmtEuro(debito ? daVersare : riporto)}</span>
      </div>
    </div>`;
  }
  $('cards-trimestri-iva').innerHTML = html;

  // 4. Utile, imposte dei soci e INPS
  const utileSnc = Math.max(0, totRicaviImp - totCostiDeducibili);
  const q1 = utileSnc * quotaS1() / 100;
  const q2 = utileSnc * quotaS2() / 100;
  const inpsS1 = calcolaInpsCommercianti(q1, true);
  const inpsS2 = calcolaInpsCommercianti(q2, appState.socio2Inps);
  const inpsCollab = appState.collabInps ? (+s.inpsFisso || 0) : 0;   // a carico del socio titolare
  const addiz = s.addiz / 100;

  const impIrpefS1 = Math.max(0, q1 - inpsS1.totale - inpsCollab);
  const irpefS1 = calcolaIrpefScaglioni(impIrpefS1);
  const addS1 = impIrpefS1 * addiz;
  const totS1 = irpefS1 + addS1 + inpsS1.totale + inpsCollab;

  const impIrpefS2 = Math.max(0, q2 - inpsS2.totale);
  const irpefS2 = calcolaIrpefScaglioni(impIrpefS2);
  const addS2 = impIrpefS2 * addiz;
  const totS2 = irpefS2 + addS2 + inpsS2.totale;

  const irapSocieta = Math.max(0, utileSnc - (+s.irapDed || 0)) * (s.irap / 100);
  const totaleTasse = totS1 + totS2 + irapSocieta;
  const nettoTasca = Math.max(0, utileSnc - totaleTasse);

  $('dettaglio-socio1').innerHTML =
    riga(`Quota utile SNC (${fmtPct(quotaS1())}):`, fmtEuro(q1), 'font-bold text-slate-900') +
    riga('INPS fisso + eccedenza:', '- ' + fmtEuro(inpsS1.totale), 'font-semibold text-rose-600') +
    (inpsCollab > 0 ? riga('INPS collaboratore deducibile:', '- ' + fmtEuro(inpsCollab), 'font-semibold text-rose-600') : '') +
    riga('Imponibile netto IRPEF:', fmtEuro(impIrpefS1), 'font-bold text-slate-800', 'pt-2 border-t border-slate-100') +
    riga('IRPEF netta stimata:', fmtEuro(irpefS1)) +
    riga(`Addizionali reg./com. (~${fmtPct(s.addiz)}):`, fmtEuro(addS1)) +
    `<div class="flex justify-between gap-3 pt-3 border-t border-slate-200 text-sm"><span class="font-bold text-slate-900">Totale imposte + INPS:</span><span class="font-extrabold text-indigo-600 whitespace-nowrap">${fmtEuro(totS1)}</span></div>`;

  $('dettaglio-socio2').innerHTML =
    riga(`Quota utile SNC (${fmtPct(quotaS2())}):`, fmtEuro(q2), 'font-bold text-slate-900') +
    riga('INPS commercianti:', '- ' + fmtEuro(inpsS2.totale), 'font-semibold text-rose-600') +
    riga('Imponibile netto IRPEF:', fmtEuro(impIrpefS2), 'font-bold text-slate-800', 'pt-2 border-t border-slate-100') +
    riga('IRPEF netta stimata:', fmtEuro(irpefS2)) +
    riga(`Addizionali reg./com. (~${fmtPct(s.addiz)}):`, fmtEuro(addS2)) +
    `<div class="flex justify-between gap-3 pt-3 border-t border-slate-200 text-sm"><span class="font-bold text-slate-900">Totale imposte + INPS:</span><span class="font-extrabold text-indigo-600 whitespace-nowrap">${fmtEuro(totS2)}</span></div>`;

  $('dettaglio-societa').innerHTML =
    riga('Utile fiscale SNC:', fmtEuro(utileSnc), 'font-bold text-slate-900') +
    riga('Deduzione base IRAP stimata:', '- ' + fmtEuro(s.irapDed), 'font-semibold text-emerald-700') +
    riga(`IRAP (${fmtPct(s.irap)}):`, fmtEuro(irapSocieta), 'font-bold text-slate-900') +
    `<div class="flex justify-between gap-3 pt-3 border-t border-slate-200 text-sm"><span class="font-bold text-slate-900">Carico complessivo (soci + IRAP):</span><span class="font-extrabold text-rose-600 whitespace-nowrap">${fmtEuro(totaleTasse)}</span></div>`;

  // 5. Cruscotto
  $('kpi-ricavi').textContent = fmtEuro(totRicaviImp);
  $('kpi-costi').textContent = fmtEuro(totCostiDeducibili);
  $('kpi-utile').textContent = fmtEuro(utileSnc);
  $('kpi-tasse').textContent = fmtEuro(totaleTasse);

  const maxVal = Math.max(totRicaviImp, 1);
  $('bars').innerHTML =
    barra('Ricavi imponibili totali', totRicaviImp, totRicaviImp > 0 ? 100 : 0, 'bg-slate-800', 'text-slate-900') +
    barra('Costi fiscalmente deducibili', totCostiDeducibili, totCostiDeducibili / maxVal * 100, 'bg-amber-500', 'text-amber-700') +
    barra('Utile fiscale SNC (base imponibile)', utileSnc, utileSnc / maxVal * 100, 'bg-emerald-500', 'text-emerald-700') +
    barra('Utile netto residuo (dopo IRPEF, IRAP e INPS)', nettoTasca, nettoTasca / maxVal * 100, 'bg-indigo-600', 'text-indigo-700');

  const scheda = (nome, quota, utile, irpef, inps) => `
    <div class="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
      <div class="flex justify-between items-center gap-2">
        <span class="text-xs font-bold text-slate-800">${esc(nome)} (${fmtPct(quota)})</span>
        <span class="text-xs font-bold text-emerald-700 whitespace-nowrap">${fmtEuro(utile)} utile</span>
      </div>
      <div class="mt-2 flex justify-between text-xs text-slate-600"><span>IRPEF + addizionali:</span><span class="font-semibold text-slate-900">${fmtEuro(irpef)}</span></div>
      <div class="flex justify-between text-xs text-slate-600"><span>INPS commercianti:</span><span class="font-semibold text-slate-900">${fmtEuro(inps)}</span></div>
    </div>`;
  $('dash-soci').innerHTML =
    scheda(s.s1Nome, quotaS1(), q1, irpefS1 + addS1, inpsS1.totale + inpsCollab) +
    scheda(s.s2Nome, quotaS2(), q2, irpefS2 + addS2, inpsS2.totale) +
    `<div class="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
      <div class="flex justify-between items-center gap-2">
        <span class="text-xs font-bold text-slate-800">${esc(s.collabNome || 'Collaboratore familiare')}</span>
        <span class="text-[11px] font-semibold px-2 py-0.5 rounded-full ${appState.collabInps ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-700'}">${appState.collabInps ? 'Attivo (solo INPS)' : 'Cessato'}</span>
      </div>
      <p class="text-[11px] text-slate-500 mt-1">Nessun compenso. I contributi INPS si attivano nella scheda 5.</p>
    </div>`;
}

// ---------------------------------------------------------------------------
// Comandi dal menu dell'app desktop
// ---------------------------------------------------------------------------
if (DESKTOP && window.gestionale.onMenu) {
  window.gestionale.onMenu((cmd) => {
    if (cmd === 'esporta') exportDataJSON();
    else if (cmd === 'importa') importDataJSON();
    else if (cmd === 'impostazioni') openSettings();
    else if (cmd === 'stampa') window.print();
  });
}

// ---------------------------------------------------------------------------
// Avvio
// ---------------------------------------------------------------------------
(function avvio() {
  $('ent-data').value = dataDefault();
  $('acq-data').value = dataDefault();
  syncControlsFromState();
  updateEntrataPreview();
  updateAcquistoPreview();
  renderAll();
  let tab = 'dashboard';
  try { tab = sessionStorage.getItem('tab') || tab; } catch (_) {}
  switchTab($('tab-' + tab) ? tab : 'dashboard');
  if (!imp().configurate) openSettings();
})();
