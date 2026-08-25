import { CollabError } from './CollabError';
import type {
  CollabCheckpointAuthority,
  CollabCheckpointAuthorityKind,
} from './CollabProjectCheckpoint';
import {
  hasUtf8ByteLengthAtMost,
  isCollabMemberId,
  isCollabOpaqueId,
  isCollabProjectId,
} from './CollabValidation';
import type {
  CollabIsoTimestamp,
  CollabMemberId,
  CollabProjectId,
} from './types';

export const COLLAB_LAN_TO_CLOUD_TRANSFER_PHASES = Object.freeze([
  'collecting-readiness',
  'source-quiesced',
  'checkpoint-received',
  'checkpoint-validated',
  'claims-retained',
  'repository-published',
  'source-relinquished',
  'cloud-activated',
  'completed',
] as const);

export const COLLAB_CLOUD_TO_LAN_TRANSFER_PHASES = Object.freeze([
  'collecting-readiness',
  'cloud-quiesced',
  'checkpoint-captured',
  'target-staged',
  'claims-retained',
  'cloud-relinquished',
  'lan-activated',
  'completed',
] as const);

export const COLLAB_AUTHORITY_TRANSFER_CANCELLATION_PHASES = Object.freeze([
  'cancel-intent',
  'target-invalidated',
  'target-cleaned',
  'source-reopened',
  'cancelled',
] as const);

export type CollabLanToCloudTransferPhase =
  typeof COLLAB_LAN_TO_CLOUD_TRANSFER_PHASES[number];
export type CollabCloudToLanTransferPhase =
  typeof COLLAB_CLOUD_TO_LAN_TRANSFER_PHASES[number];
export type CollabAuthorityTransferCancellationPhase =
  typeof COLLAB_AUTHORITY_TRANSFER_CANCELLATION_PHASES[number];
export type CollabAuthorityTransferDirection = 'cloud-to-lan' | 'lan-to-cloud';

export interface CollabAuthorityTransferProposal {
  readonly expectedSourceAuthority: CollabCheckpointAuthority;
  readonly idempotencyKey: string;
  readonly projectId: CollabProjectId;
  readonly proposedByMemberId: CollabMemberId;
  readonly proposedAt: CollabIsoTimestamp;
  readonly targetAuthorityKind: CollabCheckpointAuthorityKind;
  readonly targetUrl: string;
}

export interface CollabTransferredMembershipClaimItem {
  readonly claim: string;
  readonly memberId: CollabMemberId;
}

export interface CollabTransferredMembershipClaimBatch {
  readonly batchRevision: number;
  readonly batchSha256: string;
  readonly checkpointSha256: string;
  readonly claims: readonly CollabTransferredMembershipClaimItem[];
  readonly expiresAt: CollabIsoTimestamp;
  readonly projectId: CollabProjectId;
  readonly targetAuthorityGeneration: number;
  readonly transferId: string;
}

export interface CollabTransferredMembershipClaimCustodyReceipt {
  readonly batchRevision: number;
  readonly batchSha256: string;
  readonly checkpointSha256: string;
  readonly committedAt: CollabIsoTimestamp;
  readonly operationIntentId: string;
  readonly projectId: CollabProjectId;
  readonly receiptId: string;
  readonly sourceHostMemberId: CollabMemberId;
  readonly targetAuthorityGeneration: number;
  readonly transferId: string;
}

export interface CollabTransferredMembershipClaim {
  readonly claim: string;
  readonly expiresAt: CollabIsoTimestamp;
  readonly memberId: CollabMemberId;
  readonly projectId: CollabProjectId;
  readonly targetAuthorityGeneration: number;
  readonly transferId: string;
}

export interface CollabTransferredMembershipRedemptionReceipt {
  readonly claimSha256: string;
  readonly memberId: CollabMemberId;
  readonly projectId: CollabProjectId;
  readonly receiptId: string;
  readonly receiptKeyId: string;
  readonly redeemedAt: CollabIsoTimestamp;
  readonly signature: string;
  readonly signatureAlgorithm: 'ed25519';
  readonly targetAuthorityGeneration: number;
  readonly transferId: string;
}

