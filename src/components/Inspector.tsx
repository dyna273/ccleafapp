import { useStore } from '../state/store';
import { ANIM_PRESETS, getPreset } from '../engine/presets';
import { FONTS, type Layer } from '../state/types';
import { Button, ColorInput, Field, Section, Segmented, Select, Slider, Toggle } from './ui';

export function Inspector() {
  const project = useStore((s) => s.project);
  const updateLayer = useStore((s) => s.updateLayer);
  const layer = project.layers.find((l) => l.id === project.selectedId) || null;

  if (!layer) {
    return (
      <div className="empty-state">
        <h3>Nothing selected</h3>
        <p>Pick a layer on the left to edit it, or add a new text layer to start designing.</p>
        <p className="hint">
          Tip: drag on the preview to orbit the model, and use the timeline at the bottom to scrub
          the animation.
        </p>
      </div>
    );
  }

  const set = (patchData: Partial<Layer>) => updateLayer(layer.id, patchData);
  const fill = layer.fill ?? { type: 'solid' as const, color: '#ffffff', color2: '#000000', angle: 90 };
  const stroke = layer.stroke ?? { enabled: false, color: '#000000', width: 0.02, style: 'outline' as const, depth: 6 };
  const shadow = layer.shadow ?? { enabled: false, color: 'rgba(0,0,0,0.6)', blur: 16, dx: 0, dy: 6 };
  const preset = getPreset(layer.anim?.preset || 'none');

  return (
    <>
      <Section title="Layer">
        <Field label="Name">
          <input className="text-input" value={layer.name} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <div className="row">
          <Slider label="X" value={layer.x} min={-0.2} max={1.2} step={0.001} onChange={(v) => set({ x: v })} format={(v) => `${(v * 100).toFixed(1)}%`} />
          <Slider label="Y" value={layer.y} min={-0.2} max={1.2} step={0.001} onChange={(v) => set({ y: v })} format={(v) => `${(v * 100).toFixed(1)}%`} />
        </div>
        <Slider label="Scale" value={layer.scale} min={0.1} max={4} step={0.01} onChange={(v) => set({ scale: v })} format={(v) => `${v.toFixed(2)}×`} />
        <Slider label="Rotation" value={layer.rotation} min={-180} max={180} step={0.5} onChange={(v) => set({ rotation: v })} format={(v) => `${v.toFixed(1)}°`} />
        <Slider label="Opacity" value={layer.opacity} min={0} max={1} onChange={(v) => set({ opacity: v })} format={(v) => `${Math.round(v * 100)}%`} />
      </Section>

      {layer.kind === 'text' && (
        <Section title="Text">
          <textarea
            className="text-area"
            rows={3}
            value={layer.text || ''}
            onChange={(e) => set({ text: e.target.value })}
            placeholder="Your headline"
          />
          <Field label="Font">
            <Select value={layer.fontFamily || FONTS[0].value} options={FONTS} onChange={(v) => set({ fontFamily: v })} />
          </Field>
          <Slider
            label="Size"
            value={layer.fontSize || 0.12}
            min={0.01}
            max={0.5}
            step={0.001}
            onChange={(v) => set({ fontSize: v })}
            format={(v) => `${Math.round(v * project.canvas.height)}px`}
          />
          <Slider label="Line height" value={layer.lineHeight || 1.1} min={0.7} max={2} step={0.01} onChange={(v) => set({ lineHeight: v })} format={(v) => v.toFixed(2)} />
          <Slider label="Letter spacing" value={layer.letterSpacing || 0} min={-0.2} max={0.6} step={0.005} onChange={(v) => set({ letterSpacing: v })} format={(v) => v.toFixed(3)} />
          <Slider label="Arc" value={layer.arc || 0} min={-120} max={120} step={1} onChange={(v) => set({ arc: v })} format={(v) => `${Math.round(v)}°`} />
          <div className="row wrap">
            <Toggle label="UPPERCASE" value={!!layer.uppercase} onChange={(v) => set({ uppercase: v })} />
            <Toggle label="Italic" value={!!layer.italic} onChange={(v) => set({ italic: v })} />
          </div>
          <Field label="Align">
            <Segmented
              value={layer.align || 'center'}
              onChange={(v) => set({ align: v })}
              options={[
                { label: 'Left', value: 'left' },
                { label: 'Centre', value: 'center' },
                { label: 'Right', value: 'right' },
              ]}
            />
          </Field>
        </Section>
      )}

      {layer.kind === 'shape' && (
        <Section title="Shape">
          <Field label="Shape">
            <Select
              value={layer.shape || 'burst'}
              onChange={(v) => set({ shape: v })}
              options={[
                { label: 'Burst / starburst', value: 'burst' },
                { label: 'Star', value: 'star' },
                { label: 'Arrow', value: 'arrow' },
                { label: 'Rounded rectangle', value: 'rect' },
                { label: 'Circle', value: 'circle' },
                { label: 'Ring', value: 'ring' },
                { label: 'Triangle', value: 'triangle' },
                { label: 'Underline bar', value: 'underline' },
                { label: 'Blob', value: 'blob' },
              ]}
            />
          </Field>
          <Slider label="Width" value={layer.shapeW || 0.2} min={0.02} max={1.5} step={0.005} onChange={(v) => set({ shapeW: v })} format={(v) => `${(v * 100).toFixed(1)}%`} />
          <Slider label="Height" value={layer.shapeH || 0.2} min={0.02} max={1.5} step={0.005} onChange={(v) => set({ shapeH: v })} format={(v) => `${(v * 100).toFixed(1)}%`} />
          {(layer.shape === 'burst' || layer.shape === 'star') && (
            <Slider label="Points" value={layer.points || 12} min={3} max={28} step={1} onChange={(v) => set({ points: Math.round(v) })} format={(v) => String(Math.round(v))} />
          )}
          {layer.shape === 'rect' && (
            <Slider label="Corner radius" value={layer.corner || 0} min={0} max={50} step={1} onChange={(v) => set({ corner: v })} format={(v) => `${Math.round(v)}%`} />
          )}
          {layer.shape === 'ring' && (
            <Slider label="Thickness" value={layer.corner || 12} min={1} max={40} step={1} onChange={(v) => set({ corner: v })} format={(v) => String(Math.round(v))} />
          )}
        </Section>
      )}

      {layer.kind === 'image' && (
        <Section title="Image">
          {layer.src ? (
            <div className="thumb">
              <img src={layer.src} alt={layer.name} />
            </div>
          ) : (
            <div className="hint">No image set.</div>
          )}
          <Slider label="Width" value={layer.imgW || 0.25} min={0.02} max={1.5} step={0.005} onChange={(v) => set({ imgW: v })} format={(v) => `${(v * 100).toFixed(1)}%`} />
          <Slider label="Height" value={layer.imgH || 0.25} min={0.02} max={1.5} step={0.005} onChange={(v) => set({ imgH: v })} format={(v) => `${(v * 100).toFixed(1)}%`} />
        </Section>
      )}

      <Section title="Fill">
        <Field label="Style">
          <Segmented
            value={fill.type}
            onChange={(v) => set({ fill: { ...fill, type: v } })}
            options={[
              { label: 'Solid', value: 'solid' },
              { label: 'Gradient', value: 'gradient' },
              { label: 'None', value: 'none' },
            ]}
          />
        </Field>
        {fill.type !== 'none' && (
          <Field label={fill.type === 'gradient' ? 'Colour A' : 'Colour'}>
            <ColorInput value={fill.color} onChange={(v) => set({ fill: { ...fill, color: v } })} />
          </Field>
        )}
        {fill.type === 'gradient' && (
          <>
            <Field label="Colour B">
              <ColorInput value={fill.color2} onChange={(v) => set({ fill: { ...fill, color2: v } })} />
            </Field>
            <Slider label="Angle" value={fill.angle} min={0} max={360} step={1} onChange={(v) => set({ fill: { ...fill, angle: v } })} format={(v) => `${Math.round(v)}°`} />
          </>
        )}
      </Section>

      <Section title="Outline" defaultOpen={false}>
        <Toggle label="Enabled" value={stroke.enabled} onChange={(v) => set({ stroke: { ...stroke, enabled: v } })} />
        {stroke.enabled && (
          <>
            <Field label="Style">
              <Segmented
                value={stroke.style}
                onChange={(v) => set({ stroke: { ...stroke, style: v } })}
                options={[
                  { label: 'Outline', value: 'outline' },
                  { label: '3D extrude', value: 'extrude' },
                ]}
              />
            </Field>
            <Field label="Colour">
              <ColorInput value={stroke.color} onChange={(v) => set({ stroke: { ...stroke, color: v } })} />
            </Field>
            {stroke.style === 'outline' ? (
              <Slider label="Width" value={stroke.width} min={0.001} max={0.12} step={0.001} onChange={(v) => set({ stroke: { ...stroke, width: v } })} format={(v) => `${Math.round(v * project.canvas.height)}px`} />
            ) : (
              <Slider label="Depth" value={stroke.depth} min={1} max={40} step={1} onChange={(v) => set({ stroke: { ...stroke, depth: Math.round(v) } })} format={(v) => `${Math.round(v)}px`} />
            )}
          </>
        )}
      </Section>

      <Section title="Drop shadow" defaultOpen={false}>
        <Toggle label="Enabled" value={shadow.enabled} onChange={(v) => set({ shadow: { ...shadow, enabled: v } })} />
        {shadow.enabled && (
          <>
            <Field label="Colour">
              <ColorInput value={shadow.color} onChange={(v) => set({ shadow: { ...shadow, color: v } })} />
            </Field>
            <Slider label="Blur" value={shadow.blur} min={0} max={80} step={1} onChange={(v) => set({ shadow: { ...shadow, blur: v } })} format={(v) => `${Math.round(v)}px`} />
            <Slider label="Offset X" value={shadow.dx} min={-60} max={60} step={1} onChange={(v) => set({ shadow: { ...shadow, dx: v } })} format={(v) => `${Math.round(v)}px`} />
            <Slider label="Offset Y" value={shadow.dy} min={-60} max={60} step={1} onChange={(v) => set({ shadow: { ...shadow, dy: v } })} format={(v) => `${Math.round(v)}px`} />
          </>
        )}
      </Section>

      <Section title="Animation">
        <Field label="Preset">
          <Select
            value={layer.anim?.preset || 'none'}
            onChange={(v) => set({ anim: { ...layer.anim!, preset: v } })}
            options={ANIM_PRESETS.map((p) => ({ label: p.label, value: p.id }))}
          />
        </Field>
        {layer.anim && layer.anim.preset !== 'none' && (
          <>
            <Slider
              label="Delay"
              value={layer.anim.delay}
              min={0}
              max={6}
              step={0.05}
              onChange={(v) => set({ anim: { ...layer.anim!, delay: v } })}
              format={(v) => `${v.toFixed(2)}s`}
            />
            <Slider
              label="Duration"
              value={layer.anim.duration}
              min={0.05}
              max={4}
              step={0.05}
              onChange={(v) => set({ anim: { ...layer.anim!, duration: v } })}
              format={(v) => `${v.toFixed(2)}s`}
            />
            <Slider
              label="Intensity"
              value={layer.anim.intensity}
              min={0}
              max={2}
              step={0.05}
              onChange={(v) => set({ anim: { ...layer.anim!, intensity: v } })}
              format={(v) => `${v.toFixed(2)}×`}
            />
            <Toggle
              label={preset.loops ? 'Loop continuously' : 'Keep looping (if idle)'}
              value={layer.anim.loop}
              onChange={(v) => set({ anim: { ...layer.anim!, loop: v } })}
            />
          </>
        )}
        <div className="hint">
          Layer animations play in the preview and are baked into video/GIF exports. PNG exports use
          the current frame.
        </div>
        <Button
          onClick={() =>
            set({
              anim: {
                preset: 'none',
                delay: 0,
                duration: preset.defaultDuration,
                loop: false,
                intensity: 1,
              },
            })
          }
        >
          Reset animation
        </Button>
      </Section>
    </>
  );
}
