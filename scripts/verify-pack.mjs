#!/usr/bin/env node
/**
 * Packed-artifact verification for @claudian-collab/protocol.
 *
 * 1. verifies the release candidate against its reviewed tarball digest;
 * 2. installs those exact bytes into a clean temporary consumer using only the
 *    dependency metadata in the packed artifact;
 * 3. executes CJS and ESM import smoke tests, including a runtime codec
 *    round-trip through the installed artifact.
 *
 * All artifacts stay under the repository's ignored .context/ directory.
 */
import {
  execFileSync,
} from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { verifyReviewedTarball } from './release-candidate.mjs';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contextRoot = path.join(packageRoot, '.context');
mkdirSync(contextRoot, { recursive: true });

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: options.cwd ?? packageRoot,
    encoding: 'utf8',
    env: { ...process.env, CI: '1' },
    ...options,
  }).trim();
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`verify-pack failure: ${message}`);
  }
}

function runNpm(args, options = {}) {
  const npmCliPath = process.env.npm_execpath;
  assert(npmCliPath, 'npm_execpath is required; run verification through an npm script');
  return run(process.execPath, [npmCliPath, ...args], options);
}

const reviewedRecord = JSON.parse(readFileSync(
  path.join(packageRoot, 'release-manifest.json'),
  'utf8',
));
const tarballPath = verifyReviewedTarball(
  path.join(contextRoot, 'release', reviewedRecord.tarball.filename),
  reviewedRecord,
);
const workRoot = mkdtempSync(path.join(contextRoot, 'collab-protocol-pack-'));
console.log(`reviewed tarball: ${tarballPath}`);
console.log(`workspace: ${workRoot}`);

// 2. Install the reviewed artifact into a clean consumer.
const consumerRoot = path.join(workRoot, 'consumer');
mkdirSync(consumerRoot);
writeFileSync(
  path.join(consumerRoot, 'package.json'),
  JSON.stringify(
    {
      name: 'collab-protocol-consumer-smoke',
      private: true,
      version: '0.0.0',
      dependencies: {
        '@claudian-collab/protocol': `file:${tarballPath}`,
      },
    },
    null,
    2,
  ),
);
runNpm(['install', '--no-audit', '--no-fund', '--ignore-scripts'], { cwd: consumerRoot });
const installedManifest = JSON.parse(readFileSync(
  path.join(consumerRoot, 'node_modules', '@claudian-collab/protocol', 'package.json'),
  'utf8',
));
console.log(`installed artifact version: ${installedManifest.version}`);

// 3. Runtime smoke: CJS require, then ESM import, with codec execution.
const smokeSource = `
const assert = require('node:assert/strict');
const path = require('node:path');
const protocol = require('@claudian-collab/protocol');
const packageVersion = ${JSON.stringify(installedManifest.version)};

assert.equal(protocol.COLLAB_PROTOCOL_VERSION, 8);
assert.equal(protocol.COLLAB_CLOUD_BINDING_VERSION, 4);
assert.notEqual(packageVersion, String(protocol.COLLAB_PROTOCOL_VERSION));
assert.equal(packageVersion, '4.1.4');
assert.equal(
  require.resolve('@claudian-collab/protocol'),
  path.join(__dirname, 'node_modules', '@claudian-collab', 'protocol', 'dist', 'index.js'),
);
assert.equal(protocol.COLLAB_PROJECT_COORDINATION_FORMAT_VERSION, 1);
assert.equal(protocol.COLLAB_PROJECT_BACKUP_COORDINATION_FORMAT_VERSION, 3);

const codec = protocol.COLLAB_CONTROL_OPERATION_CODECS.ensureMyRequest;
const valid = codec.decodeRequest({
  projectId: 'project_1',
  idempotencyKey: 'key_1',
  expectedMainOid: '${'1'.repeat(40)}',
  headOid: '${'2'.repeat(40)}',
  description: 'Resolves #3',
});
assert.equal(valid.status, 'ok');
assert.equal(codec.decodeRequest({ projectId: 42 }).status, 'invalid');
// Additive-tolerant request decoders accept unknown fields (accepted
// compatibility behavior for these operations).
assert.equal(
  codec.decodeRequest({
    projectId: 'project_1',
    idempotencyKey: 'key_1',
    expectedMainOid: '${'1'.repeat(40)}',
    headOid: '${'2'.repeat(40)}',
    description: '',
    unknownField: true,
  }).status,
  'ok',
);
assert.throws(
  () => protocol.collabControlOperationCodec('no-such-operation'),
  error => error instanceof protocol.CollabError && error.code === 'operation-failed',
);

const transfer = protocol.COLLAB_CONTROL_OPERATION_CODECS.requestLanToCloudTransfer;
assert.equal(transfer.decodeRequest({
  expectedAuthorityGeneration: 3,
  idempotencyKey: 'transfer_1',
  projectId: 'project_1',
  targetUrl: 'http://100.64.0.10:8787',
}).status, 'ok');
assert.deepEqual(protocol.COLLAB_CHECKPOINT_PROFILES, [
  'authority-transfer',
  'backup',
  'export',
]);

const unsupported = protocol.decodeCollabProtocolEnvelope({
  protocolVersion: 999,
  requestId: 'request_1',
  data: {},
});
assert.equal(unsupported.status, 'unsupported-version');

const references = protocol.parseCollabTicketReferences('Resolves #3 and see #7');
assert.equal(references.status, 'ok');
assert.deepEqual(
  references.references,
  [
    { ticketNumber: 3, kind: 'resolves' },
    { ticketNumber: 7, kind: 'references' },
  ],
);

const error = new protocol.CollabError({
  code: 'operation-failed',
  safeContext: { memberCredential: 'secret', path: '/Users/private/vault' },
});
assert.equal(error.safeContext.memberCredential, undefined);
assert.equal(error.safeContext.path, '[PATH]');

console.log('smoke: version, shared registry, codecs, parsers, safe errors OK');
`;
writeFileSync(path.join(consumerRoot, 'smoke.cjs'), smokeSource);
const cjsOutput = run(process.execPath, ['smoke.cjs'], { cwd: consumerRoot });
console.log(`cjs ${cjsOutput}`);

