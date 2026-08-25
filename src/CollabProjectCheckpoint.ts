import { COLLAB_MAIN_REF, COLLAB_MEMBER_REF_PREFIX } from './CollabConstants';
import { CollabError } from './CollabError';
import {
  hasUtf8ByteLengthAtMost,
  isCollabGitOid,
  isCollabMemberId,
  isCollabOpaqueId,
  isCollabProjectId,
} from './CollabValidation';
import type {
  CollabGitOid,
  CollabIsoTimestamp,
  CollabMemberId,
  CollabProjectId,
} from './types';

export const COLLAB_PROJECT_CHECKPOINT_MANIFEST_SCHEMA_VERSION = 1 as const;
export const COLLAB_PROJECT_COORDINATION_FORMAT_VERSION = 1 as const;

export const COLLAB_CHECKPOINT_PROFILES = Object.freeze([
  'authority-transfer',
  'backup',
  'export',
] as const);

export const COLLAB_PROJECT_CHECKPOINT_ARTIFACTS = Object.freeze([
  'checkpoint.json',
  'coordination.ndjson',
  'repository.bundle',
] as const);

export const COLLAB_CHECKPOINT_ARTIFACT_LIMITS = Object.freeze({
  maxCoordinationBytes: 256 * 1024 * 1024,
  maxManifestBytes: 64 * 1024,
  maxRepositoryBundleBytes: 1024 * 1024 * 1024,
  maxStagingBytes: 2 * 1024 * 1024 * 1024,
} as const);

export const COLLAB_CHECKPOINT_PORTABLE_RECORD_KINDS = Object.freeze([
  'project',
  'member',
  'request',
  'request-comment',
  'ticket',
  'ticket-comment',
  'ticket-relation',
  'ticket-mention',
] as const);

export const COLLAB_CHECKPOINT_BACKUP_RECORD_KINDS = Object.freeze([
  ...COLLAB_CHECKPOINT_PORTABLE_RECORD_KINDS,
  'protected-claim-envelope',
] as const);

export type CollabCheckpointProfile = typeof COLLAB_CHECKPOINT_PROFILES[number];
export type CollabCheckpointAuthorityKind = 'cloud' | 'lan';
export type CollabCheckpointObjectFormat = 'sha1' | 'sha256';
export type CollabCheckpointPortableRecordKind =
  typeof COLLAB_CHECKPOINT_PORTABLE_RECORD_KINDS[number];
export type CollabCheckpointBackupRecordKind =
  typeof COLLAB_CHECKPOINT_BACKUP_RECORD_KINDS[number];

export interface CollabCheckpointAuthority {
  readonly generation: number;
  readonly kind: CollabCheckpointAuthorityKind;
}

export interface CollabCheckpointArtifactFact {
  readonly byteCount: number;
  readonly name: 'coordination.ndjson' | 'repository.bundle';
  readonly sha256: string;
}

export interface CollabCheckpointGitRef {
  readonly name: string;
  readonly oid: CollabGitOid;
}

export interface CollabProjectCheckpointManifest {
  readonly artifacts: readonly CollabCheckpointArtifactFact[];
  readonly coordinationFormatVersion: typeof COLLAB_PROJECT_COORDINATION_FORMAT_VERSION;
  readonly createdAt: CollabIsoTimestamp;
  readonly expectedMainOid: CollabGitOid;
  readonly gitObjectFormat: CollabCheckpointObjectFormat;
  readonly manifestSchemaVersion: typeof COLLAB_PROJECT_CHECKPOINT_MANIFEST_SCHEMA_VERSION;
  readonly manifestSha256: string;
  readonly operationId: string;
  readonly profile: CollabCheckpointProfile;
  readonly projectId: CollabProjectId;
  readonly protocolVersion: 5;
  readonly refs: readonly CollabCheckpointGitRef[];
  readonly sourceAuthority: CollabCheckpointAuthority;
  readonly targetAuthority: CollabCheckpointAuthority | null;
}

