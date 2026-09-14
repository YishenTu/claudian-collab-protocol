import assert from 'node:assert/strict';
import { test } from 'node:test';

import { assertCloudEventSourceAddition } from '../scripts/check-compatibility.mjs';

const before = `
export const COLLAB_CLOUD_EVENT_KINDS = Object.freeze(['main.updated'] as const);
export interface CollabCloudEventPayloadMap { readonly 'main.updated': { readonly mainOid: string }; }
function decodePayload(kind: string, value: unknown): unknown {
  switch (kind) { case 'main.updated': { return value; } }
}
`;
const after = before.replace("['main.updated']", "['main.updated', 'authority-transfer.preparation-updated']")
  .replace('export interface CollabCloudEventPayloadMap {', "export interface CollabCloudEventPayloadMap { readonly 'authority-transfer.preparation-updated': { readonly preparationId: string };")
  .replace("switch (kind) {", "switch (kind) { case 'authority-transfer.preparation-updated': { const source = value; return source; }");
const additions = ['authority-transfer.preparation-updated'];

test('accepts additive event inventory, payload and returning prefix decoder', () => {
  assert.doesNotThrow(() => assertCloudEventSourceAddition(before, after, additions));
});
for (const [label, candidate] of [
  ['existing decoder change', after.replace('return value;', 'return null;')],
  ['new top-level capture', `${after}\nconst value = null;`],
  ['fallthrough', after.replace('return source;', 'void source;')],
  ['changed existing payload', after.replace('mainOid: string', 'mainOid: number')],
  ['inventory removal', after.replace("['main.updated', ", '[')],
]) test(`rejects ${label}`, () => {
  assert.throws(() => assertCloudEventSourceAddition(before, candidate, additions));
});
