// Small device / capability helpers.

export function getPlatform() {
  const ua = navigator.userAgent || '';
  // iPadOS reports itself as Mac; touch points give it away
  const iOS = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
  const android = /Android/i.test(ua);
  return { iOS, android, mobile: iOS || android };
}

// true when the browser can run a WebXR AR session (Android Chrome today)
export async function supportsImmersiveAR() {
  try {
    return !!(navigator.xr && (await navigator.xr.isSessionSupported('immersive-ar')));
  } catch {
    return false;
  }
}
