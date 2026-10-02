# Ollie's Word Adventure — project notes for Claude Code

A phonics reading game for the owner's 5-year-old child. It is a **single self-contained `index.html`** (CSS + one script, no build step, no dependencies except Google Fonts) served by **GitHub Pages** from this repo. Previously hosted on Netlify. A copy also exists as a claude.ai artifact, but that viewer blocks the microphone and external APIs, so GitHub Pages is the real home.

Owner: technical (electrical/controls engineer), not a web developer. Prefers direct, economical communication. Tests on an **iPhone in Safari** (main device), also an iPad and a Windows PC. Nobody but the owner can test on real iOS: say so plainly instead of claiming something works on iPhone. The owner tests fresh first runs in a **Safari private tab** (so the normal page keeps the child's progress): every private visit is a brand-new device that downloads the whole voice (~50 MB) into temporary, smaller storage.

## What the game does
- **Rounds** of 6 words, adaptive over 5 levels (2-letter words → sight words → 4–5-letter words). The child reads the word aloud into the mic; a correct read triggers a celebration with a word-specific animation and sound, plus praise.
- **Letter tiles:** tapping a letter plays its sound. "Sound it out" plays the letters in sequence (there is deliberately no "Hear it" button that says the word). Silent letters are shown as dashed tiles.
- **Skip** is always available but earns nothing (Oct 2026, owner's request): in a round the skipped word goes to the back of the line (`RS.skipped`) and comes back, so a round needs all 6 words read, each dot = a word read, and the sticker means 6 reads; in a story Ollie says the word ("That word is X.") and asks it again. A word that was skipped shows the grown-up ✓ straight away (`opts.grown`), so a hard word can't block the child. The grown-up ✓ counts only after a **5 s press-and-hold** (`GROWN_HOLD`, the button fills while held; a tap does nothing). A grown-up ✓ button also appears after misses, or replaces the mic entirely when the mic is unavailable.
- **Stories:** 9 stories unlock as their words are learned. Ollie narrates the lead-in words, the child reads each target word, then the whole sentence is read back with word highlighting. A story counts as done once read through (this clears the Story Time badge).
- **Stickers:** earned per round/story; 100 in `STICKERS` (the original 36 first, in their old order, then 64 added Oct 2026: append new ones at the end so a child's collection keeps its place). There are 6 illustrated "sticker scenes" with Ollie where stickers can be placed, dragged, resized, flipped, and cleared.
- **Greeting:** a returning player (page reopened or refreshed) hears "Hello, again! Ready to read?" (not personalised, owner's choice) once the voice is ready (`greetOnReturn`). iOS allows no sound before the first tap, so there it plays on the first tap, unless that tap is a menu button.
- **Words I know:** the count on the home screen is a button to a list of known words (`screenKnown`); tapping one says it.
- **Sticker scene art** (`SCENES`): entries `emoji,x,y,size[,flags]`; flag `g` = stands on the ground, and y is its **base** (class `.it.g`, translate −88%), `f` = mirrored. Grounded items are drawn back to front; further back = higher and smaller. Ground lines live in the `.pg-*` backgrounds (meadow 61%, beach sand 55%, sea floor 85%, snow 64%, party floor 70%). Check changes with screenshots of all six scenes.
- **Sticker turning:** ↺/↻ turn the selected sticker 15° (`p.r`, stored with the scene).
- **Sound check** (`soundCheck`, iPhone/iPad only): once after the welcome (and from Settings › 🔊 Sound check), one step: it opens and holds the mic (asking permission) while Ollie talks on a loop, so a grown-up sets iOS's call volume, the only volume in use. `S.soundChecked`.
- **Held mic** (`HELD MIC`: `holdMic`/`releaseMic`/`holdWanted`, iPhone/iPad only): once the mic has been allowed (localStorage `ollie-mic-held`), any tap opens a `getUserMedia({audio:{echoCancellation:false}})` stream (lesson 20) and keeps it for the visit. The mic button only starts/stops recognition. Released when the page is hidden (iOS closes it on lock anyway; next tap reopens, one chime), in the recorder (`screenVoice`, `getMic`, and not reopened while `.vrow`/`GUIDE` exist), and when the mic setting is turned off. While held, `sessionPlayback`, `bounceAC` and the `afterMicSettled` wait do nothing.
- **Grown-up settings:** press and hold ⚙️ on the home screen for ~1 s.

UI rules: the child is 5 and can't read instructions, so anything the child must act on needs to work without reading. Grown-up text is fine. Keep all wording gender-neutral. Ollie (🦉) animates only when showing a new message, never constantly.

## Code map (`index.html`)
One IIFE. Section banners (search for them):
- `WORD DATA`: `WORD_RAW` lines `word;tiles;emoji;animation;sound`. Tiles are space-separated `letters[:sound]`; a sound of `-` means silent. Sounds are keys such as `kuh`, `aa` (see `PHON` for all 38).
- `STORIES`: `STORY_RAW` sentences with `[target]` words and a small scene DSL.
- `SAVE`: `S` is the state object, persisted to localStorage `ollie-word-adventure-v1`. `defaults()` holds all settings.
- `AUDIO`: `ac()` creates the AudioContext; `FX` holds synthesized effects; `vbus` is the voice bus (plain gain, lesson 12); the iOS audio session; the silent loop; `unlockAudio()`.
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
  - `loadVoice()` runs on every page load: it fetches the manifest (no cache) and downloads only the parts whose `v` differs from localStorage `ollie-voice-v:<part>`, showing progress on the welcome's bar / the returning player's voice card (no separate bottom bar, owner's choice). While it downloads, missing lines use the device voice. A failed download is retried next load.
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
- `WORD ACTIVITY` (`mountActivity`): shared by rounds and stories. The mic button is **push to talk** (Oct 2026, owner's request: first tries were often missed): a tap listens for one try at the current word; a correct read, a wrong word, or 8 s of hearing nothing (not counting Ollie talking) turns it off (`a.ltm`), and the child taps again. The held mic stays open throughout, so no chime/volume change (lesson 20). Audio cut off by the tap itself doesn't make the mic deaf (`MIC.armAt` in `deafNow`). It turns off on any screen change.
- `SCREENS` / rounds / stickers / `STICKER SCENES` / stories / story player:
  - `readAlong()` plays slices of the whole-sentence clip using its word timings (`segBuf`).
  - It uses the owner's recorded pieces instead when they exist.
- `VOICE RECORDER`: `recGroups()` lists every line in sections; `guided()` walks through the missing ones one at a time.
- `GROWN-UP SETTINGS`, `EVENTS`.

## Publishing (the owner tests on the live site)
- There is no separate test site: changes go to `master`, which GitHub Pages serves as the live game. Work on a branch, run the tests, and publish **only if `npx playwright test` itself exits 0** (chain on its exit code, never on a piped `grep`; that once let a failing test publish). Then:
  1. `tools/save-previous.sh`: saves the index.html that is live now as `previous/index.html` (served at `/previous/`, voice from `../voice/`, same progress and recordings because it is the same site);
  2. commit `previous/index.html` with the change, fast-forward `master`, push.
- Tell the owner the change is live and that `/previous/` has the version before it. Anything older is in git history.
- Change `voice/` or the voice format only with care: `previous/` reads the same files.

## Hard-won lessons: don't regress these
1. **Never write the literal closing script tag or the pack marker inside the main script.** Build them by concatenation (`'<'+'/script>'`, `'id="ollie-'+'pack"'`). A literal closing tag ends the script early, and the marker in the code would match itself when the pack is stripped.
2. **iOS silent switch** mutes Web Audio and `speechSynthesis`.
   - Workaround: set `navigator.audioSession.type='playback'` and loop a silent `<audio>` element.
   - The silent loop is paused while the device voice speaks, because it is suspected of silencing the iPhone device voice (unconfirmed).
3. **iOS plays at the separate *call volume* while the mic is in use.** That was the "Ollie is quiet with the mic on" problem, and the owner fixed it by pressing volume-up during a round (now a guided **Sound check** at first run and in settings). A test page (`tools/mic-test.html`) showed that on iPhone Safari **any** open mic (speech recognition, or getUserMedia with or without echo cancellation) chimes and switches to call volume, so no web workaround exists; only a native app ($99/yr Apple account) could avoid it. **There is no voice boost, on purpose:** the clips already peak at 90% of full scale, so every digital boost tried either clipped (crackles; plain gain, then the browser's compressor/limiter with overshoot to 1.5) or was held back by a clean look-ahead limiter to about +3 dB (the slider "did nothing"). Don't add one again.
   - After each listen: `bounceAC()` (suspend/resume) and `sessionPlayback()`. **The bounce waits until the game is quiet:** pausing the engine while a line plays stops it dead mid-waveform (a pop). That was the owner's intermittent pops ("Amazing reading!" at round end as the mic turns off, etc.); the recordings themselves were clean. `mic.spec` fails if the engine is suspended or closed while a clip plays. `?audiodebug` shows an on-screen log of engine/mic events.
   - The permission probe uses getUserMedia with echo cancellation, noise suppression and auto-gain turned off.
4. **iOS blocks media-element `play()` outside a user gesture.** All game audio goes through Web Audio buffers. Don't reintroduce `<audio>` playback, which is why slowed audio uses WSOLA, not `playbackRate`.
5. **iOS blocks downloads that start long after the tap.** Making the voice files is two steps: build, then a fresh tap on each file's 💾, or Share….
6. **speechSynthesis quirks:**
   - Calling `speak()` right after `cancel()` drops the utterance, so there is a ~120 ms gap (`lastCancel`).
   - Some listed voices never start, so a watchdog falls back to the next voice (`BADV`).
   - Safari offers web pages no Siri voices and no downloaded Premium voices.
7. **iOS recognition** plays a system tone on start/stop, and web pages can't turn it off; and sound right after a stop is lost (lesson 15). So while the mic is on, **one continuous listen covers the whole round or story** (`MIC SESSION`: `micSession()`, `listenFor(fn,long,{session:true,onHit,onMiss})`). Each word activity sets `MIC.target`; between words and while game audio plays (plus `ECHO_MS` 1.2 s after, `deafNow`/`AUDIO_END`) results are ignored, and text that began while deaf is cut off the front of later results. `stopAll`/`stopListening` leave the session running; only `micOff()` (mic toggled off, round/story finished, Home, app hidden) ends it. If iOS ends it, it restarts. Unverified on iPhone: how long iOS keeps it open, and whether Ollie (at call volume while the mic is on) leaks into it.
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
12. **No limiter or boost on the voice** (`vbus` is a plain gain): see lesson 3.
13. **Recording: keep the original settings.** `getMic` uses the iPhone's defaults (echo cancellation, noise suppression and auto-gain all **on**), and `startCapture`/`trimClip`/`recordInto` are the original code. The owner made many clean, quiet-speech takes that way. Turning the filters off let room noise in; noise suppression alone on (others off) made takes hard to pick up; a software gate, a 0.35 s chirp skip and lower thresholds didn't help. All reverted. The playback distortion was the limiter (lesson 12), not the recording settings. Don't change recording again without the owner asking.
15. **Sound right after the mic stops is lost on iPhone** (0.45 s still clipped; the mic session in lesson 7 avoids stopping during an exercise, so a correct read no longer waits) while iOS switches back from recording to playback. `afterMicSettled()` waits until 450 ms after the last listen ended (was 900; halved at the owner's request, below it is unverified on iPhone) (`CAP_END`) and the AudioContext is running; use it before any line that can follow a listen directly (the word after a correct read, story narration after the child's word). The owner didn't hear the word when it played 250 ms after the listen.
14. **Speech order:** a correct read in a round says the word, then the word's fun sound ("Meow meow!"), then the praise. In stories the child's word gets a ding and a burst, but no spoken praise or repeat. Skipping says "No problem! That word is X." while X is still on screen, then shows the next word with "Let's try another!". Tapping a letter plays its sound; the example ("like apple") only follows a second tap on the same letter in a row, and only when the tile is spelled like the example (PHON letters), so the s in "was" gets no "like zoo".
16. **Ollie never says the child's name.** Named lines ("Hi Sam!", "Amazing reading, Sam!") could only be recorded for one name, so other names and fresh devices fell back to the AI/device voice. All spoken lines are generic (`greet()` = "Hi friend! Ready to read?", also after the welcome); the name is still shown on screen (`greetShown()`, celebration text). **Every line Ollie can say must be in the recorder:** `tests/gaps.spec.mjs` records every recorder line, plays through the game with a different name, and fails on any sentence not in the owner's voice (`logSaid`, active only when `window.__ollieLog` is an array). Add new lines to `FIXED_LINES` (or another `recGroups` source) when adding speech.
17. **Sample-rate switch (suspected cause of intermittent crackles with the mic on):** turning the mic on/off moves the iPhone's audio hardware to another sample rate (call mode); an AudioContext created at the old rate gets resampled by Safari, which crackles. `syncAC()` (called ~0.9 s after the mic turns on in an exercise, after `micOff`, and around the sound check) creates a probe context; if its rate differs, it waits for Ollie to be quiet and rebuilds the engine (`wireAC`). Unverified on iPhone; `mic.spec` simulates the rate change.
18. **Playback pops (heard in the recorder too, inconsistently on the same clip, so not in the files):** every clip fades in over 5 ms and fades out over 5 ms when cut short (`playBuf` per-source gain, `stopClips`), and `keepAlive()` loops inaudible noise (~-80 dB, 2000 samples) on every engine so the iPhone never idles its speaker amplifier between lines. The owner's recordings were analysed and are clean. iOS screen recordings of Safari had **no audio**; for audio evidence ask for a recording with the Microphone switched on (long-press screen record in Control Center).
19. **Snapped-open starts (the consistent pops):** a screen recording with the mic on showed the pops at fixed spots in the takes ("I'm Ollie the owl." at 0.04 s on every play). iPhone noise suppression holds the mic at silence and opens instantly, so 224 of 356 takes jump from silence to loud within 2 ms. `desnap()` (via `clipFloat`, cached per clip, used by `playClip`/`playClipAt`/`segBuf`) fades each such onset in over 6 ms at playback; 0.55% of samples change, files untouched. Recording settings stay as they are (lesson 13).
20. **Held mic (Oct 2026, owner's test D on `tools/mic-test.html`, iPhone):** with a getUserMedia stream held open, starting and stopping recognition made no chime and no volume change, and Ollie sounded as good as with the mic off; the only chime was when the held mic closed, and the volume changed then. Hence the held mic. Tests E/F: echo cancellation on the held mic caused pops/distortion on the iPhone speaker (clean on AirPods); with only it off, sound is clean but much quieter (call volume near max ≈ D at 25%), so the held mic has echo cancellation off. Lessons 3, 15 and 17's workarounds stay for when it isn't held (PC, permission denied, after the phone locks until the next tap).
11. AI voices can't make clean isolated phonics sounds; the owner's own recordings are the answer. Recordings always take priority unless "Use my recordings" is off.

## Current state (Oct 1, 2026)
- `voice/` holds the owner's voice: the ElevenLabs lines in `ai-*.bin` and the owner's recordings (356) in `mine-1.bin`, uploaded by the owner via "Make voice files".
- Quality check (Oct 1): unused recorder lines removed (short praises, "Tap the microphone again…", "I'm Ollie. Let's read!"); letter examples only where the spelling matches.
- Held mic with echo cancellation off (lesson 20): confirmed by the owner on iPhone: no pops on the speaker, words recognized.
- Push-to-talk mic button (Oct 2): unverified on iPhone. `syncAC` now only probes while the game is quiet, and isn't called per word while the mic is held.
- `rev-1` branch on GitHub = the stable version before push to talk (the owner's saved copy; don't change it).
- Unverified on real iOS: the device voice fix, the voice download/export, the sound check, `syncAC`, `desnap`.

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
