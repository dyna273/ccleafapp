/**
 * A compact GIF89a encoder: median-cut palette, cached nearest-colour lookup
 * and LZW compression. Enough for thumbnail-sized animated GIFs without
 * pulling in a dependency.
 */

interface Box {
  colors: number[]; // packed 0xRRGGBB
  rMin: number; rMax: number;
  gMin: number; gMax: number;
  bMin: number; bMax: number;
}

function packRGB(r: number, g: number, b: number) {
  return (r << 16) | (g << 8) | b;
}

function makeBox(list: number[]): Box {
  let rMin = 255, rMax = 0, gMin = 255, gMax = 0, bMin = 255, bMax = 0;
  for (const c of list) {
    const r = (c >> 16) & 0xff, g = (c >> 8) & 0xff, b = c & 0xff;
    if (r < rMin) rMin = r;
    if (r > rMax) rMax = r;
    if (g < gMin) gMin = g;
    if (g > gMax) gMax = g;
    if (b < bMin) bMin = b;
    if (b > bMax) bMax = b;
  }
  return { colors: list, rMin, rMax, gMin, gMax, bMin, bMax };
}

function splitBox(box: Box): [Box, Box] {
  const rRange = box.rMax - box.rMin;
  const gRange = box.gMax - box.gMin;
  const bRange = box.bMax - box.bMin;
  const channel = rRange >= gRange && rRange >= bRange ? 16 : gRange >= bRange ? 8 : 0;
  const sorted = box.colors.slice().sort((a, b) => ((a >> channel) & 0xff) - ((b >> channel) & 0xff));
  const mid = sorted.length >> 1;
  return [makeBox(sorted.slice(0, mid)), makeBox(sorted.slice(mid))];
}

function medianCut(sample: number[], maxColors: number): number[] {
  if (!sample.length) return [0, 0, 0];
  const initial: Box = { colors: sample, rMin: 0, rMax: 255, gMin: 0, gMax: 255, bMin: 0, bMax: 255 };
  let boxes: Box[] = [initial];
  while (boxes.length < maxColors) {
    boxes.sort((a, b) => b.colors.length * ((b.rMax - b.rMin) + (b.gMax - b.gMin) + (b.bMax - b.bMin)) - a.colors.length * ((a.rMax - a.rMin) + (a.gMax - a.gMin) + (a.bMax - a.bMin)));
    const target = boxes.find((b) => b.colors.length > 1);
    if (!target) break;
    boxes = boxes.filter((b) => b !== target);
    const [a, b] = splitBox(target);
    if (a.colors.length) boxes.push(a);
    if (b.colors.length) boxes.push(b);
  }
  return boxes.map((b) => {
    let rs = 0, gs = 0, bs = 0;
    for (const c of b.colors) {
      rs += (c >> 16) & 0xff;
      gs += (c >> 8) & 0xff;
      bs += c & 0xff;
    }
    const n = Math.max(1, b.colors.length);
    return packRGB(Math.round(rs / n), Math.round(gs / n), Math.round(bs / n));
  });
}

class ByteWriter {
  private buf: number[] = [];
  byte(b: number) { this.buf.push(b & 0xff); }
  bytes(list: number[]) { for (const b of list) this.byte(b); }
  short(v: number) { this.byte(v & 0xff); this.byte((v >> 8) & 0xff); }
  string(s: string) { for (let i = 0; i < s.length; i++) this.buf.push(s.charCodeAt(i) & 0xff); }
  get length() { return this.buf.length; }
  toUint8Array() { return new Uint8Array(this.buf); }
}

/** LZW compress an indexed pixel array into GIF sub-blocks. */
function lzwEncode(pixels: Uint8Array, minCodeSize: number): number[] {
  const CLEAR = 1 << minCodeSize;
  const END = CLEAR + 1;
  let codeSize = minCodeSize + 1;
  let nextCode = END + 1;

  const out: number[] = [];
  let cur = 0;
  let curBits = 0;
  let block: number[] = [];

  const flushBlock = () => {
    if (!block.length) return;
    out.push(block.length, ...block);
    block = [];
  };

  const emit = (code: number) => {
    cur |= code << curBits;
    curBits += codeSize;
    while (curBits >= 8) {
      block.push(cur & 0xff);
      cur >>= 8;
      curBits -= 8;
      if (block.length === 255) flushBlock();
    }
  };

  let dict = new Map<number, number>();
  const resetDict = () => {
    dict = new Map();
    codeSize = minCodeSize + 1;
    nextCode = END + 1;
  };

  emit(CLEAR);
  let prefix = pixels[0] ?? 0;
  for (let i = 1; i < pixels.length; i++) {
    const k = pixels[i];
    const key = prefix * 256 + k;
    const found = dict.get(key);
    if (found !== undefined) {
      prefix = found;
      continue;
    }
    emit(prefix);
    if (nextCode < 4096) {
      // Grow the code width *before* handing out a code that would not fit.
      // Growing one step later (the "early change" bug) desynchronises every
      // standard GIF decoder, which only learns about a new entry one code
      // after the encoder creates it.
      if (nextCode >= 1 << codeSize && codeSize < 12) codeSize++;
      dict.set(key, nextCode++);
    } else {
      emit(CLEAR);
      resetDict();
    }
    prefix = k;
  }
  emit(prefix);
  emit(END);
  if (curBits > 0) block.push(cur & 0xff);
  flushBlock();
  out.push(0x00);
  return out;
}

