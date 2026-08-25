import {
  COLLAB_CONTROL_OPERATION_CODECS,
  COLLAB_PROTOCOL_VERSION,
  collabControlOperationCodec,
  decodeCollabProtocolEnvelope,
} from '../src/index';

const NOW = '2026-08-25T00:00:00.000Z';
const LATER = '2026-09-24T00:00:00.000Z';
const MAIN = '1'.repeat(40);
const SHA256 = 'a'.repeat(64);

const LIFECYCLE_OPERATIONS = [
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
  'retireProject',
  'acknowledgeProjectRetirement',
] as const;

function transferStatus(overrides: Record<string, unknown> = {}) {
  return {
    batchRevision: null,
    batchSha256: null,
    checkpointSha256: null,
    createdAt: NOW,
    direction: 'lan-to-cloud',
    expiresAt: LATER,
    phase: 'collecting-readiness',
    projectId: 'project_1',
    relinquishmentProof: null,
    sourceAuthority: { generation: 3, kind: 'lan' },
    state: 'active',
    targetAuthority: { generation: 4, kind: 'cloud' },
    targetUrl: 'http://100.64.0.10:8787',
    transferId: 'transfer_1',
    updatedAt: NOW,
    ...overrides,
  };
}

function redemptionReceipt() {
  return {
    checkpointSha256: SHA256,
    claimSha256: 'c'.repeat(64),
    memberId: 'member_2',
    operationIntentId: 'claim_intent_1',
    projectId: 'project_1',
    receiptId: 'receipt_1',
    receiptKeyId: 'receipt-key-2026-08',
    redeemedAt: NOW,
    signature: 'c2lnbmF0dXJl',
    signatureAlgorithm: 'ed25519',
    targetAuthorityGeneration: 4,
    transferId: 'transfer_1',
  };
}

function relinquishmentProof() {
  return {
    batchRevision: 2,
    batchSha256: 'b'.repeat(64),
    certificate: 'c291cmNlLXNpZ25hdHVyZQ',
    certificateAlgorithm: 'ed25519',
    checkpointSha256: SHA256,
    committedAt: NOW,
    operationIntentId: 'relinquish_intent_1',
    projectId: 'project_1',
    sourceAuthority: { generation: 3, kind: 'lan' },
    sourceHostMemberId: 'member_1',
    targetAuthority: { generation: 4, kind: 'cloud' },
    transferId: 'transfer_1',
  };
}

function cloudRelinquishmentProof() {
  return {
    ...relinquishmentProof(),
    sourceAuthority: { generation: 4, kind: 'cloud' },
    sourceHostMemberId: null,
    targetAuthority: { generation: 5, kind: 'lan' },
    transferId: 'transfer_2',
  };
}

