import {
  type CollabAuthorityRelinquishmentProof,
  type CollabAuthorityTransferDirection,
  type CollabAuthorityTransferStatus,
  decodeCollabAuthorityRelinquishmentProof,
  decodeCollabAuthorityTransferLifecycleFence,
} from './CollabAuthorityTransfer';
import {
  type CollabCloudProjectEvent,
  decodeCollabCloudProjectEventMessage,
} from './CollabCloudProjectEvent';
import {
  COLLAB_MAIN_REF,
  COLLAB_MEMBER_REF_PREFIX,
  COLLAB_PROTOCOL_VERSION,
} from './CollabConstants';
import {
  COLLAB_CONTROL_OPERATION_CODECS,
  type CollabControlOperation,
  collabControlOperationCodec,
} from './CollabControlOperationCodecs';
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
  'cloud-event',
  'cloud-event-cursor',
  'idempotency-result',
  'principal-binding',
  'repository-placement',
  'lifecycle-state',
  'terminal-responder',
  'protected-claim-envelope',
  'tombstone',
  'schema-catalog',
  'server-compatibility',
  'authority-volume-pair',
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
  readonly protocolVersion: typeof COLLAB_PROTOCOL_VERSION;
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
  readonly activatedAt: CollabIsoTimestamp;
  readonly authorityGeneration: number;
  readonly createdAt: CollabIsoTimestamp;
  readonly expectedMainOid: CollabGitOid;
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
  readonly projectId: CollabProjectId;
  readonly role: 'manager' | 'member';
  readonly status: 'active' | 'left' | 'revoked';
  readonly revokedAt: CollabIsoTimestamp | null;
  readonly updatedAt: CollabIsoTimestamp;
}>;

export type CollabCheckpointRequestRecord = CollabCheckpointRecordBase<'request', {
  readonly createdAt: CollabIsoTimestamp;
  readonly description: string;
  readonly firstBaseOid: CollabGitOid;
  readonly latestHeadOid: CollabGitOid;
  readonly memberId: CollabMemberId;
  readonly mergedOid: CollabGitOid | null;
  readonly projectId: CollabProjectId;
  readonly requestId: string;
  readonly status: 'discarded' | 'merged' | 'open';
  readonly updatedAt: CollabIsoTimestamp;
}>;

export type CollabCheckpointRequestCommentRecord = CollabCheckpointRecordBase<'request-comment', {
  readonly authorMemberId: CollabMemberId;
  readonly body: string;
  readonly commentId: string;
  readonly createdAt: CollabIsoTimestamp;
  readonly projectId: CollabProjectId;
  readonly requestId: string;
}>;

export type CollabCheckpointTicketRecord = CollabCheckpointRecordBase<'ticket', {
  readonly authorMemberId: CollabMemberId;
  readonly body: string;
  readonly closedAt: CollabIsoTimestamp | null;
  readonly closedByMemberId: CollabMemberId | null;
  readonly createdAt: CollabIsoTimestamp;
  readonly number: number;
  readonly projectId: CollabProjectId;
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
  readonly projectId: CollabProjectId;
  readonly ticketId: string;
}>;

export type CollabCheckpointTicketRelationRecord = CollabCheckpointRecordBase<'ticket-relation', {
  readonly acceptedAt: CollabIsoTimestamp | null;
  readonly acceptedMergeOid: CollabGitOid | null;
  readonly commitOid: CollabGitOid;
  readonly createdAt: CollabIsoTimestamp;
  readonly createdByMemberId: CollabMemberId;
  readonly kind: 'references' | 'resolves';
  readonly projectId: CollabProjectId;
  readonly relationId: string;
  readonly requestId: string;
  readonly state: 'accepted' | 'pending';
  readonly ticketId: string;
  readonly updatedAt: CollabIsoTimestamp;
}>;

export type CollabCheckpointTicketMentionRecord = CollabCheckpointRecordBase<'ticket-mention', {
  readonly createdAt: CollabIsoTimestamp;
  readonly mentionedMemberId: CollabMemberId;
  readonly projectId: CollabProjectId;
  readonly sourceId: string;
  readonly sourceKind: 'comment' | 'description';
  readonly ticketId: string;
}>;

export type CollabCheckpointCloudEventRecord = CollabCheckpointRecordBase<'cloud-event', {
  readonly event: CollabCloudProjectEvent;
}>;

export type CollabCheckpointCloudEventCursorRecord =
  CollabCheckpointRecordBase<'cloud-event-cursor', {
    readonly currentSequence: number;
    readonly projectId: CollabProjectId;
    readonly updatedAt: CollabIsoTimestamp;
  }>;

export type CollabCheckpointIdempotencyResultRecord =
  CollabCheckpointRecordBase<'idempotency-result', {
    readonly createdAt: CollabIsoTimestamp;
    readonly idempotencyKey: string;
    readonly memberId: CollabMemberId;
    readonly operation: CollabControlOperation;
    readonly projectId: CollabProjectId;
    readonly requestFingerprint: string;
    readonly responseJson: string;
  }>;

export type CollabCheckpointPrincipalBindingRecord =
  CollabCheckpointRecordBase<'principal-binding', {
    readonly boundAt: CollabIsoTimestamp;
    readonly memberId: CollabMemberId;
    readonly principalId: string;
    readonly projectId: CollabProjectId;
  }>;

export type CollabCheckpointRepositoryPlacementRecord =
  CollabCheckpointRecordBase<'repository-placement', {
    readonly nodeId: string;
    readonly placementGeneration: number;
    readonly projectId: CollabProjectId;
    readonly repositoryIdentity: string;
  }>;

