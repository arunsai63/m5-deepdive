# m5-deepdive — Inside silicon

Exploring the Apple M5 chip down to the atomic level.

A standalone, one-page WebGL chip journey inspired by [MKBHD and Epic Spaceman’s M5 exploration](https://www.youtube.com/watch?v=Jh9pFp1oM7E).

Run locally from the repository root:

```sh
python3 -m http.server 5185 --bind 127.0.0.1
```

Open http://127.0.0.1:5185/. On GitHub Pages it is served directly from the repository root. No build step or external runtime CDN is required. Three.js and the Manrope font are vendored with their licenses.

The camera follows one nested world: package → die → core → interconnects → transistor → silicon crystal → one atom. `journey.js` defines the hierarchy, continuous camera path, and geometry-attached label anchors. `scene-data.js` contains deterministic instanced geometry. The final atomic descent appends scroll distance after the original ending; earlier scroll positions and camera poses remain intact. A floating origin maintains precision during the descent.

The atomic model contains 3,415 silicon sites and 6,144 nearest-neighbour bonds. The selected interior atom has four bonds. A real opening in the fin contains the crystal model. The final camera approaches the same highlighted atom without a scene switch. Surface colours, atom spheres, and bond rods are explanatory. This is not a reconstruction of Apple's proprietary layout or an optical photograph at atomic scale.

## Assets and rendering

> This repository keeps only web-ready assets to stay within GitHub size limits. Full-resolution PNG masters (stills and the 480-frame sequence), the 8K die texture, and the `.blend` source files are not included; the browser uses the WebP versions.

- `assets/materials/`: original procedural die maps, height/normal/roughness maps and package markings. `scripts/make-materials.py` regenerates them.
- `assets/poster.webp`: generated loading/fallback artwork; prompt saved alongside it.
- `assets/renders/`: six completed Blender stills, each as a 3840 × 2400 PNG and a 2560 × 1600 WebP.
- `assets/source/blender/`: six portable `.blend` files with packed textures, the exact still-recipe snapshot, verification manifest and measured timings.
- `scripts/build-blender-assets.py`: offline still generator. Defaults resolve relative to this folder. Run with Blender and `-- --scene package --width 3840 --height 2400 --samples 256`; use `--scene transistors --cutaway` for the isolated device.

Open `?render=blender` on the main journey to review the completed Blender images with the existing scroll navigation, captions and anchored labels. It uses a bounded image cache, compressed-frame buffering, neighbouring-frame decode and camera-based motion between frames. The preview stops at the last consecutive available frame, adds new frames automatically, and links to each full-resolution PNG. Browser review images are 1600 × 1000 WebP; full-resolution masters remain untouched. Portrait screens show the whole landscape frame above the copy. `scripts/prepare-frame-preview.py` prepares these review images while Blender continues.

The main journey renders live 3D geometry. The six studio stills have independent compositions. The full Blender sequence is now authorized and uses the current nested camera path through the final atom. Open `assets/renders/sequence/` to see live progress, the latest completed frame, and (once encoding finishes) the full film and scrubber. No additional 8K renders are generated. The Ultra / 8K quality option is hidden; the main journey uses its default High detail setting.

Successful final still jobs totalled **14m 46s** on the local Metal GPU, excluding preview work and interrupted jobs. The full sequence uses 480 frames at 2560 × 1600, 128 Cycles samples and denoising. Its measured ETA is shown on the progress page and changes with frame complexity. This replaces the earlier provisional estimate for the shorter path.

`node scripts/export-sequence.mjs` snapshots all six geometry levels and the exact camera poses. `python3 scripts/run-sequence.py` runs Blender, resumes completed frames, validates PNG dimensions, produces WebP frames, and encodes the 24 fps H.264 film. Requires local Blender, Pillow and ffmpeg. `render-sequence.py --frames 0,123,230,320,420,479` (passed after Blender's `--`) benchmarks representative frames. The output folder retains full PNG masters, measured per-frame timings, progress and logs. Atomic coordinates are transformed in double precision before assigning camera-relative Blender matrices.

## Scientific references

- [NIST silicon reference material](https://www.nist.gov/publications/certification-nist-standard-reference-material-640d): the cubic lattice constant rounds to 0.543 nm. Diamond-cubic nearest-neighbour spacing is a√3/4 ≈ 0.235 nm. These are bulk reference values, not measured M5 dimensions.
- [Intel high-k / metal-gate research](https://www.intel.com/pressroom/kits/advancedtech/doodle/ref_HiK-MG/high-k.htm): hafnium-based gate dielectric as a representative materials example. This does not identify Apple's exact gate stack.
- [DOE explanation of electrons](https://www.energy.gov/science/doe-explainselectrons): electron probability clouds, rather than tiny solid particles following drawn orbital tracks. The atomic ending uses a ball-and-stick crystal model; no electron diameter is claimed.
- [Apple M5 introduction](https://www.apple.com/newsroom/2025/10/apple-unleashes-m5-the-next-big-leap-in-ai-performance-for-apple-silicon/): process generation context. “3 nm” is not the literal size of every feature.

## Verification

Browser checks used local Chrome with real WebGL 2 through Metal. Desktop and mobile viewport screenshots and results are saved in `qa/`.

Checked all chapter navigation, replay from the atom, attached-label visibility, text toggle, dialog keyboard close, reduced motion, 200% text enlargement, horizontal overflow, and forced WebGL context loss followed by a successful retry. Atomic geometry was checked for exact nearest-neighbour connectivity; the camera distance decreases continuously through the full path. During one 3.5-second desktop atomic scroll sample, median frame interval was 16.7 ms and the 95th percentile was 16.8 ms. This is a local-machine result, not a performance guarantee for other devices. Mobile checks emulate viewports in Chrome, not physical phones.

## Current render review issue

The existing section-two PNGs show lighting flicker: the package die plane and nested die plane both occupy world Y = 0.359. The Blender builder now excludes the duplicate for any future explicitly authorized render. A small diagnostic render was stopped at the user’s instruction; none of its frames replaced the current sequence. No further re-render is authorized. The original background queue continues. Browser playback now retains compressed frames, avoids displaying future frames out of order, and follows camera translation and rotation between images. These playback changes do not remove lighting fluctuations already baked into the PNGs.