function lifecycleRequestFixtures(): Record<(typeof LIFECYCLE_OPERATIONS)[number], object> {
  return {
    requestLanToCloudTransfer: {
      expectedAuthorityGeneration: 3,
      idempotencyKey: 'intent_1',
      projectId: 'project_1',
      targetUrl: 'http://100.64.0.10:8787',
    },
    acceptLanToCloudTransferTarget: {
      expectedAuthorityGeneration: 3,
      idempotencyKey: 'intent_2',
      projectId: 'project_1',
      targetUrl: 'http://100.64.0.10:8787',
      transferId: 'transfer_1',
    },
    beginLanToCloudTransfer: {
      checkpointManifestSha256: SHA256,
      expectedSourceAuthorityGeneration: 3,
      idempotencyKey: 'intent_3',
      projectId: 'project_1',
      sourceHostMemberId: 'member_1',
      sourceProof: 'c291cmNlLXByb29m',
      targetUrl: 'http://100.64.0.10:8787',
      transferId: 'transfer_1',
    },
    getProjectAuthorityTransfer: { projectId: 'project_1', transferId: 'transfer_1' },
    rotateTransferredMembershipClaims: {
      expectedBatchRevision: 1,
      expectedBatchSha256: 'b'.repeat(64),
      idempotencyKey: 'intent_4',
      projectId: 'project_1',
      transferId: 'transfer_1',
    },
    acknowledgeTransferredMembershipClaimBatch: {
      batchRevision: 2,
      batchSha256: 'b'.repeat(64),
      idempotencyKey: 'intent_5',
      operationIntentId: 'custody_intent_1',
      projectId: 'project_1',
      transferId: 'transfer_1',
    },
    getTransferredMembershipClaim: { projectId: 'project_1', transferId: 'transfer_1' },
    claimTransferredMembership: {
      claim: 'claim_for_member_2',
      idempotencyKey: 'intent_6',
      projectId: 'project_1',
      transferId: 'transfer_1',
    },
    acknowledgeTransferredMembershipClaimRedemption: {
      idempotencyKey: 'intent_7',
      projectId: 'project_1',
      receipt: redemptionReceipt(),
      transferId: 'transfer_1',
    },
    commitLanToCloudRelinquishment: {
      idempotencyKey: 'intent_8',
      projectId: 'project_1',
      proof: relinquishmentProof(),
      transferId: 'transfer_1',
    },
    beginCloudToLanTransfer: {
      expectedAuthorityGeneration: 4,
      idempotencyKey: 'intent_9',
      projectId: 'project_1',
      targetHostMemberId: 'member_1',
      targetUrl: 'https://lan-target.invalid:54545',
    },
    acceptCloudToLanTransferTarget: {
      idempotencyKey: 'intent_10',
      projectId: 'project_1',
      targetHostMemberId: 'member_1',
      targetProof: 'dGFyZ2V0LXByb29m',
      transferId: 'transfer_2',
    },
    reportCloudToLanTargetStaged: {
      checkpointSha256: SHA256,
      claimBatch: {
        batchRevision: 1,
        batchSha256: 'b'.repeat(64),
        checkpointSha256: SHA256,
        claims: [{ claim: 'claim_for_member_2', memberId: 'member_2' }],
        expiresAt: LATER,
        projectId: 'project_1',
        targetAuthorityGeneration: 5,
        transferId: 'transfer_2',
      },
      idempotencyKey: 'intent_11',
      projectId: 'project_1',
      stageSha256: 'd'.repeat(64),
      targetAuthority: { generation: 5, kind: 'lan' },
      targetProof: 'dGFyZ2V0LXByb29m',
      transferId: 'transfer_2',
    },
    confirmCloudToLanTargetActive: {
      idempotencyKey: 'intent_12',
      projectId: 'project_1',
      relinquishmentProof: cloudRelinquishmentProof(),
      targetActivationProof: 'YWN0aXZhdGlvbi1wcm9vZg',
      transferId: 'transfer_2',
    },
    cancelProjectAuthorityTransfer: {
      expectedPhase: 'target-staged',
      idempotencyKey: 'intent_13',
      projectId: 'project_1',
      transferId: 'transfer_2',
    },
    retireProject: {
      expectedAuthorityGeneration: 4,
      expectedMainOid: MAIN,
      idempotencyKey: 'intent_14',
      projectId: 'project_1',
    },
    acknowledgeProjectRetirement: {
      idempotencyKey: 'intent_15',
      projectId: 'project_1',
      retirementId: 'retirement_1',
    },
  };
}

