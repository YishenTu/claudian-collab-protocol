import {
  COLLAB_AUTHORITY_TRANSFER_CANCELLATION_PHASES,
  COLLAB_CLOUD_TO_LAN_TRANSFER_PHASES,
  COLLAB_LAN_TO_CLOUD_TRANSFER_PHASES,
  type CollabAuthorityRelinquishmentProof,
  type CollabAuthorityTransferReceiptVerifier,
  type CollabTransferredMembershipClaimCustodyReceipt,
  type CollabTransferredMembershipRedemptionReceipt,
  decodeCollabAuthorityRelinquishmentProof,
  decodeCollabAuthorityTransferLifecycleFence,
  decodeCollabTransferredMembershipClaimCustodyReceipt,
  decodeCollabTransferredMembershipRedemptionReceipt,
} from './CollabAuthorityTransfer';
import {
  COLLAB_MAIN_REF,
  COLLAB_MEMBER_REF_PREFIX,
} from './CollabConstants';
import {
  type CollabControlOperation,
  collabControlOperationCodec,
} from './CollabControlOperationCodecs';
import { CollabError } from './CollabError';
import {
  COLLAB_CHECKPOINT_ARTIFACT_LIMITS,
  COLLAB_CHECKPOINT_BACKUP_RECORD_KINDS,
  COLLAB_PROJECT_COORDINATION_FORMAT_VERSION,
  type CollabCheckpointAuthority,
  type CollabCheckpointBackupRecord,
  type CollabCheckpointGitRef,
  type CollabCheckpointIdempotencyResultRecord,
  type CollabCheckpointPrincipalBindingRecord,
  type CollabCheckpointTerminalResponderRecord,
  type CollabProjectCheckpointManifest,
  decodeCollabProjectCheckpointCoordinationNdjson,
  decodeCollabProjectCheckpointManifest,
  validateCollabProjectCheckpointConsistency,
} from './CollabProjectCheckpoint';
import {
  hasUtf8ByteLengthAtMost,
  isCollabGitOid,
  isCollabMemberId,
  isCollabOpaqueId,
  isCollabProjectId,
} from './CollabValidation';
import type {
  CollabIsoTimestamp,
  CollabMemberId,
  CollabProjectId,
} from './types';

export const COLLAB_PROJECT_BACKUP_COORDINATION_FORMAT_VERSION = 2 as const;

const BACKUP_CONTINUITY_RECORD_KINDS = Object.freeze([
  'lifecycle-journal',
  'authority-transfer-recovery',
  'transferred-membership-claim',
  'transfer-receipt-key',
  'transfer-claim-batch-receipt',
  'transfer-redemption-receipt',
  'terminal-principal',
  'terminal-responder-replay',
  'leave-former-principal-replay',
] as const);

export const COLLAB_PROJECT_BACKUP_RECORD_KINDS = Object.freeze([
  ...COLLAB_CHECKPOINT_BACKUP_RECORD_KINDS.slice(0, 13),
  ...BACKUP_CONTINUITY_RECORD_KINDS,
  ...COLLAB_CHECKPOINT_BACKUP_RECORD_KINDS.slice(14),
] as const);

export type CollabProjectBackupRecordKind =
  typeof COLLAB_PROJECT_BACKUP_RECORD_KINDS[number];

interface BackupRecordBase<Kind extends string, Value> {
  readonly kind: Kind;
  readonly recordId: string;
  readonly revision: number;
  readonly value: Value;
}

export type CollabProjectBackupLifecycleKind =
  | 'authority-transfer'
  | 'backup'
  | 'delete'
  | 'export'
  | 'leave'
  | 'retire';

export type CollabProjectBackupLifecycleState =
  | 'active'
  | 'cancelled'
  | 'completed'
  | 'recovery-required';

export interface CollabProjectBackupInactiveRepositoryPublication {
  readonly artifactKey: string;
  readonly bundleByteCount: number;
  readonly bundleSha256: string;
  readonly objectFormat: 'sha1' | 'sha256';
  readonly operationId: string;
  readonly placementGeneration: number;
  readonly projectId: CollabProjectId;
  readonly publicationMarkerSha256: string;
  readonly refs: readonly CollabCheckpointGitRef[];
  readonly repositoryStorageKey: string;
  readonly status: 'inactive';
  readonly storageNodeId: string;
  readonly validationMarkerSha256: string;
}

export interface CollabProjectBackupLanToCloudSourceEvidence {
  readonly checkpointManifestSha256: string;
  readonly principalId: string;
  readonly proof: string;
  readonly receiptKeyId: string;
  readonly receiptPublicKey: string;
  readonly schemaVersion: 1;
}

export interface CollabProjectBackupCloudToLanTargetEvidence {
  readonly acceptanceIntentId: string;
  readonly principalId: string;
  readonly proof: string;
  readonly receiptKeyId: string;
  readonly receiptPublicKey: string;
  readonly schemaVersion: 1;
}

export type CollabProjectBackupLifecycleJournalRecord =
  BackupRecordBase<'lifecycle-journal', {
    readonly actorMemberId: CollabMemberId | null;
    readonly batchRevision: number | null;
    readonly batchSha256: string | null;
    readonly checkpointSha256: string | null;
    readonly createdAt: CollabIsoTimestamp;
    readonly direction: 'cloud-to-lan' | 'lan-to-cloud' | null;
    readonly expectedAuthorityGeneration: number;
    readonly expectedPersonalRefOid: string | null;
    readonly idempotencyKey: string;
    readonly operationId: string;
    readonly operationKind: CollabProjectBackupLifecycleKind;
    readonly phase: string;
    readonly projectId: CollabProjectId;
    readonly recoveryFromPhase: string | null;
    readonly requestFingerprint: string;
    readonly resultSha256: string | null;
    readonly scheduledAt: CollabIsoTimestamp;
    readonly state: CollabProjectBackupLifecycleState;
    readonly updatedAt: CollabIsoTimestamp;
  }>;

export type CollabProjectBackupAuthorityTransferRecoveryRecord =
  BackupRecordBase<'authority-transfer-recovery', {
    readonly cancellationRequestSha256: string | null;
    readonly createdAt: CollabIsoTimestamp;
    readonly expiresAt: CollabIsoTimestamp;
    readonly inactivePublication: CollabProjectBackupInactiveRepositoryPublication | null;
    readonly projectId: CollabProjectId;
    readonly relinquishmentProof: CollabAuthorityRelinquishmentProof | null;
    readonly sourceAuthority: CollabCheckpointAuthority;
    readonly sourceHostMemberId: CollabMemberId | null;
    readonly sourceEvidence: CollabProjectBackupLanToCloudSourceEvidence | null;
    readonly sourceReopenSha256: string | null;
    readonly stageSha256: string | null;
    readonly targetActivationProof: string | null;
    readonly targetActivationRequestSha256: string | null;
    readonly targetAuthority: CollabCheckpointAuthority;
    readonly targetHostMemberId: CollabMemberId | null;
    readonly targetEvidence: CollabProjectBackupCloudToLanTargetEvidence | null;
    readonly targetUrl: string;
    readonly transferId: string;
    readonly updatedAt: CollabIsoTimestamp;
  }>;

export type CollabProjectBackupTransferredMembershipClaimRecord =
  BackupRecordBase<'transferred-membership-claim', {
    readonly batchRevision: number;
    readonly checkpointSha256: string;
    readonly claimSha256: string;
    readonly createdAt: CollabIsoTimestamp;
    readonly expiresAt: CollabIsoTimestamp;
    readonly memberId: CollabMemberId;
    readonly operationIntentId: string | null;
    readonly projectId: CollabProjectId;
    readonly redemptionReceiptId: string | null;
    readonly state: 'redeemed' | 'revoked' | 'unclaimed';
    readonly targetPrincipalId: string | null;
    readonly transferId: string;
    readonly updatedAt: CollabIsoTimestamp;
  }>;

export type CollabProjectBackupTransferReceiptKeyRecord =
  BackupRecordBase<'transfer-receipt-key', CollabAuthorityTransferReceiptVerifier & {
    readonly createdAt: CollabIsoTimestamp;
  }>;

export type CollabProjectBackupTransferClaimBatchReceiptRecord =
  BackupRecordBase<'transfer-claim-batch-receipt', {
    readonly receipt: CollabTransferredMembershipClaimCustodyReceipt;
  }>;

export type CollabProjectBackupTransferRedemptionReceiptRecord =
  BackupRecordBase<'transfer-redemption-receipt', {
    readonly acknowledgedAt: CollabIsoTimestamp | null;
    readonly projectId: CollabProjectId;
    readonly receipt: CollabTransferredMembershipRedemptionReceipt;
  }>;

export type CollabProjectBackupTerminalPrincipalRecord =
  BackupRecordBase<'terminal-principal', {
    readonly acknowledgedAt: CollabIsoTimestamp | null;
    readonly memberId: CollabMemberId;
    readonly operationId: string;
    readonly operationKind: 'authority-transfer' | 'retire';
    readonly principalId: string;
    readonly projectId: CollabProjectId;
  }>;

export type CollabProjectBackupTerminalResponderReplayRecord =
  BackupRecordBase<'terminal-responder-replay', {
    readonly memberId: CollabMemberId;
    readonly operationId: string;
    readonly projectId: CollabProjectId;
    readonly requestSha256: string;
  }>;

export type CollabProjectBackupLeaveFormerPrincipalReplayRecord =
  BackupRecordBase<'leave-former-principal-replay', {
    readonly completedAt: CollabIsoTimestamp | null;
    readonly createdAt: CollabIsoTimestamp;
    readonly expectedPersonalRefOid: string;
    readonly expiresAt: CollabIsoTimestamp;
    readonly intentId: string;
    readonly memberId: CollabMemberId;
    readonly operationId: string;
    readonly principalSha256: string;
    readonly projectId: CollabProjectId;
    readonly requestFingerprint: string;
    readonly resultSha256: string | null;
    readonly state: 'completed' | 'recovering';
  }>;

