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


test('optional contract additions require exact review and preserve every existing declaration', () => {
  const declarations = [{ exportName: 'Envelope', source: './CollabCloudBinding',
    declaration: 'export interface Envelope { readonly requestId: string; }' },
  { exportName: 'encode', source: './CollabCloudBinding',
    declaration: 'export declare function encode(value: string): Envelope;' }];
  const base = snapshot({ declarations, runtimeExports: ['encode'],
    runtime: [{ path: 'src/CollabCloudBinding.ts', sha256: 'before' }] });
  const current = snapshot({ declarations: [
    { ...declarations[0], declaration: 'export interface Envelope { readonly requestId: string; readonly outcome?: "rejected"; }' },
    { ...declarations[1], declaration: 'export declare function encode(value: string, outcome?: "rejected"): Envelope;' },
  ], runtimeExports: ['encode'], packageVersion: '1.1.0', protocolVersion: 5, bindingVersion: 2,
  runtime: [{ path: 'src/CollabCloudBinding.ts', sha256: 'after' }] });
  const reason = 'Public codec fixtures retain old envelopes and validate the optional outcome.';
  const review = compatibility.createOptionalContractAdditionReview(base, current, reason, ['encode']);
  assert.doesNotThrow(() => assertVersionedContractChange(base, current, review));
  assert.throws(() => assertVersionedContractChange(base, current), /major release/u);
  assert.throws(() => assertVersionedContractChange(base, { ...current, packageVersion: '1.1.1' }, review), /exact base and candidate/u);
  assert.throws(() => assertVersionedContractChange(base, current, { ...review, extra: true }), /unknown/u);
  for (const declaration of [
    'export interface Envelope { readonly requestId: string; readonly outcome: "rejected"; }',
    'export interface Envelope { readonly requestId: number; readonly outcome?: "rejected"; }',
    'export interface Envelope { readonly outcome?: "rejected"; }',
  ]) {
    const drift = cloneJson(current);
    drift.contract.publicDeclarations[0].declaration = declaration;
    assert.throws(() => compatibility.createOptionalContractAdditionReview(base, drift, reason, ['encode']), /optional public addition/u);
  }
  const changedParameter = cloneJson(current);
  changedParameter.contract.publicDeclarations[1].declaration = 'export declare function encode(value: number, outcome?: "rejected"): Envelope;';
  assert.throws(() => compatibility.createOptionalContractAdditionReview(base, changedParameter, reason, ['encode']), /optional public addition/u);
  const requiredParameter = cloneJson(current);
  requiredParameter.contract.publicDeclarations[1].declaration = 'export declare function encode(value: string, outcome: "rejected"): Envelope;';
  assert.throws(() => compatibility.createOptionalContractAdditionReview(base, requiredParameter, reason, ['encode']), /optional public addition/u);
  for (const edit of [
    candidate => { candidate.contract.wire.limits = { maxBytes: 1 }; },
    candidate => { candidate.contract.cloudBinding.capabilities = ['new']; },
    candidate => { candidate.contract.publicRuntimeExports.push('unrelated'); },
    candidate => { candidate.contract.runtimeBehaviorDigests.push({ path: 'src/unrelated.ts', sha256: 'new' }); },
    candidate => { candidate.cloudBindingVersion = 1; },
    candidate => { candidate.protocolVersion = 4; },
  ]) {
    const drift = cloneJson(current); edit(drift);
    assert.throws(() => compatibility.createOptionalContractAdditionReview(base, drift, reason, ['encode']), /Optional contract/u);
  }
  assert.throws(() => compatibility.createOptionalContractAdditionReview(base, current, reason, ['missing']), /public function/u);
  const route = { exportName: 'collabCloudProjectEventsRoute', source: './CollabCloudBinding',
    declaration: 'export declare function collabCloudProjectEventsRoute(): string;' };
  const withRoute = value => {
    const copy = cloneJson(value);
    copy.contract.publicDeclarations.push(route);
    copy.contract.publicRuntimeExports.push(route.exportName);
    return copy;
  };
  assert.throws(() => compatibility.createOptionalContractAdditionReview(
    withRoute(base), withRoute(current), reason, ['encode', route.exportName],
  ), /related codec/u);

});


test('optional Cloud implementation review rejects unrelated source drift and route changes', () => {
  const before = `export const COLLAB_CLOUD_BINDING_VERSION = 1 as const;
    export interface Envelope { readonly requestId: string; }
    export function encode(value: string): Envelope { return { requestId: value }; }
    export function decode(value: unknown): Envelope { return value as Envelope; }
    export function collabCloudProjectOperationRoute() { return '/v1/projects'; }
    export function unrelated() { return true; }`;
  const after = before.replace('VERSION = 1', 'VERSION = 2').replace('/v1/', '/v2/')
    .replace('requestId: string;', 'requestId: string; readonly outcome?: "rejected";')
    .replace('encode(value: string)', 'encode(value: string, outcome?: "rejected")')
    .replace('return value as Envelope;', 'return Object.freeze(value) as Envelope;');
  const reviewed = new Set(['Envelope', 'encode', 'decode']);
  const check = candidate => compatibility.assertCloudBindingVersionMigration(before, candidate, 1, 2, reviewed);
  assert.doesNotThrow(() => check(after));
  assert.throws(() => compatibility.assertCloudBindingVersionMigration(
    before, after.replace('/v2/projects', '/v2/changed'), 1, 2,
    new Set([...reviewed, 'collabCloudProjectOperationRoute']),
  ), /reviewed version-prefix/u);
  for (const candidate of [
    after.replace('return true;', 'return false;'),
    after.replace('/v2/projects', '/v2/changed'),
    after.replace('function decode', 'function replaced'),
    after + ' export const newHelper = true;',
  ]) assert.throws(() => check(candidate), /reviewed version-prefix/u);
});

