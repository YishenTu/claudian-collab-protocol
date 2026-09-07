import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import * as compatibility from '../scripts/check-compatibility.mjs';

const baseFiles = {
  'src/operations/CollabProtocol.ts': `export interface ExistingRequest { readonly revision: number; }
    export interface CollabControlOperationMap { readonly existing: { readonly request: ExistingRequest; readonly response: ExistingRequest }; }`,
  'src/operations/CollabRequestTicketRequestCodecs.ts': `import type { ExistingRequest } from './CollabProtocol';
    export type CollabRequestTicketOperation = 'existing';
    function isRevision(value: unknown): boolean { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1; }
    function decodeExisting(input: unknown): ExistingRequest | null { if (!isRevision((input as ExistingRequest).revision)) return null; return input as ExistingRequest; }
    function decodeRequestTicketRequest(operation: string, input: unknown) { switch (operation) { case 'closeTicket': case 'reopenTicket': case 'existing': return decodeExisting(input); default: return null; } }
    const INVALID_REASONS = { existing: 'existing-invalid' } as const;`,
  'src/operations/CollabRequestTicketResponseCodecs.ts': `import type { ExistingRequest } from './CollabProtocol';
    export function decodeExistingResponse(input: unknown): ExistingRequest { return input as ExistingRequest; }`,
  'src/operations/CollabControlOperationCodecs.ts': `import { decodeExistingResponse } from './CollabRequestTicketResponseCodecs';
    function decodeResponse(operation: string, input: unknown) { switch (operation) { case 'closeTicket': case 'reopenTicket': case 'existing': return decodeExistingResponse(input); default: return null; } }
    const codec = (operation: string) => operation;
    export const COLLAB_CONTROL_OPERATION_CODECS = Object.freeze({ existing: codec('existing') });`,
  'src/core/CollabConstants.ts': 'export const COLLAB_PROTOCOL_VERSION = 4 as const;',
  'src/cloud/CollabCloudBinding.ts': `export const COLLAB_CLOUD_BINDING_VERSION = 1 as const;
    export function collabCloudProjectOperationRoute() { return '/v1/projects'; }`,
  'src/index.ts': "export type { ExistingRequest, CollabControlOperationMap } from './operations/CollabProtocol';",
};
const currentFiles = {
  ...baseFiles,
  'src/operations/CollabProtocol.ts': `${baseFiles['src/operations/CollabProtocol.ts'].replace('readonly existing:', 'readonly resolveTicketNumber: { readonly request: ResolveTicketNumberRequest; readonly response: ResolveTicketNumberResponse }; readonly existing:')}
    export interface ResolveTicketNumberRequest { readonly ticketNumber: number; }
    export interface ResolveTicketNumberResponse { readonly ticketId: string | null; }`,
  'src/operations/CollabRequestTicketRequestCodecs.ts': `${baseFiles['src/operations/CollabRequestTicketRequestCodecs.ts']
    .replace('{ ExistingRequest }', '{ ExistingRequest, ResolveTicketNumberRequest }')
    .replace("= 'existing';", "= 'existing' | 'resolveTicketNumber';")
    .replace("switch (operation) {", "switch (operation) { case 'resolveTicketNumber': return decodeResolveTicketNumber(input);")
    .replace("{ existing: 'existing-invalid' }", "{ existing: 'existing-invalid', resolveTicketNumber: 'ticket-number-query-invalid' }")}
    export function decodeResolveTicketNumber(input: unknown): ResolveTicketNumberRequest { return input as ResolveTicketNumberRequest; }`,
  'src/operations/CollabRequestTicketResponseCodecs.ts': `${baseFiles['src/operations/CollabRequestTicketResponseCodecs.ts'].replace('{ ExistingRequest }', '{ ExistingRequest, ResolveTicketNumberResponse }')}
    export function decodeResolveTicketNumberResponse(input: unknown): ResolveTicketNumberResponse { return input as ResolveTicketNumberResponse; }`,
  'src/operations/CollabControlOperationCodecs.ts': baseFiles['src/operations/CollabControlOperationCodecs.ts']
    .replace('{ decodeExistingResponse }', '{ decodeExistingResponse, decodeResolveTicketNumberResponse }')
    .replace("switch (operation) {", "switch (operation) { case 'resolveTicketNumber': return decodeResolveTicketNumberResponse(input);")
    .replace("{ existing: codec('existing') }", "{ existing: codec('existing'), resolveTicketNumber: codec('resolveTicketNumber') }"),
  'src/core/CollabConstants.ts': 'export const COLLAB_PROTOCOL_VERSION = 5 as const;',
  'src/cloud/CollabCloudBinding.ts': baseFiles['src/cloud/CollabCloudBinding.ts'].replace('= 1 as const', '= 2 as const').replace('/v1/', '/v2/'),
  'src/index.ts': `${baseFiles['src/index.ts'].replace('ExistingRequest,', 'ExistingRequest, ResolveTicketNumberRequest, ResolveTicketNumberResponse,')}
    export { decodeResolveTicketNumber } from './operations/CollabRequestTicketRequestCodecs';
    export { decodeResolveTicketNumberResponse } from './operations/CollabRequestTicketResponseCodecs';`,
};
const input = {
  addedOperations: ['resolveTicketNumber'], baseFiles, currentFiles,
  baseProtocolVersion: 4, currentProtocolVersion: 5,
  baseCloudBindingVersion: 1, currentCloudBindingVersion: 2,
};
test('Request/Ticket addition proves DTOs, both decoders and reachable import/export additions', () => {
  assert.doesNotThrow(() => compatibility.assertRequestTicketOperationSourceAddition(input));
});
const mutations = [
  ['existing request behavior', 'src/operations/CollabRequestTicketRequestCodecs.ts', 'return input as ExistingRequest;', 'return null;'],
  ['existing response behavior', 'src/operations/CollabRequestTicketResponseCodecs.ts', 'return input as ExistingRequest;', 'return null;'],
  ['existing reason', 'src/operations/CollabRequestTicketRequestCodecs.ts', "existing: 'existing-invalid'", "existing: 'changed-invalid'"],
  ['duplicate union', 'src/operations/CollabRequestTicketRequestCodecs.ts', "= 'existing' |", "= 'existing' | 'existing' |"],
  ['changed union header', 'src/operations/CollabRequestTicketRequestCodecs.ts', 'type CollabRequestTicketOperation =', 'type CollabRequestTicketOperation<T> ='],
  ['changed map member', 'src/operations/CollabProtocol.ts', 'readonly request: ExistingRequest;', 'readonly request: never;'],
  ['new map heritage', 'src/operations/CollabProtocol.ts', 'interface CollabControlOperationMap {', 'interface CollabControlOperationMap extends Other {'],
  ['changed import identity', 'src/operations/CollabRequestTicketRequestCodecs.ts', '{ ExistingRequest,', '{ Changed as ExistingRequest,'],
  ['new unused import', 'src/operations/CollabRequestTicketRequestCodecs.ts', '{ ExistingRequest,', '{ Unused, ExistingRequest,'],
  ['new module access', 'src/operations/CollabRequestTicketRequestCodecs.ts', 'export function decodeResolveTicketNumber', "import { external } from './Unrelated'; export function decodeResolveTicketNumber"],
  ['unreachable declaration', 'src/operations/CollabProtocol.ts', 'export interface ResolveTicketNumberRequest', 'interface Unrelated {} export interface ResolveTicketNumberRequest'],
  ['response bypass', 'src/operations/CollabControlOperationCodecs.ts', 'return decodeResolveTicketNumberResponse(input);', 'return input;'],
  ['request bypass', 'src/operations/CollabRequestTicketRequestCodecs.ts', 'return decodeResolveTicketNumber(input);', 'return input;'],
  ['export alias', 'src/index.ts', '{ decodeResolveTicketNumber }', '{ decodeResolveTicketNumber as other }'],
  ['unreachable export', 'src/index.ts', '{ decodeResolveTicketNumber }', '{ decodeResolveTicketNumber, hidden }'],
  ['side effect import', 'src/operations/CollabRequestTicketRequestCodecs.ts', 'export function decodeResolveTicketNumber', "import './CollabProtocol'; export function decodeResolveTicketNumber"],
  ['import shadowing', 'src/operations/CollabRequestTicketRequestCodecs.ts', 'decodeResolveTicketNumber(input: unknown): ResolveTicketNumberRequest', 'decodeResolveTicketNumber<ResolveTicketNumberRequest>(input: unknown): ResolveTicketNumberRequest'],
];
for (const [label, pathname, before, after] of mutations) {
  test(`Request/Ticket addition rejects ${label}`, () => {
    const changed = { ...currentFiles, [pathname]: currentFiles[pathname].replace(before, after) };
    assert.notEqual(changed[pathname], currentFiles[pathname]);
    assert.throws(() => compatibility.assertRequestTicketOperationSourceAddition({ ...input, currentFiles: changed }));
  });
}

