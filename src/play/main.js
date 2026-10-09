// Joystick mode.
//  - Android Chrome: WebXR AR session -> find the floor, tap to place, drive with the joystick.
//  - iPhone / other phones without WebXR: camera feed + gyroscope "fake AR" (camera-mode.js).
//  - Desktop, or if the camera is refused: same controls in a 3D preview scene (also handy for development).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { XREstimatedLight } from 'three/addons/webxr/XREstimatedLight.js';
import './play.css';
import { MODELS, PLAY } from '../shared/config.js';
import { STRINGS } from '../shared/strings.js';
import { supportsImmersiveAR, getPlatform } from '../shared/device.js';
import { Joystick } from './joystick.js';
import { loadYungu } from './yungu.js';
import { Capture } from './capture.js';
import { requestMotionPermission, startCameraFeed, coverFit, GyroCamera } from './camera-mode.js';

const T = STRINGS.play;
const $ = (id) => document.getElementById(id);
const startEl = $('start');
const startBtn = $('start-btn');
const startNote = $('start-note');
const hud = $('hud');
const statusEl = $('status');

// ------------------------------------------------------------------ renderer & scene
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.xr.enabled = true;
renderer.domElement.className = 'scene';
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.01, 60);
const CAMERA_HOME = new THREE.Vector3(0.3, 0.68, 1.4);
camera.position.copy(CAMERA_HOME);
camera.lookAt(0, 0.3, 0);

const pmrem = new THREE.PMREMGenerator(renderer);
const roomEnv = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environment = roomEnv;

const defaultLights = new THREE.Group();
const hemi = new THREE.HemisphereLight(0xffffff, 0x1d3247, 1.1);
const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(1.2, 2.5, 1.6);
defaultLights.add(hemi, sun);
scene.add(defaultLights);

// real-world lighting in AR (Android): matches Yungu's shading to the room
const xrLight = new XREstimatedLight(renderer);
xrLight.addEventListener('estimationstart', () => {
  scene.add(xrLight);
  defaultLights.visible = false;
  if (xrLight.environment) scene.environment = xrLight.environment;
});
xrLight.addEventListener('estimationend', () => {
  scene.remove(xrLight);
  defaultLights.visible = true;
  scene.environment = roomEnv;
});

const previewSet = buildPreviewSet(PLAY.previewArenaRadius);
scene.add(previewSet);
scene.background = new THREE.Color(0x050f1c);
scene.fog = new THREE.Fog(0x050f1c, 3, 7.5);

const reticle = buildReticle();
scene.add(reticle);

// ------------------------------------------------------------------ state
const joystick = new Joystick($('joystick'));
const timer = new THREE.Timer();
timer.connect(document); // pauses delta while the tab is hidden
let yungu = null;
let mode = 'idle';          // 'idle' (behind start screen) | '3d' | 'ar' | 'cam'
let placed = false;
let relocating = false;
let hitTestSource = null;
let floorY = 0;             // AR: height he glides to (guess, then detected floor, then tapped spot)
let floorFound = false;
let floorTapped = false;
let controls = null;
let arSupported = false;
let camSupported = false;   // no WebXR, but a phone with a camera: fake AR
let camFeed = null;
let gyro = null;
let camStartedAt = 0;
let statusTimer = 0;
const capture = new Capture($('btn-capture'), { onStatus: (t, ms) => setStatus(t, ms) });
const snapCam = new THREE.PerspectiveCamera();

function setStatus(text, holdMs = 0) {
  statusEl.textContent = text || '';
  clearTimeout(statusTimer);
  if (text && holdMs) statusTimer = setTimeout(() => (statusEl.textContent = ''), holdMs);
}