const esmOutput = run(process.execPath, [
  '--input-type=module',
  '-e',
  "import { COLLAB_CLOUD_BINDING_VERSION, COLLAB_PROTOCOL_VERSION, collabMemberRef, parseCollabTicketReferences } from '@claudian-collab/protocol';"
    + " const resolved = import.meta.resolve('@claudian-collab/protocol');"
    + " const references = parseCollabTicketReferences('Resolves #3');"
    + " if (!resolved.endsWith('/dist/esm/index.mjs') || COLLAB_PROTOCOL_VERSION !== 8 || COLLAB_CLOUD_BINDING_VERSION !== 4 || collabMemberRef('member_1') !== 'refs/heads/members/member_1' || references.status !== 'ok' || references.references[0]?.ticketNumber !== 3) process.exit(1);"
    + " console.log('esm import OK');",
], { cwd: consumerRoot });
console.log(esmOutput);

writeFileSync(
  path.join(consumerRoot, 'consumer.mts'),
  `import { type CollabProjectId, isCollabProjectId } from '@claudian-collab/protocol';
const projectId: CollabProjectId = 'project_1';
if (!isCollabProjectId(projectId)) throw new Error('invalid ESM type surface');
`,
);
writeFileSync(
  path.join(consumerRoot, 'consumer.cts'),
  `import protocol = require('@claudian-collab/protocol');
const projectId: protocol.CollabProjectId = 'project_1';
if (!protocol.isCollabProjectId(projectId)) throw new Error('invalid CJS type surface');
`,
);
writeFileSync(
  path.join(consumerRoot, 'tsconfig.json'),
  JSON.stringify({
    compilerOptions: {
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      noEmit: true,
      skipLibCheck: true,
      strict: true,
      target: 'ES2022',
      types: [],
    },
    include: ['consumer.mts', 'consumer.cts'],
  }, null, 2),
);
run(process.execPath, [
  path.join(packageRoot, 'node_modules', 'typescript', 'bin', 'tsc'),
  '-p',
  'tsconfig.json',
], { cwd: consumerRoot });
console.log('TypeScript ESM and CJS declarations OK');

// 4. Subpath imports must be blocked by the exports map.
for (const subpath of ['dist/CollabError.js', 'package.json']) {
  run(process.execPath, [
    '-e',
    `try { require('@claudian-collab/protocol/${subpath}'); process.exit(3); }`
      + ' catch { process.exit(0); }',
  ], { cwd: consumerRoot });
}
console.log('subpath import blocked as expected');

console.log('verify-pack: PASS');
