# Shared contract constraints

- Cloud has no deployed legacy backup baseline. Retain only the current backup decoder; do not infer migration requirements or compatibility exceptions from old fixtures or the inert compatibility-stage export.
- Checkpoint families may share private validation, but must retain their own principal and continuity rules. Never fabricate principals or rewrite a declared format version to pass an artifact through another public decoder.
- Cloud-to-LAN cancellation requires target-signed cleanup confirmation bound to the exact transfer and staged facts. A Manager request, timeout, disconnect, or absent target cannot prove cleanup or authorize source reopening.
- A Cloud-to-LAN backup may retain the target evidence-pinned receipt key and one Cloud source verifier pinned before relinquishment. After relinquishment, restore must cryptographically identify the sole proof-verifying key. Pre-fence cancellation removes only the source verifier before `target-cleaned`, preserving the target evidence key.
