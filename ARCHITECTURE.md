# Collaboration contract boundaries

This repository owns shared types, codecs, canonical signing inputs, compatibility evidence, and the published package. [Claudian](https://github.com/YishenTu/claudian) owns client workflows and LAN transport; [Cloud Server](https://github.com/YishenTu/claudian-cloud-server) owns Cloud authorization, persistence, and execution. A decoded payload is structurally valid input, not authenticated authority.

## Current contract

| Identity | Current value | Source |
| --- | --- | --- |
| Package | 5.1.0 | [package.json](package.json) |
| Canonical wire | 15 | [CollabConstants.ts](src/core/CollabConstants.ts) |
| Cloud binding | 10 | [CollabCloudBinding.ts](src/cloud/CollabCloudBinding.ts) |

These identities advance independently under the policy in [AGENTS.md](AGENTS.md). LAN's deployed transport version is client-owned. Consumers pin an exact registry release and negotiate Cloud capabilities; a package version or a LAN connection alone does not establish Cloud compatibility.

## Membership and recovery

[Membership operations](src/operations/CollabProjectMembership.ts) distinguish direct Manager promotion from responsibility succession. `promoteManager` carries the target Member and expected revisions; the authority applies the role change without target acknowledgement. Responsibility offers and acknowledgements remain available for the separate final-Manager Leave workflow. Consumers enforce authorization and preservation of at least one active Manager.

[Project recovery](src/operations/CollabProjectRecovery.ts) restores an existing Member through retained credential proof. Invitations admit new Members; recovery links do not. Each issuance intent creates an independent single-use link with a 15-minute validity window. Exact issuance and redemption retries retain their own results, including a successful redemption receipt after link expiry. Checkpoints retain bounded historical credential verifiers; consumers must not discard those verifiers to make a transfer fit.

The original credential belongs in the authenticated recovery request body, never in logs, URLs, or a verifier digest used as a bearer token. Link encoding, clipboard presentation, target connectivity, and durable local convergence remain client responsibilities.

## Hosting movement

[Authority-transfer contracts](src/operations/CollabAuthorityTransfer.ts) describe distinct source and target authority generations, preparation, approval, checkpoint custody, relinquishment, activation, cancellation, and claims. They do not implement a network connection or a state machine on behalf of consumers.

For Cloud-to-LAN, the receiving Member registers its preparation with Cloud. A Manager approves that exact target, and the receiving client can discover approval through Project events or reconciliation and download over an outbound connection. No descriptor or completion-string exchange is required by this flow. The client owns continuation after a closed modal or process restart. Subsequent LAN reachability still requires a shared network or suitable tunnel; this package defines no Cloud relay for LAN traffic.

Before relinquishment, cancellation requires exact target invalidation and cleanup evidence. After the durable relinquishment fence, recovery is forward-only. Source status and retained successor lookup support one-hop discovery without making the old authority writable. A recovery link from the current authority is the client fallback when a source is unreachable or a Member missed multiple moves. Discovery does not bypass expiry, identity proof, or generation checks.

Protocol 5.1.0 adds optional `hostActivationProofs` to LAN-to-Cloud begin requests. Each signed `CollabLanHostActivationProof` identifies a committed physical Host handoff within the exact Project and authority generation. The codec bounds and validates the proof data and defines its canonical signing input. Cloud verifies cryptographic signatures, chain continuity, and the final current Host binding against retained predecessor evidence. This lets a successor LAN Host return a Project to Cloud without the original device; an offer or pre-fence TLS transition alone is insufficient. Physical LAN Host handoff transport remains client-owned and is not a Cloud operation.

## Events and artifacts

Cloud events carry Project sequence and typed invalidations, including membership and hosting changes. Consumers own WebSocket lifecycle, reconnect backoff, snapshot reconciliation, scoped UI refreshes, and missed-event recovery. The protocol does not prescribe a second polling loop alongside a healthy WebSocket.

[Transfer checkpoints](src/checkpoints/CollabProjectCheckpoint.ts) and [backup checkpoints](src/checkpoints/CollabProjectBackupCheckpoint.ts) have separate profiles and validation rules. They preserve the required Member, Git, claim, proof, and terminal replay facts without containing participant working copies, private Vault state, or raw private keys. Backup custody requires the external deployment keyring; an artifact alone does not authorize restoration or source reopening.

## Verification and publication

Use the commands in [README.md](README.md#development). `release-manifest.json` fixes the exact reviewed tarball; compatibility snapshots describe the public contract rather than runtime authorization. Both consumer repositories verify their installed exact dependency separately.

This architecture guide is repository documentation and is outside the package's `files` inventory. Editing it does not replace published package bytes or require a protocol version increase. README changes do alter the package artifact; use a successor release rather than rewriting the manifest of an already published version.
