import * as protocol from '../src/index';

const EXPECTED_OPERATIONS = [
  'getRequest',
  'listRequestComments',
  'ensureMyRequest',
  'createComment',
  'listTickets',
  'getTicket',
  'listTicketComments',
  'listTicketAcceptedRelations',
  'createTicket',
  'updateTicketContent',
  'createTicketComment',
  'closeTicket',
  'reopenTicket',
  'updateMyRequestMetadata',
  'acceptRequest',
  'requestLanToCloudTransfer',
  'acceptLanToCloudTransferTarget',
  'beginLanToCloudTransfer',
  'getProjectAuthorityTransfer',
  'getAuthorityTransferReceiptVerifier',
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
] as const;

describe('package public exports', () => {
  it('exposes one exact canonical operation registry', () => {
    const operations = Object.keys(protocol.COLLAB_CONTROL_OPERATION_CODECS);
    expect(operations).toEqual(EXPECTED_OPERATIONS);
    for (const operation of operations) {
      const codec = protocol.COLLAB_CONTROL_OPERATION_CODECS[
        operation as protocol.CollabControlOperation
      ];
      expect(typeof codec.decodeRequest).toBe('function');
      expect(typeof codec.decodeResponse).toBe('function');
    }
  });

  it('keeps the wire version as a positive integer', () => {
    expect(Number.isInteger(protocol.COLLAB_PROTOCOL_VERSION)).toBe(true);
    expect(protocol.COLLAB_PROTOCOL_VERSION).toBeGreaterThan(0);
  });
});
