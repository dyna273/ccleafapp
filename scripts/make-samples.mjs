/**
 * Generates the bundled sample .bbmodel files:
 *   public/models/steve.bbmodel   - animated Minecraft-style character (box UV)
 *   public/models/orientation-cube.bbmodel - per-face UV cube labelled N/S/E/W/U/D
 *
 * Run with: npm run samples
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '../public/models');

/* ------------------------------------------------------------------ */
/*  Minimal PNG encoder (RGBA8)                                         */
/* ------------------------------------------------------------------ */

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

export function encodePNG(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // truecolour + alpha
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ------------------------------------------------------------------ */
/*  Pixel canvas helper                                                 */
/* ------------------------------------------------------------------ */

class Pix {
  constructor(w, h, fill = [0, 0, 0, 0]) {
    this.w = w;
    this.h = h;
    this.data = Buffer.alloc(w * h * 4);
    this.fill(0, 0, w, h, fill);
  }
  set(x, y, c) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    this.data[i] = c[0];
    this.data[i + 1] = c[1];
    this.data[i + 2] = c[2];
    this.data[i + 3] = c.length > 3 ? c[3] : 255;
  }
  fill(x, y, w, h, c) {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.set(xx, yy, c);
  }
  /** draw a 5x7 bitmap font glyph */
  glyph(x, y, ch, color, scale = 1) {
    const FONT = {
      N: ['10001', '11001', '10101', '10011', '10001'],
      S: ['01111', '10000', '01110', '00001', '11110'],
      E: ['11111', '10000', '11110', '10000', '11111'],
      W: ['10001', '10001', '10101', '11011', '10001'],
      U: ['10001', '10001', '10001', '10001', '01110'],
      D: ['11110', '10001', '10001', '10001', '11110'],
      F: ['11111', '10000', '11110', '10000', '10000'],
      B: ['11110', '10001', '11110', '10001', '11110'],
      L: ['10000', '10000', '10000', '10000', '11111'],
      R: ['11110', '10001', '11110', '10100', '10011'],
      T: ['11111', '00100', '00100', '00100', '00100'],
      O: ['01110', '10001', '10001', '10001', '01110'],
      P: ['11110', '10001', '11110', '10000', '10000'],
    };
    const g = FONT[ch];
    if (!g) return;
    for (let r = 0; r < g.length; r++) {
      for (let c = 0; c < g[r].length; c++) {
        if (g[r][c] === '1') this.fill(x + c * scale, y + r * scale, scale, scale, color);
      }
    }
  }
  toDataURL() {
    const png = encodePNG(this.w, this.h, this.data);
    return `data:image/png;base64,${png.toString('base64')}`;
  }
}

/* ------------------------------------------------------------------ */
/*  Steve skin (64x64, standard layout)                                 */
/* ------------------------------------------------------------------ */

const SKIN = [198, 140, 83, 255];
const SKIN_D = [168, 116, 66, 255];
const HAIR = [74, 48, 33, 255];
const SHIRT = [0, 175, 175, 255];
const SHIRT_D = [0, 140, 140, 255];
const PANTS = [63, 71, 176, 255];
const PANTS_D = [50, 57, 145, 255];
const SHOE = [90, 90, 90, 255];
const EYE_W = [255, 255, 255, 255];
const EYE_P = [60, 80, 170, 255];
const MOUTH = [120, 70, 55, 255];

