#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const releaseManifestPath = path.join(repositoryRoot, 'release-manifest.json');
const requiredNodeVersion = '24.16.0';
const requiredNpmVersion = '11.13.0';

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right, 'en-US'))
        .map(([key, item]) => [key, stableValue(item)]),
    );
  }
  return value;
}

function stableJson(value) {
  return JSON.stringify(stableValue(value));
}

function assert(condition, message) {
  if (!condition) throw new Error(`release candidate failure: ${message}`);
}

export function expectedPackedPaths(sourceFileNames) {
  return [
    'LICENSE',
    'README.md',
    'package.json',
    ...sourceFileNames.flatMap((name) => {
      const base = name.replace(/\.ts$/u, '');
      return [`dist/${base}.d.ts`, `dist/${base}.js`];
    }),
  ].sort();
}

export function createReleaseRecord({
  nodeVersion,
  npmVersion,
  packageManifest,
  packResult,
  sha256,
}) {
  assert(packageManifest.name === '@claudian-collab/protocol', 'unexpected package name');
  assert(packageManifest.version === '3.2.0', 'unexpected package version');
  assert(
    packageManifest.publishConfig?.access === 'public'
      && packageManifest.publishConfig?.provenance === true,
    'package metadata must require public access and provenance',
  );
  assert(
    packageManifest.repository?.url
      === 'git+https://github.com/YishenTu/claudian-collab-protocol.git',
    'unexpected repository metadata',
  );
  assert(Array.isArray(packResult.files), 'npm pack omitted file inventory');
  return stableValue({
    schemaVersion: 1,
    package: {
      access: packageManifest.publishConfig.access,
      license: packageManifest.license,
      name: packageManifest.name,
      provenance: packageManifest.publishConfig.provenance,
      registry: 'https://registry.npmjs.org',
      repository: packageManifest.repository.url,
      version: packageManifest.version,
    },
    toolchain: {
      node: nodeVersion,
      npm: npmVersion,
    },
    tarball: {
      filename: packResult.filename,
      files: packResult.files
        .map(file => ({ path: file.path, size: file.size }))
        .sort((left, right) => left.path.localeCompare(right.path, 'en-US')),
      integrity: packResult.integrity,
      sha256,
      shasum: packResult.shasum,
      size: packResult.size,
      unpackedSize: packResult.unpackedSize,
    },
  });
}

export function assertReleaseRecord(actual, expected) {
  if (stableJson(actual) !== stableJson(expected)) {
    throw new Error('release candidate differs from release-manifest.json');
  }
}

export function assertPublishedArtifact(publishedIntegrity, reviewedIntegrity) {
  assert(
    publishedIntegrity === reviewedIntegrity,
    'published registry artifact differs from the reviewed release candidate',
  );
}

export function isMissingRegistryVersion(error) {
  const output = error !== null
    && typeof error === 'object'
    && 'stdout' in error
    && typeof error.stdout === 'string'
    ? error.stdout
    : '';
  try {
    return JSON.parse(output).error?.code === 'E404';
  } catch {
    return false;
  }
}

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: options.cwd ?? repositoryRoot,
    encoding: 'utf8',
    env: { ...process.env, CI: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  }).trim();
}

function runNpm(args, options = {}) {
  assert(process.env.npm_execpath, 'npm_execpath is required; run through an npm script');
  return run(process.execPath, [process.env.npm_execpath, ...args], options);
}

function readPublishedIntegrity(packageName, packageVersion) {
  let output;
  try {
    output = runNpm([
      'view',
      `${packageName}@${packageVersion}`,
      'dist.integrity',
      '--json',
    ]);
  } catch (error) {
    if (isMissingRegistryVersion(error)) return null;
    throw new Error(
      'release candidate failure: registry integrity lookup failed',
      { cause: error },
    );
  }
  const integrity = JSON.parse(output);
  assert(
    typeof integrity === 'string' && integrity.length > 0,
    'published registry integrity is missing or malformed',
  );
  return integrity;
}

function optionValue(args, name) {
  const index = args.indexOf(name);
  if (index < 0) return null;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`);
  return value;
}

function buildCandidate(outputRoot) {
  const nodeVersion = process.versions.node;
  const npmVersion = runNpm(['--version']);
  assert(nodeVersion === requiredNodeVersion, `Node must be ${requiredNodeVersion}, got ${nodeVersion}`);
  assert(npmVersion === requiredNpmVersion, `npm must be ${requiredNpmVersion}, got ${npmVersion}`);
  rmSync(outputRoot, { force: true, recursive: true });
  mkdirSync(outputRoot, { recursive: true });
  const packOutput = JSON.parse(runNpm([
    'pack',
    '--json',
    '--silent',
    '--pack-destination',
    outputRoot,
  ]));
  assert(Array.isArray(packOutput) && packOutput.length === 1, 'npm pack returned no artifact');
  const [packResult] = packOutput;
  const expectedFiles = expectedPackedPaths(
    readdirSync(path.join(repositoryRoot, 'src')).filter(name => name.endsWith('.ts')),
  );
  const actualFiles = packResult.files.map(file => file.path).sort();
  assert(
    stableJson(actualFiles) === stableJson(expectedFiles),
    `packed inventory differs: ${stableJson(actualFiles)}`,
  );
  const tarballPath = path.join(outputRoot, packResult.filename);
  assert(existsSync(tarballPath), `tarball is missing: ${tarballPath}`);
  const packageManifest = JSON.parse(readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'));
  const record = createReleaseRecord({
    nodeVersion,
    npmVersion,
    packageManifest,
    packResult,
    sha256: createHash('sha256').update(readFileSync(tarballPath)).digest('hex'),
  });
  const publishedIntegrity = readPublishedIntegrity(
    record.package.name,
    record.package.version,
  );
  if (publishedIntegrity === null) {
    const dryRun = JSON.parse(runNpm([
      'publish',
      '--access',
      'public',
      '--dry-run',
      '--ignore-scripts',
      '--json',
      tarballPath,
    ]));
    assert(dryRun.name === record.package.name, 'publication dry-run package name differs');
    assert(dryRun.version === record.package.version, 'publication dry-run package version differs');
  } else {
    assertPublishedArtifact(publishedIntegrity, record.tarball.integrity);
  }
  return { record, tarballPath };
}

function runCli() {
  const args = process.argv.slice(2);
  const outputOption = optionValue(args, '--output');
  const outputRoot = outputOption
    ? path.resolve(repositoryRoot, outputOption)
    : path.join(repositoryRoot, '.context/release');
  const { record, tarballPath } = buildCandidate(outputRoot);
  if (args.includes('--write')) {
    writeFileSync(releaseManifestPath, `${JSON.stringify(record, null, 2)}\n`);
    process.stdout.write(`Wrote release-manifest.json\n`);
  } else {
    assert(existsSync(releaseManifestPath), 'release-manifest.json is missing');
    assertReleaseRecord(record, JSON.parse(readFileSync(releaseManifestPath, 'utf8')));
  }
  process.stdout.write(`Verified tarball: ${tarballPath}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runCli();