// ------------------------------------------------------------------ boot
(async function boot() {
  arSupported = await supportsImmersiveAR();
  camSupported = !arSupported && getPlatform().mobile && !!navigator.mediaDevices?.getUserMedia;
  try {
    yungu = await loadYungu(MODELS.play, (p) => {
      startBtn.textContent = `${T.loading} ${Math.round(p * 100)}%`;
    });
  } catch (err) {
    console.error(err);
    startBtn.textContent = 'Erro ao carregar o modelo';
    return;
  }
  scene.add(yungu.root);
  placed = true; // shown in the preview behind the start screen
  startBtn.textContent = arSupported ? T.startAR : camSupported ? T.startCam : T.start3D;
  startBtn.disabled = false;
  if (!arSupported) { startNote.textContent = camSupported ? T.camNote : T.arUnsupported; startNote.hidden = false; }
})();

startBtn.addEventListener('click', async () => {
  if (arSupported) {
    try { await startAR(); return; } catch (err) {
      console.warn(err);
      startNote.textContent = T.arError;
      startNote.hidden = false;
    }
  }
  if (camSupported) {
    const motion = requestMotionPermission(); // must be called inside the tap (iOS)
    try { await startCam(motion); return; } catch (err) {
      console.warn(err);
      startNote.textContent = T.camError;
      startNote.hidden = false;
    }
  }
  start3D();
});

// ------------------------------------------------------------------ 3D preview mode
function start3D() {
  mode = '3d';
  startEl.hidden = true;
  hud.hidden = false;
  previewSet.visible = true;
  yungu.root.position.set(0, 0, 0);
  if (!controls) {
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = 0.8;
    controls.maxDistance = 4;
    controls.maxPolarAngle = THREE.MathUtils.degToRad(84);
    controls.target.set(0, 0.3, 0);
  }
  setStatus(T.previewHelp, 5000);
}

// ------------------------------------------------------------------ camera mode (fake AR, no WebXR)
async function startCam(motionPermission) {
  camFeed = await startCameraFeed();
  gyro = (await motionPermission) ? new GyroCamera(camera) : null;
  mode = 'cam';
  placed = false; // spawned in front of the phone once the gyroscope reports
  camStartedAt = performance.now();
  startEl.hidden = true;
  hud.hidden = false;
  previewSet.visible = false;
  scene.fog = null;
  scene.background = camFeed.texture;
  camera.position.set(0, PLAY.arGuessHeight, 0);
  camFeed.video.addEventListener('resize', fitCamFeed);
  fitCamFeed();
  setStatus(T.camHelp, 6000);
}

// match the 3D camera's field of view to the visible part of the feed
function fitCamFeed() {
  const { video, texture } = camFeed;
  const visible = coverFit(texture, video, camera.aspect);
  const tanLong = Math.tan(THREE.MathUtils.degToRad(PLAY.camFov) / 2);
  const tanV = video.videoHeight >= video.videoWidth ? tanLong : tanLong * (video.videoHeight / video.videoWidth);
  camera.fov = 2 * THREE.MathUtils.radToDeg(Math.atan(tanV * visible));
  camera.updateProjectionMatrix();
}

function placeInFrontCam() {
  const fwd = camera.getWorldDirection(new THREE.Vector3()).setY(0);
  if (!gyro?.active || fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1);
  fwd.normalize();
  yungu.root.position.copy(camera.position).addScaledVector(fwd, PLAY.arSpawnDistance).setY(0);
  if (!gyro?.active) camera.lookAt(yungu.root.position); // no gyroscope: fixed view looking at him
  yungu.velocity.set(0, 0, 0);
  yungu.faceTowards(camera.position);
  placed = true;
}

// ------------------------------------------------------------------ AR mode (WebXR)
async function startAR() {
  const session = await navigator.xr.requestSession('immersive-ar', {
    requiredFeatures: ['hit-test'],
    optionalFeatures: ['dom-overlay', 'light-estimation', 'local-floor', 'camera-access'],
    domOverlay: { root: hud },
  });
  mode = 'ar';
  placed = false; // spawned in front of the phone on the first AR frame
  relocating = false;
  floorFound = false;
  floorTapped = false;
  scene.remove(yungu.root);
  previewSet.visible = false;
  scene.background = null;
  scene.fog = null;

  renderer.xr.setReferenceSpaceType('local');
  await renderer.xr.setSession(session);

  startEl.hidden = true;
  hud.hidden = false;
  setStatus(T.scanFloor);

  const viewerSpace = await session.requestReferenceSpace('viewer');
  hitTestSource = await session.requestHitTestSource({ space: viewerSpace });
  session.addEventListener('select', onARSelect);
  session.addEventListener('end', onAREnd);
}

