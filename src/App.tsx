import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from './state/store';
import { StudioEngine } from './engine/studio';
import { ModelPanel } from './components/ModelPanel';
import { ScenePanel } from './components/ScenePanel';
import { LayersPanel } from './components/LayersPanel';
import { TemplatesPanel } from './components/TemplatesPanel';
import { Inspector } from './components/Inspector';
import { ExportPanel } from './components/ExportPanel';
import { Segmented } from './components/ui';

export default function App() {
  const glRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<StudioEngine | null>(null);

  const project = useStore((s) => s.project);
  const revision = useStore((s) => s.revision);
  const engine = useStore((s) => s.engine);
  const setEngine = useStore((s) => s.setEngine);
  const patch = useStore((s) => s.patch);
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  const rightTab = useStore((s) => s.rightTab);
  const setRightTab = useStore((s) => s.setRightTab);
  const animations = useStore((s) => s.animations);
  const busy = useStore((s) => s.busy);
  const toast = useStore((s) => s.toast);
  const notify = useStore((s) => s.notify);
  const loadModelFromFile = useStore((s) => s.loadModelFromFile);
  const timelineLength = useStore((s) => s.timelineLength);
  const setTimelineLength = useStore((s) => s.setTimelineLength);
  const modelName = useStore((s) => s.modelName);

  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [dragging, setDragging] = useState(false);

  /* ---------------- engine lifecycle ---------------- */
  useEffect(() => {
    if (!glRef.current || !viewRef.current) return;
    const eng = new StudioEngine(useStore.getState().project, glRef.current, viewRef.current);
    engineRef.current = eng;
    setEngine(eng);
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const drew = eng.tick(dt);
      if (drew) setTime(eng.time);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      eng.dispose();
      engineRef.current = null;
    };
  }, [setEngine]);

  /* ---------------- keep the engine in sync ---------------- */
  useEffect(() => {
    const eng = engineRef.current;
    if (!eng) return;
    eng.setProject(project);
    eng.ensureAssets().then(() => eng.invalidate());
    eng.syncSettings();
    eng.invalidate();
  }, [project, revision]);

  /* ---------------- initial sample model ---------------- */
  // Keyed on the engine instance (not a bare "done" flag) so React 18
  // StrictMode's mount/unmount/mount cycle still bootstraps the live engine.
  const bootstrappedEngine = useRef<StudioEngine | null>(null);
  useEffect(() => {
    const eng = engineRef.current;
    if (!eng || bootstrappedEngine.current === eng) return;
    bootstrappedEngine.current = eng;
    const base = (import.meta.env?.BASE_URL as string) || '/';
    useStore
      .getState()
      .loadModelFromUrl(`${base}models/steve.bbmodel`, 'Steve')
      .then(() => {
        if (engineRef.current !== eng) return; // superseded by a newer engine
        const suggested = eng.suggestedDuration();
        setTimelineLength(Math.max(2, Math.round(suggested * 10) / 10));
      });
  }, [engine, setTimelineLength]);

  /* ---------------- keyboard shortcuts ---------------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && /INPUT|TEXTAREA|SELECT/.test(target.tagName)) return;
      if (e.code === 'Space') {
        e.preventDefault();
        setPlaying((p) => {
          const eng = engineRef.current;
          if (eng) eng.playing = !p;
          return !p;
        });
      }
      if (e.code === 'Home') {
        const eng = engineRef.current;
        if (eng) {
          eng.time = 0;
          eng.invalidate();
          setTime(0);
        }
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && project.selectedId) {
        patch((p) => {
          p.layers = p.layers.filter((l) => l.id !== p.selectedId);
          p.selectedId = null;
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [patch, project.selectedId]);

  /* ---------------- drag & drop ---------------- */
  const onDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = Array.from(e.dataTransfer.files).find(
        (f) => f.name.toLowerCase().endsWith('.bbmodel') || f.type === 'application/json' || f.type.startsWith('image/'),
      );
      if (!file) return;
      if (file.name.toLowerCase().endsWith('.bbmodel') || file.type === 'application/json') {
        await loadModelFromFile(file);
      } else {
        const reader = new FileReader();
        reader.onload = () => {
          const src = String(reader.result);
          engineRef.current?.loadImage(src).then(() => {
            patch((p) => {
              p.background.kind = 'image';
              p.background.src = src;
            });
            notify('Backdrop set from dropped image', 'success');
          });
        };
        reader.readAsDataURL(file);
      }
    },
    [loadModelFromFile, notify, patch],
  );

  const seek = (value: number) => {
    const eng = engineRef.current;
    if (eng) {
      eng.time = value;
      eng.invalidate();
    }
    setTime(value);
  };

  const togglePlay = () => {
    const eng = engineRef.current;
    const next = !playing;
    setPlaying(next);
    if (eng) eng.playing = next;
  };

  const animIndex = project.animation.index;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">🍃</span>
          <div>
            <b>LeafForge</b>
            <small>bbmodel animation &amp; thumbnail studio</small>
          </div>
        </div>
        <div className="brand-model">{modelName ? `▸ ${modelName}` : 'no model loaded'}</div>
        <div className="topbar-actions">
          <Segmented
            value={rightTab}
            onChange={setRightTab}
            options={[
              { label: 'Inspect', value: 'inspect' },
              { label: 'Export', value: 'export' },
            ]}
          />
        </div>
      </header>

      <div className="body">
        <aside className="panel left">
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { label: 'Model', value: 'model' },
              { label: 'Scene', value: 'scene' },
              { label: 'Design', value: 'design' },
              { label: 'Layers', value: 'layers' },
            ]}
          />
          <div className="panel-scroll">
            {tab === 'model' && <ModelPanel />}
            {tab === 'scene' && <ScenePanel />}
            {tab === 'design' && (
              <>
                <TemplatesPanel />
                <LayersPanel />
              </>
            )}
            {tab === 'layers' && <LayersPanel />}
          </div>
        </aside>

        <main className="stage">
          <div
            ref={wrapRef}
            className={`viewport ${dragging ? 'dragging' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <div className="canvas-wrap" style={{ aspectRatio: `${project.canvas.width} / ${project.canvas.height}` }}>
              <canvas ref={viewRef} className="view-canvas" />
            </div>
            {dragging && <div className="drop-hint">Drop a .bbmodel or an image</div>}
          </div>

          <div className="playbar">
            <button className="play" onClick={togglePlay} title="Play / pause (space)">
              {playing ? '❚❚' : '▶'}
            </button>
            <button
              className="icon-btn"
              onClick={() => {
                seek(0);
                const eng = engineRef.current;
                if (eng) eng.playing = false;
                setPlaying(false);
              }}
              title="Back to start (Home)"
            >
              ⏮
            </button>
            <input
              className="scrub"
              type="range"
              min={0}
              max={timelineLength}
              step={0.01}
              value={Math.min(time, timelineLength)}
              onChange={(e) => seek(parseFloat(e.target.value))}
            />
            <span className="timecode">
              {time.toFixed(2)} / {timelineLength.toFixed(2)}s
            </span>
            <label className="mini">
              length
              <input
                type="number"
                min={0.2}
                max={30}
                step={0.1}
                value={timelineLength}
                onChange={(e) => setTimelineLength(parseFloat(e.target.value) || 3)}
              />
            </label>
            {animations.length > 0 && (
              <select
                className="select compact"
                value={animIndex}
                onChange={(e) =>
                  patch((p) => {
                    p.animation.index = parseInt(e.target.value, 10);
                    p.animation.time = 0;
                  })
                }
                title="Model animation"
              >
                <option value={-1}>no animation</option>
                {animations.map((a) => (
                  <option key={a.index} value={a.index}>
                    {a.name} ({a.length.toFixed(2)}s)
                  </option>
                ))}
              </select>
            )}
            <label className="mini">
              speed
              <input
                className="speed"
                type="number"
                min={0.1}
                max={4}
                step={0.1}
                value={project.animation.speed}
                onChange={(e) => patch((p) => void (p.animation.speed = Math.max(0.1, parseFloat(e.target.value) || 1)))}
              />
            </label>
            <button
              className="icon-btn"
              onClick={() => {
                const eng = engineRef.current;
                const suggested = eng?.suggestedDuration() || 3;
                setTimelineLength(Math.max(1, Math.round(suggested * 10) / 10));
                notify(`Timeline set to ${suggested.toFixed(1)}s`);
              }}
              title="Fit the timeline to the animation"
            >
              fit
            </button>
          </div>
        </main>

        <aside className="panel right">
          <div className="panel-scroll">{rightTab === 'inspect' ? <Inspector /> : <ExportPanel />}</div>
        </aside>
      </div>

      <canvas ref={glRef} className="gl-canvas" />

      {busy && (
        <div className="busy">
          <span className="spinner" />
          {busy}
        </div>
      )}
      {toast && <div className={`toast ${toast.kind}`}>{toast.message}</div>}
    </div>
  );
}
