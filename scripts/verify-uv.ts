/**
 * Verifies the Blockbench -> three.js geometry/UV pipeline against the
 * conventions we derived from Blockbench's own source:
 *
 *   - face directions:  north = -Z, south = +Z, east = +X, west = -X, up = +Y, down = -Y
 *   - vertex order:     (u1,v1), (u2,v1), (u1,v2), (u2,v2)  [BoxGeometry / Canvas.face_order]
 *   - box UV template:  js/outliner/types/cube.js -> Cube.updateUV
 *   - UV normalisation: u / texture_width, v = 1 - v / texture_height
 *
 * Run: npm run verify:uv
 */
import { buildCubeGeometries } from '../src/bbmodel/geometry';
import type { BBCube, FaceName, UV } from '../src/bbmodel/types';
import { FACE_ORDER } from '../src/bbmodel/types';
import { parseBBModel } from '../src/bbmodel/parse';
import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
const MODELS = resolvePath(process.cwd(), 'public/models');

let failures = 0;
function check(name: string, condition: boolean, detail = '') {
  if (condition) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.log(`  FAIL ${name} ${detail}`);
  }
}

/* ------------------------------------------------------------------ */
/*  1. Per-face UV: every corner of every face samples the quadrant     */
/*     we drew for it.                                                  */
/* ------------------------------------------------------------------ */

// A 4x4 texture per face laid out as 2x2 face rects:
//   TL = (0,0) red, TR = (2,0) green, BL = (0,2) blue, BR = (2,2) yellow
const TEX_W = 4;
const TEX_H = 4;
// We only need the *mapping*, so we assert on UV coordinates directly and use
// a synthetic colour lookup to make the intent obvious.
const QUADRANTS: Record<string, string> = {
  '0,0': 'red',
  '1,0': 'green',
  '0,1': 'blue',
  '1,1': 'yellow',
};

function uvToQuadrant(u: number, v: number, rect: UV): string {
  // Where does this UV land inside the face's own texture rectangle?
  const px = u * TEX_W;
  const py = (1 - v) * TEX_H;
  const lu = (px - Math.min(rect[0], rect[2])) / (rect[2] - rect[0]);
  const lv = (py - Math.min(rect[1], rect[3])) / (rect[3] - rect[1]);
  const qx = lu >= 0.5 ? 1 : 0;
  const qy = lv >= 0.5 ? 1 : 0;
  return QUADRANTS[`${qx},${qy}`];
}

/** Our documented expectation: which 3D corner each texture quadrant lands on. */
const EXPECTED: Record<FaceName, { axis: 0 | 1 | 2; side: 0 | 1; corners: string[] }> = {
  // corners are listed in vertex order: 0 -> TL, 1 -> TR, 2 -> BL, 3 -> BR
  east: { axis: 0, side: 1, corners: ['+y+z', '+y-z', '-y+z', '-y-z'] },
  west: { axis: 0, side: 0, corners: ['+y-z', '+y+z', '-y-z', '-y+z'] },
  up: { axis: 1, side: 1, corners: ['-x-z', '+x-z', '-x+z', '+x+z'] },
  down: { axis: 1, side: 0, corners: ['-x+z', '+x+z', '-x-z', '+x-z'] },
  south: { axis: 2, side: 1, corners: ['-x+y', '+x+y', '-x-y', '+x-y'] },
  north: { axis: 2, side: 0, corners: ['+x+y', '-x+y', '+x-y', '-x-y'] },
};

function cornerName(p: [number, number, number], face: FaceName) {
  const spec = EXPECTED[face];
  const from: [number, number, number] = [0, 16, 0];
  const to: [number, number, number] = [16, 32, 16];
  const parts: string[] = [];
  for (let i = 0; i < 3; i++) {
    if (i === spec.axis) continue;
    parts.push(p[i] === from[i] ? `-${'xyz'[i]}` : `+${'xyz'[i]}`);
  }
  return parts.join('');
}

function makeCube(from: [number, number, number], to: [number, number, number], uvOf: (f: FaceName) => UV): BBCube {
  const faces: any = {};
  for (const f of FACE_ORDER) faces[f] = { uv: uvOf(f), texture: 0 };
  return {
    name: 'test',
    type: 'cube',
    uuid: 'test-uuid',
    from,
    to,
    origin: [0, 0, 0],
    rotation: [0, 0, 0],
    box_uv: false,
    faces,
  };
}

