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
  readonly custodyAuthority: CollabCheckpointAuthority;
  readonly operationIntentId: string;
  readonly projectId: CollabProjectId;
  readonly receiptId: string;
  readonly submittedByMemberId: CollabMemberId;
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
  readonly checkpointSha256: string;
  readonly claimSha256: string;
  readonly memberId: CollabMemberId;
  readonly operationIntentId: string;
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
  readonly batchRevision: number;
  readonly batchSha256: string;
  readonly certificate: string;
  readonly certificateAlgorithm: 'ed25519';
  readonly checkpointSha256: string;
  readonly committedAt: CollabIsoTimestamp;
  readonly operationIntentId: string;
  readonly projectId: CollabProjectId;
  readonly sourceAuthority: CollabCheckpointAuthority;
  readonly sourceHostMemberId: CollabMemberId;
  readonly targetAuthority: CollabCheckpointAuthority;
  readonly transferId: string;
}

export interface CollabAuthorityTransferStatus {
  readonly batchRevision: number | null;
  readonly batchSha256: string | null;
  readonly checkpointSha256: string | null;
  readonly createdAt: CollabIsoTimestamp;
  readonly direction: CollabAuthorityTransferDirection;
  readonly expiresAt: CollabIsoTimestamp;
  readonly phase:
    | CollabLanToCloudTransferPhase
    | CollabCloudToLanTransferPhase
    | CollabAuthorityTransferCancellationPhase;
  readonly projectId: CollabProjectId;
  readonly sourceAuthority: CollabCheckpointAuthority;
  readonly state: 'active' | 'cancelled' | 'completed';
  readonly targetAuthority: CollabCheckpointAuthority;
  readonly targetUrl: string;
  readonly transferId: string;
  readonly updatedAt: CollabIsoTimestamp;
}

interface CollabAuthorityMutationRequest {
  readonly idempotencyKey: string;
  readonly projectId: CollabProjectId;
}

export interface RequestLanToCloudTransferRequest extends CollabAuthorityMutationRequest {
  readonly expectedAuthorityGeneration: number;
  readonly targetUrl: string;
}

export interface AcceptLanToCloudTransferTargetRequest extends CollabAuthorityMutationRequest {
  readonly expectedAuthorityGeneration: number;
  readonly targetUrl: string;
  readonly transferId: string;
}

export interface BeginLanToCloudTransferRequest extends CollabAuthorityMutationRequest {
  readonly checkpointManifestSha256: string;
  readonly expectedSourceAuthorityGeneration: number;
  readonly sourceHostMemberId: CollabMemberId;
  readonly sourceProof: string;
  readonly targetUrl: string;
  readonly transferId: string;
}

export interface GetProjectAuthorityTransferRequest {
  readonly projectId: CollabProjectId;
  readonly transferId: string;
}

export interface RotateTransferredMembershipClaimsRequest extends CollabAuthorityMutationRequest {
  readonly expectedBatchRevision: number;
  readonly expectedBatchSha256: string;
  readonly transferId: string;
}

export interface AcknowledgeTransferredMembershipClaimBatchRequest
  extends CollabAuthorityMutationRequest {
  readonly batchRevision: number;
  readonly batchSha256: string;
  readonly operationIntentId: string;
  readonly transferId: string;
}

export interface GetTransferredMembershipClaimRequest {
  readonly projectId: CollabProjectId;
  readonly transferId: string;
}

interface ClaimTransferredMembershipRequestBase extends CollabAuthorityMutationRequest {
  readonly claim: string;
  readonly transferId: string;
}

export interface ClaimTransferredCloudMembershipRequest
  extends ClaimTransferredMembershipRequestBase {
  readonly credentialHash?: never;
}

export interface ClaimTransferredLanMembershipRequest
  extends ClaimTransferredMembershipRequestBase {
  readonly credentialHash: string;
}

export type ClaimTransferredMembershipRequest =
  | ClaimTransferredCloudMembershipRequest
  | ClaimTransferredLanMembershipRequest;

export interface AcknowledgeTransferredMembershipClaimRedemptionRequest
  extends CollabAuthorityMutationRequest {
  readonly receipt: CollabTransferredMembershipRedemptionReceipt;
  readonly transferId: string;
}

