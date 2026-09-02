import type { CollabProjectBackupRecordKind } from '../src/CollabProjectBackupCheckpoint';
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
  COLLAB_CHECKPOINT_ARTIFACT_LIMITS,
  COLLAB_PROJECT_COORDINATION_FORMAT_VERSION,
  decodeCollabProjectCheckpointCoordinationNdjson,
  decodeCollabProjectCheckpointManifest,
} from '../src/CollabProjectCheckpoint';

const NOW = '2026-08-28T00:00:00.000Z';
const LATER = '2026-08-28T00:00:01.000Z';
const ACKNOWLEDGED = '2026-08-28T00:00:02.000Z';
const EXPIRES = '2026-09-28T00:00:00.000Z';
const EXTENDED = '2026-10-28T00:00:00.000Z';
const MEMBERSHIP_DAY_EXPIRES = '2026-08-29T00:00:00.000Z';
const MEMBERSHIP_REPLAY_EXPIRES = '2026-09-27T00:00:00.000Z';
const MAIN = '1'.repeat(40);
const MEMBER = '2'.repeat(40);
const MEMBER_TWO = '3'.repeat(40);
const MEMBER_THREE = '4'.repeat(40);
const SHA256 = 'a'.repeat(64);
const BATCH_SHA256 = 'b'.repeat(64);
const CLAIM_SHA256 = 'c'.repeat(64);
const SIGNATURE = 'A'.repeat(86);
const PUBLIC_KEY = 'A'.repeat(43);

type Expect<Condition extends true> = Condition;
type LifecycleStateIsExcluded = Expect<
  'lifecycle-state' extends CollabProjectBackupRecordKind ? false : true
>;
const lifecycleStateIsExcluded: LifecycleStateIsExcluded = true;

