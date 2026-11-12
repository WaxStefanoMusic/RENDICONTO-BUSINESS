'use strict';
/* ==========================================================================
   Lettore dei PDF delle polizze e delle quietanze

   Le compagnie non mandano fatture elettroniche (i premi sono esenti IVA) ma
   ricevute di pagamento, quietanze e schede di polizza in PDF, ognuna col
   suo modello. Qui se ne leggono le informazioni che servono al tab
   Polizze/Assicurazioni:
   - compagnia, numero di polizza, contraente
   - premio pagato (totale lordo, comprese le imposte)
   - periodo coperto (dal… al…, decorrenza e scadenza, anche scritte come
     «g. 19 m. 06 a. 2026»)
   - data del pagamento, se c'è
   - cosa copre: prodotto (es. «Commercianti») o veicolo con la targa
   e se ne propone il tipo (attività, auto promiscua, personale).

   Il testo si prende con la sua posizione: un valore si cerca nella stessa
   riga dell'etichetta o sotto/sopra di essa, nella stessa colonna. Quello
   che non si trova resta vuoto e si completa a mano nell'anteprima.
   Accetta anche archivi ZIP con dentro i PDF. Tutto avviene qui: i file non
   vanno da nessuna parte.
   ========================================================================== */
(function () {
  let pdfjs = null;
  const BASE = document.currentScript?.src || document.baseURI;

  const IMPORTO = /^(?:€\s*)?-?\d{1,3}(?:\.\d{3})*,\d{2}(?:\s*€)?$|^(?:€\s*)?-?\d+,\d{2}(?:\s*€)?$/;
  const DATA = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/;
  const numero = (s) => {
    const v = parseFloat(String(s).replace(/[€\s]/g, '').replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(v) ? v : null;
  };
  const iso = (g, m, a) => {
    const d = +g, mm = +m, y = +a;
    if (!(d >= 1 && d <= 31 && mm >= 1 && mm <= 12 && y >= 1990 && y <= 2100)) return '';
    return `${y}-${String(mm).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  };
  const dataDa = (s) => { const m = DATA.exec(String(s || '')); return m ? iso(m[1], m[2], m[3]) : ''; };
  const pulisci = (s) => String(s || '').replace(/\s+/g, ' ').trim();

  // ------------------------------------------------------------ testo
  async function righeDelPdf(bytes) {
    if (!pdfjs) {
      pdfjs = await import(new URL('lib/pdf.min.mjs', BASE).href);
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('lib/pdf.worker.min.mjs', BASE).href;
    }
    // pdf.js si prende il buffer: gli si passa una copia
    const doc = await pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false, disableFontFace: true }).promise;
    const righe = [];
    try {
      for (let p = 1; p <= Math.min(doc.numPages, 8); p++) {
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
          r.testo = r.pezzi.map((q) => q.s).join(' ');
          righe.push(r);
        }
      }
    } finally {
      doc.destroy();
    }
    return righe;
  }

  /* Il valore che sta accanto a un'etichetta: nella stessa riga subito a
     destra, oppure nelle righe sotto (e sopra) nella stessa colonna. */
  function valoreVicino(righe, etichetta, accetta, { sopra = true, righeMax = 3 } = {}) {
    for (let i = 0; i < righe.length; i++) {
      for (const e of righe[i].pezzi) {
        if (!etichetta.test(e.s)) continue;
        const centro = (e.x + e.x2) / 2;
        const inColonna = (r) => {
          if (!r || r.pagina !== righe[i].pagina) return null;
          const buoni = r.pezzi.filter((q) => accetta(q.s));
          let meglio = null, dist = Infinity;
          for (const q of buoni) {
            const sovrapposto = q.x2 >= e.x - 25 && q.x <= e.x2 + 25;
            const d = Math.abs((q.x + q.x2) / 2 - centro);
            if ((sovrapposto || d < 60) && d < dist) { meglio = q; dist = d; }
          }
          return meglio ? meglio.s : null;
        };
        // stessa riga, a destra
        const destra = righe[i].pezzi.filter((q) => q.x >= e.x2 - 2 && accetta(q.s));
        if (destra.length && destra[0].x - e.x2 < 160) return destra[0].s;
        for (let k = 1; k <= righeMax; k++) {
          const v = inColonna(righe[i + k]) || (sopra ? inColonna(righe[i - k]) : null);
          if (v) return v;
        }
      }
    }
    return null;
  }

  // ------------------------------------------------------------ compagnie
  const COMPAGNIE = [
    [/\bzurich\b/i, 'Zurich'], [/\bitaliana assicurazioni\b|www\.italiana\.it/i, 'Italiana Assicurazioni'],
    [/\bgenerali\b/i, 'Generali'], [/\ballianz\b/i, 'Allianz'], [/\bunipol(sai)?\b/i, 'UnipolSai'], [/\baxa\b/i, 'AXA'],
    [/\breale mutua\b/i, 'Reale Mutua'], [/\bcattolica\b/i, 'Cattolica Assicurazioni'], [/\bgroupama\b/i, 'Groupama'],
    [/\bhelvetia\b/i, 'Helvetia'], [/\bitas\b/i, 'ITAS'], [/\bvittoria assicurazioni\b/i, 'Vittoria Assicurazioni'],
    [/\bsara assicurazioni\b/i, 'Sara Assicurazioni'], [/\bgenialloyd\b/i, 'Genialloyd'], [/\blinear\b/i, 'Linear'],
    [/\bquixa\b/i, 'Quixa'], [/\bverti\b/i, 'Verti'], [/\bprima assicurazioni\b|\bprima\.it\b/i, 'Prima Assicurazioni'],
    [/\bposte (assicura|vita)\b/i, 'Poste Assicura'], [/\bhdi\b/i, 'HDI Assicurazioni'], [/\btua assicurazioni\b/i, 'TUA Assicurazioni'],
    [/\bnet insurance\b/i, 'Net Insurance'], [/\bamissima\b/i, 'Amissima'], [/\baviva\b/i, 'Aviva'], [/\bbene assicurazioni\b/i, 'Bene Assicurazioni'],
    [/\bconte\.it\b/i, 'ConTe.it'], [/\bdirect line\b/i, 'Direct Line'], [/\bintesa sanpaolo (assicura|vita|protezione)\b/i, 'Intesa Sanpaolo Assicurazioni'],
    [/\bbcc assicurazioni\b/i, 'BCC Assicurazioni'], [/\bnobis\b/i, 'Nobis'], [/\barag\b/i, 'ARAG'], [/\bd\.a\.s\.\b|\bdas difesa\b/i, 'DAS'],
    [/\beurop assistance\b/i, 'Europ Assistance'], [/\bmapfre\b/i, 'Mapfre'], [/\bcardif\b/i, 'Cardif'], [/\brevo insurance\b/i, 'Revo'],
    [/\bcr[eé]dit agricole assicurazioni\b/i, 'Crédit Agricole Assicurazioni'], [/\blloyd'?s\b/i, "Lloyd's"], [/\bchubb\b/i, 'Chubb'],
    [/\bmediolanum\b/i, 'Mediolanum'], [/\bassimoco\b/i, 'Assimoco'], [/\belba assicurazioni\b/i, 'Elba Assicurazioni'], [/\balleanza\b/i, 'Alleanza'],
  ];
  function compagniaDa(testo) {
    let meglio = '', conta = 0;
    for (const [re, nome] of COMPAGNIE) {
      const n = (testo.match(new RegExp(re.source, 'gi')) || []).length;
      if (n > conta) { meglio = nome; conta = n; }
    }
    if (meglio) return meglio;
    const m = /([A-Z][\w&.' -]{2,40}?\s(?:Assicurazioni|Insurance|Assurance)(?:\s+S\.?p\.?A\.?|\s+AG|\s+Ltd|\s+SE)?)/.exec(testo);
    return m ? pulisci(m[1]) : '';
  }

  // ------------------------------------------------------------ interpretazione
  const PRODOTTI = /multirischi|commercianti|negozio|esercizi commerciali|attivit[aà]|azienda|impresa|ufficio|r\.?c\.? ?(terzi|professionale|prodotti|t\/o)|responsabilit[aà] civile|incendio|furto|tutela legale|infortuni|\bvita\b|malattia|salute|casa|abitazione|cyber|cauzion|fabbricat|merci/i;
  const ETICHETTE = /^(polizza|contraente|durata|frazionamento|premio|imponibile|imposte|totale|vincolo|indicizzazione|residenza|partita iva|codice|targa|subagenzia|agenzia)/i;

  function interpreta(righe, nomeFile) {
    const testo = righe.map((r) => r.testo).join('\n');
    const avvisi = [];
    const d = { file: nomeFile, compagnia: compagniaDa(testo) };

    d.tipoDoc = /ricevuta di pagamento|quietanza|attestazione di pagamento|pagat[oa] il/i.test(testo) ? 'quietanza' : 'polizza';

    // numero di polizza
    const numeroOk = (s) => /^[A-Z0-9][A-Z0-9/.-]{3,}$/i.test(s) && /\d/.test(s) && !DATA.test(s) && !IMPORTO.test(s);
    let num = null;
    for (const r of righe) {
      const m = /polizza\s*n[.°º]?\s*:?\s*([A-Z0-9][A-Z0-9/.-]{3,})/i.exec(r.testo);
      if (m && numeroOk(m[1])) { num = m[1]; break; }
    }
    if (!num) num = valoreVicino(righe, /^numero di polizza$|^n\.? ?(di )?polizza$|^polizza( n\.?)?:?$/i, numeroOk, { sopra: false });
    d.numero = num || '';

    // contraente e sua partita IVA (non quella della compagnia)
    const rigaContr = righe.find((r) => /contraente/i.test(r.testo) && /\b\d{11}\b/.test(r.testo));
    d.contraentePiva = rigaContr ? /\b(\d{11})\b/.exec(rigaContr.testo)[1]
      : (valoreVicino(righe, /^partita iva$|^p\.? ?iva$|^p\.i\.$/i, (s) => /^\d{11}$/.test(s), { sopra: false }) || '');

    // periodo coperto
    const tutto = righe.map((r) => r.testo).join(' ');
    let m = /periodo\s+dal\s+(\d{1,2}[/.-]\d{1,2}[/.-]\d{4})\s+al\s+(\d{1,2}[/.-]\d{1,2}[/.-]\d{4})/i.exec(tutto);
    if (m) { d.dal = dataDa(m[1]); d.al = dataDa(m[2]); }
    if (!d.dal || !d.al) {
      // «DECORRENZA POLIZZA | SCADENZA POLIZZA» con le date scritte g. m. a.
      const i = righe.findIndex((r) => /decorrenza/i.test(r.testo) && /scadenza/i.test(r.testo));
      for (let k = i + 1; i >= 0 && k <= i + 2 && k < righe.length; k++) {
        const triple = [...righe[k].testo.matchAll(/g\.\s*(\d{1,2})\s*m\.\s*(\d{1,2})\s*a\.\s*(\d{4})/gi)].map((x) => iso(x[1], x[2], x[3]));
        const date = triple.length ? triple : [...righe[k].testo.matchAll(new RegExp(DATA.source, 'g'))].map((x) => iso(x[1], x[2], x[3]));
        if (date.length >= 2) { d.dal = d.dal || date[0]; d.al = d.al || date[1]; break; }
      }
    }
    if (!d.dal) { m = /(?:decorrenza|effetto|validit[aà] dal|dalle ore 24[,.]?0{0,2} del)\D{0,25}(\d{1,2}[/.-]\d{1,2}[/.-]\d{4})/i.exec(tutto); if (m) d.dal = dataDa(m[1]); }
    if (!d.al) { m = /(?:scadenza|alle ore 24[,.]?0{0,2} del|valid[ao] fino al)\D{0,25}(\d{1,2}[/.-]\d{1,2}[/.-]\d{4})/i.exec(tutto); if (m) d.al = dataDa(m[1]); }
    if (d.dal && d.al && d.al < d.dal) [d.dal, d.al] = [d.al, d.dal];

    // premio pagato
    const imp = (s) => IMPORTO.test(s);
    let premio = valoreVicino(righe, /premio totale lordo|totale premio lordo|premio lordo totale|totale lordo/i, imp);
    if (!premio) {
      const r = righe.find((x) => /rata alla firma|premio alla firma|totale alla firma/i.test(x.testo));
      if (r) { const v = r.pezzi.filter((q) => imp(q.s)); if (v.length) premio = v[v.length - 1].s; }
    }
    if (!premio) premio = valoreVicino(righe, /^totale( euro)?$|totale da pagare|importo (pagato|totale|versato)|totale quietanza|premio (complessivo|totale)|totale rata|premio pagato/i, imp);
    if (!premio) { m = /(?:totale|premio)[^0-9\n]{0,40}(\d{1,3}(?:\.\d{3})*,\d{2})/i.exec(testo); if (m) premio = m[1]; }
    d.premio = premio ? numero(premio) : null;

    // data del pagamento
    m = /(?:pagat[oa]|incassat[oa]|versat[oa]) il\s*:?\s*(\d{1,2}[/.-]\d{1,2}[/.-]\d{4})/i.exec(tutto)
      || /data (?:di |del )?pagamento\s*:?\s*(\d{1,2}[/.-]\d{1,2}[/.-]\d{4})/i.exec(tutto);
    d.pagato = m ? dataDa(m[1]) : '';
    d.data = d.pagato || d.dal || '';

    d.frazionamento = pulisci((/frazionamento:?\s*(annuale|semestrale|quadrimestrale|trimestrale|mensile|unico)/i.exec(tutto) || [])[1] || valoreVicino(righe, /^rateazione$/i, (s) => /^(annuale|semestrale|quadrimestrale|trimestrale|mensile|unico)$/i.test(s), { sopra: false }) || '');

    // cosa copre: un veicolo con la targa o il nome del prodotto
    const targaOk = (s) => /^[A-Z]{2}\s?\d{3}\s?[A-Z]{2}$/.test(s);
    d.targa = (valoreVicino(righe, /^targa$/i, targaOk, { sopra: false }) || (/\b[Tt][Aa][Rr][Gg][Aa]\s*:?\s*([A-Z]{2}\s?\d{3}\s?[A-Z]{2})\b/.exec(tutto) || [])[1] || '').replace(/\s/g, '');
    const veicolo = valoreVicino(righe, /^tipo (del )?veicolo$/i, (s) => /[a-z]/i.test(s) && !/^marca/i.test(s), { sopra: false }) || '';
    if (d.targa) {
      d.desc = `${veicolo ? 'Polizza ' + veicolo.toLowerCase() : 'Polizza veicolo'} targa ${d.targa}`;
    } else {
      // il nome del prodotto: un'etichetta corta, di solito in maiuscolo, nelle prime righe
      const testa = righe.slice(0, 25);
      let prodotto = '';
      for (const r of testa) {
        const p = r.pezzi.find((q) => q.s.length <= 40 && PRODOTTI.test(q.s) && !ETICHETTE.test(q.s) && !/\d{3,}/.test(q.s));
        if (p) { prodotto = p.s; break; }
      }
      d.desc = prodotto ? 'Polizza ' + prodotto.charAt(0).toUpperCase() + prodotto.slice(1).toLowerCase() : (d.compagnia ? 'Polizza ' + d.compagnia : 'Polizza');
    }

    // tipo: dal veicolo o dal prodotto (non da tutto il testo: le condizioni elencano di tutto)
    const chiave = `${d.desc} ${veicolo} ${righe.slice(0, 12).map((r) => r.testo).join(' ')}`;
    if (d.targa || veicolo) {
      d.categoria = /autocarro|furgone|\bN1\b|trasporto cose|veicolo commerciale|motocarro|conto proprio/i.test(`${veicolo} ${tutto}`) ? 'polizza_100' : 'polizza_auto_20';
      if (d.categoria === 'polizza_auto_20') avvisi.push('Veicolo non commerciale: costo al 20%. Se è un autocarro o un furgone dell\'attività scegli «Attività».');
    } else if (/\bvita\b|caso morte|infortuni(?! del conducente)|malattia|salute|long term care|previdenz/i.test(chiave)) {
      d.categoria = 'polizza_personale_0';
    } else {
      d.categoria = 'polizza_100';
    }

    if (d.premio == null) avvisi.push('Premio non trovato: inseriscilo a mano.');
    if (!d.al) avvisi.push('Scadenza non trovata: inseriscila per avere l\'avviso di rinnovo.');
    if (!d.numero) avvisi.push('Numero di polizza non trovato.');
    if (!d.compagnia) avvisi.push('Compagnia non riconosciuta.');
    if (!d.pagato && d.tipoDoc === 'polizza') avvisi.push('È la scheda della polizza, non la ricevuta: come data del pagamento uso l\'inizio della copertura.');
    d.avvisi = avvisi;
    return d;
  }

  // ------------------------------------------------------------ file
  async function leggiBytes(nome, bytes, profondita = 0) {
    const documenti = [], errori = [], altri = [];
    const basso = nome.toLowerCase();
    try {
      if (basso.endsWith('.zip') || (bytes[0] === 0x50 && bytes[1] === 0x4b)) {
        if (profondita > 2) return { documenti, errori, altri };
        for (const f of await window.FatturaPA._interni.leggiZip(bytes)) {
          const r = await leggiBytes(f.nome, f.dati, profondita + 1);
          documenti.push(...r.documenti); errori.push(...r.errori); altri.push(...r.altri);
        }
      } else if (basso.endsWith('.pdf') || String.fromCharCode(...bytes.subarray(0, 5)) === '%PDF-') {
        const righe = await righeDelPdf(bytes);
        if (!righe.length) throw new Error('il PDF non contiene testo (è una scansione?)');
        documenti.push({ ...interpreta(righe, nome), bytes: bytes.slice() });
      } else if (/\.(xml|p7m)$/.test(basso)) {
        // fatture elettroniche dentro lo zip: le legge l'importazione XML
        altri.push(new File([bytes.slice()], nome));
      }
    } catch (e) {
      errori.push({ file: nome, errore: e.message || String(e) });
    }
    return { documenti, errori, altri };
  }

  async function leggiFile(listaFile) {
    const documenti = [], errori = [], altri = [];
    for (const f of listaFile) {
      const r = await leggiBytes(f.name, new Uint8Array(await f.arrayBuffer()));
      documenti.push(...r.documenti); errori.push(...r.errori); altri.push(...r.altri);
    }
    return { documenti, errori, altri };
  }

  window.PolizzePDF = { leggiFile, _interni: { interpreta, righeDelPdf, valoreVicino } };
})();
