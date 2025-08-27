# 3D Ceramics – Voyager Boilerplate (DigitalOcean App Platform + Spaces)

This repo is wired for DigitalOcean **App Platform** (static site) and **Spaces + CDN** for 3D assets.

Out of the box, `index.html` loads a Smithsonian sample scene so you can verify deployment immediately. Then point it at your own Space.

## Deploy
1. Push this repo to GitHub (replace existing contents if needed).
2. In DigitalOcean: **Apps → Create App** → connect this repo.
3. App Platform should detect a **Static Site**. Deploy (Starter/Free plan is fine).
4. Visit your URL — you should see the sample model in Voyager.

## Use Your Own Models
1. Create a **DigitalOcean Space** with CDN enabled.
2. Upload your Voyager scene files, e.g.
```
voyager-scene/
├─ document.json        # Voyager SVX scene
├─ model.glb            # your model(s)
└─ textures/...         # optional
```
3. Make files public. Note the CDN base URL, e.g.
```
https://YOUR-SPACE.nyc3.cdn.digitaloceanspaces.com/voyager-scene/
```
4. Edit `index.html` and replace the viewer block with your Space path:
```html
<voyager-explorer
  root="https://YOUR-SPACE.nyc3.cdn.digitaloceanspaces.com/voyager-scene/"
  document="document.json">
</voyager-explorer>
<script src="https://3d-api.si.edu/resources/js/voyager-explorer.min.js"></script>
```
5. Commit and push to redeploy.

## Minimal `document.json` (if you only have a GLB)

```json
{
  "version": "1.0",
  "name": "Simple GLB Scene",
  "models": [
    {
      "id": "model",
      "src": "model.glb",
      "transform": { "position": [0,0,0], "scale": [1,1,1], "rotation": [0,0,0] }
    }
  ],
  "camera": { "position": [0, 0, 2], "target": [0, 0, 0] }
}
```

Save as `document.json` in your Space next to `model.glb` and set `root` to that folder.

## Notes & Gotchas
- Blank viewer → wrong/missing `document.json` or not public. Paste the full URL in your browser to test.
- CORS → ensure the Space is public and using CDN endpoint.
- Performance → prefer `.glb`, optimize textures, and set long cache TTLs.

