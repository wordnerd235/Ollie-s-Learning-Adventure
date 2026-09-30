import { test, expect } from '@playwright/test';
import { newSite, newDevice, dismissWelcome } from './helpers.mjs';

test('a refresh greets a returning player', async ({ browser }) => {
  const site = newSite('greet', { voice: false });
  const { page } = await newDevice(browser);
  await page.goto(site.url);
  await dismissWelcome(page);
  await page.waitForTimeout(500);
  await page.reload();
  await expect.poll(() => page.evaluate(() => window.__tts)).toContain('Hi Sam! Ready to read?');
  // only once: tapping around the home screen doesn't repeat it
  await page.locator('.title').click();
  await page.waitForTimeout(400);
  expect((await page.evaluate(() => window.__tts)).filter(t => t === 'Hi Sam! Ready to read?').length).toBe(1);
});

test('stickers can be turned in 15° steps, and stay turned', async ({ browser }) => {
  const site = newSite('rotate', { voice: false });
  const { page } = await newDevice(browser);
  await page.goto(site.url);
  await dismissWelcome(page);
  await page.evaluate(() => { const S = JSON.parse(localStorage.getItem('ollie-word-adventure-v1')); S.stickers = ['🦄']; localStorage.setItem('ollie-word-adventure-v1', JSON.stringify(S)); });
  await page.reload();
  await page.click('[data-act="stickers"]');
  await page.click('[data-act="scenes"]');
  await page.click('[data-act="scene"][data-id="meadow"]');
  await page.click('.tray [data-add]');
  const span = page.locator('#pscene .pst span');
  await page.click('[data-p="right"]'); await page.click('[data-p="right"]');
  await expect(span).toHaveAttribute('style', /rotate\(30deg\)/);
  await page.click('[data-p="left"]'); await page.click('[data-p="left"]'); await page.click('[data-p="left"]');
  await expect(span).toHaveAttribute('style', /rotate\(345deg\)/);
  await page.click('[data-p="flip"]');
  await expect(span).toHaveAttribute('style', /rotate\(345deg\) scaleX\(-1\)/);
  await page.reload();
  await page.click('[data-act="stickers"]');
  await page.click('[data-act="scenes"]');
  await page.click('[data-act="scene"][data-id="meadow"]');
  await expect(page.locator('#pscene .pst span')).toHaveAttribute('style', /rotate\(345deg\) scaleX\(-1\)/);
});
