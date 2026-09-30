// The mic stays open for the whole word (each stop/start makes iOS play its chime) and ignores Ollie.
import { test, expect } from '@playwright/test';
import { newSite, newDevice, dismissWelcome, ensureMic, SAY_TILES } from './helpers.mjs';

async function round(browser, name) {
  const site = newSite(name, { voice: false });
  const d = await newDevice(browser);
  await d.page.goto(site.url);
  await dismissWelcome(d.page);
  await d.page.click('[data-act="play"]');
  await d.page.locator('#act .tile').first().waitFor();
  await d.page.evaluate(() => { window.__ttsMs = 1500; window.__say = ''; });   // Ollie's lines take 1.5 s
  return d.page;
}
const word = page => page.evaluate(SAY_TILES);

test('one listen per word: Ollie talking and a wrong word do not restart the mic', async ({ browser }) => {
  const page = await round(browser, 'mic-one');
  await ensureMic(page);
  await expect(page.locator('#act .mic')).toHaveClass(/listening/);
  const starts = await page.evaluate(() => window.__recStarts);
  await page.click('[data-a="sound"]');                             // Ollie talks (sounds out the letters)
  await page.waitForTimeout(2500);
  await page.evaluate(() => { window.__say = 'banana'; });          // a wrong word: feedback, keep listening
  await expect(page.locator('.miclabel')).toContainText('banana');
  await page.waitForTimeout(2500);
  expect(await page.evaluate(() => window.__recStarts)).toBe(starts);
  await expect(page.locator('#act .mic')).toHaveClass(/listening/);
  const w = await word(page);
  await page.evaluate(w => { window.__say = w; }, w);
  await page.locator('#celenext').waitFor();
});

test('the mic ignores Ollie talking, and the moment after', async ({ browser }) => {
  const page = await round(browser, 'mic-echo');
  const w = await word(page);
  await ensureMic(page);
  // the mic "hears" the word only while Ollie is speaking it, and just after
  await page.evaluate(w => { window.__say = () => (window.speechSynthesis.speaking ? w : ''); }, w);
  await page.click('[data-a="sound"]');
  await page.waitForTimeout(1000);
  await page.evaluate(w => { window.__say = () => (window.speechSynthesis.speaking || Date.now() - window.__heardEnd < 900 ? w : ''); window.__heardEnd = Date.now() + 500; }, w);
  await page.waitForTimeout(2500);
  await expect(page.locator('#celenext')).toHaveCount(0);
  await page.evaluate(w => { window.__say = w; }, w);                 // the child says it
  await page.locator('#celenext').waitFor();
});
