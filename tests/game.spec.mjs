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

test('a round: read with the mic, skip one, finish with a sticker, all in the downloaded voice', async ({ browser }) => {
  const { page } = await readyDevice(browser, 'round');
  await page.click('[data-act="play"]');
  for (let i = 0; i < 6; i++) {
    await page.locator('#act .tile').first().waitFor();
    await expect(page.locator('.dots i').nth(i)).toHaveClass(/c/);
    if (i === 1) {
      await page.evaluate(() => { window.__say = 'zzz'; });
      await page.click('[data-a="skip"]');
      continue;
    }
    await page.evaluate(f => { window.__say = new Function('return (' + f + ')()'); }, SAY_TILES.toString());
    await ensureMic(page);
    await page.locator('#celenext').waitFor({ timeout: 20_000 });
    await page.waitForTimeout(300);
    if (i === 5) { const dots = await page.locator('.dots i').evaluateAll(d => d.map(x => x.className)); expect(dots.slice(0, 5)).toEqual(['d', '', 'd', 'd', 'd']); }   // the skipped word's dot stays empty
    await page.click('#celenext');
  }
  await expect(page.locator('.statline').first()).toContainText('You earned a new sticker!');
  await expect(page.locator('.bigtitle')).toContainText('Round complete!');
  const S = await page.evaluate(() => JSON.parse(localStorage.getItem('ollie-word-adventure-v1')));
  expect(S.stickers.length).toBe(1);
  expect(S.stars).toBe(5);
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
