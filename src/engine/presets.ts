/**
 * Motion-graphics presets for overlay layers: the "pick an animation,
 * customise it, export it" half of the studio.
 */

export type EasingFn = (t: number) => number;

export const easings: Record<string, EasingFn> = {
  linear: (t) => t,
  easeOut: (t) => 1 - Math.pow(1 - t, 3),
  easeIn: (t) => t * t * t,
  easeInOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  /** snappy overshoot - the classic YouTube "pop" */
  back: (t) => {
    const c1 = 1.9;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  elastic: (t) => {
    if (t === 0 || t === 1) return t;
    const c4 = (2 * Math.PI) / 0.55;
    return Math.pow(2, -11 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  },
  bounce: (t) => {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
  /** hard "impact" - fast in, tiny settle */
  impact: (t) => {
    const p = 1 - Math.pow(1 - t, 6);
    return p + Math.sin(t * Math.PI * 3) * 0.035 * (1 - t);
  },
};

export interface LayerAnimState {
  offsetX: number;
  offsetY: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  alpha: number;
  skew: number;
  /** 0..1 fraction of text revealed (typewriter) */
  reveal: number;
  /** extra outline glow 0..1 */
  glow: number;
  visible: boolean;
}

export const IDENTITY_ANIM: LayerAnimState = {
  offsetX: 0,
  offsetY: 0,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  alpha: 1,
  skew: 0,
  reveal: 1,
  glow: 0,
  visible: true,
};

export type AnimPresetId =
  | 'none'
  | 'pop'
  | 'slam'
  | 'bounceIn'
  | 'slideLeft'
  | 'slideRight'
  | 'slideUp'
  | 'slideDown'
  | 'fade'
  | 'zoomIn'
  | 'zoomOut'
  | 'typewriter'
  | 'shake'
  | 'pulse'
  | 'wobble'
  | 'drop'
  | 'flipIn'
  | 'spinIn'
  | 'glitch'
  | 'tracking'
  | 'riseBlur';

export interface AnimPreset {
  id: AnimPresetId;
  label: string;
  /** whether the layer is hidden before its delay elapses */
  enters: boolean;
  /** keeps cycling rather than settling */
  loops: boolean;
  defaultDuration: number;
}

export const ANIM_PRESETS: AnimPreset[] = [
  { id: 'none', label: 'None', enters: false, loops: false, defaultDuration: 0.6 },
  { id: 'pop', label: 'Pop In', enters: true, loops: false, defaultDuration: 0.45 },
  { id: 'slam', label: 'Slam', enters: true, loops: false, defaultDuration: 0.35 },
  { id: 'bounceIn', label: 'Bounce In', enters: true, loops: false, defaultDuration: 0.7 },
  { id: 'slideLeft', label: 'Slide In Left', enters: true, loops: false, defaultDuration: 0.5 },
  { id: 'slideRight', label: 'Slide In Right', enters: true, loops: false, defaultDuration: 0.5 },
  { id: 'slideUp', label: 'Slide Up', enters: true, loops: false, defaultDuration: 0.5 },
  { id: 'slideDown', label: 'Drop In', enters: true, loops: false, defaultDuration: 0.55 },
  { id: 'fade', label: 'Fade In', enters: true, loops: false, defaultDuration: 0.5 },
  { id: 'zoomIn', label: 'Zoom In', enters: true, loops: false, defaultDuration: 0.5 },
  { id: 'zoomOut', label: 'Zoom Out', enters: true, loops: false, defaultDuration: 0.5 },
  { id: 'typewriter', label: 'Typewriter', enters: true, loops: false, defaultDuration: 0.9 },
  { id: 'flipIn', label: 'Flip In', enters: true, loops: false, defaultDuration: 0.6 },
  { id: 'spinIn', label: 'Spin In', enters: true, loops: false, defaultDuration: 0.7 },
  { id: 'drop', label: 'Heavy Drop', enters: true, loops: false, defaultDuration: 0.6 },
  { id: 'shake', label: 'Shake', enters: false, loops: true, defaultDuration: 0.6 },
  { id: 'pulse', label: 'Pulse', enters: false, loops: true, defaultDuration: 1.2 },
  { id: 'wobble', label: 'Wobble', enters: false, loops: true, defaultDuration: 1.4 },
  { id: 'glitch', label: 'Glitch', enters: false, loops: true, defaultDuration: 0.8 },
  { id: 'tracking', label: 'Tracking In', enters: true, loops: false, defaultDuration: 0.7 },
];

export function getPreset(id: AnimPresetId): AnimPreset {
  return ANIM_PRESETS.find((p) => p.id === id) || ANIM_PRESETS[0];
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Compute the animated transform for a layer.
 * @param time   absolute timeline time in seconds
 * @param delay  seconds before the animation starts
 * @param dur    duration in seconds
 * @param loop   keep cycling
 * @param intensity 0..2 multiplier for the motion amplitude
 */
export function sampleLayerAnim(
  presetId: AnimPresetId,
  time: number,
  delay: number,
  dur: number,
  loop: boolean,
  intensity = 1,
): LayerAnimState {
  const state: LayerAnimState = { ...IDENTITY_ANIM };
  const preset = getPreset(presetId);
  if (presetId === 'none') return state;

  const local = time - delay;
  if (local < 0) {
    state.visible = !preset.enters;
    if (preset.enters) {
      state.alpha = 0;
      state.scaleX = state.scaleY = 0.9;
      state.reveal = presetId === 'typewriter' ? 0 : 1;
    }
    return state;
  }

  const duration = Math.max(0.001, dur);
  let raw = local / duration;
  if (loop) {
    raw = raw % 1;
  } else if (raw > 1) {
    raw = 1;
  }
  const t = clamp01(raw);
  const amp = intensity;

  switch (presetId) {
    case 'pop': {
      const e = easings.back(t);
      state.scaleX = state.scaleY = 0.2 + 0.8 * e;
      state.alpha = Math.min(1, t * 3);
      state.rotation = (1 - t) * -8 * amp;
      break;
    }
    case 'slam': {
      const e = easings.impact(t);
      state.scaleX = state.scaleY = 2.2 - 1.2 * e;
      state.alpha = Math.min(1, t * 4);
      state.glow = (1 - t) * amp;
      break;
    }
    case 'bounceIn': {
      const e = easings.bounce(t);
      state.offsetY = -(1 - e) * 220 * amp;
      state.scaleX = state.scaleY = 0.6 + 0.4 * Math.min(1, t * 2);
      state.alpha = Math.min(1, t * 3);
      break;
    }
    case 'slideLeft': {
      const e = easings.easeOut(t);
      state.offsetX = -(1 - e) * 420 * amp;
      state.alpha = Math.min(1, t * 2.5);
      break;
    }
    case 'slideRight': {
      const e = easings.easeOut(t);
      state.offsetX = (1 - e) * 420 * amp;
      state.alpha = Math.min(1, t * 2.5);
      break;
    }
    case 'slideUp': {
      const e = easings.easeOut(t);
      state.offsetY = (1 - e) * 260 * amp;
      state.alpha = Math.min(1, t * 2.5);
      break;
    }
    case 'slideDown':
    case 'drop': {
      const e = presetId === 'drop' ? easings.impact(t) : easings.easeOut(t);
      state.offsetY = -(1 - e) * 420 * amp;
      state.alpha = Math.min(1, t * 3);
      if (presetId === 'drop') {
        state.scaleY = 1 + (1 - t) * 0.25 * amp;
        state.scaleX = 1 - (1 - t) * 0.12 * amp;
      }
      break;
    }
    case 'fade': {
      state.alpha = easeInish(t);
      break;
    }
    case 'zoomIn': {
      const e = easings.easeOut(t);
      state.scaleX = state.scaleY = 0.35 + 0.65 * e;
      state.alpha = Math.min(1, t * 2.5);
      break;
    }
    case 'zoomOut': {
      const e = easings.easeOut(t);
      state.scaleX = state.scaleY = 2.0 - 1.0 * e;
      state.alpha = Math.min(1, t * 2.5);
      break;
    }
    case 'typewriter': {
      state.reveal = clamp01(t);
      state.alpha = 1;
      break;
    }
    case 'flipIn': {
      const e = easings.easeOut(t);
      state.scaleX = -1 + 2 * e;
      state.scaleX = Math.abs(state.scaleX) < 0.02 ? 0.02 : state.scaleX;
      state.alpha = Math.min(1, t * 2.5);
      break;
    }
    case 'spinIn': {
      const e = easings.back(t);
      state.rotation = (1 - e) * -380 * amp;
      state.scaleX = state.scaleY = 0.3 + 0.7 * e;
      state.alpha = Math.min(1, t * 3);
      break;
    }
    case 'shake': {
      const phase = t * Math.PI * 2 * 3;
      state.offsetX = Math.sin(phase) * 12 * amp;
      state.rotation = Math.sin(phase * 1.3) * 2.2 * amp;
      break;
    }
    case 'pulse': {
      const e = (Math.sin(t * Math.PI * 2) + 1) / 2;
      state.scaleX = state.scaleY = 1 + e * 0.12 * amp;
      state.glow = e * 0.6 * amp;
      break;
    }
    case 'wobble': {
      const phase = t * Math.PI * 2;
      state.rotation = Math.sin(phase) * 6 * amp;
      state.offsetY = Math.cos(phase * 2) * 6 * amp;
      state.skew = Math.sin(phase) * 4 * amp;
      break;
    }
    case 'glitch': {
      const seed = Math.floor(t * 14);
      const r = pseudoRandom(seed);
      const active = r > 0.55;
      state.offsetX = active ? (r - 0.5) * 34 * amp : 0;
      state.offsetY = active ? (pseudoRandom(seed + 91) - 0.5) * 10 * amp : 0;
      state.skew = active ? (pseudoRandom(seed + 7) - 0.5) * 16 * amp : 0;
      state.alpha = active ? 0.75 + 0.25 * pseudoRandom(seed + 3) : 1;
      break;
    }
    case 'tracking': {
      const e = easings.easeOut(t);
      state.alpha = Math.min(1, t * 2.5);
      state.skew = (1 - e) * 0;
      state.scaleX = 1 + (1 - e) * 0.35 * amp;
      state.offsetY = (1 - e) * -30 * amp;
      break;
    }
    default:
      break;
  }
  return state;
}

function easeInish(t: number) {
  return clamp01(t);
}

function pseudoRandom(seed: number) {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453123;
  return x - Math.floor(x);
}

/** Total time an overlay animation needs before everything has settled. */
export function overlayDuration(layers: Array<{ anim?: { preset?: string; delay?: number; duration?: number; loop?: boolean } }>): number {
  let max = 0;
  for (const l of layers) {
    const a = l.anim;
    if (!a) continue;
    const preset = getPreset((a.preset as AnimPresetId) || 'none');
    if (preset.loops) continue;
    max = Math.max(max, (a.delay || 0) + (a.duration || preset.defaultDuration));
  }
  return max;
}