export interface GIFFrame {
  data: Uint8ClampedArray;
  delay: number; // hundredths of a second
}

export interface GIFOptions {
  width: number;
  height: number;
  loop?: number;
  maxColors?: number;
  transparentIndex?: number | null;
}

export function encodeGIF(frames: GIFFrame[], opts: GIFOptions): Uint8Array {
  const { width, height, maxColors = 256, loop = 0 } = opts;
  const w = new ByteWriter();

  // ---- sample colours for the global palette
  const sample: number[] = [];
  const step = Math.max(1, Math.floor((frames.length * width * height) / 60000));
  let counter = 0;
  for (const frame of frames) {
    for (let i = 0; i < frame.data.length; i += 4) {
      if (counter++ % step !== 0) continue;
      sample.push(packRGB(frame.data[i], frame.data[i + 1], frame.data[i + 2]));
    }
  }
  let palette = medianCut(sample, maxColors);
  while (palette.length < 256) palette.push(0);

  // ---- nearest-colour cache over a 15-bit (5:5:5) space
  const cache = new Int16Array(32768).fill(-1);
  const nearest = (r: number, g: number, b: number) => {
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const hit = cache[key];
    if (hit >= 0) return hit;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < palette.length; i++) {
      const pr = (palette[i] >> 16) & 0xff;
      const pg = (palette[i] >> 8) & 0xff;
      const pb = palette[i] & 0xff;
      const dr = pr - r, dg = pg - g, db = pb - b;
      const dist = dr * dr * 0.30 + dg * dg * 0.59 + db * db * 0.11;
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
        if (dist === 0) break;
      }
    }
    cache[key] = best;
    return best;
  };

  // ---- header
  w.string('GIF89a');
  w.short(width);
  w.short(height);
  w.byte(0xf7); // global colour table, 256 entries, 8 bits per channel
  w.byte(0); // background colour index
  w.byte(0); // pixel aspect ratio
  for (const c of palette) {
    w.byte((c >> 16) & 0xff);
    w.byte((c >> 8) & 0xff);
    w.byte(c & 0xff);
  }

  // ---- netscape looping extension
  w.byte(0x21);
  w.byte(0xff);
  w.byte(11);
  w.string('NETSCAPE2.0');
  w.byte(3);
  w.byte(1);
  w.short(loop);
  w.byte(0);

  // ---- frames
  const minCodeSize = 8;
  for (const frame of frames) {
    w.byte(0x21); // graphic control extension
    w.byte(0xf9);
    w.byte(4);
    w.byte(0x04); // disposal: restore to background
    w.short(frame.delay);
    w.byte(0);
    w.byte(0);

    const indexed = new Uint8Array(width * height);
    const px = frame.data;
    for (let i = 0, j = 0; i < px.length; i += 4, j++) {
      indexed[j] = nearest(px[i], px[i + 1], px[i + 2]);
    }

    w.byte(0x2c); // image descriptor
    w.short(0);
    w.short(0);
    w.short(width);
    w.short(height);
    w.byte(0);
    w.byte(minCodeSize);
    w.bytes(lzwEncode(indexed, minCodeSize));
  }

  w.byte(0x3b); // trailer
  return w.toUint8Array();
}

export async function recordGIF(
  renderFrame: (time: number, canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  opts: { width: number; height: number; duration: number; fps: number; onProgress?: (f: number) => void },
): Promise<Blob> {
  const { width, height, duration, fps, onProgress } = opts;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const frames: GIFFrame[] = [];
  const total = Math.max(1, Math.round(duration * fps));
  const delay = Math.max(2, Math.round(100 / fps));
  for (let i = 0; i < total; i++) {
    renderFrame(i / fps, canvas, ctx, width, height);
    const image = ctx.getImageData(0, 0, width, height);
    frames.push({ data: image.data, delay });
    onProgress?.((i + 1) / total);
    if (i % 4 === 3) await new Promise((r) => setTimeout(r, 0));
  }
  const bytes = encodeGIF(frames, { width, height });
  return new Blob([bytes as unknown as BlobPart], { type: 'image/gif' });
}
