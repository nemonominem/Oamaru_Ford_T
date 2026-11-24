import * as THREE from 'three';
import cabbageTreeUrl from '../assets/foliage/cabbage-tree.png';
import macrocarpaUrl from '../assets/foliage/macrocarpa.png';

export type SignStyle = 'goldleaf' | 'ghost' | 'painted' | 'roofsign';

export interface TextureBundle {
  limestone: THREE.CanvasTexture;
  limestoneBump: THREE.CanvasTexture;
  limestoneRusticated: THREE.CanvasTexture;
  limestoneRusticatedBump: THREE.CanvasTexture;
  polychromeStone: THREE.CanvasTexture;
  archedWindow: THREE.CanvasTexture;
  openSashWindow: THREE.CanvasTexture;
  shopfrontWindow: THREE.CanvasTexture;
  castIronLace: THREE.CanvasTexture;
  balustradeStone: THREE.CanvasTexture;
  stripedAwning: THREE.CanvasTexture;
  footpathStone: THREE.CanvasTexture;
  timberDoors: THREE.CanvasTexture;
  posterCollage: THREE.CanvasTexture;
  cobbles: THREE.CanvasTexture;
  cobblesBump: THREE.CanvasTexture;
  cobblesNormal: THREE.CanvasTexture;
  macadam: THREE.CanvasTexture;
  mud: THREE.CanvasTexture;
  wharfTimber: THREE.CanvasTexture;
  corrugatedIron: THREE.CanvasTexture;
  grass: THREE.CanvasTexture;
  wornEarth: THREE.CanvasTexture;
  cabbageTree: THREE.Texture;
  macrocarpa: THREE.Texture;
  radiatorHoneycomb: THREE.CanvasTexture;
  clockFace: THREE.CanvasTexture;
  createSignTexture: (
    title: string,
    subtitle: string,
    bgColor?: string,
    textColor?: string,
    style?: SignStyle
  ) => THREE.CanvasTexture;
  createVintageAdTexture: (
    headline: string,
    subline: string,
    bgColor: string,
    fgColor: string,
    accentColor: string,
    kind: 'mural' | 'blade' | 'aboard'
  ) => THREE.CanvasTexture;
  dispose: () => void;
}

