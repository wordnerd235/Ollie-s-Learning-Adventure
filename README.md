# Ollie's Word Adventure

A phonics and reading game for kids, served by GitHub Pages from `index.html`.

- `voice/`: Ollie's voice (AI voice and recorded lines), downloaded by the game on first visit. To update it, use grown-up settings › Voice files › Make voice files, then upload the changed files and `manifest.json` here.
- `previous/`: the version that was live before the latest change, at `.../previous/`.
- `tools/save-previous.sh`: saves the live version to `previous/` before publishing a new one.
- `tools/extract.html`: turns an old all-in-one game file (voice inside) into `voice/` files.
- `tests/`: Playwright tests (`cd tests && npm install && npx playwright test`).
