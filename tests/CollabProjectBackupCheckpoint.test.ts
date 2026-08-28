import {
  COLLAB_PROJECT_BACKUP_COORDINATION_FORMAT_VERSION,
  COLLAB_PROJECT_BACKUP_RECORD_KINDS,
  collabProjectBackupIdempotencyRecordId,
  decodeCollabProjectBackupCheckpointCoordinationNdjson,
  decodeCollabProjectBackupCheckpointManifest,
  encodeCollabProjectBackupCheckpointCoordinationNdjson,
  encodeCollabProjectBackupCheckpointManifestCanonicalJson,
  encodeCollabProjectBackupCheckpointManifestDigestInput,
  validateCollabProjectBackupCheckpointConsistency,
} from '../src/CollabProjectBackupCheckpoint';
import {
  COLLAB_PROJECT_COORDINATION_FORMAT_VERSION,
  decodeCollabProjectCheckpointManifest,
} from '../src/CollabProjectCheckpoint';

const NOW = '2026-08-28T00:00:00.000Z';
const LATER = '2026-08-28T00:00:01.000Z';
const ACKNOWLEDGED = '2026-08-28T00:00:02.000Z';
const EXPIRES = '2026-09-28T00:00:00.000Z';
const EXTENDED = '2026-10-28T00:00:00.000Z';
const MAIN = '1'.repeat(40);
const MEMBER = '2'.repeat(40);
const MEMBER_TWO = '3'.repeat(40);
const MEMBER_THREE = '4'.repeat(40);
const SHA256 = 'a'.repeat(64);
const BATCH_SHA256 = 'b'.repeat(64);
const CLAIM_SHA256 = 'c'.repeat(64);
const SIGNATURE = 'A'.repeat(86);
const PUBLIC_KEY = 'A'.repeat(43);

function manifest(overrides: Record<string, unknown> = {}) {
  return {
    artifacts: [
      { byteCount: 4096, name: 'coordination.ndjson', sha256: 'd'.repeat(64) },
      { byteCount: 8192, name: 'repository.bundle', sha256: 'e'.repeat(64) },
    ],
    coordinationFormatVersion: 2,
    createdAt: NOW,
    expectedMainOid: MAIN,
    gitObjectFormat: 'sha1',
    manifestSchemaVersion: 1,
    manifestSha256: 'f'.repeat(64),
    operationId: 'backup_1',
    profile: 'backup',
    projectId: 'project_1',
    protocolVersion: 6,
    refs: [
      { name: 'refs/heads/main', oid: MAIN },
      { name: 'refs/heads/members/member_1', oid: MEMBER },
      { name: 'refs/heads/members/member_2', oid: MEMBER_TWO },
    ],
    sourceAuthority: { generation: 5, kind: 'cloud' },
    targetAuthority: null,
    ...overrides,
  };
}

