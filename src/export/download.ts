/** Download helpers that work in the browser and inside the Android WebView. */

declare global {
  interface Window {
    LeafForgeNative?: {
      saveBase64?(name: string, mime: string, base64: string): void;
      saveBlob?(name: string, mime: string, dataUrl: string): void;
    };
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export function sanitizeFilename(name: string): string {
  return (
    name
      .replace(/[^\w.\- ]+/g, '_')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^[-.]+/, '')
      .slice(0, 80) || 'leafforge'
  );
}

/**
 * Save a blob. Uses the native Android bridge when running inside the APK,
 * otherwise falls back to an <a download> click.
 */
export async function saveBlob(blob: Blob, filename: string): Promise<void> {
  const name = sanitizeFilename(filename);
  const native = typeof window !== 'undefined' ? window.LeafForgeNative : undefined;
  if (native && typeof native.saveBase64 === 'function') {
    try {
      const base64 = await blobToBase64(blob);
      native.saveBase64(name, blob.type || 'application/octet-stream', base64);
      return;
    } catch {
      /* fall through to the browser path */
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1000);
}

export function pickMimeType(candidates: string[]): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  return candidates.find((t) => MediaRecorder.isTypeSupported(t));
}
