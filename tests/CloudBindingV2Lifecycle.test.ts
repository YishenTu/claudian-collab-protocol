import {
  COLLAB_CHECKPOINT_ARTIFACT_LIMITS,
  COLLAB_CLOUD_BINDING_LIMITS,
  COLLAB_CLOUD_BINDING_VERSION,
  COLLAB_CLOUD_CAPABILITIES,
  COLLAB_CLOUD_CAPABILITY_DOCUMENT_SCHEMA_VERSION,
  COLLAB_CLOUD_JSON_OPERATIONS,
  COLLAB_PROTOCOL_VERSION,
  collabCloudAuthorityTransferArtifactRoute,
  collabCloudCapabilityDocument,
  collabCloudProjectCheckpointExportArtifactRoute,
  collabCloudProjectOperationRoute,
  decodeCollabCloudCapabilityDocument,
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
    protocolVersions: [5],
    schemaVersion: 2,
    ...overrides,
  };
}

describe('Cloud binding v2 lifecycle integration', () => {
  it('publishes wire v5, binding v2, lifecycle capabilities, and hard stream limits', () => {
    expect(COLLAB_PROTOCOL_VERSION).toBe(5);
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

  it('constructs export-scoped upload and download routes for every checkpoint artifact', () => {
    for (const direction of ['upload', 'download'] as const) {
      for (const artifact of [
        'checkpoint.json',
        'coordination.ndjson',
        'repository.bundle',
      ] as const) {
        const route = collabCloudProjectCheckpointExportArtifactRoute(
          'project_1',
          'export_1',
          direction,
          artifact,
        );
        expect(route.target).toBe(
          `/v2/projects/project_1/checkpoint-exports/export_1/checkpoint/${artifact}`,
        );
        expect(route.method).toBe(direction === 'upload' ? 'PUT' : 'GET');
        expect(matchCollabCloudRoute(route.method, route.target)).toEqual(route.match);
      }
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
