import assert from 'node:assert/strict';
import test from 'node:test';

import { selectPreviousReleaseBase } from '../scripts/previous-release-base.mjs';

const reviewed = {
  commit: 'base-commit',
  isStrictAncestor: true,
  manifestVersion: '4.0.0',
  packageVersion: '4.0.0',
  tag: 'v4.0.0',
};

test('selects the highest lower reviewed version on a strict ancestor', () => {
  assert.equal(selectPreviousReleaseBase({
    candidates: [
      reviewed,
      {
        commit: 'head-commit',
        isStrictAncestor: false,
        manifestVersion: '999.0.0',
        packageVersion: '999.0.0',
        tag: 'v999.0.0',
      },
      {
        commit: 'unreviewed-commit',
        isStrictAncestor: true,
        manifestVersion: null,
        packageVersion: '4.0.1',
        tag: 'v4.0.1',
      },
      {
        commit: 'alias-commit',
        isStrictAncestor: true,
        manifestVersion: '4.0.0',
        packageVersion: '4.0.0',
        tag: 'v4.0.1',
      },
      {
        commit: 'older-commit',
        isStrictAncestor: true,
        manifestVersion: '3.3.2',
        packageVersion: '3.3.2',
        tag: 'v3.3.2',
      },
    ],
    currentVersion: '4.1.0',
  }), 'base-commit');
});

test('fails closed without a lower package-matching reviewed ancestor', () => {
  assert.throws(() => selectPreviousReleaseBase({
    candidates: [{
      ...reviewed,
      commit: 'head-commit',
      isStrictAncestor: false,
    }],
    currentVersion: '4.1.0',
  }), /previous reviewed release/u);
});

test('may select a reviewed release on HEAD for a dirty working-tree comparison', () => {
  assert.equal(selectPreviousReleaseBase({
    allowHead: true,
    candidates: [{
      ...reviewed,
      commit: 'head-commit',
      isHead: true,
      isStrictAncestor: false,
    }],
    currentVersion: '4.1.0',
  }), 'head-commit');
});
