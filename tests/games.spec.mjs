// Games: unlocked by the number of words the child knows; touch only, made from the known words.
import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { newSite, newDevice, dismissWelcome, ensureMic, SAY_TILES, playGame, REPO } from './helpers.mjs';

const KEY = 'ollie-word-adventure-v1';
const html = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');
const RAW = html.slice(html.indexOf('const RAW={'), html.indexOf('const WORDS=[]'));
const ALL = [...RAW.matchAll(/'([a-z]+);/g)].map(m => m[1]);
const GAMES = ['balloons', 'snap', 'memory', 'train', 'sounds'];

async function setWords(page, words, extra = {}) {
  await page.evaluate(([KEY, words, extra]) => {
    const S = JSON.parse(localStorage.getItem(KEY)); S.words = words; Object.assign(S, extra);
    if (extra.settings) S.settings = { ...JSON.parse(localStorage.getItem(KEY)).settings, ...extra.settings };
    localStorage.setItem(KEY, JSON.stringify(S));
  }, [KEY, words, extra]);
  await page.reload();
}
const known = ws => Object.fromEntries(ws.map(w => [w, { n: 2, ok: 2, sc: 2, sk: 0 }]));

test('games unlock as words are learned; a locked game shows how many words it needs', async ({ browser }) => {
  expect(ALL.length).toBeGreaterThan(100);
  const site = newSite('games-unlock', { voice: false });
  const { page } = await newDevice(browser);
  await page.goto(site.url);
  await dismissWelcome(page);
  await expect(page.locator('[data-act="games"] .badge')).toHaveCount(0);
  await page.click('[data-act="games"]');
  await expect(page.locator('.scard.locked')).toHaveCount(6);
  await expect(page.locator('[data-game="balloons"]')).toContainText('Know 3 words to unlock');
  await expect(page.locator('[data-game="balloons"] .gmeter')).toContainText('0 / 3');
  await page.click('[data-game="balloons"] [data-act="play"]');            // Practice words: a reading round
  await expect(page.locator('#act .mic')).toBeVisible();

  await setWords(page, known(['cat', 'dog', 'sun', 'hat']));
  await expect(page.locator('[data-act="games"] .badge')).toHaveText('1');  // one new game
  await page.click('[data-act="games"]');
  await expect(page.locator('.scard.locked')).toHaveCount(5);
  await expect(page.locator('[data-game="snap"] .gmeter')).toContainText('4 / 6');
  await page.click('[data-act="game"][data-id="balloons"]');
  await playGame(page, 'balloons');
  await page.click('[data-act="home"]');
  await expect(page.locator('[data-act="games"] .badge')).toHaveCount(0);  // played: no longer new

  // grown-up setting: everything open
  await setWords(page, known(['cat']), { settings: { unlockAll: true } });
  await page.click('[data-act="games"]');
  await expect(page.locator('.scard.locked')).toHaveCount(0);
});

test('a round that teaches new words announces the games they unlock', async ({ browser }) => {
  const site = newSite('games-round', { voice: false });
  const { page } = await newDevice(browser);
  await page.goto(site.url);
  await dismissWelcome(page);
  // two words known; every other word needs one more clean read
  const words = Object.fromEntries(ALL.map(w => [w, { n: 1, ok: 1, sc: 1, sk: 0 }]));
  Object.assign(words, known(['cat', 'dog']));
  await setWords(page, words);
  await page.click('[data-act="play"]');
  await page.evaluate(f => { window.__say = new Function('return (' + f + ')()'); }, SAY_TILES.toString());
  for (let i = 0; i < 6; i++) {
    await page.locator('#act .tile').first().waitFor();
    await page.waitForTimeout(200);
    await ensureMic(page);
    await page.locator('#celenext').waitFor({ timeout: 20_000 });
    await page.click('#celenext');
  }
  await expect(page.locator('.bigtitle')).toContainText('Round complete!');
  await expect(page.locator('.banner', { hasText: 'New game: Balloon Pop!' })).toBeVisible();
  await expect(page.locator('.banner', { hasText: 'New game: Snap It!' })).toBeVisible();
  await expect(page.locator('.banner', { hasText: 'Memory Cards' })).toHaveCount(0);
  await page.click('[data-act="game"][data-id="snap"]');
  await expect(page.locator('#game[data-game="snap"]')).toBeVisible();
});

test('every game plays to the end, from the words the child knows, with hints for wrong taps', async ({ browser }) => {
  test.setTimeout(240_000);
  const site = newSite('games-play', { voice: false });
  const { page } = await newDevice(browser);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(site.url);
  await dismissWelcome(page);
  const mine = ['cat', 'dog', 'pig', 'hen', 'bug', 'sun', 'hat', 'bus', 'fox', 'map', 'red', 'cup', 'frog', 'duck', 'moon', 'fish', 'cake', 'star', 'bird', 'tree', 'the', 'and'];
  await setWords(page, known(mine));

  // wrong answers don't count; after a few a hand points at the right one
  await page.click('[data-act="games"]');
  await page.click('[data-act="game"][data-id="snap"]');
  await page.waitForFunction(() => document.querySelector('#game')?.dataset.t);
  const t = await page.locator('#game').getAttribute('data-t');
  expect(mine).toContain(t);                                                // the words on the sign are known words
  for (let k = 0; k < 3; k++) await page.locator(`.pic:not([data-w="${t}"])`).first().click();
  await expect(page.locator('.dots i.d')).toHaveCount(0);
  await expect(page.locator(`.pic[data-w="${t}"] .ghand`)).toBeVisible();

  for (const id of GAMES) {
    await page.click('[data-act="games"]');
    await page.click(`[data-act="game"][data-id="${id}"]`);
    if (id === 'balloons') {                                                // a wrong balloon doesn't pop
      const bt = await page.waitForFunction(() => document.querySelector('#game')?.dataset.t).then(() => page.locator('#game').getAttribute('data-t'));
      await page.locator(`.bl:not([data-w="${bt}"])`).first().dispatchEvent('pointerdown');
      await page.waitForTimeout(200);
      await expect(page.locator('.bl.popped')).toHaveCount(0);
    }
    if (id === 'train') {                                                   // a wrong letter stays in the tray
      await page.waitForFunction(() => document.querySelector('#game')?.dataset.t);
      const nx = (await page.locator('#game').getAttribute('data-next')).toLowerCase();
      await page.evaluate(nx => [...document.querySelectorAll('#tray .tile')].find(e => e.textContent.toLowerCase() !== nx).click(), nx);
      await expect(page.locator('#tray .tile.used')).toHaveCount(0);
    }
    await playGame(page, id);
    await expect(page.locator('[data-act="game"][data-id="' + id + '"]')).toContainText('Play again');
  }
  const S = await page.evaluate(KEY => JSON.parse(localStorage.getItem(KEY)), KEY);
  expect(S.games).toEqual({ balloons: 1, snap: 1, memory: 1, train: 1, sounds: 1 });
  expect(S.stickers.length).toBe(0);                                        // games don't give stickers or stars
  expect(S.stars).toBe(0);
  expect(errors).toEqual([]);
});

test('Sound Hunt plays the letter sound and offers pictures that start with other sounds', async ({ browser }) => {
  const site = newSite('games-sounds', { voice: false });
  const { page } = await newDevice(browser);
  await page.goto(site.url);
  await dismissWelcome(page);
  await setWords(page, known(['cat', 'dog', 'pig', 'hen', 'bug', 'sun', 'hat', 'bus', 'fox', 'map']), { settings: { unlockAll: true } });
  await page.click('[data-act="games"]');
  await page.evaluate(() => { window.__tts.length = 0; });
  await page.click('[data-act="game"][data-id="sounds"]');
  await page.waitForFunction(() => document.querySelector('#game')?.dataset.t);
  const t = await page.locator('#game').getAttribute('data-t');
  const letter = (await page.locator('#sl').textContent()).trim();
  expect(t.startsWith(letter)).toBe(true);
  const others = await page.$$eval('.pic', (els, t) => els.map(e => e.dataset.w).filter(w => w !== t), t);
  expect(others.length).toBe(2);
  for (const w of others) expect(w[0]).not.toBe(t[0]);
  await expect.poll(() => page.evaluate(() => window.__tts.length)).toBeGreaterThan(0);   // the sound (device voice here: no recordings)
  await page.locator(`.pic[data-w="${others[0]}"]`).click();                // wrong: Ollie says that picture's word
  await expect.poll(() => page.evaluate(() => window.__tts)).toContain(others[0] + '!');
});

test('Balloon Pop: the word asked for is usually on a balloon already in the sky, not always the next one to come up', async ({ browser }) => {
  test.setTimeout(240_000);
  const site = newSite('games-balloons', { voice: false });
  const { page } = await newDevice(browser);
  await page.goto(site.url);
  await dismissWelcome(page);
  await setWords(page, known(['cat', 'dog', 'pig', 'hen', 'bug', 'sun', 'hat', 'bus', 'fox', 'map', 'red', 'cup', 'the', 'and']));
  await page.click('[data-act="games"]');
  const turns = [];
  for (let game = 0; game < 2; game++) {
    await page.click('[data-act="game"][data-id="balloons"]');
    // at the moment a word is asked (same task, so no balloon can come up in between): is it in the sky,
    // and how many balloons had come up so far; and every balloon that comes up, in order
    await page.evaluate(() => {
      const game = document.querySelector('#game'), gf = document.querySelector('#gf');
      window.__turns = []; window.__spawns = [...gf.querySelectorAll('.bl')].map(b => b.dataset.w);
      new MutationObserver(ms => { for (const m of ms) {
        if (m.type === 'childList') m.addedNodes.forEach(n => { if (n.classList && n.classList.contains('bl')) window.__spawns.push(n.dataset.w); });
        else if (game.dataset.t) { const t = game.dataset.t;
          window.__turns.push({ t, where: game.dataset.where, n: window.__spawns.length, sky: [...gf.querySelectorAll('.bl:not(.popped)')].some(b => b.dataset.w === t) }); }
      } }).observe(game, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-t'] });
    });
    for (let k = 0; k < 8; k++) {
      await page.waitForFunction(k => document.querySelector('#game')?.dataset.t && window.__turns.length > k, k, { timeout: 20_000 });
      const t = await page.locator('#game').getAttribute('data-t');
      await page.locator(`.bl[data-w="${t}"]:not(.popped)`).first().dispatchEvent('pointerdown');   // waits for it to come up if it is still to come
      if (k < 7) await expect(page.locator('.dots i.d')).toHaveCount(k + 1);
    }
    await expect(page.locator('.bigtitle')).toBeVisible({ timeout: 20_000 });
    const { tt, sp } = await page.evaluate(() => ({ tt: window.__turns, sp: window.__spawns }));
    for (const x of tt) {
      if (x.where === 'sky') expect(x.sky, JSON.stringify(x)).toBe(true);
      else {
        const q = +x.where.slice(1);
        expect(x.sky, JSON.stringify(x)).toBe(false);
        expect(sp[x.n + q], JSON.stringify({ ...x, next: sp.slice(x.n, x.n + 4) })).toBe(x.t);   // the (q+1)th balloon to come up
      }
    }
    turns.push(...tt);
  }
  expect(turns.length).toBe(16);
  expect(turns.filter(x => x.where === 'sky').length).toBeGreaterThan(0);
  expect(turns.filter(x => x.where === 'q0').length).toBeLessThan(16);
  console.log('where the words were:', turns.map(x => x.where).join(' '));
});