interface CollabCheckpointRecordBase<Kind extends string, Value> {
  readonly kind: Kind;
  readonly recordId: string;
  readonly revision: number;
  readonly value: Value;
}

export type CollabCheckpointProjectRecord = CollabCheckpointRecordBase<'project', {
  readonly authorityGeneration: number;
  readonly createdAt: CollabIsoTimestamp;
  readonly managerSetGeneration: number;
  readonly name: string;
  readonly projectId: CollabProjectId;
}>;

export type CollabCheckpointMemberRecord = CollabCheckpointRecordBase<'member', {
  readonly activatedAt: CollabIsoTimestamp | null;
  readonly createdAt: CollabIsoTimestamp;
  readonly displayName: string;
  readonly memberId: CollabMemberId;
  readonly personalRef: string;
  readonly role: 'manager' | 'member';
  readonly status: 'active' | 'left' | 'retired';
}>;

export type CollabCheckpointRequestRecord = CollabCheckpointRecordBase<'request', {
  readonly baseOid: CollabGitOid;
  readonly createdAt: CollabIsoTimestamp;
  readonly description: string;
  readonly headOid: CollabGitOid;
  readonly memberId: CollabMemberId;
  readonly requestId: string;
  readonly status: 'accepted' | 'closed' | 'open';
  readonly updatedAt: CollabIsoTimestamp;
}>;

export type CollabCheckpointRequestCommentRecord = CollabCheckpointRecordBase<'request-comment', {
  readonly authorMemberId: CollabMemberId;
  readonly body: string;
  readonly commentId: string;
  readonly createdAt: CollabIsoTimestamp;
  readonly requestId: string;
}>;

export type CollabCheckpointTicketRecord = CollabCheckpointRecordBase<'ticket', {
  readonly authorMemberId: CollabMemberId;
  readonly body: string;
  readonly createdAt: CollabIsoTimestamp;
  readonly number: number;
  readonly status: 'closed' | 'open';
  readonly ticketId: string;
  readonly title: string;
  readonly updatedAt: CollabIsoTimestamp;
}>;

export type CollabCheckpointTicketCommentRecord = CollabCheckpointRecordBase<'ticket-comment', {
  readonly authorMemberId: CollabMemberId;
  readonly body: string;
  readonly commentId: string;
  readonly createdAt: CollabIsoTimestamp;
  readonly ticketId: string;
}>;

export type CollabCheckpointTicketRelationRecord = CollabCheckpointRecordBase<'ticket-relation', {
  readonly createdAt: CollabIsoTimestamp;
  readonly relationKind: 'accepted' | 'resolving';
  readonly requestId: string;
  readonly ticketId: string;
}>;

export type CollabCheckpointTicketMentionRecord = CollabCheckpointRecordBase<'ticket-mention', {
  readonly createdAt: CollabIsoTimestamp;
  readonly sourceId: string;
  readonly sourceKind: 'request-comment' | 'request-description';
  readonly ticketId: string;
}>;

export interface CollabProtectedClaimAssociatedData {
  readonly authorityGeneration: number;
  readonly checkpointSha256: string;
  readonly memberId: CollabMemberId;
  readonly projectId: CollabProjectId;
  readonly transferId: string;
}

export type CollabCheckpointProtectedClaimEnvelopeRecord =
  CollabCheckpointRecordBase<'protected-claim-envelope', {
    readonly associatedData: CollabProtectedClaimAssociatedData;
    readonly associatedDataSha256: string;
    readonly ciphertext: string;
    readonly encryptionAlgorithm: 'xchacha20-poly1305';
    readonly expiresAt: CollabIsoTimestamp;
    readonly keyId: string;
    readonly keyVersion: number;
    readonly memberId: CollabMemberId;
    readonly nonce: string;
    readonly receiptKeyId: string;
    readonly tag: string;
    readonly transferId: string;
  }>;