type CollabCheckpointAuthorityTransferLifecycleState = {
  readonly batchRevision: number | null;
  readonly batchSha256: string | null;
  readonly checkpointSha256: string | null;
  readonly direction: CollabAuthorityTransferDirection;
  readonly operationId: string;
  readonly operationKind: 'authority-transfer';
  readonly phase: CollabAuthorityTransferStatus['phase'];
  readonly projectId: CollabProjectId;
  readonly relinquishmentProof: CollabAuthorityRelinquishmentProof | null;
  readonly updatedAt: CollabIsoTimestamp;
};

type CollabCheckpointInternalLifecycleState = {
  readonly batchRevision: null;
  readonly batchSha256: null;
  readonly direction: null;
  readonly operationId: string;
  readonly phase: string;
  readonly projectId: CollabProjectId;
  readonly relinquishmentProof: null;
  readonly updatedAt: CollabIsoTimestamp;
} & (
  | {
    readonly checkpointSha256: string | null;
    readonly operationKind: 'backup';
  }
  | {
    readonly checkpointSha256: null;
    readonly operationKind: 'delete' | 'retire';
  }
);

export type CollabCheckpointLifecycleStateRecord =
  CollabCheckpointRecordBase<'lifecycle-state',
  CollabCheckpointAuthorityTransferLifecycleState | CollabCheckpointInternalLifecycleState>;

export interface CollabCheckpointTerminalAcknowledgement {
  readonly acknowledgedAt: CollabIsoTimestamp;
  readonly memberId: CollabMemberId;
  readonly principalId: string;
}

export type CollabCheckpointTerminalResponderRecord =
  CollabCheckpointRecordBase<'terminal-responder', {
    readonly acknowledgements: readonly CollabCheckpointTerminalAcknowledgement[];
    readonly eligibleMemberIds: readonly CollabMemberId[];
    readonly expiresAt: CollabIsoTimestamp;
    readonly operation: 'getProjectAuthorityTransfer' | 'retireProject';
    readonly operationId: string;
    readonly projectId: CollabProjectId;
    readonly responseJson: string;
  }>;

export interface CollabProtectedClaimAssociatedData {
  readonly authorityGeneration: number;
  readonly checkpointSha256: string;
  readonly claimSha256: string;
  readonly envelopeVersion: number;
  readonly environmentIdentity: string;
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

export type CollabCheckpointTombstoneRecord = CollabCheckpointRecordBase<'tombstone', {
  readonly authorityGeneration: number;
  readonly projectId: CollabProjectId;
  readonly retiredAt: CollabIsoTimestamp;
  readonly terminalExpiresAt: CollabIsoTimestamp;
}>;

export type CollabCheckpointSchemaCatalogRecord =
  CollabCheckpointRecordBase<'schema-catalog', {
    readonly coordinationSchemaVersion: number;
    readonly projectId: CollabProjectId;
    readonly repositoryFormatVersion: number;
  }>;

export type CollabCheckpointServerCompatibilityRecord =
  CollabCheckpointRecordBase<'server-compatibility', {
    readonly maximumBuild: string;
    readonly minimumBuild: string;
    readonly projectId: CollabProjectId;
  }>;

export type CollabCheckpointAuthorityVolumePairRecord =
  CollabCheckpointRecordBase<'authority-volume-pair', {
    readonly authorityId: string;
    readonly authorityVolumeIdentity: string;
    readonly projectId: CollabProjectId;
    readonly restoreEpoch: number;
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
  | CollabCheckpointCloudEventRecord
  | CollabCheckpointCloudEventCursorRecord
  | CollabCheckpointIdempotencyResultRecord
  | CollabCheckpointPrincipalBindingRecord
  | CollabCheckpointRepositoryPlacementRecord
  | CollabCheckpointLifecycleStateRecord
  | CollabCheckpointTerminalResponderRecord
  | CollabCheckpointProtectedClaimEnvelopeRecord
  | CollabCheckpointTombstoneRecord
  | CollabCheckpointSchemaCatalogRecord
  | CollabCheckpointServerCompatibilityRecord
  | CollabCheckpointAuthorityVolumePairRecord;

type UnknownRecord = Readonly<Record<string, unknown>>;

const CHECKPOINT_PROFILE_SET: ReadonlySet<string> = new Set(COLLAB_CHECKPOINT_PROFILES);
const PORTABLE_RECORD_KIND_SET: ReadonlySet<string> = new Set(
  COLLAB_CHECKPOINT_PORTABLE_RECORD_KINDS,
);
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/u;
const PLAINTEXT_CLAIM_RESPONSE_OPERATION_SET: ReadonlySet<CollabControlOperation> = new Set([
  'getTransferredMembershipClaim',
  'rotateTransferredMembershipClaims',
]);

function gitOidMatchesFormat(
  oid: CollabGitOid,
  format: CollabCheckpointObjectFormat,
): boolean {
  return oid.length === (format === 'sha1' ? 40 : 64);
}

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

function nonNegativeInteger(source: UnknownRecord, field: string): number {
  const value = source[field];
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw invalidPayload(field);
  }
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

function controlOperation(source: UnknownRecord, field: string): CollabControlOperation {
  const value = source[field];
  if (typeof value !== 'string' || !Object.hasOwn(COLLAB_CONTROL_OPERATION_CODECS, value)) {
    throw invalidPayload(field);
  }
  return value as CollabControlOperation;
}

function canonicalOperationResponseJson(
  source: UnknownRecord,
  field: string,
  operation: CollabControlOperation,
): { readonly decoded: UnknownRecord; readonly responseJson: string } {
  if (PLAINTEXT_CLAIM_RESPONSE_OPERATION_SET.has(operation)) throw invalidPayload(field);
  const value = boundedString(source, field, 512 * 1024, true);
  let decoded: UnknownRecord;
  try {
    const parsed = JSON.parse(value) as unknown;
    const operationResponse = collabControlOperationCodec(operation).decodeResponse(parsed);
    if (JSON.stringify(operationResponse) !== value) throw invalidPayload(field);
    decoded = record(operationResponse, field);
  } catch {
    throw invalidPayload(field);
  }
  return { decoded, responseJson: value };
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
  const gitObjectFormat = literal(source, 'gitObjectFormat', ['sha1', 'sha256']);
  const refs = gitRefs(source.refs, expectedMainOid);
  if (
    !gitOidMatchesFormat(expectedMainOid, gitObjectFormat)
    || refs.some(ref => !gitOidMatchesFormat(ref.oid, gitObjectFormat))
  ) throw invalidPayload('gitObjectFormat');
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
    gitObjectFormat,
    manifestSchemaVersion: source.manifestSchemaVersion,
    operationId: token(source, 'operationId'),
    profile,
    projectId: token(source, 'projectId', isCollabProjectId),
    protocolVersion: source.protocolVersion,
    refs,
    sourceAuthority,
    targetAuthority,
  };
  if (
    common.coordinationFormatVersion !== COLLAB_PROJECT_COORDINATION_FORMAT_VERSION
    || common.manifestSchemaVersion !== COLLAB_PROJECT_CHECKPOINT_MANIFEST_SCHEMA_VERSION
    || common.protocolVersion !== COLLAB_PROTOCOL_VERSION
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
    protocolVersion: COLLAB_PROTOCOL_VERSION,
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
    'activatedAt',
    'authorityGeneration',
    'createdAt',
    'expectedMainOid',
    'managerSetGeneration',
    'name',
    'projectId',
  ]);
  const projectId = token(value, 'projectId', isCollabProjectId);
  if (recordId !== projectId) throw invalidPayload('recordId');
  const createdAt = timestamp(value, 'createdAt');
  const activatedAt = timestamp(value, 'activatedAt');
  if (Date.parse(activatedAt) < Date.parse(createdAt)) throw invalidPayload('activatedAt');
  return {
    kind: 'project' as const,
    recordId,
    revision,
    value: {
      activatedAt,
      authorityGeneration: positiveInteger(value, 'authorityGeneration'),
      createdAt,
      expectedMainOid: token(value, 'expectedMainOid', isCollabGitOid),
      managerSetGeneration: nonNegativeInteger(value, 'managerSetGeneration'),
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
    'projectId',
    'role',
    'status',
    'revokedAt',
    'updatedAt',
  ]);
  const memberId = token(value, 'memberId', isCollabMemberId);
  if (recordId !== memberId) throw invalidPayload('recordId');
  const personalRef = boundedString(value, 'personalRef', 512);
  if (personalRef !== `${COLLAB_MEMBER_REF_PREFIX}${memberId}`) throw invalidPayload('personalRef');
  const activatedAt = nullableTimestamp(value, 'activatedAt');
  const revokedAt = nullableTimestamp(value, 'revokedAt');
  const createdAt = timestamp(value, 'createdAt');
  const updatedAt = timestamp(value, 'updatedAt');
  const status = literal(value, 'status', ['active', 'left', 'revoked']);
  if (
    (status === 'active' && (activatedAt === null || revokedAt !== null))
    || (status !== 'active' && revokedAt === null)
    || Date.parse(updatedAt) < Date.parse(createdAt)
    || (activatedAt !== null && Date.parse(activatedAt) < Date.parse(createdAt))
    || (revokedAt !== null && (
      Date.parse(revokedAt) < Date.parse(createdAt)
      || Date.parse(revokedAt) > Date.parse(updatedAt)
    ))
  ) throw invalidPayload('status');
  return {
    kind: 'member' as const,
    recordId,
    revision,
    value: {
      activatedAt,
      createdAt,
      displayName: boundedString(value, 'displayName', 1024),
      memberId,
      personalRef,
      projectId: token(value, 'projectId', isCollabProjectId),
      role: literal(value, 'role', ['manager', 'member']),
      status,
      revokedAt,
      updatedAt,
    },
  };
}