function spawnInFront(frame) {
  const viewer = frame.getViewerPose(renderer.xr.getReferenceSpace());
  if (!viewer) return;
  const m = new THREE.Matrix4().fromArray(viewer.transform.matrix);
  const camPos = new THREE.Vector3().setFromMatrixPosition(m);
  const fwd = new THREE.Vector3(0, 0, -1).transformDirection(m);
  fwd.y = 0;
  if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1);
  fwd.normalize();
  floorY = camPos.y - PLAY.arGuessHeight;
  yungu.root.position.copy(camPos).addScaledVector(fwd, PLAY.arSpawnDistance).setY(floorY);
  yungu.velocity.set(0, 0, 0);
  yungu.faceTowards(camPos);
  scene.add(yungu.root);
  placed = true;
}

// a hit counts as floor if the surface faces up
function isFloorHit(pose) {
  const { x, z } = pose.transform.orientation;
  return 1 - 2 * (x * x + z * z) > 0.9; // y component of the surface's up axis
}

function onARSelect() {
  if (!(reticle.visible && relocating)) return;
  const pos = new THREE.Vector3();
  reticle.matrix.decompose(pos, new THREE.Quaternion(), new THREE.Vector3());
  yungu.root.position.copy(pos);
  yungu.velocity.set(0, 0, 0);
  const camPos = new THREE.Vector3();
  renderer.xr.getCamera().getWorldPosition(camPos);
  yungu.faceTowards(camPos);
  floorY = pos.y;
  floorTapped = true; // player chose the surface (e.g. a table): stop auto floor tracking
  relocating = false;
  reticle.visible = false;
  setStatus(T.placed, 3500);
}

function onAREnd() {
  hitTestSource = null;
  mode = 'idle';
  reticle.visible = false;
  hud.hidden = true;
  startEl.hidden = false;
  previewSet.visible = true;
  scene.background = new THREE.Color(0x050f1c);
  scene.fog = new THREE.Fog(0x050f1c, 3, 7.5);
  yungu.root.position.set(0, 0, 0);
  yungu.faceTowards(CAMERA_HOME);
  if (!yungu.root.parent) scene.add(yungu.root);
  placed = true;
  camera.position.copy(CAMERA_HOME);
  camera.lookAt(0, 0.3, 0);
  onResize();
}

// ------------------------------------------------------------------ HUD buttons
for (const el of hud.querySelectorAll('button')) {
  el.addEventListener('beforexrselect', (e) => e.preventDefault()); // button taps are not floor taps
}
$('btn-exit').addEventListener('click', () => {
  const session = renderer.xr.getSession();
  if (session) session.end();
  else window.location.href = './';
});
$('btn-wave').addEventListener('click', () => yungu?.wave());
$('btn-bigger').addEventListener('click', () => yungu?.setScale(yungu.scale * PLAY.scaleStep));
$('btn-smaller').addEventListener('click', () => yungu?.setScale(yungu.scale / PLAY.scaleStep));
$('btn-relocate').addEventListener('click', () => {
  if (mode === 'ar') {
    // bring him back in front of the phone and re-detect the floor; a tap on a surface moves him there
    placed = false;
    floorFound = false;
    floorTapped = false;
    relocating = true;
    setStatus(T.relocate, 5000);
  } else if (mode === 'cam') {
    placed = false; // re-spawned in front of the phone on the next frame
  } else if (yungu) {
    const delta = new THREE.Vector3().sub(yungu.root.position);
    yungu.root.position.set(0, 0, 0);
    if (controls) { camera.position.add(delta); controls.target.add(delta); }
  }
});

