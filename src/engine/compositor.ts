import type { BackgroundSettings, Layer } from '../state/types';
import { sampleLayerAnim, type LayerAnimState } from './presets';

export type ImageCache = Map<string, HTMLImageElement>;

/* ------------------------------------------------------------------ */
/*  Background                                                          */
/* ------------------------------------------------------------------ */

export function gradientFromAngle(
  ctx: CanvasRenderingContext2D,
  angle: number,
  w: number,
  h: number,
  c1: string,
  c2: string,
) {
  const rad = ((angle - 90) * Math.PI) / 180;
  const cx = w / 2;
  const cy = h / 2;
  const len = Math.abs(w * Math.cos(rad)) + Math.abs(h * Math.sin(rad));
  const dx = (Math.cos(rad) * len) / 2;
  const dy = (Math.sin(rad) * len) / 2;
  const g = ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
  g.addColorStop(0, c1);
  g.addColorStop(1, c2);
  return g;
}

export function drawBackground(
  ctx: CanvasRenderingContext2D,
  bg: BackgroundSettings,
  w: number,
  h: number,
  images: ImageCache,
) {
  ctx.clearRect(0, 0, w, h);
  if (bg.kind === 'transparent') return;

  if (bg.kind === 'solid') {
    ctx.fillStyle = bg.color;
    ctx.fillRect(0, 0, w, h);
  } else if (bg.kind === 'gradient') {
    ctx.fillStyle = gradientFromAngle(ctx, bg.angle, w, h, bg.color, bg.color2);
    ctx.fillRect(0, 0, w, h);
  } else if (bg.kind === 'image') {
    const img = bg.src ? images.get(bg.src) : undefined;
    if (img && img.complete && img.naturalWidth) {
      const filters: string[] = [];
      if (bg.blur > 0) filters.push(`blur(${bg.blur * (h / 720)}px)`);
      if (bg.brightness !== 1) filters.push(`brightness(${bg.brightness})`);
      if (bg.saturation !== 1) filters.push(`saturate(${bg.saturation})`);
      ctx.save();
      if (filters.length) ctx.filter = filters.join(' ');
      const scale =
        bg.fit === 'cover'
          ? Math.max(w / img.naturalWidth, h / img.naturalHeight)
          : Math.min(w / img.naturalWidth, h / img.naturalHeight);
      const dw = img.naturalWidth * scale;
      const dh = img.naturalHeight * scale;
      ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
      ctx.restore();
    } else {
      ctx.fillStyle = '#101018';
      ctx.fillRect(0, 0, w, h);
    }
  }

  if (bg.overlayOpacity > 0) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, bg.overlayOpacity));
    ctx.fillStyle = bg.overlayColor;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  if (bg.vignette > 0) {
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${bg.vignette})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
}

/* ------------------------------------------------------------------ */
/*  Text                                                                */
/* ------------------------------------------------------------------ */

interface TextLayout {
  lines: string[];
  widths: number[];
  fontSize: number;
  letterSpacing: number;
  lineHeight: number;
  width: number;
  height: number;
  charCount: number;
}

function measureLayout(
  ctx: CanvasRenderingContext2D,
  layer: Layer,
  _w: number,
  h: number,
): TextLayout {
  const scale = layer.scale || 1;
  const fontSize = (layer.fontSize || 0.12) * h * scale;
  const letterSpacing = (layer.letterSpacing || 0) * fontSize;
  const weight = layer.fontWeight || 400;
  const style = layer.italic ? 'italic ' : '';
  ctx.font = `${style}${weight} ${fontSize}px ${layer.fontFamily || 'sans-serif'}`;

  const raw = layer.uppercase ? (layer.text || '').toUpperCase() : layer.text || '';
  const lines = raw.split('\n');
  const widths = lines.map((line) => {
    let total = 0;
    for (const ch of line) total += ctx.measureText(ch).width + letterSpacing;
    return Math.max(0, total - letterSpacing);
  });
  const width = Math.max(...widths, 0);
  const lineHeight = (layer.lineHeight || 1.1) * fontSize;
  return {
    lines,
    widths,
    fontSize,
    letterSpacing,
    lineHeight,
    width,
    height: lineHeight * lines.length,
    charCount: raw.replace(/\n/g, '').length,
  };
}

