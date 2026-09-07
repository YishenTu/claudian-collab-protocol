# @claudian-collab/protocol

Shared collaboration contracts for [Claudian](https://github.com/YishenTu/claudian) and [Claudian Cloud Server](https://github.com/YishenTu/claudian-cloud-server).

This package defines the data and compatibility rules that clients and authorities agree on:

- Project membership, Requests, Tickets, authority transfer, and retirement operations, with TypeScript types and executable codecs.
- Cloud routes, capabilities, envelopes, snapshots, and events.
- Project checkpoint and backup formats, shared limits, safe errors, and Git ref rules.
- Markdown Ticket references and Member mentions.

Authentication, authorization, transport execution, storage, and coding-agent behavior belong to the applications that use these contracts. LAN bindings are maintained by Claudian.

## Install

```bash
npm install --save-exact @claudian-collab/protocol
```

Both consumers pin an exact published version. This repository owns the shared source, tests, compatibility policy, and release; consumers do not maintain copies.

## Usage

```ts
import { collabControlOperationCodec } from '@claudian-collab/protocol';

const codec = collabControlOperationCodec('resolveTicketNumber');
const decoded = codec.decodeRequest({
  projectId: 'project_1',
  ticketNumber: 42,
});
// { status: 'ok', value: { projectId: 'project_1', ticketNumber: 42 } }
```

Import from the package root only. CommonJS, ESM, and TypeScript declarations are included; subpath imports are unsupported.

## Compatibility

Package SemVer, the canonical wire version, and the Cloud binding version are independent. Package version alone does not establish protocol compatibility. Every wire-contract change increases the wire version; every Cloud-binding change increases the binding version, including additive changes.

Envelope decoders reject unknown fields and unsupported versions. Operation payload compatibility is defined by its codec and tested with independent fixtures. Unknown Cloud capability tokens are accepted and ignored by consumers that do not support them.

## Development

Use the Node version in [.node-version](.node-version) and the npm version in [package.json](package.json).

```bash
npm ci
npm run verify
```

The full gate runs lint, type checking, a CommonJS/ESM build, tests, compatibility checks, and clean-consumer verification of one exact release tarball. For individual checks, use `npm run build`, `npm test`, or `npm run check:compatibility -- --base <commit-sha>`.

[release-manifest.json](release-manifest.json) records the reviewed tarball. The release gate rejects different bytes for an already published version, including README changes; those changes require a successor release before the full gate can pass. `dist/` and tarballs are generated output and are not committed.

[MIT License](LICENSE).
