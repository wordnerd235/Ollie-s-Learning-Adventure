import { test, expect } from '@playwright/test';
import { newSite, newDevice, waitForVoice, dismissWelcome, openSettings, ensureMic, SAY_TILES } from './helpers.mjs';

async function readyDevice(browser, name) {
  const site = newSite(name), man = site.manifest();
  const d = await newDevice(browser);
  await d.page.goto(site.url);
  await dismissWelcome(d.page);
  await waitForVoice(d.page, man);
  await d.page.evaluate(() => { window.__tts.length = 0; });
  return d;
}

test('a round: read with the mic, skip one (it comes back at the end), finish with a sticker, all in the downloaded voice', async ({ browser }) => {
  const { page } = await readyDevice(browser, 'round');
  await page.click('[data-act="play"]');
  let skipped = '', seen = [];
  for (let i = 0; i < 7; i++) {
    await page.locator('#act .tile').first().waitFor();
    await page.waitForTimeout(300);
    const w = await page.evaluate(f => new Function('return (' + f + ')()')(), SAY_TILES.toString());
    seen.push(w);
    await expect(page.locator('.dots i').nth(i - (i > 1 ? 1 : 0))).toHaveClass(/c/);   // a skip fills no dot
    if (i === 1) {
      skipped = w;
      await page.evaluate(() => { window.__say = 'zzz'; });
      await page.click('[data-a="skip"]');
      await expect.poll(() => page.evaluate(f => new Function('return (' + f + ')()')(), SAY_TILES.toString()), { timeout: 15_000 }).not.toBe(w);
      continue;
    }
    if (i === 6) {
      expect(w).toBe(skipped);                                                   // the skipped word, last
      await expect(page.locator('[data-grown]')).toBeVisible();                  // with the grown-up ✓ straight away
    }
    await page.evaluate(f => { window.__say = new Function('return (' + f + ')()'); }, SAY_TILES.toString());
    await ensureMic(page);
    await page.locator('#celenext').waitFor({ timeout: 20_000 });
    await page.waitForTimeout(300);
    await page.click('#celenext');
  }
  await expect(page.locator('.statline').first()).toContainText('You earned a new sticker!');
  await expect(page.locator('.bigtitle')).toContainText('Round complete!');
  const S = await page.evaluate(() => JSON.parse(localStorage.getItem('ollie-word-adventure-v1')));
  expect(S.stickers.length).toBe(1);
  expect(S.stars).toBe(6);
  expect(await page.evaluate(() => window.__tts)).toEqual([]);   // nothing fell back to the device voice
});

test('a story played end to end, narrated from the downloaded voice', async ({ browser }) => {
  const { page } = await readyDevice(browser, 'story');
  await openSettings(page);
  await page.check('#s-unlock', { force: true });
  await page.click('#s-close');
  await page.click('[data-act="stories"]');
  await page.click('[data-act="story"][data-id="cat"]');
  await page.evaluate(f => { window.__say = new Function('return (' + f + ')()'); }, SAY_TILES.toString());
  for (let p = 0; p < 5; p++) {
    await expect(page.locator('.dots i').nth(p)).toHaveClass(/c/);
    const next = page.locator('[data-act="storynext"]');
    while (!(await next.isVisible())) { await ensureMic(page); await page.waitForTimeout(200); }
    await expect(page.locator('#sent .w.tg:not(.ok)')).toHaveCount(0);
    await next.click();
  }
  await expect(page.locator('.bigtitle')).toContainText('The End!');
  const S = await page.evaluate(() => JSON.parse(localStorage.getItem('ollie-word-adventure-v1')));
  expect(S.stories.cat).toBe(1);
  expect(await page.evaluate(() => window.__tts)).toEqual([]);
});
