// @ts-check
const { test, expect } = require('@playwright/test');
const path = require('path');

const URL = 'file://' + path.join(__dirname, '..', 'index.html');
const KEY = 'cal-program-state';

// Day 1 (Foundation, Push): 2 warm-up, 3 circuit moves x 3 rounds, 2 cool-down = 13 sets.
const DAY1_ORDER = ['w0', 'w1', 'c0', 'c1', 'c2', 'c0', 'c1', 'c2', 'c0', 'c1', 'c2', 'd0', 'd1'];

/** Open the app with an optional saved state and a fake clock. */
async function open(page, { state, clock = true } = {}) {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  // Web fonts are cosmetic; keep tests hermetic.
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  if (clock) await page.clock.install();
  if (state !== undefined) {
    await page.addInitScript(([k, v]) => {
      if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, v); sessionStorage.setItem('seeded', '1'); }
    }, [KEY, typeof state === 'string' ? state : JSON.stringify(state)]);
  }
  await page.goto(URL);
  return errors;
}
const row = (page, key) => page.locator(`#row-${key}`);
const saved = page => page.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);

/** Tap a move's check circle, then let the double-tap guard expire. */
async function log(page, key) {
  await row(page, key).locator('.check').click();
  await page.clock.runFor(700);
}

test('renders the current day with the first move in focus', async ({ page }) => {
  const errors = await open(page);
  await expect(page.locator('.daynum')).toContainText('DAY 1');
  await expect(page.locator('.section')).toHaveCount(3);
  await expect(row(page, 'w0')).toHaveClass(/is-current/);
  await expect(row(page, 'w0')).toHaveClass(/open/);
  await expect(page.locator('.tcount')).toHaveText('0 / 13 sets');
  await expect(page.locator('#nowbar')).toHaveAttribute('data-phase', 'ready');
  await expect(page.locator('.nb-name')).toHaveText('Arm Circles');
  await expect(page.locator('.nb-action')).toHaveText('Done');
  expect(errors).toEqual([]);
});

test('logging a move marks it done, advances focus and persists', async ({ page }) => {
  await open(page);
  await log(page, 'w0');
  await expect(row(page, 'w0')).toHaveClass(/is-done/);
  await expect(row(page, 'w0')).not.toHaveClass(/is-current/);
  await expect(row(page, 'w0')).not.toHaveClass(/open/);
  await expect(row(page, 'w1')).toHaveClass(/is-current/);
  await expect(row(page, 'w1')).toHaveClass(/open/);
  await expect(page.locator('.tcount')).toHaveText('1 / 13 sets');
  await expect(page.locator('.seg.on')).toHaveCount(1);
  await expect(page.locator('#toast')).toContainText('Arm Circles');
  expect((await saved(page)).sets).toEqual({ 1: { w0: 1 } });

  await page.reload();
  await expect(row(page, 'w0')).toHaveClass(/is-done/);
  await expect(row(page, 'w1')).toHaveClass(/is-current/);
});

test('undo in the toast reverts a logged set', async ({ page }) => {
  await open(page);
  await log(page, 'w0');
  await page.locator('#toast button').click();
  await expect(row(page, 'w0')).not.toHaveClass(/is-done/);
  await expect(row(page, 'w0')).toHaveClass(/is-current/);
  await expect(page.locator('.tcount')).toHaveText('0 / 13 sets');
  expect((await saved(page)).sets).toEqual({});
});

test('a rapid double tap logs only once', async ({ page }) => {
  await open(page);
  const check = row(page, 'c0').locator('.check');
  await check.click();
  await check.click();
  await page.clock.runFor(700);
  expect((await saved(page)).sets[1]).toEqual({ c0: 1 });
  await expect(row(page, 'c0').locator('.pips i.on')).toHaveCount(1);
});

test('circuit focus moves round-robin through the moves', async ({ page }) => {
  await open(page);
  await log(page, 'w0');
  await log(page, 'w1');
  const seen = [];
  for (let i = 0; i < 4; i++) {
    const key = await page.locator('.exrow.is-current').getAttribute('data-key');
    seen.push(key);
    await log(page, key);
  }
  expect(seen).toEqual(['c0', 'c1', 'c2', 'c0']);
  await expect(page.locator('.section[data-sec="c"] .secmeta')).toHaveText('Round 2/3');
  await expect(page.locator('.nb-label')).toContainText('Round 2/3');
});

