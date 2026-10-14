/* Stick-figure engine shared by the on-demand app (index.html) and the classic
   12-week program (program.html). Pure geometry: scripts/check.js runs it in Node.
   Loaded as a classic script; everything here is a global. */
/* FIGURE ENGINE START */
/* One skeleton for every exercise. Bones have fixed lengths, so a figure can
   never stretch, shrink or come apart; each move is a set of key poses and
   the rig is solved per frame:
   - joints are placed by forward kinematics from the hip, or
   - a hand or foot that is planted on something is given as a fixed target
     and the elbow/knee is solved (two-bone IK), so contacts don't slide.
   Coordinates are SVG user units (y down), angles in degrees (0 = +x,
   90 = straight down). Side views are drawn with the far-side limbs dimmed.
   "face" is the body's handedness on screen: +1 for a figure standing and
   facing right (or that pose rotated: supine head-left, prone head-right),
   -1 for its mirror image. Knees and elbows bend the correct way round for
   that frame, and scripts/check.js verifies it for every frame of every move. */
const BONE = {torso:25, neck:9, headR:6.5, ua:14, fa:16, th:19, sh:19, ft:6};
const ARM = BONE.ua + BONE.fa, LEG = BONE.th + BONE.sh;
const FLOOR = 90, G = 87.5;            // G: centre line of a limb resting on the floor
const HEAD_DOWN = FLOOR - BONE.headR;  // head centre when the head rests on the floor
const STAND = G - LEG + 0.5;           // standing hip height, knees soft (never locked)

const D2R = Math.PI/180;
const dir = a => [Math.cos(a*D2R), Math.sin(a*D2R)];
const add = (p, a, len) => { const v = dir(a); return [p[0]+v[0]*len, p[1]+v[1]*len]; };
const ang = (a, b) => Math.atan2(b[1]-a[1], b[0]-a[0])/D2R;
const dist = (a, b) => Math.hypot(b[0]-a[0], b[1]-a[1]);
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const lerp = (a, b, k) => a + (b-a)*k;
const wrap = a => ((a % 360) + 540) % 360 - 180;
const lerpAng = (a, b, k) => a + wrap(b-a)*k;
// bisection root-finder for the geometry helpers below (fn must change sign on [lo,hi])
function solve(fn, lo, hi){
  let flo = fn(lo);
  for(let i=0;i<48;i++){ const mid=(lo+hi)/2, fm=fn(mid); if((fm<0)===(flo<0)){ lo=mid; flo=fm; } else hi=mid; }
  return (lo+hi)/2;
}
// two-bone IK: root, target, bone lengths, bend side s (+1/-1) -> [upper, lower] angles
function ikAngles(root, target, a, b, s){
  const d = clamp(dist(root, target), Math.abs(a-b)+0.01, a+b-0.001);
  const base = ang(root, target);
  const A = Math.acos(clamp((a*a + d*d - b*b)/(2*a*d), -1, 1))/D2R;
  const u = base + s*A, m = add(root, u, a);
  return [u, ang(m, target)];
}
// circle-circle intersection: the higher (smaller y) point at distance ra from A and rb from B
function meetUp(A, ra, B, rb){
  const d = dist(A, B), x = (ra*ra - rb*rb + d*d)/(2*d), h = Math.sqrt(Math.max(0, ra*ra - x*x));
  const ux = (B[0]-A[0])/d, uy = (B[1]-A[1])/d;
  const p1 = [A[0] + ux*x - uy*h, A[1] + uy*x + ux*h], p2 = [A[0] + ux*x + uy*h, A[1] + uy*x - ux*h];
  return p1[1] < p2[1] ? p1 : p2;
}

/* Rigid straight body (plank line) from a planted toe or ankle. al = direction
   from the feet toward the head. Returns params for the hip, torso and legs. */
function plankFromToe(toe, al, face){
  const fd = al + 90*face, ank = add(toe, fd, -BONE.ft);
  return plankFromAnkle(ank, al, fd);
}
function plankFromAnkle(ank, al, fd){
  const H = add(ank, al, LEG);
  return {hx:H[0], hy:H[1], t:al, 'lN.u':al+180, 'lN.l':al+180, 'lF.u':al+180, 'lF.l':al+180, 'lN.f':fd, 'lF.f':fd};
}
const shoulderOf = p => add([p.hx, p.hy], p.t, BONE.torso);
// body line from a kneeling knee: knee on the floor, hip and shoulders in line with it
function plankFromKnee(K, al, shin){
  const H = add(K, al, BONE.th);
  return {hx:H[0], hy:H[1], t:al, 'lN.u':al+180, 'lN.l':shin, 'lF.u':al+180, 'lF.l':shin};
}
// find the body angle that puts the shoulder at height y (pivoting on the feet)
const alForShoulderY = (mk, y, lo, hi) => solve(al => shoulderOf(mk(al))[1] - y, lo, hi);
const alForReach = (mk, P, d, lo, hi) => solve(al => dist(shoulderOf(mk(al)), P) - d, lo, hi);

// ---- key-pose helpers ----
const L = (id, u, l) => ({[id+'.u']:u, [id+'.l']:l===undefined ? u : l});         // limb by angles
const T = (id, x, y, extra) => Object.assign({[id+'.x']:x, [id+'.y']:y}, extra);  // limb end target
const K = (at, ...o) => Object.assign({}, ...o, {_t:at});                           // key pose at phase `at`
const both = (u, l) => Object.assign(L('aN', u, l), L('aF', u, l));
const legsTo = (xN, yN, xF, yF) => Object.assign(T('lN', xN, yN), T('lF', xF, yF));
const toeAt = (id, x, y, f) => ({[id+'.tx']:x, [id+'.ty']:y, [id+'.f']:f});    // foot placed by its toe
const EASE = {
  io: k => 0.5 - 0.5*Math.cos(Math.PI*k),
  lin: k => k,
  out: k => Math.sin(k*Math.PI/2),
  in: k => 1 - Math.cos(k*Math.PI/2),
};

/* Every key holds the full parameter set (missing values are carried
   forward from the previous key), so interpolation is a plain lerp. */
function prepKeys(def){
  if(def._keys || !def.keys) return;
  const names = new Set(); def.keys.forEach(k => Object.keys(k).forEach(n => n!=='_t' && n!=='e' && names.add(n)));
  let prev = {};
  const filled = def.keys.map(k => (prev = Object.assign({}, prev, k)));
  // anything a later key introduces is back-filled into the earlier keys
  for(let i=filled.length-2;i>=0;i--) names.forEach(n => { if(filled[i][n]===undefined) filled[i][n] = filled[i+1][n]; });
  def._keys = filled;
}
function sample(def, ph){
  if(def.proc) return def.proc(ph);
  prepKeys(def);
  const ks = def._keys, n = ks.length;
  let i = n-1;
  for(let j=0;j<n;j++){ if(ks[j]._t > ph){ i = j-1; break; } }
  if(i<0) i = n-1;
  const a = ks[i], b = ks[(i+1)%n];
  const t1 = i===n-1 ? 1 + ks[0]._t : b._t;
  const span = t1 - a._t;
  const k = span>0 ? (EASE[a.e||'io'])(clamp((ph - a._t)/span, 0, 1)) : 0;
  const p = {};
  for(const name in a){ if(name==='_t'||name==='e') continue;
    const va = a[name], vb = b[name];
    p[name] = (typeof va==='number' && typeof vb==='number') ? lerp(va, vb, k) : va;
  }
  return p;
}

function solveLimb(p, id, root, a, b, s, view){
  const g = k => p[id+'.'+k];
  if(g('pts')) return {pts:g('pts'), proj:true};
  const kk = g('k')===undefined ? 1 : g('k');
  a *= kk; b *= kk;
  if(g('tx')!==undefined){ const an = add([g('tx'), g('ty')], g('f'), -BONE.ft); p[id+'.x'] = an[0]; p[id+'.y'] = an[1]; }
  const tx = g('x');
  if(tx!==undefined && (g('str') || ((view==='front'||view==='top') && id[0]==='l'))){
    // out-of-plane limb: drawn straight to its target (foreshortened)
    const T2 = [tx, g('y')], d = Math.min(dist(root, T2), a+b), an = ang(root, T2);
    const m = add(root, an, d*a/(a+b));
    return {pts:[root, m, add(root, an, d)], u:an, l:an, T:T2, proj:true};
  }
  let u = g('u'), l = g('l');
  let T2 = null;
  if(tx!==undefined){
    T2 = [tx, g('y')];
    const w = g('w')===undefined ? 1 : g('w');
    const sg = g('s')===undefined ? s : g('s');
    const [iu, il] = ikAngles(root, T2, a, b, sg);
    if(u===undefined || w>=1){ u = iu; l = il; }
    else if(w>0){ u = lerpAng(u, iu, w); l = lerpAng(l, il, w); }
    if(w<1) T2 = null;   // only a fully weighted target is a contact
  }
  if(l===undefined) l = u;
  const m = add(root, u, a), e = add(m, l, b);
  return {pts:[root, m, e], u, l, T:T2, proj:kk<1};
}

function pose(def, ph){
  let p = sample(def, ph);
  if(def.pre) p = def.pre(p, ph) || p;
  const face = def.face===undefined ? 1 : def.face, view = def.view || 'side';
  const sg = Object.assign({aN:face, aF:face, lN:-face, lF:-face}, def.sgn);
  const H = [p.hx, p.hy], S = add(H, p.t, BONE.torso);
  const head = add(S, p.t + (p.n||0), BONE.neck);
  let rN = S, rF = S;
  if(p.sx || p.sy) rN = rF = [S[0]+(p.sx||0), S[1]+(p.sy||0)];
  if(def.bar){ rN = add(S, p.bt||0, def.bar/2); rF = add(S, p.bt||0, -def.bar/2); }
  const out = {H, S, head, c:p.c||0, cam:p.cam||0, face, view, p, rN, rF, limbs:{}};
  out.limbs.aN = solveLimb(p, 'aN', rN, BONE.ua, BONE.fa, sg.aN, view);
  out.limbs.aF = solveLimb(p, 'aF', rF, BONE.ua, BONE.fa, sg.aF, view);
  out.limbs.lN = solveLimb(p, 'lN', H, BONE.th, BONE.sh, sg.lN, view);
  out.limbs.lF = solveLimb(p, 'lF', H, BONE.th, BONE.sh, sg.lF, view);
  ['lN','lF'].forEach(id => {
    const lb = out.limbs[id];
    if(view!=='side' || def.nofeet || lb.l===undefined) return;
    const f = p[id+'.f']!==undefined ? p[id+'.f'] : lb.l - 90*face;   // default: neutral ankle
    lb.f = f; lb.toe = add(lb.pts[2], f, BONE.ft);
  });
  return out;
}

