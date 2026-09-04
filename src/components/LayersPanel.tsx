import { useStore } from '../state/store';
import { defaultLayer, type Layer } from '../state/types';
import { Button, FileButton, Section } from './ui';

function readImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

const KIND_ICON: Record<Layer['kind'], string> = { text: 'T', shape: '◆', image: '▣' };

export function LayersPanel() {
  const project = useStore((s) => s.project);
  const engine = useStore((s) => s.engine);
  const patch = useStore((s) => s.patch);
  const updateLayer = useStore((s) => s.updateLayer);

  const layers = project.layers;
  const selected = project.selectedId;

  const add = (kind: Layer['kind']) => {
    const layer = defaultLayer(kind, kind === 'text' ? { name: `Text ${layers.length + 1}` } : {});
    patch((p) => {
      p.layers.push(layer);
      p.selectedId = layer.id;
    });
  };

  const move = (index: number, delta: number) => {
    patch((p) => {
      const target = index + delta;
      if (target < 0 || target >= p.layers.length) return;
      const [item] = p.layers.splice(index, 1);
      p.layers.splice(target, 0, item);
    });
  };

  const duplicate = (layer: Layer) => {
    const copy = { ...structuredClone(layer), id: `l${Date.now()}${Math.floor(Math.random() * 1e6)}`, name: `${layer.name} copy` };
    patch((p) => {
      const index = p.layers.findIndex((l) => l.id === layer.id);
      p.layers.splice(index + 1, 0, copy);
      p.selectedId = copy.id;
    });
  };

  const remove = (id: string) => {
    patch((p) => {
      p.layers = p.layers.filter((l) => l.id !== id);
      if (p.selectedId === id) p.selectedId = null;
    });
  };

  return (
    <Section
      title={`Layers (${layers.length})`}
      right={
        <span className="add-row">
          <button title="Add text" onClick={() => add('text')}>+</button>
        </span>
      }
    >
      <div className="row wrap">
        <Button onClick={() => add('text')}>+ Text</Button>
        <Button onClick={() => add('shape')}>+ Shape</Button>
        <FileButton
          accept="image/*"
          onFile={async (files) => {
            const src = await readImage(files[0]);
            await engine?.loadImage(src);
            const layer = defaultLayer('image', {
              src,
              name: files[0].name.replace(/\.[^.]+$/, '').slice(0, 24) || 'Image',
            });
            const img = engine?.images.get(src);
            if (img && img.naturalWidth) {
              // imgW/imgH are both fractions of the canvas *width*, so the
              // height is just the width times the image's own aspect ratio.
              const aspect = img.naturalHeight / img.naturalWidth;
              layer.imgW = 0.3;
              layer.imgH = 0.3 * aspect;
            }
            patch((p) => {
              p.layers.push(layer);
              p.selectedId = layer.id;
            });
          }}
        >
          + Image
        </FileButton>
      </div>

      <ul className="layer-list">
        {layers
          .map((layer, index) => ({ layer, index }))
          .reverse()
          .map(({ layer, index }) => (
            <li
              key={layer.id}
              className={`layer-item ${selected === layer.id ? 'selected' : ''} ${layer.visible ? '' : 'hidden'}`}
              onClick={() => patch((p) => void (p.selectedId = layer.id))}
            >
              <span className="kind">{KIND_ICON[layer.kind]}</span>
              <span className="name" title={layer.kind === 'text' ? layer.text : layer.name}>
                {layer.kind === 'text' ? layer.text?.split('\n')[0] || layer.name : layer.name}
              </span>
              <span className="actions">
                <button
                  title={layer.visible ? 'Hide' : 'Show'}
                  onClick={(e) => {
                    e.stopPropagation();
                    updateLayer(layer.id, { visible: !layer.visible });
                  }}
                >
                  {layer.visible ? '◉' : '○'}
                </button>
                <button
                  title={layer.locked ? 'Unlock' : 'Lock'}
                  onClick={(e) => {
                    e.stopPropagation();
                    updateLayer(layer.id, { locked: !layer.locked });
                  }}
                >
                  {layer.locked ? '🔒' : '🔓'}
                </button>
                <button
                  title="Move up"
                  onClick={(e) => {
                    e.stopPropagation();
                    move(index, 1);
                  }}
                >
                  ▲
                </button>
                <button
                  title="Move down"
                  onClick={(e) => {
                    e.stopPropagation();
                    move(index, -1);
                  }}
                >
                  ▼
                </button>
                <button
                  title="Duplicate"
                  onClick={(e) => {
                    e.stopPropagation();
                    duplicate(layer);
                  }}
                >
                  ⧉
                </button>
                <button
                  title="Delete"
                  className="danger"
                  onClick={(e) => {
                    e.stopPropagation();
                    remove(layer.id);
                  }}
                >
                  ✕
                </button>
              </span>
            </li>
          ))}
        {!layers.length && <li className="empty">No layers yet — add text, a shape or an image.</li>}
      </ul>
    </Section>
  );
}
