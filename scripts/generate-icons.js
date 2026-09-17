const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

function crc32(buf) {
  let table = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      if (c & 1) c = 0xedb88320 ^ (c >>> 1);
      else c = c >>> 1;
    }
    table[n] = c;
  }
  let crc = 0 ^ (-1);
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ (-1)) >>> 0;
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function createPng(width, height, getPixel) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const ihdrChunk = makeChunk("IHDR", ihdr);

  const rawRows = [];
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 4);
    row[0] = 0;
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = getPixel(x, y, width, height);
      const offset = 1 + x * 4;
      row[offset] = r;
      row[offset + 1] = g;
      row[offset + 2] = b;
      row[offset + 3] = a;
    }
    rawRows.push(row);
  }

  const rawData = Buffer.concat(rawRows);
  const compressed = zlib.deflateSync(rawData);
  const idatChunk = makeChunk("IDAT", compressed);
  const iendChunk = makeChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([sig, ihdrChunk, idatChunk, iendChunk]);
}

// Draw Railway Emblem & Train
function railwayIconPixel(x, y, w, h, isMaskable) {
  // Normalize coords to -1..1
  const nx = (x / w) * 2 - 1;
  const ny = (y / h) * 2 - 1;
  const dist = Math.sqrt(nx * nx + ny * ny);

  // Background gradient: dark railway green / navy
  // If not maskable, round corners
  if (!isMaskable && dist > 0.96) {
    return [0, 0, 0, 0]; // transparent outside circle
  }

  // Base gradient: Navy #0b192c to Forest Green #004d40
  const grad = (ny + 1) / 2;
  let bgR = Math.round(11 * (1 - grad) + 5 * grad);
  let bgG = Math.round(25 * (1 - grad) + 60 * grad);
  let bgB = Math.round(44 * (1 - grad) + 40 * grad);

  // Outer golden border ring
  if (dist >= 0.88 && dist <= 0.94) {
    return [243, 156, 18, 255]; // Gold
  }
  if (dist > 0.94 && dist <= 0.96) {
    return [211, 84, 0, 255]; // Darker gold accent
  }

  // Train / Locomotive Silhouette in center
  // Train cabin & body coordinates:
  // scale to center -0.6 to 0.6
  const tx = nx;
  const ty = ny;

  // Train Chimney / Smoke stack:
  if (tx >= -0.35 && tx <= -0.22 && ty >= -0.45 && ty <= -0.25) {
    return [243, 156, 18, 255];
  }
  // Smoke puffs (circles):
  const s1 = Math.sqrt((tx - (-0.3)) ** 2 + (ty - (-0.55)) ** 2);
  const s2 = Math.sqrt((tx - (-0.15)) ** 2 + (ty - (-0.62)) ** 2);
  if (s1 < 0.08 || s2 < 0.1) {
    return [236, 240, 241, 230]; // Soft white smoke
  }

  // Train Main Boiler (cylinder from left to center):
  if (tx >= -0.45 && tx <= 0.15 && ty >= -0.25 && ty <= 0.18) {
    return [255, 255, 255, 255]; // White / light metal body
  }

  // Front Cowcatcher / Pilot:
  if (tx >= -0.55 && tx <= -0.45 && ty >= 0.05 && ty <= 0.22) {
    return [243, 156, 18, 255]; // Golden front
  }

  // Train Cabin (right side, taller):
  if (tx >= 0.12 && tx <= 0.45 && ty >= -0.42 && ty <= 0.18) {
    // Cabin window:
    if (tx >= 0.18 && tx <= 0.38 && ty >= -0.36 && ty <= -0.12) {
      return [11, 25, 44, 255]; // Dark window
    }
    return [255, 255, 255, 255];
  }

  // Train Underframe / Chassis:
  if (tx >= -0.52 && tx <= 0.48 && ty >= 0.18 && ty <= 0.24) {
    return [243, 156, 18, 255]; // Gold strip
  }

  // Wheels:
  // Wheel 1 (small front): center (-0.38, 0.32), radius 0.09
  const w1 = Math.sqrt((tx - (-0.38)) ** 2 + (ty - 0.32) ** 2);
  // Wheel 2 (big center): center (-0.12, 0.32), radius 0.13
  const w2 = Math.sqrt((tx - (-0.12)) ** 2 + (ty - 0.32) ** 2);
  // Wheel 3 (big rear): center (0.16, 0.32), radius 0.13
  const w3 = Math.sqrt((tx - 0.16) ** 2 + (ty - 0.32) ** 2);
  // Wheel 4 (rear small): center (0.38, 0.32), radius 0.09
  const w4 = Math.sqrt((tx - 0.38) ** 2 + (ty - 0.32) ** 2);

  if (w1 <= 0.09 || w2 <= 0.13 || w3 <= 0.13 || w4 <= 0.09) {
    // Wheel hub
    if (w1 <= 0.03 || w2 <= 0.04 || w3 <= 0.04 || w4 <= 0.03) {
      return [243, 156, 18, 255]; // Gold hub
    }
    return [220, 220, 220, 255]; // Steel rim
  }

  // Railway Track lines at bottom:
  if (tx >= -0.65 && tx <= 0.65 && ty >= 0.44 && ty <= 0.48) {
    return [243, 156, 18, 255]; // Track rail 1
  }
  if (tx >= -0.65 && tx <= 0.65 && ty >= 0.52 && ty <= 0.55) {
    return [189, 195, 199, 255]; // Track rail 2
  }
  // Track Ties / Sleepers:
  if (ty >= 0.44 && ty <= 0.55 && Math.floor(Math.abs(tx * 25)) % 2 === 0) {
    return [150, 150, 150, 255];
  }

  // Star / Crescent / Emblem badge at top center:
  const badgeD = Math.sqrt((tx - 0) ** 2 + (ty - (-0.45)) ** 2);
  if (badgeD <= 0.06) {
    return [243, 156, 18, 255];
  }

  return [bgR, bgG, bgB, 255];
}

const iconsDir = path.join(__dirname, "..", "icons");
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

console.log("Generating PWA App Icons...");

// 1. icon-192.png
const png192 = createPng(192, 192, (x, y, w, h) => railwayIconPixel(x, y, w, h, false));
fs.writeFileSync(path.join(iconsDir, "icon-192.png"), png192);
console.log("Created icon-192.png (192x192)");

// 2. icon-512.png
const png512 = createPng(512, 512, (x, y, w, h) => railwayIconPixel(x, y, w, h, false));
fs.writeFileSync(path.join(iconsDir, "icon-512.png"), png512);
console.log("Created icon-512.png (512x512)");

// 3. icon-maskable-192.png
const maskable192 = createPng(192, 192, (x, y, w, h) => railwayIconPixel(x, y, w, h, true));
fs.writeFileSync(path.join(iconsDir, "icon-maskable-192.png"), maskable192);
console.log("Created icon-maskable-192.png (192x192)");

// 4. icon-maskable-512.png
const maskable512 = createPng(512, 512, (x, y, w, h) => railwayIconPixel(x, y, w, h, true));
fs.writeFileSync(path.join(iconsDir, "icon-maskable-512.png"), maskable512);
console.log("Created icon-maskable-512.png (512x512)");

// 5. favicon.png in root
fs.writeFileSync(path.join(__dirname, "..", "favicon.png"), png192);
console.log("Created favicon.png");

console.log("All PWA Icons Generated Successfully!");