function seededNoise(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function heightToNormalCanvas(heightCanvas: HTMLCanvasElement, strength: number): HTMLCanvasElement {
  const w = heightCanvas.width;
  const h = heightCanvas.height;
  const src = heightCanvas.getContext('2d')!.getImageData(0, 0, w, h).data;
  const sample = (x: number, y: number) => {
    const xx = (x + w) % w;
    const yy = (y + h) % h;
    return src[(yy * w + xx) * 4] / 255;
  };
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const ctx = out.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = sample(x + 1, y) - sample(x - 1, y);
      const dy = sample(x, y + 1) - sample(x, y - 1);
      let nx = -dx * strength;
      let ny = -dy * strength;
      let nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len;
      ny /= len;
      nz /= len;
      const i = (y * w + x) * 4;
      img.data[i] = (nx * 0.5 + 0.5) * 255;
      img.data[i + 1] = (ny * 0.5 + 0.5) * 255;
      img.data[i + 2] = (nz * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

function configureTexture(
  canvas: HTMLCanvasElement,
  repeatX: number,
  repeatY: number,
  maxAnisotropy: number,
  isColor = true
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = Math.min(8, maxAnisotropy);
  if (isColor) {
    tex.colorSpace = THREE.SRGBColorSpace;
  }
  tex.needsUpdate = true;
  return tex;
}

export function createProceduralTextures(maxAnisotropy: number): TextureBundle {
  const createdTextures: THREE.Texture[] = [];

  // 1. Oamaru Whitestone Ashlar Limestone + Relief Bump Map
  const limeCanvas = document.createElement('canvas');
  limeCanvas.width = 512;
  limeCanvas.height = 512;
  const lCtx = limeCanvas.getContext('2d')!;
  const limeBumpCanvas = document.createElement('canvas');
  limeBumpCanvas.width = 512;
  limeBumpCanvas.height = 512;
  const lbCtx = limeBumpCanvas.getContext('2d')!;
  const randLime = seededNoise(1914);

  lCtx.fillStyle = '#ddd1b9';
  lCtx.fillRect(0, 0, 512, 512);
  lbCtx.fillStyle = '#505050';
  lbCtx.fillRect(0, 0, 512, 512);

  const rows = 8;
  const rowH = 512 / rows;
  for (let r = 0; r < rows; r++) {
    const cols = 4;
    const colW = 512 / cols;
    const offset = (r % 2) * (colW * 0.5);
    for (let c = -1; c <= cols; c++) {
      const bx = c * colW + offset;
      const by = r * rowH;
      const shade = Math.floor((randLime() - 0.5) * 16);
      const red = 222 + shade;
      const green = 210 + shade;
      const blue = 185 + shade;
      lCtx.fillStyle = `rgb(${red},${green},${blue})`;
      lCtx.fillRect(bx + 2, by + 2, colW - 4, rowH - 4);

      const bumpBase = 185 + Math.floor((randLime() - 0.5) * 28);
      lbCtx.fillStyle = `rgb(${bumpBase},${bumpBase},${bumpBase})`;
      lbCtx.fillRect(bx + 3, by + 3, colW - 6, rowH - 6);

      // Soft fossil limestone grain & vertical saw tooling
      for (let g = 0; g < 42; g++) {
        const gx = bx + 4 + randLime() * (colW - 8);
        const gy = by + 4 + randLime() * (rowH - 8);
        lCtx.fillStyle = randLime() > 0.5 ? 'rgba(170,154,126,0.20)' : 'rgba(249,245,233,0.22)';
        lCtx.fillRect(gx, gy, 2 + randLime() * 3, 2);
        const bv = randLime() > 0.5 ? 140 : 225;
        lbCtx.fillStyle = `rgba(${bv},${bv},${bv},0.35)`;
        lbCtx.fillRect(gx, gy, 2 + randLime() * 2, 2);
      }
      // Subtle weathering stain under horizontal joints
      const stain = lCtx.createLinearGradient(0, by, 0, by + 16);
      stain.addColorStop(0, 'rgba(116,102,80,0.22)');
      stain.addColorStop(1, 'rgba(116,102,80,0)');
      lCtx.fillStyle = stain;
      lCtx.fillRect(bx + 2, by + 2, colW - 4, 16);
    }
    lCtx.fillStyle = 'rgba(122,110,90,0.55)';
    lCtx.fillRect(0, r * rowH, 512, 2.5);
    lbCtx.fillStyle = '#383838';
    lbCtx.fillRect(0, r * rowH, 512, 3);
  }
  const limestone = configureTexture(limeCanvas, 2, 2, maxAnisotropy, true);
  const limestoneBump = configureTexture(limeBumpCanvas, 2, 2, maxAnisotropy, false);
  createdTextures.push(limestone, limestoneBump);

  // 2. Rusticated Limestone Base + Chamfered Relief Bump Map
  const rustCanvas = document.createElement('canvas');
  rustCanvas.width = 512;
  rustCanvas.height = 512;
  const rCtx = rustCanvas.getContext('2d')!;
  const rustBumpCanvas = document.createElement('canvas');
  rustBumpCanvas.width = 512;
  rustBumpCanvas.height = 512;
  const rbCtx = rustBumpCanvas.getContext('2d')!;

  rCtx.fillStyle = '#cfc2a7';
  rCtx.fillRect(0, 0, 512, 512);
  rbCtx.fillStyle = '#282828';
  rbCtx.fillRect(0, 0, 512, 512);

  const randRust = seededNoise(1882);
  for (let r = 0; r < 6; r++) {
    const h = 512 / 6;
    const w = 512 / 3;
    const off = (r % 2) * (w * 0.5);
    for (let c = -1; c <= 3; c++) {
      const x = c * w + off;
      const y = r * h;
      const v = Math.floor((randRust() - 0.5) * 18);
      rCtx.fillStyle = `rgb(${210 + v},${197 + v},${171 + v})`;
      rCtx.fillRect(x + 5, y + 5, w - 10, h - 10);
      rCtx.strokeStyle = 'rgba(86,75,60,0.58)';
      rCtx.lineWidth = 4;
      rCtx.strokeRect(x + 3, y + 3, w - 6, h - 6);

      // Raised pillowed block face for rusticated bump
      rbCtx.fillStyle = '#909090';
      rbCtx.fillRect(x + 4, y + 4, w - 8, h - 8);
      rbCtx.fillStyle = '#e2e2e2';
      rbCtx.fillRect(x + 9, y + 9, w - 18, h - 18);
      for (let g = 0; g < 24; g++) {
        const bv = 175 + Math.floor(randRust() * 65);
        rbCtx.fillStyle = `rgb(${bv},${bv},${bv})`;
        rbCtx.fillRect(x + 10 + randRust() * (w - 20), y + 10 + randRust() * (h - 20), 3, 2);
      }
    }
  }
  const limestoneRusticated = configureTexture(rustCanvas, 2, 1, maxAnisotropy, true);
  const limestoneRusticatedBump = configureTexture(rustBumpCanvas, 2, 1, maxAnisotropy, false);
  createdTextures.push(limestoneRusticated, limestoneRusticatedBump);

  // 3. Polychrome Oamaru Stone + Otago Basalt Bands (Venetian Gothic Harbour Board)
  const polyCanvas = document.createElement('canvas');
  polyCanvas.width = 512;
  polyCanvas.height = 512;
  const pCtx = polyCanvas.getContext('2d')!;
  pCtx.drawImage(limeCanvas, 0, 0);
  // Dark bluestone banding rows
  [1, 4, 6].forEach((bandRow) => {
    const y = bandRow * rowH;
    pCtx.fillStyle = '#4e5052';
    pCtx.fillRect(0, y + 2, 512, rowH - 4);
    for (let c = 0; c < 4; c++) {
      pCtx.strokeStyle = 'rgba(215, 204, 184, 0.45)';
      pCtx.lineWidth = 2;
      pCtx.strokeRect(c * 128 + 2, y + 2, 124, rowH - 4);
    }
  });
  const polychromeStone = configureTexture(polyCanvas, 2, 2, maxAnisotropy, true);
  createdTextures.push(polychromeStone);

  // 4. Victorian Arched Sash Window Glazing Texture (fits inside 3D stone reveals)
  const winCanvas = document.createElement('canvas');
  winCanvas.width = 256;
  winCanvas.height = 384;
  const wiCtx = winCanvas.getContext('2d')!;
  wiCtx.fillStyle = '#dcd0b8';
  wiCtx.fillRect(0, 0, 256, 384);

  // Inner painted timber box frame
  wiCtx.fillStyle = '#f0ead9';
  wiCtx.beginPath();
  wiCtx.arc(128, 96, 108, Math.PI, 0);
  wiCtx.lineTo(236, 368);
  wiCtx.lineTo(20, 368);
  wiCtx.closePath();
  wiCtx.fill();

  // Deep leaded glass with subtle interior depth & curtain suggestion
  const glassGrad = wiCtx.createLinearGradient(0, 24, 0, 354);
  glassGrad.addColorStop(0, '#1e2c38');
  glassGrad.addColorStop(0.45, '#2b3d4a');
  glassGrad.addColorStop(1, '#18222b');
  wiCtx.fillStyle = glassGrad;
  wiCtx.beginPath();
  wiCtx.arc(128, 102, 92, Math.PI, 0);
  wiCtx.lineTo(220, 354);
  wiCtx.lineTo(36, 354);
  wiCtx.closePath();
  wiCtx.fill();

  // Soft interior lace/drapery shadows near sides
  wiCtx.fillStyle = 'rgba(232, 221, 198, 0.14)';
  wiCtx.fillRect(36, 108, 32, 246);
  wiCtx.fillRect(188, 108, 32, 246);
  // Diagonal sky glint on panes
  wiCtx.fillStyle = 'rgba(195, 222, 238, 0.16)';
  wiCtx.beginPath();
  wiCtx.moveTo(46, 180);
  wiCtx.lineTo(130, 62);
  wiCtx.lineTo(165, 62);
  wiCtx.lineTo(66, 206);
  wiCtx.closePath();
  wiCtx.fill();

  // Fanlight spokes in arch + timber sash muntin bars
  wiCtx.strokeStyle = '#ece4d2';
  wiCtx.lineWidth = 7;
  wiCtx.beginPath();
  wiCtx.moveTo(128, 10);
  wiCtx.lineTo(128, 354);
  wiCtx.moveTo(36, 102);
  wiCtx.lineTo(220, 102);
  wiCtx.moveTo(128, 102);
  wiCtx.lineTo(64, 34);
  wiCtx.moveTo(128, 102);
  wiCtx.lineTo(192, 34);
  wiCtx.moveTo(36, 188);
  wiCtx.lineTo(220, 188);
  wiCtx.moveTo(36, 272);
  wiCtx.lineTo(220, 272);
  wiCtx.stroke();
  const archedWindow = configureTexture(winCanvas, 1, 1, maxAnisotropy, true);
  archedWindow.wrapS = THREE.ClampToEdgeWrapping;
  archedWindow.wrapT = THREE.ClampToEdgeWrapping;
  createdTextures.push(archedWindow);

  // 4a-open. Raised-Sash Open Victorian Window (lower sash slid upward revealing warm interior depth)
  const openWinCanvas = document.createElement('canvas');
  openWinCanvas.width = 256;
  openWinCanvas.height = 384;
  const owCtx = openWinCanvas.getContext('2d')!;
  owCtx.fillStyle = '#dcd0b8';
  owCtx.fillRect(0, 0, 256, 384);

  // Painted box frame
  owCtx.fillStyle = '#ede5d2';
  owCtx.beginPath();
  owCtx.arc(128, 96, 108, Math.PI, 0);
  owCtx.lineTo(236, 368);
  owCtx.lineTo(20, 368);
  owCtx.closePath();
  owCtx.fill();

  // Warm shadowed open interior chamber
  const roomGrad = owCtx.createLinearGradient(0, 28, 0, 354);
  roomGrad.addColorStop(0, '#14110d');
  roomGrad.addColorStop(0.55, '#2b2015');
  roomGrad.addColorStop(1, '#3d2a18');
  owCtx.fillStyle = roomGrad;
  owCtx.beginPath();
  owCtx.arc(128, 102, 92, Math.PI, 0);
  owCtx.lineTo(220, 354);
  owCtx.lineTo(36, 354);
  owCtx.closePath();
  owCtx.fill();

  // Parted lace curtains swaying inside open lower casement
  owCtx.fillStyle = 'rgba(242, 228, 198, 0.34)';
  owCtx.beginPath();
  owCtx.moveTo(36, 120);
  owCtx.quadraticCurveTo(84, 240, 48, 354);
  owCtx.lineTo(36, 354);
  owCtx.closePath();
  owCtx.fill();
  owCtx.beginPath();
  owCtx.moveTo(220, 120);
  owCtx.quadraticCurveTo(172, 240, 208, 354);
  owCtx.lineTo(220, 354);
  owCtx.closePath();
  owCtx.fill();

  // Warm parlour lamp glow hint in interior
  const lampGlow = owCtx.createRadialGradient(128, 285, 6, 128, 285, 68);
  lampGlow.addColorStop(0, 'rgba(255, 210, 125, 0.45)');
  lampGlow.addColorStop(1, 'rgba(255, 190, 90, 0)');
  owCtx.fillStyle = lampGlow;
  owCtx.fillRect(42, 215, 172, 138);

  // Upper fanlight + raised lower sash tucked mid-height (leaving bottom half clearly open!)
  owCtx.fillStyle = 'rgba(34, 52, 66, 0.72)';
  owCtx.fillRect(36, 118, 184, 104);
  owCtx.strokeStyle = '#efe7d6';
  owCtx.lineWidth = 7;
  owCtx.strokeRect(36, 118, 184, 104);
  owCtx.beginPath();
  owCtx.moveTo(128, 10);
  owCtx.lineTo(128, 222);
  owCtx.moveTo(36, 102);
  owCtx.lineTo(220, 102);
  owCtx.moveTo(128, 102);
  owCtx.lineTo(64, 34);
  owCtx.moveTo(128, 102);
  owCtx.lineTo(192, 34);
  owCtx.moveTo(36, 172);
  owCtx.lineTo(220, 172);
  owCtx.stroke();

  // Dark open sill lip at bottom
  owCtx.fillStyle = '#c5b89e';
  owCtx.fillRect(28, 348, 200, 14);

  const openSashWindow = configureTexture(openWinCanvas, 1, 1, maxAnisotropy, true);
  openSashWindow.wrapS = THREE.ClampToEdgeWrapping;
  openSashWindow.wrapT = THREE.ClampToEdgeWrapping;
  createdTextures.push(openSashWindow);

  // 4b. Victorian Ground-Floor Shopfront Display Window (timber stallboard + leaded transom)
  const shopCanvas = document.createElement('canvas');
  shopCanvas.width = 256;
  shopCanvas.height = 384;
  const shCtx = shopCanvas.getContext('2d')!;
  shCtx.fillStyle = '#2d231b';
  shCtx.fillRect(0, 0, 256, 384);
  // Timber stallboard base
  shCtx.fillStyle = '#3b2b1e';
  shCtx.fillRect(10, 286, 236, 88);
  shCtx.strokeStyle = '#6e563f';
  shCtx.lineWidth = 5;
  shCtx.strokeRect(22, 298, 96, 62);
  shCtx.strokeRect(138, 298, 96, 62);
  // Main display glass
  const shopGrad = shCtx.createLinearGradient(0, 18, 0, 280);
  shopGrad.addColorStop(0, '#263642');
  shopGrad.addColorStop(0.55, '#3b4a4e');
  shopGrad.addColorStop(1, '#222b30');
  shCtx.fillStyle = shopGrad;
  shCtx.fillRect(16, 18, 224, 260);
  // Warm interior display shelf hint
  shCtx.fillStyle = 'rgba(220, 178, 108, 0.16)';
  shCtx.fillRect(28, 178, 200, 92);
  // Brass/gilt window mullions + leaded transom lights
  shCtx.strokeStyle = '#c8aa6c';
  shCtx.lineWidth = 5;
  shCtx.strokeRect(16, 18, 224, 260);
  shCtx.beginPath();
  shCtx.moveTo(16, 82);
  shCtx.lineTo(240, 82);
  shCtx.moveTo(128, 18);
  shCtx.lineTo(128, 278);
  shCtx.moveTo(72, 18);
  shCtx.lineTo(72, 82);
  shCtx.moveTo(184, 18);
  shCtx.lineTo(184, 82);
  shCtx.stroke();
  const shopfrontWindow = configureTexture(shopCanvas, 1, 1, maxAnisotropy, true);
  shopfrontWindow.wrapS = THREE.ClampToEdgeWrapping;
  shopfrontWindow.wrapT = THREE.ClampToEdgeWrapping;
  createdTextures.push(shopfrontWindow);

  // 5. Cast-Iron Lacework Verandah Balustrade Alpha Texture
  const laceCanvas = document.createElement('canvas');
  laceCanvas.width = 512;
  laceCanvas.height = 256;
  const laCtx = laceCanvas.getContext('2d')!;
  laCtx.clearRect(0, 0, 512, 256);
  laCtx.strokeStyle = '#1b1f22';
  laCtx.fillStyle = '#1b1f22';
  laCtx.lineWidth = 10;
  laCtx.fillRect(0, 0, 512, 18);
  laCtx.fillRect(0, 238, 512, 18);
  for (let x = 0; x < 512; x += 64) {
    laCtx.strokeRect(x + 4, 18, 56, 220);
    laCtx.beginPath();
    laCtx.arc(x + 32, 128, 22, 0, Math.PI * 2);
    laCtx.stroke();
    laCtx.beginPath();
    laCtx.moveTo(x + 32, 18);
    laCtx.lineTo(x + 32, 238);
    laCtx.stroke();
  }
  const castIronLace = configureTexture(laceCanvas, 4, 1, maxAnisotropy, true);
  createdTextures.push(castIronLace);

  // 5b. Carved Oamaru Limestone Pierced Balustrade Parapet Texture (from archival photo 3)
  const balCanvas = document.createElement('canvas');
  balCanvas.width = 512;
  balCanvas.height = 192;
  const bCtx = balCanvas.getContext('2d')!;
  bCtx.clearRect(0, 0, 512, 192);
  // Top & bottom moulded coping rails
  bCtx.fillStyle = '#e5dac3';
  bCtx.fillRect(0, 0, 512, 34);
  bCtx.fillRect(0, 154, 512, 38);
  bCtx.fillStyle = '#c4b69b';
  bCtx.fillRect(0, 30, 512, 7);
  bCtx.fillRect(0, 148, 512, 8);
  // End stone piers + turned vase balusters with open sky gaps
  bCtx.fillStyle = '#e2d7bf';
  bCtx.fillRect(0, 34, 42, 120);
  bCtx.fillRect(470, 34, 42, 120);
  for (let bx = 56; bx < 456; bx += 44) {
    // Turned classical stone baluster profile
    bCtx.fillStyle = '#dfd3ba';
    bCtx.fillRect(bx + 6, 34, 20, 14);
    bCtx.beginPath();
    bCtx.ellipse(bx + 16, 98, 12, 34, 0, 0, Math.PI * 2);
    bCtx.fill();
    bCtx.fillRect(bx + 8, 50, 16, 22);
    bCtx.fillRect(bx + 5, 134, 22, 20);
    bCtx.strokeStyle = 'rgba(130, 115, 92, 0.45)';
    bCtx.lineWidth = 2;
    bCtx.strokeRect(bx + 6, 35, 20, 118);
  }
  const balustradeStone = configureTexture(balCanvas, 3, 1, maxAnisotropy, true);
  createdTextures.push(balustradeStone);

  // 5c. Striped Canvas Shop Awning / Sun-Blind Texture (archival photos 1 & 3)
  const awnCanvas = document.createElement('canvas');
  awnCanvas.width = 256;
  awnCanvas.height = 256;
  const aCtx = awnCanvas.getContext('2d')!;
  aCtx.fillStyle = '#e6dcc5';
  aCtx.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 32) {
    aCtx.fillStyle = (x / 32) % 2 === 0 ? '#5b634b' : '#e6dcc5';
    aCtx.fillRect(x, 0, 16, 256);
    aCtx.fillStyle = 'rgba(116, 100, 78, 0.14)';
    aCtx.fillRect(x + 15, 0, 2, 256);
  }
  // Subtle woven linen grain
  const randAwn = seededNoise(1911);
  for (let i = 0; i < 1600; i++) {
    aCtx.fillStyle = randAwn() > 0.5 ? 'rgba(255,250,240,0.12)' : 'rgba(60,50,38,0.1)';
    aCtx.fillRect(randAwn() * 256, randAwn() * 256, 3, 1.5);
  }
  const stripedAwning = configureTexture(awnCanvas, 2, 1, maxAnisotropy, true);
  createdTextures.push(stripedAwning);

  // 5d. Dressed Limestone Flagstone Sidewalk Paving
  const fpCanvas = document.createElement('canvas');
  fpCanvas.width = 512;
  fpCanvas.height = 512;
  const fpCtx = fpCanvas.getContext('2d')!;
  fpCtx.fillStyle = '#c8bca3';
  fpCtx.fillRect(0, 0, 512, 512);
  const randFp = seededNoise(1885);
  const fpRows = 6;
  const fpCols = 4;
  const fpH = 512 / fpRows;
  const fpW = 512 / fpCols;
  for (let r = 0; r < fpRows; r++) {
    const off = (r % 2) * (fpW * 0.5);
    for (let c = -1; c <= fpCols; c++) {
      const fx = c * fpW + off;
      const fy = r * fpH;
      const tone = Math.floor((randFp() - 0.5) * 16);
      fpCtx.fillStyle = `rgb(${205 + tone},${194 + tone},${170 + tone})`;
      fpCtx.fillRect(fx + 2, fy + 2, fpW - 4, fpH - 4);
      for (let g = 0; g < 26; g++) {
        fpCtx.fillStyle = randFp() > 0.5 ? 'rgba(128,116,96,0.16)' : 'rgba(244,238,224,0.18)';
        fpCtx.fillRect(fx + 4 + randFp() * (fpW - 8), fy + 4 + randFp() * (fpH - 8), 3, 2);
      }
    }
    fpCtx.fillStyle = 'rgba(92,82,68,0.38)';
    fpCtx.fillRect(0, r * fpH, 512, 2);
  }
  const footpathStone = configureTexture(fpCanvas, 12, 3, maxAnisotropy, true);
  createdTextures.push(footpathStone);

  // 6. Heavy Timber Warehouse Loading Bay Doors
  const doorCanvas = document.createElement('canvas');
  doorCanvas.width = 256;
  doorCanvas.height = 256;
  const dCtx = doorCanvas.getContext('2d')!;
  dCtx.fillStyle = '#4f3a27';
  dCtx.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 16) {
    dCtx.fillStyle = x % 32 === 0 ? '#57412d' : '#493524';
    dCtx.fillRect(x, 0, 14, 256);
  }
  // Center seam & cross braces + iron strap hinges
  dCtx.fillStyle = '#241b13';
  dCtx.fillRect(126, 0, 4, 256);
  dCtx.fillStyle = '#202224';
  dCtx.fillRect(0, 48, 86, 12);
  dCtx.fillRect(0, 194, 86, 12);
  dCtx.fillRect(170, 48, 86, 12);
  dCtx.fillRect(170, 194, 86, 12);
  const timberDoors = configureTexture(doorCanvas, 1, 1, maxAnisotropy, true);
  timberDoors.wrapS = THREE.ClampToEdgeWrapping;
  timberDoors.wrapT = THREE.ClampToEdgeWrapping;
  createdTextures.push(timberDoors);

  // 7. Bluestone Cobblestones (color + bump)
  const cobbleCanvas = document.createElement('canvas');
  cobbleCanvas.width = 512;
  cobbleCanvas.height = 512;
  const cCtx = cobbleCanvas.getContext('2d')!;
  const cobbleBumpCanvas = document.createElement('canvas');
  cobbleBumpCanvas.width = 512;
  cobbleBumpCanvas.height = 512;
  const cbCtx = cobbleBumpCanvas.getContext('2d')!;

  cCtx.fillStyle = '#221e1b';
  cCtx.fillRect(0, 0, 512, 512);
  cbCtx.fillStyle = '#141210';
  cbCtx.fillRect(0, 0, 512, 512);

  const randCob = seededNoise(409);
  const cobRows = 16;
  const cobH = 512 / cobRows;
  for (let r = 0; r < cobRows; r++) {
    const cobCols = 10;
    const cobW = 512 / cobCols;
    const off = (r % 2) * (cobW * 0.5);
    for (let c = -1; c <= cobCols; c++) {
      const x = c * cobW + off;
      const y = r * cobH;
      const tone = 74 + Math.floor(randCob() * 28);
      const warm = Math.floor(randCob() * 10);
      cCtx.fillStyle = `rgb(${tone + warm},${tone + Math.floor(warm * 0.7)},${tone + 4})`;
      cCtx.beginPath();
      cCtx.roundRect(x + 2.5, y + 2.5, cobW - 5, cobH - 5, 5);
      cCtx.fill();

      const bVal = 175 + Math.floor(randCob() * 70);
      cbCtx.fillStyle = `rgb(${bVal},${bVal},${bVal})`;
      cbCtx.beginPath();
      cbCtx.roundRect(x + 3, y + 3, cobW - 6, cobH - 6, 6);
      cbCtx.fill();
    }
  }
  const cobbles = configureTexture(cobbleCanvas, 18, 18, maxAnisotropy, true);
  const cobblesBump = configureTexture(cobbleBumpCanvas, 18, 18, maxAnisotropy, false);
  const cobblesNormal = configureTexture(heightToNormalCanvas(cobbleBumpCanvas, 4.4), 18, 18, maxAnisotropy, false);
  cobblesNormal.colorSpace = THREE.NoColorSpace;
  createdTextures.push(cobbles, cobblesBump, cobblesNormal);

  // 8. Compacted Oamaru Limestone Macadam Road
  const macCanvas = document.createElement('canvas');
  macCanvas.width = 512;
  macCanvas.height = 512;
  const mCtx = macCanvas.getContext('2d')!;
  mCtx.fillStyle = '#9b8d75';
  mCtx.fillRect(0, 0, 512, 512);
  const randMac = seededNoise(777);
  for (let i = 0; i < 9000; i++) {
    const x = randMac() * 512;
    const y = randMac() * 512;
    const sz = 1 + randMac() * 3;
    const shade = 125 + Math.floor(randMac() * 55);
    mCtx.fillStyle = `rgba(${shade + 14},${shade + 4},${shade - 10},0.55)`;
    mCtx.fillRect(x, y, sz, sz);
  }
  mCtx.fillStyle = 'rgba(72, 62, 48, 0.12)';
  mCtx.fillRect(110, 0, 48, 512);
  mCtx.fillRect(354, 0, 48, 512);
  const macadam = configureTexture(macCanvas, 20, 20, maxAnisotropy, true);
  createdTextures.push(macadam);

  // 9. Muddy Rutted Track
  const mudCanvas = document.createElement('canvas');
  mudCanvas.width = 512;
  mudCanvas.height = 512;
  const muCtx = mudCanvas.getContext('2d')!;
  muCtx.fillStyle = '#534332';
  muCtx.fillRect(0, 0, 512, 512);
  const randMud = seededNoise(314);
  for (let i = 0; i < 6500; i++) {
    const x = randMud() * 512;
    const y = randMud() * 512;
    const sz = 2 + randMud() * 5;
    const dark = 55 + Math.floor(randMud() * 45);
    muCtx.fillStyle = `rgba(${dark + 22},${dark + 10},${dark - 4},0.45)`;
    muCtx.fillRect(x, y, sz, sz * 1.4);
  }
  muCtx.fillStyle = 'rgba(34, 27, 19, 0.45)';
  muCtx.fillRect(95, 0, 56, 512);
  muCtx.fillRect(360, 0, 56, 512);
  const mud = configureTexture(mudCanvas, 12, 12, maxAnisotropy, true);
  createdTextures.push(mud);

  // 10. Wharf Timber Planks
  const wharfCanvas = document.createElement('canvas');
  wharfCanvas.width = 512;
  wharfCanvas.height = 512;
  const wCtx = wharfCanvas.getContext('2d')!;
  wCtx.fillStyle = '#5d4d3c';
  wCtx.fillRect(0, 0, 512, 512);
  const randWharf = seededNoise(888);
  const planks = 12;
  const plankH = 512 / planks;
  for (let p = 0; p < planks; p++) {
    const y = p * plankH;
    const base = 85 + Math.floor(randWharf() * 26);
    wCtx.fillStyle = `rgb(${base + 14},${base},${base - 14})`;
    wCtx.fillRect(0, y + 2, 512, plankH - 3);
    for (let s = 0; s < 16; s++) {
      wCtx.fillStyle = 'rgba(38,28,18,0.18)';
      wCtx.fillRect(0, y + 4 + randWharf() * (plankH - 8), 512, 1.5);
    }
    wCtx.fillStyle = '#2a2118';
    wCtx.fillRect(0, y, 512, 2.5);
  }
  const wharfTimber = configureTexture(wharfCanvas, 8, 12, maxAnisotropy, true);
  createdTextures.push(wharfTimber);

  // 11. Corrugated Iron Roof
  const ironCanvas = document.createElement('canvas');
  ironCanvas.width = 256;
  ironCanvas.height = 256;
  const iCtx = ironCanvas.getContext('2d')!;
  for (let x = 0; x < 256; x += 8) {
    const grad = iCtx.createLinearGradient(x, 0, x + 8, 0);
    grad.addColorStop(0, '#5a5f63');
    grad.addColorStop(0.5, '#8c9296');
    grad.addColorStop(1, '#494e52');
    iCtx.fillStyle = grad;
    iCtx.fillRect(x, 0, 8, 256);
  }
  const randIron = seededNoise(505);
  for (let i = 0; i < 40; i++) {
    iCtx.fillStyle = 'rgba(116, 68, 42, 0.22)';
    iCtx.fillRect(randIron() * 256, randIron() * 256, 6 + randIron() * 14, 18 + randIron() * 45);
  }
  const corrugatedIron = configureTexture(ironCanvas, 4, 3, maxAnisotropy, true);
  createdTextures.push(corrugatedIron);

  // 12. Otago Coastal Tussock & Grass
  const grassCanvas = document.createElement('canvas');
  grassCanvas.width = 512;
  grassCanvas.height = 512;
  const gCtx = grassCanvas.getContext('2d')!;
  gCtx.fillStyle = '#5c6642';
  gCtx.fillRect(0, 0, 512, 512);
  const randGrass = seededNoise(999);
  for (let i = 0; i < 8000; i++) {
    const x = randGrass() * 512;
    const y = randGrass() * 512;
    const g = 80 + Math.floor(randGrass() * 44);
    gCtx.fillStyle = `rgba(${g - 10},${g + 12},${g - 32},0.55)`;
    gCtx.fillRect(x, y, 2, 4);
  }
  const grass = configureTexture(grassCanvas, 28, 28, maxAnisotropy, true);
  createdTextures.push(grass);

  // Dry limestone verge: packed gravel, no grass blades, so road edges
  // do not wear the same tussock print as the paddocks.
  const wornCanvas = document.createElement('canvas');
  wornCanvas.width = 512;
  wornCanvas.height = 512;
  const wornCtx = wornCanvas.getContext('2d')!;
  wornCtx.fillStyle = '#b3a48c';
  wornCtx.fillRect(0, 0, 512, 512);
  const randWorn = seededNoise(1204);
  for (let i = 0; i < 7000; i++) {
    const x = randWorn() * 512;
    const y = randWorn() * 512;
    const sz = 1 + randWorn() * 4;
    const shade = 138 + Math.floor(randWorn() * 70);
    wornCtx.fillStyle = `rgba(${shade + 8},${shade - 4},${shade - 22},0.7)`;
    wornCtx.fillRect(x, y, sz, sz);
  }
  wornCtx.strokeStyle = 'rgba(92, 78, 60, 0.35)';
  wornCtx.lineWidth = 2;
  for (let i = 0; i < 18; i++) {
    wornCtx.beginPath();
    wornCtx.moveTo(randWorn() * 512, 0);
    wornCtx.lineTo(randWorn() * 512, 512);
    wornCtx.stroke();
  }
  const wornEarth = configureTexture(wornCanvas, 1, 1, maxAnisotropy, true);
  createdTextures.push(wornEarth);

  const loadFoliageCard = (url: string): THREE.Texture => {
    const tex = new THREE.TextureLoader().load(url);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = maxAnisotropy;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    createdTextures.push(tex);
    return tex;
  };
  const cabbageTree = loadFoliageCard(cabbageTreeUrl);
  const macrocarpa = loadFoliageCard(macrocarpaUrl);

  // 13. Model T Brass Honeycomb Radiator Grille Texture
  const radCanvas = document.createElement('canvas');
  radCanvas.width = 256;
  radCanvas.height = 256;
  const radCtx = radCanvas.getContext('2d')!;
  radCtx.fillStyle = '#181410';
  radCtx.fillRect(0, 0, 256, 256);
  // Fine horizontal cooling fins & vertical water tubes
  for (let y = 4; y < 256; y += 8) {
    radCtx.fillStyle = y % 16 === 4 ? '#3d3121' : '#262017';
    radCtx.fillRect(0, y, 256, 3);
  }
  for (let x = 8; x < 256; x += 14) {
    radCtx.fillStyle = '#4f3f26';
    radCtx.fillRect(x, 0, 3, 256);
  }
  // Subtle bronze-brass honeycomb sheen
  radCtx.strokeStyle = 'rgba(186, 140, 62, 0.25)';
  radCtx.lineWidth = 1;
  radCtx.strokeRect(2, 2, 252, 252);
  const radiatorHoneycomb = configureTexture(radCanvas, 1, 1, maxAnisotropy, true);
  radiatorHoneycomb.wrapS = THREE.ClampToEdgeWrapping;
  radiatorHoneycomb.wrapT = THREE.ClampToEdgeWrapping;
  createdTextures.push(radiatorHoneycomb);

  // 14. Oamaru Chief Post Office Illuminated Clock Dial
  const clkCanvas = document.createElement('canvas');
  clkCanvas.width = 256;
  clkCanvas.height = 256;
  const clkCtx = clkCanvas.getContext('2d')!;
  clkCtx.fillStyle = '#f3ebd8';
  clkCtx.beginPath();
  clkCtx.arc(128, 128, 122, 0, Math.PI * 2);
  clkCtx.fill();
  clkCtx.strokeStyle = '#2d241b';
  clkCtx.lineWidth = 7;
  clkCtx.beginPath();
  clkCtx.arc(128, 128, 114, 0, Math.PI * 2);
  clkCtx.stroke();
  clkCtx.lineWidth = 2;
  clkCtx.beginPath();
  clkCtx.arc(128, 128, 96, 0, Math.PI * 2);
  clkCtx.stroke();
  const numerals = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
  clkCtx.fillStyle = '#1e1914';
  clkCtx.font = 'bold 20px Georgia, serif';
  clkCtx.textAlign = 'center';
  clkCtx.textBaseline = 'middle';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
    clkCtx.fillText(numerals[i], 128 + Math.cos(a) * 82, 128 + Math.sin(a) * 82);
  }
  const clockFace = configureTexture(clkCanvas, 1, 1, maxAnisotropy, true);
  clockFace.wrapS = THREE.ClampToEdgeWrapping;
  clockFace.wrapT = THREE.ClampToEdgeWrapping;
  createdTextures.push(clockFace);

  // 15. Period Fascia & Weathered Ghost Sign Factory
  const createSignTexture = (
    title: string,
    subtitle: string,
    bgColor = '#222b24',
    textColor = '#e6c57a',
    style: SignStyle = 'goldleaf'
  ): THREE.CanvasTexture => {
    const sCanvas = document.createElement('canvas');
    sCanvas.width = 1024;
    sCanvas.height = 256;
    const ctx = sCanvas.getContext('2d')!;
    const randSign = seededNoise(title.length * 97 + subtitle.length * 31);

    if (style === 'ghost') {
      // Weathered Oamaru stone / painted mercantile ghost sign
      ctx.fillStyle = '#d3c6ab';
      ctx.fillRect(0, 0, 1024, 256);
      // Stone joints beneath weathered paint
      ctx.strokeStyle = 'rgba(110, 96, 74, 0.35)';
      ctx.lineWidth = 3;
      ctx.strokeRect(4, 4, 1016, 124);
      ctx.strokeRect(4, 128, 1016, 124);

      ctx.fillStyle = 'rgba(42, 34, 26, 0.78)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 58px Georgia, serif';
      ctx.fillText(title.toUpperCase(), 512, 98);

      ctx.font = '600 28px Georgia, serif';
      ctx.fillStyle = 'rgba(72, 54, 38, 0.72)';
      ctx.fillText(subtitle.toUpperCase(), 512, 174);

      // Natural stone flecking / weathering streaks
      for (let i = 0; i < 420; i++) {
        ctx.fillStyle = randSign() > 0.45 ? 'rgba(218, 206, 182, 0.34)' : 'rgba(148, 134, 108, 0.22)';
        ctx.fillRect(randSign() * 1024, randSign() * 256, 3 + randSign() * 10, 2 + randSign() * 6);
      }
    } else if (style === 'roofsign') {
      // Cast-iron / timber rooftop verandah fascia sign (M. SKINNER / BROWNLEES style)
      ctx.fillStyle = bgColor || '#1e1c1a';
      ctx.fillRect(0, 0, 1024, 256);
      ctx.strokeStyle = '#e7dfd0';
      ctx.lineWidth = 8;
      ctx.strokeRect(10, 10, 1004, 236);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#f4eee0';
      ctx.font = 'bold 84px Georgia, serif';
      ctx.fillText(title.toUpperCase(), 512, 104);
      ctx.font = '600 32px Georgia, serif';
      ctx.fillStyle = '#d4c3a3';
      ctx.fillText(subtitle.toUpperCase(), 512, 188);
    } else {
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, 1024, 256);

      // Corner ornaments & double bevel border
      ctx.strokeStyle = textColor;
      ctx.lineWidth = 6;
      ctx.strokeRect(14, 14, 996, 228);
      ctx.lineWidth = 2;
      ctx.strokeRect(24, 24, 976, 208);

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Subtle embossed shadow under gold-leaf serif lettering
      ctx.fillStyle = 'rgba(10, 8, 6, 0.55)';
      ctx.font = 'bold 58px Georgia, serif';
      ctx.fillText(title.toUpperCase(), 515, 109);

      ctx.fillStyle = textColor;
      ctx.fillText(title.toUpperCase(), 512, 105);

      ctx.font = '500 29px Georgia, serif';
      ctx.fillStyle = '#f1e5c8';
      ctx.fillText(subtitle, 512, 178);
    }

    const tex = new THREE.CanvasTexture(sCanvas);
    tex.anisotropy = Math.min(8, maxAnisotropy);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    createdTextures.push(tex);
    return tex;
  };

  // 16. 1914 Poster & Handbill Collage Texture (for civic kiosks & wharf noticeboards)
  const postCanvas = document.createElement('canvas');
  postCanvas.width = 512;
  postCanvas.height = 256;
  const poCtx = postCanvas.getContext('2d')!;
  poCtx.fillStyle = '#33281e';
  poCtx.fillRect(0, 0, 512, 256);
  const handbills = [
    { x: 14, y: 14, w: 148, h: 228, bg: '#ead9b7', fg: '#1e1915', accent: '#8e2420', top: 'OPERA HOUSE', mid: 'CONCERT', bot: 'SATURDAY 8 PM' },
    { x: 176, y: 14, w: 160, h: 110, bg: '#d6e0d5', fg: '#1c2b21', accent: '#234a35', top: 'UNION STEAM', mid: 'COASTAL CARGO', bot: 'SAILS TUESDAYS' },
    { x: 176, y: 134, w: 160, h: 108, bg: '#f0dfba', fg: '#251a11', accent: '#753f16', top: 'BUSHELLS', mid: 'BLUE LABEL TEA', bot: '1/10 PER LB' },
    { x: 350, y: 14, w: 148, h: 228, bg: '#e3cbb7', fg: '#1f1814', accent: '#1d3752', top: 'OAMARU', mid: 'MOTOR TRIALS', bot: 'HARBOUR ST' },
  ];
  handbills.forEach((hb) => {
    poCtx.fillStyle = hb.bg;
    poCtx.fillRect(hb.x, hb.y, hb.w, hb.h);
    poCtx.strokeStyle = hb.accent;
    poCtx.lineWidth = 4;
    poCtx.strokeRect(hb.x + 5, hb.y + 5, hb.w - 10, hb.h - 10);
    poCtx.textAlign = 'center';
    poCtx.fillStyle = hb.accent;
    poCtx.font = 'bold 18px Georgia, serif';
    poCtx.fillText(hb.top, hb.x + hb.w * 0.5, hb.y + hb.h * 0.28);
    poCtx.fillStyle = hb.fg;
    poCtx.font = 'bold 21px Georgia, serif';
    poCtx.fillText(hb.mid, hb.x + hb.w * 0.5, hb.y + hb.h * 0.56);
    poCtx.font = '600 13px Georgia, serif';
    poCtx.fillText(hb.bot, hb.x + hb.w * 0.5, hb.y + hb.h * 0.8);
  });
  const posterCollage = configureTexture(postCanvas, 1, 1, maxAnisotropy, true);
  posterCollage.wrapS = THREE.ClampToEdgeWrapping;
  posterCollage.wrapT = THREE.ClampToEdgeWrapping;
  createdTextures.push(posterCollage);

  // 17. Vintage 1914 Advertising Generator (Gable Murals, Projecting Blade Signs & A-Frame Boards)
  const createVintageAdTexture = (
    headline: string,
    subline: string,
    bgColor: string,
    fgColor: string,
    accentColor: string,
    kind: 'mural' | 'blade' | 'aboard'
  ): THREE.CanvasTexture => {
    const adCanvas = document.createElement('canvas');
    adCanvas.width = kind === 'aboard' ? 384 : 512;
    adCanvas.height = kind === 'aboard' ? 512 : 320;
    const ctx = adCanvas.getContext('2d')!;
    const W = adCanvas.width;
    const H = adCanvas.height;
    const randAd = seededNoise(headline.length * 73 + subline.length * 19);

    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, W, H);

    // Ornate double-rule period border
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = kind === 'mural' ? 8 : 6;
    ctx.strokeRect(12, 12, W - 24, H - 24);
    ctx.strokeStyle = fgColor;
    ctx.lineWidth = 2;
    ctx.strokeRect(22, 22, W - 44, H - 44);

    ctx.fillStyle = accentColor;
    ctx.fillRect(36, kind === 'aboard' ? 82 : 60, W - 72, 4);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (kind === 'aboard') {
      ctx.fillStyle = accentColor;
      ctx.font = 'bold 28px Georgia, serif';
      ctx.fillText('1914 · OAMARU', W * 0.5, 52);

      const words = headline.toUpperCase().split(' ');
      ctx.fillStyle = fgColor;
      ctx.font = 'bold 44px Georgia, serif';
      if (words.length >= 2) {
        const mid = Math.ceil(words.length / 2);
        ctx.fillText(words.slice(0, mid).join(' '), W * 0.5, 192);
        ctx.fillText(words.slice(mid).join(' '), W * 0.5, 256);
      } else {
        ctx.fillText(headline.toUpperCase(), W * 0.5, 224);
      }

      ctx.fillStyle = accentColor;
      ctx.fillRect(58, 336, W - 116, 4);

      ctx.fillStyle = fgColor;
      ctx.font = '600 26px Georgia, serif';
      ctx.fillText(subline, W * 0.5, 398);
    } else if (kind === 'blade') {
      ctx.fillStyle = fgColor;
      ctx.font = 'bold 54px Georgia, serif';
      ctx.fillText(headline.toUpperCase(), W * 0.5, H * 0.42);
      ctx.fillStyle = accentColor;
      ctx.font = '600 26px Georgia, serif';
      ctx.fillText(subline.toUpperCase(), W * 0.5, H * 0.7);
    } else {
      ctx.fillStyle = accentColor;
      ctx.font = '600 24px Georgia, serif';
      ctx.fillText('ESTABLISHED & WARRANTED', W * 0.5, 42);

      ctx.fillStyle = fgColor;
      ctx.font = 'bold 50px Georgia, serif';
      ctx.fillText(headline.toUpperCase(), W * 0.5, H * 0.45);

      ctx.fillStyle = accentColor;
      ctx.fillRect(52, H * 0.63, W - 104, 4);

      ctx.fillStyle = fgColor;
      ctx.font = '600 28px Georgia, serif';
      ctx.fillText(subline.toUpperCase(), W * 0.5, H * 0.77);

      for (let i = 0; i < 360; i++) {
        ctx.fillStyle = randAd() > 0.5 ? 'rgba(218, 206, 182, 0.16)' : 'rgba(56, 46, 36, 0.14)';
        ctx.fillRect(randAd() * W, randAd() * H, 3 + randAd() * 9, 2 + randAd() * 5);
      }
    }

    const tex = new THREE.CanvasTexture(adCanvas);
    tex.anisotropy = Math.min(8, maxAnisotropy);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    createdTextures.push(tex);
    return tex;
  };

  return {
    limestone,
    limestoneBump,
    limestoneRusticated,
    limestoneRusticatedBump,
    polychromeStone,
    archedWindow,
    openSashWindow,
    shopfrontWindow,
    castIronLace,
    balustradeStone,
    stripedAwning,
    footpathStone,
    timberDoors,
    posterCollage,
    cobbles,
    cobblesBump,
    cobblesNormal,
    macadam,
    mud,
    wharfTimber,
    corrugatedIron,
    grass,
    wornEarth,
    cabbageTree,
    macrocarpa,
    radiatorHoneycomb,
    clockFace,
    createSignTexture,
    createVintageAdTexture,
    dispose: () => {
      createdTextures.forEach((t) => t.dispose());
    },
  };
}
