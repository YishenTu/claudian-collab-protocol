#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(repositoryRoot, 'migration-provenance.json');
const sourcePackagePath = 'packages/collab-protocol';
const excludedTests = new Set(['tests/packaging.test.ts']);

function sha256(contents) {
  return createHash('sha256').update(contents).digest('hex');
}

function git(cwd, args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function gitFile(claudianRoot, ref, relativePath) {
  return execFileSync(
    'git',
    ['show', `${ref}:${relativePath}`],
    { cwd: claudianRoot, encoding: 'buffer', stdio: ['ignore', 'pipe', 'pipe'] },
  );
}

function listFiles(root, relativeDirectory) {
  const absoluteDirectory = path.join(root, relativeDirectory);
  return readdirSync(absoluteDirectory, { withFileTypes: true })
    .flatMap((entry) => {
      const relativePath = path.posix.join(relativeDirectory, entry.name);
      if (entry.isDirectory()) return listFiles(root, relativePath);
      return entry.isFile() ? [relativePath] : [];
    });
}

function selectedPath(relativePath) {
  if (relativePath.startsWith('src/') && relativePath.endsWith('.ts')) return true;
  return relativePath.startsWith('tests/')
    && relativePath.endsWith('.test.ts')
    && !excludedTests.has(relativePath);
}

function standaloneEntries() {
  return ['src', 'tests']
    .flatMap(relativeDirectory => listFiles(repositoryRoot, relativeDirectory))
    .filter(selectedPath)
    .sort()
    .map(relativePath => ({
      path: relativePath,
      sha256: sha256(readFileSync(path.join(repositoryRoot, relativePath))),
    }));
}

function claudianEntries(claudianRoot, ref) {
  const paths = git(claudianRoot, [
    'ls-tree',
    '-r',
    '--name-only',
    ref,
    '--',
    `${sourcePackagePath}/src`,
    `${sourcePackagePath}/tests`,
  ]).split('\n').filter(Boolean);
  return paths
    .map(relativePath => relativePath.slice(`${sourcePackagePath}/`.length))
    .filter(selectedPath)
    .sort()
    .map(relativePath => ({
      path: relativePath,
      sha256: sha256(gitFile(claudianRoot, ref, `${sourcePackagePath}/${relativePath}`)),
    }));
}

function exportedInteger(contents, name) {
  const match = new RegExp(`export const ${name} = (\\d+) as const;`, 'u').exec(contents);
  if (!match) throw new Error(`Cannot read ${name}`);
  return Number(match[1]);
}

function sourceVersions(claudianRoot, ref) {
  const packageManifest = JSON.parse(gitFile(
    claudianRoot,
    ref,
    `${sourcePackagePath}/package.json`,
  ).toString('utf8'));
  return {
    cloudBinding: exportedInteger(
      gitFile(claudianRoot, ref, `${sourcePackagePath}/src/CollabCloudBinding.ts`).toString('utf8'),
      'COLLAB_CLOUD_BINDING_VERSION',
    ),
    lanBinding: exportedInteger(
      gitFile(claudianRoot, ref, 'src/app/collab/lan/LanCollabConstants.ts').toString('utf8'),
      'COLLAB_CONTROL_PROTOCOL_VERSION',
    ),
    package: packageManifest.version,
    wire: exportedInteger(
      gitFile(claudianRoot, ref, `${sourcePackagePath}/src/CollabConstants.ts`).toString('utf8'),
      'COLLAB_PROTOCOL_VERSION',
    ),
  };
}

function standaloneVersions(manifest) {
  return {
    cloudBinding: exportedInteger(
      readFileSync(path.join(repositoryRoot, 'src/CollabCloudBinding.ts'), 'utf8'),
      'COLLAB_CLOUD_BINDING_VERSION',
    ),
    wire: exportedInteger(
      readFileSync(path.join(repositoryRoot, 'src/CollabConstants.ts'), 'utf8'),
      'COLLAB_PROTOCOL_VERSION',
    ),
    expectedCloudBinding: manifest.sourceVersions.cloudBinding,
    expectedWire: manifest.sourceVersions.wire,
  };
}

function splitEntries(entries) {
  return {
    sourceFiles: entries.filter(entry => entry.path.startsWith('src/')),
    testFixtures: entries.filter(entry => entry.path.startsWith('tests/')),
  };
}

function stableJson(value) {
  return JSON.stringify(value, null, 2);
}

function assertEqual(actual, expected, label) {
  if (stableJson(actual) !== stableJson(expected)) {
    throw new Error(`${label} differs from migration-provenance.json`);
  }
}

function writeManifest(claudianRoot, ref) {
  const commit = git(claudianRoot, ['rev-parse', `${ref}^{commit}`]);
  const entries = splitEntries(claudianEntries(claudianRoot, commit));
  const manifest = {
    schemaVersion: 1,
    source: {
      commit,
      packagePath: sourcePackagePath,
      repository: 'https://github.com/YishenTu/claudian.git',
    },
    sourceVersions: sourceVersions(claudianRoot, commit),
    excludedTests: [...excludedTests].sort(),
    ...entries,
  };
  writeFileSync(manifestPath, `${stableJson(manifest)}\n`);
  process.stdout.write(`Wrote ${path.basename(manifestPath)} from ${commit}\n`);
}

function readManifest() {
  if (!existsSync(manifestPath) || !statSync(manifestPath).isFile()) {
    throw new Error('migration-provenance.json is missing');
  }
  return JSON.parse(readFileSync(manifestPath, 'utf8'));
}

function verifyStandalone() {
  const manifest = readManifest();
  const entries = splitEntries(standaloneEntries());
  assertEqual(entries.sourceFiles, manifest.sourceFiles, 'Standalone source');
  assertEqual(entries.testFixtures, manifest.testFixtures, 'Standalone retained fixtures');
  const versions = standaloneVersions(manifest);
  if (
    versions.cloudBinding !== versions.expectedCloudBinding
    || versions.wire !== versions.expectedWire
  ) {
    throw new Error('Standalone wire or Cloud binding version differs from migration provenance');
  }
  process.stdout.write('Standalone migration provenance: PASS\n');
}

function verifyClaudian(claudianRoot, ref) {
  const manifest = readManifest();
  const entries = splitEntries(claudianEntries(claudianRoot, ref));
  assertEqual(entries.sourceFiles, manifest.sourceFiles, `Claudian ${ref} source`);
  assertEqual(entries.testFixtures, manifest.testFixtures, `Claudian ${ref} retained fixtures`);
  assertEqual(sourceVersions(claudianRoot, ref), manifest.sourceVersions, `Claudian ${ref} versions`);
  process.stdout.write(`Claudian ${ref} migration provenance: PASS\n`);
}

function optionValue(args, name) {
  const index = args.indexOf(name);
  if (index < 0) return null;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`);
  return value;
}

const args = process.argv.slice(2);
const claudianRoot = optionValue(args, '--claudian-root');
const ref = optionValue(args, '--ref') ?? 'origin/main';
if (args.includes('--write')) {
  if (!claudianRoot) throw new Error('--write requires --claudian-root');
  writeManifest(path.resolve(claudianRoot), ref);
} else if (args.includes('--verify-claudian')) {
  if (!claudianRoot) throw new Error('--verify-claudian requires --claudian-root');
  verifyClaudian(path.resolve(claudianRoot), ref);
} else if (args.length === 0 || args.includes('--verify-standalone')) {
  verifyStandalone();
} else {
  throw new Error(`Unknown arguments: ${args.join(' ')}`);
}
