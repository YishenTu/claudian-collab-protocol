#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const snapshotRelativePath = 'contract-snapshot.json';
const snapshotPath = path.join(repositoryRoot, snapshotRelativePath);
const require = createRequire(import.meta.url);
const ts = require('typescript');

const SNAPSHOT_FIELDS = new Set([
  'cloudBindingVersion',
  'contract',
  'packageVersion',
  'protocolVersion',
  'schemaVersion',
]);
const CONTRACT_FIELDS = new Set([
  'cloudBinding',
  'publicDeclarations',
  'publicRuntimeExports',
  'runtimeBehaviorDigests',
  'wire',
]);
const WIRE_MODULES = new Set([
  './CollabConstants',
  './CollabControlOperationCodecs',
  './CollabError',
  './CollabProtocol',
  './CollabRequestTicketRequestCodecs',
  './CollabRequestTicketResponseCodecs',
  './CollabValidation',
  './types',
]);
const CLOUD_BINDING_MODULES = new Set([
  './CollabCloudBinding',
  './CollabCloudProjectEvent',
  './CollabCloudProjectSnapshot',
  './DevelopmentBootstrap',
]);

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right, 'en-US'))
        .map(([key, item]) => [key, stableValue(item)]),
    );
  }
  return value;
}

function stableJson(value) {
  return JSON.stringify(stableValue(value));
}

function parseSemver(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/u.exec(value);
  if (!match) throw new Error(`Invalid package SemVer in protocol snapshot: ${value}`);
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ?? null,
  };
}

function compareSemver(leftValue, rightValue) {
  const left = parseSemver(leftValue);
  const right = parseSemver(rightValue);
  for (const field of ['major', 'minor', 'patch']) {
    if (left[field] !== right[field]) return left[field] > right[field] ? 1 : -1;
  }
  if (left.prerelease === right.prerelease) return 0;
  if (left.prerelease === null) return 1;
  if (right.prerelease === null) return -1;
  return left.prerelease.localeCompare(right.prerelease, 'en-US');
}

function exactFields(value, expected, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  for (const field of Object.keys(value)) {
    if (!expected.has(field)) throw new Error(`unknown ${label} field: ${field}`);
  }
  for (const field of expected) {
    if (!(field in value)) throw new Error(`missing ${label} field: ${field}`);
  }
}

function validateCurrentSnapshot(snapshot) {
  exactFields(snapshot, SNAPSHOT_FIELDS, 'snapshot');
  if (snapshot.schemaVersion !== 2) {
    throw new Error(`Unsupported current snapshot schema: ${snapshot.schemaVersion}`);
  }
  exactFields(snapshot.contract, CONTRACT_FIELDS, 'contract');
  parseSemver(snapshot.packageVersion);
  for (const [name, value] of [
    ['protocolVersion', snapshot.protocolVersion],
    ['cloudBindingVersion', snapshot.cloudBindingVersion],
  ]) {
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`Invalid ${name}`);
  }
}

function keyedEntries(entries, key, label) {
  if (!Array.isArray(entries)) throw new Error(`${label} must be an array`);
  const result = new Map();
  for (const entry of entries) {
    if (entry === null || typeof entry !== 'object' || typeof entry[key] !== 'string') {
      throw new Error(`Invalid ${label} entry`);
    }
    if (result.has(entry[key])) throw new Error(`Duplicate ${label} entry: ${entry[key]}`);
    result.set(entry[key], stableJson(entry));
  }
  return result;
}

function stringEntries(entries, label) {
  if (!Array.isArray(entries) || entries.some(entry => typeof entry !== 'string')) {
    throw new Error(`${label} must be a string array`);
  }
  if (new Set(entries).size !== entries.length) throw new Error(`Duplicate ${label} entry`);
  return new Map(entries.map(entry => [entry, entry]));
}

function classifyMapChange(base, current) {
  let additive = false;
  for (const [key, value] of base) {
    if (!current.has(key) || current.get(key) !== value) return 'major';
  }
  for (const key of current.keys()) {
    if (!base.has(key)) additive = true;
  }
  return additive ? 'minor' : 'none';
}

function strongestClassification(classifications) {
  if (classifications.includes('major')) return 'major';
  if (classifications.includes('minor')) return 'minor';
  return 'none';
}

export function classifyPackageApiChange(base, current) {
  validateCurrentSnapshot(base);
  validateCurrentSnapshot(current);
  return strongestClassification([
    classifyMapChange(
      keyedEntries(base.contract.publicDeclarations, 'exportName', 'public declaration'),
      keyedEntries(current.contract.publicDeclarations, 'exportName', 'public declaration'),
    ),
    classifyMapChange(
      stringEntries(base.contract.publicRuntimeExports, 'public runtime export'),
      stringEntries(current.contract.publicRuntimeExports, 'public runtime export'),
    ),
    classifyMapChange(
      keyedEntries(base.contract.runtimeBehaviorDigests, 'path', 'runtime behavior digest'),
      keyedEntries(current.contract.runtimeBehaviorDigests, 'path', 'runtime behavior digest'),
    ),
  ]);
}

