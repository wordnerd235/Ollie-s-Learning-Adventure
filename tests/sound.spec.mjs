import { test, expect } from '@playwright/test';
import { newSite, newDevice, IPHONE_UA, installStubs, ensureMic, SAY_TILES } from './helpers.mjs';

const countMics = () => {   // every microphone opened, and how many are still open
  window.__streams = []; const g = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = async c => { const st = await g(c); window.__streams.push(st); return st; };
  window.__live = () => window.__streams.filter(st => st.getTracks().some(t => t.readyState === 'live')).length;
};

test('first run on an iPhone: sound check opens the mic and keeps it, then the greeting; not shown again', async ({ browser }) => {
  const site = newSite('scheck', { voice: false });
  const { context, page } = await newDevice(browser);
  await context.addInitScript(countMics);
  await page.goto(site.url);
  await page.fill('#w-name', 'Sam');
  await page.click('#w-go');
  await expect(page.locator('#scheck')).toBeVisible();
  expect(await page.evaluate(() => window.__streams.length)).toBe(0);
  await page.evaluate(() => { window.__tts.length = 0; });
  await page.click('#scheck [data-sc="start"]');
  await expect(page.locator('#scheck [data-step="mic"]')).toBeVisible();
  expect(await page.evaluate(() => window.__live())).toBe(1);
  await expect.poll(() => page.evaluate(() => window.__tts.filter(t => t.includes("I'm Ollie the owl")).length), { timeout: 10_000 }).toBeGreaterThan(1);   // keeps talking
  await page.click('#scheck [data-sc="done"]');
  await expect(page.locator('#scheck')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.__tts)).toContain('Hi friend! Ready to read?');
  expect(await page.evaluate(() => window.__live())).toBe(1);             // still open
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ollie-word-adventure-v1')).soundChecked)).toBe(true);
  await page.reload();
  await expect(page.locator('.menu')).toBeVisible();
  await expect(page.locator('#scheck')).toHaveCount(0);
  // and from settings, any time
  await page.locator('#gear').dispatchEvent('pointerdown');
  await page.click('#s-scheck');
  await expect(page.locator('#scheck')).toBeVisible();
  await page.click('#scheck [data-sc="skip"]');
  await expect(page.locator('#scheck')).toHaveCount(0);
});

test('iPhone: the mic stays open across a round, the mic button, Home and the next visit; the recorder lets go of it', async ({ browser }) => {
  const site = newSite('held', { voice: false });
  const { context, page } = await newDevice(browser);
  await context.addInitScript(countMics);
  await page.goto(site.url);
  await page.fill('#w-name', 'Sam'); await page.click('#w-go');
  await page.click('#scheck [data-sc="skip"]');
  expect(await page.evaluate(() => window.__live())).toBe(0);              // not before it is allowed
  await page.click('[data-act="play"]');
  await page.locator('#act .tile').first().waitFor();
  await ensureMic(page);                                                    // first mic tap: asks, then holds
  await expect.poll(() => page.evaluate(() => window.__live())).toBe(1);
  await page.evaluate(f => { window.__say = new Function('return (' + f + ')()'); }, SAY_TILES.toString());
  await page.locator('#celenext').waitFor({ timeout: 20000 });
  await page.click('#celenext');
  await page.locator('#act .tile').first().waitFor();
  await page.evaluate(() => document.querySelector('#act [data-a="mic"]')?.click());   // mic button off: only stops listening
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__live())).toBe(1);
  await page.evaluate(() => document.querySelector('[data-act="home"]').click());
  expect(await page.evaluate(() => window.__live())).toBe(1);
  expect(await page.evaluate(() => window.__streams.length)).toBe(1);      // opened once, never closed and reopened
  expect(await page.evaluate(() => navigator.audioSession ? navigator.audioSession.type : 'none')).not.toBe('playback');
  // next visit: the first tap opens it again, without a prompt
  await page.reload();
  await expect(page.locator('.menu')).toBeVisible();
  expect(await page.evaluate(() => window.__live())).toBe(0);
  await page.click('[data-act="owl"]');
  await expect.poll(() => page.evaluate(() => window.__live())).toBe(1);
  // the recorder lets go of it, and it isn't reopened while recording
  await page.locator('#gear').dispatchEvent('pointerdown');
  await page.click('#s-rec');
  await expect.poll(() => page.evaluate(() => window.__live())).toBe(0);
  await page.locator('details.vsec summary').first().click();
  expect(await page.evaluate(() => window.__live())).toBe(0);
  await page.locator('.vrow [data-v="rec"]').first().click();
  await expect.poll(() => page.evaluate(() => window.__live()), { timeout: 12_000 }).toBe(0);   // the take ends; nothing reopens
  await page.goto(site.url);
  await page.click('[data-act="owl"]');
  await expect.poll(() => page.evaluate(() => window.__live())).toBe(1);
});

test('not on a computer: no sound check at first run', async ({ browser }) => {
  const site = newSite('scheck-pc', { voice: false });
  const context = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36' });
  await installStubs(context);
  const page = await context.newPage();
  await page.goto(site.url);
  await page.fill('#w-name', 'Sam');
  await page.click('#w-go');
  await expect(page.locator('.menu')).toBeVisible();
  await page.waitForTimeout(800);
  await expect(page.locator('#scheck')).toHaveCount(0);
});
