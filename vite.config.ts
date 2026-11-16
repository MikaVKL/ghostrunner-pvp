import { defineConfig } from 'vite';

/** Port of the game server (HTTP + WebSocket). Keep in sync with src/server/main.ts. */
const SERVER_PORT = Number(process.env.PORT ?? 3000);

/**
 * Two kinds of builds:
 *
 *   npm run build         -> dist/client, served by our own game server at "/"
 *   npm run build:pages   -> dist/pages, a purely static site for GitHub Pages
 *
 * A GitHub Pages project site lives in a sub-folder: https://NAME.github.io/REPO/.
 * All file links in the built page must start with that folder, which is what `base`
 * does. The deploy workflow (.github/workflows/pages.yml) sets BASE_PATH to the real
 * repository name; the default below is used for local `npm run build:pages`.
 */
const PAGES_BASE = process.env.BASE_PATH ?? '/ghostrunner-pvp/';

export default defineConfig(({ mode }) => {
  const forPages = mode === 'pages';
  return {
    base: forPages ? PAGES_BASE : '/',
    build: {
      outDir: forPages ? 'dist/pages' : 'dist/client',
      emptyOutDir: true,
      chunkSizeWarningLimit: 1000, // Three.js is large; that is expected
    },
    server: {
      port: 5173,
      host: true, // also reachable from other devices in the same Wi-Fi
      // In dev the browser talks to Vite; Vite forwards the WebSocket to the game server.
      proxy: {
        '/ws': { target: `ws://localhost:${SERVER_PORT}`, ws: true },
        '/stats': { target: `http://localhost:${SERVER_PORT}` },
      },
    },
  };
});