console.log('\n[1] per-face UV corner mapping');
{
  // each face owns a distinct 2x2 block of the 4x4 texture
  const rects: Record<FaceName, UV> = {
    east: [0, 0, 2, 2],
    west: [2, 0, 4, 2],
    up: [0, 2, 2, 4],
    down: [2, 2, 4, 2 + 2],
    south: [0, 0, 2, 2],
    north: [2, 0, 4, 2],
  };
  const cube = makeCube([0, 16, 0], [16, 32, 16], (f) => rects[f]);
  const built = buildCubeGeometries(cube, {
    resolution: { width: TEX_W, height: TEX_H },
    boxUV: false,
    defaultTexture: 0,
  });
  check('produced one geometry', built.length === 1, `got ${built.length}`);
  const geo = built[0].geometry;
  const pos = geo.getAttribute('position');
  const uv = geo.getAttribute('uv');
  check('24 vertices (6 faces x 4)', pos.count === 24, `got ${pos.count}`);

  for (let f = 0; f < FACE_ORDER.length; f++) {
    const face = FACE_ORDER[f];
    const spec = EXPECTED[face];
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      const p: [number, number, number] = [pos.getX(i), pos.getY(i), pos.getZ(i)];
      const actualCorner = cornerName(p, face);
      const expectedCorner = spec.corners[v];
      // fixed axis check
      const fixedOk = spec.side === 1 ? p[spec.axis] === [0, 16, 0][spec.axis] || p[spec.axis] === [16, 32, 16][spec.axis] : true;
      check(
        `${face} v${v}: corner ${actualCorner} == ${expectedCorner}`,
        actualCorner === expectedCorner && fixedOk,
        `pos=${p.join(',')}`,
      );
      // quadrant check: TL->red TR->green BL->blue BR->yellow
      const u = uv.getX(i);
      const vv = uv.getY(i);
      const quad = uvToQuadrant(u, vv, rects[face]);
      const expectedQuad = ['red', 'green', 'blue', 'yellow'][v];
      check(
        `${face} v${v}: uv quadrant ${quad} == ${expectedQuad}`,
        quad === expectedQuad,
        `u=${u.toFixed(3)} v=${vv.toFixed(3)}`,
      );
    }
  }
}

/* ------------------------------------------------------------------ */
/*  2. Normal of every face points outward                              */
/* ------------------------------------------------------------------ */
console.log('\n[2] face normals');
{
  const cube = makeCube([0, 0, 0], [16, 16, 16], (f) => {
    void f;
    return [0, 0, 2, 2] as UV;
  });
  const built = buildCubeGeometries(cube, {
    resolution: { width: 4, height: 4 },
    boxUV: false,
    defaultTexture: 0,
  });
  const geo = built[0].geometry;
  const idx = geo.getIndex()!;
  const pos = geo.getAttribute('position');
  const normals: Record<string, [number, number, number]> = {
    east: [1, 0, 0],
    west: [-1, 0, 0],
    up: [0, 1, 0],
    down: [0, -1, 0],
    south: [0, 0, 1],
    north: [0, 0, -1],
  };
  for (let f = 0; f < FACE_ORDER.length; f++) {
    const face = FACE_ORDER[f];
    const a = idx.getX(f * 6);
    const b = idx.getX(f * 6 + 1);
    const c = idx.getX(f * 6 + 2);
    const p0 = [pos.getX(a), pos.getY(a), pos.getZ(a)];
    const p1 = [pos.getX(b), pos.getY(b), pos.getZ(b)];
    const p2 = [pos.getX(c), pos.getY(c), pos.getZ(c)];
    const uu = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
    const vv = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
    const n = [
      uu[1] * vv[2] - uu[2] * vv[1],
      uu[2] * vv[0] - uu[0] * vv[2],
      uu[0] * vv[1] - uu[1] * vv[0],
    ];
    const len = Math.hypot(n[0], n[1], n[2]) || 1;
    const nn = n.map((x) => x / len);
    const want = normals[face];
    const ok = Math.abs(nn[0] - want[0]) < 0.01 && Math.abs(nn[1] - want[1]) < 0.01 && Math.abs(nn[2] - want[2]) < 0.01;
    check(`${face} normal outward (${nn.map((x) => x.toFixed(2)).join(',')})`, ok);
  }
}

