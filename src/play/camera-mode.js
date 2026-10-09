// "Fake AR" for browsers without WebXR (iPhone): the rear camera feed is the scene background
// and the gyroscope turns the 3D camera. No floor tracking: the floor is a fixed height below
// the phone and walking around isn't tracked.
import * as THREE from 'three';

// Ask before anything async: iOS only shows the motion prompt during the tap itself.
export function requestMotionPermission() {
  const ask = window.DeviceOrientationEvent?.requestPermission;
  return ask ? ask.call(DeviceOrientationEvent).then((r) => r === 'granted', () => false) : Promise.resolve(true);
}

export async function startCameraFeed() {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
  });
  const video = document.createElement('video');
  video.className = 'cam-feed';
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  document.body.append(video); // iOS pauses videos that aren't in the page
  await video.play();
  const texture = new THREE.VideoTexture(video);
  texture.colorSpace = THREE.SRGBColorSpace;
  return { video, texture };
}

// crop the feed to cover the screen (like CSS object-fit: cover); returns the vertical
// fraction of the feed that stays visible, to match the 3D camera's field of view
export function coverFit(texture, video, aspect) {
  const va = video.videoWidth / video.videoHeight || aspect;
  texture.repeat.set(1, 1);
  if (va > aspect) texture.repeat.x = aspect / va;
  else texture.repeat.y = va / aspect;
  texture.offset.set((1 - texture.repeat.x) / 2, (1 - texture.repeat.y) / 2);
  return texture.repeat.y;
}

// device orientation -> camera rotation (same maths as the old three.js DeviceOrientationControls)
export class GyroCamera {
  constructor(camera) {
    this.camera = camera;
    this.event = null;
    this.zee = new THREE.Vector3(0, 0, 1);
    this.euler = new THREE.Euler();
    this.q0 = new THREE.Quaternion();
    this.q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)); // look out the back of the device
    this.onEvent = (e) => { if (e.alpha !== null) this.event = e; };
    window.addEventListener('deviceorientation', this.onEvent);
  }

  get active() { return !!this.event; }

  update() {
    if (!this.event) return;
    const d = THREE.MathUtils.DEG2RAD;
    const { alpha, beta, gamma } = this.event;
    const orient = (screen.orientation?.angle ?? window.orientation ?? 0) * d;
    const q = this.camera.quaternion;
    this.euler.set(beta * d, alpha * d, -gamma * d, 'YXZ');
    q.setFromEuler(this.euler);
    q.multiply(this.q1);
    q.multiply(this.q0.setFromAxisAngle(this.zee, -orient));
  }

  dispose() {
    window.removeEventListener('deviceorientation', this.onEvent);
  }
}