export type CollabCheckpointPortableRecord =
  | CollabCheckpointProjectRecord
  | CollabCheckpointMemberRecord
  | CollabCheckpointRequestRecord
  | CollabCheckpointRequestCommentRecord
  | CollabCheckpointTicketRecord
  | CollabCheckpointTicketCommentRecord
  | CollabCheckpointTicketRelationRecord
  | CollabCheckpointTicketMentionRecord;

export type CollabCheckpointBackupRecord =
  | CollabCheckpointPortableRecord
  | CollabCheckpointProtectedClaimEnvelopeRecord;

type UnknownRecord = Readonly<Record<string, unknown>>;

const CHECKPOINT_PROFILE_SET: ReadonlySet<string> = new Set(COLLAB_CHECKPOINT_PROFILES);
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/u;

function invalidPayload(field: string): CollabError {
  return new CollabError({ code: 'protocol-payload-invalid', safeContext: { field } });
}

function record(value: unknown, field: string): UnknownRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw invalidPayload(field);
  }
  return value as UnknownRecord;
}

function exactRecord(value: unknown, field: string, keys: readonly string[]): UnknownRecord {
  const source = record(value, field);
  const expected = new Set(keys);
  if (
    !keys.every(key => Object.hasOwn(source, key))
    || Object.keys(source).some(key => !expected.has(key))
  ) throw invalidPayload(field);
  return source;
}

function token(
  source: UnknownRecord,
  field: string,
  validate: (value: unknown) => boolean = isCollabOpaqueId,
): string {
  const value = source[field];
  if (typeof value !== 'string' || !validate(value)) throw invalidPayload(field);
  return value;
}

function boundedString(
  source: UnknownRecord,
  field: string,
  maximumBytes: number,
  allowEmpty = false,
): string {
  const value = source[field];
  if (
    typeof value !== 'string'
    || (!allowEmpty && value.length === 0)
    || !hasUtf8ByteLengthAtMost(value, maximumBytes)
  ) throw invalidPayload(field);
  return value;
}

function positiveInteger(source: UnknownRecord, field: string, maximum?: number): number {
  const value = source[field];
  if (
    typeof value !== 'number'
    || !Number.isSafeInteger(value)
    || value < 1
    || (maximum !== undefined && value > maximum)
  ) throw invalidPayload(field);
  return value;
}

function timestampValue(value: unknown, field: string): CollabIsoTimestamp {
  if (
    typeof value !== 'string'
    || value.length > 64
    || Number.isNaN(Date.parse(value))
    || new Date(value).toISOString() !== value
  ) throw invalidPayload(field);
  return value;
}

function timestamp(source: UnknownRecord, field: string): CollabIsoTimestamp {
  return timestampValue(source[field], field);
}

function nullableTimestamp(source: UnknownRecord, field: string): CollabIsoTimestamp | null {
  return source[field] === null ? null : timestampValue(source[field], field);
}

function sha256(source: UnknownRecord, field: string): string {
  const value = source[field];
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) throw invalidPayload(field);
  return value;
}

function literal<T extends string>(
  source: UnknownRecord,
  field: string,
  values: readonly T[],
): T {
  const value = source[field];
  if (typeof value !== 'string' || !values.includes(value as T)) throw invalidPayload(field);
  return value as T;
}

function authority(value: unknown, field: string): CollabCheckpointAuthority {
  const source = exactRecord(value, field, ['generation', 'kind']);
  return {
    generation: positiveInteger(source, 'generation'),
    kind: literal(source, 'kind', ['cloud', 'lan']),
  };
}

