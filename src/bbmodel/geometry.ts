import * as THREE from 'three';
import type { BBCube, BBMesh, FaceName, UV, Vec3 } from './types';
import { FACE_ORDER } from './types';

/**
 * Minecraft-style per-face brightness, baked into vertex colors so models keep
 * the flat, blocky look no matter where the camera is.
 */
const FACE_BRIGHTNESS: Record<FaceName, number> = {
  up: 1.0,
  north: 0.8,
  south: 0.8,
  east: 0.62,
  west: 0.62,
  down: 0.5,
};

/**
 * The four corners of every face, in the order three.js' BoxGeometry emits them
 * (which is also the order Blockbench writes UVs in).
 *
 * index 0 -> (u1, v1)   index 1 -> (u2, v1)
 * index 2 -> (u1, v2)   index 3 -> (u2, v2)
 *
 * Blockbench's `Canvas.face_order` is ['east','west','up','down','south','north'],
 * which is exactly BoxGeometry's [+X, -X, +Y, -Y, +Z, -Z].
 */
type Corner = 'x' | 'y' | 'z';
const FACE_CORNERS: Record<FaceName, { axis: Corner; side: 0 | 1; u: Corner; uDir: 1 | -1; v: Corner; vDir: 1 | -1 }> = {
  east: { axis: 'x', side: 1, u: 'z', uDir: -1, v: 'y', vDir: -1 },
  west: { axis: 'x', side: 0, u: 'z', uDir: 1, v: 'y', vDir: -1 },
  up: { axis: 'y', side: 1, u: 'x', uDir: 1, v: 'z', vDir: 1 },
  down: { axis: 'y', side: 0, u: 'x', uDir: 1, v: 'z', vDir: -1 },
  south: { axis: 'z', side: 1, u: 'x', uDir: 1, v: 'y', vDir: -1 },
  north: { axis: 'z', side: 0, u: 'x', uDir: -1, v: 'y', vDir: -1 },
};

/** Fan triangulation matching BoxGeometry's winding for a 1x1 plane. */
const QUAD_INDICES = [0, 2, 1, 2, 3, 1];

export interface GeometryBuildContext {
  resolution: { width: number; height: number };
  boxUV: boolean;
  /** default texture index used when a face has no explicit texture */
  defaultTexture: number | null;
}

export interface BuiltGeometry {
  geometry: THREE.BufferGeometry;
  textureIndex: number | null;
}

/* ------------------------------------------------------------------ */
/*  Box UV                                                              */
/* ------------------------------------------------------------------ */

/**
 * Reproduces Blockbench's box UV template (`Cube.updateUV`).
 * `size` is [width, height, depth] in model units, which in UV space equals
 * texture pixels. `from` is the top-left of the rect and `size` may be
 * negative, which flips the rect on that axis.
 */
function boxUVForFace(face: FaceName, size: [number, number, number], uvOffset: [number, number]): UV {
  const [w, h, d] = size;
  let from: [number, number];
  let sz: [number, number];
  switch (face) {
    case 'east':
      from = [0, d];
      sz = [d, h];
      break;
    case 'west':
      from = [d + w, d];
      sz = [d, h];
      break;
    case 'up':
      from = [d + w, d];
      sz = [-w, -d];
      break;
    case 'down':
      from = [d + w * 2, 0];
      sz = [-w, d];
      break;
    case 'south':
      from = [d * 2 + w, d];
      sz = [w, h];
      break;
    case 'north':
    default:
      from = [d, d];
      sz = [w, h];
      break;
  }
  return [
    from[0] + uvOffset[0],
    from[1] + uvOffset[1],
    from[0] + sz[0] + uvOffset[0],
    from[1] + sz[1] + uvOffset[1],
  ];
}

