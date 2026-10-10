// Builds the static, backend-free demo into docs/ (for GitHub Pages).
//   node scripts/build-demo.mjs [basePath]      default base: /mevazor
//   node scripts/serve-demo.mjs                 preview docs/ locally at http://localhost:4000/mevazor/
import { build } from 'esbuild';
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = (process.argv[2] || '/mevazor').replace(/\/$/, '');
const OUT = resolve(root, 'docs');
const shim = (n) => resolve(root, 'demo/shims', n);

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// 1) the server, bundled for the browser
await build({
  entryPoints: [resolve(root, 'demo/entry.js')],
  outfile: resolve(OUT, 'demo-server.js'),
  bundle: true, format: 'esm', platform: 'browser', target: 'es2022', minify: true, legalComments: 'none',
  inject: [shim('globals.js')],
  define: { __BASE__: JSON.stringify(BASE), __BUILD__: JSON.stringify(String(Date.now())) },
  plugins: [{
    name: 'node-shims',
    setup(b) {
      const map = { 'node:sqlite': 'sqlite.js', 'node:crypto': 'crypto.js', 'node:fs': 'fs.js', 'node:path': 'path.js', 'node:url': 'url.js' };
      b.onResolve({ filter: /^node:/ }, (a) => {
        if (!map[a.path]) throw new Error(`No browser shim for ${a.path}`);
        return { path: shim(map[a.path]) };
      });
    },
  }],
});

// 2) the front-ends: copy public/ and make every root-absolute URL live under BASE
const REWRITE = /(["'`(=])\/(shared|app|admin|photos|api|uploads|vendor)\//g;
const TEXT = new Set(['.js', '.html', '.css', '.json']);
function copy(dir, to) {
  mkdirSync(to, { recursive: true });
  for (const name of readdirSync(dir)) {
    const from = join(dir, name);
    const dest = join(to, name);
    if (statSync(from).isDirectory()) copy(from, dest);
    else if (TEXT.has(extname(name)) && name !== 'CREDITS.json') writeFileSync(dest, readFileSync(from, 'utf8').replace(REWRITE, `$1${BASE}/$2/`));
    else cpSync(from, dest);
  }
}
copy(resolve(root, 'public'), OUT);

// 3) load the in-browser server before either app starts
for (const f of ['app/main.js', 'admin/app.js']) {
  const p = resolve(OUT, f);
  writeFileSync(p, `import '${BASE}/demo-server.js';\n` + readFileSync(p, 'utf8'));
}

// 4) sql.js (SQLite -> WebAssembly)
mkdirSync(resolve(OUT, 'vendor'), { recursive: true });
for (const f of ['sql-wasm.js', 'sql-wasm.wasm']) cpSync(resolve(root, 'node_modules/sql.js/dist', f), resolve(OUT, 'vendor', f));

writeFileSync(resolve(OUT, '.nojekyll'), '');
// the repo root of the Pages site: send visitors to the customer app
writeFileSync(resolve(OUT, 'index.html'), readFileSync(resolve(OUT, 'index.html'), 'utf8'));
console.log(`demo built -> docs/  (base ${BASE})`);
