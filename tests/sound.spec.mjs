import { test, expect } from '@playwright/test';
import { newSite, newDevice, IPHONE_UA, installStubs } from './helpers.mjs';

test('first run on an iPhone: sound check with the mic on, then the greeting; not shown again', async ({ browser }) => {
  const site = newSite('scheck', { voice: false });
  const { context, page } = await newDevice(browser);
  await context.addInitScript(() => {   // count microphone opens
    window.__mics = 0; const g = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = c => { window.__mics++; return g(c); };
  });
  await page.goto(site.url);
  await page.fill('#w-name', 'Sam');
  await page.click('#w-go');
  await expect(page.locator('#scheck')).toBeVisible();
  await page.evaluate(() => { window.__tts.length = 0; });
  // step 1: normal volume, mic off, Ollie talking
  await page.click('#scheck [data-sc="start"]');
  await expect(page.locator('#scheck [data-step="vol"]')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__tts.filter(t => t.includes("I'm Ollie the owl")).length), { timeout: 10_000 }).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__mics)).toBe(0);
  // step 2: the mic turns on
  await page.click('#scheck [data-sc="next"]');
  await expect(page.locator('#scheck [data-step="mic"]')).toBeVisible();
  expect(await page.evaluate(() => window.__mics)).toBe(1);
  await page.evaluate(() => { window.__tts.length = 0; });
  await expect(page.locator('#scheck [data-sc="done"]')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__tts.filter(t => t.includes("I'm Ollie the owl")).length), { timeout: 10_000 }).toBeGreaterThan(1);   // keeps talking
  await page.click('#scheck [data-sc="done"]');
  await expect(page.locator('#scheck')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.__tts)).toContain('Hi friend! Ready to read?');
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
