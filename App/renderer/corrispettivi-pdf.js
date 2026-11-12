'use strict';
/* ==========================================================================
   Lettore dei PDF del «Registro Corrispettivi»

   Due modelli:
   - mensile       «CORRISPETTIVI NOVEMBRE 2026»: tabella giorno per giorno,
                   riga «TOT. MESE», riquadro «Calcolo IVA – Novembre 2026»
   - riepilogativo «RIEPILOGO CORRISPETTIVI ANNO 2026», «Aggiornato fino a
                   NOVEMBRE 2026»: una riga per mese, «TOTALE ANNUO»,
                   riquadro «Calcolo IVA – Anno 2026»

   Il testo si ricostruisce dalle istruzioni di disegno della pagina, glifo
   per glifo con la sua posizione: le cifre delle tabelle usano le cifre
   «tabulari» di Segoe UI, che il PDF scrive senza dire che carattere sono
   (pdf.js le estrarrebbe come spazi). Si riconoscono dal numero del glifo.

   Ogni lettura si verifica da sola: le colonne di un mese devono dare il
   totale del mese, i mesi il totale dell'anno, e le aliquote devono
   coincidere con il riquadro «Calcolo IVA». Se qualcosa non torna, il PDF
   viene rifiutato invece di registrare cifre sbagliate.

   pdf.js gira qui dentro (renderer/lib): il file non va da nessuna parte.
   ========================================================================== */
