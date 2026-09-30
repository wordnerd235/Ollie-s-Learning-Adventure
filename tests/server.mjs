// Static server for the tests (IndexedDB and fetch need http://localhost, not file://).
//   /game/<site>/index.html  -> the repo's index.html (the code under test)
//   /game/<site>/previous/   -> the repo's previous/index.html (the version that was live before)
//   /game/<site>/old.html    -> .work/old.html (an old all-in-one game file with the voice inside)
//   /game/<site>/voice/<f>   -> .work/sites/<site>/voice/<f>
//   /gen/old.html            -> .work/old-src.html (old game code, used to make the fixture)
//   /tools/extract.html      -> the repo's voice extractor page
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(HERE, '..');
export const WORK = path.join(HERE, '.work');
const TYPES = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.bin': 'application/octet-stream' };

function resolve(url) {
  const p = decodeURIComponent(new URL(url, 'http://x').pathname);
  if (p === '/gen/old.html') return path.join(WORK, 'old-src.html');
  if (p === '/tools/extract.html') return path.join(REPO, 'tools', 'extract.html');
  const m = /^\/game\/([\w-]+)\/(.*)$/.exec(p);
  if (!m) return null;
  const [, site, rest] = m;
  if (rest === '' || rest === 'index.html') return path.join(REPO, 'index.html');
  if (rest === 'old.html') return path.join(WORK, 'old.html');
  if (rest === 'previous/' || rest === 'previous/index.html') return path.join(REPO, 'previous', 'index.html');
  if (rest.startsWith('voice/') && !rest.includes('..')) return path.join(WORK, 'sites', site, rest);
  return null;
}

export function startServer(port) {
  const srv = http.createServer((req, res) => {
    const f = resolve(req.url);
    if (!f || !fs.existsSync(f)) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Content-Length': fs.statSync(f).size });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise(r => srv.listen(port, () => r(srv)));
}