/** Optional 90-degree face texture rotation, applied in normalised rect space. */
function rotateRect(uv: UV, rotation: number): UV {
  const steps = ((Math.round(rotation / 90) % 4) + 4) % 4;
  if (!steps) return uv;
  let [x1, y1, x2, y2] = uv;
  // Rotate the rect by swapping extents; this keeps the sampled area identical
  // for square rects and stays sensible for rectangular ones.
  for (let i = 0; i < steps; i++) {
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;
    const hw = (x2 - x1) / 2;
    const hh = (y2 - y1) / 2;
    x1 = cx + hh;
    x2 = cx - hh;
    y1 = cy - hw;
    y2 = cy + hw;
  }
  return [x1, y1, x2, y2];
}

/* ------------------------------------------------------------------ */
/*  Cube                                                                */
/* ------------------------------------------------------------------ */

function pushQuad(
  positions: number[],
  uvs: number[],
  colors: number[],
  indices: number[],
  corners: Vec3[],
  uv: UV,
  res: { width: number; height: number },
  brightness: number,
) {
  const base = positions.length / 3;
  // corner order: 0 -> (u1,v1), 1 -> (u2,v1), 2 -> (u1,v2), 3 -> (u2,v2)
  const cornerUV: Array<[number, number]> = [
    [uv[0], uv[1]],
    [uv[2], uv[1]],
    [uv[0], uv[3]],
    [uv[2], uv[3]],
  ];
  for (let i = 0; i < 4; i++) {
    const c = corners[i];
    positions.push(c[0], c[1], c[2]);
    uvs.push(cornerUV[i][0] / res.width, 1 - cornerUV[i][1] / res.height);
    colors.push(brightness, brightness, brightness);
  }
  for (const idx of QUAD_INDICES) indices.push(base + idx);
}

export function buildCubeGeometries(cube: BBCube, ctx: GeometryBuildContext): BuiltGeometry[] {
  const res = ctx.resolution;
  const from = cube.from;
  const to = cube.to;
  const inflate = cube.inflate || 0;
  const stretch = cube.stretch && cube.stretch.some((v) => v) ? cube.stretch : null;

  const f: Vec3 = [from[0], from[1], from[2]];
  const t: Vec3 = [to[0], to[1], to[2]];
  if (inflate) {
    for (let i = 0; i < 3; i++) {
      f[i] -= inflate;
      t[i] += inflate;
    }
  }
  if (stretch) {
    // Blockbench stretch moves the FROM corner outwards on negative axes only
    for (let i = 0; i < 3; i++) f[i] -= stretch[i];
  }

  const size: [number, number, number] = [t[0] - f[0], t[1] - f[1], t[2] - f[2]];
  const useBoxUV = cube.box_uv !== undefined ? !!cube.box_uv : ctx.boxUV;
  const uvOffset: [number, number] = cube.uv_offset ? [cube.uv_offset[0], cube.uv_offset[1]] : [0, 0];

  // group faces by texture so each mesh needs only one material
  const byTexture = new Map<number | null, { pos: number[]; uv: number[]; col: number[]; idx: number[] }>();

  for (const faceName of FACE_ORDER) {
    const face = cube.faces?.[faceName];
    if (!face) continue;
    const texIdx = face.texture === undefined ? ctx.defaultTexture : face.texture;
    if (texIdx === null || texIdx === undefined) continue;

    // Prefer the rect stored in the file; fall back to the box UV template.
    let uv: UV;
    if (face.uv && face.uv.length === 4) {
      uv = face.uv.slice() as UV;
    } else {
      uv = boxUVForFace(faceName, size, uvOffset);
      if (cube.mirror_uv && !useBoxUV) {
        uv = [uv[2], uv[1], uv[0], uv[3]];
      }
      if (useBoxUV && cube.mirror_uv) {
        // box UV mirroring already handled inside the template swap
        uv = boxUVForFace(faceName, size, uvOffset);
      }
    }
    if (face.rotation) uv = rotateRect(uv, face.rotation);

    const spec = FACE_CORNERS[faceName];
    const axisIndex = spec.axis === 'x' ? 0 : spec.axis === 'y' ? 1 : 2;
    const uIndex = spec.u === 'x' ? 0 : spec.u === 'y' ? 1 : 2;
    const vIndex = spec.v === 'x' ? 0 : spec.v === 'y' ? 1 : 2;
    const fixed = spec.side === 1 ? t[axisIndex] : f[axisIndex];

    // BoxGeometry vertex order: (ix,iy) = (0,0),(1,0),(0,1),(1,1) where the
    // sampled corner resolves to the high coordinate when the direction is -1.
    const corners: Vec3[] = [];
    for (const [ix, iy] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ] as Array<[number, number]>) {
      const p: Vec3 = [0, 0, 0];
      p[axisIndex] = fixed;
      p[uIndex] = spec.uDir === -1 ? (ix === 0 ? t[uIndex] : f[uIndex]) : ix === 0 ? f[uIndex] : t[uIndex];
      p[vIndex] = spec.vDir === -1 ? (iy === 0 ? t[vIndex] : f[vIndex]) : iy === 0 ? f[vIndex] : t[vIndex];
      corners.push(p);
    }

    let bucket = byTexture.get(texIdx);
    if (!bucket) {
      bucket = { pos: [], uv: [], col: [], idx: [] };
      byTexture.set(texIdx, bucket);
    }
    pushQuad(bucket.pos, bucket.uv, bucket.col, bucket.idx, corners, uv, res, FACE_BRIGHTNESS[faceName]);
  }

  const out: BuiltGeometry[] = [];
  for (const [texIdx, bucket] of byTexture) {
    if (!bucket.idx.length) continue;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(bucket.pos, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(bucket.uv, 2));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(bucket.col, 3));
    geometry.setIndex(bucket.idx);
    geometry.computeVertexNormals();
    out.push({ geometry, textureIndex: texIdx });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  Mesh (freeform)                                                     */
