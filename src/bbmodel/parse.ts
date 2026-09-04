import LZUTF8 from 'lzutf8';
import type {
  BBAnimation,
  BBTexture,
  BBElement,
  BBGroup,
  BBKeyframe,
  BBModelFile,
  BBOutlineNode,
  Vec3,
} from './types';

/* ------------------------------------------------------------------ */
/*  Version helpers                                                     */
/* ------------------------------------------------------------------ */

function parseVersion(v: string): number[] {
  return String(v || '')
    .split('.')
    .map((n) => parseInt(n, 10) || 0);
}

export function compareVersion(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

/**
 * Blockbench's `invertMolang`. Keyframe values may be numbers or Molang
 * strings; for the numeric case (which is all we can evaluate) it negates.
 */
function invertMolang(value: number | string | undefined): number | string | undefined {
  if (value === undefined || value === null) return value;
  if (typeof value === 'number') return -value;
  const str = String(value).trim();
  const num = parseFloat(str);
  if (!isNaN(num) && str.match(/^-?[\d.]+$/)) {
    return (num === 0 ? 0 : -num).toString();
  }
  return value;
}

function num(value: number | string | undefined, fallback = 0): number {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'number') return isFinite(value) ? value : fallback;
  const parsed = parseFloat(String(value));
  return isNaN(parsed) ? fallback : parsed;
}

/* ------------------------------------------------------------------ */
/*  Decoding                                                            */
/* ------------------------------------------------------------------ */

const LZ_MARKER = '<lz>';

/** `.bbmodel` files may be LZUTF8 compressed; Blockbench prefixes those with `<lz>`. */
export function decodeBBModelBuffer(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  // UTF-8 BOM check / fast path: does it look like JSON already?
  const head = new TextDecoder('utf-8', { fatal: false }).decode(bytes.slice(0, 64));
  if (head.trimStart().startsWith('{')) {
    return new TextDecoder().decode(bytes);
  }
  let payload = bytes;
  const prefix = new TextDecoder().decode(bytes.slice(0, LZ_MARKER.length));
  if (prefix === LZ_MARKER) {
    payload = bytes.slice(LZ_MARKER.length);
  }
  // LZUTF8 "StorageBinaryString" is a latin1-ish string; lzutf8 accepts it as InputType.
  const binaryString = Array.from(payload)
    .map((b) => String.fromCharCode(b))
    .join('');
  try {
    const out = LZUTF8.decompress(binaryString, { inputEncoding: 'StorageBinaryString', outputEncoding: 'String' });
    if (out && String(out).trimStart().startsWith('{')) return String(out);
  } catch (err) {
    /* fall through */
  }
  // Last resort: plain text
  return new TextDecoder().decode(bytes);
}

/* ------------------------------------------------------------------ */
/*  Compatibility / migration (mirrors Blockbench processCompatibility) */
/* ------------------------------------------------------------------ */

export interface ParsedModel {
  raw: BBModelFile;
  formatVersion: string;
  boxUV: boolean;
  resolution: { width: number; height: number };
  elements: BBElement[];
  groups: Map<string, BBGroup>;
  outliner: BBOutlineNode[];
  textures: BBTexture[];
  animations: BBAnimation[];
  /** element/group uuid -> node */
  nodes: Map<string, BBGroup | BBElement>;
}

function collectInlineGroups(nodes: BBOutlineNode[], into: Map<string, BBGroup>) {
  for (const node of nodes) {
    if (typeof node === 'object' && node) {
      into.set(node.uuid, node);
      if (Array.isArray(node.children)) collectInlineGroups(node.children, into);
    }
  }
}

