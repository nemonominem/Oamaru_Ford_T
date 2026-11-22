import * as THREE from 'three';
import { getTerrainHeightAndSurface } from './terrain';
import { TextureBundle } from './textures';

export interface OamaruWorldHandle {
  group: THREE.Group;
  update: (elapsedTime: number) => void;
  setAtmosphereVisuals: (wetness: number, nightFactor: number) => void;
  dispose: () => void;
}

type ArchitecturalVariant =
  | 'italianate-verandah'
  | 'corinthian-temple'
  | 'grain-hoist'
  | 'venetian-gothic'
  | 'greek-revival'
  | 'carriage-arch'
  | 'portico-palazzo';

interface BuildingSpec {
  x: number;
  z: number;
  w: number;
  d: number;
  floors: number;
  facing: 'north' | 'south' | 'west';
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
  // 1. Continuous Heightfield Terrain Mesh (Oamaru Town, Hills & Coastal Verge)
  // ---------------------------------------------------------------------------
  const terrainW = 400;
  const terrainD = 380;
  const segX = 120;
  const segZ = 114;
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
    const vx = posAttr.getX(i);
    const vz = posAttr.getZ(i);
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
  // 2. Period Road Ribbons (Dynamic Wetness Roughness for Rain)
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

  addRoadRibbon(-112, 12, -7.2, 7.2, 32, 6, macadamMat, 0.03);
  addRoadRibbon(12, 104, -7.2, 7.2, 26, 6, cobbleMat, 0.036);
  addRoadRibbon(-30.8, -17.2, -95, 95, 6, 44, macadamMat, 0.028);
  addRoadRibbon(-112, 102, -74.8, -61.2, 36, 6, macadamMat, 0.028);
  addRoadRibbon(-111.5, -96.5, -105, 95, 6, 40, macadamMat, 0.026);
  addRoadRibbon(88.2, 101.8, -95, 172, 6, 68, macadamMat, 0.028);
  addRoadRibbon(88.2, 101.8, -22, 22, 6, 14, cobbleMat, 0.038);
  addRoadRibbon(12, 86, -61.5, -45, 22, 8, mudMat, 0.025);

  // Narrow-Gauge Harbour Railway Tracks
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

  // ---------------------------------------------------------------------------
  // 3. Oamaru Harbour Seawall, Sumpter Wharf & SS Oamaru Steamship
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

  const curbGeo = track(new THREE.BoxGeometry(64, 0.24, 0.28));
  [-7.05, 7.05].forEach((cz) => {
    const curb = new THREE.Mesh(curbGeo, wharfMat);
    curb.position.set(135.5, 1.18, cz);
    group.add(curb);
  });
  const endCurb = new THREE.Mesh(track(new THREE.BoxGeometry(0.45, 0.45, 14.4)), wharfMat);
  endCurb.position.set(167.8, 1.25, 0);
  group.add(endCurb);

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

  // Moored Steamship ("SS Oamaru")
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

  const breakwater = new THREE.Mesh(
    track(new THREE.BoxGeometry(90, 2.8, 9)),
    track(new THREE.MeshStandardMaterial({ color: 0x6e6a63, roughness: 0.95 }))
  );
  breakwater.position.set(175, -0.4, 72);
  breakwater.rotation.y = 0.45;
  group.add(breakwater);

