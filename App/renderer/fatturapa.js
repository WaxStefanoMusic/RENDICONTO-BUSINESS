'use strict';
/* ==========================================================================
   Lettore di fatture elettroniche (formato FatturaPA dello SDI)

   Accetta:
   - .xml   la fattura così com'è
   - .p7m   la fattura firmata (CAdES): l'XML sta dentro la busta PKCS#7
   - .zip   l'archivio scaricato in blocco da «Fatture e Corrispettivi»,
            anche con dentro altri zip, p7m o file di metadati (ignorati)

   Non manda niente da nessuna parte: tutto si legge qui, nel programma.
   Restituisce un oggetto semplice per ogni fattura (un file può contenerne
   più d'una, i cosiddetti «lotti»).
   ========================================================================== */
(function () {
  const dec = (bytes, enc = 'utf-8') => {
    try { return new TextDecoder(enc).decode(bytes); } catch (_) { return new TextDecoder('utf-8').decode(bytes); }
  };

  // ------------------------------------------------------------------ ZIP
  async function inflateRaw(bytes) {
    const ds = new DecompressionStream('deflate-raw');
    const out = new Response(new Blob([bytes]).stream().pipeThrough(ds));
    return new Uint8Array(await out.arrayBuffer());
  }

  async function leggiZip(bytes) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    // fine della directory centrale: si cerca dal fondo (può esserci un commento)
    let eocd = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('archivio zip non valido');
    const n = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const file = [];
    for (let k = 0; k < n; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const metodo = dv.getUint16(p + 10, true);
      const compSize = dv.getUint32(p + 20, true);
      const nomeLen = dv.getUint16(p + 28, true), extraLen = dv.getUint16(p + 30, true), commLen = dv.getUint16(p + 32, true);
      const locale = dv.getUint32(p + 42, true);
      const nome = dec(bytes.subarray(p + 46, p + 46 + nomeLen));
      p += 46 + nomeLen + extraLen + commLen;
      if (nome.endsWith('/')) continue;                       // cartella
      const ln = dv.getUint16(locale + 26, true), le = dv.getUint16(locale + 28, true);
      const inizio = locale + 30 + ln + le;
      const grezzi = bytes.subarray(inizio, inizio + compSize);
      let dati;
      if (metodo === 0) dati = grezzi;
      else if (metodo === 8) dati = await inflateRaw(grezzi);
      else continue;                                          // compressioni esotiche: si salta
      file.push({ nome: nome.split('/').pop(), dati });
    }
    return file;
  }

  // ------------------------------------------------------------------ P7M
  /* Lettore BER minimo: basta per trovare dentro la busta firmata l'OCTET
     STRING che contiene l'XML, anche quando è spezzato in tanti pezzi. */
  function leggiTLV(b, pos, fine) {
    const inizio = pos;
    const t = b[pos++];
    let numero = t & 0x1f;
    if (numero === 0x1f) { numero = 0; let c; do { c = b[pos++]; numero = (numero << 7) | (c & 0x7f); } while (c & 0x80); }
    const costruito = !!(t & 0x20), classe = t >> 6;
    let l = b[pos++], len = -1;
    if (l < 0x80) len = l;
    else if (l > 0x80) { len = 0; for (let i = 0; i < (l & 0x7f); i++) len = len * 256 + b[pos++]; }
    const nodo = { classe, numero, costruito, figli: [], dati: null };
    if (len >= 0) {
      const stop = pos + len;
      if (stop > fine) throw new Error('busta p7m troncata');
      if (costruito) { let q = pos; while (q < stop) { const f = leggiTLV(b, q, stop); nodo.figli.push(f.nodo); q = f.fine; } }
      else nodo.dati = b.subarray(pos, stop);
      return { nodo, fine: stop, inizio };
    }
    // lunghezza indefinita: figli fino a 00 00
    let q = pos;
    while (q < fine && !(b[q] === 0 && b[q + 1] === 0)) { const f = leggiTLV(b, q, fine); nodo.figli.push(f.nodo); q = f.fine; }
    return { nodo, fine: q + 2, inizio };
  }

  function ottetti(n) {
    if (!n.costruito) return n.dati;
    const parti = n.figli.map(ottetti);
    const tot = parti.reduce((s, x) => s + x.length, 0);
    const out = new Uint8Array(tot); let o = 0;
    for (const x of parti) { out.set(x, o); o += x.length; }
    return out;
  }

  function cercaXmlNellaBusta(n) {
    if (n.classe === 0 && n.numero === 4) {                   // OCTET STRING
      const d = ottetti(n);
      if (d.length > 50 && dec(d.subarray(0, Math.min(d.length, 4000)), 'latin1').includes('FatturaElettronica')) return d;
    }
    for (const f of n.figli) { const r = cercaXmlNellaBusta(f); if (r) return r; }
    return null;
  }

  function estraiDaP7m(bytes) {
    let b = bytes;
    // alcuni p7m arrivano codificati in base64 (testo) invece che binari
    if (b[0] !== 0x30) {
      const testo = dec(b, 'latin1').replace(/-----[^-]+-----/g, '').replace(/[^A-Za-z0-9+/=]/g, '');
      const bin = atob(testo);
      b = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    }
    const xml = cercaXmlNellaBusta(leggiTLV(b, 0, b.length).nodo);
    if (!xml) throw new Error('nessuna fattura dentro la firma');
    return xml;
  }

  // ------------------------------------------------------------------ XML
  function testoXml(bytes) {
    const testa = dec(bytes.subarray(0, 200), 'latin1');
    const m = /encoding=["']([\w-]+)["']/i.exec(testa);
    let t = dec(bytes, m ? m[1].toLowerCase() : 'utf-8');
    return t.replace(/^﻿/, '');
  }

  // i tag hanno prefissi diversi a seconda di chi ha creato il file (p:, ns2:, nessuno…)
  const tutti = (el, nome) => (el ? [...el.getElementsByTagNameNS('*', nome)] : []);
  const uno = (el, nome) => tutti(el, nome)[0] || null;
  const val = (el, nome) => { const x = uno(el, nome); return x ? x.textContent.trim() : ''; };
  const num = (s) => { const v = parseFloat(String(s || '').replace(',', '.')); return Number.isFinite(v) ? v : 0; };
  const soggetto = (el) => {
    const ana = uno(el, 'Anagrafica');
    const nome = val(ana, 'Denominazione') || [val(ana, 'Nome'), val(ana, 'Cognome')].filter(Boolean).join(' ');
    const idIva = uno(el, 'IdFiscaleIVA');
    return {
      paese: val(idIva, 'IdPaese') || 'IT',
      piva: val(idIva, 'IdCodice'),
      cf: val(uno(el, 'DatiAnagrafici'), 'CodiceFiscale'),
      nome: nome || '(senza nome)',
      regime: val(el, 'RegimeFiscale'),
    };
  };

  function fattureDaXml(testo, nomeFile) {
    const doc = new DOMParser().parseFromString(testo, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('XML non leggibile');
    const radice = uno(doc, 'FatturaElettronica') || doc.documentElement;
    if (!/FatturaElettronica/.test(radice.localName)) throw new Error('non è una fattura elettronica');
    const testata = uno(radice, 'FatturaElettronicaHeader');
    const cedente = soggetto(uno(testata, 'CedentePrestatore'));
    const cessionario = soggetto(uno(testata, 'CessionarioCommittente'));

    return tutti(radice, 'FatturaElettronicaBody').map((corpo, i, lista) => {
      const gen = uno(corpo, 'DatiGeneraliDocumento');
      const riepiloghi = tutti(corpo, 'DatiRiepilogo').map((r) => ({
        aliquota: num(val(r, 'AliquotaIVA')), natura: val(r, 'Natura'),
        imponibile: num(val(r, 'ImponibileImporto')), imposta: num(val(r, 'Imposta')),
      }));
      const imponibile = riepiloghi.reduce((s, r) => s + r.imponibile, 0);
      const iva = riepiloghi.reduce((s, r) => s + r.imposta, 0);
      const cassa = uno(gen, 'DatiCassaPrevidenziale');
      const totDoc = val(gen, 'ImportoTotaleDocumento');
      return {
        file: nomeFile + (lista.length > 1 ? ` (${i + 1}/${lista.length})` : ''),
        tipoDoc: val(gen, 'TipoDocumento') || 'TD01',
        divisa: val(gen, 'Divisa') || 'EUR',
        data: val(gen, 'Data'),
        numero: val(gen, 'Numero'),
        cedente, cessionario,
        riepiloghi, imponibile, iva,
        totale: totDoc ? num(totDoc) : imponibile + iva,
        ritenuta: tutti(gen, 'DatiRitenuta').reduce((s, r) => s + num(val(r, 'ImportoRitenuta')), 0),
        cassa: cassa ? { tipo: val(cassa, 'TipoCassa'), aliquota: num(val(cassa, 'AlCassa')), importo: num(val(cassa, 'ImportoContributoCassa')) } : null,
        bollo: num(val(uno(gen, 'DatiBollo'), 'ImportoBollo')),
        descrizioni: tutti(corpo, 'DettaglioLinee').slice(0, 8).map((l) => val(l, 'Descrizione')).filter(Boolean),
        scadenze: tutti(corpo, 'DettaglioPagamento').map((d) => ({ data: val(d, 'DataScadenzaPagamento'), importo: num(val(d, 'ImportoPagamento')) })).filter((s) => s.data),
      };
    });
  }

  // ------------------------------------------------------------------ file
  /* I metadati dello SDI (…_MT_001.xml) e le ricevute (_RC_, _NS_, _MC_…)
     sono XML ma non fatture: si riconoscono e si tacciono. */
  const nonFattura = (testo) => !/FatturaElettronica(Header|Body)/.test(testo);

  async function leggiBytes(nome, bytes, profondita = 0) {
    const fatture = [], errori = [];
    const basso = nome.toLowerCase();
    try {
      if (basso.endsWith('.zip') || (bytes[0] === 0x50 && bytes[1] === 0x4b)) {
        if (profondita > 2) return { fatture, errori };
        for (const f of await leggiZip(bytes)) {
          const r = await leggiBytes(f.nome, f.dati, profondita + 1);
          fatture.push(...r.fatture); errori.push(...r.errori);
        }
      } else if (basso.endsWith('.p7m')) {
        fatture.push(...fattureDaXml(testoXml(estraiDaP7m(bytes)), nome));
      } else if (basso.endsWith('.xml')) {
        const t = testoXml(bytes);
        if (!nonFattura(t)) fatture.push(...fattureDaXml(t, nome));
      }
      // altri file (pdf, txt…) dentro uno zip: ignorati senza fare rumore
    } catch (e) {
      errori.push({ file: nome, errore: e.message || String(e) });
    }
    return { fatture, errori };
  }

  async function leggiFile(listaFile) {
    const fatture = [], errori = [];
    for (const f of listaFile) {
      const r = await leggiBytes(f.name, new Uint8Array(await f.arrayBuffer()));
      fatture.push(...r.fatture); errori.push(...r.errori);
    }
    return { fatture, errori };
  }

  window.FatturaPA = { leggiFile, leggiBytes, _interni: { fattureDaXml, estraiDaP7m, leggiZip } };
})();