interface RunOptions {
  align: 'left' | 'center' | 'right';
  fill: string | CanvasGradient;
  stroke?: { color: string; width: number; style: 'outline' | 'extrude'; depth: number } | null;
}

function drawRun(
  ctx: CanvasRenderingContext2D,
  text: string,
  originX: number,
  baselineY: number,
  opts: RunOptions,
  letterSpacing: number,
  arc: number,
  lineWidth: number,
  revealFrom: number,
  revealTo: number,
) {
  const chars = Array.from(text);
  let x = originX;
  if (opts.align === 'center') x = originX - lineWidth / 2;
  else if (opts.align === 'right') x = originX - lineWidth;

  // Straight text: draw the whole run (fast path) unless we need reveal/arc.
  if (!arc && revealFrom === 0 && revealTo >= chars.length) {
    const spaced = letterSpacing !== 0;
    if (opts.stroke) {
      ctx.lineJoin = 'round';
      ctx.miterLimit = 2;
      ctx.strokeStyle = opts.stroke.color;
      ctx.lineWidth = opts.stroke.width;
      if (opts.stroke.style === 'extrude') {
        const steps = Math.max(1, Math.round(opts.stroke.depth));
        for (let i = steps; i >= 1; i--) {
          ctx.save();
          ctx.translate(i * 0.9, i * 0.9);
          if (spaced) drawSpaced(ctx, text, x, baselineY, letterSpacing, 'stroke');
          else ctx.strokeText(text, x, baselineY);
          ctx.restore();
        }
      } else if (spaced) {
        drawSpaced(ctx, text, x, baselineY, letterSpacing, 'stroke');
      } else {
        ctx.strokeText(text, x, baselineY);
      }
    }
    if (spaced) drawSpaced(ctx, text, x, baselineY, letterSpacing, 'fill');
    else ctx.fillText(text, x, baselineY);
    return;
  }

  // Per-character path (letter spacing, arc, or typewriter reveal)
  const count = chars.length;
  const totalAngle = (arc * Math.PI) / 180;
  const radius = totalAngle ? (lineWidth + letterSpacing) / totalAngle : 0;
  let angle = -totalAngle / 2;

  for (let i = 0; i < count; i++) {
    const visible = i >= revealFrom && i < revealTo;
    if (!visible) {
      x += ctx.measureText(chars[i]).width + letterSpacing;
      if (arc) angle += (ctx.measureText(chars[i]).width + letterSpacing) / radius;
      continue;
    }
    ctx.save();
    if (arc) {
      const cx = originX;
      const cy = baselineY + radius;
      const px = cx + Math.sin(angle) * radius;
      const py = cy - Math.cos(angle) * radius;
      ctx.translate(px, py);
      ctx.rotate(angle);
      ctx.translate(-ctx.measureText(chars[i]).width / 2, 0);
      if (opts.stroke) {
        ctx.lineJoin = 'round';
        ctx.strokeStyle = opts.stroke.color;
        ctx.lineWidth = opts.stroke.width;
        if (opts.stroke.style === 'extrude') {
          for (let d = Math.round(opts.stroke.depth); d >= 1; d--) {
            ctx.save();
            ctx.translate(d * 0.9, d * 0.9);
            ctx.strokeText(chars[i], 0, 0);
            ctx.restore();
          }
        } else {
          ctx.strokeText(chars[i], 0, 0);
        }
      }
      ctx.fillText(chars[i], 0, 0);
      angle += (ctx.measureText(chars[i]).width + letterSpacing) / radius;
    } else {
      if (opts.stroke) {
        ctx.lineJoin = 'round';
        ctx.strokeStyle = opts.stroke.color;
        ctx.lineWidth = opts.stroke.width;
        if (opts.stroke.style === 'extrude') {
          for (let d = Math.round(opts.stroke.depth); d >= 1; d--) {
            ctx.save();
            ctx.translate(x + d * 0.9, baselineY + d * 0.9);
            ctx.strokeText(chars[i], 0, 0);
            ctx.restore();
          }
        } else {
          ctx.strokeText(chars[i], x, baselineY);
        }
      }
      ctx.fillText(chars[i], x, baselineY);
    }
    ctx.restore();
    x += ctx.measureText(chars[i]).width + letterSpacing;
  }
}

