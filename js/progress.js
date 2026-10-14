/* =========================================================
   PROGRESS — everything the app knows about the user is derived from the
   training history, so it is deterministic and survives data changes:
   - per-exercise targets (progressive overload with a success streak),
   - per-pattern working level (when to unlock a harder variation),
   - per-region fatigue (recovery-aware planning),
   - personal records.

   History session (stored, see index.html):
     {id, at, end, active, planned, minutes, focus, structure, title, status,
      entries:[{id, role, m:'reps'|'time', target, planned, sets:[n,...],
                skipped, effort:'easy'|'solid'|'tough'|null, swappedFrom}]}
   ========================================================= */
(function () {
  const lib = typeof module === 'object' && module.exports ? require('./exercises.js') : { EX, PATTERNS };
  const H = 3600 * 1000;

  /* Only well-formed sessions count; anything else is ignored, never thrown on. */
  function clean(history) {
    if (!Array.isArray(history)) return [];
    return history
      .filter(s => s && typeof s === 'object' && Number.isFinite(s.at) && Array.isArray(s.entries))
      .map(s => Object.assign({}, s, {
        end: Number.isFinite(s.end) ? s.end : s.at,
        entries: s.entries.filter(e => e && lib.EX[e.id] && Array.isArray(e.sets)),
      }))
      .sort((a, b) => a.at - b.at);
  }

  const vals = e => e.sets.map(Number).filter(v => Number.isFinite(v) && v > 0);
  const range = ex => ex.m === 'time' ? ex.sec : ex.reps;
  const stepOf = ex => ex.m === 'time' ? 5 : (range(ex)[1] - range(ex)[0] >= 10 ? 2 : 1);

  /* Per-exercise progression.
     - A success = every planned set done at (or above) target, not rated "tough".
     - Targets rise after two successes in a row, or one rated "easy" — never
       blindly after every workout.
     - Two misses in a row step the target back down.
     - Topping out the working range marks the exercise "ready": the planner
       may then offer the next variation in the pattern (one level at a time). */
  function derive(history) {
    const sessions = clean(history);
    const ex = {};
    for (const s of sessions) {
      for (const e of s.entries) {
        const def = lib.EX[e.id];
        if (def.role !== 'main' && def.role !== 'cond') continue;
        const done = vals(e);
        if (!done.length) continue;
        const [lo, hi] = range(def);
        const r = ex[e.id] || (ex[e.id] = { next: null, best: 0, exposures: 0, streak: 0, misses: 0, ready: false, lastAt: 0, lastEffort: null });
        const target = Number.isFinite(e.target) && e.target > 0 ? e.target : done[0];
        const planned = Number.isFinite(e.planned) && e.planned > 0 ? e.planned : done.length;
        r.exposures++;
        r.lastAt = s.end;
        r.lastEffort = e.effort || null;
        r.best = Math.max(r.best, ...done);
        if (e.mode && e.mode !== def.m) continue;      // timed intervals of a rep exercise: no rep target info
        const hitAll = done.length >= planned && done.every(v => v >= target);
        const step = stepOf(def);
        let next = target;
        if (hitAll && e.effort !== 'tough') {
          r.misses = 0;
          r.streak++;
          if (e.effort === 'easy' || r.streak >= 2) { next = target + step; r.streak = 0; }
        } else {
          r.streak = 0;
          if (!hitAll) {
            r.misses++;
            if (r.misses >= 2) { next = Math.max(lo, target - step); r.misses = 0; }
          }
        }
        r.ready = next > hi || (r.ready && next >= hi);
        r.next = Math.min(hi, Math.max(lo, next));
      }
    }
    // working level per pattern: the hardest variation the user has trained
    // successfully, +1 once it is topped out, -1 while it is being missed
    const level = {};
    for (const [id, r] of Object.entries(ex)) {
      const def = lib.EX[id], p = def.pat[0];
      const eff = r.ready ? def.lvl + 1 : r.misses >= 1 && r.exposures <= 1 ? def.lvl - 1 : def.lvl;
      level[p] = Math.max(level[p] || 0, Math.min(5, Math.max(1, eff)));
    }
    return { ex, level };
  }

  /* Recovery: each completed set loads the regions its patterns train,
     decaying with a ~30h time constant (about 20% left after two days).
     Effort shifts the load a little. */
  const REGIONS = ['push', 'pull', 'legs', 'core'];
  function fatigue(history, now) {
    const F = { push: 0, pull: 0, legs: 0, core: 0 };
    for (const s of clean(history)) {
      const h = (now - s.end) / H;
      if (h < -1 || h > 120) continue;
      const decay = Math.exp(-Math.max(0, h) / 30);
      for (const e of s.entries) {
        const def = lib.EX[e.id];
        if (def.role !== 'main' && def.role !== 'cond') continue;
        const n = vals(e).length * (e.effort === 'tough' ? 1.3 : e.effort === 'easy' ? 0.8 : 1);
        def.pat.forEach((p, i) => {
          const w = i === 0 ? 1 : 0.5;
          if (p === 'cond') { F.legs += n * 0.4 * w * decay; F.core += n * 0.2 * w * decay; return; }
          const reg = lib.PATTERNS[p] && lib.PATTERNS[p].region;
          if (F[reg] !== undefined) F[reg] += n * w * decay;
        });
      }
    }
    REGIONS.forEach(r => { F[r] = Math.round(F[r] * 10) / 10; });
    return F;
  }
  const status = f => f >= 6 ? 'fatigued' : f >= 3 ? 'recovering' : 'fresh';

  /* Hours since each exercise and pattern was last trained (main work only). */
  function recency(history, now) {
    const ex = {}, pat = {};
    for (const s of clean(history)) {
      const h = Math.max(0, (now - s.end) / H);
      for (const e of s.entries) {
        if (!vals(e).length) continue;
        const def = lib.EX[e.id];
        ex[e.id] = h;
        if (def.role === 'main' || def.role === 'cond') pat[def.pat[0]] = h;
      }
    }
    return { ex, pat };
  }

  /* Best set ever per exercise (reps, or seconds for holds). */
  function records(history) {
    const best = {};
    for (const s of clean(history)) for (const e of s.entries) {
      const v = vals(e);
      if (!v.length || (e.mode && e.mode !== lib.EX[e.id].m)) continue;
      best[e.id] = Math.max(best[e.id] || 0, ...v);
    }
    return best;
  }

  /* Personal records and milestones a just-finished session earned,
     compared with everything before it. */
  function achievements(prior, session) {
    const before = records(prior), seenBefore = new Set(clean(prior).flatMap(s => s.entries.filter(e => vals(e).length).map(e => e.id)));
    // hardest variation done so far in each pattern
    const maxLvl = {};
    seenBefore.forEach(id => { const d = lib.EX[id]; if (d.role === 'main' || d.role === 'cond') maxLvl[d.pat[0]] = Math.max(maxLvl[d.pat[0]] || 0, d.lvl); });
    const out = [];
    for (const e of (session && session.entries) || []) {
      const def = lib.EX[e.id];
      if (!def || (def.role !== 'main' && def.role !== 'cond')) continue;
      const v = vals(e);
      if (!v.length) continue;
      const top = Math.max(...v);
      if (!seenBefore.has(e.id)) {
        const p = def.pat[0];
        if (maxLvl[p] && def.lvl > maxLvl[p]) out.push({ kind: 'unlock', id: e.id, value: top });
        else out.push({ kind: 'first', id: e.id, value: top });
      } else if (top > (before[e.id] || 0) && (!e.mode || e.mode === def.m)) {
        out.push({ kind: 'pr', id: e.id, value: top, prev: before[e.id] || 0, unit: def.m === 'time' ? 's' : 'reps' });
      }
    }
    return out;
  }

  /* Week-level stats for the home screen and history. */
  function stats(history, now) {
    const s = clean(history);
    const day = 24 * H, week = s.filter(x => now - x.end < 7 * day);
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const startOf = new Date(now); startOf.setHours(0, 0, 0, 0);
      const d0 = startOf.getTime() - i * day, d1 = d0 + day;
      days.push(s.some(x => x.at >= d0 && x.at < d1));
    }
    return {
      total: s.length,
      weekSessions: week.length,
      weekMinutes: Math.round(week.reduce((a, x) => a + (x.active || 0), 0) / 60),
      last: s[s.length - 1] || null,
      days,
    };
  }

  const api = { derive, fatigue, status, recency, records, achievements, stats, clean, REGIONS };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else window.Progress = api;
})();