test('completing every set completes the day and leads to the next one', async ({ page }) => {
  await open(page);
  for (const k of DAY1_ORDER) await log(page, k);

  await expect(page.locator('.dayhead')).toHaveClass(/is-done/);
  await expect(page.locator('.exrow.is-current')).toHaveCount(0);
  await expect(page.locator('.exrow.is-done')).toHaveCount(7);
  await expect(page.locator('.tcount')).toHaveText('13 / 13 sets');
  await expect(page.locator('#donebtn')).toHaveText('✓ Done');
  await expect(page.locator('.chip[data-day="1"]')).toHaveClass(/done/);
  await expect(page.locator('#nowbar')).toHaveAttribute('data-phase', 'done');
  await expect(page.locator('.nb-label')).toHaveText('Day 1 complete');
  await expect(page.locator('.nb-name')).toHaveText('Next: Day 2 · Legs Day');
  await expect(page.locator('#toast')).toContainText('Day 1 complete');
  expect((await saved(page)).completed).toEqual({ 1: true });

  await page.reload();
  await expect(page.locator('.dayhead')).toHaveClass(/is-done/);
  await expect(page.locator('.dayhead')).not.toHaveClass(/celebrate/);
  await expect(page.locator('#nowbar')).toHaveAttribute('data-phase', 'done');

  await page.locator('.nb-action').click();
  await expect(page.locator('.daynum')).toContainText('DAY 2');
  await expect(page.locator('.badge')).toHaveText('Legs Day');
  await expect(row(page, 'w0')).toHaveClass(/is-current/);
  expect((await saved(page)).day).toBe(2);
});

test('resetting a move on a completed day reopens the day', async ({ page }) => {
  await open(page);
  for (const k of DAY1_ORDER) await log(page, k);
  await log(page, 'd1'); // tap a done circle = reset it
  await expect(row(page, 'd1')).not.toHaveClass(/is-done/);
  await expect(row(page, 'd1')).toHaveClass(/is-current/);
  await expect(page.locator('.dayhead')).not.toHaveClass(/is-done/);
  expect((await saved(page)).completed).toEqual({});
  // ...and undo restores the completion
  await page.locator('#toast button').click();
  await expect(page.locator('.dayhead')).toHaveClass(/is-done/);
  expect((await saved(page)).completed).toEqual({ 1: true });
});

test('work timer counts down, logs the set, rests, then cues the next move', async ({ page }) => {
  await open(page);
  await log(page, 'w0');
  await log(page, 'w1');
  await expect(page.locator('.nb-action')).toHaveText('Start 30s');
  await page.locator('.nb-action').click();

  const bar = page.locator('#nowbar');
  await expect(bar).toHaveAttribute('data-phase', 'work');
  await expect(page.locator('.nb-num')).toHaveText('30');
  await expect(row(page, 'c0').locator('.timerbtn')).toHaveText('Stop · 30s');
  await page.clock.runFor(10_000);
  await expect(page.locator('.nb-num')).toHaveText('20');

  await page.clock.runFor(20_500);
  await expect(bar).toHaveAttribute('data-phase', 'rest');
  expect((await saved(page)).sets[1].c0).toBe(1);
  await expect(page.locator('.nb-name')).toHaveText('Knee Push-up');
  await expect(page.locator('.nb-num')).toHaveText('25');
  await expect(page.locator('.nb-action')).toHaveText('Skip');

  await page.clock.runFor(25_500);
  await expect(bar).toHaveAttribute('data-phase', 'ready');
  await expect(bar).toHaveClass(/go/);
  await expect(page.locator('.nb-label')).toContainText('Go');
  await expect(row(page, 'c1')).toHaveClass(/is-current/);
});

test('stopping a timer early does not log a set', async ({ page }) => {
  await open(page);
  await row(page, 'c0').locator('.extoggle').click();
  await row(page, 'c0').locator('.timerbtn').click();
  await expect(page.locator('#nowbar')).toHaveAttribute('data-phase', 'work');
  await page.clock.runFor(5_000);
  await page.locator('.nb-action').click(); // Stop
  await expect(page.locator('#nowbar')).toHaveAttribute('data-phase', 'ready');
  await expect(row(page, 'c0').locator('.timerbtn')).toHaveText('Start 30s');
  await page.clock.runFor(40_000);
  expect((await saved(page))?.sets?.[1]?.c0).toBeUndefined();
});

test('a timer on an already-finished move never logs extra sets', async ({ page }) => {
  await open(page);
  for (let i = 0; i < 3; i++) await log(page, 'c0');
  await page.evaluate(() => setOpen('c0', true));
  await row(page, 'c0').locator('.timerbtn').click();
  await page.clock.runFor(31_000);
  expect((await saved(page)).sets[1].c0).toBe(3);
});

test('timer catches up after the page was backgrounded', async ({ page }) => {
  await open(page);
  await row(page, 'c0').locator('.extoggle').click();
  await row(page, 'c0').locator('.timerbtn').click();
  // Jump past work (30s) and rest (25s) without intermediate ticks.
  await page.clock.fastForward(60_000);
  await page.clock.runFor(300);
  await expect(page.locator('#nowbar')).toHaveAttribute('data-phase', 'ready');
  expect((await saved(page)).sets[1].c0).toBe(1);
});

test('changing day stops a running timer', async ({ page }) => {
  await open(page);
  await row(page, 'c0').locator('.extoggle').click();
  await row(page, 'c0').locator('.timerbtn').click();
  await page.locator('.navbtn', { hasText: 'Next' }).click();
  await expect(page.locator('.daynum')).toContainText('DAY 2');
  await expect(page.locator('#nowbar')).toHaveAttribute('data-phase', 'ready');
  await page.clock.runFor(40_000);
  expect((await saved(page)).sets).toEqual({});
});

