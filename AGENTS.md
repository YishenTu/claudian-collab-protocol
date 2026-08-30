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
- `3.3.0`, canonical wire v6, and Cloud binding v2 are the current published baseline. The approved corrective release is exactly `3.3.1`: it adds only the backup-v3 Manager-responsibility idempotency tombstone required for terminal-offer compaction. Wire v6, Cloud binding v2, and authority-transfer/export coordination format v1 remain unchanged.
- `CollabProjectCheckpoint` owns wire-visible authority-transfer/export coordination format v1 and remains byte-for-byte unchanged in `3.3.1`. `CollabProjectBackupCheckpoint` owns offline backup coordination. Until the first production deployment is explicitly declared, an explicitly approved backup-format replacement may use a package minor release without a wire or Cloud-binding increase only when the executable classifier proves the v1 module unchanged and every unrelated public change satisfies its normal classification. The replacement removes the prior decoder and fixtures rather than retaining a legacy path. The explicitly approved `3.3.1` patch exception is limited by an executable exact-source proof to the missing backup-v3 compaction tombstone; later backup changes return to the normal classification policy. At first production launch, replace these bounded pre-production exceptions with a stable backup compatibility obligation before any later backup-format change.
- Use a patch release for compatible defect corrections that preserve the accepted public declarations and wire/binding semantics, a minor release for backward-compatible public additions, and a major release only for an accepted breaking public change. Classify the semantic contract change before editing any version or compatibility snapshot.
- Wire-visible breaking changes also require a canonical wire-version increase. Cloud-binding breaking changes also require a Cloud binding-version increase. Package-only repository, documentation, CI, or release metadata changes do not change wire or binding versions.
- Any future package major or minor increase, canonical wire-version increase, or Cloud binding-version increase requires explicit user approval before version files, snapshots, release manifests, tags, or releases are changed. Do not auto-bump a version merely to satisfy a conservative classifier.
- Unknown compatibility classifications fail closed. If the executable classifier disagrees with an accepted patch classification, update the governing policy and classifier with tests; never bypass or hand-edit around the snapshot gate.
- Envelope decoders reject unknown fields and unsupported versions. Operation compatibility remains decoder-defined and pinned by independent fixtures.

## Release

- `release-manifest.json` identifies the exact reviewed package version, metadata, file inventory, and tarball SHA-256. Release CI publishes that verified tarball path and never silently repacks different bytes.
- Releases originate from a reviewed tag in this public repository on a GitHub-hosted runner with npm provenance. Never commit, print, or store credentials in repository files or `.context`.
- Consumers pin exact published versions. Never republish or overwrite an existing version; a defective release requires an explicitly approved successor version.
- Do not publish a protocol release when only Claudian or Cloud Server implementation changed. After the approved `3.3.1` release, a compatible protocol correction uses the next `3.3.x` version unless the user explicitly approves a different release line.
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
