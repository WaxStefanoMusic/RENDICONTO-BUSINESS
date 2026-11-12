'use strict';
/* ==========================================================================
   Trasforma rendiconto.html (copiato da RENDICONTO) nella versione Business.
   Ogni sostituzione deve trovare il testo atteso: se una manca lo script si
   ferma, così non si producono versioni a metà. Va eseguito una volta sola
   (è idempotente: un file già convertito viene riconosciuto e lasciato stare).
   ========================================================================== */
const fs = require('fs');
const path = require('path');
const FILE = path.join(__dirname, '..', 'rendiconto.html');
let h = fs.readFileSync(FILE, 'utf8');
if (h.includes('/* BUSINESS-PATCH */')) { console.log('già convertito'); process.exit(0); }

let n = 0;
function rep(da, a, tutte = false) {
  const c = h.split(da).length - 1;
  if (!c) { console.error('NON TROVATO:\n' + da.slice(0, 200)); process.exit(1); }
  if (c > 1 && !tutte) { console.error('AMBIGUO (' + c + '):\n' + da.slice(0, 200)); process.exit(1); }
  h = h.split(da).join(a); n++;
}

/* ---------- identità ---------- */
rep('<title>Rendicontazione — documenti e avvisi pagamenti</title>',
    '<title>Rendicontazione Business — fatture, corrispettivi e scadenze</title>');
rep('<span>Rendicontazione<small>Documenti &amp; avvisi pagamenti</small></span>',
    '<span>Rendicontazione Business<small>Fatture, corrispettivi &amp; scadenze</small></span>');
rep("indexedDB.open('rendiconto',1)", "indexedDB.open('rendiconto-business',1)");
rep("showDirectoryPicker({mode:'read',id:'rendiconto'})", "showDirectoryPicker({mode:'read',id:'rendiconto-business'})");

/* ---------- tab predefiniti ---------- */
rep("  tabs:[{id:'summary',type:'summary',name:'Rendicontazione',icon:'📊'}],",
`  tabs:[{id:'summary',type:'summary',name:'Rendicontazione',icon:'📊'}, ...TAB_BUSINESS()],`);
rep('const DEFAULT_STATE = ()=>({',
`/* BUSINESS-PATCH */
/* I tab dell'attività. «flusso» dice da che parte sta il denaro: le entrate
   (fatture emesse, corrispettivi) sono ricavi da incassare, tutto il resto
   sono costi da pagare. «cat» è la categoria imposta a ogni voce del tab:
   dove manca, la categoria si deduce dal testo del documento. */
const TAB_BUSINESS=()=>{
  const ora=new Date().toISOString();
  return [
    {id:'b_emesse',        name:'Fatture Emesse',                      icon:'📤', flusso:'entrata', cat:'vendite'},
    {id:'b_fornitori',     name:'Fatture Ricevute dai Fornitori',      icon:'📥', flusso:'uscita'},
    {id:'b_estere',        name:'Fatture Ricevute Estere/Autofatture', icon:'🌍', flusso:'uscita', cat:'estero'},
    {id:'b_abbonamenti',   name:'Fatture Abbonamenti Business',        icon:'🔁', flusso:'uscita', cat:'software'},
    {id:'b_commercialista',name:'Commercialista',                      icon:'🧑‍💼', flusso:'uscita', cat:'commercialista'},
    {id:'b_deducibili',    name:'Fatture Deducibili/Detraibili',       icon:'🧾', flusso:'uscita'},
    {id:'b_luce',          name:'Bollette Luce Business',              icon:'⚡', flusso:'uscita', cat:'energia'},
    {id:'b_corrispettivi', name:'Corrispettivi',                       icon:'🧮', flusso:'entrata', cat:'corrispettivi'},
  ].map(t=>({type:'files',vista:'tabella',createdAt:ora,...t}));
};
const DEFAULT_STATE = ()=>({`);

