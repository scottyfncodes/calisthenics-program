const test = require('node:test');
const assert = require('node:assert/strict');
const Progress = require('../../js/progress.js');
const Planner = require('../../js/planner.js');
const { EX } = require('../../js/exercises.js');
const { T0, HOUR, DAY } = require('./helpers.js');

// one-exercise history session
const sess = (d, id, target, sets, effort, extra = {}) => ({
  id: 's' + d, at: T0 + d * DAY, end: T0 + d * DAY + 1800e3, structure: 'superset',
  entries: [Object.assign({ id, role: EX[id].role, mode: EX[id].m, target, planned: sets.length, sets, effort: effort || null }, extra)],
});

test('a target rises only after two successes in a row', () => {
  const h = [sess(0, 'pushup', 10, [10, 10, 10], 'solid')];
  assert.equal(Progress.derive(h).ex.pushup.next, 10, 'one success: hold');
  h.push(sess(2, 'pushup', 10, [10, 10, 10], 'solid'));
  assert.equal(Progress.derive(h).ex.pushup.next, 12, 'two successes: progress (range ≥10 wide → +2)');
});

test('an "easy" rating progresses immediately; "tough" holds; two misses step back', () => {
  assert.equal(Progress.derive([sess(0, 'pullup', 5, [5, 5, 5], 'easy')]).ex.pullup.next, 6);
  assert.equal(Progress.derive([sess(0, 'pullup', 5, [5, 5, 5], 'tough'), sess(1, 'pullup', 5, [5, 5, 5], 'tough')]).ex.pullup.next, 5);
  const miss = [sess(0, 'pullup', 6, [6, 4, 3]), sess(2, 'pullup', 6, [5, 4, 4])];
  assert.equal(Progress.derive(miss).ex.pullup.next, 5);
  // a skipped set is not a success either
  assert.equal(Progress.derive([sess(0, 'pullup', 5, [5, 5], 'easy', { planned: 3 })]).ex.pullup.next, 5);
});

test('holds progress in 5 second steps and stay inside the working range', () => {
  const h = [sess(0, 'plank', 55, [55, 55], 'easy'), sess(1, 'plank', 60, [60, 60], 'easy')];
  const p = Progress.derive(h).ex.plank;
  assert.equal(p.next, EX.plank.sec[1]);
  assert.equal(p.ready, true);
});

test('topping out a movement unlocks the next variation, one level at a time', () => {
  const top = EX.pushup.reps[1];
  const h = [sess(0, 'pushup', top - 1, [top - 1, top - 1], 'easy'), sess(2, 'pushup', top, [top, top, top], 'easy')];
  const d = Progress.derive(h);
  assert.equal(d.ex.pushup.ready, true);
  assert.equal(d.level.hpush, EX.pushup.lvl + 1);
  const s = Planner.generate({ now: T0 + 4 * DAY, minutes: 30, profile: { level: 'beginner' }, history: h, focus: 'upper' });
  const push = s.blocks.filter(b => b.kind === 'main').flatMap(b => b.items).map(it => it.id).filter(id => EX[id].pat[0] === 'hpush');
  assert.ok(push.length);
  assert.ok(push.every(id => EX[id].lvl <= EX.pushup.lvl + 1), 'no jump of two levels');
  assert.ok(push.some(id => EX[id].lvl === EX.pushup.lvl + 1), `harder variation offered: ${push}`);
});

test('the planner uses the progressed rep target', () => {
  const h = [sess(0, 'squat', 14, [14, 14, 14], 'easy')];
  const s = Planner.generate({ now: T0 + 3 * DAY, minutes: 30, profile: { level: 'beginner' }, history: h, focus: 'lower' });
  const sq = s.steps.find(x => x.id === 'squat');
  assert.ok(sq, 'squat planned');
  assert.equal(sq.reps, 16, 'rated easy: +2 (wide rep range)');
});

test('fatigue decays over ~2 days and maps to recovery status', () => {
  const h = [{ at: T0, end: T0, entries: [{ id: 'squat', sets: [15, 15, 15, 15] }, { id: 'reverseLunge', sets: [10, 10, 10, 10] }, { id: 'gluteBridge', sets: [15, 15, 15] }] }];
  const f0 = Progress.fatigue(h, T0 + 2 * HOUR), f1 = Progress.fatigue(h, T0 + DAY), f3 = Progress.fatigue(h, T0 + 3 * DAY);
  assert.ok(f0.legs > f1.legs && f1.legs > f3.legs);
  assert.equal(Progress.status(f0.legs), 'fatigued');
  assert.equal(Progress.status(f3.legs), 'fresh');
  assert.equal(f0.push, 0);
  assert.equal(Progress.fatigue([], T0).legs, 0);
});

test('achievements: first time, personal records and unlocked progressions', () => {
  const prior = [sess(0, 'pushup', 10, [10, 11, 10])];
  const now = { entries: [
    { id: 'pushup', role: 'main', mode: 'reps', sets: [12, 10] },
    { id: 'diamondPushup', role: 'main', mode: 'reps', sets: [6] },
    { id: 'plank', role: 'main', mode: 'time', sets: [30] },
    { id: 'armCircles', role: 'warm', mode: 'time', sets: [30] },
  ] };
  const a = Progress.achievements(prior, now);
  assert.deepEqual(a.find(x => x.id === 'pushup'), { kind: 'pr', id: 'pushup', value: 12, prev: 11, unit: 'reps' });
  assert.equal(a.find(x => x.id === 'diamondPushup').kind, 'unlock');
  assert.equal(a.find(x => x.id === 'plank').kind, 'first');
  assert.ok(!a.some(x => x.id === 'armCircles'), 'warm-ups are not records');
  assert.deepEqual(Progress.achievements([], { entries: [{ id: 'pushup', sets: [] }] }), []);
});

test('stats summarise the week', () => {
  const h = [sess(-10, 'pushup', 8, [8]), Object.assign(sess(-1, 'pushup', 8, [8]), { active: 900 }), Object.assign(sess(0, 'squat', 10, [10]), { active: 1200 })];
  const st = Progress.stats(h, T0 + 3600e3);
  assert.equal(st.total, 3);
  assert.equal(st.weekSessions, 2);
  assert.equal(st.weekMinutes, 35);
  assert.equal(st.days.length, 7);
  assert.equal(st.last.id, 's0');
});

test('malformed history is ignored, not thrown on', () => {
  const junk = [null, 5, 'x', {}, { at: 'x', entries: [] }, { at: T0, entries: 'no' }, { at: T0, entries: [null, { id: 'nope', sets: [1] }, { id: 'pushup', sets: ['a', -1] }] }];
  assert.doesNotThrow(() => { Progress.derive(junk); Progress.fatigue(junk, T0); Progress.records(junk); Progress.stats(junk, T0); Progress.achievements(junk, { entries: [{ id: 'pushup', sets: [3] }] }); });
  assert.deepEqual(Progress.derive('nope'), { ex: {}, level: {} });
});