/* ---- move library: one entry per animation type ----
   dur: seconds per loop · still: phase shown when motion is reduced
   vb: viewBox when a pose needs more room · props: static scenery */
const SIDE_HANG = both(96, 84);           // arms hanging, elbows soft
const standLegs = (x, xF) => legsTo(x, G, xF===undefined ? x : xF, G);
const FLAT = {'lN.f':0, 'lF.f':0};
const pushupDef = (o) => {
  // Rigid plank pivoting on the toes; hands planted, elbows track back toward the feet.
  const toe = [o.toe, G], mk = al => plankFromToe(toe, al, -1);
  const alTop = alForShoulderY(mk, G - o.top, 181, 230);
  const handX = shoulderOf(mk(alTop))[0] + (o.hand||0);
  const alBot = alForShoulderY(mk, G - o.bottom, 175, alTop);
  const hands = Object.assign(T('aN', handX, G), T('aF', handX, G));
  return {face:-1, dur:o.dur||2.2, still:0.45, props:o.props, keys:[
    K(0, {al:alTop}, hands), K(0.12, {al:alTop}), K(0.5, {al:alBot}), K(0.58, {al:alBot})],
    pre:p => Object.assign(p, mk(p.al)),
    pins:[['aN.end'],['aF.end'],['lN.toe']]};
};
const hold = (def) => Object.assign({still:0}, def);