/* ---------- entrate / uscite ---------- */
rep('const docsOf  = id => S.docs.filter(d=>d.tabId===id);',
`const docsOf  = id => S.docs.filter(d=>d.tabId===id);

/* Entrate e uscite. Lo stato salvato resta lo stesso (da_pagare / pagato),
   cambia solo come si legge: una fattura emessa non si «paga», si incassa. */
const isEntrataTab = t => !!t && t.flusso==='entrata';
const isEntrata = d => isEntrataTab(tabById(d.tabId));
const LBL={
  uscita:{pagato:'Pagato',da_pagare:'Da pagare',scaduto:'Scaduto',ignorato:'Ignorato',pagata:'Pagata',da_pagare_r:'Da pagare',scaduta:'Scaduta',
          segna:'Segna pagato',segnaRata:'Segna rata pagata',daTot:'Da pagare',giaTot:'Già pagato'},
  entrata:{pagato:'Incassato',da_pagare:'Da incassare',scaduto:'Non incassato',ignorato:'Ignorato',pagata:'Incassata',da_pagare_r:'Da incassare',scaduta:'In ritardo',
          segna:'Segna incassato',segnaRata:'Segna rata incassata',daTot:'Da incassare',giaTot:'Già incassato'}
};
const L=(entrata,k)=>LBL[entrata?'entrata':'uscita'][k];
/* categoria di una voce: quella imposta dal tab, se c'è, altrimenti dedotta dal testo */
function categoriaPer(tabId,testo){
  const t=tabById(tabId);
  return (t&&t.cat&&CATMAP[t.cat]) ? t.cat : guessCategory(testo);
}
/* selettore Entrate/Uscite, usato nei dialoghi dei tab */
function selFlusso(t){
  const e=isEntrataTab(t);
  return \`<label class="fld" style="margin-top:12px">Tipo di voci
    <select id="tFlusso">
      <option value="uscita" \${e?'':'selected'}>Uscite — costi da pagare (fatture ricevute, bollette…)</option>
      <option value="entrata" \${e?'selected':''}>Entrate — ricavi da incassare (fatture emesse, corrispettivi)</option>
    </select></label>\`;
}`);

/* ---------- categorie aziendali ---------- */
const catStart = h.indexOf('const CATS=[');
const catEnd = h.indexOf('];', catStart) + 2;
if (catStart < 0) { console.error('CATS non trovato'); process.exit(1); }
h = h.slice(0, catStart) + `const CATS=[
  {id:'vendite',       label:'Vendite / Prestazioni', kw:['prestazione professionale','compenso professionale','parcella','fattura di vendita','cessione di beni','ns. fattura']},
  {id:'corrispettivi', label:'Corrispettivi',       kw:['corrispettiv','scontrino','registratore telematico','documento commerciale','chiusura giornaliera','incasso giornaliero']},
  {id:'merci',         label:'Merci / Materie prime', kw:['merce','materie prime','ddt','documento di trasporto','articolo','q.tà','quantità','listino']},
  {id:'servizi',       label:'Servizi da fornitori', kw:['servizio','manutenzione','assistenza tecnica','consulenza tecnica','noleggio','pulizia','trasporto']},
  {id:'estero',        label:'Estero / Reverse charge', kw:['reverse charge','inversione contabile','autofattura','td17','td18','td19','integrazione fattura','art. 17','art.17','extra ue','intra','vat','invoice']},
  {id:'software',      label:'Abbonamenti / Software', kw:['abbonamento','subscription','saas','licenz','microsoft','adobe','google workspace','aruba','register.it','canva','dropbox','zoom','slack','hosting','dominio']},
  {id:'commercialista',label:'Commercialista / Consulenza', kw:['commercialista','studio associato','dottore commercialista','tenuta contabilit','paghe','cedolin','dichiarazione dei redditi','bilancio','consulenza fiscale']},
  {id:'energia',       label:'Luce / Energia',      kw:['enel','luce','energia','elettric','servizio elettrico','a2a','iren','sorgenia','eni plenitude','edison','hera comm','octopus','kwh','punto di prelievo','dispacciamento','pod']},
  {id:'gas',           label:'Gas',                 kw:['gas','metano','italgas','2i rete gas','pdr']},
  {id:'acqua',         label:'Acqua',               kw:['acqua','idric','acquedotto','gori','acea']},
  {id:'tlc',           label:'Telefono / Internet', kw:['tim','vodafone','windtre','wind tre','iliad','fastweb','telecom','internet','fibra','adsl','mobile','linkem','eolo']},
  {id:'affitto',       label:'Affitto locali',      kw:['affitto','locazione','canone locazione','fitto','immobile strumentale']},
  {id:'personale',     label:'Personale / Collaboratori', kw:['stipendi','retribuzion','collaborator','ritenuta d\\'acconto','tfr','busta paga']},
  {id:'tasse',         label:'Imposte / F24 / INPS', kw:['f24','iva','irpef','ires','irap','inps','inail','diritto camerale','camera di commercio','agenzia entrate','tributo','cartella','pagopa','avviso di pagamento']},
  {id:'banca',         label:'Banca / Leasing / POS', kw:['banca','estratto conto','mutuo','prestito','finanziamento','leasing','commission','pos','sumup','nexi','satispay','intesa','unicredit','bper','poste']},
  {id:'assicuraz',     label:'Assicurazioni',       kw:['assicuraz','polizza','rc professionale','unipol','generali','allianz','axa','zurich']},
  {id:'auto',          label:'Auto / Carburante / Trasferte', kw:['carburante','benzina','gasolio','telepass','autostrad','pedagg','parchegg','trasferta','hotel','treno','trenitalia','italo']},
  {id:'attrezzature',  label:'Attrezzature / Beni strumentali', kw:['computer','notebook','stampante','monitor','attrezzatur','arredo','bene strumentale','ammortament']},
  {id:'altro',         label:'Altro',               kw:[]},
];` + h.slice(catEnd);
n++;

