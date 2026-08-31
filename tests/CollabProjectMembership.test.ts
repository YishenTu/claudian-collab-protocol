import {
  COLLAB_PROJECT_MEMBERSHIP_LIMITS,
  COLLAB_PROJECT_MEMBERSHIP_OPERATION_CODECS,
  COLLAB_PROJECT_MEMBERSHIP_OPERATIONS,
} from '../src/index';

const CREATED = '2026-08-30T00:00:00.000Z';
const EXPIRES = '2026-08-31T00:00:00.000Z';
const REPLAY_EXPIRES = '2026-09-29T00:00:00.000Z';
const MAIN = '1'.repeat(40);
const SECRET = Buffer.alloc(32, 0xa6).toString('base64url');

const offer = {
  acknowledgedAt: null,
  expiresAt: EXPIRES,
  managerSetGenerationAtOffer: 1,
  offeredAt: CREATED,
  offerId: 'offer_1',
  purpose: 'manager-promotion',
  revision: 1,
  sourceManagerMemberId: 'member_manager',
  state: 'offered',
  targetMemberId: 'member_target',
  targetMembershipRevisionAtOffer: 2,
  terminalAt: null,
};

const cases = {
  createCloudProject: {
    request: {
      idempotencyKey: 'create_1',
      managerDisplayName: 'Manager',
      projectId: 'project_1',
      projectName: 'Project One',
    },
    response: {
      createdAt: CREATED,
      mainOid: MAIN,
      managerSetGeneration: 1,
      memberId: 'member_manager',
      membershipRevision: 2,
      personalRef: 'refs/heads/members/member_manager',
      projectId: 'project_1',
      role: 'manager',
    },
  },
  createProjectInvitation: {
    request: {
      expectedManagerSetGeneration: 1,
      idempotencyKey: 'invite_1',
      projectId: 'project_1',
    },
    response: {
      createdAt: CREATED,
      expiresAt: EXPIRES,
      invitationId: 'invitation_1',
      issuedState: 'active',
      projectId: 'project_1',
      secret: SECRET,
      secretReplayExpiresAt: REPLAY_EXPIRES,
    },
  },
  listProjectInvitations: {
    request: { projectId: 'project_1' },
    response: {
      invitations: [{
        createdAt: CREATED,
        expiresAt: EXPIRES,
        invitationId: 'invitation_1',
        revision: 1,
        state: 'active',
        terminalAt: null,
      }],
      managerSetGeneration: 1,
      projectId: 'project_1',
    },
  },
  revokeProjectInvitation: {
    request: {
      expectedInvitationRevision: 1,
      expectedManagerSetGeneration: 1,
      idempotencyKey: 'revoke_invitation_1',
      invitationId: 'invitation_1',
      projectId: 'project_1',
    },
    response: {
      invitationId: 'invitation_1',
      projectId: 'project_1',
      revision: 2,
      revokedAt: CREATED,
      state: 'revoked',
    },
  },
  joinCloudProject: {
    request: {
      displayName: 'New Member',
      idempotencyKey: 'join_1',
      invitationId: 'invitation_1',
      projectId: 'project_1',
      secret: SECRET,
    },
    response: {
      joinedAt: CREATED,
      mainOid: MAIN,
      managerSetGeneration: 1,
      memberId: 'member_target',
      membershipRevision: 2,
      personalRef: 'refs/heads/members/member_target',
      projectId: 'project_1',
      role: 'member',
    },
  },
  listProjectMembers: {
    request: { projectId: 'project_1' },
    response: {
      managerSetGeneration: 1,
      members: [{
        bindingState: 'bound',
        displayName: 'Manager',
        importedClaimGeneration: null,
        importedClaimState: 'not-applicable',
        memberId: 'member_manager',
        membershipRevision: 2,
        role: 'manager',
      }],
      projectId: 'project_1',
    },
  },
  reissueTransferredMembershipClaim: {
    request: {
      expectedClaimGeneration: 0,
      expectedManagerSetGeneration: 1,
      expectedMembershipRevision: 2,
      idempotencyKey: 'reissue_claim_1',
      memberId: 'member_imported',
      projectId: 'project_1',
    },
    response: {
      claim: SECRET,
      claimGeneration: 1,
      createdAt: CREATED,
      expiresAt: REPLAY_EXPIRES,
      memberId: 'member_imported',
      projectId: 'project_1',
      secretReplayExpiresAt: REPLAY_EXPIRES,
      targetAuthorityGeneration: 7,
      transferId: 'transfer_1',
    },
  },
  revokeTransferredMembershipClaim: {
    request: {
      expectedClaimGeneration: 1,
      expectedManagerSetGeneration: 1,
      expectedMembershipRevision: 2,
      idempotencyKey: 'revoke_claim_1',
      memberId: 'member_imported',
      projectId: 'project_1',
    },
    response: {
      claimGeneration: 1,
      memberId: 'member_imported',
      projectId: 'project_1',
      revokedAt: CREATED,
      state: 'revoked',
    },
  },
  createManagerResponsibilityOffer: {
    request: {
      expectedManagerSetGeneration: 1,
      expectedTargetMembershipRevision: 2,
      idempotencyKey: 'offer_1',
      projectId: 'project_1',
      purpose: 'manager-promotion',
      targetMemberId: 'member_target',
    },
    response: { offer },
  },
  listCurrentManagerResponsibilityOffers: {
    request: { projectId: 'project_1' },
    response: { offers: [offer], projectId: 'project_1' },
  },
  getManagerResponsibilityOffer: {
    request: { offerId: 'offer_1', projectId: 'project_1' },
    response: { offer },
  },
  acknowledgeManagerResponsibility: {
    request: {
      expectedOfferRevision: 1,
      idempotencyKey: 'ack_offer_1',
      offerId: 'offer_1',
      projectId: 'project_1',
    },
    response: { offer: { ...offer, acknowledgedAt: CREATED, revision: 2, state: 'acknowledged' } },
  },
  declineManagerResponsibility: {
    request: {
      expectedOfferRevision: 1,
      idempotencyKey: 'decline_offer_1',
      offerId: 'offer_1',
      projectId: 'project_1',
    },
    response: { offer: { ...offer, revision: 2, state: 'declined', terminalAt: CREATED } },
  },
  cancelManagerResponsibilityOffer: {
    request: {
      expectedOfferRevision: 1,
      idempotencyKey: 'cancel_offer_1',
      offerId: 'offer_1',
      projectId: 'project_1',
    },
    response: { offer: { ...offer, revision: 2, state: 'cancelled', terminalAt: CREATED } },
  },
  promoteManager: {
    request: {
      expectedManagerSetGeneration: 1,
      expectedOfferRevision: 2,
      expectedTargetMembershipRevision: 2,
      idempotencyKey: 'promote_1',
      managerResponsibilityOfferId: 'offer_1',
      projectId: 'project_1',
      targetMemberId: 'member_target',
    },
    response: {
      managerSetGeneration: 2,
      membershipRevision: 3,
      offerRevision: 3,
      projectId: 'project_1',
      promotedMemberId: 'member_target',
    },
  },
  demoteManager: {
    request: {
      expectedManagerSetGeneration: 2,
      expectedTargetMembershipRevision: 3,
      idempotencyKey: 'demote_1',
      projectId: 'project_1',
      targetMemberId: 'member_target',
    },
    response: {
      demotedMemberId: 'member_target',
      managerSetGeneration: 3,
      membershipRevision: 4,
      projectId: 'project_1',
    },
  },
  removeMember: {
    request: {
      expectedManagerSetGeneration: 3,
      expectedTargetMembershipRevision: 4,
      idempotencyKey: 'remove_1',
      projectId: 'project_1',
      targetMemberId: 'member_target',
    },
    response: {
      discardedRequestId: null,
      managerSetGeneration: 3,
      memberId: 'member_target',
      projectId: 'project_1',
      removedAt: CREATED,
      status: 'revoked',
    },
  },
  leaveProject: {
    request: {
      expectedManagerSetGeneration: 3,
      expectedMembershipRevision: 4,
      expectedOfferRevision: null,
      expectedPersonalRefOid: MAIN,
      idempotencyKey: 'leave_1',
      managerResponsibilityOfferId: null,
      projectId: 'project_1',
    },
    response: {
      discardedRequestId: null,
      leftAt: CREATED,
      managerSetGeneration: 3,
      memberId: 'member_target',
      projectId: 'project_1',
      promotedSuccessorMemberId: null,
      status: 'left',
    },
  },
} as const;