const MOVES = {
  /* ---------- warm-up ---------- */
  // Big forward arm circles, straight arms. Behind the body the arm swings out
  // to the side (circumduction), so that half of the circle is foreshortened.
  armcircle:{dur:2.6, still:0.3, keys:[K(0,{e:'lin', a:0}), K(0.999,{a:360})],
    pre:p => {
      const th = 90 - p.a, k = p.a<=180 ? 1 : 1 - 0.45*Math.sin((p.a-180)*D2R);
      return Object.assign(p, {hx:50, hy:STAND, t:-90}, standLegs(50), FLAT, both(th, th), {'aN.k':k, 'aF.k':k});
    }},
  // Backward shoulder rolls: the shoulder girdle traces a small circle
  // (up, back, down) while the arms hang relaxed.
  shoulderroll:{dur:1.8, still:0.25, keys:[K(0,{e:'lin', a:0}), K(0.999,{a:360})],
    pre:p => Object.assign(p, {hx:50, hy:STAND, t:-90, sx:2.4*Math.cos(-p.a*D2R) , sy:2.4*Math.sin(-p.a*D2R)}, standLegs(50), FLAT, SIDE_HANG)},
  march:{dur:1.3, still:0.25, keys:[
      K(0, {lN:0, lF:0}, L('aN',90,78), L('aF',90,78)), K(0.25, {lN:1}, L('aN',112,92), L('aF',68,48)),
      K(0.5, {lN:0, lF:0}, L('aN',90,78), L('aF',90,78)), K(0.75, {lF:1}, L('aN',68,48), L('aF',112,92))],
    pre:p => swingLegs(Object.assign(p, {hx:50, hy:STAND, t:-90}), 50, {u:42, l:100, f:28})},
  highkneeseasy:{dur:1.0, still:0.25, keys:[
      K(0, {lN:0, lF:0, b:0}, L('aN',90,20), L('aF',90,20)), K(0.25, {lN:1, b:1}, L('aN',125,50), L('aF',62,-22)),
      K(0.5, {lN:0, lF:0, b:0}, L('aN',90,20), L('aF',90,20)), K(0.75, {lF:1, b:1}, L('aN',62,-22), L('aF',125,50))],
    pre:p => swingLegs(Object.assign(p, {hx:50, hy:STAND-1-1.5*p.b, t:-87}), 50, {u:22, l:110, f:40}, 25)},
  highknees:{dur:0.62, still:0.25, keys:[
      K(0, {lN:0, lF:0, b:0}, L('aN',90,5), L('aF',90,5)), K(0.25, {lN:1, b:1}, L('aN',130,45), L('aF',55,-30)),
      K(0.5, {lN:0, lF:0, b:0}, L('aN',90,5), L('aF',90,5)), K(0.75, {lF:1, b:1}, L('aN',55,-30), L('aF',130,45))],
    pre:p => swingLegs(Object.assign(p, {hx:50, hy:STAND-2.6-1.5*p.b, t:-84}), 50, {u:2, l:100, f:55}, 32)},
  // Front view. Jumping jack: feet and arms open together, land soft, close.
  jumpingjack:{view:'front', face:0, dur:0.9, still:0.5, keys:[
      K(0, {hy:STAND+2, w:3, lift:0}, L('aN',82), L('aF',98)),
      K(0.14, {hy:STAND, w:3, lift:1.5}),
      K(0.3, {hy:STAND-3, w:9, lift:3}, L('aN',2), L('aF',178)),
      K(0.48, {hy:G-Math.sqrt(LEG*LEG-15*15)+1.5, w:15, lift:0}, L('aN',-78), L('aF',258)),
      K(0.62, {hy:G-Math.sqrt(LEG*LEG-15*15), w:15, lift:1.5}),
      K(0.8, {hy:STAND-3, w:9, lift:3}, L('aN',2), L('aF',178))],
    pre:p => Object.assign(p, {hx:50, t:-90}, legsTo(50+p.w, G-p.lift, 50-p.w, G-p.lift))},
  // Star jump: dip into a quarter squat, explode up into an X in the air,
  // bring everything back in and land feet together, soft.
  starjump:{view:'front', face:0, dur:1.5, still:0.42, keys:[
      K(0, {hy:STAND, w:3, lift:0}, L('aN',82), L('aF',98)),
      K(0.22, {hy:STAND+7, w:4, lift:0}, L('aN',100), L('aF',80)),
      K(0.36, {hy:STAND-1, w:4, lift:3}, L('aN',20), L('aF',160)),
      K(0.47, {hy:STAND-12, w:14, lift:14}, L('aN',-38), L('aF',218)),
      K(0.6, {hy:STAND-5, w:5, lift:5}, L('aN',60), L('aF',120)),
      K(0.7, {hy:STAND+6, w:4, lift:0}, L('aN',82), L('aF',98)),
      K(0.85, {hy:STAND, w:3, lift:0})],
    pre:p => Object.assign(p, {hx:50, t:-90}, legsTo(50+p.w, G-p.lift, 50-p.w, G-p.lift))},
  // Hip circles, front view: hips trace the circle (seen as a side-to-side
  // sway), feet planted, upper body counter-balances, hands on hips.
  hipcircle:{view:'front', face:0, dur:3.2, still:0, sgn:{aN:-1, aF:1}, keys:[K(0,{e:'lin', a:0}), K(0.999,{a:360})],
    pre:p => {
      const dx = 4.5*Math.cos(p.a*D2R), H = [50+dx, STAND+0.8+0.6*Math.sin(p.a*D2R)];
      return Object.assign(p, {hx:H[0], hy:H[1], t:-90-9*Math.cos(p.a*D2R)}, legsTo(56, G, 44, G),
        T('aN', H[0]+6, H[1]-2), T('aF', H[0]-6, H[1]-2));
    }},
  // Cat-cow on all fours (head left): hands and knees stay planted, only the
  // spine moves — rounded up with the head dropped, then dipped with the head up.
  catcow:Object.assign(quadDef(30), {dur:5, still:0.25, keys:[
      K(0, {c:0, n:0}), K(0.25, {c:-6, n:-38}), K(0.4, {c:-6, n:-38}), K(0.75, {c:4.5, n:22}), K(0.9, {c:4.5, n:22})]}),
  // Bird dog: reach the opposite arm and leg out long, level with the back,
  // hold, return; then the other pair. Hips and shoulders stay put.
  birddog:Object.assign(quadDef(34), {dur:5, still:0.25, keys:[
      K(0, {wN:1, wF:1, lnU:0, lfU:0}, L('aN',182), L('aF',182), L('lN',-4), L('lF',-4)),
      K(0.18, {wN:0, lfU:1}), K(0.36, {wN:0, lfU:1}), K(0.5, {wN:1, lfU:0}),
      K(0.68, {wF:0, lnU:1}), K(0.86, {wF:0, lnU:1})],
    pre:p => quadPre(p, 34), pins:[]}),

  /* ---------- push ---------- */
  pushup:pushupDef({toe:84, top:29.5, bottom:9.5}),
  // Hands together under the lower chest: elbows travel straight back along the ribs.
  diamondpushup:pushupDef({toe:84, top:29.2, bottom:9, hand:7}),
  // Hands down by the hips, shoulders leaned forward well past the hands.
  ppushup:pushupDef({toe:86, top:27, bottom:10.5, hand:13, dur:2.6}),
  // Incline: hands on a couch/table edge, the rigid plank pivots on the toes.
  inclinepushup:(() => {
    const P = [22, 66];
    const top = tx => { const mk = al => plankFromToe([tx, G], al, -1), al = alForReach(mk, P, ARM-0.6, 186, 250); return {mk, al}; };
    const tx = solve(x => { const {mk, al} = top(x); return wrap(ang(shoulderOf(mk(al)), P) - al) + 90; }, 70, 96);
    const {mk, al:alTop} = top(tx), alBot = alForShoulderY(mk, P[1]-8.5, 181, alTop);
    return {face:-1, dur:2.2, still:0.45, ext:[4, 28, 68],
      props:'<path class="bar" d="M4 68.5H28M6 68.5V90M26 68.5V90"/>',
      keys:[K(0, {al:alTop}, T('aN',...P), T('aF',...P)), K(0.12, {al:alTop}), K(0.5, {al:alBot}), K(0.58, {al:alBot})],
      pre:p => Object.assign(p, mk(p.al)), pins:[['aN.end'],['lN.toe']]};
  })(),
  // Knee push-up: knees are the pivot, shins raised behind, straight line knee-to-head.
  kneepushup:(() => {
    const Kn = [64, G], mk = al => plankFromKnee(Kn, al, -24);
    const alTop = alForShoulderY(mk, G-29.5, 181, 240), hx = shoulderOf(mk(alTop))[0];
    const alBot = alForShoulderY(mk, G-9.5, 176, alTop);
    return {face:-1, dur:2.2, still:0.45, keys:[
        K(0, {al:alTop}, T('aN',hx,G), T('aF',hx,G)), K(0.12, {al:alTop}), K(0.5, {al:alBot}), K(0.58, {al:alBot})],
      pre:p => Object.assign(p, mk(p.al)), pins:[['aN.end'],['lN.knee']]};
  })(),
  // Archer push-up, seen head-on (the only view where the side-to-side shift
  // shows): wide hands, the body lowers toward one hand while the other arm
  // stays long and straight; alternate sides.
  archerpushup:{view:'head', face:0, bar:16, dur:4.2, still:0.3, sgn:{aN:-1, aF:1},
    keys:[K(0, {cx:50, cy:62.5, bt:0}), K(0.08, {cx:50, cy:62.5, bt:0}), K(0.3, {cx:41.5, cy:74, bt:-11}), K(0.36, {cx:41.5, cy:74, bt:-11}),
      K(0.5, {cx:50, cy:62.5, bt:0}), K(0.58, {cx:50, cy:62.5, bt:0}), K(0.8, {cx:58.5, cy:74, bt:11}), K(0.86, {cx:58.5, cy:74, bt:11})],
    pre:p => Object.assign(p, {hx:p.cx, hy:p.cy+BONE.torso, t:-90, n:180-p.bt*0.6, 'lN.pts':[[p.cx, p.cy], [p.cx, p.cy], [p.cx, p.cy]],
        'lF.pts':[[p.cx, p.cy], [lerp(p.cx, 50, 0.5), lerp(p.cy, G-12, 0.5)], [50, G-12]]},
      T('aN', 73, G), T('aF', 27, G)),
    pins:[['aN.end'],['aF.end']]},
  // Pike push-up: hands and feet fixed, hips stay high; the head lowers to a
  // spot just in front of the hands (a tripod), elbows bend back toward the feet.
  pike:(() => {
    const P = [32, G], toe = [71, G], fd = 124, A = add(toe, fd, -BONE.ft);
    const Htop = meetUp(P, BONE.torso+ARM-0.6, A, LEG-0.4), Stop = add(P, ang(P, Htop), ARM-0.6);
    const Sbot = [28, 71.5];
    return {face:-1, dur:2.4, still:0.45, keys:[
        K(0, {k:0}), K(0.12, {k:0}), K(0.5, {k:1}), K(0.58, {k:1})],
      pre:p => {
        const S = [lerp(Stop[0], Sbot[0], p.k), lerp(Stop[1], Sbot[1], p.k)];
        const H = meetUp(S, BONE.torso, A, LEG-0.4);
        const t = ang(H, S);
        return Object.assign(p, {hx:H[0], hy:H[1], t, n:lerp(0, -10, p.k), 'lN.f':fd, 'lF.f':fd},
          T('aN', ...P), T('aF', ...P), legsTo(...A, ...A));
      }, pins:[['aN.end'],['lN.toe']]};
  })(),

  // Bench dip: hands on a bench edge just behind the hips, legs out with the
  // heels on the floor. The elbows bend straight back to about 90° while the
  // shoulders stay down and the hips drop close to the bench, then press up.
  benchdip:(() => {
    const P = [30, 66], A = [62.8, G], St = [P[0]+1.5, P[1]-29.4], Sb = [P[0]+6.5, P[1]-20.2];
    return {face:1, dur:2.6, still:0.45, ext:[6, 31, 68.5],
      props:'<path class="bar" d="M6 68.5H31M8 68.5V90M29 68.5V90"/>',
      keys:[K(0, {d:0}), K(0.1, {}), K(0.45, {d:1}), K(0.55, {}), K(0.95, {d:0})],
      pre:p => {
        const S = [lerp(St[0], Sb[0], p.d), lerp(St[1], Sb[1], p.d)], t = lerp(-100, -86, p.d), H = add(S, t, -BONE.torso);
        return Object.assign(p, {hx:H[0], hy:H[1], t, n:lerp(6, -4, p.d)}, T('aN', ...P), T('aF', ...P), legsTo(...A, ...A), {'lN.f':-70, 'lF.f':-70});
      }, pins:[['aN.end'],['lN.end']]};
  })(),
  // Parallel bar dip: support on straight arms, knees bent with the feet
  // behind. Lower with a slight forward lean until the shoulders are just below
  // the elbows (upper arm level, forearm vertical, ~90°), then press back up.
  dip:(() => {
    const P = [50, 52], St = [P[0]+1.5, P[1]-29.4], Sb = [P[0]+13, P[1]-14.6];
    return {face:1, dur:3, still:0.5, ext:[P[0]-26, P[0]+24, P[1]+2.5],
      props:`<path class="bar" d="M${P[0]-26} ${P[1]+2.5}H${P[0]+24}M${P[0]-24} ${P[1]+2.5}V90M${P[0]+22} ${P[1]+2.5}V90"/>`,
      keys:[K(0, {d:0}), K(0.1, {}), K(0.5, {d:1}), K(0.58, {}), K(0.95, {d:0})],
      pre:p => {
        const S = [lerp(St[0], Sb[0], p.d), lerp(St[1], Sb[1], p.d)], t = lerp(-80, -62, p.d), H = add(S, t, -BONE.torso);
        const u = t + 180 - 10, l = u + 95;
        return Object.assign(p, {hx:H[0], hy:H[1], t, n:-8*p.d}, T('aN', ...P), T('aF', ...P),
          L('lN', u, l), L('lF', u - 4, l - 6), {'lN.f':l - 45, 'lF.f':l - 50});
      }, pins:[['aN.end']]};
  })(),

  /* ---------- legs ---------- */
  // Squat (side view): feet flat, hips sit back and down to thighs ~parallel,
  // knees travel forward over the toes, torso leans to keep balance over
  // mid-foot, arms reach forward as a counterweight.
  squat:{dur:2.6, still:0.45, keys:[
      K(0, {hx:49, hy:STAND, t:-90, n:0}, SIDE_HANG), K(0.08, {}),
      K(0.45, {hx:39, hy:71, t:-48, n:-18}, both(-4, -4)), K(0.55, {}),
      K(0.92, {hx:49, hy:STAND, t:-90, n:0}, SIDE_HANG)],
    pre:p => Object.assign(p, standLegs(48), FLAT), pins:[['lN.end'],['lN.toe']]},
  // Jump squat: squat, drive through the whole foot into a jump (hips, knees,
  // ankles extend, toes leave last), land toes-first and sink back into the squat.
  jumpsquat:{dur:1.7, still:0.3, keys:[
      K(0, {hx:39, hy:71, t:-48, n:-18, ax:48, ay:G, f:0}, both(118)),
      K(0.18, {hx:47.5, hy:G-4.9-LEG+0.8, t:-84, n:-4, ax:50.6, ay:G-4.9, f:55}, both(-60, -70)),
      K(0.33, {hx:48.5, hy:G-4.9-LEG-6, t:-88, n:0, ax:51, ay:G-11, f:60}, both(-75, -80)),
      K(0.48, {hx:47.5, hy:G-4.9-LEG+1, t:-86, n:-4, ax:50.6, ay:G-4.9, f:55}, both(30, 10)),
      K(0.7, {hx:39, hy:71, t:-48, n:-18, ax:48, ay:G, f:0}, both(-4)),
      K(0.82, {}, both(118))],
    pre:p => Object.assign(p, legsTo(p.ax, p.ay, p.ax, p.ay), {'lN.f':p.f, 'lF.f':p.f})},
  calfraise:{dur:2.2, still:0.4, keys:[
      K(0, {f:0}), K(0.08, {f:0}), K(0.32, {f:42}), K(0.5, {f:42}), K(0.95, {f:0})],
    pre:p => {
      const toe = [54, G], A = add(toe, p.f, -BONE.ft);
      return Object.assign(p, {hx:A[0]-1, hy:A[1]-LEG+0.5, t:-90}, legsTo(...A, ...A), {'lN.f':p.f, 'lF.f':p.f}, SIDE_HANG);
    }, pins:[['lN.toe']]},
  // Reverse lunge: the front (near) foot never moves. The back foot steps
  // back onto the ball of the foot, the back knee drops toward the floor
  // under the hip, front shin stays roughly vertical, torso tall.
  lunge:{dur:3.2, still:0.5, keys:[
      K(0, {hx:55, hy:STAND, t:-90, bx:62, by:G, bf:0}, SIDE_HANG),
      K(0.13, {hx:51, hy:STAND+1, bx:47, by:G-5, bf:30}),
      K(0.26, {hx:45, hy:STAND+3, bx:26, by:G, bf:75}),
      K(0.5, {hx:40.5, hy:G-21, t:-85}, L('aN',100,86), L('aF',100,86)), K(0.6, {}),
      K(0.78, {hx:47, hy:STAND+2, t:-89, bx:26, by:G, bf:75}, SIDE_HANG),
      K(0.9, {hx:53, hy:STAND, bx:46, by:G-5, bf:30}),
      K(0.97, {hx:55, hy:STAND, bx:62, by:G, bf:0})],
    pre:p => Object.assign(p, T('lN', 56, G), {'lN.f':0}, toeAt('lF', p.bx, p.by, p.bf)),
    pins:[['lN.end'],['lN.toe'],['lF.toe',0.26,0.78]]},
  // Walking lunge: the back foot steps through into the next lunge. The camera
  // follows the hips, so the floor marks scroll and planted feet move with them.
  walklunge:walkLungeDef(),
  // Jump lunge: from a lunge, jump, switch legs in the air, land soft in the
  // opposite lunge; then switch back.
  jumplunge:jumpLungeDef(),
  // Bulgarian split squat: rear foot laces-down on a chair seat behind, the
  // hips drop almost straight down, back knee toward the floor.
  bulgariansplit:{dur:2.8, still:0.45,
    props:'<path class="bar" d="M4 70.5H27M6 70.5V90M25 70.5V90M5 70.5V48"/>', ext:[4, 27, 48],
    keys:[K(0, {hx:51, hy:53.2, t:-87}), K(0.1, {}), K(0.45, {hx:46.5, hy:69, t:-78}), K(0.55, {}), K(0.95, {hx:51, hy:53.2, t:-87})],
    pre:p => Object.assign(p, T('lN', 66, G), T('lF', 22, 67.5), {'lN.f':0, 'lF.f':180}, L('aN',98,86), L('aF',98,86)),
    pins:[['lN.end'],['lF.end']]},
  // Assisted pistol: stand on one leg, the other held straight out in front;
  // sit down and back on the standing leg (heel down), torso leaning forward
  // for balance, one hand sliding down a doorframe, the other reaching forward.
  pistol:{dur:3.2, still:0.45,
    props:'<path class="bar" d="M58 6V90"/>', ext:[58, 58, 6],
    keys:[K(0, {hx:47, hy:STAND, t:-89, e2:56, hand:44}, L('aF',30,10)), K(0.08, {}),
      K(0.45, {hx:37.5, hy:72.5, t:-43, e2:-4, hand:74}, L('aF',-6,-8)), K(0.55, {}),
      K(0.95, {hx:47, hy:STAND, t:-89, e2:56, hand:44}, L('aF',30,10))],
    pre:p => Object.assign(p, T('lN', 48, G), {'lN.f':0}, L('lF', p.e2, p.e2), T('aN', 57, p.hand)),
    pins:[['lN.end'],['lN.toe']]},
  glutebridge:bridgeDef(false),
  glutemarch:bridgeDef(true),
  // Single-leg glute bridge: one foot planted, the other leg held straight in
  // line with its thigh; drive through the planted heel until shoulders, hips
  // and knee make one line, pause, lower.
  slbridge:bridgeDef(false, true),
  // Single-leg Romanian deadlift: stand on one leg (soft knee, foot flat),
  // hinge at the hip with a flat back while the free leg reaches back in line
  // with the torso, until the body is near level; the arms hang toward the
  // floor. The hips go back, not down (stance knee only slightly bent).
  slrdl:{dur:3.6, still:0.45, keys:[K(0, {r:0}), K(0.08, {}), K(0.45, {r:1}), K(0.55, {}), K(0.95, {r:0})],
    pre:p => {
      const r = p.r, t = lerp(-88, -12, r), u = lerp(88, t + 180, r), l = lerp(145, t + 180, r);
      return Object.assign(p, {hx:lerp(51, 46, r), hy:lerp(STAND, 50.6, r), t, n:0}, T('lN', 50, G), {'lN.f':0},
        L('lF', u, l), {'lF.f':lerp(70, l - 90, r)}, both(lerp(96, 90, r), lerp(84, 86, r)));
    }, pins:[['lN.end'],['lN.toe']]},

  /* ---------- core ---------- */
  // Dead bug: back flat on the floor the whole time; opposite arm and leg
  // lower toward the floor and return, then the other pair.
  deadbug:{face:1, dur:4.4, still:0.25,
    keys:[K(0, {aN:0, aF:0, lN:0, lF:0}), K(0.25, {aN:1, lF:1}), K(0.32, {}), K(0.5, {aN:0, lF:0}),
      K(0.75, {aF:1, lN:1}), K(0.82, {})],
    pre:p => {
      return Object.assign(p, {hx:57, hy:G, t:180, n:26},
        L('aN', lerp(-90, -168, p.aN)), L('aF', lerp(-90, -168, p.aF)),
        L('lN', lerp(-90, -8, p.lN), lerp(0, -8, p.lN)), L('lF', lerp(-90, -8, p.lF), lerp(0, -8, p.lF)),
        {'lN.f':lerp(-60, -88, p.lN), 'lF.f':lerp(-60, -88, p.lF)});
    }},
  // Lying leg raise: low back and arms stay on the floor; straight legs rise
  // from hovering to vertical, then lower slowly back to the hover.
  legraise:{face:1, dur:3, still:0.38, keys:[K(0, {lg:-7}), K(0.08, {}), K(0.38, {lg:-89}), K(0.46, {}), K(0.94, {lg:-7})],
    pre:p => Object.assign(p, {hx:52, hy:G, t:180, n:26}, L('aN', 0), L('aF', 0), L('lN', p.lg, p.lg + 2), L('lF', p.lg, p.lg + 2),
      {'lN.f':p.lg - 25, 'lF.f':p.lg - 25})},
  // Hanging knee raise: shoulders engaged, arms straight, no swing; the knees
  // draw up toward the chest (hips past 90°) as the pelvis curls up, then
  // lower slowly.
  hangknee:hangMove({bar:[50, 1]}, h => ({dur:3, still:0.4, keys:[
      K(0, h), K(0.08, {}), K(0.38, {hf:118, kb:122, an:50, t:-99, c:3}), K(0.48, {}), K(0.92, {hf:h.hf, kb:h.kb, an:h.an, t:h.t, c:0})]})),
  // Forearm plank: elbows under shoulders, forearms flat, one straight line
  // from heels to head. A hold, so only a breath of movement.
  plank:forearmPlankDef(false),
  kneeplank:forearmPlankDef(true),
  // Bicycle crunch: shoulders curled off the floor, hands behind the head,
  // legs pedal (one knee in, the other leg long and hovering), low back down.
  crunch:{face:1, dur:2.2, still:0.25, sgn:{aN:1, aF:1},
    keys:[K(0, {a:0, r:0}), K(0.25, {a:1, r:1}), K(0.5, {a:0, r:0}), K(0.75, {a:-1, r:1})],
    pre:p => {
      const H = [56, G], t = 202 + 4*p.r, S = add(H, t, BONE.torso), hd = add(S, t, BONE.neck), hand = add(hd, t-90, 4.5);
      const a = (1+p.a)/2;  // 0..1: which knee is in
      const lnU = lerp(-40, -108, a), lnL = lerp(-40, -14, a), lfU = lerp(-108, -40, a), lfL = lerp(-14, -40, a);
      return Object.assign(p, {hx:H[0], hy:H[1], t, c:2}, T('aN', ...hand), T('aF', ...hand),
        L('lN', lnU, lnL), L('lF', lfU, lfL), {'lN.f':lnL-60, 'lF.f':lfL-60});
    }},
  // Mountain climbers: shoulders stacked over the hands, hips level with the
  // shoulders; one knee drives under the chest while the other leg stays long.
  mountainclimber:(() => {
    const toe = [86, G], mk = al => plankFromToe(toe, al, -1);
    const al = alForShoulderY(mk, G-29.5, 181, 230), base = mk(al), S = shoulderOf(base);
    const H = [base.hx, base.hy];
    const plantA = add(toe, base['lN.f'], -BONE.ft);
    const tuck = (() => { const kn = add(H, 104, BONE.th); return add(kn, 2, BONE.sh); })();
    return {face:-1, dur:0.95, still:0.25, keys:[
        K(0, {n:0, f:0}), K(0.25, {n:1, f:0}), K(0.5, {n:0, f:0}), K(0.75, {n:0, f:1})],
      pre:p => {
        const at = k => [lerp(plantA[0], tuck[0], k), lerp(plantA[1], tuck[1], k) - 9*Math.sin(Math.PI*k)];
        const ft = k => lerp(base['lN.f'], 5, k);
        const r = {hx:H[0], hy:H[1], t:ang(H, S), n:0};
        return Object.assign(p, r, T('aN', S[0], G), T('aF', S[0], G), T('lN', ...at(p.n)), T('lF', ...at(p.f)), {'lN.f':ft(p.n), 'lF.f':ft(p.f)});
      }, pins:[['aN.end']]};
  })(),
  // Side plank on the forearm, viewed from the front: elbow under the
  // shoulder, feet stacked, a straight line from feet to head; top arm up.
  sideplank:(() => {
    const E = [24, G], S = [24, G-BONE.ua+0.5], A = [24 + Math.sqrt((LEG+BONE.torso)**2 - (G-S[1])**2), G];
    const al = ang(A, S), H = add(A, al, LEG);
    return {face:0, view:'front', nofeet:true, dur:4, still:0, keys:[K(0,{b:0}), K(0.5,{b:1})],
      pre:p => Object.assign(p, {hx:H[0], hy:H[1]-0.8*p.b, t:ang([H[0], H[1]-0.8*p.b], S), n:-6},
        legsTo(...A, ...A), {'aF.pts':[S, E, [E[0]-1.5, E[1]]]}, L('aN', -88)), pins:[['lN.end']]};
  })(),
  // Hollow body hold: low back pressed down, shoulders and straight legs
  // lifted, arms long beside the ears — a shallow banana shape.
  hollow:{face:1, dur:4, still:0, keys:[K(0, {b:0}), K(0.5, {b:1})],
    pre:p => Object.assign(p, {hx:56, hy:G-0.5, t:196+0.8*p.b, c:1.5, n:4}, L('aN',193), L('aF',193),
      L('lN', -16-0.8*p.b), L('lF', -16-0.8*p.b), {'lN.f':-30, 'lF.f':-30})},
  // V-up: from lying long, lift straight legs and torso together, balance on
  // the hips and reach the hands to the shins; lower under control.
  vup:{face:1, dur:2.8, still:0.38, keys:[
      K(0, {t:180, lg:0, ar:180, n:26, c:0}), K(0.08, {}), K(0.38, {t:235, lg:-58, ar:351, n:-4, c:2}), K(0.48, {}),
      K(0.88, {t:180, lg:0, ar:180, n:26, c:0})],
    pre:p => Object.assign(p, {hx:52, hy:G}, L('lN', p.lg), L('lF', p.lg), L('aN', p.ar), L('aF', p.ar), {'lN.f':p.lg-20, 'lF.f':p.lg-20})},

  /* ---------- pull ---------- */
  // Superman: hips on the floor; arms, chest and straight legs lift together,
  // neck long (eyes to the floor), hold, lower slowly.
  superman:{face:-1, dur:3.4, still:0.4, keys:[
      K(0, {t:180, lg:0, ar:180, n:26}), K(0.08, {}), K(0.32, {t:192, lg:-9, ar:198, n:6}), K(0.62, {}), K(0.95, {t:180, lg:0, ar:180, n:26})],
    pre:p => Object.assign(p, {hx:58, hy:G}, L('lN', p.lg), L('lF', p.lg), L('aN', p.ar), L('aF', p.ar), {'lN.f':p.lg, 'lF.f':p.lg})},
  // Reverse snow angel, seen from above (the sweep happens along the floor):
  // straight arms hover and sweep from the hips out and up overhead and back.
  snowangel:{view:'top', face:0, bar:12, dur:3.8, still:0.45,
    props:'<rect class="mat" x="22" y="4" width="56" height="94" rx="6"/>',
    keys:[K(0, {a:0}), K(0.08, {}), K(0.45, {a:1}), K(0.58, {}), K(0.95, {a:0})],
    pre:p => Object.assign(p, {hx:50, hy:56, t:-90, n:0}, L('aN', lerp(84, -55, p.a)), L('aF', lerp(96, 235, p.a)), legsTo(52.5, 93, 47.5, 93))},
  // Prone Y-raise: chest and legs stay down, arms (out in a Y, so slightly
  // foreshortened from the side) lift off the floor and lower.
  yraise:{face:-1, dur:3, still:0.4, keys:[
      K(0, {ar:180}), K(0.08, {}), K(0.35, {ar:196}), K(0.6, {}), K(0.92, {ar:180})],
    pre:p => Object.assign(p, {hx:58, hy:G, t:181, n:24}, L('aN', p.ar), L('aF', p.ar), {'aN.k':0.86, 'aF.k':0.86}, L('lN', 0), L('lF', 0), {'lN.f':0, 'lF.f':0})},
  // Towel row: heels planted, body one straight line leaning back from the
  // ankles; the towel's length is fixed, so pulling brings the whole body up
  // toward the post. Elbows drive back close to the ribs.
  row:towelRowDef(),
  tablerow:tableRowDef(false),
  archertablerow:tableRowDef(true),
  // Scapular squeeze: arms by the sides, shoulder blades pull back and down
  // and hold; chest lifts slightly.
  scapsqueeze:{dur:4, still:0.5, keys:[
      K(0, {s:0}), K(0.25, {s:1}), K(0.78, {s:1})],
    pre:p => Object.assign(p, {hx:50, hy:STAND, t:-90-1.5*p.s, n:1.5*p.s, sx:-2.6*p.s, sy:0.6*p.s}, standLegs(50), FLAT,
      both(96+6*p.s, 84+4*p.s))},

  // Active dead hang: straight arms, shoulders drawn down away from the ears,
  // ribs down; only the breath and a little shoulder setting move.
  deadhang:hangMove({bar:[50, 1]}, h => ({dur:4, keys:[K(0, h, {sy:0.2}), K(0.5, {sy:-0.5, t:-92.5, c:0.4})]})),
  // Scapular pull-up: from a passive hang (shoulders up by the ears) the
  // shoulder blades pull down and the whole body rises a couple of units with
  // the elbows locked straight; then it lowers back to the passive hang.
  scappull:hangMove({bar:[50, -2]}, h => ({dur:2.6, still:0.4, keys:[
      K(0, h, {sy:-3.2}), K(0.1, {}), K(0.4, {sy:0, t:-95, n:-4, c:-0.8}), K(0.55, {}), K(0.95, {sy:-3.2, t:-93, n:0, c:0})]})),
  // Pull-up, overhand grip wider than the shoulders (so the arms look a little
  // short from the side): from a full hang the shoulders set down first, then
  // the elbows drive down toward the ribs; the shoulders travel slightly back
  // so the head passes behind the bar and the chin clears it. Legs bent with
  // the feet behind, body moving as one piece; lower all the way.
  pullup:hangMove({bar:[50, 4.5], k:0.9}, (h, by) => ({dur:4, still:0.45, keys:[
      K(0, h, {sy:-2.4}), K(0.06, {}), K(0.16, {sy:0}),
      K(0.3, {rx:41.5, ry:by+14, t:-99, n:-4}),
      K(0.45, {rx:41, ry:by+3, t:-104, n:-6}), K(0.55, {}),
      K(0.74, {rx:41.5, ry:by+14, t:-99, n:-4}),
      K(0.92, {rx:h.rx, ry:h.ry, t:h.t, n:h.n, sy:0})]})),
  // Chin-up, palms facing you at shoulder width: the arms work in the side
  // plane, so the elbows travel down in front of the body; the torso stays
  // more upright and the chest comes higher, up to the bar, head tipped back.
  chinup:hangMove({bar:[50, 1]}, (h, by) => ({dur:4, still:0.45, keys:[
      K(0, h, {sy:-2.4, t:-91}), K(0.06, {}), K(0.16, {sy:0}),
      K(0.3, {rx:44, ry:by+14, t:-90, n:-8}),
      K(0.45, {rx:43, ry:by+2, t:-90, n:-22}), K(0.55, {}),
      K(0.74, {rx:44, ry:by+14, t:-90, n:-8}),
      K(0.92, {rx:h.rx, ry:h.ry, t:-91, n:h.n, sy:0})]})),
  // Negative pull-up: start with the chin over the bar, lower slowly for about
  // five seconds to a full hang, then put the feet down and jump back up to
  // the top for the next rep (the quick part).
  negpullup:hangMove({bar:[50, 2], k:0.9}, (h, by) => {
    const top = {rx:41, ry:by+3, t:-104, n:-6, sy:0}, legs = {hf:h.hf, kb:h.kb, an:h.an};
    return {dur:7.5, still:0.3, keys:[
      K(0, h, top, {plant:0, toex:56, toef:0}), K(0.03, {e:'in'}),
      K(0.33, {rx:41.5, ry:by+14, t:-99, n:-4, e:'out'}),
      K(0.69, {rx:h.rx, ry:h.ry, t:h.t, n:h.n}),        // ~5 s down
      K(0.72, {}),
      K(0.76, {hf:18, kb:54, an:-25}),
      K(0.78, {plant:1}), K(0.81, {}),
      K(0.85, {rx:47, ry:h.ry - 7, t:-95, hf:6, kb:20, toef:60}),
      K(0.92, top, legs, {plant:0, toef:40}), K(0.97, {})],
      pins:[['aN.end'],['aF.end'],['lN.toe', 0.78, 0.85]]};
  }),

  /* ---------- full body ---------- */
  burpeestep:burpeeDef('step'),
  halfburpee:burpeeDef('half'),
  burpee:burpeeDef('full'),
  burpeetuck:burpeeDef('tuck'),
  // Bear crawl hold: hands under shoulders, knees under hips hovering just
  // off the floor, back flat.
  bearhold:Object.assign(bearDef(), {dur:4, still:0}),
  bearcrawl:Object.assign(bearDef(), {dur:1.6, still:0.1, crawl:true}),

  /* ---------- mobility / stretch ---------- */
  // World's greatest stretch: deep lunge, back knee down, both hands inside
  // the front foot; then rotate and reach one arm to the ceiling, eyes follow.
  kneelrotate:(() => {
    const Kn = [28, G], F = [66, G], hand = [59, G];
    return {dur:6, still:0.4, keys:[K(0, {r:0}), K(0.12, {}), K(0.38, {r:1}), K(0.62, {}), K(0.88, {r:0})],
      pre:p => {
        const H = add(Kn, -52, BONE.th), t = -32 - 6*p.r, S = add(H, t, BONE.torso);
        // the arm turns about the spine toward the ceiling: in this view it
        // swings through pointing at the viewer (foreshortened) to straight up
        const c = Math.cos(Math.PI*p.r), v0 = [hand[0]-S[0], hand[1]-S[1]];
        const e = [S[0] + lerp(v0[0], 0, p.r)*Math.abs(c) + 2*Math.sin(Math.PI*p.r), S[1] + (c>=0 ? v0[1]*c : (ARM-0.5)*c)];
        const m = [lerp(S[0], e[0], BONE.ua/ARM), lerp(S[1], e[1], BONE.ua/ARM)];
        return Object.assign(p, {hx:H[0], hy:H[1], t, n:-38*p.r}, T('lN', ...F), {'lN.f':0}, L('lF', 128, 180), {'lF.f':180},
          T('aF', ...hand), {'aN.pts':[S, m, e]});
      }, pins:[['lN.end'],['aF.end'],['lF.knee']]};
  })(),
  quadreach:Object.assign(quadDef(30), {dur:4.4, still:0.55, keys:[K(0,{r:0}), K(0.1,{}), K(0.45,{r:1}), K(0.62,{}), K(0.95,{r:0})],
    pre:p => {
      quadPre(p, 30);
      const S = shoulderOf(p), hd = add(S, p.t, BONE.neck);
      // the elbow swings from under the chest to pointing at the ceiling — in
      // the side view that is a vertical sweep, foreshortened through the middle
      const ph = lerp(0, 180, p.r), E = [S[0] + 1.5, S[1] + 12*Math.cos(ph*D2R)];
      p['aN.pts'] = [S, E, add(hd, p.t - 75, 3)];
      p.n = -12*p.r;
      return p;
    }}),
  // Standing forward fold: hips hinge back, knees soft, spine and neck relax
  // so the head hangs, hands hang toward the shins/floor.
  fold:{dur:6, still:0.45, keys:[K(0, {f:0}), K(0.1, {}), K(0.45, {f:1}), K(0.7, {}), K(0.95, {f:0})],
    pre:p => Object.assign(p, {hx:lerp(50, 43, p.f), hy:lerp(STAND, STAND+1.6, p.f), t:lerp(-90, 38, p.f), c:lerp(0, -4, p.f), n:lerp(0, 30, p.f)},
      standLegs(50), FLAT, L('aN', 96, 84), L('aF', 96, 84), T('aN', 59, 81, {'aN.w':p.f}), T('aF', 59, 81, {'aF.w':p.f})),
    pins:[['lN.end'],['lN.toe']]},
  // Standing hamstring stretch: front heel down, toes up, front leg straight;
  // back knee bends, hips push back, chest hinges forward with a flat back.
  hamstring:{dur:5, still:0.45, keys:[K(0, {f:0}), K(0.1, {}), K(0.45, {f:1}), K(0.7, {}), K(0.95, {f:0})],
    pre:p => Object.assign(p, {hx:lerp(46, 44, p.f), hy:lerp(57, 58.5, p.f), t:lerp(-62, -40, p.f), n:lerp(-8, -12, p.f)},
      T('lN', 69, G-1), T('lF', 43, G), {'lN.f':-58, 'lF.f':0}, T('aN', lerp(60, 62, p.f), lerp(64, 70, p.f)), T('aF', lerp(60, 62, p.f), lerp(64, 70, p.f))),
    pins:[['lN.end'],['lF.end']]},
  // Child's pose: hips back to the heels, chest resting on the thighs, arms
  // long on the floor, forehead down. Only the breath moves.
  childspose:(() => {
    const Kn = [46, G];
    return {face:-1, dur:4.5, still:0, keys:[K(0,{b:0}), K(0.45,{b:1})],
      pre:p => {
        const H = add(Kn, -28, BONE.th);
        return Object.assign(p, {hx:H[0], hy:H[1], t:174-0.6*p.b, c:-0.8*p.b, n:-9}, L('lN', 152, 0), L('lF', 152, 0), {'lN.f':0, 'lF.f':0},
          T('aN', 9, G), T('aF', 9, G));
      }, pins:[['aN.end'],['lN.knee']]};
  })(),
  // Hip flexor stretch (half kneeling): back knee down, front foot flat with
  // the knee over the ankle; tuck the pelvis and ease the hips forward.
  kneelunge:(() => {
    const Kn = [36, G];
    return {dur:5, still:0.45, keys:[K(0,{h:0}), K(0.1,{}), K(0.4,{h:1}), K(0.7,{}), K(0.95,{h:0})],
      pre:p => {
        const th = lerp(-89, -73, p.h), H = add(Kn, th, BONE.th);
        return Object.assign(p, {hx:H[0], hy:H[1], t:-90-2*p.h, n:0}, T('lN', 58, G), {'lN.f':0}, L('lF', th+180, 180), {'lF.f':180},
          T('aN', H[0]+3, H[1]-3), T('aF', H[0]+3, H[1]-3));
      }, pins:[['lN.end'],['lF.knee']]};
  })(),
  // Chest opener: hands clasped behind, straight arms lift back and away,
  // chest lifts, shoulders down and back.
  chestopener:{dur:4, still:0.45, keys:[K(0, {o:0}), K(0.1, {}), K(0.45, {o:1}), K(0.75, {}), K(0.95, {o:0})],
    pre:p => Object.assign(p, {hx:50, hy:STAND, t:-90-3*p.o, c:-1*p.o, n:-2*p.o, sx:-1.4*p.o}, standLegs(50), FLAT,
      both(lerp(116, 134, p.o), lerp(114, 132, p.o)))},
  // Thread the needle: from all fours, one arm slides under the body along
  // the floor (seen end-on, so short), that shoulder and the side of the
  // head lower to the floor; hips stay over the knees.
  quadthread:Object.assign(quadDef(30), {dur:5, still:0.45, keys:[K(0,{d:0}), K(0.1,{}), K(0.45,{d:1}), K(0.7,{}), K(0.95,{d:0})],
    pre:p => {
      quadPre(p, 30);
      const H = [p.hx, p.hy], S0 = shoulderOf(p);
      const t = lerpAng(p.t, ang(H, [S0[0]+3, G-10.5]), p.d);
      const S = add(H, t, BONE.torso);
      return Object.assign(p, {t, n:lerp(0, -12, p.d)}, T('aN', lerp(30, S[0]+5, p.d), G, {'aN.str':1}));
    }, pins:[['aF.end'],['lN.knee']]}),
  // Standing quad stretch: one ankle held behind, knees together (thigh
  // vertical), hips pressed slightly forward, standing tall.
  quadhold:{dur:4, still:0, keys:[K(0,{b:0}), K(0.5,{b:1})],
    pre:p => {
      const H = [50+0.5*p.b, STAND], th = 95+2*p.b, kn = add(H, th, BONE.th), an = add(kn, th+155, BONE.sh);
      return Object.assign(p, {hx:H[0], hy:H[1], t:-90}, L('lN', th, th+155), {'lN.f':th+120}, T('lF', 50, G), {'lF.f':0},
        T('aN', ...an), L('aF', 75, 60));
    }, pins:[['lF.end']]},
};

