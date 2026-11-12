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
  piva: '',
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
  entrate: [],                 // tipo 'Fattura' → Fatture emesse, 'Corrispettivi' → Corrispettivi
  acquisti: [],                // sezione 'fornitori' → Fatture ricevute, 'estero' → Autofatture/Fatture estere, 'spese' → Abbonamenti/Acquisti/Spese
  parcelle: [],                // fatture del commercialista, con la ritenuta d'acconto
  registroRiepiloghi: {},      // anno -> totali del PDF riepilogativo del Registro Corrispettivi
  regole: [],                  // controparte -> tab dove vanno sempre le sue fatture
});

/* Le spese registrate prima della divisione in due tab non sapevano dove
   stare: la merce va ai fornitori, il resto ad abbonamenti e spese. */
const sezioneDi = (a) => {
  if (a.sezioneManuale && a.sezione) return a.sezione;
  const s = a.sezione || (a.categoria === 'merce_100_100' && !/bollett|affitt|utenz|cancell|energia|luce|gas\b/i.test(a.desc || '') ? 'fornitori' : 'spese');
  // gli acquisti dall'estero hanno un tab tutto loro
  return s === 'fornitori' && a.provenienza && a.provenienza !== 'IT' ? 'estero' : s;
};

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
      { id: 110, data: d('01-05'), desc: 'Abbonamento annuale software fatturazione elettronica', provenienza: 'IT', categoria: 'merce_100_100', imponibile: 82, iva: 18.04, sezione: 'spese' },
    ].map((a) => ({ ...a, sezione: sezioneDi(a) })),
    parcelle: [
      { id: 201, data: d('04-20'), desc: 'Studio Verdi - Fatt. n. 31 contabilità 1° trimestre', regime: 'ordinario', onorario: 600, cassaPct: 4, esenti: 0, pagamento: d('04-28'), ritenutaVersata: true },
      { id: 202, data: d('07-18'), desc: 'Studio Verdi - Fatt. n. 58 dichiarazioni e contabilità 2° trim.', regime: 'ordinario', onorario: 1400, cassaPct: 4, esenti: 0, pagamento: d('07-25'), ritenutaVersata: false },
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
  st.acquisti = (Array.isArray(st.acquisti) ? st.acquisti : []).map((a) => ({ ...a, sezione: sezioneDi(a) }));
  st.parcelle = Array.isArray(st.parcelle) ? st.parcelle : [];
  st.regole = Array.isArray(st.regole) ? st.regole.filter((r) => r && r.dest && (r.piva || r.nome)) : [];
  if (typeof st.registroRiepiloghi !== 'object' || st.registroRiepiloghi === null || Array.isArray(st.registroRiepiloghi)) st.registroRiepiloghi = {};
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
  if (chiudiMenuVoce()) return;
  if (!$('sposta-modal').classList.contains('hidden')) { chiudi($('sposta-modal')); spostamento = null; return; }
  if (!$('confirm-modal').classList.contains('hidden')) { chiudi($('confirm-modal')); confirmCallback = null; }
  else if (!$('import-modal').classList.contains('hidden')) { chiudi($('import-modal')); importazione = null; }
  else if (!$('pdfc-modal').classList.contains('hidden')) { chiudi($('pdfc-modal')); caricamentoPdf = null; }
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
      appState.parcelle = appState.parcelle.filter((x) => annoDi(x.data) !== appState.anno).concat(es.parcelle.map((x) => ({ ...x, id: x.id + Date.now() })));
      appState.isDemo = true;
      saveState(); renderAll();
      showToast('Dati di esempio caricati.');
    }, 'Carica esempio');
}

function askClearAll() {
  openConfirmModal(
    `Svuotare i movimenti del ${appState.anno}?`,
    `Verranno cancellati fatture emesse, corrispettivi, fatture dei fornitori, acquisti dall'estero, spese e parcelle del ${appState.anno}. Impostazioni e altri anni restano. Se vuoi conservarli, esporta prima un backup.`,
    () => {
      appState.entrate = appState.entrate.filter((x) => annoDi(x.data) !== appState.anno);
      appState.acquisti = appState.acquisti.filter((x) => annoDi(x.data) !== appState.anno);
      appState.parcelle = appState.parcelle.filter((x) => annoDi(x.data) !== appState.anno);
      delete appState.registroRiepiloghi[appState.anno];
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
    `Contiene ${dati.entrate.length} entrate, ${dati.acquisti.length} acquisti e ${(dati.parcelle || []).length} parcelle. Tutti i dati attuali verranno sostituiti.`,
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
  ['set-ragione', 'ragione', 't'], ['set-piva', 'piva', 't'], ['set-attivita', 'attivita', 't'],
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
  disegnaRegole();
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
    case 'del-parcella': deleteParcella(id); break;
    case 'export-csv': exportCsvAnno(); break;
    case 'import-xml': scegliFileXml(a.dataset.contesto); break;
    case 'close-import': chiudi($('import-modal')); importazione = null; break;
    case 'conferma-import': confermaImport(); break;
    case 'import-pdf-corr': $('pdf-input').click(); break;
    case 'close-pdfc': chiudi($('pdfc-modal')); caricamentoPdf = null; break;
    case 'conferma-pdfc': confermaPdfCorrispettivi(); break;
    case 'apri-allegato': apriAllegato(a.dataset.rel); break;
    case 'menu-sposta': chiudiMenuVoce(); chiediSpostamento(a.dataset.voce, a.dataset.dest); break;
    case 'menu-elimina': chiudiMenuVoce(); eliminaVoce(a.dataset.voce); break;
    case 'close-sposta': chiudi($('sposta-modal')); spostamento = null; break;
    case 'conferma-sposta': confermaSpostamento(); break;
    case 'del-regola': eliminaRegola(+a.dataset.indice); break;
    case 'cerca-anno': cambiaAnnoRicerca(+a.dataset.anno); break;
  }
});

// ---------------------------------------------------------------------------
// Calcoli
// ---------------------------------------------------------------------------
function calcEntrataBreakdown(item) {
  const tot = parseFloat(item.totale) || 0;
  /* le fatture importate dall'XML portano imponibile e IVA veri: valgono anche
     con più aliquote (10%, 4%…) dove lo scorporo al 22% sbaglierebbe */
  if (item.imponibile != null && item.iva != null) return { imponibile: +item.imponibile, iva: +item.iva, totale: tot };
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
    notaEstero = item.provenienza === 'UE_MERCE' ? 'Reverse charge UE (TD18 entro il 15 del mese successivo)' : 'Reverse charge servizi esteri (TD17)';
  } else {
    ivaDetraibile = ivaDoc * rule.ivaDetPct;
    ivaIndetraibile = ivaDoc - ivaDetraibile;
    if (item.provenienza === 'CH_BOLLA') notaEstero = 'Importazione dalla Svizzera (bolla doganale)';
  }
  // l'IVA indetraibile diventa parte del costo
  const costoDeducibile = (im + ivaIndetraibile) * rule.costoDedPct;
  return { imponibile: im, ivaDocumento: ivaDoc, ivaDebitoRC, ivaDetraibile, ivaIndetraibile, costoDeducibile, rule, notaEstero };
}

/* L'autofattura TD17/TD18 va mandata allo SDI entro il 15 del mese dopo
   il ricevimento della fattura estera: qui si conta dalla data del documento. */
