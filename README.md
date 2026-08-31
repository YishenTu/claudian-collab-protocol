# @claudian-collab/protocol

The canonical shared Collab wire and offline backup contract, produced from the
[claudian-collab-protocol](https://github.com/YishenTu/claudian-collab-protocol) repository. Both Claudian
(LAN client and Host) and Claudian Cloud Server consume this package; neither
may maintain copied types, operation registries, codec maps, shared constants,
or compatibility rules.

## Contents

- Opaque Collab ID types (`CollabProjectId`, `CollabMemberId`, `CollabGitOid`, …)
- Transport-neutral request and response DTOs
- Executable request/response codecs with decoder-defined compatibility behavior
- The canonical operation registry (`CollabControlOperationMap`,
  `COLLAB_CONTROL_OPERATION_CODECS`, `collabControlOperationCodec`)
- Safe public error codes and sanitized error context (`CollabError`,
  `COLLAB_ERROR_CODES`, `sanitizeCollabDiagnosticContext`)
- Shared Git ref semantics (`COLLAB_MAIN_REF`, `COLLAB_MEMBER_REF_PREFIX`,
  `collabMemberRef`)
- Shared limits that client and server must agree on (`COLLAB_LIMITS`)
- Protocol-version negotiation (`COLLAB_PROTOCOL_VERSION`, envelope decoding)
- Canonical Project checkpoint profiles, logical records, authority-generation transfer, exact membership claims, target-signed redemption receipts, offline backup operational continuity, and Project retirement contracts
- Cloud binding v3 route construction/matching, bounded checkpoint streams, capability negotiation, strict success/error envelopes, private-development bootstrap, Project snapshot, and redacted event contracts
- Markdown-derived Ticket-reference and Member-mention semantics shared by
  client rendering and authority derivation

The package owns the declarative Cloud HTTP/WebSocket/Git binding contract, but no transport runtime, request dispatch, trust policy, authentication, authorization, persistence, Git execution, or client-local recovery. It contains no LAN Host admission, invitation trust, mDNS/TLS/discovery, or Host-transfer transport; no Obsidian, Vault, UI, Agent, provider, SQL, or filesystem behavior; and no `IngressPrincipal` or other deployment-ingress contracts.

The current registry contains the decision-complete, transport-neutral request, Ticket, metadata, Accept, Project authority-transfer, transferred-membership claim, and Project retirement operations. Detail DTOs embed the first
page of their comments and accepted relations; `listRequestComments`,
`listTicketComments`, and `listTicketAcceptedRelations` page the remainder
with stable opaque cursors, and producers bound pages by the shared count and
UTF-8 byte limits. Producers size embedded first pages against the measured
fixed part of the detail so the whole detail stays within
`detailMaxUtf8Bytes`, including JSON escaping. JSON adapters accept the shared
`maxJsonPayloadUtf8Bytes` cap so every valid bounded request, page, and detail
has one compatible final-serialization limit. Request comments and Ticket
accepted relations also have shared authority-enforced total limits; summary
counts let complete consumers reject partial or cross-snapshot assembly.
Cloud binding v3 retains the authority-neutral Project snapshot, nine redacted durable event kinds plus `snapshot.required`, eighteen capability tokens, the exact ordinary Project/Git route catalog, bounded authority-transfer artifact routes, and six private-development bootstrap bindings. Wire v7 adds the required logical Project generation, state-consistent imported-claim generation, and complete reissued-claim transfer identity to the existing Cloud Project-membership read contracts. The shared checkpoint container is exactly `checkpoint.json`, `coordination.ndjson`, and `repository.bundle`; authority-transfer and export use wire-visible coordination format v1, and offline backup uses format v3. Backup v3 adds Project invitations, protected invitation and transferred-claim override envelopes, manager-responsibility offers, membership recovery journals, secret-replay tombstones, and compacted Manager-responsibility idempotency tombstones to the existing continuity records. Portable profiles exclude engine storage, paths, credentials, tokens, private keys, and operational refs, and backups exclude plaintext invitation secrets, raw claims, and private keys. Domain-separated canonical UTF-8 inputs define protected-claim AEAD associated data and bind every declared field of transferred-membership redemption receipts and authority-relinquishment proofs before consumer-owned Ed25519 signing or verification. Existing LAN v9 Join, invitation, endpoint, membership lifecycle, Host-transfer, snapshot, event, and HTTP bindings remain independently application-owned; the dedicated LAN authority-transfer transport binds these shared payloads without creating another shared operation registry.

Backup coordination artifacts are limited to 256 MiB of actual UTF-8 bytes, including the final newline. The decoder, encoder, and consistency checker apply this same inclusive limit without rewriting principals into an intermediate format. Valid current-format artifacts at the limit are accepted; an additional byte is rejected.

## Usage

```ts
import {
  COLLAB_PROTOCOL_VERSION,
  COLLAB_CONTROL_OPERATION_CODECS,
  CollabError,
} from '@claudian-collab/protocol';

const codec = COLLAB_CONTROL_OPERATION_CODECS.ensureMyRequest;
const decoded = codec.decodeRequest(rawBody);
if (decoded.status !== 'ok') {
  // decoded.error is a safe CollabError: no credentials, paths, or internals.
}
```

Only the package root (`.`) is a supported import. Subpath imports are not
part of the public surface.

## Versioning

Package SemVer, canonical wire version, and Cloud binding version are independent concepts.

- **Package version** (this `package.json`): `4.0.0`. Behavior-preserving implementation refactors and reviewed compatible defect corrections may use a patch release when public declarations, runtime exports, and accepted wire/binding semantics remain unchanged. Minor releases may add backward-compatible API. Removing or incompatibly changing an existing declaration, export, runtime behavior, codec, error, limit, ref rule, operation, or compatibility rule requires a major release. Package API SemVer is classified independently from the wire and Cloud binding contracts, but a compatible package addition cannot exempt a changed wire contract from a wire-version increase or a changed Cloud binding contract from a binding-version increase. The package version never signals wire compatibility by itself.
- **Wire version** (`COLLAB_PROTOCOL_VERSION`): currently `7`. The supported range is exactly `[7, 7]`. This is independent from Cloud binding version `3` and the existing application LAN control version `9`. Any change to an existing envelope, DTO, operation payload shape, or operation definition requires a new wire-protocol version. This includes additive operations: every wire-contract change increases the canonical wire version.
- **Cloud binding version** (`COLLAB_CLOUD_BINDING_VERSION`): currently `3`. It versions Cloud routes, bounded transfer streams, and capabilities independently from package and wire versions. Every Cloud binding-contract change increases this version. Bindings before v3 and wire versions before v7 are unsupported rather than translated or dual-interpreted.

### Compatibility behavior

- Envelope decoders reject unknown fields (`protocol-payload-invalid`).
  Operation request and response compatibility is
  decoder-defined and pinned by package fixtures; decoded DTOs are reconstructed
  rather than retaining unrecognized input properties.
- An unsupported `protocolVersion` decodes to `unsupported-version` with the
  received and supported versions in safe context.
- Unknown operation kinds have no codec and fail at registry lookup.
- Unknown Cloud capability tokens are accepted and ignored by older consumers; unknown document fields, route operations, discriminants, schema versions, binding versions, and wire versions fail closed.
- `CollabError.safeContext` is sanitized: credential-like keys are redacted
  and filesystem paths are replaced with `[PATH]`.

Compatibility is tested with executable fixtures in this package
(`tests/`), and cross-repository contract fixtures pin client and server to
the same behavior.

The compatibility snapshot also fingerprints implementation tokens. Those fingerprints detect edits but cannot establish whether behavior changed. A reviewed implementation-only refactor or approved compatible defect correction uses `compatibility-review.json`, generated with `npm run check:compatibility -- --base <base-sha> --record-implementation-only-review "<reviewed reason>"` after updating the generated snapshot and characterizing the public seams. The reason distinguishes preserved behavior from any approved correction and its executable evidence. The record binds the exact base and candidate snapshots; the classifier independently rejects any changed public declaration, export, or wire/binding semantic fact. Missing or stale evidence cannot authorize an implementation change, and the record never applies to another version or later edit merely because an earlier change was accepted. This review requirement is general, not a prelaunch or one-release compatibility exception, and it is not an automated proof of behavioral equivalence.

## Development

```bash
npm run build        # compile src/ -> dist/ (CommonJS + declarations)
npm test             # package unit tests
npm run check:compatibility
npm run release:candidate # build and verify the reviewed release artifact
npm run verify:pack  # smoke-test that exact artifact in a clean consumer
```

`dist/` is generated output and is never committed. The packed artifact is
reproducible from source: `npm pack` rebuilds via `prepack`.
The full verification gate constructs one release candidate and uses those same reviewed tarball bytes for clean-consumer smoke tests and publication.
