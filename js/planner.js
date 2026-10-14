/* =========================================================
   PLANNER — turns "I have N minutes" into a complete session.

   generate({minutes, profile, history, now, focus, variant, library})
     minutes   5..120 (clamped)
     profile   {level, goal, equipment:{bar,table,...}, avoid:[...]}
     history   training history (see js/progress.js); may be empty
     now       timestamp (ms) — the only clock the planner reads
     focus     'auto' (default) | 'full' | 'upper' | 'lower' | 'core' | 'mobility'
     variant   0,1,2… — "show me a different workout" (deterministic)
     library   optional list of exercise ids to choose from (tests)

   The result is deterministic for identical inputs. Every session is an
   explicit timeline (steps) whose estimated duration never exceeds the
   budget, and is filled to within FILL_TOLERANCE of it:
     warm-up → [skill] → main blocks → [core] → [finisher] → [mobility] → cool-down
   How the main work is organised depends on duration, goal, level, focus
   and what was trained recently:
     express      ≤7 min: one timed full-body circuit
     circuit      rep-based rounds through 3–6 moves
     intervals    timed conditioning circuit
     superset     antagonist pairs (push+pull, squat+hinge…)
     strength     pairs with low reps and full rest
     skill        technique practice first, then strength pairs
     core         a core-focused circuit
     mobility     recovery flow with light core stability
   ========================================================= */