for (const [pathname, decoder] of [
  ['src/operations/CollabRequestTicketRequestCodecs.ts', 'decodeResolveTicketNumber'],
  ['src/operations/CollabControlOperationCodecs.ts', 'decodeResolveTicketNumberResponse'],
]) {
  const addedCase = `case 'resolveTicketNumber': return ${decoder}(input);`;
  for (const [label, mutate] of [
    ['fallthrough insertion', source => source.replace(addedCase, '').replace("case 'reopenTicket':", `${addedCase} case 'reopenTicket':`)],
    ['existing case reorder', source => source.replace("case 'closeTicket': case 'reopenTicket':", "case 'reopenTicket': case 'closeTicket':")],
    ['default relocation', source => source.replace('default: return null;', '').replace("case 'closeTicket':", "default: return null; case 'closeTicket':")],
    ['case after default', source => source.replace(addedCase, '').replace('default: return null;', `default: return null; ${addedCase}`)],
  ]) {
    test(`Request/Ticket ${decoder} rejects ${label}`, () => {
      assert.throws(() => compatibility.assertRequestTicketOperationSourceAddition({
        ...input, currentFiles: { ...currentFiles, [pathname]: mutate(currentFiles[pathname]) },
      }));
    });
  }
  for (const nested of [false, true]) {
    test(`Request/Ticket ${decoder} rejects adding cases to ${nested ? 'a nested' : 'another'} switch`, () => {
      const extraSwitch = "switch (input) { case 'nested': break; }";
      const placeSwitch = source => nested
        ? source.replace("case 'existing':", `case 'existing': ${extraSwitch}`)
        : source.replace('switch (operation)', `${extraSwitch} switch (operation)`);
      const before = placeSwitch(baseFiles[pathname]);
      const after = placeSwitch(currentFiles[pathname].replace(addedCase, ''))
        .replace("case 'nested':", `${addedCase} case 'nested':`);
      assert.throws(() => compatibility.assertRequestTicketOperationSourceAddition({
        ...input, baseFiles: { ...baseFiles, [pathname]: before }, currentFiles: { ...currentFiles, [pathname]: after },
      }));
    });
  }
}

