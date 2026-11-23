import { copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig } from 'vitest/config';
import type { Plugin, ResolvedConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages has no SPA fallback: it serves 404.html for unknown paths. Shipping a copy of
// index.html as 404.html makes deep links (/game/123, /search?...) load the app directly.
function spaFallback(): Plugin {
  let config: ResolvedConfig;
  return {
    name: 'spa-404-fallback',
    apply: 'build',
    configResolved(c) {
      config = c;
    },
    closeBundle() {
      const out = join(config.root, config.build.outDir);
      copyFileSync(join(out, 'index.html'), join(out, '404.html'));
    },
  };
}

export default defineConfig({
  // The Pages workflow sets PAGES_BASE=/<repo>/; locally the site lives at /.
  base: process.env.PAGES_BASE || '/',
  plugins: [react(), spaFallback()],
  test: {
    environment: 'node',
  },
});