function buildSkin() {
  const p = new Pix(64, 64);
  // ---------- head (0,0)-(32,16) ----------
  // top (8,0)  bottom (16,0)
  p.fill(8, 0, 8, 8, HAIR);
  p.fill(16, 0, 8, 8, SKIN_D);
  // right face (0,8) front (8,8) left (16,8) back (24,8)
  for (const [x, base] of [[0, HAIR], [8, SKIN], [16, HAIR], [24, HAIR]]) {
    p.fill(x, 8, 8, 8, base);
    if (x === 8) {
      // face: eyes, mouth
      p.fill(9, 11, 2, 2, EYE_W);
      p.fill(13, 11, 2, 2, EYE_W);
      p.fill(10, 12, 1, 1, EYE_P);
      p.fill(14, 12, 1, 1, EYE_P);
      p.fill(11, 14, 2, 1, MOUTH);
      p.fill(11, 13, 1, 1, SKIN_D);
    } else {
      // side/back: hair fringe at the top
      p.fill(x, 8, 8, 3, HAIR);
    }
  }
  // ---------- body (16,16)-(40,32) ----------
  p.fill(20, 16, 8, 4, SHIRT_D); // top
  p.fill(28, 16, 8, 4, SHIRT_D); // bottom
  p.fill(16, 20, 4, 12, SHIRT); // right
  p.fill(20, 20, 8, 12, SHIRT); // front
  p.fill(28, 20, 4, 12, SHIRT); // left
  p.fill(32, 20, 8, 12, SHIRT); // back
  // neckline on the front
  p.fill(22, 20, 4, 2, SKIN);
  // ---------- right arm (40,16)-(56,32) ----------
  p.fill(44, 16, 4, 4, SHIRT_D);
  p.fill(48, 16, 4, 4, SHIRT_D);
  p.fill(40, 20, 4, 12, SHIRT);
  p.fill(44, 20, 4, 12, SHIRT);
  p.fill(48, 20, 4, 12, SHIRT);
  p.fill(52, 20, 4, 12, SHIRT);
  p.fill(40, 28, 16, 4, SKIN); // hands
  // ---------- right leg (0,16)-(16,32) ----------
  p.fill(4, 16, 4, 4, PANTS_D);
  p.fill(8, 16, 4, 4, PANTS_D);
  p.fill(0, 20, 4, 12, PANTS);
  p.fill(4, 20, 4, 12, PANTS);
  p.fill(8, 20, 4, 12, PANTS);
  p.fill(12, 20, 4, 12, PANTS);
  p.fill(0, 28, 16, 4, SHOE);
  // ---------- left leg (16,48)-(32,64) ----------
  p.fill(20, 48, 4, 4, PANTS_D);
  p.fill(24, 48, 4, 4, PANTS_D);
  p.fill(16, 52, 4, 12, PANTS);
  p.fill(20, 52, 4, 12, PANTS);
  p.fill(24, 52, 4, 12, PANTS);
  p.fill(28, 52, 4, 12, PANTS);
  p.fill(16, 60, 16, 4, SHOE);
  // ---------- left arm (32,48)-(48,64) ----------
  p.fill(36, 48, 4, 4, SHIRT_D);
  p.fill(40, 48, 4, 4, SHIRT_D);
  p.fill(32, 52, 4, 12, SHIRT);
  p.fill(36, 52, 4, 12, SHIRT);
  p.fill(40, 52, 4, 12, SHIRT);
  p.fill(44, 52, 4, 12, SHIRT);
  p.fill(32, 60, 16, 4, SKIN);
  // ---------- second layer (hat / sleeves / trousers) ----------
  p.fill(40, 0, 8, 8, HAIR); // hat top
  p.fill(48, 0, 8, 8, HAIR); // hat bottom
  p.fill(32, 8, 8, 8, HAIR);
  p.fill(40, 8, 8, 8, HAIR);
  p.fill(48, 8, 8, 8, HAIR);
  p.fill(56, 8, 8, 8, HAIR);
  return p;
}

/* ------------------------------------------------------------------ */
/*  Orientation cube texture (64x32, 4 faces across, 2 down)            */
/* ------------------------------------------------------------------ */

const FACE_COLORS = {
  E: [214, 76, 76, 255],
  W: [76, 130, 214, 255],
  U: [96, 190, 96, 255],
  D: [214, 176, 76, 255],
  S: [168, 96, 214, 255],
  N: [240, 240, 240, 255],
};

