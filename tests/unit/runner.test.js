const test = require('node:test');
const assert = require('node:assert/strict');
const Planner = require('../../js/planner.js');
const R = require('../../js/runner.js');
const { EX } = require('../../js/exercises.js');
const { T0, perform } = require('./helpers.js');

const plan = (minutes = 20, extra = {}) => Planner.generate(Object.assign({ now: T0, minutes, profile: { level: 'intermediate' } }, extra));
// advance the run to the first rep-based set in the main work
function toFirstRepSet(run, t) {
  let n = 0;
  while (!(run.phase === 'work' && run.t1 === null) && n++ < 200) {
    if (run.phase === 'ready') R.begin(run, t); else { t = run.t1; R.tick(run, t); }
  }
  return t;
}

test('starts ready on the first move and walks warm-up timers automatically', () => {
  const s = plan(), run = R.start(s, T0);
  assert.equal(run.phase, 'ready');
  R.begin(run, T0);
  assert.equal(run.phase, 'prep');
  R.tick(run, T0 + 3000);
  assert.equal(run.phase, 'work');
  assert.equal(run.t1, T0 + 3000 + R.duration(s.steps[0]) * 1000);
  R.tick(run, run.t1 + 100);   // live: next warm-up move gets a get-ready countdown
  assert.equal(run.results[0].done, true);
  assert.equal(run.i, 1);
  assert.equal(run.phase, 'prep');
});

test('set completion logs the reps done, then the rest runs and the next set follows', () => {
  const s = plan(25), run = R.start(s, T0);
  let t = toFirstRepSet(run, T0);
  const k = run.i, step = run.steps[k];
  R.complete(run, t + 20000, step.reps - 2);
  assert.deepEqual(run.results[k], { done: true, val: step.reps - 2 });
  assert.equal(run.phase, 'rest');
  const restEnd = run.t1;
  R.tick(run, restEnd - 1);
  assert.equal(run.phase, 'rest');
  R.tick(run, restEnd);
  assert.notEqual(run.phase, 'rest');
  assert.ok(run.i > k);
});

test('rest timer: adjust, skip', () => {
  const s = plan(25), run = R.start(s, T0);
  let t = toFirstRepSet(run, T0);
  R.complete(run, t, undefined);
  const end = run.t1;
  R.adjustRest(run, t, 15);
  assert.equal(run.t1, end + 15000);
  R.adjustRest(run, t, -600);
  assert.equal(run.t1, t + 1000, 'never below one second');
  R.skip(run, t + 10);
  assert.notEqual(run.phase, 'rest');
});

test('pause freezes timers and is excluded from active time', () => {
  const s = plan(), run = R.start(s, T0);
  R.begin(run, T0); R.tick(run, T0 + 3000);
  const left = run.t1 - (T0 + 10000);
  R.pause(run, T0 + 10000);
  R.tick(run, T0 + 600000);                 // ten minutes paused: nothing advances
  assert.equal(run.phase, 'work');
  assert.equal(run.i, 0);
  assert.equal(R.activeMs(run, T0 + 600000), 10000);
  R.resume(run, T0 + 600000);
  assert.equal(run.t1, T0 + 600000 + left, 'the remaining time is kept');
  assert.equal(R.activeMs(run, T0 + 605000), 15000);
  // actions are ignored while paused
  R.pause(run, T0 + 605000);
  const before = JSON.stringify(run);
  R.complete(run, T0 + 606000); R.skip(run, T0 + 606000);
  assert.equal(JSON.stringify(run), before);
});

test('backgrounding: timers catch up exactly, but nothing new starts unattended', () => {
  const s = plan(), run = R.start(s, T0);
  R.begin(run, T0);
  // phone locked for an hour during the first warm-up move
  R.tick(run, T0 + 3600e3);
  assert.equal(run.results[0].done, true, 'the running move finished');
  assert.equal(run.i, 1);
  assert.equal(run.phase, 'ready', 'the next timed move waits for the user');
  assert.ok(!run.results[1]);
});

test('backgrounding during a rest: the rest ends at its real time and the set is waiting', () => {
  const s = plan(25), run = R.start(s, T0);
  let t = toFirstRepSet(run, T0);
  R.complete(run, t);
  const restEnd = run.t1;
  R.tick(run, restEnd + 5 * 60e3);
  const step = run.steps[run.i];
  if (step.mode === 'reps') { assert.equal(run.phase, 'work'); assert.equal(run.t0, restEnd); }
  else assert.equal(run.phase, 'ready');
});

