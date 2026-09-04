# 🍃 LeafForge Studio

**Upload a Blockbench `.bbmodel`, play its animations, drop it into a picture, and export a
scroll-stopping thumbnail, GIF or transparent overlay.**

LeafForge Studio is a ccLeaf-style animation & thumbnail studio that runs entirely on-device —
as a web app, a PWA, or the Android APK committed at the root of this repository
([`LeafForge-Studio.apk`](./LeafForge-Studio.apk)).

**🌐 Live site: <https://dyna273.github.io/ccleafapp/>** — published automatically by
[`.github/workflows/deploy-pages.yml`](./.github/workflows/deploy-pages.yml) on every push to
`main`. It is a static site, so there is no backend, no account and no telemetry: everything you
make stays on your device.

```
┌────────────────────────────────────────────────────────────────────────┐
│  Model         Scene          Design        Layers  │   Inspect/Export  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐          │                   │
│  │ .bbmodel │  │ backdrop │  │ templates│          │   layer props,    │
│  │ playback │  │ lighting │  │ + layers │          │   animation,      │
│  │ placement│  │ camera   │  │          │          │   PNG/WebM/GIF    │
│  └──────────┘  └──────────┘  └──────────┘          │                   │
│        ┌────────────────────────────────────┐      │                   │
│        │        live 3D + 2D composite      │      │                   │
│        └────────────────────────────────────┘      │                   │
│        ▶ ──────────●───────────── 1.20 / 3.00s     │                   │
└────────────────────────────────────────────────────────────────────────┘
```

---

## What it does

### Model
- **Upload any `.bbmodel`** — drag it onto the viewport, or use the file picker (on Android this
  opens the system file picker).
- Supports **Blockbench format 3.2 → 5.0**, including LZUTF8-compressed (`<lz>`) files,
  `cubes`→`elements` renames, the v3.2 Z-rotation inversion, the v4.5 `shade`→`mirror_uv`
  migration and the v5.0 keyframe value-direction change.
- Renders **cubes and meshes**, box-UV **and** per-face UV, `mirror_uv`, `uv_offset`, per-face
  `rotation`, `tintindex`, `inflate`, `render_mode` (emissive / layered) and `render_sides`.
- Minecraft face brightness is baked into vertex colours, with `NearestFilter` for the crisp
  pixel look and a smoothing toggle for HD textures.

### Animation
- Plays every animation stored in the file, with **linear / step / catmullrom / bezier**
  keyframe interpolation — bezier easing is solved with Newton-Raphson rather than the
  sample-search Blockbench uses, so it stays smooth at any frame rate.
- Scrub, play, loop, and change playback speed. The timeline drives **both** the model rig and
  the 2D overlay layers, so the whole composition animates together.

### Scene
- Backdrops: gradients, solid colours, or your own screenshot with blur, brightness,
  saturation, colour wash and vignette.
- Camera presets (three-quarter, front, back, side, top, hero, high-angle), adjustable FOV,
  orbit offsets and distance. Drag on the preview to orbit, scroll to zoom.
- Contact shadow, ground plane, and a cartoon outline for the model.
- Studio / Minecraft-flat / unlit lighting presets with exposure.

### Thumbnail design
- **Eight one-click templates** (Gaming Impact, Minecraft Sky, Neon Nights, Versus, Stat Card,
  Reveal, Shorts/Reels, Speedrun HUD) that set the backdrop, layers, camera and canvas size.
- Text layers with Google display fonts (Anton, Bebas Neue, Luckiest Guy), gradient fills,
  outlines, 3D extrude, drop shadows, letter spacing, multi-line and **arced text**.
- Shapes: burst, star, arrow, rounded rect, circle, ring, triangle, underline bar, blob.
- Image/logo layers with drop shadows.
- **20 motion-graphics presets** per layer — pop, slam, bounce-in, slides, typewriter, flip,
  spin, shake, pulse, wobble, glitch, tracking — each with delay, duration, intensity and
  optional looping. This is the ccLeaf "pick an animation, customise it, export it" loop.

