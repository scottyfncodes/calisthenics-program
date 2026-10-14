// Static checks (there is no build or type system): every inline <script> in
// both pages and every shared script must parse, every exercise referenced by
// the classic program must exist in the EX library, and every exercise must
// carry the taxonomy the workout planner relies on.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
let failed = false;
const fail = (...m) => { failed = true; console.error(...m); };

const inline = f => [...read(f).matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const sources = [];
for (const page of ['index.html', 'program.html']) {
  const s = inline(page);
  if (!s.length) fail(`${page}: no inline <script> found`);
  s.forEach((src, i) => sources.push([`${page} <script #${i + 1}>`, src]));
}
const shared = fs.readdirSync(path.join(root, 'js')).filter(f => f.endsWith('.js'));
shared.forEach(f => sources.push([`js/${f}`, read(`js/${f}`)]));
sources.forEach(([name, src]) => {
  try { new vm.Script(src, { filename: name }); }
  catch (e) { fail(`Syntax error in ${name}: ${e.message}`); }
});

const { EX, PATTERNS, EQUIPMENT, RESTRICTIONS } = require('../js/exercises.js');

// classic program: evaluate just its data definitions and cross-check references
const prog = inline('program.html')[0];
const ctx = { EX };
vm.runInNewContext(prog.slice(0, prog.indexOf('const WORK_BASE')) + '; this.out = {PHASES, WARMUPS, COOLDOWNS, MOBILITY_DAY, REST_DAY};', ctx);
const { PHASES, WARMUPS, COOLDOWNS, MOBILITY_DAY, REST_DAY } = ctx.out;
const refs = [
  ...PHASES.flatMap(p => Object.values(p.days).flatMap(d => d.circuit)),
  ...Object.values(WARMUPS).flat(), ...Object.values(COOLDOWNS).flat(),
  ...MOBILITY_DAY, ...REST_DAY,
];
const missing = [...new Set(refs.filter(id => !EX[id]))];
if (missing.length) fail('Unknown exercise ids:', missing.join(', '));

// taxonomy: every field the planner reads must be present and valid
for (const [id, e] of Object.entries(EX)) {
  const bad = [];
  if (!e.name || !e.type || !e.cue) bad.push('name/type/cue');
  if (!Array.isArray(e.cues) || !e.cues.length) bad.push('cues');
  if (!['main', 'cond', 'warm', 'cool'].includes(e.role)) bad.push('role');
  if (!Array.isArray(e.pat) || !e.pat.length || e.pat.some(p => !PATTERNS[p])) bad.push('pat');
  if (!(e.lvl >= 1 && e.lvl <= 5)) bad.push('lvl');
  if (!Array.isArray(e.eq) || e.eq.some(q => !EQUIPMENT[q])) bad.push('eq');
  if (!Array.isArray(e.stress) || e.stress.some(q => !RESTRICTIONS[q])) bad.push('stress');
  if (e.m === 'reps') { if (!(e.reps && e.reps[0] > 0 && e.reps[1] >= e.reps[0] && e.tempo > 0)) bad.push('reps/tempo'); }
  else if (e.m === 'time') { if (!(e.sec && e.sec[0] > 0 && e.sec[1] >= e.sec[0])) bad.push('sec'); }
  else bad.push('m');
  if (bad.length) fail(`exercise ${id}: bad ${bad.join(', ')}`);
}

if (!failed) console.log(`check ok: ${sources.length} script(s) parse, ${new Set(refs).size} program refs resolve, ${Object.keys(EX).length} exercises carry a full taxonomy`);

// ---------------------------------------------------------------------------
// Figure rig: every exercise must have an animation, and every frame of every
// animation must be anatomically plausible. The engine is pure geometry, so it
// runs here without a DOM. Tolerances are in SVG units (limbs are drawn 5 wide).
const { MOVES, pose, frameOf, BONE, G, FLOOR, ARM, LEG } = require('../js/figure.js');
const wrap = a => ((a % 360) + 540) % 360 - 180;
const ang = (a, b) => Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI;
const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const TOL = {
  bone: 0.05,        // bone length drift (rigid limbs)
  reach: 0.75,       // planted hand/foot vs its target
  reachProj: 1.2,    // out-of-plane (foreshortened) limb vs its target
  floor: 1.5,        // joint below the floor's centre line
  pin: 0.6,          // drift of a declared contact point (hand, toe, knee) while planted
  speed: 700,        // joint speed, units/s: catches snaps (explosive arm swings peak ~640)
};
// joint ranges in degrees, measured in the body's own frame (see the engine's "face")
const RANGE = { knee: [-3, 165], elbow: [-165, 3], hip: [-35, 165], shoulder: [-75, 195], ankle: [-50, 95], neck: 70 };

const usedTypes = new Set(Object.values(EX).map(e => e.type));
const noAnim = [...usedTypes].filter(t => !MOVES[t]);
if (noAnim.length) { failed = true; console.error('Exercise types with no animation:', noAnim.join(', ')); }

const N = 240;
let rigFails = 0;
for (const [type, def] of Object.entries(MOVES)) {
  const issues = new Map(), flag = (k, v) => { if (!issues.has(k)) issues.set(k, v); };
  const face = def.face === undefined ? 1 : def.face, side = (def.view || 'side') === 'side';
  const frames = [];
  for (let i = 0; i < N; i++) {
    const ph = i / N, q = pose(def, ph), at = ph.toFixed(3);
    frames.push([ph, q]);
    for (const id of ['aN', 'aF', 'lN', 'lF']) {
      const lb = q.limbs[id], [r, m, e] = lb.pts, arm = id[0] === 'a';
      if ([r, m, e].some(p => !isFinite(p[0]) || !isFinite(p[1]))) { flag('NaN ' + id, at); continue; }
      if (!lb.proj) {
        const a = arm ? BONE.ua : BONE.th, b = arm ? BONE.fa : BONE.sh;
        if (Math.abs(dist(r, m) - a) > TOL.bone || Math.abs(dist(m, e) - b) > TOL.bone) flag('bone length ' + id, at);
      } else if (dist(r, m) + dist(m, e) > (arm ? ARM : LEG) + TOL.bone) flag('projected limb too long ' + id, at);
      if (lb.T && dist(e, lb.T) > (lb.proj ? TOL.reachProj : TOL.reach)) flag('contact missed ' + id, at);
      if (side) [m, e, lb.toe].forEach(p => { if (p && p[1] > G + TOL.floor) flag('through floor ' + id, at); });
      if (side && face && !lb.proj && lb.u !== undefined) {
        const bend = face * wrap(lb.l - lb.u), j = arm ? RANGE.elbow : RANGE.knee;
        if (bend < j[0] || bend > j[1]) flag((arm ? 'elbow ' : 'knee ') + id, at + ' ' + bend.toFixed(0));
        let fl = -face * wrap(lb.u - ang(q.S, q.H)); if (arm && fl < -90) fl += 360;
        const jr = arm ? RANGE.shoulder : RANGE.hip;
        if (fl < jr[0] || fl > jr[1]) flag((arm ? 'shoulder ' : 'hip ') + id, at + ' ' + fl.toFixed(0));
        if (lb.f !== undefined) { const ak = face * wrap(lb.f - lb.l) + 90; if (ak < RANGE.ankle[0] || ak > RANGE.ankle[1]) flag('ankle ' + id, at + ' ' + ak.toFixed(0)); }
      }
    }
    if (side && q.head[1] > FLOOR - BONE.headR + TOL.floor) flag('head through floor', at);
    if (def.ceil !== undefined && q.head[1] - BONE.headR < def.ceil + 1) flag('head through prop', at);
    if (side && Math.abs(wrap(q.p.n || 0)) > RANGE.neck) flag('neck', at);
  }
  for (const [spec, a = 0, b = 1] of def.pins || []) {
    const [id, pt] = spec.split('.'), get = q => { const lb = q.limbs[id]; return pt === 'toe' ? lb.toe : pt === 'knee' ? lb.pts[1] : lb.pts[2]; };
    const win = frames.filter(([ph]) => ph >= a && ph <= b), p0 = get(win[0][1]);
    const drift = Math.max(...win.map(([, q]) => dist(get(q), p0)));
    if (drift > TOL.pin) flag('contact slides ' + spec, drift.toFixed(2));
  }
  const pts = q => [q.H, q.S, q.head, ...['aN', 'aF', 'lN', 'lF'].flatMap(id => q.limbs[id].pts)].map(p => [p[0] - q.cam, p[1]]);
  let fast = 0;
  frames.forEach(([, q], i) => { const a = pts(q), b = pts(frames[(i + 1) % N][1]); a.forEach((p, j) => { fast = Math.max(fast, dist(p, b[j])); }); });
  if (fast / (def.dur / N) > TOL.speed) flag('snap', (fast / (def.dur / N)).toFixed(0) + ' u/s');
  if (!(def.still >= 0 && def.still < 1)) flag('still phase', def.still);
  if (!frameOf(def).every(isFinite)) flag('frame', 'not finite');
  if (issues.size) { rigFails++; console.error(`rig ${type}: ` + [...issues].map(([k, v]) => `${k} @ ${v}`).join('; ')); }
}
if (rigFails) failed = true;
if (failed) process.exit(1);
console.log(`rig ok: ${Object.keys(MOVES).length} animations x ${N} frames pass bone, contact, floor and joint-range checks`);
