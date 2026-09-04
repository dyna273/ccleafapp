import { useStore } from '../state/store';
import { CANVAS_PRESETS } from '../state/types';
import { Button, ColorInput, Field, FileButton, Section, Select, Slider, Toggle } from './ui';

function readImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function ScenePanel() {
  const project = useStore((s) => s.project);
  const engine = useStore((s) => s.engine);
  const patch = useStore((s) => s.patch);
  const notify = useStore((s) => s.notify);

  const bg = project.background;
  const set = (fn: (b: typeof bg) => void) => patch((p) => fn(p.background));

  return (
    <>
      <Section title="Canvas">
        <Field label="Preset">
          <Select
            value={`${project.canvas.width}x${project.canvas.height}`}
            onChange={(v) => {
              const [w, h] = v.split('x').map(Number);
              patch((p) => {
                p.canvas.width = w;
                p.canvas.height = h;
              });
            }}
            options={CANVAS_PRESETS.map((c) => ({
              label: c.label,
              value: `${c.width}x${c.height}`,
            }))}
          />
        </Field>
        <div className="row">
          <Field label="Width">
            <input
              className="text-input"
              type="number"
              value={project.canvas.width}
              min={16}
              max={7680}
              onChange={(e) => patch((p) => void (p.canvas.width = Math.max(16, parseInt(e.target.value, 10) || 1280)))}
            />
          </Field>
          <Field label="Height">
            <input
              className="text-input"
              type="number"
              value={project.canvas.height}
              min={16}
              max={7680}
              onChange={(e) => patch((p) => void (p.canvas.height = Math.max(16, parseInt(e.target.value, 10) || 720)))}
            />
          </Field>
        </div>
        <Toggle label="Show safe-area guides" value={project.showSafeArea} onChange={(v) => patch((p) => void (p.showSafeArea = v))} />
      </Section>

      <Section title="Background">
        <Field label="Type">
          <Select
            value={bg.kind}
            onChange={(v) => set((b) => void (b.kind = v))}
            options={[
              { label: 'Gradient', value: 'gradient' },
              { label: 'Solid colour', value: 'solid' },
              { label: 'Image / screenshot', value: 'image' },
              { label: 'Transparent', value: 'transparent' },
            ]}
          />
        </Field>

        {(bg.kind === 'solid' || bg.kind === 'gradient') && (
          <>
            <Field label={bg.kind === 'gradient' ? 'Colour A' : 'Colour'}>
              <ColorInput value={bg.color} onChange={(v) => set((b) => void (b.color = v))} />
            </Field>
            {bg.kind === 'gradient' && (
              <>
                <Field label="Colour B">
                  <ColorInput value={bg.color2} onChange={(v) => set((b) => void (b.color2 = v))} />
                </Field>
                <Slider label="Angle" value={bg.angle} min={0} max={360} step={1} onChange={(v) => set((b) => void (b.angle = v))} format={(v) => `${Math.round(v)}°`} />
              </>
            )}
          </>
        )}

        {bg.kind === 'image' && (
          <>
            <div className="row wrap">
              <FileButton
                accept="image/*"
                variant="primary"
                onFile={async (files) => {
                  const src = await readImage(files[0]);
                  set((b) => void (b.src = src));
                  await engine?.loadImage(src);
                  notify('Backdrop updated', 'success');
                }}
              >
                {bg.src ? 'Replace image' : 'Upload image'}
              </FileButton>
              {bg.src && (
                <Button variant="ghost" onClick={() => set((b) => void (b.src = ''))}>
                  Remove
                </Button>
              )}
            </div>
            {bg.src && (
              <div className="thumb">
                <img src={bg.src} alt="backdrop" />
              </div>
            )}
            <Field label="Fit">
              <Select
                value={bg.fit}
                onChange={(v) => set((b) => void (b.fit = v))}
                options={[
                  { label: 'Cover (fill frame)', value: 'cover' },
                  { label: 'Contain (fit inside)', value: 'contain' },
                ]}
              />
            </Field>
            <Slider label="Blur" value={bg.blur} min={0} max={30} step={0.5} onChange={(v) => set((b) => void (b.blur = v))} format={(v) => `${v.toFixed(1)}px`} />
            <Slider label="Brightness" value={bg.brightness} min={0.2} max={2} onChange={(v) => set((b) => void (b.brightness = v))} format={(v) => `${v.toFixed(2)}×`} />
            <Slider label="Saturation" value={bg.saturation} min={0} max={2} onChange={(v) => set((b) => void (b.saturation = v))} format={(v) => `${v.toFixed(2)}×`} />
          </>
        )}

        <Slider
          label="Colour wash"
          value={bg.overlayOpacity}
          min={0}
          max={1}
          onChange={(v) => set((b) => void (b.overlayOpacity = v))}
          format={(v) => `${Math.round(v * 100)}%`}
        />
        {bg.overlayOpacity > 0 && (
          <Field label="Wash colour">
            <ColorInput value={bg.overlayColor} onChange={(v) => set((b) => void (b.overlayColor = v))} />
          </Field>
        )}
        <Slider
          label="Vignette"
          value={bg.vignette}
          min={0}
          max={1}
          onChange={(v) => set((b) => void (b.vignette = v))}
          format={(v) => `${Math.round(v * 100)}%`}
        />
      </Section>

      <Section title="Camera" defaultOpen={false}>
        <Field label="Preset">
          <Select
            value={project.camera.preset}
            onChange={(v) => patch((p) => void (p.camera.preset = v))}
            options={[
              { label: 'Three-quarter (front)', value: 'three-quarter' },
              { label: 'Front', value: 'front' },
              { label: 'Back', value: 'back' },
              { label: 'Side', value: 'side' },
              { label: 'Top down', value: 'top' },
              { label: 'Hero (low angle)', value: 'hero' },
              { label: 'High angle', value: 'low' },
            ]}
          />
        </Field>
        <Slider
          label="Field of view"
          value={project.camera.fov}
          min={12}
          max={90}
          step={1}
          onChange={(v) => patch((p) => void (p.camera.fov = v))}
          format={(v) => `${Math.round(v)}°`}
        />
        <Slider
          label="Orbit Y"
          value={project.camera.orbitY}
          min={-180}
          max={180}
          step={1}
          onChange={(v) => patch((p) => void (p.camera.orbitY = v))}
          format={(v) => `${Math.round(v)}°`}
        />
        <Slider
          label="Orbit X"
          value={project.camera.orbitX}
          min={-85}
          max={85}
          step={1}
          onChange={(v) => patch((p) => void (p.camera.orbitX = v))}
          format={(v) => `${Math.round(v)}°`}
        />
        <Slider
          label="Distance"
          value={project.camera.distance}
          min={0.4}
          max={3}
          step={0.01}
          onChange={(v) => patch((p) => void (p.camera.distance = v))}
          format={(v) => `${v.toFixed(2)}×`}
        />
        <Slider
          label="Turntable spin"
          value={project.camera.autoOrbit}
          min={-120}
          max={120}
          step={1}
          onChange={(v) => patch((p) => void (p.camera.autoOrbit = v))}
          format={(v) => (v === 0 ? 'off' : `${Math.round(v)}°/s`)}
        />
        <div className="hint">
          Drag on the preview to orbit, scroll or pinch to zoom. Turntable spin rotates the camera
          continuously as the timeline plays — great for showcase clips.
        </div>
      </Section>
    </>
  );
}
