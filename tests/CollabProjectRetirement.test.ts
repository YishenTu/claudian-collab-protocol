import {
  COLLAB_PROJECT_RETIREMENT_RESULT_KINDS,
  decodeCollabProjectRetirementAcknowledgement,
  decodeCollabProjectRetirementRequest,
  decodeCollabProjectRetirementResult,
} from '../src/CollabProjectRetirement';

const NOW = '2026-08-25T00:00:00.000Z';
const EXPIRES = '2026-09-24T00:00:00.000Z';
const MAIN = '1'.repeat(40);

function request(overrides: Record<string, unknown> = {}) {
  return {
    expectedAuthorityGeneration: 4,
    expectedMainOid: MAIN,
    idempotencyKey: 'idempotency_1',
    projectId: 'project_1',
    ...overrides,
  };
}

function result(overrides: Record<string, unknown> = {}) {
  return {
    acknowledgementRequired: true,
    kind: 'project-retired',
    projectId: 'project_1',
    retiredAt: NOW,
    retirementId: 'retirement_1',
    terminalExpiresAt: EXPIRES,
    ...overrides,
  };
}

describe('Project retirement contract', () => {
  it('freezes the single safe terminal result kind', () => {
    expect(COLLAB_PROJECT_RETIREMENT_RESULT_KINDS).toEqual(['project-retired']);
  });

  it('decodes a Manager-authorized-at-runtime request without accepting role assertions', () => {
    expect(decodeCollabProjectRetirementRequest(request())).toEqual(request());
    expect(() => decodeCollabProjectRetirementRequest({ ...request(), role: 'manager' }))
      .toThrow('collab.error.protocol-payload-invalid');
  });

  it('decodes a stable content-free terminal result', () => {
    expect(decodeCollabProjectRetirementResult(result())).toEqual(result());
    expect(JSON.stringify(result())).not.toMatch(/name|member|repository|path|content|credential/i);
  });

  it('decodes exact former-principal acknowledgement facts', () => {
    const acknowledgement = {
      acknowledgedAt: NOW,
      idempotencyKey: 'ack_intent_1',
      projectId: 'project_1',
      retirementId: 'retirement_1',
    };
    expect(decodeCollabProjectRetirementAcknowledgement(acknowledgement))
      .toEqual(acknowledgement);
  });

  it.each([
    request({ expectedAuthorityGeneration: 0 }),
    request({ expectedMainOid: 'invalid' }),
    result({ acknowledgementRequired: false }),
    result({ futureField: true }),
    {
      acknowledgedAt: NOW,
      idempotencyKey: 'ack_intent_1',
      memberId: 'member_1',
      projectId: 'project_1',
      retirementId: 'retirement_1',
    },
  ])('rejects stale, extended, or identity-asserting retirement data %#', (input) => {
    const decoder = Object.hasOwn(input, 'expectedMainOid')
      ? decodeCollabProjectRetirementRequest
      : Object.hasOwn(input, 'kind')
        ? decodeCollabProjectRetirementResult
        : decodeCollabProjectRetirementAcknowledgement;
    expect(() => decoder(input)).toThrow('collab.error.protocol-payload-invalid');
  });
});