/* la categoria del tab vince sul testo, ovunque nasca o si rilegga una voce */
rep("doc.category = guessCategory((it.path||'')+' '+it.name+' '+text.slice(0,3000));",
    "doc.category = categoriaPer(tabId,(it.path||'')+' '+it.name+' '+text.slice(0,3000));");
rep("d.category=guessCategory(d.path+' '+d.name+' '+txt.slice(0,3000));",
    "d.category=categoriaPer(d.tabId,d.path+' '+d.name+' '+txt.slice(0,3000));");
rep("  return guessCategory(((t&&t.name)||'')+' '+((t&&t.url)||''));",
    "  if(t&&t.cat&&CATMAP[t.cat]) return t.cat;\n  return guessCategory(((t&&t.name)||'')+' '+((t&&t.url)||''));");

/* ---------- etichette di stato ---------- */
rep(`  const lbl={pagato:'Pagato',da_pagare:'Da pagare',scaduto:'Scaduto',ignorato:'Ignorato'}[st];
  return \`<span class="pill \${st}" title="\${st==='scaduto'?'Scaduto il '+fmtDate(prossimaScadenza(d).data||d.dueDate):lbl}"><span class="dot"></span>
    <select data-f="status">
      <option value="da_pagare" \${d.status==='da_pagare'?'selected':''}>\${st==='scaduto'?'Scaduto':'Da pagare'}</option>
      <option value="pagato" \${d.status==='pagato'?'selected':''}>Pagato</option>
      <option value="ignorato" \${d.status==='ignorato'?'selected':''}>Ignorato</option>`,
`  const e=isEntrata(d);
  const lbl=L(e,st);
  return \`<span class="pill \${st}" title="\${st==='scaduto'?L(e,'scaduto')+' — scadenza '+fmtDate(prossimaScadenza(d).data||d.dueDate):lbl}"><span class="dot"></span>
    <select data-f="status">
      <option value="da_pagare" \${d.status==='da_pagare'?'selected':''}>\${st==='scaduto'?L(e,'scaduto'):L(e,'da_pagare')}</option>
      <option value="pagato" \${d.status==='pagato'?'selected':''}>\${L(e,'pagato')}</option>
      <option value="ignorato" \${d.status==='ignorato'?'selected':''}>Ignorato</option>`);
rep("${x.pagata?'Pagata':scaduta?'Scaduta':'Da pagare'}</span>",
    "${L(isEntrata(d),x.pagata?'pagata':scaduta?'scaduta':'da_pagare_r')}</span>", true);

/* ---------- inserimento rapido ---------- */
rep(`    <label class="fld grow">Descrizione<input id="qName" placeholder="es. Bolletta luce marzo"`,
    `    <label class="fld grow">Descrizione<input id="qName" placeholder="es. Fattura n. 12 — Cliente Rossi"`);
rep(`      <option value="da_pagare" \${(bz.st||q.status)!=='pagato'?'selected':''}>Da pagare</option>
      <option value="pagato" \${(bz.st||q.status)==='pagato'?'selected':''}>Pagato</option>`,
`      <option value="da_pagare" \${(bz.st||q.status)!=='pagato'?'selected':''}>\${tabId?L(isEntrataTab(tabById(tabId)),'da_pagare'):'Da pagare / incassare'}</option>
      <option value="pagato" \${(bz.st||q.status)==='pagato'?'selected':''}>\${tabId?L(isEntrataTab(tabById(tabId)),'pagato'):'Pagato / incassato'}</option>`);
