import {
  readFileSync,
  readdirSync,
} from 'node:fs';
import path from 'node:path';

import { COLLAB_PROTOCOL_VERSION } from '../src/index';

const packageRoot = path.resolve(__dirname, '..');
const sourceRoot = path.join(packageRoot, 'src');

function listSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listSourceFiles(entryPath);
    return entry.isFile() && entry.name.endsWith('.ts') ? [entryPath] : [];
  });
}

const ALLOWED_EXTERNAL_MODULE = /^@lezer\/markdown$/;
const FORBIDDEN_PATTERN = /obsidian|sql|sqlite|postgres|node:fs|node:http|node:net|node:tls|\/src\/|@\/|claudian-cloud-server/i;

describe('package dependency boundary', () => {
  it('imports only relative modules and the allowlisted runtime dependency', () => {
    const importPattern = /(?:from|import)\s*['"]([^'"]+)['"]/g;
    for (const file of listSourceFiles(sourceRoot)) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(importPattern)) {
        const specifier = match[1];
        const allowed = specifier.startsWith('.') || ALLOWED_EXTERNAL_MODULE.test(specifier);
        expect({ file: path.basename(file), specifier, allowed }).toEqual(
          expect.objectContaining({ allowed: true }),
        );
      }
    }
  });

  it('never references forbidden scopes in source', () => {
    for (const file of listSourceFiles(sourceRoot)) {
      const source = readFileSync(file, 'utf8');
      expect({ file: path.basename(file), forbidden: FORBIDDEN_PATTERN.test(source) })
        .toEqual(expect.objectContaining({ forbidden: false }));
    }
  });

  it('declares only the allowlisted runtime dependency', () => {
    const manifest = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    expect(Object.keys(manifest.dependencies)).toEqual(['@lezer/markdown']);
  });

  it('publishes only the package root entry point', () => {
    const manifest = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8')) as {
      exports: Record<string, unknown>;
    };
    expect(Object.keys(manifest.exports)).toEqual(['.']);
  });

  it('routes import to ESM and require to CommonJS through the package root', () => {
    const manifest = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8')) as {
      exports: Record<string, unknown>;
      main?: string;
      module?: string;
      sideEffects?: boolean;
      types?: string;
    };

    expect(manifest).toEqual(expect.objectContaining({
      exports: {
        '.': {
          default: './dist/index.js',
          import: './dist/esm/index.mjs',
          require: './dist/index.js',
          types: './dist/index.d.ts',
        },
      },
      main: './dist/index.js',
      module: './dist/esm/index.mjs',
      sideEffects: false,
      types: './dist/index.d.ts',
    }));
  });

  it('does not publish client-private working-tree identity', () => {
    for (const file of listSourceFiles(sourceRoot)) {
      const source = readFileSync(file, 'utf8');
      expect({
        file: path.basename(file),
        workingTreeContentHash: source.includes('workingTreeContentHash'),
      }).toEqual(expect.objectContaining({ workingTreeContentHash: false }));
    }
  });

  it('keeps package SemVer distinct from the wire-protocol version', () => {
    const manifest = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8')) as {
      version: string;
    };
    expect(manifest.version).toBe('4.2.0');
    expect(manifest.version).not.toBe(String(COLLAB_PROTOCOL_VERSION));
    expect(Number.parseInt(manifest.version.split('.')[0], 10)).toBe(4);
  });
});
