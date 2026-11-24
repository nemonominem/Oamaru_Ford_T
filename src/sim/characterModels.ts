import * as THREE from 'three';

export type HumanPreset =
  | 'farmer'
  | 'gentleman'
  | 'lady'
  | 'worker'
  | 'constable'
  | 'newsboy'
  | 'mechanic'
  | 'schoolboy'
  | 'captain'
  | 'piper';

export interface ArticulatedHumanRig {
  group: THREE.Group;
  bodyAndHeadGroup: THREE.Group;
  armsGroup: THREE.Group;
  headPivot: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftElbow: THREE.Group;
  rightElbow: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  leftKnee: THREE.Group;
  rightKnee: THREE.Group;
  propPivot?: THREE.Object3D;
}

export interface ArticulatedAnimalRig {
  group: THREE.Group;
  headPivot: THREE.Group;
  tailPivot: THREE.Group;
  legPivots: THREE.Group[];
  kneePivots: THREE.Group[];
}

export interface KiwiDriverRig {
  root: THREE.Group;
  setFirstPersonMode: (isCockpit: boolean) => void;
  updatePose: (
    steeringWheel: THREE.Group,
    speedMps: number,
    roll: number,
    steerAngle: number,
    elapsed: number
  ) => void;
}

export interface CharacterAssetPool {
  buildHuman: (
    preset: HumanPreset,
    variantIdx?: number,
    options?: { seated?: boolean; splitFirstPersonArms?: boolean }
  ) => ArticulatedHumanRig;
  buildKiwiFarmerDriver: (
    chassisGroup: THREE.Group,
    steeringWheel: THREE.Group
  ) => KiwiDriverRig;
  buildSheep: (options?: {
    withHorns?: boolean;
    seated?: boolean;
    hasRibbon?: boolean;
  }) => ArticulatedAnimalRig;
  buildCollie: (variantIdx?: number) => ArticulatedAnimalRig;
  buildHorse: (coatHex: number, harnessed?: boolean) => ArticulatedAnimalRig;
  dispose: () => void;
}

// Pre-allocated math helpers for zero-GC driver arm IK
const _vGripL = new THREE.Vector3();
const _vGripR = new THREE.Vector3();
const _vHubWorld = new THREE.Vector3();
const _vRimInward = new THREE.Vector3();
const _vDelta = new THREE.Vector3();
const _vPole = new THREE.Vector3();
const _vElbow = new THREE.Vector3();
const _vUpperDir = new THREE.Vector3();
const _vForeDir = new THREE.Vector3();
const _vDirToGrip = new THREE.Vector3();
const _vDown = new THREE.Vector3(0, -1, 0);
const _vBasisX = new THREE.Vector3();
const _vBasisY = new THREE.Vector3();
const _vBasisZ = new THREE.Vector3();
const _mHandBasis = new THREE.Matrix4();
const _qParentWorld = new THREE.Quaternion();
const _qTemp = new THREE.Quaternion();
const _qInv = new THREE.Quaternion();
const _vWorldTmp = new THREE.Vector3();

