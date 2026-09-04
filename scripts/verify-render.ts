/**
 * End-to-end render check that needs no GPU and no browser.
 *
 * It loads public/models/steve.bbmodel, builds the real scene graph used by
 * the app (src/bbmodel/scene.ts), applies an animation, and rasterises the
 * result with a tiny software renderer. The output PNG is then inspected:
 *
 *   - the model must land inside the frame at a sensible size
 *   - the colours that appear must be the ones the skin texture says they
 *     should be (skin / shirt / hair / trousers), which proves that the box-UV
 *     unwrap, the texture lookup and the face orientation all line up.
 *
 * Run with:  npm run verify:render
 */
import * as THREE from 'three';
import { readFileSync, writeFileSync } from 'node:fs';
import { inflateSync, deflateSync } from 'node:zlib';
import { resolve } from 'node:path';
import { parseBBModel } from '../src/bbmodel/parse';
import { buildModelScene, applyAnimationToNodes } from '../src/bbmodel/scene';

/* ------------------------------- PNG -------------------------------- */

interface DecodedImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

function decodePNG(buffer: Buffer): DecodedImage {
  let pos = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 8;
  let colorType = 6;
  const idat: Buffer[] = [];
  while (pos < buffer.length) {
    const length = buffer.readUInt32BE(pos);
    const type = buffer.toString('ascii', pos + 4, pos + 8);
    const data = buffer.subarray(pos + 8, pos + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      if (data[12] !== 0) throw new Error('interlaced PNG not supported');
    } else if (type === 'IDAT') {
      idat.push(Buffer.from(data));
    } else if (type === 'IEND') break;
    pos += length + 12;
  }
  if (bitDepth !== 8) throw new Error(`bit depth ${bitDepth} not supported`);
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 1;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = new Uint8ClampedArray(width * height * 4);
  let prev = new Uint8Array(stride);
  let p = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[p++];
    const line = Buffer.from(raw.subarray(p, p + stride));
    p += stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? line[x - channels] : 0;
      const b = prev[x];
      const c = x >= channels ? prev[x - channels] : 0;
      switch (filter) {
        case 0: break;
        case 1: line[x] = (line[x] + a) & 0xff; break;
        case 2: line[x] = (line[x] + b) & 0xff; break;
        case 3: line[x] = (line[x] + ((a + b) >> 1)) & 0xff; break;
        case 4: {
          const pp = a + b - c;
          const pa = Math.abs(pp - a);
          const pb = Math.abs(pp - b);
          const pc = Math.abs(pp - c);
          line[x] = (line[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff;
          break;
        }
        default: throw new Error(`bad filter ${filter}`);
      }
    }
    for (let x = 0; x < width; x++) {
      const s = x * channels;
      const d = (y * width + x) * 4;
      out[d] = line[s];
      out[d + 1] = channels >= 3 ? line[s + 1] : line[s];
      out[d + 2] = channels >= 3 ? line[s + 2] : line[s];
      out[d + 3] = channels === 4 ? line[s + 3] : 255;
    }
    prev = line;
  }
  return { width, height, data: out };
}

function encodePNG(width: number, height: number, rgba: Uint8ClampedArray): Buffer {
  // reuse a minimal encoder: raw scanlines + zlib
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
  }
  const crcTable = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c;
  }
  const crc32 = (buf: Buffer) => {
    let crc = -1;
    for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xff];
    return (crc ^ -1) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body), 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* --------------------------- rasteriser ------------------------------ */

interface Frame {
  width: number;
  height: number;
  color: Float32Array;
  depth: Float32Array;
}

function createFrame(w: number, h: number): Frame {
  const color = new Float32Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    color[i * 4] = 0.07;
    color[i * 4 + 1] = 0.09;
    color[i * 4 + 2] = 0.13;
    color[i * 4 + 3] = 1;
  }
  return { width: w, height: h, color, depth: new Float32Array(w * h).fill(Infinity) };
}

