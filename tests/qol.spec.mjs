// Behaviour of Ollie's speech, checked with the device voice (no voice files), where every line is logged.
import { test, expect } from '@playwright/test';
import { newSite, newDevice, dismissWelcome, openSettings, ensureMic, SAY_TILES } from './helpers.mjs';

const PRAISE = ['Great job!', 'You did it!', 'Awesome reading!', 'Wow, super!', 'Yay! Amazing!', "You're a reading star!", 'Fantastic!', 'Nailed it!', 'Brilliant!'];
const SHORT = ['Yes!', 'Great!', 'You got it!', 'Nice reading!', 'Super!', 'Yay!'];

async function device(browser, name) {
  const site = newSite(name, { voice: false });
  const d = await newDevice(browser);
  await d.page.goto(site.url);
  await dismissWelcome(d.page);
  await d.page.waitForTimeout(400);
  return d;
}
const log = page => page.evaluate(() => window.__ttsLog.map(x => ({ ...x })));
const clearLog = page => page.evaluate(() => { window.__ttsLog.length = 0; });
const tiles = page => page.evaluate(() => [...document.querySelectorAll('#act .tile')].map(t => t.textContent).join('').toLowerCase());

test('a correct read says the word, then its fun sound, then the praise', async ({ browser }) => {
  const { page } = await device(browser, 'q-praise');
  await page.click('[data-act="play"]');
  await page.locator('#act .tile').first().waitFor();
  const word = await tiles(page);
  await page.waitForTimeout(500); await clearLog(page);
  await page.evaluate(f => { window.__say = new Function('return (' + f + ')()'); }, SAY_TILES.toString());
  await ensureMic(page);
  await page.locator('#celenext').waitFor({ timeout: 20_000 });
  await expect.poll(async () => (await log(page)).map(x => x.text).filter(t => PRAISE.includes(t)).length, { timeout: 10_000 }).toBe(1);
  const said = (await log(page)).map(x => x.text);
  const iw = said.indexOf(`${word}!`), ip = said.findIndex(t => PRAISE.includes(t));
  expect(iw).toBeGreaterThanOrEqual(0);
  expect(ip).toBeGreaterThan(iw);
  // the mic stays on for the whole round, so the word follows the read right away
  const entry = (await log(page))[iw];
  const heardAt = await page.evaluate(at => window.__deliveries.filter(t => t <= at).pop(), entry.at);
  expect(entry.at - heardAt).toBeLessThan(300);
  expect(ip).toBe(said.length - 1);                                             // the praise comes last
  for (const t of said.slice(iw + 1, ip)) expect(PRAISE).not.toContain(t);      // anything between is the fun sound
  expect(new RegExp(`\\b${word}\\b`, 'i').test(said[ip])).toBe(false);          // the word isn't said again with the praise (whole word: "in" is inside "Brilliant")
});

test('skipping: the skipped word stays on screen until it has been said', async ({ browser }) => {
  const { page } = await device(browser, 'q-skip');
  await page.click('[data-act="play"]');
  await page.locator('#act .tile').first().waitFor();
  const word = await tiles(page);
  await page.waitForTimeout(500); await clearLog(page);
  await page.click('[data-a="skip"]');
  await expect.poll(() => tiles(page), { timeout: 15_000 }).not.toBe(word);
  await expect(page.locator('.dots i').nth(0)).toHaveClass(/c/);                // no dot for a skip
  const next = await tiles(page);
  await expect.poll(async () => (await log(page)).some(x => x.text === "Let's try another!")).toBe(true);
  const L = await log(page);
  const reveal = L.find(x => x.text === `No problem! That word is ${word}.`);
  expect(reveal).toBeTruthy();
  expect(reveal.tiles).toBe(word);                                              // said while the old word was up
  expect(L.find(x => x.text === "Let's try another!").tiles).toBe(next);        // then the next word appeared
  expect(L.indexOf(reveal)).toBeLessThan(L.findIndex(x => x.text === "Let's try another!"));
});