function artifact(value: unknown): CollabCheckpointArtifactFact {
  const source = exactRecord(value, 'artifact', ['byteCount', 'name', 'sha256']);
  const name = literal(source, 'name', ['coordination.ndjson', 'repository.bundle']);
  const maximum = name === 'coordination.ndjson'
    ? COLLAB_CHECKPOINT_ARTIFACT_LIMITS.maxCoordinationBytes
    : COLLAB_CHECKPOINT_ARTIFACT_LIMITS.maxRepositoryBundleBytes;
  return {
    byteCount: positiveInteger(source, 'byteCount', maximum),
    name,
    sha256: sha256(source, 'sha256'),
  };
}

function artifacts(value: unknown): readonly CollabCheckpointArtifactFact[] {
  if (!Array.isArray(value) || value.length !== 2) throw invalidPayload('artifacts');
  const decoded = value.map(artifact);
  if (
    decoded[0].name !== 'coordination.ndjson'
    || decoded[1].name !== 'repository.bundle'
    || decoded[0].byteCount + decoded[1].byteCount
      > COLLAB_CHECKPOINT_ARTIFACT_LIMITS.maxStagingBytes
  ) throw invalidPayload('artifacts');
  return Object.freeze(decoded);
}

function gitRef(value: unknown): CollabCheckpointGitRef {
  const source = exactRecord(value, 'ref', ['name', 'oid']);
  const name = boundedString(source, 'name', 512);
  if (name !== COLLAB_MAIN_REF && !name.startsWith(COLLAB_MEMBER_REF_PREFIX)) {
    throw invalidPayload('name');
  }
  const oid = token(source, 'oid', isCollabGitOid);
  return { name, oid };
}

function gitRefs(value: unknown, expectedMainOid: CollabGitOid): readonly CollabCheckpointGitRef[] {
  if (!Array.isArray(value) || value.length === 0) throw invalidPayload('refs');
  const decoded = value.map(gitRef);
  if (
    decoded[0].name !== COLLAB_MAIN_REF
    || decoded[0].oid !== expectedMainOid
    || decoded.some((item, index) => index > 0
      && decoded[index - 1].name.localeCompare(item.name, 'en-US') >= 0)
  ) throw invalidPayload('refs');
  return Object.freeze(decoded);
}

function manifestObject(
  source: UnknownRecord,
  includeManifestSha256: boolean,
): CollabProjectCheckpointManifest | Omit<CollabProjectCheckpointManifest, 'manifestSha256'> {
  const profile = literal(source, 'profile', COLLAB_CHECKPOINT_PROFILES);
  const expectedMainOid = token(source, 'expectedMainOid', isCollabGitOid);
  const sourceAuthority = authority(source.sourceAuthority, 'sourceAuthority');
  const targetAuthority = source.targetAuthority === null
    ? null
    : authority(source.targetAuthority, 'targetAuthority');
  if (profile === 'authority-transfer') {
    if (
      targetAuthority === null
      || targetAuthority.kind === sourceAuthority.kind
      || targetAuthority.generation !== sourceAuthority.generation + 1
    ) throw invalidPayload('targetAuthority');
  } else if (targetAuthority !== null) {
    throw invalidPayload('targetAuthority');
  }
  const common = {
    artifacts: artifacts(source.artifacts),
    coordinationFormatVersion: source.coordinationFormatVersion,
    createdAt: timestamp(source, 'createdAt'),
    expectedMainOid,
    gitObjectFormat: literal(source, 'gitObjectFormat', ['sha1', 'sha256']),
    manifestSchemaVersion: source.manifestSchemaVersion,
    operationId: token(source, 'operationId'),
    profile,
    projectId: token(source, 'projectId', isCollabProjectId),
    protocolVersion: source.protocolVersion,
    refs: gitRefs(source.refs, expectedMainOid),
    sourceAuthority,
    targetAuthority,
  };
  if (
    common.coordinationFormatVersion !== COLLAB_PROJECT_COORDINATION_FORMAT_VERSION
    || common.manifestSchemaVersion !== COLLAB_PROJECT_CHECKPOINT_MANIFEST_SCHEMA_VERSION
    || common.protocolVersion !== 5
  ) throw invalidPayload('manifest');
  if (!includeManifestSha256) return common as Omit<CollabProjectCheckpointManifest, 'manifestSha256'>;
  return {
    artifacts: common.artifacts,
    coordinationFormatVersion: COLLAB_PROJECT_COORDINATION_FORMAT_VERSION,
    createdAt: common.createdAt,
    expectedMainOid: common.expectedMainOid,
    gitObjectFormat: common.gitObjectFormat,
    manifestSchemaVersion: COLLAB_PROJECT_CHECKPOINT_MANIFEST_SCHEMA_VERSION,
    manifestSha256: sha256(source, 'manifestSha256'),
    operationId: common.operationId,
    profile: common.profile,
    projectId: common.projectId,
    protocolVersion: 5,
    refs: common.refs,
    sourceAuthority: common.sourceAuthority,
    targetAuthority: common.targetAuthority,
  };
}

