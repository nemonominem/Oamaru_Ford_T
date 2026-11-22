import * as THREE from 'three';

export interface TextureBundle {
  limestone: THREE.CanvasTexture;
  limestoneRusticated: THREE.CanvasTexture;
  polychromeStone: THREE.CanvasTexture;
  archedWindow: THREE.CanvasTexture;
  castIronLace: THREE.CanvasTexture;
  timberDoors: THREE.CanvasTexture;
  cobbles: THREE.CanvasTexture;
  cobblesBump: THREE.CanvasTexture;
  macadam: THREE.CanvasTexture;
  mud: THREE.CanvasTexture;
  wharfTimber: THREE.CanvasTexture;
  corrugatedIron: THREE.CanvasTexture;
  grass: THREE.CanvasTexture;
  createSignTexture: (title: string, subtitle: string, bgColor?: string, textColor?: string) => THREE.CanvasTexture;
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
  const createdTextures: THREE.CanvasTexture[] = [];

  // 1. Oamaru Whitestone Ashlar Limestone
  const limeCanvas = document.createElement('canvas');
  limeCanvas.width = 512;
  limeCanvas.height = 512;
  const lCtx = limeCanvas.getContext('2d')!;
  const randLime = seededNoise(1914);
  lCtx.fillStyle = '#dfd4be';
  lCtx.fillRect(0, 0, 512, 512);

  const rows = 8;
  const rowH = 512 / rows;
  for (let r = 0; r < rows; r++) {
    const cols = 4;
    const colW = 512 / cols;
    const offset = (r % 2) * (colW * 0.5);
    for (let c = -1; c <= cols; c++) {
      const bx = c * colW + offset;
      const by = r * rowH;
      const shade = Math.floor((randLime() - 0.5) * 14);
      const red = 223 + shade;
      const green = 212 + shade;
      const blue = 188 + shade;
      lCtx.fillStyle = `rgb(${red},${green},${blue})`;
      lCtx.fillRect(bx + 2, by + 2, colW - 4, rowH - 4);

      for (let g = 0; g < 35; g++) {
        lCtx.fillStyle = randLime() > 0.5 ? 'rgba(175,160,132,0.16)' : 'rgba(248,244,232,0.18)';
        lCtx.fillRect(bx + 4 + randLime() * (colW - 8), by + 4 + randLime() * (rowH - 8), 2, 2);
      }
    }
    lCtx.fillStyle = 'rgba(130,118,98,0.45)';
    lCtx.fillRect(0, r * rowH, 512, 2);
  }
  const limestone = configureTexture(limeCanvas, 2, 2, maxAnisotropy, true);
  createdTextures.push(limestone);

  // 2. Rusticated Limestone Base
  const rustCanvas = document.createElement('canvas');
  rustCanvas.width = 512;
  rustCanvas.height = 512;
  const rCtx = rustCanvas.getContext('2d')!;
  rCtx.fillStyle = '#d3c6ad';
  rCtx.fillRect(0, 0, 512, 512);
  const randRust = seededNoise(1882);
  for (let r = 0; r < 6; r++) {
    const h = 512 / 6;
    const w = 512 / 3;
    const off = (r % 2) * (w * 0.5);
    for (let c = -1; c <= 3; c++) {
      const x = c * w + off;
      const y = r * h;
      const v = Math.floor((randRust() - 0.5) * 16);
      rCtx.fillStyle = `rgb(${212 + v},${199 + v},${174 + v})`;
      rCtx.fillRect(x + 4, y + 4, w - 8, h - 8);
      rCtx.strokeStyle = 'rgba(95,84,68,0.5)';
      rCtx.lineWidth = 3;
      rCtx.strokeRect(x + 2, y + 2, w - 4, h - 4);
    }
  }
  const limestoneRusticated = configureTexture(rustCanvas, 2, 1, maxAnisotropy, true);
  createdTextures.push(limestoneRusticated);

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

  // 4. Victorian Arched Sash Window Texture
  const winCanvas = document.createElement('canvas');
  winCanvas.width = 256;
  winCanvas.height = 384;
  const wiCtx = winCanvas.getContext('2d')!;
  wiCtx.fillStyle = '#dfd4be';
  wiCtx.fillRect(0, 0, 256, 384);
  // Recessed arch frame
  wiCtx.fillStyle = '#ebe3d3';
  wiCtx.beginPath();
  wiCtx.arc(128, 108, 92, Math.PI, 0);
  wiCtx.lineTo(220, 360);
  wiCtx.lineTo(36, 360);
  wiCtx.closePath();
  wiCtx.fill();
  wiCtx.lineWidth = 8;
  wiCtx.strokeStyle = '#9c8f77';
  wiCtx.stroke();

  // Glass panes
  wiCtx.fillStyle = '#25313b';
  wiCtx.beginPath();
  wiCtx.arc(128, 112, 74, Math.PI, 0);
  wiCtx.lineTo(202, 344);
  wiCtx.lineTo(54, 344);
  wiCtx.closePath();
  wiCtx.fill();

  // Timber sash muntin bars
  wiCtx.strokeStyle = '#ede5d4';
  wiCtx.lineWidth = 6;
  wiCtx.beginPath();
  wiCtx.moveTo(128, 38);
  wiCtx.lineTo(128, 344);
  wiCtx.moveTo(54, 112);
  wiCtx.lineTo(202, 112);
  wiCtx.moveTo(54, 195);
  wiCtx.lineTo(202, 195);
  wiCtx.moveTo(54, 272);
  wiCtx.lineTo(202, 272);
  wiCtx.stroke();
  // Keystone
  wiCtx.fillStyle = '#cfc2a7';
  wiCtx.fillRect(112, 10, 32, 34);
  const archedWindow = configureTexture(winCanvas, 1, 1, maxAnisotropy, true);
  archedWindow.wrapS = THREE.ClampToEdgeWrapping;
  archedWindow.wrapT = THREE.ClampToEdgeWrapping;
  createdTextures.push(archedWindow);

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

  cCtx.fillStyle = '#3b3936';
  cCtx.fillRect(0, 0, 512, 512);
  cbCtx.fillStyle = '#202020';
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
  createdTextures.push(cobbles, cobblesBump);

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

  // 13. Period Fascia Sign Factory
  const createSignTexture = (
    title: string,
    subtitle: string,
    bgColor = '#222b24',
    textColor = '#e6c57a'
  ): THREE.CanvasTexture => {
    const sCanvas = document.createElement('canvas');
    sCanvas.width = 1024;
    sCanvas.height = 256;
    const ctx = sCanvas.getContext('2d')!;

    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, 1024, 256);

    ctx.strokeStyle = textColor;
    ctx.lineWidth = 6;
    ctx.strokeRect(14, 14, 996, 228);

    ctx.fillStyle = textColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 60px Georgia, serif';
    ctx.fillText(title.toUpperCase(), 512, 106);

    ctx.font = '500 30px Georgia, serif';
    ctx.fillStyle = '#f1e5c8';
    ctx.fillText(subtitle, 512, 178);

    const tex = new THREE.CanvasTexture(sCanvas);
    tex.anisotropy = Math.min(8, maxAnisotropy);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    createdTextures.push(tex);
    return tex;
  };

  return {
    limestone,
    limestoneRusticated,
    polychromeStone,
    archedWindow,
    castIronLace,
    timberDoors,
    cobbles,
    cobblesBump,
    macadam,
    mud,
    wharfTimber,
    corrugatedIron,
    grass,
    createSignTexture,
    dispose: () => {
      createdTextures.forEach((t) => t.dispose());
    },
  };
}
