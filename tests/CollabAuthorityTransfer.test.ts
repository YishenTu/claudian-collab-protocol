import {
  COLLAB_AUTHORITY_TRANSFER_CANCELLATION_PHASES,
  COLLAB_CLOUD_TO_LAN_TRANSFER_PHASES,
  COLLAB_LAN_TO_CLOUD_TRANSFER_PHASES,
  decodeCollabAuthorityRelinquishmentProof,
  decodeCollabAuthorityTransferProposal,
  decodeCollabTransferredMembershipClaim,
  decodeCollabTransferredMembershipClaimBatch,
  decodeCollabTransferredMembershipClaimCustodyReceipt,
  decodeCollabTransferredMembershipRedemptionReceipt,
} from '../src/CollabAuthorityTransfer';

const NOW = '2026-08-25T00:00:00.000Z';
const LATER = '2026-09-24T00:00:00.000Z';
const SHA256 = 'a'.repeat(64);

function proposal(overrides: Record<string, unknown> = {}) {
  return {
    expectedSourceAuthority: { generation: 3, kind: 'lan' },
    idempotencyKey: 'idempotency_1',
    projectId: 'project_1',
    proposedByMemberId: 'member_2',
    proposedAt: NOW,
    targetAuthorityKind: 'cloud',
    targetUrl: 'http://100.64.0.10:8787',
    ...overrides,
  };
}

function claimBatch(overrides: Record<string, unknown> = {}) {
  return {
    batchRevision: 2,
    batchSha256: 'b'.repeat(64),
    checkpointSha256: SHA256,
    claims: [
      { claim: 'claim_for_member_2', memberId: 'member_2' },
      { claim: 'claim_for_member_3', memberId: 'member_3' },
    ],
    expiresAt: LATER,
    projectId: 'project_1',
    targetAuthorityGeneration: 4,
    transferId: 'transfer_1',
    ...overrides,
  };
}

function custodyReceipt(overrides: Record<string, unknown> = {}) {
  return {
    batchRevision: 2,
    batchSha256: 'b'.repeat(64),
    checkpointSha256: SHA256,
    committedAt: NOW,
    operationIntentId: 'intent_1',
    projectId: 'project_1',
    receiptId: 'custody_receipt_1',
    sourceHostMemberId: 'member_1',
    targetAuthorityGeneration: 4,
    transferId: 'transfer_1',
    ...overrides,
  };
}

function redemptionReceipt(overrides: Record<string, unknown> = {}) {
  return {
    claimSha256: 'c'.repeat(64),
    memberId: 'member_2',
    projectId: 'project_1',
    receiptId: 'redemption_receipt_1',
    receiptKeyId: 'receipt-key-2026-08',
    redeemedAt: NOW,
    signature: 'c2lnbmF0dXJl',
    signatureAlgorithm: 'ed25519',
    targetAuthorityGeneration: 4,
    transferId: 'transfer_1',
    ...overrides,
  };
}