export interface CollabTransferredMembershipRedemptionAcknowledgement {
  readonly acknowledgedAt: CollabIsoTimestamp;
  readonly memberId: CollabMemberId;
  readonly projectId: CollabProjectId;
  readonly receiptId: string;
  readonly transferId: string;
}

export interface CommitLanToCloudRelinquishmentRequest extends CollabAuthorityMutationRequest {
  readonly proof: CollabAuthorityRelinquishmentProof;
  readonly transferId: string;
}

export interface BeginCloudToLanTransferRequest extends CollabAuthorityMutationRequest {
  readonly expectedAuthorityGeneration: number;
  readonly targetHostMemberId: CollabMemberId;
  readonly targetUrl: string;
}

export interface AcceptCloudToLanTransferTargetRequest extends CollabAuthorityMutationRequest {
  readonly targetHostMemberId: CollabMemberId;
  readonly targetProof: string;
  readonly transferId: string;
}

export interface ReportCloudToLanTargetStagedRequest extends CollabAuthorityMutationRequest {
  readonly checkpointSha256: string;
  readonly claimBatch: CollabTransferredMembershipClaimBatch;
  readonly stageSha256: string;
  readonly targetAuthority: CollabCheckpointAuthority;
  readonly targetProof: string;
  readonly transferId: string;
}

export interface ConfirmCloudToLanTargetActiveRequest extends CollabAuthorityMutationRequest {
  readonly targetActivationProof: string;
  readonly transferId: string;
}

export interface CancelProjectAuthorityTransferRequest extends CollabAuthorityMutationRequest {
  readonly expectedPhase: string;
  readonly transferId: string;
}

export const COLLAB_AUTHORITY_TRANSFER_OPERATIONS = Object.freeze([
  'requestLanToCloudTransfer',
  'acceptLanToCloudTransferTarget',
  'beginLanToCloudTransfer',
  'getProjectAuthorityTransfer',
  'rotateTransferredMembershipClaims',
  'acknowledgeTransferredMembershipClaimBatch',
  'getTransferredMembershipClaim',
  'claimTransferredMembership',
  'acknowledgeTransferredMembershipClaimRedemption',
  'commitLanToCloudRelinquishment',
  'beginCloudToLanTransfer',
  'acceptCloudToLanTransferTarget',
  'reportCloudToLanTargetStaged',
  'confirmCloudToLanTargetActive',
  'cancelProjectAuthorityTransfer',
] as const);

export type CollabAuthorityTransferOperation =
  typeof COLLAB_AUTHORITY_TRANSFER_OPERATIONS[number];

