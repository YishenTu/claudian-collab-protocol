import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertPublishedArtifact,
  assertReleaseRecord,
  createReleaseRecord,
  expectedPackedPaths,
  isMissingRegistryVersion,
} from '../scripts/release-candidate.mjs';

const packageManifest = {
  name: '@claudian-collab/protocol',
  version: '3.3.2',
  license: 'MIT',
  repository: {
    type: 'git',
    url: 'git+https://github.com/YishenTu/claudian-collab-protocol.git',
  },
  publishConfig: { access: 'public', provenance: true },
};

function record(overrides = {}) {
  return createReleaseRecord({
    nodeVersion: '24.16.0',
    npmVersion: '11.13.0',
    packageManifest,
    packResult: {
      filename: 'claudian-collab-protocol-3.3.2.tgz',
      files: [
        { path: 'package.json', size: 100 },
        { path: 'README.md', size: 200 },
      ],
      integrity: 'sha512-integrity',
      shasum: 'sha1-sum',
      size: 300,
      unpackedSize: 500,
    },
    sha256: 'sha256-sum',
    ...overrides,
  });
}

test('records exact public metadata, toolchain, inventory, and tarball digests', () => {
  assert.deepEqual(record(), {
    schemaVersion: 1,
    package: {
      access: 'public',
      license: 'MIT',
      name: '@claudian-collab/protocol',
      provenance: true,
      registry: 'https://registry.npmjs.org',
      repository: 'git+https://github.com/YishenTu/claudian-collab-protocol.git',
      version: '3.3.2',
    },
    toolchain: { node: '24.16.0', npm: '11.13.0' },
    tarball: {
      filename: 'claudian-collab-protocol-3.3.2.tgz',
      files: [
        { path: 'package.json', size: 100 },
        { path: 'README.md', size: 200 },
      ],
      integrity: 'sha512-integrity',
      sha256: 'sha256-sum',
      shasum: 'sha1-sum',
      size: 300,
      unpackedSize: 500,
    },
  });
});

test('rejects release drift in bytes or inventory', () => {
  const expected = record();
  assert.doesNotThrow(() => assertReleaseRecord(expected, expected));
  assert.throws(
    () => assertReleaseRecord({
      ...expected,
      tarball: { ...expected.tarball, sha256: 'different' },
    }, expected),
    /release candidate differs/u,
  );
});

test('accepts only the exact reviewed integrity for an already published version', () => {
  assert.doesNotThrow(() => assertPublishedArtifact(
    'sha512-reviewed',
    'sha512-reviewed',
  ));
  assert.throws(
    () => assertPublishedArtifact('sha512-published', 'sha512-reviewed'),
    /published registry artifact differs/u,
  );
});

test('treats only a registry E404 as an unpublished version', () => {
  assert.equal(isMissingRegistryVersion({
    stdout: JSON.stringify({ error: { code: 'E404' } }),
  }), true);
  assert.equal(isMissingRegistryVersion({
    stdout: JSON.stringify({ error: { code: 'ECONNRESET' } }),
  }), false);
  assert.equal(isMissingRegistryVersion({ stdout: 'not-json' }), false);
});

test('derives the only allowed package inventory from source modules', () => {
  assert.deepEqual(expectedPackedPaths(['index.ts', 'types.ts']), [
    'LICENSE',
    'README.md',
    'dist/esm/index.mjs',
    'dist/esm/types.mjs',
    'dist/index.d.ts',
    'dist/index.js',
    'dist/types.d.ts',
    'dist/types.js',
    'package.json',
  ]);
});

test('rejects non-public or non-provenance package metadata', () => {
  assert.throws(
    () => record({
      packageManifest: {
        ...packageManifest,
        publishConfig: { access: 'restricted', provenance: false },
      },
    }),
    /public access and provenance/u,
  );
});
