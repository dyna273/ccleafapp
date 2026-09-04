import type { ProjectState } from '../state/types';
import { saveBlob, sanitizeFilename } from './download';

export interface SavedProject {
  app: 'leafforge';
  version: 1;
  savedAt: string;
  project: ProjectState;
  /** raw .bbmodel text, base64 encoded, so a reopened project keeps its model */
  model?: { name: string; data: string; encoding: 'base64' };
}

function utf8ToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToUtf8(b64: string): string {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export async function saveProjectFile(
  project: ProjectState,
  model?: { name: string; text: string },
  filename = 'leafforge-project',
): Promise<void> {
  const payload: SavedProject = {
    app: 'leafforge',
    version: 1,
    savedAt: new Date().toISOString(),
    project,
  };
  if (model?.text) {
    payload.model = { name: model.name, data: utf8ToBase64(model.text), encoding: 'base64' };
  }
  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
  await saveBlob(blob, `${sanitizeFilename(filename)}.leafforge.json`);
}

export function parseProjectFile(text: string): SavedProject {
  const data = JSON.parse(text) as SavedProject;
  if (!data || data.app !== 'leafforge' || !data.project) {
    throw new Error('Not a LeafForge project file');
  }
  return data;
}

export function decodeModel(saved: SavedProject): { name: string; text: string } | null {
  if (!saved.model?.data) return null;
  return { name: saved.model.name, text: base64ToUtf8(saved.model.data) };
}

export function loadProjectFromText(text: string) {
  const saved = parseProjectFile(text);
  const model = decodeModel(saved);
  return { project: saved.project, model };
}
