# Handoff: Ollie's Word Adventure (Oct 2, 2026)

Read **CLAUDE.md** first: it is the full project guide (code map, publishing steps, hard-won lessons, testing). This file only summarizes the latest session and what is open.

## Working with the owner
- Direct, economical answers. Explain choices in plain terms (electrical/controls engineer, not a web developer).
- **When the owner reports feedback or asks a question, answer it; don't change code unless asked.** If unsure, propose and ask "Shall I go ahead?".
- Only the owner can test on a real iPhone: say what is untested instead of claiming it works.
- When an audio/iOS behaviour is unclear, build a small test on `tools/mic-test.html` (tests 0, A–F exist) and let the owner run it before changing the game. That approach found the held-mic fix.

## Publishing (unchanged; see CLAUDE.md)
Work on a branch → `cd tests && npx playwright test` must exit 0 → `tools/save-previous.sh` → commit (with `previous/index.html`) → fast-forward `master` → push. Tell the owner it's live and that `/previous/` has the version before it. 36 tests currently pass.
- `rev-1` branch on GitHub = the owner's saved stable copy (before push to talk). **Never change it.** Pushing git tags is refused from the cloud session (403); branches work.

## Done this session (all live on master)
1. Quality check fixes: letter example ("like zoo") only when the tile is spelled like the example word; 9 unused recorder lines removed; outdated Netlify text; notes updated.
2. **Held mic** (iPhone/iPad): a getUserMedia stream with `echoCancellation:false` stays open for the visit, so one (call) volume and no recognition chimes. Confirmed on iPhone: no pops, words recognized. One-step sound check. (CLAUDE.md lesson 20.)
3. **Push-to-talk mic button**: one try per tap; off after a read, a wrong word, or 8 s of silence. The tap cutting Ollie off no longer makes the mic deaf (fixed missed first tries; owner confirmed in own testing, child not yet).
4. **Skips earn nothing**: rounds re-queue a skipped word (6 dots = 6 reads = sticker); stories say the word and ask again. A skipped word shows the grown-up ✓ at once.
5. **Grown-up ✓ needs a 5 s press-and-hold** (button fills while held).
6. **100 stickers** (64 added after the original 36, which keep their order).

## Unverified on a real iPhone
- 5 s hold button: whether iOS shows a text-selection/magnifier bubble instead of the fill.
- Push to talk with the child; skip re-queue flow; new stickers rendering.
- Older items listed under "Current state" in CLAUDE.md.

## Known stale bits in CLAUDE.md (fix when convenient)
- Lesson 7 still describes the mic staying on for the whole round/story (now push to talk; the recognizer session runs per tap while the held mic stays open).
- Lesson 14 says skipping then shows the next word; in a round the skipped word now returns later, and in a story it is asked again.
- Lesson 17's mention of syncAC "after the mic turns on in an exercise": now skipped while the mic is held.

## Owner's list
The owner has more improvement ideas; ask what's next.
