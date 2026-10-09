// Central settings for the Yungu AR experience. Change values here, not inside the pages.

export const MODELS = {
  // Android / desktop viewer + Scene Viewer (Hover clip only)
  viewer: 'models/yungu.glb',
  // iPhone / iPad AR Quick Look
  ios: 'models/yungu.usdz',
  // Joystick mode (clips: Hover, Idle, Wave, Blink)
  play: 'models/yungu-play.glb',
};

// Address the landing page QR opens (desktop visitors scan it to continue on a phone)
export const SITE_URL = 'https://lesserwords.github.io/yungu-augmented-reality/';

export const BRAND = {
  navy: '#040c18',
  navy2: '#0b1b2e',
  lime: '#bff040',
  limeDeep: '#5fb000',
  white: '#ffffff',
};

// Joystick mode tuning. Model file is ~0.59 m tall (scale 1).
export const PLAY = {
  startScale: 1.0,       // size multiplier when placed
  minScale: 0.35,
  maxScale: 2.5,
  scaleStep: 1.25,       // each +/- tap multiplies/divides by this
  speed: 0.7,            // metres per second at full stick (x scale)
  accel: 6,              // how fast he reaches target speed (higher = snappier)
  turn: 8,               // how fast he turns to face the movement direction
  maxLean: 0.22,         // radians of forward lean at full speed
  maxBank: 0.18,         // radians of side tilt while turning
  previewArenaRadius: 3, // metres, desktop/iPhone 3D preview floor
  arSpawnDistance: 1.2,  // metres in front of the phone where he appears when AR starts
  arGuessHeight: 1.4,    // assumed phone height above the floor until the real floor is found
  hoverPeriod: 3.0,      // seconds, must match the Hover clip length

  // glow pulse: intensity = base * (1 - swing * height), height -1 (low) .. +1 (high)
  glow: {
    M_Glow_Lime:    { base: 2.0, swing: 0.45 },
    M_Body_Glow:    { base: 1.4, swing: 0.65 },
    M_Ground_Glow:  { base: 1.5, swing: 0.60 },
    M_Chest_Screen: { base: 1.6, swing: 0.30 },
    M_Antenna_Lime: { base: 0.35, swing: 0.80 },
  },
  moveGlowBoost: 0.35,   // extra glow while moving at full speed
};
