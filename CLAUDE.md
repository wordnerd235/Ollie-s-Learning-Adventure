# Ollie's Word Adventure — project notes for Claude Code

A phonics reading game for the owner's 5-year-old child. It is a **single self-contained `index.html`** (CSS + one script, no build step, no dependencies except Google Fonts) served by **GitHub Pages** from this repo. Previously hosted on Netlify. A copy also exists as a claude.ai artifact, but that viewer blocks the microphone and external APIs, so GitHub Pages is the real home.

Owner: technical (electrical/controls engineer), not a web developer. Prefers direct, economical communication. Tests on an **iPhone in Safari** (main device), also an iPad and a Windows PC. Nobody but the owner can test on real iOS: say so plainly instead of claiming something works on iPhone.

## What the game does
- **Rounds** of 6 words, adaptive over 5 levels (2-letter words → sight words → 4–5-letter words). The child reads the word aloud into the mic; a correct read triggers a celebration with a word-specific animation and sound, plus praise.
- **Letter tiles:** tapping a letter plays its sound. "Sound it out" plays the letters in sequence (there is deliberately no "Hear it" button that says the word). Silent letters are shown as dashed tiles.
- **Skip** is always available. A grown-up ✓ button appears after misses, or replaces the mic entirely when the mic is unavailable.
- **Stories:** 9 stories unlock as their words are learned. Ollie narrates the lead-in words, the child reads each target word, then the whole sentence is read back with word highlighting. A story counts as done once read through (this clears the Story Time badge).
- **Stickers:** earned per round/story. There are 6 illustrated "sticker scenes" with Ollie where stickers can be placed, dragged, resized, flipped, and cleared.
- **Greeting:** a returning player (page reopened or refreshed) hears "Hi <name>! Ready to read?" once the voice is ready (`greetOnReturn`). iOS allows no sound before the first tap, so there it plays on the first tap, unless that tap is a menu button.
- **Sticker turning:** ↺/↻ turn the selected sticker 15° (`p.r`, stored with the scene).
- **Grown-up settings:** press and hold ⚙️ on the home screen for ~1 s.

UI rules: the child is 5 and can't read instructions, so anything the child must act on needs to work without reading. Grown-up text is fine. Keep all wording gender-neutral. Ollie (🦉) animates only when showing a new message, never constantly.

## Code map (`index.html`)
One IIFE. Section banners (search for them):
- `WORD DATA`: `WORD_RAW` lines `word;tiles;emoji;animation;sound`. Tiles are space-separated `letters[:sound]`; a sound of `-` means silent. Sounds are keys such as `kuh`, `aa` (see `PHON` for all 38).
- `STORIES`: `STORY_RAW` sentences with `[target]` words and a small scene DSL.
- `SAVE`: `S` is the state object, persisted to localStorage `ollie-word-adventure-v1`. `defaults()` holds all settings.
- `AUDIO`: `ac()` creates the AudioContext; `FX` holds synthesized effects; `vbus` is the voice bus with a limiter; `setVoiceBoost`/`applyBoost`; the iOS audio session; the silent loop; `unlockAudio()`.
- Speech output:
  - `say(text, opts)` splits text into sentences (`splitSent`, keys via `mkey`) and resolves each sentence with `clipsFor()`: **the owner's recordings first** (`useMine()`), then the **AI voice pack** (`m:` keys, if `S.settings.murf`), otherwise the whole line falls back to the **device voice** (`sayTTS`).
  - `playSeq` queues clips; `stopSpeech()` cancels everything.
  - `effRate`/`vspd` is the talking-speed setting, applied to AI clips only.
  - `stretchPCM` is a WSOLA time-stretch: it slows speech without changing pitch.
- `RECORDED VOICE`: IndexedDB database `ollie-voice`, store `clips`; values `{sr, data:Int16Array, at, w?}`. Key namespaces:
  - `p:<sound>`: owner's letter sounds
  - `w:<word>`: owner's words
  - `r:<mkey>`: owner's other lines
  - `m:<mkey>`: AI voice lines
  - `m:@<mkey>`: whole story sentences, with word timings `w:[[start,end],…]` in seconds
