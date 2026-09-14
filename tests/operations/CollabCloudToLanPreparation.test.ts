import { type CollabControlOperation, collabControlOperationCodec } from '../../src';

const trust = { caCertificatePem: '-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----\n', caFingerprint: 'a'.repeat(64) };
const request = { ...trust, expiresAt: '2026-09-16T00:00:00.000Z', projectId: 'project_1', idempotencyKey: 'preparation_1', expectedAuthorityGeneration: 4, targetUrl: 'https://192.168.1.20:8787' };
const preparation = { ...trust, projectId: 'project_1', preparationId: 'preparation_1', sourceAuthorityGeneration: 4, targetUrl: request.targetUrl,
  targetHostMemberId: 'member_2', createdAt: '2026-09-15T00:00:00.000Z', expiresAt: '2026-09-16T00:00:00.000Z', withdrawnAt: null };

describe('Cloud-hosted LAN preparation requests', () => {
  it('registers public target details without accepting a caller-selected Member', () => {
    const codec = collabControlOperationCodec('registerCloudToLanPreparation' as CollabControlOperation);
    expect(codec.decodeRequest(request)).toEqual({ status: 'ok', value: request });
    expect(codec.decodeRequest({ ...request, targetHostMemberId: 'member_3' })).toMatchObject({ status: 'invalid' });
    expect(codec.decodeResponse(preparation)).toEqual(preparation);
  });
  it('lists preparations and preserves their immutable expiry and withdrawal', () => {
    const codec = collabControlOperationCodec('listCloudToLanPreparations' as CollabControlOperation);
    expect(codec.decodeRequest({ projectId: 'project_1' })).toEqual({ status: 'ok', value: { projectId: 'project_1' } });
    expect(codec.decodeResponse({ preparations: [preparation] })).toEqual({ preparations: [preparation] });
    expect(() => codec.decodeResponse({ preparations: [preparation, preparation] })).toThrow();
    const withdrawn = { ...preparation, withdrawnAt: '2026-09-15T01:00:00.000Z' };
    expect(collabControlOperationCodec('withdrawCloudToLanPreparation' as CollabControlOperation)
      .decodeResponse(withdrawn)).toEqual(withdrawn);
  });
});
