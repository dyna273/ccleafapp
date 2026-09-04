/**
 * Types for the Blockbench `.bbmodel` project format (format version 3.2 -> 5.0).
 *
 * Reference: Blockbench source `js/formats/bbmodel.js` (processCompatibility)
 * and `js/outliner/types/cube.js` (updateUV / box UV template).
 */

export type Vec3 = [number, number, number];
/** [x1, y1, x2, y2] in texture-pixel space. x2/y2 may be < x1/y1 (flipped). */
export type UV = [number, number, number, number];

export type FaceName = 'north' | 'south' | 'east' | 'west' | 'up' | 'down';

export interface BBFace {
  uv?: UV;
  texture?: number | null;
  rotation?: number;
  tintindex?: number;
  cullface?: string;
  enabled?: boolean;
}

export interface BBCube {
  name?: string;
  type?: 'cube';
  uuid: string;
  from: Vec3;
  to: Vec3;
  /** pivot in model space (NOT local) */
  origin?: Vec3;
  rotation?: Vec3;
  color?: number;
  export?: boolean;
  visibility?: boolean;
  locked?: boolean;
  box_uv?: boolean;
  rescale?: boolean;
  autouv?: number;
  mirror_uv?: boolean;
  uv_offset?: [number, number];
  inflate?: number;
  stretch?: Vec3;
  faces?: Partial<Record<FaceName, BBFace>>;
  /** v4.x and older stored `shade: false` instead of mirror_uv */
  shade?: boolean;
  nbt?: string;
}

export interface BBMeshVertexMap { [key: string]: [number, number] }

export interface BBMeshFace {
  uv?: BBMeshVertexMap;
  vertices: string[];
  texture?: number | null;
}

export interface BBMesh {
  name?: string;
  type: 'mesh';
  uuid: string;
  origin?: Vec3;
  rotation?: Vec3;
  color?: number;
  export?: boolean;
  visibility?: boolean;
  locked?: boolean;
  vertices: { [key: string]: Vec3 };
  faces: { [key: string]: BBMeshFace };
  render_order?: string;
}

export type BBElement = BBCube | BBMesh;

export interface BBGroup {
  name?: string;
  uuid: string;
  origin?: Vec3;
  rotation?: Vec3;
  color?: number;
  export?: boolean;
  visibility?: boolean;
  mirror_uv?: boolean;
  box_uv?: boolean;
  autouv?: number;
  /** present on v4.x and older where groups lived inline in the outliner */
  children?: BBOutlineNode[];
  nbt?: string;
}

export type BBOutlineNode = string | BBGroup;

export interface BBTexture {
  uuid?: string;
  name?: string;
  id?: string;
  path?: string;
  relative_path?: string;
  width?: number;
  height?: number;
  uv_width?: number;
  uv_height?: number;
  particle?: boolean;
  render_mode?: 'default' | 'emissive' | 'layered';
  render_sides?: 'auto' | 'front' | 'double';
  internal?: boolean;
  source?: string;
  frameCount?: number;
  visible?: boolean;
}

export interface BBKeyframe {
  channel: 'position' | 'rotation' | 'scale';
  uuid?: string;
  time: number;
  color?: number;
  interpolation?: 'linear' | 'step' | 'catmullrom' | 'bezier';
  data_points: Array<{ x?: number | string; y?: number | string; z?: number | string }>;
  bezier_linked?: boolean;
  bezier_left_time?: Vec3;
  bezier_left_value?: Vec3;
  bezier_right_time?: Vec3;
  bezier_right_value?: Vec3;
}

export interface BBAnimator {
  name?: string;
  type?: string;
  keyframes?: BBKeyframe[];
}

export interface BBAnimation {
  uuid: string;
  name: string;
  loop?: 'once' | 'loop' | 'hold';
  override?: boolean;
  length?: number;
  snapping?: number;
  selected?: boolean;
  anim_time_update?: string;
  blend_weight?: string;
  start_delay?: string;
  loop_delay?: string;
  animators?: { [uuid: string]: BBAnimator };
}

export interface BBModelFile {
  meta?: {
    format_version?: string;
    format?: string;
    model_format?: string;
    box_uv?: boolean;
    backup?: boolean;
    bone_rig?: boolean;
  };
  name?: string;
  model_identifier?: string;
  geometry_name?: string;
  resolution?: { width: number; height: number };
  elements?: BBElement[];
  /** v4.x and older */
  cubes?: BBElement[];
  groups?: BBGroup[];
  outliner?: BBOutlineNode[];
  textures?: BBTexture[];
  animations?: BBAnimation[];
  animation_controllers?: unknown[];
  display?: Record<string, { rotation?: Vec3; translation?: Vec3; scale?: Vec3 }>;
  history?: unknown[];
}

export const FACE_ORDER: FaceName[] = ['east', 'west', 'up', 'down', 'south', 'north'];
