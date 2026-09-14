import { CollabError } from '../core/CollabError';
import { isCollabMemberId, isCollabOpaqueId, isCollabProjectId } from '../core/CollabValidation';
import { collabMemberRef } from '../core/types';
import type { CollabDecodeResult } from './CollabProtocol';

export interface CreateProjectRecoveryLinkRequest {
  readonly projectId: string;
  readonly idempotencyKey: string;
  readonly expectedAuthorityGeneration: number;
}

export interface CreateProjectRecoveryLinkResponse {
  readonly projectId: string;
  readonly recoveryLinkId: string;
  readonly authorityGeneration: number;
  readonly token: string;
  readonly expiresAt: string;
  readonly secretReplayExpiresAt: string;
}

export interface RedeemProjectRecoveryLinkRequest extends CreateProjectRecoveryLinkRequest {
  readonly recoveryLinkId: string;
  readonly token: string;
  /** Existing project credential; never an asserted member ID or a credential digest. */
  readonly proofCredential: string;
  /** LAN target credential verifier. Cloud derives its target principal from request authentication. */
  readonly targetCredentialHash?: string;
}

export interface RedeemProjectRecoveryLinkResponse {
  readonly projectId: string;
  readonly recoveryLinkId: string;
  readonly authorityGeneration: number;
  readonly memberId: string;
  readonly personalRef: string;
  readonly receiptId: string;
  readonly recoveredAt: string;
}

export interface CollabProjectRecoveryOperationMap {
  readonly createProjectRecoveryLink: {
    readonly request: CreateProjectRecoveryLinkRequest;
    readonly response: CreateProjectRecoveryLinkResponse;
  };
  readonly redeemProjectRecoveryLink: {
    readonly request: RedeemProjectRecoveryLinkRequest;
    readonly response: RedeemProjectRecoveryLinkResponse;
  };
}

export const COLLAB_PROJECT_RECOVERY_OPERATIONS = Object.freeze([
  'createProjectRecoveryLink', 'redeemProjectRecoveryLink',
] as const);

export const COLLAB_PROJECT_RECOVERY_LIMITS = Object.freeze({
  linkTtlMs: 15 * 60 * 1000,
  secretReplayTtlMs: 10 * 60 * 1000,
  maxActiveLinks: 100,
  /** Authority handoff must reject overflow before relinquishment; never evict older verifiers. */
  maxCredentialVerifiersPerMember: 256,
  maxCredentialUtf8Bytes: 512,
});

function invalid(): never {
  throw new CollabError({ code: 'protocol-payload-invalid', safeContext: { reason: 'project-recovery-payload-invalid' } });
}

function record(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  const result = value as Record<string, unknown>;
  if (required.some(key => !Object.hasOwn(result, key))
    || Object.keys(result).some(key => !required.includes(key) && !optional.includes(key))) return invalid();
  return result;
}

function identifier(value: unknown, validate = isCollabOpaqueId): string {
  if (!validate(value)) return invalid();
  return value;
}

function generation(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) return invalid();
  return value;
}

function digest(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/u.test(value)) return invalid();
  return value;
}

function timestamp(value: unknown): string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))
    || new Date(value).toISOString() !== value) return invalid();
  return value;
}

function mutation(source: Record<string, unknown>): CreateProjectRecoveryLinkRequest {
  return { projectId: identifier(source.projectId, isCollabProjectId),
    idempotencyKey: identifier(source.idempotencyKey),
    expectedAuthorityGeneration: generation(source.expectedAuthorityGeneration) };
}

function createRequest(value: unknown): CreateProjectRecoveryLinkRequest {
  return mutation(record(value, ['projectId', 'idempotencyKey', 'expectedAuthorityGeneration']));
}

function redeemRequest(value: unknown): RedeemProjectRecoveryLinkRequest {
  const source = record(value, ['projectId', 'idempotencyKey', 'expectedAuthorityGeneration',
    'recoveryLinkId', 'token', 'proofCredential'], ['targetCredentialHash']);
  const credential = source.proofCredential;
  if (typeof credential !== 'string' || credential.length < 32
    || credential.length > COLLAB_PROJECT_RECOVERY_LIMITS.maxCredentialUtf8Bytes
    || !/^[A-Za-z0-9_-]+$/u.test(credential)) return invalid();
  return { ...mutation(source), recoveryLinkId: identifier(source.recoveryLinkId),
    token: digest(source.token), proofCredential: credential,
    ...(Object.hasOwn(source, 'targetCredentialHash') ? { targetCredentialHash: digest(source.targetCredentialHash) } : {}) };
}

function createResponse(value: unknown): CreateProjectRecoveryLinkResponse {
  const source = record(value, ['projectId', 'recoveryLinkId', 'authorityGeneration', 'token', 'expiresAt', 'secretReplayExpiresAt']);
  const expiresAt = timestamp(source.expiresAt);
  const secretReplayExpiresAt = timestamp(source.secretReplayExpiresAt);
  if (Date.parse(secretReplayExpiresAt) > Date.parse(expiresAt)) return invalid();
  return { projectId: identifier(source.projectId, isCollabProjectId), recoveryLinkId: identifier(source.recoveryLinkId),
    authorityGeneration: generation(source.authorityGeneration), token: digest(source.token), expiresAt, secretReplayExpiresAt };
}

function redeemResponse(value: unknown): RedeemProjectRecoveryLinkResponse {
  const source = record(value, ['projectId', 'recoveryLinkId', 'authorityGeneration', 'memberId', 'personalRef', 'receiptId', 'recoveredAt']);
  const memberId = identifier(source.memberId, isCollabMemberId);
  const personalRef = collabMemberRef(memberId);
  if (source.personalRef !== personalRef) return invalid();
  return { projectId: identifier(source.projectId, isCollabProjectId), recoveryLinkId: identifier(source.recoveryLinkId),
    authorityGeneration: generation(source.authorityGeneration), memberId, personalRef,
    receiptId: identifier(source.receiptId), recoveredAt: timestamp(source.recoveredAt) };
}

function codec<Request, Response>(decode: (input: unknown) => Request, decodeResponse: (input: unknown) => Response) {
  return Object.freeze({
    decodeRequest(input: unknown): CollabDecodeResult<Request> {
      try { return { status: 'ok', value: decode(input) }; }
      catch (error) {
        if (error instanceof CollabError && error.code === 'protocol-payload-invalid') return { status: 'invalid', error };
        throw error;
      }
    },
    decodeResponse,
  });
}

export const COLLAB_PROJECT_RECOVERY_OPERATION_CODECS = Object.freeze({
  createProjectRecoveryLink: codec(createRequest, createResponse),
  redeemProjectRecoveryLink: codec(redeemRequest, redeemResponse),
});
