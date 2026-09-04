import type { BBAnimation, BBKeyframe, Vec3 } from './types';

export type Channel = 'position' | 'rotation' | 'scale';
const CHANNELS: Channel[] = ['position', 'rotation', 'scale'];

interface CompiledKeyframe {
  time: number;
  interpolation: 'linear' | 'step' | 'catmullrom' | 'bezier';
  /** values for the "incoming" (0) and, for discontinuous keyframes, "outgoing" (1) side */
  values: Vec3[];
  bezier_left_time?: Vec3;
  bezier_left_value?: Vec3;
  bezier_right_time?: Vec3;
  bezier_right_value?: Vec3;
}

export interface CompiledTrack {
  channel: Channel;
  keyframes: CompiledKeyframe[];
}

export interface CompiledAnimator {
  uuid: string;
  name: string;
  type: string;
  tracks: Partial<Record<Channel, CompiledTrack>>;
}

export interface CompiledAnimation {
  uuid: string;
  name: string;
  loop: 'once' | 'loop' | 'hold';
  length: number;
  animators: Map<string, CompiledAnimator>;
}

function toNumber(v: number | string | undefined): number {
  if (v === undefined || v === null) return 0;
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  // Molang we cannot evaluate collapses to its constant part
  const n = parseFloat(String(v));
  return isNaN(n) ? 0 : n;
}

function compileKeyframe(kf: BBKeyframe): CompiledKeyframe {
  const dps = kf.data_points && kf.data_points.length ? kf.data_points : [{ x: 0, y: 0, z: 0 }];
  return {
    time: kf.time || 0,
    interpolation: (kf.interpolation as CompiledKeyframe['interpolation']) || 'linear',
    values: dps.slice(0, 2).map((dp) => [toNumber(dp.x), toNumber(dp.y), toNumber(dp.z)] as Vec3),
    bezier_left_time: kf.bezier_left_time,
    bezier_left_value: kf.bezier_left_value,
    bezier_right_time: kf.bezier_right_time,
    bezier_right_value: kf.bezier_right_value,
  };
}

export function compileAnimation(anim: BBAnimation): CompiledAnimation {
  const animators = new Map<string, CompiledAnimator>();
  const animatorMap = anim.animators || {};
  for (const uuid in animatorMap) {
    const src = animatorMap[uuid];
    const compiled: CompiledAnimator = { uuid, name: src.name || '', type: src.type || 'bone', tracks: {} };
    for (const channel of CHANNELS) {
      const kfs = (src.keyframes || []).filter((k) => k.channel === channel);
      if (!kfs.length) continue;
      kfs.sort((a, b) => a.time - b.time);
      compiled.tracks[channel] = { channel, keyframes: kfs.map(compileKeyframe) };
    }
    animators.set(uuid, compiled);
  }
  let length = typeof anim.length === 'number' && anim.length > 0 ? anim.length : 0;
  if (!length) {
    for (const [, a] of animators) {
      for (const c of CHANNELS) {
        const t = a.tracks[c];
        if (t) for (const kf of t.keyframes) length = Math.max(length, kf.time);
      }
    }
  }
  return {
    uuid: anim.uuid,
    name: anim.name || 'animation',
    loop: anim.loop || 'loop',
    length: length || 1,
    animators,
  };
}

/* ------------------------------------------------------------------ */
/*  Interpolation                                                       */
/* ------------------------------------------------------------------ */

const clamp = (v: number, min: number, max: number) => (v < min ? min : v > max ? max : v);

/** Uniform Catmull-Rom through control points (matches THREE.SplineCurve). */
function catmullRom(points: Array<[number, number]>, t: number): number {
  const l = points.length;
  if (l < 2) return points[0] ? points[0][1] : 0;
  const p = (l - 1) * clamp(t, 0, 1);
  let intPoint = Math.floor(p);
  let weight = p - intPoint;
  if (intPoint >= l - 1) {
    intPoint = l - 2;
    weight = 1;
  }
  const p0 = points[intPoint === 0 ? 0 : intPoint - 1];
  const p1 = points[intPoint];
  const p2 = points[intPoint + 1];
  const p3 = points[intPoint + 2] || p2;

  const w2 = weight * weight;
  const w3 = weight * w2;

  const v0 = (p2[1] - p0[1]) * 0.5;
  const v1 = (p3[1] - p1[1]) * 0.5;

  return (
    (2 * p1[1] - 2 * p2[1] + v0 + v1) * w3 +
    (-3 * p1[1] + 3 * p2[1] - 2 * v0 - v1) * w2 +
    v0 * weight +
    p1[1]
  );
}

function cubicBezier(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const it = 1 - t;
  return it * it * it * p0 + 3 * it * it * t * p1 + 3 * it * t * t * p2 + t * t * t * p3;
}

