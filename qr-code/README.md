# QR code files

Generated QR artwork. Current files point to the GitHub Pages site:

| Files | Opens |
|---|---|
| `yungu-qr-landing-*` | https://lesserwords.github.io/yungu-augmented-reality/ (view in my space) |
| `yungu-qr-play-*` | https://lesserwords.github.io/yungu-augmented-reality/play.html (joystick mode) |

Regenerate when the URL changes (`--name` picks the file prefix):

```bash
npm run qr -- https://your-domain.com/yungu          # SVG card + plain SVG
npm run qr -- https://your-domain.com/yungu --utm    # same, with UTM tracking
npm run qr -- https://your-domain.com/yungu/play.html --name play   # yungu-qr-play-*
```

For PNG files and an automatic scan test, use the browser tool: `npm run dev`, then open `/tools/qr.html`.

- `*-card.svg`: navy card with caption, for print
- `*-plain.svg`: QR only, to place inside your own layout (keep it on a light background)
- `*-url.txt`: the URL the QR opens
