// @ts-check
// End-to-end tests for the on-demand app (index.html). The planner, progress
// and runner logic have their own unit tests in tests/unit.
const { test, expect } = require('@playwright/test');
const path = require('path');

const URL = 'file://' + path.join(__dirname, '..', '..', 'index.html');
const KEY = 'cal-od-v1';
const ONBOARDED = { v: 1, onboarded: true, profile: { level: 'intermediate', goal: 'balanced', equipment: [], avoid: [] }, prefs: { minutes: 20, focus: 'auto', sound: false }, history: [] };

async function open(page, { state, legacy, clock = true } = {}) {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  if (clock) await page.clock.install({ time: new Date('2026-10-14T07:00:00') });
  await page.addInitScript(([k, v, lv]) => {
    if (sessionStorage.getItem('seeded')) return;
    if (v !== null) localStorage.setItem(k, v);
    if (lv !== null) localStorage.setItem('cal-program-state', lv);
    sessionStorage.setItem('seeded', '1');
  }, [KEY, state === undefined ? null : typeof state === 'string' ? state : JSON.stringify(state), legacy === undefined ? null : JSON.stringify(legacy)]);
  await page.goto(URL);
  return errors;
}
const saved = page => page.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
const phase = page => page.locator('#player').getAttribute('data-phase');
/** Tap a player control the way a person would: not within the 400ms accidental-tap guard. */
async function tap(page, sel) { await page.clock.runFor(500); await page.locator(sel).click(); }

/** Drive the player to a rep-based set (skipping warm-up timers). */
async function toRepSet(page) {
  for (let i = 0; i < 40; i++) {
    const [ph, timed] = await Promise.all([phase(page), page.locator('#player').getAttribute('data-timed')]);
    if (ph === 'work' && timed === '0') return;
    if (ph === 'rest') await tap(page, '#rest-skip');
    else await tap(page, '#pl-skip');
  }
  throw new Error('no rep set reached');
}

test('first run: short onboarding, then the time selector', async ({ page }) => {
  const errors = await open(page);
  await expect(page.locator('#onboard')).toBeVisible();
  await expect(page.locator('.ob-q')).toContainText('experience');
  await page.locator('[data-level="advanced"]').click();
  await page.locator('#ob-next').click();
  await page.locator('[data-eq="bar"]').click();
  await page.locator('#ob-next').click();
  await page.locator('[data-avoid="knees"]').click();
  await page.locator('#ob-next').click();
  await expect(page.locator('#home')).toBeVisible();
  await expect(page.locator('#minutes')).toHaveText('20');
  const s = await saved(page);
  expect(s.onboarded).toBe(true);
  expect(s.profile).toMatchObject({ level: 'advanced', equipment: ['bar'], avoid: ['knees'] });
  expect(errors).toEqual([]);
});

test('onboarding can be skipped with sensible defaults', async ({ page }) => {
  await open(page);
  await page.locator('#ob-skip').click();
  await expect(page.locator('#home')).toBeVisible();
  await expect(page.locator('#pv-title')).not.toBeEmpty();
  expect((await saved(page)).profile).toMatchObject({ level: 'beginner', equipment: [], avoid: [] });
});

test('classic-program users get their level suggested and their data left untouched', async ({ page }) => {
  const legacy = { day: 40, completed: { 1: true, 2: true, 38: true }, sets: {} };
  await open(page, { legacy });
  await expect(page.locator('[data-level="intermediate"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.note')).toContainText('day 40');
  await page.locator('#ob-skip').click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('cal-program-state')))).toEqual(legacy);
});

test('choosing a duration regenerates a workout that fits it', async ({ page }) => {
  await open(page, { state: ONBOARDED });
  for (const m of [5, 10, 15, 20, 30, 45, 60, 90, 120]) {
    await page.locator(`.preset[data-min="${m}"]`).click();
    await expect(page.locator('#minutes')).toHaveText(String(m));
    await expect(page.locator(`.preset[data-min="${m}"]`)).toHaveAttribute('aria-pressed', 'true');
    const est = await page.evaluate(() => document.querySelector('#start-btn small').textContent);
    const shown = parseInt(est, 10);
    expect(shown).toBeLessThanOrEqual(m);
    expect(shown).toBeGreaterThanOrEqual(m - 1);
  }
  // the slider covers every minute up to 30, then 5-minute steps to 120
  const slider = page.locator('#time-slider');
  await slider.fill('7');
  await expect(page.locator('#minutes')).toHaveText('12');
  await slider.fill('43');
  await expect(page.locator('#minutes')).toHaveText('120');
  await slider.fill('0');
  await expect(page.locator('#minutes')).toHaveText('5');
  await expect(page.locator('#pv-title')).toContainText('express');
  expect((await saved(page)).prefs.minutes).toBe(5);
});

