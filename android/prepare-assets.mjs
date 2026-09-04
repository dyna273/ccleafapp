/**
 * Copies the single-file web build plus the bundled sample models into
 * android/app/src/main/assets, ready to be packaged as file:///android_asset.
 *
 * Everything the app needs at runtime is inlined into index.html by
 * vite-plugin-singlefile, so the WebView can load it straight off the
 * filesystem with no server and no network.
 */
import { copyFileSync, mkdirSync, rmSync, existsSync, statSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repo = resolve(__dirname, '..');
const dist = resolve(repo, 'dist');
const assets = resolve(repo, 'android/app/src/main/assets');

if (!existsSync(join(dist, 'index.html'))) {
  console.error('dist/index.html not found - run `npm run build:apk-assets` (or npm run build) first');
  process.exit(1);
}

rmSync(assets, { recursive: true, force: true });
mkdirSync(assets, { recursive: true });

copyFileSync(join(dist, 'index.html'), join(assets, 'index.html'));
console.log('  index.html', `${(statSync(join(assets, 'index.html')).size / 1024).toFixed(0)} kB`);

// sample models (loaded with fetch() from the asset tree)
const copyDir = (from, to) => {
  mkdirSync(to, { recursive: true });
  let total = 0;
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    const src = join(from, entry.name);
    const dst = join(to, entry.name);
    if (entry.isDirectory()) {
      total += copyDir(src, dst);
    } else {
      copyFileSync(src, dst);
      total += statSync(dst).size;
    }
  }
  return total;
};

const modelsFrom = join(dist, 'models');
if (existsSync(modelsFrom)) {
  const bytes = copyDir(modelsFrom, join(assets, 'models'));
  console.log('  models/', `${(bytes / 1024).toFixed(0)} kB`);
}

// a tiny landing page shown if the WebView ever fails to load the app
copyFileSync(join(repo, 'android/offline.html'), join(assets, 'offline.html'));
console.log('  offline.html');

// Inline the sample models so the app still works on devices where a file://
// page is not allowed to fetch() other files. The app prefers this registry
// over the network/asset path.
const sampleNames = existsSync(modelsFrom) ? readdirSync(modelsFrom).filter((f) => f.endsWith('.bbmodel')) : [];
if (sampleNames.length) {
  const entries = sampleNames
    .map((name) => `${JSON.stringify(name)}:${JSON.stringify(
      readFileSync(join(modelsFrom, name)).toString('base64'),
    )}`)
    .join(',');
  const injection = `<script>window.LEAFFORGE_SAMPLES={${entries}};</script>`;
  const index = join(assets, 'index.html');
  const html = readFileSync(index, 'utf8');
  if (html.includes('</body>')) {
    writeFileSync(index, html.replace('</body>', `${injection}</body>`));
  } else {
    writeFileSync(index, html + injection);
  }
  console.log(`  inlined ${sampleNames.length} sample models (${(entries.length / 1024).toFixed(0)} kB)`);
}

console.log('\nassets ready at', relative(repo, assets));