function migrateKeyframesBefore50(animations: BBAnimation[] | undefined) {
  if (!animations) return;
  for (const anim of animations) {
    const animators = anim.animators || {};
    for (const uuid in animators) {
      const animator = animators[uuid];
      for (const kf of animator.keyframes || []) {
        for (const dp of kf.data_points || []) {
          if ((kf.channel === 'position' || kf.channel === 'rotation') && dp.x) {
            dp.x = invertMolang(dp.x);
          }
          if (kf.channel === 'rotation' && dp.y) {
            dp.y = invertMolang(dp.y);
          }
        }
        if (kf.interpolation === 'bezier' && kf.bezier_left_value && kf.bezier_right_value) {
          if (kf.channel === 'position' || kf.channel === 'rotation') {
            kf.bezier_left_value[0] *= -1;
            kf.bezier_right_value[0] *= -1;
          }
          if (kf.channel === 'rotation') {
            kf.bezier_left_value[1] *= -1;
            kf.bezier_right_value[1] *= -1;
          }
        }
      }
    }
  }
}

function invertZRotationPre32(nodes: BBOutlineNode[]) {
  for (const node of nodes) {
    if (typeof node === 'object' && node) {
      if (node.rotation) node.rotation[2] *= -1;
      if (Array.isArray(node.children)) invertZRotationPre32(node.children);
    }
  }
}

export function parseBBModel(json: BBModelFile): ParsedModel {
  const model = json;
  if (!model.meta) {
    // Be forgiving: wrap bare model payloads
    (model as any).meta = { format_version: '4.0', model_format: 'free', box_uv: false };
  }
  if (!model.meta!.format_version) {
    model.meta!.format_version = (model.meta as any).format;
  }
  const formatVersion = model.meta!.format_version || '4.0';

  if (!model.meta!.model_format) {
    model.meta!.model_format = (model.meta as any).bone_rig ? 'bedrock_old' : 'java_block';
  }
  if ((model as any).cubes && !model.elements) {
    model.elements = (model as any).cubes;
  }

  const boxUV = !!model.meta!.box_uv;

  if (model.elements && boxUV && compareVersion(formatVersion, '4.5') < 0) {
    for (const el of model.elements) {
      if ((el as any).shade === false) (el as any).mirror_uv = true;
    }
  }

  if (model.outliner && compareVersion(formatVersion, '3.2') < 0) {
    invertZRotationPre32(model.outliner);
  }

  if (compareVersion(formatVersion, '5.0') < 0) {
    migrateKeyframesBefore50(model.animations);
  }

  // v5.0 stores groups in `groups`; older versions inline them in the outliner.
  const groups = new Map<string, BBGroup>();
  if (Array.isArray(model.groups)) {
    for (const g of model.groups) groups.set(g.uuid, g);
  }
  if (Array.isArray(model.outliner)) {
    collectInlineGroups(model.outliner, groups);
  }

  const elements = model.elements || [];
  const nodes = new Map<string, BBGroup | BBElement>();
  for (const el of elements) nodes.set(el.uuid, el);
  for (const [uuid, g] of groups) nodes.set(uuid, g);

  const resolution = {
    width: model.resolution?.width || 16,
    height: model.resolution?.height || 16,
  };

  return {
    raw: model,
    formatVersion,
    boxUV,
    resolution,
    elements,
    groups,
    outliner: model.outliner || [],
    textures: model.textures || [],
    animations: model.animations || [],
    nodes,
  };
}

export function parseBBModelText(text: string): ParsedModel {
  const json = JSON.parse(text) as BBModelFile;
  return parseBBModel(json);
}

export async function loadBBModelFile(file: File | ArrayBuffer | string): Promise<ParsedModel> {
  if (typeof file === 'string') return parseBBModelText(file);
  if (file instanceof ArrayBuffer) {
    return parseBBModelText(decodeBBModelBuffer(file));
  }
  const buf = await file.arrayBuffer();
  return parseBBModelText(decodeBBModelBuffer(buf));
}

/** Keyframes usually carry numbers, but Molang strings exist. Resolve to a number. */
export function keyframeValue(v: number | string | undefined): number {
  return num(v);
}

export function keyframeVec3(dp: { x?: number | string; y?: number | string; z?: number | string }): Vec3 {
  return [num(dp.x), num(dp.y), num(dp.z)];
}

export type { BBKeyframe };