function requestRecord(source: UnknownRecord, recordId: string, revision: number) {
  const value = exactRecord(source.value, 'value', [
    'createdAt',
    'description',
    'firstBaseOid',
    'latestHeadOid',
    'memberId',
    'mergedOid',
    'projectId',
    'requestId',
    'status',
    'updatedAt',
  ]);
  const requestId = token(value, 'requestId');
  if (recordId !== requestId) throw invalidPayload('recordId');
  const status = literal(value, 'status', ['discarded', 'merged', 'open']);
  const mergedOid = value.mergedOid === null
    ? null
    : token(value, 'mergedOid', isCollabGitOid);
  const createdAt = timestamp(value, 'createdAt');
  const updatedAt = timestamp(value, 'updatedAt');
  if (
    (status === 'merged') !== (mergedOid !== null)
    || Date.parse(updatedAt) < Date.parse(createdAt)
  ) throw invalidPayload('status');
  return {
    kind: 'request' as const,
    recordId,
    revision,
    value: {
      createdAt,
      description: boundedString(value, 'description', 16 * 1024, true),
      firstBaseOid: token(value, 'firstBaseOid', isCollabGitOid),
      latestHeadOid: token(value, 'latestHeadOid', isCollabGitOid),
      memberId: token(value, 'memberId', isCollabMemberId),
      mergedOid,
      projectId: token(value, 'projectId', isCollabProjectId),
      requestId,
      status,
      updatedAt,
    },
  };
}

function requestCommentRecord(source: UnknownRecord, recordId: string, revision: number) {
  const value = exactRecord(source.value, 'value', [
    'authorMemberId',
    'body',
    'commentId',
    'createdAt',
    'projectId',
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
      projectId: token(value, 'projectId', isCollabProjectId),
      requestId: token(value, 'requestId'),
    },
  };
}

