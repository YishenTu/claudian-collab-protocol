import { COLLAB_MEMBER_REF_PREFIX } from './CollabConstants';
import { CollabError } from './CollabError';
import type { CollabDecodeResult } from './CollabProtocol';
import {
  hasUtf8ByteLengthAtMost,
  isCollabGitOid,
  isCollabMemberId,
  isCollabOpaqueId,
  isCollabProjectId,
} from './CollabValidation';
import type {
  CollabGitOid,
  CollabIdempotencyKey,
  CollabIsoTimestamp,
  CollabMemberId,
  CollabProjectId,
  CollabRequestId,
  CollabRole,
} from './types';

export const COLLAB_PROJECT_MEMBERSHIP_LIMITS = Object.freeze({
  invitationSecretLength: 43,
  invitationTtlMs: 86_400_000,
  managerResponsibilityOfferRetentionMs: 2_592_000_000,
  managerResponsibilityOfferTtlMs: 86_400_000,
  maxCurrentManagerOffers: 100,
  maxDisplayNameUtf8Bytes: 128,
  maxProjectInvitations: 100,
  maxProjectMembers: 100,
  maxProjectNameUtf8Bytes: 256,
  secretReplayTtlMs: 2_592_000_000,
  transferredClaimLength: 43,
  transferredClaimTtlMs: 2_592_000_000,
} as const);

export type CollabProjectInvitationState =
  | 'active'
  | 'redeeming'
  | 'redeemed'
  | 'revoked'
  | 'expired';

export type CollabProjectMemberBindingState = 'bound' | 'unbound' | 'hidden';
export type CollabImportedClaimState =
  | 'not-applicable'
  | 'original-active'
  | 'override-active'
  | 'revoked'
  | 'expired'
  | 'redeemed'
  | 'hidden';

export type CollabManagerResponsibilityPurpose =
  | 'manager-promotion'
  | 'manager-leave';

export type CollabManagerResponsibilityOfferState =
  | 'offered'
  | 'acknowledged'
  | 'declined'
  | 'cancelled'
  | 'consumed'
  | 'expired';

export interface CollabProjectRequest {
  readonly projectId: CollabProjectId;
}

export interface CollabProjectMutationRequest extends CollabProjectRequest {
  readonly idempotencyKey: CollabIdempotencyKey;
}

export interface CreateCloudProjectRequest extends CollabProjectMutationRequest {
  readonly managerDisplayName: string;
  readonly projectName: string;
}

export interface CreateCloudProjectResponse {
  readonly createdAt: CollabIsoTimestamp;
  readonly mainOid: CollabGitOid;
  readonly managerSetGeneration: 1;
  readonly memberId: CollabMemberId;
  readonly membershipRevision: 2;
  readonly personalRef: string;
  readonly projectId: CollabProjectId;
  readonly role: 'manager';
}

export interface CreateProjectInvitationRequest extends CollabProjectMutationRequest {
  readonly expectedManagerSetGeneration: number;
}

export interface CreateProjectInvitationResponse {
  readonly createdAt: CollabIsoTimestamp;
  readonly expiresAt: CollabIsoTimestamp;
  readonly invitationId: string;
  readonly issuedState: 'active';
  readonly projectId: CollabProjectId;
  readonly secret: string;
  readonly secretReplayExpiresAt: CollabIsoTimestamp;
}

export interface CollabProjectInvitationSummary {
  readonly createdAt: CollabIsoTimestamp;
  readonly expiresAt: CollabIsoTimestamp;
  readonly invitationId: string;
  readonly revision: number;
  readonly state: CollabProjectInvitationState;
  readonly terminalAt: CollabIsoTimestamp | null;
}

export type ListProjectInvitationsRequest = CollabProjectRequest;

export interface ListProjectInvitationsResponse {
  readonly invitations: readonly CollabProjectInvitationSummary[];
  readonly managerSetGeneration: number;
  readonly projectId: CollabProjectId;
}

export interface RevokeProjectInvitationRequest extends CollabProjectMutationRequest {
  readonly expectedInvitationRevision: number;
  readonly expectedManagerSetGeneration: number;
  readonly invitationId: string;
}

export interface RevokeProjectInvitationResponse {
  readonly invitationId: string;
  readonly projectId: CollabProjectId;
  readonly revision: number;
  readonly revokedAt: CollabIsoTimestamp;
  readonly state: 'revoked';
}

export interface JoinCloudProjectRequest extends CollabProjectMutationRequest {
  readonly displayName: string;
  readonly invitationId: string;
  readonly secret: string;
}

export interface JoinCloudProjectResponse {
  readonly joinedAt: CollabIsoTimestamp;
  readonly mainOid: CollabGitOid;
  readonly managerSetGeneration: number;
  readonly memberId: CollabMemberId;
  readonly membershipRevision: 2;
  readonly personalRef: string;
  readonly projectId: CollabProjectId;
  readonly role: 'member';
}

export interface CollabProjectMemberSummary {
  readonly bindingState: CollabProjectMemberBindingState;
  readonly displayName: string;
  readonly importedClaimState: CollabImportedClaimState;
  readonly memberId: CollabMemberId;
  readonly membershipRevision: number;
  readonly role: CollabRole;
}

export type ListProjectMembersRequest = CollabProjectRequest;

export interface ListProjectMembersResponse {
  readonly managerSetGeneration: number;
  readonly members: readonly CollabProjectMemberSummary[];
  readonly projectId: CollabProjectId;
}