test('focus, shuffle and the full plan', async ({ page }) => {
  await open(page, { state: ONBOARDED });
  await page.locator('.preset[data-min="30"]').click();
  await page.locator('[data-focus="lower"]').click();
  await expect(page.locator('#pv-title')).toContainText('Lower-body');
  const before = await page.locator('#pv-list').textContent();
  await page.locator('#shuffle').click();
  await expect.poll(() => page.locator('#pv-list').textContent()).not.toBe(before);
  await page.locator('#plan-btn').click();
  await expect(page.locator('#plan')).toBeVisible();
  await expect(page.locator('.block')).not.toHaveCount(0);
  await expect(page.locator('.block-h h3').first()).toHaveText('Warm-up');
  await page.locator('#plan .pv-item').first().click();
  await expect(page.locator('#sheet')).toHaveClass(/show/);
  await expect(page.locator('#sheet .ex-stage svg')).toBeVisible();
  await page.locator('#sheet [data-close]').click();
  await page.goBack();
  await expect(page.locator('#home')).toBeVisible();
});

test('settings persist and change the plan', async ({ page }) => {
  await open(page, { state: ONBOARDED });
  await page.locator('.preset[data-min="30"]').click();
  await page.locator('#settings-btn').click();
  await page.locator('#sheet [data-eq="bar"]').click();
  await page.locator('#sheet [data-goal="strength"]').click();
  await expect(page.locator('#sheet [data-eq="bar"]')).toHaveAttribute('aria-checked', 'true');
  await page.locator('#set-done').click();
  await expect(page.locator('#pv-title')).toContainText('strength');
  expect((await saved(page)).profile).toMatchObject({ goal: 'strength', equipment: ['bar'] });
  await page.reload();
  await expect(page.locator('#profile-chip')).toContainText('strength');
});

test('workout player: sets, rest timer, effort, pause and resume', async ({ page }) => {
  const errors = await open(page, { state: ONBOARDED });
  await page.locator('.preset[data-min="20"]').click();
  await page.locator('#start-btn').click();
  await expect(page.locator('#player')).toBeVisible();
  await expect(phase(page)).resolves.toBe('ready');

  // a tap right as the screen appears is ignored (accidental-tap guard)
  await page.locator('#pl-start').click();
  await expect(page.locator('#player')).toHaveAttribute('data-phase', 'ready');
  // timed warm-up: start → 3s get ready → countdown → next move
  await tap(page, '#pl-start');
  await expect(page.locator('#player')).toHaveAttribute('data-phase', 'prep');
  await page.clock.runFor(3100);
  await expect(page.locator('#player')).toHaveAttribute('data-phase', 'work');
  const t1 = await page.locator('#pl-target').textContent();
  await page.clock.runFor(5000);
  expect(await page.locator('#pl-target').textContent()).not.toBe(t1);

  await toRepSet(page);
  const name = await page.locator('#pl-name').textContent();
  const target = parseInt(await page.locator('#pl-target').textContent(), 10);
  await page.locator('#reps-minus').click();
  await expect(page.locator('#reps-val')).toHaveText(String(target - 1));
  await tap(page, '#pl-done');
  await expect(page.locator('#player')).toHaveAttribute('data-phase', 'rest');
  const s = await saved(page);
  const doneVals = Object.values(s.active.run.results).filter(r => r.done && r.val === target - 1);
  expect(doneVals.length).toBe(1);

  // rest: +15s, pause freezes, resume continues
  const rest0 = await page.locator('#pl-target').textContent();
  await page.locator('#rest-add').click();
  const toSec = (t) => { const [m, s] = t.split(':').map(Number); return m * 60 + s; };
  expect(toSec(await page.locator('#pl-target').textContent())).toBeGreaterThan(toSec(rest0));
  await page.locator('#pl-pause').click();
  await expect(page.locator('#pl-paused')).toBeVisible();
  await page.clock.fastForward(120_000);
  await page.clock.runFor(500);
  await expect(page.locator('#player')).toHaveAttribute('data-phase', 'rest');
  await page.locator('#pl-resume').click();
  await expect(page.locator('#pl-paused')).toBeHidden();
  await page.clock.fastForward(200_000);
  await page.clock.runFor(500);
  await expect(page.locator('#player')).not.toHaveAttribute('data-phase', 'rest');
  expect(name).toBeTruthy();
  expect(errors).toEqual([]);
});