function packageReleaseSatisfies(baseValue, currentValue, classification) {
  const base = parseSemver(baseValue);
  const current = parseSemver(currentValue);
  if (classification === 'major') return current.major > base.major;
  if (classification === 'minor') {
    return current.major > base.major
      || (current.major === base.major && current.minor > base.minor);
  }
  return true;
}

export function assertVersionedContractChange(base, current) {
  validateCurrentSnapshot(current);
  const failures = [];
  if (compareSemver(current.packageVersion, base.packageVersion) < 0) {
    failures.push('package version cannot decrease');
  }
  if (current.protocolVersion < base.protocolVersion) {
    failures.push('wire protocol version cannot decrease');
  }

  if (base.schemaVersion === 1) {
    const basePackage = parseSemver(base.packageVersion);
    const currentPackage = parseSemver(current.packageVersion);
    if (currentPackage.major <= basePackage.major) {
      failures.push('snapshot policy graduation requires a package major release');
    }
  } else {
    validateCurrentSnapshot(base);
    if (current.cloudBindingVersion < base.cloudBindingVersion) {
      failures.push('Cloud binding version cannot decrease');
    }
    const classification = classifyPackageApiChange(base, current);
    if (!packageReleaseSatisfies(base.packageVersion, current.packageVersion, classification)) {
      failures.push(classification === 'major'
        ? 'public API change requires a package major release'
        : 'additive public API requires a package minor or major release');
    }
    if (
      stableJson(base.contract.wire) !== stableJson(current.contract.wire)
      && current.protocolVersion <= base.protocolVersion
    ) {
      failures.push('wire protocol version must increase for a wire contract change');
    }
    if (
      stableJson(base.contract.cloudBinding) !== stableJson(current.contract.cloudBinding)
      && current.cloudBindingVersion <= base.cloudBindingVersion
    ) {
      failures.push('Cloud binding version must increase for a Cloud binding change');
    }
  }

  if (failures.length > 0) {
    throw new Error(`Collab protocol compatibility check failed: ${failures.join('; ')}`);
  }
}