export interface CollabAuthorityRelinquishmentProof {
  readonly certificate: string;
  readonly certificateAlgorithm: 'ed25519';
  readonly checkpointSha256: string;
  readonly committedAt: CollabIsoTimestamp;
  readonly projectId: CollabProjectId;
  readonly sourceAuthority: CollabCheckpointAuthority;
  readonly sourceHostMemberId: CollabMemberId;
  readonly targetAuthority: CollabCheckpointAuthority;
  readonly transferId: string;
}

type UnknownRecord = Readonly<Record<string, unknown>>;

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

function boundedString(source: UnknownRecord, field: string, maximumBytes: number): string {
  const value = source[field];
  if (
    typeof value !== 'string'
    || value.length === 0
    || !hasUtf8ByteLengthAtMost(value, maximumBytes)
  ) throw invalidPayload(field);
  return value;
}

function positiveInteger(source: UnknownRecord, field: string): number {
  const value = source[field];
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    throw invalidPayload(field);
  }
  return value;
}

function timestamp(source: UnknownRecord, field: string): CollabIsoTimestamp {
  const value = source[field];
  if (
    typeof value !== 'string'
    || value.length > 64
    || Number.isNaN(Date.parse(value))
    || new Date(value).toISOString() !== value
  ) throw invalidPayload(field);
  return value;
}

function sha256(source: UnknownRecord, field: string): string {
  const value = source[field];
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) throw invalidPayload(field);
  return value;
}

function base64url(source: UnknownRecord, field: string, maximumBytes = 4096): string {
  const value = boundedString(source, field, maximumBytes);
  if (!BASE64URL_PATTERN.test(value)) throw invalidPayload(field);
  return value;
}

function literal<T extends string>(source: UnknownRecord, field: string, values: readonly T[]): T {
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
    || parsed.hash.length > 0
  ) throw invalidPayload('targetUrl');
  return targetUrl;
}

export function decodeCollabAuthorityTransferProposal(
  value: unknown,
): CollabAuthorityTransferProposal {
  const source = exactRecord(value, 'proposal', [
    'expectedSourceAuthority',
    'idempotencyKey',
    'projectId',
    'proposedByMemberId',
    'proposedAt',
    'targetAuthorityKind',
    'targetUrl',
  ]);
  const expectedSourceAuthority = authority(
    source.expectedSourceAuthority,
    'expectedSourceAuthority',
  );
  const targetAuthorityKind = literal(source, 'targetAuthorityKind', ['cloud', 'lan']);
  if (expectedSourceAuthority.kind === targetAuthorityKind) {
    throw invalidPayload('targetAuthorityKind');
  }
  return {
    expectedSourceAuthority,
    idempotencyKey: token(source, 'idempotencyKey'),
    projectId: token(source, 'projectId', isCollabProjectId),
    proposedByMemberId: token(source, 'proposedByMemberId', isCollabMemberId),
    proposedAt: timestamp(source, 'proposedAt'),
    targetAuthorityKind,
    targetUrl: absoluteTargetUrl(source),
  };
}

function claimItem(value: unknown): CollabTransferredMembershipClaimItem {
  const source = exactRecord(value, 'claim', ['claim', 'memberId']);
  return {
    claim: base64url(source, 'claim'),
    memberId: token(source, 'memberId', isCollabMemberId),
  };
}

export function decodeCollabTransferredMembershipClaimBatch(
  value: unknown,
): CollabTransferredMembershipClaimBatch {
  const source = exactRecord(value, 'claimBatch', [
    'batchRevision',
    'batchSha256',
    'checkpointSha256',
    'claims',
    'expiresAt',
    'projectId',
    'targetAuthorityGeneration',
    'transferId',
  ]);
  if (!Array.isArray(source.claims) || source.claims.length === 0) {
    throw invalidPayload('claims');
  }
  const claims = source.claims.map(claimItem);
  if (
    claims.some((item, index) => index > 0
      && claims[index - 1].memberId.localeCompare(item.memberId, 'en-US') >= 0)
    || new Set(claims.map(item => item.claim)).size !== claims.length
  ) throw invalidPayload('claims');
  return {
    batchRevision: positiveInteger(source, 'batchRevision'),
    batchSha256: sha256(source, 'batchSha256'),
    checkpointSha256: sha256(source, 'checkpointSha256'),
    claims: Object.freeze(claims),
    expiresAt: timestamp(source, 'expiresAt'),
    projectId: token(source, 'projectId', isCollabProjectId),
    targetAuthorityGeneration: positiveInteger(source, 'targetAuthorityGeneration'),
    transferId: token(source, 'transferId'),
  };
}

