/**
 * Guards for the project rules in CLAUDE.md. These tests read the source files and fail
 * if someone breaks a rule that would cause desyncs or tangle the folders together.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
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
    expect(forbiddenImports('shared', ['server', 'client', 'netcode', 'bots'])).toEqual([]);
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
    expect(forbiddenImports('server', ['client', 'bots'])).toEqual([]);
    expect(forbiddenImports('client', ['server', 'bots'])).toEqual([]);
  });

  it('netcode stays independent of browser, server and bots', () => {
    expect(forbiddenImports('netcode', ['client', 'server', 'bots'])).toEqual([]);
    const usesThree = sourceFiles(join(SRC, 'netcode')).filter((f) => importsOf(f).includes('three'));
    expect(usesThree).toEqual([]);
  });

  it('bots do not depend on the browser client', () => {
    expect(forbiddenImports('bots', ['client'])).toEqual([]);
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