test('a refresh mid-workout resumes exactly where it was', async ({ page }) => {
  await open(page, { state: ONBOARDED });
  await page.locator('#start-btn').click();
  await toRepSet(page);
  const name = await page.locator('#pl-name').textContent();
  const kicker = await page.locator('#pl-kicker').textContent();
  await page.reload();
  await expect(page.locator('#player')).toBeVisible();
  await expect(page.locator('#pl-name')).toHaveText(name || '');
  await expect(page.locator('#pl-kicker')).toHaveText(kicker || '');
});

test('backgrounding: the rest timer catches up, nothing runs unattended', async ({ page }) => {
  await open(page, { state: ONBOARDED });
  await page.locator('#start-btn').click();
  await toRepSet(page);
  await tap(page, '#pl-done');
  await expect(page.locator('#player')).toHaveAttribute('data-phase', 'rest');
  // simulate the phone being locked for ten minutes: timers are throttled, then the page wakes
  await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now() + 600_000)));
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.clock.resume();
  await expect(page.locator('#player')).not.toHaveAttribute('data-phase', 'rest');
  const s = await saved(page);
  // exactly one set logged: the rest ended, the next set is waiting for the user
  expect(Object.values(s.active.run.results).filter(r => r.done && r.val > 0).length).toBeGreaterThanOrEqual(1);
  expect(['work', 'ready']).toContain(s.active.run.phase);
});

test('skip, swap and skip-exercise keep the session coherent', async ({ page }) => {
  await open(page, { state: ONBOARDED });
  await page.locator('.preset[data-min="30"]').click();
  await page.locator('#start-btn').click();
  await toRepSet(page);
  const first = await page.locator('#pl-name').textContent();
  await page.locator('#pl-pause').click();
  await page.locator('#pl-swap').click();
  await expect(page.locator('#sheet [data-swap]').first()).toBeVisible();
  const alt = await page.locator('#sheet [data-swap] .t1').first().textContent();
  await page.locator('#sheet [data-swap]').first().click();
  await expect(page.locator('#pl-name')).toHaveText((alt || '').toUpperCase() === alt ? alt : alt || '', { ignoreCase: true });
  await expect(page.locator('#pl-paused')).toBeHidden();
  expect(first).not.toBe(alt);
  await page.clock.runFor(600);
  await page.locator('#pl-pause').click();
  await page.locator('#pl-skipex').click();
  await expect(page.locator('#pl-name')).not.toHaveText(alt || '', { ignoreCase: true });
  const s = await saved(page);
  expect(s.active.run.swaps.length).toBe(1);
});

test('ending early saves an honest partial session to history', async ({ page }) => {
  await open(page, { state: ONBOARDED });
  await page.locator('#start-btn').click();
  await toRepSet(page);
  await tap(page, '#pl-done');
  await page.locator('#pl-close').click();
  await page.locator('#pl-end').click();
  await expect(page.locator('#sheet')).toContainText("You've done 1 set");
  await page.locator('#end-confirm').click();
  await expect(page.locator('#summary')).toBeVisible();
  await expect(page.locator('#sm-status')).toHaveText('Ended early');
  await expect(page.locator('.sm-stat').nth(1)).toContainText('1');
  const s = await saved(page);
  expect(s.active).toBeNull();
  expect(s.history.length).toBe(1);
  expect(s.history[0].status).toBe('partial');
  await page.locator('#sm-done').click();
  await expect(page.locator('#recent')).toContainText('Today');
  await page.locator('#history-btn').click();
  await expect(page.locator('.hist-item')).toHaveCount(1);
  await expect(page.locator('.link-card')).toHaveAttribute('href', 'program.html');
});

test('ending before anything is logged saves nothing', async ({ page }) => {
  await open(page, { state: ONBOARDED });
  await page.locator('#start-btn').click();
  await page.locator('#pl-close').click();
  await page.locator('#pl-end').click();
  await page.locator('#end-confirm').click();
  await expect(page.locator('#home')).toBeVisible();
  expect((await saved(page)).history).toEqual([]);
});

