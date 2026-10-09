// Generate the artistic QR as SVG files from the command line.
//   npm run qr -- https://your-domain.com/yungu
//   npm run qr -- https://your-domain.com/yungu --utm --caption "Escaneie e veja o Yungu" --sub "no seu espaço"
//   npm run qr -- https://your-domain.com/yungu/play.html --name play   -> qr-code/yungu-qr-play-*.svg
// For a PNG (and an automatic scan test) use the browser tool: npm run dev -> /tools/qr.html
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildArtisticQR, withUTM } from '../src/qr/artistic-qr.js';

const root = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

let url = args.find((a) => /^https?:\/\//i.test(a));
if (!url) {
  console.error('Usage: npm run qr -- https://your-domain.com/yungu [--utm] [--caption "..."] [--sub "..."] [--name play]');
  process.exit(1);
}
if (flag('utm')) url = withUTM(url);

const logo = 'data:image/png;base64,' + readFileSync(resolve(root, 'public/img/icon-512.png')).toString('base64');
const outDir = resolve(root, 'qr-code');
mkdirSync(outDir, { recursive: true });

const captions = {};
if (opt('caption')) captions.caption = opt('caption');
if (opt('sub')) captions.subcaption = opt('sub');
const card = buildArtisticQR(url, { logo, ...captions });
const plain = buildArtisticQR(url, { logo, frame: false });
const base = opt('name') ? `yungu-qr-${opt('name')}` : 'yungu-qr';
writeFileSync(resolve(outDir, `${base}-card.svg`), card.svg);
writeFileSync(resolve(outDir, `${base}-plain.svg`), plain.svg);
writeFileSync(resolve(outDir, `${base}-url.txt`), url + '\n');

console.log(`QR for: ${url}`);
console.log(`QR version ${card.version} (${card.modules}x${card.modules} modules), error correction H`);
console.log(`Saved: qr-code/${base}-card.svg, qr-code/${base}-plain.svg`);
