const test = require('node:test');
const assert = require('node:assert/strict');
const Planner = require('../../js/planner.js');
const { EX, RESTRICTIONS } = require('../../js/exercises.js');
const { T0, HOUR, DAY, perform, trainDays } = require('./helpers.js');

const ALL_EQ = ['bar', 'table', 'towel', 'bench', 'dip'];
const LEVELS = ['beginner', 'intermediate', 'advanced'];
const GOALS = ['balanced', 'strength', 'conditioning', 'skill'];
const MAIN = ['main', 'core', 'skill', 'finisher', 'easy'];
const mainIds = s => s.blocks.filter(b => MAIN.includes(b.kind)).flatMap(b => b.items.map(it => it.id));
const patterns = s => new Set(mainIds(s).map(id => EX[id].pat[0]));

/** Structural sanity of a generated session. */
function assertValid(s, profile = {}, { allowShort = false } = {}) {
  assert.ok(s.est <= s.budget, `over budget: ${s.est} > ${s.budget}`);
  if (!allowShort) assert.ok(s.budget - s.est <= Planner.FILL_TOLERANCE, `${s.minutes} min plan is ${s.budget - s.est}s short`);
  assert.equal(s.est, Planner.estimate(s.steps), 'est matches the timeline');
  assert.ok(s.steps.length > 0);
  assert.equal(s.steps[0].kind, 'work', 'starts with work');
  assert.equal(s.steps[s.steps.length - 1].kind, 'work', 'ends with work');
  const eq = new Set(profile.equipment || []), avoid = new Set(profile.avoid || []);
  s.steps.forEach((st, i) => {
    assert.ok(Number.isFinite(st.est) && st.est > 0, `step ${i} est`);
    if (st.kind === 'rest') {
      assert.ok(st.sec > 0 && st.sec <= 400, `rest ${st.sec}`);
      assert.notEqual(s.steps[i + 1] && s.steps[i + 1].kind, 'rest', 'no back-to-back rests');
    } else {
      const e = EX[st.id];
      assert.ok(e, `unknown exercise ${st.id}`);
      assert.ok(st.mode === 'reps' ? st.reps > 0 : st.sec > 0, `${st.id} target`);
      assert.ok(e.eq.every(q => eq.has(q)), `${st.id} needs ${e.eq}`);
      assert.ok(!e.stress.some(x => avoid.has(x)), `${st.id} loads an avoided area`);
    }
  });
  const ids = mainIds(s);
  assert.equal(new Set(ids).size, ids.length, 'no exercise twice in the main work');
}

test('every duration from 5 to 120 minutes fits its time budget, for every level, goal and equipment set', () => {
  let n = 0;
  for (const level of LEVELS) for (const goal of GOALS) for (const equipment of [[], ALL_EQ, ['bar']]) {
    for (let m = 5; m <= 120; m++) {
      const profile = { level, goal, equipment };
      assertValid(Planner.generate({ now: T0, minutes: m, profile }), profile);
      n++;
    }
  }
  assert.equal(n, 3 * 4 * 3 * 116);
});

test('every duration also fits with every focus and with restrictions', () => {
  for (const focus of ['full', 'upper', 'lower', 'core', 'mobility']) for (let m = 5; m <= 120; m += 1) {
    const profile = { level: 'intermediate', equipment: ['bar'], avoid: ['knees', 'impact'] };
    assertValid(Planner.generate({ now: T0, minutes: m, profile, focus }), profile);
  }
});

test('minutes are clamped to 5..120 and rounded', () => {
  assert.equal(Planner.generate({ now: T0, minutes: 2 }).minutes, 5);
  assert.equal(Planner.generate({ now: T0, minutes: 500 }).minutes, 120);
  assert.equal(Planner.generate({ now: T0, minutes: 14.6 }).minutes, 15);
  assert.equal(Planner.generate({ now: T0, minutes: 'abc' }).minutes, 20);
});

