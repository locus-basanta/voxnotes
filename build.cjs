const fs = require('node:fs');
const path = require('node:path');
process.chdir(__dirname);
const html = fs.readFileSync('src/page.html', 'utf8')
  .replace('/* INLINE_STYLES */', () => fs.readFileSync('.build.css', 'utf8'))
  .replace('/* INLINE_APP */', () => fs.readFileSync('src/app.js', 'utf8'));
fs.mkdirSync('dist', { recursive: true });
fs.writeFileSync('index.html', html);
fs.writeFileSync('dist/index.html', html);
for (const file of ['_headers', '_redirects']) fs.copyFileSync(file, path.join('dist', file));
fs.rmSync('.build.css');
console.log(`Built offline-ready index.html (${Math.round(Buffer.byteLength(html) / 1024)} KB) and dist/`);