- Recording: `getMic`, `startCapture` (ScriptProcessor, auto-stops on silence), `trimClip`.
- Backup/restore: progress plus recordings go in one JSON file; the voice pack is a separate JSON file.
- `VOICE FILES`: the voice lives next to the game in `voice/`, not inside `index.html`.
  - `voice/manifest.json` lists two parts: `ai` (the `m:` clips) and `mine` (the owner's `p:`/`w:`/`r:` clips). Each part has a version `v` (a hash of its files), its file names, byte count, line count; `ai` also has the `murf` voice tag.
  - `voice/ai-N.bin`, `voice/mine-N.bin`: binary, "OLLV" + u32 format + u32 header length + JSON header `{part, clips:[[key, sr, samples, timings|null, at]]}` + raw 16-bit samples (lossless). A part is split into files of at most 20 MB (GitHub's web uploader takes up to 25 MB per file).
  - `loadVoice()` runs on every page load: it fetches the manifest (no cache) and downloads only the parts whose `v` differs from localStorage `ollie-voice-v:<part>`, showing a small bar (`#vload`). While it downloads, missing lines use the device voice. A failed download is retried next load.
  - Voice gate: `VOICE.state` is checking → loading → ready/failed. The welcome's "Let's go" stays disabled while it is checking or loading (bar + "Continue without sound"); a returning player gets a `#vgate` card over the menu only while a download runs. "Continue without sound" sets `SILENT` (this visit only; mutes `say`, `sayTTS`, `playBuf`, `FX`), cleared when the voice arrives. On failure "Let's go" unlocks with a note and the device voice is used.
  - `importPart()`: a new AI voice (different `murf.built`) replaces the old voice's `m:` clips, as before. Owner recordings are only replaced by newer ones (`at`).
  - A part's `pack` field is the id of the old all-in-one file it was extracted from; a device that imported that file (localStorage `ollie-pack-id`) marks the part current without downloading it.
  - Settings › Voice files › "Make voice files" (`buildVoiceFiles()`): builds the files from this device, marks each as changed or "same as the site", then a fresh tap on 💾 per file (or Share…) saves it. The owner uploads the changed files plus `manifest.json` to `voice/` on GitHub.
- `tools/extract.html`: standalone page that turns an old all-in-one `index.html` (with the `ollie-pack` script) into `voice/` files, in the browser. Its packing code must stay identical to `index.html`'s.
- `MURF AI VOICE PACK` (now provider-generic):
  - Providers: `murf` or `el` (ElevenLabs), chosen with `S.settings.ttsProv`.
  - `murfTexts()` lists every line the game can say.
  - `murfBuild()` generates the missing lines: two requests at once, dropping to one on a 429; a line that keeps failing is skipped.
  - Story sentences are requested with word timings.
  - `packTag` identifies the voice a pack was built with; changing voice asks for a second tap before replacing the pack.
  - `elPhonemes()` remakes letter sounds from CMU Arpabet phoneme tags (model `eleven_flash_v2`).
- `SPEECH RECOGNITION`: a single reused recognizer (`getSR`); `listenFor(word, long)`; `matches()` is lenient (homophones, edit distance); `micHelp()` holds the error explanations.
- `WORD ACTIVITY` (`mountActivity`): shared by rounds and stories. The mic is a **toggle** (`MIC_ON`): `micLoop` listens across words, one continuous listen per word that ignores whatever it hears while Ollie talks (lesson 7). It turns off on any screen change.
- `SCREENS` / rounds / stickers / `STICKER SCENES` / stories / story player:
  - `readAlong()` plays slices of the whole-sentence clip using its word timings (`segBuf`).
  - It uses the owner's recorded pieces instead when they exist.
- `VOICE RECORDER`: `recGroups()` lists every line in sections (358 lines); `guided()` walks through the missing ones one at a time.
- `GROWN-UP SETTINGS`, `EVENTS`.

## Publishing (the owner tests on the live site)
- There is no separate test site: changes go to `master`, which GitHub Pages serves as the live game. Work on a branch, run the tests, then:
  1. `tools/save-previous.sh`: saves the index.html that is live now as `previous/index.html` (served at `/previous/`, voice from `../voice/`, same progress and recordings because it is the same site);
  2. commit `previous/index.html` with the change, fast-forward `master`, push.
- Tell the owner the change is live and that `/previous/` has the version before it. Anything older is in git history.
- Change `voice/` or the voice format only with care: `previous/` reads the same files.

## Hard-won lessons: don't regress these
1. **Never write the literal closing script tag or the pack marker inside the main script.** Build them by concatenation (`'<'+'/script>'`, `'id="ollie-'+'pack"'`). A literal closing tag ends the script early, and the marker in the code would match itself when the pack is stripped.
2. **iOS silent switch** mutes Web Audio and `speechSynthesis`.
   - Workaround: set `navigator.audioSession.type='playback'` and loop a silent `<audio>` element.
   - The silent loop is paused while the device voice speaks, because it is suspected of silencing the iPhone device voice (unconfirmed).
3. **iOS turns playback down while the mic is in use.**
   - `vbus` boost (setting `boostLvl`, default 2.4×).
   - The first line after listening plays at 60% of the boost (`AFTER_CAP`).
   - After each listen: `bounceAC()` (suspend/resume) and `sessionPlayback()`.
   - The permission probe uses getUserMedia with echo cancellation, noise suppression and auto-gain turned off.
4. **iOS blocks media-element `play()` outside a user gesture.** All game audio goes through Web Audio buffers. Don't reintroduce `<audio>` playback, which is why slowed audio uses WSOLA, not `playbackRate`.
5. **iOS blocks downloads that start long after the tap.** Making the voice files is two steps: build, then a fresh tap on each file's 💾, or Share….
6. **speechSynthesis quirks:**
   - Calling `speak()` right after `cancel()` drops the utterance, so there is a ~120 ms gap (`lastCancel`).
   - Some listed voices never start, so a watchdog falls back to the next voice (`BADV`).
   - Safari offers web pages no Siri voices and no downloaded Premium voices.
7. **iOS recognition** plays a system tone on start/stop, and web pages can't turn it off; the only lever is starting and stopping less. So `micLoop` keeps one **continuous** listen per word (`listenFor(word,long,{cont:true,onMiss})`): it is not stopped when Ollie talks (`hushMic` skips it, `LISTEN_CONT`), results are ignored while game audio plays and `ECHO_MS` (1.2 s) after it (`deafNow`, `AUDIO_END`), and text that began while deaf is cut off the front of later results. A wrong word gives feedback without restarting. It stops on a correct read, so the celebration isn't ducked. Unverified on iPhone: how long iOS keeps a continuous listen open, and whether Ollie's voice leaks into it.
   Also: reusing one recognizer instance is believed to help. The first recognition right after the permission prompt may fail once, which gets a soft retry.
8. **Murf dropped trailing small words** in fragments ("I see a" came out without "a"). Hence whole-sentence story clips with word timings, sliced at playback.
9. **Dark mode:** use theme tokens (`--card`, `--ink2`, …) for every color. The silent-letter tile was once invisible in dark mode.
10. **Voice services:**
    - **Murf** (free plan): hit "Concurrency limit reached" even at one request. Abandoned.
    - **ElevenLabs:**
      - The key needs Text to Speech, Voices › Read and optionally User › Read permissions.
      - The free plan gives 10,000 characters a month; a full pack is ~6,300.
      - It allows 2 requests at once, and browser calls work.
      - Phoneme tags only work on `eleven_flash_v2`.
    - Never commit API keys; they are stored only in the device's localStorage.
12. **Voice limiter:** clips are normalised to 90% peak, so the `vbus` limiter threshold is -1 dB; at the old -4 dB it squashed every peak (heard as distortion). It still catches the iOS mic boost.
13. **Recording** uses getUserMedia with echo cancellation, noise suppression and auto-gain off (stored recordings were clean; voice processing only hurts), then `bounceAC()` and a 300 ms wait before the take is played back.
15. **Sound right after the mic stops is lost on iPhone** while iOS switches back from recording to playback. `afterMicSettled()` waits until 450 ms after the last listen ended (was 900; halved at the owner's request, below it is unverified on iPhone) (`CAP_END`) and the AudioContext is running; use it before any line that can follow a listen directly (the word after a correct read, story narration after the child's word). The owner didn't hear the word when it played 250 ms after the listen.
14. **Speech order:** a correct read in a round says the word, then the word's fun sound ("Meow meow!"), then the praise. In stories the child's word gets a ding and a burst, but no spoken praise or repeat. Skipping says "No problem! That word is X." while X is still on screen, then shows the next word with "Let's try another!". Tapping a letter plays its sound; the example ("like apple") only follows a second tap on the same letter in a row.
11. AI voices can't make clean isolated phonics sounds; the owner's own recordings are the answer. Recordings always take priority unless "Use my recordings" is off.

## Current state (Sept 30, 2026)
- The voice was moved out of `index.html` into `voice/` (branch `voice-files`). `index.html` is ~160 KB of code.
- `voice/` holds the owner's real voice, extracted from their 44.5 MB all-in-one file (pack id `muo9t0q49sr3o`) with `tools/extract.html`: 534 ElevenLabs lines in `ai-1.bin` + `ai-2.bin` (24.5 MB), 176 recordings in `mine-1.bin` (7.2 MB). Verified identical, clip for clip, to what the old file puts on a device.
- Devices that imported the old file's voice keep recordings stamped with their import time, so their first "Make voice files" marks `mine` as changed even if nothing was re-recorded.
- Unverified on real iOS: the device voice fix, whether the recognition tone is reduced, and the new voice download/export.

## Testing
- Run: `cd tests && npm install && npx playwright test`. The first run makes a fixture in `tests/.work/` (about a minute), later runs reuse it; delete `.work/` to remake it.
  - The fixture is made the way the real one was: the old game code (`tests/fixtures/old-game.html`) builds a full AI pack against a fake ElevenLabs, gets a few injected "owner recordings", and saves an all-in-one file with "Make game file with voice"; `tools/extract.html` then extracts it.
  - `tests/server.mjs` serves each test's own "site" at `/game/<name>/` (the repo's `index.html` plus a copy of the voice files).
  - `qol.spec.mjs` runs without voice files so every line goes to the stubbed device voice, which logs the text and the word on the tiles at that moment (`window.__ttsLog`); it checks the speech order rules in lesson 14.
  - Covered: fresh device gets the voice (sample-for-sample equal to the old file's), no re-download on the next visit, no download on a device that has the old file's voice, export → upload → another device gets the new recording (and only the changed part downloads), a full round, a full story. Both game tests assert nothing fell back to the device voice.
- Syntax: extract the main `<script>` and run `node --check`.
- Behavior: Playwright + headless Chromium.
  - Serve over `http://localhost`; IndexedDB and fetch need it.
  - Chromium flags: `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream --autoplay-policy=no-user-gesture-required`.
  - Stub recognition as **both** `window.SpeechRecognition` and `webkitSpeechRecognition` (Chromium has the unprefixed one natively). The stub's `start()` delivers a result for `window.__say`, and `abort()` fires `onend`.
  - Stub `speechSynthesis` with `Object.defineProperty(window,'speechSynthesis',{value:…})`; a plain assignment is ignored.
  - Mock Murf/ElevenLabs with `page.route` (include CORS headers and handle OPTIONS).
  - Use `force=True` or DOM `.click()` because the mic button animates constantly.
  - Set an iPhone user agent to exercise `IS_IOS` code paths.
- Cover these flows: a round with a correct read and a skip; the mic toggle continuing across words; mic denied → green grown-up button; a story played end to end; building and restoring the voice pack; sticker scenes; the recorder and guided mode.