function ticketRecord(source: UnknownRecord, recordId: string, revision: number) {
  const value = exactRecord(source.value, 'value', [
    'authorMemberId',
    'body',
    'closedAt',
    'closedByMemberId',
    'createdAt',
    'number',
    'projectId',
    'status',
    'ticketId',
    'title',
    'updatedAt',
  ]);
  const ticketId = token(value, 'ticketId');
  if (recordId !== ticketId) throw invalidPayload('recordId');
  const status = literal(value, 'status', ['closed', 'open']);
  const closedAt = nullableTimestamp(value, 'closedAt');
  const closedByMemberId = value.closedByMemberId === null
    ? null
    : token(value, 'closedByMemberId', isCollabMemberId);
  const createdAt = timestamp(value, 'createdAt');
  const updatedAt = timestamp(value, 'updatedAt');
  if (
    (status === 'open' && (closedAt !== null || closedByMemberId !== null))
    || (status === 'closed' && (closedAt === null || closedByMemberId === null))
    || Date.parse(updatedAt) < Date.parse(createdAt)
    || (closedAt !== null && Date.parse(closedAt) < Date.parse(createdAt))
  ) throw invalidPayload('status');
  return {
    kind: 'ticket' as const,
    recordId,
    revision,
    value: {
      authorMemberId: token(value, 'authorMemberId', isCollabMemberId),
      body: boundedString(value, 'body', 32 * 1024, true),
      closedAt,
      closedByMemberId,
      createdAt,
      number: positiveInteger(value, 'number'),
      projectId: token(value, 'projectId', isCollabProjectId),
      status,
      ticketId,
      title: boundedString(value, 'title', 1024),
      updatedAt,
    },
  };
}

function ticketCommentRecord(source: UnknownRecord, recordId: string, revision: number) {
  const value = exactRecord(source.value, 'value', [
    'authorMemberId',
    'body',
    'commentId',
    'createdAt',
    'projectId',
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
      projectId: token(value, 'projectId', isCollabProjectId),
      ticketId: token(value, 'ticketId'),
    },
  };
}

function ticketRelationRecord(source: UnknownRecord, recordId: string, revision: number) {
  const value = exactRecord(source.value, 'value', [
    'acceptedAt',
    'acceptedMergeOid',
    'commitOid',
    'createdAt',
    'createdByMemberId',
    'kind',
    'projectId',
    'relationId',
    'requestId',
    'state',
    'ticketId',
    'updatedAt',
  ]);
  const relationId = token(value, 'relationId');
  if (recordId !== relationId) throw invalidPayload('recordId');
  const state = literal(value, 'state', ['accepted', 'pending']);
  const acceptedAt = nullableTimestamp(value, 'acceptedAt');
  const acceptedMergeOid = value.acceptedMergeOid === null
    ? null
    : token(value, 'acceptedMergeOid', isCollabGitOid);
  const createdAt = timestamp(value, 'createdAt');
  const updatedAt = timestamp(value, 'updatedAt');
  if (
    (state === 'pending' && (acceptedAt !== null || acceptedMergeOid !== null))
    || (state === 'accepted' && (acceptedAt === null || acceptedMergeOid === null))
    || Date.parse(updatedAt) < Date.parse(createdAt)
    || (acceptedAt !== null && Date.parse(acceptedAt) < Date.parse(createdAt))
  ) throw invalidPayload('state');
  return {
    kind: 'ticket-relation' as const,
    recordId,
    revision,
    value: {
      acceptedAt,
      acceptedMergeOid,
      commitOid: token(value, 'commitOid', isCollabGitOid),
      createdAt,
      createdByMemberId: token(value, 'createdByMemberId', isCollabMemberId),
      kind: literal(value, 'kind', ['references', 'resolves']),
      projectId: token(value, 'projectId', isCollabProjectId),
      relationId,
      requestId: token(value, 'requestId'),
      state,
      ticketId: token(value, 'ticketId'),
      updatedAt,
    },
  };
}

function ticketMentionRecord(source: UnknownRecord, recordId: string, revision: number) {
  const value = exactRecord(source.value, 'value', [
    'createdAt',
    'mentionedMemberId',
    'projectId',
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
      mentionedMemberId: token(value, 'mentionedMemberId', isCollabMemberId),
      projectId: token(value, 'projectId', isCollabProjectId),
      sourceId: token(value, 'sourceId'),
      sourceKind: literal(value, 'sourceKind', ['comment', 'description']),
      ticketId: token(value, 'ticketId'),
    },
  };
}

function cloudEventRecord(
  source: UnknownRecord,
  recordId: string,
  revision: number,
): CollabCheckpointCloudEventRecord {
  const value = exactRecord(source.value, 'value', ['event']);
  const event = decodeCollabCloudProjectEventMessage(value.event);
  if (!('projectId' in event) || recordId !== String(event.sequence).padStart(20, '0')) {
    throw invalidPayload('event');
  }
  return { kind: 'cloud-event', recordId, revision, value: { event } };
}

function cloudEventCursorRecord(
  source: UnknownRecord,
  recordId: string,
  revision: number,
): CollabCheckpointCloudEventCursorRecord {
  const value = exactRecord(source.value, 'value', [
    'currentSequence',
    'projectId',
    'updatedAt',
  ]);
  const projectId = token(value, 'projectId', isCollabProjectId);
  if (recordId !== projectId) throw invalidPayload('recordId');
  return {
    kind: 'cloud-event-cursor',
    recordId,
    revision,
    value: {
      currentSequence: nonNegativeInteger(value, 'currentSequence'),
      projectId,
      updatedAt: timestamp(value, 'updatedAt'),
    },
  };
}

