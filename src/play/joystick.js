// Virtual joystick + keyboard (WASD / arrows) + physical gamepad, merged into one input.
// value.x: -1 (left) .. 1 (right), value.y: -1 (back) .. 1 (forward)

export class Joystick {
  constructor(el, { deadzone = 0.12 } = {}) {
    this.el = el;
    this.knob = el.querySelector('.joy-knob');
    this.deadzone = deadzone;
    this.touch = { x: 0, y: 0 };
    this.keys = new Set();
    this.pointerId = null;

    el.addEventListener('pointerdown', this.#onDown);
    window.addEventListener('pointermove', this.#onMove, { passive: false });
    window.addEventListener('pointerup', this.#onUp);
    window.addEventListener('pointercancel', this.#onUp);
    // in WebXR AR, a touch on the joystick must not also count as a "tap on the floor"
    el.addEventListener('beforexrselect', (e) => e.preventDefault());

    window.addEventListener('keydown', (e) => this.keys.add(e.code));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  #onDown = (e) => {
    if (this.pointerId !== null) return;
    this.pointerId = e.pointerId;
    this.el.classList.add('active');
    this.el.setPointerCapture?.(e.pointerId);
    this.#onMove(e);
    e.preventDefault();
  };

  #onMove = (e) => {
    if (e.pointerId !== this.pointerId) return;
    const r = this.el.getBoundingClientRect();
    const radius = r.width / 2;
    let dx = (e.clientX - (r.left + radius)) / radius;
    let dy = (e.clientY - (r.top + radius)) / radius;
    const len = Math.hypot(dx, dy);
    if (len > 1) { dx /= len; dy /= len; }
    this.touch.x = dx;
    this.touch.y = -dy;
    this.knob.style.transform = `translate(${dx * radius * 0.62}px, ${dy * radius * 0.62}px)`;
    e.preventDefault();
  };

  #onUp = (e) => {
    if (e.pointerId !== this.pointerId) return;
    this.pointerId = null;
    this.touch.x = this.touch.y = 0;
    this.el.classList.remove('active');
    this.knob.style.transform = '';
  };

  #keyboard() {
    const k = this.keys;
    const x = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const y = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const len = Math.hypot(x, y) || 1;
    return { x: x / len, y: y / len };
  }

  #gamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const out = { x: 0, y: 0, wave: false };
    for (const p of pads) {
      if (!p || p.axes.length < 2 || p.mapping !== 'standard') continue; // real controllers only
      if (p.buttons[0]?.pressed) out.wave = true;
      const x = p.axes[0], y = -p.axes[1];
      if (Math.hypot(x, y) > Math.hypot(out.x, out.y)) { out.x = x; out.y = y; }
    }
    return out;
  }

  /** combined input for this frame */
  read() {
    const sources = [this.touch, this.#keyboard(), this.#gamepad()];
    let best = { x: 0, y: 0 };
    for (const s of sources) if (Math.hypot(s.x, s.y) > Math.hypot(best.x, best.y)) best = s;
    const len = Math.hypot(best.x, best.y);
    if (len < this.deadzone) return { x: 0, y: 0, magnitude: 0 };
    // rescale so the dead zone edge maps to 0
    const m = Math.min(1, (len - this.deadzone) / (1 - this.deadzone));
    return { x: (best.x / len) * m, y: (best.y / len) * m, magnitude: m };
  }

  /** true once per press of the gamepad "A" button or the E key */
  wavePressed() {
    const pad = this.#gamepad().wave || this.keys.has('KeyE') || this.keys.has('Space');
    const fired = pad && !this._waveHeld;
    this._waveHeld = pad;
    return fired;
  }
}