test('Request/Ticket rejects operation-reachable declarations that capture existing global references', () => {
  const pathname = 'src/operations/CollabRequestTicketRequestCodecs.ts';
  const shadowed = currentFiles[pathname].replace('return input as ResolveTicketNumberRequest;',
    'if (!Number.isSafeInteger(1)) return null; return input as ResolveTicketNumberRequest;')
    + " const Number = { isSafeInteger: (value: unknown): boolean => typeof value === 'number' };";
  assert.throws(() => compatibility.assertRequestTicketOperationSourceAddition({
    ...input, currentFiles: { ...currentFiles, [pathname]: shadowed },
  }), /existing reference/u);
});

test('Request/Ticket preserves local bindings with the same spelling as a new declaration', () => {
  const pathname = 'src/operations/CollabRequestTicketRequestCodecs.ts';
  const localBinding = "function isRevision(value: unknown): boolean { const Number = { isSafeInteger: (candidate: unknown) => typeof candidate === 'number' };";
  const base = baseFiles[pathname].replace('function isRevision(value: unknown): boolean {', localBinding);
  const candidate = currentFiles[pathname].replace('function isRevision(value: unknown): boolean {', localBinding)
    .replace('return input as ResolveTicketNumberRequest;',
      'if (!Number.isSafeInteger(1)) return null; return input as ResolveTicketNumberRequest;')
    + " const Number = { isSafeInteger: (value: unknown): boolean => typeof value === 'number' };";
  assert.doesNotThrow(() => compatibility.assertRequestTicketOperationSourceAddition({
    ...input, baseFiles: { ...baseFiles, [pathname]: base }, currentFiles: { ...currentFiles, [pathname]: candidate },
  }));
});

