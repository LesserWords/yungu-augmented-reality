# 3D pipeline

Everything 3D comes from `3d/source/Yungu.blend` (Blender 4.2+ / 5.x).

## In the .blend
- 27 separate parts, each with its pivot point in place, all skinned 100% to one bone of `Yungu_Rig` (15 bones)
- Actions: **Hover** (90 frames, seamless loop), Idle, Wave, Blink, at 30 fps
- The Hover loop also animates the glow (emission brightness and floor light). That part stays inside Blender. On the web it's recreated in code (`src/play/yungu.js`).

## Re-exporting the web models

The scripts in `3d/blender-scripts/` run with Blender's Python module (`pip install bpy`), or adapt them to `blender -b -P`.

```bash
python 3d/blender-scripts/export_web.py 3d/source/Yungu.blend public/models 0.5
```
- `0.5` = scale (the model is ~1.19 m in the .blend, ~0.59 m on the web). Change it to resize Yungu in “Ver no meu espaço”.
- Writes `yungu.glb` (Hover only), `yungu-play.glb` (all clips) and `yungu.usdz` (iPhone).

## Rules for a replacement model
- Keep the file names in `public/models/`, or update `MODELS` in `src/shared/config.js`.
- glTF front = **+Z**, up = +Y, metres. The origin sits on the floor between the feet.
- Keep the clip name `Hover` (landing autoplay, glow sync) and `Wave` (wave button).
- Glow pulse looks up materials by name: `M_Glow_Lime`, `M_Body_Glow`, `M_Ground_Glow`, `M_Chest_Screen`, `M_Antenna_Lime`.
- Keep files under ~3 MB for fast loading on mobile data.

## Other scripts
| Script | What it does |
|---|---|
| `build_yungu.py` | Rebuilds the model, rig and Idle/Wave/Blink clips from scratch |
| `make_textures.py` | Chest screen and glow textures |
| `make_hover.py` | Adds the Hover loop + glow animation, optionally renders frames |
| `export_yungu.py` | Game-engine exports (GLB/FBX, low and high poly) |
| `render_preview.py`, `hover_bloom.py`, `hover_comp.py` | Preview renders and the hover videos in `media/` |
