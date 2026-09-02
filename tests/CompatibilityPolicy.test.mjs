import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  assertVersionedContractChange,
  classifyPackageApiChange,
  digestTypeScriptBehavior,
  generateContractSnapshot,
  publicDeclarationsFromDist,
} from '../scripts/check-compatibility.mjs';
import * as compatibility from '../scripts/check-compatibility.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function sourceFiles(directory = path.join(repositoryRoot, 'src')) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(absolutePath);
    return entry.isFile() && entry.name.endsWith('.ts') ? [absolutePath] : [];
  });
}

function snapshot({
  binding = { routes: ['capabilities'] },
  bindingVersion = 1,
  declarations = [{ declaration: 'export interface A {}', exportName: 'A', source: './types' }],
  packageVersion = '1.0.0',
  protocolVersion = 4,
  runtime = [{ path: 'src/types.ts', sha256: 'runtime-a' }],
  runtimeExports = ['A'],
  wire = { operations: ['getRequest'] },
  ...extra
} = {}) {
  return {
    schemaVersion: 2,
    packageVersion,
    protocolVersion,
    cloudBindingVersion: bindingVersion,
    contract: {
      publicDeclarations: declarations,
      publicRuntimeExports: runtimeExports,
      runtimeBehaviorDigests: runtime,
      wire,
      cloudBinding: binding,
    },
    ...extra,
  };
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

test('rejects the consumed legacy snapshot schema', () => {
  const legacy = {
    schemaVersion: 1,
    packageVersion: '0.4.0',
    protocolVersion: 4,
    contract: { operations: ['getRequest'] },
  };

  assert.throws(
    () => assertVersionedContractChange(legacy, snapshot()),
    /Unsupported current snapshot schema/u,
  );
});

test('accepts patch releases only when the public package API is unchanged', () => {
  assert.equal(classifyPackageApiChange(snapshot(), snapshot({ packageVersion: '1.0.1' })), 'none');
  assert.doesNotThrow(() => assertVersionedContractChange(
    snapshot(),
    snapshot({ packageVersion: '1.0.1' }),
  ));
});

test('accepts an explicitly reviewed implementation-only refactor', () => {
  const base = snapshot({
    wire: {
      operations: ['getRequest'],
      runtimeBehaviorDigests: [{ path: 'src/types.ts', sha256: 'runtime-a' }],
    },
  });
  const current = snapshot({
    packageVersion: '1.0.1',
    runtime: [{ path: 'src/types.ts', sha256: 'runtime-refactored' }],
    wire: {
      operations: ['getRequest'],
      runtimeBehaviorDigests: [{ path: 'src/types.ts', sha256: 'runtime-refactored' }],
    },
  });
  const review = compatibility.createImplementationOnlyReview(
    base,
    current,
    'Extract shared validation while preserving the accepted public fixtures.',
  );

  assert.doesNotThrow(() => assertVersionedContractChange(base, current, review));
});

test('an implementation review cannot waive public or declarative contract changes', () => {
  const base = snapshot();
  const changes = [
    { declarations: [{ declaration: 'export interface A { value: string }', exportName: 'A', source: './types' }] },
    { runtimeExports: ['A', 'B'] },
    { wire: { operations: ['getRequest', 'deleteRequest'] } },
    { wire: { operations: ['getRequest'], limits: { maxBytes: 1 } } },
    { binding: { routes: ['capabilities', 'snapshot'] } },
  ];
  for (const change of changes) {
    assert.throws(() => compatibility.createImplementationOnlyReview(
      base,
      snapshot({ packageVersion: '1.0.1', ...change }),
      'This explanation cannot exempt a changed contract.',
    ), /cannot change public API, wire, or Cloud binding semantic facts/u);
  }
});

test('implementation reviews preserve the captured Cloud operation inventory', () => {
  const base = snapshot({
    binding: { jsonOperations: ['getProjectSnapshot', 'retireProject'] },
    wire: { operations: ['retireProject'] },
  });
  const current = snapshot({
    packageVersion: '1.0.1',
    runtime: [{ path: 'src/types.ts', sha256: 'refactored-runtime' }],
    binding: { jsonOperations: ['getProjectSnapshot'] },
    wire: { operations: ['retireProject'] },
  });

  assert.throws(() => compatibility.createImplementationOnlyReview(
    base,
    current,
    'An unchanged wire inventory cannot replace a changed Cloud binding fact.',
  ), /cannot change public API, wire, or Cloud binding semantic facts/u);

  const baseIdentity = compatibility.createImplementationOnlyReview(base, base, 'Unchanged base.');
  const candidateIdentity = compatibility.createImplementationOnlyReview(current, current, 'Unchanged candidate.');
  const matchingClaim = {
    ...baseIdentity,
    candidateSnapshotSha256: candidateIdentity.candidateSnapshotSha256,
  };
  assert.throws(() => assertVersionedContractChange(base, current, matchingClaim),
    /cannot change public API, wire, or Cloud binding semantic facts/u);
});

test('implementation reviews are exact, fail closed, and retain version monotonicity', () => {
  const base = snapshot();
  const current = snapshot({
    packageVersion: '1.0.1',
    runtime: [{ path: 'src/types.ts', sha256: 'refactored-runtime' }],
  });
  const review = compatibility.createImplementationOnlyReview(base, current, 'Preserve public behavior.');
  assert.throws(() => assertVersionedContractChange(base, current), /package major release/u);
  assert.throws(() => assertVersionedContractChange(snapshot({ packageVersion: '0.9.0' }), current, review), /exact base and candidate/u);
  assert.throws(() => assertVersionedContractChange(base, { ...current, packageVersion: '1.0.2' }, review), /exact base and candidate/u);
  assert.throws(() => assertVersionedContractChange(base, current, { ...review, allowWireChange: true }), /unknown implementation-only review field/u);
  assert.throws(() => assertVersionedContractChange(base, current, { ...review, reason: '' }), /Invalid implementation-only review/u);
  assert.throws(() => assertVersionedContractChange(base, current, { ...review, schemaVersion: 2 }), /Invalid implementation-only review/u);

  const decreased = { ...current, protocolVersion: 3 };
  const decreasedReview = compatibility.createImplementationOnlyReview(base, decreased, 'Cannot lower wire versions.');
  assert.throws(() => assertVersionedContractChange(base, decreased, decreasedReview), /wire protocol version cannot decrease/u);
});

test('requires at least a minor release for additive public API', () => {
  const addedDeclaration = [
    { declaration: 'export interface A {}', exportName: 'A', source: './types' },
    { declaration: 'export interface B {}', exportName: 'B', source: './types' },
  ];
  assert.equal(classifyPackageApiChange(snapshot(), snapshot({
    declarations: addedDeclaration,
    runtimeExports: ['A', 'B'],
  })), 'minor');
  assert.throws(
    () => assertVersionedContractChange(snapshot(), snapshot({
      declarations: addedDeclaration,
      packageVersion: '1.0.1',
      runtimeExports: ['A', 'B'],
    })),
    /package minor or major release/u,
  );
  assert.doesNotThrow(() => assertVersionedContractChange(snapshot(), snapshot({
    declarations: addedDeclaration,
    packageVersion: '1.1.0',
    runtimeExports: ['A', 'B'],
  })));
});

test('accepts an exactly reviewed versioned operation addition without waiving existing contracts', () => {
  const declarations = [{
    declaration: 'export interface CollabAuthorityTransferOperationMap { readonly existing: Existing; }',
    exportName: 'CollabAuthorityTransferOperationMap',
    source: './CollabAuthorityTransfer',
  }, {
    declaration: 'export interface CollabAuthorityTransferStatus { readonly phase: string; }',
    exportName: 'CollabAuthorityTransferStatus',
    source: './CollabAuthorityTransfer',
  }];
  const base = snapshot({
    binding: {
      capabilities: ['authority-transfer'],
      jsonOperations: ['getProjectSnapshot', 'existing'],
    },
    declarations,
    runtime: [{ path: 'src/CollabAuthorityTransfer.ts', sha256: 'runtime-v1' }],
    runtimeExports: [],
    wire: { operations: ['existing'] },
  });
  const current = snapshot({
    binding: {
      capabilities: ['authority-transfer'],
      jsonOperations: ['getProjectSnapshot', 'existing', 'confirmTargetCleanup'],
    },
    bindingVersion: 2,
    declarations: [{
      declaration: 'export interface CollabAuthorityTransferOperationMap { readonly existing: Existing; readonly confirmTargetCleanup: ConfirmTargetCleanup; }',
      exportName: 'CollabAuthorityTransferOperationMap',
      source: './CollabAuthorityTransfer',
    }, {
      declaration: 'export interface CollabAuthorityTransferStatus { readonly phase: string; }',
      exportName: 'CollabAuthorityTransferStatus',
      source: './CollabAuthorityTransfer',
    }, {
      declaration: 'export interface ConfirmTargetCleanup {}',
      exportName: 'ConfirmTargetCleanup',
      source: './CollabAuthorityTransfer',
    }],
    packageVersion: '1.1.0',
    protocolVersion: 5,
    runtime: [{ path: 'src/CollabAuthorityTransfer.ts', sha256: 'runtime-v2' }],
    runtimeExports: [],
    wire: { operations: ['existing', 'confirmTargetCleanup'] },
  });

  assert.equal(classifyPackageApiChange(base, current), 'major');
  assert.throws(() => assertVersionedContractChange(base, current), /package major release/u);
  const review = compatibility.createVersionedOperationAdditionReview(
    base,
    current,
    'Add confirmTargetCleanup without changing existing operation contracts.',
  );
  assert.doesNotThrow(() => assertVersionedContractChange(base, current, review));

  const changedExistingInterface = cloneJson(current);
  changedExistingInterface.contract.publicDeclarations.find(
    declaration => declaration.exportName === 'CollabAuthorityTransferStatus',
  ).declaration = 'export interface CollabAuthorityTransferStatus { readonly state: never; }';
  assert.throws(() => compatibility.createVersionedOperationAdditionReview(
    base,
    changedExistingInterface,
    'This must not waive a changed existing transfer status.',
  ), /existing public declaration/u);

  const changedOperationMapHeritage = cloneJson(current);
  changedOperationMapHeritage.contract.publicDeclarations.find(
    declaration => declaration.exportName === 'CollabAuthorityTransferOperationMap',
  ).declaration = changedOperationMapHeritage.contract.publicDeclarations.find(
    declaration => declaration.exportName === 'CollabAuthorityTransferOperationMap',
  ).declaration.replace(
    'CollabAuthorityTransferOperationMap {',
    'CollabAuthorityTransferOperationMap extends CollabAuthorityTransferStatus {',
  );
  assert.throws(() => compatibility.createVersionedOperationAdditionReview(
    base,
    changedOperationMapHeritage,
    'This must not waive changed operation-map heritage.',
  ), /existing public declaration/u);

  const changedExistingDecoder = cloneJson(current);
  changedExistingDecoder.contract.runtimeBehaviorDigests[0].sha256 = 'changed-existing-decoder';
  assert.throws(
    () => assertVersionedContractChange(base, changedExistingDecoder, review),
    /exact base and candidate snapshots/u,
  );
});

test('source review rejects existing decoder drift and unreachable same-module additions', () => {
  const baseFiles = {
    'src/CollabAuthorityTransfer.ts': `
      export const COLLAB_AUTHORITY_TRANSFER_OPERATIONS = Object.freeze(['existing'] as const);
      export interface CollabAuthorityTransferOperationMap {
        readonly existing: { readonly request: ExistingRequest; readonly response: ExistingResponse };
      }
      function decodeExisting(value: unknown) { return value; }
      export function decodeCollabAuthorityTransferOperationRequest(operation: string, value: unknown) {
        switch (operation) { case 'existing': return decodeExisting(value); }
      }
    `,
    'src/CollabCloudBinding.ts': `
      export const COLLAB_CLOUD_BINDING_VERSION = 1 as const;
      export function collabCloudProjectOperationRoute() { return '/v1/projects'; }
    `,
    'src/CollabConstants.ts': 'export const COLLAB_PROTOCOL_VERSION = 4 as const;',
    'src/CollabControlOperationCodecs.ts': `
      const codec = (operation: string) => operation;
      export const COLLAB_CONTROL_OPERATION_CODECS = Object.freeze({ existing: codec('existing') });
    `,
    'src/index.ts': "export { COLLAB_AUTHORITY_TRANSFER_OPERATIONS, decodeCollabAuthorityTransferOperationRequest } from './CollabAuthorityTransfer';",
  };
  const currentFiles = {
    ...baseFiles,
    'src/CollabAuthorityTransfer.ts': `
      export interface ConfirmTargetCleanupRequest { readonly proof: string; }
      export const COLLAB_AUTHORITY_TRANSFER_OPERATIONS = Object.freeze(['existing', 'confirmTargetCleanup'] as const);
      export interface CollabAuthorityTransferOperationMap {
        readonly existing: { readonly request: ExistingRequest; readonly response: ExistingResponse };
        readonly confirmTargetCleanup: { readonly request: ConfirmTargetCleanupRequest; readonly response: ExistingResponse };
      }
      function decodeExisting(value: unknown) { return value; }
      function decodeConfirmTargetCleanup(value: unknown): ConfirmTargetCleanupRequest { return value as ConfirmTargetCleanupRequest; }
      export function decodeCollabAuthorityTransferOperationRequest(operation: string, value: unknown) {
        switch (operation) {
          case 'existing': return decodeExisting(value);
          case 'confirmTargetCleanup': return decodeConfirmTargetCleanup(value);
        }
      }
    `,
    'src/CollabCloudBinding.ts': `
      export const COLLAB_CLOUD_BINDING_VERSION = 2 as const;
      export function collabCloudProjectOperationRoute() { return '/v2/projects'; }
    `,
    'src/CollabConstants.ts': 'export const COLLAB_PROTOCOL_VERSION = 5 as const;',
    'src/CollabControlOperationCodecs.ts': `
      const codec = (operation: string) => operation;
      export const COLLAB_CONTROL_OPERATION_CODECS = Object.freeze({
        existing: codec('existing'),
        confirmTargetCleanup: codec('confirmTargetCleanup'),
      });
    `,
  };
  const input = {
    addedOperations: ['confirmTargetCleanup'],
    baseCloudBindingVersion: 1,
    baseFiles,
    baseProtocolVersion: 4,
    currentCloudBindingVersion: 2,
    currentFiles,
    currentProtocolVersion: 5,
  };
  assert.doesNotThrow(() => compatibility.assertAuthorityTransferOperationSourceAddition(input));

  const decoderDrift = cloneJson(currentFiles);
  decoderDrift['src/CollabAuthorityTransfer.ts'] = decoderDrift[
    'src/CollabAuthorityTransfer.ts'
  ].replace(
    'function decodeExisting(value: unknown) { return value; }',
    'function decodeExisting(_value: unknown) { return null; }',
  );
  assert.throws(
    () => compatibility.assertAuthorityTransferOperationSourceAddition({
      ...input,
      currentFiles: decoderDrift,
    }),
    /existing source declaration/u,
  );

  const unrelatedAddition = cloneJson(currentFiles);
  unrelatedAddition['src/CollabAuthorityTransfer.ts'] += '\nexport function unrelated() { return 1; }\n';
  assert.throws(
    () => compatibility.assertAuthorityTransferOperationSourceAddition({
      ...input,
      currentFiles: unrelatedAddition,
    }),
    /unreachable source declaration/u,
  );

  const heritageDrift = cloneJson(currentFiles);
  heritageDrift['src/CollabAuthorityTransfer.ts'] = heritageDrift[
    'src/CollabAuthorityTransfer.ts'
  ].replace(
    'CollabAuthorityTransferOperationMap {',
    'CollabAuthorityTransferOperationMap extends ConfirmTargetCleanupRequest {',
  );
  assert.throws(
    () => compatibility.assertAuthorityTransferOperationSourceAddition({
      ...input,
      currentFiles: heritageDrift,
    }),
    /operation map/u,
  );

  for (const collision of ['request', 'response', 'proof']) {
    const propertyCollision = cloneJson(currentFiles);
    propertyCollision['src/CollabAuthorityTransfer.ts'] +=
      `\nexport interface ${collision} { readonly unrelated: true; }\n`;
    assert.throws(
      () => compatibility.assertAuthorityTransferOperationSourceAddition({
        ...input,
        currentFiles: propertyCollision,
      }),
      /unreachable source declaration/u,
    );
  }

  const aliasedExport = cloneJson(currentFiles);
  aliasedExport['src/index.ts'] +=
    "\nexport type { ExistingResponse as ConfirmTargetCleanupRequest } from './CollabAuthorityTransfer';\n";
  assert.throws(
    () => compatibility.assertAuthorityTransferOperationSourceAddition({
      ...input,
      currentFiles: aliasedExport,
    }),
    /aliased authority-transfer export/u,
  );

  const selfAliasedExport = cloneJson(currentFiles);
  selfAliasedExport['src/index.ts'] +=
    "\nexport type { ConfirmTargetCleanupRequest as ConfirmTargetCleanupRequest } from './CollabAuthorityTransfer';\n";
  assert.throws(
    () => compatibility.assertAuthorityTransferOperationSourceAddition({
      ...input,
      currentFiles: selfAliasedExport,
    }),
    /aliased authority-transfer export/u,
  );

  const duplicateMember = cloneJson(currentFiles);
  duplicateMember['src/CollabAuthorityTransfer.ts'] = duplicateMember[
    'src/CollabAuthorityTransfer.ts'
  ].replace(
    'readonly confirmTargetCleanup: { readonly request: ConfirmTargetCleanupRequest; readonly response: ExistingResponse };',
    `readonly confirmTargetCleanup: { readonly request: ConfirmTargetCleanupRequest; readonly response: ExistingResponse };
        readonly confirmTargetCleanup: { readonly request: ConfirmTargetCleanupRequest; readonly response: ExistingResponse };`,
  );
  assert.throws(
    () => compatibility.assertAuthorityTransferOperationSourceAddition({
      ...input,
      currentFiles: duplicateMember,
    }),
    /operation map/u,
  );

  const conventionOnlyDecoder = cloneJson(currentFiles);
  conventionOnlyDecoder['src/CollabAuthorityTransfer.ts'] += `
    export function decodeConfirmTargetCleanupRequest(): ConfirmTargetCleanupRequest {
      return { proof: 'unrelated' };
    }
  `;
  conventionOnlyDecoder['src/index.ts'] +=
    "\nexport { decodeConfirmTargetCleanupRequest } from './CollabAuthorityTransfer';\n";
  assert.throws(
    () => compatibility.assertAuthorityTransferOperationSourceAddition({
      ...input,
      currentFiles: conventionOnlyDecoder,
    }),
    /unreachable source declaration/u,
  );

  const shadowedSigningEncoder = cloneJson(currentFiles);
  shadowedSigningEncoder['src/CollabAuthorityTransfer.ts'] = shadowedSigningEncoder[
    'src/CollabAuthorityTransfer.ts'
  ].replace(
    'export interface ConfirmTargetCleanupRequest { readonly proof: string; }',
    `export interface ConfirmTargetCleanupProofSigningPayload { readonly proof: string; }
      export interface ConfirmTargetCleanupRequest {
        readonly proof: ConfirmTargetCleanupProofSigningPayload;
      }`,
  ) + `
    export function encodeConfirmTargetCleanupProofSigningInput<
      ConfirmTargetCleanupProofSigningPayload
    >(_payload: ConfirmTargetCleanupProofSigningPayload): string { return 'unrelated'; }
  `;
  shadowedSigningEncoder['src/index.ts'] +=
    "\nexport { encodeConfirmTargetCleanupProofSigningInput } from './CollabAuthorityTransfer';\n";
  assert.throws(
    () => compatibility.assertAuthorityTransferOperationSourceAddition({
      ...input,
      currentFiles: shadowedSigningEncoder,
    }),
    /unreachable source declaration/u,
  );

  const unrelatedBindingVersionText = {
    ...input,
    baseFiles: {
      ...baseFiles,
      'src/CollabCloudBinding.ts': `${baseFiles['src/CollabCloudBinding.ts']}
        export function environment() { return 'env1'; }
      `,
    },
    currentFiles: {
      ...currentFiles,
      'src/CollabCloudBinding.ts': `${currentFiles['src/CollabCloudBinding.ts']}
        export function environment() { return 'env2'; }
      `,
    },
  };
  assert.throws(
    () => compatibility.assertAuthorityTransferOperationSourceAddition(
      unrelatedBindingVersionText,
    ),
    /Cloud binding/u,
  );
});

test('requires a package major for changed declarations or runtime behavior', () => {
  const changedDeclaration = [{
    declaration: 'export interface A { readonly value: string; }',
    exportName: 'A',
    source: './types',
  }];
  assert.equal(classifyPackageApiChange(snapshot(), snapshot({
    declarations: changedDeclaration,
  })), 'major');
  assert.throws(
    () => assertVersionedContractChange(snapshot(), snapshot({
      declarations: changedDeclaration,
      packageVersion: '1.1.0',
    })),
    /package major release/u,
  );
  assert.throws(
    () => assertVersionedContractChange(snapshot(), snapshot({
      packageVersion: '1.1.0',
      runtime: [{ path: 'src/types.ts', sha256: 'changed-runtime' }],
    })),
    /package major release/u,
  );
  assert.doesNotThrow(() => assertVersionedContractChange(snapshot(), snapshot({
    declarations: changedDeclaration,
    packageVersion: '2.0.0',
  })));
});

test('requires independent wire and Cloud binding version increases', () => {
  assert.throws(
    () => assertVersionedContractChange(snapshot(), snapshot({
      packageVersion: '2.0.0',
      wire: { operations: ['getRequest', 'createTicket'] },
    })),
    /wire protocol version must increase/u,
  );
  assert.throws(
    () => assertVersionedContractChange(snapshot(), snapshot({
      packageVersion: '2.0.0',
      protocolVersion: 5,
      wire: { operations: ['getRequest', 'createTicket'] },
    })),
    /Cloud binding version must increase/u,
  );
  assert.doesNotThrow(() => assertVersionedContractChange(snapshot(), snapshot({
    bindingVersion: 2,
    packageVersion: '2.0.0',
    protocolVersion: 5,
    wire: { operations: ['getRequest', 'createTicket'] },
  })));
  assert.throws(
    () => assertVersionedContractChange(snapshot(), snapshot({
      binding: { routes: ['capabilities', 'snapshot'] },
      packageVersion: '2.0.0',
    })),
    /Cloud binding version must increase/u,
  );
  assert.doesNotThrow(() => assertVersionedContractChange(snapshot(), snapshot({
    binding: { routes: ['capabilities', 'snapshot'] },
    bindingVersion: 2,
    packageVersion: '2.0.0',
  })));
});

test('fails closed on unknown snapshot structure', () => {
  assert.throws(
    () => assertVersionedContractChange(snapshot(), snapshot({ mysteryPolicy: true })),
    /unknown snapshot field/u,
  );
  const current = snapshot();
  current.contract.unknownContractArea = { behavior: 'unclassified' };
  assert.throws(
    () => assertVersionedContractChange(snapshot(), current),
    /unknown contract field/u,
  );
});

test('runtime digests ignore comments and formatting', () => {
  assert.equal(
    digestTypeScriptBehavior('export function decode(value: unknown) { return value; }'),
    digestTypeScriptBehavior(`
      // Documentation is not runtime behavior.
      export function decode(
        value: unknown,
      ) {
        return value;
      }
    `),
  );
});

test('the runtime baseline covers every source module', () => {
  const expected = sourceFiles()
    .map(absolutePath => path.posix.join(
      'src',
      path.relative(path.join(repositoryRoot, 'src'), absolutePath).split(path.sep).join('/'),
    ))
    .sort();
  const actual = generateContractSnapshot().contract.runtimeBehaviorDigests
    .map(entry => entry.path);

  assert.deepEqual(actual, expected);
});

test('the wire baseline classifies every lifecycle contract module', () => {
  const wire = generateContractSnapshot().contract.wire;
  const declarationSources = new Set(wire.declarations.map(entry => entry.source));
  const runtimePaths = new Set(wire.runtimeBehaviorDigests.map(entry => entry.path));

  for (const moduleName of [
    'CollabAuthorityTransfer',
    'CollabProjectCheckpoint',
    'CollabProjectRetirement',
  ]) {
    assert.equal(declarationSources.has(`./${moduleName}`), true);
    assert.equal(runtimePaths.has(`src/${moduleName}.ts`), true);
  }
});

test('the Cloud binding baseline includes every derived route and limit input', () => {
  const generated = generateContractSnapshot();
  assert.equal(generated.contract.cloudBinding.jsonOperations[0], 'getProjectSnapshot');
  assert.deepEqual(
    [...generated.contract.cloudBinding.jsonOperations].sort(),
    ['getProjectSnapshot', ...generated.contract.wire.operations].sort(),
  );
  assert.deepEqual(generated.contract.cloudBinding.checkpointArtifacts, [
    'checkpoint.json',
    'coordination.ndjson',
    'repository.bundle',
  ]);
  assert.deepEqual(generated.contract.cloudBinding.limits, {
    bootstrapAttemptTtlMs: 86_400_000,
    defaultMaxConcurrentBootstrapUploads: 1,
    eventHeartbeatMs: 30_000,
    eventMissedHeartbeatLimit: 2,
    maxCloudOpenRequests: 100,
    maxCloudProjectMembers: 100,
    maxCloudSnapshotUtf8Bytes: 458_752,
    maxCloudTicketHighlights: 5,
    maxCheckpointCoordinationBytes: 268_435_456,
    maxCheckpointManifestUtf8Bytes: 65_536,
    maxCheckpointRepositoryBundleBytes: 1_073_741_824,
    maxCheckpointStagingBytes: 2_147_483_648,
    maxDevelopmentBootstrapGitBundleBytes: 1_073_741_824,
    maxDevelopmentBootstrapManifestUtf8Bytes: 65_536,
    maxDevelopmentBootstrapReportUtf8Bytes: 65_536,
    maxDevelopmentBootstrapRepositoryBytes: 1_073_741_824,
    maxDevelopmentBootstrapStagingBytes: 2_147_483_648,
    maxEventReplay: 500,
    maxGitReceivePackBytes: 268_435_456,
    maxJsonPayloadUtf8Bytes: 524_288,
    maxRepositoryBytes: 1_073_741_824,
    maxUploadsPerBootstrapAttempt: 1,
    minEventRetentionDays: 30,
    minRetainedEventCount: 10_000,
    uploadDeadlineMs: 900_000,
    uploadIdleTimeoutMs: 30_000,
  });
});

test('each lifecycle module declaration and behavior requires a wire-version bump', () => {
  const base = generateContractSnapshot();
  for (const moduleName of [
    'CollabAuthorityTransfer',
    'CollabProjectCheckpoint',
    'CollabProjectRetirement',
  ]) {
    const declarationChange = cloneJson(base);
    declarationChange.packageVersion = '3.0.0';
    const declaration = declarationChange.contract.wire.declarations.find(
      entry => entry.source === `./${moduleName}`,
    );
    assert.ok(declaration);
    declaration.declaration += '\nexport type Changed = true;';
    assert.throws(
      () => assertVersionedContractChange(base, declarationChange),
      /wire protocol version must increase/u,
    );

    const behaviorChange = cloneJson(base);
    behaviorChange.packageVersion = '3.0.0';
    const behavior = behaviorChange.contract.wire.runtimeBehaviorDigests.find(
      entry => entry.path === `src/${moduleName}.ts`,
    );
    assert.ok(behavior);
    behavior.sha256 = 'changed-runtime';
    assert.throws(
      () => assertVersionedContractChange(base, behaviorChange),
      /wire protocol version must increase/u,
    );
  }
});

test('an inline type-only root export cannot pass as a patch release', (t) => {
  const fixtureRoot = mkdtempSync(path.join(os.tmpdir(), 'collab-protocol-declarations-'));
  t.after(() => rmSync(fixtureRoot, { force: true, recursive: true }));
  mkdirSync(fixtureRoot, { recursive: true });
  writeFileSync(
    path.join(fixtureRoot, 'index.d.ts'),
    'export interface InlineContract { readonly value: string; }\n',
  );
  const declarations = publicDeclarationsFromDist(fixtureRoot);
  assert.deepEqual(declarations, [{
    declaration: 'export interface InlineContract { readonly value: string; }',
    exportName: 'InlineContract',
    source: '.',
  }]);
  assert.throws(
    () => assertVersionedContractChange(
      snapshot({ declarations: [], runtimeExports: [] }),
      snapshot({ declarations, packageVersion: '1.0.1', runtimeExports: [] }),
    ),
    /package minor or major release/u,
  );
});

test('the compatibility command binds explicit review to exact generated snapshots', (t) => {
  const fixtureRoot = mkdtempSync(path.join(os.tmpdir(), 'collab-compatibility-command-'));
  t.after(() => rmSync(fixtureRoot, { force: true, recursive: true }));
  for (const directory of ['scripts', 'src', 'dist']) {
    mkdirSync(path.join(fixtureRoot, directory));
  }
  copyFileSync(
    path.join(repositoryRoot, 'scripts/check-compatibility.mjs'),
    path.join(fixtureRoot, 'scripts/check-compatibility.mjs'),
  );
  symlinkSync(path.join(repositoryRoot, 'node_modules'), path.join(fixtureRoot, 'node_modules'), 'dir');
  writeFileSync(path.join(fixtureRoot, 'package.json'), JSON.stringify({ version: '1.0.0' }));
  writeFileSync(path.join(fixtureRoot, 'src/index.ts'), 'export function decode(value: unknown) { return value; }\n');
  writeFileSync(path.join(fixtureRoot, 'dist/index.d.ts'), 'export declare function decode(value: unknown): unknown;\n');
  writeFileSync(path.join(fixtureRoot, 'dist/index.js'), `module.exports = {
    COLLAB_CLOUD_BINDING_VERSION: 1,
    COLLAB_PROTOCOL_VERSION: 4,
    COLLAB_PROJECT_CHECKPOINT_ARTIFACTS: [],
    COLLAB_CLOUD_CAPABILITIES: [],
    COLLAB_CLOUD_EVENT_KINDS: [],
    COLLAB_CLOUD_JSON_OPERATIONS: ['getProjectSnapshot'],
    COLLAB_CLOUD_BINDING_LIMITS: {},
    COLLAB_LIMITS: { maxJsonPayloadUtf8Bytes: 1 },
    COLLAB_ERROR_CODES: [],
    COLLAB_MAIN_REF: 'refs/heads/main',
    COLLAB_MEMBER_REF_PREFIX: 'refs/heads/members/',
    COLLAB_CONTROL_OPERATION_CODECS: {},
  };\n`);
  const command = (...args) => spawnSync(process.execPath, ['scripts/check-compatibility.mjs', ...args], {
    cwd: fixtureRoot,
    encoding: 'utf8',
  });
  const git = (...args) => execFileSync('git', [
    '-c', `core.hooksPath=${path.join(fixtureRoot, 'disabled-hooks')}`,
    '-c', 'commit.gpgSign=false',
    '-c', 'user.name=Protocol compatibility test',
    '-c', 'user.email=protocol-test@example.invalid',
    ...args,
  ], { cwd: fixtureRoot, encoding: 'utf8' }).trim();
  assert.equal(command('--write').status, 0);
  const missingMode = command();
  assert.notEqual(missingMode.status, 0);
  assert.match(missingMode.stderr, /requires --base unless --write/u);
  git('init', '--quiet');
  git('add', 'package.json', 'scripts', 'src', 'dist');
  git('commit', '--quiet', '-m', 'test: record base without a contract snapshot');
  const missingSnapshotBase = git('rev-parse', 'HEAD');
  const missingSnapshot = command('--base', missingSnapshotBase);
  assert.notEqual(missingSnapshot.status, 0);
  assert.match(missingSnapshot.stderr, /existing base snapshot/u);
  const writeWithBase = command('--write', '--base', missingSnapshotBase);
  assert.notEqual(writeWithBase.status, 0);
  assert.match(writeWithBase.stderr, /cannot be combined/u);
  git('add', 'contract-snapshot.json');
  git('commit', '--quiet', '-m', 'test: record base snapshot');
  const base = git('rev-parse', 'HEAD');

  writeFileSync(path.join(fixtureRoot, 'src/index.ts'), 'const identity = (value: unknown) => value; export function decode(value: unknown) { return identity(value); }\n');
  assert.equal(command('--write').status, 0);
  assert.notEqual(command('--base', base).status, 0);
  const reason = 'Extract identity without changing the observable fixture contract.';
  const recorded = command('--base', base, '--record-implementation-only-review', reason);
  assert.equal(recorded.status, 0, recorded.stderr);
  assert.equal(JSON.parse(readFileSync(path.join(fixtureRoot, 'compatibility-review.json'), 'utf8')).reason, reason);
  const accepted = command('--base', base);
  assert.equal(accepted.status, 0, accepted.stderr);

  git('add', 'contract-snapshot.json', 'compatibility-review.json');
  git('commit', '--quiet', '-m', 'test: record reviewed refactor');
  const nextBase = git('rev-parse', 'HEAD');
  assert.equal(command('--base', nextBase).status, 0);

  writeFileSync(path.join(fixtureRoot, 'src/index.ts'), 'export function decode() { return null; }\n');
  assert.equal(command('--write').status, 0);
  const stale = command('--base', nextBase);
  assert.notEqual(stale.status, 0);
  assert.match(stale.stderr, /exact base and candidate snapshots/u);
});
