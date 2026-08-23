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
- From `1.0.0`, changing or removing an existing public declaration, export, runtime behavior baseline, codec, error, limit, ref rule, operation, or compatibility rule requires a package major release. Backward-compatible additions require at least a minor release.
- Wire-visible breaking changes also require a canonical wire-version increase. Cloud-binding breaking changes also require a Cloud binding-version increase. Package-only repository, documentation, CI, or release metadata changes do not change wire or binding versions.
- Unknown compatibility classifications fail closed. Update the governing policy and executable classifier intentionally; never bypass or hand-edit around the snapshot gate.
- Envelope decoders reject unknown fields and unsupported versions. Operation compatibility remains decoder-defined and pinned by independent fixtures.

## Release

- `release-manifest.json` identifies the exact reviewed package version, metadata, file inventory, and tarball SHA-256. Release CI publishes that verified tarball path and never silently repacks different bytes.
- Releases originate from a reviewed tag in this public repository on a GitHub-hosted runner with npm provenance. Never commit, print, or store credentials in repository files or `.context`.
- Consumers pin exact published versions. Never republish or overwrite an existing version; a defective release requires an explicitly approved successor version.
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