rep('      <option value="">Spese manuali</option>', '      <option value="">Voci manuali</option>');
rep("t={id:TAB_MANUALI,type:'files',name:'Spese manuali',icon:'✍'", "t={id:TAB_MANUALI,type:'files',name:'Voci manuali',icon:'✍'");
rep("name:(name||'').trim()||'Spesa senza descrizione',", "name:(name||'').trim()||'Voce senza descrizione',");

/* ---------- tabella manuale dei tab ---------- */
rep(`      <option value="da_pagare" \${bz.st!=='pagato'?'selected':''}>Da pagare</option>
      <option value="pagato" \${bz.st==='pagato'?'selected':''}>Pagato</option></select></td>`,
`      <option value="da_pagare" \${bz.st!=='pagato'?'selected':''}>\${L(isEntrataTab(t),'da_pagare')}</option>
      <option value="pagato" \${bz.st==='pagato'?'selected':''}>\${L(isEntrataTab(t),'pagato')}</option></select></td>`);
rep("strisciaTotali('TOTALE '+t.name.toUpperCase(),T,extraConsumi(list))",
    "strisciaTotali('TOTALE '+t.name.toUpperCase(),T,extraConsumi(list),isEntrataTab(t))", true);
rep(`function strisciaTotali(titolo,T,extra){`, `function strisciaTotali(titolo,T,extra,entrata){`);
rep(`      <span class="tv warn">Da pagare <b>\${fmtEur(T.daPagare)}</b></span>
      <span class="tv good">Già pagato <b>\${fmtEur(T.pagato)}</b></span>`,
`      <span class="tv warn">\${L(entrata,'daTot')} <b>\${fmtEur(T.daPagare)}</b></span>
      <span class="tv good">\${L(entrata,'giaTot')} <b>\${fmtEur(T.pagato)}</b></span>`);
rep(`      <span class="tlabel">\${esc(titolo)}</span>`,
    `      <span class="tlabel">\${esc(titolo)}</span><span class="flusso \${entrata?'in':'out'}">\${entrata?'Entrate':'Uscite'}</span>`);

/* ---------- riepilogo: ricavi, costi, saldo ---------- */
rep(`  const T=totals(list);
  const all=totals(S.docs);
  const today=todayISO(), ad=+S.settings.alertDays||7;`,
`  const T=totals(list);
  const all=totals(S.docs);
  const TE=totals(list.filter(isEntrata)), TU=totals(list.filter(d=>!isEntrata(d)));
  const allE=totals(S.docs.filter(isEntrata)), allU=totals(S.docs.filter(d=>!isEntrata(d)));
  const saldo=TE.total-TU.total, cassa=TE.pagato-TU.pagato;
  const today=todayISO(), ad=+S.settings.alertDays||7;`);
rep(`  const byCat=groupSum(list,d=>catLabel(d.category)).slice(0,10);`,
    `  const byCat=groupSum(list.filter(d=>!isEntrata(d)),d=>catLabel(d.category)).slice(0,10);`);
rep(`  const byMonth=(()=>{
    const m=new Map();`,
`  const mensile=sub=>{
    const m=new Map();`);
rep(`    for(const d of list){ const k=meseDi(d);`, `    for(const d of sub){ const k=meseDi(d);`);
rep(`    return S.settings.anno?arr:arr.slice(-12);
  })();`,
`    return S.settings.anno?arr:arr.slice(-12);
  };
  const byMonth=mensile(list.filter(d=>!isEntrata(d)));
  const byMonthE=mensile(list.filter(isEntrata));
  const maxMonE=Math.max(1,...byMonthE.map(x=>x[1]));
  const colonne=(titolo,sotto,dati,max,cls)=>dati.length>1&&dati.some(x=>x[1])?\`
    <div class="panel chart" style="grid-column:1/-1">
      <h3>\${titolo}</h3><p class="csub">\${sotto} — ultimi \${dati.length} mesi.</p>
      <div class="cols \${cls||''}">
        \${dati.map(([k,v])=>\`<div class="col" title="\${esc(k)}: \${fmtEur(v)}">
          <span class="colv">\${fmtNum(v)}</span>
          <span class="colfill" style="height:\${Math.max(2,v/max*100)}%"></span></div>\`).join('')}
      </div>
      <div class="collbl">\${dati.map(([k])=>\`<span>\${k.slice(5)}/\${k.slice(2,4)}</span>\`).join('')}</div>
    </div>\`:'';`);