function baseRecords() {
  return [
    {
      kind: 'project',
      recordId: 'project_1',
      revision: 1,
      value: {
        activatedAt: NOW,
        authorityGeneration: 5,
        createdAt: NOW,
        expectedMainOid: MAIN,
        managerSetGeneration: 1,
        name: 'Project',
        projectId: 'project_1',
      },
    },
    {
      kind: 'member',
      recordId: 'member_1',
      revision: 1,
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
      revision: 1,
      value: {
        activatedAt: NOW,
        createdAt: NOW,
        displayName: 'Bob',
        memberId: 'member_2',
        personalRef: 'refs/heads/members/member_2',
        projectId: 'project_1',
        role: 'member',
        status: 'active',
        revokedAt: null,
        updatedAt: NOW,
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
        status: 'left',
        revokedAt: LATER,
        updatedAt: LATER,
      },
    },
    {
      kind: 'cloud-event-cursor',
      recordId: 'project_1',
      revision: 1,
      value: { currentSequence: 0, projectId: 'project_1', updatedAt: NOW },
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
      kind: 'principal-binding',
      recordId: 'member_2',
      revision: 1,
      value: {
        boundAt: NOW,
        memberId: 'member_2',
        principalId: 'principal_2',
        projectId: 'project_1',
      },
    },
    {
      kind: 'repository-placement',
      recordId: 'placement_1',
      revision: 1,
      value: {
        nodeId: 'node_1',
        placementGeneration: 1,
        projectId: 'project_1',
        repositoryIdentity: 'repository_1',
      },
    },
    {
      kind: 'schema-catalog',
      recordId: 'project_1',
      revision: 1,
      value: {
        coordinationSchemaVersion: 9,
        projectId: 'project_1',
        repositoryFormatVersion: 1,
      },
    },
    {
      kind: 'server-compatibility',
      recordId: 'project_1',
      revision: 1,
      value: {
        maximumBuild: '3.2.0',
        minimumBuild: '3.2.0',
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

function idempotencyRecord(memberId: string) {
  const operation = 'retireProject' as const;
  const value = {
    createdAt: NOW,
    idempotencyKey: 'same_key',
    memberId,
    operation,
    projectId: 'project_1',
    requestFingerprint: SHA256,
    responseJson: JSON.stringify({
      acknowledgementRequired: true,
      kind: 'project-retired',
      projectId: 'project_1',
      retiredAt: NOW,
      retirementId: 'retirement_1',
      terminalExpiresAt: EXPIRES,
    }),
  };
  return {
    kind: 'idempotency-result',
    recordId: collabProjectBackupIdempotencyRecordId(value),
    revision: 1,
    value,
  };
}

function continuityRecords(
  direction: 'cloud-to-lan' | 'lan-to-cloud' = 'cloud-to-lan',
): Record<string, any>[] {
  const lifecycle = {
    kind: 'lifecycle-journal',
    recordId: 'transfer_1',
    revision: 1,
    value: {
      actorMemberId: 'member_1',
      batchRevision: 2,
      batchSha256: BATCH_SHA256,
      checkpointSha256: SHA256,
      createdAt: NOW,
      direction: 'cloud-to-lan',
      expectedAuthorityGeneration: 4,
      expectedPersonalRefOid: null,
      idempotencyKey: 'transfer_key_1',
      operationId: 'transfer_1',
      operationKind: 'authority-transfer',
      phase: 'completed',
      projectId: 'project_1',
      recoveryFromPhase: null,
      requestFingerprint: 'd'.repeat(64),
      resultSha256: 'e'.repeat(64),
      scheduledAt: EXPIRES,
      state: 'completed',
      updatedAt: LATER,
    },
  };
  const leaveLifecycle = {
    kind: 'lifecycle-journal',
    recordId: 'leave_1',
    revision: 1,
    value: {
      actorMemberId: 'member_3',
      batchRevision: null,
      batchSha256: null,
      checkpointSha256: null,
      createdAt: NOW,
      direction: null,
      expectedAuthorityGeneration: 5,
      expectedPersonalRefOid: MEMBER_THREE,
      idempotencyKey: 'leave_intent_1',
      operationId: 'leave_1',
      operationKind: 'leave',
      phase: 'completed',
      projectId: 'project_1',
      recoveryFromPhase: null,
      requestFingerprint: '8'.repeat(64),
      resultSha256: '7'.repeat(64),
      scheduledAt: NOW,
      state: 'completed',
      updatedAt: LATER,
    },
  };
  const recovery = {
    kind: 'authority-transfer-recovery',
    recordId: 'transfer_1',
    revision: 1,
    value: {
      cancellationRequestSha256: null,
      createdAt: NOW,
      expiresAt: EXPIRES,
      inactivePublication: null,
      projectId: 'project_1',
      relinquishmentProof: {
        batchRevision: 2,
        batchSha256: BATCH_SHA256,
        certificate: SIGNATURE,
        certificateAlgorithm: 'ed25519',
        checkpointSha256: SHA256,
        committedAt: NOW,
        operationIntentId: 'relinquish_1',
        projectId: 'project_1',
        sourceAuthority: { generation: 4, kind: 'cloud' },
        sourceHostMemberId: null,
        targetAuthority: { generation: 5, kind: 'lan' },
        transferId: 'transfer_1',
      },
      sourceAuthority: { generation: 4, kind: 'cloud' },
      sourceHostMemberId: null,
      sourceEvidence: null,
      sourceReopenSha256: null,
      stageSha256: SHA256,
      targetActivationProof: 'target-activation-proof',
      targetActivationRequestSha256: 'f'.repeat(64),
      targetAuthority: { generation: 5, kind: 'lan' },
      targetHostMemberId: 'member_1',
      targetEvidence: {
        acceptanceIntentId: 'accept_1',
        principalId: 'principal_1',
        proof: 'signed-target-proof',
        receiptKeyId: 'receipt_key_1',
        receiptPublicKey: PUBLIC_KEY,
        schemaVersion: 1,
      },
      targetUrl: 'https://lan-target.invalid:54545',
      transferId: 'transfer_1',
      updatedAt: LATER,
    },
  };
  const receiptKey = {
    kind: 'transfer-receipt-key',
    recordId: 'transfer_1:receipt_key_1',
    revision: 1,
    value: {
      createdAt: NOW,
      projectId: 'project_1',
      receiptKeyId: 'receipt_key_1',
      receiptPublicKey: PUBLIC_KEY,
      receiptPublicKeyEncoding: 'base64url-raw',
      signatureAlgorithm: 'ed25519',
      transferId: 'transfer_1',
    },
  };
  const claim = {
    kind: 'transferred-membership-claim',
    recordId: 'transfer_1:member_2',
    revision: 1,
    value: {
      batchRevision: 2,
      checkpointSha256: SHA256,
      claimSha256: CLAIM_SHA256,
      createdAt: NOW,
      expiresAt: EXPIRES,
      memberId: 'member_2',
      operationIntentId: 'claim_intent_1',
      projectId: 'project_1',
      redemptionReceiptId: 'redemption_1',
      state: 'redeemed',
      targetPrincipalId: 'principal_2',
      transferId: 'transfer_1',
      updatedAt: LATER,
    },
  };
  const redemptionReceipt = {
    kind: 'transfer-redemption-receipt',
    recordId: 'transfer_1:member_2',
    revision: 1,
    value: {
      acknowledgedAt: null,
      projectId: 'project_1',
      receipt: {
        checkpointSha256: SHA256,
        claimSha256: CLAIM_SHA256,
        memberId: 'member_2',
        operationIntentId: 'claim_intent_1',
        projectId: 'project_1',
        receiptId: 'redemption_1',
        receiptKeyId: 'receipt_key_1',
        redeemedAt: LATER,
        signature: SIGNATURE,
        signatureAlgorithm: 'ed25519',
        targetAuthorityGeneration: 5,
        transferId: 'transfer_1',
      },
    },
  };
  const protectedEnvelope = {
    kind: 'protected-claim-envelope',
    recordId: 'transfer_1:member_2',
    revision: 1,
    value: {
      associatedData: {
        authorityGeneration: 4,
        checkpointSha256: SHA256,
        claimSha256: CLAIM_SHA256,
        envelopeVersion: 1,
        environmentIdentity: 'environment_1',
        memberId: 'member_2',
        projectId: 'project_1',
        transferId: 'transfer_1',
      },
      associatedDataSha256: '0258a0efcf92a87de2b653be640855424fbaf3b2e31dd9364a0e3c1bf9009af3',
      ciphertext: 'Y2lwaGVydGV4dA',
      encryptionAlgorithm: 'xchacha20-poly1305',
      expiresAt: EXPIRES,
      keyId: 'claim_key_1',
      keyVersion: 1,
      memberId: 'member_2',
      nonce: 'A'.repeat(32),
      receiptKeyId: 'receipt_key_1',
      tag: 'A'.repeat(22),
      transferId: 'transfer_1',
    },
  };
  const terminalResponder = {
    kind: 'terminal-responder',
    recordId: 'transfer_1',
    revision: 1,
    value: {
      acknowledgements: [],
      eligibleMemberIds: ['member_1', 'member_2'],
      expiresAt: EXPIRES,
      operation: 'getProjectAuthorityTransfer',
      operationId: 'transfer_1',
      projectId: 'project_1',
      responseJson: JSON.stringify({
        batchRevision: 2,
        batchSha256: BATCH_SHA256,
        checkpointSha256: SHA256,
        createdAt: NOW,
        direction: 'cloud-to-lan',
        expiresAt: EXPIRES,
        phase: 'completed',
        projectId: 'project_1',
        relinquishmentProof: recovery.value.relinquishmentProof,
        sourceAuthority: { generation: 4, kind: 'cloud' },
        state: 'completed',
        targetAuthority: { generation: 5, kind: 'lan' },
        targetUrl: 'https://lan-target.invalid:54545',
        transferId: 'transfer_1',
        updatedAt: LATER,
      }),
    },
  };
  return [
    leaveLifecycle,
    lifecycle,
    recovery,
    ...(direction === 'lan-to-cloud' ? [claim] : []),
    receiptKey,
    {
      kind: 'transfer-claim-batch-receipt',
      recordId: 'transfer_1',
      revision: 1,
      value: {
        receipt: {
          batchRevision: 2,
          batchSha256: BATCH_SHA256,
          checkpointSha256: SHA256,
          committedAt: NOW,
          custodyAuthority: { generation: 4, kind: 'cloud' },
          operationIntentId: 'batch_intent_1',
          projectId: 'project_1',
          receiptId: 'batch_receipt_1',
          submittedByMemberId: 'member_1',
          targetAuthorityGeneration: 5,
          transferId: 'transfer_1',
        },
      },
    },
    ...(direction === 'lan-to-cloud' ? [redemptionReceipt] : []),
    ...(direction === 'cloud-to-lan' ? [terminalResponder] : []),
    ...(direction === 'cloud-to-lan' ? [{
      kind: 'terminal-principal',
      recordId: 'transfer_1:member_1',
      revision: 1,
      value: {
        acknowledgedAt: null,
        memberId: 'member_1',
        operationId: 'transfer_1',
        operationKind: 'authority-transfer',
        principalId: 'principal_1',
        projectId: 'project_1',
      },
    }] : []),
    ...(direction === 'cloud-to-lan' ? [{
      kind: 'terminal-principal',
      recordId: 'transfer_1:member_2',
      revision: 1,
      value: {
        acknowledgedAt: null,
        memberId: 'member_2',
        operationId: 'transfer_1',
        operationKind: 'authority-transfer',
        principalId: 'principal_2',
        projectId: 'project_1',
      },
    }] : []),
    ...(direction === 'cloud-to-lan' ? [{
      kind: 'terminal-responder-replay',
      recordId: 'transfer_1',
      revision: 1,
      value: {
        memberId: 'member_1',
        operationId: 'transfer_1',
        projectId: 'project_1',
        requestSha256: 'f'.repeat(64),
      },
    }] : []),
    {
      kind: 'leave-former-principal-replay',
      recordId: 'leave_1',
      revision: 1,
      value: {
        completedAt: LATER,
        createdAt: NOW,
        expectedPersonalRefOid: MEMBER_THREE,
        expiresAt: EXPIRES,
        intentId: 'leave_intent_1',
        memberId: 'member_3',
        operationId: 'leave_1',
        principalSha256: '6'.repeat(64),
        projectId: 'project_1',
        requestFingerprint: '8'.repeat(64),
        resultSha256: '7'.repeat(64),
        state: 'completed',
      },
    },
    ...(direction === 'cloud-to-lan' ? [protectedEnvelope] : []),
    ...(direction === 'cloud-to-lan' ? [{
      kind: 'tombstone',
      recordId: 'project_1',
      revision: 1,
      value: {
        authorityGeneration: 5,
        projectId: 'project_1',
        retiredAt: LATER,
        terminalExpiresAt: EXPIRES,
      },
    }] : []),
  ];
}

function lanToCloudContinuityRecords(): Record<string, any>[] {
  return continuityRecords('lan-to-cloud').map((record) => {
    if (record.kind === 'lifecycle-journal' && record.recordId === 'transfer_1') {
      return { ...record, value: { ...record.value, direction: 'lan-to-cloud' } };
    }
    if (record.kind === 'authority-transfer-recovery') {
      return {
        ...record,
        value: {
          ...record.value,
          inactivePublication: {
            artifactKey: '1'.repeat(64),
            bundleByteCount: 8192,
            bundleSha256: 'e'.repeat(64),
            objectFormat: 'sha1',
            operationId: 'transfer_1',
            placementGeneration: 1,
            projectId: 'project_1',
            publicationMarkerSha256: '4'.repeat(64),
            refs: [
              { name: 'refs/heads/main', oid: MAIN },
              { name: 'refs/heads/members/member_1', oid: MEMBER },
              { name: 'refs/heads/members/member_2', oid: MEMBER_TWO },
            ],
            repositoryStorageKey: 'repository_1',
            status: 'inactive',
            storageNodeId: 'node_1',
            validationMarkerSha256: '5'.repeat(64),
          },
          relinquishmentProof: {
            ...(record.value as Record<string, any>).relinquishmentProof,
            sourceAuthority: { generation: 4, kind: 'lan' },
            sourceHostMemberId: 'member_1',
            targetAuthority: { generation: 5, kind: 'cloud' },
          },
          sourceAuthority: { generation: 4, kind: 'lan' },
          sourceEvidence: {
            checkpointManifestSha256: SHA256,
            principalId: 'principal_1',
            proof: 'signed-source-proof',
            receiptKeyId: 'receipt_key_1',
            receiptPublicKey: PUBLIC_KEY,
            schemaVersion: 1,
          },
          sourceHostMemberId: 'member_1',
          targetAuthority: { generation: 5, kind: 'cloud' },
          targetActivationProof: null,
          targetActivationRequestSha256: null,
          targetEvidence: null,
          targetHostMemberId: null,
          targetUrl: 'https://cloud-target.invalid',
        },
      };
    }
    if (record.kind === 'transfer-claim-batch-receipt') {
      return {
        ...record,
        value: {
          receipt: {
            ...(record.value as Record<string, any>).receipt,
            custodyAuthority: { generation: 4, kind: 'lan' },
          },
        },
      };
    }
    return record;
  });
}

function acknowledgedCloudToLanContinuityRecords(): Record<string, any>[] {
  const records = continuityRecords().filter(record => (
    record.kind !== 'protected-claim-envelope'
  )).map(record => {
    if (record.kind === 'terminal-responder') {
      return {
        ...record,
        value: {
          ...record.value,
          acknowledgements: [{
            acknowledgedAt: ACKNOWLEDGED,
            memberId: 'member_2',
            principalId: 'principal_2',
          }],
        },
      };
    }
    if (record.kind === 'terminal-principal' && record.recordId === 'transfer_1:member_2') {
      return { ...record, value: { ...record.value, acknowledgedAt: ACKNOWLEDGED } };
    }
    return record;
  });
  const receipt = (continuityRecords('lan-to-cloud').find(record => (
    record.kind === 'transfer-redemption-receipt'
  )) as Record<string, any>);
  return [
    ...records,
    {
      ...receipt,
      value: { ...receipt.value, acknowledgedAt: ACKNOWLEDGED },
    },
  ];
}

function canonicalRecords(extra: readonly Record<string, any>[] = []): Record<string, any>[] {
  const order = new Map<string, number>(
    COLLAB_PROJECT_BACKUP_RECORD_KINDS.map((kind, index) => [kind, index]),
  );
  return [...baseRecords(), ...extra].sort((left, right) => {
    const kind = (order.get(String(left.kind)) ?? -1) - (order.get(String(right.kind)) ?? -1);
    return kind === 0
      ? String(left.recordId).localeCompare(String(right.recordId), 'en-US')
      : kind;
  });
}

describe('Project backup checkpoint format v2', () => {
  it('adds a backup-only coordination format without changing wire v6 format v1', () => {
    expect(COLLAB_PROJECT_COORDINATION_FORMAT_VERSION).toBe(1);
    expect(COLLAB_PROJECT_BACKUP_COORDINATION_FORMAT_VERSION).toBe(2);
    expect(COLLAB_PROJECT_BACKUP_RECORD_KINDS).toEqual(expect.arrayContaining([
      'lifecycle-journal',
      'authority-transfer-recovery',
      'transferred-membership-claim',
      'transfer-receipt-key',
      'transfer-claim-batch-receipt',
      'transfer-redemption-receipt',
      'terminal-principal',
      'terminal-responder-replay',
      'leave-former-principal-replay',
    ]));
    expect(COLLAB_PROJECT_BACKUP_RECORD_KINDS).not.toContain('lifecycle-state');
    expect(decodeCollabProjectCheckpointManifest({
      ...manifest(),
      coordinationFormatVersion: 1,
    }).coordinationFormatVersion).toBe(1);

    const legacyLifecycle = canonicalRecords();
    legacyLifecycle.splice(legacyLifecycle.findIndex(record => (
      record.kind === 'terminal-responder'
    )), 0, {
      kind: 'lifecycle-state',
      recordId: 'legacy_lifecycle_1',
      revision: 1,
      value: {
        batchRevision: null,
        batchSha256: null,
        checkpointSha256: null,
        direction: null,
        operationId: 'legacy_lifecycle_1',
        operationKind: 'backup',
        phase: 'completed',
        projectId: 'project_1',
        relinquishmentProof: null,
        updatedAt: LATER,
      },
    });
    expect(() => decodeCollabProjectBackupCheckpointCoordinationNdjson(
      legacyLifecycle.map(record => JSON.stringify(record)).join('\n') + '\n',
    )).toThrow('collab.error.protocol-payload-invalid');
  });

  it('decodes and canonically encodes an exact backup v2 manifest', () => {
    const decoded = decodeCollabProjectBackupCheckpointManifest(manifest());
    expect(decoded).toEqual(manifest());
    expect(encodeCollabProjectBackupCheckpointManifestCanonicalJson(decoded))
      .toBe(JSON.stringify(manifest()));
    expect(encodeCollabProjectBackupCheckpointManifestDigestInput(decoded))
      .toContain('"coordinationFormatVersion":2');
    expect(() => decodeCollabProjectBackupCheckpointManifest({
      ...manifest(),
      coordinationFormatVersion: 1,
    })).toThrow('collab.error.protocol-payload-invalid');
    expect(() => decodeCollabProjectBackupCheckpointManifest({
      ...manifest(),
      profile: 'export',
    })).toThrow('collab.error.protocol-payload-invalid');
  });

  it('round-trips the same idempotency key under distinct business identities', () => {
    const records = canonicalRecords([
      idempotencyRecord('member_1'),
      idempotencyRecord('member_2'),
    ]);
    const encoded = records.map(record => JSON.stringify(record)).join('\n') + '\n';
    const decoded = decodeCollabProjectBackupCheckpointCoordinationNdjson(encoded);
    const idempotencyRecords = decoded.filter(record => record.kind === 'idempotency-result');
    expect(idempotencyRecords).toHaveLength(2);
    expect(new Set(idempotencyRecords.map(record => record.recordId)).size).toBe(2);
    expect(idempotencyRecords.map(record => record.value.idempotencyKey))
      .toEqual(['same_key', 'same_key']);
    expect(encodeCollabProjectBackupCheckpointCoordinationNdjson(decoded)).toBe(encoded);
  });

  it('round-trips complete public operational continuity and binds its references', () => {
    const records = canonicalRecords(continuityRecords());
    const encoded = records.map(record => JSON.stringify(record)).join('\n') + '\n';
    const decoded = decodeCollabProjectBackupCheckpointCoordinationNdjson(encoded);
    expect(decoded).toEqual(records);
    expect(validateCollabProjectBackupCheckpointConsistency(
      decodeCollabProjectBackupCheckpointManifest(manifest()),
      decoded,
    )).toBe(decoded);

    for (const missingKind of [
      'lifecycle-journal',
      'transfer-receipt-key',
      'terminal-responder',
      'terminal-principal',
    ]) {
      const incomplete = records.filter(record => record.kind !== missingKind);
      const incompleteJson = incomplete.map(record => JSON.stringify(record)).join('\n') + '\n';
      expect(() => decodeCollabProjectBackupCheckpointCoordinationNdjson(incompleteJson))
        .toThrow('collab.error.protocol-payload-invalid');
    }
  });

  it('round-trips exact LAN-to-Cloud source evidence and inactive publication facts', () => {
    const records = canonicalRecords(lanToCloudContinuityRecords());
    const encoded = records.map(record => JSON.stringify(record)).join('\n') + '\n';
    expect(decodeCollabProjectBackupCheckpointCoordinationNdjson(encoded)).toEqual(records);

    const drifted = canonicalRecords(lanToCloudContinuityRecords().map(record => (
      record.kind === 'authority-transfer-recovery'
        ? {
            ...record,
            value: {
              ...record.value,
              relinquishmentProof: {
                ...(record.value as Record<string, any>).relinquishmentProof,
                sourceHostMemberId: 'member_2',
              },
            },
          }
        : record
    )));
    expect(() => decodeCollabProjectBackupCheckpointCoordinationNdjson(
      drifted.map(record => JSON.stringify(record)).join('\n') + '\n',
    )).toThrow('collab.error.protocol-payload-invalid');

    const wrongCustodian = canonicalRecords(lanToCloudContinuityRecords().map(record => (
      record.kind === 'transfer-claim-batch-receipt'
        ? {
            ...record,
            value: {
              receipt: {
                ...(record.value as Record<string, any>).receipt,
                submittedByMemberId: 'member_2',
              },
            },
          }
        : record
    )));
    expect(() => decodeCollabProjectBackupCheckpointCoordinationNdjson(
      wrongCustodian.map(record => JSON.stringify(record)).join('\n') + '\n',
    )).toThrow('collab.error.protocol-payload-invalid');
  });

  it('rejects unsafe or structurally invalid inactive publications', () => {
    for (const publicationDrift of [
      { artifactKey: '../artifact' },
      { placementGeneration: 2 },
      { repositoryStorageKey: '../other-project' },
      { storageNodeId: 'Node With Spaces' },
      { bundleByteCount: 1024 * 1024 * 1024 + 1 },
      {
        refs: [
          { name: 'refs/heads/main', oid: MAIN },
          { name: 'refs/heads/members/member_1', oid: '4'.repeat(64) },
        ],
      },
      {
        refs: [
          { name: 'refs/heads/main', oid: MAIN },
          { name: 'refs/heads/members/not/a/member', oid: MEMBER },
        ],
      },
    ]) {
      const records = canonicalRecords(lanToCloudContinuityRecords().map(record => (
        record.kind === 'authority-transfer-recovery'
          ? {
              ...record,
              value: {
                ...record.value,
                inactivePublication: {
                  ...record.value.inactivePublication,
                  ...publicationDrift,
                },
              },
            }
          : record
      )));
      expect(() => decodeCollabProjectBackupCheckpointCoordinationNdjson(
        records.map(record => JSON.stringify(record)).join('\n') + '\n',
      )).toThrow('collab.error.protocol-payload-invalid');
    }
  });

  it('models direction-owned claim custody before and after acknowledgement', () => {
    for (const source of [
      continuityRecords(),
      acknowledgedCloudToLanContinuityRecords(),
      lanToCloudContinuityRecords(),
    ]) {
      const records = canonicalRecords(source);
      const encoded = records.map(record => JSON.stringify(record)).join('\n') + '\n';
      expect(decodeCollabProjectBackupCheckpointCoordinationNdjson(encoded)).toEqual(records);
    }

    const mixed = canonicalRecords([
      ...continuityRecords(),
      ...(lanToCloudContinuityRecords().filter(record => (
        record.kind === 'transferred-membership-claim'
        || record.kind === 'transfer-redemption-receipt'
      ))),
    ]);
    expect(() => decodeCollabProjectBackupCheckpointCoordinationNdjson(
      mixed.map(record => JSON.stringify(record)).join('\n') + '\n',
    )).toThrow('collab.error.protocol-payload-invalid');

    for (const records of [
      canonicalRecords(acknowledgedCloudToLanContinuityRecords().map(record => (
        record.kind === 'terminal-principal' && record.recordId === 'transfer_1:member_2'
          ? { ...record, value: { ...record.value, acknowledgedAt: LATER } }
          : record
      ))),
      canonicalRecords(acknowledgedCloudToLanContinuityRecords().filter(record => (
        record.kind !== 'terminal-principal' || record.recordId !== 'transfer_1:member_2'
      ))),
    ]) {
      expect(() => decodeCollabProjectBackupCheckpointCoordinationNdjson(
        records.map(record => JSON.stringify(record)).join('\n') + '\n',
      )).toThrow('collab.error.protocol-payload-invalid');
    }

    for (const source of [
      continuityRecords().filter(record => record.kind !== 'transfer-claim-batch-receipt'),
      continuityRecords().filter(record => record.kind !== 'protected-claim-envelope'),
      acknowledgedCloudToLanContinuityRecords().filter(record => (
        record.kind !== 'transfer-redemption-receipt'
      )),
      lanToCloudContinuityRecords().filter(record => (
        record.kind !== 'transfer-claim-batch-receipt'
      )),
      lanToCloudContinuityRecords().filter(record => (
        record.kind !== 'transferred-membership-claim'
      )),
    ]) {
      const records = canonicalRecords(source);
      expect(() => decodeCollabProjectBackupCheckpointCoordinationNdjson(
        records.map(record => JSON.stringify(record)).join('\n') + '\n',
      )).toThrow('collab.error.protocol-payload-invalid');
    }
  });

  it('rejects cross-Project continuity, receipt drift, and non-allowlisted material', () => {
    const mutations = [
      { kind: 'authority-transfer-recovery', value: { projectId: 'project_2' } },
      { kind: 'authority-transfer-recovery', value: { targetUrl: 'file:///etc/passwd' } },
      {
        kind: 'authority-transfer-recovery',
        value: { targetActivationProof: 'not base64url!' },
      },
      { kind: 'transfer-receipt-key', value: { receiptPublicKey: 'not_base64url!' } },
      {
        kind: 'transfer-redemption-receipt',
        value: { receipt: { claimSha256: '9'.repeat(64) } },
      },
      {
        kind: 'authority-transfer-recovery',
        value: {
          inactivePublicationJson: JSON.stringify({ claim: 'raw-secret-claim' }),
        },
      },
      {
        kind: 'authority-transfer-recovery',
        value: {
          targetEvidence: {
            acceptanceIntentId: 'accept_1',
            claim: 'raw-secret-claim',
            principalId: 'principal_1',
            proof: 'signed-target-proof',
            receiptKeyId: 'receipt_key_1',
            receiptPublicKey: PUBLIC_KEY,
            schemaVersion: 1,
          },
        },
      },
    ];
    for (const mutation of mutations) {
      const source = mutation.kind === 'transfer-redemption-receipt'
        ? lanToCloudContinuityRecords()
        : continuityRecords();
      const records = canonicalRecords(source.map(record => (
        record.kind !== mutation.kind
          ? record
          : {
              ...record,
              value: {
                ...record.value,
                ...mutation.value,
                ...(mutation.kind === 'transfer-redemption-receipt'
                  ? {
                      receipt: {
                        ...(record.value as { receipt: Record<string, unknown> }).receipt,
                        ...mutation.value.receipt,
                      },
                    }
                  : {}),
              },
            }
      )));
      const encoded = records.map(record => JSON.stringify(record)).join('\n') + '\n';
      expect(() => decodeCollabProjectBackupCheckpointCoordinationNdjson(encoded))
        .toThrow('collab.error.protocol-payload-invalid');
    }
  });

  it('rejects one-field drift across transfer evidence tuples', () => {
    const mutations = [
      {
        kind: 'authority-transfer-recovery',
        mutate: (record: Record<string, any>) => ({
          ...record,
          value: {
            ...record.value,
            relinquishmentProof: {
              ...record.value.relinquishmentProof,
              batchSha256: '9'.repeat(64),
            },
          },
        }),
      },
      {
        kind: 'authority-transfer-recovery',
        mutate: (record: Record<string, any>) => ({
          ...record,
          value: {
            ...record.value,
            targetEvidence: {
              ...record.value.targetEvidence,
              principalId: 'principal_other',
            },
          },
        }),
      },
      {
        kind: 'transferred-membership-claim',
        mutate: (record: Record<string, any>) => ({
          ...record,
          value: { ...record.value, targetPrincipalId: 'principal_other' },
        }),
      },
      {
        kind: 'transferred-membership-claim',
        mutate: (record: Record<string, any>) => ({
          ...record,
          value: { ...record.value, state: 'revoked' },
        }),
      },
      {
        kind: 'protected-claim-envelope',
        mutate: (record: Record<string, any>) => ({
          ...record,
          recordId: 'transfer_1:member_1',
        }),
      },
      {
        kind: 'transfer-receipt-key',
        mutate: (record: Record<string, any>) => ({
          ...record,
          value: { ...record.value, receiptPublicKey: `${'A'.repeat(42)}Q` },
        }),
      },
      {
        kind: 'transfer-claim-batch-receipt',
        mutate: (record: Record<string, any>) => ({
          ...record,
          value: {
            receipt: { ...record.value.receipt, submittedByMemberId: 'member_2' },
          },
        }),
      },
      {
        kind: 'terminal-responder-replay',
        mutate: (record: Record<string, any>) => ({
          ...record,
          value: { ...record.value, memberId: 'member_2' },
        }),
      },
      {
        kind: 'terminal-responder-replay',
        mutate: (record: Record<string, any>) => ({
          ...record,
          value: { ...record.value, requestSha256: '9'.repeat(64) },
        }),
      },
    ];
    for (const mutation of mutations) {
      const source = mutation.kind === 'transferred-membership-claim'
        ? lanToCloudContinuityRecords()
        : continuityRecords();
      const records = canonicalRecords(source.map(record => (
        record.kind === mutation.kind ? mutation.mutate(record) : record
      )));
      const encoded = records.map(record => JSON.stringify(record)).join('\n') + '\n';
      expect(() => decodeCollabProjectBackupCheckpointCoordinationNdjson(encoded))
        .toThrow('collab.error.protocol-payload-invalid');
    }
  });

  it('rejects orphan idempotency members and non-32-byte receipt keys', () => {
    const orphan = idempotencyRecord('member_missing');
    const orphanRecords = canonicalRecords([orphan]);
    expect(() => decodeCollabProjectBackupCheckpointCoordinationNdjson(
      orphanRecords.map(record => JSON.stringify(record)).join('\n') + '\n',
    )).toThrow('collab.error.protocol-payload-invalid');

    const oversizedKeyRecords = canonicalRecords(continuityRecords().map(record => (
      record.kind === 'transfer-receipt-key'
        ? { ...record, value: { ...record.value, receiptPublicKey: 'A'.repeat(86) } }
        : record
    )));
    expect(() => decodeCollabProjectBackupCheckpointCoordinationNdjson(
      oversizedKeyRecords.map(record => JSON.stringify(record)).join('\n') + '\n',
    )).toThrow('collab.error.protocol-payload-invalid');
  });

  it('requires the evidence-pinned receipt verifier in both transfer directions', () => {
    for (const source of [continuityRecords(), lanToCloudContinuityRecords()]) {
      const evidenceRecords = canonicalRecords(source);
      const encoded = evidenceRecords.map(record => JSON.stringify(record)).join('\n') + '\n';
      expect(decodeCollabProjectBackupCheckpointCoordinationNdjson(encoded))
        .toEqual(evidenceRecords);

      const withoutVerifier = evidenceRecords.filter(record => (
        record.kind !== 'transfer-receipt-key'
      ));
      expect(() => decodeCollabProjectBackupCheckpointCoordinationNdjson(
        withoutVerifier.map(record => JSON.stringify(record)).join('\n') + '\n',
      )).toThrow('collab.error.protocol-payload-invalid');
    }
  });

  it('binds transfer scheduling and live claim retention to recovery expiry', () => {
    const scheduledDrift = canonicalRecords(continuityRecords().map(record => (
      record.kind === 'lifecycle-journal' && record.recordId === 'transfer_1'
        ? { ...record, value: { ...record.value, scheduledAt: EXTENDED } }
        : record
    )));
    expect(() => decodeCollabProjectBackupCheckpointCoordinationNdjson(
      scheduledDrift.map(record => JSON.stringify(record)).join('\n') + '\n',
    )).toThrow('collab.error.protocol-payload-invalid');

    const envelopeDrift = canonicalRecords(continuityRecords().map(record => {
      if (record.kind === 'protected-claim-envelope') {
        return { ...record, value: { ...record.value, expiresAt: EXTENDED } };
      }
      return record;
    }));
    expect(() => decodeCollabProjectBackupCheckpointCoordinationNdjson(
      envelopeDrift.map(record => JSON.stringify(record)).join('\n') + '\n',
    )).toThrow('collab.error.protocol-payload-invalid');

    const claimDrift = canonicalRecords(lanToCloudContinuityRecords().map(record => {
      if (record.kind === 'transferred-membership-claim') {
        return { ...record, value: { ...record.value, expiresAt: EXTENDED } };
      }
      return record;
    }));
    expect(() => decodeCollabProjectBackupCheckpointCoordinationNdjson(
      claimDrift.map(record => JSON.stringify(record)).join('\n') + '\n',
    )).toThrow('collab.error.protocol-payload-invalid');
  });

  it('binds leave replay facts to the matching lifecycle journal', () => {
    for (const value of [
      { principalSha256: 'principal_1' },
      { requestFingerprint: '9'.repeat(64) },
      { resultSha256: '9'.repeat(64) },
      { intentId: 'different_intent' },
    ]) {
      const records = canonicalRecords(continuityRecords().map(record => (
        record.kind === 'leave-former-principal-replay'
          ? { ...record, value: { ...record.value, ...value } }
          : record
      )));
      expect(() => decodeCollabProjectBackupCheckpointCoordinationNdjson(
        records.map(record => JSON.stringify(record)).join('\n') + '\n',
      )).toThrow('collab.error.protocol-payload-invalid');
    }

    for (const value of [
      { completedAt: NOW },
      { completedAt: LATER, resultSha256: null, state: 'recovering' },
    ]) {
      const records = canonicalRecords(continuityRecords().map(record => (
        record.kind === 'leave-former-principal-replay'
          ? { ...record, value: { ...record.value, ...value } }
          : record
      )));
      expect(() => decodeCollabProjectBackupCheckpointCoordinationNdjson(
        records.map(record => JSON.stringify(record)).join('\n') + '\n',
      )).toThrow('collab.error.protocol-payload-invalid');
    }
  });

  it('preserves a recoverable prepared Leave without requiring a replay record', () => {
    const preparedLeave = {
      ...(continuityRecords().find(record => (
        record.kind === 'lifecycle-journal' && record.recordId === 'leave_1'
      )) as Record<string, any>),
      value: {
        ...(continuityRecords().find(record => (
          record.kind === 'lifecycle-journal' && record.recordId === 'leave_1'
        )) as Record<string, any>).value,
        phase: 'prepared',
        actorMemberId: 'member_1',
        expectedPersonalRefOid: MEMBER,
        resultSha256: null,
        state: 'active',
        updatedAt: NOW,
      },
    };
    const records = canonicalRecords([preparedLeave]);
    const encoded = records.map(record => JSON.stringify(record)).join('\n') + '\n';
    expect(decodeCollabProjectBackupCheckpointCoordinationNdjson(encoded)).toEqual(records);

    const missingOid = canonicalRecords([{
      ...preparedLeave,
      value: { ...preparedLeave.value, expectedPersonalRefOid: null },
    }]);
    expect(() => decodeCollabProjectBackupCheckpointCoordinationNdjson(
      missingOid.map(record => JSON.stringify(record)).join('\n') + '\n',
    )).toThrow('collab.error.protocol-payload-invalid');
  });

  it('rejects duplicate transfer claim and receipt identities', () => {
    const lanRecords = lanToCloudContinuityRecords();
    const claim = (lanRecords.find(record => (
      record.kind === 'transferred-membership-claim'
    )) as Record<string, any>);
    const receipt = (lanRecords.find(record => (
      record.kind === 'transfer-redemption-receipt'
    )) as Record<string, any>);
    const duplicateClaim = {
      ...claim,
      recordId: 'transfer_1:member_1',
      value: {
        ...claim.value,
        memberId: 'member_1',
        operationIntentId: null,
        redemptionReceiptId: null,
        state: 'unclaimed',
        targetPrincipalId: null,
      },
    };
    const secondClaim = {
      ...claim,
      recordId: 'transfer_1:member_1',
      value: {
        ...claim.value,
        claimSha256: '4'.repeat(64),
        memberId: 'member_1',
        targetPrincipalId: 'principal_1',
      },
    };
    const duplicateReceipt = {
      ...receipt,
      recordId: 'transfer_1:member_1',
      value: {
        ...receipt.value,
        receipt: {
          ...receipt.value.receipt,
          claimSha256: '4'.repeat(64),
          memberId: 'member_1',
        },
      },
    };
    for (const extras of [
      [duplicateClaim],
      [secondClaim, duplicateReceipt],
    ]) {
      const records = canonicalRecords([...lanRecords, ...extras]);
      expect(() => decodeCollabProjectBackupCheckpointCoordinationNdjson(
        records.map(record => JSON.stringify(record)).join('\n') + '\n',
      )).toThrow('collab.error.protocol-payload-invalid');
    }
  });

  it('requires canonical key order after semantic decoding', () => {
    const records = canonicalRecords(continuityRecords());
    const lines = records.map(record => JSON.stringify(record));
    const index = records.findIndex(record => record.kind === 'protected-claim-envelope');
    const record = records[index] as Record<string, any>;
    lines[index] = JSON.stringify({
      recordId: record.recordId,
      kind: record.kind,
      revision: record.revision,
      value: record.value,
    });
    expect(() => decodeCollabProjectBackupCheckpointCoordinationNdjson(`${lines.join('\n')}\n`))
      .toThrow('collab.error.protocol-payload-invalid');

    const valueLines = records.map(item => JSON.stringify(item));
    const value = record.value;
    valueLines[index] = JSON.stringify({
      kind: record.kind,
      recordId: record.recordId,
      revision: record.revision,
      value: {
        transferId: value.transferId,
        associatedData: value.associatedData,
        associatedDataSha256: value.associatedDataSha256,
        ciphertext: value.ciphertext,
        encryptionAlgorithm: value.encryptionAlgorithm,
        expiresAt: value.expiresAt,
        keyId: value.keyId,
        keyVersion: value.keyVersion,
        memberId: value.memberId,
        nonce: value.nonce,
        receiptKeyId: value.receiptKeyId,
        tag: value.tag,
      },
    });
    expect(() => decodeCollabProjectBackupCheckpointCoordinationNdjson(
      `${valueLines.join('\n')}\n`,
    )).toThrow('collab.error.protocol-payload-invalid');
  });

  it('applies the canonical authority-transfer lifecycle fence and reverse link', () => {
    for (const source of [
      continuityRecords().map(record => (
        record.kind === 'lifecycle-journal' && record.recordId === 'transfer_1'
          ? { ...record, value: { ...record.value, phase: 'repository-published' } }
          : record
      )),
      continuityRecords().map(record => (
        record.kind === 'authority-transfer-recovery'
          ? { ...record, value: { ...record.value, relinquishmentProof: null } }
          : record
      )),
      continuityRecords().filter(record => (
        record.kind !== 'authority-transfer-recovery'
      )),
      continuityRecords().map(record => (
        record.kind === 'authority-transfer-recovery'
          ? {
              ...record,
              value: {
                ...record.value,
                targetActivationProof: null,
                targetActivationRequestSha256: null,
              },
            }
          : record
      )),
      continuityRecords().map(record => (
        record.kind === 'authority-transfer-recovery'
          ? { ...record, value: { ...record.value, stageSha256: null } }
          : record
      )),
      lanToCloudContinuityRecords().map(record => (
        record.kind === 'authority-transfer-recovery'
          ? { ...record, value: { ...record.value, sourceEvidence: null } }
          : record
      )),
      lanToCloudContinuityRecords().map(record => (
        record.kind === 'authority-transfer-recovery'
          ? { ...record, value: { ...record.value, inactivePublication: null } }
          : record
      )),
    ]) {
      const candidate = canonicalRecords(source);
      expect(() => decodeCollabProjectBackupCheckpointCoordinationNdjson(
        candidate.map(record => JSON.stringify(record)).join('\n') + '\n',
      )).toThrow('collab.error.protocol-payload-invalid');
    }

    const sourceGenerationAfterFence = canonicalRecords(continuityRecords()).map(record => (
      record.kind === 'project'
        ? { ...record, value: { ...record.value, authorityGeneration: 4 } }
        : record
    ));
    expect(() => decodeCollabProjectBackupCheckpointCoordinationNdjson(
      sourceGenerationAfterFence.map(record => JSON.stringify(record)).join('\n') + '\n',
    )).toThrow('collab.error.protocol-payload-invalid');

    const cloudCancellation = continuityRecords().filter(record => (
      (record.kind === 'lifecycle-journal' && record.recordId === 'transfer_1')
      || record.kind === 'authority-transfer-recovery'
      || record.kind === 'transfer-receipt-key'
    )).map(record => {
      if (record.kind === 'lifecycle-journal') {
        return {
          ...record,
          value: {
            ...record.value,
            phase: 'cancel-intent',
            resultSha256: null,
            state: 'active',
          },
        };
      }
      if (record.kind === 'authority-transfer-recovery') {
        return {
          ...record,
          value: {
            ...record.value,
            cancellationRequestSha256: '5'.repeat(64),
            relinquishmentProof: null,
            sourceReopenSha256: null,
            targetActivationProof: null,
            targetActivationRequestSha256: null,
          },
        };
      }
      return record;
    });
    const cancellationRecords = canonicalRecords(cloudCancellation).map(record => (
      record.kind === 'project'
        ? { ...record, value: { ...record.value, authorityGeneration: 4 } }
        : record
    ));
    expect(decodeCollabProjectBackupCheckpointCoordinationNdjson(
      cancellationRecords.map(record => JSON.stringify(record)).join('\n') + '\n',
    )).toEqual(cancellationRecords);

    const missingCleanupEvidence = cancellationRecords.map(record => {
      if (record.kind === 'lifecycle-journal' && record.recordId === 'transfer_1') {
        return { ...record, value: { ...record.value, phase: 'target-invalidated' } };
      }
      return record;
    });
    expect(() => decodeCollabProjectBackupCheckpointCoordinationNdjson(
      missingCleanupEvidence.map(record => JSON.stringify(record)).join('\n') + '\n',
    )).toThrow('collab.error.protocol-payload-invalid');
  });

  it('forbids direction-owned claim custody after cancellation cleanup', () => {
    for (const source of [continuityRecords(), lanToCloudContinuityRecords()]) {
      const targetCleaned = source.filter(record => (
        record.kind !== 'terminal-responder'
        && record.kind !== 'terminal-principal'
        && record.kind !== 'terminal-responder-replay'
        && record.kind !== 'tombstone'
      )).map(record => {
        if (record.kind === 'lifecycle-journal' && record.recordId === 'transfer_1') {
          return {
            ...record,
            value: {
              ...record.value,
              phase: 'target-cleaned',
              resultSha256: null,
              state: 'active',
            },
          };
        }
        if (record.kind === 'authority-transfer-recovery') {
          return {
            ...record,
            value: {
              ...record.value,
              cancellationRequestSha256: '5'.repeat(64),
              relinquishmentProof: null,
              sourceReopenSha256: record.value.sourceAuthority.kind === 'cloud'
                ? '6'.repeat(64)
                : null,
              targetActivationProof: null,
              targetActivationRequestSha256: null,
            },
          };
        }
        return record;
      });
      const records = canonicalRecords(targetCleaned).map(record => (
        record.kind === 'project'
          ? { ...record, value: { ...record.value, authorityGeneration: 4 } }
          : record
      ));
      expect(() => decodeCollabProjectBackupCheckpointCoordinationNdjson(
        records.map(record => JSON.stringify(record)).join('\n') + '\n',
      )).toThrow('collab.error.protocol-payload-invalid');
    }
  });

  it('rejects drift in terminal tombstone authority and completion facts', () => {
    for (const drift of [
      { authorityGeneration: 4 },
      { retiredAt: NOW },
    ]) {
      const records = canonicalRecords(continuityRecords().map(record => (
        record.kind === 'tombstone'
          ? { ...record, value: { ...record.value, ...drift } }
          : record
      )));
      expect(() => decodeCollabProjectBackupCheckpointCoordinationNdjson(
        records.map(record => JSON.stringify(record)).join('\n') + '\n',
      )).toThrow('collab.error.protocol-payload-invalid');
    }
  });

  it('rejects multiple simultaneous nonterminal lifecycle journals', () => {
    const preparedLeave = {
      ...(continuityRecords().find(record => (
        record.kind === 'lifecycle-journal' && record.recordId === 'leave_1'
      )) as Record<string, any>),
      value: {
        ...(continuityRecords().find(record => (
          record.kind === 'lifecycle-journal' && record.recordId === 'leave_1'
        )) as Record<string, any>).value,
        phase: 'prepared',
        actorMemberId: 'member_1',
        expectedPersonalRefOid: MEMBER,
        resultSha256: null,
        state: 'active',
        updatedAt: NOW,
      },
    };
    for (const secondState of ['active', 'recovery-required']) {
      const second = {
        ...preparedLeave,
        recordId: 'leave_2',
        value: {
          ...preparedLeave.value,
          idempotencyKey: 'leave_intent_2',
          operationId: 'leave_2',
          recoveryFromPhase: secondState === 'recovery-required' ? 'prepared' : null,
          state: secondState,
        },
      };
      const records = canonicalRecords([preparedLeave, second]);
      expect(() => decodeCollabProjectBackupCheckpointCoordinationNdjson(
        records.map(record => JSON.stringify(record)).join('\n') + '\n',
      )).toThrow('collab.error.protocol-payload-invalid');
    }
  });

  it('rejects phase and state drift across non-transfer operation families', () => {
    const completedLeave = continuityRecords();
    const completedTemplate = {
      ...(completedLeave.find(record => (
        record.kind === 'lifecycle-journal' && record.recordId === 'leave_1'
      )) as Record<string, any>),
      value: {
        ...(completedLeave.find(record => (
          record.kind === 'lifecycle-journal' && record.recordId === 'leave_1'
        )) as Record<string, any>).value,
        actorMemberId: 'member_1',
        checkpointSha256: SHA256,
        expectedPersonalRefOid: null,
      },
    };
    const completedJournal = (
      operationKind: 'backup' | 'delete' | 'export' | 'retire',
      checkpointSha256: string | null,
    ) => ({
      ...completedTemplate,
      recordId: `${operationKind}_1`,
      value: {
        ...completedTemplate.value,
        checkpointSha256,
        idempotencyKey: `${operationKind}_key_1`,
        operationId: `${operationKind}_1`,
        operationKind,
      },
    });
    const cases = [
      completedLeave.map(record => (
        record.kind === 'lifecycle-journal' && record.recordId === 'leave_1'
          ? { ...record, value: { ...record.value, phase: 'personal-ref-removed' } }
          : record
      )),
      [{
        ...completedJournal('backup', SHA256),
        value: { ...completedJournal('backup', SHA256).value, phase: 'prepared' },
      }],
      [{
        ...completedJournal('export', SHA256),
        value: { ...completedJournal('export', SHA256).value, state: 'active' },
      }],
      [{
        ...completedJournal('delete', null),
        value: { ...completedJournal('delete', null).value, phase: 'tombstoned' },
      }],
      [{
        ...completedJournal('retire', null),
        value: { ...completedJournal('retire', null).value, state: 'active' },
      }],
    ];
    for (const source of cases) {
      const records = canonicalRecords(source);
      expect(() => decodeCollabProjectBackupCheckpointCoordinationNdjson(
        records.map(record => JSON.stringify(record)).join('\n') + '\n',
      )).toThrow('collab.error.protocol-payload-invalid');
    }
  });

  it('binds completed Leave continuity to settled membership and revoked binding', () => {
    const formerBinding = {
      kind: 'principal-binding',
      recordId: 'member_3',
      revision: 1,
      value: {
        boundAt: NOW,
        memberId: 'member_3',
        principalId: 'principal_3',
        projectId: 'project_1',
      },
    };
    const activeFormerMember = canonicalRecords([
      ...continuityRecords(),
      formerBinding,
    ]).map(record => (
      record.kind === 'member' && record.recordId === 'member_3'
        ? {
            ...record,
            value: {
              ...record.value,
              revokedAt: null,
              status: 'active',
              updatedAt: NOW,
            },
          }
        : record
    ));
    expect(() => decodeCollabProjectBackupCheckpointCoordinationNdjson(
      activeFormerMember.map(record => JSON.stringify(record)).join('\n') + '\n',
    )).toThrow('collab.error.protocol-payload-invalid');

    const withoutReplay = canonicalRecords(continuityRecords().filter(record => (
      record.kind !== 'leave-former-principal-replay'
    )));
    expect(() => decodeCollabProjectBackupCheckpointCoordinationNdjson(
      withoutReplay.map(record => JSON.stringify(record)).join('\n') + '\n',
    )).toThrow('collab.error.protocol-payload-invalid');
  });

  it('excludes the capture operation from its own coordination stream', () => {
    const ownJournal = {
      ...(continuityRecords().find(record => (
        record.kind === 'lifecycle-journal' && record.recordId === 'leave_1'
      )) as Record<string, any>),
      recordId: 'backup_1',
      value: {
        ...(continuityRecords().find(record => (
          record.kind === 'lifecycle-journal' && record.recordId === 'leave_1'
        )) as Record<string, any>).value,
        idempotencyKey: 'backup_key_1',
        operationId: 'backup_1',
        operationKind: 'backup',
        checkpointSha256: SHA256,
        expectedPersonalRefOid: null,
      },
    };
    const records = canonicalRecords([ownJournal]);
    const decoded = decodeCollabProjectBackupCheckpointCoordinationNdjson(
      records.map(record => JSON.stringify(record)).join('\n') + '\n',
    );
    expect(() => validateCollabProjectBackupCheckpointConsistency(
      decodeCollabProjectBackupCheckpointManifest(manifest()),
      decoded,
    )).toThrow('collab.error.protocol-payload-invalid');
  });

  it('round-trips Cloud principal identifiers in v2-only backup records', () => {
    const principalId = 'oidc:user.example:com';
    const base = canonicalRecords().map(record => (
      record.kind === 'principal-binding' && record.recordId === 'member_1'
        ? { ...record, value: { ...record.value, principalId } }
        : record
    ));
    expect(decodeCollabProjectBackupCheckpointCoordinationNdjson(
      base.map(record => JSON.stringify(record)).join('\n') + '\n',
    )).toEqual(base);
    const records = canonicalRecords(continuityRecords()).map(record => {
      if (record.kind === 'principal-binding' && record.recordId === 'member_1') {
        return { ...record, value: { ...record.value, principalId } };
      }
      if (record.kind === 'terminal-principal' && record.recordId === 'transfer_1:member_1') {
        return { ...record, value: { ...record.value, principalId } };
      }
      if (record.kind === 'authority-transfer-recovery') {
        return {
          ...record,
          value: {
            ...record.value,
            targetEvidence: { ...record.value.targetEvidence, principalId },
          },
        };
      }
      return record;
    });
    const encoded = records.map(record => JSON.stringify(record)).join('\n') + '\n';
    expect(decodeCollabProjectBackupCheckpointCoordinationNdjson(encoded)).toEqual(records);

    const acknowledged = canonicalRecords(continuityRecords()).map(record => {
      if (record.kind === 'terminal-responder') {
        return {
          ...record,
          value: {
            ...record.value,
            acknowledgements: [{
              acknowledgedAt: ACKNOWLEDGED,
              memberId: 'member_1',
              principalId,
            }],
          },
        };
      }
      if (record.kind === 'terminal-principal' && record.recordId === 'transfer_1:member_1') {
        return {
          ...record,
          value: { ...record.value, acknowledgedAt: ACKNOWLEDGED, principalId },
        };
      }
      return record;
    });
    expect(decodeCollabProjectBackupCheckpointCoordinationNdjson(
      acknowledged.map(record => JSON.stringify(record)).join('\n') + '\n',
    )).toEqual(acknowledged);
  });

  it('requires one active Member per principal binding', () => {
    const duplicatePrincipal = canonicalRecords().map(record => (
      record.kind === 'principal-binding' && record.recordId === 'member_2'
        ? { ...record, value: { ...record.value, principalId: 'principal_1' } }
        : record
    ));
    const formerMemberBinding = canonicalRecords([{
      kind: 'principal-binding',
      recordId: 'member_3',
      revision: 1,
      value: {
        boundAt: NOW,
        memberId: 'member_3',
        principalId: 'principal_3',
        projectId: 'project_1',
      },
    }]);
    for (const records of [duplicatePrincipal, formerMemberBinding]) {
      expect(() => decodeCollabProjectBackupCheckpointCoordinationNdjson(
        records.map(record => JSON.stringify(record)).join('\n') + '\n',
      )).toThrow('collab.error.protocol-payload-invalid');
    }
  });
});
