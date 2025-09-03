# Voyager Gallery (Collections-style)

A minimal gallery + viewer that mimics the Smithsonian 3D Collections UX.

## Quick Start
1. Deploy as a static site (DigitalOcean App Platform, Netlify, Vercel, etc.).
2. Open `index.html` — two Smithsonian samples should work out of the box.
3. Edit `catalog/catalog.json` and replace the `your-space-example` entry with your DigitalOcean Spaces CDN URLs.

## DigitalOcean Spaces Setup (CORS + MIME)
- Public objects: make sure `scene.svx.json`, `.glb`, and thumbnail are public.
- Use CDN endpoint: `https://YOUR-SPACE.nyc3.cdn.digitaloceanspaces.com/...`
- CORS (Space → Settings → CORS):
  - Allowed Origins: `*` (for testing), then restrict to your domain.
  - Allowed Methods: `GET, HEAD, OPTIONS`
  - Allowed Headers: `*`
- MIME types:
  - `scene.svx.json` → `application/json`
  - `.glb` → `model/gltf-binary`
