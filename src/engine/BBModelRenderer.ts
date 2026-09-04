import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { ParsedModel } from '../bbmodel/parse';
import { buildModelScene, resetPose, applyAnimationToNodes, type SceneNode } from '../bbmodel/scene';
import type { CompiledAnimation } from '../bbmodel/animation';
import type { Vec3 } from '../bbmodel/types';

export interface RendererOptions {
  antialias?: boolean;
}

export interface ModelBounds {
  min: Vec3;
  max: Vec3;
  center: Vec3;
  size: Vec3;
  radius: number;
}

export class BBModelRenderer {
  /** fired whenever the user moves the camera, so the host can redraw */
  onCameraChange?: () => void;

  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  modelRoot = new THREE.Group();
  /** objects that should receive the generated contact shadow */
  private shadowPlane: THREE.Mesh | null = null;
  private shadowCanvas = document.createElement('canvas');
  private ground: THREE.Mesh | null = null;

  private nodes: SceneNode[] = [];
  private nodeMap = new Map<string, SceneNode>();
  private animations: CompiledAnimation[] = [];
  private materials: THREE.Material[] = [];
  private textures: THREE.Texture[] = [];
  private bounds: ModelBounds | null = null;

  /** user settings */
  smoothing = false;
  showShadow = true;
  shadowOpacity = 0.45;
  showGround = false;
  groundColor = '#3f9c46';
  lighting: 'minecraft' | 'studio' | 'flat' = 'studio';
  exposure = 1;

  constructor(canvas: HTMLCanvasElement, controlsElement?: HTMLElement, options: RendererOptions = {}) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: options.antialias !== false,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(35, 1, 0.1, 5000);
    // Blockbench's default camera sits at [-40, 32, -40]: it looks at the
    // model's front, because a model's "north" (-Z) face is its front.
    this.camera.position.set(-48, 40, -70);

    // Controls belong to the visible (composited) canvas, not the offscreen GL one.
    this.controls = new OrbitControls(this.camera, (controlsElement as HTMLElement) || canvas);
    this.controls.enableDamping = true;
    // the host redraws on demand, so it has to hear about camera changes
    this.controls.addEventListener('change', () => this.onCameraChange?.());
    this.controls.dampingFactor = 0.12;
    this.controls.rotateSpeed = 0.8;