export function decodeCollabProjectCheckpointManifest(
  value: unknown,
): CollabProjectCheckpointManifest {
  const source = exactRecord(value, 'manifest', [
    'artifacts',
    'coordinationFormatVersion',
    'createdAt',
    'expectedMainOid',
    'gitObjectFormat',
    'manifestSchemaVersion',
    'manifestSha256',
    'operationId',
    'profile',
    'projectId',
    'protocolVersion',
    'refs',
    'sourceAuthority',
    'targetAuthority',
  ]);
  const decoded = manifestObject(source, true) as CollabProjectCheckpointManifest;
  const encoded = JSON.stringify(decoded);
  if (!hasUtf8ByteLengthAtMost(encoded, COLLAB_CHECKPOINT_ARTIFACT_LIMITS.maxManifestBytes)) {
    throw invalidPayload('manifest');
  }
  return decoded;
}

export function encodeCollabProjectCheckpointManifestCanonicalJson(
  manifest: CollabProjectCheckpointManifest,
): string {
  return JSON.stringify(decodeCollabProjectCheckpointManifest(manifest));
}

export function encodeCollabProjectCheckpointManifestDigestInput(
  manifest: CollabProjectCheckpointManifest,
): string {
  const decoded = decodeCollabProjectCheckpointManifest(manifest);
  const source = {
    artifacts: decoded.artifacts,
    coordinationFormatVersion: decoded.coordinationFormatVersion,
    createdAt: decoded.createdAt,
    expectedMainOid: decoded.expectedMainOid,
    gitObjectFormat: decoded.gitObjectFormat,
    manifestSchemaVersion: decoded.manifestSchemaVersion,
    operationId: decoded.operationId,
    profile: decoded.profile,
    projectId: decoded.projectId,
    protocolVersion: decoded.protocolVersion,
    refs: decoded.refs,
    sourceAuthority: decoded.sourceAuthority,
    targetAuthority: decoded.targetAuthority,
  };
  return JSON.stringify(source);
}

function recordEnvelope(
  value: unknown,
): { source: UnknownRecord; kind: CollabCheckpointBackupRecordKind; recordId: string; revision: number } {
  const source = exactRecord(value, 'record', ['kind', 'recordId', 'revision', 'value']);
  const kind = literal(source, 'kind', COLLAB_CHECKPOINT_BACKUP_RECORD_KINDS);
  const recordId = boundedString(source, 'recordId', 256);
  const revision = positiveInteger(source, 'revision');
  return { kind, recordId, revision, source };
}

function projectRecord(source: UnknownRecord, recordId: string, revision: number) {
  const value = exactRecord(source.value, 'value', [
    'authorityGeneration',
    'createdAt',
    'managerSetGeneration',
    'name',
    'projectId',
  ]);
  const projectId = token(value, 'projectId', isCollabProjectId);
  if (recordId !== projectId) throw invalidPayload('recordId');
  return {
    kind: 'project' as const,
    recordId,
    revision,
    value: {
      authorityGeneration: positiveInteger(value, 'authorityGeneration'),
      createdAt: timestamp(value, 'createdAt'),
      managerSetGeneration: positiveInteger(value, 'managerSetGeneration'),
      name: boundedString(value, 'name', 1024),
      projectId,
    },
  };
}

