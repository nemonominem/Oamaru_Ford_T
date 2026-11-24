import * as THREE from 'three';
import { KiwiDriverRig, createCharacterPool } from './characterModels';

export type ModelTInstrumentKey =
  | 'ignition'
  | 'sparkThrottle'
  | 'crank'
  | 'pedals'
  | 'handbrake'
  | 'gauges';

export interface ModelTRig {
  root: THREE.Group;
  chassisGroup: THREE.Group;
  wheelHubs: [THREE.Group, THREE.Group, THREE.Group, THREE.Group]; // FL, FR, RL, RR
  wheelSpinGroups: [THREE.Group, THREE.Group, THREE.Group, THREE.Group];
  frontKnuckles: [THREE.Group, THREE.Group]; // FL, FR steering pivots
  steeringWheel: THREE.Group;
  sparkLeverPivot: THREE.Group;
  throttleLeverPivot: THREE.Group;
  handCrank: THREE.Group;
  handbrakeLever: THREE.Group;
  speedometerNeedle: THREE.Group;
  ammeterNeedle: THREE.Group;
  wiperPivot: THREE.Group;
  fenderPaint: THREE.MeshPhysicalMaterial;
  fenderMud: { value: number };
  driverRig: KiwiDriverRig;
  pedals: {
    low: THREE.Mesh;
    reverse: THREE.Mesh;
    brake: THREE.Mesh;
  };
  headlights: [THREE.SpotLight, THREE.SpotLight];
  headlightBulbs: [THREE.Mesh, THREE.Mesh];
  headlightCones: [THREE.Mesh, THREE.Mesh];
  coolingFan: THREE.Group;
  setHighlightedInstrument: (key: ModelTInstrumentKey | null, elapsed: number) => void;
  dispose: () => void;
}

export function buildFordModelT(
  isSoftwareGl: boolean,
  radiatorHoneycombTex?: THREE.CanvasTexture
): ModelTRig {
  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(item: T): T => {
    disposables.push(item);
    return item;
  };

  const root = new THREE.Group();
  root.name = 'model-t';
  const chassisGroup = new THREE.Group();
  root.add(chassisGroup);

  // Materials — 1914 Henry Ford black enamel, polished brass, hickory wood, leather, rubber
  const blackPaint = track(
    new THREE.MeshPhysicalMaterial({
      color: 0x121315,
      roughness: 0.24,
      metalness: 0.15,
      clearcoat: isSoftwareGl ? 0 : 0.85,
      clearcoatRoughness: 0.16,
    })
  );

  const fenderPaint = track(
    new THREE.MeshPhysicalMaterial({
      color: 0x121315,
      roughness: 0.28,
      metalness: 0.14,
      clearcoat: isSoftwareGl ? 0 : 0.72,
      clearcoatRoughness: 0.2,
    })
  );
  const fenderMud = { value: 0 };
  const fenderMudColor = new THREE.Color(0x4b3b27);
  fenderPaint.onBeforeCompile = (shader) => {
    shader.uniforms.uMudAmount = fenderMud;
    shader.uniforms.uMudColor = { value: fenderMudColor };
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      '#include <common>\nvarying float vFenderY;'
    ).replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nvFenderY = position.y;'
    );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vFenderY;\nuniform float uMudAmount;\nuniform vec3 uMudColor;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
