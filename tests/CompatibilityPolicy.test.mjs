import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
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
  proveCompatibleControlOperationAdditionSources,
  proveCompatibleProjectBackupModuleAdditionSources,
  publicDeclarationsFromDist,
} from '../scripts/check-compatibility.mjs';

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

test('accepts the 1.0 graduation when the legacy contract is unchanged', () => {
  const legacy = {
    schemaVersion: 1,
    packageVersion: '0.4.0',
    protocolVersion: 4,
    contract: { operations: ['getRequest'] },
  };

  assert.doesNotThrow(() => assertVersionedContractChange(legacy, snapshot()));
});

test('accepts patch releases only when the public package API is unchanged', () => {
  assert.equal(classifyPackageApiChange(snapshot(), snapshot({ packageVersion: '1.0.1' })), 'none');
  assert.doesNotThrow(() => assertVersionedContractChange(
    snapshot(),
    snapshot({ packageVersion: '1.0.1' }),
  ));
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
  assert.doesNotThrow(() => assertVersionedContractChange(snapshot(), snapshot({
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

test('keeps a proven additive offline backup module outside wire v6', () => {
  const baseIndexSource = `
    export { existing } from './Existing';
    export type { Existing } from './Existing';
  `;
  const currentIndexSource = `${baseIndexSource}
    export { backupVersion, decodeBackup } from './CollabProjectBackupCheckpoint';
    export type { BackupRecord } from './CollabProjectBackupCheckpoint';
  `;
  const backupModuleSource = `
    export const backupVersion = 2;
    export function decodeBackup(value) { return value; }
    export interface BackupRecord { readonly value: string; }
  `;
  const baseDeclarations = [
    { declaration: 'export declare const existing = 1;', exportName: 'existing', source: './Existing' },
    { declaration: 'export interface Existing {}', exportName: 'Existing', source: './Existing' },
  ];
  const addedDeclarations = [
    { declaration: 'export interface BackupRecord { readonly value: string; }', exportName: 'BackupRecord', source: './CollabProjectBackupCheckpoint' },
    { declaration: 'export declare const backupVersion = 2;', exportName: 'backupVersion', source: './CollabProjectBackupCheckpoint' },
    { declaration: 'export declare function decodeBackup(value: unknown): unknown;', exportName: 'decodeBackup', source: './CollabProjectBackupCheckpoint' },
  ];
  const baseRuntime = [
    { path: 'src/Existing.ts', sha256: 'existing-runtime' },
    { path: 'src/index.ts', sha256: digestTypeScriptBehavior(baseIndexSource) },
  ];
  const currentRuntime = [
    ...baseRuntime.filter(item => item.path !== 'src/index.ts'),
    {
      path: 'src/CollabProjectBackupCheckpoint.ts',
      sha256: digestTypeScriptBehavior(backupModuleSource),
    },
    { path: 'src/index.ts', sha256: digestTypeScriptBehavior(currentIndexSource) },
  ];
  const wire = {
    declarations: baseDeclarations,
    operations: ['getRequest'],
    runtimeBehaviorDigests: [{ path: 'src/Existing.ts', sha256: 'existing-runtime' }],
  };
  const base = snapshot({
    declarations: baseDeclarations,
    runtime: baseRuntime,
    runtimeExports: ['existing'],
    wire,
  });
  const current = snapshot({
    declarations: [...baseDeclarations, ...addedDeclarations],
    packageVersion: '1.1.0',
    runtime: currentRuntime,
    runtimeExports: ['backupVersion', 'decodeBackup', 'existing'],
    wire,
  });
  const proof = proveCompatibleProjectBackupModuleAdditionSources({
    baseCheckpointSource: 'export const format = 1;\n',
    baseIndexSource,
    currentCheckpointSource: 'export const format = 1;\n',
    currentIndexSource,
    currentModuleSource: backupModuleSource,
  });
  assert.ok(proof);
  assert.equal(classifyPackageApiChange(base, current, proof), 'minor');
  assert.doesNotThrow(() => assertVersionedContractChange(base, current, proof));
  assert.equal(base.contract.wire, current.contract.wire);

  assert.equal(proveCompatibleProjectBackupModuleAdditionSources({
    baseCheckpointSource: 'export const format = 1;\n',
    baseIndexSource,
    currentCheckpointSource: 'export const format = 1;\n',
    currentIndexSource: currentIndexSource.replace(
      "export { existing } from './Existing';",
      "export { changed } from './Existing';",
    ),
    currentModuleSource: backupModuleSource,
  }), null);
  assert.equal(proveCompatibleProjectBackupModuleAdditionSources({
    baseCheckpointSource: 'export const format = 1;\n',
    baseIndexSource,
    currentCheckpointSource: 'export const format = 1; // changed bytes\n',
    currentIndexSource,
    currentModuleSource: backupModuleSource,
  }), null);
});

test('keeps a proven additive control operation on the current wire version', () => {
  const baseAuthoritySource = `
    export const COLLAB_AUTHORITY_TRANSFER_OPERATIONS = Object.freeze([
      'getProjectAuthorityTransfer',
    ] as const);
    export interface CollabAuthorityTransferOperationMap {
      readonly getProjectAuthorityTransfer: ExistingOperation;
    }
    function decodeExisting(value) { return value; }
    export function decodeCollabAuthorityTransferOperationRequest(operation, value) {
      const decoded = (() => {
        switch (operation) {
          case 'getProjectAuthorityTransfer': return decodeExisting(value);
        }
      })();
      return decoded;
    }
    export function decodeCollabAuthorityTransferOperationResponse(operation, value) {
      switch (operation) {
        case 'getProjectAuthorityTransfer': return decodeExisting(value);
      }
    }
  `;
  const currentAuthoritySource = `
    export const COLLAB_AUTHORITY_TRANSFER_OPERATIONS = Object.freeze([
      'getProjectAuthorityTransfer',
      'getAuthorityTransferReceiptVerifier',
    ] as const);
    export interface CollabAuthorityTransferOperationMap {
      readonly getProjectAuthorityTransfer: ExistingOperation;
      readonly getAuthorityTransferReceiptVerifier: VerifierOperation;
    }
    export interface VerifierResponse { readonly receiptPublicKey: string; }
    function decodeExisting(value) { return value; }
    function decodeVerifier(value) { return value; }
    export function decodeCollabAuthorityTransferOperationRequest(operation, value) {
      const decoded = (() => {
        switch (operation) {
          case 'getProjectAuthorityTransfer': return decodeExisting(value);
          case 'getAuthorityTransferReceiptVerifier': return decodeExisting(value);
        }
      })();
      return decoded;
    }
    export function decodeCollabAuthorityTransferOperationResponse(operation, value) {
      switch (operation) {
        case 'getProjectAuthorityTransfer': return decodeExisting(value);
        case 'getAuthorityTransferReceiptVerifier': return decodeVerifier(value);
      }
    }
  `;
  const baseCodecsSource = `
    export const COLLAB_CONTROL_OPERATION_CODECS = Object.freeze({
      getProjectAuthorityTransfer: codec('getProjectAuthorityTransfer'),
    });
  `;
  const currentCodecsSource = `
    export const COLLAB_CONTROL_OPERATION_CODECS = Object.freeze({
      getProjectAuthorityTransfer: codec('getProjectAuthorityTransfer'),
      getAuthorityTransferReceiptVerifier: codec('getAuthorityTransferReceiptVerifier'),
    });
  `;
  const baseDeclarations = [
    {
      declaration: 'export declare const COLLAB_AUTHORITY_TRANSFER_OPERATIONS: readonly ["getProjectAuthorityTransfer"];',
      exportName: 'COLLAB_AUTHORITY_TRANSFER_OPERATIONS',
      source: './CollabAuthorityTransfer',
    },
    {
      declaration: 'export interface CollabAuthorityTransferOperationMap { readonly getProjectAuthorityTransfer: { readonly request: ExistingRequest; readonly response: ExistingResponse; }; }',
      exportName: 'CollabAuthorityTransferOperationMap',
      source: './CollabAuthorityTransfer',
    },
    {
      declaration: 'export declare const COLLAB_CONTROL_OPERATION_CODECS: Readonly<{ readonly getProjectAuthorityTransfer: ExistingCodec; }>;',
      exportName: 'COLLAB_CONTROL_OPERATION_CODECS',
      source: './CollabControlOperationCodecs',
    },
  ];
  const currentDeclarations = [
    {
      declaration: 'export declare const COLLAB_AUTHORITY_TRANSFER_OPERATIONS: readonly ["getProjectAuthorityTransfer", "getAuthorityTransferReceiptVerifier"];',
      exportName: 'COLLAB_AUTHORITY_TRANSFER_OPERATIONS',
      source: './CollabAuthorityTransfer',
    },
    {
      declaration: 'export interface CollabAuthorityTransferOperationMap { readonly getProjectAuthorityTransfer: { readonly request: ExistingRequest; readonly response: ExistingResponse; }; readonly getAuthorityTransferReceiptVerifier: { readonly request: VerifierRequest; readonly response: VerifierResponse; }; }',
      exportName: 'CollabAuthorityTransferOperationMap',
      source: './CollabAuthorityTransfer',
    },
    {
      declaration: 'export declare const COLLAB_CONTROL_OPERATION_CODECS: Readonly<{ readonly getProjectAuthorityTransfer: ExistingCodec; readonly getAuthorityTransferReceiptVerifier: VerifierCodec; }>;',
      exportName: 'COLLAB_CONTROL_OPERATION_CODECS',
      source: './CollabControlOperationCodecs',
    },
    {
      declaration: 'export interface VerifierResponse { readonly receiptPublicKey: string; }',
      exportName: 'VerifierResponse',
      source: './CollabAuthorityTransfer',
    },
  ];
  const baseRuntime = [
    {
      path: 'src/CollabAuthorityTransfer.ts',
      sha256: digestTypeScriptBehavior(baseAuthoritySource),
    },
    {
      path: 'src/CollabControlOperationCodecs.ts',
      sha256: digestTypeScriptBehavior(baseCodecsSource),
    },
  ];
  const currentRuntime = [
    {
      path: 'src/CollabAuthorityTransfer.ts',
      sha256: digestTypeScriptBehavior(currentAuthoritySource),
    },
    {
      path: 'src/CollabControlOperationCodecs.ts',
      sha256: digestTypeScriptBehavior(currentCodecsSource),
    },
  ];
  const baseWire = {
    declarations: baseDeclarations,
    operations: ['getProjectAuthorityTransfer'],
    runtimeBehaviorDigests: baseRuntime,
  };
  const currentWire = {
    declarations: currentDeclarations,
    operations: [
      'getAuthorityTransferReceiptVerifier',
      'getProjectAuthorityTransfer',
    ],
    runtimeBehaviorDigests: currentRuntime,
  };
  const base = snapshot({
    declarations: baseDeclarations,
    runtime: baseRuntime,
    wire: baseWire,
  });
  const current = snapshot({
    declarations: currentDeclarations,
    packageVersion: '1.1.0',
    runtime: currentRuntime,
    wire: currentWire,
  });

  const proof = proveCompatibleControlOperationAdditionSources({
    addedOperations: ['getAuthorityTransferReceiptVerifier'],
    baseAuthoritySource,
    baseCodecsSource,
    currentAuthoritySource,
    currentCodecsSource,
  });
  assert.ok(proof);
  assert.equal(classifyPackageApiChange(base, current, proof), 'minor');
  assert.throws(
    () => assertVersionedContractChange(base, current),
    /package major release|wire protocol version must increase/u,
  );
  assert.doesNotThrow(() => assertVersionedContractChange(base, current, proof));

  const breakingProof = proveCompatibleControlOperationAdditionSources({
    addedOperations: ['getAuthorityTransferReceiptVerifier'],
    baseAuthoritySource,
    baseCodecsSource,
    currentAuthoritySource: currentAuthoritySource.replace(
      'function decodeExisting(value) { return value; }',
      'function decodeExisting(value) { return { changed: value }; }',
    ),
    currentCodecsSource,
  });
  assert.equal(breakingProof, null);
  assert.throws(
    () => assertVersionedContractChange(base, current, breakingProof),
    /package major release|wire protocol version must increase/u,
  );

  const sideEffectProof = proveCompatibleControlOperationAdditionSources({
    addedOperations: ['getAuthorityTransferReceiptVerifier'],
    baseAuthoritySource,
    baseCodecsSource,
    currentAuthoritySource,
    currentCodecsSource: currentCodecsSource.replace(
      "codec('getAuthorityTransferReceiptVerifier')",
      "(globalThis.compromised = true, codec('getAuthorityTransferReceiptVerifier'))",
    ),
  });
  assert.equal(sideEffectProof, null);

  const sideEffectDispatchProof = proveCompatibleControlOperationAdditionSources({
    addedOperations: ['getAuthorityTransferReceiptVerifier'],
    baseAuthoritySource,
    baseCodecsSource,
    currentAuthoritySource: currentAuthoritySource.replace(
      "case 'getAuthorityTransferReceiptVerifier': return decodeVerifier(value);",
      "case 'getAuthorityTransferReceiptVerifier': globalThis.compromised = true; return decodeVerifier(value);",
    ),
    currentCodecsSource,
  });
  assert.equal(sideEffectDispatchProof, null);

  const missingDispatchProof = proveCompatibleControlOperationAdditionSources({
    addedOperations: ['getAuthorityTransferReceiptVerifier'],
    baseAuthoritySource,
    baseCodecsSource,
    currentAuthoritySource: currentAuthoritySource.replace(
      "case 'getAuthorityTransferReceiptVerifier': return decodeVerifier(value);",
      '',
    ),
    currentCodecsSource,
  });
  assert.equal(missingDispatchProof, null);

  const duplicateDispatchProof = proveCompatibleControlOperationAdditionSources({
    addedOperations: ['getAuthorityTransferReceiptVerifier'],
    baseAuthoritySource,
    baseCodecsSource,
    currentAuthoritySource: currentAuthoritySource.replace(
      "case 'getAuthorityTransferReceiptVerifier': return decodeVerifier(value);",
      "case 'getAuthorityTransferReceiptVerifier': return decodeVerifier(value); case 'getAuthorityTransferReceiptVerifier': return decodeVerifier(value);",
    ),
    currentCodecsSource,
  });
  assert.equal(duplicateDispatchProof, null);

  const changedExistingOperation = cloneJson(current);
  changedExistingOperation.contract.publicDeclarations[1].declaration =
    changedExistingOperation.contract.publicDeclarations[1].declaration
      .replace('readonly response: ExistingResponse', 'readonly response: ChangedResponse');
  changedExistingOperation.contract.wire.declarations[1].declaration =
    changedExistingOperation.contract.publicDeclarations[1].declaration;
  assert.throws(
    () => assertVersionedContractChange(base, changedExistingOperation),
    /package major release|wire protocol version must increase/u,
  );
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