describe('Cloud Project membership contract', () => {
  it('publishes the fixed lifecycle durations and bounded Project limits', () => {
    expect(COLLAB_PROJECT_MEMBERSHIP_LIMITS).toEqual({
      invitationSecretLength: 43,
      invitationTtlMs: 24 * 60 * 60 * 1_000,
      managerResponsibilityOfferRetentionMs: 30 * 24 * 60 * 60 * 1_000,
      managerResponsibilityOfferTtlMs: 24 * 60 * 60 * 1_000,
      maxCurrentManagerOffers: 100,
      maxDisplayNameUtf8Bytes: 128,
      maxProjectInvitations: 100,
      maxProjectMembers: 100,
      maxProjectNameUtf8Bytes: 256,
      secretReplayTtlMs: 30 * 24 * 60 * 60 * 1_000,
      transferredClaimLength: 43,
      transferredClaimTtlMs: 30 * 24 * 60 * 60 * 1_000,
    });
  });

  it('owns exactly the Step 12 operation tuple and executable codecs', () => {
    expect(COLLAB_PROJECT_MEMBERSHIP_OPERATIONS).toEqual(Object.keys(cases));
    expect(Object.keys(COLLAB_PROJECT_MEMBERSHIP_OPERATION_CODECS)).toEqual(Object.keys(cases));
    expect(Object.isFrozen(COLLAB_PROJECT_MEMBERSHIP_OPERATION_CODECS)).toBe(true);
  });

  it.each(Object.entries(cases))('decodes exact %s request and response DTOs', (
    operation,
    fixture,
  ) => {
    const codec = COLLAB_PROJECT_MEMBERSHIP_OPERATION_CODECS[
      operation as keyof typeof COLLAB_PROJECT_MEMBERSHIP_OPERATION_CODECS
    ];
    expect(codec.decodeRequest(fixture.request)).toEqual({ status: 'ok', value: fixture.request });
    expect(codec.decodeResponse(fixture.response)).toEqual(fixture.response);
  });

  it.each(Object.entries(cases))('rejects unknown %s fields on both directions', (
    operation,
    fixture,
  ) => {
    const codec = COLLAB_PROJECT_MEMBERSHIP_OPERATION_CODECS[
      operation as keyof typeof COLLAB_PROJECT_MEMBERSHIP_OPERATION_CODECS
    ];
    expect(codec.decodeRequest({ ...fixture.request, role: 'manager' })).toMatchObject({
      status: 'invalid',
      error: { code: 'protocol-payload-invalid' },
    });
    expect(() => codec.decodeResponse({ ...fixture.response, principalId: 'principal_1' }))
      .toThrow('collab.error.protocol-payload-invalid');
  });

  it.each([
    ['not-applicable', null],
    ['hidden', null],
    ['original-active', 0],
    ['override-active', 3],
    ['revoked', 0],
    ['revoked', 4],
    ['expired', 0],
    ['expired', 5],
    ['redeemed', 0],
    ['redeemed', 6],
  ])('lists the canonical %s claim generation %s', (importedClaimState, importedClaimGeneration) => {
    const response = {
      ...cases.listProjectMembers.response,
      members: [{
        ...cases.listProjectMembers.response.members[0],
        importedClaimGeneration,
        importedClaimState,
      }],
    };
    expect(COLLAB_PROJECT_MEMBERSHIP_OPERATION_CODECS.listProjectMembers.decodeResponse(response))
      .toEqual(response);
  });

  it('retains the explicit role-redacted member-list shape without claim or principal metadata', () => {
    const response = {
      managerSetGeneration: 3,
      members: [{
        bindingState: 'hidden',
        displayName: 'Imported Member',
        importedClaimGeneration: null,
        importedClaimState: 'hidden',
        memberId: 'member_imported',
        membershipRevision: 4,
        role: 'member',
      }],
      projectId: 'project_1',
    };
    const codec = COLLAB_PROJECT_MEMBERSHIP_OPERATION_CODECS.listProjectMembers;
    expect(codec.decodeResponse(response)).toEqual(response);
    for (const extra of [{ transferId: 'transfer_1' }, { principalId: 'principal_1' }, { claim: SECRET }]) {
      expect(() => codec.decodeResponse({
        ...response,
        members: [{ ...response.members[0], ...extra }],
      })).toThrow('collab.error.protocol-payload-invalid');
    }
  });

  it.each([
    ['not-applicable', 0], ['hidden', 0], ['hidden', 1],
    ['original-active', null], ['original-active', 1], ['override-active', 0],
    ['override-active', null], ['revoked', null], ['expired', null], ['redeemed', null],
    ['revoked', -1], ['expired', 1.5], ['redeemed', '2'],
    ['override-active', Number.MAX_SAFE_INTEGER + 1], ['hidden', undefined],
  ])('rejects the invalid %s claim generation %s', (importedClaimState, importedClaimGeneration) => {
    const member: Record<string, unknown> = {
      ...cases.listProjectMembers.response.members[0],
      importedClaimGeneration,
      importedClaimState,
    };
    if (importedClaimGeneration === undefined) delete member.importedClaimGeneration;
    expect(() => COLLAB_PROJECT_MEMBERSHIP_OPERATION_CODECS.listProjectMembers.decodeResponse({
      ...cases.listProjectMembers.response,
      members: [member],
    })).toThrow('collab.error.protocol-payload-invalid');
  });

  it('requires nullable Leave succession fields together', () => {
    const codec = COLLAB_PROJECT_MEMBERSHIP_OPERATION_CODECS.leaveProject;
    expect(codec.decodeRequest({
      ...cases.leaveProject.request,
      managerResponsibilityOfferId: 'offer_1',
    })).toMatchObject({ status: 'invalid' });
  });

  it('accepts claim generation zero and rejects negative or unsafe generations', () => {
    const codec = COLLAB_PROJECT_MEMBERSHIP_OPERATION_CODECS
      .reissueTransferredMembershipClaim;
    expect(codec.decodeRequest(cases.reissueTransferredMembershipClaim.request))
      .toMatchObject({ status: 'ok' });
    for (const expectedClaimGeneration of [-1, Number.MAX_SAFE_INTEGER + 1]) {
      expect(codec.decodeRequest({
        ...cases.reissueTransferredMembershipClaim.request,
        expectedClaimGeneration,
      })).toMatchObject({ status: 'invalid' });
    }
  });

  it('retains the exact canonical transfer identity in reissued claim replies and replay bytes', () => {
    const response = cases.reissueTransferredMembershipClaim.response;
    const codec = COLLAB_PROJECT_MEMBERSHIP_OPERATION_CODECS.reissueTransferredMembershipClaim;
    expect(codec.decodeResponse(response)).toEqual(response);
    expect(codec.decodeResponse(JSON.parse(JSON.stringify(response)))).toEqual(response);
  });

  it.each([
    ['targetAuthorityGeneration', undefined], ['targetAuthorityGeneration', null],
    ['targetAuthorityGeneration', 0], ['targetAuthorityGeneration', -1],
    ['targetAuthorityGeneration', 1.5], ['targetAuthorityGeneration', '7'],
    ['targetAuthorityGeneration', Number.MAX_SAFE_INTEGER + 1],
    ['transferId', undefined], ['transferId', ''], ['transferId', '../transfer_1'],
    ['transferId', 7], ['transferId', 't'.repeat(129)],
  ])('rejects invalid reissue %s: %s', (field, value) => {
    const response: Record<string, unknown> = {
      ...cases.reissueTransferredMembershipClaim.response,
      [field as string]: value,
    };
    if (value === undefined) delete response[field as string];
    expect(() => COLLAB_PROJECT_MEMBERSHIP_OPERATION_CODECS
      .reissueTransferredMembershipClaim.decodeResponse(response))
      .toThrow('collab.error.protocol-payload-invalid');
  });

  it('rejects noncanonical 32-byte base64url secret encodings', () => {
    const noncanonicalSecret = `${'A'.repeat(42)}B`;
    expect(noncanonicalSecret).toHaveLength(43);
    expect(COLLAB_PROJECT_MEMBERSHIP_OPERATION_CODECS.joinCloudProject.decodeRequest({
      ...cases.joinCloudProject.request,
      secret: noncanonicalSecret,
    }).status).toBe('invalid');
    expect(() => COLLAB_PROJECT_MEMBERSHIP_OPERATION_CODECS
      .createProjectInvitation.decodeResponse({
      ...cases.createProjectInvitation.response,
      secret: noncanonicalSecret,
    })).toThrow('collab.error.protocol-payload-invalid');
    expect(() => COLLAB_PROJECT_MEMBERSHIP_OPERATION_CODECS
      .reissueTransferredMembershipClaim.decodeResponse({
      ...cases.reissueTransferredMembershipClaim.response,
      claim: noncanonicalSecret,
    })).toThrow('collab.error.protocol-payload-invalid');
  });

  it('enforces exact invitation, claim, and offer lifetimes', () => {
    const oneMillisecondLate = '2026-08-31T00:00:00.001Z';
    expect(() => COLLAB_PROJECT_MEMBERSHIP_OPERATION_CODECS
      .createProjectInvitation.decodeResponse({
        ...cases.createProjectInvitation.response,
        expiresAt: oneMillisecondLate,
      })).toThrow('collab.error.protocol-payload-invalid');
    expect(() => COLLAB_PROJECT_MEMBERSHIP_OPERATION_CODECS
      .reissueTransferredMembershipClaim.decodeResponse({
        ...cases.reissueTransferredMembershipClaim.response,
        expiresAt: '2026-09-29T00:00:00.001Z',
      })).toThrow('collab.error.protocol-payload-invalid');
    expect(() => COLLAB_PROJECT_MEMBERSHIP_OPERATION_CODECS
      .createManagerResponsibilityOffer.decodeResponse({
        offer: { ...offer, expiresAt: oneMillisecondLate },
      })).toThrow('collab.error.protocol-payload-invalid');
    expect(() => COLLAB_PROJECT_MEMBERSHIP_OPERATION_CODECS
      .listProjectInvitations.decodeResponse({
        ...cases.listProjectInvitations.response,
        invitations: [{
          ...cases.listProjectInvitations.response.invitations[0],
          expiresAt: oneMillisecondLate,
        }],
      })).toThrow('collab.error.protocol-payload-invalid');
  });

  it('enforces exact personal refs and offer timestamp/state consistency', () => {
    expect(() => COLLAB_PROJECT_MEMBERSHIP_OPERATION_CODECS.joinCloudProject.decodeResponse({
      ...cases.joinCloudProject.response,
      personalRef: 'refs/heads/members/member_attacker',
    })).toThrow('collab.error.protocol-payload-invalid');
    expect(() => COLLAB_PROJECT_MEMBERSHIP_OPERATION_CODECS
      .createManagerResponsibilityOffer.decodeResponse({
        offer: { ...offer, state: 'declined', terminalAt: null },
      })).toThrow('collab.error.protocol-payload-invalid');
  });

  it('lists only current Manager-responsibility offers in canonical order', () => {
    const codec = COLLAB_PROJECT_MEMBERSHIP_OPERATION_CODECS
      .listCurrentManagerResponsibilityOffers;
    const laterOffer = { ...offer, offerId: 'offer_2' };
    expect(codec.decodeResponse({
      offers: [offer, laterOffer],
      projectId: 'project_1',
    })).toEqual({ offers: [offer, laterOffer], projectId: 'project_1' });
    expect(() => codec.decodeResponse({
      offers: [{ ...offer, state: 'declined', terminalAt: CREATED }],
      projectId: 'project_1',
    })).toThrow('collab.error.protocol-payload-invalid');
    expect(() => codec.decodeResponse({
      offers: [laterOffer, offer],
      projectId: 'project_1',
    })).toThrow('collab.error.protocol-payload-invalid');
  });

  it('bounds shared lists and redacts secret-bearing summaries by shape', () => {
    const invitations = Array.from({ length: 101 }, () => (
      cases.listProjectInvitations.response.invitations[0]
    ));
    expect(() => COLLAB_PROJECT_MEMBERSHIP_OPERATION_CODECS
      .listProjectInvitations.decodeResponse({
        ...cases.listProjectInvitations.response,
        invitations,
      })).toThrow('collab.error.protocol-payload-invalid');
    expect(JSON.stringify(cases.listProjectInvitations.response)).not.toMatch(/secret|digest|envelope/i);
  });
});
