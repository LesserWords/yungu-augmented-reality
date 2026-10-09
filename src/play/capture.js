// Camera button: tap = photo, hold = video (up to maxMs). Frames come from a canvas the
// render loop hands to frame() while `wanted` is true; the result is downloaded.
const HOLD_MS = 350;
const VIDEO_TYPES = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];

export class Capture {
  constructor(button, { maxMs = 30000, onStatus = () => {} } = {}) {
    this.button = button;
    this.maxMs = maxMs;
    this.onStatus = onStatus;
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.photoPending = false;
    this.recorder = null;
    this.videoType = window.MediaRecorder && VIDEO_TYPES.find((t) => MediaRecorder.isTypeSupported(t));

    let holdTimer = 0;
    button.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      button.setPointerCapture?.(e.pointerId);
      if (this.videoType) holdTimer = setTimeout(() => { holdTimer = 0; this.#startVideo(); }, HOLD_MS);
    });
    const release = () => {
      if (holdTimer) { clearTimeout(holdTimer); holdTimer = 0; this.photoPending = true; }
      else if (!this.videoType && !this.recorder) this.photoPending = true;
      else this.#stopVideo();
    };
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', () => { clearTimeout(holdTimer); holdTimer = 0; this.#stopVideo(); });
    button.addEventListener('contextmenu', (e) => e.preventDefault()); // long-press menu on Android
  }

  get wanted() { return this.photoPending || !!this.recorder; }

  // resolution factor for the next frame: full size for photos, videos capped at 1280px on the long side
  scale(w, h) {
    return this.photoPending ? 1 : Math.min(1, 1280 / Math.max(w, h));
  }

  frame(source) {
    if (!source.width || !source.height) return;
    if (this.recorder) {
      const k = Math.min(1, 1280 / Math.max(source.width, source.height));
      this.#draw(source, Math.round(source.width * k / 2) * 2, Math.round(source.height * k / 2) * 2);
    }
    if (this.photoPending) {
      this.photoPending = false;
      const shot = document.createElement('canvas');
      shot.width = source.width;
      shot.height = source.height;
      shot.getContext('2d').drawImage(source, 0, 0);
      shot.toBlob((blob) => blob && save(blob, `yungu-${stamp()}.jpg`), 'image/jpeg', 0.92);
      this.onStatus('Foto salva!', 2000);
      this.button.classList.add('flash');
      setTimeout(() => this.button.classList.remove('flash'), 200);
    }
  }

  #draw(source, w, h) {
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    this.ctx.drawImage(source, 0, 0, w, h);
  }

  #startVideo() {
    const chunks = [];
    const rec = new MediaRecorder(this.canvas.captureStream(30), { mimeType: this.videoType, videoBitsPerSecond: 6e6 });
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      const ext = this.videoType.startsWith('video/mp4') ? 'mp4' : 'webm';
      save(new Blob(chunks, { type: this.videoType.split(';')[0] }), `yungu-${stamp()}.${ext}`);
      this.onStatus('Vídeo salvo!', 2000);
    };
    rec.start(1000);
    this.recorder = rec;
    this.button.classList.add('recording');
    const t0 = performance.now();
    const tick = () => {
      if (this.recorder !== rec) return;
      const left = Math.ceil((this.maxMs - (performance.now() - t0)) / 1000);
      if (left <= 0) return this.#stopVideo();
      this.onStatus(`● Gravando… ${left}s`);
      setTimeout(tick, 250);
    };
    tick();
  }

  #stopVideo() {
    if (!this.recorder) return;
    this.recorder.stop();
    this.recorder = null;
    this.button.classList.remove('recording');
    this.onStatus('');
  }
}

function save(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

function stamp() {
  return new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
}
