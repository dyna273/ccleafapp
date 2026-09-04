/**
 * Minimal DOM environment so React components can be mounted for real (not
 * server-rendered) inside Node. Import this module BEFORE anything that
 * touches `document`.
 */
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  pretendToBeVisual: true,
  url: 'http://localhost/',
});

const g = globalThis as unknown as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
g.navigator = dom.window.navigator;
g.HTMLElement = dom.window.HTMLElement;
g.HTMLCanvasElement = dom.window.HTMLCanvasElement;
g.HTMLImageElement = dom.window.HTMLImageElement;
g.Event = dom.window.Event;
g.CustomEvent = dom.window.CustomEvent;
g.KeyboardEvent = dom.window.KeyboardEvent;
g.MouseEvent = dom.window.MouseEvent;
g.Node = dom.window.Node;
g.getComputedStyle = dom.window.getComputedStyle;
g.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
g.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
g.IS_REACT_ACT_ENVIRONMENT = true;

/** Recording 2D context: enough for the compositor, and it counts calls. */
export const drawCalls: Record<string, number> = {};

function makeContext(canvas: unknown): CanvasRenderingContext2D {
  const bump = (name: string) => {
    drawCalls[name] = (drawCalls[name] || 0) + 1;
  };
  const gradient = {
    addColorStop() {
      bump('addColorStop');
    },
  };
  const base: Record<string, unknown> = {
    canvas,
    measureText: (s: string) => ({ width: String(s).length * 8 }),
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    createPattern: () => null,
    getImageData: (_x: number, _y: number, w: number, h: number) => ({
      data: new Uint8ClampedArray(w * h * 4),
      width: w,
      height: h,
    }),
    putImageData: () => undefined,
  };
  return new Proxy(base, {
    get(obj, prop: string) {
      if (prop in obj) {
        const value = obj[prop];
        if (typeof value === 'function') {
          return (...args: unknown[]) => {
            bump(prop);
            return (value as (...a: unknown[]) => unknown)(...args);
          };
        }
        return value;
      }
      return () => {
        bump(prop);
        return undefined;
      };
    },
    set() {
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

(dom.window.HTMLCanvasElement.prototype as unknown as Record<string, unknown>).getContext =
  function getContext(this: unknown) {
    return makeContext(this);
  };

export { dom };
