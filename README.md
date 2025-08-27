# Voyager Boilerplate (DigitalOcean App Platform + Spaces)

This repo is a minimal, production-friendly boilerplate to host Smithsonian **Voyager** as a static site on **DigitalOcean App Platform**, with your 3D models stored in **DigitalOcean Spaces (CDN)**.

Out of the box, `index.html` loads a verified Smithsonian sample scene so you can confirm the deployment works immediately. Then switch the viewer to your own Space URLs.

---

## 1) Deploy this repo
1. Push this repo to GitHub.
2. In DigitalOcean, go to **Apps → Create App** and connect this repo.
3. App Platform should detect a **Static Site**. Deploy on the Starter/Free plan.
4. Visit your site URL: you should see the Voyager viewer and the Smithsonian sample scene.

---

## 2) Point Voyager to your DigitalOcean Space
Create a Space with CDN enabled and upload your scene files, e.g.:

```
voyager-scene/
├─ document.json           # Voyager SVX scene
├─ model.glb               # your model(s)
└─ textures/...            # optional
```

Make these files public. Note the CDN base URL, e.g.
```
https://YOUR-SPACE.nyc3.cdn.digitaloceanspaces.com/voyager-scene/
```

Edit `index.html` and replace the `<voyager-explorer>` block with:

```html
<voyager-explorer
  root="https://YOUR-SPACE.nyc3.cdn.digitaloceanspaces.com/voyager-scene/"
  document="document.json">
</voyager-explorer>
<script src="https://3d-api.si.edu/resources/js/voyager-explorer.min.js"></script>
```

Commit and push; App Platform will redeploy automatically.

---

## 3) If you don't have a Voyager scene yet
Voyager expects a JSON scene (SVX). If you only have a raw `.glb`, you can start with a minimal `document.json` like:

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

Save that as `document.json` **in your Space** next to `model.glb`. Then set `root` to the folder containing both files.

> Tip: Use `.glb` (binary glTF) for best loading performance and file size.

---

## 4) Common gotchas
- **Blank viewer**: usually means the `document.json` URL is wrong or inaccessible. Paste the full URL in your browser to confirm it's public and returns JSON.
- **CORS issues**: ensure the Space is public and CDN is enabled. DigitalOcean handles CORS for public assets via CDN.
- **Slow loads**: compress to `.glb`, reduce texture sizes, set long cache headers in Spaces.

---

## 5) Customization
- Add your CSS in `css/style.css`
- Add additional HTML pages or a gallery grid that routes different scenes via query params.

Enjoy!
