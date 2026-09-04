import * as THREE from 'three';
import type { ParsedModel } from './parse';
import { buildCubeGeometries, buildMeshGeometries, type GeometryBuildContext } from './geometry';
import {
  compileAnimation,
  evaluateTrack,
  resolveTime,
  type CompiledAnimation,
  type CompiledAnimator,
} from './animation';
import type { BBElement, BBGroup, BBOutlineNode, Vec3 } from './types';

const DEG = Math.PI / 180;
/** Blockbench's default `Format.euler_order`; equals extrinsic XYZ. */
export const EULER_ORDER: THREE.EulerOrder = 'ZYX';

export interface SceneNode {
  uuid: string;
  name: string;
  /** pivot: position = origin (+ animated offset), rotation = rest + animated */
  pivot: THREE.Object3D;
  /** counter-translation, so geometry authored in model space rotates about the pivot */
  offset: THREE.Object3D;
  baseOrigin: Vec3;
  baseRotation: Vec3;
  animator?: CompiledAnimator;
  visibleDefault: boolean;
}

export interface BuiltScene {
  root: THREE.Group;
  nodes: SceneNode[];
  nodeMap: Map<string, SceneNode>;
  animations: CompiledAnimation[];
  materials: THREE.Material[];
  textures: THREE.Texture[];
  /** set to false if the model had no usable geometry */
  empty: boolean;
}

export interface TextureProvider {
  (index: number): THREE.Texture | null;
}

export interface BuildOptions {
  textureFor: TextureProvider;
  textureMeta?: (index: number) => { render_mode?: string; render_sides?: string } | undefined;
  /** materials are pushed here so the caller can dispose them */
  materials: THREE.Material[];
}

function toVec3(v: number[] | undefined): Vec3 {
  if (!v) return [0, 0, 0];
  return [v[0] || 0, v[1] || 0, v[2] || 0];
}

/**
 * Build the three.js scene graph for a parsed model.
 *
 * bbmodel stores `origin` in absolute model space, so every node becomes
 *   pivot(position = origin, rotation = R) -> offset(position = -origin)
 * which produces the transform  T(origin) * R * T(-origin).  Children hang off
 * the offset object so they inherit the full parent transform.
 */
