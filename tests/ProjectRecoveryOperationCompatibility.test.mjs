import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { assertVersionedOperationSourceAddition } from '../scripts/check-compatibility.mjs';

const recovery = 'src/operations/CollabProjectRecovery.ts';
const checkpoint = 'src/checkpoints/CollabProjectCheckpoint.ts';
const backup = 'src/checkpoints/CollabProjectBackupCheckpoint.ts';
const control = 'src/operations/CollabControlOperationCodecs.ts';
const protocol = 'src/operations/CollabProtocol.ts';
const cloud = 'src/cloud/CollabCloudBinding.ts';
const baseFiles = {
  [checkpoint]: `export type CollabCheckpointMemberRecord = RecordBase<'member', { readonly memberId: string; }>;
    function record(value: unknown, field: string) { return value; }
    function memberRecord(source, recordId, revision) { return { value: source.value, recordId, revision }; }
    export function validateCheckpointRecordSequence(records) { return Number.isSafeInteger(records.length); }`,
  [backup]: `const BACKUP_CONTINUITY_RECORD_KINDS = Object.freeze(['existing'] as const);
    export const COLLAB_PROJECT_BACKUP_RECORD_KINDS = BACKUP_CONTINUITY_RECORD_KINDS;
    export type CollabProjectBackupContinuityRecord = Existing;
    function decodeContinuityRecord(kind, source, recordId, revision) { switch (kind) { case 'existing': return source; default: throw new Error('invalid'); } }
    function validateContinuity(records) { const projectAuthorityGeneration = 1; const memberRecords = new Map(); return records; }
    export function validateCollabProjectBackupCheckpointConsistency(records) { return records.some(item => { if (item.kind === 'existing') { return false; } return true; }); }`,
  [protocol]: `interface ExistingMap { readonly old: unknown; }
    export interface CollabControlOperationMap extends ExistingMap { readonly existing: { readonly request: string; readonly response: string }; }`,
  [control]: `export const COLLAB_CONTROL_OPERATION_CODECS = Object.freeze({ existing: value => value });`,
  [cloud]: `export const COLLAB_CLOUD_BINDING_VERSION = 7 as const;
    export const COLLAB_CLOUD_CAPABILITIES = Object.freeze(['existing'] as const);
    export function collabCloudProjectOperationRoute() { return '/v7/projects'; }`,
  'src/core/CollabConstants.ts': 'export const COLLAB_PROTOCOL_VERSION = 11 as const;',
  'src/index.ts': `export { COLLAB_PROTOCOL_VERSION } from './core/CollabConstants';
    export { COLLAB_CLOUD_BINDING_VERSION, COLLAB_CLOUD_CAPABILITIES } from './cloud/CollabCloudBinding';
    export { COLLAB_PROJECT_BACKUP_RECORD_KINDS } from './checkpoints/CollabProjectBackupCheckpoint';`,
};
const currentFiles = {
  ...baseFiles,
  [recovery]: `export interface CollabProjectRecoveryOperationMap {
      readonly createProjectRecoveryLink: { readonly request: string; readonly response: string };
      readonly redeemProjectRecoveryLink: { readonly request: string; readonly response: string };
    }
    export const COLLAB_PROJECT_RECOVERY_OPERATIONS = Object.freeze(['createProjectRecoveryLink', 'redeemProjectRecoveryLink'] as const);
    export const COLLAB_PROJECT_RECOVERY_OPERATION_CODECS = Object.freeze({ createProjectRecoveryLink: value => value, redeemProjectRecoveryLink: value => value });`,
  [checkpoint]: baseFiles[checkpoint]
    .replace("{ readonly memberId", "{ readonly recoveryCredentialHashes?: readonly string[]; readonly memberId")
    .replace('function memberRecord(source, recordId, revision) {', `function memberRecord(source, recordId, revision) {
      if (Object.hasOwn(record(source.value, 'value'), 'recoveryCredentialHashes')) { return memberRecordWithRecovery(source, recordId, revision); }`)
    .replace('validateCheckpointRecordSequence(records) {', `validateCheckpointRecordSequence(records) {
      if (records.some(item => item.kind === 'member' && item.value.recoveryCredentialHashes !== undefined)) { validateRecoveryCredentialOwners(records); }`)
    + `function memberRecordWithRecovery(source, recordId, revision) { return source; }
      function validateRecoveryCredentialOwners(records) { return records; }`,
  [backup]: baseFiles[backup]
    .replace("['existing']", "['existing', 'project-recovery-link']")
    .replace('= Existing;', '= CollabProjectBackupRecoveryLinkRecord | Existing;')
    .replace('switch (kind) {', "switch (kind) { case 'project-recovery-link': return projectRecoveryLinkRecord(source, recordId, revision);")
    .replace('return records; }', "if (records.some(item => item.kind === 'project-recovery-link')) { validateRecoveryLinks(records, projectAuthorityGeneration, memberRecords); } return records; }")
    .replace("if (item.kind === 'existing')", "if (item.kind === 'project-recovery-link') { return false; } if (item.kind === 'existing')")
    + `export type CollabProjectBackupRecoveryLinkRecord = { readonly kind: 'project-recovery-link' };
      function projectRecoveryLinkRecord(source, recordId, revision): CollabProjectBackupRecoveryLinkRecord { return source; }
      function validateRecoveryLinks(records, projectAuthorityGeneration, memberRecords) { return records; }`,
  [protocol]: `import type { CollabProjectRecoveryOperationMap } from './CollabProjectRecovery';\n`
    + baseFiles[protocol].replace('extends ExistingMap', 'extends ExistingMap, CollabProjectRecoveryOperationMap'),
  [control]: `import { COLLAB_PROJECT_RECOVERY_OPERATION_CODECS } from './CollabProjectRecovery';\n`
    + baseFiles[control].replace('Object.freeze({', 'Object.freeze({ ...COLLAB_PROJECT_RECOVERY_OPERATION_CODECS,'),
  [cloud]: baseFiles[cloud].replace('= 7 as const', '= 8 as const').replace('/v7/', '/v8/')
    .replace("['existing']", "['existing', 'project-recovery']"),
  'src/core/CollabConstants.ts': 'export const COLLAB_PROTOCOL_VERSION = 12 as const;',
  'src/index.ts': baseFiles['src/index.ts'] + `
    export { COLLAB_PROJECT_RECOVERY_OPERATION_CODECS, COLLAB_PROJECT_RECOVERY_OPERATIONS } from './operations/CollabProjectRecovery';
    export type { CollabProjectBackupRecoveryLinkRecord } from './checkpoints/CollabProjectBackupCheckpoint';`,
};
const input = { baseFiles, currentFiles, addedOperations: ['createProjectRecoveryLink', 'redeemProjectRecoveryLink'],
  baseProtocolVersion: 11, currentProtocolVersion: 12, baseCloudBindingVersion: 7, currentCloudBindingVersion: 8 };