function manifest(overrides: Record<string, unknown> = {}) {
  return {
    artifacts: [
      { byteCount: 4096, name: 'coordination.ndjson', sha256: 'd'.repeat(64) },
      { byteCount: 8192, name: 'repository.bundle', sha256: 'e'.repeat(64) },
    ],
    coordinationFormatVersion: 3,
    createdAt: NOW,
    expectedMainOid: MAIN,
    gitObjectFormat: 'sha1',
    manifestSchemaVersion: 1,
    manifestSha256: 'f'.repeat(64),
    operationId: 'backup_1',
    profile: 'backup',
    projectId: 'project_1',
    protocolVersion: 8,
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

function unboundImportedBaseRecords(): Record<string, any>[] {
  return baseRecords().filter(record => !(
    record.kind === 'principal-binding' && record.recordId === 'member_2'
  ));
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

function cancelledCloudToLanContinuityRecords(): Record<string, any>[] {
  const retainedKinds = new Set([
    'authority-transfer-recovery',
    'lifecycle-journal',
    'terminal-principal',
    'terminal-responder',
    'terminal-responder-replay',
    'transfer-receipt-key',
  ]);
  return continuityRecords().filter(record => (
    retainedKinds.has(record.kind)
    && (record.kind !== 'lifecycle-journal' || record.recordId === 'transfer_1')
  )).map((record) => {
    if (record.kind === 'lifecycle-journal') {
      return {
        ...record,
        value: {
          ...record.value,
          phase: 'cancelled',
          resultSha256: null,
          state: 'cancelled',
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
          sourceReopenSha256: '6'.repeat(64),
          targetActivationProof: null,
          targetActivationRequestSha256: null,
        },
      };
    }
    if (record.kind === 'terminal-responder') {
      const response = JSON.parse(record.value.responseJson);
      return {
        ...record,
        value: {
          ...record.value,
          responseJson: JSON.stringify({
            ...response,
            phase: 'cancelled',
            relinquishmentProof: null,
            state: 'cancelled',
          }),
        },
      };
    }
    return record;
  });
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

function activeImportedClaimContinuityRecords(): Record<string, any>[] {
  return lanToCloudContinuityRecords().filter(record => (
    record.kind !== 'transfer-redemption-receipt'
  )).map((record) => {
    if (record.kind !== 'transferred-membership-claim') return record;
    return {
      ...record,
      value: {
        ...record.value,
        operationIntentId: null,
        redemptionReceiptId: null,
        state: 'unclaimed',
        targetPrincipalId: null,
        updatedAt: NOW,
      },
    };
  });
}

function overrideRedemptionReceipt(): Record<string, any> {
  const source = lanToCloudContinuityRecords().find(record => (
    record.kind === 'transfer-redemption-receipt'
  )) as Record<string, any>;
  return {
    ...source,
    value: {
      ...source.value,
      receipt: {
        ...source.value.receipt,
        claimSha256: BATCH_SHA256,
        operationIntentId: 'override_claim_intent_1',
        receiptId: 'override_redemption_1',
      },
    },
  };
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

function canonicalRecords(
  extra: readonly Record<string, any>[] = [],
  base: readonly Record<string, any>[] = baseRecords(),
): Record<string, any>[] {
  const order = new Map<string, number>(
    COLLAB_PROJECT_BACKUP_RECORD_KINDS.map((kind, index) => [kind, index]),
  );
  return [...base, ...extra].sort((left, right) => {
    const kind = (order.get(String(left.kind)) ?? -1) - (order.get(String(right.kind)) ?? -1);
    return kind === 0
      ? String(left.recordId).localeCompare(String(right.recordId), 'en-US')
      : kind;
  });
}

function coordinationLimitRecords(extraBodyByte = ''): Record<string, any>[] {
  const fullBody = 'é'.repeat(16_384);
  const tickets = Array.from({ length: 8_114 }, (_, index) => {
    const number = 10_000 + index;
    const ticketId = `ticket_${number}`;
    return {
      kind: 'ticket',
      recordId: ticketId,
      revision: 1,
      value: {
        authorMemberId: 'member_1',
        body: index === 8_113 ? 'é'.repeat(11_060) + extraBodyByte : fullBody,
        closedAt: null,
        closedByMemberId: null,
        createdAt: NOW,
        number,
        projectId: 'project_1',
        status: 'open',
        ticketId,
        title: 'T',
        updatedAt: NOW,
      },
    };
  });
  const base = baseRecords().map(record => record.kind === 'principal-binding'
    ? {
      ...record,
      value: { ...record.value, principalId: record.recordId === 'member_1' ? 'a' : 'b' },
    }
    : record);
  // 2,528 base bytes + 8,113 * 33,084 full-ticket bytes + 22,436 tail bytes = 256 MiB.
  return canonicalRecords(tickets, base);
}

function membershipV3Records(): Record<string, any>[] {
  return [
    {
      kind: 'lifecycle-journal',
      recordId: 'create_project_1',
      revision: 5,
      value: {
        actorMemberId: null,
        batchRevision: null,
        batchSha256: null,
        checkpointSha256: null,
        createdAt: NOW,
        direction: null,
        expectedAuthorityGeneration: 5,
        expectedPersonalRefOid: null,
        idempotencyKey: 'create_project_key',
        operationId: 'create_project_1',
        operationKind: 'create-project',
        phase: 'completed',
        projectId: 'project_1',
        recoveryFromPhase: null,
        requestFingerprint: SHA256,
        resultSha256: BATCH_SHA256,
        scheduledAt: NOW,
        state: 'completed',
        updatedAt: LATER,
      },
    },
    {
      kind: 'project-invitation',
      recordId: 'invitation_1',
      revision: 2,
      value: {
        createdAt: NOW,
        expiresAt: MEMBERSHIP_DAY_EXPIRES,
        idempotencyKey: 'invitation_key',
        invitationId: 'invitation_1',
        issuedByMemberId: 'member_1',
        projectId: 'project_1',
        requestFingerprint: SHA256,
        revision: 2,
        secretReplayExpiresAt: MEMBERSHIP_REPLAY_EXPIRES,
        secretSha256: CLAIM_SHA256,
        state: 'revoked',
        terminalAt: LATER,
      },
    },
    {
      kind: 'protected-invitation-envelope',
      recordId: 'invitation_1',
      revision: 1,
      value: {
        associatedDataSha256: SHA256,
        ciphertext: 'ciphertext_1',
        createdAt: NOW,
        expiresAt: MEMBERSHIP_REPLAY_EXPIRES,
        invitationId: 'invitation_1',
        keyId: 'key_1',
        nonce: 'nonce_1',
        projectId: 'project_1',
      },
    },
    {
      kind: 'transferred-membership-claim-override',
      recordId: 'transfer_1:member_2:1',
      revision: 1,
      value: {
        claimGeneration: 1,
        claimSha256: BATCH_SHA256,
        createdAt: NOW,
        expiresAt: MEMBERSHIP_REPLAY_EXPIRES,
        idempotencyKey: 'claim_override_key',
        managerMemberId: 'member_1',
        memberId: 'member_2',
        projectId: 'project_1',
        redemptionReceiptId: null,
        requestFingerprint: SHA256,
        secretReplayExpiresAt: MEMBERSHIP_REPLAY_EXPIRES,
        state: 'active',
        supersededClaimSha256: CLAIM_SHA256,
        targetPrincipalId: null,
        transferId: 'transfer_1',
        updatedAt: NOW,
      },
    },
    {
      kind: 'protected-claim-override-envelope',
      recordId: 'transfer_1:member_2:1',
      revision: 1,
      value: {
        associatedDataSha256: SHA256,
        ciphertext: 'ciphertext_2',
        claimGeneration: 1,
        createdAt: NOW,
        expiresAt: MEMBERSHIP_REPLAY_EXPIRES,
        keyId: 'key_1',
        memberId: 'member_2',
        nonce: 'nonce_2',
        projectId: 'project_1',
        transferId: 'transfer_1',
      },
    },
    {
      kind: 'manager-responsibility-offer',
      recordId: 'offer_1',
      revision: 1,
      value: {
        acknowledgedAt: null,
        expiresAt: MEMBERSHIP_DAY_EXPIRES,
        idempotencyKey: 'offer_key',
        managerSetGenerationAtOffer: 1,
        offeredAt: NOW,
        offerId: 'offer_1',
        projectId: 'project_1',
        purpose: 'manager-promotion',
        requestFingerprint: SHA256,
        revision: 1,
        sourceManagerMemberId: 'member_1',
        state: 'offered',
        targetMemberId: 'member_2',
        targetMembershipRevisionAtOffer: 1,
        terminalAt: null,
      },
    },
    {
      kind: 'project-membership-recovery',
      recordId: 'create_project_1',
      revision: 1,
      value: {
        expectedMainOid: MAIN,
        expectedPersonalRefOid: MEMBER,
        invitationId: null,
        memberId: 'member_1',
        operationId: 'create_project_1',
        operationKind: 'create-project',
        principalSha256: CLAIM_SHA256,
        projectId: 'project_1',
        publicationMarkerSha256: BATCH_SHA256,
        repositoryPlanSha256: SHA256,
        requestFingerprint: SHA256,
      },
    },
    {
      kind: 'secret-replay-tombstone',
      recordId: 'reissueTransferredMembershipClaim:member_1:expired_claim_key',
      revision: 1,
      value: {
        actorMemberId: 'member_1',
        expiredAt: EXPIRES,
        idempotencyKey: 'expired_claim_key',
        operation: 'reissueTransferredMembershipClaim',
        projectId: 'project_1',
        requestFingerprint: BATCH_SHA256,
      },
    },
  ];
}

describe('Project backup checkpoint format v3', () => {
  it('rejects a wire-6 backup manifest without rewriting recovery evidence', () => {
    const previous = manifest({ protocolVersion: 6 });
    const retained = structuredClone(previous);
    expect(() => decodeCollabProjectBackupCheckpointManifest(previous))
      .toThrow('collab.error.protocol-payload-invalid');
    expect(previous).toEqual(retained);
  });

  it('admits backups at the actual UTF-8 artifact byte limit through every entry point', () => {
    const records = coordinationLimitRecords();
    const encoded = records.map(record => JSON.stringify(record)).join('\n') + '\n';
    const checkpointManifest = manifest();
    checkpointManifest.artifacts[0].byteCount = 268_435_456;

    expect(COLLAB_CHECKPOINT_ARTIFACT_LIMITS.maxCoordinationBytes).toBe(268_435_456);
    expect(Buffer.byteLength(encoded)).toBe(268_435_456);
    expect(encoded.length).toBeLessThan(268_435_456);
    expect(decodeCollabProjectBackupCheckpointCoordinationNdjson(encoded)).toHaveLength(8_125);
    expect(encodeCollabProjectBackupCheckpointCoordinationNdjson(records as any) === encoded).toBe(true);
    expect(validateCollabProjectBackupCheckpointConsistency(
      decodeCollabProjectBackupCheckpointManifest(checkpointManifest),
      records as any,
    )).toHaveLength(8_125);
  }, 30_000);

  it('rejects backups one UTF-8 byte over the artifact limit through every entry point', () => {
    const records = coordinationLimitRecords('x');
    const encoded = records.map(record => JSON.stringify(record)).join('\n') + '\n';
    const error = expect.objectContaining({
      code: 'protocol-payload-invalid',
      safeContext: { field: 'coordination' },
    });

    expect(Buffer.byteLength(encoded)).toBe(268_435_457);
    expect(encoded.length).toBeLessThan(268_435_456);
    expect(() => decodeCollabProjectBackupCheckpointCoordinationNdjson(encoded)).toThrow(error);
    expect(() => encodeCollabProjectBackupCheckpointCoordinationNdjson(records as any)).toThrow(error);
    expect(() => validateCollabProjectBackupCheckpointConsistency(
      decodeCollabProjectBackupCheckpointManifest(manifest()),
      records as any,
    )).toThrow(error);
  }, 30_000);

  it('adds a backup-only coordination format while retaining transfer/export format v1', () => {
    expect(COLLAB_PROJECT_COORDINATION_FORMAT_VERSION).toBe(1);
    expect(COLLAB_PROJECT_BACKUP_COORDINATION_FORMAT_VERSION).toBe(3);
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
      'project-invitation',
      'protected-invitation-envelope',
      'transferred-membership-claim-override',
      'protected-claim-override-envelope',
      'manager-responsibility-offer',
      'membership-idempotency-tombstone',
      'project-membership-recovery',
      'secret-replay-tombstone',
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

  it('round-trips a cancelled Cloud-to-LAN terminal responder with exact target replay', () => {
    const records = canonicalRecords(cancelledCloudToLanContinuityRecords()).map(record => (
      record.kind === 'project'
        ? { ...record, value: { ...record.value, authorityGeneration: 4 } }
        : record
    ));
    const encoded = records.map(record => JSON.stringify(record)).join('\n') + '\n';

    expect(decodeCollabProjectBackupCheckpointCoordinationNdjson(encoded)).toEqual(records);
    expect(encodeCollabProjectBackupCheckpointCoordinationNdjson(records as any)).toBe(encoded);

    const wrongTarget = records.map(record => (
      record.kind === 'terminal-responder-replay'
        ? { ...record, value: { ...record.value, memberId: 'member_2' } }
        : record
    ));
    expect(() => decodeCollabProjectBackupCheckpointCoordinationNdjson(
      wrongTarget.map(record => JSON.stringify(record)).join('\n') + '\n',
    )).toThrow('collab.error.protocol-payload-invalid');

    const terminalStateMismatch = records.map(record => (
      record.kind === 'lifecycle-journal' && record.recordId === 'transfer_1'
        ? { ...record, value: { ...record.value, phase: 'completed', state: 'completed' } }
        : record
    ));
    expect(() => decodeCollabProjectBackupCheckpointCoordinationNdjson(
      terminalStateMismatch.map(record => JSON.stringify(record)).join('\n') + '\n',
    )).toThrow('collab.error.protocol-payload-invalid');
  });

  it('round-trips compacted Manager-responsibility idempotency tombstones', () => {
    const tombstone = {
      kind: 'membership-idempotency-tombstone',
      recordId: 'createManagerResponsibilityOffer:member_1:compacted_offer_key',
      revision: 1,
      value: {
        actorMemberId: 'member_1',
        compactedAt: NOW,
        idempotencyKey: 'compacted_offer_key',
        operation: 'createManagerResponsibilityOffer',
        projectId: 'project_1',
        requestFingerprint: SHA256,
      },
    };
    const records = canonicalRecords([tombstone]);
    const encoded = records.map(record => JSON.stringify(record)).join('\n') + '\n';

    expect(decodeCollabProjectBackupCheckpointCoordinationNdjson(encoded)).toEqual(records);
    expect(validateCollabProjectBackupCheckpointConsistency(
      decodeCollabProjectBackupCheckpointManifest(manifest()),
      records as any,
    )).toEqual(records);

    const futureTombstone = canonicalRecords([{
      ...tombstone,
      value: { ...tombstone.value, compactedAt: EXTENDED },
    }]);
    expect(() => validateCollabProjectBackupCheckpointConsistency(
      decodeCollabProjectBackupCheckpointManifest(manifest()),
      futureTombstone as any,
    )).toThrow('collab.error.protocol-payload-invalid');
  });

  it('rejects a compacted tombstone that coexists with its exact response or offer', () => {
    const transitionValue = {
      createdAt: NOW,
      idempotencyKey: 'decline_key',
      memberId: 'member_2',
      operation: 'declineManagerResponsibility' as const,
      projectId: 'project_1',
      requestFingerprint: SHA256,
      responseJson: JSON.stringify({
        offer: {
          acknowledgedAt: null,
          expiresAt: MEMBERSHIP_DAY_EXPIRES,
          managerSetGenerationAtOffer: 1,
          offeredAt: NOW,
          offerId: 'offer_1',
          purpose: 'manager-promotion',
          revision: 2,
          sourceManagerMemberId: 'member_1',
          state: 'declined',
          targetMemberId: 'member_2',
          targetMembershipRevisionAtOffer: 1,
          terminalAt: NOW,
        },
      }),
    };
    const exactResponse = {
      kind: 'idempotency-result',
      recordId: collabProjectBackupIdempotencyRecordId(transitionValue),
      revision: 1,
      value: transitionValue,
    };
    const transitionTombstone = {
      kind: 'membership-idempotency-tombstone',
      recordId: 'declineManagerResponsibility:member_2:decline_key',
      revision: 1,
      value: {
        actorMemberId: 'member_2',
        compactedAt: NOW,
        idempotencyKey: 'decline_key',
        operation: 'declineManagerResponsibility',
        projectId: 'project_1',
        requestFingerprint: SHA256,
      },
    };
    expect(() => decodeCollabProjectBackupCheckpointCoordinationNdjson(
      canonicalRecords([exactResponse, transitionTombstone])
        .map(record => JSON.stringify(record)).join('\n') + '\n',
    )).toThrow('collab.error.protocol-payload-invalid');

    const liveOffer = membershipV3Records().find(record => (
      record.kind === 'manager-responsibility-offer'
    )) as Record<string, any>;
    const createTombstone = {
      kind: 'membership-idempotency-tombstone',
      recordId: 'createManagerResponsibilityOffer:member_1:offer_key',
      revision: 1,
      value: {
        actorMemberId: 'member_1',
        compactedAt: NOW,
        idempotencyKey: 'offer_key',
        operation: 'createManagerResponsibilityOffer',
        projectId: 'project_1',
        requestFingerprint: SHA256,
      },
    };
    expect(() => decodeCollabProjectBackupCheckpointCoordinationNdjson(
      canonicalRecords([liveOffer, createTombstone])
        .map(record => JSON.stringify(record)).join('\n') + '\n',
    )).toThrow('collab.error.protocol-payload-invalid');
  });

  it('decodes and canonically encodes an exact backup v3 manifest', () => {
    const decoded = decodeCollabProjectBackupCheckpointManifest(manifest());
    expect(decoded).toEqual(manifest());
    expect(encodeCollabProjectBackupCheckpointManifestCanonicalJson(decoded))
      .toBe(JSON.stringify(manifest()));
    expect(encodeCollabProjectBackupCheckpointManifestDigestInput(decoded))
      .toContain('"coordinationFormatVersion":3');
    expect(() => decodeCollabProjectBackupCheckpointManifest({
      ...manifest(),
      coordinationFormatVersion: 1,
    })).toThrow('collab.error.protocol-payload-invalid');
    expect(() => decodeCollabProjectBackupCheckpointManifest({
      ...manifest(),
      coordinationFormatVersion: 2,
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

  it('round-trips membership, live secret envelopes, offers, and recovery continuity', () => {
    const records = canonicalRecords(
      [...activeImportedClaimContinuityRecords(), ...membershipV3Records()],
      unboundImportedBaseRecords(),
    );
    const encoded = records.map(record => JSON.stringify(record)).join('\n') + '\n';
    expect(decodeCollabProjectBackupCheckpointCoordinationNdjson(encoded)).toEqual(records);

    for (const kind of [
      'protected-invitation-envelope',
      'protected-claim-override-envelope',
    ]) {
      const incomplete = records.filter(record => record.kind !== kind);
      expect(() => decodeCollabProjectBackupCheckpointCoordinationNdjson(
        incomplete.map(record => JSON.stringify(record)).join('\n') + '\n',
      )).toThrow('collab.error.protocol-payload-invalid');
    }

    const plaintext = canonicalRecords([
      ...activeImportedClaimContinuityRecords(),
      ...membershipV3Records().map(record => (
        record.kind === 'protected-invitation-envelope'
          ? { ...record, value: { ...record.value, secret: 'plaintext' } }
          : record
      )),
    ], unboundImportedBaseRecords());
    expect(() => decodeCollabProjectBackupCheckpointCoordinationNdjson(
      plaintext.map(record => JSON.stringify(record)).join('\n') + '\n',
    )).toThrow('collab.error.protocol-payload-invalid');
  });

  it('rejects an active claim override without unbound imported-claim continuity', () => {
    expect(lifecycleStateIsExcluded).toBe(true);
    const continuity = activeImportedClaimContinuityRecords();
    const membership = membershipV3Records();
    const bound = canonicalRecords([...continuity, ...membership]);
    const orphaned = canonicalRecords([
      ...continuity,
      ...membership.map((record) => {
        if (
          record.kind !== 'transferred-membership-claim-override'
          && record.kind !== 'protected-claim-override-envelope'
        ) return record;
        return {
          ...record,
          recordId: 'orphan_transfer:member_2:1',
          value: { ...record.value, transferId: 'orphan_transfer' },
        };
      }),
    ], unboundImportedBaseRecords());
    for (const invalid of [bound, orphaned]) {
      expect(() => decodeCollabProjectBackupCheckpointCoordinationNdjson(
        invalid.map(record => JSON.stringify(record)).join('\n') + '\n',
      )).toThrow('collab.error.protocol-payload-invalid');
    }
  });

  it('requires one determinate terminal authority for the highest claim override', () => {
    const continuity = activeImportedClaimContinuityRecords();
    const redeemedWithoutContinuity = canonicalRecords([
      ...continuity,
      ...membershipV3Records().map(record => (
        record.kind === 'transferred-membership-claim-override'
          ? {
              ...record,
              value: {
                ...record.value,
                redemptionReceiptId: 'missing_receipt',
                state: 'redeemed',
                targetPrincipalId: 'principal_2',
              },
            }
          : record
      )),
    ], unboundImportedBaseRecords());
    const highestSuperseded = canonicalRecords([
      ...continuity,
      ...membershipV3Records().map(record => (
        record.kind === 'transferred-membership-claim-override'
          ? { ...record, value: { ...record.value, state: 'superseded' } }
          : record
      )),
    ], unboundImportedBaseRecords());
    for (const invalid of [redeemedWithoutContinuity, highestSuperseded]) {
      expect(() => decodeCollabProjectBackupCheckpointCoordinationNdjson(
        invalid.map(record => JSON.stringify(record)).join('\n') + '\n',
      )).toThrow('collab.error.protocol-payload-invalid');
    }
  });

  it('accepts a redeemed override only with its exact binding and receipt continuity', () => {
    const records = canonicalRecords([
      ...activeImportedClaimContinuityRecords(),
      ...membershipV3Records().map(record => (
        record.kind === 'transferred-membership-claim-override'
          ? {
              ...record,
              value: {
                ...record.value,
                redemptionReceiptId: 'override_redemption_1',
                state: 'redeemed',
                targetPrincipalId: 'principal_2',
              },
            }
          : record
      )),
      overrideRedemptionReceipt(),
    ]);
    const encoded = records.map(record => JSON.stringify(record)).join('\n') + '\n';
    expect(decodeCollabProjectBackupCheckpointCoordinationNdjson(encoded)).toEqual(records);
  });

  it('rejects membership records whose fixed lifetimes drift', () => {
    for (const kind of [
      'project-invitation',
      'transferred-membership-claim-override',
      'manager-responsibility-offer',
    ]) {
      const records = canonicalRecords([
        ...activeImportedClaimContinuityRecords(),
        ...membershipV3Records().map(record => (
          record.kind === kind
            ? { ...record, value: { ...record.value, expiresAt: EXTENDED } }
            : record
        )),
      ], unboundImportedBaseRecords());
      expect(() => decodeCollabProjectBackupCheckpointCoordinationNdjson(
        records.map(record => JSON.stringify(record)).join('\n') + '\n',
      )).toThrow('collab.error.protocol-payload-invalid');
    }
  });

  it('requires completed membership journals to match their authoritative end state', () => {
    const createLifecycle = membershipV3Records().find(record => (
      record.kind === 'lifecycle-journal'
    )) as Record<string, any>;
    const createRecovery = membershipV3Records().find(record => (
      record.kind === 'project-membership-recovery'
    )) as Record<string, any>;
    const removeLifecycle = {
      ...createLifecycle,
      recordId: 'remove_1',
      value: {
        ...createLifecycle.value,
        actorMemberId: 'member_1',
        idempotencyKey: 'remove_key',
        operationId: 'remove_1',
        operationKind: 'remove-member',
      },
    };
    const removeRecovery = {
      ...createRecovery,
      recordId: 'remove_1',
      value: {
        ...createRecovery.value,
        invitationId: null,
        memberId: 'member_2',
        operationId: 'remove_1',
        operationKind: 'remove-member',
        principalSha256: null,
        publicationMarkerSha256: null,
        repositoryPlanSha256: null,
      },
    };
    const activeRemoval = canonicalRecords([removeLifecycle, removeRecovery]);
    expect(() => decodeCollabProjectBackupCheckpointCoordinationNdjson(
      activeRemoval.map(record => JSON.stringify(record)).join('\n') + '\n',
    )).toThrow('collab.error.protocol-payload-invalid');

    const joinLifecycle = {
      ...createLifecycle,
      recordId: 'join_1',
      value: {
        ...createLifecycle.value,
        idempotencyKey: 'join_key',
        operationId: 'join_1',
        operationKind: 'join-project',
      },
    };
    const joinRecovery = {
      ...createRecovery,
      recordId: 'join_1',
      value: {
        ...createRecovery.value,
        invitationId: 'invitation_1',
        memberId: 'member_2',
        operationId: 'join_1',
        operationKind: 'join-project',
        publicationMarkerSha256: null,
        repositoryPlanSha256: null,
      },
    };
    const activeInvitationJoin = canonicalRecords([
      joinLifecycle,
      joinRecovery,
      ...membershipV3Records().filter(record => (
        record.kind === 'project-invitation'
        || record.kind === 'protected-invitation-envelope'
      )).map(record => (
        record.kind === 'project-invitation'
          ? { ...record, value: { ...record.value, state: 'active', terminalAt: null } }
          : record
      )),
    ]);
    expect(() => decodeCollabProjectBackupCheckpointCoordinationNdjson(
      activeInvitationJoin.map(record => JSON.stringify(record)).join('\n') + '\n',
    )).toThrow('collab.error.protocol-payload-invalid');

    const unsettledCreation = canonicalRecords([
      {
        ...createLifecycle,
        value: {
          ...createLifecycle.value,
          phase: 'activated',
          state: 'active',
        },
      },
      createRecovery,
    ]);
    expect(() => decodeCollabProjectBackupCheckpointCoordinationNdjson(
      unsettledCreation.map(record => JSON.stringify(record)).join('\n') + '\n',
    )).toThrow('collab.error.protocol-payload-invalid');
  });

  it('binds secret replay identities and tombstones to the exact retention deadline', () => {
    const membership = membershipV3Records();
    const invitation = membership.find(record => (
      record.kind === 'project-invitation'
    )) as Record<string, any>;
    const duplicateInvitation = {
      ...invitation,
      recordId: 'invitation_2',
      value: {
        ...invitation.value,
        invitationId: 'invitation_2',
        secretSha256: BATCH_SHA256,
      },
    };
    const invitationEnvelope = membership.find(record => (
      record.kind === 'protected-invitation-envelope'
    )) as Record<string, any>;
    const duplicateInvitationEnvelope = {
      ...invitationEnvelope,
      recordId: 'invitation_2',
      value: { ...invitationEnvelope.value, invitationId: 'invitation_2' },
    };
    const duplicateIssuance = canonicalRecords([
      invitation,
      invitationEnvelope,
      duplicateInvitation,
      duplicateInvitationEnvelope,
    ]);
    expect(() => decodeCollabProjectBackupCheckpointCoordinationNdjson(
      duplicateIssuance.map(record => JSON.stringify(record)).join('\n') + '\n',
    )).toThrow('collab.error.protocol-payload-invalid');

    const prematureInvitationTombstone = canonicalRecords([
      invitation,
      {
        kind: 'secret-replay-tombstone',
        recordId: 'createProjectInvitation:member_1:invitation_key',
        revision: 1,
        value: {
          actorMemberId: 'member_1',
          expiredAt: NOW,
          idempotencyKey: 'invitation_key',
          operation: 'createProjectInvitation',
          projectId: 'project_1',
          requestFingerprint: SHA256,
        },
      },
    ]);
    expect(() => decodeCollabProjectBackupCheckpointCoordinationNdjson(
      prematureInvitationTombstone.map(record => JSON.stringify(record)).join('\n') + '\n',
    )).toThrow('collab.error.protocol-payload-invalid');

    const override = membership.find(record => (
      record.kind === 'transferred-membership-claim-override'
    )) as Record<string, any>;
    const firstOverride = {
      ...override,
      value: { ...override.value, state: 'superseded' },
    };
    const duplicateOverride = {
      ...override,
      recordId: 'transfer_1:member_2:2',
      value: {
        ...override.value,
        claimGeneration: 2,
        claimSha256: SHA256,
        state: 'active',
        supersededClaimSha256: BATCH_SHA256,
      },
    };
    const overrideEnvelope = membership.find(record => (
      record.kind === 'protected-claim-override-envelope'
    )) as Record<string, any>;
    const duplicateOverrideEnvelope = {
      ...overrideEnvelope,
      recordId: 'transfer_1:member_2:2',
      value: { ...overrideEnvelope.value, claimGeneration: 2 },
    };
    const duplicateOverrideIdentity = canonicalRecords([
      ...activeImportedClaimContinuityRecords(),
      firstOverride,
      duplicateOverride,
      overrideEnvelope,
      duplicateOverrideEnvelope,
    ], unboundImportedBaseRecords());
    expect(() => decodeCollabProjectBackupCheckpointCoordinationNdjson(
      duplicateOverrideIdentity.map(record => JSON.stringify(record)).join('\n') + '\n',
    )).toThrow('collab.error.protocol-payload-invalid');

    const prematureOverrideTombstone = canonicalRecords([
      ...activeImportedClaimContinuityRecords(),
      override,
      {
        kind: 'secret-replay-tombstone',
        recordId: 'reissueTransferredMembershipClaim:member_1:claim_override_key',
        revision: 1,
        value: {
          actorMemberId: 'member_1',
          expiredAt: NOW,
          idempotencyKey: 'claim_override_key',
          operation: 'reissueTransferredMembershipClaim',
          projectId: 'project_1',
          requestFingerprint: SHA256,
        },
      },
    ], unboundImportedBaseRecords());
    expect(() => decodeCollabProjectBackupCheckpointCoordinationNdjson(
      prematureOverrideTombstone.map(record => JSON.stringify(record)).join('\n') + '\n',
    )).toThrow('collab.error.protocol-payload-invalid');
  });

  it('selects live secret envelopes or tombstones at the backup capture boundary', () => {
    const membership = membershipV3Records();
    const invitation = membership.find(record => (
      record.kind === 'project-invitation'
    )) as Record<string, any>;
    const invitationEnvelope = membership.find(record => (
      record.kind === 'protected-invitation-envelope'
    )) as Record<string, any>;
    const invitationTombstone = {
      kind: 'secret-replay-tombstone',
      recordId: 'createProjectInvitation:member_1:invitation_key',
      revision: 1,
      value: {
        actorMemberId: 'member_1',
        expiredAt: MEMBERSHIP_REPLAY_EXPIRES,
        idempotencyKey: 'invitation_key',
        operation: 'createProjectInvitation',
        projectId: 'project_1',
        requestFingerprint: SHA256,
      },
    };
    const predeadlineTombstone = decodeCollabProjectBackupCheckpointCoordinationNdjson(
      canonicalRecords([invitation, invitationTombstone])
        .map(record => JSON.stringify(record)).join('\n') + '\n',
    );
    expect(() => validateCollabProjectBackupCheckpointConsistency(
      decodeCollabProjectBackupCheckpointManifest(manifest()),
      predeadlineTombstone,
    )).toThrow('collab.error.protocol-payload-invalid');
    const postdeadlineEnvelope = decodeCollabProjectBackupCheckpointCoordinationNdjson(
      canonicalRecords([invitation, invitationEnvelope])
        .map(record => JSON.stringify(record)).join('\n') + '\n',
    );
    expect(() => validateCollabProjectBackupCheckpointConsistency(
      decodeCollabProjectBackupCheckpointManifest(manifest({ createdAt: EXTENDED })),
      postdeadlineEnvelope,
    )).toThrow('collab.error.protocol-payload-invalid');

    const override = membership.find(record => (
      record.kind === 'transferred-membership-claim-override'
    )) as Record<string, any>;
    const overrideEnvelope = membership.find(record => (
      record.kind === 'protected-claim-override-envelope'
    )) as Record<string, any>;
    const overrideTombstone = {
      kind: 'secret-replay-tombstone',
      recordId: 'reissueTransferredMembershipClaim:member_1:claim_override_key',
      revision: 1,
      value: {
        actorMemberId: 'member_1',
        expiredAt: MEMBERSHIP_REPLAY_EXPIRES,
        idempotencyKey: 'claim_override_key',
        operation: 'reissueTransferredMembershipClaim',
        projectId: 'project_1',
        requestFingerprint: SHA256,
      },
    };
    const overrideBase = activeImportedClaimContinuityRecords();
    const predeadlineOverrideTombstone = decodeCollabProjectBackupCheckpointCoordinationNdjson(
      canonicalRecords(
        [...overrideBase, override, overrideTombstone],
        unboundImportedBaseRecords(),
      ).map(record => JSON.stringify(record)).join('\n') + '\n',
    );
    expect(() => validateCollabProjectBackupCheckpointConsistency(
      decodeCollabProjectBackupCheckpointManifest(manifest()),
      predeadlineOverrideTombstone,
    )).toThrow('collab.error.protocol-payload-invalid');
    const postdeadlineOverrideEnvelope = decodeCollabProjectBackupCheckpointCoordinationNdjson(
      canonicalRecords(
        [...overrideBase, override, overrideEnvelope],
        unboundImportedBaseRecords(),
      ).map(record => JSON.stringify(record)).join('\n') + '\n',
    );
    expect(() => validateCollabProjectBackupCheckpointConsistency(
      decodeCollabProjectBackupCheckpointManifest(manifest({ createdAt: EXTENDED })),
      postdeadlineOverrideEnvelope,
    )).toThrow('collab.error.protocol-payload-invalid');

    const futureOrphanTombstone = decodeCollabProjectBackupCheckpointCoordinationNdjson(
      canonicalRecords(membership.filter(record => (
        record.kind === 'secret-replay-tombstone'
      ))).map(record => JSON.stringify(record)).join('\n') + '\n',
    );
    expect(() => validateCollabProjectBackupCheckpointConsistency(
      decodeCollabProjectBackupCheckpointManifest(manifest()),
      futureOrphanTombstone,
    )).toThrow('collab.error.protocol-payload-invalid');
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

  it('retains one additional Cloud source proof verifier after Cloud-to-LAN relinquishment', () => {
    const sourceProofVerifier = {
      kind: 'transfer-receipt-key',
      recordId: 'transfer_1:receipt_key_cloud_source',
      revision: 1,
      value: {
        createdAt: LATER,
        projectId: 'project_1',
        receiptKeyId: 'receipt_key_cloud_source',
        receiptPublicKey: Buffer.alloc(32, 7).toString('base64url'),
        receiptPublicKeyEncoding: 'base64url-raw',
        signatureAlgorithm: 'ed25519',
        transferId: 'transfer_1',
      },
    };
    const records = canonicalRecords([
      ...continuityRecords(),
      sourceProofVerifier,
    ]);
    const encoded = records.map(record => JSON.stringify(record)).join('\n') + '\n';

    expect(decodeCollabProjectBackupCheckpointCoordinationNdjson(encoded))
      .toEqual(records);

    const thirdVerifier = {
      ...sourceProofVerifier,
      recordId: 'transfer_1:receipt_key_unreferenced',
      value: {
        ...sourceProofVerifier.value,
        receiptKeyId: 'receipt_key_unreferenced',
        receiptPublicKey: Buffer.alloc(32, 9).toString('base64url'),
      },
    };
    for (const invalidRecords of [
      canonicalRecords([...records, thirdVerifier]),
      canonicalRecords([...lanToCloudContinuityRecords(), sourceProofVerifier]),
    ]) {
      expect(() => decodeCollabProjectBackupCheckpointCoordinationNdjson(
        invalidRecords.map(record => JSON.stringify(record)).join('\n') + '\n',
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

  it('preserves the distinct v1 and v3 principal syntax at their public seams', () => {
    const records = canonicalRecords().map(record => (
      record.kind === 'principal-binding' && record.recordId === 'member_1'
        ? { ...record, value: { ...record.value, principalId: 'oidc:user.example:com' } }
        : record
    ));
    const encoded = records.map(record => JSON.stringify(record)).join('\n') + '\n';
    const decoded = decodeCollabProjectBackupCheckpointCoordinationNdjson(encoded);

    expect(encodeCollabProjectBackupCheckpointCoordinationNdjson(decoded)).toBe(encoded);
    expect(validateCollabProjectBackupCheckpointConsistency(
      decodeCollabProjectBackupCheckpointManifest(manifest()),
      decoded,
    )).toBe(decoded);
    expect(() => decodeCollabProjectCheckpointCoordinationNdjson(encoded, 'backup'))
      .toThrow(expect.objectContaining({
        code: 'protocol-payload-invalid',
        safeContext: { field: 'principalId' },
      }));
  });

  it('reports a missing base binding principal as non-canonical coordination', () => {
    const records = canonicalRecords().map(record => {
      if (record.kind !== 'principal-binding' || record.recordId !== 'member_1') return record;
      const value = { ...record.value };
      delete value.principalId;
      return { ...record, value };
    });
    const encoded = records.map(record => JSON.stringify(record)).join('\n') + '\n';

    expect(() => decodeCollabProjectBackupCheckpointCoordinationNdjson(encoded))
      .toThrow(expect.objectContaining({
        code: 'protocol-payload-invalid',
        safeContext: { field: 'coordination' },
      }));
  });

  it('validates base fields and canonical order before deferred principal fields', () => {
    const invalidPrincipal = canonicalRecords().map(record => (
      record.kind === 'principal-binding' && record.recordId === 'member_1'
        ? { ...record, value: { ...record.value, principalId: null } }
        : record
    ));
    const invalidProject = invalidPrincipal.map(record => (
      record.kind === 'principal-binding' && record.recordId === 'member_1'
        ? { ...record, value: { ...record.value, projectId: -1 } }
        : record
    ));
    const missingLaterTimestamp = invalidPrincipal.map(record => {
      if (record.kind !== 'principal-binding' || record.recordId !== 'member_2') return record;
      const value = { ...record.value };
      delete value.boundAt;
      return { ...record, value };
    });
    const nonCanonicalBinding = invalidPrincipal.map(record => (
      record.kind === 'principal-binding' && record.recordId === 'member_1'
        ? {
            ...record,
            value: {
              projectId: 'project_1',
              principalId: null,
              memberId: 'member_1',
              boundAt: NOW,
            },
          }
        : record
    ));

    for (const [records, field] of [
      [invalidProject, 'projectId'],
      [missingLaterTimestamp, 'value'],
      [nonCanonicalBinding, 'coordination'],
    ] as const) {
      const encoded = records.map(record => JSON.stringify(record)).join('\n') + '\n';
      expect(() => decodeCollabProjectBackupCheckpointCoordinationNdjson(encoded))
        .toThrow(expect.objectContaining({
          code: 'protocol-payload-invalid',
          safeContext: { field },
        }));
    }
  });

  it('validates preceding continuity fields before terminal principal fields', () => {
    const records = canonicalRecords(acknowledgedCloudToLanContinuityRecords()).map(record => {
      if (record.kind === 'lifecycle-journal') {
        const value = { ...record.value };
        delete value.actorMemberId;
        return { ...record, value };
      }
      if (record.kind === 'terminal-responder') {
        return {
          ...record,
          value: {
            ...record.value,
            acknowledgements: [{ acknowledgedAt: ACKNOWLEDGED, memberId: 'member_1' }],
          },
        };
      }
      return record;
    });
    const encoded = records.map(record => JSON.stringify(record)).join('\n') + '\n';

    expect(() => decodeCollabProjectBackupCheckpointCoordinationNdjson(encoded))
      .toThrow(expect.objectContaining({
        code: 'protocol-payload-invalid',
        safeContext: { field: 'value' },
      }));
  });

  it('preserves decoder acceptance and consistency rejection for distinct terminal principals', () => {
    const principalId = 'oidc:user.example:com';
    const records = canonicalRecords(continuityRecords()).map(record => {
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
    const encoded = records.map(record => JSON.stringify(record)).join('\n') + '\n';
    const decoded = decodeCollabProjectBackupCheckpointCoordinationNdjson(encoded);

    expect(decoded).toEqual(records);
    expect(encodeCollabProjectBackupCheckpointCoordinationNdjson(decoded)).toBe(encoded);
    expect(() => validateCollabProjectBackupCheckpointConsistency(
      decodeCollabProjectBackupCheckpointManifest(manifest()),
      decoded,
    )).toThrow(expect.objectContaining({
      code: 'protocol-payload-invalid',
      safeContext: { field: 'records' },
    }));
    const terminal = decoded.find(record => record.kind === 'terminal-responder');
    expect(Object.isFrozen(terminal?.value.acknowledgements)).toBe(false);
    expect(Object.isFrozen(terminal?.value.eligibleMemberIds)).toBe(true);
  });

  it('reports base-record errors before continuity errors and preserves canonical-byte rejection', () => {
    const records = canonicalRecords(continuityRecords()).map(record => {
      if (record.kind === 'principal-binding' && record.recordId === 'member_1') {
        return { ...record, value: { ...record.value, boundAt: 'invalid' } };
      }
      if (record.kind === 'lifecycle-journal') {
        return { ...record, value: { ...record.value, createdAt: 'invalid' } };
      }
      return record;
    });
    const encoded = records.map(record => JSON.stringify(record)).join('\n') + '\n';
    expect(() => decodeCollabProjectBackupCheckpointCoordinationNdjson(encoded))
      .toThrow(expect.objectContaining({
        code: 'protocol-payload-invalid',
        safeContext: { field: 'boundAt' },
      }));
    expect(() => decodeCollabProjectBackupCheckpointCoordinationNdjson(` ${encoded}`))
      .toThrow(expect.objectContaining({
        code: 'protocol-payload-invalid',
        safeContext: { field: 'coordination' },
      }));
  });
});