export interface CollabAuthorityTransferOperationMap {
  readonly requestLanToCloudTransfer: {
    readonly request: RequestLanToCloudTransferRequest;
    readonly response: CollabAuthorityTransferStatus;
  };
  readonly acceptLanToCloudTransferTarget: {
    readonly request: AcceptLanToCloudTransferTargetRequest;
    readonly response: CollabAuthorityTransferStatus;
  };
  readonly beginLanToCloudTransfer: {
    readonly request: BeginLanToCloudTransferRequest;
    readonly response: CollabAuthorityTransferStatus;
  };
  readonly getProjectAuthorityTransfer: {
    readonly request: GetProjectAuthorityTransferRequest;
    readonly response: CollabAuthorityTransferStatus;
  };
  readonly rotateTransferredMembershipClaims: {
    readonly request: RotateTransferredMembershipClaimsRequest;
    readonly response: CollabTransferredMembershipClaimBatch;
  };
  readonly acknowledgeTransferredMembershipClaimBatch: {
    readonly request: AcknowledgeTransferredMembershipClaimBatchRequest;
    readonly response: CollabTransferredMembershipClaimCustodyReceipt;
  };
  readonly getTransferredMembershipClaim: {
    readonly request: GetTransferredMembershipClaimRequest;
    readonly response: CollabTransferredMembershipClaim;
  };
  readonly claimTransferredMembership: {
    readonly request: ClaimTransferredMembershipRequest;
    readonly response: CollabTransferredMembershipRedemptionReceipt;
  };
  readonly acknowledgeTransferredMembershipClaimRedemption: {
    readonly request: AcknowledgeTransferredMembershipClaimRedemptionRequest;
    readonly response: CollabTransferredMembershipRedemptionAcknowledgement;
  };
  readonly commitLanToCloudRelinquishment: {
    readonly request: CommitLanToCloudRelinquishmentRequest;
    readonly response: CollabAuthorityTransferStatus;
  };
  readonly beginCloudToLanTransfer: {
    readonly request: BeginCloudToLanTransferRequest;
    readonly response: CollabAuthorityTransferStatus;
  };
  readonly acceptCloudToLanTransferTarget: {
    readonly request: AcceptCloudToLanTransferTargetRequest;
    readonly response: CollabAuthorityTransferStatus;
  };
  readonly reportCloudToLanTargetStaged: {
    readonly request: ReportCloudToLanTargetStagedRequest;
    readonly response: CollabTransferredMembershipClaimCustodyReceipt;
  };
  readonly confirmCloudToLanTargetActive: {
    readonly request: ConfirmCloudToLanTargetActiveRequest;
    readonly response: CollabAuthorityTransferStatus;
  };
  readonly cancelProjectAuthorityTransfer: {
    readonly request: CancelProjectAuthorityTransferRequest;
    readonly response: CollabAuthorityTransferStatus;
  };
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
    'custodyAuthority',
    'operationIntentId',
    'projectId',
    'receiptId',
    'submittedByMemberId',
    'targetAuthorityGeneration',
    'transferId',
  ]);
  const custodyAuthority = authority(source.custodyAuthority, 'custodyAuthority');
  const targetAuthorityGeneration = positiveInteger(source, 'targetAuthorityGeneration');
  if (targetAuthorityGeneration !== custodyAuthority.generation + 1) {
    throw invalidPayload('targetAuthorityGeneration');
  }
  return {
    batchRevision: positiveInteger(source, 'batchRevision'),
    batchSha256: sha256(source, 'batchSha256'),
    checkpointSha256: sha256(source, 'checkpointSha256'),
    committedAt: timestamp(source, 'committedAt'),
    custodyAuthority,
    operationIntentId: token(source, 'operationIntentId'),
    projectId: token(source, 'projectId', isCollabProjectId),
    receiptId: token(source, 'receiptId'),
    submittedByMemberId: token(source, 'submittedByMemberId', isCollabMemberId),
    targetAuthorityGeneration,
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
    'checkpointSha256',
    'claimSha256',
    'memberId',
    'operationIntentId',
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
    checkpointSha256: sha256(source, 'checkpointSha256'),
    claimSha256: sha256(source, 'claimSha256'),
    memberId: token(source, 'memberId', isCollabMemberId),
    operationIntentId: token(source, 'operationIntentId'),
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
    'batchRevision',
    'batchSha256',
    'certificate',
    'certificateAlgorithm',
    'checkpointSha256',
    'committedAt',
    'operationIntentId',
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
    batchRevision: positiveInteger(source, 'batchRevision'),
    batchSha256: sha256(source, 'batchSha256'),
    certificate: base64url(source, 'certificate'),
    certificateAlgorithm: literal(source, 'certificateAlgorithm', ['ed25519']),
    checkpointSha256: sha256(source, 'checkpointSha256'),
    committedAt: timestamp(source, 'committedAt'),
    operationIntentId: token(source, 'operationIntentId'),
    projectId: token(source, 'projectId', isCollabProjectId),
    sourceAuthority,
    sourceHostMemberId: token(source, 'sourceHostMemberId', isCollabMemberId),
    targetAuthority,
    transferId: token(source, 'transferId'),
  };
}

const LAN_TO_CLOUD_PHASE_SET: ReadonlySet<string> = new Set(
  COLLAB_LAN_TO_CLOUD_TRANSFER_PHASES,
);
const CLOUD_TO_LAN_PHASE_SET: ReadonlySet<string> = new Set(
  COLLAB_CLOUD_TO_LAN_TRANSFER_PHASES,
);
const CANCELLATION_PHASE_SET: ReadonlySet<string> = new Set(
  COLLAB_AUTHORITY_TRANSFER_CANCELLATION_PHASES,
);
const LAN_TO_CLOUD_CHECKPOINT_REQUIRED_PHASE_SET: ReadonlySet<string> = new Set(
  COLLAB_LAN_TO_CLOUD_TRANSFER_PHASES.slice(2),
);
const CLOUD_TO_LAN_CHECKPOINT_REQUIRED_PHASE_SET: ReadonlySet<string> = new Set(
  COLLAB_CLOUD_TO_LAN_TRANSFER_PHASES.slice(2),
);
const LAN_TO_CLOUD_BATCH_REQUIRED_PHASE_SET: ReadonlySet<string> = new Set(
  COLLAB_LAN_TO_CLOUD_TRANSFER_PHASES.slice(4),
);
const CLOUD_TO_LAN_BATCH_REQUIRED_PHASE_SET: ReadonlySet<string> = new Set(
  COLLAB_CLOUD_TO_LAN_TRANSFER_PHASES.slice(4),
);