function seededRng(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export function createCharacterPool(): CharacterAssetPool {
  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(item: T): T => {
    disposables.push(item);
    return item;
  };

  // -------------------------------------------------------------------------
  // Procedural Fabric, Wool, Coat & Tartan Textures
  // -------------------------------------------------------------------------
  // 1. Curly Merino Fleece Albedo & Bump
  const woolCanvas = document.createElement('canvas');
  woolCanvas.width = 256;
  woolCanvas.height = 256;
  const wCtx = woolCanvas.getContext('2d')!;
  const woolBumpCanvas = document.createElement('canvas');
  woolBumpCanvas.width = 256;
  woolBumpCanvas.height = 256;
  const wbCtx = woolBumpCanvas.getContext('2d')!;
  wCtx.fillStyle = '#ebe2d0';
  wCtx.fillRect(0, 0, 256, 256);
  wbCtx.fillStyle = '#707070';
  wbCtx.fillRect(0, 0, 256, 256);
  const randWool = seededRng(4102);
  for (let i = 0; i < 480; i++) {
    const cx = randWool() * 256;
    const cy = randWool() * 256;
    const rad = 5 + randWool() * 8;
    const shade = 224 + Math.floor(randWool() * 26);
    wCtx.fillStyle = `rgb(${shade},${shade - 6},${shade - 18})`;
    wCtx.beginPath();
    wCtx.arc(cx, cy, rad, 0, Math.PI * 2);
    wCtx.fill();
    wCtx.strokeStyle = 'rgba(176, 162, 138, 0.35)';
    wCtx.lineWidth = 1.5;
    wCtx.stroke();

    const bv = 175 + Math.floor(randWool() * 75);
    wbCtx.fillStyle = `rgb(${bv},${bv},${bv})`;
    wbCtx.beginPath();
    wbCtx.arc(cx, cy, rad * 0.88, 0, Math.PI * 2);
    wbCtx.fill();
  }
  const woolTex = track(new THREE.CanvasTexture(woolCanvas));
  woolTex.colorSpace = THREE.SRGBColorSpace;
  woolTex.wrapS = THREE.RepeatWrapping;
  woolTex.wrapT = THREE.RepeatWrapping;
  woolTex.repeat.set(2, 2);

  const woolBumpTex = track(new THREE.CanvasTexture(woolBumpCanvas));
  woolBumpTex.wrapS = THREE.RepeatWrapping;
  woolBumpTex.wrapT = THREE.RepeatWrapping;
  woolBumpTex.repeat.set(2, 2);

  // 2. Royal Highland Tartan Texture
  const tartanCanvas = document.createElement('canvas');
  tartanCanvas.width = 128;
  tartanCanvas.height = 128;
  const tCtx = tartanCanvas.getContext('2d')!;
  tCtx.fillStyle = '#8b1e24';
  tCtx.fillRect(0, 0, 128, 128);
  tCtx.fillStyle = '#184b30';
  tCtx.fillRect(0, 24, 128, 36);
  tCtx.fillRect(24, 0, 36, 128);
  tCtx.fillStyle = '#172340';
  tCtx.fillRect(0, 84, 128, 22);
  tCtx.fillRect(84, 0, 22, 128);
  tCtx.fillStyle = '#e5be4b';
  tCtx.fillRect(0, 40, 128, 4);
  tCtx.fillRect(40, 0, 4, 128);
  tCtx.fillStyle = '#f2ede2';
  tCtx.fillRect(0, 112, 128, 4);
  tCtx.fillRect(112, 0, 4, 128);
  const tartanTex = track(new THREE.CanvasTexture(tartanCanvas));
  tartanTex.colorSpace = THREE.SRGBColorSpace;
  tartanTex.wrapS = THREE.RepeatWrapping;
  tartanTex.wrapT = THREE.RepeatWrapping;
  tartanTex.repeat.set(2, 2);

  // 3. Textured Tweed Fabric (for Farmer waistcoat, workers, gentlemen)
  const tweedCanvas = document.createElement('canvas');
  tweedCanvas.width = 128;
  tweedCanvas.height = 128;
  const twCtx = tweedCanvas.getContext('2d')!;
  twCtx.fillStyle = '#c8c2b4';
  twCtx.fillRect(0, 0, 128, 128);
  const randTweed = seededRng(1904);
  for (let y = 0; y < 128; y += 2) {
    for (let x = 0; x < 128; x += 2) {
      const v = (x + y) % 4 === 0 ? 176 : 216 + Math.floor((randTweed() - 0.5) * 28);
      twCtx.fillStyle = `rgb(${v},${v - 4},${v - 10})`;
      twCtx.fillRect(x, y, 2, 2);
    }
  }
  const tweedBumpTex = track(new THREE.CanvasTexture(tweedCanvas));
  tweedBumpTex.wrapS = THREE.RepeatWrapping;
  tweedBumpTex.wrapT = THREE.RepeatWrapping;
  tweedBumpTex.repeat.set(3, 3);

  // -------------------------------------------------------------------------
  // Shared Materials
  // -------------------------------------------------------------------------
  const skinMat = track(new THREE.MeshStandardMaterial({ color: 0xdcb494, roughness: 0.72 }));
  const farmerSkinMat = track(new THREE.MeshStandardMaterial({ color: 0xd09e78, roughness: 0.76 }));
  const scleraMat = track(new THREE.MeshStandardMaterial({ color: 0xf7f3eb, roughness: 0.35 }));
  const irisDarkMat = track(new THREE.MeshStandardMaterial({ color: 0x221b17, roughness: 0.25 }));
  const irisAmberMat = track(new THREE.MeshStandardMaterial({ color: 0x8a521d, roughness: 0.22 }));
  const hairBrownMat = track(new THREE.MeshStandardMaterial({ color: 0x3b261a, roughness: 0.88 }));
  const gingerBeardMat = track(new THREE.MeshStandardMaterial({ color: 0xa64922, roughness: 0.88 }));
  const whiteBeardMat = track(new THREE.MeshStandardMaterial({ color: 0xeae6de, roughness: 0.9 }));

  const darkWoolMat = track(new THREE.MeshStandardMaterial({ color: 0x242322, roughness: 0.86, bumpMap: tweedBumpTex, bumpScale: 0.015 }));
  const charcoalMat = track(new THREE.MeshStandardMaterial({ color: 0x363639, roughness: 0.87, bumpMap: tweedBumpTex, bumpScale: 0.015 }));
  const brownTweedMat = track(new THREE.MeshStandardMaterial({ color: 0x5c4a37, roughness: 0.89, bumpMap: tweedBumpTex, bumpScale: 0.018 }));
  const oliveTweedMat = track(new THREE.MeshStandardMaterial({ color: 0x4b533b, roughness: 0.89, bumpMap: tweedBumpTex, bumpScale: 0.018 }));
  const navyCoatMat = track(new THREE.MeshStandardMaterial({ color: 0x1e2c3d, roughness: 0.84, bumpMap: tweedBumpTex, bumpScale: 0.012 }));
  const flannelShirtMat = track(new THREE.MeshStandardMaterial({ color: 0xdfd4be, roughness: 0.88, bumpMap: tweedBumpTex, bumpScale: 0.014 }));
  const farmerVestMat = track(new THREE.MeshStandardMaterial({ color: 0x4b4031, roughness: 0.9, bumpMap: tweedBumpTex, bumpScale: 0.02 }));
  const farmerHatMat = track(new THREE.MeshStandardMaterial({ color: 0x5d4c37, roughness: 0.92 }));
  const leatherBootMat = track(new THREE.MeshStandardMaterial({ color: 0x1f1611, roughness: 0.58 }));
  const gaiterLeatherMat = track(new THREE.MeshStandardMaterial({ color: 0x4e321d, roughness: 0.64 }));
  const gloveLeatherMat = track(new THREE.MeshStandardMaterial({ color: 0x9b683b, roughness: 0.56, metalness: 0.04 }));
  const gloveTrimMat = track(new THREE.MeshStandardMaterial({ color: 0x6f4522, roughness: 0.62 }));
  const brassMat = track(new THREE.MeshStandardMaterial({ color: 0xd9a84e, roughness: 0.24, metalness: 0.88 }));

  const creamBlouseMat = track(new THREE.MeshStandardMaterial({ color: 0xefe7d5, roughness: 0.82 }));
  const mustardShawlMat = track(new THREE.MeshStandardMaterial({ color: 0xb88b42, roughness: 0.85 }));
  const burgundySkirtMat = track(new THREE.MeshStandardMaterial({ color: 0x62242a, roughness: 0.85 }));
  const slateSkirtMat = track(new THREE.MeshStandardMaterial({ color: 0x364452, roughness: 0.85 }));
  const tealDressMat = track(new THREE.MeshStandardMaterial({ color: 0x2d4e4f, roughness: 0.85 }));
  const strawHatMat = track(new THREE.MeshStandardMaterial({ color: 0xdac289, roughness: 0.82 }));
  const redRibbonMat = track(new THREE.MeshStandardMaterial({ color: 0xb92c28, roughness: 0.52 }));

  const overallMat = track(new THREE.MeshStandardMaterial({ color: 0x3b4d63, roughness: 0.87, bumpMap: tweedBumpTex, bumpScale: 0.016 }));
  const greaseClothMat = track(new THREE.MeshStandardMaterial({ color: 0x8f332c, roughness: 0.9 }));
  const blazerMat = track(new THREE.MeshStandardMaterial({ color: 0x1f364d, roughness: 0.84 }));
  const shortsMat = track(new THREE.MeshStandardMaterial({ color: 0x4b463d, roughness: 0.88 }));
  const capGoldMat = track(new THREE.MeshStandardMaterial({ color: 0xc99c42, roughness: 0.45, metalness: 0.45 }));

  const tartanMat = track(new THREE.MeshStandardMaterial({ map: tartanTex, roughness: 0.86 }));
  const kiltJacketMat = track(new THREE.MeshStandardMaterial({ color: 0x1d2b24, roughness: 0.82 }));
  const hoseCreamMat = track(new THREE.MeshStandardMaterial({ color: 0xebe4d2, roughness: 0.86 }));
  const droneWoodMat = track(new THREE.MeshStandardMaterial({ color: 0x1d1410, roughness: 0.44 }));

  const sheepWoolMat = track(
    new THREE.MeshStandardMaterial({
      map: woolTex,
      bumpMap: woolBumpTex,
      bumpScale: 0.04,
      roughness: 0.96,
    })
  );
  const sheepFaceMat = track(new THREE.MeshStandardMaterial({ color: 0x2b2523, roughness: 0.84 }));
  const sheepNostrilMat = track(new THREE.MeshStandardMaterial({ color: 0x4a3836, roughness: 0.7 }));
  const sheepHornMat = track(new THREE.MeshStandardMaterial({ color: 0xc6b38b, roughness: 0.65 }));

  const collieSableMat = track(new THREE.MeshStandardMaterial({ color: 0x8a562d, roughness: 0.86 }));
  const collieDarkMat = track(new THREE.MeshStandardMaterial({ color: 0x281e17, roughness: 0.88 }));
  const collieWhiteMat = track(new THREE.MeshStandardMaterial({ color: 0xf2ece0, roughness: 0.88 }));

  const maneMat = track(new THREE.MeshStandardMaterial({ color: 0x1e1712, roughness: 0.9 }));
  const featherMat = track(new THREE.MeshStandardMaterial({ color: 0xdfd8cb, roughness: 0.92 }));
  const harnessLeatherMat = track(new THREE.MeshStandardMaterial({ color: 0x291b12, roughness: 0.6 }));

  // -------------------------------------------------------------------------
  // Shared Humanoid Geometries
  // -------------------------------------------------------------------------
  const craniumGeo = track(new THREE.SphereGeometry(0.108, 14, 12));
  const jawGeo = track(new THREE.BoxGeometry(0.112, 0.085, 0.115));
  const browGeo = track(new THREE.BoxGeometry(0.125, 0.024, 0.036));
  const neckGeo = track(new THREE.CylinderGeometry(0.052, 0.062, 0.11, 10));
  const noseGeo = track(new THREE.ConeGeometry(0.02, 0.055, 5));
  const earGeo = track(new THREE.SphereGeometry(0.024, 7, 6));
  const eyeScleraGeo = track(new THREE.SphereGeometry(0.017, 8, 6));
  const eyeIrisGeo = track(new THREE.SphereGeometry(0.01, 7, 6));
  const mouthGeo = track(new THREE.BoxGeometry(0.052, 0.008, 0.012));

  const torsoGeo = track(new THREE.CylinderGeometry(0.172, 0.142, 0.46, 12));
  torsoGeo.scale(1.06, 1, 0.64);
  const collarGeo = track(new THREE.TorusGeometry(0.072, 0.018, 6, 12));
  collarGeo.rotateX(Math.PI / 2);

  const upperArmGeo = track(new THREE.CylinderGeometry(0.052, 0.044, 0.25, 9));
  const elbowJointGeo = track(new THREE.SphereGeometry(0.042, 8, 7));
  const forearmGeo = track(new THREE.CylinderGeometry(0.040, 0.029, 0.225, 10));
  const cuffGeo = track(new THREE.CylinderGeometry(0.046, 0.043, 0.042, 10));
  const gloveGauntletGeo = track(new THREE.CylinderGeometry(0.036, 0.031, 0.056, 10));
  const glovePalmGeo = track(new THREE.SphereGeometry(0.033, 10, 8));
  glovePalmGeo.scale(1.0, 1.08, 0.54);
  const gloveKnuckleGeo = track(new THREE.CylinderGeometry(0.013, 0.013, 0.058, 8));
  gloveKnuckleGeo.rotateZ(Math.PI / 2);
  const gloveFingerProxGeo = track(new THREE.CapsuleGeometry(0.0085, 0.024, 4, 7));
  const gloveFingerDistGeo = track(new THREE.CapsuleGeometry(0.0078, 0.020, 4, 7));
  const gloveThumbProxGeo = track(new THREE.CapsuleGeometry(0.0095, 0.022, 4, 7));
  const palmGeo = track(new THREE.BoxGeometry(0.052, 0.068, 0.030));
  const thumbGeo = track(new THREE.CylinderGeometry(0.011, 0.010, 0.040, 6));

  const thighGeo = track(new THREE.CylinderGeometry(0.072, 0.058, 0.42, 10));
  const kneeJointGeo = track(new THREE.SphereGeometry(0.056, 8, 7));
  const shinGeo = track(new THREE.CylinderGeometry(0.056, 0.044, 0.41, 10));
  const gaiterStrapGeo = track(new THREE.CylinderGeometry(0.059, 0.052, 0.024, 10));
  const bootSoleGeo = track(new THREE.BoxGeometry(0.092, 0.035, 0.19));
  const bootUpperGeo = track(new THREE.BoxGeometry(0.082, 0.055, 0.145));

  // -------------------------------------------------------------------------
  // 1. Articulated Humanoid Builder
  // -------------------------------------------------------------------------
  const buildArticulatedHuman = (
    preset: HumanPreset,
    variantIdx = 0,
    options?: { seated?: boolean; splitFirstPersonArms?: boolean }
  ): ArticulatedHumanRig => {
    const seated = options?.seated ?? false;
    const g = new THREE.Group();
    const bodyAndHeadGroup = new THREE.Group();
    const armsGroup = new THREE.Group();
    g.add(bodyAndHeadGroup, armsGroup);

    const scale =
      preset === 'schoolboy' ? 0.8 : preset === 'newsboy' ? 0.84 : preset === 'lady' ? 0.94 : 0.97 + (variantIdx % 3) * 0.02;
    g.scale.setScalar(scale);

    const activeSkin = preset === 'farmer' || preset === 'worker' ? farmerSkinMat : skinMat;
    const torsoY = seated ? 0.31 : 1.18;
    const shoulderY = seated ? 0.49 : 1.38;
    const hipY = seated ? 0.09 : 0.92;
    const headY = seated ? 0.67 : 1.54;

    // Head + Jaw + Eyes + Ears + Nose + Period Hats & Facial Hair
    const headPivot = new THREE.Group();
    headPivot.position.set(0, headY, 0);

    const neck = new THREE.Mesh(neckGeo, activeSkin);
    neck.position.set(0, -0.06, 0);
    const skull = new THREE.Mesh(craniumGeo, activeSkin);
    skull.scale.set(0.92, 1.06, 0.98);
    skull.position.set(0, 0.06, 0);
    skull.castShadow = true;

    const jaw = new THREE.Mesh(jawGeo, activeSkin);
    jaw.position.set(0, -0.005, 0.02);
    const brow = new THREE.Mesh(browGeo, activeSkin);
    brow.position.set(0, 0.08, 0.088);

    const nose = new THREE.Mesh(noseGeo, activeSkin);
    nose.rotation.x = Math.PI * 0.42;
    nose.position.set(0, 0.04, 0.108);

    const mouth = new THREE.Mesh(mouthGeo, leatherBootMat);
    mouth.position.set(0, -0.004, 0.086);

    [-0.095, 0.095].forEach((ex) => {
      const ear = new THREE.Mesh(earGeo, activeSkin);
      ear.scale.set(0.55, 1.1, 0.8);
      ear.position.set(ex, 0.045, 0);
      headPivot.add(ear);
    });

    [-0.036, 0.036].forEach((ex) => {
      const sclera = new THREE.Mesh(eyeScleraGeo, scleraMat);
      sclera.position.set(ex, 0.064, 0.088);
      const iris = new THREE.Mesh(eyeIrisGeo, irisDarkMat);
      iris.position.set(ex, 0.064, 0.099);
      headPivot.add(sclera, iris);
    });

    headPivot.add(neck, skull, jaw, brow, nose, mouth);

    // Determine outfit materials & hat
    let coatMat: THREE.Material = brownTweedMat;
    let sleeveUpperMat: THREE.Material = brownTweedMat;
    let forearmMat: THREE.Material = brownTweedMat;
    let legMat: THREE.Material = charcoalMat;
    let hasGaiters = false;

    if (preset === 'farmer') {
      coatMat = farmerVestMat;
      sleeveUpperMat = flannelShirtMat;
      forearmMat = farmerSkinMat; // rolled-up flannel sleeves!
      legMat = brownTweedMat;
      hasGaiters = true;

      // Wide-brimmed Kiwi farmer felt slouch hat + leather band
      const hatBrim = new THREE.Mesh(track(new THREE.CylinderGeometry(0.24, 0.25, 0.018, 16)), farmerHatMat);
      hatBrim.position.set(0, 0.135, 0.005);
      hatBrim.rotation.x = -0.06;
      const hatCrown = new THREE.Mesh(track(new THREE.CylinderGeometry(0.095, 0.118, 0.115, 14)), farmerHatMat);
      hatCrown.position.set(0, 0.185, 0);
      const hatBand = new THREE.Mesh(track(new THREE.CylinderGeometry(0.121, 0.121, 0.022, 14)), leatherBootMat);
      hatBand.position.set(0, 0.148, 0);
      const stache = new THREE.Mesh(track(new THREE.BoxGeometry(0.086, 0.024, 0.03)), hairBrownMat);
      stache.position.set(0, 0.01, 0.098);
      headPivot.add(hatBrim, hatCrown, hatBand, stache);
    } else if (preset === 'gentleman') {
      const coatChoices = [darkWoolMat, charcoalMat, brownTweedMat];
      coatMat = coatChoices[variantIdx % coatChoices.length];
      sleeveUpperMat = coatMat;
      forearmMat = coatMat;
      legMat = variantIdx % 2 === 0 ? charcoalMat : brownTweedMat;
      const hatMat = variantIdx % 2 === 0 ? darkWoolMat : brownTweedMat;
      if (variantIdx % 3 === 0) {
        const crown = new THREE.Mesh(track(new THREE.CylinderGeometry(0.105, 0.11, 0.17, 14)), hatMat);
        crown.position.set(0, 0.20, 0);
        const brim = new THREE.Mesh(track(new THREE.CylinderGeometry(0.16, 0.16, 0.018, 14)), hatMat);
        brim.position.set(0, 0.13, 0);
        headPivot.add(crown, brim);
      } else {
        const crown = new THREE.Mesh(track(new THREE.SphereGeometry(0.115, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.58)), hatMat);
        crown.position.set(0, 0.118, 0);
        const brim = new THREE.Mesh(track(new THREE.CylinderGeometry(0.165, 0.165, 0.018, 14)), hatMat);
        brim.position.set(0, 0.122, 0);
        headPivot.add(crown, brim);
      }
      const stache = new THREE.Mesh(track(new THREE.BoxGeometry(0.088, 0.022, 0.028)), hairBrownMat);
      stache.position.set(0, 0.012, 0.098);
      headPivot.add(stache);
    } else if (preset === 'lady') {
      const dressChoices = [burgundySkirtMat, slateSkirtMat, tealDressMat, navyCoatMat];
      const skirtMat = dressChoices[variantIdx % dressChoices.length];
      coatMat = variantIdx % 2 === 0 ? creamBlouseMat : skirtMat;
      sleeveUpperMat = coatMat;
      forearmMat = coatMat;
      legMat = skirtMat;

      const hairBun = new THREE.Mesh(track(new THREE.SphereGeometry(0.062, 10, 8)), hairBrownMat);
      hairBun.position.set(0, 0.045, -0.108);
      const hatMat = variantIdx % 2 === 0 ? strawHatMat : burgundySkirtMat;
      const brim = new THREE.Mesh(track(new THREE.CylinderGeometry(0.245, 0.255, 0.022, 16)), hatMat);
      brim.position.set(0, 0.138, 0);
      brim.rotation.x = -0.07;
      const crown = new THREE.Mesh(track(new THREE.CylinderGeometry(0.11, 0.128, 0.08, 14)), creamBlouseMat);
      crown.position.set(0, 0.178, 0);
      const ribbon = new THREE.Mesh(track(new THREE.CylinderGeometry(0.131, 0.131, 0.026, 14)), skirtMat);
      ribbon.position.set(0, 0.152, 0);
      const flower = new THREE.Mesh(track(new THREE.SphereGeometry(0.04, 7, 6)), redRibbonMat);
      flower.position.set(0.145, 0.155, 0.075);
      headPivot.add(hairBun, brim, crown, ribbon, flower);

      // Edwardian skirt & waist sash
      if (!seated) {
        const skirtUpper = new THREE.Mesh(track(new THREE.CylinderGeometry(0.15, 0.27, 0.54, 14)), skirtMat);
        skirtUpper.position.set(0, 0.72, 0);
        skirtUpper.castShadow = true;
        const skirtFlounce = new THREE.Mesh(track(new THREE.CylinderGeometry(0.268, 0.335, 0.36, 14)), skirtMat);
        skirtFlounce.position.set(0, 0.26, 0);
        skirtFlounce.castShadow = true;
        bodyAndHeadGroup.add(skirtUpper, skirtFlounce);
      } else {
        const seatedSkirt = new THREE.Mesh(track(new THREE.CylinderGeometry(0.17, 0.24, 0.32, 12)), skirtMat);
        seatedSkirt.rotation.x = Math.PI / 2 - 0.12;
        seatedSkirt.position.set(0, 0.10, 0.16);
        bodyAndHeadGroup.add(seatedSkirt);
      }
      if (variantIdx % 3 === 1) {
        const shawl = new THREE.Mesh(track(new THREE.CylinderGeometry(0.185, 0.195, 0.16, 12)), mustardShawlMat);
        shawl.scale.set(1.05, 1, 0.68);
        shawl.position.set(0, torsoY + 0.14, 0);
        bodyAndHeadGroup.add(shawl);
      }
    } else if (preset === 'mechanic') {
      coatMat = overallMat;
      sleeveUpperMat = overallMat;
      forearmMat = overallMat;
      legMat = overallMat;
      const cap = new THREE.Mesh(track(new THREE.CylinderGeometry(0.122, 0.118, 0.058, 12)), overallMat);
      cap.position.set(0, 0.13, 0.01);
      const peak = new THREE.Mesh(track(new THREE.BoxGeometry(0.14, 0.016, 0.095)), leatherBootMat);
      peak.position.set(0, 0.11, 0.115);
      const stache = new THREE.Mesh(track(new THREE.BoxGeometry(0.082, 0.022, 0.024)), hairBrownMat);
      stache.position.set(0, 0.014, 0.096);
      const rag = new THREE.Mesh(track(new THREE.BoxGeometry(0.085, 0.17, 0.036)), greaseClothMat);
      rag.position.set(0.15, torsoY - 0.17, 0.095);
      rag.rotation.z = -0.22;
      bodyAndHeadGroup.add(rag);
      headPivot.add(cap, peak, stache);
    } else if (preset === 'schoolboy') {
      coatMat = blazerMat;
      sleeveUpperMat = blazerMat;
      forearmMat = blazerMat;
      legMat = shortsMat;
      const cap = new THREE.Mesh(track(new THREE.SphereGeometry(0.118, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.56)), blazerMat);
      cap.position.set(0, 0.095, 0);
      cap.rotation.z = -0.15;
      const stripe = new THREE.Mesh(track(new THREE.TorusGeometry(0.114, 0.011, 6, 14)), capGoldMat);
      stripe.rotation.x = Math.PI / 2;
      stripe.position.set(0, 0.105, 0);
      const peak = new THREE.Mesh(track(new THREE.BoxGeometry(0.13, 0.015, 0.085)), blazerMat);
      peak.position.set(0.02, 0.095, 0.11);
      headPivot.add(cap, stripe, peak);
    } else if (preset === 'captain') {
      coatMat = navyCoatMat;
      sleeveUpperMat = navyCoatMat;
      forearmMat = navyCoatMat;
      legMat = navyCoatMat;
      const cap = new THREE.Mesh(track(new THREE.CylinderGeometry(0.134, 0.116, 0.072, 14)), navyCoatMat);
      cap.position.set(0, 0.138, 0);
      const goldBand = new THREE.Mesh(track(new THREE.CylinderGeometry(0.121, 0.121, 0.022, 14)), brassMat);
      goldBand.position.set(0, 0.108, 0);
      const visor = new THREE.Mesh(track(new THREE.BoxGeometry(0.14, 0.016, 0.09)), leatherBootMat);
      visor.position.set(0, 0.098, 0.12);
      const beard = new THREE.Mesh(track(new THREE.ConeGeometry(0.082, 0.18, 10)), whiteBeardMat);
      beard.position.set(0, -0.068, 0.068);
      beard.rotation.x = Math.PI - 0.14;
      headPivot.add(cap, goldBand, visor, beard);
    } else if (preset === 'piper') {
      coatMat = kiltJacketMat;
      sleeveUpperMat = kiltJacketMat;
      forearmMat = kiltJacketMat;
      legMat = hoseCreamMat;
      const beard = new THREE.Mesh(track(new THREE.ConeGeometry(0.08, 0.14, 9)), gingerBeardMat);
      beard.position.set(0, -0.048, 0.07);
      beard.rotation.x = Math.PI - 0.1;
      const bonnet = new THREE.Mesh(track(new THREE.BoxGeometry(0.13, 0.11, 0.27)), kiltJacketMat);
      bonnet.position.set(0, 0.16, -0.01);
      bonnet.rotation.z = -0.14;
      const bonnetBand = new THREE.Mesh(track(new THREE.BoxGeometry(0.138, 0.035, 0.275)), tartanMat);
      bonnetBand.position.set(0, 0.12, -0.01);
      bonnetBand.rotation.z = -0.14;
      const toorie = new THREE.Mesh(track(new THREE.SphereGeometry(0.028, 7, 6)), redRibbonMat);
      toorie.position.set(0.02, 0.22, 0.02);
      headPivot.add(beard, bonnet, bonnetBand, toorie);
    } else if (preset === 'constable') {
      coatMat = navyCoatMat;
      sleeveUpperMat = navyCoatMat;
      forearmMat = navyCoatMat;
      legMat = navyCoatMat;
      const helmet = new THREE.Mesh(track(new THREE.CylinderGeometry(0.095, 0.132, 0.18, 14)), navyCoatMat);
      helmet.position.set(0, 0.168, 0);
      const badge = new THREE.Mesh(track(new THREE.BoxGeometry(0.04, 0.05, 0.02)), brassMat);
      badge.position.set(0, 0.168, 0.12);
      const stache = new THREE.Mesh(track(new THREE.BoxGeometry(0.08, 0.02, 0.025)), hairBrownMat);
      stache.position.set(0, 0.014, 0.098);
      headPivot.add(helmet, badge, stache);
    } else {
      // Worker / Newsboy
      const choices = [oliveTweedMat, brownTweedMat, navyCoatMat, charcoalMat];
      coatMat = choices[variantIdx % choices.length];
      sleeveUpperMat = coatMat;
      forearmMat = coatMat;
      legMat = brownTweedMat;
      const cap = new THREE.Mesh(track(new THREE.CylinderGeometry(0.122, 0.118, 0.058, 12)), brownTweedMat);
      cap.position.set(0, 0.128, 0.01);
      const peak = new THREE.Mesh(track(new THREE.BoxGeometry(0.15, 0.016, 0.095)), leatherBootMat);
      peak.position.set(0, 0.108, 0.115);
      headPivot.add(cap, peak);
    }

    bodyAndHeadGroup.add(headPivot);

    // Tailored Torso, Waistcoat / Lapels / Collar / Buttons / Watch Chain
    const torso = new THREE.Mesh(torsoGeo, coatMat);
    torso.position.set(0, torsoY, 0);
    torso.castShadow = true;
    bodyAndHeadGroup.add(torso);

    const collar = new THREE.Mesh(collarGeo, preset === 'farmer' ? flannelShirtMat : creamBlouseMat);
    collar.position.set(0, torsoY + 0.21, 0);
    bodyAndHeadGroup.add(collar);

    if (preset === 'farmer') {
      // Flannel shirt V-insert at collar + buttoned wool waistcoat + brass pocket watch chain
      const shirtBib = new THREE.Mesh(track(new THREE.BoxGeometry(0.11, 0.18, 0.03)), flannelShirtMat);
      shirtBib.position.set(0, torsoY + 0.13, 0.095);
      const belt = new THREE.Mesh(track(new THREE.CylinderGeometry(0.148, 0.152, 0.05, 12)), leatherBootMat);
      belt.scale.set(1.06, 1, 0.68);
      belt.position.set(0, torsoY - 0.19, 0);
      const buckle = new THREE.Mesh(track(new THREE.BoxGeometry(0.05, 0.046, 0.02)), brassMat);
      buckle.position.set(0, torsoY - 0.19, 0.105);
      const chain = new THREE.Mesh(track(new THREE.TorusGeometry(0.068, 0.007, 5, 12, Math.PI)), brassMat);
      chain.rotation.z = Math.PI;
      chain.position.set(0.02, torsoY - 0.04, 0.098);
      bodyAndHeadGroup.add(shirtBib, belt, buckle, chain);
      for (let b = 0; b < 4; b++) {
        const btn = new THREE.Mesh(track(new THREE.SphereGeometry(0.012, 6, 5)), brassMat);
        btn.position.set(0, torsoY + 0.06 - b * 0.065, 0.105);
        bodyAndHeadGroup.add(btn);
      }
    } else if (preset === 'gentleman') {
      const vest = new THREE.Mesh(track(new THREE.BoxGeometry(0.15, 0.34, 0.032)), creamBlouseMat);
      vest.position.set(0, torsoY + 0.02, 0.095);
      const tie = new THREE.Mesh(track(new THREE.BoxGeometry(0.038, 0.24, 0.02)), burgundySkirtMat);
      tie.position.set(0, torsoY + 0.05, 0.108);
      const coattail = new THREE.Mesh(track(new THREE.BoxGeometry(0.33, 0.24, 0.16)), coatMat);
      coattail.position.set(0, torsoY - 0.27, -0.02);
      bodyAndHeadGroup.add(vest, tie, coattail);
    } else if (preset === 'captain' || preset === 'constable') {
      const belt = new THREE.Mesh(track(new THREE.BoxGeometry(0.34, 0.055, 0.19)), leatherBootMat);
      belt.position.set(0, torsoY - 0.18, 0);
      bodyAndHeadGroup.add(belt);
      [-0.055, 0.055].forEach((bx) => {
        [0.12, 0.0, -0.11].forEach((by) => {
          const btn = new THREE.Mesh(track(new THREE.SphereGeometry(0.015, 6, 6)), brassMat);
          btn.position.set(bx, torsoY + by, 0.102);
          bodyAndHeadGroup.add(btn);
        });
      });
    } else if (preset === 'schoolboy') {
      const tie = new THREE.Mesh(track(new THREE.BoxGeometry(0.042, 0.22, 0.02)), capGoldMat);
      tie.position.set(0, torsoY + 0.04, 0.102);
      bodyAndHeadGroup.add(tie);
    } else if (preset === 'piper') {
      const kilt = new THREE.Mesh(track(new THREE.CylinderGeometry(0.16, 0.275, 0.48, 16)), tartanMat);
      kilt.position.set(0, 0.78, 0);
      kilt.castShadow = true;
      const sporran = new THREE.Mesh(track(new THREE.BoxGeometry(0.13, 0.17, 0.055)), hoseCreamMat);
      sporran.position.set(0, 0.78, 0.215);
      const sporranTop = new THREE.Mesh(track(new THREE.BoxGeometry(0.136, 0.044, 0.06)), leatherBootMat);
      sporranTop.position.set(0, 0.87, 0.215);
      const plaidSash = new THREE.Mesh(track(new THREE.BoxGeometry(0.135, 0.54, 0.21)), tartanMat);
      plaidSash.position.set(-0.04, 1.22, 0);
      plaidSash.rotation.z = 0.52;
      const belt = new THREE.Mesh(track(new THREE.BoxGeometry(0.36, 0.058, 0.205)), leatherBootMat);
      belt.position.set(0, 1.0, 0);
      const buckle = new THREE.Mesh(track(new THREE.BoxGeometry(0.08, 0.07, 0.025)), brassMat);
      buckle.position.set(0, 1.0, 0.112);
      bodyAndHeadGroup.add(kilt, sporran, sporranTop, plaidSash, belt, buckle);
    } else if (preset === 'worker') {
      const belt = new THREE.Mesh(track(new THREE.BoxGeometry(0.34, 0.052, 0.19)), harnessLeatherMat);
      belt.position.set(0, torsoY - 0.18, 0);
      bodyAndHeadGroup.add(belt);
      if (variantIdx % 2 === 1) {
        const apron = new THREE.Mesh(track(new THREE.BoxGeometry(0.28, 0.54, 0.036)), creamBlouseMat);
        apron.position.set(0, torsoY - 0.26, 0.102);
        bodyAndHeadGroup.add(apron);
      }
    }

    // Articulated Multi-Joint Legs (Hip -> Thigh -> Knee -> Shin/Gaiter -> Boot)
    const legPivots: THREE.Group[] = [];
    const kneePivots: THREE.Group[] = [];
    [-0.095, 0.095].forEach((lx) => {
      const hipPivot = new THREE.Group();
      hipPivot.position.set(lx, hipY, seated ? 0.04 : 0);

      const thighMat = preset === 'piper' ? activeSkin : legMat;
      const thigh = new THREE.Mesh(thighGeo, thighMat);
      thigh.position.set(0, -0.21, 0);
      thigh.castShadow = true;

      const kneePivot = new THREE.Group();
      kneePivot.position.set(0, -0.42, 0);
      const kneeCap = new THREE.Mesh(kneeJointGeo, preset === 'piper' ? activeSkin : legMat);
      kneePivot.add(kneeCap);

      const shinMat = hasGaiters ? gaiterLeatherMat : preset === 'piper' ? hoseCreamMat : preset === 'schoolboy' ? activeSkin : legMat;
      const shin = new THREE.Mesh(shinGeo, shinMat);
      shin.position.set(0, -0.205, 0);
      shin.castShadow = true;
      kneePivot.add(shin);

      if (hasGaiters) {
        [-0.06, -0.20, -0.34].forEach((sy) => {
          const strap = new THREE.Mesh(gaiterStrapGeo, leatherBootMat);
          strap.position.set(0, sy, 0);
          kneePivot.add(strap);
        });
      } else if (preset === 'piper') {
        const flash = new THREE.Mesh(track(new THREE.BoxGeometry(0.028, 0.085, 0.025)), redRibbonMat);
        flash.position.set(lx > 0 ? 0.056 : -0.056, -0.09, 0.02);
        kneePivot.add(flash);
      }

      const bootGroup = new THREE.Group();
      bootGroup.position.set(0, -0.43, 0.03);
      const sole = new THREE.Mesh(bootSoleGeo, leatherBootMat);
      sole.position.set(0, -0.015, 0);
      const vamp = new THREE.Mesh(bootUpperGeo, leatherBootMat);
      vamp.position.set(0, 0.02, -0.01);
      bootGroup.add(sole, vamp);
      kneePivot.add(bootGroup);

      hipPivot.add(thigh, kneePivot);
      if (seated) {
        hipPivot.rotation.x = -1.34;
        kneePivot.rotation.x = 1.32;
      }
      if (preset !== 'lady' || seated) {
        bodyAndHeadGroup.add(hipPivot);
      }
      legPivots.push(hipPivot);
      kneePivots.push(kneePivot);
    });

    // Articulated Multi-Joint Arms (Shoulder -> Upper Arm -> Elbow -> Forearm -> Sculpted Hand)
    const armPivots: THREE.Group[] = [];
    const elbowPivots: THREE.Group[] = [];
    let propPivot: THREE.Object3D | undefined;
    [-0.205, 0.205].forEach((ax, ai) => {
      const shoulderPivot = new THREE.Group();
      shoulderPivot.position.set(ax, shoulderY, 0);

      const upperArm = new THREE.Mesh(upperArmGeo, sleeveUpperMat);
      upperArm.position.set(0, -0.125, 0);
      upperArm.castShadow = true;

      const elbowPivot = new THREE.Group();
      elbowPivot.position.set(0, -0.25, 0);
      const elbowCap = new THREE.Mesh(elbowJointGeo, preset === 'farmer' ? flannelShirtMat : sleeveUpperMat);
      elbowPivot.add(elbowCap);

      const forearm = new THREE.Mesh(forearmGeo, forearmMat);
      forearm.position.set(0, -0.112, 0);
      forearm.castShadow = true;
      elbowPivot.add(forearm);

      if (preset === 'farmer') {
        // Rolled-up flannel shirt cuff neatly hugging just below the elbow
        const rollCuff = new THREE.Mesh(cuffGeo, flannelShirtMat);
        rollCuff.position.set(0, -0.024, 0);
        elbowPivot.add(rollCuff);
      } else {
        const wristCuff = new THREE.Mesh(cuffGeo, creamBlouseMat);
        wristCuff.position.set(0, -0.205, 0);
        elbowPivot.add(wristCuff);
      }

      // Sculpted Hand (1914 Tan Leather Driving Gloves for Driver; articulated palm + thumb for pedestrians)
      const handGrp = new THREE.Group();
      handGrp.position.set(0, -0.236, 0);

      if (preset === 'farmer') {
        const gauntlet = new THREE.Mesh(gloveGauntletGeo, gloveTrimMat);
        gauntlet.position.set(0, 0.012, 0);
        gauntlet.castShadow = true;

        const palmMesh = new THREE.Mesh(glovePalmGeo, gloveLeatherMat);
        palmMesh.position.set(0, -0.028, 0.002);
        palmMesh.castShadow = true;

        const knuckleBridge = new THREE.Mesh(gloveKnuckleGeo, gloveLeatherMat);
        knuckleBridge.position.set(0, -0.058, 0.004);
        knuckleBridge.castShadow = true;
        handGrp.add(gauntlet, palmMesh, knuckleBridge);

        // 4 Articulated Curled Fingers wrapping gently around steering rim (+Z inward)
        const fingerOffsets = [-0.022, -0.0075, 0.0075, 0.022];
        const fingerScales = [0.94, 1.04, 1.0, 0.86];
        for (let fi = 0; fi < 4; fi++) {
          const fingerBase = new THREE.Group();
          fingerBase.position.set(fingerOffsets[fi], -0.058, 0.004);
          fingerBase.rotation.x = -0.68;

          const prox = new THREE.Mesh(gloveFingerProxGeo, gloveLeatherMat);
          prox.scale.setScalar(fingerScales[fi]);
          prox.position.set(0, -0.016 * fingerScales[fi], 0);
          prox.castShadow = true;

          const midJoint = new THREE.Group();
          midJoint.position.set(0, -0.032 * fingerScales[fi], 0);
          midJoint.rotation.x = -1.02;
          const dist = new THREE.Mesh(gloveFingerDistGeo, gloveLeatherMat);
          dist.scale.setScalar(fingerScales[fi]);
          dist.position.set(0, -0.013 * fingerScales[fi], 0);
          dist.castShadow = true;

          midJoint.add(dist);
          fingerBase.add(prox, midJoint);
          handGrp.add(fingerBase);
        }

        // Opposing Curled Thumb (top/12-o'clock rim side: -X for ai===0 right hand, +X for ai===1 left hand)
        const thumbSide = ai === 0 ? -1 : 1;
        const thumbPivot = new THREE.Group();
        thumbPivot.position.set(thumbSide * 0.030, -0.024, 0.009);
        thumbPivot.rotation.z = thumbSide * -0.52;
        thumbPivot.rotation.x = -0.55;
        const thumbMesh = new THREE.Mesh(gloveThumbProxGeo, gloveLeatherMat);
        thumbMesh.position.set(0, -0.018, 0);
        thumbMesh.castShadow = true;
        const thumbTipPivot = new THREE.Group();
        thumbTipPivot.position.set(0, -0.034, 0);
        thumbTipPivot.rotation.x = -0.58;
        const thumbTip = new THREE.Mesh(gloveFingerDistGeo, gloveLeatherMat);
        thumbTip.scale.set(1.05, 0.85, 1.05);
        thumbTip.position.set(0, -0.012, 0);
        thumbTipPivot.add(thumbTip);
        thumbPivot.add(thumbMesh, thumbTipPivot);
        handGrp.add(thumbPivot);
      } else {
        const palm = new THREE.Mesh(palmGeo, activeSkin);
        palm.position.set(0, -0.018, 0);
        palm.castShadow = true;
        const thumb = new THREE.Mesh(thumbGeo, activeSkin);
        thumb.position.set(ax < 0 ? 0.026 : -0.026, -0.010, 0.016);
        thumb.rotation.z = ax < 0 ? -0.45 : 0.45;
        handGrp.add(palm, thumb);
      }
      elbowPivot.add(handGrp);

      // Signature Props
      if (ai === 1 && preset === 'mechanic') {
        const spanner = new THREE.Mesh(track(new THREE.BoxGeometry(0.028, 0.22, 0.016)), brassMat);
        spanner.position.set(0, -0.02, 0.075);
        spanner.rotation.x = Math.PI / 2;
        handGrp.add(spanner);
        propPivot = spanner;
      } else if (ai === 1 && preset === 'captain') {
        const spyglass = new THREE.Mesh(track(new THREE.CylinderGeometry(0.024, 0.017, 0.25, 8)), brassMat);
        spyglass.rotation.x = Math.PI / 2;
        spyglass.position.set(0, -0.01, 0.095);
        handGrp.add(spyglass);
        propPivot = spyglass;
      } else if (ai === 0 && preset === 'lady') {
        const bag = new THREE.Mesh(track(new THREE.BoxGeometry(0.07, 0.15, 0.16)), leatherBootMat);
        bag.position.set(0, -0.09, 0.02);
        handGrp.add(bag);
        propPivot = bag;
      } else if (ai === 1 && preset === 'gentleman' && variantIdx % 2 === 0 && !seated) {
        const cane = new THREE.Mesh(track(new THREE.CylinderGeometry(0.013, 0.01, 0.84, 7)), gaiterLeatherMat);
        cane.position.set(0, -0.36, 0.12);
        cane.rotation.x = 0.2;
        handGrp.add(cane);
        propPivot = cane;
      }

      if (seated) {
        shoulderPivot.rotation.x = -0.36;
        elbowPivot.rotation.x = -0.62;
      }

      shoulderPivot.add(upperArm, elbowPivot);
      armsGroup.add(shoulderPivot);
      armPivots.push(shoulderPivot);
      elbowPivots.push(elbowPivot);
    });

    return {
      group: g,
      bodyAndHeadGroup,
      armsGroup,
      headPivot,
      leftArm: armPivots[0],
      rightArm: armPivots[1],
      leftElbow: elbowPivots[0],
      rightElbow: elbowPivots[1],
      leftLeg: legPivots[0],
      rightLeg: legPivots[1],
      leftKnee: kneePivots[0],
      rightKnee: kneePivots[1],
      propPivot,
    };
  };

  // -------------------------------------------------------------------------
  // 2. 1914 Kiwi Farmer Driver Rig (Full Body Exterior / Hands-Only Driver View)
  // -------------------------------------------------------------------------
  const buildKiwiFarmerDriver = (
    chassisGroup: THREE.Group,
    steeringWheel: THREE.Group
  ): KiwiDriverRig => {
    const rig = buildArticulatedHuman('farmer', 0, {
      seated: true,
      splitFirstPersonArms: true,
    });
    // Seat farmer cleanly behind the right-hand-drive steering wheel (x = -0.23)
    rig.group.position.set(-0.23, 0.63, -0.36);
    chassisGroup.add(rig.group);

    // Steering wheel rim grip anchors (outer 10-and-2 wood rim edge, clear of spokes)
    const gripLeftAnchor = new THREE.Object3D();
    gripLeftAnchor.position.set(0.184, 0.012, 0.095);
    steeringWheel.add(gripLeftAnchor);

    const gripRightAnchor = new THREE.Object3D();
    gripRightAnchor.position.set(-0.184, 0.012, 0.095);
    steeringWheel.add(gripRightAnchor);

    const upperLen = 0.25;
    const foreLen = 0.265;

    const aimArmToGrip = (
      shoulderPivot: THREE.Group,
      elbowPivot: THREE.Group,
      gripWorld: THREE.Vector3,
      hubWorld: THREE.Vector3,
      sideSign: number
    ) => {
      rig.group.getWorldQuaternion(_qParentWorld);
      _qInv.copy(_qParentWorld).invert();

      // Convert grip point & wheel hub center into driver rig local space
      _vDelta.copy(gripWorld);
      rig.group.worldToLocal(_vDelta);

      _vRimInward.copy(hubWorld);
      rig.group.worldToLocal(_vRimInward);
      _vRimInward.sub(_vDelta).normalize(); // points from outer rim grip toward wheel hub center

      _vDelta.sub(shoulderPivot.position);

      const dist = THREE.MathUtils.clamp(_vDelta.length(), 0.14, upperLen + foreLen - 0.012);
      _vDirToGrip.copy(_vDelta).normalize();

      // Elbow bend triangle via law of cosines with outward-downward pole vector
      const cosAngle = THREE.MathUtils.clamp(
        (upperLen * upperLen + dist * dist - foreLen * foreLen) / (2 * upperLen * dist),
        -0.98,
        0.98
      );
      const adj = upperLen * cosAngle;
      const perp = Math.sqrt(Math.max(0, upperLen * upperLen - adj * adj));

      _vPole.set(sideSign * 0.58, -0.82, 0.04);
      _vPole.addScaledVector(_vDirToGrip, -_vPole.dot(_vDirToGrip));
      if (_vPole.lengthSq() < 1e-4) _vPole.set(sideSign, -1, 0);
      _vPole.normalize();

      _vElbow.copy(shoulderPivot.position).addScaledVector(_vDirToGrip, adj).addScaledVector(_vPole, perp);
      _vUpperDir.copy(_vElbow).sub(shoulderPivot.position).normalize();
      _vForeDir.copy(shoulderPivot.position).add(_vDelta).sub(_vElbow).normalize();

      shoulderPivot.quaternion.setFromUnitVectors(_vDown, _vUpperDir);

      // Convert forearm direction & wheel-inward normal into shoulderPivot local space
      _qTemp.copy(shoulderPivot.quaternion).invert();
      _vForeDir.applyQuaternion(_qTemp).normalize();
      _vRimInward.applyQuaternion(_qTemp).normalize();

      // Orthonormal twist-locked wrist frame:
      // -Y_local = forearm axis toward wrist, +Z_local = inward toward rim center (finger curl direction)
      _vBasisY.copy(_vForeDir).negate();
      _vBasisZ.copy(_vRimInward).addScaledVector(_vBasisY, -_vRimInward.dot(_vBasisY));
      if (_vBasisZ.lengthSq() < 1e-4) {
        _vBasisZ.set(sideSign * -1, 0, 0);
      } else {
        _vBasisZ.normalize();
      }
      _vBasisX.crossVectors(_vBasisY, _vBasisZ).normalize();
      _mHandBasis.makeBasis(_vBasisX, _vBasisY, _vBasisZ);
      elbowPivot.quaternion.setFromRotationMatrix(_mHandBasis);
    };

    const setFirstPersonMode = (isCockpit: boolean) => {
      rig.bodyAndHeadGroup.visible = !isCockpit;
      rig.armsGroup.visible = true;
    };

    const updatePose = (
      steeringWheelObj: THREE.Group,
      speedMps: number,
      roll: number,
      steerAngle: number,
      elapsed: number
    ) => {
      // Subtle corner lean & road vibration in exterior views
      const roadVib = Math.sin(elapsed * 22) * Math.min(0.012, speedMps * 0.0012);
      rig.bodyAndHeadGroup.rotation.z = -roll * 0.45 - steerAngle * 0.14;
      rig.bodyAndHeadGroup.position.y = Math.max(0, roadVib);
      rig.headPivot.rotation.y = THREE.MathUtils.clamp(steerAngle * 0.55, -0.35, 0.35);
      rig.headPivot.rotation.x = Math.sin(elapsed * 2.1) * 0.03;

      chassisGroup.updateWorldMatrix(true, true);
      steeringWheelObj.getWorldPosition(_vHubWorld);
      gripLeftAnchor.getWorldPosition(_vWorldTmp);
      _vGripL.copy(_vWorldTmp);
      gripRightAnchor.getWorldPosition(_vWorldTmp);
      _vGripR.copy(_vWorldTmp);

      aimArmToGrip(rig.leftArm, rig.leftElbow, _vGripR, _vHubWorld, -1); // leftArm at x = -0.205 (driver's right)
      aimArmToGrip(rig.rightArm, rig.rightElbow, _vGripL, _vHubWorld, 1); // rightArm at x = +0.205 (driver's left)
    };

    return {
      root: rig.group,
      setFirstPersonMode,
      updatePose,
    };
  };

  // -------------------------------------------------------------------------
  // 3. Articulated Merino Sheep Builder (Multi-tuft Wool, Muzzle, Horns & Hooves)
  // -------------------------------------------------------------------------
  const sheepBodyCoreGeo = track(new THREE.SphereGeometry(0.24, 12, 10));
  const sheepWoolPuffGeo = track(new THREE.SphereGeometry(0.16, 9, 8));
  const sheepHornGeo = track(new THREE.TorusGeometry(0.085, 0.022, 6, 12, Math.PI * 1.45));
  const sheepUpperLegGeo = track(new THREE.CylinderGeometry(0.056, 0.042, 0.17, 8));
  const sheepLowerLegGeo = track(new THREE.CylinderGeometry(0.032, 0.025, 0.18, 8));
  const sheepHoofGeo = track(new THREE.CylinderGeometry(0.028, 0.034, 0.045, 7));

  const buildArticulatedSheep = (options?: {
    withHorns?: boolean;
    seated?: boolean;
    hasRibbon?: boolean;
  }): ArticulatedAnimalRig => {
    const seated = options?.seated ?? false;
    const withHorns = options?.withHorns ?? false;
    const hasRibbon = options?.hasRibbon ?? false;

    const sGroup = new THREE.Group();
    const bodyGrp = new THREE.Group();
    bodyGrp.position.set(0, seated ? 0.25 : 0.54, seated ? -0.02 : 0);
    if (seated) bodyGrp.rotation.x = -0.32;

    const core = new THREE.Mesh(sheepBodyCoreGeo, sheepWoolMat);
    core.scale.set(0.92, 0.94, 1.45);
    core.castShadow = true;
    bodyGrp.add(core);

    // Rich multi-puff woolly fleece silhouette
    const puffOffsets: [number, number, number, number][] = [
      [0, 0.11, 0.22, 1.15],
      [0, 0.08, -0.22, 1.12],
      [0.14, 0.04, 0.08, 0.95],
      [-0.14, 0.04, 0.08, 0.95],
      [0.13, 0.03, -0.14, 0.92],
      [-0.13, 0.03, -0.14, 0.92],
      [0, 0.18, 0.0, 1.0],
      [0, -0.04, 0.24, 0.88],
    ];
    puffOffsets.forEach(([px, py, pz, sc]) => {
      const puff = new THREE.Mesh(sheepWoolPuffGeo, sheepWoolMat);
      puff.position.set(px, py, pz);
      puff.scale.setScalar(sc);
      puff.castShadow = true;
      bodyGrp.add(puff);
    });

    if (hasRibbon) {
      const collarRibbon = new THREE.Mesh(track(new THREE.TorusGeometry(0.16, 0.025, 7, 14)), redRibbonMat);
      collarRibbon.position.set(0, 0.14, 0.26);
      collarRibbon.rotation.x = 0.52;
      const rosette = new THREE.Mesh(track(new THREE.CylinderGeometry(0.055, 0.055, 0.02, 10)), redRibbonMat);
      rosette.rotation.x = Math.PI / 2;
      rosette.position.set(0, 0.06, 0.39);
      bodyGrp.add(collarRibbon, rosette);
    }

    // Sculpted Merino Head + Tapered Muzzle + Eyes + Ears + Optional Horns
    const headPivot = new THREE.Group();
    headPivot.position.set(0, 0.21, 0.36);

    const skull = new THREE.Mesh(track(new THREE.SphereGeometry(0.11, 10, 9)), sheepFaceMat);
    skull.scale.set(0.84, 0.9, 1.12);
    const muzzle = new THREE.Mesh(track(new THREE.CylinderGeometry(0.046, 0.072, 0.14, 9)), sheepFaceMat);
    muzzle.rotation.x = Math.PI / 2 + 0.18;
    muzzle.position.set(0, -0.03, 0.11);
    const noseTip = new THREE.Mesh(track(new THREE.BoxGeometry(0.05, 0.03, 0.028)), sheepNostrilMat);
    noseTip.position.set(0, -0.042, 0.175);
    const crownWool = new THREE.Mesh(track(new THREE.SphereGeometry(0.092, 8, 7)), sheepWoolMat);
    crownWool.position.set(0, 0.085, -0.01);

    [-0.062, 0.062].forEach((ex) => {
      const eyeBall = new THREE.Mesh(track(new THREE.SphereGeometry(0.018, 7, 6)), irisAmberMat);
      eyeBall.position.set(ex, 0.03, 0.072);
      const pupil = new THREE.Mesh(track(new THREE.SphereGeometry(0.011, 6, 5)), irisDarkMat);
      pupil.position.set(ex * 1.05, 0.03, 0.084);
      headPivot.add(eyeBall, pupil);
    });

    [-0.105, 0.105].forEach((ex) => {
      const ear = new THREE.Mesh(track(new THREE.BoxGeometry(0.105, 0.034, 0.048)), sheepFaceMat);
      ear.position.set(ex, 0.028, -0.01);
      ear.rotation.z = ex < 0 ? 0.52 : -0.52;
      ear.rotation.y = ex < 0 ? -0.22 : 0.22;
      headPivot.add(ear);
    });

    if (withHorns) {
      [-0.08, 0.08].forEach((hx) => {
        const horn = new THREE.Mesh(sheepHornGeo, sheepHornMat);
        horn.position.set(hx, 0.055, -0.02);
        horn.rotation.y = hx < 0 ? Math.PI / 2 + 0.35 : -Math.PI / 2 - 0.35;
        horn.rotation.x = 0.35;
        headPivot.add(horn);
      });
    }

    headPivot.add(skull, muzzle, noseTip, crownWool);
    bodyGrp.add(headPivot);

    // Woolly Tail
    const tailPivot = new THREE.Group();
    tailPivot.position.set(0, 0.06, -0.37);
    const tail = new THREE.Mesh(track(new THREE.SphereGeometry(0.078, 7, 6)), sheepWoolMat);
    tail.scale.set(0.85, 1.25, 0.9);
    tailPivot.add(tail);
    bodyGrp.add(tailPivot);

    // 4 Articulated Legs (Woolly Thigh/Shoulder + Knee + Lower Cannon + Cloven Hoof)
    const legPivots: THREE.Group[] = [];
    const kneePivots: THREE.Group[] = [];
    [
      [0.13, 0.21],
      [-0.13, 0.21],
      [0.13, -0.21],
      [-0.13, -0.21],
    ].forEach(([lx, lz], idx) => {
      const hip = new THREE.Group();
      hip.position.set(lx, -0.14, lz);
      const upper = new THREE.Mesh(sheepUpperLegGeo, sheepWoolMat);
      upper.position.set(0, -0.085, 0);
      upper.castShadow = true;

      const knee = new THREE.Group();
      knee.position.set(0, -0.17, 0);
      const lower = new THREE.Mesh(sheepLowerLegGeo, sheepFaceMat);
      lower.position.set(0, -0.09, 0);
      lower.castShadow = true;
      const hoof = new THREE.Mesh(sheepHoofGeo, leatherBootMat);
      hoof.position.set(0, -0.19, 0.01);
      knee.add(lower, hoof);
      hip.add(upper, knee);

      if (seated) {
        hip.rotation.x = idx < 2 ? -1.12 : -0.72;
        knee.rotation.x = 0.65;
      }
      bodyGrp.add(hip);
      legPivots.push(hip);
      kneePivots.push(knee);
    });

    sGroup.add(bodyGrp);
    return { group: sGroup, headPivot, tailPivot, legPivots, kneePivots };
  };

  // -------------------------------------------------------------------------
  // 4. Articulated Border Collie Builder
  // -------------------------------------------------------------------------
  const collieUpperLegGeo = track(new THREE.CylinderGeometry(0.036, 0.028, 0.16, 8));
  const collieLowerLegGeo = track(new THREE.CylinderGeometry(0.025, 0.02, 0.16, 8));
  const colliePawGeo = track(new THREE.BoxGeometry(0.044, 0.032, 0.068));

  const buildArticulatedCollie = (variantIdx = 0): ArticulatedAnimalRig => {
    const dGroup = new THREE.Group();
    const coatMat = variantIdx % 2 === 0 ? collieSableMat : collieDarkMat;

    const torso = new THREE.Mesh(track(new THREE.CylinderGeometry(0.125, 0.14, 0.52, 12)), coatMat);
    torso.rotation.x = Math.PI / 2;
    torso.position.set(0, 0.39, 0);
    torso.castShadow = true;

    const chestRuff = new THREE.Mesh(track(new THREE.SphereGeometry(0.148, 10, 8)), collieWhiteMat);
    chestRuff.scale.set(0.92, 1.08, 1.05);
    chestRuff.position.set(0, 0.42, 0.22);

    const collar = new THREE.Mesh(track(new THREE.TorusGeometry(0.118, 0.018, 6, 12)), leatherBootMat);
    collar.position.set(0, 0.48, 0.24);
    collar.rotation.x = 0.55;
    const brassTag = new THREE.Mesh(track(new THREE.CylinderGeometry(0.018, 0.018, 0.008, 8)), brassMat);
    brassTag.rotation.x = Math.PI / 2;
    brassTag.position.set(0, 0.40, 0.34);

    const headPivot = new THREE.Group();
    headPivot.position.set(0, 0.54, 0.30);
    const skull = new THREE.Mesh(track(new THREE.SphereGeometry(0.095, 10, 8)), coatMat);
    skull.scale.set(0.92, 0.9, 1.14);
    const snout = new THREE.Mesh(track(new THREE.CylinderGeometry(0.032, 0.056, 0.15, 8)), collieWhiteMat);
    snout.rotation.x = Math.PI / 2 + 0.08;
    snout.position.set(0, -0.015, 0.14);
    const wetNose = new THREE.Mesh(track(new THREE.SphereGeometry(0.022, 6, 6)), leatherBootMat);
    wetNose.position.set(0, -0.005, 0.215);

    [-0.044, 0.044].forEach((ex) => {
      const eye = new THREE.Mesh(track(new THREE.SphereGeometry(0.015, 6, 6)), irisAmberMat);
      eye.position.set(ex, 0.032, 0.075);
      headPivot.add(eye);
    });
    [-0.056, 0.056].forEach((ex) => {
      const ear = new THREE.Mesh(track(new THREE.ConeGeometry(0.032, 0.085, 5)), coatMat);
      ear.position.set(ex, 0.095, 0.01);
      ear.rotation.x = 0.28;
      ear.rotation.z = ex < 0 ? 0.22 : -0.22;
      headPivot.add(ear);
    });
    headPivot.add(skull, snout, wetNose);

    const tailPivot = new THREE.Group();
    tailPivot.position.set(0, 0.45, -0.26);
    const tailBase = new THREE.Mesh(track(new THREE.CylinderGeometry(0.028, 0.042, 0.26, 7)), coatMat);
    tailBase.position.set(0, 0.07, -0.10);
    tailBase.rotation.x = -0.95;
    const tailTip = new THREE.Mesh(track(new THREE.ConeGeometry(0.028, 0.12, 7)), collieWhiteMat);
    tailTip.position.set(0, 0.15, -0.22);
    tailTip.rotation.x = -0.95;
    tailPivot.add(tailBase, tailTip);

    const legPivots: THREE.Group[] = [];
    const kneePivots: THREE.Group[] = [];
    [
      [0.09, 0.19],
      [-0.09, 0.19],
      [0.09, -0.19],
      [-0.09, -0.19],
    ].forEach(([lx, lz]) => {
      const hip = new THREE.Group();
      hip.position.set(lx, 0.31, lz);
      const upper = new THREE.Mesh(collieUpperLegGeo, coatMat);
      upper.position.set(0, -0.08, 0);
      upper.castShadow = true;

      const knee = new THREE.Group();
      knee.position.set(0, -0.155, 0);
      const lower = new THREE.Mesh(collieLowerLegGeo, collieWhiteMat);
      lower.position.set(0, -0.08, 0);
      lower.castShadow = true;
      const paw = new THREE.Mesh(colliePawGeo, collieWhiteMat);
      paw.position.set(0, -0.155, 0.016);
      knee.add(lower, paw);
      hip.add(upper, knee);
      dGroup.add(hip);
      legPivots.push(hip);
      kneePivots.push(knee);
    });

    dGroup.add(torso, chestRuff, collar, brassTag, headPivot, tailPivot);
    return { group: dGroup, headPivot, tailPivot, legPivots, kneePivots };
  };

  // -------------------------------------------------------------------------
  // 5. Articulated Draft & Saddle Horse Builder
  // -------------------------------------------------------------------------
  const horseUpperLegGeo = track(new THREE.CylinderGeometry(0.09, 0.064, 0.46, 9));
  const horseLowerLegGeo = track(new THREE.CylinderGeometry(0.056, 0.048, 0.45, 9));
  const horseFetlockGeo = track(new THREE.ConeGeometry(0.072, 0.14, 8));
  const horseHoofGeo = track(new THREE.CylinderGeometry(0.06, 0.07, 0.08, 9));

  const buildArticulatedHorse = (coatHex: number, harnessed = true): ArticulatedAnimalRig => {
    const coatMat = track(new THREE.MeshStandardMaterial({ color: coatHex, roughness: 0.75 }));
    const hGroup = new THREE.Group();

    const barrel = new THREE.Mesh(track(new THREE.CylinderGeometry(0.32, 0.34, 1.24, 14)), coatMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 1.18, 0);
    barrel.castShadow = true;
    const chest = new THREE.Mesh(track(new THREE.SphereGeometry(0.335, 12, 10)), coatMat);
    chest.position.set(0, 1.2, 0.58);
    const rump = new THREE.Mesh(track(new THREE.SphereGeometry(0.345, 12, 10)), coatMat);
    rump.position.set(0, 1.21, -0.56);
    hGroup.add(barrel, chest, rump);

    if (harnessed) {
      const collar = new THREE.Mesh(track(new THREE.TorusGeometry(0.28, 0.055, 8, 14)), harnessLeatherMat);
      collar.position.set(0, 1.32, 0.65);
      collar.rotation.x = 0.42;
      const hameRing = new THREE.Mesh(track(new THREE.TorusGeometry(0.285, 0.02, 6, 14)), brassMat);
      hameRing.position.set(0, 1.33, 0.67);
      hameRing.rotation.x = 0.42;
      const girthStrap = new THREE.Mesh(track(new THREE.CylinderGeometry(0.35, 0.35, 0.14, 12)), harnessLeatherMat);
      girthStrap.rotation.x = Math.PI / 2;
      girthStrap.position.set(0, 1.18, 0.12);
      hGroup.add(collar, hameRing, girthStrap);
    }

    const neck = new THREE.Mesh(track(new THREE.CylinderGeometry(0.15, 0.24, 0.68, 12)), coatMat);
    neck.position.set(0, 1.54, 0.72);
    neck.rotation.x = 0.55;
    neck.castShadow = true;
    const mane = new THREE.Mesh(track(new THREE.BoxGeometry(0.07, 0.56, 0.13)), maneMat);
    mane.position.set(0, 1.60, 0.61);
    mane.rotation.x = 0.55;
    hGroup.add(neck, mane);

    const headPivot = new THREE.Group();
    headPivot.position.set(0, 1.80, 0.94);

    const skull = new THREE.Mesh(track(new THREE.BoxGeometry(0.21, 0.24, 0.28)), coatMat);
    skull.position.set(0, -0.02, 0.1);
    skull.rotation.x = 0.52;
    const muzzle = new THREE.Mesh(track(new THREE.CylinderGeometry(0.082, 0.11, 0.27, 10)), coatMat);
    muzzle.position.set(0, -0.16, 0.24);
    muzzle.rotation.x = Math.PI / 2 + 0.52;
    const bridle = new THREE.Mesh(track(new THREE.TorusGeometry(0.11, 0.015, 6, 12)), harnessLeatherMat);
    bridle.position.set(0, -0.14, 0.22);
    bridle.rotation.y = Math.PI / 2;
    const bit = new THREE.Mesh(track(new THREE.CylinderGeometry(0.012, 0.012, 0.22, 6)), brassMat);
    bit.rotation.z = Math.PI / 2;
    bit.position.set(0, -0.19, 0.27);

    [-0.095, 0.095].forEach((ex) => {
      const eye = new THREE.Mesh(track(new THREE.SphereGeometry(0.022, 7, 6)), irisDarkMat);
      eye.position.set(ex, 0.03, 0.13);
      headPivot.add(eye);
      if (harnessed) {
        const blinder = new THREE.Mesh(track(new THREE.BoxGeometry(0.014, 0.085, 0.08)), harnessLeatherMat);
        blinder.position.set(ex * 1.12, 0.03, 0.11);
        headPivot.add(blinder);
      }
    });
    [-0.07, 0.07].forEach((ex) => {
      const ear = new THREE.Mesh(track(new THREE.ConeGeometry(0.032, 0.11, 6)), coatMat);
      ear.position.set(ex, 0.125, 0.02);
      headPivot.add(ear);
    });
    headPivot.add(skull, muzzle, bridle, bit);
    hGroup.add(headPivot);

    const tailPivot = new THREE.Group();
    tailPivot.position.set(0, 1.34, -0.82);
    const tail = new THREE.Mesh(track(new THREE.CylinderGeometry(0.045, 0.098, 0.76, 9)), maneMat);
    tail.position.set(0, -0.35, -0.08);
    tail.rotation.x = -0.22;
    tailPivot.add(tail);
    hGroup.add(tailPivot);

    const legPivots: THREE.Group[] = [];
    const kneePivots: THREE.Group[] = [];
    [
      [0.19, 0.56],
      [-0.19, 0.56],
      [0.19, -0.56],
      [-0.19, -0.56],
    ].forEach(([lx, lz]) => {
      const hip = new THREE.Group();
      hip.position.set(lx, 0.96, lz);
      const upper = new THREE.Mesh(horseUpperLegGeo, coatMat);
      upper.position.set(0, -0.23, 0);
      upper.castShadow = true;

      const knee = new THREE.Group();
      knee.position.set(0, -0.46, 0);
      const lower = new THREE.Mesh(horseLowerLegGeo, coatMat);
      lower.position.set(0, -0.225, 0);
      lower.castShadow = true;
      if (harnessed) {
        const fetlock = new THREE.Mesh(horseFetlockGeo, featherMat);
        fetlock.position.set(0, -0.40, -0.01);
        knee.add(fetlock);
      }
      const hoof = new THREE.Mesh(horseHoofGeo, maneMat);
      hoof.position.set(0, -0.46, 0);
      knee.add(lower, hoof);
      hip.add(upper, knee);
      hGroup.add(hip);
      legPivots.push(hip);
      kneePivots.push(knee);
    });

    return { group: hGroup, headPivot, tailPivot, legPivots, kneePivots };
  };

  return {
    buildHuman: buildArticulatedHuman,
    buildKiwiFarmerDriver,
    buildSheep: buildArticulatedSheep,
    buildCollie: buildArticulatedCollie,
    buildHorse: buildArticulatedHorse,
    dispose: () => {
      disposables.forEach((d) => d.dispose());
    },
  };
}
