#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { resolvePreviousReleaseBase } from './previous-release-base.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const providedArguments = process.argv.slice(2);
const argumentsToCheck = providedArguments.length === 0
  ? ['--base', resolvePreviousReleaseBase({ allowHead: true })]
  : providedArguments;
const result = spawnSync(
  process.execPath,
  [path.join(repositoryRoot, 'scripts/check-compatibility.mjs'), ...argumentsToCheck],
  { cwd: repositoryRoot, stdio: 'inherit' },
);

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