rep("  ${annoBarHTML(`${T.count} document${T.count===1?'o':'i'} · <b>${fmtEur(T.total)}</b>`+",
    "  ${annoBarHTML(`${T.count} voc${T.count===1?'e':'i'} · ricavi <b>${fmtEur(TE.total)}</b> · costi <b>${fmtEur(TU.total)}</b>`+");
rep(`  <div class="tiles">
    <div class="tile"><div class="k">Totale spese\${anno?' '+esc(anno):''}</div><div class="v">\${fmtEur(T.total)}</div>
      <div class="d">\${T.count} documenti\${filterActive?' (filtrati)':''} · rimanenza <b>\${fmtEur(T.rimanenza)}</b></div></div>
    <div class="tile \${T.daPagare>0?'warn':'good'}"><div class="k">Da pagare</div><div class="v">\${fmtEur(T.daPagare)}</div>
      <div class="d">\${list.filter(d=>effStatus(d)==='da_pagare'||effStatus(d)==='scaduto').length} documenti aperti</div></div>
    <div class="tile good"><div class="k">Già pagato</div><div class="v">\${fmtEur(T.pagato)}</div>
      <div class="d">\${T.total>0?Math.round(T.pagato/T.total*100):0}% del totale</div></div>
    <div class="tile \${T.scaduto>0?'crit':''}"><div class="k">Scaduto</div><div class="v">\${fmtEur(T.scaduto)}</div>
      <div class="d">\${list.filter(d=>effStatus(d)==='scaduto').length} in ritardo</div></div>
  </div>`,
`  <div class="tiles">
    <div class="tile good"><div class="k">Ricavi\${anno?' '+esc(anno):''}</div><div class="v">\${fmtEur(TE.total)}</div>
      <div class="d">incassato <b>\${fmtEur(TE.pagato)}</b> · da incassare <b>\${fmtEur(TE.daPagare)}</b>\${filterActive?' (filtrati)':''}</div></div>
    <div class="tile warn"><div class="k">Costi\${anno?' '+esc(anno):''}</div><div class="v">\${fmtEur(TU.total)}</div>
      <div class="d">pagato <b>\${fmtEur(TU.pagato)}</b> · da pagare <b>\${fmtEur(TU.daPagare)}</b></div></div>
    <div class="tile \${saldo<0?'crit':'good'}"><div class="k">Saldo (ricavi − costi)</div><div class="v">\${fmtEur(saldo)}</div>
      <div class="d">di cassa, solo movimenti saldati: <b>\${fmtEur(cassa)}</b></div></div>
    <div class="tile \${(TE.scaduto+TU.scaduto)>0?'crit':''}"><div class="k">Scaduto</div><div class="v">\${fmtEur(TE.scaduto+TU.scaduto)}</div>
      <div class="d">crediti non incassati <b>\${fmtEur(TE.scaduto)}</b> · debiti <b>\${fmtEur(TU.scaduto)}</b></div></div>
  </div>`);
rep(`    <h2>Avvisi pagamenti</h2>
    <p class="sub">Scadenze entro \${ad} giorni e documenti da completare.</p>`,
`    <h2>Avvisi scadenze</h2>
    <p class="sub">Pagamenti e incassi attesi entro \${ad} giorni, e documenti da completare.</p>`);
rep(`      const imp=r.length?(r.find(x=>!x.pagata)?.importo):d.amount;
      return \``,
`      const imp=r.length?(r.find(x=>!x.pagata)?.importo):d.amount;
      const e=isEntrata(d);
      return \``);
rep("          <b>${esc(d.name)}</b> — ${fmtEur(imp)}${quale?",
    "          <span class=\"flusso ${e?'in':'out'}\">${e?'Incasso':'Pagamento'}</span> <b>${esc(d.name)}</b> — ${fmtEur(imp)}${quale?");
