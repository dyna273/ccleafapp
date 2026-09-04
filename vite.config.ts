import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * Two build modes:
 *   default -> a normal web app (works from any static host / PWA)
 *   apk     -> one single self-contained index.html, because the Android
 *              wrapper loads it from file:///android_asset, where ES module
 *              scripts and fetch() are blocked by CORS.
 */
export default defineConfig(({ mode }) => {
  const apk = mode === 'apk';
  return {
    base: './',
    plugins: [react(), ...(apk ? [viteSingleFile()] : [])],
    build: {
      target: 'es2019',
      cssCodeSplit: false,
      assetsInlineLimit: apk ? 100_000_000 : 4096,
      chunkSizeWarningLimit: 4096,
      sourcemap: false,
      reportCompressedSize: false,
      rollupOptions: apk
        ? {
            output: {
              inlineDynamicImports: true,
              format: 'iife' as const,
              entryFileNames: 'assets/[name].js',
              assetFileNames: 'assets/[name][extname]',
            },
          }
        : undefined,
    },
    server: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: false,
      cors: true,
      // the sandbox preview is served from a generated *.e2b.app host
      allowedHosts: true as never,
      hmr: { clientPort: 443, protocol: 'wss' },
    },
    preview: {
      host: '0.0.0.0',
      port: 4173,
      allowedHosts: true as never,
    },
  };
});