test('Request/Ticket rejects new imports that capture existing unresolved references', () => {
  const pathname = 'src/operations/CollabRequestTicketRequestCodecs.ts';
  const shadowed = currentFiles[pathname].replace('{ ExistingRequest,', '{ Number, ExistingRequest,')
    .replace('return input as ResolveTicketNumberRequest;',
      'if (!Number.isSafeInteger(1)) return null; return input as ResolveTicketNumberRequest;');
  assert.throws(() => compatibility.assertRequestTicketOperationSourceAddition({
    ...input, currentFiles: { ...currentFiles, [pathname]: shadowed },
  }), /existing reference/u);
});

test('source family dispatcher accepts Request/Ticket additions and rejects unrelated modules', () => {
  assert.doesNotThrow(() => compatibility.assertVersionedOperationSourceAddition(input));
  assert.throws(() => compatibility.assertVersionedOperationSourceAddition({
    ...input,
    baseFiles: { ...baseFiles, 'src/Unrelated.ts': 'export const unrelated = 1;' },
    currentFiles: { ...currentFiles, 'src/Unrelated.ts': 'export const unrelated = 2;' },
  }), /unrelated source/u);
  assert.throws(() => compatibility.assertVersionedOperationSourceAddition({
    ...input,
    currentFiles: { ...currentFiles, 'src/Unrelated.ts': 'export const unrelated = 1;' },
  }), /add or remove source/u);
});

test('source family dispatcher rejects mixed authority-transfer and Request/Ticket additions', () => {
  assert.throws(() => compatibility.assertVersionedOperationSourceAddition({
    ...input,
    baseFiles: { ...baseFiles, 'src/operations/CollabAuthorityTransfer.ts': 'export interface CollabAuthorityTransferOperationMap {}' },
    currentFiles: { ...currentFiles, 'src/operations/CollabAuthorityTransfer.ts': 'export interface CollabAuthorityTransferOperationMap { readonly resolveTicketNumber: {}; }' },
  }), /one supported operation family/u);
});


