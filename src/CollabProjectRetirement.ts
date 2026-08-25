import { CollabError } from './CollabError';
import {
  isCollabGitOid,
  isCollabOpaqueId,
  isCollabProjectId,
} from './CollabValidation';
import type {
  CollabGitOid,
  CollabIsoTimestamp,
  CollabProjectId,
} from './types';

export const COLLAB_PROJECT_RETIREMENT_RESULT_KINDS = Object.freeze([
  'project-retired',
] as const);

export interface CollabProjectRetirementRequest {
  readonly expectedAuthorityGeneration: number;
  readonly expectedMainOid: CollabGitOid;
  readonly idempotencyKey: string;
  readonly projectId: CollabProjectId;
}

export interface CollabProjectRetirementResult {
  readonly acknowledgementRequired: true;
  readonly kind: 'project-retired';
  readonly projectId: CollabProjectId;
  readonly retiredAt: CollabIsoTimestamp;
  readonly retirementId: string;
  readonly terminalExpiresAt: CollabIsoTimestamp;
}

export interface CollabProjectRetirementAcknowledgement {
  readonly acknowledgedAt: CollabIsoTimestamp;
  readonly idempotencyKey: string;
  readonly projectId: CollabProjectId;
  readonly retirementId: string;
}

export interface CollabProjectRetirementAcknowledgementRequest {
  readonly idempotencyKey: string;
  readonly projectId: CollabProjectId;
  readonly retirementId: string;
}

export const COLLAB_PROJECT_RETIREMENT_OPERATIONS = Object.freeze([
  'retireProject',
  'acknowledgeProjectRetirement',
] as const);

export type CollabProjectRetirementOperation =
  typeof COLLAB_PROJECT_RETIREMENT_OPERATIONS[number];

export interface CollabProjectRetirementOperationMap {
  readonly retireProject: {
    readonly request: CollabProjectRetirementRequest;
    readonly response: CollabProjectRetirementResult;
  };
  readonly acknowledgeProjectRetirement: {
    readonly request: CollabProjectRetirementAcknowledgementRequest;
    readonly response: CollabProjectRetirementAcknowledgement;
  };
}

type UnknownRecord = Readonly<Record<string, unknown>>;

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

export function decodeCollabProjectRetirementRequest(
  value: unknown,
): CollabProjectRetirementRequest {
  const source = exactRecord(value, 'retirementRequest', [
    'expectedAuthorityGeneration',
    'expectedMainOid',
    'idempotencyKey',
    'projectId',
  ]);
  return {
    expectedAuthorityGeneration: positiveInteger(source, 'expectedAuthorityGeneration'),
    expectedMainOid: token(source, 'expectedMainOid', isCollabGitOid),
    idempotencyKey: token(source, 'idempotencyKey'),
    projectId: token(source, 'projectId', isCollabProjectId),
  };
}

export function decodeCollabProjectRetirementResult(
  value: unknown,
): CollabProjectRetirementResult {
  const source = exactRecord(value, 'retirementResult', [
    'acknowledgementRequired',
    'kind',
    'projectId',
    'retiredAt',
    'retirementId',
    'terminalExpiresAt',
  ]);
  if (source.acknowledgementRequired !== true || source.kind !== 'project-retired') {
    throw invalidPayload('retirementResult');
  }
  const retiredAt = timestamp(source, 'retiredAt');
  const terminalExpiresAt = timestamp(source, 'terminalExpiresAt');
  if (Date.parse(terminalExpiresAt) <= Date.parse(retiredAt)) {
    throw invalidPayload('terminalExpiresAt');
  }
  return {
    acknowledgementRequired: true,
    kind: 'project-retired',
    projectId: token(source, 'projectId', isCollabProjectId),
    retiredAt,
    retirementId: token(source, 'retirementId'),
    terminalExpiresAt,
  };
}

export function decodeCollabProjectRetirementAcknowledgement(
  value: unknown,
): CollabProjectRetirementAcknowledgement {
  const source = exactRecord(value, 'retirementAcknowledgement', [
    'acknowledgedAt',
    'idempotencyKey',
    'projectId',
    'retirementId',
  ]);
  return {
    acknowledgedAt: timestamp(source, 'acknowledgedAt'),
    idempotencyKey: token(source, 'idempotencyKey'),
    projectId: token(source, 'projectId', isCollabProjectId),
    retirementId: token(source, 'retirementId'),
  };
}

export function decodeCollabProjectRetirementOperationRequest<
  Operation extends CollabProjectRetirementOperation,
>(
  operation: Operation,
  value: unknown,
): CollabProjectRetirementOperationMap[Operation]['request'] {
  if (operation === 'retireProject') {
    return decodeCollabProjectRetirementRequest(value);
  }
  const source = exactRecord(value, 'retirementAcknowledgementRequest', [
    'idempotencyKey',
    'projectId',
    'retirementId',
  ]);
  return {
    idempotencyKey: token(source, 'idempotencyKey'),
    projectId: token(source, 'projectId', isCollabProjectId),
    retirementId: token(source, 'retirementId'),
  };
}

export function decodeCollabProjectRetirementOperationResponse<
  Operation extends CollabProjectRetirementOperation,
>(
  operation: Operation,
  value: unknown,
): CollabProjectRetirementOperationMap[Operation]['response'] {
  return (operation === 'retireProject'
    ? decodeCollabProjectRetirementResult(value)
    : decodeCollabProjectRetirementAcknowledgement(value));
}