export type CollabProjectBackupContinuityRecord =
  | CollabProjectBackupLifecycleJournalRecord
  | CollabProjectBackupAuthorityTransferRecoveryRecord
  | CollabProjectBackupTransferredMembershipClaimRecord
  | CollabProjectBackupTransferReceiptKeyRecord
  | CollabProjectBackupTransferClaimBatchReceiptRecord
  | CollabProjectBackupTransferRedemptionReceiptRecord
  | CollabProjectBackupTerminalPrincipalRecord
  | CollabProjectBackupTerminalResponderReplayRecord
  | CollabProjectBackupLeaveFormerPrincipalReplayRecord;

type CollabProjectBackupBaseRecord = Exclude<
  CollabCheckpointBackupRecord,
  { readonly kind: 'lifecycle-state' }
>;

export type CollabProjectBackupRecord =
  | CollabProjectBackupBaseRecord
  | CollabProjectBackupContinuityRecord;

export type CollabProjectBackupCheckpointManifest = Omit<
  CollabProjectCheckpointManifest,
  'coordinationFormatVersion' | 'profile'
> & {
  readonly coordinationFormatVersion:
    typeof COLLAB_PROJECT_BACKUP_COORDINATION_FORMAT_VERSION;
  readonly profile: 'backup';
};

type UnknownRecord = Readonly<Record<string, unknown>>;

const CONTINUITY_KIND_SET: ReadonlySet<string> = new Set(BACKUP_CONTINUITY_RECORD_KINDS);
const BACKUP_KIND_SET: ReadonlySet<string> = new Set(COLLAB_PROJECT_BACKUP_RECORD_KINDS);
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const PRINCIPAL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const PHASE_PATTERN = /^[a-z][a-z0-9-]{0,63}$/u;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/u;
const STORAGE_KEY_PATTERN = /^[a-z0-9][a-z0-9_-]{0,127}$/u;
const STORAGE_NODE_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/u;
const CANCELLATION_PHASE_INDEX = new Map<string, number>(
  COLLAB_AUTHORITY_TRANSFER_CANCELLATION_PHASES.map((phase, index) => [phase, index]),
);
const BACKUP_EXPORT_ACTIVE_PHASE_SET: ReadonlySet<string> = new Set([
  'prepared',
  'coordination-captured',
  'repository-captured',
  'checkpoint-verified',
  'artifact-published',
  'cancel-intent',
]);
const BACKUP_EXPORT_CHECKPOINT_REQUIRED_PHASE_SET: ReadonlySet<string> = new Set([
  'checkpoint-verified', 'artifact-published', 'completed',
]);
const DELETE_ACTIVE_PHASE_SET: ReadonlySet<string> = new Set([
  'traffic-denied',
  'repository-delete-intent',
  'repository-removed',
  'coordination-removed',
  'tombstoned',
]);
const PLAINTEXT_CLAIM_RESPONSE_OPERATION_SET: ReadonlySet<CollabControlOperation> = new Set([
  'getTransferredMembershipClaim',
  'rotateTransferredMembershipClaims',
]);

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

function token(
  source: UnknownRecord,
  field: string,
  validate: (value: unknown) => boolean = isCollabOpaqueId,
): string {
  const value = source[field];
  if (typeof value !== 'string' || !validate(value)) throw invalidPayload(field);
  return value;
}

function nullableToken(
  source: UnknownRecord,
  field: string,
  validate: (value: unknown) => boolean = isCollabOpaqueId,
): string | null {
  return source[field] === null ? null : token(source, field, validate);
}

function positiveInteger(source: UnknownRecord, field: string): number {
  const value = source[field];
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    throw invalidPayload(field);
  }
  return value;
}

