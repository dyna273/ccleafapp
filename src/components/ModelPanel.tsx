import { useStore } from '../state/store';
import { Button, ColorInput, Field, FileButton, Section, Select, Slider, Toggle } from './ui';

const SAMPLES = [
  { name: 'Steve (animated)', url: 'models/steve.bbmodel', label: 'Steve' },
  { name: 'Orientation cube', url: 'models/orientation-cube.bbmodel', label: 'Test cube' },
];

export function ModelPanel() {
  const project = useStore((s) => s.project);
  const model = useStore((s) => s.model);
  const modelName = useStore((s) => s.modelName);
  const engine = useStore((s) => s.engine);
  const patch = useStore((s) => s.patch);
  const loadModelFromFile = useStore((s) => s.loadModelFromFile);
  const loadModelFromUrl = useStore((s) => s.loadModelFromUrl);
  const clearModel = useStore((s) => s.clearModel);
  const notify = useStore((s) => s.notify);

  const base = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/';

  const textureCount = model ? model.textures.filter((t) => t.source).length : 0;

  return (
    <>
      <Section title="Model">
        <div className="row wrap">
          <FileButton accept=".bbmodel,application/json,model/*" variant="primary" onFile={(files) => loadModelFromFile(files[0])}>
            Upload .bbmodel
          </FileButton>
          {model && (
            <Button variant="ghost" onClick={clearModel} title="Remove the model from the scene">
              Clear
            </Button>
          )}
        </div>
        <div className="hint">
          Drop a Blockbench project anywhere on the preview, or press Upload. Compressed
          <code> &lt;lz&gt; </code> files, format 3.2 → 5.0, box-UV and per-face UV are all supported.
        </div>
        <div className="row wrap samples">
          {SAMPLES.map((s) => (
            <Button key={s.url} onClick={() => loadModelFromUrl(base + s.url, s.label)}>
              Load {s.label}
            </Button>
          ))}
        </div>
        {model && (
          <div className="meta-grid">
            <span>Name</span>
            <b>{modelName || 'unnamed'}</b>
            <span>Elements</span>
            <b>{model.elements.length}</b>
            <span>Groups</span>
            <b>{model.groups.size}</b>
            <span>Animations</span>
            <b>{model.animations.length}</b>
            <span>Textures</span>
            <b>
              {textureCount}/{model.textures.length}
            </b>
            <span>Format</span>
            <b>v{model.formatVersion}</b>
          </div>
        )}
        {model && textureCount < model.textures.length && (
          <div className="hint warn">
            {model.textures.length - textureCount} texture(s) are not embedded in the file, so those
            surfaces render untextured. Re-save the project in Blockbench with textures embedded.
          </div>
        )}
      </Section>

      {model && (
        <>
          <Section title="Placement">
            <Slider
              label="Zoom"
              value={project.model.zoom}
              min={0.3}
              max={4}
              step={0.01}
              onChange={(v) => patch((p) => void (p.model.zoom = v))}
              format={(v) => `${v.toFixed(2)}×`}
            />
            <Slider
              label="Offset X"
              value={project.model.offsetX}
              min={-0.5}
              max={0.5}
              step={0.001}
              onChange={(v) => patch((p) => void (p.model.offsetX = v))}
              format={(v) => `${(v * 100).toFixed(1)}%`}
            />
            <Slider
              label="Offset Y"
              value={project.model.offsetY}
              min={-0.5}
              max={0.5}
              step={0.001}
              onChange={(v) => patch((p) => void (p.model.offsetY = v))}
              format={(v) => `${(v * 100).toFixed(1)}%`}
            />
            <div className="row">
              <Button
                onClick={() =>
                  patch((p) => {
                    p.model.zoom = 1;
                    p.model.offsetX = 0;
                    p.model.offsetY = 0;
                  })
                }
              >
                Reset placement
              </Button>
              <Button
                onClick={() => {
                  engine?.applyCamera();
                  notify('Camera reset');
                }}
              >
                Reset camera
              </Button>
            </div>
          </Section>

          <Section title="Shadows & ground" defaultOpen={false}>
            <Toggle
              label="Contact shadow"
              value={project.model.shadowEnabled}
              onChange={(v) => patch((p) => void (p.model.shadowEnabled = v))}
            />
            <Slider
              label="Shadow strength"
              value={project.model.shadowOpacity}
              min={0}
              max={1}
              onChange={(v) => patch((p) => void (p.model.shadowOpacity = v))}
              format={(v) => `${Math.round(v * 100)}%`}
            />
            <Toggle
              label="Ground plane"
              value={project.model.groundEnabled}
              onChange={(v) => patch((p) => void (p.model.groundEnabled = v))}
            />
            {project.model.groundEnabled && (
              <Field label="Ground colour">
                <ColorInput value={project.model.groundColor} onChange={(v) => patch((p) => void (p.model.groundColor = v))} />
              </Field>
            )}
            <Slider
              label="Outline"
              value={project.model.outline}
              min={0}
              max={12}
              step={0.5}
              onChange={(v) => patch((p) => void (p.model.outline = v))}
              format={(v) => (v === 0 ? 'off' : `${v.toFixed(1)}px`)}
            />
            {project.model.outline > 0 && (
              <Field label="Outline colour">
                <ColorInput value={project.model.outlineColor} onChange={(v) => patch((p) => void (p.model.outlineColor = v))} />
              </Field>
            )}
          </Section>

          <Section title="Look" defaultOpen={false}>
            <Field label="Lighting">
              <Select
                value={project.lighting}
                onChange={(v) => patch((p) => void (p.lighting = v))}
                options={[
                  { label: 'Studio (recommended)', value: 'studio' },
                  { label: 'Minecraft flat', value: 'minecraft' },
                  { label: 'Flat / no shading', value: 'flat' },
                ]}
              />
            </Field>
            <Slider
              label="Exposure"
              value={project.exposure}
              min={0.4}
              max={1.8}
              onChange={(v) => patch((p) => void (p.exposure = v))}
              format={(v) => `${v.toFixed(2)}`}
            />
            <Toggle
              label="Smooth textures"
              value={project.smoothing}
              onChange={(v) => patch((p) => void (p.smoothing = v))}
            />
            <div className="hint">
              Turn smoothing off for the crisp, pixel-perfect Minecraft look; on for softer HD
              textures.
            </div>
          </Section>
        </>
      )}
    </>
  );
}
