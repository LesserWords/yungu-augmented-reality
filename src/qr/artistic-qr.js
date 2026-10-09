// Artistic Yungu QR code -> SVG string. Works in the browser and in Node.
// Scannability rules kept on purpose:
//   - error correction H (30%), logo covers < 9% of the code
//   - dark modules on a white panel, 4-module quiet zone
//   - finder patterns stay solid and dark (only their corners are rounded)
import QRCode from 'qrcode';

const DEFAULTS = {
  logo: null,                    // image URL or data URI (square)
  frame: true,                   // navy card + caption around the white QR panel
  caption: 'Escaneie e veja o Yungu',
  subcaption: 'no seu espaço',
  captionText: true,             // false = leave caption space empty (canvas draws it with web fonts)
  moduleFrom: '#061a30',         // module gradient (both must stay dark)
  moduleTo: '#0e3d2c',
  finder: '#040c18',
  panel: '#ffffff',
  card: '#071526',
  card2: '#123049',
  lime: '#bff040',
  logoRatio: 0.24,               // logo width relative to the code
  font: "Poppins, 'Segoe UI', Arial, sans-serif",
};

export function buildArtisticQR(text, options = {}) {
  const o = { ...DEFAULTS, ...options };
  const qr = QRCode.create(text, { errorCorrectionLevel: 'H' });
  const N = qr.modules.size;
  const dark = (r, c) => qr.modules.get(r, c);

  const Q = 4;                         // quiet zone (modules)
  const panel = N + Q * 2;
  const pad = o.frame ? 3.4 : 0;       // card padding
  const capH = o.frame && (o.caption || o.subcaption) ? 10.5 : 0;
  const W = panel + pad * 2;
  const H = panel + pad * 2 + capH;
  const ox = pad + Q;                  // first module x
  const oy = pad + Q;

  // logo window, centred on the module grid
  let L = Math.round(N * o.logoRatio);
  if ((N - L) % 2) L += 1;
  const ls = (N - L) / 2;
  const inLogo = (r, c) => o.logo && r >= ls && r < ls + L && c >= ls && c < ls + L;
  const inFinder = (r, c) => (r < 7 && c < 7) || (r < 7 && c >= N - 7) || (r >= N - 7 && c < 7);

  const f = (n) => +n.toFixed(3);
  const parts = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${f(W)} ${f(H)}" width="${f(W * 16)}" height="${f(H * 16)}" shape-rendering="geometricPrecision">`);
  parts.push('<defs>');
  parts.push(`<linearGradient id="yq-mod" gradientUnits="userSpaceOnUse" x1="${ox}" y1="${oy}" x2="${ox + N}" y2="${oy + N}"><stop offset="0" stop-color="${o.moduleFrom}"/><stop offset="1" stop-color="${o.moduleTo}"/></linearGradient>`);
  if (o.frame) {
    parts.push(`<radialGradient id="yq-card" cx="50%" cy="38%" r="75%"><stop offset="0" stop-color="${o.card2}"/><stop offset="1" stop-color="${o.card}"/></radialGradient>`);
    parts.push('<filter id="yq-glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="0.9"/></filter>');
  }
  if (o.logo) {
    const lx = ox + ls + 0.6, lw = L - 1.2;
    parts.push(`<clipPath id="yq-logo-clip"><rect x="${f(lx)}" y="${f(oy + ls + 0.6)}" width="${f(lw)}" height="${f(lw)}" rx="${f(lw * 0.22)}"/></clipPath>`);
  }
  parts.push('</defs>');

  // ---- card
  if (o.frame) {
    const r = 3.2;
    parts.push(`<rect x="0" y="0" width="${f(W)}" height="${f(H)}" rx="${r}" fill="url(#yq-card)"/>`);
    parts.push(`<rect x="0.6" y="0.6" width="${f(W - 1.2)}" height="${f(H - 1.2)}" rx="${r - 0.5}" fill="none" stroke="${o.lime}" stroke-width="0.5" opacity="0.55" filter="url(#yq-glow)"/>`);
    parts.push(`<rect x="0.6" y="0.6" width="${f(W - 1.2)}" height="${f(H - 1.2)}" rx="${r - 0.5}" fill="none" stroke="${o.lime}" stroke-width="0.22"/>`);
  }

  // ---- white panel (includes the quiet zone)
  parts.push(`<rect x="${pad}" y="${pad}" width="${panel}" height="${panel}" rx="${o.frame ? 2.2 : 0}" fill="${o.panel}"/>`);

  // ---- data modules
  parts.push('<g fill="url(#yq-mod)">');
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (!dark(r, c) || inFinder(r, c) || inLogo(r, c)) continue;
      parts.push(`<rect x="${f(ox + c + 0.06)}" y="${f(oy + r + 0.06)}" width="0.88" height="0.88" rx="0.32"/>`);
    }
  }
  parts.push('</g>');

  // ---- finder patterns (rounded, solid)
  const finder = (x, y) =>
    `<path fill="${o.finder}" fill-rule="evenodd" d="${roundRect(x, y, 7, 7, 1.7)} ${roundRect(x + 1, y + 1, 5, 5, 1.0)}"/>` +
    `<rect x="${x + 2}" y="${y + 2}" width="3" height="3" rx="0.75" fill="${o.finder}"/>`;
  parts.push(finder(ox, oy), finder(ox + N - 7, oy), finder(ox, oy + N - 7));

  // ---- logo
  if (o.logo) {
    const lx = ox + ls + 0.6, ly = oy + ls + 0.6, lw = L - 1.2;
    parts.push(`<image href="${o.logo}" xlink:href="${o.logo}" x="${f(lx)}" y="${f(ly)}" width="${f(lw)}" height="${f(lw)}" clip-path="url(#yq-logo-clip)" preserveAspectRatio="xMidYMid slice"/>`);
  }

  // ---- caption
  const captionLayout = capH
    ? { x: W / 2, y1: pad + panel + 5.0, y2: pad + panel + 8.4, size1: 2.7, size2: 2.4 }
    : null;
  if (captionLayout && o.captionText) {
    const { x, y1, y2, size1, size2 } = captionLayout;
    if (o.caption) parts.push(`<text x="${f(x)}" y="${f(y1)}" text-anchor="middle" font-family="${o.font}" font-weight="700" font-size="${size1}" fill="#ffffff">${esc(o.caption)}</text>`);
    if (o.subcaption) parts.push(`<text x="${f(x)}" y="${f(y2)}" text-anchor="middle" font-family="${o.font}" font-weight="600" font-size="${size2}" fill="${o.lime}">${esc(o.subcaption)}</text>`);
  }
  parts.push('</svg>');

  return { svg: parts.join(''), width: W, height: H, modules: N, version: qr.version, caption: captionLayout, options: o };
}

function roundRect(x, y, w, h, r) {
  return `M${x + r},${y}H${x + w - r}A${r},${r} 0 0 1 ${x + w},${y + r}V${y + h - r}A${r},${r} 0 0 1 ${x + w - r},${y + h}H${x + r}A${r},${r} 0 0 1 ${x},${y + h - r}V${y + r}A${r},${r} 0 0 1 ${x + r},${y}Z`;
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
}

/** add UTM tags so QR scans show up separately in analytics */
export function withUTM(url, campaign = 'yungu-ar') {
  try {
    const u = new URL(url);
    u.searchParams.set('utm_source', 'qr');
    u.searchParams.set('utm_medium', 'print');
    u.searchParams.set('utm_campaign', campaign);
    return u.toString();
  } catch {
    return url;
  }
}
