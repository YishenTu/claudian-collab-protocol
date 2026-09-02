#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseStableVersion(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/u.exec(value);
  if (!match) return null;
  return match.slice(1).map(Number);
}

function compareVersions(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

export function selectPreviousReleaseBase({ allowHead = false, candidates, currentVersion }) {
  const current = parseStableVersion(currentVersion);
  if (!current || !Array.isArray(candidates)) {
    throw new Error('Cannot select previous reviewed release');
  }
  const eligible = candidates.flatMap((candidate) => {
    const tagVersion = typeof candidate?.tag === 'string' && candidate.tag.startsWith('v')
      ? candidate.tag.slice(1)
      : null;
    const parsed = tagVersion === null ? null : parseStableVersion(tagVersion);
    if (
      parsed === null
      || compareVersions(parsed, current) >= 0
      || (candidate.isStrictAncestor !== true && !(allowHead && candidate.isHead === true))
      || candidate.packageVersion !== tagVersion
      || candidate.manifestVersion !== tagVersion
      || typeof candidate.commit !== 'string'
      || candidate.commit.length === 0
    ) return [];
    return [{ ...candidate, parsed }];
  }).sort((left, right) => compareVersions(right.parsed, left.parsed));
  if (eligible.length === 0) throw new Error('Cannot find previous reviewed release');
  return eligible[0].commit;
}

function readTaggedVersion(tag, pathname, select) {
  try {
    const content = execFileSync('git', ['show', `${tag}:${pathname}`], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return select(JSON.parse(content));
  } catch {
    return null;
  }
}

export function resolvePreviousReleaseBase({ allowHead = false } = {}) {
  const manifest = JSON.parse(readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'));
  const head = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  }).trim();
  const tags = execFileSync('git', ['tag', '--merged', 'HEAD', '--list', 'v*'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  }).trim().split('\n').filter(Boolean);
  const candidates = tags.map((tag) => {
    const commit = execFileSync('git', ['rev-list', '-n', '1', tag], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    }).trim();
    const ancestor = commit !== head && spawnSync(
      'git',
      ['merge-base', '--is-ancestor', commit, head],
      { cwd: repositoryRoot, stdio: 'ignore' },
    ).status === 0;
    return {
      commit,
      isHead: commit === head,
      isStrictAncestor: ancestor,
      manifestVersion: readTaggedVersion(
        tag,
        'release-manifest.json',
        value => value?.package?.version ?? null,
      ),
      packageVersion: readTaggedVersion(tag, 'package.json', value => value?.version ?? null),
      tag,
    };
  });
  return selectPreviousReleaseBase({
    allowHead,
    candidates,
    currentVersion: manifest.version,
  });
}

function run() {
  process.stdout.write(`${resolvePreviousReleaseBase()}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) run();
