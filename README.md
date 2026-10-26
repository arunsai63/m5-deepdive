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

## Assets

- `assets/materials/`: original procedural die maps, height/normal/roughness maps and package markings. `scripts/make-materials.py` regenerates them.
- `assets/poster.webp`: generated loading/fallback artwork.
- `assets/vendor/`: Three.js, vendored with its license.

## Scientific references

- [NIST silicon reference material](https://www.nist.gov/publications/certification-nist-standard-reference-material-640d): the cubic lattice constant rounds to 0.543 nm. Diamond-cubic nearest-neighbour spacing is a√3/4 ≈ 0.235 nm. These are bulk reference values, not measured M5 dimensions.
- [Intel high-k / metal-gate research](https://www.intel.com/pressroom/kits/advancedtech/doodle/ref_HiK-MG/high-k.htm): hafnium-based gate dielectric as a representative materials example. This does not identify Apple's exact gate stack.
- [DOE explanation of electrons](https://www.energy.gov/science/doe-explainselectrons): electron probability clouds, rather than tiny solid particles following drawn orbital tracks. The atomic ending uses a ball-and-stick crystal model; no electron diameter is claimed.
- [Apple M5 introduction](https://www.apple.com/newsroom/2025/10/apple-unleashes-m5-the-next-big-leap-in-ai-performance-for-apple-silicon/): process generation context. “3 nm” is not the literal size of every feature.

## Verification

Browser checks used local Chrome with real WebGL 2 through Metal.

Checked all chapter navigation, replay from the atom, attached-label visibility, text toggle, dialog keyboard close, reduced motion, 200% text enlargement, horizontal overflow, and forced WebGL context loss followed by a successful retry. Atomic geometry was checked for exact nearest-neighbour connectivity; the camera distance decreases continuously through the full path. During one 3.5-second desktop atomic scroll sample, median frame interval was 16.7 ms and the 95th percentile was 16.8 ms. This is a local-machine result, not a performance guarantee for other devices. Mobile checks emulate viewports in Chrome, not physical phones.
