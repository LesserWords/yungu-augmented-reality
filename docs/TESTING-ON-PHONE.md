# Testing on a phone

AR only runs on **HTTPS** pages (or `localhost`). Pick one of these.

## Option A — Android over USB (easiest, real `localhost`)

1. On the phone: enable **Developer options → USB debugging** and connect it to the computer.
2. `npm run dev`
3. In Chrome on the computer open `chrome://inspect/#devices` → **Port forwarding** → add `5173` → `localhost:5173` → enable.
4. On the phone open Chrome at `http://localhost:5173` (counts as secure, AR works).

## Option B — same Wi-Fi with a local certificate

1. `npm run dev:phone` (HTTPS with a self-signed certificate)
2. Open the **Network** address it prints (e.g. `https://192.168.0.12:5173`) on the phone.
3. Accept the certificate warning (“Advanced → Proceed”).

If the AR button doesn't appear in this mode, use option A, C or D. Some browsers treat self-signed certificates as not secure enough for AR.

## Option C — public tunnel (works for iPhone too)

```bash
npm run dev
npx cloudflared tunnel --url http://localhost:5173
```
Open the `https://….trycloudflare.com` address it prints on any phone. You can also encode it as a QR on `/tools/qr.html` to scan it quickly.

## Option D — deploy a preview

Push to Netlify / Vercel (see `DEPLOY.md`). Every deploy gets an HTTPS URL.

---

## What to check

**iPhone (Safari)**
- [ ] “Ver no meu espaço” opens AR Quick Look and Yungu appears hovering (animation playing)
- [ ] Pinch to resize, drag to move, two-finger rotate
- [ ] “Jogar em 3D” opens the 3D joystick mode

**Android (Chrome, ARCore-compatible phone)**
- [ ] “Ver no meu espaço” places Yungu on the floor
- [ ] “Jogar com joystick” → camera opens, lime ring appears on the floor, tap places Yungu
- [ ] Joystick moves him relative to where you point the phone; wave and +/− work
- [ ] Reposition button lets you place him somewhere else
- [ ] × leaves AR and returns to the start screen

ARCore device list: <https://developers.google.com/ar/devices>
