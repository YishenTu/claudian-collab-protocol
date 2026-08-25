import { createHash } from 'node:crypto';

import {
  COLLAB_CHECKPOINT_ARTIFACT_LIMITS,
  COLLAB_CHECKPOINT_PROFILES,
  COLLAB_PROJECT_CHECKPOINT_ARTIFACTS,
  COLLAB_PROJECT_CHECKPOINT_MANIFEST_SCHEMA_VERSION,
  COLLAB_PROJECT_COORDINATION_FORMAT_VERSION,
  decodeCollabProjectCheckpointCoordinationNdjson,
  decodeCollabProjectCheckpointManifest,
  encodeCollabProjectCheckpointCoordinationNdjson,
  encodeCollabProjectCheckpointManifestCanonicalJson,
  encodeCollabProjectCheckpointManifestDigestInput,
} from '../src/CollabProjectCheckpoint';

const NOW = '2026-08-25T00:00:00.000Z';
const MAIN = '1'.repeat(40);
const MEMBER = '2'.repeat(40);
const SHA256 = 'a'.repeat(64);

function manifest(overrides: Record<string, unknown> = {}) {
  return {
    artifacts: [
      {
        byteCount: 812,
        name: 'coordination.ndjson',
        sha256: 'b'.repeat(64),
      },
      {
        byteCount: 4096,
        name: 'repository.bundle',
        sha256: 'c'.repeat(64),
      },
    ],
    coordinationFormatVersion: 1,
    createdAt: NOW,
    expectedMainOid: MAIN,
    gitObjectFormat: 'sha1',
    manifestSchemaVersion: 1,
    manifestSha256: SHA256,
    operationId: 'operation_1',
    profile: 'authority-transfer',
    projectId: 'project_1',
    protocolVersion: 5,
    refs: [
      { name: 'refs/heads/main', oid: MAIN },
      { name: 'refs/heads/members/member_1', oid: MEMBER },
    ],
    sourceAuthority: { generation: 3, kind: 'lan' },
    targetAuthority: { generation: 4, kind: 'cloud' },
    ...overrides,
  };
}

function portableRecords() {
  return [
    {
      kind: 'project',
      recordId: 'project_1',
      revision: 7,
      value: {
        authorityGeneration: 3,
        createdAt: NOW,
        managerSetGeneration: 2,
        name: 'Private project',
        projectId: 'project_1',
      },
    },
    {
      kind: 'member',
      recordId: 'member_1',
      revision: 4,
      value: {
        activatedAt: NOW,
        createdAt: NOW,
        displayName: 'Alice',
        memberId: 'member_1',
        personalRef: 'refs/heads/members/member_1',
        role: 'manager',
        status: 'active',
      },
    },
  ];
}

function protectedClaimEnvelopeRecord() {
  return {
    kind: 'protected-claim-envelope',
    recordId: 'transfer_1:member_2',
    revision: 1,
    value: {
      associatedData: {
        authorityGeneration: 4,
        checkpointSha256: SHA256,
        memberId: 'member_2',
        projectId: 'project_1',
        transferId: 'transfer_1',
      },
      associatedDataSha256: 'd'.repeat(64),
      ciphertext: 'Y2lwaGVydGV4dA',
      encryptionAlgorithm: 'xchacha20-poly1305',
      expiresAt: '2026-09-24T00:00:00.000Z',
      keyId: 'claim-key-2026-08',
      keyVersion: 1,
      memberId: 'member_2',
      nonce: 'bm9uY2U',
      receiptKeyId: 'receipt-key-2026-08',
      tag: 'dGFn',
      transferId: 'transfer_1',
    },
  };
}