export interface ReissueTransferredMembershipClaimRequest extends CollabProjectMutationRequest {
  readonly expectedClaimGeneration: number;
  readonly expectedManagerSetGeneration: number;
  readonly expectedMembershipRevision: number;
  readonly memberId: CollabMemberId;
}

export interface ReissueTransferredMembershipClaimResponse {
  readonly claim: string;
  readonly claimGeneration: number;
  readonly createdAt: CollabIsoTimestamp;
  readonly expiresAt: CollabIsoTimestamp;
  readonly memberId: CollabMemberId;
  readonly projectId: CollabProjectId;
  readonly secretReplayExpiresAt: CollabIsoTimestamp;
}

export type RevokeTransferredMembershipClaimRequest =
  ReissueTransferredMembershipClaimRequest;

export interface RevokeTransferredMembershipClaimResponse {
  readonly claimGeneration: number;
  readonly memberId: CollabMemberId;
  readonly projectId: CollabProjectId;
  readonly revokedAt: CollabIsoTimestamp;
  readonly state: 'revoked';
}

export interface CollabManagerResponsibilityOffer {
  readonly acknowledgedAt: CollabIsoTimestamp | null;
  readonly expiresAt: CollabIsoTimestamp;
  readonly managerSetGenerationAtOffer: number;
  readonly offeredAt: CollabIsoTimestamp;
  readonly offerId: string;
  readonly purpose: CollabManagerResponsibilityPurpose;
  readonly revision: number;
  readonly sourceManagerMemberId: CollabMemberId;
  readonly state: CollabManagerResponsibilityOfferState;
  readonly targetMemberId: CollabMemberId;
  readonly targetMembershipRevisionAtOffer: number;
  readonly terminalAt: CollabIsoTimestamp | null;
}

export interface CreateManagerResponsibilityOfferRequest extends CollabProjectMutationRequest {
  readonly expectedManagerSetGeneration: number;
  readonly expectedTargetMembershipRevision: number;
  readonly purpose: CollabManagerResponsibilityPurpose;
  readonly targetMemberId: CollabMemberId;
}

export interface CollabManagerResponsibilityOfferResponse {
  readonly offer: CollabManagerResponsibilityOffer;
}

export type ListCurrentManagerResponsibilityOffersRequest = CollabProjectRequest;

export interface ListCurrentManagerResponsibilityOffersResponse {
  readonly offers: readonly CollabManagerResponsibilityOffer[];
  readonly projectId: CollabProjectId;
}

export interface GetManagerResponsibilityOfferRequest extends CollabProjectRequest {
  readonly offerId: string;
}

export interface TransitionManagerResponsibilityOfferRequest extends
  CollabProjectMutationRequest {
  readonly expectedOfferRevision: number;
  readonly offerId: string;
}

export interface PromoteManagerRequest extends CollabProjectMutationRequest {
  readonly expectedManagerSetGeneration: number;
  readonly expectedOfferRevision: number;
  readonly expectedTargetMembershipRevision: number;
  readonly managerResponsibilityOfferId: string;
  readonly targetMemberId: CollabMemberId;
}

export interface PromoteManagerResponse {
  readonly managerSetGeneration: number;
  readonly membershipRevision: number;
  readonly offerRevision: number;
  readonly projectId: CollabProjectId;
  readonly promotedMemberId: CollabMemberId;
}

export interface DemoteManagerRequest extends CollabProjectMutationRequest {
  readonly expectedManagerSetGeneration: number;
  readonly expectedTargetMembershipRevision: number;
  readonly targetMemberId: CollabMemberId;
}

export interface DemoteManagerResponse {
  readonly demotedMemberId: CollabMemberId;
  readonly managerSetGeneration: number;
  readonly membershipRevision: number;
  readonly projectId: CollabProjectId;
}

export type RemoveMemberRequest = DemoteManagerRequest;

export interface RemoveMemberResponse {
  readonly discardedRequestId: CollabRequestId | null;
  readonly managerSetGeneration: number;
  readonly memberId: CollabMemberId;
  readonly projectId: CollabProjectId;
  readonly removedAt: CollabIsoTimestamp;
  readonly status: 'revoked';
}

export interface LeaveProjectRequest extends CollabProjectMutationRequest {
  readonly expectedManagerSetGeneration: number;
  readonly expectedMembershipRevision: number;
  readonly expectedOfferRevision: number | null;
  readonly expectedPersonalRefOid: CollabGitOid;
  readonly managerResponsibilityOfferId: string | null;
}

export interface LeaveProjectResponse {
  readonly discardedRequestId: CollabRequestId | null;
  readonly leftAt: CollabIsoTimestamp;
  readonly managerSetGeneration: number;
  readonly memberId: CollabMemberId;
  readonly projectId: CollabProjectId;
  readonly promotedSuccessorMemberId: CollabMemberId | null;
  readonly status: 'left';
}

export const COLLAB_PROJECT_MEMBERSHIP_OPERATIONS = Object.freeze([
  'createCloudProject',
  'createProjectInvitation',
  'listProjectInvitations',
  'revokeProjectInvitation',
  'joinCloudProject',
  'listProjectMembers',
  'reissueTransferredMembershipClaim',
  'revokeTransferredMembershipClaim',
  'createManagerResponsibilityOffer',
  'listCurrentManagerResponsibilityOffers',
  'getManagerResponsibilityOffer',
  'acknowledgeManagerResponsibility',
  'declineManagerResponsibility',
  'cancelManagerResponsibilityOffer',
  'promoteManager',
  'demoteManager',
  'removeMember',
  'leaveProject',
] as const);

