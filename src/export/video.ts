import type { StudioEngine } from '../engine/studio';

export interface VideoExportOptions {
  duration: number;
  fps: number;
  scale: number;
  transparent: boolean;
  /** 'webm' | 'mp4' | 'auto' */
  format: 'webm' | 'mp4' | 'auto';
  onProgress?: (fraction: number) => void;
}

const CANDIDATES = {
  webm: [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ],
  mp4: [
    'video/mp4;codecs=avc1.42E01E',
    'video/mp4;codecs=h264',
    'video/mp4',
  ],
};

export function pickVideoMime(format: 'webm' | 'mp4' | 'auto'): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  const lists =
    format === 'webm' ? [CANDIDATES.webm, CANDIDATES.mp4] : format === 'mp4' ? [CANDIDATES.mp4, CANDIDATES.webm] : [CANDIDATES.webm, CANDIDATES.mp4];
  for (const list of lists) {
    const found = list.find((t) => MediaRecorder.isTypeSupported(t));
    if (found) return found;
  }
  return undefined;
}

/**
 * Render the timeline off-screen and record it. Frames are pushed one at a
 * time (captureStream(0) + requestFrame) so the output is frame-accurate
 * regardless of how fast the host machine is.
 */
export async function recordVideo(engine: StudioEngine, options: VideoExportOptions): Promise<Blob> {
  const { duration, fps, scale, transparent, onProgress } = options;
  const mimeType = pickVideoMime(options.format);
  if (!mimeType) throw new Error('Video recording is not supported in this browser.');

  const p = engine.project;
  const w = Math.max(2, Math.round(p.canvas.width * scale));
  const h = Math.max(2, Math.round(p.canvas.height * scale));

  // renderFrame sizes (and clears) the canvas itself, so only pass the scale
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { alpha: true })!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  void transparent;

  // captureStream(0) + requestFrame() gives frame-accurate output. Older
  // WebViews do not implement requestFrame, so fall back to a live stream
  // driven at the requested frame rate.
  const supportsRequestFrame =
    typeof (canvas.captureStream(0).getVideoTracks()[0] as CanvasCaptureMediaStreamTrack | undefined)
      ?.requestFrame === 'function';
  const stream = supportsRequestFrame ? canvas.captureStream(0) : canvas.captureStream(fps);
  const track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack | undefined;

  const chunks: Blob[] = [];
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: estimateBitrate(w, h, fps),
  });
  const done = new Promise<void>((resolve, reject) => {
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = () => resolve();
    recorder.onerror = () => reject(new Error('Recording failed'));
  });

  recorder.start();

  const totalFrames = Math.max(1, Math.round(duration * fps));

  await engine.withQuality('high', async () => {
    for (let i = 0; i < totalFrames; i++) {
      const t = i / fps;
      engine.renderFrame(t, canvas, ctx, scale);
      if (track && typeof track.requestFrame === 'function') track.requestFrame();
      onProgress?.((i + 1) / totalFrames);
      if (supportsRequestFrame) {
        // Yield so the encoder and the UI can breathe.
        await new Promise((r) => setTimeout(r, 0));
      } else {
        // No requestFrame: the stream samples itself, so pace in real time.
        await new Promise((r) => setTimeout(r, 1000 / fps));
      }
    }
  });

  // Let the last frames flush into the encoder.
  await new Promise((r) => setTimeout(r, 250));
  recorder.stop();
  await done;
  stream.getTracks().forEach((t) => t.stop());
  return new Blob(chunks, { type: mimeType });
}

function estimateBitrate(w: number, h: number, fps: number): number {
  const pixels = w * h * fps;
  return Math.min(60_000_000, Math.max(6_000_000, pixels * 0.22));
}
