import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'collab-module-relocation-'));
  t.after(() => rmSync(root, { force: true, recursive: true }));
  const put = (name, value) => {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), value);
  };
  mkdirSync(path.join(root, 'scripts'));
  copyFileSync(path.join(repositoryRoot, 'scripts/check-compatibility.mjs'), path.join(root, 'scripts/check-compatibility.mjs'));
  symlinkSync(path.join(repositoryRoot, 'node_modules'), path.join(root, 'node_modules'), 'dir');
  const command = (...args) => spawnSync(process.execPath, ['scripts/check-compatibility.mjs', ...args], { cwd: root, encoding: 'utf8' });
  const git = (...args) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgSign=false',
    '-c', 'user.name=Protocol test', '-c', 'user.email=protocol-test@example.invalid', ...args], { cwd: root, encoding: 'utf8' }).trim();
  const build = () => {
    rmSync(path.join(root, 'dist'), { recursive: true, force: true });
    execFileSync(process.execPath, [path.join(repositoryRoot, 'node_modules/typescript/bin/tsc'),
      '--declaration', '--skipLibCheck', '--target', 'es2022', '--module', 'commonjs',
      '--outDir', 'dist', 'src/index.ts'], { cwd: root, encoding: 'utf8', stdio: 'pipe' });
    const result = command('--write');
    assert.equal(result.status, 0, result.stderr);
  };
  const declarations = `
import './Twin';
export type Result = number;
export const COLLAB_PROTOCOL_VERSION = 10 as const;
export const COLLAB_CLOUD_BINDING_VERSION = 6 as const;
export const COLLAB_PROJECT_CHECKPOINT_ARTIFACTS = [];
export const COLLAB_CLOUD_CAPABILITIES = [];
export const COLLAB_CLOUD_EVENT_KINDS = [];
export const COLLAB_CLOUD_JSON_OPERATIONS = [];
export const COLLAB_CLOUD_BINDING_LIMITS = {};
export const COLLAB_LIMITS = {};
export const COLLAB_ERROR_CODES = [];
export const COLLAB_MAIN_REF = 'refs/heads/main';
export const COLLAB_MEMBER_REF_PREFIX = 'refs/heads/members/';
export const COLLAB_CONTROL_OPERATION_CODECS = {};
`;
  const value = 'export const offset = 1;\nexport interface Description { readonly value: number; }\nexport function describe(): Description { return { value: 1 }; }\n';
  const decoder = "import { offset } from './Value';\nimport { describe } from './Value';\nimport type { Result } from '.';\nexport const description = describe();\nexport function decode(value: number): Result { return value + offset; }\n";
  put('package.json', JSON.stringify({ version: '1.0.0' }));
  put('src/Twin.ts', value);
  put('src/Value.ts', value);
  put('src/Decoder.ts', decoder);
  put('src/index.ts', declarations + "export type { Description } from './Value';\nexport { decode, description } from './Decoder';\n");
  build();
  git('init', '--quiet');
  git('add', 'package.json', 'src', 'contract-snapshot.json');
  git('commit', '--quiet', '-m', 'test: record public decoder contract');
  const base = git('rev-parse', 'HEAD');
  rmSync(path.join(root, 'src/Value.ts'));
  rmSync(path.join(root, 'src/Decoder.ts'));
  put('src/core/Value.ts', value);
  put('src/operations/Decoder.ts', decoder.replaceAll('./Value', '../core/Value').replace("from '.'", "from '..'"));
  put('src/index.ts', declarations + "export type { Description } from './core/Value';\nexport { decode, description } from './operations/Decoder';\n");
  put('package.json', JSON.stringify({ version: '1.0.1' }));
  const moves = [
    { from: 'src/Decoder.ts', to: 'src/operations/Decoder.ts' },
    { from: 'src/Value.ts', to: 'src/core/Value.ts' },
  ];
  put('moves.json', JSON.stringify(moves));
  build();
  const record = () => command('--base', base, '--record-module-relocation-review',
    'The compiled public decoder still returns 43 for input 42; only module locations and their specifiers changed.',
    '--module-moves', 'moves.json');
  return { base, build, command, moves, put, record, root };
}

test('the compatibility command reviews a complete module relocation without changing API or protocol versions', t => {
  const { base, command, record, root } = fixture(t);
  assert.notEqual(command('--base', base).status, 0);
  const accepted = record();
  assert.equal(accepted.status, 0, accepted.stderr);
  const reviewed = command('--base', base);
  assert.equal(reviewed.status, 0, reviewed.stderr);
  const review = JSON.parse(readFileSync(path.join(root, 'compatibility-review.json'), 'utf8'));
  assert.equal(review.reviewKind, 'module-relocation');
  assert.equal(review.moduleMoves.length, 2);
  const decoded = execFileSync(process.execPath, ['-e', "process.stdout.write(String(require('./dist').decode(42)))"], { cwd: root, encoding: 'utf8' });
  assert.equal(decoded, '43');
});

for (const [label, pathname, before, after] of [
  ['private runtime drift', 'src/core/Value.ts', '= 1', '= 2'],
  ['equal-valued import retargeting', 'src/operations/Decoder.ts', '../core/Value', '../Twin'],
  ['changed binding identities', 'src/operations/Decoder.ts', 'import { offset }', 'import { offset as other, offset }'],
  ['public signature drift', 'src/operations/Decoder.ts', 'value: number', 'value: 42'],
  ['protocol drift', 'src/index.ts', 'VERSION = 10', 'VERSION = 11'],
]) {
  test(`a regenerated relocation review rejects ${label}`, t => {
    const { build, put, record, root } = fixture(t);
    const original = readFileSync(path.join(root, pathname), 'utf8');
    assert.notEqual(original.replace(before, after), original);
    put(pathname, original.replace(before, after));
    build();
    const rejected = record();
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /Module relocation (?:changed source|cannot change)/u);
  });
}

test('a relocation review rejects incomplete, duplicate, and colliding move maps', t => {
  const { moves, put, record } = fixture(t);
  for (const invalid of [
    moves.slice(0, 1),
    [...moves, moves[0]],
    [moves[0], { ...moves[1], to: moves[0].to }],
    [{ ...moves[0], to: 'src/index.ts' }, moves[1]],
  ]) {
    put('moves.json', JSON.stringify(invalid));
    const rejected = record();
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /Module relocation (?:must preserve|requires a one-to-one)/u);
  }
});

test('a recorded relocation cannot authorize later decoder drift or a different base', t => {
  const { base, build, command, put, record, root } = fixture(t);
  const accepted = record();
  assert.equal(accepted.status, 0, accepted.stderr);
  const review = JSON.parse(readFileSync(path.join(root, 'compatibility-review.json'), 'utf8'));
  put('compatibility-review.json', JSON.stringify({ ...review, baseSnapshotSha256: '0'.repeat(64) }));
  const wrongBase = command('--base', base);
  assert.notEqual(wrongBase.status, 0);
  assert.match(wrongBase.stderr, /exact base and candidate snapshots/u);
  put('compatibility-review.json', JSON.stringify(review));
  const original = readFileSync(path.join(root, 'src/core/Value.ts'), 'utf8');
  put('src/core/Value.ts', original.replace('offset = 1', 'offset = 2'));
  build();
  const drift = command('--base', base);
  assert.notEqual(drift.status, 0);
  assert.match(drift.stderr, /exact base and candidate snapshots/u);
});
