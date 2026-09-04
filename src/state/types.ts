import type { AnimPresetId } from '../engine/presets';

export type LayerKind = 'text' | 'shape' | 'image';

export interface FillStyle {
  type: 'solid' | 'gradient' | 'none';
  color: string;
  color2: string;
  angle: number;
}

export interface StrokeStyle {
  enabled: boolean;
  color: string;
  width: number;
  /** outline = centred stroke, extrude = stacked 3D depth */
  style: 'outline' | 'extrude';
  depth: number;
}

export interface ShadowStyle {
  enabled: boolean;
  color: string;
  blur: number;
  dx: number;
  dy: number;
}

export interface LayerAnim {
  preset: AnimPresetId;
  delay: number;
  duration: number;
  loop: boolean;
  intensity: number;
}

export type ShapeKind =
  | 'rect'
  | 'circle'
  | 'arrow'
  | 'burst'
  | 'star'
  | 'triangle'
  | 'ring'
  | 'underline'
  | 'blob';

export interface Layer {
  id: string;
  kind: LayerKind;
  name: string;
  visible: boolean;
  locked: boolean;
  /** position of the layer's centre, as a fraction of the canvas (0..1) */
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  anim: LayerAnim;
  /* --- text --- */
  text?: string;
  fontFamily?: string;
  /** font size as a fraction of canvas height */
  fontSize?: number;
  fontWeight?: number;
  italic?: boolean;
  uppercase?: boolean;
  fill?: FillStyle;
  stroke?: StrokeStyle;
  shadow?: ShadowStyle;
  letterSpacing?: number;
  lineHeight?: number;
  align?: 'left' | 'center' | 'right';
  /** bend the text along an arc, in degrees (0 = straight) */
  arc?: number;
  /* --- shape --- */
  shape?: ShapeKind;
  shapeW?: number;
  shapeH?: number;
  corner?: number;
  points?: number;
  /* --- image --- */
  src?: string;
  imgW?: number;
  imgH?: number;
  tint?: string;
  /** white -> transparent removal for logos/PNGs */
  chromaKey?: boolean;
}

export type BackgroundKind = 'solid' | 'gradient' | 'image' | 'transparent';

export interface BackgroundSettings {
  kind: BackgroundKind;
  color: string;
  color2: string;
  angle: number;
  /** data URL of an uploaded backdrop */
  src: string;
  /** 'cover' | 'contain' */
  fit: 'cover' | 'contain';
  blur: number;
  brightness: number;
  saturation: number;
  /** colour wash on top of the backdrop */
  overlayColor: string;
  overlayOpacity: number;
  vignette: number;
  /** subtle animated drift */
  parallax: number;
}

export interface ModelSettings {
  /** uniform scale multiplier applied on top of camera framing */
  zoom: number;
  /** screen-space offset, in fractions of the canvas */
  offsetX: number;
  offsetY: number;
  /** vertical offset in world units (blocks) */
  lift: number;
  shadowEnabled: boolean;
  shadowOpacity: number;
  shadowBlur: number;
  groundEnabled: boolean;
  groundColor: string;
  outline: number;
  outlineColor: string;
}

export interface CameraSettings {
  fov: number;
  preset: string;
  /** extra orbit applied on top of the preset, degrees */
  orbitY: number;
  orbitX: number;
  distance: number;
  /** continuous turntable rotation, degrees per second */
  autoOrbit: number;
}

export interface AnimationSettings {
  index: number;
  playing: boolean;
  time: number;
  speed: number;
  loop: boolean;
}

export interface CanvasSettings {
  width: number;
  height: number;
}

export interface ProjectState {
  canvas: CanvasSettings;
  background: BackgroundSettings;
  model: ModelSettings;
  camera: CameraSettings;
  animation: AnimationSettings;
  layers: Layer[];
  selectedId: string | null;
  lighting: 'minecraft' | 'studio' | 'flat';
  exposure: number;
  smoothing: boolean;
  showSafeArea: boolean;
  quality: 'draft' | 'high';
}

export const CANVAS_PRESETS = [
  { label: 'YouTube thumbnail — 1280×720', width: 1280, height: 720 },
  { label: 'Full HD — 1920×1080', width: 1920, height: 1080 },
  { label: '2K — 2560×1440', width: 2560, height: 1440 },
  { label: '4K — 3840×2160', width: 3840, height: 2160 },
  { label: 'Square — 1080×1080', width: 1080, height: 1080 },
  { label: 'Shorts / Reels — 1080×1920', width: 1080, height: 1920 },
];