test('the letter example ("like apple") only plays when the same letter is tapped twice in a row', async ({ browser }) => {
  const { page } = await device(browser, 'q-letters');
  // a tile spelled like its example word ("t" like top); the s in "is" gets no example, by design
  const PLAIN = ['m', 't', 'p', 'n', 'd', 'b', 'h', 'f', 'l', 'r', 'j', 'v'];
  let k = -1;
  for (let tries = 0; k < 0 && tries < 20; tries++) {
    if (tries) { await page.click('[data-act="home"]'); }
    await page.click('[data-act="play"]');
    await page.locator('#act .tile').first().waitFor();
    k = (await page.locator('#act .tile').allTextContents()).findIndex((t, i) => i > 0 && PLAIN.includes(t.trim().toLowerCase()));
  }
  expect(k).toBeGreaterThan(0);
  await page.waitForTimeout(800);
  const tap = async i => { await clearLog(page); await page.locator('#act .tile').nth(i).click(); await page.waitForTimeout(500); return (await log(page)).map(x => x.text); };
  const n = await page.locator('#act .tile').count();
  const hasLike = s => s.some(t => t.startsWith('like '));
  expect(hasLike(await tap(0))).toBe(false);
  expect(hasLike(await tap(k))).toBe(false);   // a different letter
  const second = await tap(k);                  // same letter again
  expect(hasLike(second)).toBe(true);
  expect(second[0]).not.toMatch(/^like /);      // the sound comes first
  expect(hasLike(await tap(k))).toBe(false);   // a third tap starts over
  expect(hasLike(await tap(0))).toBe(false);
  expect(n).toBeGreaterThan(1);
});

test('stories: no praise or repeat after the child reads a word', async ({ browser }) => {
  const { page } = await device(browser, 'q-story');
  await openSettings(page);
  await page.check('#s-unlock', { force: true });
  await page.click('#s-close');
  await page.click('[data-act="stories"]');
  await page.click('[data-act="story"][data-id="cat"]');
  await page.evaluate(f => { window.__say = new Function('return (' + f + ')()'); }, SAY_TILES.toString());
  const next = page.locator('[data-act="storynext"]');
  while (!(await next.isVisible())) { await ensureMic(page); await page.waitForTimeout(200); }
  const said = (await log(page)).map(x => x.text);
  expect(said).toContain('I see a cat.');   // read back at the end
  expect(said.filter(t => SHORT.some(s => t.startsWith(s)) || /^cat!?$/i.test(t))).toEqual([]);
});

test('stories: a skipped word is said by Ollie, then asked again (with the grown-up ✓)', async ({ browser }) => {
  const { page } = await device(browser, 'q-story-skip');
  await openSettings(page);
  await page.check('#s-unlock', { force: true });
  await page.click('#s-close');
  await page.click('[data-act="stories"]');
  await page.click('[data-act="story"][data-id="cat"]');
  await page.locator('#act [data-a="skip"]').waitFor({ timeout: 20_000 });
  const word = await tiles(page);
  await clearLog(page);
  await page.click('#act [data-a="skip"]');
  await expect.poll(async () => (await log(page)).map(x => x.text)).toContain(`That word is ${word}.`);
  await expect(page.locator('#act [data-grown]')).toBeVisible();
  expect(await tiles(page)).toBe(word);                                    // the same word again
  await expect(page.locator('#sent .w.ok')).toHaveCount(0);                 // not marked read
  await page.evaluate(w => { window.__say = w; }, word);
  await ensureMic(page);
  await expect(page.locator('#sent .w.ok')).toHaveCount(1);
});

test('rounds: skipping the last word left brings it straight back', async ({ browser }) => {
  const { page } = await device(browser, 'q-last-skip');
  await page.click('[data-act="play"]');
  await page.evaluate(f => { window.__say = new Function('return (' + f + ')()'); }, SAY_TILES.toString());
  for (let i = 0; i < 5; i++) {
    await page.locator('#act .tile').first().waitFor(); await page.waitForTimeout(300);
    await ensureMic(page);
    await page.locator('#celenext').waitFor({ timeout: 20_000 });
    await page.click('#celenext');
  }
  await page.locator('#act .tile').first().waitFor(); await page.waitForTimeout(300);
  const word = await tiles(page);
  await page.evaluate(() => { window.__say = ''; });
  await page.click('[data-a="skip"]');
  await expect(page.locator('#act [data-grown]')).toBeVisible({ timeout: 15_000 });
  expect(await tiles(page)).toBe(word);
  await expect(page.locator('.bigtitle')).toHaveCount(0);                   // no "Round complete" without it
  await page.click('#act [data-grown]');                                   // the grown-up ✓
  await page.locator('#celenext').waitFor({ timeout: 20_000 });
  await page.click('#celenext');
  await expect(page.locator('.bigtitle')).toContainText('Round complete!');
});
