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

test('push to talk: one try per tap; Ollie talking does not end it, a wrong word does', async ({ browser }) => {
  const page = await round(browser, 'mic-one');
  await ensureMic(page);
  await expect(page.locator('#act .mic')).toHaveClass(/listening/);
  const starts = await page.evaluate(() => window.__recStarts);
  await page.click('[data-a="sound"]');                             // Ollie talks (sounds out the letters)
  await page.waitForTimeout(2500);
  expect(await page.evaluate(() => window.__recStarts)).toBe(starts);
  await expect(page.locator('#act .mic')).toHaveClass(/listening/);   // still listening
  await page.evaluate(() => { window.__say = 'banana'; });          // a wrong word: feedback, and the mic turns off
  await expect(page.locator('.miclabel')).toContainText('banana');
  await expect(page.locator('#act .mic')).not.toHaveClass(/listening/);
  const w = await word(page);
  await page.evaluate(w => { window.__say = w; }, w);
  await page.waitForTimeout(2500);
  await expect(page.locator('#celenext')).toHaveCount(0);            // not heard until the mic is tapped again
  await ensureMic(page);
  await page.locator('#celenext').waitFor();
});

test('push to talk: the child can speak right after tapping, even if Ollie was just talking', async ({ browser }) => {
  const site = newSite('mic-quick'), man = site.manifest();          // Ollie's voice clips, cut off at once by the tap
  const { page } = await newDevice(browser);
  await page.goto(site.url);
  await dismissWelcome(page);
  await page.waitForFunction(m => Object.keys(m.parts).every(p => localStorage.getItem('ollie-voice-v:' + p) === m.parts[p].v), man);
  await page.click('[data-act="play"]');
  await page.locator('#act .tile').first().waitFor();
  const w = await word(page);
  await page.click('[data-a="sound"]');                             // Ollie is sounding it out
  await page.waitForTimeout(600);
  await page.evaluate(w => { window.__say = w; }, w);
  await ensureMic(page);                                            // the tap cuts Ollie off; the child reads at once
  await page.locator('#celenext').waitFor({ timeout: 2500 });
});