export type CollabProjectMembershipOperation =
  typeof COLLAB_PROJECT_MEMBERSHIP_OPERATIONS[number];

export interface CollabProjectMembershipOperationMap {
  readonly createCloudProject: {
    readonly request: CreateCloudProjectRequest;
    readonly response: CreateCloudProjectResponse;
  };
  readonly createProjectInvitation: {
    readonly request: CreateProjectInvitationRequest;
    readonly response: CreateProjectInvitationResponse;
  };
  readonly listProjectInvitations: {
    readonly request: ListProjectInvitationsRequest;
    readonly response: ListProjectInvitationsResponse;
  };
  readonly revokeProjectInvitation: {
    readonly request: RevokeProjectInvitationRequest;
    readonly response: RevokeProjectInvitationResponse;
  };
  readonly joinCloudProject: {
    readonly request: JoinCloudProjectRequest;
    readonly response: JoinCloudProjectResponse;
  };
  readonly listProjectMembers: {
    readonly request: ListProjectMembersRequest;
    readonly response: ListProjectMembersResponse;
  };
  readonly reissueTransferredMembershipClaim: {
    readonly request: ReissueTransferredMembershipClaimRequest;
    readonly response: ReissueTransferredMembershipClaimResponse;
  };
  readonly revokeTransferredMembershipClaim: {
    readonly request: RevokeTransferredMembershipClaimRequest;
    readonly response: RevokeTransferredMembershipClaimResponse;
  };
  readonly createManagerResponsibilityOffer: {
    readonly request: CreateManagerResponsibilityOfferRequest;
    readonly response: CollabManagerResponsibilityOfferResponse;
  };
  readonly listCurrentManagerResponsibilityOffers: {
    readonly request: ListCurrentManagerResponsibilityOffersRequest;
    readonly response: ListCurrentManagerResponsibilityOffersResponse;
  };
  readonly getManagerResponsibilityOffer: {
    readonly request: GetManagerResponsibilityOfferRequest;
    readonly response: CollabManagerResponsibilityOfferResponse;
  };
  readonly acknowledgeManagerResponsibility: {
    readonly request: TransitionManagerResponsibilityOfferRequest;
    readonly response: CollabManagerResponsibilityOfferResponse;
  };
  readonly declineManagerResponsibility: {
    readonly request: TransitionManagerResponsibilityOfferRequest;
    readonly response: CollabManagerResponsibilityOfferResponse;
  };
  readonly cancelManagerResponsibilityOffer: {
    readonly request: TransitionManagerResponsibilityOfferRequest;
    readonly response: CollabManagerResponsibilityOfferResponse;
  };
  readonly promoteManager: {
    readonly request: PromoteManagerRequest;
    readonly response: PromoteManagerResponse;
  };
  readonly demoteManager: {
    readonly request: DemoteManagerRequest;
    readonly response: DemoteManagerResponse;
  };
  readonly removeMember: {
    readonly request: RemoveMemberRequest;
    readonly response: RemoveMemberResponse;
  };
  readonly leaveProject: {
    readonly request: LeaveProjectRequest;
    readonly response: LeaveProjectResponse;
  };
}

type UnknownRecord = Readonly<Record<string, unknown>>;

export interface CollabProjectMembershipOperationCodec<Request, Response> {
  readonly decodeRequest: (input: unknown) => CollabDecodeResult<Request>;
  readonly decodeResponse: (input: unknown) => Response;
}

type OperationCodecMap = {
  readonly [Operation in CollabProjectMembershipOperation]:
  CollabProjectMembershipOperationCodec<
    CollabProjectMembershipOperationMap[Operation]['request'],
    CollabProjectMembershipOperationMap[Operation]['response']
  >;
};

function invalidPayload(field: string): CollabError {
  return new CollabError({ code: 'protocol-payload-invalid', safeContext: { field } });
}

function exactRecord(value: unknown, field: string, keys: readonly string[]): UnknownRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw invalidPayload(field);
  }
  const source = value as UnknownRecord;
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

function boundedText(source: UnknownRecord, field: string, maximum: number): string {
  const value = source[field];
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.includes('\u0000')
    || !hasUtf8ByteLengthAtMost(value, maximum)
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

function nonNegativeInteger(source: UnknownRecord, field: string): number {
  const value = source[field];
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw invalidPayload(field);
  }
  return value;
}