function memberRecord(source: UnknownRecord, recordId: string, revision: number) {
  const value = exactRecord(source.value, 'value', [
    'activatedAt',
    'createdAt',
    'displayName',
    'memberId',
    'personalRef',
    'role',
    'status',
  ]);
  const memberId = token(value, 'memberId', isCollabMemberId);
  if (recordId !== memberId) throw invalidPayload('recordId');
  const personalRef = boundedString(value, 'personalRef', 512);
  if (personalRef !== `${COLLAB_MEMBER_REF_PREFIX}${memberId}`) throw invalidPayload('personalRef');
  return {
    kind: 'member' as const,
    recordId,
    revision,
    value: {
      activatedAt: nullableTimestamp(value, 'activatedAt'),
      createdAt: timestamp(value, 'createdAt'),
      displayName: boundedString(value, 'displayName', 1024),
      memberId,
      personalRef,
      role: literal(value, 'role', ['manager', 'member']),
      status: literal(value, 'status', ['active', 'left', 'retired']),
    },
  };
}

function requestRecord(source: UnknownRecord, recordId: string, revision: number) {
  const value = exactRecord(source.value, 'value', [
    'baseOid',
    'createdAt',
    'description',
    'headOid',
    'memberId',
    'requestId',
    'status',
    'updatedAt',
  ]);
  const requestId = token(value, 'requestId');
  if (recordId !== requestId) throw invalidPayload('recordId');
  return {
    kind: 'request' as const,
    recordId,
    revision,
    value: {
      baseOid: token(value, 'baseOid', isCollabGitOid),
      createdAt: timestamp(value, 'createdAt'),
      description: boundedString(value, 'description', 16 * 1024, true),
      headOid: token(value, 'headOid', isCollabGitOid),
      memberId: token(value, 'memberId', isCollabMemberId),
      requestId,
      status: literal(value, 'status', ['accepted', 'closed', 'open']),
      updatedAt: timestamp(value, 'updatedAt'),
    },
  };
}

function requestCommentRecord(source: UnknownRecord, recordId: string, revision: number) {
  const value = exactRecord(source.value, 'value', [
    'authorMemberId',
    'body',
    'commentId',
    'createdAt',
    'requestId',
  ]);
  const commentId = token(value, 'commentId');
  if (recordId !== commentId) throw invalidPayload('recordId');
  return {
    kind: 'request-comment' as const,
    recordId,
    revision,
    value: {
      authorMemberId: token(value, 'authorMemberId', isCollabMemberId),
      body: boundedString(value, 'body', 16 * 1024, true),
      commentId,
      createdAt: timestamp(value, 'createdAt'),
      requestId: token(value, 'requestId'),
    },
  };
}

function ticketRecord(source: UnknownRecord, recordId: string, revision: number) {
  const value = exactRecord(source.value, 'value', [
    'authorMemberId',
    'body',
    'createdAt',
    'number',
    'status',
    'ticketId',
    'title',
    'updatedAt',
  ]);
  const ticketId = token(value, 'ticketId');
  if (recordId !== ticketId) throw invalidPayload('recordId');
  return {
    kind: 'ticket' as const,
    recordId,
    revision,
    value: {
      authorMemberId: token(value, 'authorMemberId', isCollabMemberId),
      body: boundedString(value, 'body', 32 * 1024, true),
      createdAt: timestamp(value, 'createdAt'),
      number: positiveInteger(value, 'number'),
      status: literal(value, 'status', ['closed', 'open']),
      ticketId,
      title: boundedString(value, 'title', 1024),
      updatedAt: timestamp(value, 'updatedAt'),
    },
  };
}