function buildCubeTexture() {
  // box UV layout for a 16x16x16 cube: east [0,16] west [32,16] up [32,16]
  // down [48,0] south [48,16] north [16,16]; total 64x32
  const p = new Pix(64, 32);
  const dark = (c) => [c[0] * 0.62, c[1] * 0.62, c[2] * 0.62, 255];
  const place = (x, y, letter, base) => {
    p.fill(x, y, 16, 16, base);
    // border
    for (let i = 0; i < 16; i++) {
      p.set(x + i, y, dark(base));
      p.set(x + i, y + 15, dark(base));
      p.set(x, y + i, dark(base));
      p.set(x + 15, y + i, dark(base));
    }
    p.glyph(x + 4, y + 5, letter, [20, 20, 20, 255], 2);
  };
  place(0, 16, 'E', FACE_COLORS.E);
  place(32, 16, 'W', FACE_COLORS.W);
  place(32, 16, 'U', FACE_COLORS.U); // overwritten below for clarity
  place(32, 0, 'U', FACE_COLORS.U);
  place(48, 0, 'D', FACE_COLORS.D);
  place(48, 16, 'S', FACE_COLORS.S);
  place(16, 16, 'N', FACE_COLORS.N);
  // checker shading on the top so rotation is obvious
  for (let y = 0; y < 16; y += 4)
    for (let x = 0; x < 16; x += 4)
      if (((x / 4) | 0) % 2 === ((y / 4) | 0) % 2) p.fill(32 + x, 0 + y, 4, 4, [110, 205, 110, 255]);
  return p;
}

/* ------------------------------------------------------------------ */
/*  Model builders                                                      */
/* ------------------------------------------------------------------ */

let uuidSeed = 1;
function uuid() {
  const hex = '0123456789abcdef';
  const rand = () => hex[Math.floor(Math.random() * 16)];
  const part = (n) => Array.from({ length: n }, rand).join('');
  uuidSeed += 1;
  const seed = uuidSeed.toString(16).padStart(3, '0');
  return `${part(4)}${seed}-${part(4)}-${part(4)}-${part(4)}-${part(6)}${part(6)}`;
}

const cube = (name, from, to, origin, uv_offset, textureIndex = 0) => ({
  name,
  type: 'cube',
  uuid: uuid(),
  from,
  to,
  origin,
  rotation: [0, 0, 0],
  color: 0,
  visibility: true,
  box_uv: true,
  uv_offset,
  faces: {
    north: { texture: textureIndex },
    south: { texture: textureIndex },
    east: { texture: textureIndex },
    west: { texture: textureIndex },
    up: { texture: textureIndex },
    down: { texture: textureIndex },
  },
});

function kf(channel, time, [x, y, z], interpolation = 'linear') {
  return {
    channel,
    uuid: uuid(),
    time,
    interpolation,
    data_points: [{ x, y, z }],
  };
}