test('Project recovery proves composite addition while preserving old branches and declarations', () => {
  assert.doesNotThrow(() => assertVersionedOperationSourceAddition(input));
});
for (const [label, file, before, after] of [
  ['required member field', checkpoint, 'recoveryCredentialHashes?:', 'recoveryCredentialHashes:'],
  ['changed old field', checkpoint, 'memberId: string', 'memberId: number'],
  ['removed heritage', protocol, 'ExistingMap, ', ''],
  ['codec collision', recovery, 'createProjectRecoveryLink: value', 'existing: value'],
  ['changed old codec', control, 'existing: value => value', 'existing: value => null'],
  ['changed old switch', backup, "case 'existing': return source;", "case 'existing': return null;"],
  ['changed switch order', backup, "case 'existing': return source; default: throw new Error('invalid');", "default: throw new Error('invalid'); case 'existing': return source;"],
  ['fallthrough recovery case', backup, "case 'project-recovery-link': return projectRecoveryLinkRecord(source, recordId, revision);", "case 'project-recovery-link': projectRecoveryLinkRecord(source, recordId, revision);"],
  ['removed record kind', backup, "['existing', 'project-recovery-link']", "['project-recovery-link']"],
  ['duplicate record kind', backup, "'project-recovery-link']", "'project-recovery-link', 'project-recovery-link']"],
  ['removed capability', cloud, "['existing', 'project-recovery']", "['project-recovery']"],
  ['duplicate capability', cloud, "'project-recovery']", "'project-recovery', 'project-recovery']"],
  ['unrelated helper', recovery, 'export interface', 'function unrelated() {} export interface'],
  ['unrelated import', recovery, 'export interface', "import { unused } from './Unrelated'; export interface"],
  ['broadened guard', checkpoint, "Object.hasOwn(record(source.value, 'value'), 'recoveryCredentialHashes')", 'true'],
  ['guard else branch', checkpoint, 'return memberRecordWithRecovery(source, recordId, revision); }', 'return memberRecordWithRecovery(source, recordId, revision); } else { return null; }'],
  ['guard bypass', checkpoint, 'return memberRecordWithRecovery(source, recordId, revision);', 'return null;'],
  ['global reference capture', checkpoint, 'function validateRecoveryCredentialOwners(records) { return records; }', 'function validateRecoveryCredentialOwners(records) { return Number.isSafeInteger(1); } const Number = { isSafeInteger: () => true };'],
]) {
  test(`Project recovery rejects ${label}`, () => {
    const changed = currentFiles[file].replace(before, after);
    assert.notEqual(changed, currentFiles[file]);
    assert.throws(() => assertVersionedOperationSourceAddition({ ...input, currentFiles: { ...currentFiles, [file]: changed } }));
  });
}

test('Project recovery preserves existing declaration evaluation order', () => {
  assert.throws(() => assertVersionedOperationSourceAddition({ ...input,
    baseFiles: { ...baseFiles, [checkpoint]: baseFiles[checkpoint] + ' const first = 1; const second = first;' },
    currentFiles: { ...currentFiles, [checkpoint]: currentFiles[checkpoint] + ' const second = first; const first = 1;' },
  }));
});
test('Project recovery does not mistake optional property names for reachable module bindings', () => {
  assert.throws(() => assertVersionedOperationSourceAddition({ ...input,
    currentFiles: { ...currentFiles, [checkpoint]: currentFiles[checkpoint]
      + " const recoveryCredentialHashes = (() => { throw new Error('unrelated'); })();" },
  }));
});

