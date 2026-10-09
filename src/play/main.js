// Joystick mode.
//  - Android Chrome: WebXR AR session -> find the floor, tap to place, drive with the joystick.
//  - iPhone / desktop / no AR: same controls in a 3D preview scene (also handy for development).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { XREstimatedLight } from 'three/addons/webxr/XREstimatedLight.js';
import './play.css';
import { MODELS, PLAY } from '../shared/config.js';
import { STRINGS } from '../shared/strings.js';
import { supportsImmersiveAR } from '../shared/device.js';
import { Joystick } from './joystick.js';
import { loadYungu } from './yungu.js';

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
let mode = 'idle';          // 'idle' (behind start screen) | '3d' | 'ar'
let placed = false;
let relocating = false;
let hitTestSource = null;
let controls = null;
let arSupported = false;
let statusTimer = 0;

function setStatus(text, holdMs = 0) {
  statusEl.textContent = text || '';
  clearTimeout(statusTimer);
  if (text && holdMs) statusTimer = setTimeout(() => (statusEl.textContent = ''), holdMs);
}

// ------------------------------------------------------------------ boot
(async function boot() {
  arSupported = await supportsImmersiveAR();
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
  startBtn.textContent = arSupported ? T.startAR : T.start3D;
  startBtn.disabled = false;
  if (!arSupported) { startNote.textContent = T.arUnsupported; startNote.hidden = false; }
})();

startBtn.addEventListener('click', async () => {
  if (arSupported) {
    try { await startAR(); return; } catch (err) {
      console.warn(err);
      startNote.textContent = T.arError;
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
  hud.classList.remove('placing');
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

// ------------------------------------------------------------------ AR mode (WebXR)
async function startAR() {
  const session = await navigator.xr.requestSession('immersive-ar', {
    requiredFeatures: ['hit-test'],
    optionalFeatures: ['dom-overlay', 'light-estimation', 'local-floor'],
    domOverlay: { root: hud },
  });
  mode = 'ar';
  placed = false;
  relocating = false;
  scene.remove(yungu.root);
  previewSet.visible = false;
  scene.background = null;
  scene.fog = null;

  renderer.xr.setReferenceSpaceType('local');
  await renderer.xr.setSession(session);

  startEl.hidden = true;
  hud.hidden = false;
  hud.classList.add('placing');
  setStatus(T.scanFloor);

  const viewerSpace = await session.requestReferenceSpace('viewer');
  hitTestSource = await session.requestHitTestSource({ space: viewerSpace });
  session.addEventListener('select', onARSelect);
  session.addEventListener('end', onAREnd);
}

function onARSelect() {
  if (!(reticle.visible && (!placed || relocating))) return;
  const pos = new THREE.Vector3();
  reticle.matrix.decompose(pos, new THREE.Quaternion(), new THREE.Vector3());
  yungu.root.position.copy(pos);
  yungu.velocity.set(0, 0, 0);
  const camPos = new THREE.Vector3();
  renderer.xr.getCamera().getWorldPosition(camPos);
  yungu.faceTowards(camPos);
  if (!yungu.root.parent) scene.add(yungu.root);
  placed = true;
  relocating = false;
  reticle.visible = false;
  hud.classList.remove('placing');
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
    relocating = true;
    hud.classList.add('placing');
    setStatus(T.relocate);
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
    const looking = !placed || relocating;
    const hits = looking ? frame.getHitTestResults(hitTestSource) : [];
    if (hits.length) {
      const pose = hits[0].getPose(renderer.xr.getReferenceSpace());
      reticle.visible = true;
      reticle.matrix.fromArray(pose.transform.matrix);
      if (statusEl.textContent === T.scanFloor) setStatus(T.tapToPlace);
    } else {
      reticle.visible = false;
    }
    reticle.material.opacity = 0.65 + 0.3 * Math.sin(time / 180);
  }

  if (yungu && placed) {
    const driving = mode === '3d' || mode === 'ar';
    const input = driving ? joystick.read() : { x: 0, y: 0, magnitude: 0 };
    if (driving && joystick.wavePressed()) yungu.wave();
    const cam = mode === 'ar' ? renderer.xr.getCamera() : camera;
    const before = yungu.root.position.clone();
    yungu.update(dt, input, cam, mode === '3d' ? PLAY.previewArenaRadius : 0);

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
  }

  renderer.render(scene, camera);
});

function onResize() {
  if (renderer.xr.isPresenting) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
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