test('skipping a set and skipping an exercise', () => {
  const s = plan(30), run = R.start(s, T0);
  let t = toFirstRepSet(run, T0);
  const k = run.i, id = run.steps[k].id;
  R.skip(run, t);
  assert.deepEqual(run.results[k], { skipped: true });
  // skip every remaining set of the next exercise
  t = toFirstRepSet(run, t);
  const cur = run.steps[run.i];
  R.skipExercise(run, t);
  const rest = run.steps.map((x, j) => [x, j]).filter(([x, j]) => x.kind === 'work' && x.id === cur.id && x.block === cur.block && j >= run.i);
  assert.ok(rest.every(([, j]) => run.results[j] && run.results[j].skipped || j === run.i));
  assert.notEqual(run.steps[run.i].id, cur.id);
  // no two rests in a row came out of the skip
  assert.ok(run.phase !== 'rest' || run.next !== null);
  void id;
});

test('swapping an exercise replaces its remaining sets', () => {
  const s = plan(30, { profile: { level: 'intermediate', equipment: [] } }), run = R.start(s, T0);
  const t = toFirstRepSet(run, T0);
  const cur = Object.assign({}, run.steps[run.i]);
  const alt = Planner.substitutes(cur.id, { profile: s.profile })[0];
  R.swap(run, t, alt, Planner.targetFor(alt, { profile: s.profile }));
  const left = run.steps.filter((x, j) => j >= run.i && x.kind === 'work' && x.block === cur.block && x.swappedFrom === cur.id);
  assert.ok(left.length >= 1);
  assert.ok(left.every(x => x.id === alt));
  assert.ok(!run.steps.some((x, j) => j >= run.i && x.id === cur.id && x.block === cur.block));
  assert.equal(run.swaps[0].from, cur.id);
  assert.equal(run.steps[run.i].est, Planner.workEst(run.steps[run.i], false), 'time estimate follows the new exercise');
});

test('ending early reports a partial session honestly', () => {
  const s = plan(30);
  const { run, summary, entry } = perform(s, T0, { stopAfter: 6 });
  assert.equal(run.status, 'partial');
  assert.equal(summary.status, 'partial');
  assert.ok(summary.completion < 1);
  assert.ok(summary.setsDone < summary.setsPlanned);
  assert.ok(entry.entries.every(e => e.planned >= e.sets.length));
  // exercises never reached are not recorded as attempted
  const reached = new Set(entry.entries.map(e => e.id));
  assert.ok(s.steps.filter(x => x.kind === 'work').some(x => !reached.has(x.id)));
});

test('a full run reports an accurate summary', () => {
  const s = plan(20);
  const { run, summary, end } = perform(s, T0);
  assert.equal(run.status, 'complete');
  assert.equal(summary.completion, 1);
  assert.equal(summary.setsDone, summary.setsPlanned);
  const main = s.steps.filter(x => x.kind === 'work' && R.MAIN_KINDS.includes(s.blocks[x.block].kind));
  assert.equal(summary.setsPlanned, main.length);
  const reps = main.filter(x => x.mode === 'reps').reduce((a, x) => a + x.reps * (EX[x.id].uni ? 2 : 1), 0);
  assert.equal(summary.reps, reps);
  assert.equal(summary.activeSec, Math.round((end - T0) / 1000));
  // the estimate is honest: a run at the estimated pace takes about the planned time
  assert.ok(Math.abs(summary.activeSec - s.est) < 60, `${summary.activeSec} vs ${s.est}`);
});

test('the run state survives a JSON round trip (refresh / storage)', () => {
  const s = plan(20), run = R.start(s, T0);
  R.begin(run, T0); R.tick(run, T0 + 4000);
  const back = JSON.parse(JSON.stringify(run));
  R.tick(back, T0 + 3600e3);
  R.tick(run, T0 + 3600e3);
  assert.deepEqual(back, run);
});

test('remaining time counts down as the workout progresses', () => {
  const s = plan(20), run = R.start(s, T0);
  const r0 = R.remainingSec(run, T0);
  assert.ok(Math.abs(r0 - (s.est - Planner.INTRO)) < 15, `${r0} vs ${s.est}`);
  R.begin(run, T0); R.tick(run, T0 + 20000);
  assert.ok(R.remainingSec(run, T0 + 20000) < r0);
  assert.ok(R.progress(run) >= 0 && R.progress(run) < 1);
});
