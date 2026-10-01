import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { newSite, newDevice, dismissWelcome, REPO } from './helpers.mjs';

test('a refresh greets a returning player', async ({ browser }) => {
  const site = newSite('greet', { voice: false });
  const { page } = await newDevice(browser);
  await page.goto(site.url);
  await dismissWelcome(page);
  await page.waitForTimeout(500);
  await page.reload();
  await expect.poll(() => page.evaluate(() => window.__tts)).toContain('Hello, again! Ready to read?');
  // only once: tapping around the home screen doesn't repeat it
  await page.locator('.title').click();
  await page.waitForTimeout(400);
  expect((await page.evaluate(() => window.__tts)).filter(t => t === 'Hello, again! Ready to read?').length).toBe(1);
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

test('the known-words count opens a list of the words, and a word can be heard', async ({ browser }) => {
  const site = newSite('known', { voice: false });
  const { page } = await newDevice(browser);
  await page.goto(site.url);
  await dismissWelcome(page);
  await page.evaluate(() => { const S = JSON.parse(localStorage.getItem('ollie-word-adventure-v1')); S.words = { cat: { n: 2, ok: 2, sc: 2, sk: 0 }, dog: { n: 2, ok: 2, sc: 2, sk: 0 }, pig: { n: 1, ok: 1, sc: 1, sk: 0 } }; localStorage.setItem('ollie-word-adventure-v1', JSON.stringify(S)); });
  await page.reload();
  await expect(page.locator('[data-act="known"]')).toContainText('2 words I know');
  await page.click('[data-act="known"]');
  await expect(page.locator('.kw')).toHaveCount(2);
  await expect(page.locator('.kgrid')).toContainText('cat');
  await expect(page.locator('.kgrid')).not.toContainText('pig');
  await page.evaluate(() => { window.__tts.length = 0; });
  await page.locator('.kw', { hasText: 'dog' }).click();
  await expect.poll(() => page.evaluate(() => window.__tts)).toContain('dog!');
  await page.click('[data-act="home"]');
  await expect(page.locator('.menu')).toBeVisible();
});

test('the recorder records and saves a take', async ({ browser }) => {
  const site = newSite('recorder', { voice: false });
  const { page } = await newDevice(browser);
  await page.goto(site.url);
  await dismissWelcome(page);
  await page.locator('#gear').dispatchEvent('pointerdown');
  await page.click('#s-rec');
  await page.locator('details.vsec summary').first().click();
  const row = page.locator('details.vsec .vrow').first();
  await row.locator('[data-v="rec"]').click();
  await expect(page.locator('#v-status')).toHaveText('Recording… speak now.');
  await expect(row).toHaveClass(/has/, { timeout: 15_000 });
});


test('the mic test page loads an Ollie line and runs every test', async ({ browser }) => {
  const { page } = await newDevice(browser);
  await page.goto('/tools/mic-test.html');
  await expect(page.locator('#vst')).toContainText('Ready. Test line:');
  for (const [t, done] of [['base', 'normal volume'], ['sr', 'Done.'], ['raw', 'Done: mic off.'], ['ec', 'Done: mic off.']]) {
    await page.click(`[data-t="${t}"]`);
    await expect(page.locator(`[data-s="${t}"]`)).toContainText(done, { timeout: 30_000 });
  }
});

test('?audiodebug shows the audio log; without it nothing is shown', async ({ browser }) => {
  const site = newSite('adbg', { voice: false });
  const { page } = await newDevice(browser);
  await page.goto(site.url + '?audiodebug');
  await dismissWelcome(page);
  await page.click('[data-act="play"]');
  await page.locator('#act .mic').evaluate(m => m.click());
  await expect(page.locator('#adbg')).toContainText('engine created at');
  await expect(page.locator('#adbg')).toContainText('mic on');
  await expect(page.locator('#adbg')).toContainText('rate check: engine');
  await page.goto(site.url);
  await page.waitForTimeout(800);
  await expect(page.locator('#adbg')).toHaveCount(0);
});

test('clips fade in, fade out when cut short, and an inaudible keep-alive runs (no clicks or speaker wake-up pops)', async ({ browser }) => {
  const site = newSite('fades');
  const { context, page } = await newDevice(browser);
  await context.addInitScript(() => {
    window.__ramps = []; window.__loops = [];
    const r = AudioParam.prototype.linearRampToValueAtTime;
    AudioParam.prototype.linearRampToValueAtTime = function (v, t) { window.__ramps.push(v); return r.call(this, v, t); };
    const st = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...a) { if (this.loop) { const d = this.buffer.getChannelData(0); window.__loops.push(Math.max(...d.map(Math.abs))); } return st.apply(this, a); };
  });
  await page.goto(site.url);
  await dismissWelcome(page);
  await page.waitForTimeout(1500);
  await page.evaluate(() => { window.__ramps.length = 0; });
  await page.click('[data-act="owl"]');                 // Ollie starts talking: fade in
  await page.waitForTimeout(300);
  await page.click('[data-act="owl"]');                 // tapped again mid-line: the first line is cut, with a fade out
  await page.waitForTimeout(500);
  const ramps = await page.evaluate(() => window.__ramps);
  expect(ramps).toContain(1);
  expect(ramps).toContain(0);
  const loops = await page.evaluate(() => window.__loops);
  expect(loops.length).toBeGreaterThan(0);
  expect(Math.max(...loops)).toBeLessThan(0.001);        // about -80 dB
});

test('snapped-open starts are softened; clean audio is untouched (the game\'s own code)', async () => {
  const html = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');
  const i = html.indexOf('function desnap('), desnap = new Function(html.slice(i, html.indexOf('\n}\n', i) + 2) + '\nreturn desnap;')();
  const sr = 24000, x = new Float32Array(sr);
  for (let j = 0; j < sr; j++) { const t = j / sr; x[j] = t < 0.04 ? 0.001 * Math.sin(j) : 0.6 * Math.sin(2 * Math.PI * 180 * t) * Math.min(1, (1 - t) * 4); }  // silence, then a voice that starts instantly
  const y = Float32Array.from(x);
  expect(desnap(y, sr)).toBe(1);
  const s0 = Math.round(0.04 * sr), jump = a => Math.max(...Array.from({ length: 48 }, (_, k) => Math.abs(a[s0 + k])));
  expect(jump(x)).toBeGreaterThan(0.3);
  expect(Math.max(...Array.from({ length: 24 }, (_, k) => Math.abs(y[s0 + k])))).toBeLessThan(0.2);   // first ms is gentle now
  let diff = 0; for (let j = 0; j < sr; j++) if (y[j] !== x[j]) diff++;
  expect(diff).toBeLessThan(sr * 0.01);                                                              // only the onset changed
  const clean = new Float32Array(sr); for (let j = 0; j < sr; j++) clean[j] = 0.5 * Math.sin(2 * Math.PI * 200 * j / sr) * Math.sin(Math.PI * j / sr);
  const c2 = Float32Array.from(clean);
  expect(desnap(c2, sr)).toBe(0);
  expect(c2).toEqual(clean);
});