rep("<div class=\"when\">${dd<0?`Scaduto da ${-dd} giorn${-dd===1?'o':'i'}`:dd===0?'Scade <b>oggi</b>':`Scade tra ${dd} giorn${dd===1?'o':'i'}`}",
    "<div class=\"when\">${dd<0?`${e?'Da incassare, in ritardo di':'Scaduto da'} ${-dd} giorn${-dd===1?'o':'i'}`:dd===0?'Scade <b>oggi</b>':`Scade tra ${dd} giorn${dd===1?'o':'i'}`}");
rep(`<button class="sm" data-pay="\${d.id}">\${r.length?'Segna rata pagata':'Segna pagato'}</button>`,
    `<button class="sm" data-pay="\${d.id}">\${L(e,r.length?'segnaRata':'segna')}</button>`);
rep(`  <div class="panel noprint"><h2>Avvisi pagamenti</h2>`, `  <div class="panel noprint"><h2>Avvisi scadenze</h2>`);
rep(`    <h2>Aggiungi una spesa a mano</h2>
    <p class="sub">Compila e premi Invio (o «Aggiungi»): entra subito nel totale complessivo.</p>`,
`    <h2>Aggiungi una voce a mano</h2>
    <p class="sub">Compila e premi Invio (o «Aggiungi»). Scegli la destinazione: le voci di «Fatture Emesse» e «Corrispettivi» contano come ricavi, le altre come costi.</p>`);
rep(`          <option value="da_pagare" \${f.status==='da_pagare'?'selected':''}>Da pagare</option>
          <option value="scaduto" \${f.status==='scaduto'?'selected':''}>Scaduti</option>
          <option value="pagato" \${f.status==='pagato'?'selected':''}>Pagati</option>`,
`          <option value="da_pagare" \${f.status==='da_pagare'?'selected':''}>Da pagare / incassare</option>
          <option value="scaduto" \${f.status==='scaduto'?'selected':''}>Scaduti</option>
          <option value="pagato" \${f.status==='pagato'?'selected':''}>Pagati / incassati</option>`);
rep(`    <h2>Dettaglio spese</h2>
    <p class="sub">\${T.count} document\${T.count===1?'o':'i'} · totale \${fmtEur(T.total)} · <b>rimanenza \${fmtEur(T.rimanenza)}</b>`,
`    <h2>Dettaglio voci</h2>
    <p class="sub">\${T.count} voc\${T.count===1?'e':'i'} · ricavi \${fmtEur(TE.total)} · costi \${fmtEur(TU.total)} · <b>saldo \${fmtEur(saldo)}</b>`);
rep(`      <tfoot><tr>
        <td colspan="6">TOTALE COMPLESSIVO\${filterActive?' (selezione filtrata)':''}</td>
        <td class="num">\${fmtEur(T.total)}</td>
        <td colspan="5"></td>
        <td class="num">\${fmtEur(T.rimanenza)}</td><td class="noprint"></td>
      </tr>
      \${filterActive?\`<tr><td colspan="6" style="font-weight:500;color:var(--ink-2)">Totale generale (senza filtri)</td>
        <td class="num" style="font-weight:600">\${fmtEur(all.total)}</td>
        <td colspan="5"></td>
        <td class="num" style="font-weight:600">\${fmtEur(all.rimanenza)}</td><td class="noprint"></td></tr>\`:''}`,
`      <tfoot><tr class="entrata">
        <td colspan="6">TOTALE RICAVI\${filterActive?' (selezione filtrata)':''}</td>
        <td class="num">\${fmtEur(TE.total)}</td>
        <td colspan="5" style="font-weight:500;color:var(--ink-2)">da incassare</td>
        <td class="num">\${fmtEur(TE.rimanenza)}</td><td class="noprint"></td>
      </tr><tr>
        <td colspan="6">TOTALE COSTI\${filterActive?' (selezione filtrata)':''}</td>
        <td class="num">\${fmtEur(TU.total)}</td>
        <td colspan="5" style="font-weight:500;color:var(--ink-2)">da pagare</td>
        <td class="num">\${fmtEur(TU.rimanenza)}</td><td class="noprint"></td>
      </tr><tr>
        <td colspan="6">SALDO (ricavi − costi)</td>
        <td class="num">\${fmtEur(saldo)}</td>
        <td colspan="5" style="font-weight:500;color:var(--ink-2)">saldo dei sospesi</td>
        <td class="num">\${fmtEur(TE.rimanenza-TU.rimanenza)}</td><td class="noprint"></td>
      </tr>
      \${filterActive?\`<tr><td colspan="6" style="font-weight:500;color:var(--ink-2)">Saldo generale (senza filtri)</td>
        <td class="num" style="font-weight:600">\${fmtEur(allE.total-allU.total)}</td>
        <td colspan="5"></td>
        <td class="num" style="font-weight:600">\${fmtEur(allE.rimanenza-allU.rimanenza)}</td><td class="noprint"></td></tr>\`:''}`);