function ticketCommentRecord(source: UnknownRecord, recordId: string, revision: number) {
  const value = exactRecord(source.value, 'value', [
    'authorMemberId',
    'body',
    'commentId',
    'createdAt',
    'ticketId',
  ]);
  const commentId = token(value, 'commentId');
  if (recordId !== commentId) throw invalidPayload('recordId');
  return {
    kind: 'ticket-comment' as const,
    recordId,
    revision,
    value: {
      authorMemberId: token(value, 'authorMemberId', isCollabMemberId),
      body: boundedString(value, 'body', 16 * 1024, true),
      commentId,
      createdAt: timestamp(value, 'createdAt'),
      ticketId: token(value, 'ticketId'),
    },
  };
}

function ticketRelationRecord(source: UnknownRecord, recordId: string, revision: number) {
  const value = exactRecord(source.value, 'value', [
    'createdAt',
    'relationKind',
    'requestId',
    'ticketId',
  ]);
  return {
    kind: 'ticket-relation' as const,
    recordId,
    revision,
    value: {
      createdAt: timestamp(value, 'createdAt'),
      relationKind: literal(value, 'relationKind', ['accepted', 'resolving']),
      requestId: token(value, 'requestId'),
      ticketId: token(value, 'ticketId'),
    },
  };
}

function ticketMentionRecord(source: UnknownRecord, recordId: string, revision: number) {
  const value = exactRecord(source.value, 'value', [
    'createdAt',
    'sourceId',
    'sourceKind',
    'ticketId',
  ]);
  return {
    kind: 'ticket-mention' as const,
    recordId,
    revision,
    value: {
      createdAt: timestamp(value, 'createdAt'),
      sourceId: token(value, 'sourceId'),
      sourceKind: literal(value, 'sourceKind', ['request-comment', 'request-description']),
      ticketId: token(value, 'ticketId'),
    },
  };
}

function protectedClaimEnvelopeRecord(
  source: UnknownRecord,
  recordId: string,
  revision: number,
): CollabCheckpointProtectedClaimEnvelopeRecord {
  const value = exactRecord(source.value, 'value', [
    'associatedData',
    'associatedDataSha256',
    'ciphertext',
    'encryptionAlgorithm',
    'expiresAt',
    'keyId',
    'keyVersion',
    'memberId',
    'nonce',
    'receiptKeyId',
    'tag',
    'transferId',
  ]);
  const associatedData = exactRecord(value.associatedData, 'associatedData', [
    'authorityGeneration',
    'checkpointSha256',
    'memberId',
    'projectId',
    'transferId',
  ]);
  const transferId = token(value, 'transferId');
  const memberId = token(value, 'memberId', isCollabMemberId);
  const decodedAssociatedData: CollabProtectedClaimAssociatedData = {
    authorityGeneration: positiveInteger(associatedData, 'authorityGeneration'),
    checkpointSha256: sha256(associatedData, 'checkpointSha256'),
    memberId: token(associatedData, 'memberId', isCollabMemberId),
    projectId: token(associatedData, 'projectId', isCollabProjectId),
    transferId: token(associatedData, 'transferId'),
  };
  if (
    decodedAssociatedData.memberId !== memberId
    || decodedAssociatedData.transferId !== transferId
  ) throw invalidPayload('associatedData');
  return {
    kind: 'protected-claim-envelope',
    recordId,
    revision,
    value: {
      associatedData: decodedAssociatedData,
      associatedDataSha256: sha256(value, 'associatedDataSha256'),
      ciphertext: token(value, 'ciphertext', item => typeof item === 'string'
        && BASE64URL_PATTERN.test(item)),
      encryptionAlgorithm: literal(value, 'encryptionAlgorithm', ['xchacha20-poly1305']),
      expiresAt: timestamp(value, 'expiresAt'),
      keyId: boundedString(value, 'keyId', 256),
      keyVersion: positiveInteger(value, 'keyVersion'),
      memberId,
      nonce: token(value, 'nonce', item => typeof item === 'string'
        && BASE64URL_PATTERN.test(item)),
      receiptKeyId: boundedString(value, 'receiptKeyId', 256),
      tag: token(value, 'tag', item => typeof item === 'string'
        && BASE64URL_PATTERN.test(item)),
      transferId,
    },
  };
}

