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
- `3.3.1`, canonical wire v6, and Cloud binding v2 are the current published baseline. The reviewed `3.3.2` patch candidate changes only compatibility tooling and documentation; public declarations, runtime behavior, wire v6, Cloud binding v2, and authority-transfer/export coordination format v1 remain unchanged.
- `CollabProjectCheckpoint` owns wire-visible authority-transfer/export coordination format v1. `CollabProjectBackupCheckpoint` owns offline backup coordination. Cloud has no deployed legacy backup population; keep only the current backup format and do not add prior decoders or pre-production compatibility exceptions. Future contract changes follow the normal package, wire, and binding classification policy.
- Use a patch release for compatible defect corrections that preserve the accepted public declarations and wire/binding semantics, a minor release for backward-compatible public additions, and a major release only for an accepted breaking public change. Classify the semantic contract change before editing any version or compatibility snapshot.
- Every wire-contract change requires a canonical wire-version increase, and every Cloud-binding contract change requires a Cloud binding-version increase. The classifier has no pre-production or one-release exceptions. Package-only repository, documentation, CI, or release metadata changes do not change wire or binding versions.
- The published 3.3 public API includes `COLLAB_PROJECT_BACKUP_COMPATIBILITY_STAGE`. It is inert immutable SemVer metadata: no classifier, codec, or decoder reads it, and it authorizes no backup replacement or version exception. Preserve it only until an explicitly approved package major can remove it; do not add another compatibility-stage marker.
- Any future package major or minor increase, canonical wire-version increase, or Cloud binding-version increase requires explicit user approval before version files, snapshots, release manifests, tags, or releases are changed. Do not auto-bump a version merely to satisfy a conservative classifier.
- Unknown compatibility classifications fail closed. If the executable classifier disagrees with an accepted patch classification, update the governing policy and classifier with tests; never bypass or hand-edit around the snapshot gate.
- Envelope decoders reject unknown fields and unsupported versions. Operation compatibility remains decoder-defined and pinned by independent fixtures.

## Release

- `release-manifest.json` identifies the exact reviewed package version, metadata, file inventory, and tarball SHA-256. Release CI publishes that verified tarball path and never silently repacks different bytes.
- Releases originate from a reviewed tag in this public repository on a GitHub-hosted runner with npm provenance. Never commit, print, or store credentials in repository files or `.context`.
- Consumers pin exact published versions. Never republish or overwrite an existing version; a defective release requires an explicitly approved successor version.
- Do not publish a protocol release when only Claudian or Cloud Server implementation changed. A compatible protocol correction uses the next `3.3.x` version unless the user explicitly approves a different release line.
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