/* ---- shared builders used above ---- */
function swingLegs(p, x, lift, plantUp){
  // stance foot planted (flat, or on the ball of the foot when plantUp is set);
  // the swinging leg moves in joint space from its planted angles to the lifted ones
  const pf = plantUp || 0, toe = [x + BONE.ft*Math.cos(0), G], A = plantUp ? add([x+4, G], pf, -BONE.ft) : [x, G];
  ['lN','lF'].forEach(id => {
    const k = p[id];
    const [u0, l0] = ikAngles([p.hx, p.hy], A, BONE.th, BONE.sh, -1);
    if(k<=0){ Object.assign(p, T(id, ...A), {[id+'.f']:pf}); return; }
    Object.assign(p, L(id, lerpAng(u0, lift.u, k), lerpAng(l0, lift.l, k)), {[id+'.f']:lerp(pf, lift.f, k)});
  });
  return p;
}
function quadDef(sx){
  return {face:-1, keys:[K(0,{})], pre:p => quadPre(p, sx), pins:[['lN.knee'],['lF.knee']]};
}
// all fours, head left: hands under the shoulders, knees under the hips,
// shins and the tops of the feet flat on the floor behind
function quadPre(p, sx){
  const S = [sx, G - ARM + 0.6], Hy = G - BONE.th;
  const H = [sx + Math.sqrt(BONE.torso**2 - (Hy - S[1])**2), Hy];
  Object.assign(p, {hx:H[0], hy:H[1], t:ang(H, S)});
  if(p.wN===undefined){ Object.assign(p, T('aN', sx, G), T('aF', sx, G), L('lN', 90, 0), L('lF', 90, 0), {'lN.f':0, 'lF.f':0}); return p; }
  // bird dog: blend each limb between planted and reaching
  Object.assign(p, T('aN', sx, G, {'aN.w':p.wN}), T('aF', sx, G, {'aF.w':p.wF}),
    L('lN', lerp(90, -4, p.lnU), lerp(0, -4, p.lnU)), L('lF', lerp(90, -4, p.lfU), lerp(0, -4, p.lfU)),
    {'lN.f':lerp(0, 86, p.lnU), 'lF.f':lerp(0, 86, p.lfU)});
  return p;
}
function forearmPlankDef(knee){
  // elbows directly under the shoulders, forearms along the floor toward the head
  const mk = knee ? (al => plankFromKnee([66, G], al, -22)) : (al => plankFromToe([86, G], al, -1));
  const al = alForShoulderY(mk, G - BONE.ua + 0.3, 180.5, 230), S = shoulderOf(mk(al)), hand = [S[0] - BONE.fa + 0.3, G];
  return {face:-1, dur:4, still:0, keys:[K(0,{b:0}), K(0.5,{b:1})],
    pre:p => Object.assign(p, mk(al + 0.35*p.b), T('aN', ...hand), T('aF', ...hand)),
    pins:[['aN.end'],[knee ? 'lN.knee' : 'lN.toe']]};
}
function bridgeDef(march, single){
  // supine, head left: shoulders and head stay down, feet flat; the hips
  // lift until shoulders, hips and knees make one line
  const S = [30, G], A = [71, G], head = [S[0]-8.06, HEAD_DOWN];
  const up = -22, top = {u:up-90, l:up};   // marching knee: hip and knee at ~90°
  const keys = march
    ? [K(0, {h:1, mN:0, mF:0}), K(0.08, {}), K(0.25, {mN:1}), K(0.38, {}), K(0.5, {mN:0}), K(0.58, {}), K(0.75, {mF:1}), K(0.88, {})]
    : [K(0, {h:0}), K(0.08, {}), K(0.4, {h:1}), K(0.6, {}), K(0.95, {h:0})];
  return {face:1, dur:march ? 3.6 : 3, still:march ? 0.3 : 0.5, keys,
    pre:p => {
      const th = lerp(0, up, p.h), H = add(S, th, BONE.torso), t = ang(H, S);
      Object.assign(p, {hx:H[0], hy:H[1], t, n:ang(S, head) - t}, L('aN', 0), L('aF', 0), {'lN.f':0, 'lF.f':0});
      ['lN','lF'].forEach(id => {
        const m = p['m'+id[1]] || 0;
        Object.assign(p, L(id, top.u, top.l), T(id, ...A, {[id+'.w']:1-m}), {[id+'.f']:lerp(0, top.l-75, m)});
      });
      if(single){   // the near leg is held straight, in line with the planted thigh
        const u = ikAngles(H, A, BONE.th, BONE.sh, -1)[0];
        Object.assign(p, L('lN', u, u + 1), {'lN.w':0, 'lN.f':u - 80});
      }
      return p;
    }, pins:single ? [['aN.end'],['lF.end']] : [['aN.end']]};
}
/* Hanging from an overhead bar (side view, facing right; the bar is seen end-on
   as a small ring under its ceiling strap). Both hands are fixed on the bar and
   the arms are solved to them, so the body can only move by bending the elbows
   or by moving the shoulder girdle: keys give the shoulder joint (rx, ry), the
   girdle offset sy (negative = shoulders shrugged up to the ears, a passive
   hang; 0 = pulled down, an active hang), the torso angle and the leg shape
   (hf hip flexion, kb knee bend, an ankle, all in degrees). k < 1 draws the
   arms foreshortened, for a grip wider than the shoulders. */