test('identical inputs give identical sessions; "variant" gives a different one', () => {
  const opts = { now: T0, minutes: 30, profile: { level: 'intermediate', equipment: ['bar', 'table'] } };
  assert.deepEqual(Planner.generate(opts), Planner.generate(JSON.parse(JSON.stringify(opts))));
  const history = trainDays(3, { minutes: 25, profile: opts.profile });
  const o2 = Object.assign({}, opts, { now: T0 + 4 * DAY, history });
  assert.deepEqual(Planner.generate(o2), Planner.generate(JSON.parse(JSON.stringify(o2))));
  const variants = new Set([0, 1, 2, 3].map(v => mainIds(Planner.generate(Object.assign({}, opts, { variant: v }))).join()));
  assert.ok(variants.size > 1, 'variants differ');
});

test('duration-appropriate structure', () => {
  const p = { level: 'intermediate' };
  const s5 = Planner.generate({ now: T0, minutes: 5, profile: p });
  assert.equal(s5.structure, 'express');
  assert.ok(s5.steps.filter(x => x.kind === 'work').length >= 5, 'a 5-minute session still has real work');
  const s45 = Planner.generate({ now: T0, minutes: 45, profile: p });
  assert.ok(s45.blocks.filter(b => b.kind === 'main').length >= 3, '45 minutes: several blocks');
  const s120 = Planner.generate({ now: T0, minutes: 120, profile: p });
  const kinds = new Set(s120.blocks.map(b => b.kind));
  assert.ok(kinds.has('mobility') && kinds.has('core'), '120 minutes: varied structure, not one circuit repeated');
  assert.ok(!s120.blocks.some(b => b.kind === 'main' && b.rounds > 6), 'no circuit repeated over and over');
  assert.ok(s120.hardSets <= Planner.LEVELS.intermediate.cap, 'hard volume is capped');
  assert.ok(s120.hardSets < s45.hardSets * 2, 'diminishing returns: 120 min is not 2.7x the hard work of 45');
});

test('hard-set volume respects the level caps', () => {
  for (const level of LEVELS) for (const m of [30, 60, 90, 120]) {
    const s = Planner.generate({ now: T0, minutes: m, profile: { level, equipment: ALL_EQ } });
    assert.ok(s.hardSets <= Planner.LEVELS[level].cap, `${level} ${m}: ${s.hardSets}`);
  }
});

test('training level changes exercise difficulty', () => {
  const avg = level => {
    const ids = mainIds(Planner.generate({ now: T0, minutes: 40, profile: { level, equipment: ALL_EQ } }));
    return ids.reduce((a, id) => a + EX[id].lvl, 0) / ids.length;
  };
  const b = avg('beginner'), i = avg('intermediate'), a = avg('advanced');
  assert.ok(b < i && i < a, `beginner ${b} < intermediate ${i} < advanced ${a}`);
  const beg = Planner.generate({ now: T0, minutes: 40, profile: { level: 'beginner', equipment: ALL_EQ } });
  assert.ok(mainIds(beg).every(id => EX[id].lvl <= 2), 'no advanced moves for a new beginner');
});

test('equipment: bodyweight-only sessions use no equipment; a bar unlocks vertical pulling', () => {
  const none = Planner.generate({ now: T0, minutes: 40, profile: { level: 'intermediate', equipment: [] } });
  assert.ok(none.steps.every(s => s.kind === 'rest' || EX[s.id].eq.length === 0));
  assert.ok(patterns(none).has('scap'), 'upper-back work substitutes for pulling');
  assert.ok(none.notes.some(n => /pulling equipment/i.test(n)), 'and says so');
  const bar = Planner.generate({ now: T0, minutes: 40, profile: { level: 'intermediate', equipment: ['bar'] } });
  assert.ok(patterns(bar).has('vpull'));
  assert.ok(!bar.notes.some(n => /pulling equipment/i.test(n)));
  const table = Planner.generate({ now: T0, minutes: 40, profile: { level: 'intermediate', equipment: ['table'] } });
  assert.ok(patterns(table).has('hpull'));
});

