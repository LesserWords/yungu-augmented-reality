import '@google/model-viewer';
import QRCode from 'qrcode';
import './landing.css';
import { STRINGS } from '../shared/strings.js';
import { getPlatform, supportsImmersiveAR } from '../shared/device.js';

const T = STRINGS.landing;
const mv = document.getElementById('yungu');
const arBtn = document.getElementById('btn-ar');
const playLabel = document.getElementById('btn-play-label');
const playNote = document.getElementById('play-note');
const hint = document.getElementById('hint');
const desktopQR = document.getElementById('desktop-qr');
const platform = getPlatform();

// ---- loading bar
const bar = mv.querySelector('.mv-progress-bar');
mv.addEventListener('progress', (e) => {
  const p = e.detail.totalProgress;
  bar.style.width = `${Math.round(p * 100)}%`;
  if (p >= 1) bar.parentElement.classList.add('done');
});

// ---- AR button (uses the phone's native viewer: Quick Look on iOS, WebXR / Scene Viewer on Android)
function refreshARButton() {
  arBtn.hidden = !mv.canActivateAR;
}
customElements.whenDefined('model-viewer').then(() => {
  refreshARButton();
  setTimeout(refreshARButton, 600); // WebXR support is detected asynchronously
});
mv.addEventListener('load', refreshARButton);
arBtn.addEventListener('click', () => mv.activateAR());
mv.addEventListener('ar-status', (e) => {
  if (e.detail.status === 'failed') hint.textContent = T.arFailed;
});

// ---- device-specific copy
(async () => {
  const xrAR = await supportsImmersiveAR();
  if (platform.iOS) {
    hint.textContent = T.hintIOS;
    playLabel.textContent = T.play3D;
    playNote.textContent = T.play3DNote;
    playNote.hidden = false;
  } else if (platform.android) {
    hint.textContent = xrAR ? T.hintAndroidAR : T.hintAndroidNoXR;
    playLabel.textContent = xrAR ? T.playAR : T.play3D;
    if (!xrAR) { playNote.textContent = T.play3DNote; playNote.hidden = false; }
  } else {
    hint.textContent = T.hintDesktop;
    playLabel.textContent = T.play3D;
    showDesktopQR();
  }
})();

// ---- desktop: QR of this page so visitors can jump to their phone
function showDesktopQR() {
  const canvas = document.getElementById('qr-canvas');
  QRCode.toCanvas(canvas, location.href, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 240,
    color: { dark: '#040c18', light: '#ffffff' },
  }).then(() => { desktopQR.hidden = false; }).catch(() => {});
}