/* ------------------------------------------------------------------ */

export function buildMeshGeometries(mesh: BBMesh, ctx: GeometryBuildContext): BuiltGeometry[] {
  const res = ctx.resolution;
  const byTexture = new Map<number | null, { pos: number[]; uv: number[]; col: number[] }>();
  const verts = mesh.vertices || {};

  for (const key in mesh.faces || {}) {
    const face = mesh.faces[key];
    if (!face || !face.vertices || face.vertices.length < 3) continue;
    const texIdx = face.texture === undefined || face.texture === null ? ctx.defaultTexture : face.texture;
    if (texIdx === null || texIdx === undefined) continue;
    let bucket = byTexture.get(texIdx);
    if (!bucket) {
      bucket = { pos: [], uv: [], col: [] };
      byTexture.set(texIdx, bucket);
    }
    const positions: Vec3[] = [];
    const uvs: Array<[number, number]> = [];
    for (const vKey of face.vertices) {
      const v = verts[vKey];
      if (!v) continue;
      positions.push(v);
      const uv = face.uv?.[vKey];
      uvs.push(uv ? [uv[0] / res.width, 1 - uv[1] / res.height] : [0, 0]);
    }
    // fan triangulation
    for (let i = 1; i + 1 < positions.length; i++) {
      const tri = [0, i, i + 1];
      for (const ti of tri) {
        bucket.pos.push(positions[ti][0], positions[ti][1], positions[ti][2]);
        bucket.uv.push(uvs[ti][0], uvs[ti][1]);
        bucket.col.push(1, 1, 1);
      }
    }
  }

  const out: BuiltGeometry[] = [];
  for (const [texIdx, bucket] of byTexture) {
    if (!bucket.pos.length) continue;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(bucket.pos, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(bucket.uv, 2));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(bucket.col, 3));
    geometry.computeVertexNormals();
    out.push({ geometry, textureIndex: texIdx });
  }
  return out;
}
