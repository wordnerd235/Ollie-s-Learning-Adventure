#!/bin/sh
# Run before publishing a new index.html to master: saves the game that is live now
# (index.html on origin/master) as previous/index.html, served at .../previous/.
# It loads the same voice files (../voice/) and, being the same site, sees the same
# progress and recordings, so it can be used while a problem in the new version is fixed.
set -e
cd "$(dirname "$0")/.."
git fetch -q origin master
mkdir -p previous
git show origin/master:index.html \
  | sed -e "s#const VOICE_DIR='voice/'#const VOICE_DIR='../voice/'#" \
        -e "s#<title>Ollie's Word Adventure</title>#<title>Ollie's Word Adventure (previous version)</title>#" \
  > previous/index.html
grep -q "const VOICE_DIR='../voice/'" previous/index.html || { echo "save-previous: voice path not found in the live index.html" >&2; exit 1; }
echo "saved $(git rev-parse --short origin/master) as previous/index.html"