    this.scene.add(this.modelRoot);
    this.setupLights();
  }

  /* ---------------------------------------------------------------- */

  private ambient!: THREE.AmbientLight;
  private hemi!: THREE.HemisphereLight;
  private key!: THREE.DirectionalLight;
  private fill!: THREE.DirectionalLight;
  private rim!: THREE.DirectionalLight;

  private setupLights() {
    this.ambient = new THREE.AmbientLight(0xffffff, 0.75);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x404050, 0.25);
    this.key = new THREE.DirectionalLight(0xffffff, 0.85);
    this.key.position.set(0.6, 1, 0.45);
    this.fill = new THREE.DirectionalLight(0xcfe3ff, 0.3);
    this.fill.position.set(-0.7, 0.25, -0.4);
    this.rim = new THREE.DirectionalLight(0xffffff, 0.25);
    this.rim.position.set(-0.3, 0.4, -1);
    this.scene.add(this.ambient, this.hemi, this.key, this.fill, this.rim);
  }

  applyLighting() {
    const e = this.exposure;
    switch (this.lighting) {
      case 'flat':
        this.ambient.intensity = 1 * e;
        this.hemi.intensity = 0;
        this.key.intensity = 0;
        this.fill.intensity = 0;
        this.rim.intensity = 0;
        break;
      case 'minecraft':
        this.ambient.intensity = 0.95 * e;
        this.hemi.intensity = 0.1 * e;
        this.key.intensity = 0.12 * e;
        this.fill.intensity = 0.05 * e;
        this.rim.intensity = 0.06 * e;
        break;
      case 'studio':
      default:
        this.ambient.intensity = 0.5 * e;
        this.hemi.intensity = 0.35 * e;
        this.key.intensity = 0.8 * e;
        this.fill.intensity = 0.35 * e;
        this.rim.intensity = 0.3 * e;
        break;
    }
  }

  /* ---------------------------------------------------------------- */

  disposeModel() {
    this.modelRoot.clear();
    for (const m of this.materials) m.dispose();
    for (const t of this.textures) t.dispose();
    this.materials = [];
    this.textures = [];
    this.nodes = [];
    this.nodeMap.clear();
    this.animations = [];
    this.bounds = null;
    this.shadowPlane = null;
    this.ground = null;
  }

  /** Load textures (embedded data URLs) into three.js textures. */
  private async loadTextures(model: ParsedModel): Promise<Array<THREE.Texture | null>> {
    const out: Array<THREE.Texture | null> = [];
    const loader = new THREE.TextureLoader();
    for (const tex of model.textures) {
      const src = tex.source;
      if (!src || !src.startsWith('data:')) {
        out.push(null);
        continue;
      }
      try {
        const texture = await new Promise<THREE.Texture>((resolve, reject) => {
          loader.load(src, resolve, undefined, reject);
        });
        texture.magFilter = this.smoothing ? THREE.LinearFilter : THREE.NearestFilter;
        texture.minFilter = this.smoothing
          ? THREE.LinearMipmapLinearFilter
          : THREE.NearestFilter;
        texture.generateMipmaps = this.smoothing;
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.name = tex.name || '';
        this.textures.push(texture);
        out.push(texture);
      } catch {
        out.push(null);
      }
    }
    return out;
  }

  async setModel(model: ParsedModel) {
    this.disposeModel();
    const textures = await this.loadTextures(model);
    this.textures = textures.filter((t): t is THREE.Texture => !!t);

    const built = buildModelScene(model, {
      materials: this.materials,
      textureFor: (index) => (index >= 0 ? textures[index] ?? null : null),
      textureMeta: (index) => model.textures[index],
    });
    this.nodes = built.nodes;
    this.nodeMap = built.nodeMap;
    this.animations = built.animations;
    this.modelRoot.add(built.root);

    this.computeBounds();
    this.applyLighting();
    this.createShadow();
    this.createGround();
  }

  private computeBounds() {
    const box = new THREE.Box3().setFromObject(this.modelRoot);
    if (box.isEmpty()) {
      this.bounds = { min: [0, 0, 0], max: [0, 0, 0], center: [0, 0, 0], size: [0, 0, 0], radius: 1 };
      return;
    }
    const min: Vec3 = [box.min.x, box.min.y, box.min.z];
    const max: Vec3 = [box.max.x, box.max.y, box.max.z];
    const size: Vec3 = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
    const center: Vec3 = [
      (min[0] + max[0]) / 2,
      (min[1] + max[1]) / 2,
      (min[2] + max[2]) / 2,
    ];
    const radius = Math.max(0.001, Math.sqrt(size[0] ** 2 + size[1] ** 2 + size[2] ** 2) / 2);
    this.bounds = { min, max, center, size, radius };
  }

  getBounds(): ModelBounds | null {
    return this.bounds;
  }

  getAnimations(): CompiledAnimation[] {
    return this.animations;
  }

  /* ---------------------------------------------------------------- */

  private createShadow() {
    if (this.shadowPlane) {
      this.scene.remove(this.shadowPlane);
      this.shadowPlane.geometry.dispose();
      (this.shadowPlane.material as THREE.Material).dispose();
      this.shadowPlane = null;
    }
    if (!this.bounds) return;
    const size = Math.max(this.bounds.size[0], this.bounds.size[2]) * 2.2 || 10;
    const c = this.shadowCanvas;
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, 128, 128);
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(0,0,0,1)');
    grad.addColorStop(0.55, 'rgba(0,0,0,0.55)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(64, 64, 64, 0, Math.PI * 2);
    g.fill();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      opacity: this.shadowOpacity,
    });
    const geo = new THREE.PlaneGeometry(size, size);
    const plane = new THREE.Mesh(geo, mat);
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(this.bounds.center[0], this.bounds.min[1] + 0.01, this.bounds.center[2]);
    plane.renderOrder = -1;
    this.shadowPlane = plane;
    this.scene.add(plane);
  }

  private groundSignature = '';
  private smoothingApplied = false;

  private createGround() {
    // Called on every settings change, so only rebuild when something that
    // the ground actually depends on has moved.
    const b = this.bounds;
    const signature = `${this.showGround}|${this.groundColor}|${b ? b.min.join(',') + b.size.join(',') : ''}`;
    if (this.ground && signature === this.groundSignature) return;
    this.groundSignature = signature;
    if (!this.showGround && !this.ground) return;
    if (this.ground) {
      this.scene.remove(this.ground);
      this.ground.geometry.dispose();
      (this.ground.material as THREE.Material).dispose();
      this.ground = null;
    }
    if (!this.showGround || !this.bounds) return;
    const size = Math.max(this.bounds.size[0], this.bounds.size[2]) * 6 || 60;
    const mat = new THREE.MeshLambertMaterial({ color: new THREE.Color(this.groundColor) });
    const geo = new THREE.PlaneGeometry(size, size);
    const plane = new THREE.Mesh(geo, mat);
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(this.bounds.center[0], this.bounds.min[1], this.bounds.center[2]);
    plane.renderOrder = -2;
    this.ground = plane;
    this.scene.add(plane);
  }

  setShadowVisible(visible: boolean) {
    this.showShadow = visible;
    if (this.shadowPlane) this.shadowPlane.visible = visible;
  }

  setShadowOpacity(value: number) {
    this.shadowOpacity = value;
    if (this.shadowPlane) (this.shadowPlane.material as THREE.MeshBasicMaterial).opacity = value;
  }

  refreshGround() {
    this.createGround();
  }

  setSmoothing(smooth: boolean) {
    if (this.smoothing === smooth && this.smoothingApplied) return;
    this.smoothing = smooth;
    this.smoothingApplied = true;
    for (const t of this.textures) {
      t.magFilter = smooth ? THREE.LinearFilter : THREE.NearestFilter;
      t.minFilter = smooth ? THREE.LinearMipmapLinearFilter : THREE.NearestFilter;
      t.generateMipmaps = smooth;
      t.needsUpdate = true;
    }
  }

  /* ---------------------------------------------------------------- */

  /** Reset every animated node back to its rest pose. */
  resetPose() {
    resetPose(this.nodes);
    this.modelRoot.updateMatrixWorld(true);
  }

  applyAnimation(animation: CompiledAnimation | null, time: number) {
    applyAnimationToNodes(this.nodes, animation, time);
    this.modelRoot.updateMatrixWorld(true);
  }

  /* ---------------------------------------------------------------- */

  frameModel(margin = 1.25) {
    const b = this.bounds;
    if (!b) return;
    const radius = b.radius * margin;
    const fov = (this.camera.fov * Math.PI) / 180;
    let dist = radius / Math.sin(fov / 2);
    const aspect = this.camera.aspect || 1;
    if (aspect < 1) dist /= aspect;
    this.controls.target.set(b.center[0], b.center[1], b.center[2]);
    const dir = new THREE.Vector3(-0.65, 0.42, -1).normalize();
    this.camera.position.copy(this.controls.target).addScaledVector(dir, dist);
    this.camera.near = Math.max(0.01, dist / 500);
    this.camera.far = dist * 12;
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  /** Camera preset: 'three-quarter' | 'front' | 'side' | 'top' | 'hero' | 'low' */
  setCameraPreset(preset: string) {
    const b = this.bounds;
    if (!b) return;
    const fov = (this.camera.fov * Math.PI) / 180;
    let dist = (b.radius * 1.25) / Math.sin(fov / 2);
    if (this.camera.aspect < 1) dist /= this.camera.aspect;
    const dirs: Record<string, THREE.Vector3> = {
      'three-quarter': new THREE.Vector3(-0.65, 0.42, -1),
      front: new THREE.Vector3(0, 0.12, -1),
      back: new THREE.Vector3(0, 0.12, 1),
      side: new THREE.Vector3(1, 0.12, 0),
      top: new THREE.Vector3(-0.15, 1, -0.25),
      hero: new THREE.Vector3(-0.35, -0.18, -1),
      low: new THREE.Vector3(-0.8, 0.75, -0.9),
    };
    const dir = (dirs[preset] || dirs['three-quarter']).clone().normalize();
    const targetY = preset === 'hero' ? b.center[1] + b.size[1] * 0.12 : b.center[1];
    this.controls.target.set(b.center[0], targetY, b.center[2]);
    this.camera.position.copy(this.controls.target).addScaledVector(dir, dist);
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  setFov(fov: number) {
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
  }

  resize(width: number, height: number) {
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.disposeModel();
    this.controls.dispose();
    this.renderer.dispose();
  }
}
