// Shared fixtures for the unit tests: simulate doing a workout and build history.
const Planner = require('../../js/planner.js');
const Runner = require('../../js/runner.js');

const T0 = Date.UTC(2026, 9, 14, 7, 0);   // a fixed "now" for deterministic plans
const HOUR = 3600e3, DAY = 24 * HOUR;

/** Run a whole session: every rep set done at target (or `reps(step)`), every timer run out. */
function perform(session, start, { reps, effort, stopAfter } = {}) {
  let run = Runner.start(session, start), t = start, n = 0;
  while (run.phase !== 'done' && n++ < 5000) {
    if (stopAfter !== undefined && Object.values(run.results).filter(r => r.done).length >= stopAfter) { Runner.end(run, t); break; }
    if (run.phase === 'ready') Runner.begin(run, t);
    else if (run.phase === 'work' && run.t1 === null) {
      const s = run.steps[run.i];
      t += Math.round(s.est * 1000);
      if (effort && Runner.lastSetOf(run, run.i)) Runner.setEffort(run, s.id, effort(s));
      Runner.complete(run, t, reps ? reps(s) : s.reps);
    } else { t = run.t1; Runner.tick(run, t); }
  }
  return { run, end: t, entry: Runner.historyEntry(run, session, t), summary: Runner.summary(run, session, t) };
}

/** Train `days` sessions one per day and return the resulting history. */
function trainDays(days, opts) {
  const history = [];
  for (let d = 0; d < days; d++) {
    const now = T0 + d * DAY;
    const s = Planner.generate(Object.assign({ now, history }, opts));
    history.push(perform(s, now, opts.perform || {}).entry);
  }
  return history;
}

module.exports = { T0, HOUR, DAY, perform, trainDays };