export function decodeCollabTransferredMembershipClaimCustodyReceipt(
  value: unknown,
): CollabTransferredMembershipClaimCustodyReceipt {
  const source = exactRecord(value, 'custodyReceipt', [
    'batchRevision',
    'batchSha256',
    'checkpointSha256',
    'committedAt',
    'operationIntentId',
    'projectId',
    'receiptId',
    'sourceHostMemberId',
    'targetAuthorityGeneration',
    'transferId',
  ]);
  return {
    batchRevision: positiveInteger(source, 'batchRevision'),
    batchSha256: sha256(source, 'batchSha256'),
    checkpointSha256: sha256(source, 'checkpointSha256'),
    committedAt: timestamp(source, 'committedAt'),
    operationIntentId: token(source, 'operationIntentId'),
    projectId: token(source, 'projectId', isCollabProjectId),
    receiptId: token(source, 'receiptId'),
    sourceHostMemberId: token(source, 'sourceHostMemberId', isCollabMemberId),
    targetAuthorityGeneration: positiveInteger(source, 'targetAuthorityGeneration'),
    transferId: token(source, 'transferId'),
  };
}

export function decodeCollabTransferredMembershipClaim(
  value: unknown,
): CollabTransferredMembershipClaim {
  const source = exactRecord(value, 'claim', [
    'claim',
    'expiresAt',
    'memberId',
    'projectId',
    'targetAuthorityGeneration',
    'transferId',
  ]);
  return {
    claim: base64url(source, 'claim'),
    expiresAt: timestamp(source, 'expiresAt'),
    memberId: token(source, 'memberId', isCollabMemberId),
    projectId: token(source, 'projectId', isCollabProjectId),
    targetAuthorityGeneration: positiveInteger(source, 'targetAuthorityGeneration'),
    transferId: token(source, 'transferId'),
  };
}

export function decodeCollabTransferredMembershipRedemptionReceipt(
  value: unknown,
): CollabTransferredMembershipRedemptionReceipt {
  const source = exactRecord(value, 'redemptionReceipt', [
    'claimSha256',
    'memberId',
    'projectId',
    'receiptId',
    'receiptKeyId',
    'redeemedAt',
    'signature',
    'signatureAlgorithm',
    'targetAuthorityGeneration',
    'transferId',
  ]);
  return {
    claimSha256: sha256(source, 'claimSha256'),
    memberId: token(source, 'memberId', isCollabMemberId),
    projectId: token(source, 'projectId', isCollabProjectId),
    receiptId: token(source, 'receiptId'),
    receiptKeyId: boundedString(source, 'receiptKeyId', 256),
    redeemedAt: timestamp(source, 'redeemedAt'),
    signature: base64url(source, 'signature'),
    signatureAlgorithm: literal(source, 'signatureAlgorithm', ['ed25519']),
    targetAuthorityGeneration: positiveInteger(source, 'targetAuthorityGeneration'),
    transferId: token(source, 'transferId'),
  };
}

export function decodeCollabAuthorityRelinquishmentProof(
  value: unknown,
): CollabAuthorityRelinquishmentProof {
  const source = exactRecord(value, 'relinquishmentProof', [
    'certificate',
    'certificateAlgorithm',
    'checkpointSha256',
    'committedAt',
    'projectId',
    'sourceAuthority',
    'sourceHostMemberId',
    'targetAuthority',
    'transferId',
  ]);
  const sourceAuthority = authority(source.sourceAuthority, 'sourceAuthority');
  const targetAuthority = authority(source.targetAuthority, 'targetAuthority');
  if (
    sourceAuthority.kind === targetAuthority.kind
    || targetAuthority.generation !== sourceAuthority.generation + 1
  ) throw invalidPayload('targetAuthority');
  return {
    certificate: base64url(source, 'certificate'),
    certificateAlgorithm: literal(source, 'certificateAlgorithm', ['ed25519']),
    checkpointSha256: sha256(source, 'checkpointSha256'),
    committedAt: timestamp(source, 'committedAt'),
    projectId: token(source, 'projectId', isCollabProjectId),
    sourceAuthority,
    sourceHostMemberId: token(source, 'sourceHostMemberId', isCollabMemberId),
    targetAuthority,
    transferId: token(source, 'transferId'),
  };
}
