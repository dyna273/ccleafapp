import { defaultLayer, type BackgroundSettings, type Layer, type ProjectState } from './types';

export interface Template {
  id: string;
  name: string;
  blurb: string;
  /** two colours used for the swatch in the picker */
  swatch: [string, string];
  build(): TemplatePatch;
}

export interface TemplatePatch {
  background?: Partial<BackgroundSettings>;
  layers?: Layer[];
  canvas?: { width: number; height: number };
  camera?: { preset?: string; fov?: number };
}

const text = (over: Partial<Layer>) => defaultLayer('text', over);
const shape = (over: Partial<Layer>) => defaultLayer('shape', over);

export const TEMPLATES: Template[] = [
  {
    id: 'impact',
    name: 'Gaming Impact',
    blurb: 'Big headline, red burst, maximum click-through',
    swatch: ['#c8102e', '#12203a'],
    build: () => ({
      background: {
        kind: 'gradient',
        color: '#1b2a4a',
        color2: '#5a0d16',
        angle: 145,
        vignette: 0.4,
        overlayColor: '#000000',
        overlayOpacity: 0.12,
      },
      camera: { preset: 'hero', fov: 32 },
      layers: [
        shape({
          name: 'Burst',
          shape: 'burst',
          shapeW: 0.42,
          shapeH: 0.42,
          points: 16,
          x: 0.5,
          y: 0.44,
          opacity: 0.9,
          fill: { type: 'gradient', color: '#ff2d55', color2: '#ff9500', angle: 100 },
          anim: { preset: 'pop', delay: 0.1, duration: 0.4, loop: false, intensity: 1 },
        }),
        text({
          name: 'Kicker',
          text: 'GONE WRONG',
          x: 0.5,
          y: 0.62,
          fontSize: 0.075,
          fontFamily: "'Bebas Neue', Impact, sans-serif",
          letterSpacing: 0.06,
          fill: { type: 'solid', color: '#ffd200', color2: '#ffffff', angle: 90 },
          stroke: { enabled: true, color: '#000000', width: 0.014, style: 'outline', depth: 4 },
          anim: { preset: 'slideLeft', delay: 0.05, duration: 0.45, loop: false, intensity: 1 },
        }),
        text({
          name: 'Headline',
          text: 'EPIC\nMOMENT',
          x: 0.5,
          y: 0.82,
          fontSize: 0.185,
          lineHeight: 0.92,
          fontFamily: 'Anton, Impact, sans-serif',
          fill: { type: 'gradient', color: '#ffffff', color2: '#ffd200', angle: 90 },
          stroke: { enabled: true, color: '#000000', width: 0.028, style: 'outline', depth: 8 },
          shadow: { enabled: true, color: 'rgba(0,0,0,0.75)', blur: 22, dx: 8, dy: 10 },
          anim: { preset: 'slam', delay: 0.3, duration: 0.4, loop: false, intensity: 1.2 },
        }),
      ],
    }),
  },
  {
    id: 'sky',
    name: 'Minecraft Sky',
    blurb: 'Bright daytime look with grass ground',
    swatch: ['#7ec0ee', '#4f9c3a'],
    build: () => ({
      background: {
        kind: 'gradient',
        color: '#8fd3f4',
        color2: '#dff1fb',
        angle: 180,
        vignette: 0.16,
        overlayColor: '#000000',
        overlayOpacity: 0,
      },
      camera: { preset: 'three-quarter', fov: 35 },
      layers: [
        text({
          name: 'Headline',
          text: 'NEW SEED!',
          x: 0.5,
          y: 0.16,
          fontSize: 0.15,
          fontFamily: "'Luckiest Guy', Impact, cursive",
          fill: { type: 'solid', color: '#ffffff', color2: '#ffffff', angle: 90 },
          stroke: { enabled: true, color: '#1f4e1f', width: 0.026, style: 'extrude', depth: 10 },
          shadow: { enabled: true, color: 'rgba(0,0,0,0.35)', blur: 14, dx: 4, dy: 6 },
          anim: { preset: 'drop', delay: 0.1, duration: 0.6, loop: false, intensity: 1 },
        }),
        text({
          name: 'Sub',
          text: 'watch till the end',
          x: 0.5,
          y: 0.9,
          fontSize: 0.06,
          fontFamily: "'Bebas Neue', Impact, sans-serif",
          letterSpacing: 0.05,
          fill: { type: 'solid', color: '#12321a', color2: '#12321a', angle: 90 },
          stroke: { enabled: true, color: '#ffffff', width: 0.01, style: 'outline', depth: 3 },
          anim: { preset: 'fade', delay: 0.5, duration: 0.5, loop: false, intensity: 1 },
        }),
      ],
    }),
  },
  {
    id: 'neon',
    name: 'Neon Nights',
    blurb: 'Purple haze with a glowing cyan headline',
    swatch: ['#7b2ff7', '#00e5ff'],
    build: () => ({
      background: {
        kind: 'gradient',
        color: '#170a2e',
        color2: '#3b0f5c',
        angle: 120,
        vignette: 0.5,
        overlayColor: '#2a0b4a',
        overlayOpacity: 0.2,
      },
      camera: { preset: 'low', fov: 34 },
      layers: [
        shape({
          name: 'Ring',
          shape: 'ring',
          shapeW: 0.55,
          shapeH: 0.55,
          corner: 8,
          x: 0.5,
          y: 0.5,
          opacity: 0.75,
          fill: { type: 'solid', color: '#00e5ff', color2: '#7b2ff7', angle: 45 },
          anim: { preset: 'zoomIn', delay: 0, duration: 0.6, loop: false, intensity: 1 },
        }),
        text({
          name: 'Headline',
          text: 'SECRET\nFOUND',
          x: 0.5,
          y: 0.83,
          fontSize: 0.16,
          lineHeight: 0.95,
          fontFamily: "'Bebas Neue', Impact, sans-serif",
          letterSpacing: 0.04,
          fill: { type: 'gradient', color: '#00e5ff', color2: '#ffffff', angle: 90 },
          stroke: { enabled: true, color: '#ff2d95', width: 0.016, style: 'outline', depth: 6 },
          shadow: { enabled: true, color: 'rgba(0,229,255,0.85)', blur: 34, dx: 0, dy: 0 },
          anim: { preset: 'tracking', delay: 0.15, duration: 0.7, loop: false, intensity: 1 },
        }),
      ],
    }),
  },
  {
    id: 'versus',
    name: 'Versus',
    blurb: 'Split-screen rivalry layout',
    swatch: ['#e63946', '#1d3557'],
    build: () => ({
      background: {
        kind: 'gradient',
        color: '#141b2d',
        color2: '#2b1520',
        angle: 90,
        vignette: 0.35,
        overlayColor: '#000000',
        overlayOpacity: 0.15,
      },
      camera: { preset: 'front', fov: 30 },
      layers: [
        shape({
          name: 'Left bar',
          shape: 'rect',
          shapeW: 1.1,
          shapeH: 0.5,
          corner: 0,
          x: 0.25,
          y: 0.5,
          opacity: 0.35,
          rotation: -8,
          fill: { type: 'solid', color: '#e63946', color2: '#e63946', angle: 0 },
        }),
        text({
          name: 'VS',
          text: 'VS',
          x: 0.5,
          y: 0.5,
          fontSize: 0.4,
          fontFamily: 'Impact, "Arial Black", sans-serif',
          fill: { type: 'solid', color: '#ffffff', color2: '#ffffff', angle: 90 },
          stroke: { enabled: true, color: '#000000', width: 0.03, style: 'extrude', depth: 14 },
          shadow: { enabled: true, color: 'rgba(0,0,0,0.8)', blur: 26, dx: 0, dy: 12 },
          anim: { preset: 'slam', delay: 0.2, duration: 0.35, loop: false, intensity: 1.4 },
        }),
        text({
          name: 'Caption',
          text: 'WHO WINS?',
          x: 0.5,
          y: 0.88,
          fontSize: 0.09,
          fontFamily: "'Bebas Neue', Impact, sans-serif",
          letterSpacing: 0.12,
          fill: { type: 'solid', color: '#ffd200', color2: '#ffd200', angle: 90 },
          stroke: { enabled: true, color: '#000000', width: 0.012, style: 'outline', depth: 4 },
          anim: { preset: 'typewriter', delay: 0.5, duration: 0.8, loop: false, intensity: 1 },
        }),
      ],
    }),
  },
  {
    id: 'stat',
    name: 'Stat Card',
    blurb: 'Clean panel for numbers and records',
    swatch: ['#0f172a', '#38bdf8'],
    build: () => ({
      background: {
        kind: 'gradient',
        color: '#0b1220',
        color2: '#16233a',
        angle: 160,
        vignette: 0.3,
        overlayColor: '#000000',
        overlayOpacity: 0.1,
      },
      camera: { preset: 'side', fov: 32 },
      layers: [
        shape({
          name: 'Card',
          shape: 'rect',
          shapeW: 0.62,
          shapeH: 0.3,
          corner: 10,
          x: 0.31,
          y: 0.74,
          opacity: 0.82,
          fill: { type: 'solid', color: '#0e1a2b', color2: '#0e1a2b', angle: 0 },
          stroke: { enabled: true, color: '#38bdf8', width: 0.005, style: 'outline', depth: 2 },
          anim: { preset: 'slideRight', delay: 0.15, duration: 0.5, loop: false, intensity: 1 },
        }),
        text({
          name: 'Stat',
          text: '1,337',
          x: 0.31,
          y: 0.74,
          fontSize: 0.18,
          fontFamily: 'Impact, "Arial Black", sans-serif',
          fill: { type: 'gradient', color: '#38bdf8', color2: '#e0f2fe', angle: 90 },
          stroke: { enabled: true, color: '#04121f', width: 0.02, style: 'outline', depth: 6 },
          anim: { preset: 'pop', delay: 0.35, duration: 0.4, loop: false, intensity: 1 },
        }),
        text({
          name: 'Label',
          text: 'DIAMONDS MINED',
          x: 0.31,
          y: 0.86,
          fontSize: 0.055,
          fontFamily: "'Bebas Neue', Impact, sans-serif",
          letterSpacing: 0.14,
          fill: { type: 'solid', color: '#94a3b8', color2: '#94a3b8', angle: 90 },
          anim: { preset: 'fade', delay: 0.6, duration: 0.5, loop: false, intensity: 1 },
        }),
      ],
    }),
  },
  {
    id: 'reveal',
    name: 'Reveal',
    blurb: 'Dark spotlight with a badge and arrow',
    swatch: ['#111111', '#f59e0b'],
    build: () => ({
      background: {
        kind: 'solid',
        color: '#0a0a0c',
        vignette: 0.65,
        overlayColor: '#000000',
        overlayOpacity: 0,
      },
      camera: { preset: 'three-quarter', fov: 30 },
      layers: [
        text({
          name: 'Headline',
          text: 'FINALLY!',
          x: 0.5,
          y: 0.18,
          fontSize: 0.155,
          fontFamily: "'Luckiest Guy', Impact, cursive",
          fill: { type: 'gradient', color: '#fde68a', color2: '#f59e0b', angle: 90 },
          stroke: { enabled: true, color: '#000000', width: 0.022, style: 'extrude', depth: 9 },
          shadow: { enabled: true, color: 'rgba(245,158,11,0.6)', blur: 30, dx: 0, dy: 0 },
          anim: { preset: 'bounceIn', delay: 0.2, duration: 0.7, loop: false, intensity: 1 },
        }),
        shape({
          name: 'Arrow',
          shape: 'arrow',
          shapeW: 0.26,
          shapeH: 0.16,
          x: 0.5,
          y: 0.9,
          rotation: 90,
          fill: { type: 'solid', color: '#f59e0b', color2: '#f59e0b', angle: 0 },
          anim: { preset: 'slideUp', delay: 0.5, duration: 0.5, loop: false, intensity: 1 },
        }),
      ],
    }),
  },
  {
    id: 'shorts',
    name: 'Shorts / Reels',
    blurb: 'Vertical 1080×1920 framing',
    swatch: ['#111827', '#22d3ee'],
    build: () => ({
      canvas: { width: 1080, height: 1920 },
      background: {
        kind: 'gradient',
        color: '#0f172a',
        color2: '#0b3b4a',
        angle: 170,
        vignette: 0.4,
        overlayColor: '#000000',
        overlayOpacity: 0.1,
      },
      camera: { preset: 'hero', fov: 34 },
      layers: [
        text({
          name: 'Headline',
          text: 'WAIT\nFOR IT',
          x: 0.5,
          y: 0.17,
          fontSize: 0.105,
          lineHeight: 0.95,
          fontFamily: 'Anton, Impact, sans-serif',
          fill: { type: 'gradient', color: '#ffffff', color2: '#22d3ee', angle: 90 },
          stroke: { enabled: true, color: '#000000', width: 0.022, style: 'outline', depth: 7 },
          shadow: { enabled: true, color: 'rgba(0,0,0,0.7)', blur: 20, dx: 0, dy: 8 },
          anim: { preset: 'slam', delay: 0.15, duration: 0.4, loop: false, intensity: 1.2 },
        }),
        text({
          name: 'Footer',
          text: 'full video on the channel',
          x: 0.5,
          y: 0.92,
          fontSize: 0.038,
          fontFamily: "'Bebas Neue', Impact, sans-serif",
          letterSpacing: 0.1,
          fill: { type: 'solid', color: '#cbd5e1', color2: '#cbd5e1', angle: 90 },
          anim: { preset: 'fade', delay: 0.6, duration: 0.6, loop: false, intensity: 1 },
        }),
      ],
    }),
  },
  {
    id: 'speedrun',
    name: 'Speedrun HUD',
    blurb: 'Timer overlay for PB runs',
    swatch: ['#000000', '#ef4444'],
    build: () => ({
      background: {
        kind: 'solid',
        color: '#05070a',
        vignette: 0.45,
        overlayColor: '#000000',
        overlayOpacity: 0,
      },
      camera: { preset: 'side', fov: 34 },
      layers: [
        text({
          name: 'Timer',
          text: '12:34.56',
          x: 0.28,
          y: 0.16,
          fontSize: 0.13,
          fontFamily: '"Courier New", monospace',
          fontWeight: 700,
          letterSpacing: 0.02,
          fill: { type: 'solid', color: '#ffffff', color2: '#ffffff', angle: 90 },
          stroke: { enabled: true, color: '#ef4444', width: 0.012, style: 'outline', depth: 4 },
          shadow: { enabled: true, color: 'rgba(239,68,68,0.9)', blur: 26, dx: 0, dy: 0 },
          anim: { preset: 'tracking', delay: 0.1, duration: 0.6, loop: false, intensity: 1 },
        }),
        text({
          name: 'PB',
          text: 'NEW PERSONAL BEST',
          x: 0.72,
          y: 0.16,
          fontSize: 0.05,
          fontFamily: "'Bebas Neue', Impact, sans-serif",
          letterSpacing: 0.1,
          fill: { type: 'solid', color: '#22c55e', color2: '#22c55e', angle: 90 },
          anim: { preset: 'pulse', delay: 0.7, duration: 1.2, loop: true, intensity: 1 },
        }),
        shape({
          name: 'Bar',
          shape: 'underline',
          shapeW: 0.9,
          shapeH: 0.02,
          x: 0.5,
          y: 0.93,
          fill: { type: 'gradient', color: '#ef4444', color2: '#f59e0b', angle: 0 },
          anim: { preset: 'slideLeft', delay: 0.2, duration: 0.6, loop: false, intensity: 1 },
        }),
      ],
    }),
  },
];

/** Apply a template on top of an existing project (keeps the model). */
export function applyTemplate(project: ProjectState, template: Template): ProjectState {
  const patch = template.build();
  const next: ProjectState = structuredClone(project);
  if (patch.background) Object.assign(next.background, patch.background);
  if (patch.layers) next.layers = patch.layers;
  if (patch.canvas) next.canvas = patch.canvas;
  if (patch.camera) Object.assign(next.camera, patch.camera);
  next.selectedId = null;
  return next;
}

export function getTemplate(id: string): Template | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