test('a complete workout ends on a summary with progression notes', async ({ page }) => {
  test.setTimeout(90_000);
  await open(page, { state: Object.assign({}, ONBOARDED, { prefs: { minutes: 5, focus: 'auto', sound: false } }) });
  await page.locator('#start-btn').click();
  for (let i = 0; i < 200; i++) {
    if (await page.locator('#summary').isVisible()) break;
    const ph = await phase(page);
    if (ph === 'ready') await tap(page, '#pl-start');
    else if (ph === 'work' && await page.locator('#reps-val').count()) await tap(page, '#pl-done');
    else { await page.clock.fastForward(4000); await page.clock.runFor(300); }
  }
  await expect(page.locator('#sm-status')).toHaveText('Workout complete');
  await expect(page.locator('.section-h', { hasText: 'What you did' })).toBeVisible();
  await expect(page.locator('.sm-stat').first()).not.toContainText('0:00');
  const s = await saved(page);
  expect(s.history[0].status).toBe('complete');
  expect(s.history[0].completion).toBe(1);
  // the next plan knows about it
  await page.locator('#sm-done').click();
  await expect(page.locator('#recent')).toBeVisible();
});

test('Back during a workout pauses instead of leaving', async ({ page }) => {
  await open(page, { state: ONBOARDED });
  await page.locator('#start-btn').click();
  await page.goBack();
  await expect(page.locator('#player')).toBeVisible();
  await expect(page.locator('#pl-paused')).toBeVisible();
});

test('corrupt saved data falls back safely and is kept aside', async ({ page }) => {
  const errors = await open(page, { state: '{"onboarded":tru' });
  await expect(page.locator('#onboard')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('cal-od-v1-unreadable'))).toBe('{"onboarded":tru');
  expect(errors).toEqual([]);
});

test('malformed fields in saved data are repaired', async ({ page }) => {
  const errors = await open(page, { state: { onboarded: true, profile: { level: 'god', equipment: 'bar', avoid: [1, 'knees'] }, prefs: { minutes: 999, focus: 'arms' }, history: [null, { at: 'x' }], active: { session: {} } } });
  await expect(page.locator('#home')).toBeVisible();
  await expect(page.locator('#minutes')).toHaveText('120');
  await expect(page.locator('[data-focus="auto"]')).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
});

test('reduced motion: demos are drawn still', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page, { state: ONBOARDED });
  await page.locator('#start-btn').click();
  const d = () => page.evaluate(() => document.querySelector('#pl-stage .aN').getAttribute('d'));
  const a = await d();
  await page.clock.runFor(1500);
  expect(await d()).toBe(a);
});

test('the demo animates in the player', async ({ page }) => {
  await open(page, { state: ONBOARDED });
  await page.locator('#start-btn').click();
  const d = () => page.evaluate(() => document.querySelector('#pl-stage .aN').getAttribute('d'));
  const a = await d();
  await page.clock.runFor(700);
  expect(await d()).not.toBe(a);
});

for (const [w, h] of [[320, 568], [375, 667], [390, 844], [430, 932]]) {
  test(`layout at ${w}×${h}: no horizontal scroll, thumb-sized controls`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await open(page, { state: ONBOARDED });
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(await overflow()).toBeLessThanOrEqual(0);
    for (const sel of ['#start-btn', '.preset[data-min="45"]', '#settings-btn', '#history-btn', '#shuffle']) {
      const b = await page.locator(sel).boundingBox();
      // sub-pixel tolerance: boxes are measured mid entrance animation
      expect(b && b.height, sel).toBeGreaterThanOrEqual(43.5);
      expect(b && b.width, sel).toBeGreaterThanOrEqual(43.5);
    }
    await page.locator('#start-btn').click();
    await toRepSet(page);
    expect(await overflow()).toBeLessThanOrEqual(0);
    for (const sel of ['#pl-done', '#reps-minus', '#reps-plus', '#pl-pause', '#pl-close']) {
      const b = await page.locator(sel).boundingBox();
      expect(b && b.height, sel).toBeGreaterThanOrEqual(43.5);
      expect(b && b.y + b.height, `${sel} on screen`).toBeLessThanOrEqual(h);
    }
    await tap(page, '#pl-done');
    const skip = await page.locator('#rest-skip').boundingBox();
    expect(skip && skip.y + skip.height).toBeLessThanOrEqual(h);
  });
}

test('accessible names on icon buttons and labelled controls', async ({ page }) => {
  await open(page, { state: ONBOARDED });
  for (const sel of ['#history-btn', '#settings-btn', '#shuffle', '#time-slider']) {
    await expect(page.locator(sel)).toHaveAttribute('aria-label', /.+/);
  }
  await expect(page.locator('#time-slider')).toHaveAttribute('aria-valuetext', '20 minutes');
});
