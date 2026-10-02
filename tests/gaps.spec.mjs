// Every line Ollie can say must be recordable: give a device a recording for every line the recorder
// lists, play through the game, and fail on any sentence that came from the AI or device voice.
import { test, expect } from '@playwright/test';
import { newSite, newDevice, ensureMic, SAY_TILES, idbPut } from './helpers.mjs';

test('every line Ollie says is in the recorder', async ({ browser }) => {
  test.setTimeout(300_000);
  const site = newSite('gaps', { voice: false });
  const { context, page } = await newDevice(browser);
  await context.addInitScript(() => {   // kept across reloads
    const L = window.__ollieLog = [], push = L.push.bind(L);
    L.push = (...a) => { try { const s = JSON.parse(sessionStorage.getItem('__ol') || '[]'); s.push(...a); sessionStorage.setItem('__ol', JSON.stringify(s)); } catch (e) {} return push(...a); };
  });
  const settings = async () => { await page.locator('#gear').dispatchEvent('pointerdown'); await page.locator('.mcard h2', { hasText: 'Grown-up settings' }).waitFor(); };
  await page.goto(site.url);
  await page.fill('#w-name', 'Sam');
  await page.click('#w-go');
  await page.locator('#scheck [data-sc="skip"]').click();

  // every line the recorder lists
  await settings();
  await page.click('#s-rec');
  for (const d of await page.locator('details.vsec summary').all()) await d.click();
  const keys = await page.$$eval('.vrow[data-k]', rows => rows.map(r => r.dataset.k));
  expect(keys.length).toBeGreaterThan(300);
  await idbPut(page, keys.map(k => [k, { sr: 22050, len: 2205, amp: 3000, at: 1 }]));
  await page.evaluate(() => sessionStorage.setItem('__ol', '[]'));   // count only what is said from here on

  // fresh run with another name, all recorded: welcome, sound check, greetings, owl
  await page.evaluate(() => { const S = JSON.parse(localStorage.getItem('ollie-word-adventure-v1')); S.seen = false; S.soundChecked = false; localStorage.setItem('ollie-word-adventure-v1', JSON.stringify(S)); });
  await page.reload();
  await page.fill('#w-name', 'Ava');                               // a different child: still all recorded
  await page.click('#w-go');
  await page.click('#scheck [data-sc="start"]');
  await page.waitForTimeout(2500);
  await page.click('#scheck [data-sc="done"]');
  await page.waitForTimeout(800);
  await page.reload(); await page.waitForTimeout(800);            // "Hello, again!"
  await page.click('[data-act="owl"]'); await page.waitForTimeout(800);
  await page.click('[data-act="known"]').catch(() => {});
  await page.goto(site.url); await page.waitForTimeout(500);

  // a round: misses, letter taps, sound out, a skip, correct reads, the end
  await page.click('[data-act="play"]');
  await page.locator('#act .tile').first().waitFor();
  await page.click('#act .tile >> nth=0'); await page.click('#act .tile >> nth=0'); await page.waitForTimeout(600);
  await page.click('[data-a="sound"]'); await page.waitForTimeout(2500);
  await page.evaluate(() => { window.__ttsMs = 30; });
  for (let m = 0; m < 3; m++) { await page.evaluate(m => { window.__say = 'zebra' + 'x'.repeat(m); }, m); await ensureMic(page); await page.waitForTimeout(3500); }
  await page.evaluate(() => { window.__say = ''; }); await ensureMic(page); await page.waitForTimeout(10000);   // nothing heard: the mic turns off
  await page.evaluate(() => { window.__say = ''; });
  await page.click('[data-a="skip"]'); await page.waitForTimeout(2500);
  await page.evaluate(f => { window.__say = new Function('return (' + f + ')()'); }, SAY_TILES.toString());
  for (let i = 1; i < 6; i++) { await ensureMic(page); await page.locator('#celenext').waitFor({ timeout: 20000 }); await page.waitForTimeout(2500); await page.click('#celenext'); await page.locator('#act .tile, .bigtitle').first().waitFor(); await page.waitForTimeout(300); }
  await page.locator('.bigtitle', { hasText: 'Round complete' }).waitFor(); await page.waitForTimeout(1500);

  // a story with one skip, to the end
  await page.evaluate(() => { const S = JSON.parse(localStorage.getItem('ollie-word-adventure-v1')); S.settings.unlockAll = true; localStorage.setItem('ollie-word-adventure-v1', JSON.stringify(S)); });
  await page.goto(site.url); await page.waitForTimeout(500);
  await page.click('[data-act="stories"]');
  await page.click('[data-act="story"][data-id="cat"]');
  await page.evaluate(() => { window.__say = ''; });
  await page.locator('#act [data-a="skip"]').click({ timeout: 20000 });
  await page.evaluate(f => { window.__say = new Function('return (' + f + ')()'); }, SAY_TILES.toString());
  const next = page.locator('[data-act="storynext"]');
  for (let p = 0; p < 5; p++) { while (!(await next.isVisible())) { await ensureMic(page); await page.waitForTimeout(200); } await next.click(); }
  await page.locator('.bigtitle', { hasText: 'The End' }).waitFor(); await page.waitForTimeout(2000);

  // known words, settings voice tests
  await page.click('[data-act="home"]');
  await page.click('[data-act="known"]'); await page.locator('.kw').first().click(); await page.waitForTimeout(600);
  await page.click('[data-act="home"]');
  await settings(); await page.click('#s-testv'); await page.waitForTimeout(1500);

  const log = await page.evaluate(() => JSON.parse(sessionStorage.getItem('__ol') || '[]'));
  const gaps = [...new Set(log.filter(x => x.src !== 'mine').map(x => `${x.src}: ${x.t}`))];
  console.log('sentences said:', log.length, ' not in the owner\'s voice:', JSON.stringify(gaps, null, 1));
  console.log('UNIQUE', JSON.stringify([...new Set(log.map(x => x.t))]));
  expect(gaps).toEqual([]);
});
