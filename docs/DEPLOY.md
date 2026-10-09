# Deploying

`npm run build` creates a static site in `dist/`. Paths are relative, so it works on a domain root (`yungu.com.br`) or in a sub-folder (`kero.com.br/yungu/`).

**Before printing any QR code, lock the final address.** Use a URL you control and can redirect later (e.g. `seudominio.com/yungu`). The printed code can't change, but you can change where that address points.

## Netlify (recommended, free)
1. Push this folder to GitHub.
2. Netlify → *Add new site → Import from Git* → pick the repo. `netlify.toml` already sets the build.
3. Add your domain under *Domain settings*. HTTPS is automatic.
4. `public/_headers` sends the right MIME types for `.usdz` and `.glb`.

## GitHub Pages (free)
1. Move `docs/github-pages-deploy.yml` to `.github/workflows/deploy.yml`. It's kept in `docs/` only because it couldn't be written into `.github/` remotely.
   ```powershell
   mkdir .github\workflows; move docs\github-pages-deploy.yml .github\workflows\deploy.yml
   ```
2. Create a repo on GitHub and push this folder to the `main` branch.
3. On GitHub: **Settings → Pages → Source: GitHub Actions**.
4. Every push to `main` runs `.github/workflows/deploy.yml`, which builds and publishes the site. Progress shows under the **Actions** tab.
5. Your site address: `https://<your-user>.github.io/<repo-name>/`. HTTPS is automatic, and relative paths make the sub-folder work.
6. Custom domain (recommended for the QR): Settings → Pages → *Custom domain*, then add the DNS record GitHub shows you. Tick **Enforce HTTPS**.

Notes:
- GitHub Pages ignores `_headers` / `.htaccess`. It sets MIME types from its own list (mime-db), which already includes `.usdz` and `.glb`. To confirm after the first deploy: `curl -I https://<site>/models/yungu.usdz` should show `content-type: model/vnd.usdz+zip`.
- Free GitHub Pages needs a **public** repo (private repos need a paid plan). The 3D sources and media in this repo would then be public too. If that's a problem, keep this repo private and deploy with Netlify/Vercel, which also deploy from private repos for free.

## Vercel
Import the repo. `vercel.json` sets the build and the MIME headers.

## Cloudflare Pages
Build command `npm run build`, output `dist`. `_headers` is supported.

## Your own server / cPanel / WordPress hosting
1. `npm run build`
2. Upload the **contents** of `dist/` to a folder, e.g. `public_html/yungu/`.
3. `.htaccess` (included in `dist/`) registers the `.usdz` / `.glb` types on Apache.
4. If you use WordPress, upload outside the WordPress media library. WordPress blocks `.usdz` uploads by default, and a separate folder avoids that.

## After deploying
- [ ] Open the site on an iPhone and an Android phone (checklist in `TESTING-ON-PHONE.md`)
- [ ] Update `og:image` in `index.html` to the absolute URL (e.g. `https://seudominio.com/yungu/img/og-image.jpg`) so link previews show the image
- [ ] Generate the QR with the final URL (`/tools/qr.html` or `npm run qr -- <url>`) and scan-test the printed proof
