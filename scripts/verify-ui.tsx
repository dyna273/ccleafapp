/**
 * UI smoke test.
 *
 * There is no browser in this environment, so this renders every React panel
 * with react-dom/server (which exercises props, hooks and every branch) and
 * drives the 2D compositor against a recording stub context. It catches the
 * class of bug that would otherwise only show up as a blank screen.
 *
 * Run with:  npm run verify:ui
 */
// NOTE: the DOM has to exist before React is imported.
import { drawCalls } from './jsdom-env';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { useStore } from '../src/state/store';
import { ModelPanel } from '../src/components/ModelPanel';
import { ScenePanel } from '../src/components/ScenePanel';
import { LayersPanel } from '../src/components/LayersPanel';
import { Inspector } from '../src/components/Inspector';
import { ExportPanel } from '../src/components/ExportPanel';
import { drawLayers, drawBackground } from '../src/engine/compositor';
import { parseBBModel } from '../src/bbmodel/parse';
import { defaultLayer, defaultProject } from '../src/state/types';
import { TEMPLATES, applyTemplate } from '../src/state/templates';
import { encodeGIF } from '../src/export/gif';

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  if (ok) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name} ${detail}`);
  }
}

/* --------------------------- render helper --------------------------- */

const container = document.getElementById('root')!;
let root: Root | null = null;

function renderPanel(Component: () => unknown): string {
  if (!root) root = createRoot(container);
  act(() => {
    root!.render(createElement(Component as never));
  });
  return container.innerHTML;
}

/* ------------------------------ fixtures ---------------------------- */

const parsed = parseBBModel(
  JSON.parse(readFileSync(resolve(process.cwd(), 'public/models/steve.bbmodel'), 'utf8')),
);

function stubEngine() {
  const animations = parsed.animations.map((a) => ({ name: a.name, length: a.length }));
  return {
    renderer: {
      getAnimations: () => animations,
    },
    project: useStore.getState().project,
    images: new Map(),
    invalidate() {},
    setProject() {},
    applyRenderSettings() {},
    applyCamera() {},
    suggestedDuration: () => 2.4,
    async setModel() {},
    async loadImage() {
      return null;
    },
  } as never;
}

/* ------------------------------- tests ------------------------------ */

async function main() {

console.log('\n[1] panels render with default state');
{
  const panels: Array<[string, () => unknown]> = [
    ['ModelPanel', ModelPanel],
    ['ScenePanel', ScenePanel],
    ['LayersPanel', LayersPanel],
    ['Inspector', Inspector],
    ['ExportPanel', ExportPanel],
  ];
  for (const [name, Component] of panels) {
    try {
      const html = renderPanel(Component);
      check(`${name} renders (${html.length} chars)`, html.length > 40, `len=${html.length}`);
    } catch (err) {
      check(`${name} renders`, false, String(err));
    }
  }
}

console.log('\n[2] panels render with a loaded model and selected layers');
{
  useStore.getState().setEngine(stubEngine());
  await useStore.getState().loadModelFromFile(
    new TextEncoder().encode(
      readFileSync(resolve(process.cwd(), 'public/models/steve.bbmodel'), 'utf8'),
    ).buffer,
  );
  const state = useStore.getState();
  check('model loaded into the store', !!state.model, String(state.modelError));
  check('animations discovered', state.animations.length === 5, `got ${state.animations.length}`);

  for (const [name, Component] of [
    ['ModelPanel', ModelPanel],
    ['ScenePanel', ScenePanel],
  ] as Array<[string, () => unknown]>) {
    try {
      const html = renderPanel(Component);
      check(`${name} renders with a model`, html.length > 200, `len=${html.length}`);
      if (name === 'ModelPanel') {
        check('ModelPanel shows the model info grid', html.includes('meta-grid'));
        check('ModelPanel lists the animation count', html.includes('Animations'));
      }
    } catch (err) {
      check(`${name} renders with a model`, false, String(err));
    }
  }
}

console.log('\n[3] inspector renders every layer kind');
{
  const store = useStore.getState();
  const text = defaultLayer('text', { name: 'Headline', text: 'EPIC MOMENT' });
  const shape = defaultLayer('shape', { name: 'Burst', shape: 'burst' });
  const image = defaultLayer('image', { name: 'Logo', src: 'data:image/png;base64,AAAA' });
  const arcText = defaultLayer('text', { name: 'Arc', arc: 40, stroke: { enabled: true, color: '#000', width: 0.02, style: 'extrude', depth: 8 } });
  for (const layer of [text, shape, image, arcText]) {
    act(() => {
      store.patch((p) => {
        p.layers = [layer];
        p.selectedId = layer.id;
      });
    });
    try {
      const html = renderPanel(Inspector);
      check(`inspector renders ${layer.kind} "${layer.name}"`, html.includes('section') && html.length > 300, `len=${html.length}`);
    } catch (err) {
      check(`inspector renders ${layer.kind} "${layer.name}"`, false, String(err));
    }
  }
  // every shape kind must survive a render
  for (const shape of ['rect', 'circle', 'arrow', 'burst', 'star', 'triangle', 'ring', 'underline', 'blob']) {
    act(() => {
      store.patch((p) => {
        p.layers = [defaultLayer('shape', { shape: shape as never })];
        p.selectedId = p.layers[0].id;
      });
    });
    try {
      renderPanel(Inspector);
      check(`shape "${shape}" renders`, true);
    } catch (err) {
      check(`shape "${shape}" renders`, false, String(err));
    }
  }
}

console.log('\n[4] store actions');
{
  const store = useStore.getState();
  store.reset();
  const before = useStore.getState().project.layers.length;
  act(() => {
    store.patch((p) => {
      p.layers.push(defaultLayer('text', { name: 'Extra' }));
    });
  });
  check('layer added', useStore.getState().project.layers.length === before + 1);
  const id = useStore.getState().project.layers.at(-1)!.id;
  act(() => store.updateLayer(id, { text: 'CHANGED' }));
  check('layer updated', useStore.getState().project.layers.at(-1)!.text === 'CHANGED');
  act(() => {
    store.patch((p) => {
      p.layers = p.layers.filter((l) => l.id !== id);
    });
  });
  check('layer removed', useStore.getState().project.layers.length === before);
  check('project reset restores 2 default layers', before === 2, `got ${before}`);
}

console.log('\n[5] compositor draws overlays');
{
  const project = defaultProject();
  const ctx = document.createElement('canvas').getContext('2d')!;
  drawBackground(ctx, project.background, 1280, 720, new Map());
  check('background draws', (drawCalls.fillRect || 0) > 0);

  const before = drawCalls.fillText || 0;
  drawLayers(ctx, project.layers, 1280, 720, 0, new Map());
  check('text layers call fillText', (drawCalls.fillText || 0) > before, JSON.stringify(drawCalls));

  // scrub through the animation and make sure nothing throws
  let threw = '';
  try {
    for (let t = 0; t <= 3; t += 0.05) drawLayers(ctx, project.layers, 1280, 720, t, new Map());
  } catch (err) {
    threw = String(err);
  }
  check('scrubbing 0-3s never throws', !threw, threw);

  // every animation preset must render
  const presets = ['none', 'pop', 'slam', 'bounceIn', 'slideLeft', 'slideRight', 'slideUp', 'slideDown',
    'fade', 'zoomIn', 'zoomOut', 'typewriter', 'flipIn', 'spinIn', 'drop', 'shake', 'pulse', 'wobble',
    'glitch', 'tracking'] as const;
  let presetError = '';
  for (const preset of presets) {
    try {
      const layer = defaultLayer('text', { anim: { preset: preset as never, delay: 0.1, duration: 0.6, loop: preset === 'shake' || preset === 'pulse' || preset === 'wobble' || preset === 'glitch', intensity: 1 } });
      for (const t of [0, 0.05, 0.2, 0.5, 0.9, 1.5, 3]) {
        drawLayers(ctx, [layer], 1280, 720, t, new Map());
      }
    } catch (err) {
      presetError += `${preset}: ${String(err)} `;
    }
  }
  check('all 20 animation presets render', !presetError, presetError);

  // image + shape layers
  const shapeLayer = defaultLayer('shape', { shape: 'burst' });
  const imageLayer = defaultLayer('image', { src: 'data:image/png;base64,AAAA', imgW: 0.3, imgH: 0.3 });
  const stroked = defaultLayer('text', { stroke: { enabled: true, color: '#000', width: 0.02, style: 'extrude', depth: 10 } });
  const arced = defaultLayer('text', { arc: 60 });
  const spaced = defaultLayer('text', { letterSpacing: 0.2 });
  let err2 = '';
  try {
    drawLayers(ctx, [shapeLayer, imageLayer, stroked, arced, spaced], 1280, 720, 0.3, new Map());
  } catch (err) {
    err2 = String(err);
  }
  check('shape/image/extrude/arc/spaced layers draw', !err2, err2);
}

console.log('\n[6] gif encoder on a real frame sequence');
{
  const frames = [];
  for (let i = 0; i < 4; i++) {
    const data = new Uint8ClampedArray(64 * 48 * 4);
    for (let p = 0; p < data.length; p += 4) {
      data[p] = (p / 4 + i * 30) % 255;
      data[p + 1] = 90;
      data[p + 2] = 200 - i * 40;
      data[p + 3] = 255;
    }
    frames.push({ data, delay: 8 });
  }
  const bytes = encodeGIF(frames, { width: 64, height: 48, loop: 0 });
  check('gif produced', bytes.length > 500, `len=${bytes.length}`);
  check('gif header', String.fromCharCode(...bytes.subarray(0, 6)) === 'GIF89a');
  check('gif trailer', bytes[bytes.length - 1] === 0x3b);
}

}

main().then(() => {
  console.log('\n[7] every preset template applies and renders');
{
  const store = useStore.getState();
  let err = '';
  for (const template of TEMPLATES) {
    try {
      const next = applyTemplate(defaultProject(), template);
      check(`template "${template.name}" builds`, next.layers.length > 0, `layers=${next.layers.length}`);
      // composite every template at a few points on the timeline
      const ctx = document.createElement('canvas').getContext('2d')!;
      drawBackground(ctx, next.background, 640, 360, new Map());
      for (const t of [0, 0.2, 0.6, 1.2, 2.5]) {
        drawLayers(ctx, next.layers, 640, 360, t, new Map());
      }
      // and the inspector must cope with each of its layers
      for (const layer of next.layers) {
        act(() => {
          store.patch((p) => {
            p.layers = [layer];
            p.selectedId = layer.id;
          });
        });
        renderPanel(Inspector);
      }
    } catch (e) {
      err += `${template.id}: ${String(e)} `;
    }
  }
  check('all templates render + composite + inspect', !err, err);
  store.reset();
}

console.log(`\n${failures === 0 ? 'ALL UI CHECKS PASSED' : `${failures} UI CHECK(S) FAILED`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}).catch((err) => {
  console.error('UI verification crashed:', err);
  process.exit(1);
});