function hangMove(o, extra){ const d = hangDef(o); return Object.assign(d, extra(d.hang, o.bar[1])); }
function hangDef(o){
  const B = o.bar, k = o.k || 1, reach = k*ARM - 0.5;
  const hang = Object.assign({rx:B[0], ry:B[1] + reach, sx:-1.5, sy:0, t:-93, n:10, c:0, hf:8, kb:100, an:45}, o.hang);
  const top = B[1] - (o.strap || 7), strap = `M${B[0]+0.6} ${B[1]-1.7}L${B[0]+3} ${top}H${B[0]+10}`;
  return {face:1, still:0, hang,
    props:`<circle class="bar" cx="${B[0]}" cy="${B[1]}" r="1.8" fill="none"/><path class="bar" d="${strap}"/>`,
    ext:[B[0]-1, B[0]+10, top],
    pre:p => {
      const S = [p.rx - p.sx, p.ry - p.sy], H = add(S, p.t, -BONE.torso);
      const u = p.t + 180 - p.hf, l = u + p.kb, f = l + p.an - 90;
      Object.assign(p, {hx:H[0], hy:H[1]}, T('aN', ...B), T('aF', ...B), {'aN.k':k, 'aF.k':k},
        L('lN', u, l), L('lF', u - 4, l - 6), {'lN.f':f, 'lF.f':f - 6});
      if(p.plant){   // feet back on the floor (negative pull-up reset): blend to a planted toe
        const A = add([p.toex, G], p.toef, -BONE.ft);
        ['lN','lF'].forEach(id => Object.assign(p, T(id, ...A, {[id+'.w']:p.plant}), {[id+'.f']:lerpAng(p[id+'.f'], p.toef, p.plant)}));
      }
      if(o.post) o.post(p);
      return p;
    }, pins:[['aN.end'],['aF.end']]};
}
function towelRowDef(){
  // The towel's length is fixed, so the hands stay on a circle around the
  // anchor. Pick the anchor height so arms are straight at the bottom lean
  // and the hands reach the chest at a still-leaned-back top position.
  const A = [70, G], mk = al => plankFromAnkle(A, al, 0), alBot = -123, alTop = -104;
  const Sb = shoulderOf(mk(alBot)), St = shoulderOf(mk(alTop));
  const qy = solve(y => dist(Sb, [90, y]) - dist(St, [90, y]) - (ARM - 0.5 - 9), 10, 70), Q = [90, qy];
  const Lt = dist(Sb, Q) - (ARM - 0.5);
  return {face:1, dur:2.6, still:0.45, dyn:'towel', anchor:Q,
    props:'<path class="bar" d="M92 8V90"/>', ext:[92, 92, 8],
    keys:[K(0, {al:alBot}), K(0.1, {}), K(0.45, {al:alTop}), K(0.58, {}), K(0.95, {al:alBot})],
    pre:p => {
      Object.assign(p, mk(p.al), {n:-4});
      const S = shoulderOf(p), hand = add(Q, ang(Q, S), Lt);
      return Object.assign(p, T('aN', ...hand), T('aF', ...hand));
    }, pins:[['lN.end'],['lN.toe']]};
}
function tableRowDef(archer){
  // lying under a sturdy table, heels on the floor, body straight; pull the
  // chest up to the table edge. Archer: the far arm stays straight (its hand
  // grips further along the edge, so from the side that arm looks short).
  const P = [34, 37], A = [92, G-1];
  const mk = al => plankFromAnkle(A, al, al+90);
  const alBot = solve(al => dist(shoulderOf(mk(al)), P) - (ARM - 0.5), 195, 240);
  const alTop = solve(al => dist(shoulderOf(mk(al)), P) - 16, alBot, 240);
  return {face:1, dur:2.6, still:0.45, ceil:34, ext:[0, 36, 34],
    props:'<path class="bar" d="M0 34H36M3 34V90"/>',
    keys:[K(0, {al:alBot}), K(0.1, {}), K(0.45, {al:alTop}), K(0.58, {}), K(0.95, {al:alBot})],
    pre:p => Object.assign(p, mk(p.al), {n:-6}, T('aN', ...P), T('aF', ...P, archer ? {'aF.str':1} : {})),
    pins:[['aN.end'],['lN.end']]};
}
function bearDef(){
  // hands under shoulders, knees under hips hovering ~an inch up, toes tucked
  const H0 = [50, G - 4.5 - BONE.th], S0 = [H0[0] - Math.sqrt(BONE.torso**2 - (H0[1] - (G-ARM+0.6))**2), G-ARM+0.6];
  const footF = 100, ankOff = [17, -(BONE.ft*Math.sin(footF*D2R))];
  const D = 16;
  const stepAt = (ph, a, b) => { const k = clamp((ph-a)/(b-a), 0, 1); return {k:EASE.io(k), lift:Math.sin(Math.PI*k)}; };
  return {face:-1, nofloorTicks:false, still:0, keys:[K(0,{b:0}), K(0.5,{b:1})],
    pre:function(p, ph){
      const crawl = this.crawl;
      const shift = crawl ? -D*ph : 0;
      const H = [H0[0] + shift, H0[1] - (crawl ? 0 : 0.5*p.b)], S = [S0[0] + shift, S0[1] - (crawl ? 0 : 0.3*p.b)];
      Object.assign(p, {hx:H[0], hy:H[1], t:ang(H, S), n:-4, cam:crawl ? shift : 0});
      const place = (home, win) => {
        if(!crawl) return {x:home, lift:0};
        // a limb steps once per cycle in its window; between steps it is planted in the world
        const s = stepAt(ph, ...win), off = win[0]===0 ? D*0.125 : -D*0.125;
        return {x:home + off - D*s.k, lift:s.lift};
      };
      const hN = place(S0[0], [0, 0.42]), hF = place(S0[0], [0.5, 0.92]);
      const fF = place(H0[0] + ankOff[0], [0, 0.42]), fN = place(H0[0] + ankOff[0], [0.5, 0.92]);
      Object.assign(p, T('aN', hN.x, G - 4*hN.lift), T('aF', hF.x, G - 4*hF.lift),
        T('lN', fN.x, G + ankOff[1] - 4*fN.lift), T('lF', fF.x, G + ankOff[1] - 4*fF.lift), {'lN.f':footF - 30*fN.lift, 'lF.f':footF - 30*fF.lift});
      return p;
    }};
}
function walkLungeDef(){
  // world coordinates; each half cycle is one lunge (stride 36) and the camera
  // tracks the hips. Feet are placed by their toes, so the old front foot rolls
  // onto its ball about a fixed point as it becomes the back foot.
  const X0 = 56, ST = 36, BT = 75;
  const half = (front, back, off, o) => [
    K(o+0,    {hx:off+X0-16, hy:G-21, t:-85}, toeAt(front, off+X0+6, G, 0), toeAt(back, off+X0-30, G, BT), L('aN',100,86), L('aF',100,86)),
    K(o+0.08, {}),
    K(o+0.2,  {hx:off+X0-4, hy:G-31, t:-88}, toeAt(back, off+X0-17, G-6, 45)),
    K(o+0.29, {hx:off+X0+2, hy:STAND+1.5}, toeAt(back, off+X0+9, G-7, 48), SIDE_HANG),
    K(o+0.4,  {hx:off+X0+10, hy:G-31}, toeAt(back, off+X0+ST+3, G-2, 18), toeAt(front, off+X0+6, G, 22)),
    K(o+0.44, {hx:off+X0+12, hy:G-29}, toeAt(back, off+X0+ST+6, G, 0), toeAt(front, off+X0+6, G, 40)),
  ];
  // the last key is the first one a full cycle (two strides) further on, so the loop is seamless
  const keys = [...half('lN','lF', 0, 0), ...half('lF','lN', ST, 0.5), half('lN','lF', 2*ST, 1)[0]];
  return {dur:3.6, still:0, travel:2*ST, keys,
    pre:(p, ph) => { p.cam = 2*ST*ph; return p; },
    pins:[['lN.toe', 0, 0.5], ['lF.toe', 0.44, 1]]};
}
function jumpLungeDef(){
  const FX = 58, BTX = 28, BT = 75;
  const lunge = (front, back) => Object.assign({hx:42, hy:G-21, t:-85}, toeAt(front, FX+6, G, 0), toeAt(back, BTX, G, BT));
  const air = (front, back, hy, x1, y1, f1, x2, y2, f2) => Object.assign({hx:43, hy, t:-88}, toeAt(front, x1, y1, f1), toeAt(back, x2, y2, f2));
  return {dur:2.2, still:0, keys:[
    K(0, lunge('lN','lF'), L('aN',125,95), L('aF',55,15)),
    K(0.12, air('lN','lF', G-33, FX+5, G, 35, BTX+2, G, 78), both(60,20)),
    K(0.24, air('lN','lF', G-40, 49, G-9, 40, 45, G-9, 45)),
    K(0.36, air('lF','lN', G-31, FX+5, G-1.5, 25, BTX+2, G-1, 70)),
    K(0.48, lunge('lF','lN'), L('aN',55,15), L('aF',125,95)),
    K(0.52, {}),
    K(0.62, air('lF','lN', G-33, FX+5, G, 35, BTX+2, G, 78), both(60,20)),
    K(0.74, air('lF','lN', G-40, 49, G-9, 40, 45, G-9, 45)),
    K(0.86, air('lN','lF', G-31, FX+5, G-1.5, 25, BTX+2, G-1, 70)),
    K(0.98, lunge('lN','lF'), L('aN',125,95), L('aF',55,15)),
  ]};
}
function burpeeDef(kind){
  // side view, facing right: the plank has the head to the right, feet back (left)
  const P = [62, G], FX = 46;   // hands land just in front of the feet
  const toeFor = S => { // toe position that puts a straight body's shoulder at S
    const al = solve(al => { const q = plankFromToe([0, G], al, 1); return shoulderOf(q)[1] - S[1]; }, -60, -0.5);
    const q = plankFromToe([0, G], al, 1); return [S[0] - shoulderOf(q)[0], al];
  };
  const Sp = [P[0], G - ARM + 0.6], [tx, alP] = toeFor(Sp), toe = [tx, G];
  const plank = al => plankFromToe(toe, al, 1);
  const alLow = solve(al => shoulderOf(plank(al))[1] - (G - 9.5), alP, 0);
  const pk = plank(alP), pkA = [pk.hx + LEG*Math.cos((alP+180)*D2R), pk.hy + LEG*Math.sin((alP+180)*D2R)];
  const plankLegs = Object.assign(toeAt('lN', ...toe, alP+90), toeAt('lF', ...toe, alP+90));
  const crouchLegs = Object.assign(toeAt('lN', FX+BONE.ft, G, 0), toeAt('lF', FX+BONE.ft, G, 0));
  // arm targets exist in every key (they are carried forward), so free-arm keys switch them off with w:0
  const hands = Object.assign(T('aN', ...P), T('aF', ...P), {'aN.w':1, 'aF.w':1});
  const free = {'aN.w':0, 'aF.w':0, 'lN.w':1, 'lF.w':1};
  const stand = Object.assign({hx:FX-1, hy:STAND, t:-90, n:0}, crouchLegs, SIDE_HANG, free);
  const squat = Object.assign({hx:FX-9, hy:72, t:-44, n:-10}, crouchLegs, both(35, 15), free);
  const crouch = Object.assign({hx:FX-7, hy:70, t:-28, n:-20}, crouchLegs, hands);
  const plankP = Object.assign({hx:pk.hx, hy:pk.hy, t:alP, n:0}, plankLegs, hands);
  const low = Object.assign({}, plankP, (() => { const q = plank(alLow); return Object.assign({hx:q.hx, hy:q.hy, t:alLow}, toeAt('lN', ...toe, alLow+90), toeAt('lF', ...toe, alLow+90)); })());
  const air = (o, h) => Object.assign({}, o, {hy:o.hy - h});
  const lift = (id, x, y, f) => toeAt(id, x, y, f);
  // mid-jump: the feet are in the air but the shoulders stay stacked over the planted hands
  const midT = -10, midH = add([P[0]+1, G-ARM+2], midT+180, BONE.torso);   // shoulders stay over the hands
  const mid = Object.assign({}, crouch, {hx:midH[0], hy:midH[1], t:midT});
  let keys;
  if(kind==='step'){
    const halfH = add([P[0]+1, G-ARM+2], -14+180, BONE.torso);
    const half = Object.assign({}, crouch, {hx:halfH[0], hy:halfH[1], t:-14}, lift('lN', ...toe, alP+90), lift('lF', FX+BONE.ft, G, 0));
    const stepN = Object.assign({}, half, lift('lN', (FX+toe[0])/2, G-6, 95));
    keys = [K(0, stand), K(0.06, stand), K(0.16, squat), K(0.24, crouch), K(0.31, stepN), K(0.37, half),
      K(0.44, Object.assign({}, half, lift('lF', (FX+toe[0])/2, G-6, 95))), K(0.5, plankP), K(0.58, plankP),
      K(0.64, Object.assign({}, half, lift('lF', (FX+toe[0])/2, G-6, 95))), K(0.7, half), K(0.77, stepN), K(0.83, crouch),
      K(0.9, squat)];
  } else {
    const jumpBack = Object.assign({}, mid, lift('lN', midH[0]-3, G-4, 105), lift('lF', midH[0]-3, G-4, 105));
    // take-off: hips pop up and the feet leave the floor before they travel back
    // weight shifts forward onto the hands (shoulders just past the wrists) so the hips rise
    const toT = -16, toH = add([P[0]+2, G-ARM+3], toT+180, BONE.torso);
    const takeoff = Object.assign({}, crouch, {hx:toH[0], hy:toH[1], t:toT});
    const base = [K(0, stand), K(0.05, stand), K(0.13, squat), K(0.2, crouch), K(0.225, takeoff), K(0.27, jumpBack), K(0.32, plankP)];
    const mid2 = kind==='half' ? [K(0.4, plankP)] : [K(0.36, plankP), K(0.46, low), K(0.5, low), K(0.58, plankP)];
    const o = kind==='half' ? 0.4 : 0.58;
    const back = [K(o+0.05, jumpBack), K(o+0.095, takeoff), K(o+0.12, crouch), K(o+0.18, squat)];
    const finish = kind==='half' ? [K(o+0.32, stand)] : kind==='full'
      ? [K(o+0.25, Object.assign({}, stand, {hy:STAND+3}, both(-80, -85))),
         K(o+0.31, Object.assign(air(stand, 7), lift('lN', FX+5, G-2, 60), lift('lF', FX+5, G-2, 60), both(-84, -88))),
         K(o+0.37, Object.assign({}, stand, {hy:STAND+3}, both(30, 20)))]
      : [K(o+0.25, Object.assign({}, stand, {hy:STAND+3}, both(-30, -40))),
         K(o+0.31, Object.assign(air(stand, 12), L('lN', 8, 110), L('lF', 8, 110), {'lN.f':60, 'lF.f':60, 'lN.w':0, 'lF.w':0}, both(30, -40), {t:-84})),
         K(o+0.37, Object.assign({}, stand, {hy:STAND+3}, both(40, 20)))];
    keys = [...base, ...mid2, ...back, ...finish].filter(k => k._t < 1);
  }
  return {face:1, dur:kind==='step' ? 6.5 : kind==='half' ? 3.8 : 5.2, still:kind==='full'||kind==='tuck' ? 0.46 : 0.5, keys,
    pins:[['aN.end', kind==='step' ? 0.24 : 0.2, kind==='step' ? 0.83 : 0.2 + (kind==='half' ? 0.32 : 0.5)]]};
}

