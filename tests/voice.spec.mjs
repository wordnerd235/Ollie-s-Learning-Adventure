import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { newSite, newDevice, waitForVoice, dismissWelcome, openSettings, idbSummary, idbPut } from './helpers.mjs';

test('a fresh device downloads the voice, with a progress bar, and gets every clip exactly', async ({ browser }) => {
  const site = newSite('fresh'), man = site.manifest();
  const { page, bins } = await newDevice(browser);
  await page.goto(site.url);
  await waitForVoice(page, man);
  expect(bins.length).toBe(man.parts.ai.files.length + man.parts.mine.files.length);
  expect(await page.evaluate(() => window.__barSeen)).toBe(true);
  await expect(page.locator('#vload')).toHaveCount(0);
  const S = await page.evaluate(() => JSON.parse(localStorage.getItem('ollie-word-adventure-v1')));
  expect(S.settings.murf).toBe(true);
  expect(S.settings.murfBuilt).toBe(man.parts.ai.murf.built);

  // the same clips as the old all-in-one game file puts on a device, sample for sample
  const mine = await idbSummary(page);
  const old = await newDevice(browser);
  await old.page.goto(`/game/fresh/old.html`);
  await old.page.waitForFunction(() => localStorage.getItem('ollie-pack-id'), null, { timeout: 60_000 });
  await old.page.waitForTimeout(500);
  const ref = await idbSummary(old.page);
  expect(Object.keys(mine).length).toBe(man.parts.ai.n + man.parts.mine.n);
  expect(mine).toEqual(ref);
  expect(Object.keys(mine).filter(k => k.startsWith('m:@')).every(k => mine[k].w > 0)).toBe(true);   // story timings kept
});

test('a device that already has this voice does not download it again', async ({ browser }) => {
  const site = newSite('again'), man = site.manifest();
  const { page, bins } = await newDevice(browser);
  await page.goto(site.url);
  await waitForVoice(page, man);
  bins.length = 0;
  const manifestLoads = [];
  page.on('request', r => { if (r.url().includes('manifest.json')) manifestLoads.push(r.url()); });
  await page.reload();
  await page.waitForTimeout(1500);
  expect(manifestLoads.length).toBe(1);
  expect(bins).toEqual([]);
});

test('a device with the voice from the old all-in-one game file does not download it again', async ({ browser }) => {
  const site = newSite('bridge'), man = site.manifest();
  const { page, bins } = await newDevice(browser);
  await page.goto(site.url + 'old.html');
  await page.waitForFunction(() => localStorage.getItem('ollie-pack-id'), null, { timeout: 60_000 });
  await page.waitForTimeout(500);
  await page.goto(site.url);
  await waitForVoice(page, man);
  expect(bins).toEqual([]);
});

test('export after recording, upload, and another device gets the new recording', async ({ browser }) => {
  const site = newSite('export'), man = site.manifest();
  const A = await newDevice(browser);
  await A.page.goto(site.url);
  await waitForVoice(A.page, man);
  await dismissWelcome(A.page);
  // "record" a new word and re-record a letter sound on device A
  await idbPut(A.page, [['w:sun', { sr: 24000, len: 7000, amp: 5000, at: Date.now() }], ['p:aa', { sr: 24000, len: 5000, amp: 3000, at: Date.now() }]]);
  await A.page.reload();
  await A.page.waitForTimeout(800);
  expect(A.bins.length).toBe(2);   // only the first visit downloaded
  await openSettings(A.page);
  await A.page.click('#s-bake');
  await expect(A.page.locator('#s-bakest')).toContainText('Ready');
  const rows = A.page.locator('#s-vfiles .vrow');
  await expect(rows.filter({ hasText: 'ai-1.bin' })).toContainText('same as the site');
  await expect(rows.filter({ hasText: 'mine-1.bin' })).toContainText('changed');
  await expect(rows.filter({ hasText: 'manifest.json' })).toContainText('changed');
  // save the changed files and "upload" them to the site's voice folder
  for (const row of await rows.filter({ hasText: 'changed' }).all()) {
    const [dl] = await Promise.all([A.page.waitForEvent('download'), row.locator('[data-vf]').click()]);
    await dl.saveAs(path.join(site.voiceDir, dl.suggestedFilename()));
  }
  const man2 = site.manifest();
  expect(man2.parts.ai.v).toBe(man.parts.ai.v);
  expect(man2.parts.mine.v).not.toBe(man.parts.mine.v);
  const a = await idbSummary(A.page);

  // device B (fresh) gets everything, including the new recordings
  const B = await newDevice(browser);
  await B.page.goto(site.url);
  await waitForVoice(B.page, man2);
  const b = await idbSummary(B.page);
  expect(b['w:sun']).toEqual(a['w:sun']);
  expect(b['p:aa']).toEqual(a['p:aa']);
  expect(b).toEqual(a);

  // device A made the files, so it doesn't download them back
  A.bins.length = 0;
  await A.page.reload();
  await A.page.waitForTimeout(1500);
  expect(A.bins).toEqual([]);

  // a device that downloaded the old version gets only the recordings part
  const C = await newDevice(browser);
  fs.writeFileSync(path.join(site.voiceDir, 'manifest.json'), JSON.stringify(man));
  await C.page.goto(site.url);
  await waitForVoice(C.page, man);
  fs.writeFileSync(path.join(site.voiceDir, 'manifest.json'), JSON.stringify(man2));
  C.bins.length = 0;
  await C.page.reload();
  await waitForVoice(C.page, man2);
  expect(C.bins.map(u => path.basename(new URL(u).pathname))).toEqual(['mine-1.bin']);
});
