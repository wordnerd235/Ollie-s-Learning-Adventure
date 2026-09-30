# Ollie's Word Adventure — project notes for Claude Code

A phonics reading game for the owner's 5-year-old child. It is a **single self-contained `index.html`** (CSS + one script, no build step, no dependencies except Google Fonts) served by **GitHub Pages** from this repo. Previously hosted on Netlify. A copy also exists as a claude.ai artifact, but that viewer blocks the microphone and external APIs, so GitHub Pages is the real home.

Owner: technical (electrical/controls engineer), not a web developer. Prefers direct, economical communication. Tests on an **iPhone in Safari** (main device), also an iPad and a Windows PC. Nobody but the owner can test on real iOS: say so plainly instead of claiming something works on iPhone.

## What the game does
- **Rounds** of 6 words, adaptive over 5 levels (2-letter words → sight words → 4–5-letter words). The child reads the word aloud into the mic; a correct read triggers a celebration with a word-specific animation and sound, plus praise.
- **Letter tiles:** tapping a letter plays its sound. "Hear it" plays the word; "Sound it out" plays the letters in sequence. Silent letters are shown as dashed tiles.
- **Skip** is always available. A grown-up ✓ button appears after misses, or replaces the mic entirely when the mic is unavailable.
- **Stories:** 9 stories unlock as their words are learned. Ollie narrates the lead-in words, the child reads each target word, then the whole sentence is read back with word highlighting. A story counts as done once read through (this clears the Story Time badge).
- **Stickers:** earned per round/story. There are 6 illustrated "sticker scenes" with Ollie where stickers can be placed, dragged, resized, flipped, and cleared.
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
- `BUILT-IN VOICE`: the "Make game file with voice" button embeds every clip into a copy of the page as `<script type="application/json" id="ollie-pack" data-id=…>`, stored as lossless pcm16 base64 (older packs used IMA ADPCM). `loadEmbedded()` imports it into IndexedDB on first load of a new pack id. The page source for this comes from `PRISTINE`, an `outerHTML` snapshot taken as the script starts, with host-injected `<script src>` tags stripped.
- `MURF AI VOICE PACK` (now provider-generic):
  - Providers: `murf` or `el` (ElevenLabs), chosen with `S.settings.ttsProv`.
  - `murfTexts()` lists every line the game can say.
  - `murfBuild()` generates the missing lines: two requests at once, dropping to one on a 429; a line that keeps failing is skipped.
  - Story sentences are requested with word timings.
  - `packTag` identifies the voice a pack was built with; changing voice asks for a second tap before replacing the pack.
  - `elPhonemes()` remakes letter sounds from CMU Arpabet phoneme tags (model `eleven_flash_v2`).
- `SPEECH RECOGNITION`: a single reused recognizer (`getSR`); `listenFor(word, long)`; `matches()` is lenient (homophones, edit distance); `micHelp()` holds the error explanations.
- `WORD ACTIVITY` (`mountActivity`): shared by rounds and stories. The mic is a **toggle** (`MIC_ON`): `micLoop` listens across words and pauses whenever the game makes sound (`hushMic`, `waitAudioIdle`) so it never hears Ollie say the answer. It turns off on any screen change.
- `SCREENS` / rounds / stickers / `STICKER SCENES` / stories / story player:
  - `readAlong()` plays slices of the whole-sentence clip using its word timings (`segBuf`).
  - It uses the owner's recorded pieces instead when they exist.
- `VOICE RECORDER`: `recGroups()` lists every line in sections (358 lines); `guided()` walks through the missing ones one at a time.
- `GROWN-UP SETTINGS`, `EVENTS`.

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
5. **iOS blocks downloads that start long after the tap.** Making the file is two steps: build, then a fresh tap on Save, or Share….
6. **speechSynthesis quirks:**
   - Calling `speak()` right after `cancel()` drops the utterance, so there is a ~120 ms gap (`lastCancel`).
   - Some listed voices never start, so a watchdog falls back to the next voice (`BADV`).
   - Safari offers web pages no Siri voices and no downloaded Premium voices.
7. **iOS recognition** plays a system tone on start/stop; reusing one recognizer instance is believed to help. The first recognition right after the permission prompt may fail once, which gets a soft retry.
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
11. AI voices can't make clean isolated phonics sounds; the owner's own recordings are the answer. Recordings always take priority unless "Use my recordings" is off.

## Current state (Sept 30, 2026)
- The repo's `index.html` is ~44.5 MB because the voice is embedded:
  - 534 ElevenLabs lines, all with timings
  - the owner's 38 letter sounds, 75 words and 63 phrases
- GitHub warns about files over 50 MB, rejects files over 100 MB, and every code commit re-stores the whole file. **Priority:** move the voice out of `index.html` into separate file(s) the page loads.
- Unverified on real iOS: the device voice fix and whether the recognition tone is reduced.

## Testing
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