function transferPhase(
  source: UnknownRecord,
  direction: CollabAuthorityTransferDirection,
): CollabAuthorityTransferStatus['phase'] {
  const value = source.phase;
  const directionSet = direction === 'lan-to-cloud'
    ? LAN_TO_CLOUD_PHASE_SET
    : CLOUD_TO_LAN_PHASE_SET;
  if (typeof value !== 'string' || (!directionSet.has(value) && !CANCELLATION_PHASE_SET.has(value))) {
    throw invalidPayload('phase');
  }
  return value as CollabAuthorityTransferStatus['phase'];
}

export function decodeCollabAuthorityTransferStatus(
  value: unknown,
): CollabAuthorityTransferStatus {
  const source = exactRecord(value, 'transferStatus', [
    'batchRevision',
    'batchSha256',
    'checkpointSha256',
    'createdAt',
    'direction',
    'expiresAt',
    'phase',
    'projectId',
    'sourceAuthority',
    'state',
    'targetAuthority',
    'targetUrl',
    'transferId',
    'updatedAt',
  ]);
  const direction = literal(source, 'direction', ['cloud-to-lan', 'lan-to-cloud']);
  const sourceAuthority = authority(source.sourceAuthority, 'sourceAuthority');
  const targetAuthority = authority(source.targetAuthority, 'targetAuthority');
  const phase = transferPhase(source, direction);
  const state = literal(source, 'state', ['active', 'cancelled', 'completed']);
  if (
    sourceAuthority.kind === targetAuthority.kind
    || targetAuthority.generation !== sourceAuthority.generation + 1
    || (direction === 'lan-to-cloud'
      && (sourceAuthority.kind !== 'lan' || targetAuthority.kind !== 'cloud'))
    || (direction === 'cloud-to-lan'
      && (sourceAuthority.kind !== 'cloud' || targetAuthority.kind !== 'lan'))
    || (state === 'cancelled' && phase !== 'cancelled')
    || (state === 'completed' && phase !== 'completed')
    || (state === 'active' && (phase === 'cancelled' || phase === 'completed'))
  ) throw invalidPayload('transferStatus');
  const checkpointSha256 = source.checkpointSha256 === null
    ? null
    : sha256(source, 'checkpointSha256');
  const batchRevision = source.batchRevision === null
    ? null
    : positiveInteger(source, 'batchRevision');
  const batchSha256 = source.batchSha256 === null
    ? null
    : sha256(source, 'batchSha256');
  if (
    (batchRevision === null) !== (batchSha256 === null)
    || (batchRevision !== null && checkpointSha256 === null)
    || (
      (direction === 'lan-to-cloud'
        ? LAN_TO_CLOUD_CHECKPOINT_REQUIRED_PHASE_SET
        : CLOUD_TO_LAN_CHECKPOINT_REQUIRED_PHASE_SET).has(phase)
      && checkpointSha256 === null
    )
    || (
      (direction === 'lan-to-cloud'
        ? LAN_TO_CLOUD_BATCH_REQUIRED_PHASE_SET
        : CLOUD_TO_LAN_BATCH_REQUIRED_PHASE_SET).has(phase)
      && batchRevision === null
    )
  ) throw invalidPayload('claimBatch');
  return {
    batchRevision,
    batchSha256,
    checkpointSha256,
    createdAt: timestamp(source, 'createdAt'),
    direction,
    expiresAt: timestamp(source, 'expiresAt'),
    phase,
    projectId: token(source, 'projectId', isCollabProjectId),
    sourceAuthority,
    state,
    targetAuthority,
    targetUrl: absoluteTargetUrl(source),
    transferId: token(source, 'transferId'),
    updatedAt: timestamp(source, 'updatedAt'),
  };
}

