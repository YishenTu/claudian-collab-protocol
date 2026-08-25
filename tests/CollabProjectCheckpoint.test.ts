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
  validateCollabProjectCheckpointConsistency,
} from '../src/CollabProjectCheckpoint';

const NOW = '2026-08-25T00:00:00.000Z';
const MAIN = '1'.repeat(40);
const MEMBER = '2'.repeat(40);
const SHA256 = 'a'.repeat(64);
const MERGE = '3'.repeat(40);
const MEMBER_THREE = '4'.repeat(40);

function retirementResult() {
  return {
    acknowledgementRequired: true,
    kind: 'project-retired',
    projectId: 'project_1',
    retiredAt: NOW,
    retirementId: 'retirement_1',
    terminalExpiresAt: '2026-09-24T00:00:00.000Z',
  };
}

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
      { name: 'refs/heads/members/member_3', oid: MEMBER_THREE },
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
        activatedAt: NOW,
        authorityGeneration: 3,
        createdAt: NOW,
        expectedMainOid: MAIN,
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
        projectId: 'project_1',
        role: 'manager',
        status: 'active',
        revokedAt: null,
        updatedAt: NOW,
      },
    },
    {
      kind: 'member',
      recordId: 'member_2',
      revision: 5,
      value: {
        activatedAt: NOW,
        createdAt: NOW,
        displayName: 'Bob',
        memberId: 'member_2',
        personalRef: 'refs/heads/members/member_2',
        projectId: 'project_1',
        role: 'member',
        status: 'revoked',
        revokedAt: '2026-08-25T01:00:00.000Z',
        updatedAt: '2026-08-25T01:00:00.000Z',
      },
    },
    {
      kind: 'member',
      recordId: 'member_3',
      revision: 2,
      value: {
        activatedAt: NOW,
        createdAt: NOW,
        displayName: 'Carol',
        memberId: 'member_3',
        personalRef: 'refs/heads/members/member_3',
        projectId: 'project_1',
        role: 'member',
        status: 'active',
        revokedAt: null,
        updatedAt: NOW,
      },
    },
    {
      kind: 'request',
      recordId: 'request_1',
      revision: 3,
      value: {
        createdAt: NOW,
        description: 'Merged work',
        firstBaseOid: MAIN,
        latestHeadOid: MEMBER,
        memberId: 'member_1',
        mergedOid: MERGE,
        projectId: 'project_1',
        requestId: 'request_1',
        status: 'merged',
        updatedAt: '2026-08-25T01:00:00.000Z',
      },
    },
    {
      kind: 'request-comment',
      recordId: 'request_comment_1',
      revision: 1,
      value: {
        authorMemberId: 'member_1',
        body: 'Ready',
        commentId: 'request_comment_1',
        createdAt: NOW,
        projectId: 'project_1',
        requestId: 'request_1',
      },
    },
    {
      kind: 'ticket',
      recordId: 'ticket_1',
      revision: 4,
      value: {
        authorMemberId: 'member_1',
        body: 'Track the change',
        closedAt: '2026-08-25T01:00:00.000Z',
        closedByMemberId: 'member_1',
        createdAt: NOW,
        number: 1,
        projectId: 'project_1',
        status: 'closed',
        ticketId: 'ticket_1',
        title: 'Change',
        updatedAt: '2026-08-25T01:00:00.000Z',
      },
    },
    {
      kind: 'ticket-comment',
      recordId: 'ticket_comment_1',
      revision: 1,
      value: {
        authorMemberId: 'member_1',
        body: 'Done',
        commentId: 'ticket_comment_1',
        createdAt: NOW,
        projectId: 'project_1',
        ticketId: 'ticket_1',
      },
    },
    {
      kind: 'ticket-relation',
      recordId: 'relation_1',
      revision: 2,
      value: {
        acceptedAt: '2026-08-25T01:00:00.000Z',
        acceptedMergeOid: MERGE,
        commitOid: MEMBER,
        createdAt: NOW,
        createdByMemberId: 'member_1',
        kind: 'resolves',
        projectId: 'project_1',
        relationId: 'relation_1',
        requestId: 'request_1',
        state: 'accepted',
        ticketId: 'ticket_1',
        updatedAt: '2026-08-25T01:00:00.000Z',
      },
    },
    {
      kind: 'ticket-mention',
      recordId: 'ticket_1:comment:ticket_comment_1:member_2',
      revision: 1,
      value: {
        createdAt: NOW,
        mentionedMemberId: 'member_2',
        projectId: 'project_1',
        sourceId: 'ticket_comment_1',
        sourceKind: 'comment',
        ticketId: 'ticket_1',
      },
    },
  ];
}

