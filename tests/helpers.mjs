import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PORT = 4173;
export const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(HERE, '..');
export const WORK = path.join(HERE, '.work');
export const BASE_VOICE = path.join(WORK, 'base-voice');

/* A fresh copy of the extracted voice files for one test's "site". */
export function newSite(name) {
  const dir = path.join(WORK, 'sites', name, 'voice');
  fs.rmSync(path.dirname(dir), { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(BASE_VOICE)) fs.copyFileSync(path.join(BASE_VOICE, f), path.join(dir, f));
  return { url: `/game/${name}/`, voiceDir: dir, manifest: () => JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')) };
}

/* Speech recognition and device-voice stubs, installed before the page's own script runs.
   Recognition "hears" window.__say (a string, or a function returning one) shortly after start().
   Device-voice lines are logged to window.__tts and end after 30 ms. */
export async function installStubs(context) {
  await context.addInitScript(() => {
    window.__say = '';
    window.__tts = [];
    window.__barSeen = false;
    new MutationObserver(() => { if (document.getElementById('vload')) window.__barSeen = true; })
      .observe(document, { childList: true, subtree: true });
    class FakeRec {
      constructor() { this.lang = 'en-US'; this.onresult = this.onerror = this.onend = this.onstart = null; this.t = 0; }
      start() {
        setTimeout(() => this.onstart && this.onstart(), 5);
        this.t = setTimeout(() => {
          const said = typeof window.__say === 'function' ? window.__say() : window.__say;
          if (said) {
            const alt = { transcript: said, confidence: 0.9 };
            const res = [alt]; res.isFinal = true;
            this.onresult && this.onresult({ resultIndex: 0, results: [res] });
          }
          this.onend && this.onend();
        }, 250);
      }
      stop() { this.abort(); }
      abort() { clearTimeout(this.t); setTimeout(() => this.onend && this.onend(), 0); }
    }
    window.SpeechRecognition = FakeRec;
    window.webkitSpeechRecognition = FakeRec;
    const synth = {
      speaking: false, pending: false, paused: false, onvoiceschanged: null,
      getVoices: () => [{ name: 'Samantha', lang: 'en-US', voiceURI: 'Samantha', default: true }],
      speak(u) {
        window.__tts.push(u.text); synth.speaking = true;
        setTimeout(() => { u.onstart && u.onstart(); }, 5);
        setTimeout(() => { synth.speaking = false; u.onend && u.onend(); }, 30);
      },
      cancel() { synth.speaking = false; }, resume() {}, pause() {},
    };
    Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
    window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; this.rate = 1; this.pitch = 1; this.volume = 1; } };
  });
}

/* A short, audible 16-bit mono WAV, about as long as the text would take to say. */
function wav(text) {
  const sr = 16000, dur = Math.min(1.2, 0.15 + 0.03 * text.length), n = Math.round(sr * dur);
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(sr, 24);
  b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(9000 * Math.sin(2 * Math.PI * 300 * i / sr)), 44 + i * 2);
  return { b64: b.toString('base64'), dur };
}

/* Fake ElevenLabs API, including word timings for story sentences. */
export async function mockElevenLabs(page) {
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS' };
  await page.route('https://api.elevenlabs.io/**', async route => {
    const req = route.request(), url = req.url();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const json = o => route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(o) });
    if (url.endsWith('/voices')) return json({ voices: [{ voice_id: 'v1', name: 'Test Voice', labels: {} }] });
    if (url.includes('/user/subscription')) return json({ character_limit: 10000, character_count: 0 });
    if (url.includes('/with-timestamps')) {
      const { text } = JSON.parse(req.postData()); const w = wav(text), ch = [...text];
      const step = w.dur / ch.length;
      return json({ audio_base64: w.b64, alignment: { characters: ch,
        character_start_times_seconds: ch.map((_, i) => +(i * step).toFixed(3)),
        character_end_times_seconds: ch.map((_, i) => +((i + 1) * step).toFixed(3)) } });
    }
    return route.fulfill({ status: 404, headers: cors, body: 'no mock' });
  });
}

export async function dismissWelcome(page) {
  const go = page.locator('#w-go');
  if (await go.isVisible().catch(() => false)) { await page.fill('#w-name', 'Sam'); await go.click(); }
}

/* Grown-up settings open on a press-and-hold of the gear. */
export async function openSettings(page) {
  await page.locator('#gear').dispatchEvent('pointerdown');
  await page.locator('.mcard h2', { hasText: 'Grown-up settings' }).waitFor({ timeout: 5000 });
}

/* Read IndexedDB from the page: { key: {sr, len, sum, w} } (a checksum per clip, not the audio). */
export function idbSummary(page) {
  return page.evaluate(() => new Promise((res, rej) => {
    const r = indexedDB.open('ollie-voice', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('clips');
    r.onerror = () => rej(r.error);
    r.onsuccess = () => {
      const st = r.result.transaction('clips').objectStore('clips'), out = {};
      const ks = st.getAllKeys(), vs = st.getAll();
      vs.onsuccess = () => {
        ks.result.forEach((k, i) => { const c = vs.result[i]; let s = 0; for (let j = 0; j < c.data.length; j++) s = (s * 31 + c.data[j]) | 0;
          out[k] = { sr: c.sr, len: c.data.length, sum: s, w: c.w ? c.w.length : 0 }; });
        res(out);
      };
    };
  }));
}

/* Put clips straight into IndexedDB (as if recorded on this device); the game reads them on next load. */
export function idbPut(page, clips) {
  return page.evaluate(clips => new Promise((res, rej) => {
    const r = indexedDB.open('ollie-voice', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('clips');
    r.onsuccess = () => {
      const t = r.result.transaction('clips', 'readwrite'), st = t.objectStore('clips');
      for (const [k, { sr, len, amp, at }] of clips) {
        const d = new Int16Array(len); for (let i = 0; i < len; i++) d[i] = Math.round(amp * Math.sin(i / 7));
        st.put({ sr, data: d, at }, k);
      }
      t.oncomplete = () => res(); t.onerror = () => rej(t.error);
    };
  }), clips);
}

/* A new "device": fresh storage, stubs installed, .bin downloads counted. */
export async function newDevice(browser) {
  const context = await browser.newContext();
  await installStubs(context);
  const page = await context.newPage();
  const bins = [];
  page.on('request', r => { if (/\/voice\/.*\.bin/.test(r.url())) bins.push(r.url()); });
  return { context, page, bins };
}

export function waitForVoice(page, man) {
  return page.waitForFunction(m => Object.keys(m.parts).every(p => localStorage.getItem('ollie-voice-v:' + p) === m.parts[p].v), man, { timeout: 60_000 });
}

/* Turn the mic on if it isn't (the mic button animates constantly, so click through the DOM). */
export async function ensureMic(page) {
  await page.evaluate(() => { const m = document.querySelector('#act .mic'); if (m && !m.classList.contains('on') && !m.classList.contains('listening')) m.click(); });
}

/* The word on the tiles, which is what the child should say. */
export const SAY_TILES = () => [...document.querySelectorAll('#act .tile')].map(t => t.textContent).join('').toLowerCase();