function mutationFields(source: UnknownRecord) {
  return {
    idempotencyKey: token(source, 'idempotencyKey'),
    projectId: token(source, 'projectId', isCollabProjectId),
  };
}

function decodeRequestLanToCloudTransfer(value: unknown): RequestLanToCloudTransferRequest {
  const source = exactRecord(value, 'request', [
    'expectedAuthorityGeneration',
    'idempotencyKey',
    'projectId',
    'targetUrl',
  ]);
  return {
    expectedAuthorityGeneration: positiveInteger(source, 'expectedAuthorityGeneration'),
    ...mutationFields(source),
    targetUrl: absoluteTargetUrl(source),
  };
}

function decodeAcceptLanToCloudTransferTarget(
  value: unknown,
): AcceptLanToCloudTransferTargetRequest {
  const source = exactRecord(value, 'request', [
    'expectedAuthorityGeneration',
    'idempotencyKey',
    'projectId',
    'targetUrl',
    'transferId',
  ]);
  return {
    expectedAuthorityGeneration: positiveInteger(source, 'expectedAuthorityGeneration'),
    ...mutationFields(source),
    targetUrl: absoluteTargetUrl(source),
    transferId: token(source, 'transferId'),
  };
}

function decodeBeginLanToCloudTransfer(value: unknown): BeginLanToCloudTransferRequest {
  const source = exactRecord(value, 'request', [
    'checkpointManifestSha256',
    'expectedSourceAuthorityGeneration',
    'idempotencyKey',
    'projectId',
    'sourceHostMemberId',
    'sourceProof',
    'targetUrl',
    'transferId',
  ]);
  return {
    checkpointManifestSha256: sha256(source, 'checkpointManifestSha256'),
    expectedSourceAuthorityGeneration: positiveInteger(
      source,
      'expectedSourceAuthorityGeneration',
    ),
    ...mutationFields(source),
    sourceHostMemberId: token(source, 'sourceHostMemberId', isCollabMemberId),
    sourceProof: base64url(source, 'sourceProof'),
    targetUrl: absoluteTargetUrl(source),
    transferId: token(source, 'transferId'),
  };
}

function decodeGetProjectAuthorityTransfer(value: unknown): GetProjectAuthorityTransferRequest {
  const source = exactRecord(value, 'request', ['projectId', 'transferId']);
  return {
    projectId: token(source, 'projectId', isCollabProjectId),
    transferId: token(source, 'transferId'),
  };
}

function decodeRotateTransferredMembershipClaims(
  value: unknown,
): RotateTransferredMembershipClaimsRequest {
  const source = exactRecord(value, 'request', [
    'expectedBatchRevision',
    'expectedBatchSha256',
    'idempotencyKey',
    'projectId',
    'transferId',
  ]);
  return {
    expectedBatchRevision: positiveInteger(source, 'expectedBatchRevision'),
    expectedBatchSha256: sha256(source, 'expectedBatchSha256'),
    ...mutationFields(source),
    transferId: token(source, 'transferId'),
  };
}

function decodeAcknowledgeTransferredMembershipClaimBatch(
  value: unknown,
): AcknowledgeTransferredMembershipClaimBatchRequest {
  const source = exactRecord(value, 'request', [
    'batchRevision',
    'batchSha256',
    'idempotencyKey',
    'operationIntentId',
    'projectId',
    'transferId',
  ]);
  return {
    batchRevision: positiveInteger(source, 'batchRevision'),
    batchSha256: sha256(source, 'batchSha256'),
    ...mutationFields(source),
    operationIntentId: token(source, 'operationIntentId'),
    transferId: token(source, 'transferId'),
  };
}

function decodeGetTransferredMembershipClaim(
  value: unknown,
): GetTransferredMembershipClaimRequest {
  return decodeGetProjectAuthorityTransfer(value);
}

function decodeClaimTransferredMembership(value: unknown): ClaimTransferredMembershipRequest {
  const raw = record(value, 'request');
  const hasCredentialHash = Object.hasOwn(raw, 'credentialHash');
  const source = exactRecord(value, 'request', hasCredentialHash
    ? ['claim', 'credentialHash', 'idempotencyKey', 'projectId', 'transferId']
    : ['claim', 'idempotencyKey', 'projectId', 'transferId']);
  const common = {
    claim: base64url(source, 'claim'),
    ...mutationFields(source),
    transferId: token(source, 'transferId'),
  };
  return hasCredentialHash
    ? {
      ...common,
      credentialHash: sha256(source, 'credentialHash'),
    }
    : common;
}

