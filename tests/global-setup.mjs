// Makes the test fixture once (cached in .work/):
//  1. runs the OLD game code (fixtures/old-game.html, which still has "Make game file with voice")
//     against a fake ElevenLabs to build a complete AI voice pack, plus a few "owner recordings";
//  2. saves the old all-in-one game file with the voice inside (.work/old.html), like the real 44.5 MB one;
//  3. extracts it with tools/extract.html (the page the owner uses) into .work/base-voice/.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { startServer } from './server.mjs';
import { PORT, IPHONE_UA, REPO, WORK, BASE_VOICE, installStubs, mockElevenLabs, dismissWelcome, openSettings, idbPut } from './helpers.mjs';

export default async function globalSetup() {
  const server = await startServer(PORT);
  const oldHtml = path.join(WORK, 'old.html');
  if (!fs.existsSync(oldHtml)) {
    fs.mkdirSync(WORK, { recursive: true });
    fs.copyFileSync(path.join(REPO, 'tests/fixtures/old-game.html'), path.join(WORK, 'old-src.html'));
    const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
    const context = await browser.newContext({ userAgent: IPHONE_UA, acceptDownloads: true });
    await installStubs(context);
    const page = await context.newPage();
    await mockElevenLabs(page);
    await page.goto(`http://localhost:${PORT}/gen/old.html`);
    await dismissWelcome(page);
    await idbPut(page, [['p:aa', { sr: 24000, len: 6000, amp: 8000, at: 1000 }], ['p:kuh', { sr: 24000, len: 4000, amp: 8000, at: 1000 }],
      ['w:cat', { sr: 24000, len: 9000, amp: 8000, at: 1000 }], ['w:dog', { sr: 24000, len: 9000, amp: 8000, at: 1000 }],
      ['r:great job', { sr: 24000, len: 12000, amp: 8000, at: 1000 }]]);
    await page.reload();
    await openSettings(page);
    await page.selectOption('#m-prov', 'el');
    await page.fill('#m-key', 'test-key');
    await page.click('#m-load');
    await page.locator('#m-build').waitFor({ state: 'visible' });
    await page.click('#m-build');
    await page.locator('#m-status', { hasText: 'Done.' }).waitFor({ timeout: 300_000 });
    await page.click('#s-bake');
    await page.locator('#s-bakesave').waitFor({ state: 'visible', timeout: 60_000 });
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#s-bakesave')]);
    await dl.saveAs(oldHtml);
    await browser.close();
  }
  fs.rmSync(BASE_VOICE, { recursive: true, force: true });
  fs.mkdirSync(BASE_VOICE, { recursive: true });
  {
    const browser = await chromium.launch();
    const page = await (await browser.newContext({ acceptDownloads: true })).newPage();
    await page.goto(`http://localhost:${PORT}/tools/extract.html`);
    await page.setInputFiles('#pick', oldHtml);
    await page.locator('#status', { hasText: 'Done.' }).waitFor({ timeout: 60_000 });
    console.log(await page.locator('#status').innerText());
    for (const b of await page.locator('#files button[data-i]:not([data-i="all"])').all()) {
      const [dl] = await Promise.all([page.waitForEvent('download'), b.click()]);
      await dl.saveAs(path.join(BASE_VOICE, dl.suggestedFilename()));
    }
    await browser.close();
  }
  return async () => { server.close(); };
}
