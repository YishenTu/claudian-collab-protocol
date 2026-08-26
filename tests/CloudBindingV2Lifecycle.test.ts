import {
  COLLAB_CHECKPOINT_ARTIFACT_LIMITS,
  COLLAB_CLOUD_BINDING_LIMITS,
  COLLAB_CLOUD_BINDING_VERSION,
  COLLAB_CLOUD_CAPABILITIES,
  COLLAB_CLOUD_CAPABILITY_DOCUMENT_SCHEMA_VERSION,
  COLLAB_CLOUD_JSON_OPERATIONS,
  COLLAB_PROJECT_CHECKPOINT_ARTIFACTS,
  COLLAB_PROTOCOL_VERSION,
  collabCloudAuthorityTransferArtifactRoute,
  collabCloudCapabilityDocument,
  collabCloudProjectCheckpointExportArtifactRoute,
  collabCloudProjectCheckpointExportRoute,
  collabCloudProjectOperationRoute,
  decodeCollabCloudCapabilityDocument,
  decodeCollabCloudProjectCheckpointExportStatus,
  matchCollabCloudRoute,
} from '../src/index';

function limits() {
  return {
    maxCheckpointCoordinationBytes: 256 * 1024 * 1024,
    maxCheckpointManifestUtf8Bytes: 64 * 1024,
    maxCheckpointRepositoryBundleBytes: 1024 * 1024 * 1024,
    maxCheckpointStagingBytes: 2 * 1024 * 1024 * 1024,
    maxDevelopmentBootstrapGitBundleBytes: 1024 * 1024 * 1024,
    maxDevelopmentBootstrapManifestUtf8Bytes: 64 * 1024,
    maxDevelopmentBootstrapReportUtf8Bytes: 64 * 1024,
    maxEventReplay: 500,
    maxGitReceivePackBytes: 256 * 1024 * 1024,
    maxJsonPayloadUtf8Bytes: 512 * 1024,
    maxRepositoryBytes: 1024 * 1024 * 1024,
  };
}

function capabilities(overrides: Record<string, unknown> = {}) {
  return {
    bindingVersions: [2],
    capabilities: [...COLLAB_CLOUD_CAPABILITIES],
    limits: limits(),
    protocolVersions: [6],
    schemaVersion: 2,
    ...overrides,
  };
}