function decodeAcknowledgeTransferredMembershipClaimRedemption(
  value: unknown,
): AcknowledgeTransferredMembershipClaimRedemptionRequest {
  const source = exactRecord(value, 'request', [
    'idempotencyKey',
    'projectId',
    'receipt',
    'transferId',
  ]);
  const common = mutationFields(source);
  const transferId = token(source, 'transferId');
  const receipt = decodeCollabTransferredMembershipRedemptionReceipt(source.receipt);
  if (receipt.projectId !== common.projectId || receipt.transferId !== transferId) {
    throw invalidPayload('receipt');
  }
  return { ...common, receipt, transferId };
}

function decodeCommitLanToCloudRelinquishment(
  value: unknown,
): CommitLanToCloudRelinquishmentRequest {
  const source = exactRecord(value, 'request', [
    'idempotencyKey',
    'projectId',
    'proof',
    'transferId',
  ]);
  const common = mutationFields(source);
  const transferId = token(source, 'transferId');
  const proof = decodeCollabAuthorityRelinquishmentProof(source.proof);
  if (proof.projectId !== common.projectId || proof.transferId !== transferId) {
    throw invalidPayload('proof');
  }
  return { ...common, proof, transferId };
}

function decodeBeginCloudToLanTransfer(value: unknown): BeginCloudToLanTransferRequest {
  const source = exactRecord(value, 'request', [
    'expectedAuthorityGeneration',
    'idempotencyKey',
    'projectId',
    'targetHostMemberId',
    'targetUrl',
  ]);
  return {
    expectedAuthorityGeneration: positiveInteger(source, 'expectedAuthorityGeneration'),
    ...mutationFields(source),
    targetHostMemberId: token(source, 'targetHostMemberId', isCollabMemberId),
    targetUrl: absoluteTargetUrl(source),
  };
}

function decodeAcceptCloudToLanTransferTarget(
  value: unknown,
): AcceptCloudToLanTransferTargetRequest {
  const source = exactRecord(value, 'request', [
    'idempotencyKey',
    'projectId',
    'targetHostMemberId',
    'targetProof',
    'transferId',
  ]);
  return {
    ...mutationFields(source),
    targetHostMemberId: token(source, 'targetHostMemberId', isCollabMemberId),
    targetProof: base64url(source, 'targetProof'),
    transferId: token(source, 'transferId'),
  };
}

function decodeReportCloudToLanTargetStaged(
  value: unknown,
): ReportCloudToLanTargetStagedRequest {
  const source = exactRecord(value, 'request', [
    'checkpointSha256',
    'claimBatch',
    'idempotencyKey',
    'projectId',
    'stageSha256',
    'targetAuthority',
    'targetProof',
    'transferId',
  ]);
  const targetAuthority = authority(source.targetAuthority, 'targetAuthority');
  if (targetAuthority.kind !== 'lan') throw invalidPayload('targetAuthority');
  const common = mutationFields(source);
  const transferId = token(source, 'transferId');
  const checkpointSha256 = sha256(source, 'checkpointSha256');
  const claimBatch = decodeCollabTransferredMembershipClaimBatch(source.claimBatch);
  if (
    claimBatch.projectId !== common.projectId
    || claimBatch.transferId !== transferId
    || claimBatch.checkpointSha256 !== checkpointSha256
    || claimBatch.targetAuthorityGeneration !== targetAuthority.generation
  ) throw invalidPayload('claimBatch');
  return {
    checkpointSha256,
    claimBatch,
    ...common,
    stageSha256: sha256(source, 'stageSha256'),
    targetAuthority,
    targetProof: base64url(source, 'targetProof'),
    transferId,
  };
}

function decodeConfirmCloudToLanTargetActive(
  value: unknown,
): ConfirmCloudToLanTargetActiveRequest {
  const source = exactRecord(value, 'request', [
    'idempotencyKey',
    'projectId',
    'targetActivationProof',
    'transferId',
  ]);
  return {
    ...mutationFields(source),
    targetActivationProof: base64url(source, 'targetActivationProof'),
    transferId: token(source, 'transferId'),
  };
}

