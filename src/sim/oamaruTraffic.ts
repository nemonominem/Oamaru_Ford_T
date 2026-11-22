import * as THREE from 'three';
import { getTerrainHeightAndSurface } from './terrain';

export interface DynamicObstacle {
  x: number;
  z: number;
  radius: number;
}

interface PathWaypoint {
  x: number;
  z: number;
}

interface MovingAgent {
  group: THREE.Group;
  kind: 'horse-cart' | 'vintage-car' | 'pedestrian' | 'dog';
  waypoints: PathWaypoint[];
  wpIndex: number;
  x: number;
  z: number;
  yaw: number;
  speed: number;
  phase: number;
  radius: number;
  legs?: THREE.Object3D[];
  arms?: THREE.Object3D[];
  wheels?: THREE.Object3D[];
  head?: THREE.Object3D;
  tail?: THREE.Object3D;
  headlightMeshes?: THREE.Mesh[];
}

interface StaticAnimal {
  group: THREE.Group;
  head: THREE.Object3D;
  tail: THREE.Object3D;
  phase: number;
}

interface Seagull {
  group: THREE.Group;
  leftWing: THREE.Object3D;
  rightWing: THREE.Object3D;
  centerX: number;
  centerZ: number;
  baseY: number;
  orbitR: number;
  speed: number;
  phase: number;
}

export interface OamaruTrafficHandle {
  group: THREE.Group;
  update: (dt: number, elapsed: number, playerX: number, playerZ: number, lightsOn: boolean) => void;
  getObstacles: () => DynamicObstacle[];
  dispose: () => void;
}