test('restrictions remove every exercise that loads the area', () => {
  for (const key of Object.keys(RESTRICTIONS)) {
    for (const m of [5, 20, 60]) {
      const profile = { level: 'advanced', equipment: ALL_EQ, avoid: [key] };
      const s = Planner.generate({ now: T0, minutes: m, profile });
      assertValid(s, profile);
      assert.ok(s.notes.some(n => /Stop any exercise that causes pain/.test(n)));
    }
  }
  const profile = { level: 'intermediate', avoid: Object.keys(RESTRICTIONS) };
  assertValid(Planner.generate({ now: T0, minutes: 30, profile }), profile);
});

test('balanced programming: full body covers push, pull, legs and core; upper/lower stay on topic', () => {
  for (const m of [20, 30, 45, 60]) {
    const pats = patterns(Planner.generate({ now: T0, minutes: m, profile: { level: 'intermediate', equipment: ['bar'] }, focus: 'full' }));
    assert.ok(pats.has('hpush') || pats.has('vpush'), `${m}: push`);
    assert.ok(pats.has('vpull') || pats.has('hpull') || pats.has('scap'), `${m}: pull`);
    assert.ok(['squat', 'single', 'hinge'].some(p => pats.has(p)), `${m}: legs`);
    assert.ok(pats.has('coreS') || pats.has('coreD'), `${m}: core`);
  }
  const upper = Planner.generate({ now: T0, minutes: 40, profile: { level: 'intermediate', equipment: ['bar'] }, focus: 'upper' });
  assert.ok(![...patterns(upper)].some(p => ['squat', 'single', 'hinge', 'calf'].includes(p)), 'upper: no leg work');
  const lower = Planner.generate({ now: T0, minutes: 40, profile: { level: 'intermediate' }, focus: 'lower' });
  assert.ok(![...patterns(lower)].some(p => ['hpush', 'vpush', 'hpull', 'vpull'].includes(p)), 'lower: no upper-body work');
  // a pull exercise is paired with a push in the first superset
  const sup = Planner.generate({ now: T0, minutes: 40, profile: { level: 'intermediate', equipment: ['bar'] } });
  const a = sup.blocks.find(b => b.kind === 'main').items.map(it => EX[it.id].pat[0]);
  assert.deepEqual(a.map(p => p.replace(/^[hv]/, '')).sort(), ['pull', 'push']);
});

test('recovery-aware: after a hard leg day the next session leans upper body', () => {
  const legs = Planner.generate({ now: T0, minutes: 45, profile: { level: 'intermediate' }, focus: 'lower' });
  const history = [perform(legs, T0).entry];
  const next = Planner.generate({ now: T0 + 20 * HOUR, minutes: 30, profile: { level: 'intermediate' }, history });
  assert.equal(next.focus, 'upper');
  assert.ok(next.focusAuto);
  assert.match(next.reason, /legs/i);
  // three days later everything has recovered
  const later = Planner.generate({ now: T0 + 3 * DAY, minutes: 30, profile: { level: 'intermediate' }, history });
  assert.equal(later.focus, 'full');
});

test('recovery-aware: hard sessions on consecutive days lead to a recovery session', () => {
  const history = [];
  for (let d = 0; d < 3; d++) {
    const s = Planner.generate({ now: T0 + d * 14 * HOUR, minutes: 75, profile: { level: 'advanced', equipment: ALL_EQ }, focus: 'full' });
    history.push(perform(s, T0 + d * 14 * HOUR).entry);
  }
  const next = Planner.generate({ now: T0 + 2 * DAY + 4 * HOUR, minutes: 30, profile: { level: 'advanced', equipment: ALL_EQ }, history });
  assert.equal(next.focus, 'mobility');
  assert.equal(next.hardSets, 0);
});