/** Solve the bezier curve for the value at a given time (mirrors Blockbench). */
function bezierLerp(before: CompiledKeyframe, after: CompiledKeyframe, axis: number, alpha: number): number {
  const valBefore = before.values[before.values.length > 1 ? 1 : 0][axis];
  const valAfter = after.values[0][axis];
  const timeGap = after.time - before.time;
  if (!before.bezier_right_time || !after.bezier_left_time || !before.bezier_right_value || !after.bezier_left_value) {
    return valBefore + (valAfter - valBefore) * alpha;
  }
  const handleBeforeTime = clamp(before.bezier_right_time[axis] || 0, 0, timeGap);
  const handleAfterTime = clamp(after.bezier_left_time[axis] || 0, -timeGap, 0);

  const x0 = before.time;
  const x1 = before.time + handleBeforeTime;
  const x2 = after.time + handleAfterTime;
  const x3 = after.time;
  const y0 = valBefore;
  const y1 = valBefore + (before.bezier_right_value[axis] || 0);
  const y2 = valAfter + (after.bezier_left_value[axis] || 0);
  const y3 = valAfter;

  const targetTime = before.time + timeGap * alpha;
  // Newton-Raphson with bisection fallback
  let t = alpha;
  for (let i = 0; i < 12; i++) {
    const x = cubicBezier(x0, x1, x2, x3, t) - targetTime;
    if (Math.abs(x) < 1e-6) break;
    const dx =
      3 * (1 - t) * (1 - t) * (x1 - x0) + 6 * (1 - t) * t * (x2 - x1) + 3 * t * t * (x3 - x2);
    if (Math.abs(dx) < 1e-9) break;
    t -= x / dx;
    if (t < 0) t = 0;
    if (t > 1) t = 1;
  }
  return cubicBezier(y0, y1, y2, y3, clamp(t, 0, 1));
}

function interpolateAxis(
  track: CompiledTrack,
  axis: number,
  time: number,
): number | null {
  const kfs = track.keyframes;
  if (!kfs.length) return null;
  if (time <= kfs[0].time) return kfs[0].values[0][axis];
  const last = kfs[kfs.length - 1];
  if (time >= last.time) return last.values[last.values.length > 1 ? 1 : 0][axis];

  let i = 0;
  while (i < kfs.length - 1 && kfs[i + 1].time <= time) i++;
  const before = kfs[i];
  const after = kfs[i + 1];
  if (!after) return before.values[0][axis];

  const span = after.time - before.time;
  const alpha = span > 0 ? (time - before.time) / span : 0;

  const valBefore = before.values[before.values.length > 1 ? 1 : 0][axis];
  const valAfter = after.values[0][axis];

  switch (before.interpolation) {
    case 'step':
      return valBefore;
    case 'catmullrom': {
      const prev = kfs[i - 1];
      const next = kfs[i + 2];
      const pts: Array<[number, number]> = [];
      const hasPre = !!(prev && prev.values.length === 1);
      if (hasPre) pts.push([prev.time, prev.values[0][axis]]);
      pts.push([before.time, before.values[before.values.length > 1 ? 1 : 0][axis]]);
      pts.push([after.time, after.values[0][axis]]);
      if (next && next.values.length === 1) pts.push([next.time, next.values[0][axis]]);
      if (pts.length < 3) return valBefore + (valAfter - valBefore) * alpha;
      // mirrors Blockbench: alpha 0 must land on the `before` control point
      return catmullRom(pts, (alpha + (hasPre ? 1 : 0)) / (pts.length - 1));
    }
    case 'bezier':
      return bezierLerp(before, after, axis, alpha);
    case 'linear':
    default:
      return valBefore + (valAfter - valBefore) * alpha;
  }
}

/** Evaluate a channel at `time`. Returns null when the track has no data. */
export function evaluateTrack(track: CompiledTrack | undefined, time: number): Vec3 | null {
  if (!track || !track.keyframes.length) return null;
  return [
    interpolateAxis(track, 0, time) ?? 0,
    interpolateAxis(track, 1, time) ?? 0,
    interpolateAxis(track, 2, time) ?? 0,
  ];
}

/** Apply loop mode to a raw time value. */
export function resolveTime(anim: CompiledAnimation, rawTime: number): number {
  const len = anim.length || 1;
  if (anim.loop === 'loop') {
    const t = rawTime % len;
    return t < 0 ? t + len : t;
  }
  if (anim.loop === 'hold') return clamp(rawTime, 0, len);
  return clamp(rawTime, 0, len);
}

export function isAnimationFinished(anim: CompiledAnimation, rawTime: number): boolean {
  return anim.loop === 'once' && rawTime >= anim.length;
}