/* ---- rendering ---- */
// Frame each move: a square viewBox (never smaller than 100 units, so every
// figure is drawn at the same scale) centred on everything the move touches.
function frameOf(def){
  if(def._vb) return def._vb;
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  const take = (x, y, r) => { x0 = Math.min(x0, x-r); x1 = Math.max(x1, x+r); y0 = Math.min(y0, y-r); y1 = Math.max(y1, y+r); };
  for(let i=0;i<48;i++){
    const q = pose(def, i/48), cx = q.cam;
    take(q.head[0]-cx, q.head[1], BONE.headR);
    Object.values(q.limbs).forEach(lb => [...lb.pts, lb.toe].forEach(pt => pt && take(pt[0]-cx, pt[1], 2.5)));
  }
  if(def.ext){ take(def.ext[0], def.ext[2], 1); take(def.ext[1], def.ext[2], 1); }
  // side views keep the floor in shot, so a tall move (hanging from a bar) also needs room down to it
  const W = Math.max(100, x1-x0+12, y1-y0+12, def.view==='top' ? 0 : FLOOR+10-y0), cxm = (x0+x1)/2, cym = (y0+y1)/2;
  let y = def.view==='top' ? cym - W/2 : lerp(FLOOR+6-W, cym-W/2, 0.85);
  if(def.view!=='top') y = Math.max(Math.min(y, y0-5), FLOOR+5-W);
  return (def._vb = [cxm-W/2, y, W]);
}
function svgPts(pts){ return 'M' + pts.map(q => q[0].toFixed(1)+' '+q[1].toFixed(1)).join('L'); }
function drawFig(svg, ph){
  const def = MOVES[svg.dataset.type];
  if(!def) return;
  const q = pose(def, ph), el = svg._el || (svg._el = {
    fig:svg.querySelector('.figure'), torso:svg.querySelector('.torso'), head:svg.querySelector('.head'),
    aN:svg.querySelector('.aN'), aF:svg.querySelector('.aF'), lN:svg.querySelector('.lN'), lF:svg.querySelector('.lF'),
    dyn:svg.querySelector('.dyn'), floor:svg.querySelector('.floor')});
  const cam = q.cam;
  el.fig.setAttribute('transform', cam ? `translate(${(-cam).toFixed(2)} 0)` : '');
  if(el.floor && (def.travel!==undefined || def.crawl)) el.floor.style.strokeDashoffset = cam.toFixed(2);
  const [H, S] = [q.H, q.S];
  let d;
  if(q.view==='head'){ d = svgPts([q.rF, q.rN]); q.head = [q.S[0], q.S[1] + 4.5]; }
  else if(q.c){
    const m = [(H[0]+S[0])/2, (H[1]+S[1])/2], nrm = dir(ang(H, S) - 90), cp = [m[0] + nrm[0]*q.c*2, m[1] + nrm[1]*q.c*2];
    d = `M${H[0].toFixed(1)} ${H[1].toFixed(1)}Q${cp[0].toFixed(1)} ${cp[1].toFixed(1)} ${S[0].toFixed(1)} ${S[1].toFixed(1)}`;
  } else d = svgPts([H, S]);
  if(def.bar && q.view!=='head') d += svgPts([q.rF, q.rN]);
  el.torso.setAttribute('d', d);
  el.head.setAttribute('cx', q.head[0].toFixed(1)); el.head.setAttribute('cy', q.head[1].toFixed(1));
  ['aN','aF','lN','lF'].forEach(id => {
    const lb = q.limbs[id], pts = lb.toe ? [...lb.pts, lb.toe] : lb.pts;
    el[id].setAttribute('d', q.view==='head' && id==='lN' ? '' : svgPts(pts));
  });
  if(el.dyn && def.dyn==='towel'){ const e = q.limbs.aN.pts[2]; el.dyn.setAttribute('d', svgPts([def.anchor, e])); }
}
function figureSVG(type){
  const def = MOVES[type] || MOVES.march;
  const travel = def.travel!==undefined || def.crawl;
  const [vx, vy, W] = frameOf(def);
  const floor = def.view==='top' ? '' : `<path class="floor${travel ? ' ticks' : ''}" d="M${(vx-20).toFixed(1)} ${FLOOR}H${(vx+W+20).toFixed(1)}"/>`;
  return `<svg class="fig t-${type}" data-type="${type}" viewBox="${[vx, vy, W, W].map(v => v.toFixed(1)).join(' ')}" aria-hidden="true">
    ${floor}${def.props || ''}${def.dyn ? '<path class="bar dyn"/>' : ''}
    <g class="figure"><path class="aF far"/><path class="lF far"/><path class="torso"/><circle class="head" r="${BONE.headR}"/><path class="lN"/><path class="aN"/></g>
  </svg>`;
}
/* FIGURE ENGINE END */

if (typeof module === 'object' && module.exports) module.exports = {MOVES, pose, frameOf, BONE, G, FLOOR, ARM, LEG, figureSVG, drawFig};
