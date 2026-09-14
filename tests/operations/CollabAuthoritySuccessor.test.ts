import {
  type CollabControlOperation,
  collabControlOperationCodec,
  decodeCollabAuthorityTransferStatus,
} from '../../src';

const operation = 'getProjectAuthoritySuccessor' as CollabControlOperation;
const now = '2026-09-14T00:00:00.000Z';
const later = '2026-10-14T00:00:00.000Z';
function successor(kind: 'cloud' | 'lan' = 'cloud') {
  const sourceAuthority = { generation: 1, kind: kind === 'cloud' ? 'lan' : 'cloud' };
  const targetAuthority = { generation: 2, kind };
  const proof = {
    batchRevision: 1, batchSha256: 'a'.repeat(64), certificate: 'A'.repeat(86),
    certificateAlgorithm: 'ed25519', checkpointSha256: 'b'.repeat(64), committedAt: now,
    operationIntentId: 'relinquish_1', projectId: 'project_1', sourceAuthority,
    sourceHostMemberId: kind === 'cloud' ? 'member_1' : null,
    targetAuthority, transferId: 'transfer_1',
  };
  return {
      batchRevision: 1, batchSha256: 'a'.repeat(64), checkpointSha256: 'b'.repeat(64),
      createdAt: now, direction: kind === 'cloud' ? 'lan-to-cloud' : 'cloud-to-lan',
      expiresAt: later, phase: 'completed', projectId: 'project_1', relinquishmentProof: proof,
      sourceAuthority, state: 'completed', targetAuthority,
      targetUrl: kind === 'cloud' ? 'https://cloud.example' : 'https://192.168.1.10:54545',
      transferId: 'transfer_1', updatedAt: now,
      ...(kind === 'lan' ? { lanTarget: {
        caCertificatePem: '-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----\n',
        caFingerprint: 'c'.repeat(64),
      } } : {}),
  };
}

describe('authority successor discovery', () => {
  it('retains public LAN trust in canonical terminal status without adding fields to earlier status records', () => {
    const status = successor('lan');
    expect(JSON.stringify(decodeCollabAuthorityTransferStatus(status))).toBe(JSON.stringify(status));
    const previous = { ...status };
    delete previous.lanTarget;
    expect(JSON.stringify(decodeCollabAuthorityTransferStatus(previous))).toBe(JSON.stringify(previous));
  });

  it('queries an exact source generation without requiring a known transfer ID', () => {
    const request = { projectId: 'project_1', sourceAuthorityGeneration: 1 };
    expect(collabControlOperationCodec(operation).decodeRequest(request)).toEqual({ status: 'ok', value: request });
  });

  it.each(['cloud', 'lan'] as const)('decodes a completed successor to %s', kind => {
    const response = { successor: successor(kind) };
    expect(collabControlOperationCodec(operation).decodeResponse(response)).toEqual(response);
  });

  it('represents an authenticated source with no completed successor', () => {
    expect(collabControlOperationCodec(operation).decodeResponse({ successor: null })).toEqual({ successor: null });
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])('rejects invalid source generation %s', generation => {
    expect(collabControlOperationCodec(operation).decodeRequest({ projectId: 'project_1', sourceAuthorityGeneration: generation }))
      .toMatchObject({ status: 'invalid' });
  });

  it.each(['active', 'cancelled'])('does not advertise a %s transfer as a successor', state => {
    const edge = successor();
    edge.state = state;
    expect(() => collabControlOperationCodec(operation).decodeResponse({ successor: edge })).toThrow();
  });

  it('requires target trust for a LAN successor', () => {
    const edge = successor('lan');
    delete edge.lanTarget;
    expect(() => collabControlOperationCodec(operation).decodeResponse({ successor: edge })).toThrow();
  });

  it('rejects claims or source credentials attached to discovery results', () => {
    expect(() => collabControlOperationCodec(operation).decodeResponse({ successor: { ...successor(), claim: 'secret' } })).toThrow();
  });
});
