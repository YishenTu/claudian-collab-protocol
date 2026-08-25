import { createHash } from 'node:crypto';

import {
  COLLAB_CHECKPOINT_ARTIFACT_LIMITS,
  COLLAB_CHECKPOINT_BACKUP_RECORD_KINDS,
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

function operationalBackupRecords() {
  const retirementResult = {
    acknowledgementRequired: true,
    kind: 'project-retired',
    projectId: 'project_1',
    retiredAt: NOW,
    retirementId: 'retirement_1',
    terminalExpiresAt: '2026-09-24T00:00:00.000Z',
  };
  return [
    {
      kind: 'cloud-event',
      recordId: '00000000000000000001',
      revision: 1,
      value: {
        event: {
          kind: 'authority-transfer.updated',
          occurredAt: NOW,
          payload: { transferId: 'transfer_1' },
          projectId: 'project_1',
          protocolVersion: 5,
          sequence: 1,
        },
      },
    },
    {
      kind: 'idempotency-result',
      recordId: 'intent_1',
      revision: 1,
      value: {
        completedAt: NOW,
        operation: 'retireProject',
        projectId: 'project_1',
        requestSha256: SHA256,
        responseJson: JSON.stringify(retirementResult),
      },
    },
    {
      kind: 'principal-binding',
      recordId: 'member_1',
      revision: 1,
      value: {
        boundAt: NOW,
        memberId: 'member_1',
        principalId: 'principal_1',
        projectId: 'project_1',
      },
    },
    {
      kind: 'repository-placement',
      recordId: 'placement_1',
      revision: 1,
      value: {
        nodeId: 'node_1',
        placementGeneration: 7,
        projectId: 'project_1',
        repositoryIdentity: 'repository_1',
      },
    },
    {
      kind: 'lifecycle-state',
      recordId: 'operation_1',
      revision: 1,
      value: {
        operationId: 'operation_1',
        operationKind: 'authority-transfer',
        phase: 'claims-retained',
        projectId: 'project_1',
        stateJson: '{"batchRevision":2}',
      },
    },
    {
      kind: 'terminal-responder',
      recordId: 'retirement_1',
      revision: 1,
      value: {
        expiresAt: '2026-09-24T00:00:00.000Z',
        operationId: 'retirement_1',
        projectId: 'project_1',
        responseJson: JSON.stringify(retirementResult),
      },
    },
    protectedClaimEnvelopeRecord(),
    {
      kind: 'tombstone',
      recordId: 'project_1',
      revision: 1,
      value: {
        authorityGeneration: 4,
        projectId: 'project_1',
        retiredAt: NOW,
        terminalExpiresAt: '2026-09-24T00:00:00.000Z',
      },
    },
    {
      kind: 'schema-catalog',
      recordId: 'project_1',
      revision: 1,
      value: {
        coordinationSchemaVersion: 6,
        projectId: 'project_1',
        repositoryFormatVersion: 1,
      },
    },
    {
      kind: 'server-compatibility',
      recordId: 'project_1',
      revision: 1,
      value: {
        maximumBuild: '2.0.0',
        minimumBuild: '2.0.0',
        projectId: 'project_1',
      },
    },
    {
      kind: 'authority-volume-pair',
      recordId: 'project_1',
      revision: 1,
      value: {
        authorityId: 'authority_1',
        authorityVolumeIdentity: 'volume_1',
        projectId: 'project_1',
        restoreEpoch: 1,
      },
    },
  ];
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
    expect(COLLAB_CHECKPOINT_BACKUP_RECORD_KINDS).toEqual([
      'project',
      'member',
      'request',
      'request-comment',
      'ticket',
      'ticket-comment',
      'ticket-relation',
      'ticket-mention',
      'cloud-event',
      'idempotency-result',
      'principal-binding',
      'repository-placement',
      'lifecycle-state',
      'terminal-responder',
      'protected-claim-envelope',
      'tombstone',
      'schema-catalog',
      'server-compatibility',
      'authority-volume-pair',
    ]);
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

  it('round-trips Cloud continuity only in the backup profile', () => {
    const records = [...portableRecords(), ...operationalBackupRecords()];
    const ndjson = records.map(record => JSON.stringify(record)).join('\n') + '\n';
    expect(decodeCollabProjectCheckpointCoordinationNdjson(ndjson, 'backup'))
      .toEqual(records);
    expect(() => decodeCollabProjectCheckpointCoordinationNdjson(ndjson, 'export'))
      .toThrow('collab.error.protocol-payload-invalid');
    expect(() => decodeCollabProjectCheckpointCoordinationNdjson(
      ndjson.replace('\\"batchRevision\\":2', '\\"rawClaim\\":\\"secret\\"'),
      'backup',
    )).toThrow('collab.error.protocol-payload-invalid');
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