function idempotencyResultRecord(
  source: UnknownRecord,
  recordId: string,
  revision: number,
): CollabCheckpointIdempotencyResultRecord {
  const value = exactRecord(source.value, 'value', [
    'createdAt',
    'idempotencyKey',
    'memberId',
    'operation',
    'projectId',
    'requestFingerprint',
    'responseJson',
  ]);
  const operation = controlOperation(value, 'operation');
  const idempotencyKey = token(value, 'idempotencyKey');
  const projectId = token(value, 'projectId', isCollabProjectId);
  const response = canonicalOperationResponseJson(value, 'responseJson', operation);
  if (
    recordId !== idempotencyKey
    || (Object.hasOwn(response.decoded, 'projectId')
      && response.decoded.projectId !== projectId)
  ) throw invalidPayload('responseJson');
  return {
    kind: 'idempotency-result',
    recordId,
    revision,
    value: {
      createdAt: timestamp(value, 'createdAt'),
      idempotencyKey,
      memberId: token(value, 'memberId', isCollabMemberId),
      operation,
      projectId,
      requestFingerprint: sha256(value, 'requestFingerprint'),
      responseJson: response.responseJson,
    },
  };
}

function principalBindingRecord(
  source: UnknownRecord,
  recordId: string,
  revision: number,
): CollabCheckpointPrincipalBindingRecord {
  const value = exactRecord(source.value, 'value', [
    'boundAt',
    'memberId',
    'principalId',
    'projectId',
  ]);
  const memberId = token(value, 'memberId', isCollabMemberId);
  if (recordId !== memberId) throw invalidPayload('recordId');
  return {
    kind: 'principal-binding',
    recordId,
    revision,
    value: {
      boundAt: timestamp(value, 'boundAt'),
      memberId,
      principalId: token(value, 'principalId'),
      projectId: token(value, 'projectId', isCollabProjectId),
    },
  };
}

function repositoryPlacementRecord(
  source: UnknownRecord,
  recordId: string,
  revision: number,
): CollabCheckpointRepositoryPlacementRecord {
  const value = exactRecord(source.value, 'value', [
    'nodeId',
    'placementGeneration',
    'projectId',
    'repositoryIdentity',
  ]);
  return {
    kind: 'repository-placement',
    recordId,
    revision,
    value: {
      nodeId: token(value, 'nodeId'),
      placementGeneration: positiveInteger(value, 'placementGeneration'),
      projectId: token(value, 'projectId', isCollabProjectId),
      repositoryIdentity: token(value, 'repositoryIdentity'),
    },
  };
}

function lifecycleStateRecord(
  source: UnknownRecord,
  recordId: string,
  revision: number,
): CollabCheckpointLifecycleStateRecord {
  const value = exactRecord(source.value, 'value', [
    'batchRevision',
    'batchSha256',
    'checkpointSha256',
    'direction',
    'operationId',
    'operationKind',
    'phase',
    'projectId',
    'relinquishmentProof',
    'updatedAt',
  ]);
  const operationId = token(value, 'operationId');
  if (recordId !== operationId) throw invalidPayload('recordId');
  const operationKind = literal(value, 'operationKind', [
    'authority-transfer',
    'backup',
    'delete',
    'retire',
  ]);
  const common = {
    operationId,
    projectId: token(value, 'projectId', isCollabProjectId),
    updatedAt: timestamp(value, 'updatedAt'),
  };
  if (operationKind === 'authority-transfer') {
    const fence = decodeCollabAuthorityTransferLifecycleFence({
      batchRevision: value.batchRevision,
      batchSha256: value.batchSha256,
      checkpointSha256: value.checkpointSha256,
      direction: value.direction,
      phase: value.phase,
    });
    const relinquishmentProof = value.relinquishmentProof === null
      ? null
      : decodeCollabAuthorityRelinquishmentProof(value.relinquishmentProof);
    if (
      fence.relinquishmentRequired !== (relinquishmentProof !== null)
      || (relinquishmentProof !== null && (
        relinquishmentProof.batchRevision !== fence.batchRevision
        || relinquishmentProof.batchSha256 !== fence.batchSha256
        || relinquishmentProof.checkpointSha256 !== fence.checkpointSha256
        || relinquishmentProof.projectId !== common.projectId
        || relinquishmentProof.transferId !== operationId
        || (fence.direction === 'lan-to-cloud'
          ? relinquishmentProof.sourceAuthority.kind !== 'lan'
            || relinquishmentProof.targetAuthority.kind !== 'cloud'
          : relinquishmentProof.sourceAuthority.kind !== 'cloud'
            || relinquishmentProof.targetAuthority.kind !== 'lan')
      ))
    ) throw invalidPayload('relinquishmentProof');
    return {
      kind: 'lifecycle-state',
      recordId,
      revision,
      value: {
        batchRevision: fence.batchRevision,
        batchSha256: fence.batchSha256,
        checkpointSha256: fence.checkpointSha256,
        direction: fence.direction,
        operationId,
        operationKind,
        phase: fence.phase,
        projectId: common.projectId,
        relinquishmentProof,
        updatedAt: common.updatedAt,
      },
    };
  }
  if (
    value.direction !== null
    || value.batchRevision !== null
    || value.batchSha256 !== null
    || value.relinquishmentProof !== null
    || (operationKind !== 'backup' && value.checkpointSha256 !== null)
  ) throw invalidPayload('lifecycleState');
  const checkpointSha256 = value.checkpointSha256 === null
    ? null
    : sha256(value, 'checkpointSha256');
  const phase = boundedString(value, 'phase', 128);
  const internalState: CollabCheckpointInternalLifecycleState = operationKind === 'backup'
    ? {
      batchRevision: null,
      batchSha256: null,
      checkpointSha256,
      direction: null,
      operationId,
      operationKind,
      phase,
      projectId: common.projectId,
      relinquishmentProof: null,
      updatedAt: common.updatedAt,
    }
    : {
      batchRevision: null,
      batchSha256: null,
      checkpointSha256: null,
      direction: null,
      operationId,
      operationKind,
      phase,
      projectId: common.projectId,
      relinquishmentProof: null,
      updatedAt: common.updatedAt,
    };
  return {
    kind: 'lifecycle-state',
    recordId,
    revision,
    value: internalState,
  };
}

