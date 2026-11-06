// Ollie's Quest: the landscape platformer (level 1, the farm). Time runs 4x faster here (window.__platScale).
import { test, expect } from '@playwright/test';
import { newSite, newDevice, dismissWelcome } from './helpers.mjs';

const KEY = 'ollie-word-adventure-v1';
const PRAISE = ['Great job!', 'You did it!', 'Awesome reading!', 'Wow, super!', 'Yay! Amazing!', "You're a reading star!", 'Fantastic!', 'Nailed it!', 'Brilliant!'];
const known = ws => Object.fromEntries(ws.map(w => [w, { n: 2, ok: 2, sc: 2, sk: 0 }]));

async function device(browser, name, words) {
  const site = newSite(name, { voice: false });
  const d = await newDevice(browser);
  await d.context.addInitScript(() => { window.__platScale = 4; });
  await d.page.goto(site.url);
  await dismissWelcome(d.page);
  await d.page.evaluate(([KEY, words]) => { const S = JSON.parse(localStorage.getItem(KEY)); S.words = words; localStorage.setItem(KEY, JSON.stringify(S)); }, [KEY, words]);
  await d.page.reload();
  await d.page.setViewportSize({ width: 844, height: 390 });
  return d;
}
const state = page => page.evaluate(() => { const q = document.querySelector('#quest'); return q ? { ...q.dataset } : null; });
const press = (page, w) => page.evaluate(w => document.querySelector(`.qb[data-w="${w}"]`).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })), w);

test('the quest unlocks when its three words are known', async ({ browser }) => {
  const { page } = await device(browser, 'quest-lock', known(['cow', 'sun']));
  await page.click('[data-act="games"]');
  const card = page.locator('[data-game="quest"]');
  await expect(card).toHaveClass(/locked/);
  await expect(card.locator('.chip.ok')).toHaveCount(2);
  await expect(card.locator('.chip:not(.ok)')).toHaveText('rat');
  await card.locator('[data-act="gpractice"]').click();                     // practice: a round of those words
  await expect(page.locator('#act .tile').first()).toBeVisible();
  await page.evaluate(KEY => { const S = JSON.parse(localStorage.getItem(KEY)); S.words.rat = { n: 2, ok: 2, sc: 2, sk: 0 }; localStorage.setItem(KEY, JSON.stringify(S)); }, KEY);
  await page.reload();
  await page.click('[data-act="games"]');
  await expect(page.locator('[data-game="quest"]')).not.toHaveClass(/locked/);
});

test('a full level: 30 cleared with the right words, then the boss is beaten and the monocle won', async ({ browser }) => {
  test.setTimeout(180_000);
  const { page } = await device(browser, 'quest-win', known(['cow', 'sun', 'rat']));
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.evaluate(() => { window.__tts.length = 0; });
  await page.click('[data-act="games"]');
  await page.click('[data-act="game"][data-id="quest"]');
  await expect(page.locator('#quest canvas')).toBeVisible();
  await expect(page.locator('.qb')).toHaveCount(3);
  let cleared = 0, wrongTried = false, dodged = 0, strikes = 0;
  const t0 = Date.now();
  for (;;) {
    const s = await state(page);
    expect(Date.now() - t0).toBeLessThan(150_000);
    if (s.phase === 'won') break;
    expect(s.phase).not.toBe('over');
    if (s.phase === 'run' && s.next) {
      if (!wrongTried) {                                                    // a wrong word changes nothing
        wrongTried = true; await press(page, ['cow', 'sun', 'rat'].find(w => w !== s.next));
        expect((await state(page)).next).toBe(s.next);
      }
      await press(page, s.next); cleared++;
      await page.waitForFunction(w => document.querySelector('#quest').dataset.next !== w || document.querySelector('#quest').dataset.phase !== 'run', s.next);
      continue;
    }
    if (s.phase === 'tele' && s.ask) {
      await press(page, s.ask); dodged++;
      expect((await state(page)).phase).toBe('attack');                    // the boss attacks (and misses) at once
      continue; }
    if (s.phase === 'turn') { await press(page, ['cow', 'sun', 'rat'][strikes % 3]); strikes++; await page.waitForFunction(() => document.querySelector('#quest').dataset.phase !== 'pattack' && document.querySelector('#quest').dataset.phase !== 'turn'); continue; }
    await page.waitForTimeout(30);
  }
  expect(cleared).toBeGreaterThanOrEqual(29);                              // (the first one can be cleared while the wrong word was being checked)
  expect(dodged).toBe(9);                                                   // 3 attacks before each of 3 strikes
  expect(strikes).toBe(3);
  expect(Number((await state(page)).hp)).toBe(3);
  await expect(page.locator('#qpanel')).toContainText('monocle');
  await expect(page.locator('#qbtns')).toBeHidden();                       // the word buttons don't cover the panel
  const pic = () => page.locator('#qpanel .qbig img').getAttribute('src');
  const worn = await pic();
  await page.click('#qpanel [data-q="wear"]');                             // take it off: the picture changes
  await expect(page.locator('#qpanel [data-q="wear"]')).toHaveText('Wear it');
  expect(await pic()).not.toBe(worn);
  await page.click('#qpanel [data-q="wear"]');
  expect(await pic()).toBe(worn);
  const S = await page.evaluate(KEY => JSON.parse(localStorage.getItem(KEY)), KEY);
  expect(S.cos).toEqual({ owned: ['monocle'], on: 'monocle' });
  expect(S.games.quest).toBe(1);
  // only the words (and a praise line) were spoken: no new voice lines (" " is the device voice being primed)
  const said = await page.evaluate(() => window.__tts);
  for (const t of said.filter(t => t.trim())) expect(['cow!', 'sun!', 'rat!', ...PRAISE]).toContain(t);
  // Ollie wears it everywhere; it can be taken off in the closet on the games screen
  await page.locator('#qpanel [data-act="games"]').click();
  await expect(page.locator('.closet .cl-it.on')).toHaveCount(1);
  await page.click('.closet .cl-it');
  expect(await page.evaluate(KEY => JSON.parse(localStorage.getItem(KEY)).cos.on, KEY)).toBe('');
  await page.click('[data-act="home"]');
  await expect(page.locator('.home .owl img.ollie-i')).toBeVisible();
  expect(errors).toEqual([]);
});

test('running into things costs hearts; with none left it is over, and Try again starts the level over', async ({ browser }) => {
  test.setTimeout(120_000);
  const { page } = await device(browser, 'quest-lose', known(['cow', 'sun', 'rat']));
  await page.click('[data-act="games"]');
  await page.click('[data-act="game"][data-id="quest"]');
  await expect.poll(async () => (await state(page)).hp, { timeout: 60_000 }).toBe('2');
  await expect.poll(async () => (await state(page)).phase, { timeout: 60_000 }).toBe('over');
  await expect(page.locator('#qpanel')).toContainText('Oh no!');
  await expect(page.locator('#qbtns')).toBeHidden();
  await page.click('#qpanel [data-q="again"]');
  await expect(page.locator('#qbtns')).toBeVisible();
  const s = await state(page);
  expect(s.hp).toBe('3');
  expect(['intro', 'run']).toContain(s.phase);
  await expect(page.locator('#qpanel')).toBeHidden();
});
