import * as THREE from 'three';
import { ROAD_OBSTRUCTIONS, ROAD_POTHOLES, getTerrainHeightAndSurface } from './terrain';
import { TextureBundle } from './textures';

export interface OamaruWorldHandle {
  group: THREE.Group;
  update: (elapsedTime: number) => void;
  getTrainPos: () => { x: number; z: number };
  setAtmosphereVisuals: (wetness: number, snowCover: number, nightFactor: number) => void;
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
}

export function buildOamaruWorld(textures: TextureBundle, isSoftwareGl: boolean): OamaruWorldHandle {
  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(item: T): T => {
    disposables.push(item);
    return item;
  };

  const group = new THREE.Group();

  // ---------------------------------------------------------------------------
  // 1. Extended Continuous Heightfield Terrain Mesh (covering Severn to Harbour)
  // ---------------------------------------------------------------------------
  const terrainW = 460;
  const terrainD = 400;
  const centerX = -15;
  const centerZ = 15;
  const segX = 136;
  const segZ = 120;
  const terrainGeo = track(new THREE.PlaneGeometry(terrainW, terrainD, segX, segZ));
  terrainGeo.rotateX(-Math.PI / 2);

  const posAttr = terrainGeo.attributes.position;
  const colors = new Float32Array(posAttr.count * 3);
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
  }
  terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  terrainGeo.computeVertexNormals();

  const terrainMat = track(
    new THREE.MeshStandardMaterial({
      map: textures.grass,
      vertexColors: true,
      roughness: 0.92,
      metalness: 0.02,
    })
  );
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
      roughness: 0.9,
      metalness: 0.04,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    })
  );

  const cobbleMat = track(
    new THREE.MeshStandardMaterial({
      map: textures.cobbles,
      bumpMap: textures.cobblesBump,
      bumpScale: 0.035,
      roughness: 0.78,
      metalness: 0.08,
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
  addRoadRibbon(-111.5, -96.5, -105, 125, 6, 48, macadamMat, 0.026);
  addRoadRibbon(-159.2, -144.8, -80, 125, 6, 48, macadamMat, 0.028);
  addRoadRibbon(-160, 102, 110.8, 125.2, 54, 6, macadamMat, 0.03);
  addRoadRibbon(88.2, 101.8, -95, 135, 6, 54, macadamMat, 0.028);
  addRoadRibbon(88.2, 101.8, -22, 22, 6, 14, cobbleMat, 0.038);
  addRoadRibbon(12, 86, -61.5, -45, 22, 8, mudMat, 0.025);

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
      roughness: 0.42,
      metalness: 0.14,
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
      roughness: 0.85,
      metalness: 0.02,
    })
  );
  const rusticatedMat = track(
    new THREE.MeshStandardMaterial({
      map: textures.limestoneRusticated,
      roughness: 0.88,
      metalness: 0.02,
    })
  );
  const polychromeMat = track(
    new THREE.MeshStandardMaterial({
      map: textures.polychromeStone,
      roughness: 0.84,
      metalness: 0.04,
    })
  );

  const seawall = new THREE.Mesh(track(new THREE.BoxGeometry(5, 3.2, 230)), rusticatedMat);
  seawall.position.set(105.5, -0.35, 10);
  seawall.receiveShadow = true;
  group.add(seawall);

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
  group.add(shipGroup);

  const waterGeo = track(new THREE.PlaneGeometry(240, 420, 1, 1));
  waterGeo.rotateX(-Math.PI / 2);
  const waterMat = track(
    new THREE.MeshPhysicalMaterial({
      color: 0x264859,
      roughness: isSoftwareGl ? 0.35 : 0.16,
      metalness: 0.18,
      clearcoat: isSoftwareGl ? 0 : 0.65,
    })
  );
  const ocean = new THREE.Mesh(waterGeo, waterMat);
  ocean.position.set(226, -1.3, 10);
  group.add(ocean);

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
      roughness: 0.38,
      metalness: 0.2,
      emissive: new THREE.Color(0xffb454),
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
      subtitle: 'Wool Brokers · Est. 1882',
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
      subtitle: 'Crown Roller Mills · 1883',
      signBg: '#2b241d',
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
  ];

  const buildHistoricalFacade = (spec: BuildingSpec) => {
    const bGroup = new THREE.Group();
    const baseH = getTerrainHeightAndSurface(spec.x, spec.z).height;
    bGroup.position.set(spec.x, baseH, spec.z);

    if (spec.facing === 'north') bGroup.rotation.y = Math.PI;
    else if (spec.facing === 'west') bGroup.rotation.y = -Math.PI / 2;
    else if (spec.facing === 'east') bGroup.rotation.y = Math.PI / 2;

    const floorH = 4.1;
    const totalH = spec.floors * floorH;
    const frontZ = spec.d * 0.5 + 0.05;
    const upperMat = spec.variant === 'venetian-gothic' ? polychromeMat : limestoneMat;

    const groundMesh = new THREE.Mesh(track(new THREE.BoxGeometry(spec.w, floorH, spec.d)), rusticatedMat);
    groundMesh.position.y = floorH * 0.5;
    groundMesh.castShadow = true;
    groundMesh.receiveShadow = true;
    bGroup.add(groundMesh);

    if (spec.floors > 1) {
      const upperH = (spec.floors - 1) * floorH;
      const upperMesh = new THREE.Mesh(
        track(new THREE.BoxGeometry(spec.w - 0.12, upperH, spec.d - 0.12)),
        upperMat
      );
      upperMesh.position.y = floorH + upperH * 0.5;
      upperMesh.castShadow = true;
      upperMesh.receiveShadow = true;
      bGroup.add(upperMesh);
    }

    const cornice = new THREE.Mesh(track(new THREE.BoxGeometry(spec.w + 0.6, 0.52, spec.d + 0.6)), limestoneMat);
    cornice.position.y = totalH + 0.25;
    cornice.castShadow = true;
    bGroup.add(cornice);

    const parapet = new THREE.Mesh(track(new THREE.BoxGeometry(spec.w + 0.1, 0.95, spec.d + 0.1)), limestoneMat);
    parapet.position.y = totalH + 0.85;
    bGroup.add(parapet);

    const roofMesh = new THREE.Mesh(
      track(new THREE.ConeGeometry(Math.max(spec.w, spec.d) * 0.62, 2.8, 4)),
      ironRoofMat
    );
    roofMesh.rotation.y = Math.PI / 4;
    roofMesh.position.y = totalH + 1.8;
    bGroup.add(roofMesh);

    if (spec.variant !== 'clocktower-civic') {
      const chimney = new THREE.Mesh(track(new THREE.BoxGeometry(1.15, 2.3, 1.15)), rusticatedMat);
      chimney.position.set(spec.w * 0.28, totalH + 1.9, -spec.d * 0.22);
      chimney.castShadow = true;
      const pot = new THREE.Mesh(track(new THREE.CylinderGeometry(0.18, 0.22, 0.55, 8)), limestoneMat);
      pot.position.set(spec.w * 0.28, totalH + 3.25, -spec.d * 0.22);
      bGroup.add(chimney, pot);
    }

    const cols = Math.max(3, Math.floor(spec.w / 4.2));
    const isRoundCol = spec.variant === 'corinthian-temple' || spec.variant === 'portico-palazzo';
    const pilasterGeo = isRoundCol
      ? track(new THREE.CylinderGeometry(0.22, 0.26, totalH, 10))
      : track(new THREE.BoxGeometry(0.46, totalH, 0.26));

    for (let c = 0; c <= cols; c++) {
      const px = -spec.w * 0.44 + (c / cols) * (spec.w * 0.88);
      const pilaster = new THREE.Mesh(pilasterGeo, limestoneMat);
      pilaster.position.set(px, totalH * 0.5, frontZ + (isRoundCol ? 0.25 : 0));
      pilaster.castShadow = true;
      bGroup.add(pilaster);
    }

    const winGeo = track(new THREE.PlaneGeometry(1.75, 2.55));
    const doorGeo = track(new THREE.BoxGeometry(2.6, 3.3, 0.18));

    for (let f = 0; f < spec.floors; f++) {
      const fy = f * floorH + 2.05;
      for (let c = 0; c < cols; c++) {
        const wx = -spec.w * 0.44 + ((c + 0.5) / cols) * (spec.w * 0.88);
        if (f === 0 && c === Math.floor(cols / 2) && (spec.variant === 'grain-hoist' || spec.variant === 'carriage-arch')) {
          const door = new THREE.Mesh(doorGeo, timberDoorMat);
          door.position.set(wx, 1.68, frontZ);
          bGroup.add(door);
        } else {
          const win = new THREE.Mesh(winGeo, archedWinMat);
          win.position.set(wx, fy, frontZ);
          bGroup.add(win);
        }
      }
    }

    if (spec.variant === 'clocktower-civic') {
      // Oamaru Chief Post Office square limestone clocktower
      const tower = new THREE.Mesh(track(new THREE.BoxGeometry(4.4, 7.2, 4.4)), limestoneMat);
      tower.position.set(0, totalH + 3.6, frontZ - 3.5);
      tower.castShadow = true;
      const clockFace = new THREE.Mesh(
        track(new THREE.CylinderGeometry(1.15, 1.15, 0.2, 16)),
        track(new THREE.MeshStandardMaterial({ color: 0xf4efe3, roughness: 0.4 }))
      );
      clockFace.rotation.x = Math.PI / 2;
      clockFace.position.set(0, totalH + 5.2, frontZ - 1.25);
      const spire = new THREE.Mesh(track(new THREE.ConeGeometry(3.2, 3.4, 4)), ironRoofMat);
      spire.rotation.y = Math.PI / 4;
      spire.position.set(0, totalH + 8.8, frontZ - 3.5);
      bGroup.add(tower, clockFace, spire);
    }

    if (spec.variant === 'corinthian-temple' || spec.variant === 'portico-palazzo') {
      const pedShape = new THREE.Shape();
      const pw = Math.min(spec.w * 0.58, 10);
      pedShape.moveTo(-pw * 0.5, 0);
      pedShape.lineTo(pw * 0.5, 0);
      pedShape.lineTo(0, 2.35);
      pedShape.closePath();
      const ped = new THREE.Mesh(
        track(new THREE.ExtrudeGeometry(pedShape, { depth: 0.55, bevelEnabled: false })),
        limestoneMat
      );
      ped.position.set(0, totalH + 1.28, frontZ - 0.35);
      bGroup.add(ped);

      const urnGeo = track(new THREE.CylinderGeometry(0.24, 0.14, 0.72, 10));
      [-spec.w * 0.42, 0, spec.w * 0.42].forEach((ux, idx) => {
        const urn = new THREE.Mesh(urnGeo, limestoneMat);
        urn.position.set(ux, totalH + (idx === 1 ? 3.85 : 1.65), frontZ - 0.1);
        bGroup.add(urn);
      });

      if (spec.variant === 'portico-palazzo') {
        const steps = new THREE.Mesh(track(new THREE.BoxGeometry(8.6, 0.75, 2.6)), rusticatedMat);
        steps.position.set(0, 0.38, frontZ + 1.1);
        bGroup.add(steps);
        const porticoRoof = new THREE.Mesh(track(new THREE.BoxGeometry(8.4, 0.45, 2.2)), limestoneMat);
        porticoRoof.position.set(0, floorH + 3.8, frontZ + 0.9);
        bGroup.add(porticoRoof);
      }
    }

    if (spec.variant === 'grain-hoist') {
      const pedShape = new THREE.Shape();
      pedShape.moveTo(-4.4, 0);
      pedShape.lineTo(4.4, 0);
      pedShape.lineTo(0, 2.4);
      pedShape.closePath();
      const ped = new THREE.Mesh(
        track(new THREE.ExtrudeGeometry(pedShape, { depth: 0.45, bevelEnabled: false })),
        limestoneMat
      );
      ped.position.set(0, totalH + 1.25, frontZ - 0.3);
      bGroup.add(ped);

      const hoistBeam = new THREE.Mesh(track(new THREE.BoxGeometry(0.26, 0.26, 2.2)), wroughtIronMat);
      hoistBeam.position.set(0, totalH + 1.1, frontZ + 0.95);
      bGroup.add(hoistBeam);
    }

    if (spec.variant === 'venetian-gothic') {
      const pole = new THREE.Mesh(track(new THREE.CylinderGeometry(0.05, 0.08, 6.2, 8)), wroughtIronMat);
      pole.position.set(0, totalH + 4.1, frontZ - 0.5);
      bGroup.add(pole);

      const flag = new THREE.Mesh(
        track(new THREE.BoxGeometry(1.8, 1.0, 0.05)),
        track(new THREE.MeshStandardMaterial({ color: 0x1d3f6e, roughness: 0.8 }))
      );
      flag.position.set(0.9, totalH + 6.4, frontZ - 0.5);
      bGroup.add(flag);
    }

    if (spec.variant === 'italianate-verandah') {
      const vDepth = 3.2;
      const vZ = spec.d * 0.5 + vDepth * 0.5;
      const balconyFloor = new THREE.Mesh(track(new THREE.BoxGeometry(spec.w, 0.16, vDepth)), wroughtIronMat);
      balconyFloor.position.set(0, floorH - 0.15, vZ);
      balconyFloor.castShadow = true;
      bGroup.add(balconyFloor);

      const balconyRoof = new THREE.Mesh(track(new THREE.BoxGeometry(spec.w, 0.12, vDepth + 0.2)), ironRoofMat);
      balconyRoof.position.set(0, floorH * 2 - 0.25, vZ);
      balconyRoof.rotation.x = 0.14;
      bGroup.add(balconyRoof);

      const postGeo = track(new THREE.CylinderGeometry(0.06, 0.08, floorH * 2 - 0.2, 8));
      for (let i = 0; i < 5; i++) {
        const px = -spec.w * 0.45 + (i / 4) * (spec.w * 0.9);
        const post = new THREE.Mesh(postGeo, wroughtIronMat);
        post.position.set(px, floorH - 0.1, spec.d * 0.5 + vDepth - 0.2);
        post.castShadow = true;
        bGroup.add(post);
      }

      const laceBalustrade = new THREE.Mesh(track(new THREE.PlaneGeometry(spec.w, 0.95)), ironLaceMat);
      laceBalustrade.position.set(0, floorH + 0.36, spec.d * 0.5 + vDepth - 0.15);
      bGroup.add(laceBalustrade);
    }

    const signTex = textures.createSignTexture(spec.title, spec.subtitle, spec.signBg);
    const signMat = track(new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.65 }));
    const signBoard = new THREE.Mesh(track(new THREE.BoxGeometry(spec.w * 0.72, 1.32, 0.16)), signMat);
    signBoard.position.set(0, floorH + 0.12, frontZ + 0.16);
    bGroup.add(signBoard);

    group.add(bGroup);
  };

  buildings.forEach(buildHistoricalFacade);

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
  for (let lz = -55; lz <= 105; lz += 32) {
    lampCoords.push([-112.5, lz], [-143.5, lz], [87.5, lz]);
  }
  for (let lx = -135; lx <= 75; lx += 35) {
    lampCoords.push([lx, 109.5]);
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
  const trunkGeo = track(new THREE.CylinderGeometry(0.18, 0.34, 4.4, 7));
  const trunkMat = track(new THREE.MeshStandardMaterial({ color: 0x4e3e2d, roughness: 0.92 }));
  const canopyGeo = track(new THREE.ConeGeometry(2.1, 5.2, 8));
  const canopyMat = track(new THREE.MeshStandardMaterial({ color: 0x3b5332, roughness: 0.88 }));

  const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCoords.length);
  const canopyInst = new THREE.InstancedMesh(canopyGeo, canopyMat, treeCoords.length);
  const tint = new THREE.Color();

  treeCoords.forEach(([tx, tz], i) => {
    const ty = getTerrainHeightAndSurface(tx, tz).height;
    const sc = 0.85 + ((i * 37) % 10) * 0.032;

    dummy.position.set(tx, ty + 2.1 * sc, tz);
    dummy.rotation.set(0, i * 0.9, 0);
    dummy.scale.set(sc, sc, sc);
    dummy.updateMatrix();
    trunkInst.setMatrixAt(i, dummy.matrix);

    dummy.position.set(tx, ty + 5.1 * sc, tz);
    dummy.updateMatrix();
    canopyInst.setMatrixAt(i, dummy.matrix);

    tint.setHSL(0.28 + ((i % 5) - 2) * 0.012, 0.28, 0.28 + (i % 3) * 0.04);
    canopyInst.setColorAt(i, tint);
  });
  trunkInst.castShadow = true;
  canopyInst.castShadow = true;
  trunkInst.computeBoundingSphere();
  canopyInst.computeBoundingSphere();
  if (canopyInst.instanceColor) canopyInst.instanceColor.needsUpdate = true;
  group.add(trunkInst, canopyInst);

  const cNormalTerrain = new THREE.Color(0xffffff);
  const cSnowTerrain = new THREE.Color(0xeef3f8);
  const cNormalRoad = new THREE.Color(0xffffff);
  const cSnowRoad = new THREE.Color(0xd6dfe8);
  const cNormalRoof = new THREE.Color(0xffffff);
  const cSnowRoof = new THREE.Color(0xe9eff5);

  return {
    group,
    update: (elapsedTime: number) => {
      shipGroup.position.y = -1.08 + Math.sin(elapsedTime * 1.1) * 0.07;
      shipGroup.rotation.z = Math.sin(elapsedTime * 0.85) * 0.012;
      shipGroup.rotation.x = Math.cos(elapsedTime * 0.65) * 0.008;

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
    setAtmosphereVisuals: (wetness: number, snowCover: number, nightFactor: number) => {
      cobbleMat.roughness = 0.78 - wetness * 0.56;
      cobbleMat.metalness = 0.08 + wetness * 0.16;
      macadamMat.roughness = 0.9 - wetness * 0.44;
      wharfMat.roughness = 0.84 - wetness * 0.5;
      mudMat.roughness = 0.58 - wetness * 0.4;
      potholePuddleMat.roughness = 0.42 - wetness * 0.34;
      potholePuddleMat.metalness = 0.14 + wetness * 0.38;

      // Snow / winter frost accumulation across verges, roofs & road shoulders
      terrainMat.color.copy(cNormalTerrain).lerp(cSnowTerrain, snowCover * 0.78);
      macadamMat.color.copy(cNormalRoad).lerp(cSnowRoad, snowCover * 0.62);
      cobbleMat.color.copy(cNormalRoad).lerp(cSnowRoad, snowCover * 0.45);
      ironRoofMat.color.copy(cNormalRoof).lerp(cSnowRoof, snowCover * 0.85);
      canopyMat.color.setHex(0x3b5332).lerp(cSnowTerrain, snowCover * 0.45);

      lampGlowMat.emissiveIntensity = 0.35 + nightFactor * 2.2;
      archedWinMat.emissiveIntensity = nightFactor * 0.75;
      const poolIntensity = nightFactor * 14.0;
      for (let i = 0; i < streetPointLights.length; i++) {
        streetPointLights[i].intensity = poolIntensity;
      }
    },
    dispose: () => {
      disposables.forEach((d) => d.dispose());
    },
  };
}
