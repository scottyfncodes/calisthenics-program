// Static checks for the single-file app (there is no build or type system):
// every inline <script> must parse, and every exercise referenced by the
// program must exist in the EX library.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
if (!scripts.length) throw new Error('no inline <script> found');

let failed = false;
scripts.forEach((src, i) => {
  try { new vm.Script(src, { filename: `index.html <script #${i + 1}>` }); }
  catch (e) { failed = true; console.error(`Syntax error: ${e.message}`); }
});

// Evaluate just the data definitions in a sandbox and cross-check references.
const src = scripts[0];
const dataEnd = src.indexOf('const WORK_BASE');
const ctx = {};
vm.runInNewContext(src.slice(0, dataEnd) + '; this.out = {EX, PHASES, WARMUPS, COOLDOWNS, MOBILITY_DAY, REST_DAY};', ctx);
const { EX, PHASES, WARMUPS, COOLDOWNS, MOBILITY_DAY, REST_DAY } = ctx.out;
const refs = [
  ...PHASES.flatMap(p => Object.values(p.days).flatMap(d => d.circuit)),
  ...Object.values(WARMUPS).flat(), ...Object.values(COOLDOWNS).flat(),
  ...MOBILITY_DAY, ...REST_DAY,
];
const missing = [...new Set(refs.filter(id => !EX[id]))];
if (missing.length) { failed = true; console.error('Unknown exercise ids:', missing.join(', ')); }

if (failed) process.exit(1);
console.log(`check ok: ${scripts.length} script block(s) parse, ${new Set(refs).size} exercise refs resolve`);
