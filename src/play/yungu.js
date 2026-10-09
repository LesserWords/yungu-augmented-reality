// Yungu character: loads the GLB, plays clips, moves with the joystick,
// leans into movement and pulses its glow with the hover bob.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PLAY } from '../shared/config.js';

const UP = new THREE.Vector3(0, 1, 0);
const TAU = Math.PI * 2;
const damp = (current, target, rate, dt) => current + (target - current) * (1 - Math.exp(-rate * dt));
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export async function loadYungu(url, onProgress) {
  const gltf = await new GLTFLoader().loadAsync(url, (e) => {
    if (onProgress && e.total) onProgress(e.loaded / e.total);
  });
  return new Yungu(gltf);
}

export class Yungu {
  constructor(gltf) {
    // root  -> position on the floor, facing (yaw), user size
    //  tilt -> lean / bank around the body centre
    //   model (glTF scene, animated by the mixer)
    this.root = new THREE.Group();
    this.root.name = 'YunguRoot';
    this.tilt = new THREE.Group();
    this.model = gltf.scene;

    const PIVOT = 0.24; // body centre height (m, scale 1)
    this.tilt.position.y = PIVOT;
    this.model.position.y = -PIVOT;
    this.tilt.add(this.model);
    this.root.add(this.tilt);

    this.model.traverse((o) => {
      if (o.isMesh) o.frustumCulled = false; // skinned meshes move away from their bind bounds
    });

    // ---- glow materials
    this.glow = [];
    this.model.traverse((o) => {
      if (!o.isMesh) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        const cfg = PLAY.glow[m.name];
        if (cfg && !this.glow.some((g) => g.material === m)) this.glow.push({ material: m, ...cfg });
        if (m.transparent) m.depthWrite = false;
      }
    });

    // ---- animation
    this.mixer = new THREE.AnimationMixer(this.model);
    this.clips = Object.fromEntries(gltf.animations.map((c) => [c.name, c]));
    this.hover = this.mixer.clipAction(this.clips.Hover);
    this.hover.play();
    this.waveAction = this.clips.Wave ? this.mixer.clipAction(this.clips.Wave) : null;
    this.waving = false;
    this.mixer.addEventListener('finished', (e) => {
      if (e.action !== this.waveAction) return;
      this.hover.enabled = true;
      this.hover.setEffectiveTimeScale(1);
      this.hover.setEffectiveWeight(1);
      this.waveAction.crossFadeTo(this.hover, 0.35, false);
      this.waving = false;
    });

    // ---- floor light that follows him (lights the virtual floor in 3D mode)
    this.floorLight = new THREE.PointLight(0xb8f040, 0, 1.2, 1.6);
    this.floorLight.position.set(0, 0.05, 0);
    this.root.add(this.floorLight);

    // ---- soft contact shadow so he reads as grounded in AR
    this.shadow = makeShadow();
    this.root.add(this.shadow);

    this.velocity = new THREE.Vector3();
    this.yaw = 0;
    this.targetYaw = 0;
    this.scale = PLAY.startScale;
    this.root.scale.setScalar(this.scale);
    this.time = 0;
  }

  setScale(s) {
    this.scale = THREE.MathUtils.clamp(s, PLAY.minScale, PLAY.maxScale);
    this.root.scale.setScalar(this.scale);
  }

  faceTowards(point) {
    const d = new THREE.Vector3().subVectors(point, this.root.position);
    this.yaw = this.targetYaw = Math.atan2(d.x, d.z);
    this.root.rotation.y = this.yaw;
  }

  wave() {
    if (!this.waveAction || this.waving) return;
    this.waving = true;
    const w = this.waveAction;
    w.reset();
    w.setLoop(THREE.LoopOnce, 1);
    w.clampWhenFinished = true;
    w.enabled = true;
    w.setEffectiveTimeScale(1);
    w.setEffectiveWeight(1);
    w.play();
    this.hover.crossFadeTo(w, 0.25, false);
  }

  /**
   * @param {number} dt seconds
   * @param {{x:number,y:number,magnitude:number}} input joystick (y = forward)
   * @param {THREE.Camera} camera movement is relative to where the camera looks
   * @param {number} [arenaRadius] optional limit around the origin (3D preview)
   */
  update(dt, input, camera, arenaRadius) {
    dt = Math.min(dt, 0.05);
    this.time += dt;

    // ---- camera-relative direction on the floor plane
    const fwd = new THREE.Vector3();
    camera.getWorldDirection(fwd);
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1);
    fwd.normalize();
    const right = new THREE.Vector3().crossVectors(fwd, UP).normalize();

    const maxSpeed = PLAY.speed * this.scale;
    const desired = right.multiplyScalar(input.x).addScaledVector(fwd, input.y).multiplyScalar(maxSpeed);
    this.velocity.lerp(desired, 1 - Math.exp(-PLAY.accel * dt));
    this.root.position.addScaledVector(this.velocity, dt);

    if (arenaRadius) {
      const p = this.root.position;
      const r = Math.hypot(p.x, p.z);
      if (r > arenaRadius) { p.x *= arenaRadius / r; p.z *= arenaRadius / r; }
    }

    // ---- turn to face movement, lean forward, bank into turns
    const speed = this.velocity.length();
    const speed01 = THREE.MathUtils.clamp(speed / maxSpeed, 0, 1);
    if (speed > 0.03 * this.scale) this.targetYaw = Math.atan2(this.velocity.x, this.velocity.z);
    const turnDelta = wrapAngle(this.targetYaw - this.yaw);
    this.yaw += turnDelta * (1 - Math.exp(-PLAY.turn * dt));
    this.root.rotation.y = this.yaw;

    this.tilt.rotation.x = damp(this.tilt.rotation.x, speed01 * PLAY.maxLean, 6, dt);
    const bank = THREE.MathUtils.clamp(-turnDelta * 0.5, -1, 1) * PLAY.maxBank * speed01;
    this.tilt.rotation.z = damp(this.tilt.rotation.z, bank, 6, dt);

    // ---- animation + glow pulse synced to the hover bob
    this.mixer.update(dt);
    const period = this.clips.Hover?.duration || PLAY.hoverPeriod;
    const height = Math.sin((TAU * this.hover.time) / period); // +1 top, -1 bottom
    const boost = 1 + PLAY.moveGlowBoost * speed01;
    for (const g of this.glow) {
      g.material.emissiveIntensity = g.base * (1 - g.swing * height) * boost;
    }
    this.floorLight.intensity = (0.6 - 0.35 * height) * boost * this.scale * this.scale;
    const s = 1 - 0.18 * height;
    this.shadow.scale.set(s, s, s);
    this.shadow.material.opacity = 0.32 * (1 - 0.3 * height);
  }
}

function makeShadow() {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, 'rgba(0,0,0,0.85)');
  grd.addColorStop(0.45, 'rgba(0,0,0,0.35)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.42, 0.34),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.32 }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.002;
  mesh.renderOrder = -1;
  return mesh;
}
