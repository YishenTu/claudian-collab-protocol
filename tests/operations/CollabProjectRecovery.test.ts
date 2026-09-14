import { collabControlOperationCodec } from '../../src';

const projectId = 'project-alpha';
const token = 'a'.repeat(64);
const proofCredential = 'b'.repeat(64);
const create = { projectId, idempotencyKey: 'create-one', expectedAuthorityGeneration: 3 };
const redeem = { projectId, idempotencyKey: 'redeem-one', expectedAuthorityGeneration: 3,
  recoveryLinkId: 'recovery-one', token, proofCredential };

describe('Project recovery contracts', () => {
  it('admits a Project-scoped creation without a sender-selected member', () => {
    expect(collabControlOperationCodec('createProjectRecoveryLink').decodeRequest(create))
      .toEqual({ status: 'ok', value: create });
    expect(collabControlOperationCodec('createProjectRecoveryLink').decodeRequest({ ...create, memberId: 'member-other' }).status)
      .toBe('invalid');
  });

  it('requires both the recovery authorization and possession of an existing credential', () => {
    const codec = collabControlOperationCodec('redeemProjectRecoveryLink');
    expect(codec.decodeRequest(redeem)).toEqual({ status: 'ok', value: redeem });
    for (const invalid of [
      { ...redeem, proofCredential: undefined }, { ...redeem, token: '' },
      { ...redeem, memberId: 'member-other' }, { ...redeem, proofCredential: 'x'.repeat(513) },
      { ...redeem, expectedAuthorityGeneration: 0 }, { ...redeem, proofCredential: 'secret\nheader' },
    ]) expect(codec.decodeRequest(invalid).status).toBe('invalid');
  });

  it('carries a LAN target credential verifier without treating it as old-member proof', () => {
    const request = { ...redeem, targetCredentialHash: 'c'.repeat(64) };
    const codec = collabControlOperationCodec('redeemProjectRecoveryLink');
    expect(codec.decodeRequest(request)).toEqual({ status: 'ok', value: request });
    expect(codec.decodeRequest({ ...request, proofCredential: undefined }).status).toBe('invalid');
  });

  it('validates secret lifetimes and the recovered personal ref', () => {
    const created = { projectId, recoveryLinkId: 'recovery-one', token, authorityGeneration: 3,
      expiresAt: '2030-01-01T00:15:00.000Z', secretReplayExpiresAt: '2030-01-01T00:10:00.000Z' };
    const codec = collabControlOperationCodec('createProjectRecoveryLink');
    expect(codec.decodeResponse(created)).toEqual(created);
    expect(() => codec.decodeResponse({ ...created, secretReplayExpiresAt: '2030-01-01T00:16:00.000Z' })).toThrow();
    const receipt = { projectId, recoveryLinkId: 'recovery-one', authorityGeneration: 3,
      memberId: 'member-maya', personalRef: 'refs/heads/members/member-maya',
      receiptId: 'receipt-one', recoveredAt: '2030-01-01T00:02:00.000Z' };
    expect(collabControlOperationCodec('redeemProjectRecoveryLink').decodeResponse(receipt)).toEqual(receipt);
    expect(() => collabControlOperationCodec('redeemProjectRecoveryLink').decodeResponse({
      ...receipt, personalRef: 'refs/heads/members/member-other',
    })).toThrow();
  });
});
