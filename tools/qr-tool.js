// Browser QR generator: live preview, SVG/PNG download, automatic scan test (jsQR).
import jsQR from 'jsqr';
import '../src/shared/base.css';
import './qr-tool.css';
import { buildArtisticQR, withUTM } from '../src/qr/artistic-qr.js';

const $ = (id) => document.getElementById(id);
const els = {
  url: $('url'), utm: $('utm'), caption: $('caption'), sub: $('sub'), size: $('png-size'),
  preview: $('qr-preview'), verify: $('verify'), meta: $('meta'), svgBtn: $('dl-svg'), pngBtn: $('dl-png'),
};
let logoData = null;
let current = null;

// remember the last URL typed (convenience only)
try { els.url.value = localStorage.getItem('yungu-qr-url') || ''; } catch { /* storage unavailable */ }

async function loadLogo() {
  const blob = await (await fetch(new URL('../img/icon-512.png', location.href))).blob();
  logoData = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });
}

function settings() {
  let url = els.url.value.trim();
  if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;
  if (url && els.utm.checked) url = withUTM(url);
  const style = document.querySelector('input[name="style"]:checked').value;
  return { url, frame: style === 'card', caption: els.caption.value.trim(), subcaption: els.sub.value.trim() };
}

async function render() {
  const s = settings();
  try { localStorage.setItem('yungu-qr-url', els.url.value.trim()); } catch { /* ignore */ }
  if (!s.url) {
    els.preview.innerHTML = '';
    els.verify.textContent = 'Digite o endereço para gerar o QR.';
    els.verify.className = 'verify';
    els.meta.textContent = '';
    els.svgBtn.disabled = els.pngBtn.disabled = true;
    return;
  }
  current = { ...s, qr: buildArtisticQR(s.url, { logo: logoData, frame: s.frame, caption: s.caption, subcaption: s.subcaption }) };
  els.preview.innerHTML = current.qr.svg;
  els.meta.textContent = `Versão ${current.qr.version} · ${current.qr.modules}×${current.qr.modules} módulos · correção de erro H · ${s.url}`;
  els.svgBtn.disabled = els.pngBtn.disabled = false;
  await verify();
}

// draw the QR on a canvas; captions are painted with canvas text so Poppins is used
async function toCanvas(widthPx) {
  const { qr, frame, caption, subcaption } = current;
  const noText = buildArtisticQR(current.url, { logo: logoData, frame, caption, subcaption, captionText: false });
  const scale = widthPx / noText.width;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(noText.width * scale);
  canvas.height = Math.round(noText.height * scale);
  const ctx = canvas.getContext('2d');
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(noText.svg);
  await img.decode();
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  if (qr.caption) {
    await document.fonts.load(`700 ${qr.caption.size1 * scale}px Poppins`).catch(() => {});
    const c = qr.caption;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    if (caption) {
      ctx.font = `700 ${c.size1 * scale}px Poppins, 'Segoe UI', Arial, sans-serif`;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(caption, c.x * scale, c.y1 * scale);
    }
    if (subcaption) {
      ctx.font = `600 ${c.size2 * scale}px Poppins, 'Segoe UI', Arial, sans-serif`;
      ctx.fillStyle = qr.options.lime;
      ctx.fillText(subcaption, c.x * scale, c.y2 * scale);
    }
  }
  return canvas;
}

// scan test at a small size (roughly what a phone sees from a distance)
async function verify() {
  els.verify.textContent = 'Testando leitura…';
  els.verify.className = 'verify';
  try {
    const results = [];
    for (const w of [600, 260]) {
      const canvas = await toCanvas(w);
      const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(data.data, data.width, data.height, { inversionAttempts: 'dontInvert' });
      results.push(code?.data === current.url);
    }
    const ok = results.every(Boolean);
    els.verify.textContent = ok
      ? '✔ Leitura confirmada (teste automático em tamanho grande e pequeno)'
      : '✖ O teste automático não leu este QR. Encurte a URL ou use “Só o QR”.';
    els.verify.className = 'verify ' + (ok ? 'ok' : 'bad');
  } catch (err) {
    console.error(err);
    els.verify.textContent = 'Não foi possível testar automaticamente. Teste com o celular.';
  }
}

function download(href, name) {
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

els.svgBtn.addEventListener('click', () => {
  const blob = new Blob([current.qr.svg], { type: 'image/svg+xml' });
  const href = URL.createObjectURL(blob);
  download(href, `yungu-qr-${current.frame ? 'card' : 'plain'}.svg`);
  setTimeout(() => URL.revokeObjectURL(href), 2000);
});
els.pngBtn.addEventListener('click', async () => {
  const canvas = await toCanvas(Number(els.size.value));
  canvas.toBlob((blob) => {
    const href = URL.createObjectURL(blob);
    download(href, `yungu-qr-${current.frame ? 'card' : 'plain'}-${els.size.value}px.png`);
    setTimeout(() => URL.revokeObjectURL(href), 2000);
  }, 'image/png');
});

let t = 0;
const schedule = () => { clearTimeout(t); t = setTimeout(render, 250); };
for (const el of [els.url, els.caption, els.sub]) el.addEventListener('input', schedule);
for (const el of document.querySelectorAll('input[type=checkbox], input[type=radio]')) el.addEventListener('change', render);

loadLogo().then(render);
