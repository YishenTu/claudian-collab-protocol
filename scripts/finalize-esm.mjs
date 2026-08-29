#!/usr/bin/env node

import {
  readdir,
  readFile,
  rename,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const esmRoot = fileURLToPath(new URL('../dist/esm/', import.meta.url));
const staticSpecifierPattern = /(\b(?:from|import)\s*)(['"])(\.{1,2}\/[^'"]+)\2/gu;
const dynamicSpecifierPattern = /(\bimport\s*\(\s*)(['"])(\.{1,2}\/[^'"]+)\2(\s*\))/gu;

function esmSpecifier(specifier) {
  if (specifier.endsWith('.js')) return `${specifier.slice(0, -3)}.mjs`;
  return path.posix.extname(specifier) === '' ? `${specifier}.mjs` : specifier;
}

function finalizeSpecifiers(source) {
  return source
    .replace(
      staticSpecifierPattern,
      (_match, prefix, quote, specifier) => (
        `${prefix}${quote}${esmSpecifier(specifier)}${quote}`
      ),
    )
    .replace(
      dynamicSpecifierPattern,
      (_match, prefix, quote, specifier, suffix) => (
        `${prefix}${quote}${esmSpecifier(specifier)}${quote}${suffix}`
      ),
    );
}

async function javascriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async entry => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return javascriptFiles(entryPath);
    return entry.isFile() && entry.name.endsWith('.js') ? [entryPath] : [];
  }));
  return files.flat();
}

for (const javascriptPath of await javascriptFiles(esmRoot)) {
  const source = await readFile(javascriptPath, 'utf8');
  await writeFile(javascriptPath, finalizeSpecifiers(source), 'utf8');
  await rename(javascriptPath, `${javascriptPath.slice(0, -3)}.mjs`);
}