export function digestTypeScriptBehavior(source) {
  const transpiled = ts.transpileModule(source.replace(/\r\n/gu, '\n'), {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      removeComments: true,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const parsed = ts.createSourceFile(
    'behavior.js',
    transpiled,
    ts.ScriptTarget.ES2022,
    true,
    ts.ScriptKind.JS,
  );
  const tokens = [];
  function visit(node) {
    const children = node.getChildren(parsed);
    if (children.length === 0) {
      tokens.push([node.kind, node.getText(parsed)]);
      return;
    }
    for (const child of children) visit(child);
  }
  visit(parsed);
  return createHash('sha256').update(JSON.stringify(tokens)).digest('hex');
}

function declaredNames(statement) {
  if (ts.isVariableStatement(statement)) {
    return statement.declarationList.declarations
      .map(declaration => ts.isIdentifier(declaration.name) ? declaration.name.text : null)
      .filter(Boolean);
  }
  if (
    ts.isClassDeclaration(statement)
    || ts.isEnumDeclaration(statement)
    || ts.isFunctionDeclaration(statement)
    || ts.isInterfaceDeclaration(statement)
    || ts.isTypeAliasDeclaration(statement)
  ) {
    return statement.name ? [statement.name.text] : [];
  }
  return [];
}

function publicDeclarations() {
  const distRoot = path.join(repositoryRoot, 'dist');
  if (!existsSync(distRoot)) throw new Error('dist is missing; run npm run build first');
  const indexPath = path.join(distRoot, 'index.d.ts');
  const indexSource = ts.createSourceFile(
    indexPath,
    readFileSync(indexPath, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const declarations = [];
  for (const statement of indexSource.statements) {
    if (
      !ts.isExportDeclaration(statement)
      || !statement.moduleSpecifier
      || !ts.isStringLiteral(statement.moduleSpecifier)
      || !statement.exportClause
      || !ts.isNamedExports(statement.exportClause)
    ) continue;
    const moduleName = statement.moduleSpecifier.text;
    const declarationPath = path.join(distRoot, `${moduleName.replace(/^\.\//u, '')}.d.ts`);
    const declarationSource = ts.createSourceFile(
      declarationPath,
      readFileSync(declarationPath, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    for (const element of statement.exportClause.elements) {
      const localName = element.propertyName?.text ?? element.name.text;
      const matches = declarationSource.statements.filter(item => declaredNames(item).includes(localName));
      if (matches.length === 0) {
        throw new Error(`Cannot resolve public declaration ${localName} from ${moduleName}`);
      }
      declarations.push({
        declaration: matches
          .map(item => item.getText(declarationSource).replace(/\r\n/gu, '\n'))
          .join('\n'),
        exportName: element.name.text,
        source: moduleName,
      });
    }
  }
  return declarations.sort((left, right) => left.exportName.localeCompare(right.exportName, 'en-US'));
}

function sourceFiles(directory = path.join(repositoryRoot, 'src')) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(absolutePath);
    return entry.isFile() && entry.name.endsWith('.ts') ? [absolutePath] : [];
  }).sort();
}

function behaviorDigests() {
  return sourceFiles().map((absolutePath) => ({
    path: path.posix.join('src', path.relative(path.join(repositoryRoot, 'src'), absolutePath).split(path.sep).join('/')),
    sha256: digestTypeScriptBehavior(readFileSync(absolutePath, 'utf8')),
  }));
}

function moduleForBehaviorPath(relativePath) {
  return `./${relativePath.replace(/^src\//u, '').replace(/\.ts$/u, '')}`;
}

function subset(declarations, digests, modules, semantics) {
  return stableValue({
    declarations: declarations.filter(item => modules.has(item.source)),
    runtimeBehaviorDigests: digests.filter(item => modules.has(moduleForBehaviorPath(item.path))),
    ...semantics,
  });
}

export function generateContractSnapshot() {
  const manifest = JSON.parse(readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'));
  const entryPath = path.join(repositoryRoot, 'dist/index.js');
  delete require.cache[require.resolve(entryPath)];
  const protocol = require(entryPath);
  const declarations = publicDeclarations();
  const digests = behaviorDigests();
  return stableValue({
    cloudBindingVersion: protocol.COLLAB_CLOUD_BINDING_VERSION,
    contract: {
      cloudBinding: subset(declarations, digests, CLOUD_BINDING_MODULES, {
        capabilities: [...protocol.COLLAB_CLOUD_CAPABILITIES],
        eventKinds: [...protocol.COLLAB_CLOUD_EVENT_KINDS],
      }),
      publicDeclarations: declarations,
      publicRuntimeExports: Object.keys(protocol).sort(),
      runtimeBehaviorDigests: digests,
      wire: subset(declarations, digests, WIRE_MODULES, {
        errorCodes: [...protocol.COLLAB_ERROR_CODES],
        gitRefs: {
          main: protocol.COLLAB_MAIN_REF,
          memberPrefix: protocol.COLLAB_MEMBER_REF_PREFIX,
        },
        limits: stableValue(protocol.COLLAB_LIMITS),
        operations: Object.keys(protocol.COLLAB_CONTROL_OPERATION_CODECS).sort(),
      }),
    },
    packageVersion: manifest.version,
    protocolVersion: protocol.COLLAB_PROTOCOL_VERSION,
    schemaVersion: 2,
  });
}

const GIT_SHOW_MISSING_PATH = /(?:does not exist in|exists on disk, but not in)/u;

export function readBaseSnapshot(baseSha, { cwd = repositoryRoot } = {}) {
  if (!/^[0-9a-f]{7,40}$/iu.test(baseSha)) {
    throw new Error(`Invalid base commit for protocol compatibility check: ${baseSha}`);
  }
  try {
    execFileSync('git', ['cat-file', '-e', `${baseSha}^{commit}`], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const stderr = Buffer.isBuffer(error?.stderr) ? error.stderr.toString('utf8').trim() : '';
    throw new Error(`Cannot read base protocol snapshot at ${baseSha}: ${stderr || 'commit unavailable'}`);
  }
  try {
    return JSON.parse(execFileSync('git', ['show', `${baseSha}:${snapshotRelativePath}`], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }));
  } catch (error) {
    const stderr = typeof error?.stderr === 'string' ? error.stderr : '';
    if (GIT_SHOW_MISSING_PATH.test(stderr)) return null;
    throw new Error(`Cannot read base protocol snapshot at ${baseSha}: ${stderr.trim() || error.message}`);
  }
}

function run() {
  const args = process.argv.slice(2);
  const write = args.includes('--write');
  const baseIndex = args.indexOf('--base');
  const baseSha = baseIndex >= 0 ? args[baseIndex + 1] : null;
  if (baseIndex >= 0 && !baseSha) throw new Error('--base requires a commit SHA');
  const generated = generateContractSnapshot();
  if (write) {
    writeFileSync(snapshotPath, `${JSON.stringify(generated, null, 2)}\n`);
    process.stdout.write(`Updated ${snapshotRelativePath}\n`);
    return;
  }
  if (!existsSync(snapshotPath)) throw new Error(`Missing ${snapshotRelativePath}`);
  const committed = JSON.parse(readFileSync(snapshotPath, 'utf8'));
  if (stableJson(generated) !== stableJson(committed)) {
    throw new Error(`Contract snapshot is stale; run npm run check:compatibility -- --write`);
  }
  if (baseSha) {
    const base = readBaseSnapshot(baseSha);
    if (base) assertVersionedContractChange(base, committed);
  }
  process.stdout.write('Collab protocol compatibility: PASS\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) run();
