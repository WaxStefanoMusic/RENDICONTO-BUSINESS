'use strict';
/* ==========================================================================
   Rigenera renderer/core.js e renderer/styles.css estraendoli da
   ../rendiconto.html, riapplicando le tre modifiche necessarie al desktop.
   Si modifica SEMPRE rendiconto.html, mai i file generati.
   ========================================================================== */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'rendiconto.html');
const OUT = path.join(__dirname, 'renderer');

const html = fs.readFileSync(SRC, 'utf8');

const css = /<style>\r?\n([\s\S]*?)\r?\n<\/style>/.exec(html);
const js  = /<script>\r?\n([\s\S]*?)\r?\n<\/script>/.exec(html);
if (!css || !js) { console.error('rendiconto.html: <style> o <script> non trovati'); process.exit(1); }

let core = js[1];
let patch = 0;

// FSA deve essere riassegnabile: nel desktop vale sempre true
const a1 = "const FSA = 'showDirectoryPicker' in window;";
if (core.includes(a1)) { core = core.replace(a1, "let FSA = 'showDirectoryPicker' in window;"); patch++; }

// l'avvio lo comanda desktop.js, dopo aver sostituito le funzioni
const a2 = 'async function init(){';
if (core.includes(a2)) { core = core.replace(a2, 'window.__init = async function init(){'); patch++; }

/* Nel browser init() parte da sola; nel desktop l'avvio lo comanda desktop.js.
   L'ancora è la chiamata in fondo al file: legarsi al testo che la precede
   rendeva la sostituzione fragile a ogni ritocco del messaggio di avviso. */
const a3 = /\binit\(\);\s*$/;
if (a3.test(core)) { core = core.replace(a3, 'if(!window.__DESKTOP__) window.__init();'); patch++; }

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'styles.css'), css[1], 'utf8');
fs.writeFileSync(path.join(OUT, 'core.js'), core, 'utf8');
console.log(`rigenerati styles.css (${css[1].length} car.) e core.js (${core.length} car.) — ${patch}/3 patch applicate`);
