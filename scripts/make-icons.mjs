/**
 * Generates the PWA / launcher icons.
 *   public/icon.svg, icon-192.png, icon-512.png, icon-maskable-512.png
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '../public');

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePNG(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

class Raster {
  constructor(size) {
    this.s = size;
    this.data = Buffer.alloc(size * size * 4);
  }
  blend(x, y, c) {
    if (x < 0 || y < 0 || x >= this.s || y >= this.s) return;
    const i = (y * this.s + x) * 4;
    const a = (c[3] ?? 255) / 255;
    if (a <= 0) return;
    const ia = 1 - a;
    for (let k = 0; k < 3; k++) this.data[i + k] = Math.round(c[k] * a + this.data[i + k] * ia);
    this.data[i + 3] = Math.min(255, Math.round(255 * a + this.data[i + 3] * ia));
  }
  rect(x, y, w, h, c) {
    for (let yy = Math.round(y); yy < Math.round(y + h); yy++)
      for (let xx = Math.round(x); xx < Math.round(x + w); xx++) this.blend(xx, yy, c);
  }
  circle(cx, cy, r, c) {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        if (d <= r) this.blend(x, y, c);
        else if (d <= r + 1) this.blend(x, y, [c[0], c[1], c[2], (c[3] ?? 255) * (r + 1 - d)]);
      }
  }
  polygon(points, c) {
    let minY = Infinity, maxY = -Infinity;
    for (const p of points) {
      minY = Math.min(minY, p[1]);
      maxY = Math.max(maxY, p[1]);
    }
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      const xs = [];
      for (let i = 0; i < points.length; i++) {
        const a = points[i];
        const b = points[(i + 1) % points.length];
        if (a[1] === b[1]) continue;
        const lo = Math.min(a[1], b[1]);
        const hi = Math.max(a[1], b[1]);
        if (y + 0.5 < lo || y + 0.5 >= hi) continue;
        const t = (y + 0.5 - a[1]) / (b[1] - a[1]);
        xs.push(a[0] + t * (b[0] - a[0]));
      }
      xs.sort((p, q) => p - q);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        for (let x = Math.floor(xs[i]); x <= Math.ceil(xs[i + 1]); x++) {
          const alpha = Math.min(1, xs[i + 1] - xs[i]) * ((c[3] ?? 255) / 255);
          this.blend(x, y, [c[0], c[1], c[2], alpha * 255]);
        }
      }
    }
  }
  /** quadratic bezier leaf */
  leaf(cx, cy, size, angle, c) {
    const pts = [];
    const tip = [-Math.sin(angle) * size, -Math.cos(angle) * size];
    const base = [Math.sin(angle) * size * 0.7, Math.cos(angle) * size * 0.7];
    const bulge = size * 0.55;
    const steps = 60;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const mt = 1 - t;
      const px = mt * mt * base[0] + 2 * mt * t * (base[0] * 0.2 + bulge) + t * t * tip[0];
      const py = mt * mt * base[1] + 2 * mt * t * (base[1] * 0.2 - bulge) + t * t * tip[1];
      pts.push([cx + px, cy + py]);
    }
    for (let i = steps; i >= 0; i--) {
      const t = i / steps;
      const mt = 1 - t;
      const px = mt * mt * base[0] + 2 * mt * t * (base[0] * 0.2 - bulge) + t * t * tip[0];
      const py = mt * mt * base[1] + 2 * mt * t * (base[1] * 0.2 + bulge) + t * t * tip[1];
      pts.push([cx + px, cy + py]);
    }
    this.polygon(pts, c);
  }
}

function icon(size, { maskable = false } = {}) {
  const r = new Raster(size);
  const s = size;
  const pad = maskable ? 0.14 : 0;
  const inner = s * (1 - pad * 2);
  const radius = maskable ? 0 : s * 0.22;

  // rounded background
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const cx = Math.min(Math.max(x + 0.5, radius), s - radius);
      const cy = Math.min(Math.max(y + 0.5, radius), s - radius);
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d > radius) continue;
      const t = (x / s) * 0.5 + (y / s) * 0.5;
      r.blend(x, y, [
        Math.round(18 + t * 14),
        Math.round(30 + t * 26),
        Math.round(26 + t * 18),
        255,
      ]);
    }
  }

  // a chunky isometric cube, Minecraft style
  const c = s * 0.5;
  const cw = inner * 0.34;
  const ch = cw * 0.5;
  const cubetop = [
    [c, c - cw * 0.62],
    [c + cw, c - cw * 0.12],
    [c, c + cw * 0.38],
    [c - cw, c - cw * 0.12],
  ];
  r.polygon(cubetop, [122, 232, 138, 255]);
  r.polygon(
    [
      [c - cw, c - cw * 0.12],
      [c, c + cw * 0.38],
      [c, c + cw * 0.38 + ch * 1.5],
      [c - cw, c - cw * 0.12 + ch * 1.5],
    ],
    [58, 168, 88, 255],
  );
  r.polygon(
    [
      [c + cw, c - cw * 0.12],
      [c, c + cw * 0.38],
      [c, c + cw * 0.38 + ch * 1.5],
      [c + cw, c - cw * 0.12 + ch * 1.5],
    ],
    [36, 124, 63, 255],
  );

  // leaf accent
  r.leaf(s * 0.74, s * 0.28, s * 0.15, Math.PI * 0.28, [156, 240, 168, 235]);

  return encodePNG(s, s, r.data);
}

writeFileSync(resolve(OUT, 'icon-192.png'), icon(192));
writeFileSync(resolve(OUT, 'icon-512.png'), icon(512));
writeFileSync(resolve(OUT, 'icon-maskable-512.png'), icon(512, { maskable: true }));

// legacy launcher icons for Android 7 and earlier (no adaptive icons)
const RES = resolve(__dirname, '../android/app/src/main/res');
const densities = [
  ['mipmap-mdpi', 48],
  ['mipmap-hdpi', 72],
  ['mipmap-xhdpi', 96],
  ['mipmap-xxhdpi', 144],
  ['mipmap-xxxhdpi', 192],
];
for (const [folder, size] of densities) {
  const dir = resolve(RES, folder);
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, 'ic_launcher.png'), icon(size));
  writeFileSync(resolve(dir, 'ic_launcher_round.png'), icon(size));
}
console.log('android launcher icons written');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#121e22"/>
      <stop offset="1" stop-color="#1e2c26"/>
    </linearGradient>
  </defs>
  <rect width="64" height="64" rx="14" fill="url(#bg)"/>
  <polygon points="32,14 52,25 32,36 12,25" fill="#7ae88a"/>
  <polygon points="12,25 32,36 32,52 12,41" fill="#3aa858"/>
  <polygon points="52,25 32,36 32,52 52,41" fill="#247c3f"/>
  <path d="M50 12c8 4 10 12 6 18-6-2-10-8-10-14 1-2 2-3 4-4z" fill="#9cf0ac" opacity="0.9"/>
</svg>
`;
writeFileSync(resolve(OUT, 'icon.svg'), svg);
console.log('icons written');