describe('Project checkpoint contract', () => {
  it('freezes the profiles, artifact names, schema versions, and hard ceilings', () => {
    expect(COLLAB_CHECKPOINT_PROFILES).toEqual([
      'authority-transfer',
      'backup',
      'export',
    ]);
    expect(COLLAB_PROJECT_CHECKPOINT_ARTIFACTS).toEqual([
      'checkpoint.json',
      'coordination.ndjson',
      'repository.bundle',
    ]);
    expect(COLLAB_PROJECT_CHECKPOINT_MANIFEST_SCHEMA_VERSION).toBe(1);
    expect(COLLAB_PROJECT_COORDINATION_FORMAT_VERSION).toBe(1);
    expect(COLLAB_CHECKPOINT_ARTIFACT_LIMITS).toEqual({
      maxCoordinationBytes: 256 * 1024 * 1024,
      maxManifestBytes: 64 * 1024,
      maxRepositoryBundleBytes: 1024 * 1024 * 1024,
      maxStagingBytes: 2 * 1024 * 1024 * 1024,
    });
  });

  it('decodes and canonically encodes an exact transfer manifest', () => {
    const decoded = decodeCollabProjectCheckpointManifest(manifest());
    expect(decoded).toEqual(manifest());
    expect(encodeCollabProjectCheckpointManifestCanonicalJson(decoded))
      .toBe(JSON.stringify(manifest()));

    const digestInput = encodeCollabProjectCheckpointManifestDigestInput(decoded);
    expect(digestInput).not.toContain('manifestSha256');
    expect(createHash('sha256').update(digestInput).digest('hex')).toHaveLength(64);
  });

  it.each([
    manifest({ futureField: true }),
    manifest({ manifestSchemaVersion: 2 }),
    manifest({ protocolVersion: 4 }),
    manifest({ targetAuthority: { generation: 5, kind: 'cloud' } }),
    manifest({ refs: [
      { name: 'refs/heads/members/member_1', oid: MEMBER },
      { name: 'refs/heads/main', oid: MAIN },
    ] }),
    manifest({ refs: [
      { name: 'refs/heads/main', oid: MAIN },
      { name: 'refs/heads/internal/recovery', oid: MEMBER },
    ] }),
    manifest({ artifacts: [
      { byteCount: 4096, name: 'repository.bundle', sha256: 'c'.repeat(64) },
      { byteCount: 812, name: 'coordination.ndjson', sha256: 'b'.repeat(64) },
    ] }),
  ])('rejects extended, incompatible, or non-canonical manifests %#', (input) => {
    expect(() => decodeCollabProjectCheckpointManifest(input))
      .toThrow('collab.error.protocol-payload-invalid');
  });

  it('round-trips canonical portable records as newline-terminated NDJSON', () => {
    const ndjson = portableRecords().map(record => JSON.stringify(record)).join('\n') + '\n';
    const decoded = decodeCollabProjectCheckpointCoordinationNdjson(
      ndjson,
      'authority-transfer',
    );
    expect(decoded).toEqual(portableRecords());
    expect(encodeCollabProjectCheckpointCoordinationNdjson(decoded, 'authority-transfer'))
      .toBe(ndjson);
  });

  it('permits protected claim envelopes only in backups and never plaintext claims', () => {
    const backupRecords = [...portableRecords(), protectedClaimEnvelopeRecord()];
    const backupNdjson = backupRecords.map(record => JSON.stringify(record)).join('\n') + '\n';
    expect(decodeCollabProjectCheckpointCoordinationNdjson(backupNdjson, 'backup'))
      .toEqual(backupRecords);
    expect(() => decodeCollabProjectCheckpointCoordinationNdjson(
      backupNdjson,
      'authority-transfer',
    )).toThrow('collab.error.protocol-payload-invalid');
    expect(() => decodeCollabProjectCheckpointCoordinationNdjson(
      backupNdjson.replace('"ciphertext":"Y2lwaGVydGV4dA"', '"rawClaim":"secret"'),
      'backup',
    )).toThrow('collab.error.protocol-payload-invalid');
    expect(backupNdjson).not.toMatch(/privateKey|rawClaim|credential|token/i);
  });

  it.each([
    '',
    JSON.stringify(portableRecords()[0]),
    portableRecords().slice().reverse().map(record => JSON.stringify(record)).join('\n') + '\n',
    [portableRecords()[0], portableRecords()[0]].map(record => JSON.stringify(record)).join('\n') + '\n',
    JSON.stringify({ ...portableRecords()[0], futureField: true }) + '\n',
    JSON.stringify({ ...portableRecords()[0], kind: 'sql-row' }) + '\n',
  ])('rejects empty, non-terminated, unsorted, duplicate, extended, or unknown NDJSON %#', (input) => {
    expect(() => decodeCollabProjectCheckpointCoordinationNdjson(
      input,
      'export',
    )).toThrow('collab.error.protocol-payload-invalid');
  });
});
