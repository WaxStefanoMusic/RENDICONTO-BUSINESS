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
  esente_0_100:     { label: 'Spese bancarie / commissioni / altre esenti art. 10',       ivaDetPct: 0.0, costoDedPct: 1.0,  badge: 'Esente IVA | Costo 100%' },
  trasferta_0_75:   { label: 'Vitto e alloggio in trasferta (ristoranti, hotel)',       ivaDetPct: 1.0, costoDedPct: 0.75, badge: 'IVA 100% con fattura | Costo 75%' },
  interessi_passivi: { label: 'Interessi passivi bancari (fido, scoperto di conto)',   ivaDetPct: 0.0, costoDedPct: 1.0,  badge: 'Esente IVA | Costo 100% (non deducibile IRAP)' },
  // polizze (tab Polizze/Assicurazioni): premi esenti IVA art. 10
  polizza_100:         { label: 'Polizza dell\'attività (RC, incendio/furto negozio, merce, furgone N1)', ivaDetPct: 0.0, costoDedPct: 1.0, badge: 'Esente IVA | Costo 100%', breve: 'Attività' },
  polizza_auto_20:     { label: 'Polizza auto usata anche privatamente dai soci (RCA, furto/incendio)', ivaDetPct: 0.0, costoDedPct: 0.2, badge: 'Esente IVA | Costo 20%', breve: 'Auto promiscua' },
  polizza_personale_0: { label: 'Polizza personale dei soci (vita, infortuni, malattia)',            ivaDetPct: 0.0, costoDedPct: 0.0, badge: 'Esente IVA | Non è un costo della società', breve: 'Personale soci' },
  // solo nel tab Carta Business: movimenti che non sono costi da contare qui
  carta_fatturata:  { label: 'Già fatturata: la fattura è registrata in un altro tab',  ivaDetPct: 0.0, costoDedPct: 0.0, badge: 'Non conta qui (la conta la fattura)' },
  carta_personale:  { label: 'Spesa personale dei soci, non dell\'attività',             ivaDetPct: 0.0, costoDedPct: 0.0, badge: 'Non è un costo della società' },
  carta_movimento:  { label: 'Ricarica, accredito o rimborso della carta',              ivaDetPct: 0.0, costoDedPct: 0.0, badge: 'Non è una spesa' },
};

// ---------------------------------------------------------------------------
// Impostazioni di partenza: generiche, da personalizzare al primo avvio
// ---------------------------------------------------------------------------
const IMPOSTAZIONI_BASE = () => ({
  configurate: false,
  ragione: 'La mia S.N.C.',
  piva: '',
  attivita: 'Vendita al dettaglio • 2 soci + collaboratore familiare',
  regime: 'semplificata',      // contabilità semplificata (quadro RG) o ordinaria (quadro RF)
  s1Nome: 'Socio 1',
  s1Quota: 50,
  s2Nome: 'Socio 2',
  collabNome: 'Collaboratore familiare',
  commLordo: 0,
  commImp: 0,
  commSw: 100,
  irpef1: 23, irpef2: 35, irpef3: 43,
  // addizionale regionale: aliquote sugli scaglioni IRPEF (fino a 15.000, 28.000, 50.000 e oltre);
  // addizionale comunale: aliquota unica su tutto il reddito, salvo la soglia di esenzione del comune
  addReg1: 1.23, addReg2: 1.23, addReg3: 1.23, addReg4: 1.23,
  addCom: 0.8, addComEsenz: 0,
  irap: 3.9, irapDed: 8000,
  // INPS artigiani/commercianti (valori 2025, da aggiornare con la circolare INPS di ogni anno)
  inpsMin: 18555, inpsFisso: 4515, inpsAliq: 24.48,
  inpsFascia: 55448, inpsAliq2: 25.48,          // oltre la prima fascia di reddito l'aliquota sale di un punto
  inpsMassVecchi: 92413, inpsMassNuovi: 120607, // massimale: con contributi prima del 1996 / dal 1996
});