export function buildOamaruTraffic(): OamaruTrafficHandle {
  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(item: T): T => {
    disposables.push(item);
    return item;
  };

  const group = new THREE.Group();

  // Shared materials for period citizens, horses, carts & vintage motors
  const darkWoolMat = track(new THREE.MeshStandardMaterial({ color: 0x262523, roughness: 0.85 }));
  const tweedMat = track(new THREE.MeshStandardMaterial({ color: 0x5c5040, roughness: 0.88 }));
  const navyCoatMat = track(new THREE.MeshStandardMaterial({ color: 0x243140, roughness: 0.85 }));
  const creamBlouseMat = track(new THREE.MeshStandardMaterial({ color: 0xe6decb, roughness: 0.82 }));
  const burgundySkirtMat = track(new THREE.MeshStandardMaterial({ color: 0x5c272c, roughness: 0.86 }));
  const skinMat = track(new THREE.MeshStandardMaterial({ color: 0xdcb89a, roughness: 0.72 }));

  const bayHorseMat = track(new THREE.MeshStandardMaterial({ color: 0x5c3621, roughness: 0.78 }));
  const chestnutHorseMat = track(new THREE.MeshStandardMaterial({ color: 0x7c4527, roughness: 0.78 }));
  const maneMat = track(new THREE.MeshStandardMaterial({ color: 0x1e1814, roughness: 0.9 }));
  const timberCartMat = track(new THREE.MeshStandardMaterial({ color: 0x6c4c2f, roughness: 0.82 }));
  const burlapMat = track(new THREE.MeshStandardMaterial({ color: 0xa68f68, roughness: 0.95 }));
  const ironWheelMat = track(new THREE.MeshStandardMaterial({ color: 0x222325, roughness: 0.55, metalness: 0.6 }));

  const greenCarMat = track(new THREE.MeshStandardMaterial({ color: 0x1e3828, roughness: 0.28, metalness: 0.2 }));
  const maroonCarMat = track(new THREE.MeshStandardMaterial({ color: 0x4c1d22, roughness: 0.28, metalness: 0.2 }));
  const brassMat = track(new THREE.MeshStandardMaterial({ color: 0xd8a84e, roughness: 0.22, metalness: 0.9 }));
  const lampBulbMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xffe4a0,
      emissive: new THREE.Color(0xffc055),
      emissiveIntensity: 0.35,
      roughness: 0.2,
    })
  );

  const collieMat = track(new THREE.MeshStandardMaterial({ color: 0x8f5d32, roughness: 0.85 }));
  const collieWhiteMat = track(new THREE.MeshStandardMaterial({ color: 0xeee8db, roughness: 0.85 }));
  const gullWhiteMat = track(new THREE.MeshStandardMaterial({ color: 0xf0eee9, roughness: 0.75 }));
  const gullTipMat = track(new THREE.MeshStandardMaterial({ color: 0x4e545c, roughness: 0.75 }));

  // ---------------------------------------------------------------------------
  // Helper: Build Composite Horse
  // ---------------------------------------------------------------------------
  const createHorseMesh = (coatMat: THREE.Material) => {
    const hGroup = new THREE.Group();
    const barrel = new THREE.Mesh(track(new THREE.BoxGeometry(0.56, 0.62, 1.38)), coatMat);
    barrel.position.set(0, 1.18, 0);
    barrel.castShadow = true;
    hGroup.add(barrel);

    const neck = new THREE.Mesh(track(new THREE.BoxGeometry(0.28, 0.56, 0.36)), coatMat);
    neck.position.set(0, 1.52, 0.68);
    neck.rotation.x = 0.52;
    neck.castShadow = true;
    hGroup.add(neck);

    const headPivot = new THREE.Group();
    headPivot.position.set(0, 1.74, 0.88);
    const headBox = new THREE.Mesh(track(new THREE.BoxGeometry(0.24, 0.26, 0.48)), coatMat);
    headBox.position.set(0, -0.06, 0.16);
    headBox.rotation.x = 0.48;
    const mane = new THREE.Mesh(track(new THREE.BoxGeometry(0.08, 0.42, 0.12)), maneMat);
    mane.position.set(0, -0.14, -0.16);
    mane.rotation.x = 0.45;
    headPivot.add(headBox, mane);
    hGroup.add(headPivot);

    const tailPivot = new THREE.Group();
    tailPivot.position.set(0, 1.34, -0.68);
    const tail = new THREE.Mesh(track(new THREE.CylinderGeometry(0.04, 0.08, 0.68, 6)), maneMat);
    tail.position.set(0, -0.32, -0.06);
    tail.rotation.x = -0.18;
    tailPivot.add(tail);
    hGroup.add(tailPivot);

    const legGeo = track(new THREE.CylinderGeometry(0.065, 0.05, 0.92, 7));
    const legOffsets: [number, number][] = [
      [0.19, 0.52],
      [-0.19, 0.52],
      [0.19, -0.52],
      [-0.19, -0.52],
    ];
    const legs: THREE.Object3D[] = [];
    legOffsets.forEach(([lx, lz]) => {
      const pivot = new THREE.Group();
      pivot.position.set(lx, 0.92, lz);
      const leg = new THREE.Mesh(legGeo, coatMat);
      leg.position.set(0, -0.46, 0);
      leg.castShadow = true;
      pivot.add(leg);
      hGroup.add(pivot);
      legs.push(pivot);
    });

    return { hGroup, legs, headPivot, tailPivot };
  };

  // ---------------------------------------------------------------------------
  // Helper: Build Period Pedestrian (Gentleman / Lady / Dockworker)
  // ---------------------------------------------------------------------------
  const createPedestrian = (style: 'gentleman' | 'lady' | 'worker') => {
    const pGroup = new THREE.Group();
    const legs: THREE.Object3D[] = [];
    const arms: THREE.Object3D[] = [];

    const head = new THREE.Mesh(track(new THREE.SphereGeometry(0.13, 10, 8)), skinMat);
    head.position.set(0, 1.60, 0);
    head.castShadow = true;
    pGroup.add(head);

    if (style === 'gentleman') {
      const bowlerCrown = new THREE.Mesh(track(new THREE.CylinderGeometry(0.12, 0.13, 0.12, 10)), darkWoolMat);
      bowlerCrown.position.set(0, 1.72, 0);
      const brim = new THREE.Mesh(track(new THREE.CylinderGeometry(0.18, 0.18, 0.02, 12)), darkWoolMat);
      brim.position.set(0, 1.67, 0);
      pGroup.add(bowlerCrown, brim);
    } else if (style === 'lady') {
      const hatBrim = new THREE.Mesh(track(new THREE.CylinderGeometry(0.24, 0.24, 0.03, 12)), burgundySkirtMat);
      hatBrim.position.set(0, 1.69, 0);
      const hatTop = new THREE.Mesh(track(new THREE.CylinderGeometry(0.12, 0.14, 0.09, 10)), creamBlouseMat);
      hatTop.position.set(0, 1.74, 0);
      pGroup.add(hatBrim, hatTop);
    } else {
      const cap = new THREE.Mesh(track(new THREE.CylinderGeometry(0.13, 0.14, 0.06, 10)), tweedMat);
      cap.position.set(0, 1.70, 0.02);
      pGroup.add(cap);
    }

    const torsoMat = style === 'lady' ? creamBlouseMat : style === 'gentleman' ? darkWoolMat : navyCoatMat;
    const torso = new THREE.Mesh(track(new THREE.BoxGeometry(0.36, 0.52, 0.22)), torsoMat);
    torso.position.set(0, 1.22, 0);
    torso.castShadow = true;
    pGroup.add(torso);

    if (style === 'lady') {
      const skirt = new THREE.Mesh(track(new THREE.ConeGeometry(0.28, 0.88, 10)), burgundySkirtMat);
      skirt.position.set(0, 0.56, 0);
      skirt.castShadow = true;
      pGroup.add(skirt);
    }

    const legMat = style === 'gentleman' ? darkWoolMat : tweedMat;
    const legGeo = track(new THREE.CylinderGeometry(0.065, 0.055, 0.78, 7));
    [-0.10, 0.10].forEach((lx) => {
      const lPivot = new THREE.Group();
      lPivot.position.set(lx, 0.86, 0);
      const legMesh = new THREE.Mesh(legGeo, legMat);
      legMesh.position.set(0, -0.42, 0);
      if (style !== 'lady') lPivot.add(legMesh);
      pGroup.add(lPivot);
      legs.push(lPivot);
    });

    const armGeo = track(new THREE.CylinderGeometry(0.05, 0.04, 0.56, 7));
    [-0.23, 0.23].forEach((ax) => {
      const aPivot = new THREE.Group();
      aPivot.position.set(ax, 1.42, 0);
      const armMesh = new THREE.Mesh(armGeo, torsoMat);
      armMesh.position.set(0, -0.26, 0);
      aPivot.add(armMesh);
      pGroup.add(aPivot);
      arms.push(aPivot);
    });

    return { pGroup, legs, arms };
  };

  // ---------------------------------------------------------------------------
  // Helper: Build Horse-Drawn Grain Dray / Cargo Wagon
  // ---------------------------------------------------------------------------
  const createHorseCart = (coatMat: THREE.Material) => {
    const root = new THREE.Group();
    const { hGroup, legs, headPivot, tailPivot } = createHorseMesh(coatMat);
    hGroup.position.set(0, 0, 1.65);
    root.add(hGroup);

    // Timber harness shafts
    const shaftGeo = track(new THREE.BoxGeometry(0.06, 0.06, 1.9));
    [-0.38, 0.38].forEach((sx) => {
      const shaft = new THREE.Mesh(shaftGeo, timberCartMat);
      shaft.position.set(sx, 0.96, 1.05);
      root.add(shaft);
    });

    // Cart Bed
    const bed = new THREE.Mesh(track(new THREE.BoxGeometry(1.52, 0.45, 2.35)), timberCartMat);
    bed.position.set(0, 0.92, -0.85);
    bed.castShadow = true;
    root.add(bed);

    // Grain Sacks / Wool Bales cargo
    for (let s = 0; s < 4; s++) {
      const sack = new THREE.Mesh(track(new THREE.BoxGeometry(0.62, 0.36, 0.85)), burlapMat);
      sack.position.set((s % 2 === 0 ? -0.34 : 0.34), 1.32, s < 2 ? -0.45 : -1.32);
      sack.rotation.y = (s - 1.5) * 0.08;
      sack.castShadow = true;
      root.add(sack);
    }

    // Driver seated on front box
    const { pGroup: driver } = createPedestrian('worker');
    driver.position.set(0.32, 0.56, 0.05);
    driver.scale.setScalar(0.88);
    root.add(driver);

    // 2 Large Spoked Cart Wheels
    const wheels: THREE.Object3D[] = [];
    const rimGeo = track(new THREE.TorusGeometry(0.56, 0.05, 8, 20));
    rimGeo.rotateY(Math.PI / 2);
    const spokeGeo = track(new THREE.CylinderGeometry(0.022, 0.022, 1.08, 6));

    [-0.86, 0.86].forEach((wx) => {
      const wGroup = new THREE.Group();
      wGroup.position.set(wx, 0.58, -0.85);
      wGroup.add(new THREE.Mesh(rimGeo, ironWheelMat));
      for (let sp = 0; sp < 5; sp++) {
        const spoke = new THREE.Mesh(spokeGeo, timberCartMat);
        spoke.rotation.x = (sp * Math.PI) / 5;
        wGroup.add(spoke);
      }
      root.add(wGroup);
      wheels.push(wGroup);
    });

    return { root, legs, wheels, headPivot, tailPivot };
  };

  // ---------------------------------------------------------------------------
  // Helper: Build Period 1910–1914 Automobile
  // ---------------------------------------------------------------------------
  const createVintageMotor = (bodyMat: THREE.Material) => {
    const root = new THREE.Group();
    const hood = new THREE.Mesh(track(new THREE.BoxGeometry(0.72, 0.52, 0.92)), bodyMat);
    hood.position.set(0, 0.78, 0.82);
    hood.castShadow = true;
    root.add(hood);

    const rad = new THREE.Mesh(track(new THREE.BoxGeometry(0.68, 0.64, 0.14)), brassMat);
    rad.position.set(0, 0.78, 1.31);
    rad.castShadow = true;
    root.add(rad);

    const cabin = new THREE.Mesh(track(new THREE.BoxGeometry(1.06, 0.58, 1.58)), bodyMat);
    cabin.position.set(0, 0.78, -0.45);
    cabin.castShadow = true;
    root.add(cabin);

    const canopy = new THREE.Mesh(track(new THREE.BoxGeometry(1.04, 0.06, 1.55)), darkWoolMat);
    canopy.position.set(0, 1.66, -0.52);
    canopy.castShadow = true;
    root.add(canopy);

    const { pGroup: motorist } = createPedestrian('gentleman');
    motorist.position.set(-0.22, 0.42, -0.25);
    motorist.scale.setScalar(0.86);
    root.add(motorist);

    // Brass Headlamps
    const headlightMeshes: THREE.Mesh[] = [];
    [-0.36, 0.36].forEach((hx) => {
      const lamp = new THREE.Mesh(track(new THREE.CylinderGeometry(0.10, 0.08, 0.14, 10)), brassMat);
      lamp.rotation.x = Math.PI / 2;
      lamp.position.set(hx, 0.86, 1.38);
      root.add(lamp);
      const lens = new THREE.Mesh(track(new THREE.CircleGeometry(0.085, 10)), lampBulbMat);
      lens.position.set(hx, 0.86, 1.455);
      root.add(lens);
      headlightMeshes.push(lens);
    });

    const wheels: THREE.Object3D[] = [];
    const tireGeo = track(new THREE.TorusGeometry(0.32, 0.055, 8, 18));
    tireGeo.rotateY(Math.PI / 2);
    const wheelOffsets: [number, number][] = [
      [0.68, 1.2],
      [-0.68, 1.2],
      [0.68, -1.2],
      [-0.68, -1.2],
    ];
    wheelOffsets.forEach(([wx, wz]) => {
      const wg = new THREE.Group();
      wg.position.set(wx, 0.37, wz);
      wg.add(new THREE.Mesh(tireGeo, ironWheelMat));
      root.add(wg);
      wheels.push(wg);
    });

    return { root, wheels, headlightMeshes };
  };

  // ---------------------------------------------------------------------------
  // Helper: Build Collie Farm Dog
  // ---------------------------------------------------------------------------
  const createDog = () => {
    const dGroup = new THREE.Group();
    const body = new THREE.Mesh(track(new THREE.BoxGeometry(0.24, 0.26, 0.56)), collieMat);
    body.position.set(0, 0.38, 0);
    body.castShadow = true;
    const chest = new THREE.Mesh(track(new THREE.BoxGeometry(0.25, 0.25, 0.16)), collieWhiteMat);
    chest.position.set(0, 0.39, 0.22);
    const head = new THREE.Mesh(track(new THREE.BoxGeometry(0.16, 0.16, 0.26)), collieMat);
    head.position.set(0, 0.54, 0.34);
    const tailPivot = new THREE.Group();
    tailPivot.position.set(0, 0.45, -0.28);
    const tail = new THREE.Mesh(track(new THREE.CylinderGeometry(0.025, 0.04, 0.28, 6)), collieMat);
    tail.position.set(0, 0.08, -0.1);
    tail.rotation.x = -0.9;
    tailPivot.add(tail);

    const legs: THREE.Object3D[] = [];
    const legGeo = track(new THREE.CylinderGeometry(0.03, 0.025, 0.28, 6));
    [
      [0.09, 0.19],
      [-0.09, 0.19],
      [0.09, -0.19],
      [-0.09, -0.19],
    ].forEach(([lx, lz]) => {
      const pivot = new THREE.Group();
      pivot.position.set(lx, 0.28, lz);
      const leg = new THREE.Mesh(legGeo, collieWhiteMat);
      leg.position.set(0, -0.14, 0);
      pivot.add(leg);
      dGroup.add(pivot);
      legs.push(pivot);
    });

    dGroup.add(body, chest, head, tailPivot);
    return { dGroup, legs, tailPivot };
  };

  // ---------------------------------------------------------------------------
  // Spawn Moving Period Agents (Carts, Vintage Motors, Pedestrians, Dogs)
  // ---------------------------------------------------------------------------
  const agents: MovingAgent[] = [];

  // 1. Horse-Drawn Grain Cart (Harbour St Westbound -> Tyne St -> Itchen St -> Quay loop)
  const cart1 = createHorseCart(bayHorseMat);
  const cart1Route: PathWaypoint[] = [
    { x: 82, z: -2.6 },
    { x: -20, z: -2.6 },
    { x: -21, z: -66 },
    { x: 92, z: -66 },
    { x: 92, z: -2.6 },
  ];
  cart1.root.position.set(cart1Route[0].x, 1.0, cart1Route[0].z);
  group.add(cart1.root);
  agents.push({
    group: cart1.root,
    kind: 'horse-cart',
    waypoints: cart1Route,
    wpIndex: 1,
    x: cart1Route[0].x,
    z: cart1Route[0].z,
    yaw: -Math.PI / 2,
    speed: 2.35,
    phase: 0,
    radius: 2.1,
    legs: cart1.legs,
    wheels: cart1.wheels,
    head: cart1.headPivot,
    tail: cart1.tailPivot,
  });

  // 2. Horse-Drawn Wharf Dray (Harbour St Eastbound onto Sumpter Wharf turnaround)
  const cart2 = createHorseCart(chestnutHorseMat);
  const cart2Route: PathWaypoint[] = [
    { x: 10, z: 2.8 },
    { x: 145, z: 2.8 },
    { x: 145, z: -2.8 },
    { x: 10, z: -2.8 },
  ];
  cart2.root.position.set(cart2Route[0].x, 1.0, cart2Route[0].z);
  group.add(cart2.root);
  agents.push({
    group: cart2.root,
    kind: 'horse-cart',
    waypoints: cart2Route,
    wpIndex: 1,
    x: cart2Route[0].x,
    z: cart2Route[0].z,
    yaw: Math.PI / 2,
    speed: 2.0,
    phase: 1.7,
    radius: 2.1,
    legs: cart2.legs,
    wheels: cart2.wheels,
    head: cart2.headPivot,
    tail: cart2.tailPivot,
  });

  // 3. 1912 Brewster Green Runabout Motorcar
  const car1 = createVintageMotor(greenCarMat);
  const car1Route: PathWaypoint[] = [
    { x: -85, z: 3.1 },
    { x: 96, z: 3.1 },
    { x: 96, z: -69 },
    { x: -102, z: -69 },
    { x: -102, z: 3.1 },
  ];
  car1.root.position.set(-15, 1.0, 3.1);
  group.add(car1.root);
  agents.push({
    group: car1.root,
    kind: 'vintage-car',
    waypoints: car1Route,
    wpIndex: 1,
    x: -15,
    z: 3.1,
    yaw: Math.PI / 2,
    speed: 6.2,
    phase: 0,
    radius: 1.8,
    wheels: car1.wheels,
    headlightMeshes: car1.headlightMeshes,
  });

  // 4. 1910 Maroon Edwardian Tourer on Tyne & Harbour
  const car2 = createVintageMotor(maroonCarMat);
  const car2Route: PathWaypoint[] = [
    { x: -26, z: 65 },
    { x: -26, z: -64 },
    { x: 91, z: -64 },
    { x: 91, z: 65 },
  ];
  car2.root.position.set(-26, 1.0, 30);
  group.add(car2.root);
  agents.push({
    group: car2.root,
    kind: 'vintage-car',
    waypoints: car2Route,
    wpIndex: 1,
    x: -26,
    z: 30,
    yaw: Math.PI,
    speed: 5.5,
    phase: 0,
    radius: 1.8,
    wheels: car2.wheels,
    headlightMeshes: car2.headlightMeshes,
  });

  // 5. Edwardian Footpath Pedestrians along Harbour St, Tyne St & Sumpter Wharf
  const pedRoutes: { style: 'gentleman' | 'lady' | 'worker'; pts: PathWaypoint[]; speed: number }[] = [
    { style: 'gentleman', pts: [{ x: -68, z: -8.6 }, { x: 82, z: -8.6 }], speed: 1.35 },
    { style: 'lady', pts: [{ x: 75, z: 8.6 }, { x: -55, z: 8.6 }], speed: 1.15 },
    { style: 'worker', pts: [{ x: 105, z: -5.4 }, { x: 158, z: -5.4 }], speed: 1.4 },
    { style: 'gentleman', pts: [{ x: -32.2, z: -48 }, { x: -32.2, z: 54 }], speed: 1.25 },
    { style: 'lady', pts: [{ x: -15.8, z: 42 }, { x: -15.8, z: -45 }], speed: 1.1 },
    { style: 'worker', pts: [{ x: -10, z: -8.6 }, { x: 58, z: -8.6 }], speed: 1.3 },
    { style: 'lady', pts: [{ x: -86, z: 8.6 }, { x: -18, z: 8.6 }], speed: 1.18 },
  ];

  pedRoutes.forEach((cfg, idx) => {
    const { pGroup, legs, arms } = createPedestrian(cfg.style);
    const start = cfg.pts[0];
    pGroup.position.set(start.x, 1.0, start.z);
    group.add(pGroup);
    agents.push({
      group: pGroup,
      kind: 'pedestrian',
      waypoints: cfg.pts,
      wpIndex: 1,
      x: start.x,
      z: start.z,
      yaw: 0,
      speed: cfg.speed,
      phase: idx * 1.1,
      radius: 0.65,
      legs,
      arms,
    });
  });

  // 6. Farm Collie Dogs trotting near Criterion Hotel & Sumpter Wharf
  const dogRoutes: PathWaypoint[][] = [
    [
      { x: -38, z: 9.2 },
      { x: -58, z: 9.2 },
    ],
    [
      { x: 112, z: 5.1 },
      { x: 146, z: 5.1 },
    ],
  ];
  dogRoutes.forEach((pts, i) => {
    const { dGroup, legs, tailPivot } = createDog();
    dGroup.position.set(pts[0].x, 1.0, pts[0].z);
    group.add(dGroup);
    agents.push({
      group: dGroup,
      kind: 'dog',
      waypoints: pts,
      wpIndex: 1,
      x: pts[0].x,
      z: pts[0].z,
      yaw: 0,
      speed: 2.1,
      phase: i * 2.1,
      radius: 0.5,
      legs,
      tail: tailPivot,
    });
  });

  // ---------------------------------------------------------------------------
  // Hitched Riding Horses outside Northern Stables & Criterion Hotel
  // ---------------------------------------------------------------------------
  const staticAnimals: StaticAnimal[] = [];
  const hitchedCoords: [number, number, number, THREE.Material][] = [
    [-64, 9.8, 0.3, bayHorseMat],
    [-66.5, 9.8, -0.15, chestnutHorseMat],
    [34, -9.8, Math.PI, bayHorseMat],
  ];
  hitchedCoords.forEach(([hx, hz, hyaw, mat], idx) => {
    const { hGroup, headPivot, tailPivot } = createHorseMesh(mat);
    const hy = getTerrainHeightAndSurface(hx, hz).height;
    hGroup.position.set(hx, hy, hz);
    hGroup.rotation.y = hyaw;
    group.add(hGroup);
    staticAnimals.push({ group: hGroup, head: headPivot, tail: tailPivot, phase: idx * 1.9 });
  });

  // ---------------------------------------------------------------------------
  // Coastal Seagulls wheeling over Sumpter Wharf & Oamaru Harbour
  // ---------------------------------------------------------------------------
  const seagulls: Seagull[] = [];
  const wingGeo = track(new THREE.BoxGeometry(0.46, 0.03, 0.16));
  const bodyGeo = track(new THREE.BoxGeometry(0.14, 0.1, 0.42));

  for (let g = 0; g < 7; g++) {
    const gGroup = new THREE.Group();
    const body = new THREE.Mesh(bodyGeo, gullWhiteMat);
    const leftWing = new THREE.Group();
    const lwMesh = new THREE.Mesh(wingGeo, gullTipMat);
    lwMesh.position.set(0.24, 0, 0);
    leftWing.add(lwMesh);

    const rightWing = new THREE.Group();
    const rwMesh = new THREE.Mesh(wingGeo, gullTipMat);
    rwMesh.position.set(-0.24, 0, 0);
    rightWing.add(rwMesh);

    gGroup.add(body, leftWing, rightWing);
    group.add(gGroup);

    seagulls.push({
      group: gGroup,
      leftWing,
      rightWing,
      centerX: 132 + (g % 3) * 14,
      centerZ: -12 + (g - 3) * 11,
      baseY: 11 + (g % 4) * 2.8,
      orbitR: 10 + (g % 3) * 5,
      speed: 0.42 + (g % 3) * 0.12,
      phase: g * 0.9,
    });
  }

  const obstacleSnapshot: DynamicObstacle[] = agents
    .filter((a) => a.kind === 'horse-cart' || a.kind === 'vintage-car')
    .map((a) => ({ x: a.x, z: a.z, radius: a.radius }));

  return {
    group,
    update: (dt: number, elapsed: number, playerX: number, playerZ: number, lightsOn: boolean) => {
      lampBulbMat.emissiveIntensity = lightsOn ? 2.2 : 0.35;

      let obsIdx = 0;
      for (let i = 0; i < agents.length; i++) {
        const a = agents[i];
        const target = a.waypoints[a.wpIndex];
        const dx = target.x - a.x;
        const dz = target.z - a.z;
        const dist = Math.hypot(dx, dz);

        if (dist < 1.1) {
          a.wpIndex = (a.wpIndex + 1) % a.waypoints.length;
        }

        const dirX = dx / Math.max(0.001, dist);
        const dirZ = dz / Math.max(0.001, dist);

        // Vehicles pause courteously if player's Model T is directly blocking their lane
        const distToPlayer = Math.hypot(playerX - (a.x + dirX * 3.2), playerZ - (a.z + dirZ * 3.2));
        const blocked = (a.kind === 'horse-cart' || a.kind === 'vintage-car') && distToPlayer < 4.2;

        const moveSpeed = blocked ? 0 : a.speed;
        a.x += dirX * moveSpeed * dt;
        a.z += dirZ * moveSpeed * dt;

        const targetYaw = Math.atan2(dirX, dirZ);
        let diff = targetYaw - a.yaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        a.yaw += diff * Math.min(1, dt * 6);

        const groundH = getTerrainHeightAndSurface(a.x, a.z).height;
        a.group.position.set(a.x, groundH, a.z);
        a.group.rotation.y = a.yaw;

        if (moveSpeed > 0.05) {
          a.phase += moveSpeed * dt * (a.kind === 'dog' ? 4.2 : 2.6);
        }

        if (a.legs && a.legs.length >= 2) {
          const swing = Math.sin(a.phase) * (a.kind === 'pedestrian' ? 0.55 : 0.42);
          if (a.legs.length === 2) {
            a.legs[0].rotation.x = swing;
            a.legs[1].rotation.x = -swing;
          } else if (a.legs.length === 4) {
            a.legs[0].rotation.x = swing;
            a.legs[1].rotation.x = -swing;
            a.legs[2].rotation.x = -swing;
            a.legs[3].rotation.x = swing;
          }
        }

        if (a.arms && a.arms.length === 2) {
          const armSwing = Math.sin(a.phase) * 0.42;
          a.arms[0].rotation.x = -armSwing;
          a.arms[1].rotation.x = armSwing;
        }

        if (a.wheels) {
          const spinDelta = moveSpeed * dt * (a.kind === 'horse-cart' ? 1.7 : 2.8);
          for (let w = 0; w < a.wheels.length; w++) {
            a.wheels[w].rotation.x += spinDelta;
          }
        }

        if (a.head) {
          a.head.rotation.x = Math.sin(elapsed * 2.4 + a.phase) * 0.08;
        }
        if (a.tail) {
          a.tail.rotation.z = Math.sin(elapsed * 4.5 + a.phase) * 0.22;
        }

        if (a.kind === 'horse-cart' || a.kind === 'vintage-car') {
          if (obsIdx < obstacleSnapshot.length) {
            obstacleSnapshot[obsIdx].x = a.x;
            obstacleSnapshot[obsIdx].z = a.z;
            obsIdx++;
          }
        }
      }

      // Hitched Horses idle motion
      for (let i = 0; i < staticAnimals.length; i++) {
        const sa = staticAnimals[i];
        sa.head.rotation.x = 0.25 + Math.sin(elapsed * 1.3 + sa.phase) * 0.14;
        sa.tail.rotation.z = Math.sin(elapsed * 3.2 + sa.phase) * 0.18;
      }

      // Circling Harbour Seagulls
      for (let i = 0; i < seagulls.length; i++) {
        const sg = seagulls[i];
        const angle = elapsed * sg.speed + sg.phase;
        const gx = sg.centerX + Math.cos(angle) * sg.orbitR;
        const gz = sg.centerZ + Math.sin(angle) * sg.orbitR;
        const gy = sg.baseY + Math.sin(elapsed * 1.4 + sg.phase) * 0.9;
        sg.group.position.set(gx, gy, gz);
        sg.group.rotation.y = -angle;
        const flap = Math.sin(elapsed * 7.5 + sg.phase) * 0.45;
        sg.leftWing.rotation.z = flap;
        sg.rightWing.rotation.z = -flap;
      }
    },
    getObstacles: () => obstacleSnapshot,
    dispose: () => {
      disposables.forEach((d) => d.dispose());
    },
  };
}