function decodeCancelProjectAuthorityTransfer(
  value: unknown,
): CancelProjectAuthorityTransferRequest {
  const source = exactRecord(value, 'request', [
    'expectedPhase',
    'idempotencyKey',
    'projectId',
    'transferId',
  ]);
  const expectedPhase = source.expectedPhase;
  if (
    typeof expectedPhase !== 'string'
    || (!LAN_TO_CLOUD_PHASE_SET.has(expectedPhase)
      && !CLOUD_TO_LAN_PHASE_SET.has(expectedPhase)
      && !CANCELLATION_PHASE_SET.has(expectedPhase))
  ) throw invalidPayload('expectedPhase');
  return {
    expectedPhase,
    ...mutationFields(source),
    transferId: token(source, 'transferId'),
  };
}

export function decodeCollabAuthorityTransferOperationRequest<
  Operation extends CollabAuthorityTransferOperation,
>(
  operation: Operation,
  value: unknown,
): CollabAuthorityTransferOperationMap[Operation]['request'] {
  const decoded = (() => {
    switch (operation) {
      case 'requestLanToCloudTransfer': return decodeRequestLanToCloudTransfer(value);
      case 'acceptLanToCloudTransferTarget': return decodeAcceptLanToCloudTransferTarget(value);
      case 'beginLanToCloudTransfer': return decodeBeginLanToCloudTransfer(value);
      case 'getProjectAuthorityTransfer': return decodeGetProjectAuthorityTransfer(value);
      case 'rotateTransferredMembershipClaims':
        return decodeRotateTransferredMembershipClaims(value);
      case 'acknowledgeTransferredMembershipClaimBatch':
        return decodeAcknowledgeTransferredMembershipClaimBatch(value);
      case 'getTransferredMembershipClaim': return decodeGetTransferredMembershipClaim(value);
      case 'claimTransferredMembership': return decodeClaimTransferredMembership(value);
      case 'acknowledgeTransferredMembershipClaimRedemption':
        return decodeAcknowledgeTransferredMembershipClaimRedemption(value);
      case 'commitLanToCloudRelinquishment':
        return decodeCommitLanToCloudRelinquishment(value);
      case 'beginCloudToLanTransfer': return decodeBeginCloudToLanTransfer(value);
      case 'acceptCloudToLanTransferTarget': return decodeAcceptCloudToLanTransferTarget(value);
      case 'reportCloudToLanTargetStaged': return decodeReportCloudToLanTargetStaged(value);
      case 'confirmCloudToLanTargetActive': return decodeConfirmCloudToLanTargetActive(value);
      case 'cancelProjectAuthorityTransfer': return decodeCancelProjectAuthorityTransfer(value);
    }
  })();
  return decoded;
}

function decodeRedemptionAcknowledgement(
  value: unknown,
): CollabTransferredMembershipRedemptionAcknowledgement {
  const source = exactRecord(value, 'redemptionAcknowledgement', [
    'acknowledgedAt',
    'memberId',
    'projectId',
    'receiptId',
    'transferId',
  ]);
  return {
    acknowledgedAt: timestamp(source, 'acknowledgedAt'),
    memberId: token(source, 'memberId', isCollabMemberId),
    projectId: token(source, 'projectId', isCollabProjectId),
    receiptId: token(source, 'receiptId'),
    transferId: token(source, 'transferId'),
  };
}

export function decodeCollabAuthorityTransferOperationResponse<
  Operation extends CollabAuthorityTransferOperation,
>(
  operation: Operation,
  value: unknown,
): CollabAuthorityTransferOperationMap[Operation]['response'] {
  const decoded = (() => {
    switch (operation) {
      case 'rotateTransferredMembershipClaims':
        return decodeCollabTransferredMembershipClaimBatch(value);
      case 'acknowledgeTransferredMembershipClaimBatch':
      case 'reportCloudToLanTargetStaged':
        return decodeCollabTransferredMembershipClaimCustodyReceipt(value);
      case 'getTransferredMembershipClaim':
        return decodeCollabTransferredMembershipClaim(value);
      case 'claimTransferredMembership':
        return decodeCollabTransferredMembershipRedemptionReceipt(value);
      case 'acknowledgeTransferredMembershipClaimRedemption':
        return decodeRedemptionAcknowledgement(value);
      default:
        return decodeCollabAuthorityTransferStatus(value);
    }
  })();
  return decoded;
}
