import { defineConfig } from 'vite';

/** Port of the game server (HTTP + WebSocket). Keep in sync with src/server/main.ts. */
const SERVER_PORT = Number(process.env.PORT ?? 3000);

export default defineConfig({
  build: {
    outDir: 'dist/client',
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
});