test('Mark Done, prev/next and week chips still work', async ({ page }) => {
  await open(page);
  await page.locator('#donebtn').click();
  await expect(page.locator('.dayhead')).toHaveClass(/is-done/);
  await expect(page.locator('.dayhead')).toHaveClass(/celebrate/);
  await expect(page.locator('#nowbar')).toHaveAttribute('data-phase', 'done');
  expect((await saved(page)).completed).toEqual({ 1: true });
  await page.locator('#donebtn').click();
  await expect(page.locator('.dayhead')).not.toHaveClass(/is-done/);
  expect((await saved(page)).completed).toEqual({});

  await page.locator('.navbtn', { hasText: 'Prev' }).click();
  await expect(page.locator('.daynum')).toContainText('DAY 1');
  await page.locator('.chip[data-day="6"]').click();
  await expect(page.locator('.daynum')).toContainText('DAY 6');
  await expect(page.locator('.badge')).toHaveText('Mobility Flow');
  await page.locator('.navbtn', { hasText: 'Next' }).click();
  await page.locator('.navbtn', { hasText: 'Next' }).click();
  await expect(page.locator('.daynum')).toContainText('DAY 8');
  await expect(page.locator('.chip.active')).toHaveText('8');
});

test('the last day clamps navigation and shows program complete', async ({ page }) => {
  await open(page, { state: { day: 84, completed: { 84: true } } });
  await page.locator('.navbtn', { hasText: 'Next' }).click();
  await expect(page.locator('.daynum')).toContainText('DAY 84');
  await expect(page.locator('.nb-name')).toHaveText('Program complete. 84 days.');
  await expect(page.locator('.nb-action')).toBeHidden();
});

test('recovery day flow moves can be logged to completion', async ({ page }) => {
  await open(page, { state: { day: 7, completed: {} } });
  const rows = page.locator('.exrow');
  await expect(rows).toHaveCount(7);
  for (let i = 0; i < 7; i++) {
    await expect(page.locator('.nb-action')).toHaveText('Done');
    await page.locator('.nb-action').click();
    await page.clock.runFor(700);
  }
  await expect(page.locator('.dayhead')).toHaveClass(/is-done/);
  expect((await saved(page)).completed).toEqual({ 7: true });
});

test('older saved state without per-set data still loads', async ({ page }) => {
  const errors = await open(page, { state: { day: 5, completed: { 1: true, 2: true } } });
  await expect(page.locator('.daynum')).toContainText('DAY 5');
  await expect(page.locator('.chip[data-day="1"]')).toHaveClass(/done/);
  await log(page, 'w0');
  expect(await saved(page)).toEqual({ day: 5, completed: { 1: true, 2: true }, sets: { 5: { w0: 1 } } });
  expect(errors).toEqual([]);
});

test('corrupt saved state falls back to day 1', async ({ page }) => {
  const errors = await open(page, { state: '{"day":"banana"' });
  await expect(page.locator('.daynum')).toContainText('DAY 1');
  expect(errors).toEqual([]);
});

test('every day of the program renders', async ({ page }) => {
  const errors = await open(page);
  const problems = await page.evaluate(() => {
    const out = [];
    for (let d = 1; d <= 84; d++) {
      jumpTo(d);
      if (!document.querySelector('.daynum').textContent.includes(`DAY ${d}`)) out.push(`day ${d}: header`);
      if (!document.querySelector('.exrow.is-current')) out.push(`day ${d}: no current move`);
      if (!document.querySelector('.nb-name').textContent) out.push(`day ${d}: empty now-bar`);
    }
    return out;
  });
  expect(problems).toEqual([]);
  expect(errors).toEqual([]);
});

test('reduced motion keeps every state change without the movement', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page);
  const anim = await page.evaluate(() => getComputedStyle(document.querySelector('#row-w0 .fig .figure, #row-w0 .fig g')).animationName);
  expect(anim).toBe('none');
  const dur = await page.evaluate(() => getComputedStyle(document.querySelector('.exbody')).transitionDuration);
  expect(dur).toBe('0.001s');
  for (const k of DAY1_ORDER) await log(page, k);
  await expect(page.locator('.dayhead')).toHaveClass(/is-done/);
  await expect(page.locator('.dayhead .stamp')).toHaveCSS('opacity', '1');
});

test('layout fits the screen and the now-bar never hides content', async ({ page }) => {
  await open(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  // thumb-sized targets for the controls used mid-workout
  for (const sel of ['#row-c0 .check', '.nb-action', '#donebtn', '.chip[data-day="2"]']) {
    const box = await page.locator(sel).boundingBox();
    expect(box.height, sel).toBeGreaterThanOrEqual(42);
    expect(box.width, sel).toBeGreaterThanOrEqual(38);
  }

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.clock.runFor(500);
  const note = await page.locator('.footnote').boundingBox();
  const bar = await page.locator('.nb').boundingBox();
  expect(note.y + note.height).toBeLessThanOrEqual(bar.y);
});
