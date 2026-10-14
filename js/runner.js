/* =========================================================
   RUNNER — the workout player's state machine. Pure: every action takes
   the current time, so timers are wall-clock based (a locked phone or a
   throttled background tab catches up exactly) and everything is testable.

   run = Runner.start(session, now)
   phases:
     ready   waiting for the user to start a timed move
     prep    short get-ready countdown before a timed move
     work    a set: reps (open-ended, user taps Done) or timed (counts down)
     rest    rest countdown; the next set follows automatically
     done    finished or ended early
   ========================================================= */
(function () {
  const NODE = typeof module === 'object' && module.exports;
  const lib = NODE ? require('./exercises.js') : { EX };
  const PREP = 5, START_PREP = 3, SWITCH = 5;
  const LIVE = 2000;   // a transition this close to "now" happened live (not on catch-up)

  const clone = o => JSON.parse(JSON.stringify(o));
  const workSteps = run => run.steps.filter(s => s.kind === 'work');
  const MAIN_KINDS = ['main', 'core', 'skill', 'finisher', 'easy'];

  /* Same estimate as the planner's (js/planner.js workEst) for a swapped-in set. */
  function workEst(s) {
    const e = lib.EX[s.id], sides = e.uni ? 2 : 1;
    if (s.mode === 'time') return s.alt ? s.sec : s.sec * sides + (e.uni ? SWITCH : 0);
    return Math.round(s.reps * e.tempo * sides) + (e.uni ? SWITCH : 0) + 4;
  }
  /* Seconds a timed step runs: per-side holds run both sides with a switch. */
  function duration(step) {
    const e = lib.EX[step.id];
    if (step.mode !== 'time') return 0;
    return e && e.uni && !step.alt ? step.sec * 2 + SWITCH : step.sec;
  }

  function start(session, now) {
    const run = {
      v: 1, sid: session.id, startedAt: now, endedAt: null, status: null,
      steps: clone(session.steps), blocks: clone(session.blocks.map(b => ({ kind: b.kind, label: b.label, format: b.format }))),
      i: 0, phase: 'ready', t0: now, t1: null, paused: false, pausedAt: null, pausedMs: 0, remain: null,
      results: {}, efforts: {}, swaps: [], lastAction: now,
    };
    enter(run, 0, now, { auto: false, live: true, first: true });
    return run;
  }

  /* Move to step i at time `at`. Pre-skipped work steps are passed over and
     any run of rests in between collapses into the longest one. */
  function enter(run, i, at, o) {
    const rests = [];
    while (i < run.steps.length) {
      const s = run.steps[i];
      if (s.kind === 'rest') { rests.push(i); i++; continue; }
      if (run.results[i] && run.results[i].skipped) { i++; continue; }
      break;
    }
    if (i >= run.steps.length) return finish(run, at, 'complete');
    if (rests.length && !o.first) {
      const r = rests.reduce((a, b) => run.steps[b].sec > run.steps[a].sec ? b : a);
      rests.filter(x => x !== r).forEach(x => { run.results[x] = { passed: true }; });
      run.i = r; run.phase = 'rest'; run.t0 = at; run.t1 = at + run.steps[r].sec * 1000;
      run.next = i;
      return run;
    }
    run.i = i; run.next = null;
    const s = run.steps[i];
    if (s.mode === 'reps') { run.phase = 'work'; run.t0 = at; run.t1 = null; return run; }
    // timed move
    if (o.first || !o.live) { run.phase = 'ready'; run.t0 = at; run.t1 = null; return run; }
    if (o.afterRest) { run.phase = 'work'; run.t0 = at; run.t1 = at + duration(s) * 1000; return run; }
    run.phase = 'prep'; run.t0 = at; run.t1 = at + PREP * 1000;
    return run;
  }

  function advance(run, at, o = {}) {
    const from = run.phase === 'rest' && run.next !== null ? run.next : run.i + 1;
    const afterRest = run.phase === 'rest';
    if (afterRest) run.results[run.i] = { passed: true };
    return enter(run, from, at, Object.assign({ live: true, afterRest }, o));
  }

  function finish(run, at, status) {
    run.phase = 'done'; run.t1 = null; run.next = null;
    run.endedAt = run.paused ? run.pausedAt : at;
    run.status = status;
    run.paused = false;
    return run;
  }

  /* ---------- user actions ---------- */
  function begin(run, now) {   // "Start" on a ready timed move
    if (run.paused || run.phase !== 'ready') return run;
    run.phase = 'prep'; run.t0 = now; run.t1 = now + START_PREP * 1000; run.lastAction = now;
    return run;
  }
  function complete(run, now, val) {   // "Done" on the current set
    if (run.paused || !['work', 'prep', 'ready'].includes(run.phase)) return run;
    const s = run.steps[run.i];
    let v = Number(val);
    if (s.mode === 'reps') v = Number.isFinite(v) && v >= 0 ? Math.round(v) : s.reps;
    else if (!Number.isFinite(v)) {
      // a timed set ended early: record the time actually held
      const held = run.phase === 'work' && run.t1 ? Math.max(0, (now - run.t0) / 1000) : 0;
      const e = lib.EX[s.id];
      v = Math.round(e && e.uni && !s.alt ? held / 2 : held);
    }
    run.results[run.i] = v > 0 ? { done: true, val: v } : { skipped: true };
    run.lastAction = now;
    return advance(run, now);
  }
  function skip(run, now) {   // skip this set, or the rest of the rest
    if (run.paused || run.phase === 'done') return run;
    if (run.phase !== 'rest') run.results[run.i] = { skipped: true };
    run.lastAction = now;
    return advance(run, now, run.phase === 'rest' ? {} : { afterRest: false });
  }
  function skipExercise(run, now) {   // every remaining set of this exercise in this block
    if (run.paused || run.phase === 'done') return run;
    const cur = run.phase === 'rest' && run.next !== null ? run.steps[run.next] : run.steps[run.i];
    if (!cur || cur.kind !== 'work') return run;
    run.steps.forEach((s, k) => {
      if (k >= (run.phase === 'rest' ? run.next : run.i) && s.kind === 'work' && s.id === cur.id && s.block === cur.block && !run.results[k]) run.results[k] = { skipped: true };
    });
    run.lastAction = now;
    if (run.phase === 'rest') {
      // keep resting; point "next" past the skipped sets (and the rests between them)
      let k = run.next;
      while (k < run.steps.length && (run.steps[k].kind === 'rest' || (run.results[k] && run.results[k].skipped))) k++;
      if (k >= run.steps.length) return finish(run, now, 'complete');
      run.next = k;
      return run;
    }
    return advance(run, now);
  }
  /* Replace the current exercise (and its remaining sets in this block) with another. */
  function swap(run, now, newId, target) {
    if (run.paused || run.phase === 'done' || !lib.EX[newId]) return run;
    const at = run.phase === 'rest' && run.next !== null ? run.next : run.i;
    const cur = run.steps[at];
    if (!cur || cur.kind !== 'work') return run;
    const oldId = cur.id;
    run.steps.forEach((s, k) => {
      if (k >= at && s.kind === 'work' && s.id === oldId && s.block === cur.block && !run.results[k]) {
        s.id = newId; s.swappedFrom = oldId;
        delete s.reps; delete s.sec; delete s.alt;
        Object.assign(s, target);
        if (s.mode === 'time' && cur.alt && lib.EX[newId].uni) s.alt = true;
        s.est = workEst(s);
      }
    });
    run.swaps.push({ at: now, from: oldId, to: newId });
    if (run.phase !== 'rest') enter(run, at, now, { live: true, afterRest: false, first: false });
    run.lastAction = now;
    return run;
  }
  function pause(run, now) {
    if (run.paused || run.phase === 'done') return run;
    run.paused = true; run.pausedAt = now;
    run.remain = run.t1 ? Math.max(0, run.t1 - now) : null;
    return run;
  }
  function resume(run, now) {
    if (!run.paused) return run;
    const d = Math.max(0, now - run.pausedAt);
    run.pausedMs += d; run.t0 += d;
    if (run.remain !== null) run.t1 = now + run.remain;
    run.paused = false; run.pausedAt = null; run.remain = null; run.lastAction = now;
    return run;
  }
  function adjustRest(run, now, deltaSec) {
    if (run.paused || run.phase !== 'rest') return run;
    run.t1 = Math.max(now + 1000, run.t1 + deltaSec * 1000);
    return run;
  }
  function setEffort(run, exId, effort) {
    if (['easy', 'solid', 'tough'].includes(effort)) run.efforts[exId] = effort;
    else delete run.efforts[exId];
    return run;
  }
  function end(run, now) {
    if (run.phase === 'done') return run;
    const total = workSteps(run).length, done = Object.keys(run.results).filter(k => run.results[k].done).length;
    return finish(run, now, done >= total ? 'complete' : 'partial');
  }

  /* Advance any timers that have run out. Transitions happen at the moment
     the timer ended, not "now", so time spent backgrounded is accounted for
     exactly. A timed move is only started automatically when that happens
     live; after catching up it waits for the user (never runs unattended). */
  function tick(run, now) {
    let guard = 0;
    while (!run.paused && run.phase !== 'done' && run.t1 !== null && now >= run.t1 && guard++ < 1000) {
      const at = run.t1, live = now - at < LIVE;
      if (run.phase === 'prep') {
        const s = run.steps[run.i];
        run.phase = 'work'; run.t0 = at; run.t1 = at + duration(s) * 1000;
      } else if (run.phase === 'work') {
        const s = run.steps[run.i];
        run.results[run.i] = { done: true, val: s.sec };
        advance(run, at, { live, afterRest: false });
      } else if (run.phase === 'rest') {
        advance(run, at, { live, afterRest: true });
      } else break;
    }
    return run;
  }

  /* ---------- reading the run ---------- */
  const activeMs = (run, now) => Math.max(0, (run.endedAt !== null ? run.endedAt : run.paused ? run.pausedAt : now) - run.startedAt - run.pausedMs);
  const current = run => run.phase === 'rest' && run.next !== null ? run.next : run.i;
  function remainingSec(run, now) {
    if (run.phase === 'done') return 0;
    const t = run.paused ? run.pausedAt : now;
    let sec = run.t1 ? Math.max(0, (run.t1 - t) / 1000) : 0;
    const from = run.phase === 'rest' ? (run.next !== null ? run.next : run.i + 1) : run.i + (run.phase === 'work' && run.t1 ? 1 : 0);
    if (run.phase === 'work' && !run.t1) sec += Math.max(0, run.steps[run.i].est - (t - run.t0) / 1000);
    if (run.phase === 'prep' || run.phase === 'ready') sec += duration(run.steps[run.i]);
    for (let k = (run.phase === 'prep' || run.phase === 'ready' || (run.phase === 'work' && !run.t1)) ? run.i + 1 : from; k < run.steps.length; k++) {
      if (run.results[k]) continue;
      sec += run.steps[k].est;
    }
    return Math.round(sec);
  }
  function progress(run) {
    const ws = run.steps.map((s, k) => [s, k]).filter(([s]) => s.kind === 'work');
    const total = ws.reduce((a, [s]) => a + s.est, 0) || 1;
    const done = ws.filter(([, k]) => run.results[k]).reduce((a, [s]) => a + s.est, 0);
    return Math.min(1, done / total);
  }
  /* The next work step after the current one (for "Up next"). */
  function upNext(run) {
    for (let k = current(run) + (run.phase === 'rest' ? 0 : 1); k < run.steps.length; k++) {
      const s = run.steps[k];
      if (s.kind === 'work' && !run.results[k]) return Object.assign({ index: k }, s);
    }
    return null;
  }
  /* Is this the last set of its exercise in this block? (effort prompt) */
  function lastSetOf(run, k) {
    const s = run.steps[k];
    return !run.steps.some((x, j) => j > k && x.kind === 'work' && x.id === s.id && x.block === s.block && !(run.results[j] && run.results[j].skipped));
  }

  /* ---------- summary & history ---------- */
  function summary(run, session, now) {
    const entries = new Map();
    run.steps.forEach((s, k) => {
      if (s.kind !== 'work') return;
      const kind = (run.blocks[s.block] || {}).kind || 'main';
      const key = s.id + '|' + kind;
      const e = entries.get(key) || { id: s.id, kind, role: lib.EX[s.id].role, mode: s.mode, target: s.mode === 'reps' ? s.reps : s.sec,
        planned: 0, reached: 0, sets: [], skipped: 0, swappedFrom: s.swappedFrom || null, alt: !!s.alt, effort: run.efforts[s.id] || null };
      e.planned++;
      const r = run.results[k];
      if (r && r.done) { e.sets.push(r.val); e.reached++; }
      else if (r && r.skipped) { e.skipped++; e.reached++; }
      entries.set(key, e);
    });
    const list = [...entries.values()];
    const main = list.filter(e => MAIN_KINDS.includes(e.kind));
    const sum = (arr, f) => arr.reduce((a, e) => a + f(e), 0);
    const allWork = workSteps(run).length;
    const doneWork = Object.values(run.results).filter(r => r.done).length;
    return {
      status: run.status || 'partial',
      activeSec: Math.round(activeMs(run, now) / 1000),
      plannedSec: session.est,
      completion: allWork ? doneWork / allWork : 0,
      setsDone: sum(main, e => e.sets.length), setsPlanned: sum(main, e => e.planned),
      reps: sum(main.filter(e => e.mode === 'reps'), e => e.sets.reduce((a, v) => a + v * (lib.EX[e.id].uni ? 2 : 1), 0)),
      holdSec: sum(main.filter(e => e.mode === 'time'), e => e.sets.reduce((a, v) => a + v * (lib.EX[e.id].uni && !e.alt ? 2 : 1), 0)),
      exercises: list,
      skippedSets: sum(main, e => e.skipped),
    };
  }
  /* The record stored in history (input to js/progress.js). */
  function historyEntry(run, session, now) {
    const sm = summary(run, session, now);
    return {
      v: 1, id: session.id + '@' + run.startedAt, at: run.startedAt, end: run.endedAt !== null ? run.endedAt : now,
      active: sm.activeSec, planned: session.est, minutes: session.minutes, focus: session.focus, structure: session.structure,
      title: session.title, status: sm.status, completion: Math.round(sm.completion * 100) / 100,
      entries: sm.exercises.filter(e => e.reached > 0).map(e => ({
        id: e.id, role: e.role, kind: e.kind, mode: e.mode, target: e.target, planned: e.reached, sets: e.sets,
        skipped: e.skipped, effort: e.effort, swappedFrom: e.swappedFrom,
      })),
    };
  }

  const api = {
    start, begin, complete, skip, skipExercise, swap, pause, resume, adjustRest, setEffort, end, tick,
    activeMs, remainingSec, progress, upNext, current, lastSetOf, duration, summary, historyEntry, MAIN_KINDS,
  };
  if (NODE) module.exports = api;
  else window.Runner = api;
})();