function terminalResponderRecord(
  source: UnknownRecord,
  recordId: string,
  revision: number,
): CollabCheckpointTerminalResponderRecord {
  const value = exactRecord(source.value, 'value', [
    'acknowledgements',
    'eligibleMemberIds',
    'expiresAt',
    'operation',
    'operationId',
    'projectId',
    'responseJson',
  ]);
  const operationId = token(value, 'operationId');
  if (recordId !== operationId) throw invalidPayload('recordId');
  const operation = controlOperation(value, 'operation');
  const projectId = token(value, 'projectId', isCollabProjectId);
  const response = canonicalOperationResponseJson(value, 'responseJson', operation);
  const responseOperationId = Object.hasOwn(response.decoded, 'transferId')
    ? response.decoded.transferId
    : Object.hasOwn(response.decoded, 'retirementId')
      ? response.decoded.retirementId
      : null;
  if (
    response.decoded.projectId !== projectId
    || responseOperationId !== operationId
  ) throw invalidPayload('responseJson');
  const expiresAt = timestamp(value, 'expiresAt');
  if (operation === 'retireProject') {
    if (
      response.decoded.kind !== 'project-retired'
      || response.decoded.terminalExpiresAt !== expiresAt
    ) throw invalidPayload('responseJson');
  } else if (operation === 'getProjectAuthorityTransfer') {
    if (
      response.decoded.direction !== 'cloud-to-lan'
      || response.decoded.phase !== 'completed'
      || response.decoded.state !== 'completed'
      || response.decoded.expiresAt !== expiresAt
    ) throw invalidPayload('responseJson');
  } else {
    throw invalidPayload('operation');
  }
  if (!Array.isArray(value.eligibleMemberIds)) throw invalidPayload('eligibleMemberIds');
  const eligibleMemberIds = value.eligibleMemberIds.map((item) => {
    if (!isCollabMemberId(item)) throw invalidPayload('eligibleMemberIds');
    return item;
  });
  if (eligibleMemberIds.some((item, index) => (
    index > 0 && eligibleMemberIds[index - 1].localeCompare(item, 'en-US') >= 0
  ))) throw invalidPayload('eligibleMemberIds');
  if (!Array.isArray(value.acknowledgements)) throw invalidPayload('acknowledgements');
  const acknowledgements = value.acknowledgements.map((item) => {
    const acknowledgement = exactRecord(item, 'acknowledgement', [
      'acknowledgedAt',
      'memberId',
      'principalId',
    ]);
    return {
      acknowledgedAt: timestamp(acknowledgement, 'acknowledgedAt'),
      memberId: token(acknowledgement, 'memberId', isCollabMemberId),
      principalId: token(acknowledgement, 'principalId'),
    };
  });
  const acknowledgementPrincipals = new Set<string>();
  acknowledgements.forEach((item, index) => {
    if (
      !eligibleMemberIds.includes(item.memberId)
      || (index > 0 && acknowledgements[index - 1].memberId.localeCompare(
        item.memberId,
        'en-US',
      ) >= 0)
      || acknowledgementPrincipals.has(item.principalId)
    ) throw invalidPayload('acknowledgements');
    acknowledgementPrincipals.add(item.principalId);
  });
  return {
    kind: 'terminal-responder',
    recordId,
    revision,
    value: {
      acknowledgements: Object.freeze(acknowledgements),
      eligibleMemberIds: Object.freeze(eligibleMemberIds),
      expiresAt,
      operation,
      operationId,
      projectId,
      responseJson: response.responseJson,
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
    'claimSha256',
    'envelopeVersion',
    'environmentIdentity',
    'memberId',
    'projectId',
    'transferId',
  ]);
  const transferId = token(value, 'transferId');
  const memberId = token(value, 'memberId', isCollabMemberId);
  const decodedAssociatedData: CollabProtectedClaimAssociatedData = {
    authorityGeneration: positiveInteger(associatedData, 'authorityGeneration'),
    checkpointSha256: sha256(associatedData, 'checkpointSha256'),
    claimSha256: sha256(associatedData, 'claimSha256'),
    envelopeVersion: positiveInteger(associatedData, 'envelopeVersion'),
    environmentIdentity: token(associatedData, 'environmentIdentity'),
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

function tombstoneRecord(
  source: UnknownRecord,
  recordId: string,
  revision: number,
): CollabCheckpointTombstoneRecord {
  const value = exactRecord(source.value, 'value', [
    'authorityGeneration',
    'projectId',
    'retiredAt',
    'terminalExpiresAt',
  ]);
  const projectId = token(value, 'projectId', isCollabProjectId);
  if (recordId !== projectId) throw invalidPayload('recordId');
  const retiredAt = timestamp(value, 'retiredAt');
  const terminalExpiresAt = timestamp(value, 'terminalExpiresAt');
  if (Date.parse(terminalExpiresAt) <= Date.parse(retiredAt)) {
    throw invalidPayload('terminalExpiresAt');
  }
  return {
    kind: 'tombstone',
    recordId,
    revision,
    value: {
      authorityGeneration: positiveInteger(value, 'authorityGeneration'),
      projectId,
      retiredAt,
      terminalExpiresAt,
    },
  };
}

function schemaCatalogRecord(
  source: UnknownRecord,
  recordId: string,
  revision: number,
): CollabCheckpointSchemaCatalogRecord {
  const value = exactRecord(source.value, 'value', [
    'coordinationSchemaVersion',
    'projectId',
    'repositoryFormatVersion',
  ]);
  const projectId = token(value, 'projectId', isCollabProjectId);
  if (recordId !== projectId) throw invalidPayload('recordId');
  return {
    kind: 'schema-catalog',
    recordId,
    revision,
    value: {
      coordinationSchemaVersion: positiveInteger(value, 'coordinationSchemaVersion'),
      projectId,
      repositoryFormatVersion: positiveInteger(value, 'repositoryFormatVersion'),
    },
  };
}

function serverCompatibilityRecord(
  source: UnknownRecord,
  recordId: string,
  revision: number,
): CollabCheckpointServerCompatibilityRecord {
  const value = exactRecord(source.value, 'value', [
    'maximumBuild',
    'minimumBuild',
    'projectId',
  ]);
  const projectId = token(value, 'projectId', isCollabProjectId);
  if (recordId !== projectId) throw invalidPayload('recordId');
  return {
    kind: 'server-compatibility',
    recordId,
    revision,
    value: {
      maximumBuild: boundedString(value, 'maximumBuild', 128),
      minimumBuild: boundedString(value, 'minimumBuild', 128),
      projectId,
    },
  };
}

function authorityVolumePairRecord(
  source: UnknownRecord,
  recordId: string,
  revision: number,
): CollabCheckpointAuthorityVolumePairRecord {
  const value = exactRecord(source.value, 'value', [
    'authorityId',
    'authorityVolumeIdentity',
    'projectId',
    'restoreEpoch',
  ]);
  const projectId = token(value, 'projectId', isCollabProjectId);
  if (recordId !== projectId) throw invalidPayload('recordId');
  return {
    kind: 'authority-volume-pair',
    recordId,
    revision,
    value: {
      authorityId: token(value, 'authorityId'),
      authorityVolumeIdentity: token(value, 'authorityVolumeIdentity'),
      projectId,
      restoreEpoch: positiveInteger(value, 'restoreEpoch'),
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
    case 'cloud-event': return cloudEventRecord(source, recordId, revision);
    case 'cloud-event-cursor': return cloudEventCursorRecord(source, recordId, revision);
    case 'idempotency-result': return idempotencyResultRecord(source, recordId, revision);
    case 'principal-binding': return principalBindingRecord(source, recordId, revision);
    case 'repository-placement': return repositoryPlacementRecord(source, recordId, revision);
    case 'lifecycle-state': return lifecycleStateRecord(source, recordId, revision);
    case 'terminal-responder': return terminalResponderRecord(source, recordId, revision);
    case 'protected-claim-envelope':
      return protectedClaimEnvelopeRecord(source, recordId, revision);
    case 'tombstone': return tombstoneRecord(source, recordId, revision);
    case 'schema-catalog': return schemaCatalogRecord(source, recordId, revision);
    case 'server-compatibility': return serverCompatibilityRecord(source, recordId, revision);
    case 'authority-volume-pair': return authorityVolumePairRecord(source, recordId, revision);
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
  if (records.filter(item => item.kind === 'project').length !== 1) {
    throw invalidPayload('records');
  }
  if (records.some((item, index) => index > 0 && compareRecords(records[index - 1], item) >= 0)) {
    throw invalidPayload('records');
  }
  if (profile !== 'backup' && records.some(item => !PORTABLE_RECORD_KIND_SET.has(item.kind))) {
    throw invalidPayload('profile');
  }
  if (profile === 'backup') {
    const requiredKinds: readonly CollabCheckpointBackupRecordKind[] = [
      'cloud-event-cursor',
      'schema-catalog',
      'server-compatibility',
      'authority-volume-pair',
    ];
    if (requiredKinds.some(kind => records.filter(item => item.kind === kind).length !== 1)) {
      throw invalidPayload('profile');
    }
  }
  const projectRecordValue = records[0].value;
  if (projectRecordValue.projectId !== projectId) throw invalidPayload('records');
  for (const item of records) {
    let itemProjectId: string;
    if (item.kind === 'cloud-event') itemProjectId = item.value.event.projectId;
    else if (item.kind === 'protected-claim-envelope') {
      itemProjectId = item.value.associatedData.projectId;
    } else itemProjectId = item.value.projectId;
    if (itemProjectId !== projectId) throw invalidPayload('records');
  }

  const members = new Map(records
    .filter((item): item is CollabCheckpointMemberRecord => item.kind === 'member')
    .map(item => [item.value.memberId, item]));
  const requests = new Set(records
    .filter((item): item is CollabCheckpointRequestRecord => item.kind === 'request')
    .map(item => item.value.requestId));
  const tickets = new Set(records
    .filter((item): item is CollabCheckpointTicketRecord => item.kind === 'ticket')
    .map(item => item.value.ticketId));
  const ticketComments = new Map(records
    .filter((item): item is CollabCheckpointTicketCommentRecord => item.kind === 'ticket-comment')
    .map(item => [item.value.commentId, item.value.ticketId]));
  const principalBindings = new Map(records
    .filter((item): item is CollabCheckpointPrincipalBindingRecord => (
      item.kind === 'principal-binding'
    ))
    .map(item => [item.value.memberId, item.value.principalId]));
  const terminalResponders = records.filter(
    (item): item is CollabCheckpointTerminalResponderRecord => (
      item.kind === 'terminal-responder'
    ),
  );
  const tombstones = records.filter((item): item is CollabCheckpointTombstoneRecord => (
    item.kind === 'tombstone'
  ));
  if (
    terminalResponders.length > 1
    || (terminalResponders.length === 1 && (
      tombstones.length !== 1
      || terminalResponders[0].value.expiresAt !== tombstones[0].value.terminalExpiresAt
    ))
  ) throw invalidPayload('records');
  const tombstone = tombstones[0];
  const retirementTerminal = terminalResponders.find(item => (
    item.value.operation === 'retireProject'
  ));
  if (retirementTerminal !== undefined) {
    const response = canonicalOperationResponseJson(
      { responseJson: retirementTerminal.value.responseJson },
      'responseJson',
      'retireProject',
    ).decoded;
    if (tombstone === undefined || response.retiredAt !== tombstone.value.retiredAt) {
      throw invalidPayload('records');
    }
  }
  const retirementEvents = records.filter((item): item is CollabCheckpointCloudEventRecord => (
    item.kind === 'cloud-event' && item.value.event.kind === 'project.retired'
  ));
  if (tombstone !== undefined && retirementEvents.some(item => (
    item.value.event.kind === 'project.retired'
    && (
      item.value.event.payload.retiredAt !== tombstone.value.retiredAt
      || (retirementTerminal !== undefined
        && item.value.event.payload.retirementId !== retirementTerminal.value.operationId)
    )
  ))) throw invalidPayload('records');

  for (const item of records) {
    if (item.kind === 'request' && !members.has(item.value.memberId)) {
      throw invalidPayload('records');
    }
    if (item.kind === 'request-comment' && (
      !requests.has(item.value.requestId) || !members.has(item.value.authorMemberId)
    )) throw invalidPayload('records');
    if (item.kind === 'ticket' && (
      !members.has(item.value.authorMemberId)
      || (item.value.closedByMemberId !== null && !members.has(item.value.closedByMemberId))
    )) throw invalidPayload('records');
    if (item.kind === 'ticket-comment' && (
      !tickets.has(item.value.ticketId) || !members.has(item.value.authorMemberId)
    )) throw invalidPayload('records');
    if (item.kind === 'ticket-relation' && (
      !tickets.has(item.value.ticketId)
      || !requests.has(item.value.requestId)
      || !members.has(item.value.createdByMemberId)
    )) throw invalidPayload('records');
    if (item.kind === 'ticket-mention' && (
      !tickets.has(item.value.ticketId)
      || !members.has(item.value.mentionedMemberId)
      || (item.value.sourceKind === 'description' && item.value.sourceId !== item.value.ticketId)
      || (item.value.sourceKind === 'comment'
        && ticketComments.get(item.value.sourceId) !== item.value.ticketId)
    )) throw invalidPayload('records');
    if (
      (item.kind === 'idempotency-result' || item.kind === 'principal-binding')
      && !members.has(item.value.memberId)
    ) throw invalidPayload('records');
    if (item.kind === 'protected-claim-envelope'
      && members.get(item.value.memberId)?.value.status !== 'active') {
      throw invalidPayload('records');
    }
    if (item.kind === 'terminal-responder' && (
      item.value.eligibleMemberIds.some(memberId => !members.has(memberId))
      || item.value.acknowledgements.some(acknowledgement => (
        principalBindings.get(acknowledgement.memberId) !== acknowledgement.principalId
      ))
    )) throw invalidPayload('records');
  }

  if (profile === 'backup') {
    const cursor = records.find((item): item is CollabCheckpointCloudEventCursorRecord => (
      item.kind === 'cloud-event-cursor'
    ));
    if (cursor === undefined || records.some(item => (
      item.kind === 'cloud-event' && item.value.event.sequence > cursor.value.currentSequence
    ))) throw invalidPayload('records');
  }
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

function checkpointRecordGitOids(
  checkpointRecord: CollabCheckpointBackupRecord,
): readonly CollabGitOid[] {
  switch (checkpointRecord.kind) {
    case 'project': return [checkpointRecord.value.expectedMainOid];
    case 'request': return [
      checkpointRecord.value.firstBaseOid,
      checkpointRecord.value.latestHeadOid,
      ...(checkpointRecord.value.mergedOid === null
        ? []
        : [checkpointRecord.value.mergedOid]),
    ];
    case 'ticket-relation': return [
      checkpointRecord.value.commitOid,
      ...(checkpointRecord.value.acceptedMergeOid === null
        ? []
        : [checkpointRecord.value.acceptedMergeOid]),
    ];
    case 'cloud-event': return checkpointRecord.value.event.kind === 'main.updated'
      ? [checkpointRecord.value.event.payload.mainOid]
      : [];
    default: return [];
  }
}

export function validateCollabProjectCheckpointConsistency(
  manifest: CollabProjectCheckpointManifest,
  records: readonly CollabCheckpointBackupRecord[],
): readonly CollabCheckpointBackupRecord[] {
  const decodedManifest = decodeCollabProjectCheckpointManifest(manifest);
  validateRecordSequence(records, decodedManifest.profile);
  const project = records[0];
  if (
    project.kind !== 'project'
    || project.value.projectId !== decodedManifest.projectId
    || project.value.authorityGeneration !== decodedManifest.sourceAuthority.generation
    || project.value.expectedMainOid !== decodedManifest.expectedMainOid
    || records.some(record => checkpointRecordGitOids(record).some(oid => (
      !gitOidMatchesFormat(oid, decodedManifest.gitObjectFormat)
    )))
  ) throw invalidPayload('checkpoint');
  const activeMembers = records.filter((item): item is CollabCheckpointMemberRecord => (
    item.kind === 'member' && item.value.status === 'active'
  ));
  const activeMemberIds = new Set(activeMembers.map(item => item.value.memberId));
  const activeMemberRefs = activeMembers
    .map(item => item.value.personalRef)
    .sort((left, right) => left.localeCompare(right, 'en-US'));
  const manifestMemberRefs = decodedManifest.refs.slice(1).map(item => item.name);
  if (
    activeMemberRefs.length !== manifestMemberRefs.length
    || activeMemberRefs.some((item, index) => item !== manifestMemberRefs[index])
  ) throw invalidPayload('refs');
  const openRequestMemberIds = new Set<string>();
  for (const record of records) {
    if (record.kind !== 'request' || record.value.status !== 'open') continue;
    if (
      !activeMemberIds.has(record.value.memberId)
      || openRequestMemberIds.has(record.value.memberId)
    ) throw invalidPayload('refs');
    openRequestMemberIds.add(record.value.memberId);
  }
  return records;
}