function drawSpaced(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  letterSpacing: number,
  mode: 'fill' | 'stroke',
) {
  let cx = x;
  for (const ch of text) {
    if (mode === 'fill') ctx.fillText(ch, cx, y);
    else ctx.strokeText(ch, cx, y);
    cx += ctx.measureText(ch).width + letterSpacing;
  }
}

function drawTextLayer(ctx: CanvasRenderingContext2D, layer: Layer, w: number, h: number, anim: LayerAnimState) {
  const layout = measureLayout(ctx, layer, w, h);
  if (!layout.lines.length) return;

  const cx = layer.x * w + anim.offsetX * (w / 1280);
  const cy = layer.y * h + anim.offsetY * (h / 720);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(((layer.rotation + anim.rotation) * Math.PI) / 180);
  ctx.scale(anim.scaleX, anim.scaleY);
  if (anim.skew) ctx.transform(1, 0, Math.tan((anim.skew * Math.PI) / 180), 1, 0, 0);
  ctx.globalAlpha *= layer.opacity * anim.alpha;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';

  // fill style
  let fill: string | CanvasGradient = '#fff';
  if (layer.fill?.type === 'gradient') {
    fill = gradientFromAngle(
      ctx,
      layer.fill.angle,
      layout.width || 1,
      layout.height || 1,
      layer.fill.color,
      layer.fill.color2,
    );
    // gradients are absolute; shift into local space
    const g2 = ctx.createLinearGradient(
      -layout.width / 2,
      -layout.height / 2,
      -layout.width / 2 + Math.sin((layer.fill.angle * Math.PI) / 180) * layout.width,
      -layout.height / 2 + Math.cos((layer.fill.angle * Math.PI) / 180) * layout.height,
    );
    g2.addColorStop(0, layer.fill.color);
    g2.addColorStop(1, layer.fill.color2);
    fill = g2;
  } else if (layer.fill?.type === 'solid') {
    fill = layer.fill.color;
  }

  const stroke = layer.stroke?.enabled
    ? {
        color: layer.stroke.color,
        width: layer.stroke.width * h,
        style: layer.stroke.style,
        depth: layer.stroke.depth,
      }
    : null;

  // glow pass
  if (anim.glow > 0) {
    ctx.save();
    ctx.shadowColor = 'rgba(255,255,255,0.9)';
    ctx.shadowBlur = 40 * anim.glow;
    ctx.globalAlpha *= 0.9;
    ctx.restore();
  }

  // drop shadow
  if (layer.shadow?.enabled) {
    ctx.shadowColor = layer.shadow.color;
    ctx.shadowBlur = layer.shadow.blur * (h / 720);
    ctx.shadowOffsetX = layer.shadow.dx * (w / 1280);
    ctx.shadowOffsetY = layer.shadow.dy * (h / 720);
  } else {
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  }

  // typewriter reveal window
  const totalChars = layout.charCount;
  const revealed = Math.round(anim.reveal * totalChars);
  let consumed = 0;

  const startY = -((layout.lines.length - 1) * layout.lineHeight) / 2;
  for (let i = 0; i < layout.lines.length; i++) {
    const lineChars = Array.from(layout.lines[i]).length;
    const from = Math.max(0, Math.min(lineChars, revealed - consumed));
    const to = lineChars;
    consumed += lineChars;
    if (anim.reveal >= 1) {
      drawRun(
        ctx,
        layout.lines[i],
        0,
        startY + i * layout.lineHeight,
        { align: layer.align || 'center', fill, stroke },
        layout.letterSpacing,
        layer.arc || 0,
        layout.widths[i],
        0,
        lineChars,
      );
    } else {
      drawRun(
        ctx,
        layout.lines[i],
        0,
        startY + i * layout.lineHeight,
        { align: layer.align || 'center', fill, stroke },
        layout.letterSpacing,
        layer.arc || 0,
        layout.widths[i],
        0,
        from,
      );
    }
    void to;
  }
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/*  Shapes                                                              */
/* ------------------------------------------------------------------ */

function pathShape(ctx: CanvasRenderingContext2D, layer: Layer, w: number, _h: number) {
  const sw = (layer.shapeW || 0.2) * w * (layer.scale || 1);
  const sh = (layer.shapeH || 0.2) * w * (layer.scale || 1);
  const kind = layer.shape || 'rect';
  ctx.beginPath();
  switch (kind) {
    case 'circle':
      ctx.ellipse(0, 0, sw / 2, sh / 2, 0, 0, Math.PI * 2);
      break;
    case 'ring': {
      const thick = Math.max(2, (layer.corner || 12) / 100) * (w / 1280) * 6;
      ctx.ellipse(0, 0, sw / 2, sh / 2, 0, 0, Math.PI * 2);
      ctx.ellipse(0, 0, Math.max(1, sw / 2 - thick), Math.max(1, sh / 2 - thick), 0, 0, Math.PI * 2, true);
      break;
    }
    case 'underline': {
      const bh = Math.max(4, sh * 0.18);
      roundRectPath(ctx, -sw / 2, -bh / 2, sw, bh, bh / 2);
      break;
    }
    case 'arrow': {
      // Arrow pointing right, centred on the origin
      const hw = sw / 2;
      const hh = sh / 2;
      ctx.moveTo(-hw, -hh * 0.28);
      ctx.lineTo(hw * 0.18, -hh * 0.28);
      ctx.lineTo(hw * 0.18, -hh);
      ctx.lineTo(hw, 0);
      ctx.lineTo(hw * 0.18, hh);
      ctx.lineTo(hw * 0.18, hh * 0.28);
      ctx.lineTo(-hw, hh * 0.28);
      ctx.closePath();
      break;
    }
    case 'burst':
    case 'star': {
      const points = Math.max(3, layer.points || (kind === 'burst' ? 14 : 5));
      const inner = kind === 'burst' ? 0.62 : 0.42;
      for (let i = 0; i < points * 2; i++) {
        const r = i % 2 === 0 ? 1 : inner;
        const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
        const px = Math.cos(a) * (sw / 2) * r;
        const py = Math.sin(a) * (sh / 2) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      break;
    }
    case 'triangle': {
      ctx.moveTo(0, -sh / 2);
      ctx.lineTo(sw / 2, sh / 2);
      ctx.lineTo(-sw / 2, sh / 2);
      ctx.closePath();
      break;
    }
    case 'blob': {
      const points = 48;
      for (let i = 0; i <= points; i++) {
        const a = (i / points) * Math.PI * 2;
        const wob = 1 + 0.08 * Math.sin(a * 3) + 0.05 * Math.sin(a * 5 + 1.2);
        const px = Math.cos(a) * (sw / 2) * wob;
        const py = Math.sin(a) * (sh / 2) * wob;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      break;
    }
    case 'rect':
    default: {
      const r = ((layer.corner || 0) / 100) * Math.min(sw, sh);
      roundRectPath(ctx, -sw / 2, -sh / 2, sw, sh, r);
      break;
    }
  }
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawShapeLayer(ctx: CanvasRenderingContext2D, layer: Layer, w: number, h: number, anim: LayerAnimState) {
  const cx = layer.x * w + anim.offsetX * (w / 1280);
  const cy = layer.y * h + anim.offsetY * (h / 720);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(((layer.rotation + anim.rotation) * Math.PI) / 180);
  ctx.scale(anim.scaleX, anim.scaleY);
  ctx.globalAlpha *= layer.opacity * anim.alpha;

  if (layer.shadow?.enabled) {
    ctx.shadowColor = layer.shadow.color;
    ctx.shadowBlur = layer.shadow.blur * (h / 720);
    ctx.shadowOffsetX = layer.shadow.dx * (w / 1280);
    ctx.shadowOffsetY = layer.shadow.dy * (h / 720);
  }

  pathShape(ctx, layer, w, h);

  if (layer.fill?.type === 'gradient') {
    const sw = (layer.shapeW || 0.2) * w * (layer.scale || 1);
    const sh = (layer.shapeH || 0.2) * w * (layer.scale || 1);
    const g = ctx.createLinearGradient(-sw / 2, -sh / 2, sw / 2, sh / 2);
    g.addColorStop(0, layer.fill.color);
    g.addColorStop(1, layer.fill.color2);
    ctx.fillStyle = g;
  } else if (layer.fill?.type === 'solid') {
    ctx.fillStyle = layer.fill.color;
  } else {
    ctx.fillStyle = 'transparent';
  }
  ctx.fill('evenodd');

  if (layer.stroke?.enabled) {
    ctx.lineJoin = 'round';
    ctx.strokeStyle = layer.stroke.color;
    ctx.lineWidth = layer.stroke.width * h;
    ctx.stroke();
  }
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/*  Images                                                              */
/* ------------------------------------------------------------------ */

export function drawImageLayer(
  ctx: CanvasRenderingContext2D,
  layer: Layer,
  w: number,
  h: number,
  anim: LayerAnimState,
  images: ImageCache,
) {
  const img = layer.src ? images.get(layer.src) : undefined;
  if (!img || !img.complete || !img.naturalWidth) return;
  const iw = (layer.imgW || 0.25) * w * (layer.scale || 1);
  const ih = (layer.imgH || 0.25) * w * (layer.scale || 1);
  const cx = layer.x * w + anim.offsetX * (w / 1280);
  const cy = layer.y * h + anim.offsetY * (h / 720);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(((layer.rotation + anim.rotation) * Math.PI) / 180);
  ctx.scale(anim.scaleX, anim.scaleY);
  ctx.globalAlpha *= layer.opacity * anim.alpha;
  if (layer.shadow?.enabled) {
    ctx.shadowColor = layer.shadow.color;
    ctx.shadowBlur = layer.shadow.blur * (h / 720);
    ctx.shadowOffsetX = layer.shadow.dx * (w / 1280);
    ctx.shadowOffsetY = layer.shadow.dy * (h / 720);
  }
  ctx.drawImage(img, -iw / 2, -ih / 2, iw, ih);
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/*  Layer dispatch                                                      */
/* ------------------------------------------------------------------ */

export function drawLayer(
  ctx: CanvasRenderingContext2D,
  layer: Layer,
  w: number,
  h: number,
  time: number,
  images: ImageCache,
  forceVisible = false,
) {
  if (!layer.visible && !forceVisible) return;
  const anim = sampleLayerAnim(
    layer.anim?.preset || 'none',
    time,
    layer.anim?.delay || 0,
    layer.anim?.duration || 0.6,
    !!layer.anim?.loop,
    layer.anim?.intensity ?? 1,
  );
  if (!anim.visible) return;
  if (layer.kind === 'text') drawTextLayer(ctx, layer, w, h, anim);
  else if (layer.kind === 'shape') drawShapeLayer(ctx, layer, w, h, anim);
  else if (layer.kind === 'image') drawImageLayer(ctx, layer, w, h, anim, images);
}

/** Draw every overlay layer in order. */
export function drawLayers(
  ctx: CanvasRenderingContext2D,
  layers: Layer[],
  w: number,
  h: number,
  time: number,
  images: ImageCache,
) {
  for (const layer of layers) drawLayer(ctx, layer, w, h, time, images);
}

export function layerBounds(layer: Layer, w: number, h: number): { x: number; y: number; w: number; h: number } {
  if (layer.kind === 'text') {
    const fontSize = (layer.fontSize || 0.12) * h * (layer.scale || 1);
    const lines = (layer.text || '').split('\n').length || 1;
    const width = (layer.text || '').length * fontSize * 0.6;
    return {
      x: layer.x * w - width / 2,
      y: layer.y * h - (fontSize * lines) / 2,
      w: width,
      h: fontSize * lines,
    };
  }
  if (layer.kind === 'image') {
    const iw = (layer.imgW || 0.25) * w * (layer.scale || 1);
    const ih = (layer.imgH || 0.25) * w * (layer.scale || 1);
    return { x: layer.x * w - iw / 2, y: layer.y * h - ih / 2, w: iw, h: ih };
  }
  const sw = (layer.shapeW || 0.2) * w * (layer.scale || 1);
  const sh = (layer.shapeH || 0.2) * w * (layer.scale || 1);
  return { x: layer.x * w - sw / 2, y: layer.y * h - sh / 2, w: sw, h: sh };
}