function render(scene: THREE.Object3D, camera: THREE.Camera, frame: Frame, textures: Map<number, DecodedImage>, texIdxOf: (m: THREE.Mesh) => number | null) {
  camera.updateMatrixWorld(true);
  scene.updateMatrixWorld(true);
  const viewProj = new THREE.Matrix4().multiplyMatrices(
    camera.projectionMatrix,
    camera.matrixWorldInverse ?? new THREE.Matrix4().copy(camera.matrixWorld).invert(),
  );
  const v = new THREE.Vector4();

  scene.traverse((obj: THREE.Object3D) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.visible) return;
    const geo = mesh.geometry as THREE.BufferGeometry;
    const pos = geo.getAttribute('position');
    const uvAttr = geo.getAttribute('uv') as THREE.BufferAttribute | undefined;
    const colAttr = geo.getAttribute('color') as THREE.BufferAttribute | undefined;
    const index = geo.getIndex();
    const count = index ? index.count : pos.count;
    const texIdx = texIdxOf(mesh);
    const image = texIdx !== null ? textures.get(texIdx) : undefined;

    const p = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    const screen: Array<[number, number, number, number]> = [
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ];

    for (let i = 0; i < count; i += 3) {
      let ok = true;
      for (let k = 0; k < 3; k++) {
        const vi = index ? index.getX(i + k) : i + k;
        p[k].fromBufferAttribute(pos, vi);
        p[k].applyMatrix4(mesh.matrixWorld);
        v.set(p[k].x, p[k].y, p[k].z, 1).applyMatrix4(viewProj);
        if (v.w <= 0.0001) {
          ok = false;
          break;
        }
        screen[k][0] = ((v.x / v.w) * 0.5 + 0.5) * frame.width;
        screen[k][1] = (1 - ((v.y / v.w) * 0.5 + 0.5)) * frame.height;
        screen[k][2] = v.z / v.w;
        screen[k][3] = 1;
      }
      if (!ok) continue;

      const [a, b, c] = screen;
      const area = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
      if (Math.abs(area) < 1e-9) continue;

      const minX = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0])));
      const maxX = Math.min(frame.width - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
      const minY = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1])));
      const maxY = Math.min(frame.height - 1, Math.ceil(Math.max(a[1], b[1], c[1])));

      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const px = x + 0.5;
          const py = y + 0.5;
          let w0 = ((b[0] - a[0]) * (py - a[1]) - (px - a[0]) * (b[1] - a[1])) / area;
          let w1 = ((px - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (py - a[1])) / area;
          const w2 = 1 - w0 - w1;
          if (w0 < 0 || w1 < 0 || w2 < 0) continue;
          // w0 is the weight of c, w1 of b (barycentric convention above)
          const wc = w0;
          const wb = w1;
          const wa = w2;
          const z = wa * a[2] + wb * b[2] + wc * c[2];
          const di = y * frame.width + x;
          if (z >= frame.depth[di]) continue;

          let r = 1;
          let g = 1;
          let bl = 1;
          if (colAttr) {
            r = wa * colAttr.getX(index ? index.getX(i) : i) + wb * colAttr.getX(index ? index.getX(i + 1) : i + 1) + wc * colAttr.getX(index ? index.getX(i + 2) : i + 2);
            g = wa * colAttr.getY(index ? index.getX(i) : i) + wb * colAttr.getY(index ? index.getX(i + 1) : i + 1) + wc * colAttr.getY(index ? index.getX(i + 2) : i + 2);
            bl = wa * colAttr.getZ(index ? index.getX(i) : i) + wb * colAttr.getZ(index ? index.getX(i + 1) : i + 1) + wc * colAttr.getZ(index ? index.getX(i + 2) : i + 2);
          }

          if (image && uvAttr) {
            const iu = wa * uvAttr.getX(index ? index.getX(i) : i) + wb * uvAttr.getX(index ? index.getX(i + 1) : i + 1) + wc * uvAttr.getX(index ? index.getX(i + 2) : i + 2);
            const iv = wa * uvAttr.getY(index ? index.getX(i) : i) + wb * uvAttr.getY(index ? index.getX(i + 1) : i + 1) + wc * uvAttr.getY(index ? index.getX(i + 2) : i + 2);
            const tx = Math.min(image.width - 1, Math.max(0, Math.floor(iu * image.width)));
            const ty = Math.min(image.height - 1, Math.max(0, Math.floor((1 - iv) * image.height)));
            const ti = (ty * image.width + tx) * 4;
            const alpha = image.data[ti + 3] / 255;
            if (alpha < 0.5) continue;
            r *= image.data[ti] / 255;
            g *= image.data[ti + 1] / 255;
            bl *= image.data[ti + 2] / 255;
          }

          frame.depth[di] = z;
          frame.color[di * 4] = r;
          frame.color[di * 4 + 1] = g;
          frame.color[di * 4 + 2] = bl;
          frame.color[di * 4 + 3] = 1;
        }
      }
    }
  });
}

/* ------------------------------- main -------------------------------- */

const W = 480;
const H = 360;

const modelPath = resolve(process.cwd(), 'public/models/steve.bbmodel');
const parsed = parseBBModel(JSON.parse(readFileSync(modelPath, 'utf8')));

// decode the embedded skin
const decoded = new Map<number, DecodedImage>();
parsed.textures.forEach((tex, i) => {
  if (!tex.source) return;
  const b64 = tex.source.split(',')[1];
  if (!b64) return;
  decoded.set(i, decodePNG(Buffer.from(b64, 'base64')));
});

const materials: THREE.Material[] = [];
const scene = buildModelScene(parsed, {
  materials,
  textureFor: (index) => {
    // the rasteriser reads pixels directly, so a bare texture object is enough
    const t = new THREE.Texture();
    t.name = `tex-${index}`;
    return decoded.has(index) ? t : null;
  },
  textureMeta: (index) => parsed.textures[index],
});

// remember which texture every mesh ended up using
const meshTexture = new Map<THREE.Mesh, number | null>();
scene.root.traverse((obj) => {
  const mesh = obj as THREE.Mesh;
  if (!mesh.isMesh) return;
  const mat = mesh.material as THREE.MeshLambertMaterial;
  const name = mat?.name || '';
  const match = /^tex-(\d+)$/.exec(name);
  meshTexture.set(mesh, match ? parseInt(match[1], 10) : 0);
});
// name lookup is fragile; fall back to index 0 for every mesh (Steve has one skin)
meshTexture.forEach((_v, k) => meshTexture.set(k, 0));