rep(`Nessun documento corrisponde ai filtri.<br>Aggiungi un tab con <b>＋ File/Cartella</b> o <b>＋ Sito</b>.`,
    `Nessuna voce corrisponde ai filtri.<br>Apri uno dei tab (Fatture Emesse, Fornitori, Corrispettivi…) e aggiungi le prime righe, o trascina lì i PDF.`);
rep(`      <h3>Spese per categoria</h3><p class="csub">Somma degli importi, ordine decrescente.</p>`,
    `      <h3>Costi per categoria</h3><p class="csub">Somma dei costi, ordine decrescente.</p>`);
rep(`      <h3>Spese per origine</h3><p class="csub">Quanto pesa ogni sito / cartella.</p>`,
    `      <h3>Importi per tab</h3><p class="csub">Quanto pesa ogni tab (ricavi e costi).</p>`);
// i due grafici mensili sostituiscono quello unico
const mStart = h.indexOf("    ${byMonth.length>1?`\n    <div class=\"panel chart\" style=\"grid-column:1/-1\">\n      <h3>Andamento mensile</h3>");
if (mStart < 0) { console.error('grafico mensile non trovato'); process.exit(1); }
const mEnd = h.indexOf("    </div>`:''}", mStart) + "    </div>`:''}".length;
h = h.slice(0, mStart) +
  "    ${colonne('Ricavi mensili','Fatture emesse e corrispettivi per mese di scadenza',byMonthE,maxMonE,'in')}\n" +
  "    ${colonne('Costi mensili','Totale dei costi per mese di scadenza',byMonth,maxMon,'')}" +
  h.slice(mEnd);
n++;

/* righe delle entrate riconoscibili a colpo d'occhio */
rep(`  return \`<tr data-id="\${d.id}" class="\${numeroRate(d)>1?'con-rate':''}">
    \${cellaEspandi(d)}
    <td>\${inputData('docDate',d.docDate,124)}</td>`,
`  return \`<tr data-id="\${d.id}" class="\${numeroRate(d)>1?'con-rate':''}\${isEntrata(d)?' entrata':''}">
    \${cellaEspandi(d)}
    <td>\${inputData('docDate',d.docDate,124)}</td>`);
rep("    ${conOrigine?`<td><span class=\"tag\">${esc(tabById(d.tabId)?.name||'—')}</span></td>`:''}",
    "    ${conOrigine?`<td><span class=\"tag\">${esc(tabById(d.tabId)?.name||'—')}</span> <span class=\"flusso ${isEntrata(d)?'in':'out'}\">${isEntrata(d)?'Entrata':'Uscita'}</span></td>`:''}");

/* ---------- dialoghi dei tab: Entrate / Uscite ---------- */
rep(`    <label class="fld" style="margin-top:10px">Icona (emoji)<input id="mIcon" value="\${esc(t.icon||'')}" maxlength="4" style="width:90px"></label>
  \`,[{label:'Annulla'},{label:'Salva',primary:true,fn:()=>{
    const v=$('#mName').value.trim(); if(v) t.name=v;`,
`    <label class="fld" style="margin-top:10px">Icona (emoji)<input id="mIcon" value="\${esc(t.icon||'')}" maxlength="4" style="width:90px"></label>
    \${selFlusso(t)}
  \`,[{label:'Annulla'},{label:'Salva',primary:true,fn:()=>{
    const v=$('#mName').value.trim(); if(v) t.name=v;
    t.flusso=$('#tFlusso').value;`);
rep(`      <textarea id="tNote" rows="2" placeholder="Nessuna password viene salvata">\${esc(t?.note||'')}</textarea></label>`,
`      <textarea id="tNote" rows="2" placeholder="Nessuna password viene salvata">\${esc(t?.note||'')}</textarea></label>
    \${selFlusso(t)}`);
