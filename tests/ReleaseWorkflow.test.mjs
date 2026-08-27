import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const repositoryRoot = resolve(import.meta.dirname, '..');

test('release publishing uses GitHub trusted publishing without a repository token', async () => {
  const [workflow, packageManifestText] = await Promise.all([
    readFile(resolve(repositoryRoot, '.github/workflows/publish.yml'), 'utf8'),
    readFile(resolve(repositoryRoot, 'package.json'), 'utf8'),
  ]);
  const packageManifest = JSON.parse(packageManifestText);
  const tarballName = `claudian-collab-protocol-${packageManifest.version}.tgz`;

  assert.match(workflow, /^\s*id-token: write$/mu);
  assert.match(workflow, /npm publish .* --access public --provenance/u);
  assert.equal(workflow.includes(`npm publish .context/release/${tarballName}`), true);
  assert.doesNotMatch(workflow, /NPM_TOKEN|NODE_AUTH_TOKEN|secrets\./u);
});