export const FONTS = [
  { label: 'Anton', value: 'Anton, Impact, sans-serif' },
  { label: 'Bebas Neue', value: "'Bebas Neue', Impact, sans-serif" },
  { label: 'Luckiest Guy', value: "'Luckiest Guy', Impact, cursive" },
  { label: 'Impact', value: 'Impact, "Arial Black", sans-serif' },
  { label: 'Arial Black', value: '"Arial Black", Arial, sans-serif' },
  { label: 'System Sans', value: 'system-ui, -apple-system, Roboto, sans-serif' },
  { label: 'Serif', value: 'Georgia, "Times New Roman", serif' },
  { label: 'Monospace', value: '"Courier New", monospace' },
];

let idCounter = 0;
export function newId(prefix = 'l') {
  idCounter += 1;
  return `${prefix}${Date.now().toString(36)}${idCounter.toString(36)}`;
}

export function defaultLayer(kind: LayerKind, overrides: Partial<Layer> = {}): Layer {
  const base: Layer = {
    id: newId(),
    kind,
    name: kind === 'text' ? 'Text' : kind === 'shape' ? 'Shape' : 'Image',
    visible: true,
    locked: false,
    x: 0.5,
    y: 0.5,
    scale: 1,
    rotation: 0,
    opacity: 1,
    anim: { preset: 'none', delay: 0, duration: 0.6, loop: false, intensity: 1 },
  };
  if (kind === 'text') {
    Object.assign(base, {
      text: 'YOUR TEXT',
      fontFamily: 'Anton, Impact, sans-serif',
      fontSize: 0.16,
      fontWeight: 400,
      italic: false,
      uppercase: true,
      fill: { type: 'solid' as const, color: '#ffffff', color2: '#ffd200', angle: 90 },
      stroke: { enabled: true, color: '#000000', width: 0.02, style: 'outline' as const, depth: 8 },
      shadow: { enabled: true, color: 'rgba(0,0,0,0.65)', blur: 18, dx: 6, dy: 8 },
      letterSpacing: 0,
      lineHeight: 1.05,
      align: 'center' as const,
      arc: 0,
      y: 0.78,
    });
  } else if (kind === 'shape') {
    Object.assign(base, {
      shape: 'burst' as ShapeKind,
      shapeW: 0.3,
      shapeH: 0.3,
      corner: 12,
      points: 12,
      fill: { type: 'solid' as const, color: '#ff3b3b', color2: '#ffd200', angle: 45 },
      stroke: { enabled: false, color: '#000000', width: 0.006, style: 'outline' as const, depth: 4 },
      shadow: { enabled: false, color: 'rgba(0,0,0,0.5)', blur: 20, dx: 0, dy: 6 },
    });
  } else {
    Object.assign(base, {
      src: '',
      imgW: 0.3,
      imgH: 0.3,
      shadow: { enabled: true, color: 'rgba(0,0,0,0.5)', blur: 24, dx: 0, dy: 10 },
      chromaKey: false,
    });
  }
  return { ...base, ...overrides } as Layer;
}

export function defaultProject(): ProjectState {
  return {
    canvas: { width: 1280, height: 720 },
    background: {
      kind: 'gradient',
      color: '#101a2c',
      color2: '#2a1758',
      angle: 135,
      src: '',
      fit: 'cover',
      blur: 0,
      brightness: 1,
      saturation: 1,
      overlayColor: '#000000',
      overlayOpacity: 0,
      vignette: 0.25,
      parallax: 0,
    },
    model: {
      zoom: 1,
      offsetX: 0,
      offsetY: 0,
      lift: 0,
      shadowEnabled: true,
      shadowOpacity: 0.45,
      shadowBlur: 1,
      groundEnabled: false,
      groundColor: '#3f9c46',
      outline: 0,
      outlineColor: '#000000',
    },
    camera: { fov: 35, preset: 'three-quarter', orbitY: 0, orbitX: 0, distance: 1, autoOrbit: 0 },
    animation: { index: -1, playing: false, time: 0, speed: 1, loop: true },
    layers: [
      defaultLayer('text', {
        name: 'Headline',
        text: 'EPIC MOMENT',
        y: 0.8,
        fontSize: 0.17,
        fill: { type: 'gradient', color: '#ffffff', color2: '#ffd200', angle: 90 },
        anim: { preset: 'pop', delay: 0.15, duration: 0.5, loop: false, intensity: 1 },
      }),
      defaultLayer('text', {
        name: 'Kicker',
        text: 'gone wrong',
        y: 0.62,
        fontSize: 0.09,
        fill: { type: 'solid', color: '#ff3b3b', color2: '#ffffff', angle: 90 },
        stroke: { enabled: true, color: '#ffffff', width: 0.012, style: 'outline', depth: 4 },
        anim: { preset: 'slideLeft', delay: 0, duration: 0.5, loop: false, intensity: 1 },
      }),
    ],
    selectedId: null,
    lighting: 'studio',
    exposure: 1,
    smoothing: false,
    showSafeArea: false,
    quality: 'high',
  };
}
