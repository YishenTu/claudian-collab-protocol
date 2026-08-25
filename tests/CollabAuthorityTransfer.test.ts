import { createHash } from 'node:crypto';

import {
  COLLAB_AUTHORITY_TRANSFER_CANCELLABLE_PHASES,
  COLLAB_AUTHORITY_TRANSFER_CANCELLATION_PHASES,
  COLLAB_CLOUD_TO_LAN_TRANSFER_PHASES,
  COLLAB_LAN_TO_CLOUD_TRANSFER_PHASES,
  type CollabAuthorityRelinquishmentProofSigningPayload,
  type CollabTransferredMembershipRedemptionReceiptSigningPayload,
  decodeCollabAuthorityRelinquishmentProof,
  decodeCollabAuthorityTransferOperationRequest,
  decodeCollabAuthorityTransferProposal,
  decodeCollabAuthorityTransferStatus,
  decodeCollabTransferredMembershipClaim,
  decodeCollabTransferredMembershipClaimBatch,
  decodeCollabTransferredMembershipClaimCustodyReceipt,
  decodeCollabTransferredMembershipRedemptionReceipt,
  encodeCollabAuthorityRelinquishmentProofSigningInput,
  encodeCollabTransferredMembershipClaimBatchDigestInput,
  encodeCollabTransferredMembershipRedemptionReceiptSigningInput,
} from '../src/CollabAuthorityTransfer';

const NOW = '2026-08-25T00:00:00.000Z';
const LATER = '2026-09-24T00:00:00.000Z';
const SHA256 = 'a'.repeat(64);
const BATCH_SHA256 = '4689acf5d0c9daa2771ed640a1ab7ef77a0b6f23bea04e34f3b9d39521136409';
const ED25519_SIGNATURE = 'A'.repeat(86);

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
    batchSha256: BATCH_SHA256,
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
    batchSha256: BATCH_SHA256,
    checkpointSha256: SHA256,
    committedAt: NOW,
    custodyAuthority: { generation: 3, kind: 'lan' },
    operationIntentId: 'intent_1',
    projectId: 'project_1',
    receiptId: 'custody_receipt_1',
    submittedByMemberId: 'member_1',
    targetAuthorityGeneration: 4,
    transferId: 'transfer_1',
    ...overrides,
  };
}

function redemptionReceipt(overrides: Record<string, unknown> = {}) {
  return {
    checkpointSha256: SHA256,
    claimSha256: 'c'.repeat(64),
    memberId: 'member_2',
    operationIntentId: 'claim_intent_1',
    projectId: 'project_1',
    receiptId: 'redemption_receipt_1',
    receiptKeyId: 'receipt-key-2026-08',
    redeemedAt: NOW,
    signature: ED25519_SIGNATURE,
    signatureAlgorithm: 'ed25519',
    targetAuthorityGeneration: 4,
    transferId: 'transfer_1',
    ...overrides,
  };
}

function relinquishmentProof(overrides: Record<string, unknown> = {}) {
  return {
    batchRevision: 2,
    batchSha256: BATCH_SHA256,
    certificate: ED25519_SIGNATURE,
    certificateAlgorithm: 'ed25519',
    checkpointSha256: SHA256,
    committedAt: NOW,
    operationIntentId: 'relinquish_intent_1',
    projectId: 'project_1',
    sourceAuthority: { generation: 3, kind: 'lan' },
    sourceHostMemberId: 'member_1',
    targetAuthority: { generation: 4, kind: 'cloud' },
    transferId: 'transfer_1',
    ...overrides,
  };
}