function protectedClaimEnvelopeRecord() {
  return {
    kind: 'protected-claim-envelope',
    recordId: 'transfer_1:member_3',
    revision: 1,
    value: {
      associatedData: {
        authorityGeneration: 4,
        checkpointSha256: SHA256,
        claimSha256: 'e'.repeat(64),
        envelopeVersion: 1,
        environmentIdentity: 'environment_1',
        memberId: 'member_3',
        projectId: 'project_1',
        transferId: 'transfer_1',
      },
      associatedDataSha256: 'd'.repeat(64),
      ciphertext: 'Y2lwaGVydGV4dA',
      encryptionAlgorithm: 'xchacha20-poly1305',
      expiresAt: '2026-09-24T00:00:00.000Z',
      keyId: 'claim-key-2026-08',
      keyVersion: 1,
      memberId: 'member_3',
      nonce: 'bm9uY2U',
      receiptKeyId: 'receipt-key-2026-08',
      tag: 'dGFn',
      transferId: 'transfer_1',
    },
  };
}

function operationalBackupRecords() {
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
      kind: 'cloud-event-cursor',
      recordId: 'project_1',
      revision: 1,
      value: {
        currentSequence: 1,
        projectId: 'project_1',
        updatedAt: NOW,
      },
    },
    {
      kind: 'idempotency-result',
      recordId: 'intent_1',
      revision: 1,
      value: {
        createdAt: NOW,
        idempotencyKey: 'intent_1',
        memberId: 'member_1',
        operation: 'retireProject',
        projectId: 'project_1',
        requestFingerprint: SHA256,
        responseJson: JSON.stringify(retirementResult()),
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
        batchRevision: 2,
        batchSha256: 'b'.repeat(64),
        checkpointSha256: SHA256,
        direction: 'lan-to-cloud',
        operationId: 'operation_1',
        operationKind: 'authority-transfer',
        phase: 'claims-retained',
        projectId: 'project_1',
        relinquishmentProof: null,
        updatedAt: NOW,
      },
    },
    {
      kind: 'terminal-responder',
      recordId: 'retirement_1',
      revision: 1,
      value: {
        acknowledgements: [{
          acknowledgedAt: NOW,
          memberId: 'member_1',
          principalId: 'principal_1',
        }],
        eligibleMemberIds: ['member_1', 'member_3'],
        expiresAt: '2026-09-24T00:00:00.000Z',
        operation: 'retireProject',
        operationId: 'retirement_1',
        projectId: 'project_1',
        responseJson: JSON.stringify(retirementResult()),
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
      'cloud-event-cursor',
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
    expect(createHash('sha256').update(digestInput).digest('hex'))
      .toBe('124579b3669ef4dc53223e304a8e44bc4a3d3c46dd9c3f9d8cff47837f1ac086');
  });

  it('binds one decoded coordination set to the manifest Project and authority fences', () => {
    const records = decodeCollabProjectCheckpointCoordinationNdjson(
      portableRecords().map(record => JSON.stringify(record)).join('\n') + '\n',
      'authority-transfer',
    );
    expect(validateCollabProjectCheckpointConsistency(
      decodeCollabProjectCheckpointManifest(manifest()),
      records,
    )).toBe(records);
    for (const inconsistentManifest of [
      manifest({ projectId: 'project_2' }),
      manifest({ expectedMainOid: MEMBER, refs: [
        { name: 'refs/heads/main', oid: MEMBER },
        { name: 'refs/heads/members/member_1', oid: MEMBER },
      ] }),
      manifest({ sourceAuthority: { generation: 2, kind: 'lan' } }),
    ]) {
      expect(() => validateCollabProjectCheckpointConsistency(
        decodeCollabProjectCheckpointManifest(inconsistentManifest),
        records,
      )).toThrow('collab.error.protocol-payload-invalid');
    }
    const missingActiveMemberRef = manifest({
      refs: [{ name: 'refs/heads/main', oid: MAIN }],
    });
    expect(() => validateCollabProjectCheckpointConsistency(
      decodeCollabProjectCheckpointManifest(missingActiveMemberRef),
      records,
    )).toThrow('collab.error.protocol-payload-invalid');
  });

  it.each([
    manifest({ futureField: true }),
    manifest({ manifestSchemaVersion: 2 }),
    manifest({ protocolVersion: 4 }),
    manifest({ gitObjectFormat: 'sha256' }),
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

  it('round-trips the complete canonical portable vocabulary as newline-terminated NDJSON', () => {
    const ndjson = portableRecords().map(record => JSON.stringify(record)).join('\n') + '\n';
    const decoded = decodeCollabProjectCheckpointCoordinationNdjson(
      ndjson,
      'authority-transfer',
    );
    expect(decoded).toEqual(portableRecords());
    expect(encodeCollabProjectCheckpointCoordinationNdjson(decoded, 'authority-transfer'))
      .toBe(ndjson);
  });

  it('preserves the valid zero Manager-set generation and rejects impossible history', () => {
    type MutableTestRecord = {
      kind: string;
      recordId: string;
      revision: number;
      value: Record<string, unknown>;
    };
    const zeroGeneration = portableRecords() as unknown as MutableTestRecord[];
    zeroGeneration[0] = {
      ...zeroGeneration[0],
      value: { ...zeroGeneration[0].value, managerSetGeneration: 0 },
    };
    expect(decodeCollabProjectCheckpointCoordinationNdjson(
      zeroGeneration.map(record => JSON.stringify(record)).join('\n') + '\n',
      'export',
    )).toEqual(zeroGeneration);

    const impossibleMember = portableRecords() as unknown as MutableTestRecord[];
    impossibleMember[1] = {
      ...impossibleMember[1],
      value: {
        ...impossibleMember[1].value,
        updatedAt: '2026-08-24T00:00:00.000Z',
      },
    };
    expect(() => decodeCollabProjectCheckpointCoordinationNdjson(
      impossibleMember.map(record => JSON.stringify(record)).join('\n') + '\n',
      'export',
    )).toThrow('collab.error.protocol-payload-invalid');
  });

  it('permits protected claim envelopes only in backups and never plaintext claims', () => {
    const backupRecords = [...portableRecords(), ...operationalBackupRecords()];
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
    for (const secretField of ['claimToken', 'credentialHash', 'filesystemPath']) {
      const unsafe = records.map(record => record.kind === 'idempotency-result'
        ? {
          ...record,
          value: {
            ...record.value,
            responseJson: JSON.stringify({ ...retirementResult(), [secretField]: 'secret' }),
          },
        }
        : record);
      expect(() => decodeCollabProjectCheckpointCoordinationNdjson(
        unsafe.map(record => JSON.stringify(record)).join('\n') + '\n',
        'backup',
      )).toThrow('collab.error.protocol-payload-invalid');
    }
  });

  it('requires restore metadata and bounds retained events by the durable cursor', () => {
    const requiredKinds = [
      'cloud-event-cursor',
      'schema-catalog',
      'server-compatibility',
      'authority-volume-pair',
    ];
    for (const missingKind of requiredKinds) {
      const records = [
        ...portableRecords(),
        ...operationalBackupRecords().filter(record => record.kind !== missingKind),
      ];
      expect(() => decodeCollabProjectCheckpointCoordinationNdjson(
        records.map(record => JSON.stringify(record)).join('\n') + '\n',
        'backup',
      )).toThrow('collab.error.protocol-payload-invalid');
    }

    const staleCursor = [
      ...portableRecords(),
      ...operationalBackupRecords().map(record => record.kind === 'cloud-event-cursor'
        ? { ...record, value: { ...record.value, currentSequence: 0 } }
        : record),
    ];
    expect(() => decodeCollabProjectCheckpointCoordinationNdjson(
      staleCursor.map(record => JSON.stringify(record)).join('\n') + '\n',
      'backup',
    )).toThrow('collab.error.protocol-payload-invalid');
  });

  it('reuses exact transfer phases and fences in backup lifecycle recovery records', () => {
    const invalidLifecycleValues = [
      {
        batchRevision: null,
        batchSha256: null,
        checkpointSha256: null,
        direction: null,
        phase: 'future-unknown-phase',
      },
      {
        direction: 'lan-to-cloud',
        phase: 'cloud-quiesced',
      },
      {
        phase: 'source-relinquished',
      },
      {
        direction: 'lan-to-cloud',
        operationKind: 'retire',
        phase: 'retired',
      },
    ];
    for (const invalidValue of invalidLifecycleValues) {
      const records = [
        ...portableRecords(),
        ...operationalBackupRecords().map(record => record.kind === 'lifecycle-state'
          ? { ...record, value: { ...record.value, ...invalidValue } }
          : record),
      ];
      expect(() => decodeCollabProjectCheckpointCoordinationNdjson(
        records.map(record => JSON.stringify(record)).join('\n') + '\n',
        'backup',
      )).toThrow('collab.error.protocol-payload-invalid');
    }

    const proof = {
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
      transferId: 'operation_1',
    };
    const recoverable = [
      ...portableRecords(),
      ...operationalBackupRecords().map(record => record.kind === 'lifecycle-state'
        ? {
          ...record,
          value: {
            ...record.value,
            phase: 'source-relinquished',
            relinquishmentProof: proof,
          },
        }
        : record),
    ];
    const ndjson = recoverable.map(record => JSON.stringify(record)).join('\n') + '\n';
    expect(decodeCollabProjectCheckpointCoordinationNdjson(ndjson, 'backup'))
      .toEqual(recoverable);
  });

  it('preserves a canonical terminal acknowledgement set bound to eligible principals', () => {
    const invalidAcknowledgementSets = [
      {
        acknowledgements: [{
          acknowledgedAt: NOW,
          memberId: 'member_2',
          principalId: 'principal_1',
        }],
        eligibleMemberIds: ['member_1', 'member_3'],
      },
      {
        acknowledgements: [{
          acknowledgedAt: NOW,
          memberId: 'member_1',
          principalId: 'principal_wrong',
        }],
        eligibleMemberIds: ['member_1', 'member_3'],
      },
      {
        acknowledgements: [],
        eligibleMemberIds: ['member_3', 'member_1'],
      },
    ];
    for (const invalidSet of invalidAcknowledgementSets) {
      const records = [
        ...portableRecords(),
        ...operationalBackupRecords().map(record => record.kind === 'terminal-responder'
          ? { ...record, value: { ...record.value, ...invalidSet } }
          : record),
      ];
      expect(() => decodeCollabProjectCheckpointCoordinationNdjson(
        records.map(record => JSON.stringify(record)).join('\n') + '\n',
        'backup',
      )).toThrow('collab.error.protocol-payload-invalid');
    }
  });

  it('rejects typed idempotency and terminal responses that contain plaintext claims', () => {
    const rawClaimResponse = JSON.stringify({
      batchRevision: 2,
      batchSha256: 'b'.repeat(64),
      checkpointSha256: SHA256,
      claims: [{ claim: 'RAW_SECRET_CLAIM', memberId: 'member_2' }],
      expiresAt: '2026-09-24T00:00:00.000Z',
      projectId: 'project_1',
      targetAuthorityGeneration: 4,
      transferId: 'transfer_1',
    });
    for (const targetKind of ['idempotency-result', 'terminal-responder']) {
      const records = [...portableRecords(), ...operationalBackupRecords()].map((record) => {
        if (record.kind !== targetKind) return record;
        return {
          ...record,
          value: {
            ...record.value,
            operation: 'rotateTransferredMembershipClaims',
            responseJson: rawClaimResponse,
          },
        };
      });
      expect(() => decodeCollabProjectCheckpointCoordinationNdjson(
        records.map(record => JSON.stringify(record)).join('\n') + '\n',
        'backup',
      )).toThrow('collab.error.protocol-payload-invalid');
    }
  });

  it('binds lifecycle response Project and operation identities to backup records', () => {
    const mutations = [
      {
        kind: 'idempotency-result',
        response: { ...retirementResult(), projectId: 'project_2' },
      },
      {
        kind: 'terminal-responder',
        response: { ...retirementResult(), projectId: 'project_2' },
      },
      {
        kind: 'terminal-responder',
        response: { ...retirementResult(), retirementId: 'retirement_2' },
      },
    ];
    for (const mutation of mutations) {
      const records = [...portableRecords(), ...operationalBackupRecords()].map(record => (
        record.kind === mutation.kind
          ? {
            ...record,
            value: { ...record.value, responseJson: JSON.stringify(mutation.response) },
          }
          : record
      ));
      expect(() => decodeCollabProjectCheckpointCoordinationNdjson(
        records.map(record => JSON.stringify(record)).join('\n') + '\n',
        'backup',
      )).toThrow('collab.error.protocol-payload-invalid');
    }
  });

  it('rejects nonterminal transfer responders and terminal state without a tombstone', () => {
    const activeTransferStatus = {
      batchRevision: null,
      batchSha256: null,
      checkpointSha256: null,
      createdAt: NOW,
      direction: 'cloud-to-lan',
      expiresAt: '2026-09-24T00:00:00.000Z',
      phase: 'collecting-readiness',
      projectId: 'project_1',
      relinquishmentProof: null,
      sourceAuthority: { generation: 3, kind: 'cloud' },
      state: 'active',
      targetAuthority: { generation: 4, kind: 'lan' },
      targetUrl: 'https://lan-target.invalid:54545',
      transferId: 'transfer_1',
      updatedAt: NOW,
    };
    const activeAsTerminal = [
      ...portableRecords(),
      ...operationalBackupRecords()
        .filter(record => record.kind !== 'lifecycle-state')
        .map(record => record.kind === 'terminal-responder'
          ? {
            ...record,
            recordId: 'transfer_1',
            value: {
              ...record.value,
              operation: 'getProjectAuthorityTransfer',
              operationId: 'transfer_1',
              responseJson: JSON.stringify(activeTransferStatus),
            },
          }
          : record),
    ];
    const retiredWithoutTombstone = [
      ...portableRecords(),
      ...operationalBackupRecords().filter(record => record.kind !== 'tombstone'),
    ];
    for (const records of [activeAsTerminal, retiredWithoutTombstone]) {
      expect(() => decodeCollabProjectCheckpointCoordinationNdjson(
        records.map(record => JSON.stringify(record)).join('\n') + '\n',
        'backup',
      )).toThrow('collab.error.protocol-payload-invalid');
    }
  });

  it('rejects a second Project root and cross-Project operational records', () => {
    const secondProject = {
      ...portableRecords()[0],
      recordId: 'project_2',
      value: { ...portableRecords()[0].value, projectId: 'project_2' },
    };
    const placement = operationalBackupRecords().find(
      record => record.kind === 'repository-placement',
    );
    expect(placement).toBeDefined();
    const crossProjectPlacement = {
      ...placement,
      value: { ...placement!.value, projectId: 'project_2' },
    };
    for (const records of [
      [portableRecords()[0], secondProject],
      [...portableRecords(), crossProjectPlacement],
    ]) {
      const sorted = records.slice().sort((left, right) => {
        const leftRecord = left as { readonly kind: string; readonly recordId: string };
        const rightRecord = right as { readonly kind: string; readonly recordId: string };
        const kinds = COLLAB_CHECKPOINT_BACKUP_RECORD_KINDS as readonly string[];
        return kinds.indexOf(leftRecord.kind) - kinds.indexOf(rightRecord.kind)
          || leftRecord.recordId.localeCompare(rightRecord.recordId, 'en-US');
      });
      expect(() => decodeCollabProjectCheckpointCoordinationNdjson(
        sorted.map(record => JSON.stringify(record)).join('\n') + '\n',
        'backup',
      )).toThrow('collab.error.protocol-payload-invalid');
    }
  });

  it('rejects export-shaped backup profiles and cross-Project or orphan portable rows', () => {
    const onlyPortable = portableRecords();
    expect(() => decodeCollabProjectCheckpointCoordinationNdjson(
      onlyPortable.map(record => JSON.stringify(record)).join('\n') + '\n',
      'backup',
    )).toThrow('collab.error.protocol-payload-invalid');

    type MutableTestRecord = {
      kind: string;
      recordId: string;
      revision: number;
      value: Record<string, unknown>;
    };
    const crossProject = portableRecords() as unknown as MutableTestRecord[];
    crossProject[1] = {
      ...crossProject[1],
      value: { ...crossProject[1].value, projectId: 'project_2' },
    };
    const orphan = portableRecords() as unknown as MutableTestRecord[];
    const relationIndex = orphan.findIndex(record => record.kind === 'ticket-relation');
    orphan[relationIndex] = {
      ...orphan[relationIndex],
      value: { ...orphan[relationIndex].value, requestId: 'request_missing' },
    };
    for (const records of [crossProject, orphan]) {
      expect(() => decodeCollabProjectCheckpointCoordinationNdjson(
        records.map(record => JSON.stringify(record)).join('\n') + '\n',
        'export',
      )).toThrow('collab.error.protocol-payload-invalid');
    }
  });

  it('enforces the manifest Git object format across portable and event OIDs', () => {
    type MutableTestRecord = {
      kind: string;
      recordId: string;
      revision: number;
      value: Record<string, unknown>;
    };
    const portable = portableRecords() as unknown as MutableTestRecord[];
    const requestIndex = portable.findIndex(record => record.kind === 'request');
    portable[requestIndex] = {
      ...portable[requestIndex],
      value: { ...portable[requestIndex].value, latestHeadOid: '4'.repeat(64) },
    };
    const portableDecoded = decodeCollabProjectCheckpointCoordinationNdjson(
      portable.map(record => JSON.stringify(record)).join('\n') + '\n',
      'authority-transfer',
    );
    expect(() => validateCollabProjectCheckpointConsistency(
      decodeCollabProjectCheckpointManifest(manifest()),
      portableDecoded,
    )).toThrow('collab.error.protocol-payload-invalid');

    const backupRecords = [
      ...portableRecords(),
      ...operationalBackupRecords().map(record => record.kind === 'cloud-event'
        ? {
          ...record,
          value: {
            event: {
              kind: 'main.updated',
              occurredAt: NOW,
              payload: { mainOid: '5'.repeat(64), requestId: 'request_1' },
              projectId: 'project_1',
              protocolVersion: 5,
              sequence: 1,
            },
          },
        }
        : record),
    ];
    const backupDecoded = decodeCollabProjectCheckpointCoordinationNdjson(
      backupRecords.map(record => JSON.stringify(record)).join('\n') + '\n',
      'backup',
    );
    expect(() => validateCollabProjectCheckpointConsistency(
      decodeCollabProjectCheckpointManifest(manifest({
        profile: 'backup',
        sourceAuthority: { generation: 3, kind: 'cloud' },
        targetAuthority: null,
      })),
      backupDecoded,
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
