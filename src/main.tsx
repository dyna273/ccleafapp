import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

// Thumbnail display faces, bundled so the app works fully offline.
import '@fontsource/anton/400.css';
import '@fontsource/bebas-neue/400.css';
import '@fontsource/luckiest-guy/400.css';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

// Make sure canvas text uses the loaded webfonts, not a fallback metric.
if (document.fonts?.ready) {
  document.fonts.ready.then(() => window.dispatchEvent(new Event('fontsready')));
}

// Progressive web app: installable, and offline-capable once cached.
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(new URL('./sw.js', document.baseURI).href, { scope: './' })
      .catch(() => {
        /* offline support is a nice-to-have, never fatal */
      });
  });
}
