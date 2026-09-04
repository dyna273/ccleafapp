import * as THREE from 'three';
import { BBModelRenderer } from './BBModelRenderer';
import { drawBackground, drawLayers, type ImageCache } from './compositor';
import { overlayDuration } from './presets';
import type { ProjectState, Layer } from '../state/types';
import type { ParsedModel } from '../bbmodel/parse';

export class StudioEngine {
  glCanvas: HTMLCanvasElement;
  /** offscreen canvas used for full-resolution compositing and export */
  compCanvas: HTMLCanvasElement;
  compCtx: CanvasRenderingContext2D;
  renderer: BBModelRenderer;

  project: ProjectState;
  images: ImageCache = new Map();
  model: ParsedModel | null = null;
  modelName = '';

  /** master clock in seconds */
  time = 0;
  playing = false;
  /** frames rendered - bumped to signal the React layer that a redraw happened */
  private baseDistance = 10;
  private currentPreset = 'three-quarter';
  private needsDraw = true;
  private cameraSignature = '';

  constructor(project: ProjectState, glCanvas: HTMLCanvasElement, viewCanvas: HTMLCanvasElement) {
    this.project = project;
    this.glCanvas = glCanvas;
    this.renderer = new BBModelRenderer(glCanvas, viewCanvas);
    this.compCanvas = viewCanvas;
    this.compCtx = viewCanvas.getContext('2d')!;
    // orbiting/zooming has to force a composite, not just a GL redraw
    this.renderer.onCameraChange = () => this.invalidate();
  }

  invalidate() {
    this.needsDraw = true;
  }

  /* ---------------------------------------------------------------- */
  /*  Assets                                                            */
  /* ---------------------------------------------------------------- */

  async loadImage(src: string): Promise<HTMLImageElement | null> {
    if (!src) return null;
    const cached = this.images.get(src);
    if (cached) return cached;
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        this.images.set(src, img);
        this.invalidate();
        resolve(img);
      };
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  async ensureAssets() {
    const jobs: Promise<unknown>[] = [];
    if (this.project.background.kind === 'image' && this.project.background.src) {
      jobs.push(this.loadImage(this.project.background.src));
    }
    for (const layer of this.project.layers) {
      if (layer.kind === 'image' && layer.src) jobs.push(this.loadImage(layer.src));
    }
    await Promise.all(jobs);
  }

  /* ---------------------------------------------------------------- */
  /*  Model                                                             */
  /* ---------------------------------------------------------------- */

  async setModel(model: ParsedModel, name: string) {
    this.model = model;
    this.modelName = name;
    await this.renderer.setModel(model);
    this.applyCamera();
    this.applyRenderSettings();
    this.invalidate();
  }

  clearModel() {
    this.model = null;
    this.modelName = '';
    this.renderer.disposeModel();
    this.invalidate();
  }

  /** Push every project setting into the renderer, but only move the camera
   *  when the camera controls themselves changed (so manual orbiting sticks). */
  syncSettings() {
    this.applyRenderSettings();
    const p = this.project;
    const signature = JSON.stringify([p.camera, p.model.zoom, p.canvas.width, p.canvas.height]);
    if (signature !== this.cameraSignature) {
      this.cameraSignature = signature;
      this.applyCamera();
    }
  }

  applyRenderSettings() {
    const p = this.project;
    this.renderer.lighting = p.lighting;
    this.renderer.exposure = p.exposure;
    this.renderer.applyLighting();
    this.renderer.setSmoothing(p.smoothing);
    this.renderer.setShadowVisible(p.model.shadowEnabled);
    this.renderer.setShadowOpacity(p.model.shadowOpacity);
    this.renderer.showGround = p.model.groundEnabled;
    this.renderer.groundColor = p.model.groundColor;
    this.renderer.refreshGround();
    this.renderer.setFov(p.camera.fov);
    this.invalidate();
  }

  /** @param timeOrbit extra Y rotation in degrees (used by the turntable) */
  applyCamera(timeOrbit = 0) {
    const p = this.project;
    if (this.currentPreset !== p.camera.preset) {
      this.currentPreset = p.camera.preset;
      this.renderer.setCameraPreset(p.camera.preset);
      this.baseDistance = this.renderer.camera.position.distanceTo(this.renderer.controls.target);
    }
    this.renderer.setFov(p.camera.fov);
    // zoom + orbit offsets
    const target = this.renderer.controls.target;
    const dist = this.baseDistance / Math.max(0.05, p.model.zoom * p.camera.distance);
    const dir = new THREE.Vector3().subVectors(this.renderer.camera.position, target).normalize();
    const euler = new THREE.Euler(
      (p.camera.orbitX * Math.PI) / 180,
      ((p.camera.orbitY + timeOrbit) * Math.PI) / 180,
      0,
      'YXZ',
    );
    dir.applyEuler(euler);
    this.renderer.camera.position.copy(target).addScaledVector(dir, dist);
    this.renderer.camera.lookAt(target);
    this.renderer.controls.update();
    this.invalidate();
  }

  /** Called after the user finishes an orbit drag so we can persist it. */
  syncCameraFromControls() {
    const base = this.renderer.camera.position.distanceTo(this.renderer.controls.target);
    this.baseDistance = base;
    void base;
  }

