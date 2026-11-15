/**
 * Minimal static file server for the built client (dist/client).
 * Only used in production (`npm run build && npm start`); in dev, Vite serves the client.
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import type { ServerResponse } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.glb': 'model/gltf-binary',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wasm': 'application/wasm',
};

/** Send a file from `rootDir`. Unknown paths get index.html. Returns false if nothing was sent. */
export function serveStatic(rootDir: string, urlPath: string, res: ServerResponse): boolean {
  const root = resolve(rootDir);
  if (!existsSync(root)) return false;

  let relative: string;
  try {
    relative = normalize(decodeURIComponent(urlPath.split('?')[0]));
  } catch {
    return false;
  }
  let filePath = join(root, relative);
  // Never serve anything outside of the root directory.
  if (!filePath.startsWith(root)) return false;
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) filePath = join(root, 'index.html');
  if (!existsSync(filePath)) return false;

  res.writeHead(200, {
    'Content-Type': MIME_TYPES[extname(filePath)] ?? 'application/octet-stream',
  });
  createReadStream(filePath).pipe(res);
  return true;
}
