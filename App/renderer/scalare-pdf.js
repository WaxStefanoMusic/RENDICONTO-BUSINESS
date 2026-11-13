'use strict';
/* ==========================================================================
   Lettore dell'estratto conto scalare (conteggio delle competenze)

   Dal 2016 (art. 120 TUB, delibera CICR 343/2016) gli interessi debitori
   del conto si calcolano al 31 dicembre e diventano esigibili il 1° marzo
   dell'anno dopo; gli oneri del fido (CFA), le commissioni e le spese
   invece si addebitano subito, con la valuta del conteggio. Dal PDF si
   leggono:
   - banca, numero del conto, data del conteggio;
   - interessi debitori del periodo, con tasso e numeri, e quelli «già
     conteggiati» nei trimestri prima;
   - corrispettivo sul fido accordato (importo del fido, percentuale) e
     spese;
   - oneri contabilizzati in conto, con la valuta;
   - interessi debitori da addebitare (il totale dell'anno);
   - saldo contabile finale.
   Le somme si verificano tra loro (interessi dei trimestri = totale da
   addebitare, CFA + spese = oneri addebitati). Tutto avviene qui: i file
   non vanno da nessuna parte.
   ========================================================================== */
(function () {
  let pdfjs = null;
  const BASE = document.currentScript?.src || document.baseURI;
  const IMPORTO = /^-?\d{1,3}(?:\.\d{3})*,\d{2}$|^-?\d+,\d{2}$/;
  const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  const pulisci = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
  const num = (s) => { const v = parseFloat(String(s).replace(/\./g, '').replace(',', '.')); return Number.isFinite(v) ? v : null; };
  const r2 = (n) => Math.round(n * 100) / 100;
  const iso = (g, m, a) => `${a}-${String(m).padStart(2, '0')}-${String(g).padStart(2, '0')}`;
  const dataDa = (s) => {
    let m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s || '');
    if (m) return iso(+m[1], +m[2], m[3]);
    m = new RegExp(`(\\d{1,2})\\s+(${MESI.join('|')})\\s+(\\d{4})`, 'i').exec(s || '');
    return m ? iso(+m[1], MESI.indexOf(m[2].toLowerCase()) + 1, m[3]) : '';
  };

  async function righeDelPdf(bytes) {
    if (!pdfjs) {
      pdfjs = await import(new URL('lib/pdf.min.mjs', BASE).href);
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('lib/pdf.worker.min.mjs', BASE).href;
    }
    const doc = await pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false, disableFontFace: true }).promise;
    const righe = [];
    try {
      for (let p = 1; p <= Math.min(doc.numPages, 30); p++) {
        const tc = await (await doc.getPage(p)).getTextContent();
        const sue = [];
        for (const it of tc.items) {
          const s = pulisci(it.str);
          if (!s) continue;
          const x = it.transform[4], y = it.transform[5], h = Math.abs(it.transform[3]) || 8;
          let r = sue.find((q) => Math.abs(q.y - y) <= Math.max(2, h * 0.3));
          if (!r) { r = { pagina: p, y, pezzi: [] }; sue.push(r); }
          r.pezzi.push({ x, s });
        }
        sue.sort((a, b) => b.y - a.y);
        for (const r of sue) {
          r.pezzi.sort((a, b) => a.x - b.x);
          r.celle = r.pezzi.map((q) => q.s);
          r.testo = r.celle.join(' | ');
          righe.push(r);
        }
      }
    } finally {
      doc.destroy();
    }
    return righe;
  }

  // gli importi possono avere il segno della banca: «1.234,56 D» (debito) o «… C»
  const importiDi = (r) => r.celle.map((c) => c.replace(/\s*[DC]$/, '')).filter((c) => IMPORTO.test(c)).map(num);
  const ultimoImporto = (r) => { const v = importiDi(r); return v.length ? v[v.length - 1] : null; };

  /* La riga «TOTALE» che chiude la sezione che comincia con l'intestazione */
  function totaleSezione(righe, intestazione, limite = 12) {
    const i = righe.findIndex((r) => intestazione.test(r.testo));
    if (i < 0) return { i: -1, totale: null };
    for (let k = i + 1; k < Math.min(righe.length, i + limite); k++) {
      if (/^totale\b/i.test(righe[k].celle[0] || '')) return { i, totale: ultimoImporto(righe[k]), riga: k };
    }
    return { i, totale: null };
  }

  function interpreta(righe, nomeFile) {
    const testo = righe.map((r) => r.testo).join('\n');
    if (!/scalare|conteggio delle competenze|riepilogo finale competenze/i.test(testo)) throw new Error('non sembra un estratto conto scalare');
    const avvisi = [];
    const d = { file: nomeFile };

    const rc = righe.find((r) => /conteggio al/i.test(r.testo));
    d.conteggio = rc ? dataDa(rc.testo.replace(/\|/g, ' ')) : '';
    if (!d.conteggio) throw new Error('non trovo la data del conteggio («Conteggio al …»)');
    d.annoCompetenza = +d.conteggio.slice(0, 4);
    const mConto = /conto corrente[^n]*n\.\s*([\d/.-]+)/i.exec(testo.replace(/\|/g, ' '));
    d.conto = mConto ? mConto[1] : '';
    const mBanca = /^((?:BANCA|BANCO|CREDITO|CASSA|BPER|INTESA|UNICREDIT|BCC)[^|\n]{2,60}?)\s+-\s/m.exec(testo);
    d.banca = mBanca ? pulisci(mBanca[1]).replace(/\b([A-Z])([A-Z]+)\b/g, (_, a, b) => a + b.toLowerCase()) : '';

    // interessi debitori del periodo, con tasso
    const sezInt = totaleSezione(righe, /^interessi debitori$/i);
    d.interessiPeriodo = sezInt.totale;
    d.tassi = [];
    if (sezInt.i >= 0) {
      for (let k = sezInt.i + 1; k < (sezInt.riga || sezInt.i + 1); k++) {
        const t = righe[k].celle.find((c) => /^\d{1,2},\d{1,4}%$/.test(c));
        if (t) d.tassi.push({ dal: dataDa(righe[k].celle[0]), tasso: num(t.replace('%', '')) });
      }
    }
    // corrispettivo sul fido accordato
    const sezCfa = totaleSezione(righe, /corrispettivo sul fido accordato|commissione di messa a disposizione/i);
    d.cfa = sezCfa.totale;
    if (sezCfa.i >= 0) {
      const riga = righe.slice(sezCfa.i + 1, sezCfa.riga || sezCfa.i + 4).find((r) => importiDi(r).length >= 2);
      if (riga) {
        d.fido = importiDi(riga)[0];
        const p = riga.celle.find((c) => /%$/.test(c));
        d.cfaPct = p ? num(p.replace('%', '')) : null;
      }
    }
    // spese
    const rSpese = righe.find((r) => /^totale spese/i.test(r.celle[0] || ''));
    d.spese = rSpese ? ultimoImporto(rSpese) : null;

    // interessi già conteggiati nei trimestri prima
    d.giaConteggiati = righe.filter((r) => /già conteggiati al/i.test(r.testo) && /interessi debitori/i.test(r.testo))
      .map((r) => ({ al: dataDa(r.testo), importo: ultimoImporto(r) })).filter((x) => x.importo != null);

    // oneri contabilizzati in conto, con la valuta
    const rContab = righe.find((r) => /contabilizzazione competenze/i.test(r.testo));
    d.dataOneri = rContab ? dataDa(rContab.testo) : '';
    const rOneri = righe.find((r) => /^oneri\b/i.test(r.celle[0] || '') || /commissioni e spese/i.test(r.celle[0] || ''));
    d.oneri = rOneri ? ultimoImporto(rOneri) : null;
    if (d.oneri == null && (d.cfa != null || d.spese != null)) d.oneri = r2((d.cfa || 0) + (d.spese || 0));
    if (!d.dataOneri) d.dataOneri = d.conteggio;

    // interessi da addebitare (il totale dell'anno, esigibile il 1° marzo)
    const sezAdd = totaleSezione(righe, /interessi debitori da addebitare|interessi da addebitare/i, 6);
    d.interessiDaAddebitare = sezAdd.totale;
    const sommaTrim = r2(d.giaConteggiati.reduce((t, x) => t + x.importo, 0) + (d.interessiPeriodo || 0));
    const fineAnno = d.conteggio.slice(5) === '12-31';
    if (d.interessiDaAddebitare == null && fineAnno && sommaTrim > 0) {
      d.interessiDaAddebitare = sommaTrim;
      avvisi.push('Il totale degli interessi da addebitare non c\'è: è la somma dei trimestri.');
    }
    d.dataInteressi = d.interessiDaAddebitare != null ? `${d.annoCompetenza + 1}-03-01` : '';

    // saldo contabile finale
    const rSaldo = righe.find((r) => /saldo contabile finale/i.test(r.testo)) || righe.find((r) => /saldo liquido finale/i.test(r.testo));
    if (rSaldo) {
      d.saldoFinale = ultimoImporto(rSaldo);
      d.saldoSegno = /\bD\b|\d D$/.test(rSaldo.testo) ? 'D' : /\bC\b|\d C$/.test(rSaldo.testo) ? 'C' : '';
    }

    // verifiche
    d.verifiche = [];
    if (d.interessiDaAddebitare != null && (d.giaConteggiati.length || d.interessiPeriodo != null)) {
      d.verifiche.push({ cosa: 'Interessi dei trimestri = interessi da addebitare', atteso: d.interessiDaAddebitare, letto: sommaTrim, ok: Math.abs(sommaTrim - d.interessiDaAddebitare) < 0.005 });
    }
    if (d.oneri != null && d.cfa != null && d.spese != null) {
      const s = r2(d.cfa + d.spese);
      d.verifiche.push({ cosa: 'Fido (CFA) + spese = oneri addebitati', atteso: d.oneri, letto: s, ok: Math.abs(s - d.oneri) < 0.005 });
    }
    if (d.oneri == null && d.interessiDaAddebitare == null) avvisi.push('Non trovo né gli oneri addebitati né gli interessi da addebitare: inseriscili a mano.');
    if (!fineAnno && d.interessiDaAddebitare == null && d.interessiPeriodo) avvisi.push(`Conteggio trimestrale: gli interessi del periodo (${d.interessiPeriodo.toFixed(2).replace('.', ',')} €) si pagano tutti insieme il 1° marzo, con l'estratto del 31 dicembre.`);
    d.avvisi = avvisi;
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
      } else if (profondita === 0) throw new Error('serve il PDF dell\'estratto conto scalare');
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

  window.ScalarePDF = { leggiFile, _interni: { interpreta, righeDelPdf } };
})();