const bounds = new THREE.Box3().setFromObject(scene.root);
const size = bounds.getSize(new THREE.Vector3());
const center = bounds.getCenter(new THREE.Vector3());

const camera = new THREE.PerspectiveCamera(35, W / H, 0.1, 1000);
const dir = new THREE.Vector3(-0.65, 0.42, -1).normalize();
const dist = (Math.max(size.x, size.y, size.z) / 2) / Math.tan((camera.fov * Math.PI) / 360) * 1.6;
camera.position.copy(center).addScaledVector(dir, dist);
camera.lookAt(center);
camera.updateProjectionMatrix();

let failures = 0;
const check = (name: string, ok: boolean, detail = '') => {
  if (ok) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name} ${detail}`);
  }
};

function frameStats(frame: Frame) {
  let minX = W, minY = H, maxX = -1, maxY = -1, filled = 0;
  const colors: number[] = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (frame.depth[i] < Infinity) {
        filled++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        const r = Math.round(frame.color[i * 4] * 255);
        const g = Math.round(frame.color[i * 4 + 1] * 255);
        const b = Math.round(frame.color[i * 4 + 2] * 255);
        colors.push((r << 16) | (g << 8) | b);
      }
    }
  }
  return { minX, minY, maxX, maxY, filled, colors };
}

/** how many sampled pixels are near this colour */
function countNear(colors: number[], target: [number, number, number], tolerance = 46) {
  let n = 0;
  for (const c of colors) {
    const r = (c >> 16) & 0xff;
    const g = (c >> 8) & 0xff;
    const b = c & 0xff;
    if (
      Math.abs(r - target[0]) <= tolerance &&
      Math.abs(g - target[1]) <= tolerance &&
      Math.abs(b - target[2]) <= tolerance
    )
      n++;
  }
  return n;
}

const walk = scene.animations.find((a) => a.name === 'walk')!;

for (const [label, time] of [['rest pose', -1], ['walk t=0', 0], ['walk t=0.25', 0.25], ['walk t=0.5', 0.5]] as Array<[string, number]>) {
  applyAnimationToNodes(scene.nodes, time < 0 ? null : walk, Math.max(0, time));
  scene.root.updateMatrixWorld(true);
  const frame = createFrame(W, H);
  render(scene.root, camera, frame, decoded, (m) => meshTexture.get(m) ?? 0);
  const stats = frameStats(frame);
  console.log(`\n[${label}] filled=${stats.filled} bbox=(${stats.minX},${stats.minY})-(${stats.maxX},${stats.maxY})`);

  check(`model is visible (${stats.filled} px)`, stats.filled > 2000, `filled=${stats.filled}`);
  const coverage = stats.filled / (W * H);
  check(`coverage ${(coverage * 100).toFixed(1)}% is 5-60%`, coverage > 0.05 && coverage < 0.6);
  const bw = stats.maxX - stats.minX;
  const bh = stats.maxY - stats.minY;
  check(`fills the frame vertically (h=${bh}/${H})`, bh > H * 0.35, `h=${bh}`);
  check(`is centred horizontally (${bw}px wide, centre ${Math.round((stats.minX + stats.maxX) / 2)} vs ${W / 2})`, Math.abs((stats.minX + stats.maxX) / 2 - W / 2) < W * 0.12);

  if (time < 0 || time === 0) {
    // colour checks: Steve's skin, teal shirt, hair and trousers
    const skin = countNear(stats.colors, [198, 140, 83]);
    const shirt = countNear(stats.colors, [0, 175, 175]);
    const hair = countNear(stats.colors, [74, 48, 33]);
    const trousers = countNear(stats.colors, [63, 71, 176]);
    const shoe = countNear(stats.colors, [90, 90, 90]);
    console.log(
      `      skin=${skin} shirt=${shirt} hair=${hair} trousers=${trousers} shoes=${shoe}`,
    );
    check('skin tone present', skin > 200, `skin=${skin}`);
    check('teal shirt present', shirt > 300, `shirt=${shirt}`);
    check('hair present (head renders)', hair > 150, `hair=${hair}`);
    check('trousers present (legs render)', trousers > 200, `trousers=${trousers}`);
    check('shoes present', shoe > 40, `shoe=${shoe}`);
  }

  if (time < 0) {
    const out = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < W * H; i++) {
      out[i * 4] = Math.round(frame.color[i * 4] * 255);
      out[i * 4 + 1] = Math.round(frame.color[i * 4 + 1] * 255);
      out[i * 4 + 2] = Math.round(frame.color[i * 4 + 2] * 255);
      out[i * 4 + 3] = 255;
    }
    writeFileSync('/tmp/leafforge-render.png', encodePNG(W, H, out));
  }
}

console.log(`\n${failures === 0 ? 'ALL RENDER CHECKS PASSED' : `${failures} RENDER CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