test('Request/Ticket CLI records exact review and rejects regenerated existing decoder drift', t => {
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const root = mkdtempSync(path.join(os.tmpdir(), 'collab-ticket-command-'));
  t.after(() => rmSync(root, { force: true, recursive: true }));
  for (const directory of ['scripts', 'src', 'dist']) mkdirSync(path.join(root, directory));
  copyFileSync(path.join(repositoryRoot, 'scripts/check-compatibility.mjs'), path.join(root, 'scripts/check-compatibility.mjs'));
  symlinkSync(path.join(repositoryRoot, 'node_modules'), path.join(root, 'node_modules'), 'dir');
  const put = (file, value) => {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), value);
  };
  const commonExports = `
export { COLLAB_PROTOCOL_VERSION } from './core/CollabConstants';
export { COLLAB_CLOUD_BINDING_VERSION } from './cloud/CollabCloudBinding';
export { COLLAB_CONTROL_OPERATION_CODECS } from './operations/CollabControlOperationCodecs';
export type { CollabRequestTicketOperation } from './operations/CollabRequestTicketRequestCodecs';`;
  const install = (files, added) => {
    for (const [pathname, source] of Object.entries(files)) put(pathname, source + (pathname === 'src/index.ts' ? commonExports : ''));
    put('package.json', JSON.stringify({ version: added ? '1.1.0' : '1.0.0' }));
    execFileSync(process.execPath, [path.join(repositoryRoot, 'node_modules/typescript/bin/tsc'),
      '--declaration', '--emitDeclarationOnly', '--skipLibCheck', '--target', 'esnext',
      '--module', 'commonjs', '--outDir', 'dist', 'src/index.ts'], { cwd: root, stdio: 'pipe', encoding: 'utf8' });
    put('dist/index.js', `module.exports = {
COLLAB_CLOUD_BINDING_VERSION: ${added ? 2 : 1}, COLLAB_PROTOCOL_VERSION: ${added ? 5 : 4},
COLLAB_PROJECT_CHECKPOINT_ARTIFACTS: [], COLLAB_CLOUD_CAPABILITIES: [],
COLLAB_CLOUD_EVENT_KINDS: [], COLLAB_CLOUD_JSON_OPERATIONS: ['existing'${added ? ", 'resolveTicketNumber'" : ''}],
COLLAB_CLOUD_BINDING_LIMITS: {}, COLLAB_LIMITS: {}, COLLAB_ERROR_CODES: [],
COLLAB_MAIN_REF: 'refs/heads/main', COLLAB_MEMBER_REF_PREFIX: 'refs/heads/members/',
COLLAB_CONTROL_OPERATION_CODECS: {existing: {}${added ? ', resolveTicketNumber: {}' : ''}}
${added ? ', decodeResolveTicketNumber: value => value, decodeResolveTicketNumberResponse: value => value' : ''} };`);
  };
  const command = (...args) => spawnSync(process.execPath, ['scripts/check-compatibility.mjs', ...args], { cwd: root, encoding: 'utf8' });
  const git = (...args) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgSign=false',
    '-c', 'user.name=Protocol test', '-c', 'user.email=protocol-test@example.invalid', ...args], { cwd: root, encoding: 'utf8' }).trim();
  install(baseFiles, false);
  const baseWrite = command('--write');
  assert.equal(baseWrite.status, 0, baseWrite.stderr);
  git('init', '--quiet');
  git('add', 'package.json', 'src', 'dist', 'contract-snapshot.json');
  git('commit', '--quiet', '-m', 'test: record Request/Ticket contract base');
  const base = git('rev-parse', 'HEAD');
  install(currentFiles, true);
  assert.equal(command('--write').status, 0);
  const record = () => command('--base', base, '--record-versioned-operation-addition-review',
    'Public request and response codec tests establish additive ticket-number resolution with existing behavior preserved.');
  const accepted = record();
  assert.equal(accepted.status, 0, accepted.stderr);
  const verified = command('--base', base);
  assert.equal(verified.status, 0, verified.stderr);
  const review = JSON.parse(readFileSync(path.join(root, 'compatibility-review.json'), 'utf8'));
  assert.deepEqual(review.addedOperations, ['resolveTicketNumber']);
  const requestPath = 'src/operations/CollabRequestTicketRequestCodecs.ts';
  put(requestPath, currentFiles[requestPath].replace('return input as ResolveTicketNumberRequest;',
    'if (!Number.isSafeInteger(1)) return null; return input as ResolveTicketNumberRequest;')
    + " const Number = { isSafeInteger: (value: unknown): boolean => typeof value === 'number' };");
  assert.equal(command('--write').status, 0);
  const capturedGlobal = record();
  assert.notEqual(capturedGlobal.status, 0);
  assert.match(capturedGlobal.stderr, /existing reference/u);
  put(requestPath, currentFiles[requestPath]);
  for (const [pathname, decoder] of [
    [requestPath, 'decodeResolveTicketNumber'],
    ['src/operations/CollabControlOperationCodecs.ts', 'decodeResolveTicketNumberResponse'],
  ]) {
    const inserted = currentFiles[pathname].replace(`case 'resolveTicketNumber': return ${decoder}(input);`, '')
      .replace("case 'reopenTicket':", `case 'resolveTicketNumber': return ${decoder}(input); case 'reopenTicket':`);
    put(pathname, inserted);
    assert.equal(command('--write').status, 0);
    const fallthrough = record();
    assert.notEqual(fallthrough.status, 0);
    assert.match(fallthrough.stderr, /dispatch/u);
    put(pathname, currentFiles[pathname]);
  }
  const responsePath = 'src/operations/CollabRequestTicketResponseCodecs.ts';
  put(responsePath, currentFiles[responsePath].replace('return input as ExistingRequest;', 'return null;'));
  assert.equal(command('--write').status, 0);
  const stale = command('--base', base);
  assert.notEqual(stale.status, 0);
  const regenerated = record();
  assert.notEqual(regenerated.status, 0);
  assert.match(regenerated.stderr, /existing source declaration/u);
});
