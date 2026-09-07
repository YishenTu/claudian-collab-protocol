# Compatibility and release tooling

## Review boundary

- Implementation-token digests detect edits, not semantic incompatibility. An implementation-only review may account for those digests only when public declarations, runtime exports, and wire/binding semantic facts remain unchanged. It is not automated proof of behavioral equivalence.
- Generate `compatibility-review.json` through `npm run check:compatibility` after updating the generated snapshot and characterizing the affected public seams. Bind the exact base and candidate snapshots and cite that evidence in the reason. Reject missing, stale, malformed, or broader claims; a previous review never authorizes later drift.
- Use `--record-implementation-only-review` for behavior-preserving refactors or explicitly approved compatible implementation defects, `--record-versioned-operation-addition-review` for supported additive authority-transfer or Request/Ticket operations, and `--record-optional-contract-addition-review` for supported optional Cloud contract additions. Each takes a review reason and an explicit `--base <commit-sha>`. These records cannot waive the root version policy.
- A `module-relocation` review binds an explicit one-to-one move map and exact snapshots. The command must compare all source files after resolving only corresponding module specifiers, preserve declaration and import binding meaning and evaluation order, and verify complete wire/binding coverage. It may not waive implementation or contract changes. Generate it with `--record-module-relocation-review` and `--module-moves <json-file>`.

## Classifier constraints

- A versioned operation review must prove additive wire and Cloud inventories, unchanged existing declarations and decoder behavior, and the exact version-prefix migration. New declarations, imports, and exports must be reachable from the new operation; unrelated source changes fail closed.
- Reachability must preserve existing binding identities, including globals. New declarations or imports cannot capture existing references. Request/Ticket additions preserve the existing operation union, safe reasons, request and response dispatch, and existing switch clause sequence; new returning cases are admitted only as a leading prefix of one operation switch.
- Optional Cloud additions preserve existing member and parameter declarations, return types, exports, operation inventories, limits, and other semantic facts. Only optional fields and trailing parameters qualify, with both wire and binding increases and exact snapshot identities.
- Optional-addition source review permits only the route-prefix/version migration, changed additive declarations, and explicitly named existing public codec implementations in `CollabCloudBinding` whose declarations reach the changed contract. Route and version owners cannot be exempted through `--implementation-declarations`. The evidence must establish that existing inputs retain their meaning; unrelated modules, new declarations, required fields, and changed existing signatures fail closed.

## Artifact verification

- The package includes README bytes. A documentation change can invalidate the frozen release artifact without changing any contract; do not treat the artifact mismatch as evidence of a wire or API break.
- Release-candidate and clean-consumer checks must agree on the exact artifact path and inventory. Preserve registry-integrity verification when updating package layout or release tooling.