function cloudRelinquishmentProof(overrides: Record<string, unknown> = {}) {
  return relinquishmentProof({
    sourceAuthority: { generation: 4, kind: 'cloud' },
    sourceHostMemberId: null,
    targetAuthority: { generation: 5, kind: 'lan' },
    transferId: 'transfer_2',
    ...overrides,
  });
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
    expect(COLLAB_AUTHORITY_TRANSFER_CANCELLABLE_PHASES).toEqual([
      'collecting-readiness',
      'source-quiesced',
      'checkpoint-received',
      'checkpoint-validated',
      'claims-retained',
      'repository-published',
      'cloud-quiesced',
      'checkpoint-captured',
      'target-staged',
      'cancel-intent',
      'target-invalidated',
      'target-cleaned',
      'source-reopened',
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
    proposal({ targetUrl: 'https://cloud.invalid/base?access_token=secret' }),
  ])('rejects authority assertions, extensions, and invalid targets %#', (input) => {
    expect(() => decodeCollabAuthorityTransferProposal(input))
      .toThrow('collab.error.protocol-payload-invalid');
  });

  it('decodes a monotonic, Member-sorted raw claim batch for source custody', () => {
    expect(decodeCollabTransferredMembershipClaimBatch(claimBatch()))
      .toEqual(claimBatch());
  });

  it('defines one canonical claim-batch digest input for independent custody checks', () => {
    const digestInput = encodeCollabTransferredMembershipClaimBatchDigestInput(claimBatch());
    expect(digestInput).not.toContain('batchSha256');
    expect(createHash('sha256').update(digestInput).digest('hex')).toBe(BATCH_SHA256);
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
    const proof = relinquishmentProof();
    expect(decodeCollabAuthorityRelinquishmentProof(proof)).toEqual(proof);
    expect(() => decodeCollabAuthorityRelinquishmentProof({
      ...proof,
      targetAuthority: { generation: 5, kind: 'cloud' },
    })).toThrow('collab.error.protocol-payload-invalid');
    expect(() => decodeCollabAuthorityRelinquishmentProof({
      ...proof,
      certificate: 'a',
    })).toThrow('collab.error.protocol-payload-invalid');
    expect(decodeCollabAuthorityRelinquishmentProof(cloudRelinquishmentProof()))
      .toEqual(cloudRelinquishmentProof());
    expect(() => decodeCollabAuthorityRelinquishmentProof(cloudRelinquishmentProof({
      sourceHostMemberId: 'member_1',
    }))).toThrow('collab.error.protocol-payload-invalid');
  });

  it('binds signed receipts and relinquishment proofs to checkpoint and operation intent', () => {
    expect(decodeCollabTransferredMembershipRedemptionReceipt(redemptionReceipt()))
      .toEqual(redemptionReceipt());
    expect(() => decodeCollabTransferredMembershipRedemptionReceipt({
      ...redemptionReceipt(),
      checkpointSha256: 'd'.repeat(64),
      futureSwapMarker: true,
    })).toThrow('collab.error.protocol-payload-invalid');
    expect(decodeCollabAuthorityRelinquishmentProof(relinquishmentProof()))
      .toEqual(relinquishmentProof());
    expect(() => decodeCollabAuthorityRelinquishmentProof({
      ...relinquishmentProof(),
      operationIntentId: '',
    })).toThrow('collab.error.protocol-payload-invalid');
  });

  it('defines domain-separated canonical signing inputs for both proof types', () => {
    const receipt = redemptionReceipt();
    const { signature: _signature, ...unsignedReceipt } = receipt;
    const receiptPayload = unsignedReceipt as
      CollabTransferredMembershipRedemptionReceiptSigningPayload;
    const receiptInput = encodeCollabTransferredMembershipRedemptionReceiptSigningInput(
      receiptPayload,
    );
    expect(receiptInput).toBe(JSON.stringify({
      domain: 'claudian-collab.transferred-membership-redemption-receipt.v1',
      payload: receiptPayload,
    }));
    expect(createHash('sha256').update(receiptInput).digest('hex'))
      .toBe('fec5c39f3d5cf4f55fc6551eaf54fc4207d7ef6b651d436c964b8dc1bc480daa');
    expect(() => encodeCollabTransferredMembershipRedemptionReceiptSigningInput({
      ...receiptPayload,
      signature: ED25519_SIGNATURE,
    } as CollabTransferredMembershipRedemptionReceiptSigningPayload))
      .toThrow('collab.error.protocol-payload-invalid');

    const proof = relinquishmentProof();
    const { certificate: _certificate, ...unsignedProof } = proof;
    const proofPayload = unsignedProof as CollabAuthorityRelinquishmentProofSigningPayload;
    const proofInput = encodeCollabAuthorityRelinquishmentProofSigningInput(proofPayload);
    expect(proofInput).toBe(JSON.stringify({
      domain: 'claudian-collab.authority-relinquishment-proof.v1',
      payload: proofPayload,
    }));
    expect(createHash('sha256').update(proofInput).digest('hex'))
      .toBe('a31525a0a8e43859860ef9e8a94e27449073c12968548a10b87d56339c6dcef5');
    expect(() => encodeCollabAuthorityRelinquishmentProofSigningInput({
      ...proofPayload,
      certificate: ED25519_SIGNATURE,
    } as unknown as CollabAuthorityRelinquishmentProofSigningPayload))
      .toThrow('collab.error.protocol-payload-invalid');
  });

  it('round-trips a manifest-bound Cloud-to-LAN stage report with exact claim custody', () => {
    const request = {
      checkpointSha256: SHA256,
      claimBatch: claimBatch({
        projectId: 'project_1',
        targetAuthorityGeneration: 5,
        transferId: 'transfer_2',
      }),
      idempotencyKey: 'stage_intent_1',
      projectId: 'project_1',
      stageSha256: 'd'.repeat(64),
      targetAuthority: { generation: 5, kind: 'lan' },
      targetProof: 'dGFyZ2V0LXByb29m',
      transferId: 'transfer_2',
    };
    expect(decodeCollabAuthorityTransferOperationRequest(
      'reportCloudToLanTargetStaged',
      request,
    )).toEqual(request);
    expect(() => decodeCollabAuthorityTransferOperationRequest(
      'reportCloudToLanTargetStaged',
      { ...request, claimBatch: { ...request.claimBatch, checkpointSha256: 'e'.repeat(64) } },
    )).toThrow('collab.error.protocol-payload-invalid');
  });

  it('requires a client-generated credential hash only for LAN claim redemption', () => {
    const common = {
      claim: 'claim_for_member_2',
      idempotencyKey: 'claim_intent_1',
      projectId: 'project_1',
      transferId: 'transfer_1',
    };
    const cloudClaim = common;
    const lanClaim = {
      ...common,
      credentialHash: SHA256,
    };
    expect(decodeCollabAuthorityTransferOperationRequest(
      'claimTransferredMembership',
      cloudClaim,
    )).toEqual(cloudClaim);
    expect(decodeCollabAuthorityTransferOperationRequest(
      'claimTransferredMembership',
      lanClaim,
    )).toEqual(lanClaim);
    expect(() => decodeCollabAuthorityTransferOperationRequest(
      'claimTransferredMembership',
      { ...common, credentialHash: 'd'.repeat(63) },
    )).toThrow('collab.error.protocol-payload-invalid');
    expect(() => decodeCollabAuthorityTransferOperationRequest(
      'claimTransferredMembership',
      { ...cloudClaim, credentialHash: '' },
    )).toThrow('collab.error.protocol-payload-invalid');
  });

  it('allows cancellation only before relinquishment or while cancellation is active', () => {
    for (const expectedPhase of COLLAB_AUTHORITY_TRANSFER_CANCELLABLE_PHASES) {
      const request = {
        expectedPhase,
        idempotencyKey: 'cancel_intent_1',
        projectId: 'project_1',
        transferId: 'transfer_1',
      };
      expect(decodeCollabAuthorityTransferOperationRequest(
        'cancelProjectAuthorityTransfer',
        request,
      )).toEqual(request);
    }
    for (const expectedPhase of [
      'source-relinquished',
      'cloud-activated',
      'cloud-relinquished',
      'lan-activated',
      'completed',
      'cancelled',
    ]) {
      expect(() => decodeCollabAuthorityTransferOperationRequest(
        'cancelProjectAuthorityTransfer',
        {
          expectedPhase,
          idempotencyKey: 'cancel_intent_1',
          projectId: 'project_1',
          transferId: 'transfer_1',
        },
      )).toThrow('collab.error.protocol-payload-invalid');
    }
  });

  it('exposes the exact retained claim batch fence in status and rotation', () => {
    const status = {
      batchRevision: 2,
      batchSha256: 'b'.repeat(64),
      checkpointSha256: SHA256,
      createdAt: NOW,
      direction: 'cloud-to-lan',
      expiresAt: LATER,
      phase: 'claims-retained',
      projectId: 'project_1',
      relinquishmentProof: null,
      sourceAuthority: { generation: 4, kind: 'cloud' },
      state: 'active',
      targetAuthority: { generation: 5, kind: 'lan' },
      targetUrl: 'https://lan-target.invalid:54545',
      transferId: 'transfer_2',
      updatedAt: NOW,
    };
    expect(decodeCollabAuthorityTransferStatus(status)).toEqual(status);
    for (const invalidChronology of [
      { ...status, updatedAt: '2026-08-24T00:00:00.000Z' },
      { ...status, expiresAt: NOW },
    ]) {
      expect(() => decodeCollabAuthorityTransferStatus(invalidChronology))
        .toThrow('collab.error.protocol-payload-invalid');
    }
    const rotate = {
      expectedBatchRevision: 2,
      expectedBatchSha256: 'b'.repeat(64),
      idempotencyKey: 'rotate_intent_1',
      projectId: 'project_1',
      transferId: 'transfer_2',
    };
    expect(decodeCollabAuthorityTransferOperationRequest(
      'rotateTransferredMembershipClaims',
      rotate,
    )).toEqual(rotate);
  });

  it('delivers and acknowledges the Cloud relinquishment proof before LAN activation', () => {
    const proof = cloudRelinquishmentProof();
    const status = {
      batchRevision: 2,
      batchSha256: BATCH_SHA256,
      checkpointSha256: SHA256,
      createdAt: NOW,
      direction: 'cloud-to-lan',
      expiresAt: LATER,
      phase: 'cloud-relinquished',
      projectId: 'project_1',
      relinquishmentProof: proof,
      sourceAuthority: { generation: 4, kind: 'cloud' },
      state: 'active',
      targetAuthority: { generation: 5, kind: 'lan' },
      targetUrl: 'https://lan-target.invalid:54545',
      transferId: 'transfer_2',
      updatedAt: NOW,
    };
    expect(decodeCollabAuthorityTransferStatus(status)).toEqual(status);
    expect(() => decodeCollabAuthorityTransferStatus({
      ...status,
      relinquishmentProof: null,
    })).toThrow('collab.error.protocol-payload-invalid');

    const confirmation = {
      idempotencyKey: 'confirm_intent_1',
      projectId: 'project_1',
      relinquishmentProof: proof,
      targetActivationProof: 'YWN0aXZhdGlvbi1wcm9vZg',
      transferId: 'transfer_2',
    };
    expect(decodeCollabAuthorityTransferOperationRequest(
      'confirmCloudToLanTargetActive',
      confirmation,
    )).toEqual(confirmation);
    expect(() => decodeCollabAuthorityTransferOperationRequest(
      'confirmCloudToLanTargetActive',
      { ...confirmation, projectId: 'project_2' },
    )).toThrow('collab.error.protocol-payload-invalid');
  });

  it.each([
    { direction: 'lan-to-cloud', phase: 'checkpoint-received' },
    { direction: 'lan-to-cloud', phase: 'source-relinquished' },
    { direction: 'cloud-to-lan', phase: 'checkpoint-captured' },
    { direction: 'cloud-to-lan', phase: 'cloud-relinquished' },
  ])('rejects $direction $phase status without its durable checkpoint fences', ({
    direction,
    phase,
  }) => {
    const sourceKind = direction === 'lan-to-cloud' ? 'lan' : 'cloud';
    const targetKind = direction === 'lan-to-cloud' ? 'cloud' : 'lan';
    const input = {
      batchRevision: null,
      batchSha256: null,
      checkpointSha256: null,
      createdAt: NOW,
      direction,
      expiresAt: LATER,
      phase,
      projectId: 'project_1',
      relinquishmentProof: null,
      sourceAuthority: { generation: 3, kind: sourceKind },
      state: 'active',
      targetAuthority: { generation: 4, kind: targetKind },
      targetUrl: 'https://target.invalid:54545',
      transferId: 'transfer_1',
      updatedAt: NOW,
    };
    expect(() => decodeCollabAuthorityTransferStatus(input))
      .toThrow('collab.error.protocol-payload-invalid');
  });

  it.each([
    { direction: 'lan-to-cloud', phase: 'claims-retained' },
    { direction: 'lan-to-cloud', phase: 'source-relinquished' },
    { direction: 'cloud-to-lan', phase: 'claims-retained' },
    { direction: 'cloud-to-lan', phase: 'cloud-relinquished' },
  ])('rejects $direction $phase status without the retained claim-batch fence', ({
    direction,
    phase,
  }) => {
    const sourceKind = direction === 'lan-to-cloud' ? 'lan' : 'cloud';
    const targetKind = direction === 'lan-to-cloud' ? 'cloud' : 'lan';
    expect(() => decodeCollabAuthorityTransferStatus({
      batchRevision: null,
      batchSha256: null,
      checkpointSha256: SHA256,
      createdAt: NOW,
      direction,
      expiresAt: LATER,
      phase,
      projectId: 'project_1',
      relinquishmentProof: null,
      sourceAuthority: { generation: 3, kind: sourceKind },
      state: 'active',
      targetAuthority: { generation: 4, kind: targetKind },
      targetUrl: 'https://target.invalid:54545',
      transferId: 'transfer_1',
      updatedAt: NOW,
    })).toThrow('collab.error.protocol-payload-invalid');
  });

  it.each([
    custodyReceipt({ batchSha256: 'c'.repeat(63) }),
    custodyReceipt({ futureField: true }),
    redemptionReceipt({ signature: '' }),
    redemptionReceipt({ signature: 'a' }),
    redemptionReceipt({ signature: `${'A'.repeat(85)}B` }),
    redemptionReceipt({ signatureAlgorithm: 'rsa' }),
  ])('fails closed on modified receipts %#', (input) => {
    const decoder = Object.hasOwn(input, 'committedAt')
      ? decodeCollabTransferredMembershipClaimCustodyReceipt
      : decodeCollabTransferredMembershipRedemptionReceipt;
    expect(() => decoder(input)).toThrow('collab.error.protocol-payload-invalid');
  });
});
