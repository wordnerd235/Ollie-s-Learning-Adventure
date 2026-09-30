// The voice must be on the device before Ollie first speaks; "Continue without sound" skips the wait.
import { test, expect } from '@playwright/test';
import { newSite, newDevice, waitForVoice, dismissWelcome } from './helpers.mjs';

/* hold the voice downloads until release() is called */
async function holdBins(page) {
  let release; const gate = new Promise(r => { release = r; });
  await page.route('**/voice/*.bin*', async route => { await gate; await route.continue(); });
  return () => release();
}

test('first visit: "Let\'s go" waits for the voice, then the greeting is in the downloaded voice', async ({ browser }) => {
  const site = newSite('gate-first'), man = site.manifest();
  const { page } = await newDevice(browser);
  const release = await holdBins(page);
  await page.goto(site.url);
  await page.fill('#w-name', 'Sam');
  await expect(page.locator('#w-go')).toBeDisabled();
  await expect(page.locator('#w-wait')).toBeVisible();
  release();
  await waitForVoice(page, man);
  await expect(page.locator('#w-go')).toBeEnabled();
  await expect(page.locator('#w-wait')).toBeHidden();
  await page.click('#w-go');
  await expect(page.locator('.menu')).toBeVisible();
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__tts.filter(t => t.trim()))).toEqual([]);   // greeting came from the voice files, not the device voice
});

test('first visit: "Continue without sound" lets them in silently; sound returns when the voice arrives', async ({ browser }) => {
  const site = newSite('gate-silent'), man = site.manifest();
  const { page } = await newDevice(browser);
  const release = await holdBins(page);
  await page.goto(site.url);
  await expect(page.locator('#w-go')).toBeDisabled();
  await page.click('#w-silent');
  await expect(page.locator('#w-go')).toBeEnabled();
  await page.fill('#w-name', 'Sam');
  await page.click('#w-go');
  await expect(page.locator('.menu')).toBeVisible();
  await page.click('[data-act="owl"]');                         // would normally speak
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.__tts.filter(t => t.trim()))).toEqual([]);   // (" " is the silent iOS audio unlock)
  release();
  await waitForVoice(page, man);
  // the voice has arrived: sound is back on
  await page.evaluate(() => { window.__tts.length = 0; });
  await page.locator('#gear').dispatchEvent('pointerdown');
  await page.locator('#m-on').uncheck({ force: true });           // AI voice off, so the test line uses the device voice
  await page.locator('#s-testv').click();
  await expect.poll(() => page.evaluate(() => window.__tts.length)).toBeGreaterThan(0);
});

test('returning player: a card covers the menu while a new voice downloads', async ({ browser }) => {
  const site = newSite('gate-return'), man = site.manifest();
  const { page } = await newDevice(browser);
  await page.goto(site.url);
  await dismissWelcome(page);
  await waitForVoice(page, man);
  await page.evaluate(() => localStorage.removeItem('ollie-voice-v:mine'));   // as if new recordings were uploaded
  const release = await holdBins(page);
  await page.reload();
  await expect(page.locator('#vgate')).toBeVisible();
  release();
  await waitForVoice(page, man);
  await expect(page.locator('#vgate')).toHaveCount(0);
  // and the silent button closes it
  await page.evaluate(() => localStorage.removeItem('ollie-voice-v:mine'));
  const release2 = await holdBins(page);
  await page.reload();
  await page.locator('#vgate [data-a="silent"]').click();
  await expect(page.locator('#vgate')).toHaveCount(0);
  await expect(page.locator('.menu')).toBeVisible();
  release2();
});

test('first visit: if the voice fails to download, "Let\'s go" unlocks with a note', async ({ browser }) => {
  const site = newSite('gate-fail');
  const { page } = await newDevice(browser);
  await page.route('**/voice/*.bin*', r => r.fulfill({ status: 500 }));
  await page.goto(site.url);
  await expect(page.locator('#w-go')).toBeEnabled();
  await expect(page.locator('#w-fail')).toBeVisible();
});