test('optional review command cannot waive an unrelated route implementation', t => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'collab-optional-command-'));
  t.after(() => rmSync(root, { force: true, recursive: true }));
  for (const directory of ['scripts', 'src', 'dist']) mkdirSync(path.join(root, directory));
  copyFileSync(path.join(repositoryRoot, 'scripts/check-compatibility.mjs'), path.join(root, 'scripts/check-compatibility.mjs'));
  symlinkSync(path.join(repositoryRoot, 'node_modules'), path.join(root, 'node_modules'), 'dir');
  const binding = `export const COLLAB_CLOUD_BINDING_VERSION = 1 as const;
export interface Envelope { readonly requestId: string; }
export function encode(value: string): Envelope { return { requestId: value }; }
export function collabCloudProjectEventsRoute(): string { return '/v1/projects'; }`;
  const declarations = `export declare const COLLAB_CLOUD_BINDING_VERSION: 1;
export interface Envelope { readonly requestId: string; }
export declare function encode(value: string): Envelope;
export declare function collabCloudProjectEventsRoute(): string;`;
  const runtime = `module.exports = {
COLLAB_CLOUD_BINDING_VERSION: 1, COLLAB_PROTOCOL_VERSION: 4,
COLLAB_PROJECT_CHECKPOINT_ARTIFACTS: [], COLLAB_CLOUD_CAPABILITIES: [],
COLLAB_CLOUD_EVENT_KINDS: [], COLLAB_CLOUD_JSON_OPERATIONS: ['getProjectSnapshot'],
COLLAB_CLOUD_BINDING_LIMITS: {}, COLLAB_LIMITS: { maxJsonPayloadUtf8Bytes: 1 },
COLLAB_ERROR_CODES: [], COLLAB_MAIN_REF: 'refs/heads/main',
COLLAB_MEMBER_REF_PREFIX: 'refs/heads/members/', COLLAB_CONTROL_OPERATION_CODECS: {},
encode: value => ({ requestId: value }), collabCloudProjectEventsRoute: () => '/v1/projects' };`;
  const put = (file, value) => writeFileSync(path.join(root, file), value);
  put('package.json', JSON.stringify({ version: '1.0.0' }));
  put('src/CollabCloudBinding.ts', binding);
  put('src/CollabConstants.ts', 'export const COLLAB_PROTOCOL_VERSION = 4 as const;');
  put('src/index.ts', "export { COLLAB_CLOUD_BINDING_VERSION, type Envelope, encode, collabCloudProjectEventsRoute } from './CollabCloudBinding';");
  put('dist/index.d.ts', "export { COLLAB_CLOUD_BINDING_VERSION, type Envelope, encode, collabCloudProjectEventsRoute } from './CollabCloudBinding';");
  put('dist/CollabCloudBinding.d.ts', declarations);
  put('dist/index.js', runtime);
  const command = (...args) => {
    const result = spawnSync(process.execPath, ['scripts/check-compatibility.mjs', ...args], { cwd: root, encoding: 'utf8' });
    if (args[0] === '--write') assert.equal(result.status, 0, result.stderr);
    return result;
  };
  const git = (...args) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgSign=false',
    '-c', 'user.name=Protocol test', '-c', 'user.email=protocol-test@example.invalid', ...args], { cwd: root, encoding: 'utf8' }).trim();
  assert.equal(command('--write').status, 0);
  git('init', '--quiet');
  git('add', 'package.json', 'src', 'dist', 'contract-snapshot.json');
  git('commit', '--quiet', '-m', 'test: record optional contract base');
  const base = git('rev-parse', 'HEAD');
  put('package.json', JSON.stringify({ version: '1.1.0' }));
  put('src/CollabConstants.ts', 'export const COLLAB_PROTOCOL_VERSION = 5 as const;');
  put('src/CollabCloudBinding.ts', binding.replace('VERSION = 1', 'VERSION = 2')
    .replace('requestId: string;', 'requestId: string; readonly outcome?: "rejected";')
    .replace('/v1/projects', '/v2/projects'));
  put('dist/CollabCloudBinding.d.ts', declarations.replace('VERSION: 1', 'VERSION: 2')
    .replace('requestId: string;', 'requestId: string; readonly outcome?: "rejected";'));
  put('dist/index.js', runtime.replace('VERSION: 1', 'VERSION: 2').replace('VERSION: 4', 'VERSION: 5'));
  assert.equal(command('--write').status, 0);
  const record = names => command('--base', base, '--record-optional-contract-addition-review',
    'The optional field preserves existing envelope inputs.', '--implementation-declarations', names);
  const accepted = record('encode');
  assert.equal(accepted.status, 0, accepted.stderr);
  put('src/CollabCloudBinding.ts', readFileSync(path.join(root, 'src/CollabCloudBinding.ts'), 'utf8')
    .replace('/v2/projects', '/v2/BROKEN'));
  assert.equal(command('--write').status, 0);
  const rejected = record('encode,collabCloudProjectEventsRoute');
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /related codec/u);
});
