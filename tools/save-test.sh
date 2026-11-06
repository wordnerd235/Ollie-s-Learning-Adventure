#!/bin/sh
# Builds the test version: this branch's index.html as test/index.html, served at .../test/ next to the
# live game (same site, so the same voice files via ../voice/ and the same progress and recordings).
# The live index.html is not touched. Usage: tools/save-test.sh [output dir, default .]
set -e
cd "$(dirname "$0")/.."
out="${1:-.}"
mkdir -p "$out/test"
sed -e "s#const VOICE_DIR='voice/'#const VOICE_DIR='../voice/'#" \
    -e "s#<title>Ollie's Word Adventure</title>#<title>Ollie's Word Adventure (test version)</title>#" \
    -e "s#^const BUILD='';#const BUILD='test build $(git rev-parse --short HEAD), $(date -u +'%b %-d %H:%M') UTC';#" \
    index.html > "$out/test/index.html"
grep -q "const VOICE_DIR='../voice/'" "$out/test/index.html" || { echo "save-test: voice path not found in index.html" >&2; exit 1; }
grep -q "^const BUILD='test build" "$out/test/index.html" || { echo "save-test: build label not set" >&2; exit 1; }
echo "built $out/test/index.html from $(git rev-parse --short HEAD)"
