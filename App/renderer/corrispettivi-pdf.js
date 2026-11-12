'use strict';
/* ==========================================================================
   Lettore dei PDF del «Registro Corrispettivi»

   Due modelli:
   - mensile       «CORRISPETTIVI NOVEMBRE 2026» con il riquadro
                   «Calcolo IVA – Novembre 2026»
   - riepilogativo «RIEPILOGO CORRISPETTIVI ANNO 2026», «Aggiornato fino a
                   NOVEMBRE 2026», riquadro «Calcolo IVA – Anno 2026»

   Del PDF si usa il riquadro «Calcolo IVA» (lordo, imponibile e IVA per
   aliquota), che è scritto come testo. Le cifre delle tabelle giorno per
   giorno sono disegnate come grafica e non si possono leggere.

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

  let pdfjs = null;
  const BASE = document.currentScript?.src || document.baseURI;   // pdf.js sta in lib/, accanto a questo file

  /* Il testo di ogni pagina, ricomposto riga per riga (stessa altezza = stessa riga) */
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
        const { items } = await pagina.getTextContent();
        const perY = [];
        for (const it of items) {
          if (!it.str || !it.str.trim()) continue;
          const y = it.transform[5], x = it.transform[4];
          let r = perY.find((q) => Math.abs(q.y - y) <= 2);
          if (!r) { r = { y, pezzi: [] }; perY.push(r); }
          r.pezzi.push({ x, s: it.str });
        }
        perY.sort((a, b) => b.y - a.y);
        for (const r of perY) righe.push(r.pezzi.sort((a, b) => a.x - b.x).map((q) => q.s.trim()).join(' ').replace(/\s+/g, ' '));
      }
    } finally {
      doc.destroy();
    }
    return righe;
  }

  /* Dalle righe al documento: tipo, periodo e tabella «Calcolo IVA» */
  function interpreta(righe, nomeFile) {
    const tutto = righe.join('\n');
    let anno = 0, mese = 0, tipo = '';
    const riep = /RIEPILOGO\s+CORRISPETTIVI\s+ANNO\s+(\d{4})/i.exec(tutto);
    const iCap = righe.findIndex((r) => /^Calcolo IVA\s*[–—-]/i.test(r));
    if (iCap < 0) throw new Error('non sembra un PDF del Registro Corrispettivi: manca il riquadro «Calcolo IVA»');
    const cap = /^Calcolo IVA\s*[–—-]\s*(?:Anno\s+(\d{4})|([A-Za-zÀ-ú]+)\s+(\d{4}))/i.exec(righe[iCap]);
    if (!cap) throw new Error('riquadro «Calcolo IVA» senza periodo');
    if (cap[1]) { tipo = 'riepilogo'; anno = +cap[1]; }
    else { tipo = 'mensile'; mese = meseDa(cap[2]); anno = +cap[3]; if (!mese) throw new Error(`mese non riconosciuto: ${cap[2]}`); }
    if (riep && tipo !== 'riepilogo') tipo = 'riepilogo';

    const aliquote = [];
    let totale = null;
    for (const r of righe.slice(iCap + 1, iCap + 12)) {
      const m = /^(\d{1,2})\s*%\s+(-?[\d.]+,\d{2})\s+(-?[\d.]+,\d{2})\s+(-?[\d.]+,\d{2})$/.exec(r);
      const t = /^Totale\s+(-?[\d.]+,\d{2})\s+(-?[\d.]+,\d{2})\s+(-?[\d.]+,\d{2})$/i.exec(r);
      if (m) aliquote.push({ aliquota: +m[1], lordo: numero(m[2]), imponibile: numero(m[3]), iva: numero(m[4]) });
      else if (t) { totale = { lordo: numero(t[1]), imponibile: numero(t[2]), iva: numero(t[3]) }; break; }
    }
    if (!aliquote.length) throw new Error('nel riquadro «Calcolo IVA» non ci sono importi leggibili');
    for (const a of aliquote) {
      if ([a.lordo, a.imponibile, a.iva].some(Number.isNaN)) throw new Error('importo non leggibile nel «Calcolo IVA»');
      if (Math.abs(a.imponibile + a.iva - a.lordo) > 0.02) throw new Error(`al ${a.aliquota}% imponibile e IVA non danno il lordo`);
    }
    const somma = aliquote.reduce((s, a) => ({ lordo: s.lordo + a.lordo, imponibile: s.imponibile + a.imponibile, iva: s.iva + a.iva }), { lordo: 0, imponibile: 0, iva: 0 });
    if (totale && Math.abs(totale.lordo - somma.lordo) > 0.05) throw new Error('il totale del «Calcolo IVA» non corrisponde alle aliquote');

    const agg = /Aggiornato fino a\s+([A-Za-zÀ-ú]+)\s+(\d{4})/i.exec(tutto);
    return {
      file: nomeFile, tipo, anno, mese,
      aggiornatoFino: agg && +agg[2] === anno ? meseDa(agg[1]) : 0,
      aliquote: aliquote.map((a) => ({ ...a, lordo: tondo(a.lordo), imponibile: tondo(a.imponibile), iva: tondo(a.iva) })),
      totale: totale || { lordo: tondo(somma.lordo), imponibile: tondo(somma.imponibile), iva: tondo(somma.iva) },
    };
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