(function () {
  const MESI = ['GENNAIO', 'FEBBRAIO', 'MARZO', 'APRILE', 'MAGGIO', 'GIUGNO', 'LUGLIO', 'AGOSTO', 'SETTEMBRE', 'OTTOBRE', 'NOVEMBRE', 'DICEMBRE'];
  const meseDa = (s) => MESI.indexOf(String(s || '').toUpperCase()) + 1;   // 0 se non è un mese
  const numero = (s) => {
    const v = parseFloat(String(s).replace(/[€\s]/g, '').replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(v) ? v : NaN;
  };
  const tondo = (n) => Math.round(n * 100) / 100;
  const IMPORTO = /^-?\d{1,3}(\.\d{3})*,\d{2}$/;

  /* Segoe UI: cifre tabulari 0–9 = glifi 2457–2466 */
  const CIFRE_TABULARI = 2457;
  const carattere = (g) => {
    if (g.unicode && g.unicode !== '\0') return g.unicode;
    const c = g.originalCharCode - CIFRE_TABULARI;
    return c >= 0 && c <= 9 ? String(c) : '';
  };

  let pdfjs = null;
  const BASE = document.currentScript?.src || document.baseURI;   // pdf.js sta in lib/, accanto a questo file

  const per = (m, n) => [m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3], m[2] * n[0] + m[3] * n[2], m[2] * n[1] + m[3] * n[3], m[4] * n[0] + m[5] * n[2] + n[4], m[4] * n[1] + m[5] * n[3] + n[5]];
  const sposta = (x, y = 0) => [1, 0, 0, 1, x, y];

  /* I glifi di una pagina con posizione, seguendo matrici e testo come fa il disegno */
  function glifiDellaPagina(ops) {
    const O = pdfjs.OPS;
    const glifi = [];
    let ctm = [1, 0, 0, 1, 0, 0]; const pila = [];
    let tm = [1, 0, 0, 1, 0, 0], tlm = tm, corpo = 1, spazioCar = 0, spazioParole = 0, scalaH = 1, interlinea = 0;
    for (let i = 0; i < ops.fnArray.length; i++) {
      const f = ops.fnArray[i], a = ops.argsArray[i];
      switch (f) {
        case O.save: pila.push(ctm); break;
        case O.restore: ctm = pila.pop() || ctm; break;
        case O.transform: ctm = per(a, ctm); break;
        case O.beginText: tm = tlm = [1, 0, 0, 1, 0, 0]; break;
        case O.setTextMatrix: tm = tlm = [...a]; break;
        case O.moveText: tlm = per(sposta(a[0], a[1]), tlm); tm = tlm; break;
        case O.setLeadingMoveText: interlinea = -a[1]; tlm = per(sposta(a[0], a[1]), tlm); tm = tlm; break;
        case O.setLeading: interlinea = a[0]; break;
        case O.nextLine: tlm = per(sposta(0, -interlinea), tlm); tm = tlm; break;
        case O.setFont: corpo = a[1]; break;
        case O.setCharSpacing: spazioCar = a[0]; break;
        case O.setWordSpacing: spazioParole = a[0]; break;
        case O.setHScale: scalaH = a[0] / 100; break;
        case O.showText:
          for (const g of a[0]) {
            if (typeof g === 'number') { tm = per(sposta(-g / 1000 * corpo * scalaH), tm); continue; }
            if (!g) continue;
            const p = per(tm, ctm);
            const avanza = (g.width / 1000 * corpo + spazioCar + (g.unicode === ' ' ? spazioParole : 0)) * scalaH;
            const fine = per(sposta(avanza), p);
            glifi.push({ x: p[4], y: p[5], x2: fine[4], h: Math.hypot(p[2], p[3]) || corpo, s: carattere(g) });
            tm = per(sposta(avanza), tm);
          }
          break;
        default: break;
      }
    }
    return glifi;
  }

  /* Glifi → righe → pezzi di testo contigui (con la loro x di inizio e fine) */
  function righeDaGlifi(glifi) {
    const righe = [];
    for (const g of glifi) {
      let r = righe.find((q) => Math.abs(q.y - g.y) <= 1.5);
      if (!r) { r = { y: g.y, glifi: [] }; righe.push(r); }
      r.glifi.push(g);
    }
    righe.sort((a, b) => b.y - a.y);                       // dall'alto in basso
    return righe.map((r) => {
      r.glifi.sort((a, b) => a.x - b.x);
      const pezzi = []; let cur = null;
      for (const g of r.glifi) {
        if (cur && g.x - cur.x2 < g.h * 0.35) { cur.s += g.s; cur.x2 = g.x2; }
        else { cur = { x: g.x, x2: g.x2, s: g.s }; pezzi.push(cur); }
      }
      const puliti = pezzi.map((p) => ({ ...p, s: p.s.trim() })).filter((p) => p.s);
      return { y: r.y, pezzi: puliti, testo: puliti.map((p) => p.s).join(' ').replace(/\s+/g, ' ') };
    }).filter((r) => r.pezzi.length);
  }

  async function righeDelPdf(bytes) {
    if (!pdfjs) {
      pdfjs = await import(new URL('lib/pdf.min.mjs', BASE).href);
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('lib/pdf.worker.min.mjs', BASE).href;
    }
    const doc = await pdfjs.getDocument({ data: bytes, isEvalSupported: false, disableFontFace: true }).promise;
    const righe = [];
    try {
      for (let p = 1; p <= Math.min(doc.numPages, 10); p++) {
        const pagina = await doc.getPage(p);
        righe.push(...righeDaGlifi(glifiDellaPagina(await pagina.getOperatorList())));
      }
    } finally {
      doc.destroy();
    }
    return righe;
  }

  /* ------------------------------------------------------------ tabelle
     Colonne del registro: si trovano dalle intestazioni (4%, 10%, 22%, POS,
     BONIFICO, ASSEGNI, IMPORTO esenti, IMPORTO altri). Gli importi sono
     allineati a destra nella cella: si assegnano alla colonna la cui
     intestazione è centrata più vicino al centro della cella. */
  const COLONNE = ['totale', 'iva4', 'iva10', 'iva22', 'pos', 'bonifico', 'assegni', 'esenti', 'altri'];

  function colonneDa(righe) {
    const iTesta = righe.findIndex((r) => ['4%', '10%', '22%', 'POS', 'BONIFICO', 'ASSEGNI'].every((t) => r.pezzi.some((p) => p.s === t)));
    if (iTesta < 0) return null;
    const testa = righe[iTesta].pezzi;
    const centro = (p) => (p.x + p.x2) / 2;
    const trova = (t) => testa.find((p) => p.s === t);
    const importi = testa.filter((p) => p.s === 'IMPORTO');
    const quattro = trova('4%');
    // la colonna del totale sta a sinistra del 4%: la sua intestazione è «CORRISPETTIVI» su una riga vicina
    const totaleTesta = righe.slice(Math.max(0, iTesta - 6), iTesta + 6).flatMap((r) => r.pezzi)
      .find((p) => p.s === 'CORRISPETTIVI' && p.x2 < quattro.x);
    const c = {
      iva4: centro(quattro), iva10: centro(trova('10%')), iva22: centro(trova('22%')),
      pos: centro(trova('POS')), bonifico: centro(trova('BONIFICO')), assegni: centro(trova('ASSEGNI')),
    };
    const passo = (c.assegni - c.iva4) / 5;               // larghezza di una cella
    c.totale = totaleTesta ? centro(totaleTesta) : c.iva4 - passo * 1.05;
    if (importi.length) c.esenti = centro(importi[0]);
    if (importi.length > 1) c.altri = centro(importi[importi.length - 1]);
    return { centri: c, mezza: passo / 2 };
  }

  function valoriRiga(riga, col) {
    const v = Object.fromEntries(COLONNE.map((k) => [k, 0]));
    for (const p of riga.pezzi) {
      if (!IMPORTO.test(p.s)) continue;
      const cella = p.x2 - col.mezza;                      // centro della cella, dato che il numero è a destra
      let meglio = null, dist = Infinity;
      for (const [k, x] of Object.entries(col.centri)) { const d = Math.abs(x - cella); if (d < dist) { dist = d; meglio = k; } }
      if (dist > col.mezza) throw new Error(`importo ${p.s} fuori dalle colonne del registro`);
      v[meglio] = tondo(v[meglio] + numero(p.s));
    }
    return v;
  }

  // il totale di una riga è la somma di tutte le colonne di importo, come nel registro
  const sommaColonne = (v) => tondo(COLONNE.slice(1).reduce((s, k) => s + v[k], 0));

  /* ------------------------------------------------------------ Calcolo IVA */
  function calcoloIva(righe) {
    const iCap = righe.findIndex((r) => /^Calcolo IVA\s*[–—-]/i.test(r.testo));
    if (iCap < 0) throw new Error('non sembra un PDF del Registro Corrispettivi: manca il riquadro «Calcolo IVA»');
    const cap = /^Calcolo IVA\s*[–—-]\s*(?:Anno\s+(\d{4})|([A-Za-zÀ-ú]+)\s+(\d{4}))/i.exec(righe[iCap].testo);
    if (!cap) throw new Error('riquadro «Calcolo IVA» senza periodo');
    const aliquote = [];
    let totale = null;
    // il riquadro sta sotto il titolo; si guardano le righe vicine in tutte e due le direzioni
    for (const r of [...righe.slice(iCap + 1, iCap + 10), ...righe.slice(Math.max(0, iCap - 9), iCap).reverse()]) {
      const m = /^(\d{1,2})\s*%\s+(-?[\d.]+,\d{2})\s+(-?[\d.]+,\d{2})\s+(-?[\d.]+,\d{2})(?:\s|$)/.exec(r.testo);
      const t = /^Totale\s+(-?[\d.]+,\d{2})\s+(-?[\d.]+,\d{2})\s+(-?[\d.]+,\d{2})(?:\s|$)/i.exec(r.testo);
      if (m && !aliquote.some((a) => a.aliquota === +m[1])) aliquote.push({ aliquota: +m[1], lordo: numero(m[2]), imponibile: numero(m[3]), iva: numero(m[4]) });
      else if (t && !totale) totale = { lordo: numero(t[1]), imponibile: numero(t[2]), iva: numero(t[3]) };
    }
    if (!aliquote.length) throw new Error('nel riquadro «Calcolo IVA» non ci sono importi leggibili');
    aliquote.sort((a, b) => a.aliquota - b.aliquota);
    for (const a of aliquote) {
      if ([a.lordo, a.imponibile, a.iva].some(Number.isNaN)) throw new Error('importo non leggibile nel «Calcolo IVA»');
      if (Math.abs(a.imponibile + a.iva - a.lordo) > 0.02) throw new Error(`al ${a.aliquota}% imponibile e IVA non danno il lordo`);
    }
    const somma = aliquote.reduce((s, a) => ({ lordo: s.lordo + a.lordo, imponibile: s.imponibile + a.imponibile, iva: s.iva + a.iva }), { lordo: 0, imponibile: 0, iva: 0 });
    if (totale && Math.abs(totale.lordo - somma.lordo) > 0.05) throw new Error('il totale del «Calcolo IVA» non corrisponde alle aliquote');
    return {
      annuale: !!cap[1], anno: +(cap[1] || cap[3]), mese: cap[1] ? 0 : meseDa(cap[2]), nomeMese: cap[2] || '',
      aliquote: aliquote.map((a) => ({ ...a, lordo: tondo(a.lordo), imponibile: tondo(a.imponibile), iva: tondo(a.iva) })),
      totale: totale || { lordo: tondo(somma.lordo), imponibile: tondo(somma.imponibile), iva: tondo(somma.iva) },
    };
  }

  /* Dalle colonne del registro all'IVA, come fa il Registro: scorporo dal
     lordo, POS/bonifico/assegni contati all'aliquota scelta nel Registro */
  function ivaDelMese(v, pagamentiAl) {
    const lordi = { 4: v.iva4, 10: v.iva10, 22: v.iva22 };
    if (pagamentiAl) lordi[pagamentiAl] = tondo(lordi[pagamentiAl] + v.pos + v.bonifico + v.assegni);
    return [4, 10, 22].map((aliquota) => {
      const lordo = lordi[aliquota];
      const iva = tondo(lordo * aliquota / (100 + aliquota));
      return { aliquota, lordo, imponibile: tondo(lordo - iva), iva };
    });
  }

  /* L'aliquota a cui il Registro conta POS, bonifici e assegni si ricava dal
     «Calcolo IVA»: è quella per cui i conti tornano (0 = non conteggiati). */
  function aliquotaPagamenti(somma, calc) {
    const lordoCalc = (al) => calc.aliquote.find((a) => a.aliquota === al)?.lordo || 0;
    const pagamenti = somma.pos + somma.bonifico + somma.assegni;
    for (const al of [22, 10, 4, 0]) {
      const ok = [4, 10, 22].every((r) => Math.abs(lordoCalc(r) - (somma['iva' + r] + (r === al ? pagamenti : 0))) < 0.05);
      if (ok) return al;
    }
    throw new Error('le colonne della tabella non corrispondono al riquadro «Calcolo IVA»');
  }

  /* ------------------------------------------------------------ documento */
  function interpreta(righe, nomeFile) {
    const calc = calcoloIva(righe);
    const tutto = righe.map((r) => r.testo).join('\n');
    const riepilogo = calc.annuale || /RIEPILOGO\s+CORRISPETTIVI\s+ANNO\s+(\d{4})/i.test(tutto);
    if (!calc.annuale && !calc.mese) throw new Error(`mese non riconosciuto: ${calc.nomeMese}`);
    const agg = /Aggiornato fino a\s+([A-Za-zÀ-ú]+)\s+(\d{4})/i.exec(tutto);
    const doc = {
      file: nomeFile, tipo: riepilogo ? 'riepilogo' : 'mensile', anno: calc.anno, mese: calc.mese,
      aggiornatoFino: agg && +agg[2] === calc.anno ? meseDa(agg[1]) : 0,
      aliquote: calc.aliquote, totale: calc.totale, mesi: [], esenti: 0, altri: 0, pagamentiAl: null,
    };

    const col = colonneDa(righe);
    if (!col) {
      if (riepilogo) throw new Error('nel riepilogativo non trovo la tabella dei mesi');
      return doc;                                          // mensile: basta il «Calcolo IVA»
    }

    if (riepilogo) {
      const somma = Object.fromEntries(COLONNE.map((k) => [k, 0]));
      let annuo = null;
      for (const r of righe) {
        const primo = r.pezzi[0].s.toUpperCase();
        const m = meseDa(primo);
        if (m) {
          const v = valoriRiga(r, col);
          if (Math.abs(sommaColonne(v) - v.totale) > 0.02) throw new Error(`${MESI[m - 1].toLowerCase()}: le colonne non danno il totale del mese`);
          if (v.totale) doc.mesi.push({ mese: m, valori: v });
          for (const k of COLONNE) somma[k] = tondo(somma[k] + v[k]);
        } else if (IMPORTO.test(r.pezzi[0].s) && !annuo && r.pezzi.length > 1) {
          annuo = valoriRiga(r, col);                       // la riga del TOTALE ANNUO ha l'etichetta su due righe
        }
      }
      if (annuo && COLONNE.some((k) => Math.abs(annuo[k] - somma[k]) > 0.02)) throw new Error('la somma dei mesi non dà il totale annuo');
      doc.pagamentiAl = aliquotaPagamenti(somma, calc);
      for (const m of doc.mesi) {
        m.aliquote = ivaDelMese(m.valori, doc.pagamentiAl);
        m.esenti = m.valori.esenti; m.altri = m.valori.altri;
      }
      doc.esenti = somma.esenti; doc.altri = somma.altri;
      doc.mesi.sort((a, b) => a.mese - b.mese);
      return doc;
    }

    // mensile: dalla riga «TOT. MESE» si prendono le operazioni esenti e gli altri importi
    const tot = righe.find((r) => /^TOT\.?\s*MESE/i.test(r.testo));
    if (tot) {
      const v = valoriRiga(tot, col);
      if (Math.abs(sommaColonne(v) - v.totale) > 0.02) throw new Error('le colonne del mese non danno il totale');
      doc.pagamentiAl = aliquotaPagamenti(v, calc);
      doc.esenti = v.esenti; doc.altri = v.altri;
    }
    return doc;
  }

  async function leggiFile(listaFile) {
    const documenti = [], errori = [];
    for (const f of listaFile) {
      try {
        const bytes = new Uint8Array(await f.arrayBuffer());
        if (String.fromCharCode(...bytes.subarray(0, 5)) !== '%PDF-') throw new Error('non è un PDF');
        // pdf.js si tiene il buffer che riceve: gli si passa una copia, i byte servono ancora per l'allegato
        documenti.push({ ...interpreta(await righeDelPdf(bytes.slice()), f.name), bytes });
      } catch (e) {
        errori.push({ file: f.name, errore: e.message || String(e) });
      }
    }
    return { documenti, errori };
  }

  window.CorrispettiviPDF = { leggiFile, MESI, _interni: { interpreta, righeDelPdf } };
})();
