import {
  type CollabControlOperation,
  collabControlOperationCodec,
} from '../../src/index';

const operation = 'getCloudToLanPreparationApproval' as CollabControlOperation;
const request = { projectId: 'project_1', preparationId: 'preparation_1', sourceAuthorityGeneration: 4 };
const approval = {
  batchRevision: null, batchSha256: null, checkpointSha256: null,
  createdAt: '2026-09-15T00:00:00.000Z', expiresAt: '2026-09-16T00:00:00.000Z',
  direction: 'cloud-to-lan', phase: 'collecting-readiness', projectId: 'project_1',
  relinquishmentProof: null, sourceAuthority: { generation: 4, kind: 'cloud' },
  state: 'active', targetAuthority: { generation: 5, kind: 'lan' },
  targetUrl: 'https://192.168.1.20:8787', transferId: 'transfer_1',
  updatedAt: '2026-09-15T00:00:00.000Z',
};

describe('Cloud-to-LAN preparation approval', () => {
  it('identifies the exact preparation and source generation', () => {
    expect(collabControlOperationCodec(operation).decodeRequest(request)).toEqual({ status: 'ok', value: request });
  });
  it('distinguishes pending approval from a begun transfer', () => {
    const codec = collabControlOperationCodec(operation);
    expect(codec.decodeResponse({ approval: null })).toEqual({ approval: null });
    expect(codec.decodeResponse({ approval })).toEqual({ approval });
  });
  it('returns cancellation so a receiver does not wait forever', () => {
    const cancelled = { ...approval, phase: 'cancelled', state: 'cancelled' };
    expect(collabControlOperationCodec(operation).decodeResponse({ approval: cancelled }))
      .toEqual({ approval: cancelled });
  });
  it.each([
    { ...request, preparationId: '' },
    { ...request, sourceAuthorityGeneration: 0 },
    { ...request, memberId: 'member_1' },
  ])('rejects malformed identities and caller-selected membership', value => {
    expect(collabControlOperationCodec(operation).decodeRequest(value)).toMatchObject({ status: 'invalid' });
  });
  it('rejects approval in the opposite direction', () => {
    expect(() => collabControlOperationCodec(operation).decodeResponse({ approval: {
      ...approval, direction: 'lan-to-cloud', sourceAuthority: { generation: 4, kind: 'lan' },
      targetAuthority: { generation: 5, kind: 'cloud' },
    } })).toThrow();
  });
});
