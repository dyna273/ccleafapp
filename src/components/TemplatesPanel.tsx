import { useStore } from '../state/store';
import { applyTemplate, TEMPLATES, type Template } from '../state/templates';
import { Section } from './ui';

export function TemplatesPanel() {
  const project = useStore((s) => s.project);
  const patch = useStore((s) => s.patch);
  const notify = useStore((s) => s.notify);
  const setTab = useStore((s) => s.setTab);

  const apply = (template: Template) => {
    const confirmed =
      project.layers.length === 0 ||
      confirm(`Replace the current background and layers with "${template.name}"?`);
    if (!confirmed) return;
    const next = applyTemplate(project, template);
    // `patch` clones the project, so copy the template result onto it
    patch((p) => {
      p.background = next.background;
      p.layers = next.layers;
      p.canvas = next.canvas;
      p.camera = next.camera;
      p.selectedId = null;
      p.animation.time = 0;
    });
    notify(`Applied “${template.name}”`, 'success');
    setTab('layers');
  };

  return (
    <Section title="Templates">
      <div className="hint">
        Start from a finished look, then edit the text, colours and timing on the right.
      </div>
      <div className="template-grid">
        {TEMPLATES.map((t) => (
          <button key={t.id} className="template-card" onClick={() => apply(t)} title={t.blurb}>
            <span
              className="template-swatch"
              style={{ background: `linear-gradient(135deg, ${t.swatch[0]}, ${t.swatch[1]})` }}
            >
              <span className="template-bar" />
            </span>
            <b>{t.name}</b>
            <small>{t.blurb}</small>
          </button>
        ))}
      </div>
    </Section>
  );
}