// ------------------------------------------------------------------ loop
renderer.setAnimationLoop((time, frame) => {
  timer.update(time);
  const dt = timer.getDelta();

  if (mode === 'ar' && frame && hitTestSource) {
    if (!placed) spawnInFront(frame);
    const looking = relocating || !floorTapped;
    const hits = looking ? frame.getHitTestResults(hitTestSource) : [];
    const pose = hits.length ? hits[0].getPose(renderer.xr.getReferenceSpace()) : null;
    reticle.visible = relocating && !!pose;
    if (reticle.visible) reticle.matrix.fromArray(pose.transform.matrix);
    if (pose && !floorTapped && isFloorHit(pose)) {
      // ponytail: first upward surface wins, lower ones replace it (table → floor under it).
      // A table seen before the floor is used until the floor shows up.
      const y = pose.transform.position.y;
      if (!floorFound || y < floorY - 0.1) floorY = y;
      if (!floorFound && !relocating) setStatus(T.placed, 3500);
      floorFound = true;
    }
    reticle.material.opacity = 0.65 + 0.3 * Math.sin(time / 180);
  }

  if (mode === 'cam') {
    gyro?.update();
    if (!placed && (gyro?.active || performance.now() - camStartedAt > 1000)) placeInFrontCam();
  }

  if (yungu && placed) {
    const driving = mode === '3d' || mode === 'ar' || mode === 'cam';
    const input = driving ? joystick.read() : { x: 0, y: 0, magnitude: 0 };
    if (driving && joystick.wavePressed()) yungu.wave();
    const cam = mode === 'ar' ? renderer.xr.getCamera() : camera;
    const before = yungu.root.position.clone();
    yungu.update(dt, input, cam, mode === '3d' ? PLAY.previewArenaRadius : 0);
    if (mode === 'ar') yungu.root.position.y = THREE.MathUtils.damp(yungu.root.position.y, floorY, 3, dt);

    if (mode === '3d' && controls) {
      // camera follows Yungu, keeping the orbit the player chose
      const delta = yungu.root.position.clone().sub(before);
      camera.position.add(delta);
      controls.target.add(delta);
      controls.update();
    }
    if (mode === 'idle') {
      // slow showcase turn behind the start screen
      yungu.root.rotation.y = yungu.yaw = Math.sin(time / 2600) * 0.5;
    }
    if (input.magnitude > 0.2 && statusEl.textContent === T.placed) setStatus('');
    if (input.magnitude > 0.2 && relocating) { relocating = false; setStatus(''); }
  }

  renderer.render(scene, camera);
  if (capture.wanted) renderCapture(frame);
});

// Captures render into an offscreen target and read the pixels back, so they never depend on
// the page canvas (in AR it isn't composited and comes back empty). In AR the phone camera
// image is the background (needs 'camera-access', else black).
// ponytail: no MSAA (three skips the resolve on XR-flagged targets), so captures are a bit aliased
const capTarget = new THREE.WebGLRenderTarget(1, 1);
capTarget.isXRRenderTarget = true; // three then applies tone mapping + sRGB encoding, same as on screen
capTarget.texture.colorSpace = THREE.SRGBColorSpace;
capTarget.texture.internalFormat = 'RGBA8'; // store the shader's sRGB bytes as-is (SRGB8 would encode twice)
const capCanvas = document.createElement('canvas');
const capCtx = capCanvas.getContext('2d');
const capSize = new THREE.Vector2();
let capPixels = null;

