import {
  COLLAB_CLOUD_BINDING_LIMITS,
  COLLAB_CLOUD_BINDING_VERSION,
  COLLAB_CLOUD_CAPABILITIES,
  COLLAB_CLOUD_CAPABILITY_DOCUMENT_SCHEMA_VERSION,
  COLLAB_CLOUD_JSON_OPERATIONS,
  COLLAB_CONTROL_OPERATION_CODECS,
  COLLAB_PROTOCOL_VERSION,
  collabCloudCapabilitiesRoute,
  collabCloudCapabilityDocument,
  collabCloudCapabilitySupported,
  collabCloudErrorEnvelope,
  collabCloudGitRoute,
  collabCloudProjectEventsRoute,
  collabCloudProjectOperationRoute,
  collabCloudSuccessEnvelope,
  collabDevelopmentBootstrapRoute,
  CollabError,
  decodeCollabCloudCapabilityDocument,
  decodeCollabCloudErrorEnvelope,
  decodeCollabCloudSuccessEnvelope,
  matchCollabCloudRoute,
} from '../src/index';

const PROJECT_ID = 'project_1';

function capabilityDocument(overrides: Record<string, unknown> = {}) {
  return {
    bindingVersions: [4],
    capabilities: [...COLLAB_CLOUD_CAPABILITIES],
    limits: {
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
    },
    protocolVersions: [8],
    schemaVersion: 2,
    ...overrides,
  };
}