/* ------------------------------------------------------------------ */
/*  3. Box UV template reproduces the standard Minecraft skin layout     */
/* ------------------------------------------------------------------ */
console.log('\n[3] box UV template vs Minecraft skin layout');
{
  const model = parseBBModel(JSON.parse(readFileSync(resolvePath(MODELS, 'steve.bbmodel'), 'utf8')));
  check('steve parsed', !!model);
  check('box_uv enabled', model.boxUV);
  check('6 elements', model.elements.length === 6, `got ${model.elements.length}`);

  const layout: Record<string, Record<string, UV>> = {
    // standard 64x64 skin rectangles, as documented by the Minecraft Wiki
    head: {
      north: [8, 8, 16, 16],
      south: [24, 8, 32, 16],
      east: [0, 8, 8, 16],
      west: [16, 8, 24, 16],
      up: [8, 0, 16, 8],
      down: [16, 0, 24, 8],
    },
    body: {
      north: [20, 20, 28, 32],
      south: [32, 20, 40, 32],
      east: [16, 20, 20, 32],
      west: [28, 20, 32, 32],
      up: [20, 16, 28, 20],
      down: [28, 16, 36, 20],
    },
    rightArm: {
      north: [44, 20, 48, 32],
      south: [52, 20, 56, 32],
      east: [40, 20, 44, 32],
      west: [48, 20, 52, 32],
      up: [44, 16, 48, 20],
      down: [48, 16, 52, 20],
    },
  };

  for (const name of Object.keys(layout)) {
    const el = model.elements.find((e) => e.name === name) as any;
    check(`element ${name} exists`, !!el);
    if (!el) continue;
    const cube = el as BBCube;
    const built = buildCubeGeometries(cube, {
      resolution: model.resolution,
      boxUV: true,
      defaultTexture: 0,
    });
    const geo = built[0].geometry;
    const uv = geo.getAttribute('uv');
    const res = model.resolution;
    for (const face of FACE_ORDER) {
      const fi = FACE_ORDER.indexOf(face);
      // vertex 0 = (u1,v1), vertex 1 = (u2,v1), vertex 2 = (u1,v2), vertex 3 = (u2,v2)
      const u1 = uv.getX(fi * 4 + 0) * res.width;
      const u2 = uv.getX(fi * 4 + 1) * res.width;
      const v1 = (1 - uv.getY(fi * 4 + 0)) * res.height;
      const v2 = (1 - uv.getY(fi * 4 + 2)) * res.height;
      const got: UV = [
        Math.min(u1, u2),
        Math.min(v1, v2),
        Math.max(u1, u2),
        Math.max(v1, v2),
      ];
      const want = layout[name][face];
      const ok = got.every((val, i) => Math.abs(val - want[i]) < 0.001);
      check(`${name}.${face} uv [${got.join(',')}] == [${want.join(',')}]`, ok);
    }
  }
}

/* ------------------------------------------------------------------ */
/*  4. Animation: keyframe sampling                                     */
/* ------------------------------------------------------------------ */
console.log('\n[4] animation sampling');
{
  const model = parseBBModel(JSON.parse(readFileSync(resolvePath(MODELS, 'steve.bbmodel'), 'utf8')));
  const walk = model.animations.find((a) => a.name === 'walk')!;
  check('walk animation found', !!walk);
  const { compileAnimation, evaluateTrack } = await import('../src/bbmodel/animation');
  const compiled = compileAnimation(walk);
  check('walk length 1.0', compiled.length === 1);
  const legR = [...compiled.animators.values()].find((a) => a.name === 'rightLeg')!;
  check('rightLeg animator found', !!legR);
  const at0 = evaluateTrack(legR.tracks.rotation!, 0)!;
  const atHalf = evaluateTrack(legR.tracks.rotation!, 0.5)!;
  check(`rightLeg rotation t=0 -> x=${at0[0]} (expect 26)`, Math.abs(at0[0] - 26) < 0.001);
  check(`rightLeg rotation t=0.5 -> x=${atHalf[0]} (expect -26)`, Math.abs(atHalf[0] + 26) < 0.001);
  const mid = evaluateTrack(legR.tracks.rotation!, 0.25)!;
  check(`rightLeg rotation t=0.25 -> x=${mid[0].toFixed(2)} (expect ~0 catmullrom)`, Math.abs(mid[0]) < 0.6);
  const clamped = evaluateTrack(legR.tracks.rotation!, 5)!;
  check('time beyond length clamps', Math.abs(clamped[0] - 26) < 0.001);
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