  // ---------------------------------------------------------------------------
  // 4. Authentic Historical Whitestone Victorian Buildings
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
  ];

  const buildHistoricalFacade = (spec: BuildingSpec) => {
    const bGroup = new THREE.Group();
    const baseH = getTerrainHeightAndSurface(spec.x, spec.z).height;
    bGroup.position.set(spec.x, baseH, spec.z);

    // Local +Z faces outward from front facade; rotate entire building if facing north or west
    if (spec.facing === 'north') bGroup.rotation.y = Math.PI;
    else if (spec.facing === 'west') bGroup.rotation.y = -Math.PI / 2;

    const floorH = 4.1;
    const totalH = spec.floors * floorH;
    const frontZ = spec.d * 0.5 + 0.05;

    const upperMat = spec.variant === 'venetian-gothic' ? polychromeMat : limestoneMat;

    // Ground floor rusticated masonry
    const groundMesh = new THREE.Mesh(
      track(new THREE.BoxGeometry(spec.w, floorH, spec.d)),
      rusticatedMat
    );
    groundMesh.position.y = floorH * 0.5;
    groundMesh.castShadow = true;
    groundMesh.receiveShadow = true;
    bGroup.add(groundMesh);

    // Upper storeys
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

    // Projecting Dentil Cornice & Parapet
    const cornice = new THREE.Mesh(
      track(new THREE.BoxGeometry(spec.w + 0.6, 0.52, spec.d + 0.6)),
      limestoneMat
    );
    cornice.position.y = totalH + 0.25;
    cornice.castShadow = true;
    bGroup.add(cornice);

    const parapet = new THREE.Mesh(
      track(new THREE.BoxGeometry(spec.w + 0.1, 0.95, spec.d + 0.1)),
      limestoneMat
    );
    parapet.position.y = totalH + 0.85;
    bGroup.add(parapet);

    // Roof
    const roofMesh = new THREE.Mesh(
      track(new THREE.ConeGeometry(Math.max(spec.w, spec.d) * 0.62, 2.8, 4)),
      ironRoofMat
    );
    roofMesh.rotation.y = Math.PI / 4;
    roofMesh.position.y = totalH + 1.8;
    bGroup.add(roofMesh);

    // Columns / Pilasters
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

    // Arched Victorian Sash Windows & Ground Doors
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

    // Variant-specific Historical Architectural Details
    if (spec.variant === 'corinthian-temple' || spec.variant === 'portico-palazzo') {
      // Classical Triangular Pediment + Urn Finials
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

      // Parapet urn finials
      const urnGeo = track(new THREE.CylinderGeometry(0.24, 0.14, 0.72, 10));
      [-spec.w * 0.42, 0, spec.w * 0.42].forEach((ux, idx) => {
        const urn = new THREE.Mesh(urnGeo, limestoneMat);
        urn.position.set(ux, totalH + (idx === 1 ? 3.85 : 1.65), frontZ - 0.1);
        bGroup.add(urn);
      });

      if (spec.variant === 'portico-palazzo') {
        // Monumental Portico Steps & Projecting Columns (Forrester Gallery / Bank of NSW)
        const steps = new THREE.Mesh(track(new THREE.BoxGeometry(8.6, 0.75, 2.6)), rusticatedMat);
        steps.position.set(0, 0.38, frontZ + 1.1);
        bGroup.add(steps);
        const porticoRoof = new THREE.Mesh(track(new THREE.BoxGeometry(8.4, 0.45, 2.2)), limestoneMat);
        porticoRoof.position.set(0, floorH + 3.8, frontZ + 0.9);
        bGroup.add(porticoRoof);
      }
    }

    if (spec.variant === 'grain-hoist') {
      // Triangular Pediment with Circular Oculus + Projecting Sack Hoist Beam
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
      // Maritime Flagpole & Port Authority Crest on Oamaru Harbour Board
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
      // Two-Storey Cast-Iron Lacework Verandah (Criterion & Imperial Hotels)
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

      // Filigree iron lacework balustrade
      const laceBalustrade = new THREE.Mesh(
        track(new THREE.PlaneGeometry(spec.w, 0.95)),
        ironLaceMat
      );
      laceBalustrade.position.set(0, floorH + 0.36, spec.d * 0.5 + vDepth - 0.15);
      bGroup.add(laceBalustrade);
    }

    // Painted Victorian Fascia Signboard
    const signTex = textures.createSignTexture(spec.title, spec.subtitle, spec.signBg);
    const signMat = track(new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.65 }));
    const signBoard = new THREE.Mesh(track(new THREE.BoxGeometry(spec.w * 0.72, 1.32, 0.16)), signMat);
    signBoard.position.set(0, floorH + 0.12, frontZ + 0.16);
    bGroup.add(signBoard);

    group.add(bGroup);
  };

  buildings.forEach(buildHistoricalFacade);

  // ---------------------------------------------------------------------------
  // 5. Cast-Iron Victorian Streetlamps (with Dynamic Dusk/Night Glow), Cargo & Trees
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
  for (let lx = -85; lx <= 85; lx += 28) {
    lampCoords.push([lx, -8.8], [lx, 8.8]);
  }
  lampCoords.push([-32, -32], [-16, -42], [-32, 42], [-16, 48], [103, -12], [103, 12], [134, -6.2], [134, 6.2]);

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

  // Key streetlamp PointLights along Harbour St & Wharf (soft warm pools at Dusk/Night)
  const streetPointLights: THREE.PointLight[] = [];
  const lightPositions: [number, number][] = [
    [-46, 8.8],
    [-12, -8.8],
    [22, 8.8],
    [56, -8.8],
    [98, 0],
    [134, 6.2],
  ];
  lightPositions.forEach(([px, pz]) => {
    const py = getTerrainHeightAndSurface(px, pz).height;
    const pl = new THREE.PointLight(0xffb95e, 0, 26, 1.7);
    pl.position.set(px, py + 4.8, pz);
    group.add(pl);
    streetPointLights.push(pl);
  });

  // Cargo Crates & Wool Bales
  const crateGeo = track(new THREE.BoxGeometry(1.1, 0.95, 1.1));
  const crateMat = track(new THREE.MeshStandardMaterial({ color: 0x7c5a37, roughness: 0.85 }));
  const cratePositions: [number, number][] = [
    [118, -5.3],
    [119.3, -5.2],
    [118.6, -4.1],
    [142, 5.2],
    [143.4, 5.1],
    [26, -9.8],
    [27.4, -9.8],
    [48, 9.6],
  ];
  const crateInst = new THREE.InstancedMesh(crateGeo, crateMat, cratePositions.length);
  cratePositions.forEach(([cx, cz], i) => {
    const cy = getTerrainHeightAndSurface(cx, cz).height;
    dummy.position.set(cx, cy + 0.48, cz);
    dummy.rotation.set(0, (i * 0.47) % Math.PI, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    crateInst.setMatrixAt(i, dummy.matrix);
  });
  crateInst.castShadow = true;
  crateInst.computeBoundingSphere();
  group.add(crateInst);

  // Otago Cabbage Trees & Norfolk Pines
  const treeCoords: [number, number][] = [
    [-125, -45], [-132, -18], [-128, 22], [-135, 55], [-122, 85],
    [76, 82], [65, 96], [112, 108], [82, 118], [72, 142],
    [110, 145], [58, -92], [18, -95], [-55, -92], [-88, -88],
    [78, -88], [-64, 82], [-42, 88], [15, 86], [42, 92],
    [115, 78], [-145, -75], [-152, 42], [-148, 98],
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

  return {
    group,
    update: (elapsedTime: number) => {
      shipGroup.position.y = -1.08 + Math.sin(elapsedTime * 1.1) * 0.07;
      shipGroup.rotation.z = Math.sin(elapsedTime * 0.85) * 0.012;
      shipGroup.rotation.x = Math.cos(elapsedTime * 0.65) * 0.008;
    },
    setAtmosphereVisuals: (wetness: number, nightFactor: number) => {
      // Wet road specular sheen during rain
      cobbleMat.roughness = 0.78 - wetness * 0.56;
      cobbleMat.metalness = 0.08 + wetness * 0.16;
      macadamMat.roughness = 0.9 - wetness * 0.44;
      wharfMat.roughness = 0.84 - wetness * 0.5;
      mudMat.roughness = 0.58 - wetness * 0.4;

      // Streetlamp & Victorian window warm glow at dusk/night
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