function literal<Value extends string>(
  source: UnknownRecord,
  field: string,
  values: readonly Value[],
): Value {
  const value = source[field];
  if (typeof value !== 'string' || !values.includes(value as Value)) {
    throw invalidPayload(field);
  }
  return value as Value;
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

function hasExactDuration(
  start: CollabIsoTimestamp,
  end: CollabIsoTimestamp,
  durationMs: number,
): boolean {
  return Date.parse(end) === Date.parse(start) + durationMs;
}

function nullableTimestamp(source: UnknownRecord, field: string): CollabIsoTimestamp | null {
  return source[field] === null ? null : timestamp(source, field);
}

function nullableToken(
  source: UnknownRecord,
  field: string,
  validate: (value: unknown) => boolean = isCollabOpaqueId,
): string | null {
  return source[field] === null ? null : token(source, field, validate);
}

function secret(source: UnknownRecord, field: string, exactLength: number): string {
  const value = source[field];
  if (
    typeof value !== 'string'
    || value.length !== exactLength
    || !/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/u.test(value)
  ) throw invalidPayload(field);
  return value;
}

function projectFields(source: UnknownRecord): CollabProjectRequest {
  return { projectId: token(source, 'projectId', isCollabProjectId) };
}

function mutationFields(source: UnknownRecord): CollabProjectMutationRequest {
  return {
    idempotencyKey: token(source, 'idempotencyKey'),
    ...projectFields(source),
  };
}

function personalRef(source: UnknownRecord, memberId: string): string {
  const value = token(source, 'personalRef', value => typeof value === 'string');
  if (value !== `${COLLAB_MEMBER_REF_PREFIX}${memberId}`) throw invalidPayload('personalRef');
  return value;
}

function decodeProjectRequest(value: unknown): CollabProjectRequest {
  return projectFields(exactRecord(value, 'request', ['projectId']));
}

function decodeCreateCloudProjectRequest(value: unknown): CreateCloudProjectRequest {
  const source = exactRecord(value, 'request', [
    'idempotencyKey',
    'managerDisplayName',
    'projectId',
    'projectName',
  ]);
  return {
    ...mutationFields(source),
    managerDisplayName: boundedText(
      source,
      'managerDisplayName',
      COLLAB_PROJECT_MEMBERSHIP_LIMITS.maxDisplayNameUtf8Bytes,
    ),
    projectName: boundedText(
      source,
      'projectName',
      COLLAB_PROJECT_MEMBERSHIP_LIMITS.maxProjectNameUtf8Bytes,
    ),
  };
}

function decodeCreateCloudProjectResponse(value: unknown): CreateCloudProjectResponse {
  const source = exactRecord(value, 'response', [
    'createdAt',
    'mainOid',
    'managerSetGeneration',
    'memberId',
    'membershipRevision',
    'personalRef',
    'projectId',
    'role',
  ]);
  const memberId = token(source, 'memberId', isCollabMemberId);
  if (
    source.managerSetGeneration !== 1
    || source.membershipRevision !== 2
    || source.role !== 'manager'
  ) throw invalidPayload('response');
  return {
    createdAt: timestamp(source, 'createdAt'),
    mainOid: token(source, 'mainOid', isCollabGitOid),
    managerSetGeneration: 1,
    memberId,
    membershipRevision: 2,
    personalRef: personalRef(source, memberId),
    projectId: token(source, 'projectId', isCollabProjectId),
    role: 'manager',
  };
}

function decodeCreateInvitationRequest(value: unknown): CreateProjectInvitationRequest {
  const source = exactRecord(value, 'request', [
    'expectedManagerSetGeneration',
    'idempotencyKey',
    'projectId',
  ]);
  return {
    expectedManagerSetGeneration: positiveInteger(source, 'expectedManagerSetGeneration'),
    ...mutationFields(source),
  };
}

function decodeCreateInvitationResponse(value: unknown): CreateProjectInvitationResponse {
  const source = exactRecord(value, 'response', [
    'createdAt',
    'expiresAt',
    'invitationId',
    'issuedState',
    'projectId',
    'secret',
    'secretReplayExpiresAt',
  ]);
  const createdAt = timestamp(source, 'createdAt');
  const expiresAt = timestamp(source, 'expiresAt');
  const secretReplayExpiresAt = timestamp(source, 'secretReplayExpiresAt');
  if (
    source.issuedState !== 'active'
    || !hasExactDuration(
      createdAt,
      expiresAt,
      COLLAB_PROJECT_MEMBERSHIP_LIMITS.invitationTtlMs,
    )
    || !hasExactDuration(
      createdAt,
      secretReplayExpiresAt,
      COLLAB_PROJECT_MEMBERSHIP_LIMITS.secretReplayTtlMs,
    )
  ) throw invalidPayload('response');
  return {
    createdAt,
    expiresAt,
    invitationId: token(source, 'invitationId'),
    issuedState: 'active',
    projectId: token(source, 'projectId', isCollabProjectId),
    secret: secret(source, 'secret', COLLAB_PROJECT_MEMBERSHIP_LIMITS.invitationSecretLength),
    secretReplayExpiresAt,
  };
}

function decodeInvitationSummary(value: unknown): CollabProjectInvitationSummary {
  const source = exactRecord(value, 'invitation', [
    'createdAt',
    'expiresAt',
    'invitationId',
    'revision',
    'state',
    'terminalAt',
  ]);
  const state = literal(source, 'state', [
    'active',
    'redeeming',
    'redeemed',
    'revoked',
    'expired',
  ] as const);
  const createdAt = timestamp(source, 'createdAt');
  const expiresAt = timestamp(source, 'expiresAt');
  const terminalAt = nullableTimestamp(source, 'terminalAt');
  const terminal = state === 'redeemed' || state === 'revoked' || state === 'expired';
  if (
    !hasExactDuration(
      createdAt,
      expiresAt,
      COLLAB_PROJECT_MEMBERSHIP_LIMITS.invitationTtlMs,
    )
    || terminal !== (terminalAt !== null)
    || (terminalAt !== null && Date.parse(terminalAt) < Date.parse(createdAt))
  ) throw invalidPayload('invitation');
  return {
    createdAt,
    expiresAt,
    invitationId: token(source, 'invitationId'),
    revision: positiveInteger(source, 'revision'),
    state,
    terminalAt,
  };
}

function decodeListInvitationsResponse(value: unknown): ListProjectInvitationsResponse {
  const source = exactRecord(value, 'response', [
    'invitations',
    'managerSetGeneration',
    'projectId',
  ]);
  if (
    !Array.isArray(source.invitations)
    || source.invitations.length > COLLAB_PROJECT_MEMBERSHIP_LIMITS.maxProjectInvitations
  ) throw invalidPayload('invitations');
  return {
    invitations: source.invitations.map(decodeInvitationSummary),
    managerSetGeneration: positiveInteger(source, 'managerSetGeneration'),
    projectId: token(source, 'projectId', isCollabProjectId),
  };
}

function decodeRevokeInvitationRequest(value: unknown): RevokeProjectInvitationRequest {
  const source = exactRecord(value, 'request', [
    'expectedInvitationRevision',
    'expectedManagerSetGeneration',
    'idempotencyKey',
    'invitationId',
    'projectId',
  ]);
  return {
    expectedInvitationRevision: positiveInteger(source, 'expectedInvitationRevision'),
    expectedManagerSetGeneration: positiveInteger(source, 'expectedManagerSetGeneration'),
    ...mutationFields(source),
    invitationId: token(source, 'invitationId'),
  };
}

function decodeRevokeInvitationResponse(value: unknown): RevokeProjectInvitationResponse {
  const source = exactRecord(value, 'response', [
    'invitationId',
    'projectId',
    'revision',
    'revokedAt',
    'state',
  ]);
  if (source.state !== 'revoked') throw invalidPayload('state');
  return {
    invitationId: token(source, 'invitationId'),
    projectId: token(source, 'projectId', isCollabProjectId),
    revision: positiveInteger(source, 'revision'),
    revokedAt: timestamp(source, 'revokedAt'),
    state: 'revoked',
  };
}

function decodeJoinRequest(value: unknown): JoinCloudProjectRequest {
  const source = exactRecord(value, 'request', [
    'displayName',
    'idempotencyKey',
    'invitationId',
    'projectId',
    'secret',
  ]);
  return {
    displayName: boundedText(
      source,
      'displayName',
      COLLAB_PROJECT_MEMBERSHIP_LIMITS.maxDisplayNameUtf8Bytes,
    ),
    ...mutationFields(source),
    invitationId: token(source, 'invitationId'),
    secret: secret(source, 'secret', COLLAB_PROJECT_MEMBERSHIP_LIMITS.invitationSecretLength),
  };
}

function decodeJoinResponse(value: unknown): JoinCloudProjectResponse {
  const source = exactRecord(value, 'response', [
    'joinedAt',
    'mainOid',
    'managerSetGeneration',
    'memberId',
    'membershipRevision',
    'personalRef',
    'projectId',
    'role',
  ]);
  const memberId = token(source, 'memberId', isCollabMemberId);
  if (source.membershipRevision !== 2 || source.role !== 'member') {
    throw invalidPayload('response');
  }
  return {
    joinedAt: timestamp(source, 'joinedAt'),
    mainOid: token(source, 'mainOid', isCollabGitOid),
    managerSetGeneration: positiveInteger(source, 'managerSetGeneration'),
    memberId,
    membershipRevision: 2,
    personalRef: personalRef(source, memberId),
    projectId: token(source, 'projectId', isCollabProjectId),
    role: 'member',
  };
}

function decodeMemberSummary(value: unknown): CollabProjectMemberSummary {
  const source = exactRecord(value, 'member', [
    'bindingState',
    'displayName',
    'importedClaimState',
    'memberId',
    'membershipRevision',
    'role',
  ]);
  return {
    bindingState: literal(source, 'bindingState', ['bound', 'unbound', 'hidden'] as const),
    displayName: boundedText(
      source,
      'displayName',
      COLLAB_PROJECT_MEMBERSHIP_LIMITS.maxDisplayNameUtf8Bytes,
    ),
    importedClaimState: literal(source, 'importedClaimState', [
      'not-applicable',
      'original-active',
      'override-active',
      'revoked',
      'expired',
      'redeemed',
      'hidden',
    ] as const),
    memberId: token(source, 'memberId', isCollabMemberId),
    membershipRevision: positiveInteger(source, 'membershipRevision'),
    role: literal(source, 'role', ['manager', 'member'] as const),
  };
}

function decodeListMembersResponse(value: unknown): ListProjectMembersResponse {
  const source = exactRecord(value, 'response', [
    'managerSetGeneration',
    'members',
    'projectId',
  ]);
  if (
    !Array.isArray(source.members)
    || source.members.length > COLLAB_PROJECT_MEMBERSHIP_LIMITS.maxProjectMembers
  ) throw invalidPayload('members');
  return {
    managerSetGeneration: positiveInteger(source, 'managerSetGeneration'),
    members: source.members.map(decodeMemberSummary),
    projectId: token(source, 'projectId', isCollabProjectId),
  };
}

function decodeClaimMutationRequest(
  value: unknown,
): ReissueTransferredMembershipClaimRequest {
  const source = exactRecord(value, 'request', [
    'expectedClaimGeneration',
    'expectedManagerSetGeneration',
    'expectedMembershipRevision',
    'idempotencyKey',
    'memberId',
    'projectId',
  ]);
  return {
    expectedClaimGeneration: nonNegativeInteger(source, 'expectedClaimGeneration'),
    expectedManagerSetGeneration: positiveInteger(source, 'expectedManagerSetGeneration'),
    expectedMembershipRevision: positiveInteger(source, 'expectedMembershipRevision'),
    ...mutationFields(source),
    memberId: token(source, 'memberId', isCollabMemberId),
  };
}

function decodeReissueClaimResponse(
  value: unknown,
): ReissueTransferredMembershipClaimResponse {
  const source = exactRecord(value, 'response', [
    'claim',
    'claimGeneration',
    'createdAt',
    'expiresAt',
    'memberId',
    'projectId',
    'secretReplayExpiresAt',
  ]);
  const createdAt = timestamp(source, 'createdAt');
  const expiresAt = timestamp(source, 'expiresAt');
  const secretReplayExpiresAt = timestamp(source, 'secretReplayExpiresAt');
  if (
    !hasExactDuration(
      createdAt,
      expiresAt,
      COLLAB_PROJECT_MEMBERSHIP_LIMITS.transferredClaimTtlMs,
    )
    || !hasExactDuration(
      createdAt,
      secretReplayExpiresAt,
      COLLAB_PROJECT_MEMBERSHIP_LIMITS.secretReplayTtlMs,
    )
  ) throw invalidPayload('response');
  return {
    claim: secret(source, 'claim', COLLAB_PROJECT_MEMBERSHIP_LIMITS.transferredClaimLength),
    claimGeneration: positiveInteger(source, 'claimGeneration'),
    createdAt,
    expiresAt,
    memberId: token(source, 'memberId', isCollabMemberId),
    projectId: token(source, 'projectId', isCollabProjectId),
    secretReplayExpiresAt,
  };
}

function decodeRevokeClaimResponse(
  value: unknown,
): RevokeTransferredMembershipClaimResponse {
  const source = exactRecord(value, 'response', [
    'claimGeneration',
    'memberId',
    'projectId',
    'revokedAt',
    'state',
  ]);
  if (source.state !== 'revoked') throw invalidPayload('state');
  return {
    claimGeneration: nonNegativeInteger(source, 'claimGeneration'),
    memberId: token(source, 'memberId', isCollabMemberId),
    projectId: token(source, 'projectId', isCollabProjectId),
    revokedAt: timestamp(source, 'revokedAt'),
    state: 'revoked',
  };
}

function decodeOffer(value: unknown): CollabManagerResponsibilityOffer {
  const source = exactRecord(value, 'offer', [
    'acknowledgedAt',
    'expiresAt',
    'managerSetGenerationAtOffer',
    'offeredAt',
    'offerId',
    'purpose',
    'revision',
    'sourceManagerMemberId',
    'state',
    'targetMemberId',
    'targetMembershipRevisionAtOffer',
    'terminalAt',
  ]);
  const state = literal(source, 'state', [
    'offered',
    'acknowledged',
    'declined',
    'cancelled',
    'consumed',
    'expired',
  ] as const);
  const offeredAt = timestamp(source, 'offeredAt');
  const expiresAt = timestamp(source, 'expiresAt');
  const acknowledgedAt = nullableTimestamp(source, 'acknowledgedAt');
  const terminalAt = nullableTimestamp(source, 'terminalAt');
  const isTerminal = ['declined', 'cancelled', 'consumed', 'expired'].includes(state);
  if (
    !hasExactDuration(
      offeredAt,
      expiresAt,
      COLLAB_PROJECT_MEMBERSHIP_LIMITS.managerResponsibilityOfferTtlMs,
    )
    || (state === 'offered' && acknowledgedAt !== null)
    || (state === 'acknowledged' && acknowledgedAt === null)
    || isTerminal !== (terminalAt !== null)
    || (acknowledgedAt !== null && Date.parse(acknowledgedAt) < Date.parse(offeredAt))
    || (terminalAt !== null && Date.parse(terminalAt) < Date.parse(offeredAt))
  ) throw invalidPayload('offer');
  return {
    acknowledgedAt,
    expiresAt,
    managerSetGenerationAtOffer: positiveInteger(source, 'managerSetGenerationAtOffer'),
    offeredAt,
    offerId: token(source, 'offerId'),
    purpose: literal(source, 'purpose', ['manager-promotion', 'manager-leave'] as const),
    revision: positiveInteger(source, 'revision'),
    sourceManagerMemberId: token(source, 'sourceManagerMemberId', isCollabMemberId),
    state,
    targetMemberId: token(source, 'targetMemberId', isCollabMemberId),
    targetMembershipRevisionAtOffer: positiveInteger(
      source,
      'targetMembershipRevisionAtOffer',
    ),
    terminalAt,
  };
}

function decodeOfferResponse(value: unknown): CollabManagerResponsibilityOfferResponse {
  const source = exactRecord(value, 'response', ['offer']);
  return { offer: decodeOffer(source.offer) };
}

function decodeCreateOfferRequest(value: unknown): CreateManagerResponsibilityOfferRequest {
  const source = exactRecord(value, 'request', [
    'expectedManagerSetGeneration',
    'expectedTargetMembershipRevision',
    'idempotencyKey',
    'projectId',
    'purpose',
    'targetMemberId',
  ]);
  return {
    expectedManagerSetGeneration: positiveInteger(source, 'expectedManagerSetGeneration'),
    expectedTargetMembershipRevision: positiveInteger(
      source,
      'expectedTargetMembershipRevision',
    ),
    ...mutationFields(source),
    purpose: literal(source, 'purpose', ['manager-promotion', 'manager-leave'] as const),
    targetMemberId: token(source, 'targetMemberId', isCollabMemberId),
  };
}

function decodeListOffersResponse(
  value: unknown,
): ListCurrentManagerResponsibilityOffersResponse {
  const source = exactRecord(value, 'response', ['offers', 'projectId']);
  if (
    !Array.isArray(source.offers)
    || source.offers.length > COLLAB_PROJECT_MEMBERSHIP_LIMITS.maxCurrentManagerOffers
  ) throw invalidPayload('offers');
  const offers = source.offers.map(decodeOffer);
  if (
    offers.some(item => item.state !== 'offered' && item.state !== 'acknowledged')
    || offers.some((item, index) => (
      index > 0 && offers[index - 1].offerId.localeCompare(item.offerId, 'en-US') >= 0
    ))
  ) throw invalidPayload('offers');
  return {
    offers,
    projectId: token(source, 'projectId', isCollabProjectId),
  };
}

function decodeGetOfferRequest(value: unknown): GetManagerResponsibilityOfferRequest {
  const source = exactRecord(value, 'request', ['offerId', 'projectId']);
  return { offerId: token(source, 'offerId'), ...projectFields(source) };
}

function decodeTransitionOfferRequest(
  value: unknown,
): TransitionManagerResponsibilityOfferRequest {
  const source = exactRecord(value, 'request', [
    'expectedOfferRevision',
    'idempotencyKey',
    'offerId',
    'projectId',
  ]);
  return {
    expectedOfferRevision: positiveInteger(source, 'expectedOfferRevision'),
    ...mutationFields(source),
    offerId: token(source, 'offerId'),
  };
}

function decodePromoteRequest(value: unknown): PromoteManagerRequest {
  const source = exactRecord(value, 'request', [
    'expectedManagerSetGeneration',
    'expectedOfferRevision',
    'expectedTargetMembershipRevision',
    'idempotencyKey',
    'managerResponsibilityOfferId',
    'projectId',
    'targetMemberId',
  ]);
  return {
    expectedManagerSetGeneration: positiveInteger(source, 'expectedManagerSetGeneration'),
    expectedOfferRevision: positiveInteger(source, 'expectedOfferRevision'),
    expectedTargetMembershipRevision: positiveInteger(
      source,
      'expectedTargetMembershipRevision',
    ),
    ...mutationFields(source),
    managerResponsibilityOfferId: token(source, 'managerResponsibilityOfferId'),
    targetMemberId: token(source, 'targetMemberId', isCollabMemberId),
  };
}

function decodePromoteResponse(value: unknown): PromoteManagerResponse {
  const source = exactRecord(value, 'response', [
    'managerSetGeneration',
    'membershipRevision',
    'offerRevision',
    'projectId',
    'promotedMemberId',
  ]);
  return {
    managerSetGeneration: positiveInteger(source, 'managerSetGeneration'),
    membershipRevision: positiveInteger(source, 'membershipRevision'),
    offerRevision: positiveInteger(source, 'offerRevision'),
    projectId: token(source, 'projectId', isCollabProjectId),
    promotedMemberId: token(source, 'promotedMemberId', isCollabMemberId),
  };
}

function decodeTargetRoleRequest(value: unknown): DemoteManagerRequest {
  const source = exactRecord(value, 'request', [
    'expectedManagerSetGeneration',
    'expectedTargetMembershipRevision',
    'idempotencyKey',
    'projectId',
    'targetMemberId',
  ]);
  return {
    expectedManagerSetGeneration: positiveInteger(source, 'expectedManagerSetGeneration'),
    expectedTargetMembershipRevision: positiveInteger(
      source,
      'expectedTargetMembershipRevision',
    ),
    ...mutationFields(source),
    targetMemberId: token(source, 'targetMemberId', isCollabMemberId),
  };
}

function decodeDemoteResponse(value: unknown): DemoteManagerResponse {
  const source = exactRecord(value, 'response', [
    'demotedMemberId',
    'managerSetGeneration',
    'membershipRevision',
    'projectId',
  ]);
  return {
    demotedMemberId: token(source, 'demotedMemberId', isCollabMemberId),
    managerSetGeneration: positiveInteger(source, 'managerSetGeneration'),
    membershipRevision: positiveInteger(source, 'membershipRevision'),
    projectId: token(source, 'projectId', isCollabProjectId),
  };
}

function decodeRemoveResponse(value: unknown): RemoveMemberResponse {
  const source = exactRecord(value, 'response', [
    'discardedRequestId',
    'managerSetGeneration',
    'memberId',
    'projectId',
    'removedAt',
    'status',
  ]);
  if (source.status !== 'revoked') throw invalidPayload('status');
  return {
    discardedRequestId: nullableToken(source, 'discardedRequestId'),
    managerSetGeneration: positiveInteger(source, 'managerSetGeneration'),
    memberId: token(source, 'memberId', isCollabMemberId),
    projectId: token(source, 'projectId', isCollabProjectId),
    removedAt: timestamp(source, 'removedAt'),
    status: 'revoked',
  };
}

function decodeLeaveRequest(value: unknown): LeaveProjectRequest {
  const source = exactRecord(value, 'request', [
    'expectedManagerSetGeneration',
    'expectedMembershipRevision',
    'expectedOfferRevision',
    'expectedPersonalRefOid',
    'idempotencyKey',
    'managerResponsibilityOfferId',
    'projectId',
  ]);
  const managerResponsibilityOfferId = nullableToken(
    source,
    'managerResponsibilityOfferId',
  );
  const expectedOfferRevision = source.expectedOfferRevision === null
    ? null
    : positiveInteger(source, 'expectedOfferRevision');
  if ((managerResponsibilityOfferId === null) !== (expectedOfferRevision === null)) {
    throw invalidPayload('managerResponsibilityOfferId');
  }
  return {
    expectedManagerSetGeneration: positiveInteger(source, 'expectedManagerSetGeneration'),
    expectedMembershipRevision: positiveInteger(source, 'expectedMembershipRevision'),
    expectedOfferRevision,
    expectedPersonalRefOid: token(source, 'expectedPersonalRefOid', isCollabGitOid),
    ...mutationFields(source),
    managerResponsibilityOfferId,
  };
}

function decodeLeaveResponse(value: unknown): LeaveProjectResponse {
  const source = exactRecord(value, 'response', [
    'discardedRequestId',
    'leftAt',
    'managerSetGeneration',
    'memberId',
    'projectId',
    'promotedSuccessorMemberId',
    'status',
  ]);
  if (source.status !== 'left') throw invalidPayload('status');
  return {
    discardedRequestId: nullableToken(source, 'discardedRequestId'),
    leftAt: timestamp(source, 'leftAt'),
    managerSetGeneration: positiveInteger(source, 'managerSetGeneration'),
    memberId: token(source, 'memberId', isCollabMemberId),
    projectId: token(source, 'projectId', isCollabProjectId),
    promotedSuccessorMemberId: nullableToken(
      source,
      'promotedSuccessorMemberId',
      isCollabMemberId,
    ),
    status: 'left',
  };
}

function codec<Request, Response>(
  decodeRequestValue: (value: unknown) => Request,
  decodeResponse: (value: unknown) => Response,
): CollabProjectMembershipOperationCodec<Request, Response> {
  return Object.freeze({
    decodeRequest: (input: unknown): CollabDecodeResult<Request> => {
      try {
        return { status: 'ok', value: decodeRequestValue(input) };
      } catch (error) {
        if (error instanceof CollabError && error.code === 'protocol-payload-invalid') {
          return { error, status: 'invalid' };
        }
        throw error;
      }
    },
    decodeResponse,
  });
}

export const COLLAB_PROJECT_MEMBERSHIP_OPERATION_CODECS = Object.freeze({
  createCloudProject: codec(decodeCreateCloudProjectRequest, decodeCreateCloudProjectResponse),
  createProjectInvitation: codec(
    decodeCreateInvitationRequest,
    decodeCreateInvitationResponse,
  ),
  listProjectInvitations: codec(decodeProjectRequest, decodeListInvitationsResponse),
  revokeProjectInvitation: codec(
    decodeRevokeInvitationRequest,
    decodeRevokeInvitationResponse,
  ),
  joinCloudProject: codec(decodeJoinRequest, decodeJoinResponse),
  listProjectMembers: codec(decodeProjectRequest, decodeListMembersResponse),
  reissueTransferredMembershipClaim: codec(
    decodeClaimMutationRequest,
    decodeReissueClaimResponse,
  ),
  revokeTransferredMembershipClaim: codec(
    decodeClaimMutationRequest,
    decodeRevokeClaimResponse,
  ),
  createManagerResponsibilityOffer: codec(decodeCreateOfferRequest, decodeOfferResponse),
  listCurrentManagerResponsibilityOffers: codec(decodeProjectRequest, decodeListOffersResponse),
  getManagerResponsibilityOffer: codec(decodeGetOfferRequest, decodeOfferResponse),
  acknowledgeManagerResponsibility: codec(decodeTransitionOfferRequest, decodeOfferResponse),
  declineManagerResponsibility: codec(decodeTransitionOfferRequest, decodeOfferResponse),
  cancelManagerResponsibilityOffer: codec(decodeTransitionOfferRequest, decodeOfferResponse),
  promoteManager: codec(decodePromoteRequest, decodePromoteResponse),
  demoteManager: codec(decodeTargetRoleRequest, decodeDemoteResponse),
  removeMember: codec(decodeTargetRoleRequest, decodeRemoveResponse),
  leaveProject: codec(decodeLeaveRequest, decodeLeaveResponse),
} as const satisfies OperationCodecMap);

export function decodeCollabProjectMembershipOperationRequest<
  Operation extends CollabProjectMembershipOperation,
>(
  operation: Operation,
  value: unknown,
): CollabDecodeResult<CollabProjectMembershipOperationMap[Operation]['request']> {
  return COLLAB_PROJECT_MEMBERSHIP_OPERATION_CODECS[operation].decodeRequest(value);
}

export function decodeCollabProjectMembershipOperationResponse<
  Operation extends CollabProjectMembershipOperation,
>(
  operation: Operation,
  value: unknown,
): CollabProjectMembershipOperationMap[Operation]['response'] {
  return COLLAB_PROJECT_MEMBERSHIP_OPERATION_CODECS[operation].decodeResponse(value);
}