const STATO_VUOTO = () => ({
  v: 2,
  isDemo: false,
  anno: new Date().getFullYear(),
  creditoIvaPrec: {},          // anno -> credito IVA dell'anno precedente
  accontoIva: {},              // anno -> acconto IVA versato a dicembre (vuoto = calcolato)
  socio2Inps: true,
  collabInps: false,
  collabDeduci: false,         // INPS del collaboratore dedotto dal reddito del titolare (se non c'è rivalsa)
  inpsAnte96: { s1: false, s2: false },   // socio con contributi versati prima del 1996 (massimale più basso)
  inail: {},                   // anno -> premio INAIL annuo dei soci { s1, s2 }
  fiscale: {},                 // anno -> { s1/s2: { detr, irpef, inps, com }, irap }: altre detrazioni IRPEF e acconti versati nell'anno
  impostazioni: IMPOSTAZIONI_BASE(),
  entrate: [],                 // tipo 'Fattura' → Fatture emesse, 'Corrispettivi' → Corrispettivi
  acquisti: [],                // sezione 'fornitori' → Fatture ricevute, 'estero' → Autofatture/Fatture estere, 'spese' → Abbonamenti/Acquisti/Spese, 'polizze' → Polizze/Assicurazioni
  parcelle: [],                // fatture del commercialista, con la ritenuta d'acconto
  registroRiepiloghi: {},      // anno -> totali del PDF riepilogativo del Registro Corrispettivi
  regole: [],                  // controparte -> tab dove vanno sempre le sue fatture
  cartaEstratti: [],           // estratti conto della carta caricati: periodo, saldi, PDF
  cartaCategorie: {},          // esercente -> tipo di spesa scelto a mano, per i prossimi estratti
  scalari: [],                 // estratti conto scalari caricati: fido, tasso, interessi, oneri, saldo
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
      { id: 111, data: d('03-01'), desc: 'RC terzi, incendio e furto negozio', compagnia: 'Assicurazioni Esempio Spa', numero: 'NEG-1001', dal: d('03-01'), al: `${anno + 1}-02-28`, provenienza: 'IT', categoria: 'polizza_100', imponibile: 1250, iva: 0, sezione: 'polizze' },
      { id: 113, data: d('02-03'), desc: 'Ricarica carta conto', provenienza: 'IT', categoria: 'carta_movimento', imponibile: 300, iva: 0, sezione: 'carta', carta: { importo: 300 } },
      { id: 114, data: d('02-10'), desc: 'FERRAMENTA ESEMPIO - CITTA ITA', provenienza: 'IT', categoria: 'merce_100_100', imponibile: 38.4, iva: 0, sezione: 'carta', carta: { importo: -38.4 } },
      { id: 115, data: d('02-21'), desc: 'HOTEL INVENTATO - FIERA DEL MOBILE', provenienza: 'IT', categoria: 'trasferta_0_75', imponibile: 95, iva: 0, sezione: 'carta', carta: { importo: -95 } },
      { id: 116, data: d('03-05'), desc: 'Addebito canone mensile carta', provenienza: 'IT', categoria: 'esente_0_100', imponibile: 0.5, iva: 0, sezione: 'carta', carta: { importo: -0.5 } },
      { id: 112, data: d('11-20'), desc: 'RCA furgone consegne (autocarro N1)', compagnia: 'Mutua Inventata', numero: 'AUTO-77', dal: d('11-20'), al: `${anno + 1}-11-19`, provenienza: 'IT', categoria: 'polizza_100', imponibile: 980, iva: 0, sezione: 'polizze' },
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
  if (s?.impostazioni && s.impostazioni.addReg1 == null && s.impostazioni.addiz != null) {
    st.impostazioni.addCom = Math.max(0, Math.round((+s.impostazioni.addiz - 1.23) * 100) / 100);
  }
  st.entrate = Array.isArray(st.entrate) ? st.entrate : [];
  st.acquisti = (Array.isArray(st.acquisti) ? st.acquisti : []).map((a) => ({ ...a, sezione: sezioneDi(a) }));
  st.parcelle = Array.isArray(st.parcelle) ? st.parcelle : [];
  st.regole = Array.isArray(st.regole) ? st.regole.filter((r) => r && r.dest && (r.piva || r.nome)) : [];
  if (typeof st.registroRiepiloghi !== 'object' || st.registroRiepiloghi === null || Array.isArray(st.registroRiepiloghi)) st.registroRiepiloghi = {};
  st.cartaEstratti = Array.isArray(st.cartaEstratti) ? st.cartaEstratti : [];
  st.scalari = Array.isArray(st.scalari) ? st.scalari : [];
  st.inpsAnte96 = { s1: !!st.inpsAnte96?.s1, s2: !!st.inpsAnte96?.s2 };
  if (typeof st.inail !== 'object' || st.inail === null || Array.isArray(st.inail)) st.inail = {};
  if (typeof st.accontoIva !== 'object' || st.accontoIva === null || Array.isArray(st.accontoIva)) st.accontoIva = {};
  if (typeof st.fiscale !== 'object' || st.fiscale === null || Array.isArray(st.fiscale)) st.fiscale = {};
  if (typeof st.cartaCategorie !== 'object' || st.cartaCategorie === null || Array.isArray(st.cartaCategorie)) st.cartaCategorie = {};
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
  if (!$('xml-modal').classList.contains('hidden')) { chiudi($('xml-modal')); xmlAperto = null; return; }
  if (!$('sposta-modal').classList.contains('hidden')) { chiudi($('sposta-modal')); spostamento = null; return; }
  if (!$('confirm-modal').classList.contains('hidden')) { chiudi($('confirm-modal')); confirmCallback = null; }
  else if (!$('import-modal').classList.contains('hidden')) { chiudi($('import-modal')); importazione = null; }
  else if (!$('pdfc-modal').classList.contains('hidden')) { chiudi($('pdfc-modal')); caricamentoPdf = null; }
  else if (!$('popdf-modal').classList.contains('hidden')) chiudiPdfPolizze();
  else if (!$('carta-modal').classList.contains('hidden')) chiudiEstrattoCarta();
  else if (!$('scalare-modal').classList.contains('hidden')) chiudiPdfScalare();
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
  ['set-ragione', 'ragione', 't'], ['set-piva', 'piva', 't'], ['set-attivita', 'attivita', 't'], ['set-regime', 'regime', 't'],
  ['set-s1-nome', 's1Nome', 't'], ['set-s1-quota', 's1Quota', 'n'],
  ['set-s2-nome', 's2Nome', 't'], ['set-collab-nome', 'collabNome', 't'],
  ['set-comm-lordo', 'commLordo', 'n'], ['set-comm-imp', 'commImp', 'n'], ['set-comm-sw', 'commSw', 'n'],
  ['set-irpef1', 'irpef1', 'n'], ['set-irpef2', 'irpef2', 'n'], ['set-irpef3', 'irpef3', 'n'],
  ['set-add-reg1', 'addReg1', 'n'], ['set-add-reg2', 'addReg2', 'n'], ['set-add-reg3', 'addReg3', 'n'], ['set-add-reg4', 'addReg4', 'n'],
  ['set-add-com', 'addCom', 'n'], ['set-add-com-esenz', 'addComEsenz', 'n'],
  ['set-irap', 'irap', 'n'], ['set-irap-ded', 'irapDed', 'n'],
  ['set-inps-min', 'inpsMin', 'n'], ['set-inps-fisso', 'inpsFisso', 'n'], ['set-inps-aliq', 'inpsAliq', 'n'],
  ['set-inps-fascia', 'inpsFascia', 'n'], ['set-inps-aliq2', 'inpsAliq2', 'n'],
  ['set-inps-mass-vecchi', 'inpsMassVecchi', 'n'], ['set-inps-mass-nuovi', 'inpsMassNuovi', 'n'],
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
    case 'vedi-xml': chiudiMenuVoce(); vediFatturaXml(a.dataset.voce); break;
    case 'xml-grezzo': mostraXmlGrezzo(); break;
    case 'close-xml': chiudi($('xml-modal')); xmlAperto = null; break;
    case 'apri-allegato-xml': apriAllegatoFattura(+a.dataset.i); break;
    case 'import-pdf-corr': $('pdf-input').click(); break;
    case 'import-pdf-polizze': $('po-pdf-input').click(); break;
    case 'import-carta': $('carta-input').click(); break;
    case 'close-carta': chiudiEstrattoCarta(); break;
    case 'conferma-carta': confermaEstrattoCarta(); break;
    case 'import-scalare': $('scalare-input').click(); break;
    case 'close-scalare': chiudiPdfScalare(); break;
    case 'conferma-scalare': confermaPdfScalare(); break;
    case 'close-popdf': chiudiPdfPolizze(); break;
    case 'conferma-popdf': confermaPdfPolizze(); break;
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

/* INPS artigiani e commercianti sulla quota di reddito del socio:
   - contributo fisso sul minimale, dovuto anche in perdita;
   - sul reddito oltre il minimale, aliquota piena fino alla prima fascia e
     un punto in più oltre;
   - niente oltre il massimale, che è più basso per chi ha contributi
     versati prima del 1° gennaio 1996. */
/* Addizionali IRPEF sul reddito imponibile (dopo i contributi INPS):
   regionale a scaglioni come l'IRPEF, comunale con un'aliquota sola su tutto
   il reddito, niente se il reddito non supera la soglia di esenzione. */
function calcolaAddizionali(imponibile) {
  const s = imp();
  const r = Math.max(0, imponibile);
  const scaglioni = [[15000, s.addReg1], [28000, s.addReg2], [50000, s.addReg3], [Infinity, s.addReg4]];
  let regionale = 0, da = 0;
  for (const [a, pct] of scaglioni) {
    if (r > da) regionale += (Math.min(r, a) - da) * ((+pct || 0) / 100);
    da = a;
  }
  const esente = r <= (+s.addComEsenz || 0);
  const comunale = esente ? 0 : r * ((+s.addCom || 0) / 100);
  return { regionale, comunale, esente, totale: regionale + comunale };
}

function calcolaInpsCommercianti(redditoQuota, attivo, ante96 = false) {
  const s = imp();
  const massimale = +(ante96 ? s.inpsMassVecchi : s.inpsMassNuovi) || Infinity;
  if (!attivo) return { fisso: 0, fascia1: 0, fascia2: 0, eccedenza: 0, totale: 0, massimale, oltreMassimale: false };
  const fisso = +s.inpsFisso || 0;
  const min = +s.inpsMin || 0;
  const fascia = Math.max(min, +s.inpsFascia || Infinity);
  const base = Math.min(Math.max(0, redditoQuota), massimale);
  const fascia1 = Math.max(0, Math.min(base, fascia) - min) * ((+s.inpsAliq || 0) / 100);
  const fascia2 = Math.max(0, base - fascia) * ((+s.inpsAliq2 || +s.inpsAliq || 0) / 100);
  const eccedenza = fascia1 + fascia2;
  return { fisso, fascia1, fascia2, eccedenza, totale: fisso + eccedenza, massimale, oltreMassimale: redditoQuota > massimale };
}
const inailAnno = () => appState.inail[appState.anno] || { s1: 0, s2: 0 };

/* Detrazioni personali e acconti già versati, anno per anno. Le altre
   detrazioni IRPEF (familiari, spese, ecc.) cambiano poco: se nell'anno
   mancano si usano quelle dell'ultimo anno in cui ci sono. */
const fiscaleAnno = (anno = appState.anno) => appState.fiscale[anno] || {};
const accontiVersati = (k) => fiscaleAnno()[k] || {};
function detrazioniSocio(k) {
  for (let a = appState.anno; a >= appState.anno - 10; a--) {
    const v = appState.fiscale[a]?.[k]?.detr;
    if (v != null && v !== '') return { importo: +v || 0, anno: a };
  }
  return { importo: 0, anno: null };
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

const OPZIONI_CATEGORIA = Object.entries(CATEGORIE_SPESA).filter(([k]) => !k.startsWith('polizza_') && !k.startsWith('carta_'))
  .map(([k, r]) => `<option value="${k}">${esc(r.label)} (${esc(r.badge)})</option>`).join('');
for (const p of Object.keys(MODULI_SPESA)) $(`${p}-categoria`).innerHTML = OPZIONI_CATEGORIA;

function dataDefault() {
  // proponendo una data, si resta nell'anno che si sta guardando
  const t = oggi();
  return annoDi(t) === appState.anno ? t : `${appState.anno}-01-01`;
}
const CAMPI_DATA = ['fe-data', 'co-data', 'fo-data', 'es-data', 'acq-data', 'po-data', 'sc-data', 'ca-data', 'pa-data'];

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
  openConfirmModal(x.sezione === 'fornitori' ? 'Eliminare questa fattura del fornitore?' : x.sezione === 'estero' ? 'Eliminare questo acquisto dall\'estero?' : x.sezione === 'polizze' ? 'Eliminare questa polizza?' : 'Eliminare questa spesa?',
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
const NOMI_SEZIONE = { fornitori: 'Fatture fornitori', estero: 'Autofatture/fatture estere', spese: 'Abbonamenti/acquisti/spese', polizze: 'Polizze/assicurazioni', scalare: 'Estratto conto scalare', carta: 'Carta business' };

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
    righe.push([NOMI_SEZIONE[x.sezione] || 'Abbonamenti/acquisti/spese', fmtData(x.data), 'Q' + getTrimestre(x.data), x.desc, PROV[x.provenienza] || x.provenienza, b.rule.label, num(b.imponibile), num(b.ivaDocumento), num(b.ivaDebitoRC), num(b.ivaDetraibile), num(b.costoDeducibile), num(b.imponibile + b.ivaDocumento), '', x.sezione === 'polizze' ? notaPolizza(x) : x.sezione === 'carta' ? 'Pagata con la carta, senza fattura' : b.notaEstero]);
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
  polizze: 'Polizze/assicurazioni',
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
const sembraPolizza = (f) => /assicura|insurance|polizz|\bpremi[oa]? (di )?(assicura|polizz)|\b(generali|allianz|unipol(sai)?|axa|zurich|reale mutua|cattolica|groupama|helvetia|itas|vittoria assicurazioni|sara assicurazioni|genialloyd|quixa|verti|prima assicurazioni|poste assicura|net insurance|tua assicurazioni|hdi)\b/i
  .test(`${f.cedente.nome} ${f.descrizioni.join(' ')}`);
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
  if (contesto === 'polizze' || sembraPolizza(f)) return { dest: 'polizze' };
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
  const opzCat = (sel, dest) => Object.entries(CATEGORIE_SPESA).filter(([k]) => (dest === 'polizze') === k.startsWith('polizza_')).map(([k, r]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${esc(r.label)} (${esc(r.badge)})</option>`).join('');
  const segno = (f) => (NOTE_CREDITO.has(f.tipoDoc) ? -1 : 1);

  $('import-righe').innerHTML = righe.map((r) => {
    const f = r.f, s = segno(f);
    const emessa = r.dest === 'fatture';
    const controparte = emessa ? f.cessionario : f.cedente;
    const conCategoria = r.dest === 'fornitori' || r.dest === 'estero' || r.dest === 'spese' || r.dest === 'polizze';
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
      <td class="py-2 px-2">${conCategoria ? `<select data-imp="${r.i}" data-campo="categoria" class="w-56 px-2 py-1 rounded-lg border border-slate-300 bg-white text-xs">${opzCat(r.dest === 'polizze' ? catPolizza(r.categoria) : r.categoria, r.dest)}</select>` : '<span class="text-slate-400">—</span>'}</td>
    </tr>`;
  }).join('');

  const avvisi = [];
  if (presunta) avvisi.push(`<div class="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900">Nelle impostazioni manca la Partita IVA della società: dai file sembra <strong>${esc(presunta)}</strong> e l'ho usata per distinguere emesse e ricevute. Se è giusta, inseriscila nelle <strong>Impostazioni</strong>.</div>`);
  else if (!pulisciPiva(imp().piva)) avvisi.push(`<div class="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900">Non hai ancora inserito la <strong>Partita IVA della società</strong> nelle impostazioni: senza, emesse e ricevute si distinguono solo dal tab da cui sei partito. Controlla la colonna «Dove va».</div>`);
  if (righe.some((r) => ['TD17', 'TD18', 'TD19'].includes(r.f.tipoDoc) && r.dest !== 'salta')) avvisi.push('<div class="p-2.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-900">Ci sono <strong>autofatture TD17/TD18/TD19</strong>: registrano già l\'acquisto dall\'estero in reverse charge. Non inserire anche la fattura del fornitore estero, o il costo conterebbe due volte.</div>');
  if (errori.length) avvisi.push(`<div class="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-900"><strong>${errori.length} file non letti:</strong> ${errori.slice(0, 5).map((e) => `${esc(e.file)} (${esc(e.errore)})`).join('; ')}${errori.length > 5 ? '…' : ''}</div>`);
  const daCollegare = righe.filter((r) => r.dest === 'salta' && r.motivo === 'Già importata' && r.f.grezzo && voceSenzaXml(r.chiave)).length;
  if (daCollegare) avvisi.push(`<div class="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900"><strong>${daCollegare} ${daCollegare === 1 ? 'fattura già registrata non ha' : 'fatture già registrate non hanno'}</strong> ancora il file XML (importate prima della versione 2.6): confermando lo collego, così puoi aprirle dalla tabella. Non vengono registrate di nuovo.</div>`);
  $('import-avvisi').innerHTML = avvisi.join('');

  const daFare = righe.filter((r) => r.dest !== 'salta').length;
  $('import-sub').textContent = `${righe.length} fatture lette. Controlla dove finisce ognuna, poi conferma.`;
  $('import-riepilogo').textContent = `${daFare} da registrare, ${righe.length - daFare} saltate.`;
  $('import-ok').textContent = daFare ? `Registra ${daFare} fatture` + (daCollegare ? ` e collega ${daCollegare} XML` : '') : daCollegare ? `Collega ${daCollegare} XML` : 'Niente da registrare';
  $('import-ok').disabled = !(daFare || daCollegare);
  $('import-ok').classList.toggle('opacity-50', !(daFare || daCollegare));
}

document.addEventListener('change', (e) => {
  const el = e.target;
  if (!importazione || el.dataset.imp == null) return;
  const r = importazione.righe[+el.dataset.imp];
  if (!r) return;
  r[el.dataset.campo] = el.value;
  if (el.dataset.campo === 'dest') { r.motivo = el.value === 'salta' ? r.motivo : ''; disegnaImport(); }
});

async function confermaImport() {
  const lotto = importazione;
  if (!lotto || lotto.inCorso) return;
  lotto.inCorso = true;
  $('import-ok').disabled = true;
  $('import-ok').textContent = 'Salvataggio…';
  const conta = { fatture: 0, fornitori: 0, estero: 0, spese: 0, polizze: 0, commercialista: 0 };
  let id = Date.now();
  for (const r of lotto.righe) {
    if (r.dest === 'salta') continue;
    const f = r.f;
    const fileXml = (await conservaXml(r)) || {};
    const s = NOTE_CREDITO.has(f.tipoDoc) ? -1 : 1;
    const nc = s < 0 ? 'Nota di credito ' : 'Fatt. ';
    const cp = controparteFattura(f, r.dest);
    if (r.dest === 'fatture') {
      const nature = f.riepiloghi.map((x) => x.natura);
      const regime = nature.some((n) => n === 'N3.1') ? 'CH_ART8' : nature.some((n) => n === 'N3.2') ? 'UE_ART41' : 'IT_22';
      appState.entrate.push({
        id: id++, data: f.data, tipo: 'Fattura', desc: `${nc}n. ${f.numero} - ${f.cessionario.nome}`, regime,
        totale: s * f.totale, imponibile: s * f.imponibile, iva: s * f.iva, xml: r.chiave, cp, ...fileXml,
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
        pagamento: '', ritenutaVersata: false, xml: r.chiave, cp, ...fileXml,
      });
    } else {
      const rc = r.provenienza !== 'IT';
      appState.acquisti.push({
        id: id++, data: f.data, desc: `${f.cedente.nome} - ${nc}n. ${f.numero}`,
        provenienza: r.provenienza, categoria: r.categoria,
        imponibile: s * f.imponibile, iva: rc ? 0 : s * f.iva,
        sezione: r.dest, xml: r.chiave, cp, ...fileXml,
        ...(r.dest === 'polizze' ? { compagnia: f.cedente.nome, dal: (f.periodo && f.periodo.dal) || '', al: (f.periodo && f.periodo.al) || '', categoria: catPolizza(r.categoria), iva: 0 } : {}),
        ...(r.dest === 'fornitori' && r.provenienza !== 'IT' ? { sezioneManuale: true } : {}),
        // se un giorno la si sposta tra le parcelle, servono cassa e spese esenti
        ...(f.ritenuta > 0 || f.cassa ? { prof: { regime: f.cedente.regime === 'RF19' ? 'forfettario' : 'ordinario', cassaPct: f.cassa ? f.cassa.aliquota : 0, esenti: s * f.riepiloghi.filter((x) => (x.natura || '').startsWith('N1')).reduce((t, x) => t + x.imponibile, 0) } } : {}),
      });
    }
    conta[r.dest]++;
  }
  // fatture già registrate prima della 2.6: si collega il file, senza duplicarle
  let collegati = 0;
  for (const r of lotto.righe) {
    if (r.dest !== 'salta' || r.motivo !== 'Già importata') continue;
    const voce = voceSenzaXml(r.chiave);
    if (!voce) continue;
    const fileXml = await conservaXml(r);
    if (fileXml) { Object.assign(voce, fileXml); collegati++; }
  }
  for (const k of ['entrate', 'acquisti', 'parcelle']) appState[k].sort((a, b) => a.data.localeCompare(b.data));
  if (Object.values(conta).some(Boolean)) appState.isDemo = false;
  saveState();
  chiudi($('import-modal'));
  const tot = Object.values(conta).reduce((a, b) => a + b, 0);
  const dove = Object.entries(conta).filter(([, n]) => n).map(([k, n]) => `${n} in ${DESTINAZIONI[k]}`).join(', ');
  // si apre il tab dove è finita la maggior parte delle fatture
  const principale = Object.entries(conta).sort((a, b) => b[1] - a[1])[0][0];
  const tabDi = { fatture: 'fatture', fornitori: 'fornitori', estero: 'estero', spese: 'acquisti', polizze: 'polizze', commercialista: 'commercialista' };
  importazione = null;
  popolaAnni(); renderAll();
  if (tot) switchTab(tabDi[principale]);
  const collegatiTesto = collegati ? `${collegati === 1 ? 'Collegato 1 file XML' : `Collegati ${collegati} file XML`} a fatture già registrate.` : '';
  showToast(tot ? `Importate ${tot} fatture: ${dove}.${collegati ? ' ' + collegatiTesto : ''}` : collegatiTesto || 'Nessuna fattura registrata.');
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
  const attivo = document.querySelector('.tab-content:not(.hidden)')?.id.replace('tab-', '');
  // nel tab Carta Business ogni file è un estratto conto
  if (attivo === 'carta') { if (tutti.length) apriEstrattoCarta(tutti); return; }
  if (attivo === 'scalare') { if (tutti.length) apriPdfScalare(tutti); return; }
  // nel tab Polizze i PDF (anche dentro gli ZIP) sono ricevute e quietanze
  if (attivo === 'polizze') {
    const daLeggere = tutti.filter((f) => /\.(pdf|zip)$/i.test(f.name));
    const xml = tutti.filter((f) => /\.(xml|p7m)$/i.test(f.name));
    if (daLeggere.length) { apriPdfPolizze(daLeggere, xml); return; }
  }
  const pdf = tutti.filter((f) => /\.pdf$/i.test(f.name));
  const lista = tutti.filter((f) => /\.(xml|p7m|zip)$/i.test(f.name));
  if (pdf.length && !lista.length) { apriPdfCorrispettivi(pdf); return; }
  if (!lista.length) { showToast('Trascina fatture elettroniche (.xml, .p7m, .zip) o i PDF del Registro Corrispettivi.', true); return; }
  if (pdf.length) showToast('Prima le fatture: i PDF dei corrispettivi caricali dopo, a parte.');
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
  // anche gli anni di cui si è inserita solo la dichiarazione o gli acconti
  for (const a of Object.keys(appState.fiscale)) if (+a) anni.add(+a);
  $('sel-anno').innerHTML = [...anni].sort((a, b) => b - a).map((a) => `<option value="${a}">${a}</option>`).join('');
  $('sel-anno').value = appState.anno;
}

function syncControlsFromState() {
  popolaAnni();
  $('iva-credito-prec').value = appState.creditoIvaPrec[appState.anno] || 0;
  $('toggle-socio2-inps').checked = !!appState.socio2Inps;
  $('toggle-collab-inps').checked = !!appState.collabInps;
  $('collab-deduci').checked = !!appState.collabDeduci;
  for (const k of ['s1', 's2']) {
    $('ante96-' + k).checked = !!appState.inpsAnte96[k];
    $('inail-' + k).value = inailAnno()[k] || '';
  }
  document.querySelectorAll('[data-fx]').forEach((el) => {
    const [k, campo] = el.dataset.fx.split('.');
    const v = campo ? fiscaleAnno()[k]?.[campo] : fiscaleAnno()[k];
    el.value = v == null || v === '' ? '' : v;
    if (campo === 'detr') {
      const d = detrazioniSocio(k);
      el.placeholder = d.anno && d.anno !== appState.anno ? `${fmtEuro(d.importo)} (dal ${d.anno})` : '0,00';
    }
  });
}

$('sel-anno').addEventListener('change', () => {
  appState.anno = +$('sel-anno').value;
  saveState(); syncControlsFromState();
  for (const id of CAMPI_DATA) $(id).value = dataDefault();
  renderAll();
});
$('iva-acconto').addEventListener('change', () => {
  const el = $('iva-acconto');
  appState.accontoIva[appState.anno] = el.value.trim() === '' ? '' : Math.max(0, parseFloat(el.value) || 0);
  saveState(); renderAll();
});
$('iva-credito-prec').addEventListener('change', () => {
  appState.creditoIvaPrec[appState.anno] = parseFloat($('iva-credito-prec').value) || 0;
  saveState(); renderAll();
});
$('toggle-socio2-inps').addEventListener('change', () => { appState.socio2Inps = $('toggle-socio2-inps').checked; saveState(); renderAll(); });
$('toggle-collab-inps').addEventListener('change', () => { appState.collabInps = $('toggle-collab-inps').checked; saveState(); renderAll(); });
$('collab-deduci').addEventListener('change', () => { appState.collabDeduci = $('collab-deduci').checked; saveState(); renderAll(); });
document.querySelectorAll('[data-fx]').forEach((el) => el.addEventListener('change', () => {
  const [k, campo] = el.dataset.fx.split('.');
  const anno = appState.anno;
  const n = parseFloat(el.value) || 0;
  const v = el.value.trim() === '' ? '' : campo === 'reddito' ? n : Math.max(0, n);
  const f = (appState.fiscale[anno] = { ...fiscaleAnno(anno) });
  if (campo) f[k] = { ...(f[k] || {}), [campo]: v }; else f[k] = v;
  saveState(); syncControlsFromState(); renderAll();
}));
for (const k of ['s1', 's2']) {
  $('ante96-' + k).addEventListener('change', () => { appState.inpsAnte96[k] = $('ante96-' + k).checked; saveState(); renderAll(); });
  $('inail-' + k).addEventListener('change', () => {
    appState.inail[appState.anno] = { ...inailAnno(), [k]: Math.max(0, parseFloat($('inail-' + k).value) || 0) };
    saveState(); renderAll();
  });
}

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
  $('hdr-badge').textContent = `${s.regime === 'ordinaria' ? 'Ordinaria' : 'Semplificata'} ${anno}`;
  $('dash-regime').textContent = s.regime === 'ordinaria' ? 'Contabilità ordinaria' : 'Contabilità semplificata';
  document.querySelectorAll('[data-anno]').forEach((el) => { el.textContent = anno; });
  document.querySelectorAll('[data-s1-nome]').forEach((el) => { el.textContent = s.s1Nome; });
  document.querySelectorAll('[data-s2-nome]').forEach((el) => { el.textContent = s.s2Nome; });
  document.querySelectorAll('[data-collab-nome]').forEach((el) => { el.textContent = s.collabNome || 'Collaboratore familiare'; });
  document.querySelectorAll('[data-s1-quota]').forEach((el) => { el.textContent = fmtPct(quotaS1()); });
  document.querySelectorAll('[data-s2-quota]').forEach((el) => { el.textContent = fmtPct(quotaS2()); });
  $('kpi-utile-sub').textContent = `Imputato ${fmtPct(quotaS1())} a ${s.s1Nome} / ${fmtPct(quotaS2())} a ${s.s2Nome}`;
  $('txt-inps-s1').textContent = `Socio amministratore che lavora in negozio. Contributo fisso sul minimale (~${fmtEuro(s.inpsFisso)}/anno) + ${fmtPct(s.inpsAliq)} sul reddito da ${fmtEuro(s.inpsMin)} a ${fmtEuro(s.inpsFascia)}, ${fmtPct(s.inpsAliq2)} oltre, fino al massimale.`;
  for (const k of ['s1', 's2']) $('txt-inail-' + k).textContent = +inailAnno()[k] > 0
    ? `Solo per il ${anno}: ogni anno ha il suo premio.`
    : `Nessun premio INAIL nel ${anno} (lascia vuoto se il socio non è più assicurato).`;
  for (const k of ['s1', 's2']) $('txt-mass-' + k).textContent = `Massimale ${fmtEuro(appState.inpsAnte96[k] ? s.inpsMassVecchi : s.inpsMassNuovi)}: oltre non si paga INPS.`;
  $('txt-inps-collab').textContent = `Nessuno stipendio. Se attivo, conta i contributi INPS minimali (~${fmtEuro(s.inpsFisso)}/anno), pagati da ${s.s1Nome}.`;
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

/* Per saldo e acconti serve l'anno prima: gli acconti dovuti (se non inseriti)
   e il credito avanzato. Si calcola prima quello, fino a 3 anni indietro. */
let profonditaCalcolo = 0;
const ivaQ4Anno = {};   // IVA dovuta per il 4° trimestre di ogni anno (base dell'acconto di dicembre)
const versamentiAnno = {};
const annoConDati = (a) => Object.keys(appState.fiscale[a] || {}).length > 0 ||
  appState.entrate.some((x) => annoDi(x.data) === a) || appState.acquisti.some((x) => annoDi(x.data) === a);

function renderAll() {
  const anno = appState.anno;
  let precedente = null;
  if (profonditaCalcolo < 3 && annoConDati(anno - 1)) {
    profonditaCalcolo++;
    appState.anno = anno - 1;
    try { renderAll(); precedente = versamentiAnno[anno - 1]; } finally { appState.anno = anno; profonditaCalcolo--; }
  }
  const s = imp();
  renderTesti();
  $('demo-banner').classList.toggle('hidden', !appState.isDemo);

  const entrate = appState.entrate.filter((x) => annoDi(x.data) === anno);
  const acquisti = appState.acquisti.filter((x) => annoDi(x.data) === anno);
  const parcelle = appState.parcelle.filter((x) => annoDi(x.data) === anno);
  const ivaTrim = { 1: { debito: 0, credito: 0 }, 2: { debito: 0, credito: 0 }, 3: { debito: 0, credito: 0 }, 4: { debito: 0, credito: 0 } };
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
      <td class="py-3 px-4 font-medium text-slate-900 min-w-[200px]">${esc(item.desc)}${item.xml ? badgeXml('entrata:' + item.id, item) : ''}${item.registro ? badgeRegistro(item) : ''}</td>
      ${p === 'fe' ? `<td class="py-3 px-4">${REGIME[item.regime] || esc(item.regime)}</td>` : ''}
      <td class="py-3 px-4 text-right font-bold text-slate-900 whitespace-nowrap">${fmtEuro(b.totale)}</td>
      <td class="py-3 px-4 text-right font-semibold text-slate-700 whitespace-nowrap">${fmtEuro(b.imponibile)}</td>
      <td class="py-3 px-4 text-right text-rose-600 whitespace-nowrap">${fmtEuro(b.iva)}</td>
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
  const totSp = { fo: { det: 0, ded: 0 }, es: { det: 0, ded: 0 }, acq: { det: 0, ded: 0 }, po: { det: 0, ded: 0, premi: 0 }, ca: { det: 0, ded: 0 }, sc: { det: 0, ded: 0 } };
  const vociCarta = [], vociScal = [];
  let interessiPassivi = 0;          // non deducibili ai fini IRAP
  const htmlSp = { fo: '', es: '', acq: '', po: '' };
  for (const item of acquisti) {
    const b = calcAcquistoBreakdown(item);
    const q = getTrimestre(item.data);
    if (item.categoria === 'interessi_passivi') interessiPassivi += calcAcquistoBreakdown(item).costoDeducibile;
    const p = item.sezione === 'fornitori' ? 'fo' : item.sezione === 'estero' ? 'es' : item.sezione === 'polizze' ? 'po' : item.sezione === 'carta' ? 'ca' : item.sezione === 'scalare' ? 'sc' : 'acq';
    totCostiDeducibili += b.costoDeducibile;
    ivaTrim[q].debito += b.ivaDebitoRC; ivaTrim[q].credito += b.ivaDetraibile;
    totSp[p].det += b.ivaDetraibile; totSp[p].ded += b.costoDeducibile;
    if (p === 'po') { totSp.po.premi += b.imponibile + b.ivaDocumento; htmlSp.po += rigaPolizza(item, b); continue; }
    if (p === 'ca') { vociCarta.push({ item, b }); continue; }
    if (p === 'sc') { vociScal.push({ item, b }); continue; }
    htmlSp[p] += `<tr data-voce="acquisto:${item.id}" class="hover:bg-slate-50/80 transition">
      <td class="py-3 px-4 whitespace-nowrap text-slate-600">${fmtData(item.data)}</td>
      <td class="py-3 px-4 font-semibold text-slate-500">Q${q}</td>
      <td class="py-3 px-4 min-w-[220px]"><div class="font-medium text-slate-900">${esc(item.desc)}${item.xml ? badgeXml('acquisto:' + item.id, item) : ''}</div>${PROV[item.provenienza] || ''}${termineAutofattura(item)}</td>
      <td class="py-3 px-4 text-xs text-slate-600 min-w-[140px]">${b.rule.badge}</td>
      <td class="py-3 px-4 text-right font-bold text-slate-900 whitespace-nowrap">${fmtEuro(b.imponibile + b.ivaDocumento)}</td>
      <td class="py-3 px-4 text-right font-medium text-slate-800 whitespace-nowrap">${fmtEuro(b.imponibile)}</td>
      <td class="py-3 px-4 text-right text-slate-500 whitespace-nowrap">${fmtEuro(b.ivaDocumento)}</td>
      <td class="py-3 px-4 text-right font-semibold text-emerald-700 whitespace-nowrap">${fmtEuro(b.ivaDetraibile)}</td>
      <td class="py-3 px-4 text-right font-bold text-slate-900 whitespace-nowrap">${fmtEuro(b.costoDeducibile)}</td>
      ${btnElimina('del-acquisto', item.id)}
    </tr>`;
  }
  $('tbody-fornitori').innerHTML = htmlSp.fo || vuota(10, `Nessuna fattura di fornitori nel ${anno}. Registra qui merce e servizi acquistati per la rivendita.`);
  $('tot-fo-iva-det').textContent = fmtEuro(totSp.fo.det);
  $('tot-fo-costo-ded').textContent = fmtEuro(totSp.fo.ded);
  $('tbody-estero').innerHTML = htmlSp.es || vuota(10, `Nessun acquisto dall'estero nel ${anno}. Registra qui merce UE, servizi esteri e importazioni con bolla doganale.`);
  $('tot-es-iva-det').textContent = fmtEuro(totSp.es.det);
  $('tot-es-costo-ded').textContent = fmtEuro(totSp.es.ded);
  $('tbody-acquisti').innerHTML = htmlSp.acq || vuota(10, `Nessuna spesa nel ${anno}. Registra abbonamenti, bollette, carburante e le altre spese del negozio.`);
  $('tot-acq-iva-det').textContent = fmtEuro(totSp.acq.det);
  $('tot-acq-costo-ded').textContent = fmtEuro(totSp.acq.ded);
  $('tbody-polizze').innerHTML = htmlSp.po || vuota(7, `Nessuna polizza pagata nel ${anno}. Registra qui RC, incendio e furto del negozio, la polizza del furgone e le altre assicurazioni.`);
  $('tot-po-premi').textContent = fmtEuro(totSp.po.premi);
  $('tot-po-ded').textContent = fmtEuro(totSp.po.ded);
  disegnaCarta(vociCarta);
  disegnaScalare(vociScal);

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
      <td class="py-3 px-4 font-medium text-slate-900 min-w-[220px]">${esc(item.desc)}${item.xml ? badgeXml('parcella:' + item.id, item) : ''}${item.regime === 'forfettario' ? '<div class="text-[10px] font-bold text-slate-500 mt-1">FORFETTARIO</div>' : ''}</td>
      <td class="py-3 px-4 text-right font-bold text-slate-900 whitespace-nowrap">${fmtEuro(b.totale)}</td>
      <td class="py-3 px-4 text-right whitespace-nowrap">${fmtEuro(b.imponibileIva)}</td>
      <td class="py-3 px-4 text-right text-emerald-700 whitespace-nowrap">${fmtEuro(b.iva)}</td>
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

  /* 4. Liquidazione IVA trimestrale (trimestrali per opzione): ogni trimestre
     a debito paga l'1% di interessi, anche il 4° che si versa a marzo con la
     dichiarazione annuale. Il 27 dicembre si versa l'acconto (metodo storico:
     88% dell'IVA dovuta per il 4° trimestre dell'anno prima; sotto 103,29 €
     non è dovuto) che poi si scala dal 4° trimestre. */
  let riporto = +appState.creditoIvaPrec[anno] || 0;
  const accIvaInserito = appState.accontoIva[anno];
  const baseAccIva = ivaQ4Anno[anno - 1] || 0;
  const accIvaCalc = baseAccIva * 0.88 >= 103.29 ? baseAccIva * 0.88 : 0;
  const accontoIva = accIvaInserito === '' || accIvaInserito == null ? accIvaCalc : +accIvaInserito || 0;
  const TRIM = [
    { q: 1, nome: '1° trimestre (gen-mar)', scad: scadenza(anno, 5, 16), cod: '6031' },
    { q: 2, nome: '2° trimestre (apr-giu)', scad: scadenza(anno, 8, 20), cod: '6032' },
    { q: 3, nome: '3° trimestre (lug-set)', scad: scadenza(anno, 11, 16), cod: '6033' },
    { q: 4, nome: '4° trimestre (ott-dic)', scad: scadenza(anno + 1, 3, 16) + ' (con la dichiarazione IVA)', cod: '6099' },
  ];
  html = '';
  const ivaVers = [];   // per il riquadro del cruscotto
  for (const t of TRIM) {
    const deb = ivaTrim[t.q].debito;
    const credTot = ivaTrim[t.q].credito + riporto;
    const diff = deb - credTot;
    if (t.q === 4) ivaQ4Anno[anno] = Math.max(0, diff);     // base dell'acconto dell'anno dopo
    const acc = t.q === 4 ? accontoIva : 0;                 // l'acconto di dicembre si scala dal 4° trimestre
    const netto = diff - acc;
    let daVersare = 0, interessi = 0;
    if (netto > 0) { interessi = netto * 0.01; daVersare = netto + interessi; riporto = 0; }
    else riporto = Math.abs(netto);
    const debito = daVersare > 0;
    ivaVers.push({ q: t.q, daVersare, credito: debito ? 0 : riporto });
    html += `<div class="p-5 rounded-2xl border ${debito ? 'border-rose-200 bg-rose-50/30' : 'border-emerald-200 bg-emerald-50/30'} flex flex-col justify-between space-y-4">
      <div>
        <div class="flex items-center justify-between gap-2">
          <span class="text-xs font-bold uppercase text-slate-500">Cod. F24: ${t.cod}</span>
          <span class="text-[11px] font-semibold px-2 py-0.5 rounded-full ${debito ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'}">${debito ? 'A debito' : riporto > 0 ? 'A credito' : 'Niente da versare'}</span>
        </div>
        <h3 class="text-base font-bold text-slate-900 mt-1">${t.nome}</h3>
        <p class="text-[11px] text-slate-500">Scadenza: ${t.scad}</p>
        <div class="mt-4 space-y-1.5 text-xs">
          ${riga('IVA a debito (+ RC):', fmtEuro(deb))}
          ${riga('IVA a credito (+ riporto):', fmtEuro(credTot), 'font-semibold text-emerald-700')}
          ${acc > 0 ? riga(`Acconto versato a dicembre:`, '- ' + fmtEuro(acc), 'font-semibold text-emerald-700') : ''}
          ${interessi > 0 ? riga('Interessi 1%:', fmtEuro(interessi), 'font-semibold text-slate-700') : ''}
        </div>
      </div>
      <div class="pt-3 border-t border-slate-200/80 flex justify-between items-baseline gap-2">
        <span class="text-xs font-bold text-slate-700">${debito || !riporto ? 'Da versare F24:' : 'Credito riportato:'}</span>
        <span class="text-lg font-extrabold ${debito ? 'text-rose-600' : 'text-emerald-700'} whitespace-nowrap">${fmtEuro(debito ? daVersare : riporto)}</span>
      </div>
    </div>`;
  }
  $('cards-trimestri-iva').innerHTML = html;
  $('iva-acconto').value = accIvaInserito === '' || accIvaInserito == null ? '' : accIvaInserito;
  $('iva-acconto').placeholder = accIvaCalc.toFixed(2);
  $('txt-iva-acconto').textContent = accIvaCalc > 0
    ? `Calcolato: 88% di ${fmtEuro(baseAccIva)} (IVA del 4° trimestre ${anno - 1}). Scrivi un importo solo se hai versato una cifra diversa.`
    : baseAccIva > 0 ? `Non dovuto: l'88% del 4° trimestre ${anno - 1} è sotto 103,29 €.`
    : `Non dovuto: il 4° trimestre ${anno - 1} non era a debito (o non è registrato nell'app).`;
  ivaVers.splice(3, 0, { acconto: true, daVersare: accontoIva, credito: 0 });

  // 5. Utile, imposte dei soci e INPS
  // il risultato può essere una perdita; le imposte si calcolano solo sull'utile
  // il premio INAIL dei soci lo paga la società: è un costo deducibile (anche IRAP)
  const inail = inailAnno();
  const inailTot = (+inail.s1 || 0) + (+inail.s2 || 0);
  totCostiDeducibili += inailTot;
  /* Se la dichiarazione dell'anno è già stata presentata, il reddito della
     società (quadro RN, rigo RN1 o RN2) è quello vero: vale al posto di quello
     calcolato dalle registrazioni, che a volte non sono complete. */
  const dich = fiscaleAnno().soc || {};
  const redditoDich = dich.reddito === '' || dich.reddito == null ? null : +dich.reddito;
  const risultatoConti = totRicaviImp - totCostiDeducibili;
  const risultato = redditoDich != null ? redditoDich : risultatoConti;
  const ritenute = +dich.ritenute || 0;               // ritenute subite dalla società, divise tra i soci
  const ritS1 = ritenute * quotaS1() / 100, ritS2 = ritenute * quotaS2() / 100;
  const utileSnc = Math.max(0, risultato);
  const q1 = utileSnc * quotaS1() / 100;
  const q2 = utileSnc * quotaS2() / 100;
  const inpsS1 = calcolaInpsCommercianti(q1, true, appState.inpsAnte96.s1);
  const inpsS2 = calcolaInpsCommercianti(q2, appState.socio2Inps, appState.inpsAnte96.s2);
  const inpsCollab = appState.collabInps ? (+s.inpsFisso || 0) : 0;   // a carico del socio titolare

  const impIrpefS1 = Math.max(0, q1 - inpsS1.totale - (appState.collabDeduci ? inpsCollab : 0));
  const detrS1 = detrazioniSocio('s1').importo, detrS2 = detrazioniSocio('s2').importo;
  const irpefS1 = Math.max(0, calcolaIrpefScaglioni(impIrpefS1) - detrS1);
  const addizS1 = calcolaAddizionali(impIrpefS1), addS1 = addizS1.totale;
  const totS1 = irpefS1 + addS1 + inpsS1.totale + inpsCollab;

  const impIrpefS2 = Math.max(0, q2 - inpsS2.totale);
  const irpefS2 = Math.max(0, calcolaIrpefScaglioni(impIrpefS2) - detrS2);
  const addizS2 = calcolaAddizionali(impIrpefS2), addS2 = addizS2.totale;
  const totS2 = irpefS2 + addS2 + inpsS2.totale;

  // per l'IRAP gli interessi passivi non si deducono: si riaggiungono
  const baseIrap = Math.max(0, risultato + interessiPassivi);
  const irapSocieta = Math.max(0, baseIrap - (+s.irapDed || 0)) * (s.irap / 100);
  const totaleTasse = totS1 + totS2 + irapSocieta;
  const nettoTasca = Math.max(0, utileSnc - totaleTasse);
  // netto in tasca di ogni socio: la sua quota di utile meno contributi,
  // imposte personali e la sua parte dell'IRAP pagata dalla società
  const irapS1 = irapSocieta * quotaS1() / 100, irapS2 = irapSocieta * quotaS2() / 100;
  const nettoS1 = q1 - totS1 - irapS1, nettoS2 = q2 - totS2 - irapS2;

  const righeAddiz = (x) =>
    riga('Addizionale regionale (a scaglioni):', fmtEuro(x.regionale)) +
    riga(`Addizionale comunale (${fmtPct(s.addCom)}):`, x.esente && x.comunale === 0 && +s.addComEsenz > 0 ? 'esente' : fmtEuro(x.comunale));
  /* Saldo e acconti col metodo storico: a giugno dell'anno dopo il saldo
     (imposta dell'anno meno gli acconti versati) e il 1° acconto, a novembre
     il 2°. Acconti IRPEF, INPS oltre il minimale e IRAP: 50% + 50%;
     addizionale comunale: 30% tutto a giugno; la regionale non ha acconti. */
  const annoDopo = appState.anno + 1;
  const importoSaldo = (v) => v < 0 ? `credito ${fmtEuro(-v)}` : fmtEuro(v);
  const clsSaldo = (v) => v < 0 ? 'font-semibold text-emerald-700' : 'font-semibold text-slate-900';
  const righeVersamenti = (k, irpef, inpsEcc, add, rit = 0) => {
    // le ritenute subite riducono l'IRPEF da versare, e quindi anche gli acconti
    irpef = irpef - rit;
    /* Acconti dell'anno: quelli inseriti; se mancano, quelli dovuti in base
       all'anno prima (metodo storico), pagati o coperti dai crediti. */
    const a = accontiVersati(k), prec = precedente && precedente[k];
    const inseriti = ['irpef', 'inps', 'com'].some((c) => a[c] !== '' && a[c] != null);
    const stimati = !inseriti && prec ? prec.dett : null;
    const accIrpef = +(stimati || a).irpef || 0, accInps = +(stimati || a).inps || 0, accCom = +(stimati || a).com || 0;
    const sIrpef = irpef - accIrpef, sInps = inpsEcc - accInps, sCom = add.comunale - accCom;
    const baseAcc = Math.max(0, irpef);
    const acc1 = baseAcc * 0.5 + inpsEcc * 0.5 + add.comunale * 0.3;
    const acc2 = baseAcc * 0.5 + inpsEcc * 0.5;
    const giugno = Math.max(0, sIrpef) + Math.max(0, sInps) + add.regionale + Math.max(0, sCom) + acc1;
    const riporto = prec ? prec.resto : 0;               // credito avanzato dall'anno prima
    const crediti = Math.max(0, -sIrpef) + Math.max(0, -sInps) + Math.max(0, -sCom) + riporto;
    versamenti[k] = { saldo: giugno - acc1, acc1, acc2, riporto, stimati: !!stimati,
      dett: { irpef: baseAcc, inps: inpsEcc, com: add.comunale * 0.3 }, ...compensa(giugno, acc2, crediti) };
    return `<div class="mt-2 pt-3 border-t-2 border-dashed border-slate-200 space-y-2.5">` +
      titoloInps(`Versamenti F24 per il ${appState.anno}`) +
      (rit > 0 ? riga('Ritenute d\'acconto attribuite:', '- ' + fmtEuro(rit), 'text-emerald-700') : '') +
      (stimati ? riga(`Acconti del ${appState.anno} (dovuti in base al ${appState.anno - 1}):`, fmtEuro(accIrpef + accInps + accCom), 'text-slate-500')
        : accIrpef + accInps + accCom > 0
        ? riga(`Acconti già versati nel ${appState.anno}:`, fmtEuro(accIrpef + accInps + accCom), 'text-slate-500')
        : riga(`Acconti versati nel ${appState.anno}:`, 'non inseriti', 'text-amber-700')) +
      (riporto > 0 ? riga(`Credito avanzato dal ${appState.anno - 1}:`, fmtEuro(riporto), 'text-emerald-700') : '') +
      riga(`Saldo IRPEF (giugno ${annoDopo}):`, importoSaldo(sIrpef), clsSaldo(sIrpef)) +
      (inpsEcc > 0 || accInps > 0 ? riga('Saldo INPS oltre il minimale:', importoSaldo(sInps), clsSaldo(sInps)) : '') +
      riga('Addizionale regionale (solo a saldo):', fmtEuro(add.regionale)) +
      riga('Saldo addizionale comunale:', importoSaldo(sCom), clsSaldo(sCom)) +
      riga(`1° acconto ${annoDopo} (giugno):`, fmtEuro(acc1)) +
      riga(`2° acconto ${annoDopo} (novembre):`, fmtEuro(acc2)) +
      righeCompensazione(giugno, acc2, crediti, -sIrpef > 5000);
  };
  /* I crediti dei saldi si usano nell'F24 (compensazione) per pagare quanto
     dovuto a giugno; quello che avanza copre il 2° acconto di novembre e poi
     resta disponibile. Ogni contribuente compensa solo i propri crediti. */
  const compensa = (giugno, novembre, crediti) => {
    const usatoGiu = Math.min(crediti, giugno), restoGiu = crediti - usatoGiu;
    const usatoNov = Math.min(restoGiu, novembre), resto = restoGiu - usatoNov;
    return { usatoGiu, usatoNov, resto, daGiu: giugno - usatoGiu, daNov: novembre - usatoNov };
  };
  const versamenti = {};   // per il riquadro del cruscotto
  const righeCompensazione = (giugno, novembre, crediti, avvisoVisto) => {
    const { usatoGiu, usatoNov, resto } = compensa(giugno, novembre, crediti);
    const totale = (lbl, v, cls) => `<div class="flex justify-between gap-3 text-sm"><span class="font-bold text-slate-900">${lbl}</span><span class="font-extrabold ${cls} whitespace-nowrap">${fmtEuro(v)}</span></div>`;
    if (crediti <= 0) return totale(`Da versare a giugno ${annoDopo}:`, giugno, 'text-indigo-600') + '</div>';
    return riga(`Dovuto a giugno ${annoDopo} prima della compensazione:`, fmtEuro(giugno), 'text-slate-500') +
      riga('Crediti usati in compensazione nell\'F24:', '- ' + fmtEuro(usatoGiu), 'text-emerald-700') +
      totale(`Da versare a giugno ${annoDopo}:`, giugno - usatoGiu, 'text-indigo-600') +
      (usatoNov > 0 ? riga(`Credito usato per il 2° acconto di novembre:`, '- ' + fmtEuro(usatoNov), 'text-emerald-700') : '') +
      riga(`Da versare a novembre ${annoDopo}:`, fmtEuro(novembre - usatoNov), 'font-semibold text-slate-900') +
      (resto > 0 ? totale('Credito che resta ancora da usare:', resto, 'text-emerald-700') : '') +
      (avvisoVisto ? `<p class="text-[11px] text-slate-500">Per usare oltre 5.000 € di crediti IRPEF per pagare altre imposte o contributi serve il visto di conformità sulla dichiarazione; tra IRPEF e IRPEF (saldo con acconto) non serve.</p>` : '') +
      '</div>';
  };
  const titoloInps = (t) => `<p class="pt-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">${esc(t)}</p>`;
  const righeInps = (x, nome) => !x.totale ? riga(`INPS di ${esc(nome)}:`, 'non dovuto', 'text-slate-500') :
    titoloInps(`INPS di ${nome}`) +
    riga('INPS contributo fisso (minimale):', '- ' + fmtEuro(x.fisso), 'font-semibold text-rose-600') +
    (x.fascia1 > 0 ? riga(`INPS ${fmtPct(s.inpsAliq)} da ${fmtEuro(s.inpsMin)} a ${fmtEuro(s.inpsFascia)}:`, '- ' + fmtEuro(x.fascia1), 'font-semibold text-rose-600') : '') +
    (x.fascia2 > 0 ? riga(`INPS ${fmtPct(s.inpsAliq2)} oltre ${fmtEuro(s.inpsFascia)}:`, '- ' + fmtEuro(x.fascia2), 'font-semibold text-rose-600') : '') +
    (x.oltreMassimale ? riga(`Oltre il massimale (${fmtEuro(x.massimale)}):`, 'niente INPS', 'font-semibold text-emerald-700') : '') +
    riga(`Totale INPS di ${esc(nome)}:`, '- ' + fmtEuro(x.totale), 'font-bold text-rose-700', 'pt-1 border-t border-slate-100');
  // l'INPS del collaboratore familiare lo paga il titolare, ma resta una posizione a parte
  const righeCollab = () => !inpsCollab ? '' :
    titoloInps(!s.collabNome || /^collaborat/i.test(s.collabNome) ? 'INPS del collaboratore familiare' : `INPS di ${s.collabNome} (collaboratore familiare)`) +
    riga('Contributo fisso (minimale), pagato dal titolare:', '- ' + fmtEuro(inpsCollab), 'font-semibold text-rose-600') +
    riga('Totale INPS collaboratore:', '- ' + fmtEuro(inpsCollab), 'font-bold text-rose-700', 'pt-1 border-t border-slate-100');
  const righeNetto = (quota, irap, netto, inailSocio) =>
    `<div class="mt-2 pt-3 border-t-2 border-dashed border-slate-200 space-y-2.5">` +
    riga(`Quota IRAP della società (${fmtPct(quota)}):`, '- ' + fmtEuro(irap), 'font-semibold text-rose-600') +
    (inailSocio > 0 ? riga('INAIL (già tolto dall\'utile):', fmtEuro(inailSocio), 'text-slate-500') : '') +
    `<div class="flex justify-between gap-3 text-sm"><span class="font-bold text-slate-900">Netto in tasca nell'anno:</span><span class="font-extrabold ${netto < 0 ? 'text-rose-600' : 'text-emerald-700'} whitespace-nowrap">${fmtEuro(netto)}</span></div>` +
    `<div class="flex justify-between gap-3 text-sm"><span class="font-semibold text-slate-700">Netto al mese (÷ 12):</span><span class="font-bold ${netto < 0 ? 'text-rose-600' : 'text-emerald-700'} whitespace-nowrap">${fmtEuro(netto / 12)}</span></div>` +
    `</div>`;

  $('dettaglio-socio1').innerHTML =
    riga(`Quota utile SNC (${fmtPct(quotaS1())}):`, fmtEuro(q1), 'font-bold text-slate-900') +
    righeInps(inpsS1, s.s1Nome) +
    righeCollab() +
    riga('Imponibile netto IRPEF:', fmtEuro(impIrpefS1), 'font-bold text-slate-800', 'pt-2 border-t border-slate-100') +
    (detrS1 > 0 ? riga('Altre detrazioni IRPEF:', '- ' + fmtEuro(detrS1), 'text-emerald-700') : '') +
    riga('IRPEF netta stimata:', fmtEuro(irpefS1)) +
    righeAddiz(addizS1) +
    `<div class="flex justify-between gap-3 pt-3 border-t border-slate-200 text-sm"><span class="font-bold text-slate-900">Totale imposte + INPS${inpsCollab ? ' (con il collaboratore)' : ''}:</span><span class="font-extrabold text-indigo-600 whitespace-nowrap">${fmtEuro(totS1)}</span></div>` +
    righeNetto(quotaS1(), irapS1, nettoS1, +inail.s1 || 0) +
    righeVersamenti('s1', irpefS1, inpsS1.eccedenza, addizS1, ritS1);

  $('dettaglio-socio2').innerHTML =
    riga(`Quota utile SNC (${fmtPct(quotaS2())}):`, fmtEuro(q2), 'font-bold text-slate-900') +
    righeInps(inpsS2, s.s2Nome) +
    riga('Imponibile netto IRPEF:', fmtEuro(impIrpefS2), 'font-bold text-slate-800', 'pt-2 border-t border-slate-100') +
    (detrS2 > 0 ? riga('Altre detrazioni IRPEF:', '- ' + fmtEuro(detrS2), 'text-emerald-700') : '') +
    riga('IRPEF netta stimata:', fmtEuro(irpefS2)) +
    righeAddiz(addizS2) +
    `<div class="flex justify-between gap-3 pt-3 border-t border-slate-200 text-sm"><span class="font-bold text-slate-900">Totale imposte + INPS:</span><span class="font-extrabold text-indigo-600 whitespace-nowrap">${fmtEuro(totS2)}</span></div>` +
    righeNetto(quotaS2(), irapS2, nettoS2, +inail.s2 || 0) +
    righeVersamenti('s2', irpefS2, inpsS2.eccedenza, addizS2, ritS2);

  $('dettaglio-societa').innerHTML =
    riga(risultato < 0 ? 'Perdita fiscale SNC:' : 'Utile fiscale SNC:', fmtEuro(risultato), risultato < 0 ? 'font-bold text-rose-600' : 'font-bold text-slate-900') +
    (redditoDich != null ? riga('Dalle registrazioni sarebbe (non usato):', fmtEuro(risultatoConti), 'text-slate-500') : '') +
    (inailTot > 0 && redditoDich == null ? riga('di cui INAIL soci già dedotto:', fmtEuro(inailTot), 'text-slate-500') : '') +
    (interessiPassivi > 0 ? riga('Interessi passivi (non deducibili IRAP):', '+ ' + fmtEuro(interessiPassivi), 'font-semibold text-slate-700') : '') +
    riga('Deduzione base IRAP stimata:', '- ' + fmtEuro(s.irapDed), 'font-semibold text-emerald-700') +
    riga(`IRAP (${fmtPct(s.irap)}):`, fmtEuro(irapSocieta), 'font-bold text-slate-900') +
    `<div class="flex justify-between gap-3 pt-3 border-t border-slate-200 text-sm"><span class="font-bold text-slate-900">Carico complessivo (soci + IRAP):</span><span class="font-extrabold text-rose-600 whitespace-nowrap">${fmtEuro(totaleTasse)}</span></div>` +
    (() => {
      const valIrap = fiscaleAnno().irap, prec = precedente && precedente.soc;
      const stimato = (valIrap === '' || valIrap == null) && prec;
      const acc = stimato ? prec.acc1 + prec.acc2 : +valIrap || 0, saldo = irapSocieta - acc;
      const riporto = prec ? prec.resto : 0, crediti = Math.max(0, -saldo) + riporto;
      versamenti.soc = { saldo: Math.max(0, saldo), acc1: irapSocieta * 0.5, acc2: irapSocieta * 0.5, riporto, stimati: !!stimato,
        ...compensa(Math.max(0, saldo) + irapSocieta * 0.5, irapSocieta * 0.5, crediti) };
      return `<div class="mt-2 pt-3 border-t-2 border-dashed border-slate-200 space-y-2.5">` +
        titoloInps(`IRAP: versamenti F24 per il ${appState.anno}`) +
        (stimato ? riga(`Acconti IRAP del ${appState.anno} (dovuti in base al ${appState.anno - 1}):`, fmtEuro(acc), 'text-slate-500')
          : acc > 0 ? riga(`Acconti IRAP versati nel ${appState.anno}:`, fmtEuro(acc), 'text-slate-500') : riga(`Acconti IRAP versati nel ${appState.anno}:`, 'non inseriti', 'text-amber-700')) +
        (riporto > 0 ? riga(`Credito IRAP avanzato dal ${appState.anno - 1}:`, fmtEuro(riporto), 'text-emerald-700') : '') +
        riga(`Saldo IRAP (giugno ${annoDopo}):`, importoSaldo(saldo), clsSaldo(saldo)) +
        riga(`1° acconto IRAP ${annoDopo} (giugno):`, fmtEuro(irapSocieta * 0.5)) +
        riga(`2° acconto IRAP ${annoDopo} (novembre):`, fmtEuro(irapSocieta * 0.5)) +
        righeCompensazione(Math.max(0, saldo) + irapSocieta * 0.5, irapSocieta * 0.5, crediti, false);
    })();
  versamentiAnno[anno] = versamenti;

  // 6. Cruscotto
  $('kpi-ricavi').textContent = fmtEuro(totRicaviImp);
  $('kpi-costi').textContent = fmtEuro(totCostiDeducibili);
  $('kpi-utile').textContent = fmtEuro(risultato);
  $('kpi-utile').classList.toggle('text-rose-600', risultato < 0);
  $('kpi-utile').classList.toggle('text-emerald-600', risultato >= 0);
  $('kpi-utile-titolo').textContent = redditoDich != null ? (risultato < 0 ? 'Perdita fiscale dichiarata SNC' : 'Utile fiscale dichiarato SNC')
    : risultato < 0 ? 'Perdita fiscale stimata SNC' : 'Utile fiscale stimato SNC';
  if (risultato < 0) $('kpi-utile-sub').textContent = 'I costi superano i ricavi: niente IRPEF né IRAP sul reddito, l\'INPS minimale resta dovuto.';
  $('kpi-tasse').textContent = fmtEuro(totaleTasse);

  const maxVal = Math.max(totRicaviImp, 1);
  $('bars').innerHTML =
    barra('Ricavi imponibili totali', totRicaviImp, totRicaviImp > 0 ? 100 : 0, 'bg-slate-800', 'text-slate-900') +
    barra('Costi fiscalmente deducibili', totCostiDeducibili, totCostiDeducibili / maxVal * 100, 'bg-amber-500', 'text-amber-700') +
    (risultato < 0
      ? barra('Perdita fiscale SNC (costi oltre i ricavi)', risultato, -risultato / Math.max(totCostiDeducibili, 1) * 100, 'bg-rose-500', 'text-rose-600')
      : barra('Utile fiscale SNC (base imponibile)', utileSnc, utileSnc / maxVal * 100, 'bg-emerald-500', 'text-emerald-700')) +
    barra('Utile netto residuo (dopo IRPEF, IRAP e INPS)', nettoTasca, nettoTasca / maxVal * 100, 'bg-indigo-600', 'text-indigo-700');

  const scheda = (nome, quota, utile, irpef, inps, netto, collab = 0) => `
    <div class="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
      <div class="flex justify-between items-center gap-2">
        <span class="text-xs font-bold text-slate-800">${esc(nome)} (${fmtPct(quota)})</span>
        <span class="text-xs font-bold text-emerald-700 whitespace-nowrap">${fmtEuro(utile)} utile</span>
      </div>
      <div class="mt-2 flex justify-between text-xs text-slate-600"><span>IRPEF + addizionali:</span><span class="font-semibold text-slate-900">${fmtEuro(irpef)}</span></div>
      <div class="flex justify-between text-xs text-slate-600"><span>INPS ${esc(nome)}:</span><span class="font-semibold text-slate-900">${fmtEuro(inps)}</span></div>
      ${collab ? `<div class="flex justify-between text-xs text-slate-600"><span>INPS collaboratore familiare:</span><span class="font-semibold text-slate-900">${fmtEuro(collab)}</span></div>` : ''}
      <div class="mt-1 pt-1.5 border-t border-slate-200 flex justify-between text-xs"><span class="font-semibold text-slate-700">Netto in tasca:</span><span class="font-bold ${netto < 0 ? 'text-rose-600' : 'text-emerald-700'} whitespace-nowrap">${fmtEuro(netto)} · ${fmtEuro(netto / 12)}/mese</span></div>
    </div>`;
  $('dash-soci').innerHTML =
    scheda(s.s1Nome, quotaS1(), q1, irpefS1 + addS1, inpsS1.totale, nettoS1, inpsCollab) +
    scheda(s.s2Nome, quotaS2(), q2, irpefS2 + addS2, inpsS2.totale, nettoS2) +
    `<div class="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
      <div class="flex justify-between items-center gap-2">
        <span class="text-xs font-bold text-slate-800">${esc(s.collabNome || 'Collaboratore familiare')}</span>
        <span class="text-[11px] font-semibold px-2 py-0.5 rounded-full ${appState.collabInps ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-700'}">${appState.collabInps ? 'Attivo (solo INPS)' : 'Cessato'}</span>
      </div>
      <p class="text-[11px] text-slate-500 mt-1">Nessun compenso. I contributi INPS si attivano nel tab Imposte Soci &amp; INPS.</p>
    </div>`;
  disegnaVersamentiDash(versamenti, annoDopo, s, ivaVers, {
    inps: { s1: inpsS1.fisso, s2: inpsS2.fisso, collab: inpsCollab },
    inail: { s1: +inail.s1 || 0, s2: +inail.s2 || 0 },
  });
  disegnaAvvisiPolizze();
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
  { tbody: 'tbody-acquisti', tipo: 'acquisto', voci: () => appState.acquisti.filter((x) => !['fornitori', 'estero', 'polizze', 'carta', 'scalare'].includes(x.sezione)), ph: 'Cerca spesa, fornitore, categoria, data o importo…' },
  { tbody: 'tbody-polizze', tipo: 'acquisto', voci: () => appState.acquisti.filter((x) => x.sezione === 'polizze'), ph: 'Cerca compagnia, polizza, data o importo…', riquadri: (lista, filtrata) => riquadriPolizze(lista, filtrata) },
  { tbody: 'tbody-scalare', tipo: 'acquisto', voci: () => appState.acquisti.filter((x) => x.sezione === 'scalare'), ph: 'Cerca interessi, oneri, data o importo…', riquadri: (lista, filtrata) => riquadriScalare(lista, filtrata), colonne: 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4' },
  { tbody: 'tbody-carta', tipo: 'acquisto', voci: () => appState.acquisti.filter((x) => x.sezione === 'carta'), ph: 'Cerca esercente, data o importo…', riquadri: (lista, filtrata) => riquadriCarta(lista, filtrata), colonne: 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4' },
  { tbody: 'tbody-parcelle', tipo: 'parcella', voci: () => appState.parcelle, ph: 'Cerca professionista, numero, data o importo…' },
];
const normTesto = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').toLowerCase();
const importoTesti = (n) => {
  const v = Math.round((+n || 0) * 100) / 100;
  return [fmtEuro(v), v.toFixed(2).replace('.', ','), String(v).replace('.', ',')];
};
const NOMI_REGIME = { IT_22: 'IVA 22%', IT_10: 'IVA 10%', IT_4: 'IVA 4%', ESENTE: 'esente', CH_ART8: 'Svizzera art. 8', UE_ART41: 'UE art. 41' };

function testoVoce(tipo, x) {
  const parti = [x.desc, fmtData(x.data), x.data, x.compagnia, x.numero, x.dal && fmtData(x.dal), x.al && fmtData(x.al)];
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
    const riquadri = document.createElement('div');
    riquadri.dataset.riquadri = r.tbody;
    riquadri.className = r.colonne || 'grid grid-cols-1 sm:grid-cols-3 gap-4';
    card.before(riquadri);
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
    const voci = r.voci();
    if (!parole.length) {
      righe.forEach((tr) => tr.classList.remove('hidden')); esito.textContent = '';
      disegnaRiquadri(r, voci.filter((x) => annoDi(x.data) === appState.anno), false);
      continue;
    }
    const visibili = [];
    const perRif = new Map(voci.map((x) => [`${r.tipo}:${x.id}`, x]));
    let n = 0;
    for (const tr of righe) {
      const x = perRif.get(tr.dataset.voce);
      const ok = !!x && trovata(testoVoce(r.tipo, x), parole);
      tr.classList.toggle('hidden', !ok);
      if (ok) { n++; visibili.push(x); }
    }
    disegnaRiquadri(r, visibili, true);
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

/* Riquadri sopra ogni tabella: totale, imponibile e IVA delle righe che si
   vedono (tutto l'anno, o solo i risultati della ricerca). */
function sommeVoci(tipo, lista) {
  const t = { totale: 0, imponibile: 0, iva: 0, det: 0, rc: 0, netto: 0, ritenuta: 0, n: lista.length };
  for (const x of lista) {
    if (tipo === 'entrata') {
      const b = calcEntrataBreakdown(x);
      t.totale += b.totale; t.imponibile += b.imponibile; t.iva += b.iva;
    } else if (tipo === 'acquisto') {
      const b = calcAcquistoBreakdown(x);
      t.totale += b.imponibile + b.ivaDocumento; t.imponibile += b.imponibile; t.iva += b.ivaDocumento;
      t.det += b.ivaDetraibile; t.rc += b.ivaDebitoRC;
    } else {
      const b = calcParcella(x);
      t.totale += b.totale; t.imponibile += b.imponibileIva; t.iva += b.iva; t.netto += b.netto; t.ritenuta += b.ritenuta;
    }
  }
  return t;
}

function disegnaRiquadri(r, lista, filtrata) {
  const box = document.querySelector(`[data-riquadri="${r.tbody}"]`);
  if (!box) return;
  if (r.riquadri) { box.innerHTML = r.riquadri(lista, filtrata); return; }
  const t = sommeVoci(r.tipo, lista);
  const corr = r.tbody === 'tbody-corrispettivi';
  const quante = corr ? (t.n === 1 ? 'registrazione' : 'registrazioni') : r.tipo === 'parcella' ? (t.n === 1 ? 'parcella' : 'parcelle') : (t.n === 1 ? 'fattura' : 'fatture');
  const dove = filtrata ? ' · solo i risultati della ricerca' : ` nel ${appState.anno}`;
  let subTot = `${t.n} ${quante}${dove}`;
  let titIva = 'IVA', colIva = 'text-slate-900', subIva = '', subImp = 'Senza IVA';
  if (r.tipo === 'entrata') { titIva = 'IVA a debito'; colIva = 'text-rose-600'; subIva = 'Da versare con la liquidazione'; }
  else if (r.tipo === 'acquisto') {
    titIva = 'IVA delle fatture';
    subIva = `Detraibile <strong class="text-emerald-700">${fmtEuro(t.det)}</strong>` + (t.rc ? ` · reverse charge ${fmtEuro(t.rc)}` : '');
  } else {
    titIva = 'IVA delle parcelle';
    subImp = 'Onorario + cassa';
    subTot += ` · pagato a lui ${fmtEuro(t.netto)} + ritenuta ${fmtEuro(t.ritenuta)}`;
  }
  const cella = (titolo, valore, sub, colore, forte) => `<div class="bg-white rounded-2xl border ${filtrata ? 'border-amber-300' : 'border-slate-200'} shadow-xs p-4">
      <div class="text-[11px] font-bold uppercase tracking-wide text-slate-500">${titolo}</div>
      <div class="mt-1 ${forte ? 'text-2xl' : 'text-xl'} font-bold ${colore} whitespace-nowrap">${fmtEuro(valore)}</div>
      <div class="mt-1 text-[11px] text-slate-500">${sub}</div>
    </div>`;
  box.innerHTML = cella(corr ? 'Totale incassato' : 'Totale', t.totale, subTot, 'text-slate-900', true)
    + cella('Imponibile', t.imponibile, subImp, 'text-slate-900')
    + cella(titIva, t.iva, subIva, colIva);
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
const SPOSTABILI = ['fatture', 'fornitori', 'estero', 'spese', 'polizze', 'commercialista'];
const NOMI_TAB = {
  fatture: '2. Fatture emesse', fornitori: '4. Fatture ricevute fornitori', estero: '5. Autofatture/Fatture estere',
  spese: '6. Abbonamenti/Acquisti/Spese', polizze: '7. Polizze/Assicurazioni', commercialista: '10. Commercialista',
};
const TAB_DI_DEST = { fatture: 'fatture', fornitori: 'fornitori', estero: 'estero', spese: 'acquisti', polizze: 'polizze', commercialista: 'commercialista' };
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
  for (const k of ['xml', 'xmlFile', 'xmlCorpo', 'xmlTesto', 'allegato', 'prof']) if (x[k] != null) base[k] = x[k];
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
  if (dest === 'fornitori' || dest === 'polizze') provenienza = 'IT';
  // fuori dal tab delle polizze la compagnia resta nella descrizione
  if (prima.sezione === 'polizze' && dest !== 'polizze' && prima.compagnia && !normTesto(voce.desc).includes(normTesto(prima.compagnia))) voce.desc = `${prima.compagnia} - ${voce.desc}`;
  if (dest === 'polizze' && !voce.compagnia && cp && cp.nome) voce.compagnia = cp.nome;
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
  if (v.x.sezione === 'carta' || v.x.sezione === 'scalare') return;   // carta e conto si gestiscono dalla riga
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
    ${v.x.xml ? `<button type="button" role="menuitem" data-action="vedi-xml" data-voce="${esc(tr.dataset.voce)}" class="w-full text-left px-3.5 py-2 hover:bg-amber-50 focus:bg-amber-50 outline-none text-slate-900 font-semibold">Vedi la fattura (XML)</button>
    <div class="my-1 border-t border-slate-100"></div>` : ''}
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
  if (dest === 'fornitori' || dest === 'estero' || dest === 'spese' || dest === 'polizze') {
    let attuale = (v.tipo === 'acquisto' && v.x.categoria) || (regola && regola.categoria) || 'merce_100_100';
    if (dest === 'polizze') attuale = catPolizza(attuale);
    else if (attuale.startsWith('polizza_')) attuale = 'esente_0_100';
    campi.push(`<label class="block text-xs font-semibold text-slate-700">Categoria fiscale
      <select id="sposta-categoria" class="mt-1 w-full px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white focus:ring-2 focus:ring-amber-500 outline-none">
        ${Object.entries(CATEGORIE_SPESA).filter(([k]) => (dest === 'polizze') === k.startsWith('polizza_')).map(([k, r]) => `<option value="${k}" ${k === attuale ? 'selected' : ''}>${esc(r.label)} (${esc(r.badge)})</option>`).join('')}
      </select></label>`);
  }
  $('sposta-campi').innerHTML = campi.join('');
  $('sposta-campi').classList.toggle('hidden', !campi.length);

  const note = [];
  if (dest === 'fatture') note.push('Diventa una fattura emessa: conta tra i ricavi e la sua IVA è a debito.');
  else if (v.tipo === 'entrata') note.push('Non sarà più un ricavo: diventa un costo.');
  if (dest === 'polizze') note.push('Diventa una polizza: premio esente IVA, costo deducibile secondo il tipo. Nel tab Polizze puoi indicare il periodo di copertura per gli avvisi di scadenza.');
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
// Visualizzare la fattura elettronica (XML)
// ---------------------------------------------------------------------------
/* All'importazione il file XML (estratto dal P7M se firmato) viene copiato in
   allegati/fatture/<anno>: dal pulsante XML della riga, dal menu del tasto
   destro o col doppio clic la fattura si apre in forma leggibile, con righe,
   riepilogo IVA, pagamento e allegati, e volendo il testo XML originale.
   Le fatture importate prima della 2.6 non hanno il file: reimportandolo,
   l'app lo collega senza registrarle di nuovo. */
const haFileXml = (x) => !!(x.xmlFile || x.xmlTesto);

async function conservaXml(r) {
  const f = r.f;
  if (!f.grezzo) return null;
  const corpo = f.corpo || 0;
  if (!DESKTOP) return { xmlTesto: window.FatturaPA.testoXml(f.grezzo), xmlCorpo: corpo };
  const nome = `${r.chiave.split('|')[0] || 'fattura'}_${f.numero}_${f.data}`;
  try {
    const res = await window.gestionale.salvaAllegato(`fatture/${annoDi(f.data) || 'senza-data'}`, nome, f.grezzo);
    return res && res.ok ? { xmlFile: res.rel, xmlCorpo: corpo } : null;
  } catch (_) { return null; }
}
const voceSenzaXml = (chiave) => [...appState.entrate, ...appState.acquisti, ...appState.parcelle].find((x) => x.xml === chiave && !haFileXml(x)) || null;

const badgeXml = (rif, x) => (haFileXml(x)
  ? `<button type="button" data-action="vedi-xml" data-voce="${rif}" class="ml-1.5 align-middle px-1.5 py-0.5 rounded bg-amber-100 hover:bg-amber-200 text-amber-800 text-[10px] font-bold" title="Vedi la fattura elettronica">XML</button>`
  : `<button type="button" data-action="vedi-xml" data-voce="${rif}" class="ml-1.5 align-middle px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-500 text-[10px] font-bold" title="Importata dalla fattura elettronica: il file non è ancora conservato nell'app">XML</button>`);

const MODALITA_PAGAMENTO = {
  MP01: 'Contanti', MP02: 'Assegno', MP03: 'Assegno circolare', MP04: 'Contanti presso Tesoreria', MP05: 'Bonifico',
  MP06: 'Vaglia cambiario', MP07: 'Bollettino bancario', MP08: 'Carta di pagamento', MP09: 'RID', MP10: 'RID utenze',
  MP11: 'RID veloce', MP12: 'RiBa', MP13: 'MAV', MP14: 'Quietanza erario', MP15: 'Giroconto su conti di contabilità speciale',
  MP16: 'Domiciliazione bancaria', MP17: 'Domiciliazione postale', MP18: 'Bollettino postale', MP19: 'SEPA Direct Debit',
  MP20: 'SEPA Direct Debit CORE', MP21: 'SEPA Direct Debit B2B', MP22: 'Trattenuta su somme già riscosse', MP23: 'PagoPA',
};
const CONDIZIONI_PAGAMENTO = { TP01: 'A rate', TP02: 'Pagamento completo', TP03: 'Anticipo' };
const REGIMI_FISCALI = { RF01: 'Regime ordinario', RF02: 'Contribuenti minimi', RF04: 'Agricoltura', RF05: 'Vendita sali e tabacchi', RF10: 'Intrattenimenti', RF12: 'Agriturismo', RF14: 'Agenzie di viaggio', RF17: 'IVA per cassa', RF18: 'Altro', RF19: 'Regime forfettario' };
const NATURE_IVA = {
  N1: 'Escluse art. 15', N2: 'Non soggette', 'N2.1': 'Non soggette artt. 7-7septies', 'N2.2': 'Non soggette, altri casi',
  N3: 'Non imponibili', 'N3.1': 'Non imponibili: esportazioni', 'N3.2': 'Non imponibili: cessioni intracomunitarie',
  'N3.3': 'Non imponibili: San Marino', 'N3.4': 'Non imponibili: operazioni assimilate', 'N3.5': 'Non imponibili: dichiarazione d\'intento',
  'N3.6': 'Non imponibili: altre', N4: 'Esenti', N5: 'Regime del margine', N6: 'Reverse charge', N7: 'IVA assolta in altro Stato UE',
};
const ESIGIBILITA = { I: 'immediata', D: 'differita', S: 'scissione dei pagamenti' };
const TIPI_RITENUTA = { RT01: 'persone fisiche', RT02: 'persone giuridiche', RT03: 'INPS', RT04: 'ENASARCO', RT05: 'ENPAM', RT06: 'altro' };
const nomeNatura = (n) => NATURE_IVA[n] || (n && n.startsWith('N6') ? 'Reverse charge' : NATURE_IVA[String(n).slice(0, 2)]) || n;

/* L'XML dello SDI è spesso su una riga sola: lo si va a capo per leggerlo.
   Gli allegati in base64 (anche di megabyte) si riassumono. */
function xmlLeggibile(t) {
  t = t.replace(/(<(?:[\w.-]+:)?Attachment\b[^>]*>)([\s\S]*?)(<\/(?:[\w.-]+:)?Attachment>)/g,
    (_m, a, b, c) => `${a}[… allegato di ${Math.max(1, Math.round(b.replace(/\s/g, '').length * 0.75 / 1024))} KB in base64 …]${c}`);
  if ((t.match(/\n/g) || []).length > 8) return t;
  let livello = 0;
  return t.replace(/>\s*</g, '>\n<').split('\n').map((riga) => {
    if (/^<\//.test(riga)) livello = Math.max(0, livello - 1);
    const out = '  '.repeat(livello) + riga;
    if (/^<[^!?/][^>]*[^/]>$|^<[^!?/]>$/.test(riga) && !/<\/[^>]+>$/.test(riga)) livello++;
    return out;
  }).join('\n');
}

function htmlFattura(d) {
  const soldi = (n) => (d.divisa === 'EUR' ? fmtEuro(n) : `${new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0)} ${esc(d.divisa)}`);
  const numero = (n, max = 4) => new Intl.NumberFormat('it-IT', { maximumFractionDigits: max }).format(n || 0);
  const data = (iso) => esc(fmtData(iso));
  const etichetta = (t) => `<div class="text-[11px] font-bold uppercase tracking-wide text-slate-500">${t}</div>`;
  const ivaDi = (aliquota, natura) => (natura ? `<span title="${esc(nomeNatura(natura))}">${esc(natura)}</span>` : `${numero(aliquota, 2)}%`);

  const soggetto = (titolo, s) => `<div class="p-4 rounded-xl bg-slate-50 border border-slate-200 min-w-0">
      ${etichetta(titolo)}
      <div class="mt-1 font-bold text-slate-900 break-words">${esc(s.nome)}</div>
      <div class="mt-1 text-xs text-slate-600 space-y-0.5">
        ${s.piva ? `<div>P.IVA ${esc((s.paese || 'IT') + s.piva)}</div>` : ''}
        ${s.cf && s.cf !== s.piva ? `<div>Codice fiscale ${esc(s.cf)}</div>` : ''}
        ${s.indirizzo ? `<div>${esc(s.indirizzo)}</div>` : ''}
        ${s.regime ? `<div>${esc(REGIMI_FISCALI[s.regime] || s.regime)}</div>` : ''}
        ${s.rea ? `<div>REA ${esc(s.rea)}</div>` : ''}
        ${s.email || s.telefono ? `<div>${esc([s.telefono, s.email].filter(Boolean).join(' · '))}</div>` : ''}
      </div>
    </div>`;

  const riferimenti = [
    ...d.ordini.map((x) => `Ordine ${esc(x.numero)}${x.data ? ' del ' + data(x.data) : ''}`),
    ...d.contratti.map((x) => `Contratto ${esc(x.numero)}${x.data ? ' del ' + data(x.data) : ''}`),
    ...d.ddt.map((x) => `DDT ${esc(x.numero)}${x.data ? ' del ' + data(x.data) : ''}`),
    ...d.fattureCollegate.map((x) => `Fattura collegata ${esc(x.numero)}${x.data ? ' del ' + data(x.data) : ''}`),
  ];

  const righe = d.linee.map((l) => `<tr class="align-top">
      <td class="py-2 px-2 text-slate-400">${esc(l.n)}</td>
      <td class="py-2 px-2 text-slate-900 min-w-[220px]"><div class="whitespace-pre-line break-words">${esc(l.descrizione)}</div>
        ${l.codice ? `<div class="text-[11px] text-slate-500">Cod. ${esc(l.codice)}</div>` : ''}
        ${l.inizio || l.fine ? `<div class="text-[11px] text-slate-500">Periodo ${data(l.inizio)} – ${data(l.fine)}</div>` : ''}
        ${l.sconti.length ? `<div class="text-[11px] text-slate-500">${l.sconti.map((s) => `${s.tipo === 'MG' ? 'Maggiorazione' : 'Sconto'} ${s.percentuale ? numero(s.percentuale, 2) + '%' : soldi(s.importo)}`).join(', ')}</div>` : ''}
        ${l.ritenuta ? '<div class="text-[11px] text-rose-600">Soggetta a ritenuta</div>' : ''}</td>
      <td class="py-2 px-2 text-right whitespace-nowrap">${l.quantita != null ? numero(l.quantita) + (l.um ? ' ' + esc(l.um) : '') : ''}</td>
      <td class="py-2 px-2 text-right whitespace-nowrap">${soldi(l.prezzo)}</td>
      <td class="py-2 px-2 text-right whitespace-nowrap font-semibold text-slate-900">${soldi(l.totale)}</td>
      <td class="py-2 px-2 text-right whitespace-nowrap">${ivaDi(l.aliquota, l.natura)}</td>
    </tr>`).join('');

  const riepiloghi = d.riepiloghi.map((r) => `<tr>
      <td class="py-2 px-2">${r.natura ? `${esc(r.natura)} · ${esc(nomeNatura(r.natura))}` : `IVA ${numero(r.aliquota, 2)}%`}${r.norma ? `<div class="text-[11px] text-slate-500">${esc(r.norma)}</div>` : ''}</td>
      <td class="py-2 px-2 text-right whitespace-nowrap">${soldi(r.imponibile)}</td>
      <td class="py-2 px-2 text-right whitespace-nowrap">${soldi(r.imposta)}</td>
      <td class="py-2 px-2 text-slate-500">${esc(ESIGIBILITA[r.esigibilita] || r.esigibilita || '')}</td>
    </tr>`).join('');

  const imponibile = d.riepiloghi.reduce((t, r) => t + r.imponibile, 0);
  const iva = d.riepiloghi.reduce((t, r) => t + r.imposta, 0);
  const totale = d.totale != null ? d.totale : imponibile + iva + d.bollo;
  const ritenuta = d.ritenute.reduce((t, r) => t + r.importo, 0);
  const riga = (lbl, v, cls = 'text-slate-900') => `<div class="flex justify-between gap-4"><span class="text-slate-600">${lbl}</span><span class="font-semibold whitespace-nowrap ${cls}">${v}</span></div>`;
  const totali = [
    riga('Imponibile', soldi(imponibile)),
    riga('IVA', soldi(iva)),
    d.cassa ? riga(`Cassa previdenziale ${esc(d.cassa.tipo)} ${numero(d.cassa.aliquota, 2)}% (compresa nell'imponibile)`, soldi(d.cassa.importo), 'text-slate-600') : '',
    d.bollo ? riga('Bollo', soldi(d.bollo)) : '',
    d.arrotondamento ? riga('Arrotondamento', soldi(d.arrotondamento)) : '',
    d.sconti.length ? riga('Sconti sul totale', d.sconti.map((s) => (s.percentuale ? numero(s.percentuale, 2) + '%' : soldi(s.importo))).join(', ')) : '',
    `<div class="border-t border-slate-200 pt-2 mt-1">${riga('<strong class="text-slate-900">Totale documento</strong>', soldi(totale))}</div>`,
    ...d.ritenute.map((r) => riga(`Ritenuta d'acconto ${numero(r.aliquota, 2)}% (${esc(TIPI_RITENUTA[r.tipo] || r.tipo)})`, '− ' + soldi(r.importo), 'text-rose-600')),
    ritenuta ? riga('<strong class="text-slate-900">Netto a pagare</strong>', soldi(totale - ritenuta)) : '',
  ].join('');

  const pagamenti = d.pagamenti.map((p) => p.rate.map((r) => `<div class="p-3 rounded-xl border border-slate-200 text-xs text-slate-700 space-y-0.5">
      <div class="font-semibold text-slate-900">${esc(MODALITA_PAGAMENTO[r.modalita] || r.modalita || 'Pagamento')}${p.condizioni ? ` · ${esc(CONDIZIONI_PAGAMENTO[p.condizioni] || p.condizioni)}` : ''}</div>
      ${r.importo ? `<div>Importo <strong>${soldi(r.importo)}</strong>${r.scadenza ? ` entro il <strong>${data(r.scadenza)}</strong>` : ''}</div>` : r.scadenza ? `<div>Scadenza ${data(r.scadenza)}</div>` : ''}
      ${r.iban ? `<div>IBAN <span class="font-mono">${esc(r.iban)}</span>${r.istituto ? ' · ' + esc(r.istituto) : ''}</div>` : r.istituto ? `<div>${esc(r.istituto)}</div>` : ''}
      ${r.beneficiario ? `<div>Beneficiario ${esc(r.beneficiario)}</div>` : ''}
    </div>`).join('')).join('');

  const allegati = d.allegati.map((a) => `<li class="flex items-center justify-between gap-3 px-3 py-2">
      <div class="min-w-0"><div class="text-sm font-medium text-slate-900 truncate">${esc(a.nome)}</div>
        <div class="text-[11px] text-slate-500">${esc([a.formato, a.descrizione, a.dimensione ? Math.max(1, Math.round(a.dimensione / 1024)) + ' KB' : ''].filter(Boolean).join(' · '))}</div></div>
      <button type="button" data-action="apri-allegato-xml" data-i="${a.i}" class="shrink-0 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700">Apri</button>
    </li>`).join('');

  const tr = d.trasmissione;
  return `<div class="space-y-5 text-sm">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        ${etichetta(`${esc(TIPI_DOC[d.tipoDoc] || 'Documento')} · ${esc(d.tipoDoc)}`)}
        <div class="text-xl font-bold text-slate-900">n. ${esc(d.numero)} del ${data(d.data)}</div>
        ${d.corpi > 1 ? `<div class="text-xs text-slate-500">Documento ${d.corpo + 1} di ${d.corpi} nello stesso file</div>` : ''}
      </div>
      <div class="text-right">
        ${etichetta('Totale documento')}
        <div class="text-2xl font-bold text-slate-900">${soldi(totale)}</div>
        ${ritenuta ? `<div class="text-xs text-slate-500">Netto a pagare ${soldi(totale - ritenuta)}</div>` : ''}
      </div>
    </div>
    <div class="grid sm:grid-cols-2 gap-3">
      ${soggetto('Cedente / prestatore (chi emette)', d.cedente)}
      ${soggetto('Cessionario / committente (chi riceve)', d.cessionario)}
    </div>
    ${d.causale ? `<div class="p-3 rounded-xl bg-amber-50 border border-amber-200">${etichetta('Causale')}<div class="mt-1 text-slate-800 whitespace-pre-line break-words">${esc(d.causale)}</div></div>` : ''}
    ${riferimenti.length ? `<div class="text-xs text-slate-600">${riferimenti.join(' · ')}</div>` : ''}
    <div>
      ${etichetta(`Righe (${d.linee.length})`)}
      <div class="mt-2 overflow-x-auto rounded-xl border border-slate-200">
        <table class="w-full text-left text-xs sm:text-sm">
          <thead><tr class="bg-slate-50 text-[11px] font-bold uppercase text-slate-500">
            <th class="py-2 px-2">#</th><th class="py-2 px-2">Descrizione</th><th class="py-2 px-2 text-right">Quantità</th>
            <th class="py-2 px-2 text-right">Prezzo</th><th class="py-2 px-2 text-right">Importo</th><th class="py-2 px-2 text-right">IVA</th>
          </tr></thead>
          <tbody class="divide-y divide-slate-100">${righe || '<tr><td colspan="6" class="py-4 text-center text-slate-400 text-xs">Nessuna riga</td></tr>'}</tbody>
        </table>
      </div>
    </div>
    <div class="grid md:grid-cols-2 gap-4 items-start">
      <div>
        ${etichetta('Riepilogo IVA')}
        <div class="mt-2 overflow-x-auto rounded-xl border border-slate-200">
          <table class="w-full text-left text-xs sm:text-sm">
            <thead><tr class="bg-slate-50 text-[11px] font-bold uppercase text-slate-500">
              <th class="py-2 px-2">Aliquota</th><th class="py-2 px-2 text-right">Imponibile</th><th class="py-2 px-2 text-right">Imposta</th><th class="py-2 px-2">Esigibilità</th>
            </tr></thead>
            <tbody class="divide-y divide-slate-100">${riepiloghi}</tbody>
          </table>
        </div>
      </div>
      <div class="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">${totali}</div>
    </div>
    ${pagamenti ? `<div>${etichetta('Pagamento')}<div class="mt-2 grid sm:grid-cols-2 gap-2">${pagamenti}</div></div>` : ''}
    ${allegati ? `<div>${etichetta(`Allegati nella fattura (${d.allegati.length})`)}<ul class="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200">${allegati}</ul></div>` : ''}
    <div class="text-[11px] text-slate-400">${[tr.codice ? 'Codice destinatario ' + esc(tr.codice) : '', tr.pec ? 'PEC ' + esc(tr.pec) : '', tr.progressivo ? 'Progressivo invio ' + esc(tr.progressivo) : '', d.versione ? 'Formato ' + esc(d.versione) : ''].filter(Boolean).join(' · ')}</div>
  </div>`;
}

let xmlAperto = null;

async function vediFatturaXml(rif) {
  const v = trovaVoce(rif);
  if (!v || !v.x.xml) return;
  let testo = v.x.xmlTesto || null, errore = '';
  if (!testo && v.x.xmlFile && DESKTOP) {
    try {
      const r = await window.gestionale.leggiAllegato(v.x.xmlFile);
      if (r && r.ok) testo = window.FatturaPA.testoXml(new Uint8Array(r.bytes));
      else errore = (r && r.errore) || 'File non leggibile.';
    } catch (e) { errore = e.message || String(e); }
  }
  $('xml-titolo').textContent = v.x.desc;
  $('xml-grezzo').classList.add('hidden');
  $('xml-grezzo').textContent = '';
  $('xml-mostra').textContent = 'Mostra l\'XML originale';
  xmlAperto = null;
  let d = null;
  if (testo) {
    try { d = window.FatturaPA.dettaglio(testo, v.x.xmlCorpo || 0); } catch (e) { errore = 'Il file XML non si legge: ' + (e.message || e); }
  }
  if (!d) {
    $('xml-corpo').innerHTML = `<div class="p-4 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-900 space-y-2">
        <p>${errore ? esc(errore) : 'Questa fattura è stata importata prima della versione 2.6, quando l\'app non conservava ancora il file XML.'}</p>
        <p>Per vederla, <strong>importa di nuovo lo stesso file</strong> (XML, P7M o lo ZIP scaricato da «Fatture e Corrispettivi») con il pulsante <strong>Importa fatture XML</strong>: l'app la riconosce come già registrata, non la duplica e le collega il file.</p>
      </div>`;
    $('xml-mostra').classList.add('hidden');
  } else {
    xmlAperto = { testo, corpo: v.x.xmlCorpo || 0, nome: String(v.x.xml).replace(/[^\w.-]+/g, '_') };
    $('xml-corpo').innerHTML = htmlFattura(d);
    $('xml-mostra').classList.remove('hidden');
  }
  apri($('xml-modal'));
  $('xml-modal').querySelector('.overflow-y-auto').scrollTop = 0;
}

function mostraXmlGrezzo() {
  if (!xmlAperto) return;
  const pre = $('xml-grezzo');
  const visibile = !pre.classList.contains('hidden');
  if (!visibile && !pre.textContent) pre.textContent = xmlLeggibile(xmlAperto.testo);
  pre.classList.toggle('hidden', visibile);
  $('xml-mostra').textContent = visibile ? 'Mostra l\'XML originale' : 'Nascondi l\'XML';
  if (!visibile) pre.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

async function apriAllegatoFattura(i) {
  if (!xmlAperto) return;
  let a;
  try { a = window.FatturaPA.allegatoIncorporato(xmlAperto.testo, xmlAperto.corpo, i); } catch (_) { a = null; }
  if (!a || !a.bytes.length) { showToast('Allegato non leggibile.', true); return; }
  const pdf = a.bytes[0] === 0x25 && a.bytes[1] === 0x50 && a.bytes[2] === 0x44 && a.bytes[3] === 0x46;
  if (!pdf) { showToast('Si possono aprire solo gli allegati in PDF.', true); return; }
  if (DESKTOP) {
    const r = await window.gestionale.salvaAllegato('fatture/allegati', `${xmlAperto.nome}_${a.nome || 'allegato'}`, a.bytes);
    if (r && r.ok) await apriAllegato(r.rel);
    else showToast('Non riesco a salvare l\'allegato: ' + ((r && r.errore) || ''), true);
  } else {
    window.open(URL.createObjectURL(new Blob([a.bytes], { type: 'application/pdf' })), '_blank');
  }
}

document.addEventListener('dblclick', (e) => {
  const tr = e.target.closest('tr[data-voce]');
  if (!tr || e.target.closest('input, select, textarea, button')) return;
  const v = trovaVoce(tr.dataset.voce);
  if (v && v.x.xml) vediFatturaXml(tr.dataset.voce);
});

// ---------------------------------------------------------------------------
// Polizze / assicurazioni
// ---------------------------------------------------------------------------
/* Le polizze sono acquisti della sezione «polizze»: premio esente IVA
   (art. 10), costo deducibile secondo il tipo. In più hanno compagnia,
   numero e periodo di copertura, da cui l'app ricava le scadenze: una
   polizza è «rinnovata» se c'è una registrazione successiva della stessa
   polizza (stesso numero, o stessa compagnia e descrizione). */
const CATEGORIE_POLIZZA = Object.keys(CATEGORIE_SPESA).filter((k) => k.startsWith('polizza_'));
const catPolizza = (k) => (CATEGORIE_POLIZZA.includes(k) ? k : 'polizza_100');
const polizze = () => appState.acquisti.filter((x) => x.sezione === 'polizze');
const PREAVVISO_GIORNI = 45;

const chiavePolizza = (x) => (x.numero ? 'n:' + normNome(x.numero) : 'd:' + normNome(x.compagnia || '') + '|' + normNome(x.desc));
function statoPolizza(x, tutte = polizze()) {
  if (!x.al) return null;
  const adesso = new Date(); adesso.setHours(0, 0, 0, 0);
  const [y, m, d] = x.al.split('-').map(Number);
  const giorni = Math.round((new Date(y, m - 1, d) - adesso) / 86400000);
  const k = chiavePolizza(x);
  const rinnovata = tutte.some((z) => z !== x && z.al && z.al > x.al && chiavePolizza(z) === k);
  if (rinnovata) return { giorni, tipo: 'rinnovata', testo: 'Rinnovata', cls: 'bg-slate-100 text-slate-600' };
  if (giorni < 0) return { giorni, tipo: 'scaduta', testo: `Scaduta il ${fmtData(x.al)}`, cls: 'bg-rose-100 text-rose-700' };
  if (giorni <= PREAVVISO_GIORNI) return { giorni, tipo: 'in-scadenza', testo: giorni === 0 ? 'Scade oggi' : giorni === 1 ? 'Scade domani' : `Scade tra ${giorni} giorni`, cls: 'bg-amber-100 text-amber-800' };
  return { giorni, tipo: 'attiva', testo: 'Attiva', cls: 'bg-emerald-50 text-emerald-700' };
}

function notaPolizza(x) {
  return [x.compagnia, x.numero ? 'polizza n. ' + x.numero : '', x.dal || x.al ? `copertura ${fmtData(x.dal) || '…'} – ${fmtData(x.al) || '…'}` : ''].filter(Boolean).join(', ');
}

function rigaPolizza(item, b) {
  const st = statoPolizza(item);
  const chi = [item.compagnia || (controparteDi('acquisto', item) || {}).nome, item.numero ? 'n. ' + item.numero : ''].filter(Boolean).join(' · ');
  return `<tr data-voce="acquisto:${item.id}" class="hover:bg-slate-50/80 transition align-top">
      <td class="py-3 px-4 whitespace-nowrap text-slate-600">${fmtData(item.data)}</td>
      <td class="py-3 px-4 min-w-[220px]"><div class="font-medium text-slate-900">${esc(item.desc)}${item.xml ? badgeXml('acquisto:' + item.id, item) : ''}${item.allegato && DESKTOP ? ` <button type="button" data-action="apri-allegato" data-rel="${esc(item.allegato)}" class="ml-1 px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-bold hover:bg-emerald-100 align-middle" title="Apri il PDF">📎 PDF</button>` : ''}</div>${chi ? `<div class="text-[11px] text-slate-500 mt-0.5">${esc(chi)}</div>` : ''}</td>
      <td class="py-3 px-4 text-xs text-slate-700 min-w-[130px]" title="${esc(b.rule.label)}"><span class="font-semibold">${esc(b.rule.breve || b.rule.label)}</span><div class="text-[10px] font-semibold text-slate-500 mt-0.5">${esc(b.rule.badge)}</div></td>
      <td class="py-3 px-4 text-xs whitespace-nowrap">${item.dal || item.al ? `<div class="text-slate-700">${esc(fmtData(item.dal) || '…')} – ${esc(fmtData(item.al) || '…')}</div>` : '<span class="text-slate-400">Non indicata</span>'}
        ${st ? `<span class="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold ${st.cls}">${esc(st.testo)}</span>` : ''}</td>
      <td class="py-3 px-4 text-right font-bold text-slate-900 whitespace-nowrap">${fmtEuro(b.imponibile + b.ivaDocumento)}</td>
      <td class="py-3 px-4 text-right font-semibold whitespace-nowrap ${b.costoDeducibile ? 'text-slate-900' : 'text-slate-400'}">${fmtEuro(b.costoDeducibile)}</td>
      <td class="py-3 px-4 text-center"><button data-action="del-acquisto" data-id="${item.id}" class="text-rose-500 hover:text-rose-700 text-xs font-semibold px-2 py-1 rounded-lg hover:bg-rose-50">Elimina</button></td>
    </tr>`;
}

/* Polizze da rinnovare: in scadenza entro il preavviso o scadute da poco
   senza un rinnovo registrato */
function polizzeDaRinnovare() {
  const tutte = polizze();
  return tutte.map((x) => ({ x, st: statoPolizza(x, tutte) }))
    .filter(({ st }) => st && (st.tipo === 'in-scadenza' || (st.tipo === 'scaduta' && st.giorni >= -60)))
    .sort((a, b) => a.st.giorni - b.st.giorni);
}

/* Cruscotto «Cosa pagare e quando»: tutto ciò che si paga per l'anno scelto,
   con la data di ogni versamento (spostata al lunedì se cade nel fine
   settimana). Sopra l'IVA, poi un riquadro per la società e uno per socio,
   in fondo i totali per trimestre in base alla data di pagamento. */
function disegnaVersamentiDash(v, annoDopo, s, iva, extra) {
  const anno = annoDopo - 1;
  const giorno = (a, m, g) => {
    const d = new Date(a, m - 1, g);
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
    return d;
  };
  const fmtData = (d) => d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
  const RATE = [giorno(anno, 5, 16), giorno(anno, 8, 20), giorno(anno, 11, 16), giorno(annoDopo, 2, 16)];      // INPS fisso
  const RATE_INAIL = [giorno(anno, 2, 16), giorno(anno, 5, 16), giorno(anno, 8, 20), giorno(anno, 11, 16)];
  const GIUGNO = giorno(annoDopo, 6, 30), NOVEMBRE = giorno(annoDopo, 11, 30);
  const DATE_IVA = { 1: giorno(anno, 5, 16), 2: giorno(anno, 8, 20), 3: giorno(anno, 11, 16), 4: giorno(annoDopo, 3, 16), acc: giorno(anno, 12, 27) };

  // elenco dei pagamenti: { chi: 'iva' | 'soc' | 's1' | 's2', data, importo } (l'IVA è della società)
  const pagamenti = [];
  const paga = (chi, data, importo) => { if (importo > 0.005) pagamenti.push({ chi, data, importo }); return importo; };

  // 1. IVA
  const casella = (x) => {
    const d = x.acconto ? DATE_IVA.acc : DATE_IVA[x.q];
    paga('iva', d, x.daVersare);
    return `<div class="p-3 rounded-xl border ${x.daVersare > 0 ? 'border-slate-200 bg-slate-50' : 'border-emerald-200 bg-emerald-50/50'}">
      <p class="text-[11px] font-semibold text-slate-500">${x.acconto ? 'Acconto IVA' : `${x.q}° trimestre`}</p>
      <p class="text-[11px] text-slate-500">${fmtData(d)}</p>
      <p class="text-lg font-extrabold whitespace-nowrap ${x.daVersare > 0 ? 'text-slate-900' : 'text-emerald-700'}">${x.daVersare > 0 ? fmtEuro(x.daVersare) : 'niente'}</p>
      ${x.daVersare > 0 || !x.credito ? '' : `<p class="text-[11px] text-emerald-700">credito ${fmtEuro(x.credito)}</p>`}
    </div>`;
  };
  const caselleIva = iva.map(casella).join('');
  const totIva = iva.reduce((t, x) => t + x.daVersare, 0);

  // 2. riquadri della società e dei soci
  const riga = (d, lbl, importo) => `<div class="flex justify-between gap-3 text-xs py-1">
      <span class="text-slate-600"><span class="inline-block w-32 text-slate-500">${fmtData(d)}</span>${lbl}</span>
      <span class="font-semibold text-slate-900 whitespace-nowrap">${fmtEuro(importo)}</span></div>`;
  const gruppo = (titolo, nota, righe) => `<div class="pt-3">
      <p class="text-xs font-bold text-slate-800">${titolo}</p>${nota ? `<p class="text-[11px] text-slate-500">${nota}</p>` : ''}
      <div class="mt-1 divide-y divide-slate-100">${righe}</div></div>`;
  const rate4 = (chi, date, totale, nomi) => date.map((d, i) => riga(d, nomi[i], paga(chi, d, totale / 4))).join('');
  const NOMI_INPS = ['1ª rata', '2ª rata', '3ª rata', '4ª rata'];
  const imposte = (chi, x, lbl) => !x ? '' : gruppo(lbl, `Saldo ${anno} e acconti ${annoDopo}, già tolti i crediti compensati nell'F24.`,
    riga(GIUGNO, 'saldo e 1° acconto', paga(chi, GIUGNO, x.daGiu)) + riga(NOVEMBRE, '2° acconto', paga(chi, NOVEMBRE, x.daNov)) +
    (x.resto > 0 ? `<p class="text-[11px] text-emerald-700 pt-1">Credito che avanza: ${fmtEuro(x.resto)}</p>` : ''));
  const totaleDi = (chi) => pagamenti.filter((p) => p.chi === chi).reduce((t, p) => t + p.importo, 0);
  const scheda = (chi, titolo, sotto, contenuto) => {
    const tot = totaleDi(chi);
    return `<div class="p-4 rounded-xl bg-white border border-slate-200 flex flex-col">
      <p class="text-sm font-bold text-slate-900">${esc(titolo)}</p><p class="text-[11px] text-slate-500">${sotto}</p>
      <div class="flex-1">${contenuto}</div>
      <div class="flex justify-between gap-3 text-sm pt-3 mt-3 border-t border-slate-200"><span class="font-bold text-slate-900">Totale per il ${anno}${chi === 'soc' ? ' (IVA esclusa)' : ''}:</span><span class="font-extrabold text-rose-600 whitespace-nowrap">${fmtEuro(tot)}</span></div>
    </div>`;
  };

  // società: INAIL dei soci e IRAP (l'IVA è sopra)
  const inailTot = extra.inail.s1 + extra.inail.s2;
  const contSoc =
    (inailTot > 0 ? gruppo(`INAIL ${anno}`, 'Premio per i soci: in un\'unica volta a febbraio oppure in 4 rate (dalla 2ª con piccoli interessi).',
      rate4('soc', RATE_INAIL, inailTot, NOMI_INPS)) : gruppo(`INAIL ${anno}`, 'Nessun premio inserito: si inserisce nel tab Imposte Soci &amp; INPS.', '')) +
    imposte('soc', v.soc, `IRAP ${anno}`);
  const schedaSoc = scheda('soc', 'Società', 'INAIL e IRAP', contSoc);

  const schedaSocio = (chi, nome, fisso, collab, x) => {
    const cont =
      (fisso > 0 ? gruppo(`INPS ${anno}, contributo fisso`, 'Sul minimale, in 4 rate uguali.', rate4(chi, RATE, fisso, NOMI_INPS)) : '') +
      (collab > 0 ? gruppo(`INPS ${anno} del collaboratore familiare`, 'Pagato dal titolare, in 4 rate uguali.', rate4(chi, RATE, collab, NOMI_INPS)) : '') +
      imposte(chi, x, 'IRPEF, addizionali e INPS sul reddito');
    return scheda(chi, nome, fisso > 0 ? 'INPS, IRPEF e addizionali' : 'IRPEF e addizionali (INPS non dovuto)', cont);
  };
  const schede = schedaSoc +
    schedaSocio('s1', s.s1Nome, extra.inps.s1, extra.inps.collab, v.s1) +
    schedaSocio('s2', s.s2Nome, extra.inps.s2, 0, v.s2);

  // 3. totali per trimestre, in base alla data di pagamento
  const trimestri = new Map();
  for (const p of [...pagamenti].sort((a, b) => a.data - b.data)) {
    const q = Math.floor(p.data.getMonth() / 3) + 1, a = p.data.getFullYear();
    const k = `${a}-${q}`;
    if (!trimestri.has(k)) trimestri.set(k, { nome: `${q}° trimestre ${a}`, mesi: ['gen-mar', 'apr-giu', 'lug-set', 'ott-dic'][q - 1], soc: 0, soci: 0 });
    trimestri.get(k)[p.chi === 'soc' || p.chi === 'iva' ? 'soc' : 'soci'] += p.importo;
  }
  const cella = (n, cls = '') => `<td class="py-2 text-right whitespace-nowrap ${cls}">${fmtEuro(n)}</td>`;
  const tq = [...trimestri.values()];
  const somma = tq.reduce((t, x) => ({ soc: t.soc + x.soc, soci: t.soci + x.soci }), { soc: 0, soci: 0 });

  $('dash-versamenti').innerHTML =
    `<h2 class="text-base font-bold text-slate-900">Cosa pagare e quando: il ${anno}</h2>
    <p class="text-xs text-slate-500">Tutti i versamenti dovuti per il ${anno}, ognuno con la sua data. Se la scadenza cade di sabato o domenica, si paga il lunedì.</p>
    <div class="mt-5">
      <div class="flex justify-between items-baseline gap-2"><p class="text-sm font-bold text-slate-800">IVA della società ${anno}</p><p class="text-xs text-slate-500">totale <strong class="text-slate-900">${fmtEuro(totIva)}</strong></p></div>
      <div class="grid grid-cols-2 md:grid-cols-5 gap-3 mt-2">${caselleIva}</div>
      ${iva.some((x) => x.acconto && x.daVersare > 0) ? `<p class="text-[11px] text-slate-500 mt-2">Il 4° trimestre è già al netto dell'acconto di dicembre.</p>` : ''}
    </div>
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6">${schede}</div>
    <div class="mt-6">
      <p class="text-sm font-bold text-slate-800">Totale da pagare per trimestre</p>
      <p class="text-[11px] text-slate-500">In base alla data di ogni versamento. Società: IVA, INAIL e IRAP. Soci: INPS, IRPEF e addizionali.</p>
      <table class="w-full mt-1 text-sm">
        <thead><tr class="text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-200">
          <th class="py-2 text-left font-semibold">Trimestre</th><th class="py-2 text-right font-semibold">Società</th><th class="py-2 text-right font-semibold">Soci</th><th class="py-2 text-right font-semibold">Totale</th></tr></thead>
        <tbody>${tq.map((x) => `<tr class="border-b border-slate-100"><td class="py-2 font-semibold text-slate-800">${x.nome} <span class="font-normal text-slate-500">(${x.mesi})</span></td>${cella(x.soc)}${cella(x.soci)}${cella(x.soc + x.soci, 'font-bold')}</tr>`).join('')}
          <tr><td class="py-2 font-bold text-slate-900">Totale</td>${cella(somma.soc, 'font-bold')}${cella(somma.soci, 'font-bold')}${cella(somma.soc + somma.soci, 'font-extrabold text-rose-600')}</tr></tbody>
      </table>
      <p class="text-[11px] text-slate-500 mt-2">Il dettaglio dei calcoli è nei tab Liquidazione IVA e Imposte Soci &amp; INPS.</p>
    </div>`;
}

function disegnaAvvisiPolizze() {
  const lista = polizzeDaRinnovare();
  const voce = ({ x, st }) => `<li><strong>${esc(x.desc)}</strong>${x.compagnia ? ` (${esc(x.compagnia)})` : ''}: ${st.tipo === 'scaduta' ? `<span class="text-rose-700 font-semibold">scaduta il ${esc(fmtData(x.al))}</span>` : `scade il <strong>${esc(fmtData(x.al))}</strong> (${st.giorni === 0 ? 'oggi' : st.giorni === 1 ? 'domani' : `tra ${st.giorni} giorni`})`}</li>`;
  const testo = lista.length ? `<div class="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-xs sm:text-sm text-amber-900 flex flex-col sm:flex-row sm:items-start justify-between gap-3">
      <div><div class="font-bold mb-1">${lista.length === 1 ? 'Una polizza da rinnovare' : `${lista.length} polizze da rinnovare`}</div>
        <ul class="list-disc pl-5 space-y-0.5">${lista.map(voce).join('')}</ul>
        <p class="mt-1.5 text-[11px] text-amber-800">Quando paghi il rinnovo, registralo con il nuovo periodo di copertura e l'avviso sparisce.</p></div>
      <button data-tab="polizze" class="dash-solo shrink-0 px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold transition">Vai alle polizze</button>
    </div>` : '';
  for (const id of ['po-avvisi', 'dash-polizze']) {
    const el = $(id);
    if (!el) continue;
    el.innerHTML = testo;
    el.classList.toggle('hidden', !lista.length);
    if (id === 'po-avvisi') el.querySelectorAll('.dash-solo').forEach((b) => b.remove());
  }
}

function riquadriPolizze(lista, filtrata) {
  const t = { premi: 0, ded: 0, n: lista.length };
  for (const x of lista) { const b = calcAcquistoBreakdown(x); t.premi += b.imponibile + b.ivaDocumento; t.ded += b.costoDeducibile; }
  const daRinnovare = polizzeDaRinnovare();
  const prossima = polizze().map((x) => ({ x, st: statoPolizza(x) })).filter(({ st }) => st && st.tipo !== 'rinnovata' && st.giorni >= 0).sort((a, b) => a.st.giorni - b.st.giorni)[0];
  const bordo = filtrata ? 'border-amber-300' : 'border-slate-200';
  const cella = (titolo, valore, sub, colore = 'text-slate-900', forte = false) => `<div class="bg-white rounded-2xl border ${bordo} shadow-xs p-4">
      <div class="text-[11px] font-bold uppercase tracking-wide text-slate-500">${titolo}</div>
      <div class="mt-1 ${forte ? 'text-2xl' : 'text-xl'} font-bold ${colore} whitespace-nowrap">${valore}</div>
      <div class="mt-1 text-[11px] text-slate-500">${sub}</div>
    </div>`;
  const dove = filtrata ? ' · solo i risultati della ricerca' : ` nel ${appState.anno}`;
  return cella('Premi pagati', fmtEuro(t.premi), `${t.n} ${t.n === 1 ? 'polizza' : 'polizze'}${dove}`, 'text-slate-900', true)
    + cella('Costo deducibile', fmtEuro(t.ded), t.premi - t.ded > 0.004 ? `Non deducibile ${fmtEuro(t.premi - t.ded)}` : 'Esenti IVA: conta solo il costo')
    + cella('Da rinnovare', String(daRinnovare.length), prossima ? `Prossima scadenza ${esc(fmtData(prossima.x.al))}` : 'Nessuna scadenza in vista', daRinnovare.length ? 'text-amber-600' : 'text-emerald-700');
}

// --- modulo ---
$('po-categoria').innerHTML = CATEGORIE_POLIZZA.map((k) => `<option value="${k}">${esc(CATEGORIE_SPESA[k].label)} (${esc(CATEGORIE_SPESA[k].badge)})</option>`).join('');
const NOTE_POLIZZA = {
  polizza_100: 'Premio esente IVA: tutto costo deducibile della società.',
  polizza_auto_20: 'Auto usata anche privatamente: il costo è deducibile al 20%.',
  polizza_personale_0: 'Non è un costo della società: vita, infortuni e malattia dei soci possono dare una detrazione nella loro dichiarazione personale (chiedi al commercialista).',
};
function updatePolizzaPreview() {
  const b = calcAcquistoBreakdown({ imponibile: $('po-premio').value, iva: 0, provenienza: 'IT', categoria: $('po-categoria').value });
  $('po-preview').innerHTML = `Costo deducibile: <strong class="text-slate-900">${fmtEuro(b.costoDeducibile)}</strong> <span class="text-slate-500">· ${esc(NOTE_POLIZZA[$('po-categoria').value] || '')}</span>`;
}
['po-premio', 'po-categoria'].forEach((id) => { $(id).addEventListener('input', updatePolizzaPreview); $(id).addEventListener('change', updatePolizzaPreview); });
// la copertura di solito dura un anno: la scadenza si propone da sola
$('po-dal').addEventListener('change', () => {
  const v = $('po-dal').value;
  if (!v || $('po-al').value) return;
  const [y, m, d] = v.split('-').map(Number);
  const fine = new Date(y + 1, m - 1, d - 1);
  $('po-al').value = `${fine.getFullYear()}-${String(fine.getMonth() + 1).padStart(2, '0')}-${String(fine.getDate()).padStart(2, '0')}`;
});
$('form-polizze').addEventListener('submit', function (e) {
  e.preventDefault();
  if ($('po-dal').value && $('po-al').value && $('po-al').value < $('po-dal').value) { showToast('La scadenza viene prima dell\'inizio della copertura.', true); $('po-al').focus(); return; }
  const nuovo = {
    id: Date.now(), data: $('po-data').value, desc: $('po-desc').value.trim(),
    compagnia: $('po-compagnia').value.trim(), numero: $('po-numero').value.trim(),
    dal: $('po-dal').value, al: $('po-al').value,
    provenienza: 'IT', categoria: catPolizza($('po-categoria').value),
    imponibile: parseFloat($('po-premio').value) || 0, iva: 0, sezione: 'polizze',
  };
  const categoria = nuovo.categoria;
  appState.acquisti.push(nuovo);
  appState.acquisti.sort((a, b) => a.data.localeCompare(b.data));
  saveState(); this.reset();
  $('po-data').value = nuovo.data; $('po-categoria').value = categoria;
  updatePolizzaPreview(); renderAll();
  confermaRegistrazione(nuovo.data, 'Polizza registrata.', 'po-compagnia');
});
updatePolizzaPreview();

// --- PDF delle polizze e delle quietanze ---
/* Le compagnie mandano ricevute di pagamento, quietanze e schede di polizza
   in PDF (i premi sono esenti IVA: spesso niente fattura elettronica). Il
   lettore (polizze-pdf.js) ne ricava compagnia, numero, premio e periodo;
   qui si controllano e si correggono prima di registrarli, e il PDF resta
   allegato alla riga. Un PDF già registrato (stessa polizza e stesso
   periodo) si riconosce e si salta. */
let caricamentoPolizze = null;

const giaRegistrata = (d) => polizze().find((x) => d.numero && x.numero && normNome(x.numero) === normNome(d.numero)
  && (x.dal || '') === (d.dal || '') && (x.al || '') === (d.al || ''));

async function apriPdfPolizze(lista, xmlDiretti = []) {
  showToast(`Lettura di ${lista.length} ${lista.length === 1 ? 'file' : 'file'}…`);
  let r;
  try { r = await window.PolizzePDF.leggiFile(lista); }
  catch (e) { showToast('Lettura non riuscita: ' + e.message, true); return; }
  const dopo = [...xmlDiretti, ...r.altri];
  if (!r.documenti.length) {
    if (dopo.length) { apriImport(dopo, 'polizze'); return; }
    showToast(r.errori.length ? `${r.errori[0].file}: ${r.errori[0].errore}` : 'Nessun PDF di polizze trovato.', true);
    return;
  }
  caricamentoPolizze = {
    errori: r.errori, dopo,
    righe: r.documenti.map((d) => {
      const doppia = giaRegistrata(d);
      return { d, incluso: !doppia, doppia: !!doppia, v: {
        data: d.data || oggi(), compagnia: d.compagnia, desc: d.desc, numero: d.numero,
        categoria: catPolizza(d.categoria), premio: d.premio != null ? d.premio.toFixed(2) : '', dal: d.dal, al: d.al,
      } };
    }),
  };
  disegnaPdfPolizze();
  apri($('popdf-modal'));
}

function disegnaPdfPolizze() {
  const { righe, errori, dopo } = caricamentoPolizze;
  const campo = (i, k, etichetta, tipo = 'text', extra = '') => `<label class="block text-[11px] font-semibold text-slate-600">${etichetta}
      <input type="${tipo}" data-popdf="${i}" data-campo="${k}" value="${esc(righe[i].v[k] ?? '')}" ${extra} class="mt-0.5 w-full px-2 py-1.5 rounded-lg border border-slate-300 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-400" /></label>`;
  const blocchi = righe.map(({ d, incluso, doppia, v }, i) => `<div class="rounded-xl border ${incluso ? 'border-slate-200' : 'border-slate-200 opacity-60'} p-3 sm:p-4 space-y-3">
      <div class="flex items-start justify-between gap-3">
        <label class="flex items-start gap-2 cursor-pointer">
          <input type="checkbox" data-popdf="${i}" data-campo="incluso" ${incluso ? 'checked' : ''} class="mt-0.5 w-4 h-4 accent-emerald-600" />
          <span><span class="font-bold text-slate-900">${esc(d.file)}</span>
            <span class="ml-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${d.tipoDoc === 'quietanza' ? 'bg-emerald-50 text-emerald-700' : 'bg-sky-50 text-sky-700'}">${d.tipoDoc === 'quietanza' ? 'Ricevuta / quietanza' : 'Scheda di polizza'}</span>
            ${doppia ? '<span class="ml-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600">Già registrata</span>' : ''}
            ${d.frazionamento ? `<span class="block text-[11px] text-slate-500 mt-0.5">Frazionamento ${esc(d.frazionamento.toLowerCase())}${d.pagato ? ` · pagata il ${esc(fmtData(d.pagato))}` : ''}</span>` : d.pagato ? `<span class="block text-[11px] text-slate-500 mt-0.5">Pagata il ${esc(fmtData(d.pagato))}</span>` : ''}</span>
        </label>
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
        ${campo(i, 'data', 'Data pagamento', 'date')}
        ${campo(i, 'compagnia', 'Compagnia')}
        <div class="col-span-2">${campo(i, 'desc', 'Descrizione')}</div>
        ${campo(i, 'numero', 'Numero polizza')}
        <label class="block text-[11px] font-semibold text-slate-600">Tipo
          <select data-popdf="${i}" data-campo="categoria" class="mt-0.5 w-full px-2 py-1.5 rounded-lg border border-slate-300 text-xs text-slate-900 bg-white">
            ${CATEGORIE_POLIZZA.map((k) => `<option value="${k}" ${k === v.categoria ? 'selected' : ''}>${esc(CATEGORIE_SPESA[k].label)} (${esc(CATEGORIE_SPESA[k].badge)})</option>`).join('')}
          </select></label>
        ${campo(i, 'premio', 'Premio pagato (€)', 'number', 'step="0.01" min="0"')}
        <div class="col-span-2 grid grid-cols-2 gap-2">${campo(i, 'dal', 'Coperta dal', 'date')}${campo(i, 'al', 'al', 'date')}</div>
      </div>
      ${d.avvisi.length ? `<ul class="text-[11px] text-amber-800 list-disc pl-5 space-y-0.5">${d.avvisi.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}
    </div>`);
  if (errori.length) blocchi.push(`<div class="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-900"><strong>${errori.length === 1 ? 'Un file non letto' : `${errori.length} file non letti`}:</strong> ${errori.map((e) => `${esc(e.file)} (${esc(e.errore)})`).join('; ')}</div>`);
  if (dopo.length) blocchi.push(`<div class="p-2.5 rounded-lg bg-sky-50 border border-sky-200 text-sky-900">${dopo.length === 1 ? 'C\'è anche una fattura elettronica' : `Ci sono anche ${dopo.length} fatture elettroniche`}: dopo questi PDF si apre l'importazione XML.</div>`);
  $('popdf-corpo').innerHTML = blocchi.join('');
  aggiornaRiepilogoPolizze();
}

function aggiornaRiepilogoPolizze() {
  const scelte = caricamentoPolizze.righe.filter((r) => r.incluso);
  const tot = scelte.reduce((t, r) => t + (parseFloat(r.v.premio) || 0), 0);
  $('popdf-riepilogo').textContent = scelte.length ? `${scelte.length} ${scelte.length === 1 ? 'polizza' : 'polizze'} da registrare, premi ${fmtEuro(tot)}.` : 'Nessuna polizza scelta.';
  $('popdf-ok').textContent = scelte.length ? `Registra ${scelte.length}` : 'Chiudi';
}

const aggiornaCampoPolizza = (e) => {
  const el = e.target;
  if (!caricamentoPolizze || el.dataset.popdf == null) return;
  const r = caricamentoPolizze.righe[+el.dataset.popdf];
  if (!r) return;
  if (el.dataset.campo === 'incluso') { r.incluso = el.checked; el.closest('.rounded-xl').classList.toggle('opacity-60', !el.checked); }
  else r.v[el.dataset.campo] = el.value;
  aggiornaRiepilogoPolizze();
};
document.addEventListener('input', aggiornaCampoPolizza);
document.addEventListener('change', aggiornaCampoPolizza);

function chiudiPdfPolizze() {
  const dopo = caricamentoPolizze?.dopo || [];
  caricamentoPolizze = null;
  chiudi($('popdf-modal'));
  if (dopo.length) apriImport(dopo, 'polizze');
}

async function confermaPdfPolizze() {
  if (!caricamentoPolizze) return;
  const scelte = caricamentoPolizze.righe.filter((r) => r.incluso);
  for (const { v } of scelte) {
    if (!v.data) { showToast('Manca la data del pagamento di una polizza.', true); return; }
    if (!(parseFloat(v.premio) > 0)) { showToast(`Manca il premio di «${v.desc || v.compagnia || 'una polizza'}».`, true); return; }
    if (v.dal && v.al && v.al < v.dal) { showToast(`«${v.desc}»: la scadenza viene prima dell'inizio della copertura.`, true); return; }
  }
  $('popdf-ok').disabled = true;
  let id = Date.now(), persi = 0;
  const nuove = [];
  try {
    for (const { d, v } of scelte) {
      let allegato = '';
      if (DESKTOP) {
        const nome = [v.compagnia, v.numero, v.dal || v.data].filter(Boolean).join(' ') || d.file;
        try { const r = await window.gestionale.salvaAllegato(`polizze/${annoDi(v.data) || 'senza-data'}`, nome, d.bytes); allegato = r.ok ? r.rel : ''; } catch (_) { allegato = ''; }
        if (!allegato) persi++;
      }
      const voce = {
        id: id++, data: v.data, desc: v.desc.trim() || 'Polizza', compagnia: v.compagnia.trim(), numero: v.numero.trim(),
        dal: v.dal || '', al: v.al || '', provenienza: 'IT', categoria: catPolizza(v.categoria),
        imponibile: Math.round(parseFloat(v.premio) * 100) / 100, iva: 0, sezione: 'polizze',
      };
      if (allegato) voce.allegato = allegato;
      nuove.push(voce);
    }
  } finally { $('popdf-ok').disabled = false; }
  appState.acquisti.push(...nuove);
  appState.acquisti.sort((a, b) => a.data.localeCompare(b.data));
  saveState();
  const anni = [...new Set(nuove.map((x) => annoDi(x.data)))];
  chiudiPdfPolizze();
  popolaAnni();
  if (anni.length === 1 && anni[0] && anni[0] !== appState.anno) cambiaAnnoRicerca(anni[0]);
  else renderAll();
  switchTab('polizze');
  if (nuove.length) showToast(`${nuove.length === 1 ? 'Registrata 1 polizza' : `Registrate ${nuove.length} polizze`}.${persi ? ' Non è stato possibile copiare ' + persi + ' PDF nella cartella dei dati.' : ''}`, !!persi);
}

$('po-pdf-input').addEventListener('change', (e) => {
  const lista = [...e.target.files]; e.target.value = '';
  if (lista.length) apriPdfPolizze(lista);
});

// ---------------------------------------------------------------------------
// Carta Business
// ---------------------------------------------------------------------------
/* I pagamenti fatti con la carta aziendale: spesso c'è solo lo scontrino o
   la ricevuta, non la fattura. Sono acquisti della sezione «carta» con
   l'importo pagato tutto a costo (senza fattura l'IVA non si detrae),
   deducibile secondo il tipo di spesa. Ricariche, accrediti e rimborsi
   della carta restano nel tab come movimenti, ma non sono spese; i
   pagamenti che hanno anche la fattura, già registrata in un altro tab, si
   segnano «Già fatturata» e non contano due volte. Ogni movimento ha una
   chiave (data, importo, descrizione): ricaricare un estratto che si
   sovrappone a uno già caricato aggiunge solo i movimenti nuovi. */
const cartaVoci = () => appState.acquisti.filter((x) => x.sezione === 'carta');
const NON_SPESA_CARTA = ['carta_movimento'];
const importoCarta = (x) => (x.carta && Number.isFinite(+x.carta.importo) ? +x.carta.importo : -(parseFloat(x.imponibile) || 0));
const chiaveMovCarta = (m) => `${m.data}|${Math.round(m.importo * 100)}|${normNome(m.desc)}`;
const chiaveCarta = (x) => (x.carta && x.carta.k) || chiaveMovCarta({ data: x.data, importo: importoCarta(x), desc: x.desc });
/* l'esercente: le prime due parole della descrizione, senza numeri */
const chiaveEsercente = (desc) => normTesto(desc).replace(/[^a-z ]/g, ' ').split(' ').filter((p) => p.length >= 2).slice(0, 2).join(' ');

const OPZIONI_CARTA = Object.keys(CATEGORIE_SPESA).filter((k) => !k.startsWith('polizza_'));
const opzioniCarta = (scelta) => OPZIONI_CARTA.map((k) => `<option value="${k}" ${k === scelta ? 'selected' : ''} title="${esc(CATEGORIE_SPESA[k].badge)}">${esc(CATEGORIE_SPESA[k].label)}</option>`).join('');

function categoriaCarta(desc, importo) {
  const t = normTesto(desc);
  if (importo > 0) return 'carta_movimento';
  // le commissioni (anche «per ricarica») sono spese bancarie, non movimenti
  if (/commission|canone|\bsms\b|allert|alert|imposta di bollo|spese (tenuta|gestione)|interessi|quota (annuale|associativa) carta/.test(t)) return 'esente_0_100';
  if (/ricarica|primo caricamento|accredito|rimborso totale|giroconto|ric\.? ?prep|trasferimento (da|verso)|storno/.test(t)) return 'carta_movimento';
  const ricordata = appState.cartaCategorie[chiaveEsercente(desc)];
  if (ricordata && CATEGORIE_SPESA[ricordata]) return ricordata;
  if (/infocamere|camera di commercio|pagopa|agenzia (delle )?entrate|diritto annuale|inps|comune di/.test(t)) return 'esente_0_100';
  if (/distribut|carburant|benzin|gasolio|\bagip\b|\beni(station)?\b|\bq8\b|tamoil|\besso\b|\bip\b|stazione di servizio|autostrad|telepass|parcheggi|autolavaggio/.test(t)) return 'furgone_100_100';
  if (/hotel|albergo|\bb ?& ?b\b|ostello|agriturismo|locanda|\brist|ristorant|pizzeria|trattoria|osteria|autogrill|mcdonald|burger|sushi|tavola calda|panific|pasticceri/.test(t)) return 'trasferta_0_75';
  if (/\bbar\b|caff[eè]/.test(t)) return 'caffe_0_75';
  if (/\b(tim|vodafone|wind|windtre|iliad|very mobile|kena)\b|ricarica telefon/.test(t)) return 'tel_mob_50_80';
  return 'merce_100_100';
}

function badgeCarta(x) {
  const c = [];
  if (x.carta && x.carta.provvisorio) c.push('<span class="ml-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 text-[10px] font-bold align-middle" title="Sull\'estratto risultava ancora da contabilizzare">Da contabilizzare</span>');
  if (x.categoria === 'carta_movimento') c.push('<span class="ml-1 px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-bold align-middle">Non è una spesa</span>');
  if (x.categoria === 'carta_fatturata') c.push('<span class="ml-1 px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 text-[10px] font-bold align-middle">Fattura in un altro tab</span>');
  return c.join('');
}

function disegnaCarta(voci) {
  const ordinate = voci.slice().sort((a, b) => a.item.data.localeCompare(b.item.data) || a.item.id - b.item.id);
  const mesi = new Map();
  for (const v of ordinate) {
    const k = v.item.data.slice(0, 7);
    if (!mesi.has(k)) mesi.set(k, []);
    mesi.get(k).push(v);
  }
  let html = '', spese = 0, ded = 0;
  for (const [k, lista] of mesi) {
    const [a, m] = k.split('-').map(Number);
    let sp = 0, dd = 0, ent = 0;
    for (const { item, b } of lista) {
      const imp = importoCarta(item);
      if (NON_SPESA_CARTA.includes(item.categoria)) { if (imp > 0) ent += imp; continue; }
      if (item.categoria !== 'carta_fatturata') sp += -imp;
      dd += b.costoDeducibile;
    }
    spese += sp; ded += dd;
    html += `<tr class="bg-slate-50 border-t-2 border-slate-200"><td colspan="6" class="py-2 px-4 text-xs">
        <span class="font-bold text-slate-900">${esc(nomeMese(m))} ${a}</span>
        <span class="text-slate-500"> · spese <strong class="text-slate-800">${fmtEuro(sp)}</strong> · costo deducibile <strong class="text-slate-800">${fmtEuro(dd)}</strong>${ent ? ` · ricariche e accrediti ${fmtEuro(ent)}` : ''} · ${lista.length} ${lista.length === 1 ? 'movimento' : 'movimenti'}</span>
      </td></tr>`;
    for (const { item, b } of lista) {
      const imp = importoCarta(item);
      const nonSpesa = NON_SPESA_CARTA.includes(item.categoria) || item.categoria === 'carta_fatturata' || item.categoria === 'carta_personale';
      html += `<tr data-voce="acquisto:${item.id}" class="hover:bg-slate-50/80 transition ${nonSpesa ? 'text-slate-400' : ''}">
        <td class="py-2.5 px-4 whitespace-nowrap ${nonSpesa ? '' : 'text-slate-600'}">${fmtData(item.data)}</td>
        <td class="py-2.5 px-4 min-w-[220px]"><span class="font-medium ${nonSpesa ? '' : 'text-slate-900'}">${esc(item.desc)}</span>${badgeCarta(item)}</td>
        <td class="py-2.5 px-4"><select data-carta-cat="${item.id}" aria-label="Tipo di spesa" title="${esc(b.rule.badge)}" class="w-full min-w-[200px] max-w-[300px] px-2 py-1 rounded-lg border border-slate-200 bg-white text-xs text-slate-700 focus:ring-2 focus:ring-amber-500 outline-none">${opzioniCarta(item.categoria)}</select></td>
        <td class="py-2.5 px-4 text-right font-bold whitespace-nowrap ${imp > 0 ? 'text-emerald-700' : nonSpesa ? '' : 'text-slate-900'}">${imp > 0 ? '+' : ''}${fmtEuro(imp)}</td>
        <td class="py-2.5 px-4 text-right font-semibold whitespace-nowrap ${b.costoDeducibile ? 'text-slate-900' : ''}">${fmtEuro(b.costoDeducibile)}</td>
        <td class="py-2.5 px-4 text-center"><button data-action="del-acquisto" data-id="${item.id}" class="text-rose-500 hover:text-rose-700 text-xs font-semibold px-2 py-1 rounded-lg hover:bg-rose-50">Elimina</button></td>
      </tr>`;
    }
  }
  $('tbody-carta').innerHTML = html || `<tr><td colspan="6" class="py-8 text-center text-slate-400 text-xs">Nessun pagamento con la carta nel ${appState.anno}. Carica l'estratto conto (PDF, ZIP, Excel o CSV) o registra un pagamento qui sopra.</td></tr>`;
  $('tot-ca-spese').textContent = fmtEuro(spese);
  $('tot-ca-ded').textContent = fmtEuro(ded);
  disegnaEstrattiCarta();
}

function disegnaEstrattiCarta() {
  const lista = appState.cartaEstratti.filter((e) => annoDi(e.al) === appState.anno || annoDi(e.dal) === appState.anno)
    .sort((a, b) => String(a.dal).localeCompare(String(b.dal)));
  const el = $('carta-estratti');
  el.classList.toggle('hidden', !lista.length);
  el.innerHTML = lista.length ? `<span class="text-[11px] font-bold uppercase tracking-wide text-slate-500 mr-1">Estratti caricati</span>` + lista.map((e) => `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-xs text-slate-700">
      ${esc(fmtData(e.dal))} – ${esc(fmtData(e.al))}${e.saldoFinale != null ? ` · saldo ${esc(fmtEuro(e.saldoFinale))}` : ''}
      ${e.allegato && DESKTOP ? `<button type="button" data-action="apri-allegato" data-rel="${esc(e.allegato)}" class="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-bold hover:bg-emerald-100" title="Apri ${esc(e.file)}">📎 PDF</button>` : `<span class="text-slate-400 text-[10px]" title="${esc(e.file)}">${esc(String(e.file).split('.').pop().toUpperCase())}</span>`}
    </span>`).join('') : '';
}

/* Saldo della carta a inizio anno (il saldo iniziale del primo estratto
   dell'anno, o quello finale dell'ultimo dell'anno prima) e l'ultimo segnato */
function saldiCarta(anno) {
  const conSaldi = appState.cartaEstratti.filter((e) => e.saldoIniziale != null || e.saldoFinale != null);
  const iniziali = conSaldi.filter((e) => e.saldoIniziale != null).map((e) => ({ data: e.dataSaldoIniziale || e.dal, importo: e.saldoIniziale }));
  const finali = conSaldi.filter((e) => e.saldoFinale != null).map((e) => ({ data: e.dataSaldoFinale || e.al, importo: e.saldoFinale }));
  const inizio = iniziali.filter((x) => annoDi(x.data) === anno).sort((a, b) => a.data.localeCompare(b.data))[0]
    || finali.filter((x) => annoDi(x.data) === anno - 1).sort((a, b) => b.data.localeCompare(a.data))[0] || null;
  const fine = finali.filter((x) => annoDi(x.data) === anno).sort((a, b) => b.data.localeCompare(a.data))[0] || null;
  return { inizio, fine: fine && inizio && fine.data === inizio.data ? null : fine };
}

function riquadriCarta(lista, filtrata) {
  let spese = 0, n = 0, fatturate = 0, ded = 0, entrate = 0;
  for (const x of lista) {
    const imp = importoCarta(x);
    if (NON_SPESA_CARTA.includes(x.categoria)) { if (imp > 0) entrate += imp; continue; }
    ded += calcAcquistoBreakdown(x).costoDeducibile;
    if (x.categoria === 'carta_fatturata') { fatturate += -imp; continue; }
    spese += -imp; n++;
  }
  const s = saldiCarta(appState.anno);
  const bordo = filtrata ? 'border-amber-300' : 'border-slate-200';
  const cella = (titolo, valore, sub, colore = 'text-slate-900', forte = false) => `<div class="bg-white rounded-2xl border ${bordo} shadow-xs p-4">
      <div class="text-[11px] font-bold uppercase tracking-wide text-slate-500">${titolo}</div>
      <div class="mt-1 ${forte ? 'text-2xl' : 'text-xl'} font-bold ${colore} whitespace-nowrap">${valore}</div>
      <div class="mt-1 text-[11px] text-slate-500">${sub}</div>
    </div>`;
  const dove = filtrata ? ' · solo i risultati della ricerca' : ` nel ${appState.anno}`;
  return cella('Spese con la carta', fmtEuro(spese), `${n} ${n === 1 ? 'pagamento' : 'pagamenti'}${dove}${fatturate ? ` · più ${fmtEuro(fatturate)} già fatturate` : ''}`, 'text-slate-900', true)
    + cella('Costo deducibile', fmtEuro(ded), 'Senza fattura l\'IVA non si detrae: va tutta a costo')
    + cella('Ricariche e accrediti', fmtEuro(entrate), 'Soldi messi sulla carta: non sono ricavi', 'text-emerald-700')
    + `<div class="bg-white rounded-2xl border ${bordo} shadow-xs p-4">
      <div class="text-[11px] font-bold uppercase tracking-wide text-slate-500">Saldo della carta</div>
      ${s.inizio || s.fine ? `<div class="mt-1.5 space-y-1">
        ${s.inizio ? `<div class="flex items-baseline justify-between gap-3"><span class="text-xs text-slate-500">Al ${esc(fmtData(s.inizio.data))}</span><span class="text-lg font-bold ${s.inizio.importo < 0 ? 'text-rose-600' : 'text-slate-700'} whitespace-nowrap">${fmtEuro(s.inizio.importo)}</span></div>` : ''}
        ${s.fine ? `<div class="flex items-baseline justify-between gap-3"><span class="text-xs text-slate-500">Al ${esc(fmtData(s.fine.data))}</span><span class="text-xl font-bold ${s.fine.importo < 0 ? 'text-rose-600' : 'text-slate-900'} whitespace-nowrap">${fmtEuro(s.fine.importo)}</span></div>` : ''}
      </div>
      <div class="mt-1 text-[11px] text-slate-500">${s.inizio && s.fine ? `Variazione ${fmtEuro(s.fine.importo - s.inizio.importo)}` : 'Dai saldi degli estratti in PDF'}</div>`
      : '<div class="mt-1 text-xl font-bold text-slate-400">—</div><div class="mt-1 text-[11px] text-slate-500">Si legge dagli estratti in PDF che riportano i saldi</div>'}
    </div>`;
}

// cambio del tipo di spesa direttamente nella riga: vale anche per le altre
// spese dello stesso esercente e per i prossimi estratti
document.addEventListener('change', (e) => {
  const sel = e.target.closest('[data-carta-cat]');
  if (!sel) return;
  const x = appState.acquisti.find((v) => String(v.id) === sel.dataset.cartaCat);
  if (!x || !CATEGORIE_SPESA[sel.value]) return;
  const cat = sel.value;
  x.categoria = cat;
  let altre = 0;
  const es = chiaveEsercente(x.desc);
  if (es && !NON_SPESA_CARTA.includes(cat) && cat !== 'carta_fatturata') {
    appState.cartaCategorie[es] = cat;
    for (const v of cartaVoci()) {
      if (v !== x && chiaveEsercente(v.desc) === es && v.categoria !== cat && !NON_SPESA_CARTA.includes(v.categoria) && v.categoria !== 'carta_fatturata' && importoCarta(v) < 0) { v.categoria = cat; altre++; }
    }
  }
  saveState(); renderAll();
  showToast(altre ? `Tipo cambiato anche per le altre ${altre === 1 ? 'spesa' : `${altre} spese`} dello stesso esercente: verrà proposto così anche nei prossimi estratti.` : 'Tipo di spesa aggiornato.');
});

// --- caricamento dell'estratto conto ---
let caricamentoCarta = null;

async function apriEstrattoCarta(lista) {
  showToast(`Lettura di ${lista.length === 1 ? '1 file' : `${lista.length} file`}…`);
  let r;
  try { r = await window.CartaEstratto.leggiFile(lista); }
  catch (e) { showToast('Lettura non riuscita: ' + e.message, true); return; }
  if (!r.estratti.length) {
    showToast(r.errori.length ? `${r.errori[0].file}: ${r.errori[0].errore}` : 'Nessun movimento trovato.', true);
    return;
  }
  // movimenti già registrati: stessa data, importo e descrizione (contando i doppi dello stesso giorno)
  const visti = new Map();
  for (const x of cartaVoci()) { const k = chiaveCarta(x); visti.set(k, (visti.get(k) || 0) + 1); }
  const estratti = r.estratti.sort((a, b) => String(a.dal).localeCompare(String(b.dal))).map((e) => {
    const qui = new Map();
    const movimenti = e.movimenti.map((m) => {
      const k = chiaveMovCarta(m);
      const occ = (qui.get(k) || 0) + 1; qui.set(k, occ);
      const doppio = occ <= (visti.get(k) || 0);
      const proposta = categoriaCarta(m.desc, m.importo);
      return { m, k, doppio, incluso: !doppio, categoria: proposta, proposta };
    });
    for (const [k, n] of qui) visti.set(k, Math.max(visti.get(k) || 0, n));
    return { e, movimenti };
  });
  caricamentoCarta = { estratti, errori: r.errori };
  disegnaEstrattoCarta();
  apri($('carta-modal'));
}

function disegnaEstrattoCarta() {
  const { estratti, errori } = caricamentoCarta;
  const blocchi = estratti.map(({ e, movimenti }, i) => {
    const nuovi = movimenti.filter((x) => !x.doppio).length;
    const verifiche = e.verifiche.map((v) => v.ok
      ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[11px] font-semibold">✓ ${esc(v.cosa)}: ${fmtEuro(v.atteso)}</span>`
      : `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-50 text-rose-700 text-[11px] font-semibold">✗ ${esc(v.cosa)}: l'estratto dice ${fmtEuro(v.atteso)}, letti ${fmtEuro(e.somma)}</span>`).join(' ');
    const righe = movimenti.map((x, j) => `<tr class="${x.incluso ? '' : 'opacity-50'}">
        <td class="py-1.5 px-2"><input type="checkbox" data-carta-mov="${i}:${j}" data-campo="incluso" ${x.incluso ? 'checked' : ''} class="w-4 h-4 accent-emerald-600" aria-label="Registra" /></td>
        <td class="py-1.5 px-2 whitespace-nowrap text-slate-600">${esc(fmtData(x.m.data))}</td>
        <td class="py-1.5 px-2 text-slate-900">${esc(x.m.desc)}${x.m.provvisorio ? ' <span class="px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 text-[10px] font-bold">Da contabilizzare</span>' : ''}${x.doppio ? ' <span class="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-bold">Già registrato</span>' : ''}</td>
        <td class="py-1.5 px-2 text-right font-semibold whitespace-nowrap ${x.m.importo > 0 ? 'text-emerald-700' : 'text-slate-900'}">${x.m.importo > 0 ? '+' : ''}${fmtEuro(x.m.importo)}</td>
        <td class="py-1.5 px-2"><select data-carta-mov="${i}:${j}" data-campo="categoria" class="w-full min-w-[180px] px-2 py-1 rounded-lg border border-slate-200 bg-white text-[11px]">${opzioniCarta(x.categoria)}</select></td>
      </tr>`).join('');
    return `<div class="rounded-xl border border-slate-200 overflow-hidden">
      <div class="px-3 sm:px-4 py-3 bg-slate-50 border-b border-slate-200 space-y-1.5">
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <div class="font-bold text-slate-900">${esc(e.file)}</div>
          <div class="text-[11px] text-slate-500">${esc(fmtData(e.dal))} – ${esc(fmtData(e.al))} · ${movimenti.length} movimenti, ${nuovi === movimenti.length ? 'tutti nuovi' : `${nuovi} nuovi`}</div>
        </div>
        ${verifiche ? `<div class="flex flex-wrap gap-1.5">${verifiche}</div>` : `<div class="text-[11px] text-slate-500">Il file non riporta totali o saldi: controlla che i movimenti ci siano tutti.</div>`}
      </div>
      <div class="overflow-x-auto"><table class="w-full text-left text-xs">
        <thead><tr class="text-[10px] font-bold uppercase text-slate-500 border-b border-slate-100"><th class="py-1.5 px-2"></th><th class="py-1.5 px-2">Data</th><th class="py-1.5 px-2">Descrizione</th><th class="py-1.5 px-2 text-right">Importo</th><th class="py-1.5 px-2">Tipo di spesa</th></tr></thead>
        <tbody class="divide-y divide-slate-100">${righe}</tbody>
      </table></div>
    </div>`;
  });
  if (errori.length) blocchi.push(`<div class="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-900"><strong>${errori.length === 1 ? 'Un file non letto' : `${errori.length} file non letti`}:</strong> ${errori.map((x) => `${esc(x.file)} (${esc(x.errore)})`).join('; ')}</div>`);
  $('carta-corpo').innerHTML = blocchi.join('');
  aggiornaRiepilogoCarta();
}

function aggiornaRiepilogoCarta() {
  let n = 0, spese = 0;
  for (const { movimenti } of caricamentoCarta.estratti) for (const x of movimenti) {
    if (!x.incluso) continue;
    n++;
    if (x.m.importo < 0 && !NON_SPESA_CARTA.includes(x.categoria) && x.categoria !== 'carta_fatturata') spese += -x.m.importo;
  }
  $('carta-riepilogo').textContent = n ? `${n} ${n === 1 ? 'movimento' : 'movimenti'} da registrare, spese ${fmtEuro(spese)}.` : 'Nessun movimento nuovo da registrare.';
  $('carta-ok').textContent = n ? `Registra ${n}` : 'Chiudi';
}

const aggiornaMovCarta = (e) => {
  const el = e.target;
  if (!caricamentoCarta || !el.dataset || el.dataset.cartaMov == null) return;
  const [i, j] = el.dataset.cartaMov.split(':').map(Number);
  const x = caricamentoCarta.estratti[i]?.movimenti[j];
  if (!x) return;
  if (el.dataset.campo === 'incluso') { x.incluso = el.checked; el.closest('tr').classList.toggle('opacity-50', !el.checked); }
  else x.categoria = el.value;
  aggiornaRiepilogoCarta();
};
document.addEventListener('change', aggiornaMovCarta);

function chiudiEstrattoCarta() { caricamentoCarta = null; chiudi($('carta-modal')); }

async function confermaEstrattoCarta() {
  if (!caricamentoCarta) return;
  const lavoro = caricamentoCarta;
  $('carta-ok').disabled = true;
  let id = Date.now(), aggiornati = 0, persi = 0;
  const nuove = [];
  try {
    for (const { e, movimenti } of lavoro.estratti) {
      for (const x of movimenti) {
        if (x.doppio && !x.m.provvisorio) {
          // il movimento era «da contabilizzare» e ora è definitivo
          const gia = cartaVoci().find((v) => chiaveCarta(v) === x.k && v.carta && v.carta.provvisorio);
          if (gia) { gia.carta.provvisorio = false; aggiornati++; }
        }
        if (!x.incluso) continue;
        const cat = CATEGORIE_SPESA[x.categoria] ? x.categoria : 'merce_100_100';
        nuove.push({
          id: id++, data: x.m.data, desc: x.m.desc, provenienza: 'IT', categoria: cat,
          imponibile: Math.abs(x.m.importo), iva: 0, sezione: 'carta', sezioneManuale: true,
          carta: { k: x.k, importo: x.m.importo, ...(x.m.provvisorio ? { provvisorio: true } : {}) },
        });
        // il tipo scelto a mano si ricorda per l'esercente
        const es = chiaveEsercente(x.m.desc);
        if (cat !== x.proposta && es && !NON_SPESA_CARTA.includes(cat) && cat !== 'carta_fatturata') appState.cartaCategorie[es] = cat;
      }
      let allegato = '';
      if (DESKTOP && e.bytes) {
        try { const r = await window.gestionale.salvaAllegato(`carta/${annoDi(e.al) || 'senza-data'}`, `Estratto carta ${e.dal} ${e.al}`, e.bytes); allegato = r.ok ? r.rel : ''; } catch (_) { allegato = ''; }
        if (!allegato) persi++;
      }
      appState.cartaEstratti = appState.cartaEstratti.filter((v) => !(v.dal === e.dal && v.al === e.al));
      appState.cartaEstratti.push({ file: e.file, dal: e.dal, al: e.al, saldoIniziale: e.saldoIniziale, saldoFinale: e.saldoFinale, dataSaldoIniziale: e.dataSaldoIniziale || e.dal, dataSaldoFinale: e.dataSaldoFinale || e.al, allegato, caricato: oggi() });
    }
  } finally { $('carta-ok').disabled = false; }
  appState.acquisti.push(...nuove);
  appState.acquisti.sort((a, b) => a.data.localeCompare(b.data));
  saveState();
  chiudiEstrattoCarta();
  const anni = [...new Set(nuove.map((x) => annoDi(x.data)))];
  popolaAnni();
  if (anni.length === 1 && anni[0] && anni[0] !== appState.anno) cambiaAnnoRicerca(anni[0]);
  else renderAll();
  switchTab('carta');
  const testo = nuove.length ? `${nuove.length === 1 ? 'Registrato 1 movimento' : `Registrati ${nuove.length} movimenti`} della carta.` : 'Nessun movimento nuovo: l\'estratto era già caricato.';
  showToast(testo + (aggiornati ? ` ${aggiornati} da contabilizzare ora confermati.` : '') + (persi ? ` Non è stato possibile copiare ${persi} PDF nella cartella dei dati.` : ''), !!persi);
}

$('carta-input').addEventListener('change', (e) => {
  const lista = [...e.target.files]; e.target.value = '';
  if (lista.length) apriEstrattoCarta(lista);
});

// --- modulo: un pagamento con la carta inserito a mano ---
$('ca-categoria').innerHTML = opzioniCarta('merce_100_100');
let caCategoriaToccata = false;
$('ca-categoria').addEventListener('change', () => { caCategoriaToccata = true; updateCartaPreview(); });
$('ca-desc').addEventListener('change', () => {
  if (caCategoriaToccata || !$('ca-desc').value.trim()) return;
  $('ca-categoria').value = categoriaCarta($('ca-desc').value, -1);
  updateCartaPreview();
});
function updateCartaPreview() {
  const b = calcAcquistoBreakdown({ imponibile: $('ca-importo').value, iva: 0, provenienza: 'IT', categoria: $('ca-categoria').value });
  $('ca-preview').innerHTML = `${esc(b.rule.badge)} → costo deducibile: <strong class="text-slate-900">${fmtEuro(b.costoDeducibile)}</strong> <span class="text-slate-500">· senza fattura l'IVA non si detrae</span>`;
}
$('ca-importo').addEventListener('input', updateCartaPreview);
$('form-carta').addEventListener('submit', function (e) {
  e.preventDefault();
  const importo = Math.round((parseFloat($('ca-importo').value) || 0) * 100) / 100;
  if (!(importo > 0)) { showToast('Inserisci l\'importo pagato.', true); return; }
  const desc = $('ca-desc').value.trim();
  const nuovo = {
    id: Date.now(), data: $('ca-data').value, desc, provenienza: 'IT', categoria: $('ca-categoria').value,
    imponibile: importo, iva: 0, sezione: 'carta', sezioneManuale: true, carta: { importo: -importo },
  };
  nuovo.carta.k = chiaveMovCarta({ data: nuovo.data, importo: -importo, desc });
  appState.acquisti.push(nuovo);
  appState.acquisti.sort((a, b) => a.data.localeCompare(b.data));
  saveState(); this.reset(); caCategoriaToccata = false;
  $('ca-data').value = nuovo.data; $('ca-categoria').value = 'merce_100_100';
  updateCartaPreview(); renderAll();
  confermaRegistrazione(nuovo.data, 'Pagamento con carta registrato.', 'ca-desc');
});
updateCartaPreview();

// ---------------------------------------------------------------------------
// Estratto conto scalare
// ---------------------------------------------------------------------------
/* Il conteggio delle competenze del conto: gli oneri del fido (CFA), le
   commissioni e le spese si addebitano con la valuta del conteggio e
   contano in quell'anno; gli interessi debitori dell'anno si addebitano il
   1° marzo dell'anno dopo (art. 120 TUB) e, con la contabilità semplificata
   per cassa, sono un costo dell'anno in cui si pagano. Ogni voce è un
   acquisto della sezione «scalare»; gli estratti caricati restano in
   appState.scalari con fido, tasso e saldo. Gli interessi passivi non si
   deducono ai fini IRAP: il calcolo dell'IRAP li riaggiunge. */
const fmtTasso = (t) => (+t).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 4 }) + '%';
const vociScalare = () => appState.acquisti.filter((x) => x.sezione === 'scalare');
const chiaveScalare = (d, tipo) => `${normNome(d.conto || d.banca || 'conto')}|${d.conteggio}|${tipo}`;
const TIPI_SCALARE = {
  interessi: { categoria: 'interessi_passivi', nome: 'Interessi passivi', badge: 'bg-rose-50 text-rose-700' },
  oneri: { categoria: 'esente_0_100', nome: 'Oneri fido e spese', badge: 'bg-slate-100 text-slate-700' },
};
const descScalare = (d, tipo) => {
  const conto = d.conto ? ` c/c n. ${d.conto}` : '';
  return tipo === 'interessi'
    ? `Interessi passivi ${d.annoCompetenza} sul fido${conto}${d.banca ? ` - ${d.banca}` : ''}`
    : `Oneri fido (CFA), commissioni e spese al ${fmtData(d.conteggio)}${conto}${d.banca ? ` - ${d.banca}` : ''}`;
};

function disegnaScalare(voci) {
  const ordinate = voci.slice().sort((a, b) => a.item.data.localeCompare(b.item.data) || a.item.id - b.item.id);
  let html = '', tot = 0, ded = 0;
  for (const { item, b } of ordinate) {
    const tipo = (item.scalare && item.scalare.tipo) || (item.categoria === 'interessi_passivi' ? 'interessi' : 'oneri');
    const t = TIPI_SCALARE[tipo];
    const comp = item.scalare && item.scalare.anno ? (tipo === 'interessi' ? `Maturati nel ${item.scalare.anno}` : `Conteggio al ${fmtData(item.scalare.conteggio)}`) : '';
    tot += b.imponibile; ded += b.costoDeducibile;
    html += `<tr data-voce="acquisto:${item.id}" class="hover:bg-slate-50/80 transition">
      <td class="py-3 px-4 whitespace-nowrap text-slate-600">${fmtData(item.data)}</td>
      <td class="py-3 px-4 min-w-[240px]"><div class="font-medium text-slate-900">${esc(item.desc)}</div>
        <span class="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold ${t.badge}">${esc(t.nome)}</span></td>
      <td class="py-3 px-4 text-xs text-slate-600 whitespace-nowrap">${esc(comp)}</td>
      <td class="py-3 px-4 text-right font-bold text-slate-900 whitespace-nowrap">${fmtEuro(b.imponibile)}</td>
      <td class="py-3 px-4 text-right font-semibold whitespace-nowrap">${fmtEuro(b.costoDeducibile)}</td>
      <td class="py-3 px-4 text-center"><button data-action="del-acquisto" data-id="${item.id}" class="text-rose-500 hover:text-rose-700 text-xs font-semibold px-2 py-1 rounded-lg hover:bg-rose-50">Elimina</button></td>
    </tr>`;
  }
  $('tbody-scalare').innerHTML = html || `<tr><td colspan="6" class="py-8 text-center text-slate-400 text-xs">Nessun addebito del conto nel ${appState.anno}. Carica il PDF dell'estratto conto scalare: gli interessi dell'anno prima compaiono qui con l'addebito del 1° marzo.</td></tr>`;
  $('tot-sc-importo').textContent = fmtEuro(tot);
  $('tot-sc-ded').textContent = fmtEuro(ded);
  disegnaEstrattiScalare();
}

/* gli estratti che riguardano l'anno: quelli del conteggio e quelli i cui interessi si pagano nell'anno */
function disegnaEstrattiScalare() {
  const anno = appState.anno;
  const lista = appState.scalari.filter((d) => annoDi(d.conteggio) === anno || (d.dataInteressi && annoDi(d.dataInteressi) === anno))
    .sort((a, b) => a.conteggio.localeCompare(b.conteggio));
  const el = $('scalare-estratti');
  el.classList.toggle('hidden', !lista.length);
  el.innerHTML = lista.map((d) => `<div class="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 text-xs text-slate-700 space-y-1">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="font-bold text-slate-900 text-sm">Conteggio al ${esc(fmtData(d.conteggio))}${d.banca ? ` · ${esc(d.banca)}` : ''}${d.conto ? ` · c/c ${esc(d.conto)}` : ''}</div>
        ${d.allegato && DESKTOP ? `<button type="button" data-action="apri-allegato" data-rel="${esc(d.allegato)}" class="px-2 py-1 rounded bg-emerald-50 text-emerald-700 text-[11px] font-bold hover:bg-emerald-100">📎 Apri PDF</button>` : ''}
      </div>
      <div class="flex flex-wrap gap-x-4 gap-y-1 text-slate-600">
        ${d.fido != null ? `<span>Fido <strong class="text-slate-900">${fmtEuro(d.fido)}</strong></span>` : ''}
        ${d.tasso != null ? `<span>Tasso debitore <strong class="text-slate-900">${esc(fmtTasso(d.tasso))}</strong></span>` : ''}
        ${d.interessiPeriodo != null ? `<span>Interessi del periodo ${fmtEuro(d.interessiPeriodo)}</span>` : ''}
        ${d.oneri != null ? `<span>Oneri addebitati il ${esc(fmtData(d.dataOneri))}: <strong class="text-slate-900">${fmtEuro(d.oneri)}</strong>${d.cfa != null ? ` (CFA ${fmtEuro(d.cfa)} + spese ${fmtEuro(d.spese || 0)})` : ''}</span>` : ''}
        ${d.interessiDaAddebitare != null ? `<span>Interessi ${d.annoCompetenza} da addebitare il ${esc(fmtData(d.dataInteressi))}: <strong class="text-rose-700">${fmtEuro(d.interessiDaAddebitare)}</strong></span>` : ''}
        ${d.saldoFinale != null ? `<span>Saldo al ${esc(fmtData(d.conteggio))}: <strong class="${d.saldoSegno === 'D' ? 'text-rose-700' : 'text-slate-900'}">${fmtEuro(d.saldoFinale)}${d.saldoSegno === 'D' ? ' a debito' : d.saldoSegno === 'C' ? ' a credito' : ''}</strong></span>` : ''}
      </div>
    </div>`).join('');
}

function riquadriScalare(lista, filtrata) {
  let interessi = 0, oneri = 0, ded = 0;
  const anniInt = new Set();
  for (const x of lista) {
    const b = calcAcquistoBreakdown(x);
    ded += b.costoDeducibile;
    if (x.categoria === 'interessi_passivi') { interessi += b.imponibile; if (x.scalare && x.scalare.anno) anniInt.add(x.scalare.anno); } else oneri += b.imponibile;
  }
  const anno = appState.anno;
  const ultimo = appState.scalari.filter((d) => annoDi(d.conteggio) <= anno).sort((a, b) => b.conteggio.localeCompare(a.conteggio))[0];
  const prossimi = appState.scalari.filter((d) => d.annoCompetenza === anno && d.interessiDaAddebitare != null)[0];
  const bordo = filtrata ? 'border-amber-300' : 'border-slate-200';
  const cella = (titolo, valore, sub, colore = 'text-slate-900', forte = false) => `<div class="bg-white rounded-2xl border ${bordo} shadow-xs p-4">
      <div class="text-[11px] font-bold uppercase tracking-wide text-slate-500">${titolo}</div>
      <div class="mt-1 ${forte ? 'text-2xl' : 'text-xl'} font-bold ${colore} whitespace-nowrap">${valore}</div>
      <div class="mt-1 text-[11px] text-slate-500">${sub}</div>
    </div>`;
  const dove = filtrata ? ' · solo i risultati della ricerca' : '';
  return cella(`Interessi pagati nel ${anno}`, fmtEuro(interessi), (anniInt.size ? `Maturati nel ${[...anniInt].sort().join(', ')}, addebitati a marzo` : 'Gli interessi si pagano il 1° marzo dell\'anno dopo') + dove, 'text-rose-600', true)
    + cella('Oneri fido e spese', fmtEuro(oneri), 'CFA, commissioni e spese: contano nell\'anno dell\'addebito' + dove)
    + cella('Costo deducibile', fmtEuro(ded), 'Gli interessi passivi non si deducono dall\'IRAP')
    + cella('Fido', ultimo && ultimo.fido != null ? fmtEuro(ultimo.fido) : '—',
      ultimo ? [ultimo.tasso != null ? `Tasso ${esc(fmtTasso(ultimo.tasso))}` : '', ultimo.saldoFinale != null ? `saldo al ${esc(fmtData(ultimo.conteggio))} ${fmtEuro(ultimo.saldoFinale)}${ultimo.saldoSegno === 'D' ? ' a debito' : ''}` : '',
        prossimi ? `<br><strong class="text-slate-700">Interessi ${anno} da pagare il ${esc(fmtData(prossimi.dataInteressi))}: ${fmtEuro(prossimi.interessiDaAddebitare)}</strong>` : ''].filter(Boolean).join(' · ') : 'Si legge dall\'estratto scalare');
}

// --- caricamento del PDF ---
let caricamentoScalare = null;

async function apriPdfScalare(lista) {
  showToast(`Lettura di ${lista.length === 1 ? '1 file' : `${lista.length} file`}…`);
  let r;
  try { r = await window.ScalarePDF.leggiFile(lista); }
  catch (e) { showToast('Lettura non riuscita: ' + e.message, true); return; }
  if (!r.documenti.length) {
    showToast(r.errori.length ? `${r.errori[0].file}: ${r.errori[0].errore}` : 'Nessun estratto scalare trovato.', true);
    return;
  }
  const gia = new Set(vociScalare().map((x) => x.scalare && x.scalare.k).filter(Boolean));
  caricamentoScalare = {
    errori: r.errori,
    documenti: r.documenti.sort((a, b) => a.conteggio.localeCompare(b.conteggio)).map((d) => ({
      d,
      voci: ['oneri', 'interessi'].filter((t) => (t === 'oneri' ? d.oneri : d.interessiDaAddebitare) != null && (t === 'oneri' ? d.oneri : d.interessiDaAddebitare) > 0).map((tipo) => {
        const k = chiaveScalare(d, tipo);
        return { tipo, k, doppio: gia.has(k), incluso: !gia.has(k),
          v: { data: tipo === 'oneri' ? d.dataOneri : d.dataInteressi, importo: (tipo === 'oneri' ? d.oneri : d.interessiDaAddebitare).toFixed(2), desc: descScalare(d, tipo) } };
      }),
    })),
  };
  disegnaPdfScalare();
  apri($('scalare-modal'));
}

function disegnaPdfScalare() {
  const { documenti, errori } = caricamentoScalare;
  const blocchi = documenti.map(({ d, voci }, i) => {
    const verifiche = d.verifiche.map((v) => v.ok
      ? `<span class="inline-flex px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[11px] font-semibold">✓ ${esc(v.cosa)}: ${fmtEuro(v.atteso)}</span>`
      : `<span class="inline-flex px-2 py-0.5 rounded bg-rose-50 text-rose-700 text-[11px] font-semibold">✗ ${esc(v.cosa)}: il PDF dice ${fmtEuro(v.atteso)}, la somma fa ${fmtEuro(v.letto)}</span>`).join(' ');
    const tasso = d.tassi.length ? d.tassi[d.tassi.length - 1].tasso : null;
    const righe = voci.map((x, j) => `<div class="rounded-lg border ${x.incluso ? 'border-slate-200' : 'border-slate-200 opacity-60'} p-3 space-y-2">
        <label class="flex items-start gap-2 cursor-pointer">
          <input type="checkbox" data-scalare="${i}:${j}" data-campo="incluso" ${x.incluso ? 'checked' : ''} class="mt-0.5 w-4 h-4 accent-emerald-600" />
          <span><span class="px-1.5 py-0.5 rounded text-[10px] font-bold ${TIPI_SCALARE[x.tipo].badge}">${esc(TIPI_SCALARE[x.tipo].nome)}</span>
            ${x.doppio ? '<span class="ml-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600">Già registrato</span>' : ''}
            <span class="block text-[11px] text-slate-500 mt-1">${x.tipo === 'interessi' ? `Interessi maturati nel ${d.annoCompetenza}: si addebitano il 1° marzo ${d.annoCompetenza + 1} e contano come costo del ${d.annoCompetenza + 1}. Se la banca li ha addebitati in un altro giorno, cambia la data.` : `Addebitati in conto con valuta ${esc(fmtData(d.dataOneri))}: contano come costo del ${annoDi(d.dataOneri)}.`}</span></span>
        </label>
        <div class="grid grid-cols-1 sm:grid-cols-4 gap-2">
          <label class="block text-[11px] font-semibold text-slate-600">Data addebito
            <input type="date" data-scalare="${i}:${j}" data-campo="data" value="${esc(x.v.data)}" class="mt-0.5 w-full px-2 py-1.5 rounded-lg border border-slate-300 text-xs" /></label>
          <label class="block sm:col-span-2 text-[11px] font-semibold text-slate-600">Descrizione
            <input type="text" data-scalare="${i}:${j}" data-campo="desc" value="${esc(x.v.desc)}" class="mt-0.5 w-full px-2 py-1.5 rounded-lg border border-slate-300 text-xs" /></label>
          <label class="block text-[11px] font-semibold text-slate-600">Importo (€)
            <input type="number" step="0.01" min="0" data-scalare="${i}:${j}" data-campo="importo" value="${esc(x.v.importo)}" class="mt-0.5 w-full px-2 py-1.5 rounded-lg border border-slate-300 text-xs" /></label>
        </div>
      </div>`).join('');
    return `<div class="rounded-xl border border-slate-200 p-3 sm:p-4 space-y-3">
      <div>
        <div class="font-bold text-slate-900">${esc(d.file)}</div>
        <div class="text-[11px] text-slate-500 mt-0.5">${[`Conteggio al ${fmtData(d.conteggio)}`, d.banca, d.conto ? 'c/c ' + d.conto : '', d.fido != null ? 'fido ' + fmtEuro(d.fido) : '', tasso != null ? `tasso ${fmtTasso(tasso)}` : '', d.saldoFinale != null ? `saldo ${fmtEuro(d.saldoFinale)}${d.saldoSegno === 'D' ? ' a debito' : ''}` : ''].filter(Boolean).map(esc).join(' · ')}</div>
      </div>
      ${verifiche ? `<div class="flex flex-wrap gap-1.5">${verifiche}</div>` : ''}
      ${righe || '<div class="text-slate-500">Nessun addebito da registrare in questo estratto.</div>'}
      ${d.avvisi.length ? `<ul class="text-[11px] text-amber-800 list-disc pl-5 space-y-0.5">${d.avvisi.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}
    </div>`;
  });
  if (errori.length) blocchi.push(`<div class="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-900"><strong>${errori.length === 1 ? 'Un file non letto' : `${errori.length} file non letti`}:</strong> ${errori.map((x) => `${esc(x.file)} (${esc(x.errore)})`).join('; ')}</div>`);
  $('scalare-corpo').innerHTML = blocchi.join('');
  aggiornaRiepilogoScalare();
}

function aggiornaRiepilogoScalare() {
  let n = 0, tot = 0;
  for (const { voci } of caricamentoScalare.documenti) for (const x of voci) if (x.incluso) { n++; tot += parseFloat(x.v.importo) || 0; }
  $('scalare-riepilogo').textContent = n ? `${n} ${n === 1 ? 'addebito' : 'addebiti'} da registrare, ${fmtEuro(tot)}.` : 'Niente di nuovo da registrare.';
  $('scalare-ok').textContent = n ? `Registra ${n}` : 'Salva l\'estratto';
}

const aggiornaCampoScalare = (e) => {
  const el = e.target;
  if (!caricamentoScalare || !el.dataset || el.dataset.scalare == null) return;
  const [i, j] = el.dataset.scalare.split(':').map(Number);
  const x = caricamentoScalare.documenti[i]?.voci[j];
  if (!x) return;
  if (el.dataset.campo === 'incluso') { x.incluso = el.checked; el.closest('.rounded-lg').classList.toggle('opacity-60', !el.checked); }
  else x.v[el.dataset.campo] = el.value;
  aggiornaRiepilogoScalare();
};
document.addEventListener('input', aggiornaCampoScalare);
document.addEventListener('change', aggiornaCampoScalare);

function chiudiPdfScalare() { caricamentoScalare = null; chiudi($('scalare-modal')); }

async function confermaPdfScalare() {
  if (!caricamentoScalare) return;
  for (const { voci } of caricamentoScalare.documenti) for (const x of voci) {
    if (!x.incluso) continue;
    if (!x.v.data) { showToast('Manca la data di un addebito.', true); return; }
    if (!(parseFloat(x.v.importo) > 0)) { showToast('Manca l\'importo di un addebito.', true); return; }
  }
  const lavoro = caricamentoScalare;
  $('scalare-ok').disabled = true;
  let id = Date.now(), persi = 0;
  const nuove = [];
  try {
    for (const { d, voci } of lavoro.documenti) {
      for (const x of voci) {
        if (!x.incluso) continue;
        nuove.push({
          id: id++, data: x.v.data, desc: x.v.desc.trim() || descScalare(d, x.tipo), provenienza: 'IT', categoria: TIPI_SCALARE[x.tipo].categoria,
          imponibile: Math.round(parseFloat(x.v.importo) * 100) / 100, iva: 0, sezione: 'scalare', sezioneManuale: true,
          scalare: { k: x.k, tipo: x.tipo, anno: d.annoCompetenza, conteggio: d.conteggio },
        });
      }
      let allegato = '';
      if (DESKTOP && d.bytes) {
        try { const r = await window.gestionale.salvaAllegato(`scalare/${d.annoCompetenza}`, `Estratto scalare ${d.conteggio}${d.conto ? ' ' + d.conto : ''}`, d.bytes); allegato = r.ok ? r.rel : ''; } catch (_) { allegato = ''; }
        if (!allegato) persi++;
      }
      const k = chiaveScalare(d, 'doc');
      const tasso = d.tassi.length ? d.tassi[d.tassi.length - 1].tasso : null;
      appState.scalari = appState.scalari.filter((v) => v.k !== k);
      appState.scalari.push({
        k, file: d.file, banca: d.banca, conto: d.conto, conteggio: d.conteggio, annoCompetenza: d.annoCompetenza,
        fido: d.fido ?? null, cfaPct: d.cfaPct ?? null, tasso, interessiPeriodo: d.interessiPeriodo ?? null, giaConteggiati: d.giaConteggiati,
        cfa: d.cfa ?? null, spese: d.spese ?? null, oneri: d.oneri ?? null, dataOneri: d.dataOneri,
        interessiDaAddebitare: d.interessiDaAddebitare ?? null, dataInteressi: d.dataInteressi,
        saldoFinale: d.saldoFinale ?? null, saldoSegno: d.saldoSegno || '', allegato, caricato: oggi(),
      });
    }
  } finally { $('scalare-ok').disabled = false; }
  appState.acquisti.push(...nuove);
  appState.acquisti.sort((a, b) => a.data.localeCompare(b.data));
  saveState();
  chiudiPdfScalare();
  popolaAnni();
  // si va nell'anno in cui si pagano gli interessi, se ci sono
  const int = nuove.find((x) => x.scalare.tipo === 'interessi');
  const verso = int ? annoDi(int.data) : nuove.length ? annoDi(nuove[nuove.length - 1].data) : 0;
  if (verso && verso !== appState.anno) cambiaAnnoRicerca(verso);
  else renderAll();
  switchTab('scalare');
  const anni = [...new Set(nuove.map((x) => annoDi(x.data)))].sort();
  showToast((nuove.length ? `${nuove.length === 1 ? 'Registrato 1 addebito' : `Registrati ${nuove.length} addebiti`}${anni.length > 1 ? ` (nel ${anni.join(' e nel ')})` : ''}.` : 'Estratto salvato: niente di nuovo da registrare.') + (persi ? ' Non è stato possibile copiare il PDF nella cartella dei dati.' : ''), !!persi);
}

$('scalare-input').addEventListener('change', (e) => {
  const lista = [...e.target.files]; e.target.value = '';
  if (lista.length) apriPdfScalare(lista);
});

// --- modulo: un addebito inserito a mano ---
$('sc-form').addEventListener('submit', function (e) {
  e.preventDefault();
  const importo = Math.round((parseFloat($('sc-importo').value) || 0) * 100) / 100;
  if (!(importo > 0)) { showToast('Inserisci l\'importo addebitato.', true); return; }
  const tipo = $('sc-tipo').value === 'interessi' ? 'interessi' : 'oneri';
  const nuovo = {
    id: Date.now(), data: $('sc-data').value, desc: $('sc-desc').value.trim(), provenienza: 'IT', categoria: TIPI_SCALARE[tipo].categoria,
    imponibile: importo, iva: 0, sezione: 'scalare', sezioneManuale: true, scalare: { tipo },
  };
  appState.acquisti.push(nuovo);
  appState.acquisti.sort((a, b) => a.data.localeCompare(b.data));
  saveState(); this.reset();
  $('sc-data').value = nuovo.data;
  renderAll();
  confermaRegistrazione(nuovo.data, 'Addebito del conto registrato.', 'sc-desc');
});

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
