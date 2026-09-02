# Claudian Collab Protocol

## Ownership

- This repository is the sole source, compatibility, test, build, package, and release authority for `@claudian-collab/protocol`.
- It owns opaque Collab IDs, transport-neutral DTOs, executable codecs, the canonical operation registry, Cloud binding routes/capabilities/bootstrap/snapshot/events, shared safe errors and limits, Git ref semantics, parsers, and independent package/wire/binding compatibility policy.
- Claudian and Claudian Cloud Server are exact-version registry consumers. Do not copy or re-declare package source, operation registries, codecs, compatibility rules, or editable fixtures in a consumer.
- LAN bindings, authentication, trusted ingress, application state, repositories, SQL, Git execution, UI, and agent runtimes remain consumer-owned.

## Dependency boundary

- `src/index.ts` is the only public entry point; `package.json` exposes only `.`. Do not add deep exports.
- Runtime dependencies are limited to `@lezer/markdown`, which supports canonical Markdown masking. Record an accepted architecture decision here before adding another runtime dependency.
- Runtime code must remain platform-neutral and must not import Node, browser, Obsidian, provider, Claudian application, Cloud Server, SQL, filesystem, or transport-adapter APIs.
- There is one source of truth for every exported type, codec, operation, error, limit, ref rule, parser, version, and compatibility rule.

## Compatibility

- Package SemVer, canonical wire version, and Cloud binding version are independent authorities. Claudian's LAN protocol version is independently consumer-owned.
- The current source contract is `4.1.3`, canonical wire v8, Cloud binding v4, authority-transfer/export coordination format v1, and offline-backup coordination format v3. Source readiness does not establish registry publication; consumers wait for verified release evidence.
- `CollabProjectCheckpoint` owns wire-visible authority-transfer/export coordination format v1. `CollabProjectBackupCheckpoint` owns offline backup coordination. Cloud has no deployed legacy backup population; keep only the current backup format and do not add prior decoders or pre-production compatibility exceptions. Future contract changes follow the normal package, wire, and binding classification policy.
- Checkpoint families share private parsed-record and manifest-field validation below their public entry points. Keep format-specific principal and continuity rules explicit; never adapt one format by fabricating principals or rewriting its declared version through another public decoder. Backup coordination admission measures the actual UTF-8 artifact, including its final newline, against the inclusive 256 MiB cap; encoding and consistency checking use the same admission boundary.
- Use a patch release for compatible defect corrections that preserve the accepted public declarations and wire/binding semantics, a minor release for backward-compatible public additions, and a major release only for an accepted breaking public change. Classify the semantic contract change before editing any version or compatibility snapshot.
- Every wire-contract change requires a canonical wire-version increase, and every Cloud-binding contract change requires a Cloud binding-version increase. The classifier has no pre-production or one-release exceptions. Package-only repository, documentation, CI, or release metadata changes do not change wire or binding versions.
- The published 3.3 public API includes `COLLAB_PROJECT_BACKUP_COMPATIBILITY_STAGE`. It is inert immutable SemVer metadata: no classifier, codec, or decoder reads it, and it authorizes no backup replacement or version exception. Preserve it only until an explicitly approved package major can remove it; do not add another compatibility-stage marker.
- Any future package major or minor increase, canonical wire-version increase, or Cloud binding-version increase requires explicit user approval before version files, snapshots, release manifests, tags, or releases are changed. Do not auto-bump a version merely to satisfy a conservative classifier.
- Unknown compatibility classifications fail closed. If the executable classifier disagrees with an accepted patch classification, update the governing policy and classifier with tests; never bypass or hand-edit around the snapshot gate.
- Implementation-token digests detect edits, not semantic incompatibility. A behavior-preserving refactor or explicitly approved compatible implementation defect correction may retain package, wire, and binding contracts only through an explicitly reviewed `compatibility-review.json` bound to the exact base and candidate snapshots. The classifier must independently require unchanged public declarations, runtime exports, and wire/binding semantic facts; the review can account only for implementation-digest changes. An approved versioned authority-transfer operation addition uses the same exact review file with `versioned-operation-addition` kind: the classifier must prove additive wire and Cloud inventories, unchanged existing declaration members and decoder cases, no unrelated source changes, only operation-reachable new declarations and exports, and the exact version-prefix migration before the review may classify the package addition as minor. Either review reason must cite public-seam evidence. Generate the record through the compatibility command after characterization, and reject missing, stale, malformed, regenerated-with-drift, or broader claims. This is a general semantic-review boundary, never a package-version or prelaunch exception or an automated proof of behavioral equivalence.
- Envelope decoders reject unknown fields and unsupported versions. Operation compatibility remains decoder-defined and pinned by independent fixtures.
- Cloud-to-LAN cancellation uses one target-to-Cloud confirmation whose canonical signed payload binds the exact target, transfer, generations, staged facts, and cleanup result. A Manager cancellation request alone, timeout, disconnect, or target absence never proves cleanup or permits source reopen.
- A Cloud-to-LAN backup may retain exactly two transfer verification keys from checkpoint capture through the pre-cleanup cancellation phases: the target evidence-pinned receipt key and one Cloud source verifier pinned before the source can relinquish. After relinquishment, clean restore cryptographically identifies the sole key that verifies the proof. Cancellation cleanup removes only the pre-fence source verifier before entering `target-cleaned` and preserves the target evidence key.

## Release

- `release-manifest.json` identifies the exact reviewed package version, metadata, file inventory, and tarball SHA-256. Release CI publishes that verified tarball path and never silently repacks different bytes.
- Release-candidate construction owns the single packed artifact and inventory check. Clean-consumer verification uses those exact reviewed bytes without rebuilding or repacking; standalone `npm pack` retains its `prepack` build guarantee.
- Releases originate from a reviewed tag in this public repository on a GitHub-hosted runner with npm provenance. The publishing job independently checks the tagged contract against the preceding main-reachable reviewed version tag before publishing. Never commit, print, or store credentials in repository files or `.context`.
- Consumers pin exact published versions. Never republish or overwrite an existing version; a defective release requires an explicitly approved successor version.
- Do not publish a protocol release when only Claudian or Cloud Server implementation changed. A compatible protocol correction uses the next `4.1.x` version unless the user explicitly approves a different release line.
- Keep package contents sensitive-data free and auditable. `dist/` and tarballs are generated artifacts, not committed source.

## Development

- Use Node 24 and the pinned npm version. The full local gate is `npm run verify`.
- Production behavior and compatibility-classification changes use TDD: establish a failing test at the owning public seam, implement the minimum behavior, then refactor under green tests.
- Expected codec results come from specification literals and accepted fixtures, never by reproducing the production algorithm in assertions.
- Write code, comments, identifiers, commit messages, and repository documents in English. Keep Markdown soft-wrapped.
- Interfaces do not use an `I` prefix. Treat acronyms as words in owned symbols. Name TypeScript files after their primary export in `PascalCase.ts`; tests mirror the target with `.test.ts`.
- Put non-committed research, handoffs, sanitized traces, and temporary scripts in `.context/`. It is never a production or release dependency.

## Instruction maintenance

- Keep this file limited to current constraints that materially change implementation, review, or verification behavior. Use Git history for retired decisions.
- `CLAUDE.md` must contain exactly `@AGENTS.md`.
