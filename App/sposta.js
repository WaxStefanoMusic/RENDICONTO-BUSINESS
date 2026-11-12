'use strict';
/* ==========================================================================
   Spostamento della cartella dei documenti.

   Sta in un file a parte per un motivo serio: questo codice ha già cancellato
   dei dati veri. Isolato, si può collaudare con Node puro — senza avviare
   l'app — e infatti «sposta-cartella-test.js» lo mette alla prova sui casi
   che avevano fatto danno.

   I due errori originali, ora impossibili per costruzione:
   1. destinazione DENTRO l'origine: creandola la si ritrovava leggendo
      l'origine e si ricorreva all'infinito (Documenti\Documenti\Documenti…);
   2. `rmSync(origine, {recursive:true})` alla fine: portava via qualunque
      cosa ci fosse nella cartella, non solo i documenti.
   ========================================================================== */
const fs = require('fs');
const path = require('path');

const risolto = p => path.resolve(String(p || '')).toLowerCase();

/** i due percorsi indicano la stessa cartella? */
function stessaCartella(a, b) { return risolto(a) === risolto(b); }

/** `figlio` sta dentro `padre`? (falso se sono la stessa cartella) */
function dentroA(figlio, padre) {
  const f = risolto(figlio), p = risolto(padre);
  return f !== p && f.startsWith(p + path.sep);
}

/** primo nome libero: «bolletta.pdf» → «bolletta (2).pdf» */
function uniquePath(p) {
  if (!fs.existsSync(p)) return p;
  const d = path.dirname(p), e = path.extname(p), b = path.basename(p, e);
  for (let i = 2; i < 1000; i++) { const c = path.join(d, `${b} (${i})${e}`); if (!fs.existsSync(c)) return c; }
  return path.join(d, `${b}-${Date.now()}${e}`);
}

/** perché uno spostamento non si può fare; null se si può */
function perchePuoiNo(daDir, aDir) {
  if (stessaCartella(daDir, aDir)) return 'è già la cartella attuale';
  if (dentroA(aDir, daDir)) return 'la nuova cartella sta dentro a quella attuale';
  return null;
}

/* Sposta i documenti da una cartella all'altra. Ritorna [{da,a}].
 *
 * `proprie` è l'elenco delle sottocartelle che appartengono all'app (una per
 * tab, più «Altri documenti»). SOLO quelle vengono spostate.
 *
 * Questo è il punto più importante di tutto il file. La cartella dei documenti
 * può essere una qualsiasi: la radice di un disco, una cartella di lavoro, la
 * cartella di un progetto. Spostare «tutto quello che c'è dentro» ha già
 * portato via, in un caso reale, un intero progetto — sorgenti compresi.
 * Quello che l'app non ha creato non si tocca: resta dov'è.
 *
 * Con `proprie === 'tutto'` si sposta l'intera cartella: vale SOLO per la
 * vecchia cartella nascosta dentro i dati dell'app, che è interamente sua.
 * Dimenticando l'argomento non si sposta nulla: il predefinito è il caso
 * innocuo, non quello che fa danni.
 */
function spostaDocumenti(daDir, aDir, proprie) {
  const mosse = [];
  if (!fs.existsSync(daDir)) return mosse;
  const no = perchePuoiNo(daDir, aDir);
  if (no === 'è già la cartella attuale') return mosse;
  if (no) throw new Error(no);

  const cammina = (src, dst, livello) => {
    if (livello > 24) return;                       // rete di sicurezza
    fs.mkdirSync(dst, { recursive: true });
    let voci = [];
    try { voci = fs.readdirSync(src, { withFileTypes: true }); } catch (_) { return; }
    for (const e of voci) {
      const s = path.join(src, e.name), d = path.join(dst, e.name);
      if (stessaCartella(s, aDir)) continue;        // mai rientrare nella destinazione
      if (e.isDirectory()) cammina(s, d, livello + 1);
      else if (e.isFile() && !e.name.startsWith('.')) {
        const dest = uniquePath(d);
        try { fs.renameSync(s, dest); }
        catch (_) { try { fs.copyFileSync(s, dest); fs.unlinkSync(s); } catch (_2) { continue; } }
        mosse.push({ da: s, a: dest });
      }
    }
  };

  const svuota = dir => {
    let voci = [];
    try { voci = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
    for (const e of voci) if (e.isDirectory()) svuota(path.join(dir, e.name));
    try { if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir); } catch (_) {}
  };

  if (proprie === 'tutto') {                        // cartella interamente dell'app
    cammina(daDir, aDir, 0);
    svuota(daDir);
    return mosse;
  }

  fs.mkdirSync(aDir, { recursive: true });
  const volute = new Set((Array.isArray(proprie) ? proprie : []).filter(Boolean).map(n => String(n).toLowerCase()));
  let voci = [];
  try { voci = fs.readdirSync(daDir, { withFileTypes: true }); } catch (_) { return mosse; }
  for (const e of voci) {
    if (!e.isDirectory()) continue;                 // i file sciolti non sono nostri
    if (!volute.has(e.name.toLowerCase())) continue; // né le cartelle di altri
    const s = path.join(daDir, e.name), d = path.join(aDir, e.name);
    if (stessaCartella(s, aDir)) continue;
    cammina(s, d, 1);
    svuota(s);
  }
  // la cartella di partenza si toglie solo se è rimasta completamente vuota
  try { if (fs.readdirSync(daDir).length === 0) fs.rmdirSync(daDir); } catch (_) {}
  return mosse;
}

module.exports = { stessaCartella, dentroA, uniquePath, perchePuoiNo, spostaDocumenti };