test('push to talk: nothing heard for a while turns the mic off', async ({ browser }) => {
  const page = await round(browser, 'mic-quiet');
  await page.evaluate(() => { window.__ttsMs = 30; });
  await ensureMic(page);
  await expect(page.locator('#act .mic')).toHaveClass(/listening/);
  await expect(page.locator('#act .mic')).not.toHaveClass(/listening/, { timeout: 12_000 });
  await expect(page.locator('.miclabel')).toContainText("didn't hear");
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

test('after each word the mic is off until it is tapped: one listen per tap across the round', async ({ browser }) => {
  const page = await round(browser, 'mic-round');
  await page.evaluate(() => { window.__ttsMs = 30; });
  await page.evaluate(f => { window.__say = new Function('return (' + f + ')()'); }, SAY_TILES.toString());
  for (let i = 0; i < 6; i++) {
    await page.locator('#act .tile').first().waitFor();
    await page.waitForTimeout(300);
    await expect(page.locator('#act .mic')).not.toHaveClass(/listening/);
    await ensureMic(page);
    await page.locator('#celenext').waitFor({ timeout: 20_000 });
    await page.waitForTimeout(300);
    await page.click('#celenext');
  }
  await expect(page.locator('.bigtitle')).toContainText('Round complete!');
  expect(await page.evaluate(() => window.__recStarts)).toBe(6);
});

test('when the mic changes the hardware sample rate, the audio engine follows it and Ollie keeps playing', async ({ browser }) => {
  const site = newSite('mic-rate'), man = site.manifest();
  const { context, page } = await newDevice(browser);
  await context.addInitScript(() => {
    // simulated iPhone hardware: new audio engines get window.__hwRate
    const R = window.AudioContext;
    window.AudioContext = class extends R { constructor(o) { super(window.__hwRate ? { ...(o || {}), sampleRate: window.__hwRate } : o); } };
    window.__plays = [];
    const st = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...a) { window.__plays.push({ t: Date.now(), rate: this.context.sampleRate, len: this.buffer ? this.buffer.length : 0 }); return st.apply(this, a); };
  });
  await page.goto(site.url);
  await page.evaluate(() => { window.__hwRate = 48000; });
  await dismissWelcome(page);
  await page.waitForFunction(m => Object.keys(m.parts).every(p => localStorage.getItem('ollie-voice-v:' + p) === m.parts[p].v), man);
  await page.click('[data-act="play"]');
  await page.locator('#act .tile').first().waitFor();
  await page.click('[data-a="sound"]');                                  // some sound on the first engine
  await expect.poll(() => page.evaluate(() => window.__plays.length)).toBeGreaterThan(0);
  const first = await page.evaluate(() => window.__plays[0].rate);
  await page.waitForTimeout(3000);
  await page.evaluate(() => { window.__hwRate = 24000; });               // mic on: call mode
  await ensureMic(page);
  await page.waitForTimeout(2500);
  const t0 = Date.now();
  const w = await page.evaluate(SAY_TILES);
  await page.evaluate(w => { window.__say = w; }, w);
  await page.locator('#celenext').waitFor({ timeout: 15000 });
  await page.waitForTimeout(2500);
  const during = await page.evaluate(t => window.__plays.filter(p => p.t >= t && p.len > 2000).map(p => p.rate), t0);
  expect(first).toBe(48000);
  expect(during.length).toBeGreaterThan(0);                               // Ollie kept playing
  expect(new Set(during)).toEqual(new Set([24000]));                      // on an engine at the hardware rate
  // the mic is let go (app hidden): back to 48 kHz
  await page.evaluate(() => { window.__hwRate = 48000; });
  await page.click('#celenext');
  await page.click('[data-act="home"]');
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); delete document.hidden; });
  await page.waitForTimeout(2500);
  const t1 = Date.now();
  await page.click('[data-act="owl"]');
  await page.waitForTimeout(1500);
  const after = await page.evaluate(t => window.__plays.filter(p => p.t >= t && p.len > 2000).map(p => p.rate), t1);
  expect(after.length).toBeGreaterThan(0);
  expect(new Set(after.slice(0, 1))).toEqual(new Set([48000]));
});

test('the audio engine is never paused (bounced or rebuilt) while Ollie is playing: a full round with the mic, to the end', async ({ browser }) => {
  const site = newSite('mic-nopop'), man = site.manifest();
  const { context, page } = await newDevice(browser);
  await context.addInitScript(() => {
    window.__active = 0; window.__cuts = [];
    const st = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...a) {
      if (this.buffer && this.buffer.length > 2000) { window.__active++; let done = false; const end = () => { if (!done) { done = true; window.__active--; } }; this.addEventListener('ended', end); setTimeout(end, this.buffer.duration * 1000 + 200); }
      return st.apply(this, a);
    };
    const sus = AudioContext.prototype.suspend, cl = AudioContext.prototype.close;
    AudioContext.prototype.suspend = function () { if (window.__active > 0) window.__cuts.push('suspend while playing'); return sus.call(this); };
    AudioContext.prototype.close = function () { if (window.__active > 0) window.__cuts.push('close while playing'); return cl.call(this); };
  });
  await page.goto(site.url);
  await dismissWelcome(page);
  await page.waitForFunction(m => Object.keys(m.parts).every(p => localStorage.getItem('ollie-voice-v:' + p) === m.parts[p].v), man);
  await page.click('[data-act="play"]');
  await page.locator('#act .tile').first().waitFor();
  await page.evaluate(f => { window.__say = new Function('return (' + f + ')()'); }, SAY_TILES.toString());
  for (let i = 0; i < 6; i++) { await page.locator('#act .tile').first().waitFor(); await page.waitForTimeout(300); await ensureMic(page); await page.locator('#celenext').waitFor({ timeout: 20000 }); await page.waitForTimeout(1500); await page.click('#celenext'); }
  await expect(page.locator('.bigtitle')).toContainText('Round complete!');   // the mic turns off as "Amazing reading!" starts
  await page.waitForTimeout(5000);
  await page.click('[data-act="home"]');
  await page.click('[data-act="owl"]');
  await page.waitForTimeout(3000);
  expect(await page.evaluate(() => window.__cuts)).toEqual([]);
});