### Export
| Format | Notes |
| --- | --- |
| **PNG** | Current frame, at half / native / 2× supersampled resolution |
| **WebM** | VP9 or VP8, 12–60 fps, up to 15 s, **transparent background** option |
| **MP4** | H.264 where the browser supports it |
| **GIF** | Self-contained encoder (median-cut palette + LZW), 240–960 px wide |
| **Project** | `.leafforge.json` — layers, backdrop **and the model itself** |

Exports land in `Downloads/LeafForge` on Android (via MediaStore) and in the browser's
downloads folder on desktop.

### Canvas sizes
1280×720 (YouTube thumbnail), 1920×1080, 2560×1440, 3840×2160, 1080×1080, 1080×1920 (Shorts),
or any custom size.

---

## Quick start (web / development)

```bash
npm install
npm run dev          # http://localhost:5173
```

Other commands:

```bash
npm run build            # production web build (dist/)
npm run preview          # serve the production build
npm run verify           # typecheck + all three verification suites
npm run samples          # regenerate the bundled sample models
npm run icons            # regenerate PWA + Android launcher icons
npm run apk              # build the signed APK (see below)
```

## Deploying the web app

`dist/` is a self-contained static site — drop it on any host (Netlify, Vercel, Cloudflare Pages,
S3, a Raspberry Pi) and it just works, including from a subdirectory, because every asset URL is
relative (`base: './'`).

This repo publishes itself to **GitHub Pages** via
[`.github/workflows/deploy-pages.yml`](./.github/workflows/deploy-pages.yml), which runs
`npm ci && npm run build` and deploys `dist/` to `https://<owner>.github.io/<repo>/`.

**One-time setup** (repo owner):

1. *Settings → Pages → Build and deployment → Source* → pick **GitHub Actions**.
2. Push to `main` (or run the workflow manually from the Actions tab).

The first successful run prints the live URL on the `github-pages` environment. Pushes to
`arena/**` deploy too, so a feature branch can be previewed before merging.

Because the app ships a manifest and a service worker, visitors can install it from Pages as a
PWA and then use it with no connection.

## Android APK

The APK at the root of this repo is **committed and installable**. Install it with
`adb install -r LeafForge-Studio.apk`, or just open the file on your phone
(allow installs from unknown sources for your browser/files app).

```bash
npm run build:apk-assets   # single-file web bundle -> android/app/src/main/assets
npm run apk                # -> LeafForge-Studio.apk
```

**This project does not use the Android SDK or Gradle.** The APK is produced by the standalone
tools in `~/.toolchain`:

```
aapt2 (compile + link, with -A assets)
  -> ecj  (Java 8 source/target, bootclasspath = android.jar)
    -> d8 (dex, --min-api 24)
      -> zip classes.dex into res.apk
        -> keytool (RSA 2048 keystore, committed at android/leafforge.jks)
          -> apksigner (v2 + v3)
```

`minSdkVersion 24`, `targetSdkVersion 33`. The app is a thin `WebView` shell
(`com.leafforge.studio.MainActivity`) that:

- loads `file:///android_asset/index.html` — a **single self-contained HTML file** with the JS,
  CSS and fonts inlined, because `file://` blocks ES modules and `fetch()`
- wires `<input type="file">` to the system file picker via `onShowFileChooser`, so uploading a
  `.bbmodel` works
- exposes a `LeafForgeNative.saveBase64(...)` JavaScript bridge that writes exports to
  `Downloads/LeafForge` through MediaStore (with the legacy storage path + runtime permission
  for Android 7–9)
- requests hardware acceleration (required for WebGL) and keeps the system bars dark

Everything — including the two bundled sample models — is on-device. There is no server, no
account, and no telemetry.

## Bundled samples