rep(`    if(t){ Object.assign(t,{url,name,icon:$('#tIcon').value.trim()||'🌐',note:$('#tNote').value.trim()}); }
    else{
      const nt={id:uid(),type:'site',url,name,icon:$('#tIcon').value.trim()||'🌐',note:$('#tNote').value.trim(),createdAt:new Date().toISOString()};`,
`    const flusso=$('#tFlusso').value;
    if(t){ Object.assign(t,{url,name,icon:$('#tIcon').value.trim()||'🌐',note:$('#tNote').value.trim(),flusso}); }
    else{
      const nt={id:uid(),type:'site',url,name,flusso,icon:$('#tIcon').value.trim()||'🌐',note:$('#tNote').value.trim(),createdAt:new Date().toISOString()};`);
rep(`      <label class="fld">Nome del tab<input id="tName" placeholder="es. Bollette 2026"></label>
      <label class="fld">Icona<input id="tIcon" maxlength="4" value="📁"></label>
    </div>`,
`      <label class="fld">Nome del tab<input id="tName" placeholder="es. Fatture Amazon Business"></label>
      <label class="fld">Icona<input id="tIcon" maxlength="4" value="📁"></label>
    </div>
    \${selFlusso(null)}`);
rep(`    const nt={id:uid(),type:'files',name,icon:$('#tIcon').value.trim()||'📁',createdAt:new Date().toISOString()};`,
    `    const nt={id:uid(),type:'files',name,flusso:$('#tFlusso').value,icon:$('#tIcon').value.trim()||'📁',createdAt:new Date().toISOString()};`);

/* ---------- CSV ---------- */
rep(`  const head=['Data','Documento','Percorso','Origine','Categoria','Scadenza','Stato','Importo','Note'];`,
    `  const head=['Data','Documento','Percorso','Origine','Tipo','Categoria','Scadenza','Stato','Importo','Note'];`);
rep(`  const rows=list.map(d=>[d.docDate||'',d.name,d.path,tabById(d.tabId)?.name||'',catLabel(d.category),
    d.dueDate||'',{pagato:'Pagato',da_pagare:'Da pagare',scaduto:'Scaduto',ignorato:'Ignorato'}[effStatus(d)],`,
`  const rows=list.map(d=>[d.docDate||'',d.name,d.path,tabById(d.tabId)?.name||'',isEntrata(d)?'Entrata':'Uscita',catLabel(d.category),
    d.dueDate||'',L(isEntrata(d),effStatus(d)),`);
rep(`  rows.push(['','','','','','','TOTALE',q(fmtNum(T.total)),''].join(';'));`,
`  const TE=totals(list.filter(isEntrata)), TU=totals(list.filter(d=>!isEntrata(d)));
  rows.push(['','','','','','','','TOTALE RICAVI',q(fmtNum(TE.total)),''].join(';'));
  rows.push(['','','','','','','','TOTALE COSTI',q(fmtNum(TU.total)),''].join(';'));
  rows.push(['','','','','','','','SALDO',q(fmtNum(TE.total-TU.total)),''].join(';'));`);
rep("     `rendiconto${annoAttivo()?'_'+annoAttivo():''}_${todayISO()}.csv`);",
    "     `rendiconto-business${annoAttivo()?'_'+annoAttivo():''}_${todayISO()}.csv`);");

/* ---------- avvio ---------- */
rep("  if(due.length) notify('Avvisi pagamenti', due.length+' scadenz'+(due.length===1?'a':'e')+' da gestire');",
    "  if(due.length) notify('Avvisi scadenze', due.length+' scadenz'+(due.length===1?'a':'e')+' da gestire (pagamenti e incassi)');");

/* ---------- stile ---------- */
rep('/* toast */',
`/* entrate / uscite */
.flusso{display:inline-block;font-size:10.5px;font-weight:600;letter-spacing:.03em;text-transform:uppercase;
  padding:1px 7px;border-radius:999px;border:1px solid var(--border);vertical-align:middle;margin-left:6px;white-space:nowrap}
.flusso.in{color:var(--good-text);border-color:var(--good)}
.flusso.out{color:var(--ink-2)}
tr.entrata td.num input[data-f="amount"]{color:var(--good-text);font-weight:600}
tfoot tr.entrata td.num{color:var(--good-text)}
.cols.in .colfill{background:var(--good)}
/* toast */`);

fs.writeFileSync(FILE, h, 'utf8');
console.log('Business: ' + n + ' modifiche applicate');