(function () {
  const NODE = typeof module === 'object' && module.exports;
  const lib = NODE ? require('./exercises.js') : { EX, PATTERNS, EQUIPMENT, RESTRICTIONS };
  const Prog = NODE ? require('./progress.js') : window.Progress;
  const PAT = lib.PATTERNS, EQUIP = lib.EQUIPMENT, RESTR = lib.RESTRICTIONS;

  const MIN_MINUTES = 5, MAX_MINUTES = 120;
  const INTRO = 10;          // "get ready" before the first move
  const SETUP = 4;           // getting into position for a rep set
  const PREP = 5;            // get-ready countdown before a timed move that has no rest before it
  const SWITCH = 5;          // switching sides on a per-side move
  const EQUIP_CHANGE = 15;   // extra time to move to/from a bar, table, chair
  const BLOCK_CHANGE = 20;   // between blocks
  const FILL_TOLERANCE = 30; // the plan lands within this many seconds under the budget

  const LEVELS = {
    beginner:     { target: 1,   sets: [2, 3], cap: 20, restMul: 1.15, regionMul: 0.75 },
    intermediate: { target: 2,   sets: [3, 4], cap: 28, restMul: 1,    regionMul: 1 },
    advanced:     { target: 3.5, sets: [3, 5], cap: 36, restMul: 1,    regionMul: 1.25 },
  };
  const GOALS = {
    balanced:     { label: 'Balanced', band: [0.25, 0.7] },
    strength:     { label: 'Strength', band: [0, 0.45] },
    conditioning: { label: 'Conditioning', band: [0.5, 1] },
    skill:        { label: 'Skills', band: [0.1, 0.5] },
  };
  const FOCI = {
    auto:     { label: 'Auto' },
    full:     { label: 'Full body', name: 'Full-body' },
    upper:    { label: 'Upper', name: 'Upper-body' },
    lower:    { label: 'Lower', name: 'Lower-body' },
    core:     { label: 'Core', name: 'Core' },
    mobility: { label: 'Mobility', name: 'Mobility' },
  };
  const REGION_CAP = { push: 9, pull: 9, legs: 12, core: 8 };
  const REGION_NAME = { push: 'pushing muscles', pull: 'back', legs: 'legs', core: 'core' };

  // Movement slots. A slot resolves to the first pattern (in its order) that
  // has a suitable exercise, preferring patterns not yet used this session.
  // Pairs are antagonists or non-competing, so one recovers while the other works.
  const PAIRS = {
    full:  [['hpush', 'pull'], ['legsA', 'hinge'], ['vpush', 'pull2'], ['legsB', 'coreS']],
    upper: [['hpush', 'pull'], ['vpush', 'pull2'], ['hpush2', 'scap']],
    lower: [['squat', 'hinge'], ['single', 'coreS'], ['hinge2', 'calf'], ['single2', 'coreD']],
  };
  const CIRCUIT = {
    full:  ['hpush', 'legsA', 'pull', 'coreS', 'hinge', 'vpush', 'coreD', 'legsB'],
    upper: ['hpush', 'pull', 'coreS', 'vpush', 'pull2', 'coreD', 'scap'],
    lower: ['squat', 'hinge', 'coreS', 'single', 'calf', 'coreD', 'single2'],
    core:  ['coreS', 'coreD', 'hinge', 'coreS2', 'coreD2', 'scap'],
  };

  /* ---------- small deterministic helpers ---------- */
  function hash(str) {   // FNV-1a → [0,1)
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return ((h >>> 0) % 100000) / 100000;
  }
  const clone = o => JSON.parse(JSON.stringify(o));
  const round5 = x => Math.round(x / 5) * 5;
  const clampN = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const dayKey = t => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };

  /* ---------- inputs ---------- */
  function normProfile(p) {
    p = p && typeof p === 'object' ? p : {};
    const eqIn = Array.isArray(p.equipment) ? p.equipment : p.equipment && typeof p.equipment === 'object'
      ? Object.keys(p.equipment).filter(k => p.equipment[k]) : [];
    return {
      level: LEVELS[p.level] ? p.level : 'beginner',
      goal: GOALS[p.goal] ? p.goal : 'balanced',
      equipment: eqIn.filter(k => EQUIP[k]).sort(),
      avoid: (Array.isArray(p.avoid) ? p.avoid : []).filter(k => RESTR[k]).sort(),
    };
  }
  function normMinutes(m) {
    const n = Math.round(Number(m));
    return Number.isFinite(n) ? clampN(n, MIN_MINUTES, MAX_MINUTES) : 20;
  }

  function context(opts) {
    const profile = normProfile(opts.profile);
    const now = Number.isFinite(opts.now) ? opts.now : 0;
    const history = Prog.clean(opts.history);
    const minutes = normMinutes(opts.minutes);
    const variant = Math.max(0, Math.floor(Number(opts.variant) || 0));
    const pool = Array.isArray(opts.library) ? opts.library.filter(id => lib.EX[id]) : Object.keys(lib.EX);
    const eq = new Set(profile.equipment), avoid = new Set(profile.avoid);
    const ok = id => { const e = lib.EX[id]; return e.eq.every(q => eq.has(q)) && !e.stress.some(s => avoid.has(s)); };
    const fat = Prog.fatigue(history, now);
    const last = history[history.length - 1];
    return {
      profile, minutes, budget: minutes * 60, now, variant, history,
      L: LEVELS[profile.level], goal: profile.goal,
      ids: pool.filter(ok).sort(),
      prog: Prog.derive(history), fat, rec: Prog.recency(history, now),
      seed: `${dayKey(now)}|${minutes}|${history.length}|${variant}`,
      lastStructure: last && last.structure,
    };
  }

  /* ---------- exercise choice ---------- */
  function targetLevel(ctx, pattern) {
    const d = ctx.prog.level[pattern];
    return d !== undefined ? d : ctx.L.target;
  }
  // best exercise for one pattern, or null
  function pickFor(ctx, pattern, used, opts = {}) {
    const t = opts.level !== undefined ? opts.level : targetLevel(ctx, pattern);
    let cands = ctx.ids.filter(id => {
      const e = lib.EX[id];
      return !used.has(id) && e.pat.includes(pattern) && (opts.roles || ['main', 'cond']).includes(e.role) && (!opts.skill || e.skill);
    });
    if (!cands.length) return null;
    // never more than one step above the working level; if nothing that
    // easy exists (e.g. only a bar is available), allow the easiest option
    const maxLvl = Math.floor(t + 0.5) + (opts.stretch ? 1 : 0);
    const within = cands.filter(id => lib.EX[id].lvl <= maxLvl);
    if (within.length) cands = within;
    else {
      const easiest = Math.min(...cands.map(id => lib.EX[id].lvl));
      if (easiest > maxLvl + (opts.stretch || opts.skill ? 0 : 1)) return null;
      cands = cands.filter(id => lib.EX[id].lvl === easiest);
    }
    const strengthSlot = ctx.goal !== 'conditioning' && pattern !== 'cond';
    const score = id => {
      const e = lib.EX[id], h = ctx.rec.ex[id];
      return 3 * Math.abs(e.lvl - t) + (e.lvl > t ? 1.5 : 0)
        + (h === undefined ? 0 : h < 30 ? 1.2 : h < 80 ? 0.5 : 0)
        + (strengthSlot && e.pat.includes('cond') ? (ctx.goal === 'strength' ? 8 : 4) : 0)
        + (e.pat[0] === pattern ? 0 : 0.8)
        + hash(ctx.seed + id) * (ctx.variant ? 3 : 0.6);
    };
    return cands.map(id => [id, score(id)]).sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1))[0][0];
  }

  function slotPatterns(ctx, slot) {
    const r = ctx.rec.pat, older = (a, b) => (r[a] === undefined ? 1e9 : r[a]) >= (r[b] === undefined ? 1e9 : r[b]);
    const legs = older('single', 'squat') && r.single !== r.squat ? ['single', 'squat'] : ['squat', 'single'];
    const pulls = older('hpull', 'vpull') && r.hpull !== r.vpull ? ['hpull', 'vpull', 'scap'] : ['vpull', 'hpull', 'scap'];
    const base = slot.replace(/2$/, '');
    return {
      legsA: legs, legsB: [legs[1], legs[0]], pull: pulls, vpush: ['vpush', 'hpush'], coreD: ['coreD', 'coreS'],
      squat: ['squat', 'single'], single: ['single', 'squat'],
    }[base] || [base];
  }
  function resolveSlot(ctx, slot, used, usedPat) {
    const pats = slotPatterns(ctx, slot), second = /2$/.test(slot) || slot === 'legsB';
    const order = second ? pats : [...pats.filter(p => !usedPat.has(p)), ...pats.filter(p => usedPat.has(p))];
    // first pattern whose best option suits the user's level; otherwise the first that has anything
    let fallback = null;
    for (const p of order) {
      const region = PAT[p].region;
      if (ctx.skipRegions && ctx.skipRegions.has(region)) continue;
      const id = pickFor(ctx, p, used);
      if (!id) continue;
      if (Math.abs(lib.EX[id].lvl - targetLevel(ctx, p)) <= 1.5) return { id, pattern: p };
      if (!fallback) fallback = { id, pattern: p };
    }
    return fallback;
  }

  /* Rep or hold target for an exercise in this context. */
  function targetFor(ctx, id, kind = 'main') {
    const e = lib.EX[id], [lo, hi] = e.m === 'time' ? e.sec : e.reps;
    const span = hi - lo;
    if (kind === 'skill') {
      return e.m === 'time' ? { mode: 'time', sec: round5(clampN(lo + span * 0.2, 10, 30)) } : { mode: 'reps', reps: clampN(Math.round(lo + 1), 2, 5) };
    }
    const band = GOALS[ctx.goal].band;
    const lvlPos = { beginner: 0, intermediate: 0.5, advanced: 1 }[ctx.profile.level];
    let v = lo + span * (band[0] + (band[1] - band[0]) * lvlPos);
    const p = ctx.prog.ex[id];
    if (p && Number.isFinite(p.next)) v = p.next;
    v = clampN(v, lo, hi);
    return e.m === 'time' ? { mode: 'time', sec: round5(v) } : { mode: 'reps', reps: Math.round(v) };
  }
  const item = (ctx, id, kind) => Object.assign({ id }, targetFor(ctx, id, kind));

  /* ---------- timeline ---------- */
  // Estimated seconds for one work step (excluding any rest after it).
  function workEst(it, prevRest) {
    const e = lib.EX[it.id], sides = e.uni ? 2 : 1;
    if (it.mode === 'time') return it.alt ? it.sec + (prevRest ? 0 : PREP) : it.sec * sides + (e.uni ? SWITCH : 0) + (prevRest ? 0 : PREP);
    return Math.round(it.reps * e.tempo * sides) + (e.uni ? SWITCH : 0) + SETUP;
  }
  const equipKey = id => lib.EX[id].eq.join('+') || 'floor';

  /* Flatten blocks into the step list the player walks through. */
  function buildSteps(plan) {
    const steps = [];
    const rest = (sec, block, why) => { if (sec > 0) steps.push({ kind: 'rest', sec: Math.round(sec), est: Math.round(sec), block, why }); };
    const work = (it, block, set, sets, label) => {
      const prev = steps[steps.length - 1];
      steps.push(Object.assign({ kind: 'work', block, set, sets, label }, it, { est: workEst(it, prev && prev.kind === 'rest') }));
    };
    plan.blocks.forEach((b, bi) => {
      if (bi > 0 && steps.length) {
        const prevWork = [...steps].reverse().find(s => s.kind === 'work');
        const change = prevWork && b.items[0] && equipKey(prevWork.id) !== equipKey(b.items[0].id) ? EQUIP_CHANGE : 0;
        if (b.kind === 'cool' || plan.blocks[bi - 1].kind === 'warm') rest(BLOCK_CHANGE / 2 + change, bi, 'block');
        else rest(BLOCK_CHANGE + change, bi, 'block');
      }
      if (b.format === 'flow') {
        const R = b.rounds || 1;
        for (let r = 1; r <= R; r++) b.items.forEach(it => work(it, bi, r, R, null));
        return;
      }
      const R = b.rounds;
      for (let r = 1; r <= R; r++) {
        b.items.forEach((it, j) => {
          const label = b.format === 'superset' ? `${b.tag}${j + 1}` : b.format === 'circuit' ? `${j + 1}` : null;
          work(it, bi, r, R, label);
          const lastItem = j === b.items.length - 1;
          if (!lastItem) {
            const change = equipKey(it.id) !== equipKey(b.items[j + 1].id) ? EQUIP_CHANGE : 0;
            rest(b.restIn + change, bi, b.format === 'circuit' ? 'next' : 'pair');
          } else if (r < R) {
            const change = b.items.length > 1 && equipKey(it.id) !== equipKey(b.items[0].id) ? EQUIP_CHANGE : 0;
            rest(b.restAfter + change, bi, 'set');
          }
        });
      }
    });
    steps.forEach((s, i) => { s.i = i; });
    return steps;
  }
  const estimate = steps => INTRO + steps.reduce((a, s) => a + s.est, 0);
  const planEst = plan => estimate(buildSteps(plan));

  /* ---------- volume accounting ---------- */
  function hardSets(plan) {
    const by = { push: 0, pull: 0, legs: 0, core: 0, total: 0 };
    for (const b of plan.blocks) {
      if (['warm', 'cool', 'mobility', 'cardio', 'easy'].includes(b.kind)) continue;
      for (const it of b.items) {
        const e = lib.EX[it.id];
        const light = ['scap', 'calf'].includes(e.pat[0]) || (e.pat[0] === 'coreS' && e.lvl <= 2);
        const w = (b.kind === 'skill' ? 0.5 : 1) * (e.role === 'cond' || light ? 0.5 : 1);
        const reg = PAT[e.pat[0]].region;
        if (by[reg] !== undefined) by[reg] += b.rounds * w;
        if (e.pat[0] === 'cond') by.legs += b.rounds * 0.3;
        by.total += b.rounds * w;
      }
    }
    return by;
  }
  function withinCaps(ctx, plan) {
    const hs = hardSets(plan);
    if (hs.total > ctx.L.cap) return false;
    for (const r of Object.keys(REGION_CAP)) if (hs[r] > ctx.regionCap[r] + 0.01) return false;
    return true;
  }

  /* ---------- warm-up & cool-down ---------- */
  const WARM_TIME = m => m <= 6 ? 40 : m <= 7 ? 45 : m <= 12 ? 90 : m <= 19 ? 150 : m <= 29 ? 180 : m <= 44 ? 240 : m <= 74 ? 360 : 480;
  const COOL_TIME = m => m <= 6 ? 0 : m <= 7 ? 30 : m <= 14 ? 60 : m <= 29 ? 120 : m <= 44 ? 180 : 240;

  function warmup(ctx, regions, budget) {
    const want = [];
    // general pulse-raiser first, then joints for the work that follows, then spine
    want.push('general');
    if (regions.has('push') || regions.has('pull')) want.push('upper');
    if (regions.has('legs')) want.push('lower');
    want.push('spine', 'core', 'upper', 'lower', 'general');
    const pool = ctx.ids.filter(id => lib.EX[id].role === 'warm' || (lib.EX[id].warm && lib.EX[id].role !== 'main'));
    const chosen = [], used = new Set();
    let t = 0;
    for (const area of want) {
      if (t >= budget - 15) break;
      const opts = pool.filter(id => !used.has(id) && (lib.EX[id].warm || []).includes(area)
        && !(lib.EX[id].role === 'cond' && ctx.profile.level === 'beginner'));
      if (!opts.length) continue;
      const id = opts.sort((a, b) => ((lib.EX[a].role !== 'warm') - (lib.EX[b].role !== 'warm')) || (lib.EX[a].lvl - lib.EX[b].lvl) || hash(ctx.seed + 'w' + a) - hash(ctx.seed + 'w' + b))[0];
      const e = lib.EX[id], sec = clampN(round5((budget - t) / (e.uni ? 2 : 1)), e.sec[0], 40);
      used.add(id); chosen.push({ id, mode: 'time', sec });
      t += sec * (e.uni ? 2 : 1) + PREP;
    }
    return chosen;
  }

  function cooldown(ctx, regions, budget) {
    const pool = ctx.ids.filter(id => lib.EX[id].role === 'cool');
    const want = [];
    if (regions.has('push') || regions.has('pull')) want.push('upper');
    if (regions.has('legs')) want.push('lower');
    want.push('spine', 'lower', 'upper', 'spine', 'lower', 'upper', 'lower', 'upper');
    const chosen = [], used = new Set();
    let t = 0;
    if (budget <= 0) return chosen;
    for (const area of want) {
      const opts = pool.filter(id => !used.has(id) && (lib.EX[id].stretch || []).includes(area));
      if (!opts.length) continue;
      const id = opts.sort((a, b) => hash(ctx.seed + 'c' + a) - hash(ctx.seed + 'c' + b))[0];
      const e = lib.EX[id], cost = 30 * (e.uni ? 2 : 1) + (e.uni ? SWITCH : 0) + PREP;
      if (t + cost > budget && chosen.length) break;
      if (t + cost > budget + 10) break;
      used.add(id); chosen.push({ id, mode: 'time', sec: 30 });
      t += cost;
    }
    return chosen;
  }

  /* ---------- focus ---------- */
  function chooseFocus(ctx, requested) {
    const F = ctx.fat, st = r => Prog.status(F[r]);
    const tired = r => st(r) !== 'fresh';
    if (requested && requested !== 'auto' && FOCI[requested]) {
      const note = ['push', 'pull', 'legs', 'core'].filter(r => st(r) !== 'fresh' && regionsOf(requested).has(r));
      return { focus: requested, auto: false, reason: note.length
        ? `Your ${note.map(r => REGION_NAME[r]).join(' and ')} trained hard recently, so that volume is reduced.` : '' };
    }
    if (!ctx.history.length) return { focus: 'full', auto: true, reason: 'First session: a balanced full-body workout to learn where you are.' };
    const hardAll = ['push', 'pull', 'legs'].every(r => st(r) === 'fatigued');
    const upperTired = tired('push') && tired('pull'), legsTired = tired('legs');
    if (hardAll || (upperTired && legsTired && ctx.minutes >= 20)) {
      return { focus: 'mobility', auto: true, reason: "You've trained hard recently. Today is about recovery: mobility and easy core work." };
    }
    if (upperTired && legsTired) return { focus: 'core', auto: true, reason: 'Upper body and legs are both recovering, so this short one is core-focused.' };
    if (legsTired && !upperTired && ctx.minutes >= 10) return { focus: 'upper', auto: true, reason: 'Your legs are still recovering, so today leans upper body.' };
    if ((upperTired || (tired('push') && ctx.minutes < 30)) && !legsTired && ctx.minutes >= 10) {
      return { focus: 'lower', auto: true, reason: 'Your upper body is still recovering, so today leans lower body.' };
    }
    const part = ['push', 'pull', 'legs', 'core'].filter(tired);
    return { focus: 'full', auto: true, reason: part.length
      ? `Full body, with less work for your ${part.map(r => REGION_NAME[r]).join(' and ')} while they recover.`
      : 'You are recovered: full body today.' };
  }
  function regionsOf(focus) {
    return new Set({ full: ['push', 'pull', 'legs', 'core'], upper: ['push', 'pull', 'core'], lower: ['legs', 'core'],
      core: ['core'], mobility: [] }[focus] || []);
  }

  function chooseStructure(ctx, focus) {
    const m = ctx.minutes, g = ctx.goal;
    if (focus === 'mobility') return 'mobility';
    if (m <= 7) return 'express';
    if (focus === 'core') return 'core';
    if (g === 'conditioning') return m >= 30 ? 'superset' : 'intervals';
    if (g === 'strength') return m < 15 ? 'superset' : 'strength';
    if (g === 'skill') return m >= 15 && ctx.profile.level !== 'beginner' ? 'skill' : m >= 12 ? 'superset' : 'circuit';
    if (m < 12) return 'circuit';
    if (m < 25) return ctx.lastStructure === 'circuit' ? 'superset' : 'circuit';
    return 'superset';
  }

  /* ---------- main-block builders ---------- */
  function resolveList(ctx, slots, used, usedPat) {
    const out = [];
    for (const s of slots) {
      const r = resolveSlot(ctx, s, used, usedPat);
      if (!r) continue;
      used.add(r.id); usedPat.add(r.pattern); out.push(r);
    }
    return out;
  }

  /* Greedy fill: repeatedly apply the highest-priority upgrade that still fits
     the time budget and the volume caps. Restarting from the top after each
     success keeps the priorities (e.g. finish sets before adding exercises). */
  function grow(ctx, plan, actions, mainBudget) {
    let changed = true, guard = 0;
    while (changed && guard++ < 200) {
      changed = false;
      for (const act of actions) {
        const next = act(plan);
        if (next && planEst(next) <= mainBudget && withinCaps(ctx, next)) { plan = next; changed = true; break; }
      }
    }
    return plan;
  }

  function restFor(ctx, kind) {
    const m = ctx.L.restMul;
    const base = {
      superset: [30, 60], strength: [60, 105], skill: [0, 90], circuit: [15, 60], core: [15, 40],
      intervals: [15, 45], express: [10, 20], finisher: [15, 40],
    }[kind];
    return { restIn: round5(base[0] * m), restAfter: round5(base[1] * m) };
  }

  function buildMain(ctx, structure, focus, shell, budget) {
    const used = new Set(), usedPat = new Set();
    const tagFor = n => String.fromCharCode(65 + n);
    let plan = clone(shell);
    const mainIdx = () => { const i = plan.blocks.findIndex(b => b.kind === 'cool'); return i < 0 ? plan.blocks.length : i; };
    const insert = (p, block, before) => { const q = clone(p); const at = q.blocks.findIndex(b => b.kind === (before || 'cool')); q.blocks.splice(at < 0 ? q.blocks.length : at, 0, block); return q; };
    const fcs = CIRCUIT[focus] ? focus : 'full';

    if (structure === 'express' || structure === 'intervals') {
      // timed circuit: every move is an interval, reps as quality allows
      const slots = structure === 'express' ? CIRCUIT[fcs].slice(0, 4) : CIRCUIT[fcs].slice(0, 5);
      // intervals flow without setup: prefer floor-only moves when there are enough
      const floor = Object.assign({}, ctx, { ids: ctx.ids.filter(id => !lib.EX[id].eq.length) });
      let moves = resolveList(floor, slots, new Set(used), new Set(usedPat));
      if (moves.length < 3) moves = resolveList(ctx, slots, used, usedPat);
      else moves.forEach(mv => { used.add(mv.id); usedPat.add(mv.pattern); });
      if (structure === 'intervals') {
        // weave conditioning moves between the strength moves
        const cond = []; const u2 = new Set(used);
        for (let k = 0; k < 2; k++) { const id = pickFor(ctx, 'cond', u2, { roles: ['cond', 'main'] }); if (id) { u2.add(id); cond.push({ id, pattern: 'cond' }); } }
        cond.forEach(c => used.add(c.id));
        moves = moves.slice(0, 4); if (cond[0]) moves.splice(2, 0, cond[0]); if (cond[1]) moves.push(cond[1]);
      }
      if (!moves.length) return null;
      const r = restFor(ctx, structure);
      const n0 = structure === 'express' ? 3 : 4;
      // per-side moves alternate sides within the interval
      const timedItem = (id, sec) => Object.assign({ id, mode: 'time', sec }, lib.EX[id].uni ? { alt: true } : {});
      const make = (n, rounds, work, rIn, rAfter) => {
        const q = clone(plan);
        q.blocks.splice(mainIdx(), 0, { kind: 'main', format: 'circuit', tag: 'C', label: structure === 'express' ? 'Express circuit' : 'Interval circuit',
          rounds, restIn: rIn, restAfter: rAfter, timed: true,
          items: moves.slice(0, n).map(mv => timedItem(mv.id, work)) });
        return q;
      };
      // search the small grid of (moves, rounds, work) for the most work that fits
      let best = null, bestVal = -1;
      const W = structure === 'express' ? [20, 25, 30, 35, 40] : [30, 35, 40, 45];
      for (let n = Math.min(n0, moves.length); n <= moves.length; n++) {
        for (let rounds = 2; rounds <= 8; rounds++) for (const w of W) {
          const q = make(n, rounds, w, r.restIn, r.restAfter);
          if (planEst(q) > budget) continue;
          // value: total work, with a preference for moderate intervals and more variety
          const val = n * rounds * w + n * 15 - Math.abs(w - 30) * 2;
          if (val > bestVal) { bestVal = val; best = q; }
        }
      }
      if (!best) best = make(Math.min(moves.length, 2), 1, 20, r.restIn, 0);
      return best;
    }

    if (structure === 'circuit' || structure === 'core') {
      const list = resolveList(ctx, CIRCUIT[structure === 'core' ? 'core' : fcs], used, usedPat);
      if (!list.length) return null;
      const r = restFor(ctx, structure === 'core' ? 'core' : 'circuit');
      const block = n => ({ kind: 'main', format: 'circuit', tag: 'C', label: structure === 'core' ? 'Core circuit' : 'Circuit',
        rounds: 2, restIn: r.restIn, restAfter: r.restAfter, items: list.slice(0, n).map(mv => item(ctx, mv.id)) });
      plan = insert(plan, block(Math.min(3, list.length)));
      const bi = () => plan.blocks.findIndex(b => b.kind === 'main');
      const maxRounds = ctx.L.sets[1] + (ctx.profile.level === 'advanced' ? 0 : 0);
      const actions = [
        // cover push, legs, pull and core before adding rounds
        p => { const b = p.blocks[bi()]; if (b.items.length >= Math.min(list.length, 4)) return null; const q = clone(p); q.blocks[bi()].items.push(item(ctx, list[b.items.length].id)); return q; },
        p => p.blocks[bi()].rounds < 3 ? (q => { q.blocks[bi()].rounds++; return q; })(clone(p)) : null,
        p => { const b = p.blocks[bi()]; if (b.items.length >= Math.min(list.length, 5)) return null; const q = clone(p); q.blocks[bi()].items.push(item(ctx, list[b.items.length].id)); return q; },
        p => p.blocks[bi()].rounds < maxRounds ? (q => { q.blocks[bi()].rounds++; return q; })(clone(p)) : null,
        p => { const b = p.blocks[bi()]; if (b.items.length >= list.length) return null; const q = clone(p); q.blocks[bi()].items.push(item(ctx, list[b.items.length].id)); return q; },
      ];
      plan = grow(ctx, plan, actions, budget);
      return addExtras(ctx, plan, structure, focus, used, usedPat, budget);
    }

    // superset / strength / skill
    const pairsSrc = PAIRS[fcs] || PAIRS.full;
    const pairs = [];
    for (const pr of pairsSrc) {
      const got = resolveList(ctx, pr, used, usedPat);
      if (got.length) pairs.push(got);
    }
    if (!pairs.length) return null;
    const kind = structure === 'strength' ? 'strength' : 'superset';
    const r = restFor(ctx, kind);
    const strengthCtx = structure === 'strength' ? Object.assign({}, ctx, { goal: 'strength' }) : ctx;
    const pairBlock = (k) => ({ kind: 'main', format: pairs[k].length > 1 ? 'superset' : 'straight', tag: tagFor(k),
      label: pairs[k].length > 1 ? `Superset ${tagFor(k)}` : `Block ${tagFor(k)}`, rounds: 2,
      restIn: r.restIn, restAfter: r.restAfter, items: pairs[k].map(mv => item(strengthCtx, mv.id)) });
    plan = insert(plan, pairBlock(0));

    // skill practice goes first, while fresh
    if (structure === 'skill') {
      const skillIds = [];
      const su = new Set(used);
      for (const p of ['hpush', 'vpush', 'single', 'coreS']) {
        const id = pickFor(ctx, p, su, { skill: true, stretch: true });
        if (id) { skillIds.push(id); su.add(id); }
        if (skillIds.length === 2) break;
      }
      if (skillIds.length) {
        const rs = restFor(ctx, 'skill');
        const sk = { kind: 'skill', format: 'superset', tag: 'S', label: 'Skill practice', rounds: 3, restIn: 45, restAfter: rs.restAfter,
          items: skillIds.map(id => item(ctx, id, 'skill')) };
        if (skillIds.length === 1) { sk.format = 'straight'; sk.restIn = 0; }
        const q = insert(plan, sk, 'main');
        if (planEst(q) <= budget) plan = q;
      }
    }
    const mains = p => p.blocks.map((b, i) => [b, i]).filter(([b]) => b.kind === 'main');
    const setsTo = target => p => {
      const hit = mains(p).find(([b]) => b.rounds < target);
      if (!hit) return null;
      const q = clone(p); q.blocks[hit[1]].rounds++; return q;
    };
    const addPair = p => {
      const n = mains(p).length;
      if (n >= pairs.length) return null;
      return insert(p, pairBlock(n), firstAfterMain(p));
    };
    const base = ctx.L.sets[0], max = ctx.L.sets[1] + (structure === 'strength' ? 1 : 0);
    plan = grow(ctx, plan, [setsTo(base), addPair], budget);
    plan = addExtras(ctx, plan, structure, focus, used, usedPat, budget);
    plan = grow(ctx, plan, [setsTo(Math.min(max, base + 1)), setsTo(max)], budget);
    return plan;
  }
  // the first block that follows the main work (core/finisher/mobility/cool)
  function firstAfterMain(p) {
    const k = ['core', 'finisher', 'cardio', 'mobility', 'cool'].find(kind => p.blocks.some(b => b.kind === kind));
    return k;
  }

  /* Core block, conditioning finisher and (long sessions) skill + mobility. */
  function addExtras(ctx, plan, structure, focus, used, usedPat, budget) {
    const insertBefore = (p, block, kinds) => {
      const q = clone(p);
      let at = q.blocks.findIndex(b => kinds.includes(b.kind));
      if (at < 0) at = q.blocks.length;
      q.blocks.splice(at, 0, block); return q;
    };
    const coreDone = plan.blocks.some(b => b.kind === 'main' && b.items.some(it => /core/.test(lib.EX[it.id].pat[0])));
    // core block
    if (structure !== 'core' && focus !== 'core') {
      const u = new Set(used), up = new Set(usedPat);
      const slots = coreDone ? ['coreD', 'scap'] : ['coreS', 'coreD'];
      const list = resolveList(ctx, slots, u, up);
      if (list.length) {
        const r = restFor(ctx, 'core');
        const block = { kind: 'core', format: list.length > 1 ? 'circuit' : 'straight', tag: 'K', label: 'Core', rounds: 2, restIn: r.restIn, restAfter: r.restAfter,
          items: list.map(mv => item(ctx, mv.id)) };
        const q = insertBefore(plan, block, ['finisher', 'mobility', 'cool']);
        if (planEst(q) <= budget && withinCaps(ctx, q)) { plan = q; list.forEach(mv => { used.add(mv.id); usedPat.add(mv.pattern); }); }
      }
    }
    // conditioning finisher: balanced/conditioning goals with time to spare
    if ((ctx.goal === 'conditioning' || (ctx.goal === 'balanced' && ctx.minutes >= 40)) && structure !== 'intervals') {
      const u = new Set(used), ids = [];
      for (let k = 0; k < 2; k++) { const id = pickFor(ctx, 'cond', u, { roles: ['cond', 'main'] }); if (id) { u.add(id); ids.push(id); } }
      if (ids.length) {
        const r = restFor(ctx, 'finisher');
        const block = { kind: 'finisher', format: 'circuit', tag: 'F', label: 'Finisher', rounds: 2, restIn: r.restIn, restAfter: r.restAfter, timed: true,
          items: ids.map(id => Object.assign({ id, mode: 'time', sec: 30 }, lib.EX[id].uni ? { alt: true } : {})) };
        const q = insertBefore(plan, block, ['mobility', 'cool']);
        if (planEst(q) <= budget && withinCaps(ctx, q)) { plan = q; ids.forEach(id => used.add(id)); }
      }
    }
    // core rounds 3 if there is room
    plan = grow(ctx, plan, [p => { const i = p.blocks.findIndex(b => b.kind === 'core'); if (i < 0 || p.blocks[i].rounds >= 3) return null; const q = clone(p); q.blocks[i].rounds++; return q; }], budget);

    // long sessions: technique practice (low fatigue) up front, then a mobility block
    if (ctx.minutes >= 45 && structure !== 'skill' && ctx.profile.level !== 'beginner') {
      const u = new Set(used), ids = [];
      for (const p of ['vpush', 'hpush', 'single', 'coreS', 'hpull']) {
        const id = pickFor(ctx, p, u, { skill: true });
        if (id) { ids.push(id); u.add(id); }
        if (ids.length === 2) break;
      }
      if (ids.length) {
        const block = { kind: 'skill', format: ids.length > 1 ? 'superset' : 'straight', tag: 'S', label: 'Technique practice', rounds: 3,
          restIn: ids.length > 1 ? 45 : 0, restAfter: 75, items: ids.map(id => item(ctx, id, 'skill')) };
        const q = insertBefore(plan, block, ['main', 'core', 'finisher', 'cool']);
        if (planEst(q) <= budget && withinCaps(ctx, q)) { plan = q; ids.forEach(id => used.add(id)); }
      }
    }
    return plan;
  }

  /* Long sessions: a mobility block between the work and the cool-down —
     distinct moves (not the ones in the warm-up or cool-down), 45s each. */
  function mobilityBlock(ctx, budget, plan, exclude, cap) {
    const pool = ctx.ids.filter(id => lib.EX[id].role === 'cool' || lib.EX[id].pat.includes('mob'));
    const ids = pool.filter(id => !exclude.has(id)).sort((a, b) => hash(ctx.seed + 'm' + a) - hash(ctx.seed + 'm' + b));
    if (!ids.length) return plan;
    let q = clone(plan);
    const at = q.blocks.findIndex(b => b.kind === 'cool');
    q.blocks.splice(at < 0 ? q.blocks.length : at, 0, { kind: 'mobility', format: 'flow', tag: 'M', label: 'Mobility', rounds: 1, items: [] });
    const mi = () => q.blocks.findIndex(b => b.kind === 'mobility');
    let t = 0;
    for (const id of ids) {
      const tryQ = clone(q); tryQ.blocks[mi()].items.push({ id, mode: 'time', sec: 45 });
      const cost = planEst(tryQ) - planEst(q);
      if (planEst(tryQ) > budget || t + cost > (cap || 1e9)) break;
      q = tryQ; t += cost;
    }
    return q.blocks[mi()].items.length ? q : plan;
  }

  /* Long sessions: easy, steady cardio (low impact when asked) — aerobic
     base without adding to the strength fatigue. */
  function cardioBlock(ctx, budget, plan) {
    const ids = ['jumpingJacksLight', 'highKneesLight', 'jumpingJacks', 'bearCrawl', 'mountainClimbers']
      .filter(id => ctx.ids.includes(id)).slice(0, 3);
    if (!ids.length) return plan;
    const q = clone(plan);
    const at = q.blocks.findIndex(b => ['mobility', 'cool'].includes(b.kind));
    q.blocks.splice(at < 0 ? q.blocks.length : at, 0, { kind: 'cardio', format: 'flow', tag: 'E', label: 'Easy cardio', rounds: 2,
      items: ids.map(id => ({ id, mode: 'time', sec: 60 })) });
    return planEst(q) <= budget ? q : plan;
  }

  /* Never over budget: trim the cool-down, warm-up, then the main work. */
  function shrink(plan, budget) {
    let guard = 0;
    while (planEst(plan) > budget && guard++ < 100) {
      const q = clone(plan);
      const blk = k => q.blocks.find(b => b.kind === k);
      const mains = q.blocks.filter(b => !['warm', 'cool'].includes(b.kind));
      const last = mains[mains.length - 1];
      if (blk('cool') && blk('cool').items.length > 1) blk('cool').items.pop();
      else if (blk('warm') && blk('warm').items.length > 1) blk('warm').items.pop();
      else if (last && last.rounds > 1) last.rounds--;
      else if (last && last.items.length > 1) last.items.pop();
      else if (mains.length > 1) q.blocks.splice(q.blocks.indexOf(last), 1);
      else if (blk('cool')) q.blocks.splice(q.blocks.indexOf(blk('cool')), 1);
      else break;
      plan = q;
    }
    return plan;
  }

  /* ---------- slack: land just under the budget ---------- */
  function fill(ctx, plan, budget) {
    let est = planEst(plan);
    const tryP = q => { const e = planEst(q); if (e <= budget) { plan = q; est = e; return true; } return false; };
    const left = () => budget - est;
    const idx = kind => plan.blocks.findIndex(b => b.kind === kind);
    const long = ctx.minutes >= 60;
    const timed = () => {   // timed circuits: longer intervals
      for (let pass = 0; pass < 6 && left() > 10; pass++) {
        let moved = false;
        plan.blocks.forEach((b, i) => {
          if (!b.timed) return;
          const q = clone(plan); let ch = false;
          q.blocks[i].items.forEach(it => { if (it.sec < 45) { it.sec += 5; ch = true; } });
          if (ch && tryP(q)) moved = true;
        });
        if (!moved) break;
      }
    };
    const restBase = plan.blocks.map(b => b.restAfter || 0);
    const rests = extra => {   // fuller rest between sets / rounds
      for (let pass = 0; pass < 40 && left() > 10; pass++) {
        let moved = false;
        for (let i = 0; i < plan.blocks.length; i++) {
          const b = plan.blocks[i];
          if (b.format === 'flow' || b.rounds < 2 || b.restAfter >= restBase[i] + extra) continue;
          const q = clone(plan); q.blocks[i].restAfter += 5; if (tryP(q)) moved = true;
        }
        if (!moved) break;
      }
    };
    const holds = (kind, cap) => {
      for (let pass = 0; pass < 30 && left() >= 5; pass++) {
        const i = idx(kind); if (i < 0) return;
        let moved = false;
        for (let j = 0; j < plan.blocks[i].items.length && left() >= 5; j++) {
          const it = plan.blocks[i].items[j];
          if (it.mode !== 'time' || it.sec >= cap) continue;
          const q = clone(plan); q.blocks[i].items[j].sec += 5; if (tryP(q)) moved = true;
        }
        if (!moved) return;
      }
    };
    const stretches = () => {   // more (distinct) cool-down stretches
      const i = idx('cool'); if (i < 0) return;
      const pool = ctx.ids.filter(id => lib.EX[id].role === 'cool').sort((a, b) => hash(ctx.seed + 'x' + a) - hash(ctx.seed + 'x' + b));
      for (const id of pool) {
        if (left() < 40) return;
        if (plan.blocks.some(b => b.items.some(it => it.id === id))) continue;
        const q = clone(plan); q.blocks[idx('cool')].items.push({ id, mode: 'time', sec: 30 }); tryP(q);
      }
    };
    const flowRounds = (kind, max) => {
      for (let g = 0; g < max && left() > FILL_TOLERANCE; g++) {
        const i = idx(kind); if (i < 0) return;
        const q = clone(plan); q.blocks[i].rounds++; if (!tryP(q)) return;
      }
    };
    timed();
    if (long) {
      rests(60); holds('mobility', 60); holds('warm', 45); holds('cool', 45); holds('cardio', 90);
      flowRounds('mobility', 1); flowRounds('cardio', 2); rests(90); stretches(); flowRounds('mobility', 2);
    } else { holds('warm', 45); stretches(); rests(ctx.minutes <= 20 ? 30 : 45); holds('cool', 60); rests(60); }
    holds('cool', 60);
    holds('mobility', 90);
    holds('warm', 60);
    holds('cool', 90);
    // last resort for very long or very restricted plans: more mobility rounds, then longer holds
    if (left() > FILL_TOLERANCE && idx('mobility') < 0 && idx('cool') >= 0) tryP(mobilityBlock(ctx, budget, plan, new Set()));
    for (let g = 0; g < 20 && left() > FILL_TOLERANCE; g++) {
      const before = est;
      flowRounds('mobility', 1); flowRounds('cardio', 1); holds('mobility', 120); holds('cardio', 120); holds('cool', 120);
      if (est === before) break;
    }
    // absorb what is left with one more mobility hold sized to fit
    for (let g = 0; g < 10 && left() > FILL_TOLERANCE; g++) {
      const pool = ctx.ids.filter(id => lib.EX[id].role === 'cool' && !lib.EX[id].uni);
      if (!pool.length) break;
      // a single-round flow takes the remainder exactly; a multi-round one only if it divides well
      const fits = k => { const b = plan.blocks[k]; return k >= 0 && (left() / (b.rounds || 1)) - PREP >= 20; };
      const i = [idx('cool'), idx('mobility')].find(fits);
      if (i === undefined) break;
      const q = clone(plan), b = q.blocks[i];
      const id = pool[g % pool.length], sec = clampN(Math.floor((left() / (b.rounds || 1) - PREP) / 5) * 5, 20, 120);
      b.items.push({ id, mode: 'time', sec });
      if (!tryP(q)) break;
    }
    return plan;
  }

  /* ---------- mobility / recovery session ---------- */
  function buildMobility(ctx, shell, budget) {
    let plan = clone(shell);
    const used = new Set(plan.blocks.flatMap(b => b.items.map(it => it.id)));
    // light core stability (no hard sets) for sessions of 15+ minutes
    if (ctx.minutes >= 15) {
      const u = new Set(used), ids = [];
      for (const p of ['coreS', 'coreS']) { const id = pickFor(ctx, p, u, { level: 1 }); if (id) { ids.push(id); u.add(id); } }
      if (ids.length) {
        const q = clone(plan), at = q.blocks.findIndex(b => b.kind === 'cool');
        q.blocks.splice(at, 0, { kind: 'easy', format: 'circuit', tag: 'K', label: 'Easy core', rounds: 2, restIn: 15, restAfter: 30,
          items: ids.map(id => Object.assign({ id }, lib.EX[id].m === 'time' ? { mode: 'time', sec: lib.EX[id].sec[0] } : { mode: 'reps', reps: lib.EX[id].reps[0] })) });
        if (planEst(q) <= budget) { plan = q; ids.forEach(id => used.add(id)); }
      }
    }
    return mobilityBlock(ctx, budget, plan, used);
  }

  /* ---------- the generator ---------- */
  function generate(opts = {}) {
    const ctx = context(opts);
    let { focus, auto, reason } = chooseFocus(ctx, opts.focus);
    // region caps: reduced for anything still recovering
    ctx.regionCap = {};
    for (const r of Object.keys(REGION_CAP)) {
      const s = Prog.status(ctx.fat[r]);
      ctx.regionCap[r] = REGION_CAP[r] * ctx.L.regionMul * (s === 'fatigued' ? 0.35 : s === 'recovering' ? 0.6 : 1);
    }
    // in auto full-body sessions, skip regions that are fully fatigued
    if (auto && focus === 'full') ctx.skipRegions = new Set(['push', 'pull', 'legs'].filter(r => Prog.status(ctx.fat[r]) === 'fatigued'));

    let structure = chooseStructure(ctx, focus);
    const budget = ctx.budget;
    const regions = regionsOf(focus === 'mobility' ? 'full' : focus);
    const shell = (warmT, coolT) => ({ blocks: [
      { kind: 'warm', format: 'flow', tag: 'W', label: 'Warm-up', rounds: 1, items: warmup(ctx, regions, warmT) },
      { kind: 'cool', format: 'flow', tag: 'Z', label: 'Cool-down', rounds: 1, items: cooldown(ctx, regions, coolT) },
    ].filter(b => b.items.length) });
    let plan = null;
    const sh = shell(WARM_TIME(ctx.minutes), COOL_TIME(ctx.minutes));
    if (structure !== 'mobility') {
      plan = buildMain(ctx, structure, focus, sh, budget);
      if (plan && plan.blocks.some(b => b.items.length && (b.kind === 'main' || b.kind === 'core'))) {
        if (ctx.minutes >= 75) plan = cardioBlock(ctx, budget, plan);
        if (ctx.minutes >= 60) plan = mobilityBlock(ctx, budget, plan, new Set(plan.blocks.flatMap(b => b.items.map(it => it.id))), ctx.minutes * 60 * 0.15);
      } else plan = null;
    }
    if (!plan) {
      // nothing suitable for the requested work (restrictions / tiny library): recover instead
      if (structure !== 'mobility') reason = 'Nothing in your current settings fits a strength session, so this is a mobility session.';
      structure = 'mobility'; focus = 'mobility';
      plan = buildMobility(ctx, sh, budget);
    }
    plan = shrink(plan, budget);
    plan = fill(ctx, plan, budget);
    const steps = buildSteps(plan);
    const est = estimate(steps);

    // ---------- describe it ----------
    const mainBlocks = plan.blocks.filter(b => !['warm', 'cool'].includes(b.kind));
    const mainIds = mainBlocks.flatMap(b => b.items.map(it => it.id));
    const patterns = [...new Set(mainIds.map(id => lib.EX[id].pat[0]))];
    const fname = (FOCI[focus] && FOCI[focus].name) || 'Full-body';
    const title = {
      express: `${fname} express`, circuit: `${fname} circuit`, intervals: `${fname} intervals`,
      superset: `${fname} supersets`, strength: `${fname} strength`, skill: `Skills + ${fname.toLowerCase()} strength`,
      core: 'Core circuit', mobility: 'Mobility & recovery',
    }[structure];
    const parts = mainBlocks.map(b => b.kind === 'main'
      ? (b.format === 'circuit' ? `${b.rounds} rounds × ${b.items.length} moves` : b.format === 'superset' ? `${b.items.length === 2 ? 'Superset' : 'Block'} ${b.tag} × ${b.rounds}` : `${b.label} × ${b.rounds}`)
      : b.label);
    const mergedParts = [];
    parts.forEach(p => { const last = mergedParts[mergedParts.length - 1]; if (last && last.p === p) last.n++; else mergedParts.push({ p, n: 1 }); });
    const subtitle = mergedParts.map(x => x.n > 1 ? `${x.p} ×${x.n}` : x.p).join(' · ');
    const notes = [];
    const hasEq = q => ctx.profile.equipment.includes(q);
    if (['full', 'upper'].includes(focus) && structure !== 'mobility' && !mainIds.some(id => ['hpull', 'vpull'].includes(lib.EX[id].pat[0]))
        && !hasEq('bar') && !hasEq('table') && !hasEq('towel')) {
      notes.push('No pulling equipment selected, so upper-back work stands in for rows and pull-ups. Add a bar, table or towel in Settings to unlock them.');
    }
    if (ctx.minutes >= 75 && structure !== 'mobility') {
      const extras = [plan.blocks.some(b => b.kind === 'skill') && 'technique', 'fuller rest', plan.blocks.some(b => b.kind === 'cardio') && 'easy cardio',
        plan.blocks.some(b => b.kind === 'mobility') && 'mobility'].filter(Boolean);
      notes.push(`Long session: past the hard sets, the extra time goes to ${extras.join(', ').replace(/, ([^,]*)$/, ' and $1')} rather than more fatiguing volume.`);
    }
    if (ctx.minutes <= 10 && structure !== 'mobility') notes.push('Short and sharp. It won\'t match a longer session, but it keeps the habit and the strength ticking over.');
    if (steps.length && ctx.budget - est > FILL_TOLERANCE) notes.push('Your settings leave only a few suitable exercises, so this session is shorter than the time you have.');
    if (ctx.profile.avoid.length) notes.push(`Leaving out moves that load: ${ctx.profile.avoid.map(a => RESTR[a].label.toLowerCase()).join(', ')}. Stop any exercise that causes pain.`);

    return {
      v: 1,
      id: `${ctx.now.toString(36)}-${ctx.minutes}-${ctx.variant}`,
      createdAt: ctx.now, minutes: ctx.minutes, budget, est,
      focus, focusAuto: auto, reason, structure, title, subtitle,
      level: ctx.profile.level, goal: ctx.goal, profile: ctx.profile, variant: ctx.variant,
      blocks: plan.blocks.map(b => ({ kind: b.kind, format: b.format, tag: b.tag, label: b.label, rounds: b.rounds || 1,
        restIn: b.restIn || 0, restAfter: b.restAfter || 0, items: b.items })),
      steps, patterns, hardSets: Math.round(hardSets(plan).total * 10) / 10, notes,
      empty: steps.length === 0,
    };
  }

  /* Alternatives for "swap this exercise": same primary pattern, available
     with the user's equipment and restrictions, closest in difficulty. */
  function substitutes(id, opts = {}) {
    const e = lib.EX[id];
    if (!e) return [];
    const ctx = context(Object.assign({}, opts, { minutes: 20 }));
    const exclude = new Set(opts.exclude || []);
    const pats = e.role === 'warm' || e.role === 'cool' ? [e.pat[0]] : e.pat;
    return ctx.ids
      .filter(x => x !== id && !exclude.has(x) && lib.EX[x].role === e.role && lib.EX[x].pat.some(p => pats.includes(p)))
      .map(x => [x, Math.abs(lib.EX[x].lvl - e.lvl) * 2 + (lib.EX[x].lvl > e.lvl ? 1 : 0) + (lib.EX[x].pat[0] === e.pat[0] ? 0 : 1.5)])
      .sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1))
      .slice(0, 4).map(x => x[0]);
  }
  function targetForId(id, opts = {}) {
    const ctx = context(Object.assign({}, opts, { minutes: 20 }));
    return targetFor(ctx, id);
  }

  const api = {
    generate, buildSteps, estimate, substitutes, targetFor: targetForId, workEst, normProfile, normMinutes,
    MIN_MINUTES, MAX_MINUTES, FILL_TOLERANCE, LEVELS, GOALS, FOCI, INTRO,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else window.Planner = api;
})();