describe('Canonical Collab wire protocol v5 lifecycle integration', () => {
  it('publishes the exact lifecycle operation inventory through one registry', () => {
    expect(COLLAB_PROTOCOL_VERSION).toBe(5);
    expect(Object.keys(COLLAB_CONTROL_OPERATION_CODECS).slice(-LIFECYCLE_OPERATIONS.length))
      .toEqual(LIFECYCLE_OPERATIONS);
    expect(Object.keys(COLLAB_CONTROL_OPERATION_CODECS)).toHaveLength(32);
  });

  it('strictly decodes every lifecycle request without accepting authority extensions', () => {
    const fixtures = lifecycleRequestFixtures();
    for (const operation of LIFECYCLE_OPERATIONS) {
      const codec = COLLAB_CONTROL_OPERATION_CODECS[operation] as {
        decodeRequest: (value: unknown) => { status: string; value?: unknown };
      };
      expect(codec.decodeRequest(fixtures[operation])).toEqual({
        status: 'ok',
        value: fixtures[operation],
      });
      expect(codec.decodeRequest({ ...fixtures[operation], futureField: true }).status)
        .toBe('invalid');
    }
  });

  it('decodes an authority-neutral LAN-to-Cloud proposal and exact status', () => {
    const request = {
      expectedAuthorityGeneration: 3,
      idempotencyKey: 'intent_1',
      projectId: 'project_1',
      targetUrl: 'http://100.64.0.10:8787',
    };
    expect(collabControlOperationCodec('requestLanToCloudTransfer').decodeRequest(request))
      .toEqual({ status: 'ok', value: request });
    expect(collabControlOperationCodec('requestLanToCloudTransfer')
      .decodeResponse(transferStatus())).toEqual(transferStatus());
    expect(collabControlOperationCodec('requestLanToCloudTransfer').decodeRequest({
      ...request,
      proposedByMemberId: 'member_2',
    }).status).toBe('invalid');
  });

  it('binds claim-batch custody acknowledgement to one exact committed intent', () => {
    const request = {
      batchRevision: 2,
      batchSha256: 'b'.repeat(64),
      idempotencyKey: 'intent_1',
      operationIntentId: 'custody_intent_1',
      projectId: 'project_1',
      transferId: 'transfer_1',
    };
    expect(collabControlOperationCodec('acknowledgeTransferredMembershipClaimBatch')
      .decodeRequest(request)).toEqual({ status: 'ok', value: request });
    expect(collabControlOperationCodec('acknowledgeTransferredMembershipClaimBatch')
      .decodeRequest({ ...request, batchRevision: 0 }).status).toBe('invalid');
  });

  it('keeps claim redemption ingress-bound and returns a target-signed receipt', () => {
    const request = {
      claim: 'claim_for_member_2',
      idempotencyKey: 'claim_intent_1',
      projectId: 'project_1',
      transferId: 'transfer_1',
    };
    const receipt = redemptionReceipt();
    expect(collabControlOperationCodec('claimTransferredMembership').decodeRequest(request))
      .toEqual({ status: 'ok', value: request });
    expect(collabControlOperationCodec('claimTransferredMembership').decodeResponse(receipt))
      .toEqual(receipt);
    expect(collabControlOperationCodec('claimTransferredMembership').decodeRequest({
      ...request,
      memberId: 'member_2',
    }).status).toBe('invalid');
  });

  it('returns exact Cloud custody after a Cloud-to-LAN target stage report', () => {
    const receipt = {
      batchRevision: 1,
      batchSha256: 'b'.repeat(64),
      checkpointSha256: SHA256,
      committedAt: NOW,
      custodyAuthority: { generation: 4, kind: 'cloud' },
      operationIntentId: 'intent_11',
      projectId: 'project_1',
      receiptId: 'custody_receipt_1',
      submittedByMemberId: 'member_1',
      targetAuthorityGeneration: 5,
      transferId: 'transfer_2',
    };
    expect(collabControlOperationCodec('reportCloudToLanTargetStaged')
      .decodeResponse(receipt)).toEqual(receipt);
  });

  it('integrates Retire without accepting a client role assertion', () => {
    const request = {
      expectedAuthorityGeneration: 4,
      expectedMainOid: MAIN,
      idempotencyKey: 'retire_intent_1',
      projectId: 'project_1',
    };
    const result = {
      acknowledgementRequired: true,
      kind: 'project-retired',
      projectId: 'project_1',
      retiredAt: NOW,
      retirementId: 'retirement_1',
      terminalExpiresAt: LATER,
    };
    expect(collabControlOperationCodec('retireProject').decodeRequest(request))
      .toEqual({ status: 'ok', value: request });
    expect(collabControlOperationCodec('retireProject').decodeResponse(result)).toEqual(result);
    expect(collabControlOperationCodec('retireProject').decodeRequest({
      ...request,
      role: 'manager',
    }).status).toBe('invalid');
  });

  it('fails closed on the former wire version', () => {
    const decoded = decodeCollabProtocolEnvelope({
      data: {},
      protocolVersion: 4,
      requestId: 'request_1',
    });
    expect(decoded.status).toBe('unsupported-version');
    expect(decoded).toMatchObject({
      error: { safeContext: { supportedVersion: 5 } },
      receivedVersion: 4,
      status: 'unsupported-version',
    });
  });
});