function decodeCheckpointRecord(value: unknown): CollabCheckpointBackupRecord {
  const { kind, recordId, revision, source } = recordEnvelope(value);
  switch (kind) {
    case 'project': return projectRecord(source, recordId, revision);
    case 'member': return memberRecord(source, recordId, revision);
    case 'request': return requestRecord(source, recordId, revision);
    case 'request-comment': return requestCommentRecord(source, recordId, revision);
    case 'ticket': return ticketRecord(source, recordId, revision);
    case 'ticket-comment': return ticketCommentRecord(source, recordId, revision);
    case 'ticket-relation': return ticketRelationRecord(source, recordId, revision);
    case 'ticket-mention': return ticketMentionRecord(source, recordId, revision);
    case 'protected-claim-envelope':
      return protectedClaimEnvelopeRecord(source, recordId, revision);
  }
}

function recordKindOrder(kind: CollabCheckpointBackupRecordKind): number {
  return COLLAB_CHECKPOINT_BACKUP_RECORD_KINDS.indexOf(kind);
}

function compareRecords(
  left: CollabCheckpointBackupRecord,
  right: CollabCheckpointBackupRecord,
): number {
  const kindOrder = recordKindOrder(left.kind) - recordKindOrder(right.kind);
  return kindOrder !== 0 ? kindOrder : left.recordId.localeCompare(right.recordId, 'en-US');
}

function validateRecordSequence(
  records: readonly CollabCheckpointBackupRecord[],
  profile: CollabCheckpointProfile,
): void {
  if (records.length === 0 || records[0].kind !== 'project') throw invalidPayload('records');
  const projectId = records[0].recordId;
  if (records.some((item, index) => index > 0 && compareRecords(records[index - 1], item) >= 0)) {
    throw invalidPayload('records');
  }
  if (profile !== 'backup' && records.some(item => item.kind === 'protected-claim-envelope')) {
    throw invalidPayload('profile');
  }
  const projectRecordValue = records[0].value;
  if (projectRecordValue.projectId !== projectId) throw invalidPayload('records');
}

export function decodeCollabProjectCheckpointCoordinationNdjson(
  value: string,
  profile: CollabCheckpointProfile,
): readonly CollabCheckpointBackupRecord[] {
  if (
    typeof value !== 'string'
    || !CHECKPOINT_PROFILE_SET.has(profile)
    || !value.endsWith('\n')
    || !hasUtf8ByteLengthAtMost(value, COLLAB_CHECKPOINT_ARTIFACT_LIMITS.maxCoordinationBytes)
  ) throw invalidPayload('coordination');
  const lines = value.slice(0, -1).split('\n');
  if (lines.some(line => line.length === 0)) throw invalidPayload('coordination');
  const decoded = lines.map((line) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line) as unknown;
    } catch {
      throw invalidPayload('coordination');
    }
    const result = decodeCheckpointRecord(parsed);
    if (JSON.stringify(result) !== line) throw invalidPayload('coordination');
    return result;
  });
  validateRecordSequence(decoded, profile);
  return Object.freeze(decoded);
}

export function encodeCollabProjectCheckpointCoordinationNdjson(
  records: readonly CollabCheckpointBackupRecord[],
  profile: CollabCheckpointProfile,
): string {
  const encoded = records.map(record => JSON.stringify(record)).join('\n') + '\n';
  return decodeCollabProjectCheckpointCoordinationNdjson(encoded, profile)
    .map(record => JSON.stringify(record)).join('\n') + '\n';
}