function termineAutofattura(item) {
  if (item.provenienza !== 'UE_MERCE' && item.provenienza !== 'CH_SERVIZI') return '';
  const [a, m] = String(item.data).split('-').map(Number);
  if (!a || !m) return '';
  const t = new Date(a, m, 15);                       // m è 1-based: new Date(a, m) è già il mese dopo
  const iso = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-15`;
  return ` <span class="inline-block mt-1 px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-semibold" title="Se hai ricevuto la fattura estera più tardi, conta la data di ricevimento">Autofattura allo SDI entro il ${fmtData(iso)}</span>`;
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
// Anteprime e inserimento: un modulo per tab
// ---------------------------------------------------------------------------
/* Fatture emesse e corrispettivi finiscono nello stesso elenco delle entrate
   (cambia il «tipo»); fornitori e spese in quello degli acquisti (cambia la
   «sezione»). Così LIPE, utile e imposte restano calcolati come prima. */
const MODULI_ENTRATA = {
  fe: { form: 'form-fatture', tipo: 'Fattura', msg: 'Fattura emessa registrata.' },
  co: { form: 'form-corrispettivi', tipo: 'Corrispettivi', msg: 'Corrispettivi registrati.' },
};
const MODULI_SPESA = {
  fo: { form: 'form-fornitori', sezione: 'fornitori', msg: 'Fattura del fornitore registrata.' },
  es: { form: 'form-estero', sezione: 'estero', msg: 'Acquisto dall\'estero registrato.' },
  acq: { form: 'form-acquisti', sezione: 'spese', msg: 'Spesa registrata con le regole fiscali applicate.' },
};
const regimeEntrata = (p) => (p === 'co' ? 'IT_22' : $(`${p}-regime`).value);

function updateEntrataPreview(p) {
  const b = calcEntrataBreakdown({ totale: $(`${p}-totale`).value, regime: regimeEntrata(p) });
  $(`${p}-preview`).innerHTML = `Anteprima scorporo: imponibile <strong>${fmtEuro(b.imponibile)}</strong> + IVA a debito <strong>${fmtEuro(b.iva)}</strong>`;
}

function updateAcquistoPreview(p) {
  const prov = $(`${p}-provenienza`).value;
  const ivaInput = $(`${p}-iva`);
  if (prov === 'UE_MERCE' || prov === 'CH_SERVIZI') {
    ivaInput.value = '0.00'; ivaInput.disabled = true; ivaInput.classList.add('bg-slate-100');
    $(`lbl-${p}-iva`).textContent = 'IVA in fattura (0 € - reverse charge)';
  } else {
    ivaInput.disabled = false; ivaInput.classList.remove('bg-slate-100');
    $(`lbl-${p}-iva`).textContent = prov === 'CH_BOLLA' ? 'IVA pagata in bolla doganale (€)' : 'IVA in fattura (€)';
  }
  const b = calcAcquistoBreakdown({ imponibile: $(`${p}-imponibile`).value, iva: ivaInput.value, provenienza: prov, categoria: $(`${p}-categoria`).value });
  let html = `Regola applicata: <strong>${b.rule.badge}</strong> → IVA detraibile: <strong class="text-emerald-700">${fmtEuro(b.ivaDetraibile)}</strong> | Costo deducibile: <strong class="text-slate-900">${fmtEuro(b.costoDeducibile)}</strong>`;
  if (b.ivaIndetraibile > 0) html += ` <span class="text-amber-700">(include ${fmtEuro(b.ivaIndetraibile)} di IVA indetraibile portata a costo)</span>`;
  if (b.notaEstero) html += `<br><span class="text-indigo-700 font-semibold">Adempimento estero: ${b.notaEstero}</span>`;
  $(`${p}-preview`).innerHTML = html;
}

const OPZIONI_CATEGORIA = Object.entries(CATEGORIE_SPESA)
  .map(([k, r]) => `<option value="${k}">${esc(r.label)} (${esc(r.badge)})</option>`).join('');
for (const p of Object.keys(MODULI_SPESA)) $(`${p}-categoria`).innerHTML = OPZIONI_CATEGORIA;

function dataDefault() {
  // proponendo una data, si resta nell'anno che si sta guardando
  const t = oggi();
  return annoDi(t) === appState.anno ? t : `${appState.anno}-01-01`;
}
const CAMPI_DATA = ['fe-data', 'co-data', 'fo-data', 'es-data', 'acq-data', 'pa-data'];

function confermaRegistrazione(data, msg, focus) {
  if (annoDi(data) === appState.anno) showToast(msg);
  else showToast(`Registrato nel ${annoDi(data)}: cambia anno in alto per vederlo.`);
  $(focus).focus();
}

for (const [p, m] of Object.entries(MODULI_ENTRATA)) {
  $(`${p}-totale`).addEventListener('input', () => updateEntrataPreview(p));
  if (p !== 'co') $(`${p}-regime`).addEventListener('change', () => updateEntrataPreview(p));
  $(m.form).addEventListener('submit', function (e) {
    e.preventDefault();
    const nuovo = {
      id: Date.now(), data: $(`${p}-data`).value, tipo: m.tipo,
      desc: $(`${p}-desc`).value.trim(), regime: regimeEntrata(p),
      totale: parseFloat($(`${p}-totale`).value) || 0,
    };
    appState.entrate.push(nuovo);
    appState.entrate.sort((a, b) => a.data.localeCompare(b.data));
    saveState(); this.reset();
    $(`${p}-data`).value = nuovo.data;       // spesso si registrano più voci dello stesso giorno
    updateEntrataPreview(p); renderAll();
    confermaRegistrazione(nuovo.data, m.msg, `${p}-desc`);
  });
}

for (const [p, m] of Object.entries(MODULI_SPESA)) {
  for (const c of ['imponibile', 'iva', 'provenienza', 'categoria']) {
    $(`${p}-${c}`).addEventListener('input', () => updateAcquistoPreview(p));
    $(`${p}-${c}`).addEventListener('change', () => updateAcquistoPreview(p));
  }
  $(m.form).addEventListener('submit', function (e) {
    e.preventDefault();
    const nuovo = {
      id: Date.now(), data: $(`${p}-data`).value, desc: $(`${p}-desc`).value.trim(),
      provenienza: $(`${p}-provenienza`).value, categoria: $(`${p}-categoria`).value,
      imponibile: parseFloat($(`${p}-imponibile`).value) || 0, iva: parseFloat($(`${p}-iva`).value) || 0,
      sezione: m.sezione,
    };
    const categoria = nuovo.categoria;
    appState.acquisti.push(nuovo);
    appState.acquisti.sort((a, b) => a.data.localeCompare(b.data));
    saveState(); this.reset();
    $(`${p}-data`).value = nuovo.data;
    $(`${p}-categoria`).value = categoria;   // la stessa categoria è la più probabile anche per la prossima
    updateAcquistoPreview(p); renderAll();
    confermaRegistrazione(nuovo.data, m.msg, `${p}-desc`);
  });
}

// ---------------------------------------------------------------------------
// Commercialista: parcelle e ritenuta d'acconto
// ---------------------------------------------------------------------------
/* Fattura di un professionista in regime ordinario:
     onorario + cassa previdenza (4%) = imponibile IVA; IVA 22% su quello;
     spese esenti (art. 15) si aggiungono senza IVA.
   La ritenuta del 20% si calcola sul solo onorario (la cassa ne è esclusa):
   la SNC la trattiene e la versa con F24 codice 1040 entro il 16 del mese
   successivo al PAGAMENTO. Un forfettario non applica né IVA né ritenuta,
   ma mette il bollo da 2 € sopra 77,47 €. */
function calcParcella(p) {
  const onorario = parseFloat(p.onorario) || 0;
  const cassa = onorario * ((parseFloat(p.cassaPct) || 0) / 100);
  const esenti = parseFloat(p.esenti) || 0;
  const forf = p.regime === 'forfettario';
  const imponibileIva = onorario + cassa;
  const iva = forf ? 0 : imponibileIva * 0.22;
  const bollo = forf && imponibileIva + esenti > 77.47 ? 2 : 0;
  const totale = imponibileIva + iva + esenti + bollo;
  const ritenuta = forf ? 0 : onorario * 0.20;
  return { onorario, cassa, esenti, imponibileIva, iva, bollo, totale, ritenuta, netto: totale - ritenuta, costoDeducibile: imponibileIva + esenti + bollo };
}

/** 16 del mese dopo il pagamento, spostato al lunedì se cade nel weekend */
function scadenzaRitenuta(isoPagamento) {
  if (!isoPagamento) return null;
  const [y, m] = isoPagamento.split('-').map(Number);
  const d = new Date(y, m, 16);                       // m è già «il mese dopo» (0-based)
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d;
}
const fmtGiorno = (d) => d.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });

function leggiParcellaForm() {
  return {
    regime: $('pa-regime').value, onorario: $('pa-onorario').value,
    cassaPct: $('pa-cassa').value, esenti: $('pa-esenti').value, pagamento: $('pa-pagamento').value,
  };
}

function updateParcellaPreview() {
  const p = leggiParcellaForm();
  const b = calcParcella(p);
  const forf = p.regime === 'forfettario';
  let html = `Totale fattura <strong>${fmtEuro(b.totale)}</strong> (onorario ${fmtEuro(b.onorario)} + cassa ${fmtEuro(b.cassa)}${forf ? '' : ` + IVA ${fmtEuro(b.iva)}`}${b.esenti ? ` + esenti ${fmtEuro(b.esenti)}` : ''}${b.bollo ? ' + bollo 2,00 €' : ''})`;
  if (!forf) {
    html += `<br>Paghi al commercialista <strong class="text-slate-900">${fmtEuro(b.netto)}</strong> e versi tu la ritenuta di <strong class="text-rose-600">${fmtEuro(b.ritenuta)}</strong> con F24 codice 1040`;
    const sc = scadenzaRitenuta(p.pagamento);
    html += sc ? ` entro <strong>${fmtGiorno(sc)}</strong>.` : ' entro il 16 del mese dopo il pagamento.';
  } else {
    html += '<br>Regime forfettario: nessuna ritenuta da versare, paghi il totale.';
  }
  $('pa-preview').innerHTML = html;
}
['pa-regime', 'pa-onorario', 'pa-cassa', 'pa-esenti', 'pa-pagamento'].forEach((id) => {
  $(id).addEventListener('input', updateParcellaPreview);
  $(id).addEventListener('change', updateParcellaPreview);
});

$('form-parcella').addEventListener('submit', function (e) {
  e.preventDefault();
  const nuovo = {
    id: Date.now(), data: $('pa-data').value, desc: $('pa-desc').value.trim(), ...leggiParcellaForm(),
    ritenutaVersata: false,
  };
  for (const k of ['onorario', 'cassaPct', 'esenti']) nuovo[k] = parseFloat(nuovo[k]) || 0;
  const regime = nuovo.regime;
  appState.parcelle.push(nuovo);
  appState.parcelle.sort((a, b) => a.data.localeCompare(b.data));
  saveState(); this.reset();
  $('pa-data').value = nuovo.data; $('pa-regime').value = regime;
  updateParcellaPreview(); renderAll();
  confermaRegistrazione(nuovo.data, 'Parcella registrata.', 'pa-desc');
});

// pagamento e versamento della ritenuta si segnano direttamente nella tabella
document.addEventListener('change', (e) => {
  const el = e.target;
  const id = +el.dataset.id;
  const p = appState.parcelle.find((x) => x.id === id);
  if (!p) return;
  if (el.dataset.campo === 'pagamento') p.pagamento = el.value;
  else if (el.dataset.campo === 'versata') p.ritenutaVersata = el.checked;
  else return;
  saveState(); renderAll();
});

// ---------------------------------------------------------------------------
// Cancellazione
// ---------------------------------------------------------------------------
function deleteEntrata(id) {
  const x = appState.entrate.find((v) => v.id === id);
  if (!x) return;
  const cosa = x.tipo === 'Fattura' ? 'questa fattura' : 'questi corrispettivi';
  openConfirmModal(`Eliminare ${cosa}?`, `${fmtData(x.data)} — ${x.desc} (${fmtEuro(x.totale)})`, () => {
    appState.entrate = appState.entrate.filter((v) => v.id !== id);
    saveState(); renderAll(); showToast('Voce eliminata.');
  }, 'Elimina');
}

function deleteAcquisto(id) {
  const x = appState.acquisti.find((v) => v.id === id);
  if (!x) return;
  openConfirmModal(x.sezione === 'fornitori' ? 'Eliminare questa fattura del fornitore?' : x.sezione === 'estero' ? 'Eliminare questo acquisto dall\'estero?' : 'Eliminare questa spesa?',
    `${fmtData(x.data)} — ${x.desc} (${fmtEuro(x.imponibile)} + IVA)`, () => {
      appState.acquisti = appState.acquisti.filter((v) => v.id !== id);
      saveState(); renderAll(); showToast('Voce eliminata.');
    }, 'Elimina');
}

function deleteParcella(id) {
  const x = appState.parcelle.find((v) => v.id === id);
  if (!x) return;
  openConfirmModal('Eliminare questa parcella?', `${fmtData(x.data)} — ${x.desc} (${fmtEuro(calcParcella(x).totale)})`, () => {
    appState.parcelle = appState.parcelle.filter((v) => v.id !== id);
    saveState(); renderAll(); showToast('Parcella eliminata.');
  }, 'Elimina');
}

// ---------------------------------------------------------------------------
// Riepilogo dell'anno per il commercialista (CSV che Excel apre da solo)
// ---------------------------------------------------------------------------
const NOMI_SEZIONE = { fornitori: 'Fatture fornitori', estero: 'Autofatture/fatture estere', spese: 'Abbonamenti/acquisti/spese' };

async function exportCsvAnno() {
  const anno = appState.anno;
  const num = (n) => (Math.round((n || 0) * 100) / 100).toFixed(2).replace('.', ',');
  const cella = (v) => { const s = String(v ?? ''); return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const REG = { ESENTE: 'Esente / non imponibile', IT_4: 'Italia IVA 4%', IT_10: 'Italia IVA 10%', IT_22: 'Italia IVA 22%', CH_ART8: 'Non imponibile art. 8', UE_ART41: 'Non imponibile art. 41' };
  const PROV = { IT: 'Italia', UE_MERCE: 'UE reverse charge TD18', CH_BOLLA: 'Extra-UE bolla doganale', CH_SERVIZI: 'Servizi esteri reverse charge TD17' };
  const righe = [['Sezione', 'Data', 'Trimestre', 'Descrizione', 'Regime / provenienza', 'Categoria', 'Imponibile', 'IVA documento', 'IVA a debito', 'IVA detraibile', 'Costo deducibile', 'Totale', 'Ritenuta', 'Note']];
  const delAnno = (x) => annoDi(x.data) === anno;

  for (const x of appState.entrate.filter(delAnno)) {
    const b = calcEntrataBreakdown(x);
    righe.push([x.tipo === 'Fattura' ? 'Fatture emesse' : 'Corrispettivi', fmtData(x.data), 'Q' + getTrimestre(x.data), x.desc, REG[x.regime] || x.regime, '', num(b.imponibile), num(b.iva), num(b.iva), '', '', num(b.totale), '', '']);
  }
  for (const x of appState.acquisti.filter(delAnno)) {
    const b = calcAcquistoBreakdown(x);
    righe.push([NOMI_SEZIONE[x.sezione] || 'Abbonamenti/acquisti/spese', fmtData(x.data), 'Q' + getTrimestre(x.data), x.desc, PROV[x.provenienza] || x.provenienza, b.rule.label, num(b.imponibile), num(b.ivaDocumento), num(b.ivaDebitoRC), num(b.ivaDetraibile), num(b.costoDeducibile), num(b.imponibile + b.ivaDocumento), '', b.notaEstero]);
  }
  for (const x of appState.parcelle.filter(delAnno)) {
    const b = calcParcella(x);
    const sc = scadenzaRitenuta(x.pagamento);
    const nota = b.ritenuta ? (x.ritenutaVersata ? 'Ritenuta versata' : sc ? 'Ritenuta da versare entro ' + sc.toLocaleDateString('it-IT') : 'Parcella non ancora pagata') : 'Forfettario';
    righe.push(['Commercialista', fmtData(x.data), 'Q' + getTrimestre(x.data), x.desc, x.regime === 'forfettario' ? 'Professionista forfettario' : 'Professionista ordinario', 'Consulenza', num(b.imponibileIva), num(b.iva), '', num(b.iva), num(b.costoDeducibile), num(b.totale), num(b.ritenuta), nota]);
  }
  if (righe.length === 1) { showToast(`Nessun movimento nel ${anno} da esportare.`, true); return; }

  // BOM + punto e virgola: Excel in italiano lo apre con le colonne giuste
  const csv = '﻿' + righe.map((r) => r.map(cella).join(';')).join('\r\n');
  const nome = `riepilogo-contabile-${anno}.csv`;
  if (DESKTOP) {
    const r = await window.gestionale.esportaFile(nome, csv, 'csv');
    if (r && r.ok) showToast('Riepilogo salvato: ' + r.percorso);
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  showToast('Riepilogo scaricato.');
}

// ---------------------------------------------------------------------------
// Importazione delle fatture elettroniche (XML, P7M, ZIP)
// ---------------------------------------------------------------------------
/* Ogni fattura letta propone una destinazione; nell'anteprima la si può
   cambiare prima di registrare. Il criterio:
   - con la Partita IVA della società nelle impostazioni: se la società è il
     cedente è una fattura emessa, se è il cessionario è ricevuta, altrimenti
     non la riguarda;
   - senza Partita IVA: decide il tab da cui si è partiti.
   Le ricevute con ritenuta d'acconto sono parcelle di professionisti; le
   autofatture TD17/TD18/TD19 sono acquisti dall'estero in reverse charge;
   bollette, telefonia, carburante e simili vanno tra le spese. */
let importazione = null;

const DESTINAZIONI = {
  fatture: 'Fatture emesse',
  fornitori: 'Fatture fornitori',
  estero: 'Autofatture/fatture estere',
  spese: 'Abbonamenti/acquisti/spese',
  commercialista: 'Commercialista',
  salta: 'Non importare',
};
const pulisciPiva = (s) => String(s || '').toUpperCase().replace(/^IT/, '').replace(/[^0-9A-Z]/g, '');
const chiaveFattura = (f) => `${pulisciPiva(f.cedente.piva || f.cedente.cf)}|${String(f.numero).trim().toUpperCase()}|${f.data}`;
const NOTE_CREDITO = new Set(['TD04', 'TD08']);
const TIPI_DOC = {
  TD01: 'Fattura', TD02: 'Acconto', TD03: 'Acconto/parcella', TD04: 'Nota di credito', TD05: 'Nota di debito',
  TD06: 'Parcella', TD16: 'Integrazione RC interno', TD17: 'Autofattura servizi estero', TD18: 'Autofattura beni UE',
  TD19: 'Autofattura beni art. 17', TD20: 'Autofattura regolarizzazione', TD24: 'Fattura differita', TD25: 'Fattura differita', TD26: 'Cessione beni ammortizzabili',
};

/* Indovina la categoria di una spesa dal fornitore e dalle righe della fattura */
function categoriaDa(f) {
  const t = `${f.cedente.nome} ${f.descrizioni.join(' ')}`.toLowerCase();
  const nature = f.riepiloghi.map((r) => r.natura).filter(Boolean);
  if (/\b(tim|vodafone|wind|windtre|iliad|very mobile|ho\.? mobile|kena|poste ?mobile)\b|telefon|cellular|\bsim\b|mobile/.test(t)) return 'tel_mob_50_80';
  if (/fastweb|fibra|adsl|internet|linea fissa|telefonia fissa|eolo|tiscali/.test(t)) return 'tel_fisso_100_80';
  if (/caff[eè]|capsul|bar\b|ristor|acqua minerale|nespresso|lavazza/.test(t)) return 'caffe_0_75';
  if (/gasolio|benzina|carburant|diesel|\beni\b|\bq8\b|\bip\b|tamoil|esso|autostrad|telepass/.test(t)) return 'furgone_100_100';
  if (/assicura|polizza|\bbanca\b|bancari|commission|interess/.test(t) || (nature.length && nature.every((n) => n.startsWith('N4')))) return 'esente_0_100';
  return 'merce_100_100';
}
const sembraSpesa = (f) => {
  const t = `${f.cedente.nome} ${f.descrizioni.join(' ')}`.toLowerCase();
  return categoriaDa(f) !== 'merce_100_100'
    || /energia|elettric|\bluce\b|\bgas\b|enel|edison|a2a|hera|iren|sorgenia|acqua|bollett|abbonament|canone|software|licenz|hosting|dominio|pec|aruba|affitt|locazion|noleggi|leasing|pulizi|manutenz|vigilanz|rifiuti|tari/.test(t);
};

/* Senza Partita IVA nelle impostazioni: se un numero compare in tutte le
   fatture del lotto (come cedente o come cessionario), è quasi certamente
   quello della società. */
function pivaPresunta(fatture) {
  if (fatture.length < 2) return '';
  const conta = new Map();
  for (const f of fatture) {
    for (const p of new Set([pulisciPiva(f.cedente.piva), pulisciPiva(f.cessionario.piva)].filter(Boolean))) conta.set(p, (conta.get(p) || 0) + 1);
  }
  const tutte = [...conta].filter(([, n]) => n === fatture.length).map(([p]) => p);
  return tutte.length === 1 ? tutte[0] : '';
}

function proponiDestinazione(f, contesto, presunta = '') {
  const mia = pulisciPiva(imp().piva) || presunta;
  const ced = pulisciPiva(f.cedente.piva), ces = pulisciPiva(f.cessionario.piva || f.cessionario.cf);
  let emessa;
  if (mia) {
    if (ced === mia && !['TD17', 'TD18', 'TD19', 'TD16', 'TD20'].includes(f.tipoDoc)) emessa = true;
    else if (ces === mia || pulisciPiva(f.cessionario.cf) === mia || (ced === mia)) emessa = false;
    else return { dest: 'salta', motivo: 'Non è intestata alla tua Partita IVA' };
  } else {
    emessa = contesto === 'fatture';
  }
  if (emessa) return { dest: 'fatture' };
  if (f.ritenuta > 0 || (f.cassa && f.cassa.importo > 0)) return { dest: 'commercialista' };
  if (['TD17', 'TD18', 'TD19'].includes(f.tipoDoc) || (f.cedente.paese && f.cedente.paese !== 'IT')) return { dest: 'estero' };
  if (contesto === 'acquisti' || sembraSpesa(f)) return { dest: 'spese' };
  return { dest: contesto === 'commercialista' || contesto === 'estero' ? contesto : 'fornitori' };
}

function giaPresenti() {
  const k = new Set();
  for (const x of [...appState.entrate, ...appState.acquisti, ...appState.parcelle]) if (x.xml) k.add(x.xml);
  return k;
}

function scegliFileXml(contesto) {
  $('xml-input').dataset.contesto = contesto || '';
  $('xml-input').click();
}
$('xml-input').addEventListener('change', (e) => {
  const lista = [...e.target.files]; e.target.value = '';
  if (lista.length) apriImport(lista, e.target.dataset.contesto);
});

async function apriImport(lista, contesto) {
  showToast(`Lettura di ${lista.length} file…`);
  let r;
  try { r = await window.FatturaPA.leggiFile(lista); }
  catch (e) { showToast('Lettura non riuscita: ' + e.message, true); return; }
  const presenti = giaPresenti();
  const visti = new Set();
  const presunta = pulisciPiva(imp().piva) ? '' : pivaPresunta(r.fatture);
  const righe = r.fatture.map((f, i) => {
    const chiave = chiaveFattura(f);
    let p = proponiDestinazione(f, contesto, presunta);
    const cp = controparteFattura(f, p.dest);
    const regola = p.dest !== 'salta' ? regolaPer(cp) : null;
    if (regola) p = { dest: regola.dest, motivo: 'Regola: sempre in ' + DESTINAZIONI[regola.dest], regola };
    if (presenti.has(chiave)) p = { dest: 'salta', motivo: 'Già importata' };
    else if (visti.has(chiave)) p = { dest: 'salta', motivo: 'Doppione nello stesso import' };
    visti.add(chiave);
    let provenienza = f.tipoDoc === 'TD18' ? 'UE_MERCE' : (f.tipoDoc === 'TD17' || f.tipoDoc === 'TD19') ? 'CH_SERVIZI' : 'IT';
    if (p.regola && p.regola.dest === 'estero' && provenienza === 'IT' && p.regola.provenienza) provenienza = p.regola.provenienza;
    if (p.regola && p.regola.dest === 'fornitori') provenienza = 'IT';
    return { i, f, chiave, dest: p.dest, motivo: p.motivo || '', categoria: (p.regola && p.regola.categoria) || categoriaDa(f), provenienza };
  });
  importazione = { righe, errori: r.errori, contesto, presunta };
  if (!righe.length) {
    showToast(r.errori.length ? `Nessuna fattura letta: ${r.errori[0].file} — ${r.errori[0].errore}` : 'Nei file scelti non c\'è nessuna fattura elettronica.', true);
    return;
  }
  disegnaImport();
  apri($('import-modal'));
}

function disegnaImport() {
  const { righe, errori, presunta } = importazione;
  const opzDest = (sel) => Object.entries(DESTINAZIONI).map(([k, v]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${v}</option>`).join('');
  const opzCat = (sel) => Object.entries(CATEGORIE_SPESA).map(([k, r]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${esc(r.label)} (${esc(r.badge)})</option>`).join('');
  const segno = (f) => (NOTE_CREDITO.has(f.tipoDoc) ? -1 : 1);

  $('import-righe').innerHTML = righe.map((r) => {
    const f = r.f, s = segno(f);
    const emessa = r.dest === 'fatture';
    const controparte = emessa ? f.cessionario : f.cedente;
    const conCategoria = r.dest === 'fornitori' || r.dest === 'estero' || r.dest === 'spese';
    const note = [];
    if (r.motivo) note.push(`<span class="text-amber-700 font-semibold">${esc(r.motivo)}</span>`);
    if (NOTE_CREDITO.has(f.tipoDoc)) note.push('<span class="text-indigo-700">Nota di credito: importi in negativo</span>');
    if (f.ritenuta > 0) note.push(`Ritenuta ${fmtEuro(f.ritenuta)}`);
    if (f.divisa !== 'EUR') note.push(`<span class="text-rose-600">In ${esc(f.divisa)}: controlla gli importi</span>`);
    if (annoDi(f.data) !== appState.anno) note.push(`Anno ${annoDi(f.data)}`);
    return `<tr class="${r.dest === 'salta' ? 'opacity-50' : ''} align-top">
      <td class="py-2 px-2 whitespace-nowrap">${fmtData(f.data)}</td>
      <td class="py-2 px-2 min-w-[140px]"><div class="font-semibold text-slate-900">n. ${esc(f.numero)}</div><div class="text-[11px] text-slate-500">${esc(TIPI_DOC[f.tipoDoc] || f.tipoDoc)} · <span title="${esc(f.file)}">${esc(f.file.length > 28 ? f.file.slice(0, 26) + '…' : f.file)}</span></div></td>
      <td class="py-2 px-2 min-w-[180px]"><div class="font-medium text-slate-900">${esc(controparte.nome)}</div><div class="text-[11px] text-slate-500">${esc(controparte.piva ? 'P.IVA ' + controparte.piva : controparte.cf ? 'CF ' + controparte.cf : '')}</div>${note.length ? `<div class="text-[11px] mt-1 space-x-2">${note.join(' · ')}</div>` : ''}</td>
      <td class="py-2 px-2 text-right whitespace-nowrap">${fmtEuro(s * f.imponibile)}</td>
      <td class="py-2 px-2 text-right whitespace-nowrap">${fmtEuro(s * f.iva)}</td>
      <td class="py-2 px-2 text-right whitespace-nowrap font-bold">${fmtEuro(s * f.totale)}</td>
      <td class="py-2 px-2"><select data-imp="${r.i}" data-campo="dest" class="px-2 py-1 rounded-lg border border-slate-300 bg-white text-xs">${opzDest(r.dest)}</select></td>
      <td class="py-2 px-2">${conCategoria ? `<select data-imp="${r.i}" data-campo="categoria" class="w-56 px-2 py-1 rounded-lg border border-slate-300 bg-white text-xs">${opzCat(r.categoria)}</select>` : '<span class="text-slate-400">—</span>'}</td>
    </tr>`;
  }).join('');

  const avvisi = [];
  if (presunta) avvisi.push(`<div class="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900">Nelle impostazioni manca la Partita IVA della società: dai file sembra <strong>${esc(presunta)}</strong> e l'ho usata per distinguere emesse e ricevute. Se è giusta, inseriscila nelle <strong>Impostazioni</strong>.</div>`);
  else if (!pulisciPiva(imp().piva)) avvisi.push(`<div class="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900">Non hai ancora inserito la <strong>Partita IVA della società</strong> nelle impostazioni: senza, emesse e ricevute si distinguono solo dal tab da cui sei partito. Controlla la colonna «Dove va».</div>`);
  if (righe.some((r) => ['TD17', 'TD18', 'TD19'].includes(r.f.tipoDoc) && r.dest !== 'salta')) avvisi.push('<div class="p-2.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-900">Ci sono <strong>autofatture TD17/TD18/TD19</strong>: registrano già l\'acquisto dall\'estero in reverse charge. Non inserire anche la fattura del fornitore estero, o il costo conterebbe due volte.</div>');
  if (errori.length) avvisi.push(`<div class="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-900"><strong>${errori.length} file non letti:</strong> ${errori.slice(0, 5).map((e) => `${esc(e.file)} (${esc(e.errore)})`).join('; ')}${errori.length > 5 ? '…' : ''}</div>`);
  $('import-avvisi').innerHTML = avvisi.join('');

  const daFare = righe.filter((r) => r.dest !== 'salta').length;
  $('import-sub').textContent = `${righe.length} fatture lette. Controlla dove finisce ognuna, poi conferma.`;
  $('import-riepilogo').textContent = `${daFare} da registrare, ${righe.length - daFare} saltate.`;
  $('import-ok').textContent = daFare ? `Registra ${daFare} fatture` : 'Niente da registrare';
  $('import-ok').disabled = !daFare;
  $('import-ok').classList.toggle('opacity-50', !daFare);
}

document.addEventListener('change', (e) => {
  const el = e.target;
  if (!importazione || el.dataset.imp == null) return;
  const r = importazione.righe[+el.dataset.imp];
  if (!r) return;
  r[el.dataset.campo] = el.value;
  if (el.dataset.campo === 'dest') { r.motivo = el.value === 'salta' ? r.motivo : ''; disegnaImport(); }
});

function confermaImport() {
  if (!importazione) return;
  const conta = { fatture: 0, fornitori: 0, estero: 0, spese: 0, commercialista: 0 };
  let id = Date.now();
  for (const r of importazione.righe) {
    if (r.dest === 'salta') continue;
    const f = r.f;
    const s = NOTE_CREDITO.has(f.tipoDoc) ? -1 : 1;
    const nc = s < 0 ? 'Nota di credito ' : 'Fatt. ';
    const cp = controparteFattura(f, r.dest);
    if (r.dest === 'fatture') {
      const nature = f.riepiloghi.map((x) => x.natura);
      const regime = nature.some((n) => n === 'N3.1') ? 'CH_ART8' : nature.some((n) => n === 'N3.2') ? 'UE_ART41' : 'IT_22';
      appState.entrate.push({
        id: id++, data: f.data, tipo: 'Fattura', desc: `${nc}n. ${f.numero} - ${f.cessionario.nome}`, regime,
        totale: s * f.totale, imponibile: s * f.imponibile, iva: s * f.iva, xml: r.chiave, cp,
      });
    } else if (r.dest === 'commercialista') {
      /* nell'XML l'imponibile dei riepiloghi comprende già la cassa:
         l'onorario è quello che resta togliendola */
      const cassa = f.cassa ? f.cassa.importo : 0;
      const esenti = f.riepiloghi.filter((x) => (x.natura || '').startsWith('N1')).reduce((t, x) => t + x.imponibile, 0);
      const imponibileIva = f.riepiloghi.filter((x) => !(x.natura || '').startsWith('N1')).reduce((t, x) => t + x.imponibile, 0);
      appState.parcelle.push({
        id: id++, data: f.data, desc: `${f.cedente.nome} - ${nc}n. ${f.numero}`,
        regime: f.cedente.regime === 'RF19' ? 'forfettario' : 'ordinario',
        onorario: s * Math.max(0, imponibileIva - cassa), cassaPct: f.cassa ? f.cassa.aliquota : 0, esenti: s * esenti,
        pagamento: '', ritenutaVersata: false, xml: r.chiave, cp,
      });
    } else {
      const rc = r.provenienza !== 'IT';
      appState.acquisti.push({
        id: id++, data: f.data, desc: `${f.cedente.nome} - ${nc}n. ${f.numero}`,
        provenienza: r.provenienza, categoria: r.categoria,
        imponibile: s * f.imponibile, iva: rc ? 0 : s * f.iva,
        sezione: r.dest, xml: r.chiave, cp,
        ...(r.dest === 'fornitori' && r.provenienza !== 'IT' ? { sezioneManuale: true } : {}),
        // se un giorno la si sposta tra le parcelle, servono cassa e spese esenti
        ...(f.ritenuta > 0 || f.cassa ? { prof: { regime: f.cedente.regime === 'RF19' ? 'forfettario' : 'ordinario', cassaPct: f.cassa ? f.cassa.aliquota : 0, esenti: s * f.riepiloghi.filter((x) => (x.natura || '').startsWith('N1')).reduce((t, x) => t + x.imponibile, 0) } } : {}),
      });
    }
    conta[r.dest]++;
  }
  for (const k of ['entrate', 'acquisti', 'parcelle']) appState[k].sort((a, b) => a.data.localeCompare(b.data));
  appState.isDemo = false;
  saveState();
  chiudi($('import-modal'));
  const tot = Object.values(conta).reduce((a, b) => a + b, 0);
  const dove = Object.entries(conta).filter(([, n]) => n).map(([k, n]) => `${n} in ${DESTINAZIONI[k]}`).join(', ');
  // si apre il tab dove è finita la maggior parte delle fatture
  const principale = Object.entries(conta).sort((a, b) => b[1] - a[1])[0][0];
  const tabDi = { fatture: 'fatture', fornitori: 'fornitori', estero: 'estero', spese: 'acquisti', commercialista: 'commercialista' };
  importazione = null;
  popolaAnni(); renderAll();
  if (tot) switchTab(tabDi[principale]);
  showToast(`Importate ${tot} fatture: ${dove}.`);
}

/* Trascinare i file sulla finestra. Senza questo, Electron aprirebbe il file
   lasciato cadere al posto dell'app. */
let trascinamenti = 0;
const haFile = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
window.addEventListener('dragenter', (e) => { if (!haFile(e)) return; e.preventDefault(); trascinamenti++; apri($('drop-overlay')); });
window.addEventListener('dragover', (e) => { if (haFile(e)) e.preventDefault(); });
window.addEventListener('dragleave', () => { if (--trascinamenti <= 0) { trascinamenti = 0; chiudi($('drop-overlay')); } });
window.addEventListener('drop', (e) => {
  e.preventDefault();
  trascinamenti = 0; chiudi($('drop-overlay'));
  const tutti = [...(e.dataTransfer?.files || [])];
  const pdf = tutti.filter((f) => /\.pdf$/i.test(f.name));
  const lista = tutti.filter((f) => /\.(xml|p7m|zip)$/i.test(f.name));
  if (pdf.length && !lista.length) { apriPdfCorrispettivi(pdf); return; }
  if (!lista.length) { showToast('Trascina fatture elettroniche (.xml, .p7m, .zip) o i PDF del Registro Corrispettivi.', true); return; }
  if (pdf.length) showToast('Prima le fatture: i PDF dei corrispettivi caricali dopo, a parte.');
  const attivo = document.querySelector('.tab-content:not(.hidden)')?.id.replace('tab-', '');
  apriImport(lista, attivo);
});

// ---------------------------------------------------------------------------
// PDF del Registro Corrispettivi
// ---------------------------------------------------------------------------
/* Ogni mese del Registro diventa un corrispettivo per aliquota (più uno per
   le operazioni esenti, se ci sono), datato all'ultimo giorno del mese e
   marcato con «registro: AAAA-MM»: ricaricare lo stesso mese, dal mensile o
   dal riepilogativo aggiornato, sostituisce quelli di prima invece di
   sommarli. Il riepilogativo registra tutti i mesi che contiene e resta nel
   tab come controllo dei totali dell'anno. */
let caricamentoPdf = null;
const NOMI_MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const nomeMese = (m) => NOMI_MESI[m - 1].charAt(0).toUpperCase() + NOMI_MESI[m - 1].slice(1);
const chiaveMese = (anno, mese) => `${anno}-${String(mese).padStart(2, '0')}`;
const ultimoGiorno = (anno, mese) => `${chiaveMese(anno, mese)}-${String(new Date(anno, mese, 0).getDate()).padStart(2, '0')}`;
const delMese = (x, anno, mese) => x.tipo === 'Corrispettivi' && x.data.startsWith(chiaveMese(anno, mese) + '-');
const lordoDi = (lista) => lista.reduce((t, v) => t + calcEntrataBreakdown(v).totale, 0);

function badgeRegistro(item) {
  const att = item.allegato && DESKTOP
    ? ` <button type="button" data-action="apri-allegato" data-rel="${esc(item.allegato)}" class="ml-1 px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-bold hover:bg-emerald-100" title="Apri il PDF">📎 PDF</button>`
    : '';
  return ` <span class="ml-1 px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-bold align-middle">Registro</span>${att}`;
}

async function apriAllegato(rel) {
  if (!DESKTOP || !rel) return;
  const r = await window.gestionale.apriAllegato(rel);
  if (!r.ok) showToast(r.errore || 'PDF non apribile.', true);
}

$('pdf-input').addEventListener('change', (e) => {
  const lista = [...e.target.files]; e.target.value = '';
  if (lista.length) apriPdfCorrispettivi(lista);
});

/* I mesi che un documento registra: uno per il mensile, tutti quelli con
   incassi per il riepilogativo */
const mesiDelDocumento = (d) => (d.tipo === 'mensile'
  ? [{ anno: d.anno, mese: d.mese, aliquote: d.aliquote, esenti: d.esenti || 0 }]
  : d.mesi.map((m) => ({ anno: d.anno, mese: m.mese, aliquote: m.aliquote, esenti: m.esenti || 0 })));
const lordoMese = (m) => m.aliquote.reduce((t, a) => t + a.lordo, 0) + m.esenti;

/* Le voci da registrare per un mese */
function vociDelMese(m, allegato, primoId) {
  let id = primoId;
  const voci = m.aliquote.filter((a) => a.lordo).map((a) => ({
    id: id++, data: ultimoGiorno(m.anno, m.mese), tipo: 'Corrispettivi',
    desc: `Corrispettivi ${NOMI_MESI[m.mese - 1]} ${m.anno} - IVA ${a.aliquota}%`,
    regime: `IT_${a.aliquota}`, totale: a.lordo, imponibile: a.imponibile, iva: a.iva,
    registro: chiaveMese(m.anno, m.mese), allegato,
  }));
  if (m.esenti) {
    voci.push({
      id: id++, data: ultimoGiorno(m.anno, m.mese), tipo: 'Corrispettivi',
      desc: `Corrispettivi ${NOMI_MESI[m.mese - 1]} ${m.anno} - operazioni esenti o non imponibili`,
      regime: 'ESENTE', totale: m.esenti, imponibile: m.esenti, iva: 0,
      registro: chiaveMese(m.anno, m.mese), allegato,
    });
  }
  return voci;
}

async function apriPdfCorrispettivi(lista) {
  showToast(`Lettura di ${lista.length} PDF…`);
  let r;
  try { r = await window.CorrispettiviPDF.leggiFile(lista); }
  catch (e) { showToast('Lettura non riuscita: ' + e.message, true); return; }
  if (!r.documenti.length) {
    showToast(r.errori.length ? `${r.errori[0].file}: ${r.errori[0].errore}` : 'Nessun PDF leggibile.', true);
    return;
  }
  // un solo PDF per mese o per anno: se ce ne sono due, vale l'ultimo scelto.
  // Prima i riepilogativi, poi i mensili: se ci sono tutti e due, il mese lo dà il mensile.
  const unici = new Map();
  for (const d of r.documenti) unici.set(d.tipo === 'mensile' ? chiaveMese(d.anno, d.mese) : 'anno-' + d.anno, d);
  const documenti = [...unici.values()].sort((a, b) => (a.tipo === b.tipo ? 0 : a.tipo === 'riepilogo' ? -1 : 1) || (a.anno - b.anno) || (a.mese - b.mese));
  caricamentoPdf = { documenti: documenti.map((d) => ({ d, togliManuali: false })), errori: r.errori };
  disegnaPdfCorrispettivi();
  apri($('pdfc-modal'));
}

/* Lordo/imponibile/IVA per aliquota dei corrispettivi in app (le operazioni
   esenti a parte: il «Calcolo IVA» del Registro non le comprende) */
function corrispettiviInApp(filtro, entrate = appState.entrate) {
  const per = {}, tot = { lordo: 0, imponibile: 0, iva: 0 };
  let esenti = 0;
  for (const x of entrate.filter((v) => v.tipo === 'Corrispettivi' && filtro(v))) {
    const b = calcEntrataBreakdown(x);
    if (x.regime === 'ESENTE') { esenti += b.totale; continue; }
    const al = b.imponibile ? Math.round((b.iva / b.imponibile) * 100) : 0;
    per[al] = per[al] || { lordo: 0, imponibile: 0, iva: 0 };
    for (const [k, v] of [['lordo', b.totale], ['imponibile', b.imponibile], ['iva', b.iva]]) { per[al][k] += v; tot[k] += v; }
  }
  return { per, tot, esenti };
}

function tabellaAliquote(righe, extra = null) {
  return `<table class="w-full border-collapse mt-2">
    <thead><tr class="text-[10px] uppercase text-slate-500 border-b border-slate-200">
      <th class="py-1.5 text-left">Aliquota</th><th class="py-1.5 text-right">Lordo</th><th class="py-1.5 text-right">Imponibile</th><th class="py-1.5 text-right">IVA</th>${extra ? `<th class="py-1.5 text-right">${extra.titolo}</th>` : ''}
    </tr></thead>
    <tbody class="divide-y divide-slate-100">${righe.map((a) => `<tr class="${a.totale ? 'font-bold text-slate-900' : ''}">
      <td class="py-1.5">${a.totale ? 'Totale' : a.aliquota + '%'}</td><td class="py-1.5 text-right">${fmtEuro(a.lordo)}</td>
      <td class="py-1.5 text-right">${fmtEuro(a.imponibile)}</td><td class="py-1.5 text-right">${fmtEuro(a.iva)}</td>
      ${extra ? `<td class="py-1.5 text-right">${extra.cella(a)}</td>` : ''}</tr>`).join('')}</tbody></table>`;
}

const cellaDifferenza = (inApp) => (a) => {
  const app = a.totale ? inApp.tot.lordo : (inApp.per[a.aliquota]?.lordo || 0);
  const diff = Math.round((a.lordo - app) * 100) / 100;
  return Math.abs(diff) < 0.01
    ? '<span class="text-emerald-700 font-semibold">✓ uguale</span>'
    : `<span class="text-amber-700 font-semibold" title="Nell'app: ${fmtEuro(app)}">${diff > 0 ? 'mancano' : 'in più'} ${fmtEuro(Math.abs(diff))}</span>`;
};

/* Stato di un mese rispetto a quello che c'è già */
function statoMese(m) {
  const prima = appState.entrate.filter((v) => v.registro === chiaveMese(m.anno, m.mese));
  if (!prima.length) return '<span class="text-emerald-700 font-semibold">Nuovo</span>';
  const lp = lordoDi(prima);
  return Math.abs(lp - lordoMese(m)) < 0.01
    ? '<span class="text-slate-500 font-semibold">Già presente, uguale</span>'
    : `<span class="text-indigo-700 font-semibold">Aggiorna (prima ${fmtEuro(lp)})</span>`;
}

function avvisoManuali(x, i, mesi) {
  const manuali = appState.entrate.filter((v) => !v.registro && mesi.some((m) => delMese(v, m.anno, m.mese)));
  if (!manuali.length) return '';
  const quando = mesi.length === 1 ? `In ${NOMI_MESI[mesi[0].mese - 1]}` : 'In questi mesi';
  return `<label class="mt-3 flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900">
    <input type="checkbox" data-pdfc="${i}" class="mt-0.5 w-4 h-4 accent-amber-600" ${x.togliManuali ? 'checked' : ''} />
    <span>${quando} ${manuali.length === 1 ? 'c’è già <strong>1 corrispettivo inserito' : `ci sono già <strong>${manuali.length} corrispettivi inseriti`} a mano</strong> (${fmtEuro(lordoDi(manuali))}). Se sono gli stessi incassi, spunta qui per toglierli: altrimenti conterebbero due volte.</span>
  </label>`;
}

function disegnaPdfCorrispettivi() {
  const { documenti, errori } = caricamentoPdf;
  const blocchi = documenti.map((x, i) => {
    const d = x.d;
    const mesi = mesiDelDocumento(d);
    const altroAnno = d.anno !== appState.anno ? `<p class="mt-2 text-slate-500">Va nel ${d.anno}: cambia anno in alto per vederlo.</p>` : '';
    const notaPagamenti = d.pagamentiAl ? `POS, bonifici e assegni sono conteggiati al ${d.pagamentiAl}%, come nel Registro.` : '';
    if (d.tipo === 'riepilogo') {
      const cella = (v) => (v ? fmtEuro(v) : '<span class="text-slate-300">—</span>');
      const al = (m, r) => m.aliquote.find((a) => a.aliquota === r)?.lordo || 0;
      const coperti = new Set(documenti.filter((y) => y.d.tipo === 'mensile' && y.d.anno === d.anno).map((y) => y.d.mese));
      return `<div class="rounded-xl border border-slate-200 p-4">
        <div class="flex flex-wrap items-baseline justify-between gap-2"><p class="text-sm font-bold text-slate-900">Riepilogativo ${d.anno}${d.aggiornatoFino ? ` · aggiornato fino a ${NOMI_MESI[d.aggiornatoFino - 1]}` : ''}</p><span class="text-[11px] text-slate-500">${esc(d.file)}</span></div>
        <p class="text-slate-600 mt-1">Registra <strong>${mesi.length} mesi</strong>, ognuno diviso per aliquota. ${notaPagamenti}</p>
        <div class="overflow-x-auto"><table class="w-full border-collapse mt-2">
          <thead><tr class="text-[10px] uppercase text-slate-500 border-b border-slate-200">
            <th class="py-1.5 text-left">Mese</th><th class="py-1.5 text-right">4%</th><th class="py-1.5 text-right">10%</th><th class="py-1.5 text-right">22%</th><th class="py-1.5 text-right">Esenti</th><th class="py-1.5 text-right">Totale</th><th class="py-1.5 pl-3 text-left">Stato</th>
          </tr></thead>
          <tbody class="divide-y divide-slate-100">${mesi.map((m) => `<tr>
            <td class="py-1.5 font-semibold text-slate-800">${nomeMese(m.mese)}</td>
            <td class="py-1.5 text-right">${cella(al(m, 4))}</td><td class="py-1.5 text-right">${cella(al(m, 10))}</td><td class="py-1.5 text-right">${cella(al(m, 22))}</td>
            <td class="py-1.5 text-right">${cella(m.esenti)}</td><td class="py-1.5 text-right font-bold">${fmtEuro(lordoMese(m))}</td>
            <td class="py-1.5 pl-3">${coperti.has(m.mese) ? '<span class="text-slate-500">dal PDF mensile</span>' : statoMese(m)}</td></tr>`).join('')}
            <tr class="font-bold text-slate-900 border-t border-slate-300"><td class="py-1.5">Totale</td><td class="py-1.5 text-right" colspan="4"></td><td class="py-1.5 text-right">${fmtEuro(mesi.reduce((t, m) => t + lordoMese(m), 0))}</td><td></td></tr>
          </tbody></table></div>
        ${d.altri ? `<p class="mt-2 text-slate-500">Gli «altri importi non soggetti a registrazione IVA» (${fmtEuro(d.altri)}) non sono ricavi del negozio e non vengono registrati.</p>` : ''}
        ${altroAnno}${avvisoManuali(x, i, mesi)}
      </div>`;
    }
    const m = mesi[0];
    const righe = [...d.aliquote.filter((a) => a.lordo), { totale: true, ...d.totale }];
    return `<div class="rounded-xl border border-slate-200 p-4">
      <div class="flex flex-wrap items-baseline justify-between gap-2"><p class="text-sm font-bold text-slate-900">${nomeMese(d.mese)} ${d.anno} · ${statoMese(m)}</p><span class="text-[11px] text-slate-500">${esc(d.file)}</span></div>
      ${lordoMese(m) ? tabellaAliquote(righe) : '<p class="mt-2 text-slate-600">Nessun incasso nel mese: non c\'è niente da registrare.</p>'}
      ${m.esenti ? `<p class="mt-2 text-slate-600">Più ${fmtEuro(m.esenti)} di operazioni esenti o non imponibili, registrate senza IVA.</p>` : ''}
      ${notaPagamenti ? `<p class="mt-2 text-slate-500">${notaPagamenti}</p>` : ''}
      ${altroAnno}${avvisoManuali(x, i, mesi)}
    </div>`;
  });
  if (errori.length) blocchi.push(`<div class="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-900"><strong>${errori.length} PDF non letti:</strong> ${errori.map((e) => `${esc(e.file)} (${esc(e.errore)})`).join('; ')}</div>`);
  $('pdfc-corpo').innerHTML = blocchi.join('');
  const chiavi = new Set(documenti.flatMap((x) => mesiDelDocumento(x.d)).map((m) => chiaveMese(m.anno, m.mese)));
  $('pdfc-riepilogo').textContent = `${chiavi.size} ${chiavi.size === 1 ? 'mese' : 'mesi'} da registrare.`;
  $('pdfc-ok').textContent = chiavi.size ? `Registra ${chiavi.size} ${chiavi.size === 1 ? 'mese' : 'mesi'}` : 'Conferma';
}

document.addEventListener('change', (e) => {
  const el = e.target;
  if (!caricamentoPdf || el.dataset.pdfc == null) return;
  const x = caricamentoPdf.documenti[+el.dataset.pdfc];
  if (x) { x.togliManuali = el.checked; disegnaPdfCorrispettivi(); }
});

async function salvaPdf(d) {
  if (!DESKTOP) return '';
  const nome = d.tipo === 'mensile' ? `Corrispettivi ${nomeMese(d.mese)} ${d.anno}` : `Riepilogo Corrispettivi ${d.anno}`;
  try {
    const r = await window.gestionale.salvaAllegato(`corrispettivi/${d.anno}`, nome, d.bytes);
    return r.ok ? r.rel : '';
  } catch (_) { return ''; }
}

async function confermaPdfCorrispettivi() {
  if (!caricamentoPdf) return;
  const lavoro = caricamentoPdf; caricamentoPdf = null;
  chiudi($('pdfc-modal'));
  const registrati = new Set();
  let riep = 0, tolti = 0, allegatiPersi = 0;
  let id = Date.now();
  for (const { d, togliManuali } of lavoro.documenti) {
    const allegato = await salvaPdf(d);
    if (DESKTOP && !allegato) allegatiPersi++;
    const mesi = mesiDelDocumento(d);
    if (d.tipo === 'riepilogo') {
      appState.registroRiepiloghi[d.anno] = { aggiornatoFino: d.aggiornatoFino, aliquote: d.aliquote, totale: d.totale, mesi: mesi.map((m) => m.mese), allegato, caricato: oggi() };
      riep++;
    }
    for (const m of mesi) {
      const chiave = chiaveMese(m.anno, m.mese);
      const manuale = (v) => togliManuali && !v.registro && delMese(v, m.anno, m.mese);
      tolti += appState.entrate.filter(manuale).length;
      appState.entrate = appState.entrate.filter((v) => v.registro !== chiave && !manuale(v));
      const voci = vociDelMese(m, allegato, id);
      id += voci.length;
      appState.entrate.push(...voci);
      registrati.add(chiave);
    }
  }
  appState.entrate.sort((a, b) => a.data.localeCompare(b.data));
  appState.isDemo = false;
  saveState();
  popolaAnni(); renderAll(); switchTab('corrispettivi');
  const parti = [
    registrati.size ? `${registrati.size} ${registrati.size === 1 ? 'mese registrato' : 'mesi registrati'}` : '',
    riep ? 'riepilogativo tenuto come controllo' : '',
    tolti ? `${tolti} ${tolti === 1 ? 'voce inserita a mano tolta' : 'voci inserite a mano tolte'}` : '',
  ].filter(Boolean);
  showToast((parti.join(', ') || 'Nessun mese da registrare') + '.' + (allegatiPersi ? ' Alcuni PDF non sono stati allegati.' : ''), allegatiPersi > 0);
}

/* Riquadro di controllo nel tab: il riepilogativo contro quello che c'è nell'app */
function disegnaControlloRegistro(anno) {
  const box = $('co-controllo');
  const r = appState.registroRiepiloghi[anno];
  if (!r) { box.classList.add('hidden'); box.innerHTML = ''; return; }
  const inApp = corrispettiviInApp((v) => annoDi(v.data) === anno);
  const attesi = Array.isArray(r.mesi) ? r.mesi : Array.from({ length: r.aggiornatoFino || 12 }, (_, i) => i + 1);
  const mancanti = attesi.filter((m) => !appState.entrate.some((v) => v.registro === chiaveMese(anno, m))).map((m) => NOMI_MESI[m - 1]);
  const ok = Math.abs(r.totale.lordo - inApp.tot.lordo) < 0.01;
  const att = r.allegato && DESKTOP ? `<button type="button" data-action="apri-allegato" data-rel="${esc(r.allegato)}" class="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold">📎 Apri riepilogativo</button>` : '';
  box.innerHTML = `<div class="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
      <div>
        <h3 class="text-base font-bold text-slate-900">Controllo con il Registro Corrispettivi ${anno}</h3>
        <p class="text-xs text-slate-500">Riepilogativo${r.aggiornatoFino ? ` aggiornato fino a ${NOMI_MESI[r.aggiornatoFino - 1]}` : ''}, caricato il ${fmtData(r.caricato)}.
          ${ok ? '<strong class="text-emerald-700">I totali coincidono.</strong>' : '<strong class="text-amber-700">I totali non coincidono: ricarica il riepilogativo per registrare i mesi.</strong>'}</p>
      </div>${att}
    </div>
    <div class="text-xs overflow-x-auto">${tabellaAliquote([...r.aliquote.filter((a) => a.lordo), { totale: true, ...r.totale }], { titolo: 'Rispetto all\'app', cella: cellaDifferenza(inApp) })}</div>
    ${inApp.esenti ? `<p class="mt-2 text-xs text-slate-500">Operazioni esenti o non imponibili registrate: ${fmtEuro(inApp.esenti)} (fuori dal «Calcolo IVA»).</p>` : ''}
    ${mancanti.length ? `<p class="mt-3 text-xs text-slate-600">Mesi con incassi nel Registro ma non registrati dal PDF: <strong>${mancanti.join(', ')}</strong>${inApp.tot.lordo ? ' (se li hai inseriti a mano, contano lo stesso nel confronto)' : ''}.</p>` : ''}`;
  box.classList.remove('hidden');
}


// ---------------------------------------------------------------------------
// Controlli collegati allo stato
// ---------------------------------------------------------------------------
function popolaAnni() {
  const anni = new Set([new Date().getFullYear(), new Date().getFullYear() - 1, appState.anno]);
  for (const x of [...appState.entrate, ...appState.acquisti, ...appState.parcelle]) if (annoDi(x.data)) anni.add(annoDi(x.data));
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
  for (const id of CAMPI_DATA) $(id).value = dataDefault();
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
  const parcelle = appState.parcelle.filter((x) => annoDi(x.data) === anno);
  const ivaTrim = { 1: { debito: 0, credito: 0 }, 2: { debito: 0, credito: 0 }, 3: { debito: 0, credito: 0 }, 4: { debito: 0, credito: 0 } };
  const XML_BADGE = '<span class="ml-1.5 align-middle px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold" title="Importata dalla fattura elettronica">XML</span>';
  const vuota = (col, testo) => `<tr><td colspan="${col}" class="py-8 text-center text-slate-400 text-xs">${testo}</td></tr>`;
  const btnElimina = (azione, id) => `<td class="py-3 px-4 text-center"><button data-action="${azione}" data-id="${id}" class="text-rose-500 hover:text-rose-700 text-xs font-semibold px-2 py-1 rounded-lg hover:bg-rose-50">Elimina</button></td>`;

  // 1. Entrate: fatture emesse e corrispettivi
  let totRicaviImp = 0;
  const REGIME = {
    IT_22: '<span class="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[11px] whitespace-nowrap">IT IVA 22%</span>',
    CH_ART8: '<span class="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 text-[11px] font-semibold whitespace-nowrap">Svizzera art. 8 (0%)</span>',
    UE_ART41: '<span class="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 text-[11px] font-semibold whitespace-nowrap">UE VIES art. 41 (0%)</span>',
  };
  const tot = { fe: { imp: 0, iva: 0, lordo: 0, n: 0 }, co: { imp: 0, iva: 0, lordo: 0, n: 0 } };
  const htmlEnt = { fe: '', co: '' };
  for (const item of entrate) {
    const b = calcEntrataBreakdown(item);
    const q = getTrimestre(item.data);
    const p = item.tipo === 'Fattura' ? 'fe' : 'co';
    totRicaviImp += b.imponibile; ivaTrim[q].debito += b.iva;
    tot[p].imp += b.imponibile; tot[p].iva += b.iva; tot[p].lordo += b.totale; tot[p].n++;
    htmlEnt[p] += `<tr data-voce="entrata:${item.id}" class="hover:bg-slate-50/80 transition">
      <td class="py-3 px-4 whitespace-nowrap text-slate-600">${fmtData(item.data)}</td>
      <td class="py-3 px-4 font-semibold text-slate-500">Q${q}</td>
      <td class="py-3 px-4 font-medium text-slate-900 min-w-[200px]">${esc(item.desc)}${item.xml ? XML_BADGE : ''}${item.registro ? badgeRegistro(item) : ''}</td>
      ${p === 'fe' ? `<td class="py-3 px-4">${REGIME[item.regime] || esc(item.regime)}</td>` : ''}
      <td class="py-3 px-4 text-right font-semibold text-slate-900 whitespace-nowrap">${fmtEuro(b.imponibile)}</td>
      <td class="py-3 px-4 text-right text-rose-600 whitespace-nowrap">${fmtEuro(b.iva)}</td>
      <td class="py-3 px-4 text-right font-bold text-slate-900 whitespace-nowrap">${fmtEuro(b.totale)}</td>
      ${btnElimina('del-entrata', item.id)}
    </tr>`;
  }
  $('tbody-fatture').innerHTML = htmlEnt.fe || vuota(8, `Nessuna fattura emessa nel ${anno}. Usa il modulo qui sopra per registrarne una.`);
  $('count-fe').textContent = tot.fe.n;
  $('tot-fe-imp').textContent = fmtEuro(tot.fe.imp);
  $('tot-fe-iva').textContent = fmtEuro(tot.fe.iva);
  disegnaControlloRegistro(anno);
  $('tbody-corrispettivi').innerHTML = htmlEnt.co || vuota(7, `Nessun corrispettivo nel ${anno}. Registra gli incassi del registratore telematico.`);
  $('tot-co-lordo').textContent = fmtEuro(tot.co.lordo);
  $('tot-co-imp').textContent = fmtEuro(tot.co.imp);
  $('tot-co-iva').textContent = fmtEuro(tot.co.iva);

  // 2. Acquisti: fatture dei fornitori e abbonamenti/acquisti/spese
  let totCostiDeducibili = 0;
  const PROV = {
    IT: '',
    UE_MERCE: '<span class="inline-block mt-1 px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-[10px] font-bold">UE • Autofattura TD18</span>',
    CH_BOLLA: '<span class="inline-block mt-1 px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[10px] font-bold">Svizzera • Bolla doganale</span>',
    CH_SERVIZI: '<span class="inline-block mt-1 px-2 py-0.5 rounded bg-purple-50 text-purple-700 text-[10px] font-bold">Servizi esteri • Autofattura TD17</span>',
  };
  const totSp = { fo: { det: 0, ded: 0 }, es: { det: 0, ded: 0 }, acq: { det: 0, ded: 0 } };
  const htmlSp = { fo: '', es: '', acq: '' };
  for (const item of acquisti) {
    const b = calcAcquistoBreakdown(item);
    const q = getTrimestre(item.data);
    const p = item.sezione === 'fornitori' ? 'fo' : item.sezione === 'estero' ? 'es' : 'acq';
    totCostiDeducibili += b.costoDeducibile;
    ivaTrim[q].debito += b.ivaDebitoRC; ivaTrim[q].credito += b.ivaDetraibile;
    totSp[p].det += b.ivaDetraibile; totSp[p].ded += b.costoDeducibile;
    htmlSp[p] += `<tr data-voce="acquisto:${item.id}" class="hover:bg-slate-50/80 transition">
      <td class="py-3 px-4 whitespace-nowrap text-slate-600">${fmtData(item.data)}</td>
      <td class="py-3 px-4 font-semibold text-slate-500">Q${q}</td>
      <td class="py-3 px-4 min-w-[220px]"><div class="font-medium text-slate-900">${esc(item.desc)}${item.xml ? XML_BADGE : ''}</div>${PROV[item.provenienza] || ''}${termineAutofattura(item)}</td>
      <td class="py-3 px-4 text-xs text-slate-600 min-w-[140px]">${b.rule.badge}</td>
      <td class="py-3 px-4 text-right font-medium text-slate-800 whitespace-nowrap">${fmtEuro(b.imponibile)}</td>
      <td class="py-3 px-4 text-right text-slate-500 whitespace-nowrap">${fmtEuro(b.ivaDocumento)}</td>
      <td class="py-3 px-4 text-right font-semibold text-emerald-700 whitespace-nowrap">${fmtEuro(b.ivaDetraibile)}</td>
      <td class="py-3 px-4 text-right font-bold text-slate-900 whitespace-nowrap">${fmtEuro(b.costoDeducibile)}</td>
      ${btnElimina('del-acquisto', item.id)}
    </tr>`;
  }
  $('tbody-fornitori').innerHTML = htmlSp.fo || vuota(9, `Nessuna fattura di fornitori nel ${anno}. Registra qui merce e servizi acquistati per la rivendita.`);
  $('tot-fo-iva-det').textContent = fmtEuro(totSp.fo.det);
  $('tot-fo-costo-ded').textContent = fmtEuro(totSp.fo.ded);
  $('tbody-estero').innerHTML = htmlSp.es || vuota(9, `Nessun acquisto dall'estero nel ${anno}. Registra qui merce UE, servizi esteri e importazioni con bolla doganale.`);
  $('tot-es-iva-det').textContent = fmtEuro(totSp.es.det);
  $('tot-es-costo-ded').textContent = fmtEuro(totSp.es.ded);
  $('tbody-acquisti').innerHTML = htmlSp.acq || vuota(9, `Nessuna spesa nel ${anno}. Registra abbonamenti, bollette, carburante e le altre spese del negozio.`);
  $('tot-acq-iva-det').textContent = fmtEuro(totSp.acq.det);
  $('tot-acq-costo-ded').textContent = fmtEuro(totSp.acq.ded);

  // 3. Commercialista: le parcelle sono costi come gli altri, con in più la ritenuta
  let paSpeso = 0, paNetto = 0, paCosto = 0, ritDaVersare = 0;
  const ritScadute = [], ritProssime = [];
  const adesso = new Date(); adesso.setHours(0, 0, 0, 0);
  let html = '';
  for (const item of parcelle) {
    const b = calcParcella(item);
    const q = getTrimestre(item.data);
    totCostiDeducibili += b.costoDeducibile;
    ivaTrim[q].credito += b.iva;
    paSpeso += b.totale; paNetto += b.netto; paCosto += b.costoDeducibile;
    const sc = scadenzaRitenuta(item.pagamento);
    let stato;
    if (!b.ritenuta) stato = '<span class="text-slate-400 text-xs">Nessuna (forfettario)</span>';
    else {
      if (!item.ritenutaVersata) {
        ritDaVersare += b.ritenuta;
        if (sc && sc < adesso) ritScadute.push({ item, b, sc });
        else if (sc) ritProssime.push({ item, b, sc });
      }
      const scaduta = !item.ritenutaVersata && sc && sc < adesso;
      stato = `<div class="flex flex-col gap-1 min-w-[170px]">
        <label class="text-[11px] text-slate-500">Pagata il
          <input type="date" data-id="${item.id}" data-campo="pagamento" value="${esc(item.pagamento || '')}" class="ml-1 px-1.5 py-0.5 rounded-md border border-slate-300 text-xs" /></label>
        <span class="text-[11px] ${scaduta ? 'text-rose-600 font-bold' : 'text-slate-500'}">${sc ? (scaduta ? 'Scaduta il ' : 'Entro ') + sc.toLocaleDateString('it-IT') : 'Scade il 16 del mese dopo il pagamento'}</span>
        <label class="inline-flex items-center gap-1.5 text-xs font-semibold ${item.ritenutaVersata ? 'text-emerald-700' : 'text-slate-700'}">
          <input type="checkbox" data-id="${item.id}" data-campo="versata" ${item.ritenutaVersata ? 'checked' : ''} class="accent-emerald-600" /> Versata</label>
      </div>`;
    }
    html += `<tr data-voce="parcella:${item.id}" class="hover:bg-slate-50/80 transition align-top">
      <td class="py-3 px-4 whitespace-nowrap text-slate-600">${fmtData(item.data)}</td>
      <td class="py-3 px-4 font-medium text-slate-900 min-w-[220px]">${esc(item.desc)}${item.xml ? XML_BADGE : ''}${item.regime === 'forfettario' ? '<div class="text-[10px] font-bold text-slate-500 mt-1">FORFETTARIO</div>' : ''}</td>
      <td class="py-3 px-4 text-right whitespace-nowrap">${fmtEuro(b.imponibileIva)}</td>
      <td class="py-3 px-4 text-right text-emerald-700 whitespace-nowrap">${fmtEuro(b.iva)}</td>
      <td class="py-3 px-4 text-right font-bold text-slate-900 whitespace-nowrap">${fmtEuro(b.totale)}</td>
      <td class="py-3 px-4 text-right text-rose-600 whitespace-nowrap">${b.ritenuta ? fmtEuro(b.ritenuta) : '—'}</td>
      <td class="py-3 px-4 text-right font-semibold whitespace-nowrap">${fmtEuro(b.netto)}</td>
      <td class="py-3 px-4">${stato}</td>
      ${btnElimina('del-parcella', item.id)}
    </tr>`;
  }
  $('tbody-parcelle').innerHTML = html || vuota(9, `Nessuna parcella nel ${anno}. Registra le fatture del commercialista per tenere il conto delle ritenute da versare.`);
  $('kpi-pa-speso').textContent = fmtEuro(paSpeso);
  $('kpi-pa-speso-sub').textContent = +s.commLordo > 0 ? `Su ${fmtEuro(s.commLordo)} previsti all'anno (${Math.round(paSpeso / s.commLordo * 100)}%)` : 'Totale delle parcelle';
  $('kpi-pa-netto').textContent = fmtEuro(paNetto);
  $('kpi-pa-rit').textContent = fmtEuro(ritDaVersare);
  $('kpi-pa-costo').textContent = fmtEuro(paCosto);
  const prossima = ritProssime.sort((a, b) => a.sc - b.sc)[0];
  $('kpi-pa-rit-sub').textContent = prossima ? `Prossima: ${fmtGiorno(prossima.sc)} (cod. 1040)` : 'F24 codice 1040';
  const avviso = $('pa-avviso');
  if (ritScadute.length) {
    avviso.classList.remove('hidden');
    avviso.innerHTML = `<strong>Ritenute scadute non segnate come versate:</strong> ` + ritScadute
      .map((r) => `${esc(r.item.desc)} — ${fmtEuro(r.b.ritenuta)} (scadenza ${r.sc.toLocaleDateString('it-IT')})`).join('; ')
      + '. Se le hai già pagate spunta «Versata»; altrimenti versale subito con il ravvedimento operoso, che riduce la sanzione.';
  } else avviso.classList.add('hidden');

  // 4. Liquidazione IVA trimestrale
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

  // 5. Utile, imposte dei soci e INPS
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

  // 6. Cruscotto
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
      <p class="text-[11px] text-slate-500 mt-1">Nessun compenso. I contributi INPS si attivano nella scheda 8.</p>
    </div>`;
  applicaRicerche();
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
// Ricerca nelle tabelle
// ---------------------------------------------------------------------------
/* Ogni tab con un elenco ha la sua barra di ricerca: filtra le righe dell'anno
   aperto per descrizione, cliente o fornitore, Partita IVA, data o importo
   (più parole: devono esserci tutte) e conta i risultati negli altri anni.
   Ctrl+F porta alla barra del tab aperto, Esc la svuota. */
const RICERCHE = [
  { tbody: 'tbody-fatture', tipo: 'entrata', voci: () => appState.entrate.filter((x) => x.tipo === 'Fattura'), ph: 'Cerca cliente, numero, data o importo…' },
  { tbody: 'tbody-corrispettivi', tipo: 'entrata', voci: () => appState.entrate.filter((x) => x.tipo !== 'Fattura'), ph: 'Cerca mese, data o importo…' },
  { tbody: 'tbody-fornitori', tipo: 'acquisto', voci: () => appState.acquisti.filter((x) => x.sezione === 'fornitori'), ph: 'Cerca fornitore, numero, data o importo…' },
  { tbody: 'tbody-estero', tipo: 'acquisto', voci: () => appState.acquisti.filter((x) => x.sezione === 'estero'), ph: 'Cerca fornitore, numero, data o importo…' },
  { tbody: 'tbody-acquisti', tipo: 'acquisto', voci: () => appState.acquisti.filter((x) => x.sezione !== 'fornitori' && x.sezione !== 'estero'), ph: 'Cerca spesa, fornitore, categoria, data o importo…' },
  { tbody: 'tbody-parcelle', tipo: 'parcella', voci: () => appState.parcelle, ph: 'Cerca professionista, numero, data o importo…' },
];
const normTesto = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').toLowerCase();
const importoTesti = (n) => {
  const v = Math.round((+n || 0) * 100) / 100;
  return [fmtEuro(v), v.toFixed(2).replace('.', ','), String(v).replace('.', ',')];
};
const NOMI_REGIME = { IT_22: 'IVA 22%', IT_10: 'IVA 10%', IT_4: 'IVA 4%', ESENTE: 'esente', CH_ART8: 'Svizzera art. 8', UE_ART41: 'UE art. 41' };

function testoVoce(tipo, x) {
  const parti = [x.desc, fmtData(x.data), x.data];
  const cp = controparteDi(tipo, x);
  if (cp) parti.push(cp.nome, cp.piva);
  if (tipo === 'entrata') {
    const b = calcEntrataBreakdown(x);
    parti.push(...importoTesti(b.imponibile), ...importoTesti(b.iva), ...importoTesti(b.totale), NOMI_REGIME[x.regime]);
  } else if (tipo === 'acquisto') {
    const b = calcAcquistoBreakdown(x);
    parti.push(...importoTesti(b.imponibile), ...importoTesti(b.ivaDocumento), ...importoTesti(b.imponibile + b.ivaDocumento),
      ...importoTesti(b.ivaDetraibile), ...importoTesti(b.costoDeducibile), b.rule.label, b.notaEstero);
  } else {
    const b = calcParcella(x);
    parti.push(...importoTesti(b.imponibileIva), ...importoTesti(b.iva), ...importoTesti(b.totale), ...importoTesti(b.ritenuta), ...importoTesti(b.netto), x.regime);
  }
  if (x.xml) parti.push('xml');
  return normTesto(parti.filter(Boolean).join(' | '));
}
const trovata = (testo, parole) => parole.every((p) => testo.includes(p));

function installaRicerche() {
  const lente = '<svg aria-hidden="true" viewBox="0 0 20 20" class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" stroke-width="2"><circle cx="8.5" cy="8.5" r="5.5"/><path d="m13 13 4.5 4.5" stroke-linecap="round"/></svg>';
  for (const r of RICERCHE) {
    const card = $(r.tbody).closest('.rounded-2xl');
    if (!card || card.querySelector('[data-cerca]')) continue;
    const barra = document.createElement('div');
    barra.className = 'px-5 py-3 border-b border-slate-200 bg-slate-50/60 flex flex-wrap items-center gap-x-3 gap-y-1.5 no-print';
    barra.innerHTML = `<label class="relative flex-1 min-w-[200px] max-w-md">
        <span class="sr-only">Cerca</span>${lente}
        <input type="search" data-cerca="${r.tbody}" placeholder="${esc(r.ph)}" autocomplete="off" spellcheck="false"
          class="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 bg-white text-sm focus:ring-2 focus:ring-amber-500 outline-none" />
      </label>
      <span data-cerca-esito="${r.tbody}" class="text-xs text-slate-500" aria-live="polite"></span>`;
    card.firstElementChild.after(barra);
  }
}

function applicaRicerche() {
  for (const r of RICERCHE) {
    const input = document.querySelector(`[data-cerca="${r.tbody}"]`);
    if (!input) continue;
    const esito = document.querySelector(`[data-cerca-esito="${r.tbody}"]`);
    const tb = $(r.tbody);
    tb.querySelectorAll('[data-nessuno]').forEach((el) => el.remove());
    const parole = normTesto(input.value).split(' ').filter(Boolean);
    const righe = [...tb.querySelectorAll('tr[data-voce]')];
    // la riga «nessun movimento» resta solo senza ricerca
    tb.querySelectorAll('tr:not([data-voce])').forEach((tr) => tr.classList.toggle('hidden', parole.length > 0));
    if (!parole.length) { righe.forEach((tr) => tr.classList.remove('hidden')); esito.textContent = ''; continue; }
    const voci = r.voci();
    const perRif = new Map(voci.map((x) => [`${r.tipo}:${x.id}`, x]));
    let n = 0;
    for (const tr of righe) {
      const x = perRif.get(tr.dataset.voce);
      const ok = !!x && trovata(testoVoce(r.tipo, x), parole);
      tr.classList.toggle('hidden', !ok);
      if (ok) n++;
    }
    const altri = new Map();
    for (const x of voci) {
      const a = annoDi(x.data);
      if (a && a !== appState.anno && trovata(testoVoce(r.tipo, x), parole)) altri.set(a, (altri.get(a) || 0) + 1);
    }
    let html = `<strong class="text-slate-800">${n}</strong> ${n === 1 ? 'risultato' : 'risultati'} su ${righe.length} nel ${appState.anno}`;
    if (altri.size) html += ' · anche ' + [...altri].sort((a, b) => b[0] - a[0])
      .map(([a, k]) => `<button type="button" data-action="cerca-anno" data-anno="${a}" class="text-amber-700 font-semibold hover:underline">${k} nel ${a}</button>`).join(', ');
    esito.innerHTML = html;
    if (!n) {
      const col = tb.closest('table').querySelectorAll('thead th').length;
      tb.insertAdjacentHTML('beforeend', `<tr data-nessuno><td colspan="${col}" class="py-8 text-center text-slate-400 text-xs">Nessun risultato per «${esc(input.value.trim())}» nel ${appState.anno}.</td></tr>`);
    }
  }
}

function cambiaAnnoRicerca(anno) {
  if (!anno) return;
  $('sel-anno').value = anno;
  $('sel-anno').dispatchEvent(new Event('change'));
}

document.addEventListener('input', (e) => { if (e.target.dataset && e.target.dataset.cerca) applicaRicerche(); });
document.addEventListener('keydown', (e) => {
  if (e.target.dataset && e.target.dataset.cerca && e.key === 'Escape' && e.target.value) {
    e.target.value = ''; applicaRicerche(); e.stopImmediatePropagation(); return;
  }
  if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'f') {
    if ([...document.querySelectorAll('.fixed.inset-0')].some((m) => !m.classList.contains('hidden'))) return;
    const tab = document.querySelector('.tab-content:not(.hidden)');
    const input = tab && tab.querySelector('[data-cerca]');
    if (input) { e.preventDefault(); input.focus(); input.select(); }
  }
}, true);

// ---------------------------------------------------------------------------
// Spostare una fattura in un altro tab (tasto destro) e regole per controparte
// ---------------------------------------------------------------------------
/* Una fattura finita nel tab sbagliato si sposta col tasto destro: l'app
   converte la voce (fattura emessa, acquisto di una delle tre sezioni o
   parcella) tenendo data, descrizione, importi e collegamento all'XML.
   Per le fatture di cui si conosce il cliente o il fornitore si può creare
   una regola: le altre già registrate si spostano subito e quelle importate
   in futuro vengono proposte direttamente in quel tab. */
const SPOSTABILI = ['fatture', 'fornitori', 'estero', 'spese', 'commercialista'];
const NOMI_TAB = {
  fatture: '2. Fatture emesse', fornitori: '4. Fatture ricevute fornitori', estero: '5. Autofatture/Fatture estere',
  spese: '6. Abbonamenti/Acquisti/Spese', commercialista: '7. Commercialista',
};
const TAB_DI_DEST = { fatture: 'fatture', fornitori: 'fornitori', estero: 'estero', spese: 'acquisti', commercialista: 'commercialista' };
const COLLEZIONE = { entrata: 'entrate', acquisto: 'acquisti', parcella: 'parcelle' };
const r2 = (n) => Math.round((+n || 0) * 100) / 100;
const normNome = (s) => normTesto(s).replace(/[^a-z0-9]/g, '');

function trovaVoce(rif) {
  const [tipo, id] = String(rif || '').split(':');
  const lista = appState[COLLEZIONE[tipo]];
  const x = lista && lista.find((v) => String(v.id) === id);
  return x ? { tipo, x } : null;
}
const destDi = (tipo, x) => (tipo === 'entrata' ? 'fatture' : tipo === 'parcella' ? 'commercialista' : x.sezione || 'spese');
const tutteLeVoci = () => [
  ...appState.entrate.filter((x) => x.tipo === 'Fattura').map((x) => ({ tipo: 'entrata', x })),
  ...appState.acquisti.map((x) => ({ tipo: 'acquisto', x })),
  ...appState.parcelle.map((x) => ({ tipo: 'parcella', x })),
];

/* Cliente o fornitore della fattura elettronica, secondo dove va registrata */
function controparteFattura(f, dest) {
  const c = dest === 'fatture' ? f.cessionario : f.cedente;
  return { nome: String(c.nome || '').trim(), piva: pulisciPiva(c.piva || c.cf) };
}
/* Le fatture importate prima della 2.5 non hanno la controparte salvata: si
   ricava dalla descrizione e, per le ricevute, dalla chiave dell'XML. */
function controparteDi(tipo, x) {
  if (x.cp && (x.cp.nome || x.cp.piva)) return x.cp;
  if (!x.xml) return null;
  const d = String(x.desc || '');
  let m = d.match(/^(?:Nota di credito |Fatt\. )n\. \S+ - (.+)$/);
  let nome = m ? m[1] : '';
  if (!nome) { m = d.match(/^(.+?) - (?:Nota di credito |Fatt\. )n\. /); nome = m ? m[1] : ''; }
  const seg = String(x.xml).split('|')[0];
  const piva = tipo === 'entrata' || seg === pulisciPiva(imp().piva) ? '' : seg;
  return nome || piva ? { nome: nome.trim(), piva } : null;
}
function stessaControparte(a, b) {
  if (!a || !b) return false;
  if (a.piva && b.piva) return a.piva === b.piva;
  const na = normNome(a.nome);
  return !!na && na === normNome(b.nome);
}
function regolaPer(cp) {
  if (!cp || (cp.piva && cp.piva === pulisciPiva(imp().piva))) return null;
  return appState.regole.find((r) => stessaControparte(r, cp)) || null;
}

function importiDi(tipo, x) {
  if (tipo === 'entrata') { const b = calcEntrataBreakdown(x); return { imponibile: b.imponibile, iva: b.iva }; }
  if (tipo === 'parcella') { const b = calcParcella(x); return { imponibile: b.imponibileIva + b.esenti + b.bollo, iva: b.iva }; }
  return { imponibile: parseFloat(x.imponibile) || 0, iva: parseFloat(x.iva) || 0 };
}

/* Converte una voce nel tipo del tab di destinazione */
function convertiVoce(tipo, x, dest, opz = {}) {
  const cp = controparteDi(tipo, x);
  const base = { id: x.id, data: x.data, desc: x.desc };
  for (const k of ['xml', 'allegato', 'prof']) if (x[k] != null) base[k] = x[k];
  if (cp) base.cp = cp;
  // i dati del professionista restano da parte, per un eventuale ritorno
  if (tipo === 'parcella') {
    base.prof = { regime: x.regime, cassaPct: +x.cassaPct || 0, esenti: +x.esenti || 0, bollo: calcParcella(x).bollo, pagamento: x.pagamento || '', ritenutaVersata: !!x.ritenutaVersata };
  }
  const { imponibile, iva } = importiDi(tipo, x);

  if (dest === 'fatture') {
    return { tipo: 'entrata', voce: { ...base, tipo: 'Fattura', regime: iva ? 'IT_22' : 'ESENTE', totale: r2(imponibile + iva), imponibile: r2(imponibile), iva: r2(iva) } };
  }
  if (dest === 'commercialista') {
    const pr = base.prof || {};
    delete base.prof;
    const cassaPct = +pr.cassaPct || 0, esenti = +pr.esenti || 0, bollo = +pr.bollo || 0;
    const forf = pr.regime ? pr.regime === 'forfettario' : !iva;
    return {
      tipo: 'parcella',
      voce: {
        ...base, regime: forf ? 'forfettario' : 'ordinario',
        onorario: r2((imponibile - esenti - bollo) / (1 + cassaPct / 100)), cassaPct, esenti,
        pagamento: pr.pagamento || '', ritenutaVersata: !!pr.ritenutaVersata,
      },
    };
  }
  // una delle tre sezioni degli acquisti
  const prima = tipo === 'acquisto' ? x : {};
  const voce = tipo === 'acquisto' ? { ...x } : { ...base, imponibile: r2(imponibile), iva: r2(iva) };
  let provenienza = opz.provenienza || prima.provenienza || 'IT';
  if (dest === 'fornitori') provenienza = 'IT';
  Object.assign(voce, { sezione: dest, sezioneManuale: true, provenienza, categoria: opz.categoria || prima.categoria || 'merce_100_100' });
  if (cp) voce.cp = cp;
  return { tipo: 'acquisto', voce };
}

function applicaSpostamento(tipo, x, dest, opz) {
  const { tipo: nuovoTipo, voce } = convertiVoce(tipo, x, dest, opz);
  appState[COLLEZIONE[tipo]] = appState[COLLEZIONE[tipo]].filter((v) => v !== x);
  const arrivo = appState[COLLEZIONE[nuovoTipo]];
  while (arrivo.some((v) => v.id === voce.id)) voce.id = Date.now() + Math.floor(Math.random() * 100000);
  arrivo.push(voce);
}

// --- menu col tasto destro ---
let menuVoce = null;
function chiudiMenuVoce() {
  if (!menuVoce) return false;
  menuVoce.remove(); menuVoce = null;
  return true;
}

document.addEventListener('contextmenu', (e) => {
  chiudiMenuVoce();
  const tr = e.target.closest('tr[data-voce]');
  if (!tr || e.target.closest('input, select, textarea')) return;
  const v = trovaVoce(tr.dataset.voce);
  if (!v || (v.tipo === 'entrata' && v.x.tipo !== 'Fattura')) return;
  e.preventDefault();
  const qui = destDi(v.tipo, v.x);
  const cp = controparteDi(v.tipo, v.x);
  const regola = regolaPer(cp);
  const m = document.createElement('div');
  m.setAttribute('role', 'menu');
  m.className = 'fixed z-[60] w-72 max-w-[calc(100vw-16px)] bg-white rounded-xl shadow-2xl border border-slate-200 py-1.5 text-sm';
  m.innerHTML = `<div class="px-3.5 pt-1 pb-2 border-b border-slate-100">
      <div class="font-semibold text-slate-900 truncate">${esc(cp && cp.nome ? cp.nome : v.x.desc)}</div>
      <div class="text-[11px] text-slate-500 truncate">${esc(fmtData(v.x.data))} · ora in ${esc(NOMI_TAB[qui])}</div>
      ${regola ? `<div class="text-[11px] text-amber-700 font-semibold mt-0.5 truncate">Regola: sempre in ${esc(NOMI_TAB[regola.dest])}</div>` : ''}
    </div>
    <div class="px-3.5 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">Sposta in</div>
    ${SPOSTABILI.filter((d) => d !== qui).map((d) => `<button type="button" role="menuitem" data-action="menu-sposta" data-voce="${esc(tr.dataset.voce)}" data-dest="${d}"
      class="w-full text-left px-3.5 py-2 hover:bg-amber-50 focus:bg-amber-50 outline-none text-slate-800">${esc(NOMI_TAB[d])}</button>`).join('')}
    <div class="my-1 border-t border-slate-100"></div>
    <button type="button" role="menuitem" data-action="menu-elimina" data-voce="${esc(tr.dataset.voce)}" class="w-full text-left px-3.5 py-2 hover:bg-rose-50 focus:bg-rose-50 outline-none text-rose-600">Elimina…</button>`;
  document.body.appendChild(m);
  const w = m.offsetWidth, h = m.offsetHeight;
  m.style.left = Math.max(8, Math.min(e.clientX, innerWidth - w - 8)) + 'px';
  m.style.top = Math.max(8, Math.min(e.clientY, innerHeight - h - 8)) + 'px';
  menuVoce = m;
  m.querySelector('button').focus({ preventScroll: true });
});
document.addEventListener('mousedown', (e) => { if (menuVoce && !menuVoce.contains(e.target)) chiudiMenuVoce(); });
window.addEventListener('resize', chiudiMenuVoce);
window.addEventListener('blur', chiudiMenuVoce);
document.addEventListener('scroll', (e) => { if (menuVoce && !menuVoce.contains(e.target)) chiudiMenuVoce(); }, true);
document.addEventListener('keydown', (e) => {
  if (!menuVoce || !['ArrowDown', 'ArrowUp', 'Tab'].includes(e.key)) return;
  e.preventDefault();
  const voci = [...menuVoce.querySelectorAll('button')];
  const i = voci.indexOf(document.activeElement);
  const su = e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey);
  voci[(i + (su ? -1 : 1) + voci.length) % voci.length].focus();
});

function eliminaVoce(rif) {
  const v = trovaVoce(rif);
  if (!v) return;
  ({ entrata: deleteEntrata, acquisto: deleteAcquisto, parcella: deleteParcella })[v.tipo](v.x.id);
}

// --- finestra di conferma dello spostamento ---
let spostamento = null;

function chiediSpostamento(rif, dest) {
  const v = trovaVoce(rif);
  if (!v || !SPOSTABILI.includes(dest)) return;
  const cp = controparteDi(v.tipo, v.x);
  const mia = pulisciPiva(imp().piva);
  const conRegola = !!cp && !(cp.piva && cp.piva === mia) && !!(cp.piva || normNome(cp.nome));
  const altre = conRegola ? tutteLeVoci().filter((w) => w.x !== v.x && stessaControparte(controparteDi(w.tipo, w.x), cp)) : [];
  const daSpostare = altre.filter((w) => destDi(w.tipo, w.x) !== dest).length;
  const regola = conRegola ? regolaPer(cp) : null;
  spostamento = { rif, v, dest, cp, conRegola };

  $('sposta-titolo').textContent = `Spostare in «${NOMI_TAB[dest]}»?`;
  $('sposta-desc').textContent = `${fmtData(v.x.data)} — ${v.x.desc}`;

  // categoria e provenienza servono solo agli acquisti
  const campi = [];
  if (dest === 'estero') {
    const attuale = v.tipo === 'acquisto' && v.x.provenienza !== 'IT' ? v.x.provenienza : (regola && regola.provenienza) || 'CH_SERVIZI';
    campi.push(`<label class="block text-xs font-semibold text-slate-700">Che acquisto dall'estero è
      <select id="sposta-provenienza" class="mt-1 w-full px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white focus:ring-2 focus:ring-amber-500 outline-none">
        ${[['UE_MERCE', 'Merce da fornitore UE (reverse charge TD18)'], ['CH_BOLLA', 'Svizzera / extra-UE (merce + bolla doganale)'], ['CH_SERVIZI', 'Servizi da fornitore UE o extra-UE (reverse charge TD17)']]
          .map(([k, l]) => `<option value="${k}" ${k === attuale ? 'selected' : ''}>${l}</option>`).join('')}
      </select></label>`);
  }
  if (dest === 'fornitori' || dest === 'estero' || dest === 'spese') {
    const attuale = (v.tipo === 'acquisto' && v.x.categoria) || (regola && regola.categoria) || 'merce_100_100';
    campi.push(`<label class="block text-xs font-semibold text-slate-700">Categoria fiscale
      <select id="sposta-categoria" class="mt-1 w-full px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white focus:ring-2 focus:ring-amber-500 outline-none">
        ${Object.entries(CATEGORIE_SPESA).map(([k, r]) => `<option value="${k}" ${k === attuale ? 'selected' : ''}>${esc(r.label)} (${esc(r.badge)})</option>`).join('')}
      </select></label>`);
  }
  $('sposta-campi').innerHTML = campi.join('');
  $('sposta-campi').classList.toggle('hidden', !campi.length);

  const note = [];
  if (dest === 'fatture') note.push('Diventa una fattura emessa: conta tra i ricavi e la sua IVA è a debito.');
  else if (v.tipo === 'entrata') note.push('Non sarà più un ricavo: diventa un costo.');
  if (dest === 'commercialista') note.push('Diventa una parcella: se il professionista non è forfettario l\'app calcola la ritenuta d\'acconto del 20% sull\'onorario, da versare con F24.');
  $('sposta-nota').textContent = note.join(' ');
  $('sposta-nota').classList.toggle('hidden', !note.length);

  $('sposta-regola-box').classList.toggle('hidden', !conRegola);
  $('sposta-regola').checked = false;
  if (conRegola) {
    const chi = `<strong>${esc(cp.nome || 'P.IVA ' + cp.piva)}</strong>`;
    let testo = daSpostare
      ? `Sposta qui anche ${daSpostare === 1 ? 'l\'altra fattura' : `le altre ${daSpostare} fatture`} di ${chi} già registrate (tutti gli anni) e metti qui anche quelle che importerai in futuro.`
      : `Metti qui in automatico anche le fatture di ${chi} che importerai in futuro.`;
    if (regola && regola.dest !== dest) testo += ` <span class="text-amber-700">Sostituisce la regola attuale (sempre in ${esc(NOMI_TAB[regola.dest])}).</span>`;
    $('sposta-regola-testo').innerHTML = testo;
  }
  $('sposta-ok').textContent = 'Sposta';
  apri($('sposta-modal'));
  $('sposta-ok').focus();
}

function confermaSpostamento() {
  if (!spostamento) return;
  const { v, dest, cp, conRegola } = spostamento;
  const opz = {
    categoria: $('sposta-categoria') ? $('sposta-categoria').value : '',
    provenienza: $('sposta-provenienza') ? $('sposta-provenienza').value : '',
  };
  if (!trovaVoce(spostamento.rif)) { chiudi($('sposta-modal')); spostamento = null; return; }
  applicaSpostamento(v.tipo, v.x, dest, opz);
  let n = 1;
  const conTutte = conRegola && $('sposta-regola').checked;
  if (conTutte) {
    appState.regole = appState.regole.filter((r) => !stessaControparte(r, cp));
    const regola = { nome: cp.nome, piva: cp.piva, dest, creata: oggi() };
    if (opz.categoria) regola.categoria = opz.categoria;
    if (dest === 'estero' && opz.provenienza) regola.provenienza = opz.provenienza;
    appState.regole.push(regola);
    for (const w of tutteLeVoci()) {
      if (!stessaControparte(controparteDi(w.tipo, w.x), cp)) continue;
      if (destDi(w.tipo, w.x) !== dest) { applicaSpostamento(w.tipo, w.x, dest, opz); n++; }
      else if (w.tipo === 'acquisto' && opz.categoria) w.x.categoria = opz.categoria;
    }
  }
  for (const k of ['entrate', 'acquisti', 'parcelle']) appState[k].sort((a, b) => a.data.localeCompare(b.data));
  saveState();
  chiudi($('sposta-modal'));
  spostamento = null;
  renderAll();
  const dove = NOMI_TAB[dest];
  showToast(conTutte
    ? `${n === 1 ? 'Spostata 1 fattura' : `Spostate ${n} fatture`} di ${cp.nome || cp.piva} in ${dove}. Le prossime che importi andranno lì da sole.`
    : `Spostata in ${dove}.`);
}

// --- regole salvate (elenco nelle impostazioni) ---
function disegnaRegole() {
  const el = $('regole-lista');
  if (!el) return;
  const R = appState.regole;
  el.innerHTML = R.length
    ? `<ul class="divide-y divide-slate-100 rounded-xl border border-slate-200">${R.map((r, i) => `<li class="flex items-center justify-between gap-3 px-3 py-2">
        <div class="min-w-0">
          <div class="text-sm font-medium text-slate-900 truncate">${esc(r.nome || 'P.IVA ' + r.piva)}</div>
          <div class="text-[11px] text-slate-500">${r.piva ? 'P.IVA ' + esc(r.piva) + ' · ' : ''}sempre in <strong>${esc(NOMI_TAB[r.dest] || r.dest)}</strong>${r.categoria && CATEGORIE_SPESA[r.categoria] ? ' · ' + esc(CATEGORIE_SPESA[r.categoria].badge) : ''}</div>
        </div>
        <button type="button" data-action="del-regola" data-indice="${i}" class="shrink-0 text-rose-500 hover:text-rose-700 text-xs font-semibold px-2 py-1 rounded-lg hover:bg-rose-50">Elimina</button>
      </li>`).join('')}</ul>`
    : '<p class="text-xs text-slate-400">Nessuna regola. Fai clic col tasto destro su una fattura importata, scegli «Sposta in» e spunta la casella per le altre fatture della stessa ditta.</p>';
}
function eliminaRegola(i) {
  const r = appState.regole[i];
  if (!r) return;
  appState.regole.splice(i, 1);
  saveState(); disegnaRegole();
  showToast(`Regola tolta: le prossime fatture di ${r.nome || r.piva} saranno proposte come prima. Quelle già spostate restano dove sono.`);
}

installaRicerche();

// ---------------------------------------------------------------------------
// Avvio
// ---------------------------------------------------------------------------
(function avvio() {
  for (const id of CAMPI_DATA) $(id).value = dataDefault();
  syncControlsFromState();
  for (const p of Object.keys(MODULI_ENTRATA)) updateEntrataPreview(p);
  for (const p of Object.keys(MODULI_SPESA)) updateAcquistoPreview(p);
  updateParcellaPreview();
  renderAll();
  let tab = 'dashboard';
  try { tab = sessionStorage.getItem('tab') || tab; } catch (_) {}
  switchTab($('tab-' + tab) ? tab : 'dashboard');
  if (!imp().configurate) openSettings();
})();