export function buildModelScene(model: ParsedModel, options: BuildOptions): BuiltScene {
  const root = new THREE.Group();
  root.name = model.raw.name || 'model';
  const nodes: SceneNode[] = [];
  const nodeMap = new Map<string, SceneNode>();
  const { materials } = options;

  const ctx: GeometryBuildContext = {
    resolution: model.resolution,
    boxUV: model.boxUV,
    defaultTexture: 0,
  };

  const materialCache = new Map<string, THREE.Material>();
  const getMaterial = (texIdx: number | null) => {
    const key = String(texIdx);
    const cached = materialCache.get(key);
    if (cached) return cached;
    const map = texIdx !== null && texIdx >= 0 ? options.textureFor(texIdx) : null;
    const meta = texIdx !== null && texIdx >= 0 ? options.textureMeta?.(texIdx) : undefined;
    const common = {
      vertexColors: true,
      transparent: true,
      alphaTest: 0.35,
      side: meta?.render_sides === 'double' ? THREE.DoubleSide : THREE.FrontSide,
    };
    const mat: THREE.Material =
      meta?.render_mode === 'emissive'
        ? new THREE.MeshBasicMaterial({ ...common, map: map || null, color: 0xffffff })
        : new THREE.MeshLambertMaterial({ ...common, map: map || null, color: map ? 0xffffff : 0xcfcfcf });
    materialCache.set(key, mat);
    materials.push(mat);
    return mat;
  };

  const elementMeshes = new Map<string, THREE.Object3D[]>();
  for (const el of model.elements) {
    const built =
      el.type === 'mesh'
        ? buildMeshGeometries(el as never, ctx)
        : buildCubeGeometries(el as never, ctx);
    const meshes: THREE.Object3D[] = [];
    for (const { geometry, textureIndex } of built) {
      const mesh = new THREE.Mesh(geometry, getMaterial(textureIndex));
      mesh.name = el.name || '';
      mesh.visible = el.visibility !== false;
      meshes.push(mesh);
    }
    elementMeshes.set(el.uuid, meshes);
  }

  const makeNode = (
    uuid: string,
    name: string,
    origin: Vec3,
    rotation: Vec3,
    visible: boolean,
    parent: THREE.Object3D,
  ): SceneNode => {
    const pivot = new THREE.Object3D();
    pivot.name = name || uuid;
    pivot.position.set(origin[0], origin[1], origin[2]);
    pivot.rotation.set(rotation[0] * DEG, rotation[1] * DEG, rotation[2] * DEG, EULER_ORDER);
    const offset = new THREE.Object3D();
    offset.position.set(-origin[0], -origin[1], -origin[2]);
    pivot.add(offset);
    parent.add(pivot);
    const node: SceneNode = {
      uuid,
      name: name || 'node',
      pivot,
      offset,
      baseOrigin: origin,
      baseRotation: rotation,
      visibleDefault: visible,
    };
    nodes.push(node);
    nodeMap.set(uuid, node);
    return node;
  };

  const build = (entries: BBOutlineNode[], parentOffset: THREE.Object3D) => {
    for (const entry of entries) {
      if (typeof entry === 'string') {
        const el = model.nodes.get(entry) as BBElement | undefined;
        if (!el) continue;
        const meshes = elementMeshes.get(el.uuid);
        if (!meshes || !meshes.length) continue;
        const node = makeNode(
          el.uuid,
          el.name || 'element',
          toVec3(el.origin),
          toVec3(el.rotation as number[]),
          el.visibility !== false,
          parentOffset,
        );
        for (const m of meshes) node.offset.add(m);
      } else if (entry && typeof entry === 'object') {
        const group = entry as BBGroup;
        const node = makeNode(
          group.uuid,
          group.name || 'group',
          toVec3(group.origin),
          toVec3(group.rotation as number[]),
          group.visibility !== false,
          parentOffset,
        );
        // v4.x nests groups inline; v5.0 keeps the outliner flat
        if (Array.isArray(group.children)) build(group.children, node.offset);
      }
    }
  };

  const roots: BBOutlineNode[] =
    model.outliner.length && model.outliner.some((n) => typeof n === 'object' || model.nodes.has(n as string))
      ? model.outliner
      : model.elements.map((e) => e.uuid);
  build(roots, root);

  // Any element missing from the outliner still deserves to be visible.
  for (const el of model.elements) {
    if (nodeMap.has(el.uuid)) continue;
    const meshes = elementMeshes.get(el.uuid);
    if (!meshes || !meshes.length) continue;
    const node = makeNode(
      el.uuid,
      el.name || 'element',
      toVec3(el.origin),
      toVec3(el.rotation as number[]),
      el.visibility !== false,
      root,
    );
    for (const m of meshes) node.offset.add(m);
  }

  const animations = model.animations.map(compileAnimation);
  for (const anim of animations) {
    for (const [uuid, animator] of anim.animators) {
      const node = nodeMap.get(uuid);
      if (node) node.animator = animator;
    }
  }

  root.updateMatrixWorld(true);
  return {
    root,
    nodes,
    nodeMap,
    animations,
    materials,
    textures: [],
    empty: nodes.length === 0,
  };
}

/** Reset every animated node back to its authored rest pose. */
export function resetPose(nodes: SceneNode[]) {
  for (const node of nodes) {
    node.pivot.position.set(node.baseOrigin[0], node.baseOrigin[1], node.baseOrigin[2]);
    node.pivot.rotation.set(
      node.baseRotation[0] * DEG,
      node.baseRotation[1] * DEG,
      node.baseRotation[2] * DEG,
      EULER_ORDER,
    );
    node.pivot.scale.set(1, 1, 1);
  }
}

export function applyAnimationToNodes(
  nodes: SceneNode[],
  animation: CompiledAnimation | null,
  rawTime: number,
) {
  resetPose(nodes);
  if (!animation) return;
  const t = resolveTime(animation, rawTime);
  for (const node of nodes) {
    const animator = node.animator;
    if (!animator) continue;
    const pos = evaluateTrack(animator.tracks.position, t);
    const rot = evaluateTrack(animator.tracks.rotation, t);
    const scl = evaluateTrack(animator.tracks.scale, t);
    if (pos) {
      node.pivot.position.set(
        node.baseOrigin[0] + pos[0],
        node.baseOrigin[1] + pos[1],
        node.baseOrigin[2] + pos[2],
      );
    }
    if (rot) {
      node.pivot.rotation.set(
        (node.baseRotation[0] + rot[0]) * DEG,
        (node.baseRotation[1] + rot[1]) * DEG,
        (node.baseRotation[2] + rot[2]) * DEG,
        EULER_ORDER,
      );
    }
    if (scl) {
      node.pivot.scale.set(
        scl[0] === 0 ? 1 : scl[0],
        scl[1] === 0 ? 1 : scl[1],
        scl[2] === 0 ? 1 : scl[2],
      );
    }
  }
}