function buildSteve() {
  const head = cube('head', [-4, 24, -4], [4, 32, 4], [0, 24, 0], [0, 0]);
  const body = cube('body', [-4, 12, -2], [4, 24, 2], [0, 24, 0], [16, 16]);
  const armR = cube('rightArm', [-8, 12, -2], [-4, 24, 2], [-5, 22, 0], [40, 16]);
  const armL = cube('leftArm', [4, 12, -2], [8, 24, 2], [5, 22, 0], [40, 16]);
  const legR = cube('rightLeg', [-4, 0, -2], [0, 12, 2], [-2, 12, 0], [0, 16]);
  const legL = cube('leftLeg', [0, 0, -2], [4, 12, 2], [2, 12, 0], [0, 16]);

  const gHead = { name: 'head', uuid: uuid(), origin: [0, 24, 0], rotation: [0, 0, 0], visibility: true, export: true, color: 3 };
  const gBody = { name: 'body', uuid: uuid(), origin: [0, 24, 0], rotation: [0, 0, 0], visibility: true, export: true, color: 3 };
  const gArmR = { name: 'rightArm', uuid: uuid(), origin: [-5, 22, 0], rotation: [0, 0, 0], visibility: true, export: true, color: 4 };
  const gArmL = { name: 'leftArm', uuid: uuid(), origin: [5, 22, 0], rotation: [0, 0, 0], visibility: true, export: true, color: 4 };
  const gLegR = { name: 'rightLeg', uuid: uuid(), origin: [-2, 12, 0], rotation: [0, 0, 0], visibility: true, export: true, color: 5 };
  const gLegL = { name: 'leftLeg', uuid: uuid(), origin: [2, 12, 0], rotation: [0, 0, 0], visibility: true, export: true, color: 5 };
  const gRoot = { name: 'Steve', uuid: uuid(), origin: [0, 0, 0], rotation: [0, 0, 0], visibility: true, export: true, color: 0 };

  const elements = [head, body, armR, armL, legR, legL];
  const groups = [gRoot, gBody, gHead, gArmR, gArmL, gLegR, gLegL];

  const outliner = [
    {
      uuid: gRoot.uuid,
      children: [
        { uuid: gBody.uuid, children: [body.uuid] },
        { uuid: gHead.uuid, children: [head.uuid] },
        { uuid: gArmR.uuid, children: [armR.uuid] },
        { uuid: gArmL.uuid, children: [armL.uuid] },
        { uuid: gLegR.uuid, children: [legR.uuid] },
        { uuid: gLegL.uuid, children: [legL.uuid] },
      ],
    },
  ];

  const nameOf = new Map(groups.map((g) => [g.uuid, g.name]));
  const anim = (name, length, loop, tracks) => {
    const animators = {};
    for (const [node, keyframes] of Object.entries(tracks)) {
      animators[node] = { name: nameOf.get(node) || 'bone', type: 'bone', keyframes };
    }
    return { uuid: uuid(), name, loop, length, snapping: 20, animators };
  };

  const animations = [
    anim('idle', 2.4, 'loop', {
      [gRoot.uuid]: [
        kf('position', 0, [0, 0, 0]),
        kf('position', 1.2, [0, -0.35, 0], 'catmullrom'),
        kf('position', 2.4, [0, 0, 0]),
      ],
      [gHead.uuid]: [
        kf('rotation', 0, [0, 0, 0]),
        kf('rotation', 0.8, [-2.5, 5, 0], 'catmullrom'),
        kf('rotation', 1.6, [1.5, -5, 0], 'catmullrom'),
        kf('rotation', 2.4, [0, 0, 0]),
      ],
      [gArmR.uuid]: [
        kf('rotation', 0, [0, 0, -4]),
        kf('rotation', 1.2, [3, 0, -8], 'catmullrom'),
        kf('rotation', 2.4, [0, 0, -4]),
      ],
      [gArmL.uuid]: [
        kf('rotation', 0, [0, 0, 4]),
        kf('rotation', 1.2, [-3, 0, 8], 'catmullrom'),
        kf('rotation', 2.4, [0, 0, 4]),
      ],
    }),
    anim('walk', 1.0, 'loop', {
      [gRoot.uuid]: [
        kf('position', 0, [0, 0, 0]),
        kf('position', 0.25, [0, 0.5, 0], 'catmullrom'),
        kf('position', 0.5, [0, 0, 0], 'catmullrom'),
        kf('position', 0.75, [0, 0.5, 0], 'catmullrom'),
        kf('position', 1.0, [0, 0, 0]),
      ],
      [gLegR.uuid]: [
        kf('rotation', 0, [26, 0, 0]),
        kf('rotation', 0.5, [-26, 0, 0], 'catmullrom'),
        kf('rotation', 1.0, [26, 0, 0]),
      ],
      [gLegL.uuid]: [
        kf('rotation', 0, [-26, 0, 0]),
        kf('rotation', 0.5, [26, 0, 0], 'catmullrom'),
        kf('rotation', 1.0, [-26, 0, 0]),
      ],
      [gArmR.uuid]: [
        kf('rotation', 0, [-24, 0, -5]),
        kf('rotation', 0.5, [24, 0, -5], 'catmullrom'),
        kf('rotation', 1.0, [-24, 0, -5]),
      ],
      [gArmL.uuid]: [
        kf('rotation', 0, [24, 0, 5]),
        kf('rotation', 0.5, [-24, 0, 5], 'catmullrom'),
        kf('rotation', 1.0, [24, 0, 5]),
      ],
      [gHead.uuid]: [kf('rotation', 0, [3, 0, 0]), kf('rotation', 0.5, [-2, 0, 0], 'catmullrom'), kf('rotation', 1.0, [3, 0, 0])],
    }),
    anim('wave', 1.4, 'loop', {
      [gRoot.uuid]: [kf('position', 0, [0, 0, 0]), kf('position', 0.7, [0, 0.25, 0], 'catmullrom'), kf('position', 1.4, [0, 0, 0])],
      [gArmR.uuid]: [
        kf('rotation', 0, [0, 0, -6]),
        kf('rotation', 0.35, [0, 0, -152], 'catmullrom'),
        kf('rotation', 0.7, [0, 0, -132], 'catmullrom'),
        kf('rotation', 1.05, [0, 0, -152], 'catmullrom'),
        kf('rotation', 1.4, [0, 0, -6]),
      ],
      [gHead.uuid]: [kf('rotation', 0, [0, 0, 0]), kf('rotation', 0.35, [-4, -8, 0], 'catmullrom'), kf('rotation', 1.4, [0, 0, 0])],
    }),
    anim('jump', 1.0, 'loop', {
      [gRoot.uuid]: [
        kf('position', 0, [0, 0, 0]),
        kf('position', 0.22, [0, -2.2, 0], 'catmullrom'),
        kf('position', 0.42, [0, 7.5, 0], 'catmullrom'),
        kf('position', 0.72, [0, 0, 0], 'catmullrom'),
        kf('position', 1.0, [0, 0, 0]),
      ],
      [gArmR.uuid]: [
        kf('rotation', 0, [0, 0, -5]),
        kf('rotation', 0.22, [0, 0, -30], 'catmullrom'),
        kf('rotation', 0.42, [0, 0, -160], 'catmullrom'),
        kf('rotation', 0.72, [0, 0, -20], 'catmullrom'),
        kf('rotation', 1.0, [0, 0, -5]),
      ],
      [gArmL.uuid]: [
        kf('rotation', 0, [0, 0, 5]),
        kf('rotation', 0.22, [0, 0, 30], 'catmullrom'),
        kf('rotation', 0.42, [0, 0, 160], 'catmullrom'),
        kf('rotation', 0.72, [0, 0, 20], 'catmullrom'),
        kf('rotation', 1.0, [0, 0, 5]),
      ],
      [gLegR.uuid]: [
        kf('rotation', 0, [0, 0, 0]),
        kf('rotation', 0.22, [-18, 0, 0], 'catmullrom'),
        kf('rotation', 0.42, [22, 0, 0], 'catmullrom'),
        kf('rotation', 0.72, [-10, 0, 0], 'catmullrom'),
        kf('rotation', 1.0, [0, 0, 0]),
      ],
      [gLegL.uuid]: [
        kf('rotation', 0, [0, 0, 0]),
        kf('rotation', 0.22, [18, 0, 0], 'catmullrom'),
        kf('rotation', 0.42, [-14, 0, 0], 'catmullrom'),
        kf('rotation', 0.72, [8, 0, 0], 'catmullrom'),
        kf('rotation', 1.0, [0, 0, 0]),
      ],
    }),
    anim('point', 1.2, 'loop', {
      [gArmR.uuid]: [
        kf('rotation', 0, [0, 0, -6]),
        kf('rotation', 0.4, [-88, 0, -6], 'catmullrom'),
        kf('rotation', 0.8, [-84, 0, -6], 'catmullrom'),
        kf('rotation', 1.2, [0, 0, -6]),
      ],
      [gHead.uuid]: [kf('rotation', 0, [0, 0, 0]), kf('rotation', 0.4, [6, -12, 0], 'catmullrom'), kf('rotation', 1.2, [0, 0, 0])],
    }),
  ];

  return {
    meta: { format_version: '5.0', model_format: 'bedrock', box_uv: true },
    name: 'Steve',
    geometry_name: 'geometry.leafforge.steve',
    resolution: { width: 64, height: 64 },
    elements,
    groups,
    outliner,
    textures: [
      {
        uuid: uuid(),
        name: 'steve.png',
        id: '0',
        width: 64,
        height: 64,
        uv_width: 64,
        uv_height: 64,
        internal: true,
        source: buildSkin().toDataURL(),
        render_mode: 'default',
        visible: true,
      },
    ],
    animations,
  };
}