describe('Cloud binding v4', () => {
  it('admits only binding 4 with wire 8', () => {
    const current = capabilityDocument({ bindingVersions: [4], protocolVersions: [8] });
    expect(decodeCollabCloudCapabilityDocument(current)).toEqual(current);
    expect(() => decodeCollabCloudCapabilityDocument({ ...current, bindingVersions: [3] }))
      .toThrow('collab.error.protocol-version-unsupported');
    expect(() => decodeCollabCloudCapabilityDocument({ ...current, protocolVersions: [7] }))
      .toThrow('collab.error.protocol-version-unsupported');
  });

  it.each([
    ['POST', '/v3/projects/project_1/operations/getProjectSnapshot'],
    ['GET', '/v3/projects/project_1/events?afterSequence=0'],
    ['GET', '/v3/projects/project_1/repository.git/info/refs?service=git-upload-pack'],
    ['POST', '/v3/projects/project_1/repository.git/git-receive-pack'],
    ['GET', '/v3/projects/project_1/authority-transfers/transfer_1/checkpoint/checkpoint.json'],
    ['GET', '/v3/projects/project_1/checkpoint-exports/export_1/checkpoint/coordination.ndjson'],
    ['POST', '/v3/development/bootstrap/attempts'],
  ])('does not route a previous-binding request: %s %s', (method, target) => {
    expect(matchCollabCloudRoute(method, target)).toBeNull();
  });

  it('keeps package, canonical wire, Cloud binding, and LAN binding independent', () => {
    expect(COLLAB_PROTOCOL_VERSION).toBe(8);
    expect(COLLAB_CLOUD_BINDING_VERSION).toBe(4);
    expect(COLLAB_CLOUD_CAPABILITY_DOCUMENT_SCHEMA_VERSION).toBe(2);
    expect(Object.keys(COLLAB_CONTROL_OPERATION_CODECS)).toHaveLength(52);
    expect(COLLAB_CLOUD_JSON_OPERATIONS).toEqual([
      'getProjectSnapshot',
      ...Object.keys(COLLAB_CONTROL_OPERATION_CODECS),
    ]);
  });

  it('constructs and matches the exact package-owned route catalog', () => {
    const routes = [
      collabCloudCapabilitiesRoute(),
      collabCloudProjectOperationRoute(PROJECT_ID, 'getProjectSnapshot'),
      collabCloudProjectEventsRoute(PROJECT_ID, 42),
      collabCloudGitRoute(PROJECT_ID, 'info-refs', 'git-upload-pack'),
      collabCloudGitRoute(PROJECT_ID, 'git-upload-pack'),
      collabCloudGitRoute(PROJECT_ID, 'git-receive-pack'),
      collabDevelopmentBootstrapRoute('beginDevelopmentBootstrap'),
      collabDevelopmentBootstrapRoute('submitDevelopmentBootstrapReport', 'attempt_1'),
      collabDevelopmentBootstrapRoute('getDevelopmentBootstrap', 'attempt_1'),
      collabDevelopmentBootstrapRoute('activateDevelopmentBootstrap', 'attempt_1'),
      collabDevelopmentBootstrapRoute('cancelDevelopmentBootstrap', 'attempt_1'),
      collabDevelopmentBootstrapRoute('putDevelopmentBootstrapGitBundle', 'attempt_1'),
    ];

    expect(routes.map(route => `${route.method} ${route.target}`)).toEqual([
      'GET /collab/capabilities',
      'POST /v4/projects/project_1/operations/getProjectSnapshot',
      'GET /v4/projects/project_1/events?afterSequence=42',
      'GET /v4/projects/project_1/repository.git/info/refs?service=git-upload-pack',
      'POST /v4/projects/project_1/repository.git/git-upload-pack',
      'POST /v4/projects/project_1/repository.git/git-receive-pack',
      'POST /v4/development/bootstrap/attempts',
      'POST /v4/development/bootstrap/attempts/attempt_1/reports',
      'GET /v4/development/bootstrap/attempts/attempt_1',
      'POST /v4/development/bootstrap/attempts/attempt_1/activate',
      'POST /v4/development/bootstrap/attempts/attempt_1/cancel',
      'PUT /v4/development/bootstrap/attempts/attempt_1/git-bundle',
    ]);
    for (const route of routes) {
      expect(matchCollabCloudRoute(route.method, route.target)).toEqual(route.match);
    }
  });

  it('rejects unknown operations, non-canonical targets, and malformed identifiers', () => {
    expect(matchCollabCloudRoute(
      'POST',
      '/v4/projects/project_1/operations/futureOperation',
    )).toBeNull();
    expect(matchCollabCloudRoute(
      'GET',
      '/v4/projects/project_1/events?afterSequence=1&afterSequence=2',
    )).toBeNull();
    expect(matchCollabCloudRoute(
      'GET',
      '/v4/projects/project_1/repository.git/info/refs?service=git-archive',
    )).toBeNull();
    expect(matchCollabCloudRoute(
      'POST',
      '/v4//projects/project_1/operations/getProjectSnapshot',
    )).toBeNull();
    expect(matchCollabCloudRoute(
      'POST',
      '/v4/projects/project_1/operations/getProjectSnapshot/',
    )).toBeNull();
    expect(matchCollabCloudRoute('GET', '/collab/capabilities?')).toBeNull();
    expect(() => collabCloudProjectOperationRoute('../escape', 'getProjectSnapshot'))
      .toThrow('Invalid Collab Cloud route input');
  });

  it('decodes an exact compatible capability document and tolerates unknown tokens', () => {
    const capabilities = [...COLLAB_CLOUD_CAPABILITIES, 'future-read-plane']
      .sort((left, right) => left.localeCompare(right, 'en-US'));
    const decoded = decodeCollabCloudCapabilityDocument(capabilityDocument({ capabilities }));

    expect(decoded.capabilities).toEqual(capabilities);
    expect(collabCloudCapabilitySupported(decoded, 'project-snapshot')).toBe(true);
    expect(collabCloudCapabilitySupported(decoded, 'tickets')).toBe(true);
    expect(collabCloudCapabilitySupported(decoded, 'cloud-project-membership')).toBe(true);
    expect(COLLAB_CLOUD_BINDING_LIMITS.maxEventReplay).toBe(500);
  });

  it('constructs the exact package-owned capability schema for server advertisement', () => {
    expect(collabCloudCapabilityDocument(
      [...COLLAB_CLOUD_CAPABILITIES],
      capabilityDocument().limits,
    )).toEqual(capabilityDocument());
  });

  it.each([
    capabilityDocument({ futureField: true }),
    capabilityDocument({ schemaVersion: 3 }),
    capabilityDocument({ bindingVersions: [1] }),
    capabilityDocument({ bindingVersions: [3, 4] }),
    capabilityDocument({ protocolVersions: [7] }),
    capabilityDocument({ protocolVersions: [7, 8] }),
    capabilityDocument({ capabilities: ['tickets', 'accept'] }),
    capabilityDocument({ capabilities: ['accept', 'accept'] }),
    capabilityDocument({ limits: { maxJsonPayloadUtf8Bytes: 512 * 1024 } }),
  ])('rejects a strict or incompatible capability document %#', (input) => {
    expect(() => decodeCollabCloudCapabilityDocument(input))
      .toThrow(CollabError);
  });

  it('round-trips strict success and safe error envelopes', () => {
    const success = collabCloudSuccessEnvelope('request_1', { ok: true });
    expect(decodeCollabCloudSuccessEnvelope(success)).toEqual(success);

    const error = collabCloudErrorEnvelope('request_1', new CollabError({
      code: 'authority-not-synchronized',
      recoveryActions: ['retry'],
      safeContext: { projectId: PROJECT_ID },
    }));
    expect(decodeCollabCloudErrorEnvelope(error)).toEqual(error);

    expect(() => decodeCollabCloudSuccessEnvelope({ ...success, extra: true }))
      .toThrow('collab.error.protocol-payload-invalid');
    expect(() => decodeCollabCloudErrorEnvelope({
      ...error,
      error: { ...error.error, credential: 'secret' },
    })).toThrow('collab.error.protocol-payload-invalid');
  });
});
