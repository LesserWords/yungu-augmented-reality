# QR code files

Generated QR artwork goes here. Nothing is here yet because the final site address isn't decided.

Generate once you know the final URL:

```bash
npm run qr -- https://your-domain.com/yungu          # SVG card + plain SVG
npm run qr -- https://your-domain.com/yungu --utm    # same, with UTM tracking
```

For PNG files and an automatic scan test, use the browser tool: `npm run dev`, then open `/tools/qr.html`.

- `yungu-qr-card.svg`: navy card with caption, for print
- `yungu-qr-plain.svg`: QR only, to place inside your own layout (keep it on a light background)
