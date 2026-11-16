/**
 * Guards for the project rules in CLAUDE.md. These tests read the source files and fail
 * if someone breaks a rule that would cause desyncs or tangle the folders together.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '../../src');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith('.ts') ? [path] : [];
  });
}

/** All `from '...'` import paths of a file. */
function importsOf(file: string): string[] {
  const text = readFileSync(file, 'utf8');
  return [...text.matchAll(/(?:from|import)\s+'([^']+)'/g)].map((m) => m[1]);
}

/** Files in `folder` that import something from one of the `forbidden` top-level folders. */
function forbiddenImports(folder: string, forbidden: string[]): string[] {
  const problems: string[] = [];
  for (const file of sourceFiles(join(SRC, folder))) {
    for (const path of importsOf(file)) {
      if (!path.startsWith('.')) continue;
      const target = relative(SRC, join(file, '..', path)).split(/[\\/]/)[0];
      if (forbidden.includes(target)) problems.push(`${relative(SRC, file)} imports from ${target}/`);
    }
  }
  return problems;
}

describe('folder import rules', () => {
  it('shared imports nothing from the other folders', () => {
    expect(forbiddenImports('shared', ['server', 'client', 'netcode', 'bots', 'solo'])).toEqual([]);
  });

  it('shared does not use Three.js, the DOM-only client or Node APIs', () => {
    const problems = sourceFiles(join(SRC, 'shared')).flatMap((file) =>
      importsOf(file)
        .filter((path) => path === 'three' || path === 'ws' || path.startsWith('node:'))
        .map((path) => `${relative(SRC, file)} imports ${path}`),
    );
    expect(problems).toEqual([]);
  });

  it('server and client never import each other', () => {
    expect(forbiddenImports('server', ['client', 'bots', 'solo'])).toEqual([]);
    expect(forbiddenImports('client', ['server', 'bots'])).toEqual([]);
  });

  it('solo (server core + bot in one program) is the only bridge, and knows nothing about the browser client', () => {
    expect(forbiddenImports('solo', ['client'])).toEqual([]);
  });

  it('netcode stays independent of browser, server and bots', () => {
    expect(forbiddenImports('netcode', ['client', 'server', 'bots', 'solo'])).toEqual([]);
    const usesThree = sourceFiles(join(SRC, 'netcode')).filter((f) => importsOf(f).includes('three'));
    expect(usesThree).toEqual([]);
  });

  it('bots do not depend on the browser client', () => {
    expect(forbiddenImports('bots', ['client', 'solo'])).toEqual([]);
  });
});

describe('everything the browser loads is browser-safe', () => {
  /** The file a relative import points to. */
  function resolveImport(fromFile: string, path: string): string {
    const base = join(fromFile, '..', path);
    for (const candidate of [`${base}.ts`, join(base, 'index.ts')]) if (existsSync(candidate)) return candidate;
    throw new Error(`cannot resolve import '${path}' in ${relative(SRC, fromFile)}`);
  }

  /** All files reachable from `entry` by following imports, with the packages each one uses. */
  function reachableFrom(entry: string): Map<string, string[]> {
    const seen = new Map<string, string[]>();
    const todo = [entry];
    while (todo.length > 0) {
      const file = todo.pop()!;
      if (seen.has(file)) continue;
      const imports = importsOf(file);
      seen.set(file, imports.filter((path) => !path.startsWith('.')));
      for (const path of imports) if (path.startsWith('.') && !path.endsWith('.css')) todo.push(resolveImport(file, path));
    }
    return seen;
  }

  it('the client (including the solo mode with server core and bot) never pulls in Node modules or "ws"', () => {
    const reachable = reachableFrom(join(SRC, 'client/main.ts'));
    const problems = [...reachable].flatMap(([file, packages]) =>
      packages.filter((name) => name.startsWith('node:') || name === 'ws').map((name) => `${relative(SRC, file)} imports ${name}`),
    );
    expect(problems).toEqual([]);
    // Sanity check of the test itself: the solo mode really is part of the client bundle.
    const files = [...reachable.keys()].map((file) => relative(SRC, file).replaceAll('\\', '/'));
    expect(files).toContain('solo/soloMatch.ts');
    expect(files).toContain('server/game/room.ts');
    expect(files).toContain('bots/brain.ts');
  });

  it('only the network/file parts of the server use Node APIs', () => {
    const nodeOnly = ['server/main.ts', 'server/startServer.ts', 'server/http/staticFiles.ts', 'server/net/wsTransport.ts'];
    const problems = sourceFiles(join(SRC, 'server')).flatMap((file) => {
      const name = relative(SRC, file).replaceAll('\\', '/');
      if (nodeOnly.includes(name)) return [];
      return importsOf(file)
        .filter((path) => path.startsWith('node:') || path === 'ws')
        .map((path) => `${name} imports ${path}`);
    });
    expect(problems).toEqual([]);
  });
});

describe('determinism rules', () => {
  // shared/util holds real-time helpers (tick loop) that are not part of the simulation.
  const simulationFiles = sourceFiles(join(SRC, 'shared')).filter((f) => !f.includes(`${join('shared', 'util')}`));

  /** Source text without comments, so explanations may mention the forbidden names. */
  const code = (file: string) =>
    readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');

  it('the simulation never uses Math.random, Date or performance.now', () => {
    const problems: string[] = [];
    for (const file of simulationFiles) {
      for (const banned of ['Math.random', 'Date.now', 'new Date', 'performance.now']) {
        if (code(file).includes(banned)) problems.push(`${relative(SRC, file)} uses ${banned}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('the simulation never uses timers', () => {
    const problems = simulationFiles.filter((file) => /\bset(Timeout|Interval)\b/.test(code(file)));
    expect(problems.map((f) => relative(SRC, f))).toEqual([]);
  });
});
