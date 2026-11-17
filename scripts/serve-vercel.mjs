// Serves a built folder the way Vercel would, applying the rewrites from vercel.json.
//   node scripts/serve-vercel.mjs <dir> <port>
// Used by the e2e tests so the hosting contract (/fictionary, /fictionary/, /fictionary/:path+) is tested for real.
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';

const [dir = 'dist', port = '4173'] = process.argv.slice(2);
const { rewrites = [] } = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon',
};

// Supports the three source shapes vercel.json uses here: exact, and "/prefix/:name+".
function rewrite(path) {
  for (const { source, destination } of rewrites) {
    const m = source.match(/^(.*)\/:(\w+)\+$/);
    if (m) {
      const [, prefix, name] = m;
      if (path.startsWith(`${prefix}/`) && path.length > prefix.length + 1) {
        return destination.replace(`:${name}+`, path.slice(prefix.length + 1));
      }
    } else if (path === source) {
      return destination;
    }
  }
  return path;
}

createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const target = normalize(decodeURIComponent(rewrite(url.pathname))).replace(/^(\.\.[/\\])+/, '');
  const file = join(dir, target);
  if (!file.startsWith(dir) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
}).listen(Number(port), () => console.log(`serving ${dir} on :${port} with vercel.json rewrites`));