describe('Cloud binding v2 lifecycle integration', () => {
  it('publishes wire v6, binding v2, lifecycle capabilities, and hard stream limits', () => {
    expect(COLLAB_PROTOCOL_VERSION).toBe(6);
    expect(COLLAB_CLOUD_BINDING_VERSION).toBe(2);
    expect(COLLAB_CLOUD_CAPABILITY_DOCUMENT_SCHEMA_VERSION).toBe(2);
    expect(COLLAB_CLOUD_CAPABILITIES).toEqual([
      'accept',
      'authority-transfer',
      'development-bootstrap',
      'git-receive-pack-personal-ref',
      'git-upload-pack',
      'project-checkpoint-export',
      'project-events',
      'project-retirement',
      'project-snapshot',
      'requests',
      'tickets',
    ]);
    expect(COLLAB_CLOUD_JSON_OPERATIONS).toEqual(expect.arrayContaining([
      'requestLanToCloudTransfer',
      'beginCloudToLanTransfer',
      'retireProject',
    ]));
    expect(COLLAB_CLOUD_BINDING_LIMITS.maxCheckpointCoordinationBytes)
      .toBe(COLLAB_CHECKPOINT_ARTIFACT_LIMITS.maxCoordinationBytes);
    expect(COLLAB_CLOUD_BINDING_LIMITS.maxCheckpointRepositoryBundleBytes)
      .toBe(COLLAB_CHECKPOINT_ARTIFACT_LIMITS.maxRepositoryBundleBytes);
  });

  it('constructs and matches bounded upload and download artifact routes', () => {
    const upload = collabCloudAuthorityTransferArtifactRoute(
      'project_1',
      'transfer_1',
      'upload',
      'repository.bundle',
    );
    const download = collabCloudAuthorityTransferArtifactRoute(
      'project_1',
      'transfer_1',
      'download',
      'coordination.ndjson',
    );
    expect(upload).toEqual({
      match: {
        artifact: 'repository.bundle',
        direction: 'upload',
        kind: 'authority-transfer-artifact',
        projectId: 'project_1',
        transferId: 'transfer_1',
      },
      method: 'PUT',
      target: '/v2/projects/project_1/authority-transfers/transfer_1/checkpoint/repository.bundle',
    });
    expect(download.method).toBe('GET');
    expect(matchCollabCloudRoute(upload.method, upload.target)).toEqual(upload.match);
    expect(matchCollabCloudRoute(download.method, download.target)).toEqual(download.match);
    expect(matchCollabCloudRoute(
      'PUT',
      '/v2/projects/project_1/authority-transfers/transfer_1/checkpoint/future.bin',
    )).toBeNull();
  });

  it('creates and queries one idempotent export session before downloading artifacts', () => {
    const begin = collabCloudProjectCheckpointExportRoute('project_1', 'export_1', 'begin');
    const statusRoute = collabCloudProjectCheckpointExportRoute(
      'project_1',
      'export_1',
      'status',
    );
    expect(begin.method).toBe('POST');
    expect(statusRoute.method).toBe('GET');
    expect(begin.target).toBe('/v2/projects/project_1/checkpoint-exports/export_1');
    expect(matchCollabCloudRoute(begin.method, begin.target)).toEqual(begin.match);
    expect(matchCollabCloudRoute(statusRoute.method, statusRoute.target))
      .toEqual(statusRoute.match);

    const status = {
      checkpointSha256: 'a'.repeat(64),
      createdAt: '2026-08-25T00:00:00.000Z',
      expiresAt: '2026-08-26T00:00:00.000Z',
      exportId: 'export_1',
      projectId: 'project_1',
      state: 'ready',
    };
    expect(decodeCollabCloudProjectCheckpointExportStatus(status)).toEqual(status);
    expect(decodeCollabCloudProjectCheckpointExportStatus({
      ...status,
      checkpointSha256: null,
      state: 'preparing',
    })).toEqual({ ...status, checkpointSha256: null, state: 'preparing' });
    for (const invalidStatus of [
      { ...status, checkpointSha256: null },
      { ...status, checkpointSha256: 'a'.repeat(64), state: 'preparing' },
      { ...status, expiresAt: status.createdAt },
      { ...status, futureField: true },
    ]) {
      expect(() => decodeCollabCloudProjectCheckpointExportStatus(invalidStatus))
        .toThrow('collab.error.protocol-payload-invalid');
    }

    for (const artifact of COLLAB_PROJECT_CHECKPOINT_ARTIFACTS) {
      const route = collabCloudProjectCheckpointExportArtifactRoute(
        'project_1',
        'export_1',
        artifact,
      );
      expect(route.target).toBe(
        `/v2/projects/project_1/checkpoint-exports/export_1/checkpoint/${artifact}`,
      );
      expect(route.method).toBe('GET');
      expect(matchCollabCloudRoute(route.method, route.target)).toEqual(route.match);
      expect(matchCollabCloudRoute('PUT', route.target)).toBeNull();
    }
  });

  it('moves ordinary operation routes to v2 and rejects the former binding path', () => {
    const route = collabCloudProjectOperationRoute('project_1', 'retireProject');
    expect(route.target).toBe('/v2/projects/project_1/operations/retireProject');
    expect(matchCollabCloudRoute(route.method, route.target)).toEqual(route.match);
    expect(matchCollabCloudRoute(
      'POST',
      '/v1/projects/project_1/operations/getProjectSnapshot',
    )).toBeNull();
  });

  it('rejects noncanonical origin, dot-segment, and encoded route aliases', () => {
    for (const [method, target] of [
      ['GET', '//evil.invalid/v2/projects/project_1/checkpoint-exports/export_1'],
      ['GET', '/v2/projects/project_1/x/../checkpoint-exports/export_1'],
      [
        'GET',
        '/v2/projects/project_1/x/%2e%2e/checkpoint-exports/export_1/checkpoint/checkpoint.json',
      ],
      [
        'PUT',
        '/v2/projects/project_1/x/../authority-transfers/transfer_1/checkpoint/repository.bundle',
      ],
    ]) {
      expect(matchCollabCloudRoute(method, target)).toBeNull();
    }
  });

  it('round-trips the exact v2 capability document and fails closed on v1/v4', () => {
    expect(decodeCollabCloudCapabilityDocument(capabilities())).toEqual(capabilities());
    expect(collabCloudCapabilityDocument([...COLLAB_CLOUD_CAPABILITIES], limits()))
      .toEqual(capabilities());
    expect(() => decodeCollabCloudCapabilityDocument(capabilities({
      bindingVersions: [1],
      protocolVersions: [4],
    }))).toThrow('collab.error.protocol-version-unsupported');
  });
});
