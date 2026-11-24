import * as THREE from 'three';
import { RADIATOR_STANDPIPE, ROAD_OBSTRUCTIONS, ROAD_POTHOLES, getTerrainHeightAndSurface } from './terrain';
import { SignStyle, TextureBundle } from './textures';
import { HarbourWater, createHarbourWater } from './waterSurface';

export interface OamaruWorldHandle {
  group: THREE.Group;
  update: (elapsedTime: number, timeHour?: number, view?: THREE.Vector3) => void;
  getTrainPos: () => { x: number; z: number };
  setAtmosphereVisuals: (
    wetness: number,
    snowCover: number,
    nightFactor: number,
    skyColor: THREE.Color,
    sunDir: THREE.Vector3,
    sunColor: THREE.Color
  ) => void;
  dispose: () => void;
}

type ArchitecturalVariant =
  | 'italianate-verandah'
  | 'corinthian-temple'
  | 'grain-hoist'
  | 'venetian-gothic'
  | 'greek-revival'
  | 'carriage-arch'
  | 'portico-palazzo'
  | 'clocktower-civic';

interface BuildingSpec {
  x: number;
  z: number;
  w: number;
  d: number;
  floors: number;
  facing: 'north' | 'south' | 'east' | 'west';
  variant: ArchitecturalVariant;
  title: string;
  subtitle: string;
  signBg?: string;
  signStyle?: SignStyle;
}

