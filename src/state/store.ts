import { create } from 'zustand';
import { defaultProject, type Layer, type ProjectState } from './types';
import type { StudioEngine } from '../engine/studio';
import type { ParsedModel } from '../bbmodel/parse';
import { loadBBModelFile } from '../bbmodel/parse';

export interface AnimationInfo {
  name: string;
  length: number;
  index: number;
}

interface StoreState {
  project: ProjectState;
  engine: StudioEngine | null;
  model: ParsedModel | null;
  modelName: string;
  modelError: string | null;
  animations: AnimationInfo[];
  /** bumped whenever the project changes so the canvas knows to redraw */
  revision: number;
  busy: string | null;
  toast: { message: string; kind: 'info' | 'error' | 'success' } | null;
  tab: 'model' | 'scene' | 'design' | 'layers';
  rightTab: 'inspect' | 'export';
  /** length of the shared timeline in seconds */
  timelineLength: number;

  setEngine(engine: StudioEngine | null): void;
  patch(updater: (p: ProjectState) => void): void;
  setLayers(layers: Layer[]): void;
  updateLayer(id: string, patch: Partial<Layer>): void;
  select(id: string | null): void;
  setTimelineLength(v: number): void;
  setTab(tab: StoreState['tab']): void;
  setRightTab(tab: StoreState['rightTab']): void;
  setBusy(busy: string | null): void;
  notify(message: string, kind?: 'info' | 'error' | 'success'): void;

  loadModelFromFile(file: File | ArrayBuffer, nameOverride?: string): Promise<void>;
  loadModelFromUrl(url: string, name: string): Promise<void>;
  clearModel(): void;
  refreshAnimations(): void;

  reset(): void;
  loadProject(state: ProjectState): void;
}

let toastTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Sample models inlined into index.html by android/prepare-assets.mjs, so the
 * bundled demos load even where a file:// page may not fetch() other files.
 */
declare global {
  interface Window {
    LEAFFORGE_SAMPLES?: Record<string, string>;
  }
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export const useStore = create<StoreState>((set, get) => ({
  project: defaultProject(),
  engine: null,
  model: null,
  modelName: '',
  modelError: null,
  animations: [],
  revision: 0,
  busy: null,
  toast: null,
  tab: 'model',
  rightTab: 'inspect',
  timelineLength: 3,

  setEngine(engine) {
    set({ engine });
  },

  patch(updater) {
    const project = structuredClone(get().project);
    updater(project);
    set({ project, revision: get().revision + 1 });
    get().engine?.invalidate();
  },

  setLayers(layers) {
    get().patch((p) => {
      p.layers = layers;
    });
  },

  updateLayer(id, patchData) {
    get().patch((p) => {
      const layer = p.layers.find((l) => l.id === id);
      if (layer) Object.assign(layer, patchData);
    });
  },

  select(id) {
    get().patch((p) => {
      p.selectedId = id;
    });
  },

  setTimelineLength(v) {
    set({ timelineLength: Math.max(0.2, Math.min(30, v)) });
  },

  setTab(tab) {
    set({ tab });
  },
  setRightTab(rightTab) {
    set({ rightTab });
  },

  setBusy(busy) {
    set({ busy });
  },

  notify(message, kind = 'info') {
    set({ toast: { message, kind } });
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => set({ toast: null }), 3600);
  },

  async loadModelFromFile(file, nameOverride) {
    const engine = get().engine;
    if (!engine) return;
    set({ busy: 'Loading model…', modelError: null });
    try {
      const parsed = await loadBBModelFile(file);
      const name =
        nameOverride ||
        (typeof file !== 'string' && 'name' in file ? file.name : 'model.bbmodel');
      await engine.setModel(parsed, name);
      set({ model: parsed, modelName: name.replace(/\.bbmodel$/i, ''), busy: null });
      get().patch((p) => {
        p.animation.index = parsed.animations.length ? 0 : -1;
        p.animation.time = 0;
      });
      get().refreshAnimations();
      get().notify(`Loaded ${name}`, 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ busy: null, modelError: message });
      get().notify(`Could not open model: ${message}`, 'error');
    }
  },

  async loadModelFromUrl(url, name) {
    try {
      const key = url.split('/').pop() || '';
      const inlined = typeof window !== 'undefined' ? window.LEAFFORGE_SAMPLES?.[key] : undefined;
      const buffer = inlined ? base64ToArrayBuffer(inlined) : await (await fetch(url)).arrayBuffer();
      await get().loadModelFromFile(buffer, name);
      set({ modelName: name });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      get().notify(`Could not load ${name}: ${message}`, 'error');
    }
  },

  clearModel() {
    get().engine?.clearModel();
    set({ model: null, modelName: '', animations: [] });
    get().patch((p) => {
      p.animation.index = -1;
    });
  },

  refreshAnimations() {
    const engine = get().engine;
    if (!engine) return;
    const anims = engine.renderer.getAnimations();
    set({
      animations: anims.map((a, index) => ({ name: a.name, length: a.length, index })),
    });
  },

  reset() {
    const project = defaultProject();
    set({ project, revision: get().revision + 1 });
    get().engine?.invalidate();
  },

  loadProject(state) {
    set({ project: state, revision: get().revision + 1 });
    const engine = get().engine;
    if (engine) {
      engine.invalidate();
      engine.applyRenderSettings();
      engine.applyCamera();
    }
  },
}));