describe('Project authority transfer contract', () => {
  it('freezes the forward transfer and cancellation phase vocabularies', () => {
    expect(COLLAB_LAN_TO_CLOUD_TRANSFER_PHASES).toEqual([
      'collecting-readiness',
      'source-quiesced',
      'checkpoint-received',
      'checkpoint-validated',
      'claims-retained',
      'repository-published',
      'source-relinquished',
      'cloud-activated',
      'completed',
    ]);
    expect(COLLAB_CLOUD_TO_LAN_TRANSFER_PHASES).toEqual([
      'collecting-readiness',
      'cloud-quiesced',
      'checkpoint-captured',
      'target-staged',
      'claims-retained',
      'cloud-relinquished',
      'lan-activated',
      'completed',
    ]);
    expect(COLLAB_AUTHORITY_TRANSFER_CANCELLATION_PHASES).toEqual([
      'cancel-intent',
      'target-invalidated',
      'target-cleaned',
      'source-reopened',
      'cancelled',
    ]);
  });

  it('accepts an active Member proposal without asserting Host acceptance or target identity', () => {
    expect(decodeCollabAuthorityTransferProposal(proposal())).toEqual(proposal());
    expect(JSON.stringify(decodeCollabAuthorityTransferProposal(proposal())))
      .not.toMatch(/hostAccepted|principal|credential|role/i);
  });

  it.each([
    proposal({ futureField: true }),
    proposal({ expectedSourceAuthority: { generation: 0, kind: 'lan' } }),
    proposal({ targetAuthorityKind: 'lan' }),
    proposal({ targetUrl: '/relative' }),
  ])('rejects authority assertions, extensions, and invalid targets %#', (input) => {
    expect(() => decodeCollabAuthorityTransferProposal(input))
      .toThrow('collab.error.protocol-payload-invalid');
  });

  it('decodes a monotonic, Member-sorted raw claim batch for source custody', () => {
    expect(decodeCollabTransferredMembershipClaimBatch(claimBatch()))
      .toEqual(claimBatch());
  });

  it.each([
    claimBatch({ batchRevision: 0 }),
    claimBatch({ claims: [
      { claim: 'claim_for_member_3', memberId: 'member_3' },
      { claim: 'claim_for_member_2', memberId: 'member_2' },
    ] }),
    claimBatch({ claims: [
      { claim: 'same_claim', memberId: 'member_2' },
      { claim: 'same_claim', memberId: 'member_3' },
    ] }),
    claimBatch({ claims: [{ claim: 'claim_for_member_2', memberId: 'member_2', role: 'manager' }] }),
  ])('rejects stale, ambiguous, duplicated, or authority-rich claim batches %#', (input) => {
    expect(() => decodeCollabTransferredMembershipClaimBatch(input))
      .toThrow('collab.error.protocol-payload-invalid');
  });

  it('keeps batch custody distinct from exact target-signed redemption', () => {
    expect(decodeCollabTransferredMembershipClaimCustodyReceipt(custodyReceipt()))
      .toEqual(custodyReceipt());
    expect(decodeCollabTransferredMembershipRedemptionReceipt(redemptionReceipt()))
      .toEqual(redemptionReceipt());
    expect(JSON.stringify(custodyReceipt())).not.toMatch(/claimSha256|redeemedAt|signature/i);
    expect(JSON.stringify(redemptionReceipt())).not.toMatch(/claim_for_member|rawClaim/i);
  });

  it('decodes only an exact transferred-membership claim', () => {
    const claim = {
      claim: 'claim_for_member_2',
      expiresAt: LATER,
      memberId: 'member_2',
      projectId: 'project_1',
      targetAuthorityGeneration: 4,
      transferId: 'transfer_1',
    };
    expect(decodeCollabTransferredMembershipClaim(claim)).toEqual(claim);
    expect(() => decodeCollabTransferredMembershipClaim({ ...claim, role: 'manager' }))
      .toThrow('collab.error.protocol-payload-invalid');
  });

  it('binds a relinquishment proof to the exact source, target, transfer, and checkpoint', () => {
    const proof = {
      certificate: 'c291cmNlLXNpZ25hdHVyZQ',
      certificateAlgorithm: 'ed25519',
      checkpointSha256: SHA256,
      committedAt: NOW,
      projectId: 'project_1',
      sourceAuthority: { generation: 3, kind: 'lan' },
      sourceHostMemberId: 'member_1',
      targetAuthority: { generation: 4, kind: 'cloud' },
      transferId: 'transfer_1',
    };
    expect(decodeCollabAuthorityRelinquishmentProof(proof)).toEqual(proof);
    expect(() => decodeCollabAuthorityRelinquishmentProof({
      ...proof,
      targetAuthority: { generation: 5, kind: 'cloud' },
    })).toThrow('collab.error.protocol-payload-invalid');
  });

  it.each([
    custodyReceipt({ batchSha256: 'c'.repeat(63) }),
    custodyReceipt({ futureField: true }),
    redemptionReceipt({ signature: '' }),
    redemptionReceipt({ signatureAlgorithm: 'rsa' }),
  ])('fails closed on modified receipts %#', (input) => {
    const decoder = Object.hasOwn(input, 'operationIntentId')
      ? decodeCollabTransferredMembershipClaimCustodyReceipt
      : decodeCollabTransferredMembershipRedemptionReceipt;
    expect(() => decoder(input)).toThrow('collab.error.protocol-payload-invalid');
  });
});