function buildOrientationCube() {
  // per-face UVs (v4.10 style with inline groups) -> exercises the other UV path
  const faces = {
    east: { uv: [0, 16, 16, 32], texture: 0 },
    west: { uv: [32, 16, 48, 32], texture: 0 },
    up: { uv: [32, 0, 48, 16], texture: 0 },
    down: { uv: [48, 0, 64, 16], texture: 0 },
    south: { uv: [48, 16, 64, 32], texture: 0 },
    north: { uv: [16, 16, 32, 32], texture: 0 },
  };
  const el = {
    name: 'cube',
    type: 'cube',
    uuid: uuid(),
    from: [-8, 0, -8],
    to: [8, 16, 8],
    origin: [0, 8, 0],
    rotation: [0, 0, 0],
    color: 2,
    visibility: true,
    box_uv: false,
    faces,
  };
  const gSpin = { name: 'spin', uuid: uuid(), origin: [0, 8, 0], rotation: [0, 0, 0], color: 1, visibility: true, export: true, children: [el.uuid] };
  const gBob = { name: 'bob', uuid: uuid(), origin: [0, 0, 0], rotation: [0, 0, 0], color: 0, visibility: true, export: true, children: [gSpin] };

  const animations = [
    {
      uuid: uuid(),
      name: 'spin',
      loop: 'loop',
      length: 3,
      animators: {
        [gSpin.uuid]: {
          name: 'spin',
          type: 'bone',
          keyframes: [kf('rotation', 0, [0, 0, 0]), kf('rotation', 3, [0, 360, 0])],
        },
      },
    },
    {
      uuid: uuid(),
      name: 'bounce',
      loop: 'loop',
      length: 1,
      animators: {
        [gBob.uuid]: {
          name: 'bob',
          type: 'bone',
          keyframes: [
            kf('position', 0, [0, 0, 0]),
            kf('position', 0.5, [0, 6, 0], 'catmullrom'),
            kf('position', 1, [0, 0, 0]),
          ],
        },
      },
    },
  ];

  return {
    meta: { format_version: '4.10', model_format: 'free', box_uv: false },
    name: 'Orientation Cube',
    resolution: { width: 64, height: 32 },
    elements: [el],
    outliner: [gBob],
    textures: [
      {
        uuid: uuid(),
        name: 'cube.png',
        id: '0',
        width: 64,
        height: 32,
        internal: true,
        source: buildCubeTexture().toDataURL(),
        visible: true,
      },
    ],
    animations,
  };
}

/* ------------------------------------------------------------------ */

mkdirSync(OUT, { recursive: true });
const steve = buildSteve();
const cubeModel = buildOrientationCube();
writeFileSync(resolve(OUT, 'steve.bbmodel'), JSON.stringify(steve));
writeFileSync(resolve(OUT, 'orientation-cube.bbmodel'), JSON.stringify(cubeModel));
console.log('wrote', resolve(OUT, 'steve.bbmodel'));
console.log('wrote', resolve(OUT, 'orientation-cube.bbmodel'));
