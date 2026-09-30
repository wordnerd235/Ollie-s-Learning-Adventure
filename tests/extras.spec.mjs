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

test('voice boost: devices start once on the new 2x default; a boost set later is kept', async ({ browser }) => {
  const site = newSite('boost', { voice: false });
  const { page } = await newDevice(browser);
  await page.goto(site.url);
  await dismissWelcome(page);
  const settings = () => page.evaluate(() => JSON.parse(localStorage.getItem('ollie-word-adventure-v1')).settings);
  expect(await settings()).toMatchObject({ boost: true, boostLvl: 2, boostV: 3 });
  for (const old of [{ boost: true, boostLvl: 2.4, boostV: undefined }, { boost: false, boostLvl: 1, boostV: 2 }]) {
    await page.evaluate(o => { const S = JSON.parse(localStorage.getItem('ollie-word-adventure-v1')); Object.assign(S.settings, o); if (o.boostV === undefined) delete S.settings.boostV; localStorage.setItem('ollie-word-adventure-v1', JSON.stringify(S)); }, old);
    await page.reload();
    expect(await settings()).toMatchObject({ boost: true, boostLvl: 2, boostV: 3 });
  }
  await page.evaluate(() => { const S = JSON.parse(localStorage.getItem('ollie-word-adventure-v1')); S.settings.boost = false; S.settings.boostLvl = 1; localStorage.setItem('ollie-word-adventure-v1', JSON.stringify(S)); });
  await page.reload();
  expect(await settings()).toMatchObject({ boost: false, boostLvl: 1 });
});

test('voice boost gets louder with the slider and never clips (the game\'s own audio chain, offline)', async ({ page }) => {
  const html = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');
  const grab = start => { const i = html.indexOf(start); return html.slice(i, html.indexOf('\n}\n', i) + 2); };
  const code = grab('function setGain(g){') + grab('function voiceChain(ctx){');
  await page.goto('about:blank');
  const r = await page.evaluate(async code => {
    const out = {};
    for (const g of [1, 2, 3.5]) {
      const sr = 48000, N = sr * 2, ctx = new OfflineAudioContext(1, N, sr);
      const G = new Function('AC', code + '\nlet VCH = null;\nreturn { init() { VCH = voiceChain(AC); return VCH; }, setGain };')(ctx);
      // speech-like: syllables of a harmonic buzz with quieter consonant noise, peak 0.9
      const buf = ctx.createBuffer(1, N, sr), d = buf.getChannelData(0);
      for (let i = 0; i < N; i++) { const t = i / sr, env = Math.max(0, Math.sin(Math.PI * t * 5)) ** 3; d[i] = env * (Math.sin(2 * Math.PI * 160 * t) + .4 * Math.sin(2 * Math.PI * 480 * t)) + .05 * (Math.random() * 2 - 1) * (1 - env); }
      let pk = 0; for (const x of d) pk = Math.max(pk, Math.abs(x)); for (let i = 0; i < N; i++) d[i] *= .9 / pk;
      const VCH = G.init(); G.setGain(g);
      const s = ctx.createBufferSource(); s.buffer = buf; s.connect(VCH.comp); VCH.out.connect(ctx.destination); s.start();
      const o = (await ctx.startRendering()).getChannelData(0);
      let q = 0, m = 0; for (const x of o) { q += x * x; m = Math.max(m, Math.abs(x)); }
      out[g] = { db: 20 * Math.log10(Math.sqrt(q / o.length)), peak: m };
    }
    return out;
  }, code);
  expect(r[2].db).toBeGreaterThan(r[1].db + 3);
  expect(r[3.5].db).toBeGreaterThan(r[2].db + 1);
  for (const g of [1, 2, 3.5]) expect(r[g].peak).toBeLessThanOrEqual(0.95);
});

test('"Test boost" turns the mic on, applies the boost, and reports it', async ({ browser }) => {
  const site = newSite('boosttest');
  const { page } = await newDevice(browser);
  await page.goto(site.url);
  await dismissWelcome(page);
  await page.locator('#gear').dispatchEvent('pointerdown');
  await page.click('#s-boosttest');
  await expect(page.locator('#s-boostst')).toContainText('device seen as iPhone/iPad: yes; boost applied: 2.0×');
  await expect(page.locator('#s-boostst')).toContainText('Done: mic off.', { timeout: 15_000 });
});
