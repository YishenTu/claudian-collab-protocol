# Claudian Collab Protocol

## Ownership and dependencies

- This repository is the sole source, compatibility, test, build, package, and release authority for `@claudian-collab/protocol`. Claudian and Claudian Cloud Server consume exact registry versions; do not copy or recreate the shared contract in either consumer.
- Shared payloads and declarative Cloud bindings belong here. LAN bindings, authentication, authorization, trusted ingress, application state, transport execution, persistence, Git execution, UI, and coding-agent runtimes remain consumer-owned.
- `src/index.ts` is the only public entry point. Do not add deep exports or parallel definitions of shared contracts.
- Runtime code must remain platform-neutral: no Node, browser, Obsidian, provider, application, SQL, filesystem, or transport-adapter APIs. `@lezer/markdown` is the sole accepted runtime dependency for canonical Markdown masking; record an accepted architecture decision before adding another.

## Compatibility decisions

- Package SemVer, canonical wire version, and Cloud binding version are independent authorities. Claudian's LAN protocol version is consumer-owned.
- Classify the semantic change before editing versions or generated compatibility evidence. Compatible defects use patch releases, backward-compatible public additions use minor releases, and accepted breaking public changes use major releases.
- Every wire-contract change requires a wire-version increase; every Cloud-binding contract change requires a binding-version increase, including additive changes. Documentation, CI, and release metadata alone do not change these versions.
- Package major or minor increases, wire-version increases, and Cloud binding-version increases require explicit user approval before changing version files, snapshots, release manifests, tags, or releases. Never auto-bump to satisfy a conservative classifier.
- Unknown compatibility classifications fail closed. When the classifier disagrees with an accepted semantic classification, correct its policy and executable tests rather than bypassing or hand-editing the snapshot gate. Exact compatibility-review requirements belong in [scripts/AGENTS.md](scripts/AGENTS.md).
- `COLLAB_PROJECT_BACKUP_COMPATIBILITY_STAGE` is inert public API metadata. It authorizes no decoder or version-policy exceptions; preserve it until an explicitly approved package major removes it, and do not add another such marker.

## Release integrity

- `release-manifest.json` fixes the reviewed package metadata, file inventory, and tarball digest. Candidate construction owns one packed artifact; clean-consumer verification and publication use those exact bytes without rebuilding or repacking. Standalone `npm pack` retains its `prepack` build guarantee.
- Releases originate from reviewed tags in this public repository on GitHub-hosted runners with npm provenance. Publication independently checks compatibility against the preceding main-reachable reviewed release.
- Never overwrite a published version. A defective release requires an explicitly approved successor. Do not release this package for changes confined to a consumer.
- Keep package contents auditable and free of sensitive data. Never store or print credentials in repository files or `.context/`; generated `dist/` and tarballs are not committed.

## Development and verification

- Use the toolchain pinned by `.node-version` and `package.json`. Run `npm run verify`; report any release-artifact mismatch separately from source or contract failures rather than refreshing release evidence to hide it.
- Production behavior and compatibility-classification changes use TDD at the owning public seam. Documentation and non-behavioral mechanical changes are exempt. Expected codec results come from specification literals and accepted fixtures, not a copy of the implementation algorithm.
- Write code, comments, identifiers, commit messages, and repository documents in English. Keep Markdown soft-wrapped.
- Interfaces do not use an `I` prefix. Treat acronyms as words in owned symbols. Name TypeScript files after their primary export in `PascalCase.ts`; tests mirror the target with `.test.ts`.
- Put local research, handoffs, sanitized traces, and temporary scripts in `.context/`. It is never a production or release dependency.

## Instruction maintenance

- Read the root-to-scope instruction chain before edits. Keep only current constraints that materially change decisions; use Git history for retired decisions. Place local constraints in the narrowest scope and avoid duplicating inherited guidance.
- Every `AGENTS.md` has a sibling `CLAUDE.md` containing exactly `@AGENTS.md`.