export function buildOamaruWorld(textures: TextureBundle, isSoftwareGl: boolean): OamaruWorldHandle {
  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(item: T): T => {
    disposables.push(item);
    return item;
  };

  const group = new THREE.Group();

  // ---------------------------------------------------------------------------
  // 1. Extended Continuous Heightfield Terrain Mesh (covering Severn to Harbour & Wanbrow Summit)
  // ---------------------------------------------------------------------------
  const terrainW = 480;
  const terrainD = 560;
  const centerX = -15;
  const centerZ = 24;
  const segX = 148;
  const segZ = 164;
  const terrainGeo = track(new THREE.PlaneGeometry(terrainW, terrainD, segX, segZ));
  terrainGeo.rotateX(-Math.PI / 2);

  const roadBands: readonly [number, number, number, number][] = [
    [-112, 104, -7.2, 7.2],
    [-30.8, -17.2, -95, 122],
    [-159, 102, -74.8, -61.2],
    [-111.5, -96.5, -156, 125],
    [-159.2, -144.8, -156, 204],
    [-160, 102, 110.8, 125.2],
    [-160, 102, 188.8, 203.2],
    [-160, -96.5, -155.2, -140.8],
    [88.2, 101.8, -95, 204],
    [12, 86, -61.5, -45],
  ];
  const vergeWear = (x: number, z: number): number => {
    let nearest = 99;
    for (let r = 0; r < roadBands.length; r++) {
      const band = roadBands[r];
      const dx = x < band[0] ? band[0] - x : x > band[1] ? x - band[1] : 0;
      const dz = z < band[2] ? band[2] - z : z > band[3] ? z - band[3] : 0;
      nearest = Math.min(nearest, Math.hypot(dx, dz));
    }
    if (nearest < 0.4) return 1;
    if (nearest < 3.2) return 1 - (nearest - 0.4) / 2.8;
    return 0;
  };

  const posAttr = terrainGeo.attributes.position;
  const colors = new Float32Array(posAttr.count * 3);
  const worn = new Float32Array(posAttr.count);
  const cGrass = new THREE.Color(0x697449);
  const cMacadam = new THREE.Color(0xb2a389);
  const cCobble = new THREE.Color(0x524f4b);
  const cMud = new THREE.Color(0x544230);
  const cSand = new THREE.Color(0x9b8d72);
  const tmpColor = new THREE.Color();

  for (let i = 0; i < posAttr.count; i++) {
    const vx = posAttr.getX(i) + centerX;
    const vz = posAttr.getZ(i) + centerZ;
    posAttr.setX(i, vx);
    posAttr.setZ(i, vz);

    const { height, surface } = getTerrainHeightAndSurface(vx, vz);
    const finalY = vx > 107 ? -1.8 : height;
    posAttr.setY(i, finalY);

    if (surface === 'cobbles') tmpColor.copy(cCobble);
    else if (surface === 'macadam') tmpColor.copy(cMacadam);
    else if (surface === 'mud') tmpColor.copy(cMud);
    else if (vx > 102) tmpColor.copy(cSand);
    else tmpColor.copy(cGrass);

    colors[i * 3] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;
    if (surface === 'grass') worn[i] = vergeWear(vx, vz);
    else if (surface !== 'water') worn[i] = 1;
    if (vx > 102 && vx < 108) worn[i] = Math.max(worn[i], 0.7);
  }
  terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  terrainGeo.setAttribute('worn', new THREE.BufferAttribute(worn, 1));
  terrainGeo.computeVertexNormals();

  const terrainMat = track(
    new THREE.MeshStandardMaterial({
      map: textures.grass,
      vertexColors: true,
      roughness: 0.92,
      metalness: 0.02,
    })
  );
  terrainMat.onBeforeCompile = (shader) => {
    shader.uniforms.wornMap = { value: textures.wornEarth };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float worn;\nvarying float vWorn;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvWorn = worn;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform sampler2D wornMap;\nvarying float vWorn;'
      )
      .replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
  vec4 sampledDiffuseColor = texture2D(map, vMapUv);
  vec4 wornDiffuse = texture2D(wornMap, vMapUv);
  sampledDiffuseColor = mix(sampledDiffuseColor, wornDiffuse, clamp(vWorn, 0.0, 1.0));
  #ifdef DECODE_VIDEO_TEXTURE
    sampledDiffuseColor = sRGBTransferEOTF(sampledDiffuseColor);
  #endif
  diffuseColor *= sampledDiffuseColor;
#endif`
      );
  };
  terrainMat.customProgramCacheKey = () => 'terrain-worn';
  const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
  terrainMesh.receiveShadow = true;
  group.add(terrainMesh);

  // ---------------------------------------------------------------------------
  // 2. Extended Urban Circuit Road Ribbons
  // ---------------------------------------------------------------------------
  const addRoadRibbon = (
    xMin: number,
    xMax: number,
    zMin: number,
    zMax: number,
    segsX: number,
    segsZ: number,
    material: THREE.Material,
    yLift = 0.028
  ) => {
    const w = xMax - xMin;
    const d = zMax - zMin;
    const cx = (xMin + xMax) * 0.5;
    const cz = (zMin + zMax) * 0.5;
    const geo = track(new THREE.PlaneGeometry(w, d, segsX, segsZ));
    geo.rotateX(-Math.PI / 2);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const wx = cx + p.getX(i);
      const wz = cz + p.getZ(i);
      const h = getTerrainHeightAndSurface(wx, wz).height;
      p.setY(i, h + yLift);
    }
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(cx, 0, cz);
    mesh.receiveShadow = true;
    group.add(mesh);
  };

  const macadamMat = track(
    new THREE.MeshStandardMaterial({
      map: textures.macadam,
      roughness: 0.92,
      metalness: 0.02,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    })
  );

  const cobbleMat = track(
    new THREE.MeshStandardMaterial({
      map: textures.cobbles,
      normalMap: textures.cobblesNormal,
      normalScale: new THREE.Vector2(1.35, 1.35),
      roughness: 0.82,
      metalness: 0.02,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    })
  );

  const mudMat = track(
    new THREE.MeshStandardMaterial({
      map: textures.mud,
      roughness: 0.58,
      metalness: 0.1,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    })
  );

  // Circuit & Precinct Streets
  addRoadRibbon(-112, 12, -7.2, 7.2, 32, 6, macadamMat, 0.03);
  addRoadRibbon(12, 104, -7.2, 7.2, 26, 6, cobbleMat, 0.036);
  addRoadRibbon(-30.8, -17.2, -95, 122, 6, 48, macadamMat, 0.028);
  addRoadRibbon(-159, 102, -74.8, -61.2, 48, 6, macadamMat, 0.028);
  addRoadRibbon(-111.5, -96.5, -156, 125, 6, 68, macadamMat, 0.026);
  addRoadRibbon(-159.2, -144.8, -156, 204, 6, 86, macadamMat, 0.028);
  addRoadRibbon(-160, 102, 110.8, 125.2, 54, 6, macadamMat, 0.03);
  addRoadRibbon(-160, 102, 188.8, 203.2, 54, 6, macadamMat, 0.03);
  addRoadRibbon(-160, -96.5, -155.2, -140.8, 18, 6, macadamMat, 0.028);
  addRoadRibbon(88.2, 101.8, -95, 204, 6, 74, macadamMat, 0.028);
  addRoadRibbon(88.2, 101.8, -22, 22, 6, 14, cobbleMat, 0.038);
  addRoadRibbon(12, 86, -61.5, -45, 22, 8, mudMat, 0.025);

  // Raised Oamaru Whitestone Flagstone Footpaths & Dressed Bluestone Kerbs
  const footpathMat = track(
    new THREE.MeshStandardMaterial({
      map: textures.footpathStone,
      roughness: 0.88,
      metalness: 0.02,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    })
  );
  const kerbMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xb7aa92,
      roughness: 0.84,
      metalness: 0.04,
    })
  );
  const addFootpathBlock = (
    xMin: number,
    xMax: number,
    zMin: number,
    zMax: number,
    kerbEdge: 'north' | 'south' | 'east' | 'west'
  ) => {
    addRoadRibbon(xMin, xMax, zMin, zMax, 6, 2, footpathMat, 0.13);
    const isEW = kerbEdge === 'north' || kerbEdge === 'south';
    const len = isEW ? xMax - xMin : zMax - zMin;
    const cx = isEW ? (xMin + xMax) * 0.5 : kerbEdge === 'east' ? xMax - 0.12 : xMin + 0.12;
    const cz = isEW ? (kerbEdge === 'north' ? zMax - 0.12 : zMin + 0.12) : (zMin + zMax) * 0.5;
    const kGeo = track(new THREE.BoxGeometry(isEW ? len : 0.24, 0.14, isEW ? 0.24 : len));
    const kMesh = new THREE.Mesh(kGeo, kerbMat);
    const kh = getTerrainHeightAndSurface(cx, cz, true).height;
    kMesh.position.set(cx, kh + 0.08, cz);
    kMesh.receiveShadow = true;
    group.add(kMesh);
  };

  // Harbour St North & South Flagstone Pavements
  addFootpathBlock(-94, -31.5, -10.8, -7.25, 'north');
  addFootpathBlock(-16.5, 86, -10.8, -7.25, 'north');
  addFootpathBlock(-94, -31.5, 7.25, 10.8, 'south');
  addFootpathBlock(-16.5, 86, 7.25, 10.8, 'south');
  // Thames St East & West Flagstone Pavements
  addFootpathBlock(-114.2, -111.5, -60, -10.8, 'east');
  addFootpathBlock(-114.2, -111.5, 10.8, 105, 'east');
  addFootpathBlock(-96.5, -93.8, -60, -10.8, 'west');
  addFootpathBlock(-96.5, -93.8, 10.8, 105, 'west');
  // Itchen, Severn, Thames North & Summit Flagstone Pavements
  addFootpathBlock(-143, -31.5, -77.2, -74.8, 'north');
  addFootpathBlock(-143, -31.5, -61.2, -58.2, 'south');
  addFootpathBlock(-144.8, -142.0, -58, 104, 'west');
  addFootpathBlock(-161.2, -159.2, -58, 96, 'east');
  addFootpathBlock(-114.2, -111.5, -140, -76, 'east');
  addFootpathBlock(-96.5, -93.8, -140, -76, 'west');
  addFootpathBlock(-16, 84, 186.2, 188.8, 'south');

  // Road Potholes (rendered flush above road crown with dark crater & wet puddle core)
  const potholeRimMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x625747,
      roughness: 0.96,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    })
  );
  const potholePitMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x2f2820,
      roughness: 0.92,
      polygonOffset: true,
      polygonOffsetFactor: -5,
      polygonOffsetUnits: -5,
    })
  );
  const potholePuddleMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x3b352c,
      normalMap: textures.cobblesNormal,
      normalScale: new THREE.Vector2(0.55, 0.55),
      roughness: 0.38,
      metalness: 0.02,
      polygonOffset: true,
      polygonOffsetFactor: -6,
      polygonOffsetUnits: -6,
    })
  );
  for (let i = 0; i < ROAD_POTHOLES.length; i++) {
    const ph = ROAD_POTHOLES[i];
    const baseRoadY = getTerrainHeightAndSurface(ph.x, ph.z, true).height;
    const phGroup = new THREE.Group();
    phGroup.position.set(ph.x, baseRoadY + 0.044, ph.z);
    phGroup.rotation.y = (i * 1.37) % (Math.PI * 2);

    const rimGeo = track(new THREE.RingGeometry(ph.radius * 0.68, ph.radius * 1.04, 16));
    rimGeo.rotateX(-Math.PI / 2);
    const rimMesh = new THREE.Mesh(rimGeo, potholeRimMat);

    const pitGeo = track(new THREE.CircleGeometry(ph.radius * 0.72, 16));
    pitGeo.rotateX(-Math.PI / 2);
    const pitMesh = new THREE.Mesh(pitGeo, potholePitMat);
    pitMesh.position.y = 0.002;
    pitMesh.scale.set(1.06, 1, 0.88);

    const puddleGeo = track(new THREE.CircleGeometry(ph.radius * 0.42, 12));
    puddleGeo.rotateX(-Math.PI / 2);
    const puddleMesh = new THREE.Mesh(puddleGeo, potholePuddleMat);
    puddleMesh.position.set(ph.radius * 0.08, 0.004, -ph.radius * 0.05);

    phGroup.add(rimMesh, pitMesh, puddleMesh);
    group.add(phGroup);
  }

  // Occasional Small Road Obstructions (crates, wool bales, barrows, sawhorses, milk churns, branches)
  const crateWoodMat = track(new THREE.MeshStandardMaterial({ color: 0x87623a, roughness: 0.86 }));
  const woolBurlapMat = track(new THREE.MeshStandardMaterial({ color: 0xa8926d, roughness: 0.96 }));
  const sawhorsePaintMat = track(new THREE.MeshStandardMaterial({ color: 0x9b2f26, roughness: 0.76 }));
  const churnZincMat = track(new THREE.MeshStandardMaterial({ color: 0x9ca4ab, roughness: 0.38, metalness: 0.78 }));
  const barkMat = track(new THREE.MeshStandardMaterial({ color: 0x4b3928, roughness: 0.95 }));
  const barrowWheelMat = track(new THREE.MeshStandardMaterial({ color: 0x3b3530, roughness: 0.48, metalness: 0.78 }));
  const foliageMat = track(new THREE.MeshStandardMaterial({ color: 0x455b38, roughness: 0.9 }));
  const lanternAmberMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xffc15e,
      emissive: new THREE.Color(0xff9a2e),
      emissiveIntensity: 0.9,
      roughness: 0.25,
    })
  );

  for (let i = 0; i < ROAD_OBSTRUCTIONS.length; i++) {
    const obs = ROAD_OBSTRUCTIONS[i];
    const baseObsY = getTerrainHeightAndSurface(obs.x, obs.z).height;
    const oGroup = new THREE.Group();
    oGroup.position.set(obs.x, baseObsY, obs.z);
    oGroup.rotation.y = obs.yaw;

    if (obs.kind === 'crate') {
      const box1 = new THREE.Mesh(track(new THREE.BoxGeometry(0.76, 0.58, 0.76)), crateWoodMat);
      box1.position.set(-0.08, 0.29, 0);
      box1.castShadow = true;
      const box2 = new THREE.Mesh(track(new THREE.BoxGeometry(0.46, 0.38, 0.46)), crateWoodMat);
      box2.position.set(0.18, 0.19, 0.42);
      box2.rotation.y = 0.42;
      box2.castShadow = true;
      oGroup.add(box1, box2);
    } else if (obs.kind === 'wool-bales') {
      const bale1 = new THREE.Mesh(track(new THREE.BoxGeometry(0.86, 0.62, 0.64)), woolBurlapMat);
      bale1.position.set(0, 0.31, -0.1);
      bale1.castShadow = true;
      const bale2 = new THREE.Mesh(track(new THREE.BoxGeometry(0.78, 0.54, 0.58)), woolBurlapMat);
      bale2.position.set(0.14, 0.27, 0.46);
      bale2.rotation.y = 0.28;
      bale2.castShadow = true;
      oGroup.add(bale1, bale2);
    } else if (obs.kind === 'wheelbarrow') {
      const tray = new THREE.Mesh(track(new THREE.BoxGeometry(0.62, 0.34, 0.92)), crateWoodMat);
      tray.position.set(0, 0.44, 0);
      tray.rotation.x = 0.16;
      tray.castShadow = true;
      const wheel = new THREE.Mesh(track(new THREE.TorusGeometry(0.22, 0.04, 6, 14)), barrowWheelMat);
      wheel.rotation.y = Math.PI / 2;
      wheel.position.set(0, 0.24, 0.54);
      const handles = new THREE.Mesh(track(new THREE.BoxGeometry(0.56, 0.06, 1.35)), barkMat);
      handles.position.set(0, 0.38, -0.18);
      handles.rotation.x = 0.18;
      oGroup.add(tray, wheel, handles);
    } else if (obs.kind === 'sawhorse') {
      const bar = new THREE.Mesh(track(new THREE.BoxGeometry(1.5, 0.16, 0.1)), sawhorsePaintMat);
      bar.position.set(0, 0.78, 0);
      bar.castShadow = true;
      [-0.56, 0.56].forEach((lx) => {
        const legA = new THREE.Mesh(track(new THREE.BoxGeometry(0.08, 0.86, 0.08)), crateWoodMat);
        legA.position.set(lx, 0.4, 0.16);
        legA.rotation.x = -0.36;
        legA.castShadow = true;
        const legB = new THREE.Mesh(track(new THREE.BoxGeometry(0.08, 0.86, 0.08)), crateWoodMat);
        legB.position.set(lx, 0.4, -0.16);
        legB.rotation.x = 0.36;
        legB.castShadow = true;
        oGroup.add(legA, legB);
      });
      const lantern = new THREE.Mesh(track(new THREE.CylinderGeometry(0.08, 0.09, 0.22, 8)), lanternAmberMat);
      lantern.position.set(0, 0.97, 0);
      oGroup.add(bar, lantern);
    } else if (obs.kind === 'milk-churns') {
      const churnOffsets: [number, number, number][] = [
        [-0.22, 0, -0.12],
        [0.24, 0, -0.05],
        [0.02, 0, 0.28],
      ];
      churnOffsets.forEach(([cx, cy, cz], ci) => {
        const body = new THREE.Mesh(track(new THREE.CylinderGeometry(0.16, 0.18, 0.62, 10)), churnZincMat);
        body.position.set(cx, cy + 0.31, cz);
        body.castShadow = true;
        const neck = new THREE.Mesh(track(new THREE.CylinderGeometry(0.11, 0.15, 0.14, 10)), churnZincMat);
        neck.position.set(cx, cy + 0.68, cz);
        if (ci === 2) {
          body.rotation.z = 0.14;
        }
        oGroup.add(body, neck);
      });
    } else {
      const trunk = new THREE.Mesh(track(new THREE.CylinderGeometry(0.09, 0.15, 1.8, 7)), barkMat);
      trunk.rotation.z = Math.PI / 2 - 0.08;
      trunk.position.set(0, 0.16, 0);
      trunk.castShadow = true;
      const tuft1 = new THREE.Mesh(track(new THREE.DodecahedronGeometry(0.36, 0)), foliageMat);
      tuft1.position.set(0.65, 0.32, 0.12);
      tuft1.castShadow = true;
      const tuft2 = new THREE.Mesh(track(new THREE.DodecahedronGeometry(0.28, 0)), foliageMat);
      tuft2.position.set(0.25, 0.28, -0.2);
      oGroup.add(trunk, tuft1, tuft2);
    }

    group.add(oGroup);
  }

  // Start / Finish 1914 Trial Timber Banner Arch spanning Harbour Street at x = -56
  const startBaseH = getTerrainHeightAndSurface(-56, 0).height;
  const bannerPostMat = track(new THREE.MeshStandardMaterial({ color: 0x3b2a1c, roughness: 0.85 }));
  const bannerTex = textures.createSignTexture(
    '1914 Oamaru Reliability Trial',
    'Start / Finish · Victorian Urban Circuit',
    '#221b15',
    '#e8c474'
  );
  const bannerMat = track(new THREE.MeshStandardMaterial({ map: bannerTex, roughness: 0.6 }));

  const archGroup = new THREE.Group();
  archGroup.position.set(-56, startBaseH, 0);
  const postGeo = track(new THREE.CylinderGeometry(0.14, 0.16, 6.2, 10));
  [-7.5, 7.5].forEach((pz) => {
    const post = new THREE.Mesh(postGeo, bannerPostMat);
    post.position.set(0, 3.1, pz);
    post.castShadow = true;
    archGroup.add(post);
  });
  const bannerBoard = new THREE.Mesh(track(new THREE.BoxGeometry(0.28, 1.4, 15.6)), bannerMat);
  bannerBoard.position.set(0, 5.4, 0);
  bannerBoard.castShadow = true;
  archGroup.add(bannerBoard);

  // Painted white chalk start line on macadam road
  const chalkMat = track(
    new THREE.MeshBasicMaterial({
      color: 0xf0e9d8,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    })
  );
  const startLine = new THREE.Mesh(track(new THREE.PlaneGeometry(0.55, 13.8)), chalkMat);
  startLine.rotation.x = -Math.PI / 2;
  startLine.position.set(0, 0.09, 0);
  archGroup.add(startLine);
  group.add(archGroup);

  // Harbour Narrow-Gauge Railway Tracks
  const railMat = track(new THREE.MeshStandardMaterial({ color: 0x3b3530, roughness: 0.45, metalness: 0.82 }));
  const tieMat = track(new THREE.MeshStandardMaterial({ color: 0x3d2f22, roughness: 0.9 }));
  const addRailLine = (x1: number, z1: number, x2: number, z2: number) => {
    const dx = x2 - x1;
    const dz = z2 - z1;
    const len = Math.hypot(dx, dz);
    const angle = Math.atan2(dx, dz);
    const railGeo = track(new THREE.BoxGeometry(0.07, 0.06, len));
    [-0.53, 0.53].forEach((offset) => {
      const rail = new THREE.Mesh(railGeo, railMat);
      const nx = Math.cos(angle) * offset;
      const nz = -Math.sin(angle) * offset;
      rail.position.set((x1 + x2) * 0.5 + nx, 1.06, (z1 + z2) * 0.5 + nz);
      rail.rotation.y = angle;
      group.add(rail);
    });
  };
  addRailLine(14, -52, 88, -52);
  addRailLine(86, -85, 86, 45);
  const sleeperGeo = track(new THREE.BoxGeometry(0.16, 0.04, 1.45));
  const sleeperInst = new THREE.InstancedMesh(sleeperGeo, tieMat, 46);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 46; i++) {
    dummy.position.set(15 + i * 1.6, 1.01, -52);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    sleeperInst.setMatrixAt(i, dummy.matrix);
  }
  sleeperInst.computeBoundingSphere();
  group.add(sleeperInst);

  // 1914 NZR Harbour Steam Shunting Locomotive & Timber Coal Wagon (on z = -52 siding)
  const locoIronMat = track(new THREE.MeshStandardMaterial({ color: 0x1d1e20, roughness: 0.45, metalness: 0.65 }));
  const locoCabMat = track(new THREE.MeshStandardMaterial({ color: 0x26382b, roughness: 0.55, metalness: 0.25 }));
  const locoBrassMat = track(new THREE.MeshStandardMaterial({ color: 0xd4a448, roughness: 0.24, metalness: 0.9 }));
  const locoCoalMat = track(new THREE.MeshStandardMaterial({ color: 0x171718, roughness: 0.95 }));
  const steamPuffMat = track(
    new THREE.MeshStandardMaterial({ color: 0xf1f4f7, roughness: 0.95, transparent: true, opacity: 0.68, depthWrite: false })
  );

  const trainGroup = new THREE.Group();
  trainGroup.position.set(50, 1.09, -52);

  // Boiler barrel + saddle tank + brass steam dome + smokestack
  const boiler = new THREE.Mesh(track(new THREE.CylinderGeometry(0.68, 0.68, 3.2, 14)), locoIronMat);
  boiler.rotation.z = Math.PI / 2;
  boiler.position.set(0.65, 1.52, 0);
  boiler.castShadow = true;
  const smokebox = new THREE.Mesh(track(new THREE.CylinderGeometry(0.71, 0.71, 0.72, 14)), locoIronMat);
  smokebox.rotation.z = Math.PI / 2;
  smokebox.position.set(2.35, 1.52, 0);
  const stack = new THREE.Mesh(track(new THREE.CylinderGeometry(0.18, 0.14, 1.05, 10)), locoIronMat);
  stack.position.set(2.35, 2.48, 0);
  stack.castShadow = true;
  const dome = new THREE.Mesh(track(new THREE.SphereGeometry(0.28, 12, 10)), locoBrassMat);
  dome.position.set(0.85, 2.25, 0);
  const headlamp = new THREE.Mesh(track(new THREE.CylinderGeometry(0.14, 0.14, 0.2, 10)), locoBrassMat);
  headlamp.rotation.z = Math.PI / 2;
  headlamp.position.set(2.74, 2.02, 0);
  const frame = new THREE.Mesh(track(new THREE.BoxGeometry(5.1, 0.28, 1.48)), locoIronMat);
  frame.position.set(0.35, 0.68, 0);
  const cab = new THREE.Mesh(track(new THREE.BoxGeometry(1.65, 1.85, 1.56)), locoCabMat);
  cab.position.set(-1.32, 1.72, 0);
  cab.castShadow = true;
  const cabRoof = new THREE.Mesh(track(new THREE.BoxGeometry(1.9, 0.12, 1.72)), locoIronMat);
  cabRoof.position.set(-1.32, 2.68, 0);

  // Coupled timber coal/timber wagon trailing behind
  const wagon = new THREE.Mesh(track(new THREE.BoxGeometry(3.1, 0.88, 1.48)), tieMat);
  wagon.position.set(-4.35, 1.02, 0);
  wagon.castShadow = true;
  const coalPile = new THREE.Mesh(track(new THREE.BoxGeometry(2.8, 0.35, 1.25)), locoCoalMat);
  coalPile.position.set(-4.35, 1.52, 0);

  trainGroup.add(boiler, smokebox, stack, dome, headlamp, frame, cab, cabRoof, wagon, coalPile);

  const trainWheels: THREE.Mesh[] = [];
  const locoWheelGeo = track(new THREE.CylinderGeometry(0.36, 0.36, 0.14, 12));
  locoWheelGeo.rotateX(Math.PI / 2);
  [-5.2, -3.5, -1.6, 0.15, 1.55].forEach((wx) => {
    [-0.56, 0.56].forEach((wz) => {
      const w = new THREE.Mesh(locoWheelGeo, locoIronMat);
      w.position.set(wx, 0.36, wz);
      trainGroup.add(w);
      trainWheels.push(w);
    });
  });

  // Rising steam puffs above smokestack
  const steamPuffs: THREE.Mesh[] = [];
  const puffGeo = track(new THREE.SphereGeometry(0.24, 8, 6));
  for (let p = 0; p < 7; p++) {
    const puff = new THREE.Mesh(puffGeo, steamPuffMat);
    puff.position.set(2.35, 3.0 + p * 0.55, 0);
    trainGroup.add(puff);
    steamPuffs.push(puff);
  }
  group.add(trainGroup);
  let currentTrainX = 50;

  // ---------------------------------------------------------------------------
  // 3. Harbour Seawall, Sumpter Wharf & SS Oamaru Steamship
  // ---------------------------------------------------------------------------
  const limestoneMat = track(
    new THREE.MeshStandardMaterial({
      map: textures.limestone,
      bumpMap: textures.limestoneBump,
      bumpScale: 0.045,
      roughness: 0.86,
      metalness: 0.02,
    })
  );
  const rusticatedMat = track(
    new THREE.MeshStandardMaterial({
      map: textures.limestoneRusticated,
      bumpMap: textures.limestoneRusticatedBump,
      bumpScale: 0.065,
      roughness: 0.88,
      metalness: 0.02,
    })
  );
  const polychromeMat = track(
    new THREE.MeshStandardMaterial({
      map: textures.polychromeStone,
      bumpMap: textures.limestoneBump,
      bumpScale: 0.045,
      roughness: 0.85,
      metalness: 0.04,
    })
  );
  const trimStoneMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xe6dbc4,
      roughness: 0.78,
      metalness: 0.03,
    })
  );

  const seawall = new THREE.Mesh(track(new THREE.BoxGeometry(5, 3.6, 395)), rusticatedMat);
  seawall.position.set(105.5, -0.35, 25);
  seawall.receiveShadow = true;
  group.add(seawall);

  // Oamaru Breakwater Stone Mole jutting eastward from South Quay to shelter the harbour basin
  const breakwaterGroup = new THREE.Group();
  breakwaterGroup.position.set(155.5, -0.35, 91);
  breakwaterGroup.rotation.y = Math.atan2(101, -70);
  const moleBase = new THREE.Mesh(track(new THREE.BoxGeometry(9.6, 3.6, 124)), rusticatedMat);
  moleBase.receiveShadow = true;
  moleBase.castShadow = true;
  const moleDeck = new THREE.Mesh(track(new THREE.BoxGeometry(8.2, 0.4, 124)), trimStoneMat);
  moleDeck.position.y = 1.9;
  const moleParapet = new THREE.Mesh(track(new THREE.BoxGeometry(1.1, 0.9, 124)), limestoneMat);
  moleParapet.position.set(-3.4, 2.4, 0);
  const moleTip = new THREE.Mesh(track(new THREE.CylinderGeometry(5.4, 6.2, 4.2, 12)), rusticatedMat);
  moleTip.position.set(0, 0.1, 62);
  const moleBeaconPost = new THREE.Mesh(track(new THREE.CylinderGeometry(0.18, 0.25, 4.6, 8)), trimStoneMat);
  moleBeaconPost.position.set(0, 4.4, 62);
  const moleBeaconMat = track(
    new THREE.MeshStandardMaterial({ color: 0xffd28a, emissive: 0xff9a2e, emissiveIntensity: 0.4, roughness: 0.25 })
  );
  const moleBeaconLight = new THREE.Mesh(track(new THREE.SphereGeometry(0.42, 10, 8)), moleBeaconMat);
  moleBeaconLight.position.set(0, 6.8, 62);
  breakwaterGroup.add(moleBase, moleDeck, moleParapet, moleTip, moleBeaconPost, moleBeaconLight);
  const bollardGeo = track(new THREE.CylinderGeometry(0.24, 0.3, 0.75, 8));
  const bollardMat = track(new THREE.MeshStandardMaterial({ color: 0x222426, roughness: 0.6, metalness: 0.65 }));
  for (let bz = -48; bz <= 48; bz += 18) {
    const bol = new THREE.Mesh(bollardGeo, bollardMat);
    bol.position.set(2.8, 2.35, bz);
    breakwaterGroup.add(bol);
  }
  group.add(breakwaterGroup);

  const wharfMat = track(
    new THREE.MeshStandardMaterial({
      map: textures.wharfTimber,
      roughness: 0.84,
      metalness: 0.04,
    })
  );
  const wharfDeck = new THREE.Mesh(track(new THREE.BoxGeometry(65, 0.35, 14.4)), wharfMat);
  wharfDeck.position.set(135.5, 0.9, 0);
  wharfDeck.receiveShadow = true;
  wharfDeck.castShadow = true;
  group.add(wharfDeck);

  const pilingGeo = track(new THREE.CylinderGeometry(0.22, 0.24, 4.2, 10));
  const pilingMat = track(new THREE.MeshStandardMaterial({ color: 0x3a2e22, roughness: 0.9 }));
  const pilings = new THREE.InstancedMesh(pilingGeo, pilingMat, 22);
  let pIdx = 0;
  for (let px = 110; px <= 165; px += 5.5) {
    [-6.6, 6.6].forEach((pz) => {
      if (pIdx < 22) {
        dummy.position.set(px, -0.8, pz);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        pilings.setMatrixAt(pIdx++, dummy.matrix);
      }
    });
  }
  pilings.computeBoundingSphere();
  group.add(pilings);

  const shipGroup = new THREE.Group();
  shipGroup.position.set(148, -1.1, -18.5);
  const hullMat = track(new THREE.MeshStandardMaterial({ color: 0x202428, roughness: 0.65, metalness: 0.3 }));
  const redOxide = track(new THREE.MeshStandardMaterial({ color: 0x6c2822, roughness: 0.72 }));
  const whiteDeck = track(new THREE.MeshStandardMaterial({ color: 0xded9ce, roughness: 0.78 }));
  const funnelMat = track(new THREE.MeshStandardMaterial({ color: 0xc27c2e, roughness: 0.55, metalness: 0.25 }));

  const hull = new THREE.Mesh(track(new THREE.BoxGeometry(36, 3.6, 8.2)), hullMat);
  hull.position.set(0, 1.4, 0);
  hull.castShadow = true;
  const waterline = new THREE.Mesh(track(new THREE.BoxGeometry(36.2, 1.1, 8.3)), redOxide);
  waterline.position.set(0, 0.2, 0);
  const bow = new THREE.Mesh(track(new THREE.ConeGeometry(4.1, 8.5, 4)), hullMat);
  bow.rotation.z = -Math.PI / 2;
  bow.rotation.x = Math.PI / 4;
  bow.position.set(22, 1.6, 0);
  const bridge = new THREE.Mesh(track(new THREE.BoxGeometry(10, 2.8, 6.2)), whiteDeck);
  bridge.position.set(-2, 4.4, 0);
  const funnel = new THREE.Mesh(track(new THREE.CylinderGeometry(0.85, 0.95, 5.2, 14)), funnelMat);
  funnel.position.set(-3, 7.2, 0);
  funnel.rotation.z = -0.1;
  const mast = new THREE.Mesh(track(new THREE.CylinderGeometry(0.14, 0.22, 12, 8)), whiteDeck);
  mast.position.set(9, 7.5, 0);
  shipGroup.add(hull, waterline, bow, bridge, funnel, mast);

  // SS Oamaru coal-fired funnel smoke puffs
  const shipSmokeMat = track(
    new THREE.MeshStandardMaterial({ color: 0x484b50, transparent: true, opacity: 0.42, roughness: 1 })
  );
  const shipSmokeGeo = track(new THREE.SphereGeometry(0.62, 8, 6));
  const shipSmokePuffs: THREE.Mesh[] = [];
  for (let s = 0; s < 6; s++) {
    const puff = new THREE.Mesh(shipSmokeGeo, shipSmokeMat);
    shipGroup.add(puff);
    shipSmokePuffs.push(puff);
  }
  group.add(shipGroup);

  const harbour: HarbourWater = createHarbourWater();
  group.add(harbour.mesh);

  // ---------------------------------------------------------------------------
  // 4. Historical Whitestone Victorian Buildings (Extended Precinct + Thames & Severn)
  // ---------------------------------------------------------------------------
  const ironRoofMat = track(
    new THREE.MeshStandardMaterial({
      map: textures.corrugatedIron,
      roughness: 0.68,
      metalness: 0.45,
    })
  );
  const archedWinMat = track(
    new THREE.MeshStandardMaterial({
      map: textures.archedWindow,
      roughness: 0.34,
      metalness: 0.22,
      emissive: new THREE.Color(0xffb454),
      emissiveIntensity: 0,
    })
  );
  const shopfrontWinMat = track(
    new THREE.MeshStandardMaterial({
      map: textures.shopfrontWindow,
      roughness: 0.25,
      metalness: 0.16,
      emissive: new THREE.Color(0xffbe68),
      emissiveIntensity: 0,
    })
  );
  const timberDoorMat = track(
    new THREE.MeshStandardMaterial({
      map: textures.timberDoors,
      roughness: 0.78,
    })
  );
  const wroughtIronMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x1d2022,
      roughness: 0.55,
      metalness: 0.7,
    })
  );
  const ironLaceMat = track(
    new THREE.MeshStandardMaterial({
      map: textures.castIronLace,
      transparent: true,
      alphaTest: 0.35,
      side: THREE.DoubleSide,
      roughness: 0.52,
      metalness: 0.65,
    })
  );
  const balustradeMat = track(
    new THREE.MeshStandardMaterial({
      map: textures.balustradeStone,
      transparent: true,
      alphaTest: 0.4,
      side: THREE.DoubleSide,
      roughness: 0.82,
      metalness: 0.02,
    })
  );
  const awningMat = track(
    new THREE.MeshStandardMaterial({
      map: textures.stripedAwning,
      side: THREE.DoubleSide,
      roughness: 0.88,
    })
  );
  const openWinMat = track(
    new THREE.MeshStandardMaterial({
      map: textures.openSashWindow,
      roughness: 0.42,
      metalness: 0.1,
      emissive: new THREE.Color(0xffb85c),
      emissiveIntensity: 0.08,
    })
  );
  const openDoorInteriorMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x382819,
      roughness: 0.88,
      emissive: new THREE.Color(0xffa742),
      emissiveIntensity: 0.22,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    })
  );
  const windowRecessMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x16120e,
      roughness: 0.95,
    })
  );
  const sackBurlapMat = track(new THREE.MeshStandardMaterial({ color: 0x9b8662, roughness: 0.94 }));
  const planterLeafMat = track(new THREE.MeshStandardMaterial({ color: 0x3b5c34, roughness: 0.88 }));
  const flowerRedMat = track(new THREE.MeshStandardMaterial({ color: 0xb63f38, roughness: 0.8 }));
  const brassHardwareMat = track(
    new THREE.MeshStandardMaterial({ color: 0xd4a64a, roughness: 0.28, metalness: 0.88 })
  );
  const posterBoardMat = track(
    new THREE.MeshStandardMaterial({ map: textures.posterCollage, roughness: 0.72 })
  );

  // Pre-cached 1914 Mural, Blade Trade Sign & Sidewalk A-Frame Materials
  const muralAdMats = (
    [
      ['Bushells Tea', 'Blue Label · Fresh From Ceylon', '#1c2d38', '#f4ebd6', '#d8aa54'],
      ['Singer Sewing', 'Machines · Terms 2/6 Weekly', '#3c1b18', '#f5ede0', '#dfaf58'],
      ['Ford Model T', 'The Universal Car · £175 F.O.B.', '#1b2430', '#f4efe3', '#e0b75e'],
      ["Speight's Ales", 'Pride of the South · Dunedin', '#261e17', '#f0e4ca', '#c9883a'],
      ['Dunlop Tyres', 'First in 1888 · Foremost Ever Since', '#29261b', '#f6edd8', '#d8a84e'],
      ['Oamaru Mail', 'Evening Paper · Est. 1876 · 1d', '#dfd3b9', '#251e18', '#862b22'],
    ] as const
  ).map(([h, s, bg, fg, acc]) =>
    track(
      new THREE.MeshStandardMaterial({
        map: textures.createVintageAdTexture(h, s, bg, fg, acc, 'mural'),
        roughness: 0.82,
        polygonOffset: true,
        polygonOffsetFactor: -1,
      })
    )
  );

  const bladeSignMats = (
    [
      ['Tea Rooms', 'Luncheon 6d', '#242f26', '#f4ead2', '#dfc074'],
      ['Chemist', 'Apothecary', '#1b2634', '#f2ece0', '#e0b765'],
      ['Bootmaker', 'Repairs Daily', '#35221a', '#f2e8d5', '#d9a44f'],
      ['Drapery', 'Silks & Hats', '#331d25', '#f6eee4', '#e3bc75'],
      ['Saddlery', 'Harness & Whip', '#2b2319', '#efe5cf', '#d59d4a'],
      ['Billiards', 'Club Saloon', '#1c2b23', '#f2e8d2', '#d7b05d'],
      ['Tobacconist', 'Finest Cigars', '#2f1e18', '#f4ead6', '#deab56'],
      ['Watchmaker', 'Optician', '#1e222a', '#f3ede0', '#dfc074'],
    ] as const
  ).map(([h, s, bg, fg, acc]) =>
    track(
      new THREE.MeshStandardMaterial({
        map: textures.createVintageAdTexture(h, s, bg, fg, acc, 'blade'),
        roughness: 0.62,
      })
    )
  );

  const aboardSignMats = (
    [
      ['Hot Pies & Tea', 'Served Fresh · 6d', '#231e19', '#f5ecda', '#d8a852'],
      ['Saturday Market', 'Otago Fruit & Eggs', '#1f2c22', '#f3ecda', '#d9b563'],
      ['Opera Tonight', '8 PM · Dress Circle 2/-', '#331b1f', '#f6efe2', '#e0b768'],
      ['Wool & Grain', 'Auction Tuesday 10 AM', '#26231c', '#f2e8d3', '#d5a44f'],
      ['Motor Trials', 'Harbour St Circuit 1914', '#1b2633', '#f4eee2', '#e2ba6a'],
      ['Best Flour', "Meek's Crown Brand", '#2c2219', '#f4ebd8', '#d7a450'],
    ] as const
  ).map(([h, s, bg, fg, acc]) =>
    track(
      new THREE.MeshStandardMaterial({
        map: textures.createVintageAdTexture(h, s, bg, fg, acc, 'aboard'),
        roughness: 0.72,
      })
    )
  );

  // Shared Architectural Relief Geometries (reused across all 30+ Oamaru buildings)
  const winRecessGeo = track(new THREE.BoxGeometry(1.82, 2.6, 0.14));
  const winGeo = track(new THREE.PlaneGeometry(1.72, 2.52));
  const winSillGeo = track(new THREE.BoxGeometry(2.14, 0.16, 0.36));
  const winJambGeo = track(new THREE.BoxGeometry(0.18, 2.66, 0.24));
  const winLintelGeo = track(new THREE.BoxGeometry(2.12, 0.26, 0.28));
  const winKeystoneGeo = track(new THREE.BoxGeometry(0.32, 0.36, 0.34));
  const doorGeo = track(new THREE.BoxGeometry(2.55, 3.25, 0.2));
  const doorLeafGeo = track(new THREE.BoxGeometry(1.18, 3.18, 0.1));
  const doorInteriorGeo = track(new THREE.BoxGeometry(2.48, 3.22, 0.14));
  const windowPlanterGeo = track(new THREE.BoxGeometry(1.72, 0.24, 0.32));
  const crateSmallGeo = track(new THREE.BoxGeometry(0.68, 0.56, 0.54));
  const sackGeo = track(new THREE.CylinderGeometry(0.24, 0.27, 0.72, 8));
  const bladePanelGeo = track(new THREE.BoxGeometry(0.08, 0.58, 1.08));
  const bladeArmGeo = track(new THREE.BoxGeometry(0.06, 0.06, 1.25));
  const aboardFaceGeo = track(new THREE.BoxGeometry(0.76, 1.06, 0.05));
  const muralGeo = track(new THREE.PlaneGeometry(6.8, 4.1));
  const quoinGeo = track(new THREE.BoxGeometry(0.68, 0.56, 0.32));
  const dentilGeo = track(new THREE.BoxGeometry(0.28, 0.26, 0.28));
  const drainPipeGeo = track(new THREE.CylinderGeometry(0.065, 0.065, 1, 7));
  const chimneyPotGeo = track(new THREE.CylinderGeometry(0.18, 0.22, 0.58, 8));
  const capitalBellGeo = track(new THREE.CylinderGeometry(0.38, 0.23, 0.44, 12));
  const capitalAbacusGeo = track(new THREE.BoxGeometry(0.76, 0.14, 0.76));
  const colBaseGeo = track(new THREE.BoxGeometry(0.7, 0.36, 0.7));
  const spandrelGeo = track(new THREE.BoxGeometry(0.08, 0.54, 0.54));
  const triWinPedGeo = track(new THREE.ConeGeometry(1.12, 0.56, 3));
  triWinPedGeo.rotateY(Math.PI / 2);
  triWinPedGeo.scale(0.18, 1, 1);

  const cornerLanternGlowMats: THREE.MeshStandardMaterial[] = [];
  const clockHands: { hour: THREE.Group; minute: THREE.Group; faceMat: THREE.MeshStandardMaterial }[] = [];
  let buildingSeedIdx = 0;

  const buildings: BuildingSpec[] = [
    // Harbour St North Arcade
    {
      x: -2,
      z: -24,
      w: 20,
      d: 24,
      floors: 2,
      facing: 'south',
      variant: 'corinthian-temple',
      title: 'Loan & Mercantile',
      subtitle: 'N.Z. Wool & Grain Agency · Est. 1882',
      signStyle: 'ghost',
    },
    {
      x: 22,
      z: -24,
      w: 24,
      d: 24,
      floors: 3,
      facing: 'south',
      variant: 'grain-hoist',
      title: "Meek's Grain & Flour",
      subtitle: 'Crown Roller Mills · Est. 1883',
      signBg: '#2b241d',
      signStyle: 'ghost',
    },
    {
      x: 48,
      z: -24,
      w: 22,
      d: 24,
      floors: 2,
      facing: 'south',
      variant: 'greek-revival',
      title: 'National Mortgage',
      subtitle: 'Agency Co. of N.Z. Ltd.',
    },
    {
      x: 72,
      z: -24,
      w: 22,
      d: 24,
      floors: 2,
      facing: 'south',
      variant: 'venetian-gothic',
      title: 'Oamaru Harbour Board',
      subtitle: 'Port Authority · Est. 1876',
      signBg: '#1c2b33',
    },
    // Harbour St South Arcade
    {
      x: 0,
      z: 25,
      w: 22,
      d: 26,
      floors: 2,
      facing: 'north',
      variant: 'greek-revival',
      title: 'Whitestone Exchange',
      subtitle: 'General Merchants & Importers',
    },
    {
      x: 24,
      z: 25,
      w: 22,
      d: 26,
      floors: 2,
      facing: 'north',
      variant: 'carriage-arch',
      title: 'Craig & Co. Timber',
      subtitle: 'Ironmongery & Timber Yards · 1879',
      signBg: '#2e221b',
    },
    {
      x: 49,
      z: 25,
      w: 24,
      d: 26,
      floors: 3,
      facing: 'north',
      variant: 'grain-hoist',
      title: 'Sumpter Produce Store',
      subtitle: 'Seed & Chaff Merchants · 1878',
    },
    {
      x: 73,
      z: 25,
      w: 20,
      d: 26,
      floors: 2,
      facing: 'north',
      variant: 'italianate-verandah',
      title: 'Imperial Hotel',
      subtitle: 'Steamship & Rail Inn · 1881',
      signBg: '#321c1d',
    },
    // Criterion Hotel & Union Bank
    {
      x: -48,
      z: 23,
      w: 23,
      d: 22,
      floors: 3,
      facing: 'north',
      variant: 'italianate-verandah',
      title: 'Criterion Hotel',
      subtitle: 'Tyne & Harbour · Est. 1877',
      signBg: '#232d26',
    },
    {
      x: -76,
      z: 24,
      w: 28,
      d: 24,
      floors: 2,
      facing: 'north',
      variant: 'carriage-arch',
      title: 'Northern Stables',
      subtitle: 'Carriage & Horse Repository · 1880',
    },
    {
      x: -49,
      z: -24,
      w: 24,
      d: 24,
      floors: 2,
      facing: 'south',
      variant: 'greek-revival',
      title: 'Union Bank of Australia',
      subtitle: 'Oamaru Branch · Est. 1866',
      signBg: '#1c242b',
    },
    // Forrester Gallery (Bank of NSW) on Thames & Itchen
    {
      x: -82,
      z: -48,
      w: 20,
      d: 22,
      floors: 2,
      facing: 'west',
      variant: 'portico-palazzo',
      title: 'Bank of New South Wales',
      subtitle: 'Thames St Portico · Est. 1883',
      signBg: '#1f232c',
    },
    // Extended Thames–Severn Civic Block
    {
      x: -126,
      z: -20,
      w: 20,
      d: 22,
      floors: 2,
      facing: 'east',
      variant: 'clocktower-civic',
      title: 'Chief Post Office',
      subtitle: 'Oamaru Postal & Telegraph · 1884',
      signBg: '#2b201b',
    },
    {
      x: -126,
      z: 18,
      w: 22,
      d: 24,
      floors: 3,
      facing: 'east',
      variant: 'corinthian-temple',
      title: 'Oamaru Opera House',
      subtitle: 'Municipal Theatre · Est. 1907',
      signBg: '#331d21',
    },
    {
      x: -128,
      z: 52,
      w: 20,
      d: 24,
      floors: 2,
      facing: 'west',
      variant: 'portico-palazzo',
      title: 'Waitaki Courthouse',
      subtitle: 'Magistrates Court · Est. 1883',
      signBg: '#1f2429',
    },
    {
      x: -128,
      z: 84,
      w: 20,
      d: 24,
      floors: 2,
      facing: 'west',
      variant: 'greek-revival',
      title: 'Oamaru Athenaeum',
      subtitle: 'Mechanics Institute & Library',
    },
    // Southern Wansbeck / Wanbrow Terrace Villas
    {
      x: 52,
      z: 92,
      w: 24,
      d: 20,
      floors: 2,
      facing: 'south',
      variant: 'italianate-verandah',
      title: 'Wanbrow Marine Villa',
      subtitle: 'Harbour Master Residence',
      signBg: '#212b26',
    },
    {
      x: -60,
      z: 92,
      w: 24,
      d: 20,
      floors: 2,
      facing: 'south',
      variant: 'greek-revival',
      title: 'Waitaki Woollen Annex',
      subtitle: 'South Terrace Stores',
    },
    // Denser Precinct Block Infills (North-West, Harbour North, South-West, South Quay, Civic)
    {
      x: -76,
      z: -24,
      w: 24,
      d: 22,
      floors: 2,
      facing: 'south',
      variant: 'italianate-verandah',
      title: 'North Otago Wool',
      subtitle: 'Fellmongers & Brokers · 1881',
      signBg: '#27241e',
    },
    {
      x: -52,
      z: -48,
      w: 24,
      d: 20,
      floors: 2,
      facing: 'north',
      variant: 'greek-revival',
      title: 'Colonial Bank Annex',
      subtitle: 'Itchen St Chambers · 1884',
    },
    {
      x: -2,
      z: -47,
      w: 20,
      d: 20,
      floors: 2,
      facing: 'north',
      variant: 'carriage-arch',
      title: 'Tyne Foundry & Forge',
      subtitle: 'Agricultural Engineers · 1880',
      signBg: '#2e241d',
    },
    {
      x: -82,
      z: 55,
      w: 24,
      d: 20,
      floors: 2,
      facing: 'west',
      variant: 'venetian-gothic',
      title: 'Oamaru Mail Press',
      subtitle: 'Printing & Stationery · 1879',
      signBg: '#1e272e',
    },
    {
      x: -82,
      z: 87,
      w: 22,
      d: 20,
      floors: 2,
      facing: 'west',
      variant: 'italianate-verandah',
      title: 'Queen’s Chambers',
      subtitle: 'Thames St Drapers · 1885',
      signBg: '#2f1f21',
    },
    {
      x: -47,
      z: 56,
      w: 24,
      d: 20,
      floors: 2,
      facing: 'east',
      variant: 'grain-hoist',
      title: 'Tyne Seed & Produce',
      subtitle: 'Merchants & Millers · 1882',
    },
    {
      x: 0,
      z: 56,
      w: 24,
      d: 20,
      floors: 2,
      facing: 'west',
      variant: 'corinthian-temple',
      title: 'Waitaki Farmers Co-op',
      subtitle: 'Stock & Station Agents · 1888',
      signBg: '#232c24',
    },
    {
      x: 73,
      z: 56,
      w: 22,
      d: 20,
      floors: 2,
      facing: 'east',
      variant: 'grain-hoist',
      title: 'Breakwater Bond Store',
      subtitle: 'Customs & Wharfage · 1877',
      signBg: '#26231d',
    },
    {
      x: 73,
      z: 84,
      w: 20,
      d: 20,
      floors: 2,
      facing: 'east',
      variant: 'greek-revival',
      title: 'Mariners Institute',
      subtitle: 'Quay Reading Rooms · 1883',
    },
    {
      x: -127,
      z: -48,
      w: 20,
      d: 20,
      floors: 2,
      facing: 'east',
      variant: 'italianate-verandah',
      title: 'Star & Garter Inn',
      subtitle: 'Itchen & Thames · Est. 1867',
      signBg: '#31201d',
    },
    // Outer Itchen St North Terrace (z = -89, facing south)
    {
      x: -78,
      z: -89,
      w: 24,
      d: 20,
      floors: 2,
      facing: 'south',
      variant: 'greek-revival',
      title: 'Itchen Stone Masons',
      subtitle: 'Whitestone Quarry Office · 1881',
    },
    {
      x: -50,
      z: -89,
      w: 24,
      d: 20,
      floors: 2,
      facing: 'south',
      variant: 'venetian-gothic',
      title: 'Otago Flour Depot',
      subtitle: 'Milling & Cartage · 1884',
      signBg: '#252a30',
    },
    {
      x: 14,
      z: -89,
      w: 24,
      d: 20,
      floors: 2,
      facing: 'south',
      variant: 'portico-palazzo',
      title: 'North Otago Chambers',
      subtitle: 'Solicitors & Surveyors · 1886',
      signBg: '#22262c',
    },
    {
      x: 44,
      z: -89,
      w: 24,
      d: 20,
      floors: 3,
      facing: 'south',
      variant: 'grain-hoist',
      title: 'Redcastle Granary',
      subtitle: 'Itchen St Stores · 1880',
    },
    // Outer Severn St Western Terrace (x = -173, facing east)
    {
      x: -173,
      z: -30,
      w: 22,
      d: 20,
      floors: 2,
      facing: 'east',
      variant: 'italianate-verandah',
      title: 'Severn Terrace Manse',
      subtitle: 'West Hillstone Residence · 1885',
      signBg: '#232b24',
    },
    {
      x: -173,
      z: 18,
      w: 24,
      d: 20,
      floors: 2,
      facing: 'east',
      variant: 'corinthian-temple',
      title: 'St. Luke Parish Hall',
      subtitle: 'Severn St Vestry · 1882',
      signBg: '#2a2220',
    },
    {
      x: -173,
      z: 64,
      w: 24,
      d: 20,
      floors: 2,
      facing: 'east',
      variant: 'greek-revival',
      title: 'Waitaki High Pavilion',
      subtitle: 'Old Boys Association · 1889',
    },
    {
      x: -77,
      z: -124,
      w: 26,
      d: 22,
      floors: 3,
      facing: 'west',
      variant: 'grain-hoist',
      title: 'Waitaki Flour Mill',
      subtitle: 'North Otago Mills · 1881',
      signBg: '#27231e',
      signStyle: 'ghost',
    },
  ];

  const buildHistoricalFacade = (spec: BuildingSpec) => {
    const bGroup = new THREE.Group();
    const baseH = getTerrainHeightAndSurface(spec.x, spec.z).height;
    bGroup.position.set(spec.x, baseH, spec.z);

    if (spec.facing === 'north') bGroup.rotation.y = Math.PI;
    else if (spec.facing === 'west') bGroup.rotation.y = -Math.PI / 2;
    else if (spec.facing === 'east') bGroup.rotation.y = Math.PI / 2;

    const floorH = 4.15;
    const totalH = spec.floors * floorH;
    const frontZ = spec.d * 0.5 + 0.04;
    const upperMat = spec.variant === 'venetian-gothic' ? polychromeMat : limestoneMat;

    const isCriterion = spec.title.includes('Criterion');
    const isOperaHouse = spec.title.includes('Opera House');
    const isBankNSW = spec.title.includes('Bank of New South Wales') || spec.title.includes('Courthouse');
    const isLoanMercantile = spec.title.includes('Loan & Mercantile');
    const isQueens = spec.title.includes('Queen’s') || spec.title.includes('Star & Garter') || spec.title.includes('Imperial');
    const isUnion = spec.title.includes('Union Bank') || spec.title.includes('Post Office') || spec.title.includes('Harbour Board');
    const hasCornerReturn =
      isCriterion ||
      isOperaHouse ||
      isBankNSW ||
      isLoanMercantile ||
      isQueens ||
      isUnion ||
      spec.title.includes('North Otago Wool');
    const hasBalustrade =
      isCriterion ||
      isBankNSW ||
      isOperaHouse ||
      isLoanMercantile ||
      spec.title.includes('Union Bank') ||
      spec.title.includes('Queen’s') ||
      spec.title.includes('North Otago Chambers');
    const isIndustrial = spec.variant === 'grain-hoist' || spec.variant === 'carriage-arch' || isLoanMercantile;
    const isCommercialGround =
      spec.variant === 'italianate-verandah' ||
      isCriterion ||
      isOperaHouse ||
      spec.title.includes('Exchange') ||
      spec.title.includes('Press') ||
      spec.title.includes('Chambers') ||
      spec.title.includes('Farmers');

    // Ground & Upper Stone Massing
    const groundMesh = new THREE.Mesh(track(new THREE.BoxGeometry(spec.w, floorH, spec.d)), rusticatedMat);
    groundMesh.position.y = floorH * 0.5;
    groundMesh.castShadow = true;
    groundMesh.receiveShadow = true;
    bGroup.add(groundMesh);

    if (spec.floors > 1) {
      const upperH = (spec.floors - 1) * floorH;
      const upperMesh = new THREE.Mesh(
        track(new THREE.BoxGeometry(spec.w - 0.1, upperH, spec.d - 0.1)),
        upperMat
      );
      upperMesh.position.y = floorH + upperH * 0.5;
      upperMesh.castShadow = true;
      upperMesh.receiveShadow = true;
      bGroup.add(upperMesh);
    }

    // Stringcourse Moulding Bands between stories
    for (let f = 1; f < spec.floors; f++) {
      const beltCourse = new THREE.Mesh(
        track(new THREE.BoxGeometry(spec.w + 0.42, 0.28, spec.d + 0.36)),
        trimStoneMat
      );
      beltCourse.position.y = f * floorH;
      bGroup.add(beltCourse);
    }

    // Layered Overhanging Cornice + Dentil Course + Balustraded/Panelled Parapet
    const lowerCornice = new THREE.Mesh(
      track(new THREE.BoxGeometry(spec.w + 0.52, 0.28, spec.d + 0.52)),
      trimStoneMat
    );
    lowerCornice.position.y = totalH + 0.14;
    const upperCornice = new THREE.Mesh(
      track(new THREE.BoxGeometry(spec.w + 0.88, 0.36, spec.d + 0.88)),
      trimStoneMat
    );
    upperCornice.position.y = totalH + 0.44;
    upperCornice.castShadow = true;
    bGroup.add(lowerCornice, upperCornice);

    // Dentil blocks tucked beneath front cornice overhang
    const dentilCount = Math.max(6, Math.floor(spec.w / 1.15));
    for (let d = 0; d < dentilCount; d++) {
      const dx = -spec.w * 0.47 + (d / Math.max(1, dentilCount - 1)) * (spec.w * 0.94);
      const dentil = new THREE.Mesh(dentilGeo, trimStoneMat);
      dentil.position.set(dx, totalH + 0.18, frontZ + 0.18);
      bGroup.add(dentil);
    }

    // Parapet (Pierced Balustrade + Stone Piers for Grand Landmarks from archival photos)
    const parapetH = isCriterion || isOperaHouse ? 1.24 : 1.02;
    if (hasBalustrade) {
      const balFront = new THREE.Mesh(track(new THREE.PlaneGeometry(spec.w + 0.1, parapetH)), balustradeMat);
      balFront.position.set(0, totalH + 0.62 + parapetH * 0.5, frontZ + 0.04);
      const balBack = new THREE.Mesh(track(new THREE.PlaneGeometry(spec.w + 0.1, parapetH)), balustradeMat);
      balBack.position.set(0, totalH + 0.62 + parapetH * 0.5, -frontZ - 0.04);
      bGroup.add(balFront, balBack);

      // Solid Stone Parapet Piers dividing balustrade bays + turned urns
      const pierGeo = track(new THREE.BoxGeometry(0.68, parapetH + 0.16, 0.56));
      const urnGeo = track(new THREE.CylinderGeometry(0.22, 0.13, 0.68, 10));
      [-spec.w * 0.48, -spec.w * 0.24, 0, spec.w * 0.24, spec.w * 0.48].forEach((px, pIdx) => {
        const pier = new THREE.Mesh(pierGeo, trimStoneMat);
        pier.position.set(px, totalH + 0.62 + parapetH * 0.5, frontZ - 0.06);
        bGroup.add(pier);
        if (pIdx !== 2) {
          const urn = new THREE.Mesh(urnGeo, trimStoneMat);
          urn.position.set(px, totalH + 0.62 + parapetH + 0.42, frontZ - 0.06);
          bGroup.add(urn);
        }
      });
    } else {
      const parapet = new THREE.Mesh(
        track(new THREE.BoxGeometry(spec.w + 0.14, parapetH, spec.d + 0.14)),
        limestoneMat
      );
      parapet.position.y = totalH + 0.62 + parapetH * 0.5;
      bGroup.add(parapet);

      const parapetCap = new THREE.Mesh(
        track(new THREE.BoxGeometry(spec.w + 0.34, 0.2, spec.d + 0.34)),
        trimStoneMat
      );
      parapetCap.position.y = totalH + 0.62 + parapetH + 0.08;
      bGroup.add(parapetCap);
    }

    // Corner Rusticated Quoins + Cast-Iron Gutter Downpipes
    [-spec.w * 0.495, spec.w * 0.495].forEach((qx) => {
      for (let qy = 0.35; qy < totalH - 0.3; qy += 1.05) {
        const quoin = new THREE.Mesh(quoinGeo, trimStoneMat);
        quoin.position.set(qx, qy, frontZ - 0.04);
        bGroup.add(quoin);
      }
      const pipe = new THREE.Mesh(drainPipeGeo, wroughtIronMat);
      pipe.scale.set(1, totalH + 0.3, 1);
      pipe.position.set(qx * 0.96, totalH * 0.5, frontZ + 0.14);
      bGroup.add(pipe);
    });

    // Wrap-around Corner Side Windows + Painted 1914 Gable Wall Advertising Murals
    if (hasCornerReturn) {
      const sideCols = Math.max(2, Math.floor(spec.d / 5.2));
      [-1, 1].forEach((sideSign) => {
        const sideX = sideSign * (spec.w * 0.5 + 0.03);
        const sideRotY = sideSign * (Math.PI / 2);
        for (let f = 0; f < spec.floors; f++) {
          const fy = f * floorH + 2.08;
          for (let sc = 0; sc < sideCols; sc++) {
            const sz = spec.d * 0.32 - (sc / Math.max(1, sideCols - 1)) * (spec.d * 0.64);
            const sGroup = new THREE.Group();
            sGroup.position.set(sideX, fy, sz);
            sGroup.rotation.y = sideRotY;
            const recess = new THREE.Mesh(winRecessGeo, windowRecessMat);
            recess.position.z = -0.04;
            const isSideOpen = (buildingSeedIdx + f + sc) % 3 === 0;
            const sWin = new THREE.Mesh(winGeo, isSideOpen ? openWinMat : archedWinMat);
            sWin.position.z = 0.048;
            const sill = new THREE.Mesh(winSillGeo, trimStoneMat);
            sill.position.set(0, -1.32, 0.12);
            const lintel = new THREE.Mesh(winLintelGeo, trimStoneMat);
            lintel.position.set(0, 1.36, 0.08);
            const keystone = new THREE.Mesh(winKeystoneGeo, trimStoneMat);
            keystone.position.set(0, 1.44, 0.12);
            sGroup.add(recess, sWin, sill, lintel, keystone);
            bGroup.add(sGroup);
          }
        }
      });
    } else if (spec.floors >= 2) {
      // Exposed stone gable side-wall vintage painted murals (Bushells Tea, Singer, Ford, Speight's)
      const muralSide = buildingSeedIdx % 2 === 0 ? 1 : -1;
      const mural = new THREE.Mesh(muralGeo, muralAdMats[buildingSeedIdx % muralAdMats.length]);
      mural.position.set(muralSide * (spec.w * 0.5 + 0.04), floorH + 1.85, 0);
      mural.rotation.y = muralSide * (Math.PI / 2);
      bGroup.add(mural);
    }

    // Hipped Corrugated Iron Roof + Twin Chimneys with Terracotta Pots
    const roofMesh = new THREE.Mesh(
      track(new THREE.ConeGeometry(Math.max(spec.w, spec.d) * 0.61, 2.75, 4)),
      ironRoofMat
    );
    roofMesh.rotation.y = Math.PI / 4;
    roofMesh.position.y = totalH + 1.88;
    bGroup.add(roofMesh);

    if (spec.variant !== 'clocktower-civic') {
      [-spec.w * 0.28, spec.w * 0.28].forEach((cx) => {
        const chimney = new THREE.Mesh(track(new THREE.BoxGeometry(1.12, 2.35, 1.12)), rusticatedMat);
        chimney.position.set(cx, totalH + 1.95, -spec.d * 0.22);
        chimney.castShadow = true;
        const capRing = new THREE.Mesh(track(new THREE.BoxGeometry(1.3, 0.2, 1.3)), trimStoneMat);
        capRing.position.set(cx, totalH + 3.12, -spec.d * 0.22);
        const pot = new THREE.Mesh(chimneyPotGeo, limestoneMat);
        pot.position.set(cx, totalH + 3.45, -spec.d * 0.22);
        bGroup.add(chimney, capRing, pot);
      });
    }

    // Pilasters / Fluted Corinthian Columns (11-bay cadence for Criterion, classical bays elsewhere)
    const cols = isCriterion ? 6 : Math.max(3, Math.floor(spec.w / 4.0));
    const isRoundCol =
      spec.variant === 'corinthian-temple' || spec.variant === 'portico-palazzo' || isOperaHouse;
    const pilasterGeo = isRoundCol
      ? track(new THREE.CylinderGeometry(0.22, 0.26, totalH - 0.4, 12))
      : track(new THREE.BoxGeometry(0.46, totalH, 0.28));

    for (let c = 0; c <= cols; c++) {
      const px = -spec.w * 0.44 + (c / cols) * (spec.w * 0.88);
      const pz = frontZ + (isRoundCol ? 0.28 : 0.04);
      const pilaster = new THREE.Mesh(pilasterGeo, isRoundCol ? trimStoneMat : limestoneMat);
      pilaster.position.set(px, totalH * 0.5, pz);
      pilaster.castShadow = true;
      bGroup.add(pilaster);

      // Carved Corinthian / Classical Capital & Molded Base
      const capAbacus = new THREE.Mesh(capitalAbacusGeo, trimStoneMat);
      capAbacus.position.set(px, totalH - 0.05, pz);
      bGroup.add(capAbacus);
      if (isRoundCol) {
        const bell = new THREE.Mesh(capitalBellGeo, trimStoneMat);
        bell.position.set(px, totalH - 0.3, pz);
        const colBase = new THREE.Mesh(colBaseGeo, trimStoneMat);
        colBase.position.set(px, 0.18, pz);
        bGroup.add(bell, colBase);
      } else {
        // Panelled Victorian drop ornament on Criterion & Italianate pilasters
        const dropOrn = new THREE.Mesh(track(new THREE.BoxGeometry(0.26, 0.44, 0.36)), trimStoneMat);
        dropOrn.position.set(px, totalH - 0.38, pz + 0.02);
        bGroup.add(dropOrn);
      }
    }

    // Recessed 3D Window Bays (Mix of Open Raised-Sash Windows, Planter Boxes, & Open Double Shop Doors!)
    for (let f = 0; f < spec.floors; f++) {
      const fy = f * floorH + 2.08;
      for (let c = 0; c < cols; c++) {
        const wx = -spec.w * 0.44 + ((c + 0.5) / cols) * (spec.w * 0.88);
        const isCenterBay = c === Math.floor(cols / 2);

        if (f === 0 && isCenterBay) {
          // Recessed double timber entrance with warm interior backing; commercial doors stand hospitably ajar!
          const jambL = new THREE.Mesh(winJambGeo, trimStoneMat);
          jambL.position.set(wx - 1.38, 1.72, frontZ + 0.1);
          const jambR = new THREE.Mesh(winJambGeo, trimStoneMat);
          jambR.position.set(wx + 1.38, 1.72, frontZ + 0.1);
          const lintel = new THREE.Mesh(
            track(new THREE.BoxGeometry(3.05, 0.32, 0.36)),
            trimStoneMat
          );
          lintel.position.set(wx, 3.45, frontZ + 0.12);
          bGroup.add(jambL, jambR, lintel);

          const isDoorOpen = isCommercialGround || isQueens || isIndustrial || buildingSeedIdx % 2 === 0;
          if (isDoorOpen) {
            const interiorBox = new THREE.Mesh(doorInteriorGeo, openDoorInteriorMat);
            interiorBox.position.set(wx, 1.66, frontZ + 0.01);
            bGroup.add(interiorBox);

            const leftPivot = new THREE.Group();
            leftPivot.position.set(wx - 1.24, 1.65, frontZ + 0.12);
            leftPivot.rotation.y = -(0.86 + (buildingSeedIdx % 3) * 0.18);
            const leftLeaf = new THREE.Mesh(doorLeafGeo, timberDoorMat);
            leftLeaf.position.set(0.59, 0, 0);
            const handleL = new THREE.Mesh(track(new THREE.SphereGeometry(0.055, 6, 6)), brassHardwareMat);
            handleL.position.set(1.05, -0.08, 0.08);
            leftPivot.add(leftLeaf, handleL);

            const rightPivot = new THREE.Group();
            rightPivot.position.set(wx + 1.24, 1.65, frontZ + 0.12);
            rightPivot.rotation.y = 0.78 + (buildingSeedIdx % 2) * 0.24;
            const rightLeaf = new THREE.Mesh(doorLeafGeo, timberDoorMat);
            rightLeaf.position.set(-0.59, 0, 0);
            const handleR = new THREE.Mesh(track(new THREE.SphereGeometry(0.055, 6, 6)), brassHardwareMat);
            handleR.position.set(-1.05, -0.08, 0.08);
            rightPivot.add(rightLeaf, handleR);

            bGroup.add(leftPivot, rightPivot);
          } else {
            const door = new THREE.Mesh(doorGeo, timberDoorMat);
            door.position.set(wx, 1.65, frontZ + 0.02);
            bGroup.add(door);
          }
        } else {
          const useShop = f === 0 && isCommercialGround;
          const isOpenSash = !useShop && (buildingSeedIdx + f * 3 + c) % 3 !== 0;
          const recess = new THREE.Mesh(winRecessGeo, windowRecessMat);
          recess.position.set(wx, fy, frontZ - 0.04);
          const win = new THREE.Mesh(
            winGeo,
            useShop ? shopfrontWinMat : isOpenSash ? openWinMat : archedWinMat
          );
          win.position.set(wx, fy, frontZ + 0.048);

          // Projecting 3D Stone Sill, Side Jambs, Lintel & Carved Keystone
          const sill = new THREE.Mesh(winSillGeo, trimStoneMat);
          sill.position.set(wx, fy - 1.32, frontZ + 0.14);
          const jambL = new THREE.Mesh(winJambGeo, trimStoneMat);
          jambL.position.set(wx - 0.94, fy, frontZ + 0.08);
          const jambR = new THREE.Mesh(winJambGeo, trimStoneMat);
          jambR.position.set(wx + 0.94, fy, frontZ + 0.08);
          const lintel = new THREE.Mesh(winLintelGeo, trimStoneMat);
          lintel.position.set(wx, fy + 1.36, frontZ + 0.1);
          const keystone = new THREE.Mesh(winKeystoneGeo, trimStoneMat);
          keystone.position.set(wx, fy + 1.44, frontZ + 0.14);
          bGroup.add(recess, win, sill, jambL, jambR, lintel, keystone);

          // Flower boxes on selected hotel/villa upper sills
          if (f === 1 && (isCriterion || isQueens || spec.title.includes('Villa')) && c % 2 === 1) {
            const pBox = new THREE.Mesh(windowPlanterGeo, crateWoodMat);
            pBox.position.set(wx, fy - 1.15, frontZ + 0.24);
            const leaves = new THREE.Mesh(track(new THREE.BoxGeometry(1.56, 0.22, 0.26)), planterLeafMat);
            leaves.position.set(wx, fy - 0.98, frontZ + 0.24);
            const blooms = new THREE.Mesh(track(new THREE.BoxGeometry(1.12, 0.1, 0.18)), flowerRedMat);
            blooms.position.set(wx, fy - 0.87, frontZ + 0.26);
            bGroup.add(pBox, leaves, blooms);
          }

          // Alternating Triangular & Classical Pediments above Piano Nobile windows
          if (f === 1 && (isBankNSW || isOperaHouse || isCriterion) && c % 2 === 0) {
            const wPed = new THREE.Mesh(triWinPedGeo, trimStoneMat);
            wPed.position.set(wx, fy + 1.68, frontZ + 0.14);
            bGroup.add(wPed);
          }
        }
      }
    }

    // -------------------------------------------------------------------------
    // Landmark-Specific Historical Features
    // -------------------------------------------------------------------------
    if (spec.variant === 'clocktower-civic') {
      // Chief Post Office (1884): Multi-stage limestone clocktower with illuminated Roman dial & live hands
      const tower = new THREE.Mesh(track(new THREE.BoxGeometry(4.6, 7.6, 4.6)), limestoneMat);
      tower.position.set(0, totalH + 3.8, frontZ - 3.6);
      tower.castShadow = true;
      const towerBelt = new THREE.Mesh(track(new THREE.BoxGeometry(5.1, 0.35, 5.1)), trimStoneMat);
      towerBelt.position.set(0, totalH + 3.1, frontZ - 3.6);
      const towerCornice = new THREE.Mesh(track(new THREE.BoxGeometry(5.3, 0.42, 5.3)), trimStoneMat);
      towerCornice.position.set(0, totalH + 7.55, frontZ - 3.6);

      const faceMat = track(
        new THREE.MeshStandardMaterial({
          map: textures.clockFace,
          roughness: 0.35,
          emissive: new THREE.Color(0xffdfa3),
          emissiveIntensity: 0.15,
        })
      );
      const clockRim = new THREE.Mesh(
        track(new THREE.TorusGeometry(1.22, 0.12, 8, 24)),
        trimStoneMat
      );
      clockRim.position.set(0, totalH + 5.35, frontZ - 1.24);
      const clockDial = new THREE.Mesh(track(new THREE.CircleGeometry(1.16, 24)), faceMat);
      clockDial.position.set(0, totalH + 5.35, frontZ - 1.22);

      // Live rotating hour & minute clock hands!
      const hourPivot = new THREE.Group();
      hourPivot.position.set(0, totalH + 5.35, frontZ - 1.18);
      const hourBlade = new THREE.Mesh(track(new THREE.BoxGeometry(0.11, 0.62, 0.03)), wroughtIronMat);
      hourBlade.position.y = 0.26;
      hourPivot.add(hourBlade);

      const minutePivot = new THREE.Group();
      minutePivot.position.set(0, totalH + 5.35, frontZ - 1.16);
      const minuteBlade = new THREE.Mesh(track(new THREE.BoxGeometry(0.075, 0.92, 0.03)), wroughtIronMat);
      minuteBlade.position.y = 0.40;
      minutePivot.add(minuteBlade);

      clockHands.push({ hour: hourPivot, minute: minutePivot, faceMat });

      const spire = new THREE.Mesh(track(new THREE.ConeGeometry(3.45, 3.8, 4)), ironRoofMat);
      spire.rotation.y = Math.PI / 4;
      spire.position.set(0, totalH + 9.5, frontZ - 3.6);

      // 4 Tower corner pinnacles
      const pinGeo = track(new THREE.CylinderGeometry(0.14, 0.24, 0.95, 8));
      [-2.1, 2.1].forEach((px) => {
        [-2.1, 2.1].forEach((pz) => {
          const pin = new THREE.Mesh(pinGeo, trimStoneMat);
          pin.position.set(px, totalH + 8.15, frontZ - 3.6 + pz);
          bGroup.add(pin);
        });
      });
      bGroup.add(tower, towerBelt, towerCornice, clockRim, clockDial, hourPivot, minutePivot, spire);
    }

    if (isOperaHouse) {
      // Oamaru Opera House (1907): Edwardian Baroque curved central pediment + sheltered street verandah
      const archCurve = new THREE.Shape();
      archCurve.moveTo(-4.8, 0);
      archCurve.quadraticCurveTo(0, 3.4, 4.8, 0);
      archCurve.closePath();
      const baroquePed = new THREE.Mesh(
        track(new THREE.ExtrudeGeometry(archCurve, { depth: 0.6, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08 })),
        trimStoneMat
      );
      baroquePed.position.set(0, totalH + 1.85, frontZ - 0.35);
      bGroup.add(baroquePed);

      const canopy = new THREE.Mesh(track(new THREE.BoxGeometry(spec.w * 0.92, 0.16, 3.1)), ironRoofMat);
      canopy.position.set(0, floorH + 0.05, frontZ + 1.5);
      canopy.rotation.x = 0.12;
      const valance = new THREE.Mesh(track(new THREE.PlaneGeometry(spec.w * 0.92, 0.65)), ironLaceMat);
      valance.position.set(0, floorH - 0.42, frontZ + 3.0);
      bGroup.add(canopy, valance);
    } else if (spec.variant === 'corinthian-temple' || spec.variant === 'portico-palazzo') {
      const pedShape = new THREE.Shape();
      const pw = Math.min(spec.w * 0.6, 10.6);
      pedShape.moveTo(-pw * 0.5, 0);
      pedShape.lineTo(pw * 0.5, 0);
      pedShape.lineTo(0, 2.45);
      pedShape.closePath();
      const ped = new THREE.Mesh(
        track(new THREE.ExtrudeGeometry(pedShape, { depth: 0.58, bevelEnabled: false })),
        trimStoneMat
      );
      ped.position.set(0, totalH + 1.72, frontZ - 0.36);
      bGroup.add(ped);

      const urnGeo = track(new THREE.CylinderGeometry(0.25, 0.14, 0.78, 12));
      [-spec.w * 0.44, -spec.w * 0.22, 0, spec.w * 0.22, spec.w * 0.44].forEach((ux, idx) => {
        const urn = new THREE.Mesh(urnGeo, trimStoneMat);
        urn.position.set(ux, totalH + (idx === 2 ? 4.42 : 2.18), frontZ - 0.08);
        bGroup.add(urn);
      });

      if (spec.variant === 'portico-palazzo') {
        const steps = new THREE.Mesh(track(new THREE.BoxGeometry(8.8, 0.78, 2.8)), rusticatedMat);
        steps.position.set(0, 0.39, frontZ + 1.2);
        const porticoRoof = new THREE.Mesh(track(new THREE.BoxGeometry(8.6, 0.5, 2.4)), trimStoneMat);
        porticoRoof.position.set(0, totalH - 0.15, frontZ + 1.05);
        bGroup.add(steps, porticoRoof);
      }
    }

    if (spec.variant === 'grain-hoist') {
      const pedShape = new THREE.Shape();
      pedShape.moveTo(-4.6, 0);
      pedShape.lineTo(4.6, 0);
      pedShape.lineTo(0, 2.55);
      pedShape.closePath();
      const ped = new THREE.Mesh(
        track(new THREE.ExtrudeGeometry(pedShape, { depth: 0.5, bevelEnabled: false })),
        trimStoneMat
      );
      ped.position.set(0, totalH + 1.72, frontZ - 0.3);
      bGroup.add(ped);

      const hoistBeam = new THREE.Mesh(track(new THREE.BoxGeometry(0.26, 0.26, 2.4)), wroughtIronMat);
      hoistBeam.position.set(0, totalH + 1.35, frontZ + 1.0);
      const pulley = new THREE.Mesh(track(new THREE.TorusGeometry(0.24, 0.045, 6, 12)), wroughtIronMat);
      pulley.rotation.y = Math.PI / 2;
      pulley.position.set(0, totalH + 1.05, frontZ + 1.85);
      const chainDrop = new THREE.Mesh(track(new THREE.CylinderGeometry(0.025, 0.025, 1.4, 6)), wroughtIronMat);
      chainDrop.position.set(0, totalH + 0.3, frontZ + 1.85);
      bGroup.add(hoistBeam, pulley, chainDrop);
    }

    if (spec.variant === 'venetian-gothic') {
      const pole = new THREE.Mesh(track(new THREE.CylinderGeometry(0.05, 0.08, 6.2, 8)), wroughtIronMat);
      pole.position.set(0, totalH + 4.3, frontZ - 0.5);
      const flag = new THREE.Mesh(
        track(new THREE.BoxGeometry(1.8, 1.0, 0.05)),
        track(new THREE.MeshStandardMaterial({ color: 0x1d3f6e, roughness: 0.8 }))
      );
      flag.position.set(0.9, totalH + 6.6, frontZ - 0.5);
      bGroup.add(pole, flag);
    }

    if (spec.variant === 'italianate-verandah') {
      const vDepth = 3.35;
      const vZ = spec.d * 0.5 + vDepth * 0.5;
      const balconyFloor = new THREE.Mesh(track(new THREE.BoxGeometry(spec.w, 0.16, vDepth)), wroughtIronMat);
      balconyFloor.position.set(0, floorH - 0.15, vZ);
      balconyFloor.castShadow = true;
      bGroup.add(balconyFloor);

      const balconyRoof = new THREE.Mesh(track(new THREE.BoxGeometry(spec.w, 0.12, vDepth + 0.22)), ironRoofMat);
      balconyRoof.position.set(0, floorH * 2 - 0.25, vZ);
      balconyRoof.rotation.x = 0.14;
      bGroup.add(balconyRoof);

      const postGeo = track(new THREE.CylinderGeometry(0.056, 0.078, floorH * 2 - 0.2, 10));
      for (let i = 0; i < 6; i++) {
        const px = -spec.w * 0.46 + (i / 5) * (spec.w * 0.92);
        const post = new THREE.Mesh(postGeo, wroughtIronMat);
        post.position.set(px, floorH - 0.1, spec.d * 0.5 + vDepth - 0.2);
        post.castShadow = true;
        bGroup.add(post);

        // Decorative spandrel brackets inside verandah eaves (from photo 1 & 2)
        const brk = new THREE.Mesh(spandrelGeo, wroughtIronMat);
        brk.position.set(px, floorH - 0.45, spec.d * 0.5 + vDepth - 0.45);
        brk.rotation.x = Math.PI / 4;
        bGroup.add(brk);
      }

      const laceBalustrade = new THREE.Mesh(track(new THREE.PlaneGeometry(spec.w, 0.98)), ironLaceMat);
      laceBalustrade.position.set(0, floorH + 0.36, spec.d * 0.5 + vDepth - 0.15);
      const lowerFriezeLace = new THREE.Mesh(track(new THREE.PlaneGeometry(spec.w, 0.54)), ironLaceMat);
      lowerFriezeLace.position.set(0, floorH - 0.48, spec.d * 0.5 + vDepth - 0.16);
      bGroup.add(laceBalustrade, lowerFriezeLace);

      // Slanted Striped Canvas Shop Sun-Blind along lower verandah bay (photo 1 & 3)
      const awning = new THREE.Mesh(track(new THREE.PlaneGeometry(spec.w * 0.52, 1.35)), awningMat);
      awning.position.set(-spec.w * 0.18, floorH - 0.92, spec.d * 0.5 + vDepth + 0.26);
      awning.rotation.x = 0.46;
      bGroup.add(awning);

      // Rooftop Verandah Cresting Signboard (M. SKINNER / BROWNLEES photo 1 & 2)
      const shortTitle = spec.title.split(' ')[0] + (spec.title.includes('&') ? ' & Co.' : '');
      const roofSignTex = textures.createSignTexture(shortTitle, spec.subtitle, '#1b1a18', '#f0e7d4', 'roofsign');
      const roofSignMat = track(new THREE.MeshStandardMaterial({ map: roofSignTex, roughness: 0.62 }));
      const roofSign = new THREE.Mesh(track(new THREE.BoxGeometry(spec.w * 0.36, 0.72, 0.12)), roofSignMat);
      roofSign.position.set(spec.w * 0.2, floorH * 2 + 0.08, spec.d * 0.5 + vDepth - 0.28);
      bGroup.add(roofSign);

      if (isCriterion) {
        // Criterion Hotel (1877): Central ornate scrollwork tympanum!
        const tympCurve = new THREE.Shape();
        tympCurve.moveTo(-4.4, 0);
        tympCurve.quadraticCurveTo(0, 2.55, 4.4, 0);
        tympCurve.closePath();
        const tympanum = new THREE.Mesh(
          track(new THREE.ExtrudeGeometry(tympCurve, { depth: 0.48, bevelEnabled: false })),
          trimStoneMat
        );
        tympanum.position.set(0, totalH + 1.82, frontZ - 0.25);
        bGroup.add(tympanum);
      }
    } else if (isCommercialGround && !isOperaHouse) {
      // Single-Storey Corrugated-Iron Footpath Verandah with Slender Cast-Iron Posts & Sun-Blinds (photo 1 & 2)
      const vDepth = 3.3;
      const vZ = spec.d * 0.5 + vDepth * 0.5;
      const canopy = new THREE.Mesh(track(new THREE.BoxGeometry(spec.w, 0.12, vDepth + 0.18)), ironRoofMat);
      canopy.position.set(0, floorH + 0.04, vZ);
      canopy.rotation.x = 0.12;
      canopy.castShadow = true;
      bGroup.add(canopy);

      const postGeo = track(new THREE.CylinderGeometry(0.052, 0.07, floorH - 0.1, 8));
      for (let i = 0; i < 5; i++) {
        const px = -spec.w * 0.45 + (i / 4) * (spec.w * 0.9);
        const post = new THREE.Mesh(postGeo, wroughtIronMat);
        post.position.set(px, (floorH - 0.1) * 0.5, spec.d * 0.5 + vDepth - 0.18);
        post.castShadow = true;
        bGroup.add(post);

        const brk = new THREE.Mesh(spandrelGeo, wroughtIronMat);
        brk.position.set(px, floorH - 0.42, spec.d * 0.5 + vDepth - 0.42);
        brk.rotation.x = Math.PI / 4;
        bGroup.add(brk);
      }
      const valance = new THREE.Mesh(track(new THREE.PlaneGeometry(spec.w, 0.56)), ironLaceMat);
      valance.position.set(0, floorH - 0.44, spec.d * 0.5 + vDepth - 0.14);
      const blind = new THREE.Mesh(track(new THREE.PlaneGeometry(spec.w * 0.44, 1.3)), awningMat);
      blind.position.set(spec.w * 0.22, floorH - 0.88, spec.d * 0.5 + vDepth + 0.24);
      blind.rotation.x = 0.45;
      bGroup.add(valance, blind);
    }

    // Hanging Wrought-Iron Corner Gas Lanterns on Notable Corners (photo 3)
    if (isCriterion || isBankNSW || isQueens) {
      const arm = new THREE.Mesh(track(new THREE.BoxGeometry(0.08, 0.08, 1.1)), wroughtIronMat);
      arm.position.set(spec.w * 0.46, floorH - 0.25, frontZ + 0.52);
      const lGlowMat = track(
        new THREE.MeshStandardMaterial({
          color: 0xffe6ad,
          emissive: new THREE.Color(0xffb448),
          emissiveIntensity: 0.4,
          roughness: 0.2,
        })
      );
      cornerLanternGlowMats.push(lGlowMat);
      const lCage = new THREE.Mesh(track(new THREE.CylinderGeometry(0.22, 0.14, 0.42, 6)), lGlowMat);
      lCage.position.set(spec.w * 0.46, floorH - 0.52, frontZ + 0.96);
      const lCap = new THREE.Mesh(track(new THREE.ConeGeometry(0.26, 0.18, 6)), wroughtIronMat);
      lCap.position.set(spec.w * 0.46, floorH - 0.26, frontZ + 0.96);
      bGroup.add(arm, lCage, lCap);
    }

    // Period Signage (Ghost Friezes on Wool/Grain Stores, Framed Gold-Leaf Fascia Elsewhere)
    const signTex = textures.createSignTexture(
      spec.title,
      spec.subtitle,
      spec.signBg,
      '#e6c57a',
      spec.signStyle ?? 'goldleaf'
    );
    const signMat = track(new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.65 }));
    const signW = spec.signStyle === 'ghost' ? spec.w * 0.82 : spec.w * 0.74;
    const signH = spec.signStyle === 'ghost' ? 1.55 : 1.32;
    const signY = spec.signStyle === 'ghost' ? totalH - 0.72 : floorH + 0.14;
    const signBoard = new THREE.Mesh(track(new THREE.BoxGeometry(signW, signH, 0.16)), signMat);
    signBoard.position.set(0, signY, frontZ + 0.18);
    bGroup.add(signBoard);

    // 1914 Commercial Clutter: Projecting Verandah Blade Trade Signs, Sidewalk A-Frames & Market Crates
    if (isCommercialGround || isQueens || isIndustrial) {
      // Double-sided hanging trade blade sign projecting over footpath
      const bladeSide = buildingSeedIdx % 2 === 0 ? -1 : 1;
      const bladeX = bladeSide * spec.w * 0.28;
      const bArm = new THREE.Mesh(bladeArmGeo, wroughtIronMat);
      bArm.position.set(bladeX, floorH - 0.56, frontZ + 0.72);
      const bPanel = new THREE.Mesh(
        bladePanelGeo,
        bladeSignMats[buildingSeedIdx % bladeSignMats.length]
      );
      bPanel.position.set(bladeX, floorH - 0.88, frontZ + 0.82);
      bPanel.castShadow = true;
      bGroup.add(bArm, bPanel);

      // Sidewalk A-frame advertising sandwich board tucked neatly beside verandah kerb
      const abGroup = new THREE.Group();
      abGroup.position.set(-bladeSide * (spec.w * 0.24), 0.54, frontZ + 1.65);
      abGroup.rotation.y = bladeSide * 0.24;
      const abMat = aboardSignMats[buildingSeedIdx % aboardSignMats.length];
      const legF = new THREE.Mesh(aboardFaceGeo, abMat);
      legF.rotation.x = -0.24;
      legF.position.z = 0.14;
      legF.castShadow = true;
      const legB = new THREE.Mesh(aboardFaceGeo, abMat);
      legB.rotation.x = 0.24;
      legB.position.z = -0.14;
      abGroup.add(legF, legB);
      bGroup.add(abGroup);

      // Market display crates & flour/grain sacks hugging building plinth
      const crateL = new THREE.Mesh(crateSmallGeo, crateWoodMat);
      crateL.position.set(-spec.w * 0.34, 0.28, frontZ + 0.55);
      crateL.rotation.y = 0.18;
      crateL.castShadow = true;
      const sack = new THREE.Mesh(sackGeo, sackBurlapMat);
      sack.position.set(-spec.w * 0.34 + 0.65, 0.36, frontZ + 0.52);
      sack.rotation.z = 0.14;
      bGroup.add(crateL, sack);

      // Barber pole outside Queen's Chambers / Criterion arcade
      if (isQueens && buildingSeedIdx % 2 === 1) {
        const poleShaft = new THREE.Mesh(
          track(new THREE.CylinderGeometry(0.09, 0.09, 1.35, 10)),
          track(new THREE.MeshStandardMaterial({ color: 0xab2424, roughness: 0.4 }))
        );
        poleShaft.position.set(spec.w * 0.42, 1.65, frontZ + 0.24);
        const poleRing = new THREE.Mesh(
          track(new THREE.CylinderGeometry(0.105, 0.105, 0.42, 10)),
          track(new THREE.MeshStandardMaterial({ color: 0xf4efe6, roughness: 0.4 }))
        );
        poleRing.position.set(spec.w * 0.42, 1.65, frontZ + 0.24);
        const poleCap = new THREE.Mesh(track(new THREE.SphereGeometry(0.11, 8, 8)), brassHardwareMat);
        poleCap.position.set(spec.w * 0.42, 2.35, frontZ + 0.24);
        bGroup.add(poleShaft, poleRing, poleCap);
      }
    }

    // Civic Handbill / Playbill Noticeboards near Opera House, Post Office & Harbour Board
    if (isOperaHouse || spec.variant === 'clocktower-civic' || isUnion) {
      const kioskFrame = new THREE.Mesh(track(new THREE.BoxGeometry(2.6, 1.45, 0.16)), crateWoodMat);
      kioskFrame.position.set(spec.w * 0.28, 1.55, frontZ + 0.22);
      const kioskFace = new THREE.Mesh(track(new THREE.PlaneGeometry(2.42, 1.24)), posterBoardMat);
      kioskFace.position.set(spec.w * 0.28, 1.55, frontZ + 0.31);
      bGroup.add(kioskFrame, kioskFace);
    }

    buildingSeedIdx += 1;
    group.add(bGroup);
  };

  buildings.forEach(buildHistoricalFacade);

  // ---------------------------------------------------------------------------
  // 4b. Cape Wanbrow Lighthouse, Thames Railway Overbridge & Arthur's Standpipe
  // ---------------------------------------------------------------------------
  // Arthur's Garage Radiator Water Standpipe (Harbour St North kerb near Union Bank)
  {
    const spGroup = new THREE.Group();
    const spy = getTerrainHeightAndSurface(RADIATOR_STANDPIPE.x, RADIATOR_STANDPIPE.z, true).height;
    spGroup.position.set(RADIATOR_STANDPIPE.x, spy, RADIATOR_STANDPIPE.z);
    const castGreenMat = track(new THREE.MeshStandardMaterial({ color: 0x1c4a32, roughness: 0.55, metalness: 0.35 }));
    const waterPoolMat = track(new THREE.MeshStandardMaterial({ color: 0x39768e, roughness: 0.14, metalness: 0.2 }));
    const col = new THREE.Mesh(track(new THREE.CylinderGeometry(0.11, 0.14, 1.38, 10)), castGreenMat);
    col.position.y = 0.69;
    col.castShadow = true;
    const cap = new THREE.Mesh(track(new THREE.SphereGeometry(0.14, 10, 8)), brassHardwareMat);
    cap.position.y = 1.4;
    const valveWheel = new THREE.Mesh(track(new THREE.TorusGeometry(0.11, 0.02, 6, 12)), brassHardwareMat);
    valveWheel.position.set(0.14, 1.08, 0);
    valveWheel.rotation.y = Math.PI / 2;
    const spout = new THREE.Mesh(track(new THREE.TorusGeometry(0.22, 0.03, 6, 12, Math.PI)), brassHardwareMat);
    spout.position.set(0, 1.15, 0.22);
    spout.rotation.y = Math.PI / 2;
    const troughFrame = new THREE.Mesh(track(new THREE.BoxGeometry(1.1, 0.34, 0.52)), crateWoodMat);
    troughFrame.position.set(0, 0.17, 0.55);
    troughFrame.castShadow = true;
    const troughWater = new THREE.Mesh(track(new THREE.BoxGeometry(0.96, 0.08, 0.38)), waterPoolMat);
    troughWater.position.set(0, 0.31, 0.55);
    const spSignTex = textures.createVintageAdTexture('WATER', 'Radiators · Standpipe', '#193b29', '#f6eee0', '#dfc074', 'aboard');
    const spSignMat = track(new THREE.MeshStandardMaterial({ map: spSignTex, roughness: 0.6 }));
    const spSign = new THREE.Mesh(track(new THREE.BoxGeometry(0.68, 0.44, 0.05)), spSignMat);
    spSign.position.set(0, 1.78, 0);
    const spPost = new THREE.Mesh(track(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 6)), wroughtIronMat);
    spPost.position.set(0, 1.54, 0);
    spGroup.add(col, cap, valveWheel, spout, troughFrame, troughWater, spSign, spPost);
    group.add(spGroup);
  }

  // Cape Wanbrow Lighthouse & Maritime Signal Station (42, 174)
  const lighthouseLanternMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xfff3cc,
      emissive: 0xffc65c,
      emissiveIntensity: 0.45,
      roughness: 0.18,
    })
  );
  const beaconBeamMat = track(
    new THREE.MeshBasicMaterial({
      color: 0xffe8a3,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );
  const beaconPivot = new THREE.Group();
  {
    const lhBaseY = getTerrainHeightAndSurface(42, 174, true).height;
    const lhGroup = new THREE.Group();
    lhGroup.position.set(42, lhBaseY, 174);
    const whiteTowerMat = track(new THREE.MeshStandardMaterial({ color: 0xf4efe3, roughness: 0.72 }));
    const redRoofMat = track(new THREE.MeshStandardMaterial({ color: 0x8f2924, roughness: 0.62 }));

    const plinth = new THREE.Mesh(track(new THREE.BoxGeometry(6.8, 1.4, 6.8)), rusticatedMat);
    plinth.position.y = 0.7;
    plinth.castShadow = true;
    const tower = new THREE.Mesh(track(new THREE.CylinderGeometry(1.75, 2.55, 11.4, 16)), whiteTowerMat);
    tower.position.y = 7.1;
    tower.castShadow = true;
    const gallery = new THREE.Mesh(track(new THREE.CylinderGeometry(2.35, 2.35, 0.3, 16)), wroughtIronMat);
    gallery.position.y = 12.9;
    const lanternGlass = new THREE.Mesh(track(new THREE.CylinderGeometry(1.42, 1.42, 1.85, 12)), lighthouseLanternMat);
    lanternGlass.position.y = 13.9;
    const dome = new THREE.Mesh(track(new THREE.SphereGeometry(1.52, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.5)), redRoofMat);
    dome.position.y = 14.8;
    const finial = new THREE.Mesh(track(new THREE.ConeGeometry(0.18, 0.9, 8)), brassHardwareMat);
    finial.position.y = 16.5;

    beaconPivot.position.set(0, 14.0, 0);
    const beamGeo = track(new THREE.ConeGeometry(5.5, 42, 16, 1, true));
    beamGeo.rotateX(Math.PI / 2);
    const beamA = new THREE.Mesh(beamGeo, beaconBeamMat);
    beamA.position.z = 21;
    const beamB = new THREE.Mesh(beamGeo, beaconBeamMat);
    beamB.rotation.y = Math.PI;
    beamB.position.z = -21;
    beaconPivot.add(beamA, beamB);

    // Keeper's Stone Cottage beside tower
    const cottage = new THREE.Mesh(track(new THREE.BoxGeometry(9.6, 3.6, 7.2)), limestoneMat);
    cottage.position.set(-8.2, 1.8, -1.5);
    cottage.castShadow = true;
    const cottageRoof = new THREE.Mesh(track(new THREE.ConeGeometry(6.8, 2.4, 4)), redRoofMat);
    cottageRoof.rotation.y = Math.PI / 4;
    cottageRoof.position.set(-8.2, 4.8, -1.5);
    // Signal Flagstaff
    const flagPole = new THREE.Mesh(track(new THREE.CylinderGeometry(0.08, 0.14, 9.5, 8)), whiteTowerMat);
    flagPole.position.set(7.2, 4.75, 2.2);
    const yardarm = new THREE.Mesh(track(new THREE.CylinderGeometry(0.05, 0.05, 3.6, 6)), whiteTowerMat);
    yardarm.rotation.z = Math.PI / 2;
    yardarm.position.set(7.2, 7.8, 2.2);
    const signalFlag = new THREE.Mesh(track(new THREE.BoxGeometry(1.6, 0.95, 0.06)), redRoofMat);
    signalFlag.position.set(8.1, 8.8, 2.2);

    lhGroup.add(plinth, tower, gallery, lanternGlass, dome, finial, beaconPivot, cottage, cottageRoof, flagPole, yardarm, signalFlag);
    group.add(lhGroup);
  }

  // Thames North Railway Overbridge spanning Severn St & Thames St at z = -124
  {
    const obGroup = new THREE.Group();
    const deckY = 8.8;
    const pierWest = new THREE.Mesh(track(new THREE.BoxGeometry(7.2, 8.8, 12)), rusticatedMat);
    pierWest.position.set(-164, 4.4, -124);
    pierWest.castShadow = true;
    const pierCenter = new THREE.Mesh(track(new THREE.BoxGeometry(24, 8.8, 12)), rusticatedMat);
    pierCenter.position.set(-128, 4.4, -124);
    pierCenter.castShadow = true;
    const pierEast = new THREE.Mesh(track(new THREE.BoxGeometry(4.2, 8.8, 12)), rusticatedMat);
    pierEast.position.set(-93.8, 4.4, -124);
    pierEast.castShadow = true;

    const girderMat = track(new THREE.MeshStandardMaterial({ color: 0x26292d, roughness: 0.58, metalness: 0.65 }));
    const deckTimber = track(new THREE.MeshStandardMaterial({ color: 0x6c4c2f, roughness: 0.82 }));
    const deckSlab = new THREE.Mesh(track(new THREE.BoxGeometry(74, 0.55, 7.6)), deckTimber);
    deckSlab.position.set(-129, deckY, -124);
    deckSlab.castShadow = true;
    const girderSouth = new THREE.Mesh(track(new THREE.BoxGeometry(74, 2.1, 0.45)), girderMat);
    girderSouth.position.set(-129, deckY + 0.85, -120.3);
    girderSouth.castShadow = true;
    const girderNorth = new THREE.Mesh(track(new THREE.BoxGeometry(74, 2.1, 0.45)), girderMat);
    girderNorth.position.set(-129, deckY + 0.85, -127.7);
    girderNorth.castShadow = true;
    const railSpan = new THREE.Mesh(track(new THREE.BoxGeometry(74, 0.16, 0.12)), girderMat);
    const railN = railSpan.clone();
    railN.position.set(-129, deckY + 0.36, -124.75);
    const railS = railSpan.clone();
    railS.position.set(-129, deckY + 0.36, -123.25);

    const obSignTex = textures.createSignTexture('N.Z. RAILWAYS', 'CLEARANCE 18 FT · SLOW THROUGH ARCH', '#1b1d20', '#f4ead2', 'goldleaf');
    const obSignMat = track(new THREE.MeshStandardMaterial({ map: obSignTex, roughness: 0.6 }));
    const obSign = new THREE.Mesh(track(new THREE.BoxGeometry(10.5, 1.15, 0.14)), obSignMat);
    obSign.position.set(-104, deckY + 0.8, -120.0);
    const obSignBack = obSign.clone();
    obSignBack.rotation.y = Math.PI;
    obSignBack.position.set(-104, deckY + 0.8, -128.0);
    obGroup.add(pierWest, pierCenter, pierEast, deckSlab, girderSouth, girderNorth, railN, railS, obSign, obSignBack);
    group.add(obGroup);
  }

  // ---------------------------------------------------------------------------
  // 5. Streetlamps, Trees & Seasonal Snow/Wetness Materials
  // ---------------------------------------------------------------------------
  const lampPostGeo = track(new THREE.CylinderGeometry(0.06, 0.13, 4.6, 8));
  const lampHeadGeo = track(new THREE.SphereGeometry(0.24, 10, 8));
  const lampGlowMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xffe4a8,
      emissive: new THREE.Color(0xffb84d),
      emissiveIntensity: 0.45,
      roughness: 0.2,
    })
  );

  const lampCoords: [number, number][] = [];
  for (let lx = -90; lx <= 85; lx += 30) {
    lampCoords.push([lx, -8.8], [lx, 8.8]);
  }
  for (let lz = -135; lz <= 105; lz += 32) {
    lampCoords.push([-112.5, lz], [-143.5, lz], [87.5, lz]);
  }
  for (let lx = -135; lx <= 75; lx += 35) {
    lampCoords.push([lx, 109.5]);
    lampCoords.push([lx, 187.5]);
  }

  const postInst = new THREE.InstancedMesh(lampPostGeo, wroughtIronMat, lampCoords.length);
  const headInst = new THREE.InstancedMesh(lampHeadGeo, lampGlowMat, lampCoords.length);
  lampCoords.forEach(([lx, lz], i) => {
    const ly = getTerrainHeightAndSurface(lx, lz).height;
    dummy.position.set(lx, ly + 2.3, lz);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    postInst.setMatrixAt(i, dummy.matrix);

    dummy.position.set(lx, ly + 4.7, lz);
    dummy.updateMatrix();
    headInst.setMatrixAt(i, dummy.matrix);
  });
  postInst.castShadow = true;
  postInst.computeBoundingSphere();
  headInst.computeBoundingSphere();
  group.add(postInst, headInst);

  const lampArmGeo = track(new THREE.BoxGeometry(0.62, 0.055, 0.055));
  lampArmGeo.translate(0.31, 0, 0);
  const lampArmInst = new THREE.InstancedMesh(lampArmGeo, wroughtIronMat, lampCoords.length);
  const haloCanvas = document.createElement('canvas');
  haloCanvas.width = 256;
  haloCanvas.height = 256;
  const haloCtx = haloCanvas.getContext('2d')!;
  const haloGrad = haloCtx.createRadialGradient(128, 128, 0, 128, 128, 126);
  haloGrad.addColorStop(0, 'rgba(255, 246, 220, 0.96)');
  haloGrad.addColorStop(0.07, 'rgba(255, 214, 142, 0.72)');
  haloGrad.addColorStop(0.18, 'rgba(255, 168, 64, 0.32)');
  haloGrad.addColorStop(0.42, 'rgba(255, 132, 36, 0.1)');
  haloGrad.addColorStop(1, 'rgba(255, 110, 24, 0)');
  haloCtx.fillStyle = haloGrad;
  haloCtx.fillRect(0, 0, 256, 256);
  const mantle = haloCtx.createRadialGradient(128, 128, 2, 128, 128, 18);
  mantle.addColorStop(0, 'rgba(255, 252, 240, 0.9)');
  mantle.addColorStop(1, 'rgba(255, 220, 160, 0)');
  haloCtx.fillStyle = mantle;
  haloCtx.fillRect(0, 0, 256, 256);
  const haloTex = track(new THREE.CanvasTexture(haloCanvas));
  haloTex.colorSpace = THREE.SRGBColorSpace;
  const haloMat = track(
    new THREE.SpriteMaterial({
      map: haloTex,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0,
    })
  );
  const lampHalos: THREE.Sprite[] = [];
  lampCoords.forEach(([lx, lz], i) => {
    const ly = getTerrainHeightAndSurface(lx, lz).height;
    const towardStreet = Math.abs(lz) > 2 && Math.abs(lz) < 20 ? (lz > 0 ? -Math.PI / 2 : Math.PI / 2) : lx > 0 ? Math.PI : 0;
    dummy.position.set(lx, ly + 4.55, lz);
    dummy.rotation.set(0, towardStreet, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    lampArmInst.setMatrixAt(i, dummy.matrix);

    const halo = new THREE.Sprite(haloMat);
    halo.position.set(lx, ly + 4.75, lz);
    halo.scale.set(3.4, 3.4, 1);
    halo.visible = false;
    group.add(halo);
    lampHalos.push(halo);
  });
  lampArmInst.computeBoundingSphere();
  group.add(lampArmInst);

  const streetPointLights: THREE.PointLight[] = [];
  const lightPositions: [number, number][] = [
    [-46, 8.8],
    [-12, -8.8],
    [22, 8.8],
    [56, -8.8],
    [95, 45],
    [20, 118],
    [-104, -30],
    [-152, 35],
    [42, 196],
    [-104, -124],
  ];
  lightPositions.forEach(([px, pz]) => {
    const py = getTerrainHeightAndSurface(px, pz).height;
    const pl = new THREE.PointLight(0xffb95e, 0, 28, 1.7);
    pl.position.set(px, py + 4.8, pz);
    group.add(pl);
    streetPointLights.push(pl);
  });

  // Otago Cabbage Trees & Norfolk Pines along verges & hillsides
  const treeCoords: [number, number][] = [
    [-190, -45], [-192, -10], [-190, 30], [-192, 72], [-174, 110],
    [76, 134], [42, 136], [-12, 138], [-65, 136], [-125, 136],
    [112, 108], [115, 78], [58, -108], [18, -108], [-55, -108],
    [-88, -108], [78, -104], [-188, -80], [-172, 145], [108, 135],
  ];
  const trunkMat = track(new THREE.MeshStandardMaterial({ color: 0x4e3e2d, roughness: 0.92 }));
  const cardMat = (map: THREE.Texture) =>
    track(
      new THREE.MeshStandardMaterial({
        map,
        color: 0xffffff,
        roughness: 0.92,
        metalness: 0,
        transparent: true,
        alphaTest: 0.28,
        side: THREE.DoubleSide,
      })
    );
  const cabbageMat = cardMat(textures.cabbageTree);
  const macrocarpaMat = cardMat(textures.macrocarpa);

  // One plane, yawed toward the camera. A second crossed plane shows up as a
  // knife edge through a wide crown. Local +z faces the viewer when
  // rotation.y = atan2(camera.x - x, camera.z - z).
  const uprightCard = (width: number, height: number) => {
    const g = track(new THREE.PlaneGeometry(width, height));
    g.translate(0, height * 0.5, 0);
    return g;
  };
  const foliageBillboards: { mesh: THREE.InstancedMesh; places: { x: number; y: number; z: number; s: number }[] }[] = [];
  const cabbageGeo = uprightCard(3.6, 7.2);
  const macroGeo = uprightCard(10.4, 5.2);
  const cabbageCoords = treeCoords.filter((_, i) => i % 2 === 0);
  const macroCoords = treeCoords.filter((_, i) => i % 2 === 1);
  const cabbageInst = new THREE.InstancedMesh(cabbageGeo, cabbageMat, cabbageCoords.length);
  const macroInst = new THREE.InstancedMesh(macroGeo, macrocarpaMat, macroCoords.length);
  cabbageInst.name = 'cabbage-cards';
  macroInst.name = 'macrocarpa-cards';
  const tint = new THREE.Color();
  const placeCards = (coords: [number, number][], inst: THREE.InstancedMesh) => {
    const places: { x: number; y: number; z: number; s: number }[] = [];
    coords.forEach(([tx, tz], i) => {
      const ty = getTerrainHeightAndSurface(tx, tz).height;
      const sc = 0.85 + ((i * 37) % 10) * 0.04;
      places.push({ x: tx, y: ty, z: tz, s: sc });
      dummy.position.set(tx, ty, tz);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(sc, sc, sc);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
      tint.setRGB(0.92 + (i % 3) * 0.03, 0.94, 0.9);
      inst.setColorAt(i, tint);
    });
    inst.castShadow = false;
    inst.frustumCulled = false;
    inst.computeBoundingSphere();
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    foliageBillboards.push({ mesh: inst, places });
    group.add(inst);
  };
  placeCards(cabbageCoords, cabbageInst);
  placeCards(macroCoords, macroInst);

  // Signature White-Painted Slatted Street Tree Guards & Saplings (from photo 1: Oamaru.N.Z.F.G.R.5747)
  const treeGuardCoords: [number, number][] = [
    [-112.1, -56], [-112.1, -42], [-112.1, -28], [-112.1, -14],
    [-112.1, 16], [-112.1, 30], [-112.1, 44], [-112.1, 58], [-112.1, 72], [-112.1, 86],
    [-95.9, -56], [-95.9, -42], [-95.9, -28], [-95.9, -14],
    [-95.9, 16], [-95.9, 30], [-95.9, 44], [-95.9, 58], [-95.9, 72], [-95.9, 86],
    [-82, -7.9], [-68, -7.9], [-40, -7.9], [-10, -7.9], [6, -7.9], [36, -7.9], [62, -7.9],
    [-82, 7.9], [-68, 7.9], [-40, 7.9], [-10, 7.9], [6, 7.9], [36, 7.9], [62, 7.9],
  ];
  const whitePaintMat = track(new THREE.MeshStandardMaterial({ color: 0xede6d8, roughness: 0.78 }));
  const saplingCardMat = cardMat(textures.cabbageTree);
  const guardPostGeo = track(new THREE.BoxGeometry(0.06, 1.55, 0.06));
  const guardRingGeo = track(new THREE.BoxGeometry(0.74, 0.07, 0.74));
  const saplingTrunkGeo = track(new THREE.CylinderGeometry(0.055, 0.085, 2.75, 6));
  const saplingCrownGeo = uprightCard(1.45, 2.9);
  const saplingPlaces: { x: number; y: number; z: number; s: number }[] = [];

  const tgCount = treeGuardCoords.length;
  const guardPostsInst = new THREE.InstancedMesh(guardPostGeo, whitePaintMat, tgCount * 4);
  const guardTopInst = new THREE.InstancedMesh(guardRingGeo, whitePaintMat, tgCount);
  const saplingTrunkInst = new THREE.InstancedMesh(saplingTrunkGeo, trunkMat, tgCount);
  const saplingCrownInst = new THREE.InstancedMesh(saplingCrownGeo, saplingCardMat, tgCount);
  saplingCrownInst.name = 'sapling-cards';

  treeGuardCoords.forEach(([tx, tz], i) => {
    const ty = getTerrainHeightAndSurface(tx, tz, true).height;
    const offsets: [number, number][] = [[-0.31, -0.31], [0.31, -0.31], [-0.31, 0.31], [0.31, 0.31]];
    offsets.forEach(([ox, oz], oi) => {
      dummy.position.set(tx + ox, ty + 0.85, tz + oz);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      guardPostsInst.setMatrixAt(i * 4 + oi, dummy.matrix);
    });
    dummy.position.set(tx, ty + 1.52, tz);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    guardTopInst.setMatrixAt(i, dummy.matrix);

    dummy.position.set(tx, ty + 1.48, tz);
    dummy.updateMatrix();
    saplingTrunkInst.setMatrixAt(i, dummy.matrix);

    const sc = 0.85 + (i % 4) * 0.12;
    saplingPlaces.push({ x: tx, y: ty + 1.7, z: tz, s: sc });
    dummy.position.set(tx, ty + 1.7, tz);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(sc, sc, sc);
    dummy.updateMatrix();
    saplingCrownInst.setMatrixAt(i, dummy.matrix);
  });
  guardPostsInst.castShadow = true;
  saplingCrownInst.castShadow = false;
  saplingCrownInst.frustumCulled = false;
  foliageBillboards.push({ mesh: saplingCrownInst, places: saplingPlaces });
  guardPostsInst.computeBoundingSphere();
  guardTopInst.computeBoundingSphere();
  saplingTrunkInst.computeBoundingSphere();
  saplingCrownInst.computeBoundingSphere();
  group.add(guardPostsInst, guardTopInst, saplingTrunkInst, saplingCrownInst);

  // 1914 Timber Telegraph & Power Poles with Crossarms along Outer Streets (photo 1)
  const poleSpecs: [number, number, number][] = [
    [-113.5, -50, 0], [-113.5, -20, 0], [-113.5, 18, 0], [-113.5, 50, 0], [-113.5, 82, 0],
    [-160.2, -40, 0], [-160.2, -5, 0], [-160.2, 32, 0], [-160.2, 68, 0], [-160.2, 102, 0],
    [-130, -76, Math.PI / 2], [-72, -76, Math.PI / 2], [-18, -76, Math.PI / 2], [32, -76, Math.PI / 2],
    [-120, 110.2, Math.PI / 2], [-64, 110.2, Math.PI / 2], [12, 110.2, Math.PI / 2], [68, 110.2, Math.PI / 2],
  ];
  const telePoleGeo = track(new THREE.CylinderGeometry(0.11, 0.16, 7.8, 7));
  const teleArmGeo = track(new THREE.BoxGeometry(1.75, 0.11, 0.11));
  const telePoleInst = new THREE.InstancedMesh(telePoleGeo, trunkMat, poleSpecs.length);
  const teleArmInst = new THREE.InstancedMesh(teleArmGeo, whitePaintMat, poleSpecs.length * 2);
  poleSpecs.forEach(([px, pz, rotY], i) => {
    const py = getTerrainHeightAndSurface(px, pz, true).height;
    dummy.position.set(px, py + 3.9, pz);
    dummy.rotation.set(0, rotY, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    telePoleInst.setMatrixAt(i, dummy.matrix);

    dummy.position.set(px, py + 7.25, pz);
    dummy.updateMatrix();
    teleArmInst.setMatrixAt(i * 2, dummy.matrix);
    dummy.position.set(px, py + 6.65, pz);
    dummy.updateMatrix();
    teleArmInst.setMatrixAt(i * 2 + 1, dummy.matrix);
  });
  telePoleInst.castShadow = true;
  telePoleInst.computeBoundingSphere();
  teleArmInst.computeBoundingSphere();
  group.add(telePoleInst, teleArmInst);

  // Tussock Verge Grass Tufts along Gravel & Unsealed Shoulders (photo 3)
  const tuftCoords: [number, number][] = [];
  for (let gx = -150; gx <= 90; gx += 7.5) {
    tuftCoords.push([gx, 125.9 + ((gx * 7) % 3) * 0.45]);
    tuftCoords.push([gx, 110.1 - ((gx * 5) % 3) * 0.35]);
  }
  for (let gz = -72; gz <= 105; gz += 8) {
    tuftCoords.push([-159.8, gz]);
    tuftCoords.push([102.2, gz]);
  }
  const tuftGeo = track(new THREE.ConeGeometry(0.28, 0.46, 5));
  const tuftMat = track(new THREE.MeshStandardMaterial({ color: 0x4f5c35, roughness: 0.94 }));
  const tuftInst = new THREE.InstancedMesh(tuftGeo, tuftMat, tuftCoords.length);
  tuftCoords.forEach(([tx, tz], i) => {
    const ty = getTerrainHeightAndSurface(tx, tz, true).height;
    dummy.position.set(tx, ty + 0.18, tz);
    dummy.rotation.set(0, i * 1.1, 0);
    dummy.scale.set(0.8 + (i % 3) * 0.25, 0.75 + (i % 4) * 0.2, 0.8 + ((i + 1) % 3) * 0.25);
    dummy.updateMatrix();
    tuftInst.setMatrixAt(i, dummy.matrix);
  });
  tuftInst.computeBoundingSphere();
  group.add(tuftInst);

  const cNormalTerrain = new THREE.Color(0xffffff);
  const cSnowTerrain = new THREE.Color(0xeef3f8);
  const cNormalRoad = new THREE.Color(0xffffff);
  const cSnowRoad = new THREE.Color(0xd6dfe8);
  const cNormalRoof = new THREE.Color(0xffffff);
  const cSnowRoof = new THREE.Color(0xe9eff5);

  return {
    group,
    update: (elapsedTime: number, timeHour = 12, view?: THREE.Vector3) => {
      if (view) {
        for (let b = 0; b < foliageBillboards.length; b++) {
          const batch = foliageBillboards[b];
          for (let i = 0; i < batch.places.length; i++) {
            const p = batch.places[i];
            dummy.position.set(p.x, p.y, p.z);
            dummy.rotation.set(0, Math.atan2(view.x - p.x, view.z - p.z), 0);
            dummy.scale.set(p.s, p.s, p.s);
            dummy.updateMatrix();
            batch.mesh.setMatrixAt(i, dummy.matrix);
          }
          batch.mesh.instanceMatrix.needsUpdate = true;
        }
      }
      harbour.setTime(elapsedTime);
      shipGroup.position.y = -1.08 + Math.sin(elapsedTime * 1.1) * 0.07;
      shipGroup.rotation.z = Math.sin(elapsedTime * 0.85) * 0.012;
      shipGroup.rotation.x = Math.cos(elapsedTime * 0.65) * 0.008;

      for (let i = 0; i < shipSmokePuffs.length; i++) {
        const phase = (elapsedTime * 0.42 + i / shipSmokePuffs.length) % 1;
        const puff = shipSmokePuffs[i];
        puff.position.set(-3 - phase * 5.2, 9.8 + phase * 6.5, Math.sin(elapsedTime * 1.3 + i) * 0.9 * phase);
        puff.scale.setScalar(0.85 + phase * 2.4);
      }

      // Rotate Cape Wanbrow Lighthouse beacon
      beaconPivot.rotation.y = elapsedTime * 0.85;

      // Rotate Chief Post Office clock hands cleanly to current Oamaru hour
      const hourAngle = -((timeHour % 12) / 12) * Math.PI * 2;
      const minAngle = -((timeHour % 1) * Math.PI * 2);
      for (let i = 0; i < clockHands.length; i++) {
        clockHands[i].hour.rotation.z = hourAngle;
        clockHands[i].minute.rotation.z = minAngle;
      }

      // Chug shunting locomotive smoothly back and forth along Harbour siding (x: 24..76)
      const prevTrainX = currentTrainX;
      currentTrainX = 50 + Math.sin(elapsedTime * 0.14) * 26;
      const trainVel = currentTrainX - prevTrainX;
      trainGroup.position.x = currentTrainX;
      for (let i = 0; i < trainWheels.length; i++) {
        trainWheels[i].rotation.z -= trainVel / 0.36;
      }
      for (let i = 0; i < steamPuffs.length; i++) {
        const phase = (elapsedTime * 0.85 + i / steamPuffs.length) % 1;
        const puff = steamPuffs[i];
        puff.position.set(
          2.35 - phase * 1.4,
          2.95 + phase * 3.1,
          Math.sin(elapsedTime * 2.1 + i) * 0.25 * phase
        );
        const sc = 0.65 + phase * 1.7;
        puff.scale.setScalar(sc);
      }
    },
    getTrainPos: () => ({ x: currentTrainX, z: -52 }),
    setAtmosphereVisuals: (
      wetness: number,
      snowCover: number,
      nightFactor: number,
      skyColor: THREE.Color,
      sunDir: THREE.Vector3,
      sunColor: THREE.Color
    ) => {
      harbour.setLight(skyColor, sunColor, sunDir);
      cobbleMat.roughness = 0.82 - wetness * 0.58;
      cobbleMat.metalness = 0.02;
      macadamMat.roughness = 0.92 - wetness * 0.5;
      macadamMat.metalness = 0.02;
      wharfMat.roughness = 0.84 - wetness * 0.5;
      mudMat.roughness = 0.58 - wetness * 0.4;
      potholePuddleMat.roughness = 0.36 - wetness * 0.22;
      potholePuddleMat.metalness = 0.02;

      // Snow / winter frost accumulation across verges, roofs & road shoulders
      terrainMat.color.copy(cNormalTerrain).lerp(cSnowTerrain, snowCover * 0.78);
      footpathMat.color.copy(cNormalRoad).lerp(cSnowRoad, snowCover * 0.55);
      macadamMat.color.copy(cNormalRoad).lerp(cSnowRoad, snowCover * 0.62);
      cobbleMat.color.copy(cNormalRoad).lerp(cSnowRoad, snowCover * 0.45);
      ironRoofMat.color.copy(cNormalRoof).lerp(cSnowRoof, snowCover * 0.85);
      cabbageMat.color.setHex(0xffffff).lerp(cSnowTerrain, snowCover * 0.5);
      macrocarpaMat.color.setHex(0xffffff).lerp(cSnowTerrain, snowCover * 0.5);
      saplingCardMat.color.setHex(0xffffff).lerp(cSnowTerrain, snowCover * 0.5);
      const haloOn = nightFactor > 0.08;
      haloMat.opacity = haloOn ? (nightFactor - 0.08) * 0.72 : 0;
      for (let i = 0; i < lampHalos.length; i++) lampHalos[i].visible = haloOn;

      lampGlowMat.emissiveIntensity = 0.35 + nightFactor * 2.2;
      moleBeaconMat.emissiveIntensity = 0.35 + nightFactor * 2.4;
      lighthouseLanternMat.emissiveIntensity = 0.4 + nightFactor * 2.8;
      beaconBeamMat.opacity = nightFactor > 0.22 ? (nightFactor - 0.22) * 0.24 : 0;
      beaconPivot.visible = nightFactor > 0.22;

      for (let i = 0; i < cornerLanternGlowMats.length; i++) {
        cornerLanternGlowMats[i].emissiveIntensity = 0.35 + nightFactor * 2.1;
      }
      archedWinMat.emissiveIntensity = nightFactor * 0.78;
      shopfrontWinMat.emissiveIntensity = nightFactor * 0.85;
      openWinMat.emissiveIntensity = 0.08 + nightFactor * 0.85;
      openDoorInteriorMat.emissiveIntensity = 0.2 + nightFactor * 0.92;
      for (let i = 0; i < clockHands.length; i++) {
        clockHands[i].faceMat.emissiveIntensity = 0.1 + nightFactor * 0.75;
      }
      const poolIntensity = nightFactor * 14.0;
      for (let i = 0; i < streetPointLights.length; i++) {
        streetPointLights[i].intensity = poolIntensity;
      }
    },
    dispose: () => {
      harbour.dispose();
      disposables.forEach((d) => d.dispose());
    },
  };
}