test('an explicitly chosen focus on tired muscles has its volume reduced', () => {
  const legs = Planner.generate({ now: T0, minutes: 60, profile: { level: 'intermediate' }, focus: 'lower' });
  const history = [perform(legs, T0).entry];
  const fresh = Planner.generate({ now: T0 + 4 * DAY, minutes: 45, profile: { level: 'intermediate' }, history, focus: 'lower' });
  const tired = Planner.generate({ now: T0 + 18 * HOUR, minutes: 45, profile: { level: 'intermediate' }, history, focus: 'lower' });
  assert.ok(tired.hardSets < fresh.hardSets, `${tired.hardSets} < ${fresh.hardSets}`);
  assert.match(tired.reason, /reduced/);
});

test('consecutive sessions vary the accessories where alternatives exist', () => {
  const profile = { level: 'intermediate', equipment: ['bar', 'table'] };
  const a = Planner.generate({ now: T0, minutes: 30, profile, focus: 'full' });
  const history = [perform(a, T0).entry];
  const b = Planner.generate({ now: T0 + 3 * DAY, minutes: 30, profile, focus: 'full', history });
  const A = new Set(mainIds(a)), B = mainIds(b);
  assert.ok(B.some(id => !A.has(id)), 'at least one exercise changes');
});

test('limited exercise library: still a valid plan, or a clean empty result', () => {
  const s = Planner.generate({ now: T0, minutes: 30, library: ['pushup', 'squat', 'plank', 'jumpingJacksLight', 'childsPose'] });
  assertValid(s, {}, { allowShort: true });
  assert.ok(s.est >= 20 * 60, 'still a substantial session');
  assert.deepEqual([...new Set(mainIds(s))].sort(), ['plank', 'pushup', 'squat']);
  const tiny = Planner.generate({ now: T0, minutes: 10, library: ['pushup'] });
  assertValid(tiny, {}, { allowShort: true });
  assert.ok(tiny.budget - tiny.est <= Planner.FILL_TOLERANCE || tiny.notes.some(n => /shorter than the time/.test(n)), 'a short plan says so');
  const none = Planner.generate({ now: T0, minutes: 10, library: [] });
  assert.equal(none.steps.length, 0);
  assert.equal(none.empty, true);
});

test('missing or malformed profile and history never break generation', () => {
  const junkProfiles = [undefined, null, 'banana', 42, { level: 'pro', goal: 7, equipment: 'bar', avoid: 'knees' }, { equipment: { bar: true, laser: true }, avoid: ['knees', 'elbows'] }];
  const junkHistory = [undefined, null, 'x', [null, 1, {}, { at: 'yesterday' }, { at: T0 - DAY, entries: [{ id: 'nope', sets: [5] }, { id: 'pushup', sets: 'many' }, { id: 'pushup', sets: [null, -3, 'x', 8], target: 'ten' }] }]];
  for (const profile of junkProfiles) for (const history of junkHistory) {
    const s = Planner.generate({ now: T0, minutes: 25, profile, history });
    assertValid(s, Planner.normProfile(profile));
  }
  assert.deepEqual(Planner.normProfile({ equipment: { bar: true, laser: true }, avoid: ['knees', 'elbows'] }).equipment, ['bar']);
});

test('substitutes stay in the same movement pattern and respect the profile', () => {
  const subs = Planner.substitutes('pushup', { profile: { equipment: [] } });
  assert.ok(subs.length >= 2);
  assert.ok(subs.every(id => EX[id].pat.includes('hpush') && EX[id].eq.length === 0));
  assert.ok(!subs.includes('pushup'));
  assert.ok(!Planner.substitutes('pullup', { profile: { equipment: [] } }).length, 'no bar, no bar substitutes');
  assert.ok(Planner.substitutes('pullup', { profile: { equipment: ['bar'] } }).includes('chinup'));
  assert.ok(Planner.substitutes('squat', { profile: { avoid: ['knees'] } }).every(id => !EX[id].stress.includes('knees')));
});

test('per-side moves in timed intervals alternate within one interval', () => {
  for (let m = 5; m <= 7; m++) for (const level of LEVELS) {
    const s = Planner.generate({ now: T0, minutes: m, profile: { level, equipment: ALL_EQ } });
    s.steps.filter(x => x.kind === 'work' && x.alt).forEach(x => assert.ok(EX[x.id].uni));
  }
});
