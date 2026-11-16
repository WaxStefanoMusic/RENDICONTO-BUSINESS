'use strict';
/* ==========================================================================
   Lettore degli estratti conto bancari (conto corrente della società)

   Legge tre tipi di PDF:
   - l'estratto conto mensile con le colonne «Dare / Avere» (Banca Popolare
     di Sondrio) o «Uscite / Entrate» (BPER), con saldo iniziale e finale;
   - la «lista movimenti» scaricata dall'home banking (BPER, «Dettaglio
     Saldo Conto Corrente»), con il saldo contabile e il saldo disponibile
     alla data dell'ultimo aggiornamento.
   Da ognuno escono i movimenti (data, valuta, descrizione, importo in
   centesimi con il segno: + entra, − esce) e i saldi letti, che servono
   a controllare al centesimo che non manchi nessun movimento.
   Tutto avviene qui: i file non vanno da nessuna parte.
   ========================================================================== */
(function () {
  let pdfjs = null;
  const BASE = (typeof document !== 'undefined' && (document.currentScript?.src || document.baseURI)) || '';
  const IMPORTO = /^[+-]?\s?\d{1,3}(?:\.\d{3})*,\d{2}$|^[+-]?\s?\d+,\d{2}$/;
  const pulisci = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
  // importo in centesimi interi: niente virgola mobile
  const centesimi = (s) => {
    const t = String(s).replace(/\s|EUR|€|¤/g, '');
    const m = /^([+-]?)(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})$/.exec(t);
    if (!m) return null;
    const v = parseInt(m[2].replace(/\./g, ''), 10) * 100 + parseInt(m[3], 10);
    return m[1] === '-' ? -v : v;
  };
  const isoDa = (s) => {
    const m = /^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/.exec(String(s).trim());
    if (!m) return '';
    const a = m[3].length === 2 ? '20' + m[3] : m[3];
    return `${a}-${m[2]}-${m[1]}`;
  };
  const dataIn = (s) => { const m = /(\d{2}\/\d{2}\/\d{4})/.exec(s || ''); return m ? isoDa(m[1]) : ''; };
  const ABI = { '05696': 'Banca Popolare di Sondrio', '05387': 'BPER Banca' };

  async function righeDelPdf(bytes) {
    if (!pdfjs) {
      pdfjs = await import(new URL('lib/pdf.min.mjs', BASE).href);
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('lib/pdf.worker.min.mjs', BASE).href;
    }
    const doc = await pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false, disableFontFace: true }).promise;
    try {
      const pagine = [];
      for (let p = 1; p <= Math.min(doc.numPages, 80); p++) pagine.push((await (await doc.getPage(p)).getTextContent()).items);
      return righeDaElementi(pagine);
    } finally {
      doc.destroy();
    }
  }

  /* Raggruppa i pezzi di testo di ogni pagina in righe (stessa altezza), da sinistra a destra */
  function righeDaElementi(pagine) {
    const righe = [];
    pagine.forEach((items, i) => {
      const sue = [];
      for (const it of items) {
        const s = pulisci(it.str);
        if (!s) continue;
        const x = it.transform[4], y = it.transform[5];
        let r = sue.find((q) => Math.abs(q.y - y) <= 2);
        if (!r) { r = { pagina: i + 1, y, pezzi: [] }; sue.push(r); }
        r.pezzi.push({ x, s });
      }
      sue.sort((a, b) => b.y - a.y);
      for (const r of sue) {
        r.pezzi.sort((a, b) => a.x - b.x);
        r.celle = r.pezzi.map((q) => q.s);
        r.testo = r.celle.join(' | ');
        righe.push(r);
      }
    });
    return righe;
  }

  const ibanDa = (testo) => {
    const m = /IT\d{2}[A-Z]\d{10}[A-Z0-9]{12}/.exec(String(testo).replace(/\s|\|/g, ''));
    return m ? m[0] : '';
  };
  const ibanBello = (i) => i.replace(/(.{4})/g, '$1 ').trim();

  /* ---------- Lista movimenti dell'home banking (BPER «Dettaglio Saldo Conto Corrente») ---------- */
  function leggiLista(righe) {
    const d = { tipo: 'lista', movimenti: [], saldi: [], avvisi: [] };
    const tutto = righe.map((r) => r.testo).join('\n');
    d.iban = ibanDa(tutto);
    const iC = righe.findIndex((r) => /saldo contabile/i.test(r.testo));
    const cont = iC >= 0 ? righe[iC].celle.map(centesimi).find((v) => v != null) : null;
    const iD = righe.findIndex((r) => /saldo disponibile/i.test(r.testo));
    let disp = null;
    if (iD >= 0) for (let k = iD; k < Math.min(righe.length, iD + 3) && disp == null; k++) disp = righe[k].celle.map(centesimi).find((v) => v != null) ?? null;
    const rAgg = righe.find((r) => /ultimo aggiornamento/i.test(r.testo));
    d.al = rAgg ? dataIn(rAgg.testo) : '';
    const rNum = righe.find((r) => /numero movimenti/i.test(r.testo));
    d.numeroDichiarato = rNum ? +(/numero movimenti\D*(\d+)/i.exec(rNum.testo.replace(/\|/g, ' '))?.[1] || 0) || null : null;
    if (cont != null && d.al) d.saldi.push({ data: d.al, saldo: cont, cosa: 'Saldo contabile' });
    d.disponibile = disp;
    if (/BPER/i.test(tutto)) d.banca = 'BPER Banca';

    let ultimo = null, yPrima = 0, pagina = 0;
    for (const r of righe) {
      if (r.pagina !== pagina) { pagina = r.pagina; ultimo = null; }
      const p = r.pezzi;
      const d1 = p[0] && isoDa(p[0].s), d2 = p[1] && isoDa(p[1].s);
      if (d1 && d2) {
        const imp = p.map((q) => /EUR$/.test(q.s) && /^[+-]/.test(q.s) ? centesimi(q.s) : null).find((v) => v != null);
        const descr = p.slice(2).filter((q) => !/EUR$/.test(q.s) || !/^[+-]/.test(q.s)).filter((q) => q.s !== 'Eseguito').map((q) => q.s).join(' ');
        if (imp == null) { d.avvisi.push('Movimento del ' + p[0].s + ' senza importo: «' + descr.slice(0, 60) + '»'); ultimo = null; continue; }
        ultimo = { data: d1, valuta: d2, descrizione: descr, importo: imp };
        d.movimenti.push(ultimo); yPrima = r.y;
      } else if (ultimo && p[0] && p[0].x > 100 && yPrima - r.y <= 13) {
        const agg = p.filter((q) => q.s !== 'Eseguito').map((q) => q.s).join(' ');
        if (agg) ultimo.descrizione += (/[a-z0-9]$/i.test(ultimo.descrizione) && /^[a-z]/.test(agg) ? '' : ' ') + agg;
        yPrima = r.y;
      } else if (!(p.length === 1 && p[0].s === 'Eseguito')) ultimo = null;
    }
    // la lista va dal più recente al più vecchio: si gira
    d.movimenti.reverse();
    d.dal = d.movimenti[0]?.data || '';
    if (d.numeroDichiarato != null && d.numeroDichiarato !== d.movimenti.length) d.avvisi.push(`La banca dichiara ${d.numeroDichiarato} movimenti, ne ho letti ${d.movimenti.length}.`);
    return d;
  }

  /* ---------- Estratto conto mensile (colonne Dare/Avere o Uscite/Entrate) ---------- */
  function leggiEstratto(righe) {
    const d = { tipo: 'estratto', movimenti: [], saldi: [], avvisi: [] };
    const tutto = righe.map((r) => r.testo).join('\n');
    d.iban = ibanDa(tutto);
    let colonne = null; // { soglia, descrX }
    let ultimo = null, yPrima = 0, pagina = 0;
    const totaliLetti = {};
    for (const r of righe) {
      if (r.pagina !== pagina) { pagina = r.pagina; ultimo = null; }
      const p = r.pezzi;
      const hD = p.find((q) => /^(movimenti dare|uscite)$/i.test(q.s)), hA = p.find((q) => /^(movimenti avere|entrate)$/i.test(q.s));
      const hDes = p.find((q) => /^descrizione/i.test(q.s));
      if (hD && hA && hDes) { colonne = { soglia: (hD.x + hA.x) / 2, descrX: hDes.x }; ultimo = null; continue; }
      if (!colonne) continue;
      const imp = p.filter((q) => q.x < colonne.descrX - 20 && IMPORTO.test(q.s));
      const segnoDi = (q) => (q.x < colonne.soglia ? -1 : 1) * centesimi(q.s);
      const testoDescr = p.filter((q) => q.x >= colonne.descrX - 30).map((q) => q.s).join(' ');
      const d1 = p[0] && isoDa(p[0].s);
      if (/^saldo (iniziale|finale)$/i.test(testoDescr) && d1 && imp.length === 1) {
        d.saldi.push({ data: d1, saldo: segnoDi(imp[0]), cosa: /iniziale/i.test(testoDescr) ? 'Saldo iniziale' : 'Saldo finale' });
        ultimo = null; continue;
      }
      if (/^totale movimenti$/i.test(testoDescr)) {
        for (const q of imp) totaliLetti[q.x < colonne.soglia ? 'uscite' : 'entrate'] = centesimi(q.s);
        ultimo = null; continue;
      }
      const d2 = p[1] && isoDa(p[1].s);
      if (d1 && d2 && imp.length === 1) {
        ultimo = { data: d1, valuta: d2, descrizione: testoDescr, importo: segnoDi(imp[0]) };
        d.movimenti.push(ultimo); yPrima = r.y;
      } else if (ultimo && p[0] && p[0].x >= colonne.descrX - 30 && yPrima - r.y <= 13 && !imp.length) {
        ultimo.descrizione += ' ' + p.map((q) => q.s).join(' ');
        yPrima = r.y;
      } else ultimo = null;
    }
    if (!colonne) throw new Error('non trovo le colonne dei movimenti (Dare/Avere o Uscite/Entrate)');
    // riepilogo BPER: «Totale Entrate / Totale Uscite / Saldo iniziale al … / Saldo finale al …»
    for (const r of righe) {
      const t = r.celle.join(' ');
      let m;
      if ((m = /^totale (entrate|uscite)\s+([\d.]+,\d{2})/i.exec(t))) totaliLetti[m[1].toLowerCase()] = centesimi(m[2]);
      else if ((m = /^saldo (iniziale|finale) al (\d{2}\/\d{2}\/\d{4})\s+(-?)\s?([\d.]+,\d{2})/i.exec(t))) {
        const data = isoDa(m[2]), saldo = centesimi(m[3] + m[4]);
        const cosa = m[1].toLowerCase() === 'iniziale' ? 'Saldo iniziale' : 'Saldo finale';
        const gia = d.saldi.find((s) => s.data === data && s.cosa === cosa);
        if (!gia) d.saldi.push({ data, saldo, cosa });
        else if (gia.saldo !== saldo) d.avvisi.push(`${cosa} del ${m[2]} letto in due modi diversi: ${gia.saldo / 100} e ${saldo / 100}.`);
      }
    }
    d.totaliLetti = totaliLetti;
    const ini = d.saldi.find((s) => s.cosa === 'Saldo iniziale'), fin = d.saldi.find((s) => s.cosa === 'Saldo finale');
    d.dal = ini ? ini.data : d.movimenti[0]?.data || '';
    d.al = fin ? fin.data : d.movimenti[d.movimenti.length - 1]?.data || '';
    // verifiche interne: somme delle colonne e saldo iniziale + movimenti = saldo finale
    d.verifiche = [];
    const usc = d.movimenti.filter((m) => m.importo < 0).reduce((t, m) => t - m.importo, 0);
    const ent = d.movimenti.filter((m) => m.importo > 0).reduce((t, m) => t + m.importo, 0);
    if (totaliLetti.uscite != null) d.verifiche.push({ cosa: 'Somma delle uscite = totale della banca', atteso: totaliLetti.uscite, letto: usc, ok: usc === totaliLetti.uscite });
    if (totaliLetti.entrate != null) d.verifiche.push({ cosa: 'Somma delle entrate = totale della banca', atteso: totaliLetti.entrate, letto: ent, ok: ent === totaliLetti.entrate });
    if (ini && fin) { const s = ini.saldo + ent - usc; d.verifiche.push({ cosa: 'Saldo iniziale + entrate − uscite = saldo finale', atteso: fin.saldo, letto: s, ok: s === fin.saldo }); }
    return d;
  }

  function interpreta(righe, nomeFile) {
    const tutto = righe.map((r) => r.testo).join('\n');
    let d;
    if (/dettaglio saldo conto corrente/i.test(tutto) && /movimenti contabilizzati/i.test(tutto)) d = leggiLista(righe);
    else if (/estratto (conto|al)/i.test(tutto)) d = leggiEstratto(righe);
    else throw new Error('non sembra un estratto conto o una lista movimenti del conto corrente');
    if (!d.movimenti.length && !d.saldi.length) throw new Error('non trovo né movimenti né saldi');
    d.file = nomeFile;
    if (!d.banca) d.banca = ABI[d.iban.slice(5, 10)] || (/POPOLARE DI SONDRIO/i.test(tutto) ? 'Banca Popolare di Sondrio' : /BPER/i.test(tutto) ? 'BPER Banca' : '');
    d.ibanBello = d.iban ? ibanBello(d.iban) : '';
    return d;
  }

  async function leggiBytes(nome, bytes, profondita = 0) {
    const documenti = [], errori = [];
    try {
      if (String.fromCharCode(...bytes.subarray(0, 5)) === '%PDF-') {
        const righe = await righeDelPdf(bytes);
        if (!righe.length) throw new Error('il PDF non contiene testo (è una scansione?)');
        documenti.push({ ...interpreta(righe, nome), bytes: bytes.slice() });
      } else if (bytes[0] === 0x50 && bytes[1] === 0x4b && profondita <= 2) {
        for (const f of await window.FatturaPA._interni.leggiZip(bytes)) {
          if (!/\.(pdf|zip)$/i.test(f.nome)) continue;
          const r = await leggiBytes(f.nome, f.dati, profondita + 1);
          documenti.push(...r.documenti); errori.push(...r.errori);
        }
      } else if (profondita === 0) throw new Error('serve il PDF dell\'estratto conto o della lista movimenti');
    } catch (e) {
      errori.push({ file: nome, errore: e.message || String(e) });
    }
    return { documenti, errori };
  }

  async function leggiFile(lista) {
    const documenti = [], errori = [];
    for (const f of lista) {
      const r = await leggiBytes(f.name, new Uint8Array(await f.arrayBuffer()));
      documenti.push(...r.documenti); errori.push(...r.errori);
    }
    return { documenti, errori };
  }

  /* ---------- Unione dei documenti: niente doppioni ----------
     stato = { documenti: [...], movimenti: [{ id, data, valuta, descrizione, importo, fonti: [k] }] }
     Un movimento che c'è già (stesso importo al centesimo, stessa data, oppure
     data entro 3 giorni se le due banche la scrivono diversa) non si aggiunge:
     si segna solo che compare anche in questo documento. Nello stesso
     documento due movimenti uguali restano due. Ricaricare lo stesso file
     sostituisce quello di prima. */
  const giorni = (a, b) => Math.round((Date.parse(a) - Date.parse(b)) / 86400000);
  const chiaveDoc = (d) => [d.tipo, d.iban, d.dal, d.al, d.movimenti.length, d.movimenti.reduce((t, m) => t + m.importo, 0)].join('|');

  function togliDocumento(stato, k) {
    stato.documenti = stato.documenti.filter((x) => x.k !== k);
    for (const m of stato.movimenti) m.fonti = m.fonti.filter((f) => f !== k);
    stato.movimenti = stato.movimenti.filter((m) => m.fonti.length);
  }

  function unisci(stato, doc, nuovoId) {
    const k = chiaveDoc(doc);
    togliDocumento(stato, k);
    const usati = new Set(), abbinati = new Map();
    const liberi = (m) => stato.movimenti.filter((e) => !usati.has(e) && e.importo === m.importo && !e.fonti.includes(k));
    // prima passata: stessa data; seconda: data vicina (entro 3 giorni), dentro il periodo del documento
    doc.movimenti.forEach((m, i) => {
      const e = liberi(m).find((x) => x.data === m.data);
      if (e) { usati.add(e); abbinati.set(i, e); }
    });
    doc.movimenti.forEach((m, i) => {
      if (abbinati.has(i)) return;
      const c = liberi(m).map((x) => ({ x, g: Math.min(...[x.data, x.valuta].flatMap((a) => [m.data, m.valuta].map((b) => Math.abs(giorni(a, b))))) }))
        .filter((o) => o.g <= 3).sort((a, b) => a.g - b.g)[0];
      if (c) { usati.add(c.x); abbinati.set(i, c.x); }
    });
    let aggiunti = 0, gia = 0;
    doc.movimenti.forEach((m, i) => {
      const e = abbinati.get(i);
      if (e) { e.fonti.push(k); gia++; return; }
      stato.movimenti.push({ id: nuovoId(), data: m.data, valuta: m.valuta, descrizione: m.descrizione, importo: m.importo, fonti: [k] });
      aggiunti++;
    });
    const { movimenti, ...resto } = doc;
    stato.documenti.push({ ...resto, k, nMovimenti: movimenti.length });
    return { k, aggiunti, gia };
  }

  /* ---------- Saldi giorno per giorno e controllo con i saldi letti ----------
     Si parte dal saldo letto più recente e si va indietro (e avanti) con i
     movimenti: ogni altro saldo letto deve tornare al centesimo. */
  function calcola(stato) {
    const mov = stato.movimenti.slice().sort((a, b) => a.data.localeCompare(b.data) || a.id - b.id);
    const punti = [];
    for (const d of stato.documenti) for (const s of d.saldi || []) {
      if (!punti.some((p) => p.data === s.data && p.saldo === s.saldo)) punti.push({ ...s, file: d.file, banca: d.banca });
    }
    punti.sort((a, b) => a.data.localeCompare(b.data));
    const ancora = punti[punti.length - 1] || null;
    const base = ancora ? ancora.saldo - mov.filter((m) => m.data <= ancora.data).reduce((t, m) => t + m.importo, 0) : null; // saldo prima del primo movimento
    const saldoAl = (data) => base == null ? null : base + mov.filter((m) => m.data <= data).reduce((t, m) => t + m.importo, 0);
    const controlli = punti.map((p) => { const c = saldoAl(p.data); return { ...p, calcolato: c, ok: c === p.saldo, ancora: p === ancora }; });
    return { mov, punti, ancora, base, saldoAl, controlli };
  }

  const API = { leggiFile, unisci, togliDocumento, calcola, _interni: { interpreta, righeDaElementi, centesimi } };
  if (typeof window !== 'undefined') window.BancaPDF = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