function nullablePositiveInteger(source: UnknownRecord, field: string): number | null {
  return source[field] === null ? null : positiveInteger(source, field);
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

function nullableSha256(source: UnknownRecord, field: string): string | null {
  return source[field] === null ? null : sha256(source, field);
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

function canonicalBase64urlPublicKey(source: UnknownRecord, field: string): string {
  const value = boundedString(source, field, 128);
  if (!BASE64URL_PATTERN.test(value)) throw invalidPayload(field);
  const remainder = value.length % 4;
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const finalIndex = alphabet.indexOf(value[value.length - 1]);
  const decodedBytes = Math.floor(value.length * 6 / 8);
  if (
    remainder === 1
    || (remainder === 2 && (finalIndex & 15) !== 0)
    || (remainder === 3 && (finalIndex & 3) !== 0)
    || decodedBytes !== 32
  ) throw invalidPayload(field);
  return value;
}

function proofValue(source: UnknownRecord, field: string): string {
  const value = boundedString(source, field, 4096);
  if (!BASE64URL_PATTERN.test(value)) throw invalidPayload(field);
  return value;
}

function absoluteTargetUrl(source: UnknownRecord): string {
  const targetUrl = boundedString(source, 'targetUrl', 2048);
  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    throw invalidPayload('targetUrl');
  }
  if (
    (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
    || parsed.username.length > 0
    || parsed.password.length > 0
    || targetUrl.includes('?')
    || targetUrl.includes('#')
  ) throw invalidPayload('targetUrl');
  return targetUrl;
}

function principal(source: UnknownRecord, field: string): string {
  return token(source, field, value => (
    typeof value === 'string' && PRINCIPAL_PATTERN.test(value)
  ));
}

function sanitizeBackupBasePrincipalRecord(item: unknown): unknown {
  const source = record(item, 'record');
  const value = record(source.value, 'value');
  if (source.kind === 'principal-binding') {
    return {
      ...source,
      value: { ...value, principalId: `principal_${String(value.memberId)}` },
    };
  }
  if (source.kind === 'terminal-responder' && Array.isArray(value.acknowledgements)) {
    return {
      ...source,
      value: {
        ...value,
        acknowledgements: value.acknowledgements.map(item => ({
          ...record(item, 'acknowledgement'),
          principalId: `principal_${String(record(item, 'acknowledgement').memberId)}`,
        })),
      },
    };
  }
  return item;
}

function restoreBackupBasePrincipals(
  source: UnknownRecord,
  base: CollabProjectBackupBaseRecord,
): CollabProjectBackupBaseRecord {
  if (base.kind === 'principal-binding') {
    const value = exactRecord(source.value, 'value', [
      'boundAt', 'memberId', 'principalId', 'projectId',
    ]);
    return {
      ...base,
      value: { ...base.value, principalId: principal(value, 'principalId') },
    } satisfies CollabCheckpointPrincipalBindingRecord;
  }
  if (base.kind === 'terminal-responder') {
    const value = exactRecord(source.value, 'value', [
      'acknowledgements',
      'eligibleMemberIds',
      'expiresAt',
      'operation',
      'operationId',
      'projectId',
      'responseJson',
    ]);
    const sourceAcknowledgements = value.acknowledgements;
    if (
      !Array.isArray(sourceAcknowledgements)
      || sourceAcknowledgements.length !== base.value.acknowledgements.length
    ) throw invalidPayload('acknowledgements');
    const acknowledgements = base.value.acknowledgements.map((item, index) => {
      const original = exactRecord(sourceAcknowledgements[index], 'acknowledgement', [
        'acknowledgedAt', 'memberId', 'principalId',
      ]);
      return { ...item, principalId: principal(original, 'principalId') };
    });
    if (new Set(acknowledgements.map(item => item.principalId)).size !== acknowledgements.length) {
      throw invalidPayload('acknowledgements');
    }
    return { ...base, value: { ...base.value, acknowledgements } };
  }
  return base;
}

function repositoryPublicationRef(value: unknown): CollabCheckpointGitRef {
  const source = exactRecord(value, 'ref', ['name', 'oid']);
  const name = boundedString(source, 'name', 512);
  const memberId = name.startsWith(COLLAB_MEMBER_REF_PREFIX)
    ? name.slice(COLLAB_MEMBER_REF_PREFIX.length)
    : undefined;
  if (
    name !== COLLAB_MAIN_REF
    && (memberId === undefined || !isCollabMemberId(memberId))
  ) {
    throw invalidPayload('name');
  }
  return { name, oid: token(source, 'oid', isCollabGitOid) };
}

function inactiveRepositoryPublication(
  value: unknown,
): CollabProjectBackupInactiveRepositoryPublication | null {
  if (value === null) return null;
  const source = exactRecord(value, 'inactivePublication', [
    'artifactKey',
    'bundleByteCount',
    'bundleSha256',
    'objectFormat',
    'operationId',
    'placementGeneration',
    'projectId',
    'publicationMarkerSha256',
    'refs',
    'repositoryStorageKey',
    'status',
    'storageNodeId',
    'validationMarkerSha256',
  ]);
  if (!Array.isArray(source.refs) || source.refs.length < 2) {
    throw invalidPayload('refs');
  }
  const refs = source.refs.map(repositoryPublicationRef);
  const objectFormat = literal(source, 'objectFormat', ['sha1', 'sha256']);
  const objectLength = objectFormat === 'sha1' ? 40 : 64;
  const bundleByteCount = positiveInteger(source, 'bundleByteCount');
  const repositoryStorageKey = boundedString(source, 'repositoryStorageKey', 128);
  const storageNodeId = boundedString(source, 'storageNodeId', 64);
  if (
    refs[0].name !== COLLAB_MAIN_REF
    || refs.slice(1).some(item => !item.name.startsWith(COLLAB_MEMBER_REF_PREFIX))
    || refs.some(item => item.oid.length !== objectLength)
    || refs.some((item, index) => index > 0
      && refs[index - 1].name.localeCompare(item.name, 'en-US') >= 0)
    || bundleByteCount > COLLAB_CHECKPOINT_ARTIFACT_LIMITS.maxRepositoryBundleBytes
    || !STORAGE_KEY_PATTERN.test(repositoryStorageKey)
    || !STORAGE_NODE_PATTERN.test(storageNodeId)
  ) throw invalidPayload('refs');
  const artifactKey = boundedString(source, 'artifactKey', 64);
  const placementGeneration = positiveInteger(source, 'placementGeneration');
  if (!SHA256_PATTERN.test(artifactKey) || placementGeneration !== 1) {
    throw invalidPayload('inactivePublication');
  }
  return {
    artifactKey,
    bundleByteCount,
    bundleSha256: sha256(source, 'bundleSha256'),
    objectFormat,
    operationId: token(source, 'operationId'),
    placementGeneration,
    projectId: token(source, 'projectId', isCollabProjectId),
    publicationMarkerSha256: sha256(source, 'publicationMarkerSha256'),
    refs: Object.freeze(refs),
    repositoryStorageKey,
    status: literal(source, 'status', ['inactive']),
    storageNodeId,
    validationMarkerSha256: sha256(source, 'validationMarkerSha256'),
  };
}

function lanToCloudSourceEvidence(
  value: unknown,
): CollabProjectBackupLanToCloudSourceEvidence | null {
  if (value === null) return null;
  const source = exactRecord(value, 'sourceEvidence', [
    'checkpointManifestSha256',
    'principalId',
    'proof',
    'receiptKeyId',
    'receiptPublicKey',
    'schemaVersion',
  ]);
  if (source.schemaVersion !== 1) throw invalidPayload('schemaVersion');
  return {
    checkpointManifestSha256: sha256(source, 'checkpointManifestSha256'),
    principalId: principal(source, 'principalId'),
    proof: proofValue(source, 'proof'),
    receiptKeyId: token(source, 'receiptKeyId'),
    receiptPublicKey: canonicalBase64urlPublicKey(source, 'receiptPublicKey'),
    schemaVersion: 1,
  };
}

function cloudToLanTargetEvidence(
  value: unknown,
): CollabProjectBackupCloudToLanTargetEvidence | null {
  if (value === null) return null;
  const source = exactRecord(value, 'targetEvidence', [
    'acceptanceIntentId',
    'principalId',
    'proof',
    'receiptKeyId',
    'receiptPublicKey',
    'schemaVersion',
  ]);
  if (source.schemaVersion !== 1) throw invalidPayload('schemaVersion');
  return {
    acceptanceIntentId: token(source, 'acceptanceIntentId'),
    principalId: principal(source, 'principalId'),
    proof: proofValue(source, 'proof'),
    receiptKeyId: token(source, 'receiptKeyId'),
    receiptPublicKey: canonicalBase64urlPublicKey(source, 'receiptPublicKey'),
    schemaVersion: 1,
  };
}

function operation(source: UnknownRecord, field: string): CollabControlOperation {
  const value = source[field];
  if (typeof value !== 'string') throw invalidPayload(field);
  try {
    collabControlOperationCodec(value as CollabControlOperation);
  } catch {
    throw invalidPayload(field);
  }
  return value as CollabControlOperation;
}

function recordEnvelope(value: unknown): Readonly<{
  kind: CollabProjectBackupRecordKind;
  recordId: string;
  revision: number;
  source: UnknownRecord;
}> {
  const source = exactRecord(value, 'record', ['kind', 'recordId', 'revision', 'value']);
  const kind = source.kind;
  if (typeof kind !== 'string' || !BACKUP_KIND_SET.has(kind)) throw invalidPayload('kind');
  return {
    kind: kind as CollabProjectBackupRecordKind,
    recordId: boundedString(source, 'recordId', 512),
    revision: positiveInteger(source, 'revision'),
    source,
  };
}

export function collabProjectBackupIdempotencyRecordId(input: Readonly<{
  readonly idempotencyKey: string;
  readonly memberId: CollabMemberId;
  readonly operation: CollabControlOperation;
  readonly projectId: CollabProjectId;
}>): string {
  if (
    !isCollabProjectId(input.projectId)
    || !isCollabMemberId(input.memberId)
    || !isCollabOpaqueId(input.idempotencyKey)
  ) throw invalidPayload('idempotencyIdentity');
  operation({ operation: input.operation }, 'operation');
  return `${input.projectId}:${input.memberId}:${input.operation}:${input.idempotencyKey}`;
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
  const decodedOperation = operation(value, 'operation');
  if (PLAINTEXT_CLAIM_RESPONSE_OPERATION_SET.has(decodedOperation)) {
    throw invalidPayload('responseJson');
  }
  const projectId = token(value, 'projectId', isCollabProjectId);
  const memberId = token(value, 'memberId', isCollabMemberId);
  const idempotencyKey = token(value, 'idempotencyKey');
  let responseJson: string;
  try {
    responseJson = boundedString(value, 'responseJson', 512 * 1024, true);
    const decoded = collabControlOperationCodec(decodedOperation).decodeResponse(
      JSON.parse(responseJson) as unknown,
    );
    if (
      JSON.stringify(decoded) !== responseJson
      || (typeof decoded === 'object'
        && decoded !== null
        && 'projectId' in decoded
        && decoded.projectId !== projectId)
    ) throw invalidPayload('responseJson');
  } catch {
    throw invalidPayload('responseJson');
  }
  if (recordId !== collabProjectBackupIdempotencyRecordId({
    idempotencyKey,
    memberId,
    operation: decodedOperation,
    projectId,
  })) throw invalidPayload('recordId');
  return {
    kind: 'idempotency-result',
    recordId,
    revision,
    value: {
      createdAt: timestamp(value, 'createdAt'),
      idempotencyKey,
      memberId,
      operation: decodedOperation,
      projectId,
      requestFingerprint: sha256(value, 'requestFingerprint'),
      responseJson,
    },
  };
}

function lifecycleJournalRecord(
  source: UnknownRecord,
  recordId: string,
  revision: number,
): CollabProjectBackupLifecycleJournalRecord {
  const value = exactRecord(source.value, 'value', [
    'actorMemberId',
    'batchRevision',
    'batchSha256',
    'checkpointSha256',
    'createdAt',
    'direction',
    'expectedAuthorityGeneration',
    'expectedPersonalRefOid',
    'idempotencyKey',
    'operationId',
    'operationKind',
    'phase',
    'projectId',
    'recoveryFromPhase',
    'requestFingerprint',
    'resultSha256',
    'scheduledAt',
    'state',
    'updatedAt',
  ]);
  const operationId = token(value, 'operationId');
  if (recordId !== operationId) throw invalidPayload('recordId');
  const operationKind = literal(value, 'operationKind', [
    'authority-transfer', 'backup', 'delete', 'export', 'leave', 'retire',
  ]);
  const direction = value.direction === null
    ? null
    : literal(value, 'direction', ['cloud-to-lan', 'lan-to-cloud']);
  if ((operationKind === 'authority-transfer') !== (direction !== null)) {
    throw invalidPayload('direction');
  }
  const expectedPersonalRefOid = value.expectedPersonalRefOid === null
    ? null
    : token(value, 'expectedPersonalRefOid', isCollabGitOid);
  if ((operationKind === 'leave') !== (expectedPersonalRefOid !== null)) {
    throw invalidPayload('expectedPersonalRefOid');
  }
  const batchRevision = nullablePositiveInteger(value, 'batchRevision');
  const batchSha256 = nullableSha256(value, 'batchSha256');
  const checkpointSha256 = nullableSha256(value, 'checkpointSha256');
  if (
    (batchRevision === null) !== (batchSha256 === null)
    || (batchRevision !== null && checkpointSha256 === null)
  ) throw invalidPayload('batchRevision');
  const state = literal(value, 'state', [
    'active', 'cancelled', 'completed', 'recovery-required',
  ]);
  const recoveryFromPhase = value.recoveryFromPhase === null
    ? null
    : boundedString(value, 'recoveryFromPhase', 64);
  if (
    (state === 'recovery-required') !== (recoveryFromPhase !== null)
    || (recoveryFromPhase !== null && !PHASE_PATTERN.test(recoveryFromPhase))
  ) throw invalidPayload('recoveryFromPhase');
  const phase = boundedString(value, 'phase', 64);
  if (!PHASE_PATTERN.test(phase)) throw invalidPayload('phase');
  const createdAt = timestamp(value, 'createdAt');
  const scheduledAt = timestamp(value, 'scheduledAt');
  const updatedAt = timestamp(value, 'updatedAt');
  if (
    Date.parse(scheduledAt) < Date.parse(createdAt)
    || Date.parse(updatedAt) < Date.parse(createdAt)
  ) throw invalidPayload('updatedAt');
  return {
    kind: 'lifecycle-journal',
    recordId,
    revision,
    value: {
      actorMemberId: nullableToken(value, 'actorMemberId', isCollabMemberId),
      batchRevision,
      batchSha256,
      checkpointSha256,
      createdAt,
      direction,
      expectedAuthorityGeneration: positiveInteger(value, 'expectedAuthorityGeneration'),
      expectedPersonalRefOid,
      idempotencyKey: token(value, 'idempotencyKey'),
      operationId,
      operationKind,
      phase,
      projectId: token(value, 'projectId', isCollabProjectId),
      recoveryFromPhase,
      requestFingerprint: sha256(value, 'requestFingerprint'),
      resultSha256: nullableSha256(value, 'resultSha256'),
      scheduledAt,
      state,
      updatedAt,
    },
  };
}

function nullableProof(source: UnknownRecord, field: string): string | null {
  return source[field] === null ? null : proofValue(source, field);
}

function authorityTransferRecoveryRecord(
  source: UnknownRecord,
  recordId: string,
  revision: number,
): CollabProjectBackupAuthorityTransferRecoveryRecord {
  const value = exactRecord(source.value, 'value', [
    'cancellationRequestSha256',
    'createdAt',
    'expiresAt',
    'inactivePublication',
    'projectId',
    'relinquishmentProof',
    'sourceAuthority',
    'sourceHostMemberId',
    'sourceEvidence',
    'sourceReopenSha256',
    'stageSha256',
    'targetActivationProof',
    'targetActivationRequestSha256',
    'targetAuthority',
    'targetHostMemberId',
    'targetEvidence',
    'targetUrl',
    'transferId',
    'updatedAt',
  ]);
  const transferId = token(value, 'transferId');
  if (recordId !== transferId) throw invalidPayload('recordId');
  const projectId = token(value, 'projectId', isCollabProjectId);
  const sourceAuthority = authority(value.sourceAuthority, 'sourceAuthority');
  const targetAuthority = authority(value.targetAuthority, 'targetAuthority');
  const sourceHostMemberId = nullableToken(value, 'sourceHostMemberId', isCollabMemberId);
  const targetHostMemberId = nullableToken(value, 'targetHostMemberId', isCollabMemberId);
  const inactivePublication = inactiveRepositoryPublication(value.inactivePublication);
  const sourceEvidence = lanToCloudSourceEvidence(value.sourceEvidence);
  const targetEvidence = cloudToLanTargetEvidence(value.targetEvidence);
  if (
    sourceAuthority.kind === targetAuthority.kind
    || targetAuthority.generation !== sourceAuthority.generation + 1
    || (sourceAuthority.kind === 'lan'
      ? sourceHostMemberId === null || targetHostMemberId !== null
      : sourceHostMemberId !== null || targetHostMemberId === null)
    || (sourceAuthority.kind === 'lan'
      ? targetEvidence !== null
      : sourceEvidence !== null || inactivePublication !== null)
  ) throw invalidPayload('sourceAuthority');
  if (inactivePublication !== null && (
    inactivePublication.projectId !== projectId
    || inactivePublication.operationId !== transferId
  )) throw invalidPayload('inactivePublication');
  const relinquishmentProof = value.relinquishmentProof === null
    ? null
    : decodeCollabAuthorityRelinquishmentProof(value.relinquishmentProof);
  if (relinquishmentProof !== null && (
    relinquishmentProof.projectId !== projectId
    || relinquishmentProof.transferId !== transferId
    || relinquishmentProof.sourceAuthority.kind !== sourceAuthority.kind
    || relinquishmentProof.sourceAuthority.generation !== sourceAuthority.generation
    || relinquishmentProof.sourceHostMemberId !== sourceHostMemberId
    || relinquishmentProof.targetAuthority.kind !== targetAuthority.kind
    || relinquishmentProof.targetAuthority.generation !== targetAuthority.generation
  )) throw invalidPayload('relinquishmentProof');
  const createdAt = timestamp(value, 'createdAt');
  const expiresAt = timestamp(value, 'expiresAt');
  const updatedAt = timestamp(value, 'updatedAt');
  if (
    Date.parse(expiresAt) <= Date.parse(createdAt)
    || Date.parse(updatedAt) < Date.parse(createdAt)
  ) throw invalidPayload('updatedAt');
  return {
    kind: 'authority-transfer-recovery',
    recordId,
    revision,
    value: {
      cancellationRequestSha256: nullableSha256(value, 'cancellationRequestSha256'),
      createdAt,
      expiresAt,
      inactivePublication,
      projectId,
      relinquishmentProof,
      sourceAuthority,
      sourceHostMemberId,
      sourceEvidence,
      sourceReopenSha256: nullableSha256(value, 'sourceReopenSha256'),
      stageSha256: nullableSha256(value, 'stageSha256'),
      targetActivationProof: nullableProof(value, 'targetActivationProof'),
      targetActivationRequestSha256: nullableSha256(
        value,
        'targetActivationRequestSha256',
      ),
      targetAuthority,
      targetHostMemberId,
      targetEvidence,
      targetUrl: absoluteTargetUrl(value),
      transferId,
      updatedAt,
    },
  };
}

function transferredMembershipClaimRecord(
  source: UnknownRecord,
  recordId: string,
  revision: number,
): CollabProjectBackupTransferredMembershipClaimRecord {
  const value = exactRecord(source.value, 'value', [
    'batchRevision',
    'checkpointSha256',
    'claimSha256',
    'createdAt',
    'expiresAt',
    'memberId',
    'operationIntentId',
    'projectId',
    'redemptionReceiptId',
    'state',
    'targetPrincipalId',
    'transferId',
    'updatedAt',
  ]);
  const transferId = token(value, 'transferId');
  const memberId = token(value, 'memberId', isCollabMemberId);
  if (recordId !== `${transferId}:${memberId}`) throw invalidPayload('recordId');
  const state = literal(value, 'state', ['redeemed', 'revoked', 'unclaimed']);
  const targetPrincipalId = nullableToken(value, 'targetPrincipalId', value => (
    typeof value === 'string' && PRINCIPAL_PATTERN.test(value)
  ));
  const operationIntentId = nullableToken(value, 'operationIntentId');
  const redemptionReceiptId = nullableToken(value, 'redemptionReceiptId');
  if (
    (state !== 'redeemed'
      && (targetPrincipalId !== null
        || operationIntentId !== null
        || redemptionReceiptId !== null))
    || (state === 'redeemed'
      && (targetPrincipalId === null
        || operationIntentId === null
        || redemptionReceiptId === null))
  ) throw invalidPayload('state');
  const createdAt = timestamp(value, 'createdAt');
  const expiresAt = timestamp(value, 'expiresAt');
  const updatedAt = timestamp(value, 'updatedAt');
  if (
    Date.parse(expiresAt) <= Date.parse(createdAt)
    || Date.parse(updatedAt) < Date.parse(createdAt)
  ) throw invalidPayload('updatedAt');
  return {
    kind: 'transferred-membership-claim',
    recordId,
    revision,
    value: {
      batchRevision: positiveInteger(value, 'batchRevision'),
      checkpointSha256: sha256(value, 'checkpointSha256'),
      claimSha256: sha256(value, 'claimSha256'),
      createdAt,
      expiresAt,
      memberId,
      operationIntentId,
      projectId: token(value, 'projectId', isCollabProjectId),
      redemptionReceiptId,
      state,
      targetPrincipalId,
      transferId,
      updatedAt,
    },
  };
}

function transferReceiptKeyRecord(
  source: UnknownRecord,
  recordId: string,
  revision: number,
): CollabProjectBackupTransferReceiptKeyRecord {
  const value = exactRecord(source.value, 'value', [
    'createdAt',
    'projectId',
    'receiptKeyId',
    'receiptPublicKey',
    'receiptPublicKeyEncoding',
    'signatureAlgorithm',
    'transferId',
  ]);
  const transferId = token(value, 'transferId');
  const receiptKeyId = token(value, 'receiptKeyId');
  if (recordId !== `${transferId}:${receiptKeyId}`) throw invalidPayload('recordId');
  return {
    kind: 'transfer-receipt-key',
    recordId,
    revision,
    value: {
      createdAt: timestamp(value, 'createdAt'),
      projectId: token(value, 'projectId', isCollabProjectId),
      receiptKeyId,
      receiptPublicKey: canonicalBase64urlPublicKey(value, 'receiptPublicKey'),
      receiptPublicKeyEncoding: literal(
        value,
        'receiptPublicKeyEncoding',
        ['base64url-raw'],
      ),
      signatureAlgorithm: literal(value, 'signatureAlgorithm', ['ed25519']),
      transferId,
    },
  };
}

function transferClaimBatchReceiptRecord(
  source: UnknownRecord,
  recordId: string,
  revision: number,
): CollabProjectBackupTransferClaimBatchReceiptRecord {
  const value = exactRecord(source.value, 'value', ['receipt']);
  const receipt = decodeCollabTransferredMembershipClaimCustodyReceipt(value.receipt);
  if (recordId !== receipt.transferId) throw invalidPayload('recordId');
  return { kind: 'transfer-claim-batch-receipt', recordId, revision, value: { receipt } };
}

function transferRedemptionReceiptRecord(
  source: UnknownRecord,
  recordId: string,
  revision: number,
): CollabProjectBackupTransferRedemptionReceiptRecord {
  const value = exactRecord(source.value, 'value', [
    'acknowledgedAt',
    'projectId',
    'receipt',
  ]);
  const receipt = decodeCollabTransferredMembershipRedemptionReceipt(value.receipt);
  const projectId = token(value, 'projectId', isCollabProjectId);
  if (
    projectId !== receipt.projectId
    || recordId !== `${receipt.transferId}:${receipt.memberId}`
  ) throw invalidPayload('recordId');
  const acknowledgedAt = nullableTimestamp(value, 'acknowledgedAt');
  if (
    acknowledgedAt !== null
    && Date.parse(acknowledgedAt) < Date.parse(receipt.redeemedAt)
  ) throw invalidPayload('acknowledgedAt');
  return {
    kind: 'transfer-redemption-receipt',
    recordId,
    revision,
    value: { acknowledgedAt, projectId, receipt },
  };
}

function terminalPrincipalRecord(
  source: UnknownRecord,
  recordId: string,
  revision: number,
): CollabProjectBackupTerminalPrincipalRecord {
  const value = exactRecord(source.value, 'value', [
    'acknowledgedAt',
    'memberId',
    'operationId',
    'operationKind',
    'principalId',
    'projectId',
  ]);
  const operationId = token(value, 'operationId');
  const memberId = token(value, 'memberId', isCollabMemberId);
  if (recordId !== `${operationId}:${memberId}`) throw invalidPayload('recordId');
  return {
    kind: 'terminal-principal',
    recordId,
    revision,
    value: {
      acknowledgedAt: nullableTimestamp(value, 'acknowledgedAt'),
      memberId,
      operationId,
      operationKind: literal(value, 'operationKind', ['authority-transfer', 'retire']),
      principalId: principal(value, 'principalId'),
      projectId: token(value, 'projectId', isCollabProjectId),
    },
  };
}

function terminalResponderReplayRecord(
  source: UnknownRecord,
  recordId: string,
  revision: number,
): CollabProjectBackupTerminalResponderReplayRecord {
  const value = exactRecord(source.value, 'value', [
    'memberId', 'operationId', 'projectId', 'requestSha256',
  ]);
  const operationId = token(value, 'operationId');
  if (recordId !== operationId) throw invalidPayload('recordId');
  return {
    kind: 'terminal-responder-replay',
    recordId,
    revision,
    value: {
      memberId: token(value, 'memberId', isCollabMemberId),
      operationId,
      projectId: token(value, 'projectId', isCollabProjectId),
      requestSha256: sha256(value, 'requestSha256'),
    },
  };
}

function leaveFormerPrincipalReplayRecord(
  source: UnknownRecord,
  recordId: string,
  revision: number,
): CollabProjectBackupLeaveFormerPrincipalReplayRecord {
  const value = exactRecord(source.value, 'value', [
    'completedAt',
    'createdAt',
    'expectedPersonalRefOid',
    'expiresAt',
    'intentId',
    'memberId',
    'operationId',
    'principalSha256',
    'projectId',
    'requestFingerprint',
    'resultSha256',
    'state',
  ]);
  const operationId = token(value, 'operationId');
  if (recordId !== operationId) throw invalidPayload('recordId');
  const state = literal(value, 'state', ['completed', 'recovering']);
  const completedAt = nullableTimestamp(value, 'completedAt');
  const resultSha256 = nullableSha256(value, 'resultSha256');
  if (
    (state === 'completed' && (completedAt === null || resultSha256 === null))
    || (state === 'recovering' && (completedAt !== null || resultSha256 !== null))
  ) {
    throw invalidPayload('state');
  }
  const createdAt = timestamp(value, 'createdAt');
  const expiresAt = timestamp(value, 'expiresAt');
  if (
    Date.parse(expiresAt) <= Date.parse(createdAt)
    || (completedAt !== null && Date.parse(completedAt) < Date.parse(createdAt))
  ) throw invalidPayload('completedAt');
  return {
    kind: 'leave-former-principal-replay',
    recordId,
    revision,
    value: {
      completedAt,
      createdAt,
      expectedPersonalRefOid: token(value, 'expectedPersonalRefOid', isCollabGitOid),
      expiresAt,
      intentId: token(value, 'intentId'),
      memberId: token(value, 'memberId', isCollabMemberId),
      operationId,
      principalSha256: sha256(value, 'principalSha256'),
      projectId: token(value, 'projectId', isCollabProjectId),
      requestFingerprint: sha256(value, 'requestFingerprint'),
      resultSha256,
      state,
    },
  };
}

function decodeContinuityRecord(
  kind: typeof BACKUP_CONTINUITY_RECORD_KINDS[number],
  source: UnknownRecord,
  recordId: string,
  revision: number,
): CollabProjectBackupContinuityRecord {
  switch (kind) {
    case 'lifecycle-journal': return lifecycleJournalRecord(source, recordId, revision);
    case 'authority-transfer-recovery':
      return authorityTransferRecoveryRecord(source, recordId, revision);
    case 'transferred-membership-claim':
      return transferredMembershipClaimRecord(source, recordId, revision);
    case 'transfer-receipt-key': return transferReceiptKeyRecord(source, recordId, revision);
    case 'transfer-claim-batch-receipt':
      return transferClaimBatchReceiptRecord(source, recordId, revision);
    case 'transfer-redemption-receipt':
      return transferRedemptionReceiptRecord(source, recordId, revision);
    case 'terminal-principal': return terminalPrincipalRecord(source, recordId, revision);
    case 'terminal-responder-replay':
      return terminalResponderReplayRecord(source, recordId, revision);
    case 'leave-former-principal-replay':
      return leaveFormerPrincipalReplayRecord(source, recordId, revision);
  }
}

function kindOrder(kind: CollabProjectBackupRecordKind): number {
  return COLLAB_PROJECT_BACKUP_RECORD_KINDS.indexOf(kind);
}

function compareRecords(left: CollabProjectBackupRecord, right: CollabProjectBackupRecord): number {
  const difference = kindOrder(left.kind) - kindOrder(right.kind);
  return difference === 0
    ? left.recordId.localeCompare(right.recordId, 'en-US')
    : difference;
}

function recordProjectId(item: CollabProjectBackupRecord): string {
  if (item.kind === 'cloud-event') return item.value.event.projectId;
  if (item.kind === 'protected-claim-envelope') return item.value.associatedData.projectId;
  if (item.kind === 'transfer-claim-batch-receipt') return item.value.receipt.projectId;
  return item.value.projectId;
}

function lifecycleJournalHasInvalidSemantics(
  item: CollabProjectBackupLifecycleJournalRecord,
): boolean {
  const value = item.value;
  const effectivePhase = value.state === 'recovery-required'
    ? value.recoveryFromPhase
    : value.phase;
  if (effectivePhase === null) return true;
  const hasResult = value.resultSha256 !== null;
  const hasCheckpoint = value.checkpointSha256 !== null;
  const hasTransferBatch = value.batchRevision !== null || value.batchSha256 !== null;
  if (value.operationKind === 'authority-transfer') {
    return value.state === 'recovery-required'
      || hasResult !== (value.state === 'completed');
  }
  if (hasTransferBatch) return true;
  if (value.operationKind === 'backup' || value.operationKind === 'export') {
    const statePhaseInvalid = value.state === 'active'
      ? !BACKUP_EXPORT_ACTIVE_PHASE_SET.has(value.phase)
      : value.state === 'recovery-required'
        ? value.phase !== value.recoveryFromPhase
          || !BACKUP_EXPORT_ACTIVE_PHASE_SET.has(effectivePhase)
        : value.state === 'cancelled'
          ? value.phase !== 'cancelled'
          : value.phase !== 'completed';
    const checkpointRequired = BACKUP_EXPORT_CHECKPOINT_REQUIRED_PHASE_SET.has(
      effectivePhase,
    );
    const checkpointOptional = effectivePhase === 'cancel-intent'
      || effectivePhase === 'cancelled';
    const resultRequired = effectivePhase === 'artifact-published'
      || value.state === 'completed';
    return statePhaseInvalid
      || (!checkpointOptional && hasCheckpoint !== checkpointRequired)
      || hasResult !== resultRequired;
  }
  if (hasCheckpoint) return true;
  if (value.operationKind === 'leave') {
    const statePhaseValid = (value.state === 'active' && (
      value.phase === 'prepared'
      || value.phase === 'membership-left'
      || value.phase === 'personal-ref-removed'
    )) || (
      value.state === 'recovery-required'
      && value.phase === 'recovery-required'
      && value.recoveryFromPhase === 'membership-left'
    ) || (
      value.state === 'cancelled'
      && value.phase === 'manager-succession-required'
    ) || (value.state === 'completed' && value.phase === 'completed');
    return !statePhaseValid || hasResult !== (value.state === 'completed');
  }
  if (value.operationKind === 'retire') {
    return value.state !== 'completed' || value.phase !== 'completed' || !hasResult;
  }
  const deleteStatePhaseValid = (value.state === 'active'
    && DELETE_ACTIVE_PHASE_SET.has(value.phase))
    || (value.state === 'completed' && value.phase === 'completed');
  return !deleteStatePhaseValid || hasResult !== (value.state === 'completed');
}

function validateContinuity(records: readonly CollabProjectBackupRecord[]): void {
  if (
    records.length === 0
    || records[0].kind !== 'project'
    || records.some((item, index) => index > 0 && compareRecords(records[index - 1], item) >= 0)
  ) throw invalidPayload('records');
  const projectId = records[0].value.projectId;
  const projectAuthorityGeneration = records[0].value.authorityGeneration;
  if (records.some(item => recordProjectId(item) !== projectId)) throw invalidPayload('records');

  const memberRecords = new Map(records
    .filter(item => item.kind === 'member')
    .map(item => [item.value.memberId, item]));
  const members = new Set(memberRecords.keys());
  const principalBindingRecords = records.filter(item => item.kind === 'principal-binding');
  const principalBindings = new Map(principalBindingRecords
    .map(item => [item.value.memberId, item.value.principalId]));
  const lifecycles = new Map(records
    .filter((item): item is CollabProjectBackupLifecycleJournalRecord => (
      item.kind === 'lifecycle-journal'
    ))
    .map(item => [item.value.operationId, item]));
  const recoveries = new Map(records
    .filter((item): item is CollabProjectBackupAuthorityTransferRecoveryRecord => (
      item.kind === 'authority-transfer-recovery'
    ))
    .map(item => [item.value.transferId, item]));
  const keys = new Map(records
    .filter((item): item is CollabProjectBackupTransferReceiptKeyRecord => (
      item.kind === 'transfer-receipt-key'
    ))
    .map(item => [`${item.value.transferId}:${item.value.receiptKeyId}`, item]));
  const claimRecords = records
    .filter((item): item is CollabProjectBackupTransferredMembershipClaimRecord => (
      item.kind === 'transferred-membership-claim'
    ));
  const claims = new Map(claimRecords
    .map(item => [`${item.value.transferId}:${item.value.memberId}`, item]));
  const redemptionReceiptRecords = records
    .filter((item): item is CollabProjectBackupTransferRedemptionReceiptRecord => (
      item.kind === 'transfer-redemption-receipt'
    ));
  const redemptionReceipts = new Map(redemptionReceiptRecords
    .map(item => [`${item.value.receipt.transferId}:${item.value.receipt.memberId}`, item]));
  const protectedEnvelopes = new Map(records
    .filter(item => item.kind === 'protected-claim-envelope')
    .map(item => [`${item.value.transferId}:${item.value.memberId}`, item]));
  const batchReceipts = new Map(records
    .filter((item): item is CollabProjectBackupTransferClaimBatchReceiptRecord => (
      item.kind === 'transfer-claim-batch-receipt'
    ))
    .map(item => [item.value.receipt.transferId, item]));
  const terminalResponders = new Map(records
    .filter((item): item is CollabCheckpointTerminalResponderRecord => (
      item.kind === 'terminal-responder'
    ))
    .map(item => [item.value.operationId, item]));
  const terminalPrincipals = new Map(records
    .filter((item): item is CollabProjectBackupTerminalPrincipalRecord => (
      item.kind === 'terminal-principal'
    ))
    .map(item => [`${item.value.operationId}:${item.value.memberId}`, item]));
  const responderReplays = new Map(records
    .filter((item): item is CollabProjectBackupTerminalResponderReplayRecord => (
      item.kind === 'terminal-responder-replay'
    ))
    .map(item => [item.value.operationId, item]));
  const leaveReplays = new Map(records
    .filter((item): item is CollabProjectBackupLeaveFormerPrincipalReplayRecord => (
      item.kind === 'leave-former-principal-replay'
    ))
    .map(item => [item.value.operationId, item]));

  const nonterminalLifecycles = [...lifecycles.values()].filter(item => (
    item.value.state === 'active' || item.value.state === 'recovery-required'
  ));
  if (
    nonterminalLifecycles.length > 1
    || principalBindingRecords.some(item => (
      memberRecords.get(item.value.memberId)?.value.status !== 'active'
    ))
    || new Set(principalBindingRecords.map(item => item.value.principalId)).size
      !== principalBindingRecords.length
    || new Set(claimRecords.map(item => (
      `${item.value.transferId}:${item.value.claimSha256}`
    ))).size !== claimRecords.length
    || new Set(redemptionReceiptRecords.map(item => (
      `${item.value.receipt.transferId}:${item.value.receipt.receiptId}`
    ))).size !== redemptionReceiptRecords.length
  ) throw invalidPayload('records');

  for (const lifecycle of lifecycles.values()) {
    if (
      lifecycleJournalHasInvalidSemantics(lifecycle)
      || (lifecycle.value.actorMemberId !== null
        && !members.has(lifecycle.value.actorMemberId))
    ) {
      throw invalidPayload('records');
    }
    if (
      lifecycle.value.operationKind === 'authority-transfer'
      && !recoveries.has(lifecycle.value.operationId)
    ) throw invalidPayload('records');
    if (lifecycle.value.operationKind === 'leave') {
      const actorMemberId = lifecycle.value.actorMemberId;
      const actor = actorMemberId === null ? undefined : memberRecords.get(actorMemberId);
      const replay = leaveReplays.get(lifecycle.value.operationId);
      const effectivePhase = lifecycle.value.state === 'recovery-required'
        ? lifecycle.value.recoveryFromPhase
        : lifecycle.value.phase;
      const afterMembershipSettlement = effectivePhase === 'membership-left'
        || effectivePhase === 'personal-ref-removed'
        || effectivePhase === 'completed';
      if (
        actor === undefined
        || (lifecycle.value.state === 'completed') !== (lifecycle.value.phase === 'completed')
        || (afterMembershipSettlement && (
          actor.value.status !== 'left'
          || principalBindings.has(actor.value.memberId)
          || replay === undefined
        ))
        || (!afterMembershipSettlement && (
          actor.value.status !== 'active'
          || !principalBindings.has(actor.value.memberId)
          || replay !== undefined
        ))
      ) throw invalidPayload('records');
    }
  }
  for (const recovery of recoveries.values()) {
    const lifecycle = lifecycles.get(recovery.value.transferId);
    if (lifecycle === undefined) throw invalidPayload('records');
    const proof = recovery.value.relinquishmentProof;
    const batchReceipt = batchReceipts.get(recovery.value.transferId)?.value.receipt;
    const evidence = recovery.value.sourceEvidence ?? recovery.value.targetEvidence;
    const receiptKey = evidence === null
      ? undefined
      : keys.get(`${recovery.value.transferId}:${evidence.receiptKeyId}`);
    const effectivePhase = lifecycle.value.state === 'recovery-required'
      ? lifecycle.value.recoveryFromPhase
      : lifecycle.value.phase;
    let relinquishmentRequired: boolean | undefined;
    try {
      if (lifecycle.value.direction !== null && effectivePhase !== null) {
        relinquishmentRequired = decodeCollabAuthorityTransferLifecycleFence({
          batchRevision: lifecycle.value.batchRevision,
          batchSha256: lifecycle.value.batchSha256,
          checkpointSha256: lifecycle.value.checkpointSha256,
          direction: lifecycle.value.direction,
          phase: effectivePhase,
        }).relinquishmentRequired;
      }
    } catch {
      throw invalidPayload('records');
    }
    const direction = lifecycle.value.direction;
    const cancellationIndex = effectivePhase === null
      ? undefined
      : CANCELLATION_PHASE_INDEX.get(effectivePhase);
    const isCancellation = cancellationIndex !== undefined;
    const cleanupCompleted = isCancellation && cancellationIndex >= 2;
    const normalPhaseIndex = direction === 'cloud-to-lan'
      ? COLLAB_CLOUD_TO_LAN_TRANSFER_PHASES.indexOf(
        effectivePhase as typeof COLLAB_CLOUD_TO_LAN_TRANSFER_PHASES[number],
      )
      : COLLAB_LAN_TO_CLOUD_TRANSFER_PHASES.indexOf(
        effectivePhase as typeof COLLAB_LAN_TO_CLOUD_TRANSFER_PHASES[number],
      );
    const stageRequired = !isCancellation && normalPhaseIndex >= 3;
    const targetEvidenceRequired = direction === 'cloud-to-lan'
      && !isCancellation
      && normalPhaseIndex >= 1;
    const activationEvidenceRequired = direction === 'cloud-to-lan'
      && !isCancellation
      && normalPhaseIndex >= 6;
    const publicationRequired = direction === 'lan-to-cloud'
      && !isCancellation
      && normalPhaseIndex >= 5;
    const publicationForbidden = direction === 'cloud-to-lan'
      || (!isCancellation && normalPhaseIndex < 4);
    const sourceReopenRequired = isCancellation && (
      direction === 'cloud-to-lan'
        ? cancellationIndex >= 1
        : cancellationIndex >= 3
    );
    const recoveryEvidenceInvalid = direction === null
      || (direction === 'lan-to-cloud' && recovery.value.sourceEvidence === null)
      || (targetEvidenceRequired && recovery.value.targetEvidence === null)
      || (!isCancellation && (
        stageRequired !== (recovery.value.stageSha256 !== null)
      ))
      || (direction === 'lan-to-cloud'
        && recovery.value.stageSha256 !== null
        && recovery.value.stageSha256 !== lifecycle.value.checkpointSha256)
      || activationEvidenceRequired !== (
        recovery.value.targetActivationProof !== null
        && recovery.value.targetActivationRequestSha256 !== null
      )
      || ((recovery.value.targetActivationProof === null)
        !== (recovery.value.targetActivationRequestSha256 === null))
      || (publicationRequired && recovery.value.inactivePublication === null)
      || (publicationForbidden && recovery.value.inactivePublication !== null)
      || isCancellation !== (recovery.value.cancellationRequestSha256 !== null)
      || sourceReopenRequired !== (recovery.value.sourceReopenSha256 !== null);
    const expectedProjectAuthorityGeneration = relinquishmentRequired === true
      ? recovery.value.targetAuthority.generation
      : recovery.value.sourceAuthority.generation;
    if (recoveryEvidenceInvalid) throw invalidPayload('records');
    if (cleanupCompleted && (
      (direction === 'cloud-to-lan' && [...protectedEnvelopes.values()].some(item => (
        item.value.transferId === recovery.value.transferId
      )))
      || (direction === 'lan-to-cloud' && claimRecords.some(item => (
        item.value.transferId === recovery.value.transferId
      )))
    )) throw invalidPayload('records');
    if (projectAuthorityGeneration !== expectedProjectAuthorityGeneration) {
      throw invalidPayload('records');
    }
    if (!isCancellation) {
      const hostMemberId = direction === 'lan-to-cloud'
        ? recovery.value.sourceHostMemberId
        : recovery.value.targetHostMemberId;
      const eligibleMemberIds = [...memberRecords.values()]
        .filter(item => item.value.status === 'active' && item.value.memberId !== hostMemberId)
        .map(item => item.value.memberId);
      const memberCustodyRequired = normalPhaseIndex >= 3;
      const batchReceiptRequired = direction === 'cloud-to-lan'
        ? normalPhaseIndex >= 3
        : normalPhaseIndex >= 4;
      if ((batchReceipt !== undefined) !== batchReceiptRequired) {
        throw invalidPayload('records');
      }
      for (const memberId of eligibleMemberIds) {
        const identity = `${recovery.value.transferId}:${memberId}`;
        const claimPresent = claims.has(identity);
        const envelopePresent = protectedEnvelopes.has(identity);
        const redemptionPresent = redemptionReceipts.has(identity);
        const exactMemberCustody = direction === 'lan-to-cloud'
          ? claimPresent && !envelopePresent
          : !claimPresent && envelopePresent !== redemptionPresent;
        if (memberCustodyRequired !== exactMemberCustody) {
          throw invalidPayload('records');
        }
      }
    }
    if (recovery.value.targetEvidence !== null && (
      recovery.value.targetHostMemberId === null
      || principalBindings.get(recovery.value.targetHostMemberId)
        !== recovery.value.targetEvidence.principalId
    )) throw invalidPayload('records');
    if (
      lifecycle.value.operationKind !== 'authority-transfer'
      || relinquishmentRequired === undefined
      || relinquishmentRequired !== (proof !== null)
      || (lifecycle.value.state === 'cancelled') !== (lifecycle.value.phase === 'cancelled')
      || (lifecycle.value.state === 'completed') !== (lifecycle.value.phase === 'completed')
      || (lifecycle.value.state === 'active'
        && (lifecycle.value.phase === 'cancelled' || lifecycle.value.phase === 'completed'))
      || lifecycle.value.direction !== (recovery.value.sourceAuthority.kind === 'cloud'
        ? 'cloud-to-lan'
        : 'lan-to-cloud')
      || lifecycle.value.expectedAuthorityGeneration !== recovery.value.sourceAuthority.generation
      || lifecycle.value.scheduledAt !== recovery.value.expiresAt
      || (recovery.value.sourceHostMemberId !== null
        && !members.has(recovery.value.sourceHostMemberId))
      || (recovery.value.targetHostMemberId !== null
        && !members.has(recovery.value.targetHostMemberId))
      || (proof !== null && (
        proof.batchRevision !== lifecycle.value.batchRevision
        || proof.batchSha256 !== lifecycle.value.batchSha256
        || proof.checkpointSha256 !== lifecycle.value.checkpointSha256
        || (batchReceipt !== undefined && (
          proof.batchRevision !== batchReceipt.batchRevision
          || proof.batchSha256 !== batchReceipt.batchSha256
          || proof.checkpointSha256 !== batchReceipt.checkpointSha256
        ))
      ))
      || (recovery.value.sourceEvidence !== null
        && (
          recovery.value.sourceEvidence.checkpointManifestSha256
            !== lifecycle.value.checkpointSha256
          || recovery.value.sourceHostMemberId === null
          || principalBindings.get(recovery.value.sourceHostMemberId)
            !== recovery.value.sourceEvidence.principalId
        ))
      || (evidence !== null && (
        receiptKey === undefined
        || receiptKey.value.receiptPublicKey !== evidence.receiptPublicKey
      ))
    ) throw invalidPayload('records');
  }
  for (const key of keys.values()) {
    const recovery = recoveries.get(key.value.transferId);
    const evidence = recovery?.value.sourceEvidence ?? recovery?.value.targetEvidence;
    if (
      recovery === undefined
      || evidence === null
      || evidence === undefined
      || evidence.receiptKeyId !== key.value.receiptKeyId
      || evidence.receiptPublicKey !== key.value.receiptPublicKey
    ) throw invalidPayload('records');
  }
  for (const claim of claims.values()) {
    const lifecycle = lifecycles.get(claim.value.transferId);
    const recovery = recoveries.get(claim.value.transferId);
    const redemptionReceipt = redemptionReceipts.get(
      `${claim.value.transferId}:${claim.value.memberId}`,
    );
    if (
      memberRecords.get(claim.value.memberId)?.value.status !== 'active'
      || recovery === undefined
      || recovery.value.sourceAuthority.kind !== 'lan'
      || claim.value.memberId === recovery.value.sourceHostMemberId
      || lifecycle?.value.batchRevision !== claim.value.batchRevision
      || lifecycle.value.checkpointSha256 !== claim.value.checkpointSha256
      || claim.value.expiresAt !== recovery.value.expiresAt
      || (claim.value.targetPrincipalId !== null
        && principalBindings.get(claim.value.memberId) !== claim.value.targetPrincipalId)
      || (claim.value.state === 'redeemed') !== (redemptionReceipt !== undefined)
    ) {
      throw invalidPayload('records');
    }
  }
  for (const terminal of terminalResponders.values()) {
    const operationKind = terminal.value.operation === 'getProjectAuthorityTransfer'
      ? 'authority-transfer'
      : 'retire';
    const principals = terminal.value.eligibleMemberIds.map(memberId => (
      terminalPrincipals.get(`${terminal.value.operationId}:${memberId}`)
    ));
    if (
      principals.some(item => item === undefined)
      || principals.some(item => item?.value.operationKind !== operationKind)
      || new Set(principals.map(item => item?.value.principalId)).size !== principals.length
      || (operationKind === 'authority-transfer')
        !== responderReplays.has(terminal.value.operationId)
    ) throw invalidPayload('records');
  }
  for (const item of records) {
    if (item.kind === 'idempotency-result' && !members.has(item.value.memberId)) {
      throw invalidPayload('records');
    }
    if (item.kind === 'protected-claim-envelope') {
      const identity = `${item.value.transferId}:${item.value.memberId}`;
      const recovery = recoveries.get(item.value.transferId);
      const lifecycle = lifecycles.get(item.value.transferId);
      if (
        item.recordId !== identity
        || recovery === undefined
        || lifecycle === undefined
        || memberRecords.get(item.value.memberId)?.value.status !== 'active'
        || item.value.memberId === recovery.value.targetHostMemberId
        || item.value.associatedData.authorityGeneration
          !== recovery.value.sourceAuthority.generation
        || recovery.value.sourceAuthority.kind !== 'cloud'
        || item.value.associatedData.checkpointSha256 !== lifecycle.value.checkpointSha256
        || item.value.expiresAt !== recovery.value.expiresAt
        || !keys.has(`${item.value.transferId}:${item.value.receiptKeyId}`)
        || claims.has(identity)
        || redemptionReceipts.has(identity)
      ) throw invalidPayload('records');
    }
    if (item.kind === 'transfer-claim-batch-receipt') {
      const lifecycle = lifecycles.get(item.value.receipt.transferId);
      const recovery = recoveries.get(item.value.receipt.transferId);
      if (
        lifecycle === undefined
        || recovery === undefined
        || lifecycle.value.batchRevision !== item.value.receipt.batchRevision
        || lifecycle.value.batchSha256 !== item.value.receipt.batchSha256
        || lifecycle.value.checkpointSha256 !== item.value.receipt.checkpointSha256
        || item.value.receipt.custodyAuthority.kind
          !== recovery.value.sourceAuthority.kind
        || item.value.receipt.custodyAuthority.generation
          !== recovery.value.sourceAuthority.generation
        || item.value.receipt.targetAuthorityGeneration
          !== recovery.value.targetAuthority.generation
        || item.value.receipt.submittedByMemberId !== (
          recovery.value.sourceAuthority.kind === 'lan'
            ? recovery.value.sourceHostMemberId
            : recovery.value.targetHostMemberId
        )
        || !members.has(item.value.receipt.submittedByMemberId)
      ) throw invalidPayload('records');
    }
    if (item.kind === 'transfer-redemption-receipt') {
      const receipt = item.value.receipt;
      const identity = `${receipt.transferId}:${receipt.memberId}`;
      const claim = claims.get(identity);
      const recovery = recoveries.get(receipt.transferId);
      const lifecycle = lifecycles.get(receipt.transferId);
      const terminalPrincipal = terminalPrincipals.get(identity);
      const lanToCloud = recovery?.value.sourceAuthority.kind === 'lan';
      if (
        recovery === undefined
        || lifecycle === undefined
        || memberRecords.get(receipt.memberId)?.value.status !== 'active'
        || receipt.targetAuthorityGeneration !== recovery.value.targetAuthority.generation
        || !keys.has(`${receipt.transferId}:${receipt.receiptKeyId}`)
        || Date.parse(receipt.redeemedAt) > Date.parse(recovery.value.expiresAt)
        || (lanToCloud && (
          item.value.acknowledgedAt !== null
          || claim === undefined
          || claim.value.claimSha256 !== receipt.claimSha256
          || claim.value.checkpointSha256 !== receipt.checkpointSha256
          || claim.value.operationIntentId !== receipt.operationIntentId
          || claim.value.redemptionReceiptId !== receipt.receiptId
        ))
        || (!lanToCloud && (
          item.value.acknowledgedAt === null
          || receipt.memberId === recovery.value.targetHostMemberId
          || receipt.checkpointSha256 !== lifecycle.value.checkpointSha256
          || claim !== undefined
          || protectedEnvelopes.has(identity)
          || terminalPrincipal?.value.acknowledgedAt !== item.value.acknowledgedAt
        ))
      ) throw invalidPayload('records');
    }
    if (item.kind === 'terminal-principal') {
      const terminal = terminalResponders.get(item.value.operationId);
      const acknowledgement = terminal?.value.acknowledgements.find(value => (
        value.memberId === item.value.memberId
      ));
      const expectedOperationKind = terminal?.value.operation === 'getProjectAuthorityTransfer'
        ? 'authority-transfer'
        : terminal?.value.operation === 'retireProject'
          ? 'retire'
          : undefined;
      if (
        !members.has(item.value.memberId)
        || terminal === undefined
        || expectedOperationKind !== item.value.operationKind
        || !terminal.value.eligibleMemberIds.includes(item.value.memberId)
        || (item.value.acknowledgedAt === null) !== (acknowledgement === undefined)
        || (acknowledgement !== undefined && (
          acknowledgement.acknowledgedAt !== item.value.acknowledgedAt
          || acknowledgement.principalId !== item.value.principalId
        ))
        || (item.value.acknowledgedAt !== null
          && Date.parse(item.value.acknowledgedAt) > Date.parse(terminal.value.expiresAt))
      ) throw invalidPayload('records');
    }
    if (item.kind === 'terminal-responder-replay') {
      const lifecycle = lifecycles.get(item.value.operationId);
      const terminal = terminalResponders.get(item.value.operationId);
      const recovery = recoveries.get(item.value.operationId);
      let response;
      try {
        response = terminal?.value.operation === 'getProjectAuthorityTransfer'
          ? collabControlOperationCodec('getProjectAuthorityTransfer').decodeResponse(
            JSON.parse(terminal.value.responseJson) as unknown,
          )
          : undefined;
      } catch {
        throw invalidPayload('records');
      }
      if (
        !members.has(item.value.memberId)
        || lifecycle?.value.operationKind !== 'authority-transfer'
        || lifecycle.value.direction !== 'cloud-to-lan'
        || lifecycle.value.state !== 'completed'
        || terminal === undefined
        || recovery === undefined
        || item.value.memberId !== recovery.value.targetHostMemberId
        || item.value.requestSha256 !== recovery.value.targetActivationRequestSha256
        || !terminal.value.eligibleMemberIds.includes(item.value.memberId)
        || response === undefined
        || response.batchRevision !== lifecycle.value.batchRevision
        || response.batchSha256 !== lifecycle.value.batchSha256
        || response.checkpointSha256 !== lifecycle.value.checkpointSha256
        || response.direction !== lifecycle.value.direction
        || response.expiresAt !== recovery.value.expiresAt
        || response.targetUrl !== recovery.value.targetUrl
        || JSON.stringify(response.relinquishmentProof)
          !== JSON.stringify(recovery.value.relinquishmentProof)
        || response.sourceAuthority.kind !== recovery.value.sourceAuthority.kind
        || response.sourceAuthority.generation !== recovery.value.sourceAuthority.generation
        || response.targetAuthority.kind !== recovery.value.targetAuthority.kind
        || response.targetAuthority.generation !== recovery.value.targetAuthority.generation
      ) throw invalidPayload('records');
    }
    if (item.kind === 'leave-former-principal-replay') {
      const lifecycle = lifecycles.get(item.value.operationId);
      if (
        !members.has(item.value.memberId)
        || lifecycle?.value.operationKind !== 'leave'
        || lifecycle.value.actorMemberId !== item.value.memberId
        || lifecycle.value.expectedPersonalRefOid !== item.value.expectedPersonalRefOid
        || lifecycle.value.idempotencyKey !== item.value.intentId
        || lifecycle.value.requestFingerprint !== item.value.requestFingerprint
        || lifecycle.value.resultSha256 !== item.value.resultSha256
        || (item.value.state === 'completed' && (
          lifecycle.value.state !== 'completed'
          || item.value.completedAt !== lifecycle.value.updatedAt
        ))
        || (item.value.state === 'recovering' && (
          lifecycle.value.state !== 'active'
          && lifecycle.value.state !== 'recovery-required'
        ))
      ) throw invalidPayload('records');
    }
    if (item.kind === 'tombstone') {
      const transferTerminal = [...terminalResponders.values()].find(value => (
        value.value.operation === 'getProjectAuthorityTransfer'
      ));
      const lifecycle = transferTerminal === undefined
        ? undefined
        : lifecycles.get(transferTerminal.value.operationId);
      const recovery = transferTerminal === undefined
        ? undefined
        : recoveries.get(transferTerminal.value.operationId);
      if (transferTerminal !== undefined && (
        lifecycle === undefined
        || recovery === undefined
        || item.value.authorityGeneration !== recovery.value.targetAuthority.generation
        || item.value.retiredAt !== lifecycle.value.updatedAt
      )) throw invalidPayload('records');
    }
  }
}

function manifestWithFormatOne(value: unknown): CollabProjectCheckpointManifest {
  const source = record(value, 'manifest');
  if (
    source.profile !== 'backup'
    || source.coordinationFormatVersion !== COLLAB_PROJECT_BACKUP_COORDINATION_FORMAT_VERSION
  ) throw invalidPayload('manifest');
  return decodeCollabProjectCheckpointManifest({
    ...source,
    coordinationFormatVersion: COLLAB_PROJECT_COORDINATION_FORMAT_VERSION,
  });
}

export function decodeCollabProjectBackupCheckpointManifest(
  value: unknown,
): CollabProjectBackupCheckpointManifest {
  const decoded = manifestWithFormatOne(value);
  return {
    artifacts: decoded.artifacts,
    coordinationFormatVersion: COLLAB_PROJECT_BACKUP_COORDINATION_FORMAT_VERSION,
    createdAt: decoded.createdAt,
    expectedMainOid: decoded.expectedMainOid,
    gitObjectFormat: decoded.gitObjectFormat,
    manifestSchemaVersion: decoded.manifestSchemaVersion,
    manifestSha256: decoded.manifestSha256,
    operationId: decoded.operationId,
    profile: 'backup',
    projectId: decoded.projectId,
    protocolVersion: decoded.protocolVersion,
    refs: decoded.refs,
    sourceAuthority: decoded.sourceAuthority,
    targetAuthority: decoded.targetAuthority,
  };
}

export function encodeCollabProjectBackupCheckpointManifestCanonicalJson(
  manifest: CollabProjectBackupCheckpointManifest,
): string {
  return JSON.stringify(decodeCollabProjectBackupCheckpointManifest(manifest));
}

export function encodeCollabProjectBackupCheckpointManifestDigestInput(
  manifest: CollabProjectBackupCheckpointManifest,
): string {
  const decoded = decodeCollabProjectBackupCheckpointManifest(manifest);
  return JSON.stringify({
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
  });
}

export function decodeCollabProjectBackupCheckpointCoordinationNdjson(
  value: string,
): readonly CollabProjectBackupRecord[] {
  if (
    typeof value !== 'string'
    || !value.endsWith('\n')
    || !hasUtf8ByteLengthAtMost(value, COLLAB_CHECKPOINT_ARTIFACT_LIMITS.maxCoordinationBytes)
  ) throw invalidPayload('coordination');
  const lines = value.slice(0, -1).split('\n');
  if (lines.some(line => line.length === 0)) throw invalidPayload('coordination');

  const parsed = lines.map((line) => {
    let item: unknown;
    try {
      item = JSON.parse(line) as unknown;
    } catch {
      throw invalidPayload('coordination');
    }
    if (JSON.stringify(item) !== line) throw invalidPayload('coordination');
    return { envelope: recordEnvelope(item), item };
  });

  const baseItems = parsed.filter(({ envelope }) => (
    !CONTINUITY_KIND_SET.has(envelope.kind) && envelope.kind !== 'idempotency-result'
  ));
  const baseDecoded = decodeCollabProjectCheckpointCoordinationNdjson(
    baseItems.map(({ item }) => JSON.stringify(
      sanitizeBackupBasePrincipalRecord(item),
    )).join('\n') + '\n',
    'backup',
  );
  const baseByIdentity = new Map<string, CollabProjectBackupBaseRecord>(baseDecoded.map(item => (
    [`${item.kind}\0${item.recordId}`, item as CollabProjectBackupBaseRecord] as const
  )));
  const decoded = parsed.map(({ envelope }) => {
    if (envelope.kind === 'idempotency-result') {
      return idempotencyResultRecord(
        envelope.source,
        envelope.recordId,
        envelope.revision,
      );
    }
    if (CONTINUITY_KIND_SET.has(envelope.kind)) {
      return decodeContinuityRecord(
        envelope.kind as typeof BACKUP_CONTINUITY_RECORD_KINDS[number],
        envelope.source,
        envelope.recordId,
        envelope.revision,
      );
    }
    const base = baseByIdentity.get(`${envelope.kind}\0${envelope.recordId}`);
    if (base === undefined) throw invalidPayload('records');
    return restoreBackupBasePrincipals(envelope.source, base);
  });
  if (decoded.some((item, index) => JSON.stringify(item) !== lines[index])) {
    throw invalidPayload('coordination');
  }
  validateContinuity(decoded);
  return Object.freeze(decoded);
}

export function encodeCollabProjectBackupCheckpointCoordinationNdjson(
  records: readonly CollabProjectBackupRecord[],
): string {
  const value = records.map(item => JSON.stringify(item)).join('\n') + '\n';
  return decodeCollabProjectBackupCheckpointCoordinationNdjson(value)
    .map(item => JSON.stringify(item)).join('\n') + '\n';
}

export function validateCollabProjectBackupCheckpointConsistency(
  manifest: CollabProjectBackupCheckpointManifest,
  records: readonly CollabProjectBackupRecord[],
): readonly CollabProjectBackupRecord[] {
  const decodedManifest = decodeCollabProjectBackupCheckpointManifest(manifest);
  const decodedRecords = decodeCollabProjectBackupCheckpointCoordinationNdjson(
    records.map(item => JSON.stringify(item)).join('\n') + '\n',
  );
  if (decodedRecords.some(item => {
    switch (item.kind) {
      case 'lifecycle-journal': return item.value.operationId === decodedManifest.operationId;
      case 'authority-transfer-recovery':
      case 'transferred-membership-claim':
      case 'transfer-receipt-key': return item.value.transferId === decodedManifest.operationId;
      case 'transfer-claim-batch-receipt':
        return item.value.receipt.transferId === decodedManifest.operationId;
      case 'transfer-redemption-receipt':
        return item.value.receipt.transferId === decodedManifest.operationId;
      case 'terminal-principal':
      case 'terminal-responder-replay':
      case 'leave-former-principal-replay':
      case 'terminal-responder': return item.value.operationId === decodedManifest.operationId;
      case 'protected-claim-envelope':
        return item.value.transferId === decodedManifest.operationId;
      default: return false;
    }
  })) throw invalidPayload('records');
  const baseRecords = decodedRecords.filter(item => (
    !CONTINUITY_KIND_SET.has(item.kind) && item.kind !== 'idempotency-result'
  )) as readonly CollabCheckpointBackupRecord[];
  validateCollabProjectCheckpointConsistency(
    decodeCollabProjectCheckpointManifest({
      ...decodedManifest,
      coordinationFormatVersion: COLLAB_PROJECT_COORDINATION_FORMAT_VERSION,
    }),
    baseRecords,
  );
  return records;
}
