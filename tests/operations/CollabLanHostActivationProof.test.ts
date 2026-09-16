import {
  decodeCollabAuthorityTransferOperationRequest,
  decodeCollabLanHostActivationProof,
  encodeCollabLanHostActivationProofSigningInput,
} from '../../src/index';

const proof = {
  schemaVersion: 1, authorityGeneration: 3, projectId: 'project-one', transferId: 'transfer-one',
  targetHostMemberId: 'member-two', targetCaFingerprint: 'b'.repeat(64),
  manifestSha256: 'c'.repeat(64), cutoverAt: '2026-09-16T00:00:00.000Z',
  caCertificatePem: '-----BEGIN CERTIFICATE-----\nQUJD\n-----END CERTIFICATE-----\n',
  signatureAlgorithm: 'rsa-pss-sha256', signature: 'A'.repeat(342),
} as const;
const request = {
  checkpointManifestSha256: 'd'.repeat(64), expectedSourceAuthorityGeneration: 3,
  idempotencyKey: 'begin-one', projectId: 'project-one', sourceHostMemberId: 'member-two',
  sourceProof: 'abcd', targetUrl: 'https://cloud.example.test/', transferId: 'return-one',
};

describe('committed LAN authority evidence', () => {
  it('preserves the exact generation-qualified activation statement and canonical signing input', () => {
    expect(decodeCollabLanHostActivationProof(proof)).toEqual(proof);
    const { signature: _signature, ...payload } = proof;
    expect(encodeCollabLanHostActivationProofSigningInput(payload)).toBe(
      'claudian-collab-lan-host-activation-v1\n' + JSON.stringify([
        1, 'project-one', 3, 'transfer-one', 'member-two', 'b'.repeat(64), 'c'.repeat(64),
        '2026-09-16T00:00:00.000Z', proof.caCertificatePem,
      ]),
    );
  });

  it('accepts return evidence without changing direct-return request decoding', () => {
    expect(decodeCollabAuthorityTransferOperationRequest('beginLanToCloudTransfer', request)).toEqual(request);
    expect(decodeCollabAuthorityTransferOperationRequest('beginLanToCloudTransfer', {
      ...request, hostActivationProofs: [proof],
    })).toEqual({ ...request, hostActivationProofs: [proof] });
  });

  it.each([
    { authorityGeneration: 0 }, { authorityGeneration: 3.5 }, { schemaVersion: 2 },
    { caCertificatePem: '-----BEGIN PRIVATE KEY-----\nQUJD\n-----END PRIVATE KEY-----' },
    { signature: 'abc=' }, { signatureAlgorithm: 'none' }, { targetCaFingerprint: 'x'.repeat(64) },
  ])('rejects malformed activation facts %j', override => {
    expect(() => decodeCollabLanHostActivationProof({ ...proof, ...override })).toThrow();
  });

  it('rejects unrelated or oversized return evidence', () => {
    for (const hostActivationProofs of [
      [{ ...proof, projectId: 'project-other' }],
      [{ ...proof, authorityGeneration: 2 }],
      Array.from({ length: 33 }, () => proof),
    ]) expect(() => decodeCollabAuthorityTransferOperationRequest('beginLanToCloudTransfer', {
      ...request, hostActivationProofs,
    })).toThrow();
  });
});
