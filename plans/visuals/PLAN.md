# Visual pass — Oamaru 1914

Plan for the picture, written before any of it is built. The simulation is ahead of the rendering: weather, a solar arc, wet roads, snow, night windows and a shadow that follows the car are already in the frame loop. They are undercut by the light, the sky, and the surfaces you look at while driving.

Do the passes in order. Stop after a pass if the frame time gets worse on the hardware path. The software-GL path keeps today’s cheaper settings.

## Leave alone

- Procedural whitestone facades, signs, iron lace and the clock in `src/sim/textures.ts` and `src/sim/oamaruWorld.ts`. That is the art direction. Photo textures would make the cones, horses and people look poorer beside them.
- Model T paint and brass numbers in `buildFordModelT` (`src/sim/modelTGeometry.ts`). Clearcoat `0.85` and the brass metalness start working once the environment map is outdoor.
- The brass dock, type and start shield (`src/components/ControlDock.tsx`, `src/index.css`, `src/components/StartShieldModal.tsx`).
- Physics, errands, passengers, audio and traffic behaviour.

## Where the picture is made today

| What you see | Where it lives |
| --- | --- |
| Renderer, ACES, shadows, fog colour, sun | `src/components/OamaruViewport.tsx` around the `WebGLRenderer` setup and the solar block near the `sunAngle` update |
| Environment reflections | `RoomEnvironment` → `scene.environment` in the same setup |
| Sky | `scene.background` and `FogExp2`, one colour copied each frame |
| Shadow box | `sunLight.shadow`, 2048², ortho half-extent `d = 64`, target follows the car |
| Night exposure | lerps `1.08` → `0.88` with `nightFactor` |
| Terrain | one grass canvas on the heightfield, vertex colours, in `buildOamaruWorld` |
| Roads | macadam and cobble ribbons; cobble `bumpScale` is `0.035` |
| Wetness / snow tint | `setAtmosphereVisuals` in `src/sim/oamaruWorld.ts` |
| Harbour | `PlaneGeometry(260, 560, 1, 1)`, physical material, metalness `0.18`, clearcoat |
| Trees | instanced cones, about twenty of them |
| Lamps | cylinder post, sphere head, ten `PointLight`s |
| Tyre marks | 180 instanced quads in the viewport |
| Rain | `LineSegments` parented to the view |
| Chase lens | FOV `64` outside orbit; orbit is `46` |

## Pass 1 — Outdoor light and a sky

Largest change, smallest amount of new mesh.

1. Stop using `RoomEnvironment` for `scene.environment`. Build a procedural outdoor environment: sky gradient, sun disc, horizon haze. Generate the PMREM when the time-of-day bucket or the weather bucket changes, not every frame.
2. Add a sky dome so the horizon is warmer than the zenith. Summer noon stays high and hard. Late day goes apricot along the limestone. Drive the colours from the existing `_cDaySky`, `_cDuskSky`, `_cNightSky` and weather lerps so the dock clock and the sky stay in agreement.
3. Replace uniform fog density with height fog. Denser over the harbour (`y` below the quay), thinner up Wanbrow. Keep the current density targets (`0.0042` clear through `0.015` snow) as the street-level values.
4. Shrink the shadow ortho box from ±64 m to about ±28 m, biased ahead of the camera. Keep 2048² and PCF soft. Keep shadows off when `isSoftwareGl` is set.
5. Night exposure falls from `1.08` toward about `0.5` at full night, so shopfront emissives and the streetlamps carry the picture. Dusk can sit between the two. Do not lift a bloom pass across the town; whitestone will blow out.

Done when: brass and black enamel reflect sky rather than a white room, the breakwater still reads through haze, cornice shadows are sharper beside the car, and full night is visibly darker than dusk.

## Pass 2 — Harbour

The harbour is half the town’s identity and currently one flat quad.

1. Subdivide the water (on the order of 40 by 80) and displace it with two slow sine waves, amplitude about 8–15 cm.
2. Scroll a ripple normal made on a canvas, same pattern as the other procedural textures.
3. Facing colour stays near `0x264859`. Grazing angle takes the sky colour. Metalness goes to about `0`. Roughness plus that fresnel does the shine. Drop clearcoat on this material.
4. Skip a real planar reflection of the breakwater unless a camera mode looks east and the cost is acceptable. A sky-colour fresnel is the default.

Done when: the mole and the ship sit on a surface that moves, and the water no longer looks like a polished studio floor.

## Pass 3 — The road under the car

1. Stop relying on one grass canvas, tinted by vertex colour, for every verge. Keep the road ribbons on their own materials. Give the heightfield a second canvas (dry tussock versus worn edge) so grass and macadam do not read as the same printed cloth.
2. Replace the cobble bump (`bumpScale` `0.035`) with a normal map from that canvas, strength enough to read at about eight metres, and a darker mortar groove.
3. The wetness lerp in `setAtmosphereVisuals` already drops roughness. Feed it a normal and the outdoor environment so a wet street reflects sky instead of only becoming shinier.
4. The 180 tyre-track decals stay. Stretch each stamp along velocity and tint by surface: dust on dry macadam, darker on wet cobbles.

Done when: cobbles read from the chase camera, rain darkens and reflects, and a driven line looks like ruts.

## Pass 4 — Silhouette

1. Replace the cone canopies with two crossed cards per tree, still instanced. Paint cabbage trees and macrocarpa on the canvas. Those are the local outlines; cones read as pines.
2. Give each lamp a short arm. Add one additive halo quad, visible only when `nightFactor` is up (the same threshold that raises the existing point lights). Do not add more point lights.
3. Pedestrians stay as they are. Put a small dark contact disc under each standing figure, the same idea as the car’s contact shadow, so wool separates from the pale footpath.

Done when: a glance down Harbour Street shows cabbage-tree outlines and, after dusk, lamp halos, and people no longer melt into the stone.

## Pass 5 — The car in that light

Only after pass 1, so the materials are reflecting the right thing.

1. Keep the enamel and brass values.
2. The fender colour already lerps toward mud `0x4b3b27`. Confine that to the lower third. Build it on dry roads with distance driven, and wash it off while `wetness` is high.
3. At night, add a short additive cone on the headlight aim, down the road. The headlight meshes and spot lights already exist.

Done when: the body stays black above the wheels, the sills show the road, and the headlamps throw a visible beam without a full-screen glow.

## Pass 6 — Lens, then occlusion if the frame allows

1. Driving cameras move from FOV `64` toward about `50`, a little lower and further back. Orbit stays near `46`. Wide FOV bows the facades and shrinks the bonnet.
2. Measure frame time on the hardware path before adding a post effect. If there is room, add half-resolution ambient occlusion so box walls meet the ground. Skip it when `isSoftwareGl` is set, the same way shadows are skipped.
3. No town-wide bloom. A vignette or grain, if any, belongs only to the cockpit camera.

Done when: the limestone facades stand upright in the chase view, and occlusion is either on at half resolution or explicitly skipped because the frame time said so.

## Order

1. Outdoor environment, sky dome, height fog, tighter shadows, darker night.
2. Harbour shader.
3. Road normals, verge texture, tyre-track ruts.
4. Tree cards, lamp halos, pedestrian contact discs.
5. Lower-body dust and headlight cone.
6. Chase lens, then ambient occlusion only if frame time allows.

## Out of scope

- Rewriting the town in photogrammetry or another engine.
- Changing vehicle physics, errand flow, passenger logic or the UI.
- A bloom stack, motion blur, or per-frame environment-map rebuilds.
