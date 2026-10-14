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

if (!failed) console.log(`check ok: ${scripts.length} script block(s) parse, ${new Set(refs).size} exercise refs resolve`);

// ---------------------------------------------------------------------------
// Figure rig: every exercise must have an animation, and every frame of every
// animation must be anatomically plausible. The engine is pure geometry, so it
// runs here without a DOM. Tolerances are in SVG units (limbs are drawn 5 wide).
const eStart = src.indexOf('/* FIGURE ENGINE START */'), eEnd = src.indexOf('/* FIGURE ENGINE END */');
if (eStart < 0 || eEnd < 0) { console.error('figure engine markers missing'); process.exit(1); }
const fx = {};
vm.runInNewContext(src.slice(eStart, eEnd) + '; this.out = {MOVES, pose, frameOf, BONE, G, FLOOR, ARM, LEG};', fx);
const { MOVES, pose, frameOf, BONE, G, FLOOR, ARM, LEG } = fx.out;
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