  /* ---------------------------------------------------------------- */
  /*  Drawing                                                           */
  /* ---------------------------------------------------------------- */

  /** Total overlay animation length in seconds. */
  get overlayLength(): number {
    return overlayDuration(this.project.layers);
  }

  getAnimationLength(): number {
    const anims = this.renderer.getAnimations();
    const idx = this.project.animation.index;
    if (idx >= 0 && anims[idx]) return anims[idx].length / Math.max(0.05, this.project.animation.speed);
    return 0;
  }

  /** Suggested video duration: model loop vs overlay settle, whichever is longer. */
  suggestedDuration(): number {
    const anim = this.getAnimationLength();
    const overlay = this.overlayLength;
    return Math.max(1, Math.ceil(Math.max(anim > 0 ? Math.max(anim, overlay) : overlay, 1) * 100) / 100);
  }

  /**
   * Render one frame at the project's native resolution onto `target`.
   * @param scale multiplies the output resolution (1 = project size)
   */
  renderFrame(time: number, target: HTMLCanvasElement, ctx: CanvasRenderingContext2D, scale = 1) {
    const p = this.project;
    const w = Math.max(2, Math.round(p.canvas.width * scale));
    const h = Math.max(2, Math.round(p.canvas.height * scale));

    if (target.width !== w || target.height !== h) {
      target.width = w;
      target.height = h;
    }

    // --- 3D pass -------------------------------------------------
    const anims = this.renderer.getAnimations();
    const idx = p.animation.index;
    const anim = idx >= 0 ? anims[idx] ?? null : null;
    const animTime = time * p.animation.speed;
    this.renderer.applyAnimation(anim, animTime);

    // turntable: keep the camera spinning while the timeline plays
    if (p.camera.autoOrbit) this.applyCamera(p.camera.autoOrbit * time);

    const glW = Math.round(w * (p.quality === 'draft' ? 0.5 : 1));
    const glH = Math.round(h * (p.quality === 'draft' ? 0.5 : 1));
    if (this.glCanvas.width !== glW || this.glCanvas.height !== glH) {
      this.renderer.resize(glW, glH);
    }
    this.renderer.render();

    // --- composite ----------------------------------------------
    drawBackground(ctx, p.background, w, h, this.images);
    ctx.save();
    const dx = p.model.offsetX * w;
    const dy = (p.model.offsetY + p.model.lift) * h;
    ctx.translate(dx, dy);

    if (p.model.outline > 0 && this.model) {
      // cheap cartoon outline: draw the model slightly scaled up behind itself
      const pad = p.model.outline * (w / 1280);
      ctx.save();
      ctx.shadowColor = p.model.outlineColor;
      ctx.shadowBlur = 0;
      for (let a = 0; a < 8; a++) {
        const ang = (a / 8) * Math.PI * 2;
        ctx.drawImage(
          this.glCanvas,
          Math.cos(ang) * pad,
          Math.sin(ang) * pad,
          w,
          h,
        );
      }
      ctx.restore();
      ctx.save();
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = p.model.outlineColor;
      ctx.globalAlpha = 0.0;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    ctx.drawImage(this.glCanvas, 0, 0, w, h);
    ctx.restore();

    drawLayers(ctx, p.layers, w, h, time, this.images);

    if (p.showSafeArea) drawSafeArea(ctx, w, h);
    this.needsDraw = false;
  }

  /** Draw to the on-screen canvas at a preview-friendly resolution. */
  drawPreview(time: number) {
    const p = this.project;
    const maxW = Math.min(1600, window.devicePixelRatio > 1 ? 1600 : 1280);
    const scale = Math.min(1, maxW / p.canvas.width);
    this.renderFrame(time, this.compCanvas, this.compCtx, p.quality === 'draft' ? scale * 0.6 : scale);
    // keep the CSS size correct
    this.compCanvas.style.aspectRatio = `${p.canvas.width} / ${p.canvas.height}`;
  }

  tick(dt: number) {
    if (this.playing) {
      this.time += dt;
      this.invalidate();
    }
    this.renderer.controls.update();
    if (this.needsDraw) {
      this.drawPreview(this.time);
      return true;
    }
    return false;
  }

  /** Run `fn` with the render quality pinned (used by the exporters). */
  withQuality<T>(quality: ProjectState['quality'], fn: () => T): T {
    const previous = this.project.quality;
    this.project.quality = quality;
    try {
      return fn();
    } finally {
      this.project.quality = previous;
    }
  }

  /* ---------------------------------------------------------------- */

  setProject(project: ProjectState) {
    this.project = project;
    this.invalidate();
  }

  layers(): Layer[] {
    return this.project.layers;
  }

  dispose() {
    this.renderer.dispose();
  }
}

export function drawSafeArea(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = Math.max(1, w / 900);
  ctx.setLineDash([w / 90, w / 90]);
  const mx = w * 0.05;
  const my = h * 0.05;
  ctx.strokeRect(mx, my, w - mx * 2, h - my * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath();
  ctx.moveTo(w / 2, 0);
  ctx.lineTo(w / 2, h);
  ctx.moveTo(0, h / 2);
  ctx.lineTo(w, h / 2);
  ctx.stroke();
  ctx.restore();
}