test('Project recovery CLI records and rechecks exact evidence, source validation and wire coverage', t => {
  const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const root = mkdtempSync(path.join(os.tmpdir(), 'recovery-policy-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const put = (file, text) => { mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); writeFileSync(path.join(root, file), text); };
  put('scripts/.keep', '');
  copyFileSync(path.join(repository, 'scripts/check-compatibility.mjs'), path.join(root, 'scripts/check-compatibility.mjs'));
  symlinkSync(path.join(repository, 'node_modules'), path.join(root, 'node_modules'), 'dir');
  const install = (files, added) => {
    for (const [file, text] of Object.entries(files)) put(file, text);
    put('package.json', JSON.stringify({ version: added ? '4.5.0' : '4.4.1' }));
    put('dist/index.d.ts', `export declare const COLLAB_PROTOCOL_VERSION: ${added ? 12 : 11};\nexport declare const COLLAB_CLOUD_BINDING_VERSION: ${added ? 8 : 7};`);
    if (added) {
      put('dist/index.d.ts', readFileSync(path.join(root, 'dist/index.d.ts'), 'utf8')
        + "\nexport type { CollabProjectRecoveryOperationMap } from './operations/CollabProjectRecovery';");
      put('dist/operations/CollabProjectRecovery.d.ts', 'export interface CollabProjectRecoveryOperationMap { readonly createProjectRecoveryLink: unknown; readonly redeemProjectRecoveryLink: unknown; }');
    }
    put('dist/index.js', `module.exports = {
      COLLAB_PROTOCOL_VERSION: ${added ? 12 : 11}, COLLAB_CLOUD_BINDING_VERSION: ${added ? 8 : 7},
      COLLAB_PROJECT_CHECKPOINT_ARTIFACTS: [], COLLAB_CLOUD_CAPABILITIES: ['existing'${added ? ", 'project-recovery'" : ''}],
      COLLAB_CLOUD_EVENT_KINDS: [], COLLAB_CLOUD_JSON_OPERATIONS: ['existing'${added ? ", 'createProjectRecoveryLink', 'redeemProjectRecoveryLink'" : ''}],
      COLLAB_CLOUD_BINDING_LIMITS: {}, COLLAB_LIMITS: {}, COLLAB_ERROR_CODES: [],
      COLLAB_MAIN_REF: 'refs/heads/main', COLLAB_MEMBER_REF_PREFIX: 'refs/heads/members/',
      COLLAB_CONTROL_OPERATION_CODECS: { existing: {}${added ? ', createProjectRecoveryLink: {}, redeemProjectRecoveryLink: {}' : ''} }
    };`);
  };
  const command = (...args) => spawnSync(process.execPath, ['scripts/check-compatibility.mjs', ...args], { cwd: root, encoding: 'utf8' });
  const git = (...args) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgSign=false',
    '-c', 'user.name=Protocol test', '-c', 'user.email=protocol-test@example.invalid', ...args], { cwd: root, encoding: 'utf8' }).trim();
  install(baseFiles, false);
  assert.equal(command('--write').status, 0);
  git('init', '--quiet'); git('add', 'src', 'dist', 'package.json', 'contract-snapshot.json');
  git('commit', '--quiet', '-m', 'test: base');
  const base = git('rev-parse', 'HEAD');
  install(currentFiles, true);
  assert.equal(command('--write').status, 0);
  const record = () => command('--base', base, '--record-versioned-operation-addition-review', 'Composite recovery codec and source-preservation tests.');
  let result = record(); assert.equal(result.status, 0, result.stderr);
  result = command('--base', base); assert.equal(result.status, 0, result.stderr);
  const snapshot = JSON.parse(readFileSync(path.join(root, 'contract-snapshot.json'), 'utf8'));
  assert.ok(snapshot.contract.wire.runtimeBehaviorDigests.some(entry => entry.path === recovery));
  assert.ok(snapshot.contract.wire.runtimeBehaviorDigests.some(entry => entry.path === backup));
  put(checkpoint, currentFiles[checkpoint].replace('memberId: string', 'memberId: number'));
  assert.equal(command('--write').status, 0);
  assert.notEqual(command('--base', base).status, 0);
  assert.notEqual(record().status, 0);
  install(currentFiles, true);
  for (const [field, value] of [['COLLAB_PROTOCOL_VERSION', 11], ['COLLAB_CLOUD_BINDING_VERSION', 7]]) {
    const runtime = readFileSync(path.join(root, 'dist/index.js'), 'utf8');
    put('dist/index.js', runtime.replace(new RegExp(`${field}: \\d+`, 'u'), `${field}: ${value}`));
    assert.equal(command('--write').status, 0);
    assert.notEqual(record().status, 0);
    install(currentFiles, true);
  }
});