float mudBand = 1.0 - smoothstep(0.42, 0.70, vFenderY);
diffuseColor.rgb = mix(diffuseColor.rgb, uMudColor, clamp(uMudAmount, 0.0, 1.0) * mudBand);`
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, min(1.0, roughnessFactor + 0.55), clamp(uMudAmount, 0.0, 1.0) * mudBand);`
      );
  };
  fenderPaint.customProgramCacheKey = () => 'fender-mud-band';

  const chassisSteel = track(
    new THREE.MeshStandardMaterial({
      color: 0x1a1b1e,
      roughness: 0.58,
      metalness: 0.55,
    })
  );

  const polishedBrass = track(
    new THREE.MeshStandardMaterial({
      color: 0xd9a84e,
      roughness: 0.2,
      metalness: 0.92,
    })
  );

  // Per-instrument highlightable clones so pulsing an instrument never glows the whole chassis
  const instrumentHighlightMats: Record<ModelTInstrumentKey, THREE.MeshStandardMaterial> = {
    ignition: track(polishedBrass.clone()),
    sparkThrottle: track(polishedBrass.clone()),
    crank: track(polishedBrass.clone()),
    pedals: track(chassisSteel.clone()),
    handbrake: track(polishedBrass.clone()),
    gauges: track(polishedBrass.clone()),
  };

  const darkRubber = track(
    new THREE.MeshStandardMaterial({
      color: 0x1d1d1f,
      roughness: 0.88,
      metalness: 0.04,
    })
  );

  const hickoryWood = track(
    new THREE.MeshStandardMaterial({
      color: 0x6f4726,
      roughness: 0.62,
      metalness: 0.05,
    })
  );

  const tuftedLeather = track(
    new THREE.MeshStandardMaterial({
      color: 0x221b18,
      roughness: 0.72,
      metalness: 0.05,
    })
  );

  const canvasTopMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x2c2823,
      roughness: 0.92,
      metalness: 0.02,
      side: THREE.DoubleSide,
    })
  );

  const glassMat = track(
    new THREE.MeshPhysicalMaterial({
      color: 0xdbe7ee,
      roughness: 0.08,
      metalness: 0.05,
      transparent: true,
      opacity: 0.36,
      depthWrite: false,
    })
  );

  // 1. Ladder Frame Rails & Transverse Leaf Springs
  const railGeo = track(new THREE.BoxGeometry(0.06, 0.09, 2.72));
  const leftRail = new THREE.Mesh(railGeo, chassisSteel);
  leftRail.position.set(0.34, 0.42, 0.02);
  leftRail.castShadow = true;
  chassisGroup.add(leftRail);

  const rightRail = new THREE.Mesh(railGeo, chassisSteel);
  rightRail.position.set(-0.34, 0.42, 0.02);
  rightRail.castShadow = true;
  chassisGroup.add(rightRail);

  // Transverse semi-elliptic front & rear leaf springs
  const springGeo = track(new THREE.BoxGeometry(1.12, 0.055, 0.06));
  const frontSpring = new THREE.Mesh(springGeo, chassisSteel);
  frontSpring.position.set(0, 0.43, 1.27);
  chassisGroup.add(frontSpring);

  const rearSpring = new THREE.Mesh(springGeo, chassisSteel);
  rearSpring.position.set(0, 0.46, -1.27);
  chassisGroup.add(rearSpring);

  // Front & Rear Solid Axles
  const axleGeo = track(new THREE.CylinderGeometry(0.024, 0.024, 1.38, 12));
  axleGeo.rotateZ(Math.PI / 2);
  const frontAxle = new THREE.Mesh(axleGeo, chassisSteel);
  frontAxle.position.set(0, 0.38, 1.27);
  chassisGroup.add(frontAxle);

  const rearAxle = new THREE.Mesh(axleGeo, chassisSteel);
  rearAxle.position.set(0, 0.38, -1.27);
  chassisGroup.add(rearAxle);

  // Differential pumpkin housing on rear axle
  const diffMesh = new THREE.Mesh(track(new THREE.SphereGeometry(0.11, 14, 12)), chassisSteel);
  diffMesh.position.set(0, 0.38, -1.27);
  chassisGroup.add(diffMesh);

  // 2. Brass Radiator & Louvered Engine Hood (True Hollow Bezel Frame -> Zero Z-Fighting)
  const radShellShape = new THREE.Shape();
  radShellShape.moveTo(-0.33, 0);
  radShellShape.lineTo(0.33, 0);
  radShellShape.lineTo(0.33, 0.56);
  radShellShape.quadraticCurveTo(0.33, 0.72, 0, 0.74);
  radShellShape.quadraticCurveTo(-0.33, 0.72, -0.33, 0.56);
  radShellShape.closePath();

  const radHole = new THREE.Path();
  radHole.moveTo(-0.255, 0.055);
  radHole.lineTo(-0.255, 0.53);
  radHole.quadraticCurveTo(-0.255, 0.625, 0, 0.635);
  radHole.quadraticCurveTo(0.255, 0.625, 0.255, 0.53);
  radHole.lineTo(0.255, 0.055);
  radHole.closePath();
  radShellShape.holes.push(radHole);

  const radGeo = track(
    new THREE.ExtrudeGeometry(radShellShape, {
      depth: 0.11,
      bevelEnabled: true,
      bevelSize: 0.015,
      bevelThickness: 0.015,
      bevelSegments: 2,
    })
  );
  const radiatorShell = new THREE.Mesh(radGeo, polishedBrass);
  radiatorShell.position.set(0, 0.44, 1.26);
  radiatorShell.castShadow = true;
  chassisGroup.add(radiatorShell);

  // Radiator dark honeycomb core cleanly recessed inside the hollow brass bezel
  const coreMesh = new THREE.Mesh(
    track(new THREE.BoxGeometry(0.55, 0.59, 0.05)),
    track(
      new THREE.MeshStandardMaterial({
        color: radiatorHoneycombTex ? 0xffffff : 0x1c1814,
        map: radiatorHoneycombTex ?? null,
        roughness: 0.78,
        metalness: 0.42,
      })
    )
  );
  coreMesh.position.set(0, 0.785, 1.325);
  chassisGroup.add(coreMesh);

  // 4-blade brass cooling fan visible behind the front honeycomb grille aperture
  const coolingFan = new THREE.Group();
  coolingFan.position.set(0, 0.785, 1.265);
  const fanHub = new THREE.Mesh(track(new THREE.CylinderGeometry(0.036, 0.036, 0.03, 12)), polishedBrass);
  fanHub.rotation.x = Math.PI / 2;
  coolingFan.add(fanHub);
  const bladeGeo = track(new THREE.BoxGeometry(0.065, 0.16, 0.008));
  for (let b = 0; b < 4; b++) {
    const arm = new THREE.Group();
    arm.rotation.z = (b * Math.PI) / 2;
    const blade = new THREE.Mesh(bladeGeo, polishedBrass);
    blade.position.y = 0.105;
    blade.rotation.y = 0.36;
    arm.add(blade);
    coolingFan.add(arm);
  }
  chassisGroup.add(coolingFan);

  // Brass Radiator Cap
  const radCap = new THREE.Mesh(track(new THREE.CylinderGeometry(0.036, 0.04, 0.05, 14)), polishedBrass);
  radCap.position.set(0, 1.21, 1.32);
  chassisGroup.add(radCap);

  // Hand Crank under front radiator
  const handCrank = new THREE.Group();
  handCrank.position.set(0, 0.43, 1.40);
  const crankArm = new THREE.Mesh(track(new THREE.BoxGeometry(0.025, 0.16, 0.025)), chassisSteel);
  crankArm.position.set(0, -0.07, 0.03);
  const crankHandle = new THREE.Mesh(
    track(new THREE.CylinderGeometry(0.016, 0.016, 0.08, 10)),
    instrumentHighlightMats.crank
  );
  crankHandle.rotation.x = Math.PI / 2;
  crankHandle.position.set(0, -0.14, 0.07);
  handCrank.add(crankArm, crankHandle);
  chassisGroup.add(handCrank);

  // Tapered Hood (4-panel Ford Model T bonnet)
  const hoodShape = new THREE.Shape();
  hoodShape.moveTo(-0.34, 0);
  hoodShape.lineTo(0.34, 0);
  hoodShape.lineTo(0.31, 0.46);
  hoodShape.quadraticCurveTo(0, 0.62, -0.31, 0.46);
  hoodShape.closePath();

  const hoodGeo = track(
    new THREE.ExtrudeGeometry(hoodShape, {
      depth: 0.76,
      bevelEnabled: true,
      bevelSize: 0.01,
      bevelThickness: 0.01,
      bevelSegments: 2,
    })
  );
  const hoodMesh = new THREE.Mesh(hoodGeo, blackPaint);
  hoodMesh.position.set(0, 0.56, 0.50);
  hoodMesh.castShadow = true;
  hoodMesh.receiveShadow = true;
  chassisGroup.add(hoodMesh);

  // Cowl / Firewall behind hood
  const cowlGeo = track(new THREE.BoxGeometry(0.92, 0.56, 0.34));
  const cowlMesh = new THREE.Mesh(cowlGeo, blackPaint);
  cowlMesh.position.set(0, 0.80, 0.34);
  cowlMesh.castShadow = true;
  chassisGroup.add(cowlMesh);

  // Wooden Dashboard + Brass Trim + Ignition Coil Box + Speedometer & Ammeter (visible in Cockpit View)
  const dashBoard = new THREE.Mesh(track(new THREE.BoxGeometry(0.86, 0.44, 0.04)), hickoryWood);
  dashBoard.position.set(0, 0.80, 0.17);
  chassisGroup.add(dashBoard);

  const coilBox = new THREE.Mesh(track(new THREE.BoxGeometry(0.24, 0.18, 0.10)), hickoryWood);
  coilBox.position.set(0.14, 0.85, 0.13);
  chassisGroup.add(coilBox);

  const switchPlate = new THREE.Mesh(
    track(new THREE.BoxGeometry(0.08, 0.09, 0.02)),
    instrumentHighlightMats.ignition
  );
  switchPlate.position.set(0.14, 0.85, 0.075);
  const switchKey = new THREE.Mesh(
    track(new THREE.BoxGeometry(0.014, 0.036, 0.022)),
    instrumentHighlightMats.ignition
  );
  switchKey.position.set(0.14, 0.85, 0.062);
  chassisGroup.add(switchPlate, switchKey);

  // Brass Stewart-Warner 1914 Speedometer on Dashboard facing Cockpit Driver (-Z)
  const dialCanvas = document.createElement('canvas');
  dialCanvas.width = 256;
  dialCanvas.height = 256;
  const dCtx = dialCanvas.getContext('2d')!;
  dCtx.fillStyle = '#f5eedc';
  dCtx.beginPath();
  dCtx.arc(128, 128, 122, 0, Math.PI * 2);
  dCtx.fill();
  dCtx.strokeStyle = '#33291e';
  dCtx.lineWidth = 4;
  for (let mph = 0; mph <= 45; mph += 5) {
    const ang = Math.PI * 0.75 + (mph / 45) * Math.PI * 1.5;
    const x1 = 128 + Math.cos(ang) * 90;
    const y1 = 128 + Math.sin(ang) * 90;
    const x2 = 128 + Math.cos(ang) * 112;
    const y2 = 128 + Math.sin(ang) * 112;
    dCtx.beginPath();
    dCtx.moveTo(x1, y1);
    dCtx.lineTo(x2, y2);
    dCtx.stroke();
    dCtx.fillStyle = '#241c13';
    dCtx.font = 'bold 20px Georgia, serif';
    dCtx.textAlign = 'center';
    dCtx.textBaseline = 'middle';
    dCtx.fillText(String(mph), 128 + Math.cos(ang) * 68, 128 + Math.sin(ang) * 68);
  }
  dCtx.fillStyle = '#735634';
  dCtx.font = 'bold 14px Georgia, serif';
  dCtx.fillText('MPH', 128, 174);
  const dialTex = track(new THREE.CanvasTexture(dialCanvas));
  dialTex.colorSpace = THREE.SRGBColorSpace;

  const speedoBezel = new THREE.Mesh(
    track(new THREE.CylinderGeometry(0.064, 0.068, 0.032, 20)),
    instrumentHighlightMats.gauges
  );
  speedoBezel.rotation.x = Math.PI / 2;
  speedoBezel.position.set(-0.08, 0.87, 0.144);
  const speedoFace = new THREE.Mesh(
    track(new THREE.CircleGeometry(0.056, 20)),
    track(new THREE.MeshBasicMaterial({ map: dialTex }))
  );
  speedoFace.rotation.y = Math.PI;
  speedoFace.position.set(-0.08, 0.87, 0.126);
  const speedometerNeedle = new THREE.Group();
  speedometerNeedle.position.set(-0.08, 0.87, 0.123);
  const needleBlade = new THREE.Mesh(
    track(new THREE.BoxGeometry(0.006, 0.044, 0.004)),
    track(new THREE.MeshBasicMaterial({ color: 0xb22a22 }))
  );
  needleBlade.position.set(0, 0.018, 0);
  speedometerNeedle.add(needleBlade);
  chassisGroup.add(speedoBezel, speedoFace, speedometerNeedle);

  // Brass Magneto Ammeter Gauge beside Speedometer
  const ammBezel = new THREE.Mesh(
    track(new THREE.CylinderGeometry(0.038, 0.04, 0.028, 16)),
    instrumentHighlightMats.gauges
  );
  ammBezel.rotation.x = Math.PI / 2;
  ammBezel.position.set(-0.24, 0.87, 0.144);
  const ammFace = new THREE.Mesh(
    track(new THREE.CircleGeometry(0.032, 16)),
    track(new THREE.MeshBasicMaterial({ color: 0xf0e7d4 }))
  );
  ammFace.rotation.y = Math.PI;
  ammFace.position.set(-0.24, 0.87, 0.128);
  const ammeterNeedle = new THREE.Group();
  ammeterNeedle.position.set(-0.24, 0.87, 0.125);
  const ammBlade = new THREE.Mesh(
    track(new THREE.BoxGeometry(0.004, 0.025, 0.003)),
    track(new THREE.MeshBasicMaterial({ color: 0x1b1917 }))
  );
  ammBlade.position.set(0, 0.01, 0);
  ammeterNeedle.add(ammBlade);
  chassisGroup.add(ammBezel, ammFace, ammeterNeedle);

  // 3. Open Touring Body Tub (Front & Rear seating compartment)
  const floorPan = new THREE.Mesh(track(new THREE.BoxGeometry(0.96, 0.06, 1.65)), chassisSteel);
  floorPan.position.set(0, 0.47, -0.52);
  floorPan.castShadow = true;
  chassisGroup.add(floorPan);

  const sidePanelGeo = track(new THREE.BoxGeometry(0.06, 0.50, 1.62));
  const leftSide = new THREE.Mesh(sidePanelGeo, blackPaint);
  leftSide.position.set(0.49, 0.74, -0.52);
  leftSide.castShadow = true;
  chassisGroup.add(leftSide);

  const rightSide = new THREE.Mesh(sidePanelGeo, blackPaint);
  rightSide.position.set(-0.49, 0.74, -0.52);
  rightSide.castShadow = true;
  chassisGroup.add(rightSide);

  const rearPanel = new THREE.Mesh(track(new THREE.BoxGeometry(1.04, 0.56, 0.08)), blackPaint);
  rearPanel.position.set(0, 0.77, -1.34);
  rearPanel.castShadow = true;
  chassisGroup.add(rearPanel);

  // Tufted Leather Front & Rear Bench Seats
  const frontSeatCushion = new THREE.Mesh(track(new THREE.BoxGeometry(0.88, 0.16, 0.44)), tuftedLeather);
  frontSeatCushion.position.set(0, 0.62, -0.28);
  chassisGroup.add(frontSeatCushion);

  const frontSeatBack = new THREE.Mesh(track(new THREE.BoxGeometry(0.92, 0.42, 0.14)), tuftedLeather);
  frontSeatBack.position.set(0, 0.85, -0.52);
  frontSeatBack.rotation.x = -0.14;
  chassisGroup.add(frontSeatBack);

  const rearSeatCushion = new THREE.Mesh(track(new THREE.BoxGeometry(0.92, 0.16, 0.46)), tuftedLeather);
  rearSeatCushion.position.set(0, 0.63, -1.04);
  chassisGroup.add(rearSeatCushion);

  const rearSeatBack = new THREE.Mesh(track(new THREE.BoxGeometry(0.96, 0.46, 0.14)), tuftedLeather);
  rearSeatBack.position.set(0, 0.89, -1.27);
  rearSeatBack.rotation.x = -0.15;
  chassisGroup.add(rearSeatBack);

  // 4. Windshield with Brass Frame
  const wsFrameLeft = new THREE.Mesh(track(new THREE.CylinderGeometry(0.015, 0.015, 0.56, 8)), polishedBrass);
  wsFrameLeft.position.set(0.44, 1.32, 0.25);
  const wsFrameRight = new THREE.Mesh(track(new THREE.CylinderGeometry(0.015, 0.015, 0.56, 8)), polishedBrass);
  wsFrameRight.position.set(-0.44, 1.32, 0.25);
  const wsFrameTop = new THREE.Mesh(track(new THREE.CylinderGeometry(0.015, 0.015, 0.90, 8)), polishedBrass);
  wsFrameTop.rotation.z = Math.PI / 2;
  wsFrameTop.position.set(0, 1.60, 0.25);
  const wsFrameMid = new THREE.Mesh(track(new THREE.CylinderGeometry(0.012, 0.012, 0.90, 8)), polishedBrass);
  wsFrameMid.rotation.z = Math.PI / 2;
  wsFrameMid.position.set(0, 1.33, 0.25);

  const wsGlass = new THREE.Mesh(track(new THREE.PlaneGeometry(0.86, 0.52)), glassMat);
  wsGlass.position.set(0, 1.33, 0.25);
  wsGlass.renderOrder = 2;
  chassisGroup.add(wsFrameLeft, wsFrameRight, wsFrameTop, wsFrameMid, wsGlass);

  // Manual Brass Windscreen Wiper mounted above Driver (-X)
  const wiperPivot = new THREE.Group();
  wiperPivot.position.set(-0.20, 1.58, 0.232);
  const wiperArm = new THREE.Mesh(track(new THREE.CylinderGeometry(0.006, 0.006, 0.24, 6)), polishedBrass);
  wiperArm.position.set(0, -0.12, 0);
  const wiperRubber = new THREE.Mesh(track(new THREE.BoxGeometry(0.014, 0.20, 0.012)), darkRubber);
  wiperRubber.position.set(0, -0.14, 0.012);
  wiperPivot.add(wiperArm, wiperRubber);
  chassisGroup.add(wiperPivot);

  // 5. Upright Touring Canvas Top & Steel Bows (leaves clean sightline for cockpit)
  const canopyRoof = new THREE.Mesh(track(new THREE.BoxGeometry(1.02, 0.05, 1.66)), canvasTopMat);
  canopyRoof.position.set(0, 1.72, -0.56);
  canopyRoof.castShadow = true;
  chassisGroup.add(canopyRoof);

  // Rear canvas curtain with small oval mica window
  const rearCurtain = new THREE.Mesh(track(new THREE.BoxGeometry(0.98, 0.68, 0.03)), canvasTopMat);
  rearCurtain.position.set(0, 1.38, -1.36);
  chassisGroup.add(rearCurtain);

  const supportBowGeo = track(new THREE.CylinderGeometry(0.014, 0.014, 0.72, 8));
  const bowCoords: [number, number, number][] = [
    [0.48, 1.35, -0.52],
    [-0.48, 1.35, -0.52],
    [0.48, 1.35, -1.32],
    [-0.48, 1.35, -1.32],
  ];
  bowCoords.forEach(([bx, by, bz]) => {
    const bow = new THREE.Mesh(supportBowGeo, chassisSteel);
    bow.position.set(bx, by, bz);
    chassisGroup.add(bow);
  });

  // 6. Flared Mudguards (Fenders) & Running Boards (mud-tintable)
  const rbGeo = track(new THREE.BoxGeometry(0.24, 0.035, 1.24));
  const leftRB = new THREE.Mesh(rbGeo, fenderPaint);
  leftRB.position.set(0.64, 0.39, -0.10);
  leftRB.castShadow = true;
  const rightRB = new THREE.Mesh(rbGeo, fenderPaint);
  rightRB.position.set(-0.64, 0.39, -0.10);
  rightRB.castShadow = true;
  chassisGroup.add(leftRB, rightRB);

  const buildFender = (xPos: number, zCenter: number, isFront: boolean) => {
    const pts: THREE.Vector2[] = [];
    if (isFront) {
      pts.push(new THREE.Vector2(zCenter - 0.56, 0.40));
      pts.push(new THREE.Vector2(zCenter - 0.34, 0.68));
      pts.push(new THREE.Vector2(zCenter, 0.82));
      pts.push(new THREE.Vector2(zCenter + 0.32, 0.76));
      pts.push(new THREE.Vector2(zCenter + 0.46, 0.62));
    } else {
      pts.push(new THREE.Vector2(zCenter + 0.52, 0.40));
      pts.push(new THREE.Vector2(zCenter + 0.30, 0.74));
      pts.push(new THREE.Vector2(zCenter, 0.84));
      pts.push(new THREE.Vector2(zCenter - 0.34, 0.76));
      pts.push(new THREE.Vector2(zCenter - 0.46, 0.58));
    }
    const curve = new THREE.SplineCurve(pts);
    const sampled = curve.getPoints(16);
    const shape = new THREE.Shape();
    shape.moveTo(sampled[0].x, sampled[0].y);
    for (let i = 1; i < sampled.length; i++) shape.lineTo(sampled[i].x, sampled[i].y);
    for (let i = sampled.length - 1; i >= 0; i--) shape.lineTo(sampled[i].x, sampled[i].y - 0.028);
    shape.closePath();

    const fGeo = track(new THREE.ExtrudeGeometry(shape, { depth: 0.25, bevelEnabled: false }));
    fGeo.rotateY(Math.PI / 2);
    const mesh = new THREE.Mesh(fGeo, fenderPaint);
    mesh.position.set(xPos - 0.125, 0, 0);
    mesh.castShadow = true;
    chassisGroup.add(mesh);
  };

  buildFender(0.68, 1.27, true);
  buildFender(-0.68, 1.27, true);
  buildFender(0.68, -1.27, false);
  buildFender(-0.68, -1.27, false);

  // 7. Brass Headlamps & Kerosene Cowl Lamps
  const headlights: [THREE.SpotLight, THREE.SpotLight] = [
    new THREE.SpotLight(0xfff1c4, 0, 36, Math.PI / 5, 0.55, 1.6),
    new THREE.SpotLight(0xfff1c4, 0, 36, Math.PI / 5, 0.55, 1.6),
  ];
  const bulbMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xffe8a3,
      emissive: 0xffc663,
      emissiveIntensity: 0.4,
      roughness: 0.2,
    })
  );
  const headlightBulbs: THREE.Mesh[] = [];
  const headlightCones: THREE.Mesh[] = [];
  // ConeGeometry apex is +Y. rotateX(-π/2) sends +Y to −Z, so the lamp
  // end is local z = −3.1 and the beam opens toward +Z (the bonnet).
  const coneGeo = track(new THREE.ConeGeometry(0.55, 6.2, 14, 1, true));
  coneGeo.rotateX(-Math.PI / 2);
  const coneMat = track(
    new THREE.MeshBasicMaterial({
      color: 0xffe7b0,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );
  coneMat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBeamLocal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBeamLocal = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBeamLocal;')
      .replace(
        '#include <opaque_fragment>',
        `#include <opaque_fragment>
float beamAlong = clamp((vBeamLocal.z + 3.1) / 6.2, 0.0, 1.0);
float beamRadial = clamp(length(vBeamLocal.xy) / max(0.05, mix(0.06, 0.55, beamAlong)), 0.0, 1.0);
float beamShaft = exp(-beamAlong * 1.15) * pow(1.0 - beamRadial, 1.45);
gl_FragColor.a *= beamShaft;`
      );
  };
  coneMat.customProgramCacheKey = () => 'headlight-beam';

  [-0.36, 0.36].forEach((hx, idx) => {
    const bucket = new THREE.Mesh(track(new THREE.CylinderGeometry(0.11, 0.08, 0.14, 16)), polishedBrass);
    bucket.rotation.x = Math.PI / 2;
    bucket.position.set(hx, 0.88, 1.38);
    bucket.castShadow = true;
    chassisGroup.add(bucket);

    const lens = new THREE.Mesh(track(new THREE.CircleGeometry(0.095, 16)), bulbMat);
    lens.position.set(hx, 0.88, 1.452);
    chassisGroup.add(lens);
    headlightBulbs.push(lens);

    const cone = new THREE.Mesh(coneGeo, coneMat);
    cone.position.set(hx, 0.78, 1.46 + 3.1);
    cone.rotation.x = 0.1;
    cone.visible = false;
    chassisGroup.add(cone);
    headlightCones.push(cone);

    const spot = headlights[idx];
    spot.position.set(hx, 0.88, 1.46);
    spot.target.position.set(hx, 0.5, 12);
    chassisGroup.add(spot, spot.target);
  });

  // Brass kerosene cowl side lamps
  [-0.47, 0.47].forEach((lx) => {
    const lamp = new THREE.Mesh(track(new THREE.CylinderGeometry(0.045, 0.045, 0.12, 10)), polishedBrass);
    lamp.position.set(lx, 1.04, 0.36);
    chassisGroup.add(lamp);
  });

  // 8. Right-Hand Drive (NZ) Steering Column, Pedals & Handbrake Lever
  const column = new THREE.Mesh(track(new THREE.CylinderGeometry(0.022, 0.022, 0.72, 10)), polishedBrass);
  column.position.set(-0.23, 0.86, 0.05);
  column.rotation.x = -0.68;
  chassisGroup.add(column);

  const steeringWheel = new THREE.Group();
  steeringWheel.position.set(-0.23, 1.11, -0.18);
  steeringWheel.rotation.x = -0.68;

  const wheelRim = new THREE.Mesh(track(new THREE.TorusGeometry(0.19, 0.018, 10, 28)), hickoryWood);
  wheelRim.rotation.x = Math.PI / 2;
  steeringWheel.add(wheelRim);

  for (let s = 0; s < 4; s++) {
    const spoke = new THREE.Mesh(track(new THREE.BoxGeometry(0.018, 0.012, 0.36)), polishedBrass);
    spoke.rotation.y = (s * Math.PI) / 4;
    steeringWheel.add(spoke);
  }
  chassisGroup.add(steeringWheel);

  // Brass Steering Column Quadrant + Spark Advance (Left/+X) & Hand Throttle (Right/-X) Levers
  const quadrantGroup = new THREE.Group();
  quadrantGroup.position.set(-0.23, 1.075, -0.152);
  quadrantGroup.rotation.x = -0.68;
  const quadrantArc = new THREE.Mesh(
    track(new THREE.TorusGeometry(0.085, 0.008, 6, 18, Math.PI)),
    instrumentHighlightMats.sparkThrottle
  );
  quadrantArc.rotation.x = Math.PI / 2;
  quadrantGroup.add(quadrantArc);

  const leverRodGeo = track(new THREE.CylinderGeometry(0.0055, 0.0065, 0.135, 8));
  const leverKnobGeo = track(new THREE.SphereGeometry(0.014, 8, 6));

  const sparkLeverPivot = new THREE.Group();
  sparkLeverPivot.position.set(0.014, -0.012, 0);
  const sparkRod = new THREE.Mesh(leverRodGeo, instrumentHighlightMats.sparkThrottle);
  sparkRod.rotation.z = -Math.PI / 2;
  sparkRod.position.set(0.068, 0, 0);
  const sparkKnob = new THREE.Mesh(leverKnobGeo, darkRubber);
  sparkKnob.position.set(0.138, 0, 0);
  sparkLeverPivot.add(sparkRod, sparkKnob);

  const throttleLeverPivot = new THREE.Group();
  throttleLeverPivot.position.set(-0.014, -0.012, 0);
  const throttleRod = new THREE.Mesh(leverRodGeo, instrumentHighlightMats.sparkThrottle);
  throttleRod.rotation.z = Math.PI / 2;
  throttleRod.position.set(-0.068, 0, 0);
  const throttleKnob = new THREE.Mesh(leverKnobGeo, darkRubber);
  throttleKnob.position.set(-0.138, 0, 0);
  throttleLeverPivot.add(throttleRod, throttleKnob);

  quadrantGroup.add(sparkLeverPivot, throttleLeverPivot);
  chassisGroup.add(quadrantGroup);

  // 3 Floor Pedals (C = Low, R = Reverse, B = Brake)
  const pedalGeo = track(new THREE.BoxGeometry(0.06, 0.14, 0.025));
  const pedalLow = new THREE.Mesh(pedalGeo, instrumentHighlightMats.pedals);
  pedalLow.position.set(-0.14, 0.56, 0.06);
  pedalLow.rotation.x = -0.35;
  const pedalReverse = new THREE.Mesh(pedalGeo, instrumentHighlightMats.pedals);
  pedalReverse.position.set(-0.23, 0.56, 0.06);
  pedalReverse.rotation.x = -0.35;
  const pedalBrake = new THREE.Mesh(pedalGeo, instrumentHighlightMats.pedals);
  pedalBrake.position.set(-0.32, 0.56, 0.06);
  pedalBrake.rotation.x = -0.35;
  chassisGroup.add(pedalLow, pedalReverse, pedalBrake);

  // Outer Handbrake & Clutch Lever
  const handbrakeLever = new THREE.Group();
  handbrakeLever.position.set(-0.43, 0.50, -0.05);
  const hbShaft = new THREE.Mesh(
    track(new THREE.CylinderGeometry(0.014, 0.016, 0.46, 8)),
    chassisSteel
  );
  hbShaft.position.set(0, 0.22, 0);
  const hbGrip = new THREE.Mesh(
    track(new THREE.CylinderGeometry(0.022, 0.022, 0.08, 10)),
    instrumentHighlightMats.handbrake
  );
  hbGrip.position.set(0, 0.45, 0);
  handbrakeLever.add(hbShaft, hbGrip);
  chassisGroup.add(handbrakeLever);

  // 9. Four 30x3.5" Wooden Artillery Spoked Wheels
  const tireGeo = track(new THREE.TorusGeometry(0.325, 0.055, 14, 32));
  tireGeo.rotateY(Math.PI / 2);
  const rimGeo = track(new THREE.TorusGeometry(0.275, 0.022, 10, 28));
  rimGeo.rotateY(Math.PI / 2);
  const spokeGeo = track(new THREE.CylinderGeometry(0.011, 0.015, 0.52, 8));
  const hubGeo = track(new THREE.CylinderGeometry(0.052, 0.058, 0.14, 14));
  hubGeo.rotateZ(Math.PI / 2);
  const capGeo = track(new THREE.CylinderGeometry(0.036, 0.042, 0.05, 12));
  capGeo.rotateZ(Math.PI / 2);

  const wheelPositions: [number, number, number][] = [
    [0.71, 0.38, 1.27], // FL
    [-0.71, 0.38, 1.27], // FR
    [0.71, 0.38, -1.27], // RL
    [-0.71, 0.38, -1.27], // RR
  ];

  const wheelHubs: THREE.Group[] = [];
  const wheelSpinGroups: THREE.Group[] = [];
  const frontKnuckles: THREE.Group[] = [];

  wheelPositions.forEach(([wx, wy, wz], idx) => {
    const hubGroup = new THREE.Group();
    hubGroup.position.set(wx, wy, wz);
    root.add(hubGroup);
    wheelHubs.push(hubGroup);

    const steerGroup = new THREE.Group();
    hubGroup.add(steerGroup);
    if (idx < 2) {
      frontKnuckles.push(steerGroup);
    }

    const spinGroup = new THREE.Group();
    steerGroup.add(spinGroup);
    wheelSpinGroups.push(spinGroup);

    const tire = new THREE.Mesh(tireGeo, darkRubber);
    tire.castShadow = true;
    spinGroup.add(tire);

    const rim = new THREE.Mesh(rimGeo, blackPaint);
    spinGroup.add(rim);

    // 12 Hickory spokes
    for (let s = 0; s < 6; s++) {
      const sp = new THREE.Mesh(spokeGeo, hickoryWood);
      sp.rotation.x = (s * Math.PI) / 6;
      spinGroup.add(sp);
    }

    const hub = new THREE.Mesh(hubGeo, blackPaint);
    spinGroup.add(hub);

    const cap = new THREE.Mesh(capGeo, polishedBrass);
    cap.position.x = wx > 0 ? 0.07 : -0.07;
    spinGroup.add(cap);
  });

  // 10. 1914 Kiwi Farmer Driver (Right-Hand Drive, Steering-Linked Hands)
  const driverPool = track(createCharacterPool());
  const driverRig = driverPool.buildKiwiFarmerDriver(chassisGroup, steeringWheel);

  const setHighlightedInstrument = (key: ModelTInstrumentKey | null, elapsed: number) => {
    const pulse = 0.55 + Math.sin(elapsed * 5.2) * 0.38;
    const keys: ModelTInstrumentKey[] = ['ignition', 'sparkThrottle', 'crank', 'pedals', 'handbrake', 'gauges'];
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const mat = instrumentHighlightMats[k];
      if (k === key) {
        mat.emissive.setHex(0xe8b444);
        mat.emissiveIntensity = pulse;
      } else {
        mat.emissive.setHex(0x000000);
        mat.emissiveIntensity = 0;
      }
    }
  };

  return {
    root,
    chassisGroup,
    wheelHubs: wheelHubs as [THREE.Group, THREE.Group, THREE.Group, THREE.Group],
    wheelSpinGroups: wheelSpinGroups as [THREE.Group, THREE.Group, THREE.Group, THREE.Group],
    frontKnuckles: frontKnuckles as [THREE.Group, THREE.Group],
    steeringWheel,
    sparkLeverPivot,
    throttleLeverPivot,
    handCrank,
    handbrakeLever,
    speedometerNeedle,
    ammeterNeedle,
    wiperPivot,
    fenderPaint,
    fenderMud,
    driverRig,
    pedals: {
      low: pedalLow,
      reverse: pedalReverse,
      brake: pedalBrake,
    },
    headlights,
    headlightBulbs: headlightBulbs as [THREE.Mesh, THREE.Mesh],
    headlightCones: headlightCones as [THREE.Mesh, THREE.Mesh],
    coolingFan,
    setHighlightedInstrument,
    dispose: () => {
      disposables.forEach((d) => d.dispose());
    },
  };
}
