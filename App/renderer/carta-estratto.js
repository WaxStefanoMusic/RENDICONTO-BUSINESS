'use strict';
/* ==========================================================================
   Lettore degli estratti conto della carta aziendale

   Legge i movimenti (data, descrizione, importo con il segno) da:
   - PDF della banca: ogni riga che comincia con una data e finisce con un
     importo è un movimento; le righe senza data subito sotto, nella colonna
     della descrizione, la continuano. Con due colonne di importi
     (addebiti/accrediti, dare/avere, uscite/entrate) il segno si ricava
     dalla colonna;
   - Excel .xlsx, CSV e i «.xls» che molte banche esportano in HTML: si cerca
     la riga d'intestazione (Data, Descrizione/Causale, Importo oppure
     Addebiti e Accrediti) e si leggono le righe sotto;
   - ZIP con dentro uno o più di questi file, anche annidati.
   Dal PDF si prendono anche saldo iniziale, saldo finale e «Totale
   movimenti», per verificare che non manchi niente. Tutto avviene qui: i
   file non vanno da nessuna parte.
   ========================================================================== */
(function () {
  let pdfjs = null;
  const BASE = document.currentScript?.src || document.baseURI;

  const IMPORTO = /^[-+−]?\s?(?:€\s*)?[-+−]?\d{1,3}(?:[.\s]\d{3})*,\d{2}(?:\s*€)?(?:\s*[-+])?$|^[-+−]?\s?(?:€\s*)?[-+−]?\d+,\d{2}(?:\s*€)?$/;
  const DATA = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/;
  const pulisci = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

  function iso(g, m, a) {
    let y = +a;
    if (String(a).length === 2) y += y > 70 ? 1900 : 2000;
    const d = +g, mm = +m;
    if (!(d >= 1 && d <= 31 && mm >= 1 && mm <= 12 && y >= 1990 && y <= 2100)) return '';
    return `${y}-${String(mm).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  function dataDa(v) {
    if (typeof v === 'number' && v > 20000 && v < 80000) {          // numero di serie di Excel
      const t = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
      return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
    }
    const s = pulisci(v);
    let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (m) return iso(m[3], m[2], m[1]);
    m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})\b/.exec(s);
    return m ? iso(m[1], m[2], m[3]) : '';
  }
  /* Importo da testo: «-1.234,56 €», «1234.56», «12,50-», «(12,50)» */
  function importoDa(v) {
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    let s = pulisci(v).replace(/[€\s]|EUR/gi, '').replace('−', '-');
    if (!s) return null;
    let neg = false;
    if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
    if (/-$/.test(s)) { neg = true; s = s.slice(0, -1); }
    if (/^\+/.test(s)) s = s.slice(1);
    if (/^-/.test(s)) { neg = !neg; s = s.slice(1); }
    if (!/^[\d.,']+$/.test(s)) return null;
    s = s.replace(/'/g, '');
    const ultimaVirgola = s.lastIndexOf(','), ultimoPunto = s.lastIndexOf('.');
    if (ultimaVirgola > ultimoPunto) s = s.replace(/\./g, '').replace(',', '.');
    else if (ultimoPunto > ultimaVirgola && ultimaVirgola >= 0) s = s.replace(/,/g, '');
    else if (ultimoPunto >= 0 && !/\.\d{1,2}$/.test(s)) s = s.replace(/\./g, '');   // «1.234» = migliaia
    const n = parseFloat(s);
    return Number.isFinite(n) ? (neg ? -n : n) : null;
  }
  const r2 = (n) => Math.round(n * 100) / 100;

  /* «(Da contabilizzare)» e simili: il movimento è provvisorio, sul
     prossimo estratto compare senza la nota */
  function descPulita(s) {
    const provvisorio = /\((?:da contabilizzare|in attesa|provvisori[oa]|non contabilizzat[oa])\)/i.test(s);
    return { desc: pulisci(String(s).replace(/\((?:da contabilizzare|in attesa|provvisori[oa]|non contabilizzat[oa])\)/gi, '')), provvisorio };
  }

  // ------------------------------------------------------------ PDF
  async function righeDelPdf(bytes) {
    if (!pdfjs) {
      pdfjs = await import(new URL('lib/pdf.min.mjs', BASE).href);
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('lib/pdf.worker.min.mjs', BASE).href;
    }
    const doc = await pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false, disableFontFace: true }).promise;
    const righe = [];
    try {
      for (let p = 1; p <= Math.min(doc.numPages, 60); p++) {
        const pagina = await doc.getPage(p);
        const tc = await pagina.getTextContent();
        const sue = [];
        for (const it of tc.items) {
          const s = pulisci(it.str);
          if (!s) continue;
          const x = it.transform[4], y = it.transform[5], h = Math.abs(it.transform[3]) || 8;
          let r = sue.find((q) => Math.abs(q.y - y) <= Math.max(2, h * 0.3));
          if (!r) { r = { pagina: p, y, pezzi: [] }; sue.push(r); }
          r.pezzi.push({ x, x2: x + (it.width || s.length * h * 0.5), s });
        }
        sue.sort((a, b) => b.y - a.y);
        for (const r of sue) {
          r.pezzi.sort((a, b) => a.x - b.x);
          // pezzi attaccati (stessa parola spezzata) si uniscono
          const uniti = [];
          for (const q of r.pezzi) {
            const u = uniti[uniti.length - 1];
            if (u && q.x - u.x2 < 1.5) { u.s += q.s; u.x2 = q.x2; } else uniti.push({ ...q });
          }
          r.pezzi = uniti;
          r.testo = uniti.map((q) => q.s).join(' ');
          righe.push(r);
        }
      }
    } finally {
      doc.destroy();
    }
    return righe;
  }

  function movimentiDaPdf(righe) {
    const movimenti = [];
    let colonne = null;              // { addebiti: x, accrediti: x } se gli importi stanno in due colonne
    let ultimo = null, xDesc = null;
    const info = { saldi: [], totale: null };
    for (const r of righe) {
      const t = r.testo;
      // intestazione con due colonne di importi
      const add = r.pezzi.find((q) => /^(addebiti|uscite|dare|addebito|importo addebit)/i.test(q.s));
      const acc = r.pezzi.find((q) => /^(accrediti|entrate|avere|accredito|importo accredit)/i.test(q.s));
      if (add && acc) { colonne = { addebiti: (add.x + add.x2) / 2, accrediti: (acc.x + acc.x2) / 2 }; ultimo = null; continue; }

      // saldi e totale dell'estratto
      const impFine = r.pezzi.length > 1 && IMPORTO.test(r.pezzi[r.pezzi.length - 1].s) ? importoDa(r.pezzi[r.pezzi.length - 1].s) : null;
      if (/^saldo\b/i.test(t) && impFine != null) {
        const d = /(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})/.exec(t);
        info.saldi.push({ testo: t, data: d ? dataDa(d[1]) : '', importo: impFine, contabile: /contabile/i.test(t), disponibile: /disponibile/i.test(t) });
        ultimo = null; continue;
      }
      if (/^totale (movimenti|operazioni|addebiti e accrediti)/i.test(t) && impFine != null) { info.totale = impFine; ultimo = null; continue; }

      const primo = r.pezzi[0];
      const md = primo && DATA.exec(primo.s);
      const imps = r.pezzi.filter((q, i) => i > 0 && IMPORTO.test(q.s));
      if (md && imps.length) {
        const data = iso(md[1], md[2], md[3]);
        if (!data) { ultimo = null; continue; }
        // la descrizione: i pezzi tra le date (data contabile, data valuta) e gli importi
        const primoImp = r.pezzi.indexOf(imps[0]);
        const mezzo = r.pezzi.slice(1, primoImp).filter((q) => !DATA.test(q.s));
        let importo;
        const q = imps[imps.length === 1 ? 0 : 0];
        importo = importoDa(q.s);
        if (colonne) {
          const c = (q.x + q.x2) / 2;
          const versoAdd = Math.abs(c - colonne.addebiti) < Math.abs(c - colonne.accrediti);
          if (importo > 0 && versoAdd) importo = -importo;
        }
        if (importo == null || !mezzo.length) { ultimo = null; continue; }
        const { desc, provvisorio } = descPulita(mezzo.map((p) => p.s).join(' '));
        ultimo = { data, desc, importo: r2(importo), provvisorio };
        xDesc = mezzo[0].x;
        movimenti.push(ultimo);
        continue;
      }
      // continuazione della descrizione sulla riga sotto
      if (ultimo && !md && !imps.length && primo && xDesc != null && Math.abs(primo.x - xDesc) < 12 && t.length < 120
        && !/^(data|pagina|segue|totale|saldo)\b/i.test(t)) {
        const { desc, provvisorio } = descPulita(ultimo.desc + ' ' + t);
        ultimo.desc = desc; ultimo.provvisorio = ultimo.provvisorio || provvisorio;
        continue;
      }
      ultimo = null;
    }
    return { movimenti, info };
  }

  // ------------------------------------------------------------ tabelle (Excel, CSV, HTML)
  function movimentiDaTabella(righe) {
    const norm = (v) => pulisci(v).toLowerCase();
    let h = -1, col = null;
    for (let i = 0; i < Math.min(righe.length, 60) && h < 0; i++) {
      const c = righe[i].map(norm);
      const iData = c.findIndex((v) => /^data( (operazione|contabile|movimento|transazione|acquisto))?$/.test(v) || v === 'data op.' || v === 'date');
      const iImp = c.findIndex((v) => /^(importo|ammontare|importo \(?eur|importo in euro|amount)/.test(v));
      const iAdd = c.findIndex((v) => /^(addebiti|addebito|uscite|dare|importo addebit)/.test(v));
      const iAcc = c.findIndex((v) => /^(accrediti|accredito|entrate|avere|importo accredit)/.test(v));
      const iDesc = c.findIndex((v) => /descrizione|causale|operazione|dettaglio|esercente|movimento|description/.test(v) && !/^data/.test(v));
      if (iData >= 0 && (iImp >= 0 || (iAdd >= 0 && iAcc >= 0))) { h = i; col = { iData, iImp, iAdd, iAcc, iDesc }; }
    }
    if (h < 0) return null;
    const movimenti = [];
    for (const riga of righe.slice(h + 1)) {
      const data = dataDa(riga[col.iData]);
      if (!data) continue;
      let importo;
      if (col.iImp >= 0) importo = importoDa(riga[col.iImp]);
      else {
        const a = importoDa(riga[col.iAdd]), b = importoDa(riga[col.iAcc]);
        importo = a ? -Math.abs(a) : b ? Math.abs(b) : null;
      }
      if (importo == null || importo === 0) continue;
      let testo = col.iDesc >= 0 ? riga[col.iDesc] : '';
      if (!pulisci(testo)) testo = riga.filter((v, i) => i !== col.iData && i !== col.iImp && i !== col.iAdd && i !== col.iAcc && typeof v === 'string' && !dataDa(v) && importoDa(v) == null).join(' ');
      const { desc, provvisorio } = descPulita(testo);
      movimenti.push({ data, desc: desc || 'Movimento carta', importo: r2(importo), provvisorio });
    }
    return movimenti;
  }

  function righeCsv(testo) {
    const prime = testo.split(/\r?\n/).slice(0, 20).join('\n');
    const sep = [';', '\t', ','].map((s) => [s, (prime.match(new RegExp(s === '\t' ? '\t' : '\\' + s, 'g')) || []).length]).sort((a, b) => b[1] - a[1])[0][0];
    const righe = [];
    let riga = [], campo = '', virgolette = false;
    for (let i = 0; i < testo.length; i++) {
      const c = testo[i];
      if (virgolette) {
        if (c === '"' && testo[i + 1] === '"') { campo += '"'; i++; }
        else if (c === '"') virgolette = false;
        else campo += c;
      } else if (c === '"') virgolette = true;
      else if (c === sep) { riga.push(campo); campo = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && testo[i + 1] === '\n') i++;
        riga.push(campo); righe.push(riga); riga = []; campo = '';
      } else campo += c;
    }
    if (campo || riga.length) { riga.push(campo); righe.push(riga); }
    return righe;
  }

  function righeHtml(testo) {
    const doc = new DOMParser().parseFromString(testo, 'text/html');
    return [...doc.querySelectorAll('tr')].map((tr) => [...tr.querySelectorAll('th,td')].map((c) => pulisci(c.textContent)));
  }

  async function righeXlsx(bytes) {
    const file = await window.FatturaPA._interni.leggiZip(bytes);
    const testo = (n) => { const f = file.find((x) => x.nome.toLowerCase() === n); return f ? new TextDecoder().decode(f.dati) : ''; };
    const xml = (s) => new DOMParser().parseFromString(s, 'application/xml');
    const condivise = [];
    const ss = testo('sharedstrings.xml');
    if (ss) for (const si of xml(ss).getElementsByTagName('si')) condivise.push([...si.getElementsByTagName('t')].map((t) => t.textContent).join(''));
    const fogli = file.filter((x) => /^sheet\d*\.xml$/i.test(x.nome)).sort((a, b) => (parseInt(a.nome.replace(/\D/g, ''), 10) || 0) - (parseInt(b.nome.replace(/\D/g, ''), 10) || 0));
    if (!fogli.length) throw new Error('nessun foglio nel file Excel');
    const tutte = [];
    for (const f of fogli) {
      const doc = xml(new TextDecoder().decode(f.dati));
      for (const row of doc.getElementsByTagName('row')) {
        const riga = [];
        for (const c of row.getElementsByTagName('c')) {
          const ref = c.getAttribute('r') || '';
          const lettere = (/^[A-Z]+/.exec(ref) || [''])[0];
          let idx = 0;
          for (const ch of lettere) idx = idx * 26 + (ch.charCodeAt(0) - 64);
          idx = lettere ? idx - 1 : riga.length;
          const t = c.getAttribute('t');
          const v = c.getElementsByTagName('v')[0]?.textContent ?? '';
          let val;
          if (t === 's') val = condivise[+v] ?? '';
          else if (t === 'inlineStr') val = [...c.getElementsByTagName('t')].map((x) => x.textContent).join('');
          else if (t === 'str' || t === 'b' || t === 'e') val = v;
          else val = v === '' ? '' : Number(v);
          riga[idx] = val;
        }
        tutte.push([...riga].map((v) => (v === undefined ? '' : v)));
      }
      if (tutte.length) break;          // basta il primo foglio con dati
    }
    return tutte;
  }

  // ------------------------------------------------------------ file
  const testoDi = (bytes) => {
    if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
    const u = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    return u.includes('�') ? new TextDecoder('windows-1252').decode(bytes) : u;
  };

  async function leggiBytes(nome, bytes, profondita = 0) {
    const estratti = [], errori = [];
    const basso = nome.toLowerCase();
    const inizio = String.fromCharCode(...bytes.subarray(0, 8));
    try {
      if (inizio.startsWith('%PDF-')) {
        const righe = await righeDelPdf(bytes);
        if (!righe.length) throw new Error('il PDF non contiene testo (è una scansione?)');
        const { movimenti, info } = movimentiDaPdf(righe);
        if (!movimenti.length) throw new Error('nessun movimento riconosciuto nel PDF');
        estratti.push({ file: nome, tipo: 'pdf', movimenti, ...riepilogo(movimenti, info), bytes: bytes.slice() });
      } else if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
        if (basso.endsWith('.xlsx') || basso.endsWith('.xlsm')) {
          aggiungiTabella(estratti, nome, await righeXlsx(bytes), 'excel');
        } else {
          if (profondita > 2) return { estratti, errori };
          const dentro = await window.FatturaPA._interni.leggiZip(bytes);
          if (dentro.some((f) => /^(workbook|sharedstrings)\.xml$/i.test(f.nome))) aggiungiTabella(estratti, nome, await righeXlsx(bytes), 'excel');
          else for (const f of dentro) {
            if (!/\.(pdf|zip|xlsx|xlsm|xls|csv|txt|html?)$/i.test(f.nome)) continue;
            const r = await leggiBytes(f.nome, f.dati, profondita + 1);
            estratti.push(...r.estratti); errori.push(...r.errori);
          }
        }
      } else if (bytes[0] === 0xd0 && bytes[1] === 0xcf) {
        throw new Error('Excel nel vecchio formato .xls: aprilo in Excel e salvalo come .xlsx o .csv');
      } else if (/\.(csv|txt|xls|html?)$/.test(basso)) {
        const testo = testoDi(bytes);
        const html = /<table|<tr/i.test(testo.slice(0, 5000));
        aggiungiTabella(estratti, nome, html ? righeHtml(testo) : righeCsv(testo), html ? 'excel' : 'csv');
      } else if (profondita === 0) {
        throw new Error('formato non riconosciuto (servono PDF, ZIP, Excel .xlsx o CSV)');
      }
    } catch (e) {
      errori.push({ file: nome, errore: e.message || String(e) });
    }
    return { estratti, errori };
  }

  function aggiungiTabella(estratti, nome, righe, tipo) {
    const movimenti = movimentiDaTabella(righe);
    if (!movimenti) throw new Error('non trovo le colonne Data, Descrizione e Importo');
    if (!movimenti.length) throw new Error('nessun movimento nel file');
    estratti.push({ file: nome, tipo, movimenti, ...riepilogo(movimenti, { saldi: [], totale: null }) });
  }

  /* Periodo, saldi e verifica dei totali */
  function riepilogo(movimenti, info) {
    const date = movimenti.map((m) => m.data).sort();
    const somma = r2(movimenti.reduce((t, m) => t + m.importo, 0));
    const preferiti = info.saldi.filter((s) => s.contabile).length >= 2 ? info.saldi.filter((s) => s.contabile) : info.saldi;
    const saldoIniziale = preferiti.length >= 2 ? preferiti[0].importo : null;
    const saldoFinale = preferiti.length >= 2 ? preferiti[preferiti.length - 1].importo : null;
    const verifiche = [];
    if (info.totale != null) verifiche.push({ cosa: 'Totale movimenti', atteso: info.totale, ok: Math.abs(info.totale - somma) < 0.005 });
    if (saldoIniziale != null && saldoFinale != null) verifiche.push({ cosa: 'Saldo iniziale + movimenti = saldo finale', atteso: r2(saldoFinale - saldoIniziale), ok: Math.abs(saldoIniziale + somma - saldoFinale) < 0.005 });
    const dataSaldoIniziale = saldoIniziale != null ? (preferiti[0].data || date[0]) : '';
    const dataSaldoFinale = saldoFinale != null ? (preferiti[preferiti.length - 1].data || date[date.length - 1]) : '';
    return { dal: date[0], al: date[date.length - 1], somma, saldoIniziale, saldoFinale, dataSaldoIniziale, dataSaldoFinale, verifiche };
  }

  async function leggiFile(listaFile) {
    const estratti = [], errori = [];
    for (const f of listaFile) {
      const r = await leggiBytes(f.name, new Uint8Array(await f.arrayBuffer()));
      estratti.push(...r.estratti); errori.push(...r.errori);
    }
    return { estratti, errori };
  }

  window.CartaEstratto = { leggiFile, _interni: { movimentiDaPdf, movimentiDaTabella, righeCsv, importoDa, dataDa, righeDelPdf } };
})();