| File | What it exercises |
| --- | --- |
| `public/models/steve.bbmodel` | Bedrock-style character, **box UV** on a 64×64 skin, 6 bones, 5 animations (idle / walk / wave / jump / point), written in the **v5.0** `groups[]` layout |
| `public/models/orientation-cube.bbmodel` | **Per-face UV** cube lettered N/S/E/W/U/D, with inline v4.10 groups, spin + bounce animations — handy for checking that a model's orientation is what you expect |

---

## Project layout

```
src/
  bbmodel/
    types.ts        Blockbench schema types
    parse.ts        LZUTF8 decode + version compatibility (processCompatibility port)
    geometry.ts     cube/mesh -> three.js buffers, box-UV and per-face UV
    animation.ts    keyframe compilation and interpolation
    scene.ts        scene graph (T(origin)·R·T(-origin) pivots, ZYX euler order)
  engine/
    BBModelRenderer.ts   three.js renderer, lighting, camera, fake contact shadow
    studio.ts            composites GL + backdrop + overlay layers, owns the clock
    compositor.ts        2D layer renderer (text/shape/image, fills, strokes, shadows)
    presets.ts           20 layer motion presets + easing functions
  state/
    types.ts        project/schema types and defaults
    store.ts        zustand store
    templates.ts    the eight thumbnail templates
  components/       React UI (model, scene, design, layers, inspector, export)
  export/           PNG, video (MediaRecorder), GIF encoder, project save/load
scripts/            sample + icon generators, verification suites
android/            WebView shell, resources, standalone build pipeline
```

## How the bbmodel pipeline works

1. **Parse** — `parse.ts` decodes `<lz>`-compressed LZUTF8 or plain JSON, then applies
   Blockbench's own compatibility migrations so old projects behave the same.
2. **Geometry** — `geometry.ts` mirrors `Cube.updateUV`: the box-UV template
   (`east [0,d] [d,h]`, `west [d+w,d] [d,h]`, `up [d+w,d] [-w,-d]`, `down [d+w*2,0] [-w,d]`,
   `south [d*2+w,d] [w,h]`, `north [d,d] [w,h]`), `mirror_uv`, `rotateRect` for 90° face
   rotations, and the same vertex order as `THREE.BoxGeometry`
   (`(u1,v1), (u2,v1), (u1,v2), (u2,v2)`), with `v` flipped to `1 - v/height`.
3. **Scene** — every node becomes `pivot(position = origin) → offset(-origin)`, giving
   `T(origin)·R·T(−origin)`, and rotations use Blockbench's default `ZYX` euler order.
4. **Animation** — keyframes are compiled per channel, then sampled with Blockbench's
   interpolation rules.

## Verification

Because this environment has no GPU and no browser, correctness is checked with three
headless suites (`npm run verify`):

| Suite | What it proves |
| --- | --- |
| `verify:uv` (87 assertions) | face directions, vertex order, per-corner UV mapping, outward normals, and that the box-UV template reproduces the **exact** Minecraft skin rectangles |
| `verify:render` | a software rasteriser draws the real scene graph and asserts the model is framed, centred, and showing the skin colours the texture says it should |
| `verify:ui` | every React panel mounts (jsdom), all 20 animation presets, 9 shapes and 8 templates composite without throwing, and the GIF encoder produces decodable output |

## Known limitations

- Only textures **embedded** in the `.bbmodel` are rendered; external paths are skipped with a
  warning (re-save with textures embedded in Blockbench).
- `animation_controllers`, Molang-driven keyframes and `display` settings are parsed but not
  evaluated — keyframe-driven animations are fully supported.
- GIF export is limited to 256 colours, which is inherent to the format.
- MP4 recording depends on the browser shipping an H.264 `MediaRecorder` codec; when it does
  not, the app falls back to WebM.
- The contact shadow is a projected radial gradient, not real shadow mapping.

## Licence / credits

Sample character and block textures are procedurally generated in this repository.
LeafForge Studio is not affiliated with Blockbench or ccLeaf.