function renderCapture(frame) {
  renderer.getDrawingBufferSize(capSize);
  const k = capture.scale(capSize.x, capSize.y);
  const w = Math.round((capSize.x * k) / 2) * 2;
  const h = Math.round((capSize.y * k) / 2) * 2;
  if (!w || !h) return;
  if (capCanvas.width !== w || capCanvas.height !== h) {
    capTarget.setSize(w, h);
    capCanvas.width = w;
    capCanvas.height = h;
    capPixels = new Uint8Array(w * h * 4);
  }

  let cam = camera;
  if (mode === 'ar' && frame) {
    const view = frame.getViewerPose(renderer.xr.getReferenceSpace())?.views[0];
    const camTex = view?.camera ? renderer.xr.getCameraTexture(view.camera) : null;
    if (camTex) camTex.colorSpace = THREE.SRGBColorSpace;
    const xrCam = renderer.xr.getCamera().cameras[0];
    xrCam.matrixWorld.decompose(snapCam.position, snapCam.quaternion, snapCam.scale);
    snapCam.projectionMatrix.copy(xrCam.projectionMatrix);
    snapCam.projectionMatrixInverse.copy(xrCam.projectionMatrixInverse);
    scene.background = camTex || new THREE.Color(0x000000);
    cam = snapCam;
  }

  const prevTarget = renderer.getRenderTarget(); // in AR: the XR layer, which three re-binds every frame
  const xrOn = renderer.xr.enabled;
  renderer.xr.enabled = false;
  renderer.setRenderTarget(capTarget);
  renderer.render(scene, cam);
  // ponytail: synchronous readback stalls the GPU a bit; readRenderTargetPixelsAsync if video stutters
  renderer.readRenderTargetPixels(capTarget, 0, 0, w, h, capPixels);
  renderer.setRenderTarget(prevTarget);
  renderer.xr.enabled = xrOn;
  if (mode === 'ar') scene.background = null;

  // GL rows are bottom-up: flip while copying into the 2D canvas
  const img = capCtx.createImageData(w, h);
  const row = w * 4;
  for (let y = 0; y < h; y++) img.data.set(capPixels.subarray((h - 1 - y) * row, (h - y) * row), y * row);
  capCtx.putImageData(img, 0, 0);
  capture.frame(capCanvas);
}

function onResize() {
  if (renderer.xr.isPresenting) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (mode === 'cam') fitCamFeed();
}
window.addEventListener('resize', onResize);

// ------------------------------------------------------------------ scene pieces
function buildReticle() {
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0xbff040, transparent: true, opacity: 0.9, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.085, 0.105, 48).rotateX(-Math.PI / 2), mat);
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.018, 24).rotateX(-Math.PI / 2), mat);
  group.add(ring, dot);
  // a Mesh-like wrapper so the loop can use .matrix / .material directly
  const reticle = new THREE.Group();
  reticle.add(group);
  reticle.material = mat;
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  return reticle;
}

function buildPreviewSet(radius) {
  const group = new THREE.Group();
  const size = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, '#16324a');
  grd.addColorStop(0.7, '#0b1d2f');
  grd.addColorStop(1, '#050f1c');
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  // grid
  const cells = 16;
  g.lineWidth = 2;
  for (let i = 0; i <= cells; i++) {
    const p = (i / cells) * size;
    g.strokeStyle = 'rgba(191, 240, 64, 0.10)';
    g.beginPath(); g.moveTo(p, 0); g.lineTo(p, size); g.stroke();
    g.beginPath(); g.moveTo(0, p); g.lineTo(size, p); g.stroke();
  }
  // fade the grid out towards the edge
  const fade = g.createRadialGradient(size / 2, size / 2, size * 0.25, size / 2, size / 2, size / 2);
  fade.addColorStop(0, 'rgba(5,15,28,0)');
  fade.addColorStop(1, 'rgba(5,15,28,1)');
  g.fillStyle = fade;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(radius + 1.5, 96).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ map: tex, color: 0x5d7286, roughness: 0.92, metalness: 0, envMapIntensity: 0.25 }),
  );
  group.add(floor);
  // arena edge
  const edge = new THREE.Mesh(
    new THREE.RingGeometry(radius - 0.01, radius + 0.01, 128).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xbff040, transparent: true, opacity: 0.25 }),
  );
  edge.position.y = 0.001;
  group.add(edge);
  return group;
}
