import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

// CRC32 implementation for PNG chunks
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);

  const toCrc = Buffer.concat([typeBuf, data]);
  const crcVal = crc32(toCrc);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crcVal, 0);

  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function createPng(width, height, drawFn) {
  // 1. Signature
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // 2. IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8); // bit depth 8
  ihdrData.writeUInt8(6, 9); // color type 6 (RGBA)
  ihdrData.writeUInt8(0, 10); // compression
  ihdrData.writeUInt8(0, 11); // filter
  ihdrData.writeUInt8(0, 12); // interlace
  const ihdrChunk = makeChunk("IHDR", ihdrData);

  // 3. Raw RGBA Scanlines (filter byte 0 per line)
  const lineStride = 1 + width * 4;
  const rawData = Buffer.alloc(height * lineStride);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * lineStride;
    rawData[rowOffset] = 0; // Filter type 0 (None)
    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      const [r, g, b, a] = drawFn(x, y, width, height);
      rawData[pxOffset] = r;
      rawData[pxOffset + 1] = g;
      rawData[pxOffset + 2] = b;
      rawData[pxOffset + 3] = a;
    }
  }

  // 4. Compress with zlib Deflate
  const compressed = zlib.deflateSync(rawData, { level: 9 });
  const idatChunk = makeChunk("IDAT", compressed);

  // 5. IEND
  const iendChunk = makeChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

// Medical Cross + Shield / Rounded Rect drawing function
function drawMediQIcon(x, y, w, h) {
  const cx = w / 2;
  const cy = h / 2;
  const rCorner = w * 0.22; // rounded corner radius
  const pad = w * 0.04;

  // Check if inside rounded rectangle
  const innerW = w - pad * 2;
  const innerH = h - pad * 2;
  const minX = pad, maxX = w - pad;
  const minY = pad, maxY = h - pad;

  let insideCard = false;
  if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
    const dx = Math.max(minX + rCorner - x, 0, x - (maxX - rCorner));
    const dy = Math.max(minY + rCorner - y, 0, y - (maxY - rCorner));
    if (dx * dx + dy * dy <= rCorner * rCorner) {
      insideCard = true;
    }
  }

  if (!insideCard) {
    return [0, 0, 0, 0]; // Transparent background
  }

  // Background gradient: MediQ primary #0284c7 (2, 132, 199) to deep royal #0369a1 (3, 105, 161)
  const t = y / h;
  let bgR = Math.round(2 * (1 - t) + 3 * t);
  let bgG = Math.round(132 * (1 - t) + 105 * t);
  let bgB = Math.round(199 * (1 - t) + 161 * t);
  let bgA = 255;

  // Medical Cross dimensions
  const crossThick = w * 0.14;
  const crossArm = w * 0.28;
  const inHoriz = (Math.abs(y - cy) <= crossThick / 2) && (Math.abs(x - cx) <= crossArm);
  const inVert = (Math.abs(x - cx) <= crossThick / 2) && (Math.abs(y - cy) <= crossArm);

  if (inHoriz || inVert) {
    // Pure White Cross #ffffff
    return [255, 255, 255, 255];
  }

  // Central pulse / halo dots
  const distCenter = Math.hypot(x - cx, y - cy);
  const haloR = crossArm * 1.25;
  if (Math.abs(distCenter - haloR) < w * 0.015 && (x > cx + crossThick / 2 || y < cy - crossThick / 2)) {
    // Cyan glow highlight
    return [224, 242, 254, 230];
  }

  return [bgR, bgG, bgB, bgA];
}

// Generate files
const outDir = path.resolve("public/mobile");
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

// 1. icon-192.png
const png192 = createPng(192, 192, drawMediQIcon);
fs.writeFileSync(path.join(outDir, "icon-192.png"), png192);
console.log(`Generated icon-192.png (${png192.length} bytes)`);

// 2. icon-512.png
const png512 = createPng(512, 512, drawMediQIcon);
fs.writeFileSync(path.join(outDir, "icon-512.png"), png512);
console.log(`Generated icon-512.png (${png512.length} bytes)`);

// 3. Vector SVG icon
const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0284c7" />
      <stop offset="100%" stop-color="#0369a1" />
    </linearGradient>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="8" stdDeviation="16" flood-color="#0f172a" flood-opacity="0.25"/>
    </filter>
  </defs>
  <rect x="24" y="24" width="464" height="464" rx="100" fill="url(#bgGrad)" filter="url(#shadow)"/>
  <!-- Decorative Ring -->
  <circle cx="256" cy="256" r="170" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="8" stroke-dasharray="16 12"/>
  <!-- Medical Cross -->
  <rect x="220" y="116" width="72" height="280" rx="20" fill="#ffffff" />
  <rect x="116" y="220" width="280" height="72" rx="20" fill="#ffffff" />
  <!-- Center Heartbeat / Shield Dot -->
  <circle cx="256" cy="256" r="18" fill="#0284c7"/>
  <!-- MediQ Pulse Badge -->
  <circle cx="370" cy="142" r="24" fill="#38bdf8"/>
  <circle cx="370" cy="142" r="14" fill="#ffffff"/>
</svg>`;
fs.writeFileSync(path.join(outDir, "icon.svg"), svgContent, "utf-8");
console.log(`Generated icon.svg (${svgContent.length} bytes)`);
