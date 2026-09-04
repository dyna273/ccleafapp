import { useState } from 'react';
import { useStore } from '../state/store';
import { Button, Field, FileButton, Section, Segmented, Select, Slider, Toggle } from './ui';
import { saveBlob } from '../export/download';
import { pickVideoMime, recordVideo } from '../export/video';
import { recordGIF } from '../export/gif';
import { loadProjectFromText, saveProjectFile } from '../export/project';

export function ExportPanel() {
  const engine = useStore((s) => s.engine);
  const project = useStore((s) => s.project);
  const model = useStore((s) => s.model);
  const modelName = useStore((s) => s.modelName);
  const setBusy = useStore((s) => s.setBusy);
  const notify = useStore((s) => s.notify);
  const loadProject = useStore((s) => s.loadProject);
  const loadModelFromFile = useStore((s) => s.loadModelFromFile);
  const reset = useStore((s) => s.reset);

  const [pngScale, setPngScale] = useState(1);
  const [videoFormat, setVideoFormat] = useState<'webm' | 'mp4' | 'auto'>('auto');
  const [videoDuration, setVideoDuration] = useState(3);
  const [videoFps, setVideoFps] = useState(30);
  const [videoScale, setVideoScale] = useState(1);
  const [transparent, setTransparent] = useState(false);
  const [gifDuration, setGifDuration] = useState(2);
  const [gifFps, setGifFps] = useState(12);
  const [gifWidth, setGifWidth] = useState(480);

  const suggested = engine?.suggestedDuration() || 3;
  const mime = pickVideoMime(videoFormat);

  const doPng = async () => {
    if (!engine) return;
    setBusy('Rendering PNG…');
    try {
      await document.fonts?.ready;
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      engine.withQuality('high', () => engine.renderFrame(engine.time, canvas, ctx, pngScale));
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (blob) {
        await saveBlob(blob, `leafforge-${project.canvas.width * pngScale}x${project.canvas.height * pngScale}.png`);
        notify('PNG saved', 'success');
      }
    } catch (err) {
      notify(`PNG export failed: ${err instanceof Error ? err.message : err}`, 'error');
    } finally {
      setBusy(null);
    }
  };

  const doVideo = async () => {
    if (!engine) return;
    if (!mime) {
      notify('This browser cannot record video. Try Chrome, Edge or the Android app.', 'error');
      return;
    }
    setBusy('Recording 0%');
    try {
      await document.fonts?.ready;
      const blob = await recordVideo(engine, {
        duration: videoDuration,
        fps: videoFps,
        scale: videoScale,
        transparent,
        format: videoFormat,
        onProgress: (f) => setBusy(`Recording ${Math.round(f * 100)}%`),
      });
      const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
      await saveBlob(blob, `leafforge-animation.${ext}`);
      notify('Video saved', 'success');
    } catch (err) {
      notify(`Recording failed: ${err instanceof Error ? err.message : err}`, 'error');
    } finally {
      setBusy(null);
    }
  };

  const doGif = async () => {
    if (!engine) return;
    setBusy('Encoding GIF 0%');
    try {
      await document.fonts?.ready;
      const width = gifWidth;
      const height = Math.round((gifWidth * project.canvas.height) / project.canvas.width);
      const blob = await recordGIF(
        (time, canvas, ctx, w) =>
          engine.withQuality('high', () =>
            engine.renderFrame(time, canvas, ctx, w / project.canvas.width),
          ),
        {
          width,
          height,
          duration: gifDuration,
          fps: gifFps,
          onProgress: (f) => setBusy(`Encoding GIF ${Math.round(f * 100)}%`),
        },
      );
      await saveBlob(blob, 'leafforge-animation.gif');
      notify('GIF saved', 'success');
    } catch (err) {
      notify(`GIF export failed: ${err instanceof Error ? err.message : err}`, 'error');
    } finally {
      setBusy(null);
    }
  };

  const doSave = async () => {
    setBusy('Saving project…');
    try {
      await saveProjectFile(
        project,
        model ? { name: modelName, text: JSON.stringify(model.raw) } : undefined,
        `leafforge-${modelName || 'project'}`,
      );
      notify('Project saved', 'success');
    } catch (err) {
      notify(`Save failed: ${err instanceof Error ? err.message : err}`, 'error');
    } finally {
      setBusy(null);
    }
  };

  const doLoad = async (files: File[]) => {
    const text = await files[0].text();
    try {
      const { project: loaded, model: savedModel } = loadProjectFromText(text);
      loadProject(loaded);
      if (savedModel) {
        await loadModelFromString(savedModel.text, savedModel.name);
      }
      notify('Project loaded', 'success');
    } catch (err) {
      notify(`Could not open project: ${err instanceof Error ? err.message : err}`, 'error');
    }
  };

  async function loadModelFromString(text: string, name: string) {
    const buffer = new TextEncoder().encode(text);
    await loadModelFromFile(buffer.buffer);
    useStore.setState({ modelName: name });
  }

  return (
    <>
      <Section title="Thumbnail (PNG)">
        <Field label="Resolution">
          <Select
            value={String(pngScale)}
            onChange={(v) => setPngScale(parseFloat(v))}
            options={[
              { label: `${Math.round(project.canvas.width * 0.5)}×${Math.round(project.canvas.height * 0.5)} (half)`, value: '0.5' },
              { label: `${project.canvas.width}×${project.canvas.height} (native)`, value: '1' },
              { label: `${project.canvas.width * 2}×${project.canvas.height * 2} (2× supersample)`, value: '2' },
            ]}
          />
        </Field>
        <Button variant="primary" full onClick={doPng}>
          Export PNG
        </Button>
        <div className="hint">
          PNG exports capture the frame currently shown on the timeline.
        </div>
      </Section>

      <Section title="Animation (video)">
        <Field label="Format">
          <Segmented
            value={videoFormat}
            onChange={setVideoFormat}
            options={[
              { label: 'Auto', value: 'auto' },
              { label: 'WebM', value: 'webm' },
              { label: 'MP4', value: 'mp4' },
            ]}
          />
        </Field>
        <Slider label="Duration" value={videoDuration} min={0.5} max={15} step={0.1} onChange={setVideoDuration} format={(v) => `${v.toFixed(1)}s`} />
        <div className="row">
          <Button onClick={() => setVideoDuration(Math.round(suggested * 10) / 10)}>Fit: {suggested.toFixed(1)}s</Button>
        </div>
        <Slider label="Frame rate" value={videoFps} min={12} max={60} step={1} onChange={(v) => setVideoFps(Math.round(v))} format={(v) => `${Math.round(v)} fps`} />
        <Field label="Resolution">
          <Select
            value={String(videoScale)}
            onChange={(v) => setVideoScale(parseFloat(v))}
            options={[
              { label: 'Half size (fast)', value: '0.5' },
              { label: 'Native', value: '1' },
              { label: '2× (large files)', value: '2' },
            ]}
          />
        </Field>
        <Toggle label="Transparent background (WebM)" value={transparent} onChange={setTransparent} />
        <Button variant="primary" full onClick={doVideo} disabled={!mime}>
          {mime ? 'Record video' : 'Video unsupported here'}
        </Button>
        {mime && <div className="hint">Using {mime}</div>}
        {!mime && (
          <div className="hint warn">
            This browser has no MediaRecorder support. Use Chrome/Edge, or install the Android app
            from this repository.
          </div>
        )}
      </Section>

      <Section title="Animated GIF" defaultOpen={false}>
        <Slider label="Duration" value={gifDuration} min={0.5} max={10} step={0.1} onChange={setGifDuration} format={(v) => `${v.toFixed(1)}s`} />
        <Slider label="Frame rate" value={gifFps} min={6} max={24} step={1} onChange={(v) => setGifFps(Math.round(v))} format={(v) => `${Math.round(v)} fps`} />
        <Slider label="Width" value={gifWidth} min={240} max={960} step={40} onChange={(v) => setGifWidth(Math.round(v))} format={(v) => `${Math.round(v)}px`} />
        <Button full onClick={doGif}>
          Create GIF
        </Button>
        <div className="hint">GIFs are limited to 256 colours — best for short, punchy loops.</div>
      </Section>

      <Section title="Project" defaultOpen={false}>
        <div className="row wrap">
          <Button onClick={doSave} full>
            Save project
          </Button>
          <FileButton accept=".json,application/json" onFile={doLoad} full>
            Open project
          </FileButton>
        </div>
        <Button variant="danger" full onClick={() => {
          if (confirm('Reset everything back to the default project?')) reset();
        }}>
          Reset to default
        </Button>
        <div className="hint">
          A saved project keeps every layer, the backdrop and the model itself, so you can pick up
          where you left off.
        </div>
      </Section>
    </>
  );
}
