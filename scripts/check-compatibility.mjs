#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const snapshotRelativePath = 'contract-snapshot.json';
const snapshotPath = path.join(repositoryRoot, snapshotRelativePath);
const reviewRelativePath = 'compatibility-review.json';
const reviewPath = path.join(repositoryRoot, reviewRelativePath);
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
const IMPLEMENTATION_REVIEW_FIELDS = new Set([
  'schemaVersion',
  'baseSnapshotSha256',
  'candidateSnapshotSha256',
  'reason',
]);
const VERSIONED_OPERATION_ADDITION_REVIEW_FIELDS = new Set([
  'schemaVersion',
  'baseSnapshotSha256',
  'candidateSnapshotSha256',
  'reviewKind',
  'addedOperations',
  'reason',
]);
const WIRE_MODULES = new Set([
  './CollabAuthorityTransfer',
  './CollabConstants',
  './CollabControlOperationCodecs',
  './CollabError',
  './CollabProtocol',
  './CollabProjectMembership',
  './CollabProjectCheckpoint',
  './CollabProjectRetirement',
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
const PUBLISHED_3_3_1_SNAPSHOT_SHA256 =
  '376f1090a97989757773f5fae5bbcbaee5f559e2ca1f5c09ddef9beaba0b0444';
const PUBLISHED_3_3_1_CLOUD_BINDING_ENRICHMENT = Object.freeze({
  checkpointArtifacts: Object.freeze([
    'checkpoint.json',
    'coordination.ndjson',
    'repository.bundle',
  ]),
  limits: Object.freeze({
    bootstrapAttemptTtlMs: 86_400_000,
    defaultMaxConcurrentBootstrapUploads: 1,
    eventHeartbeatMs: 30_000,
    eventMissedHeartbeatLimit: 2,
    maxCloudOpenRequests: 100,
    maxCloudProjectMembers: 100,
    maxCloudSnapshotUtf8Bytes: 458_752,
    maxCloudTicketHighlights: 5,
    maxCheckpointCoordinationBytes: 268_435_456,
    maxCheckpointManifestUtf8Bytes: 65_536,
    maxCheckpointRepositoryBundleBytes: 1_073_741_824,
    maxCheckpointStagingBytes: 2_147_483_648,
    maxDevelopmentBootstrapGitBundleBytes: 1_073_741_824,
    maxDevelopmentBootstrapManifestUtf8Bytes: 65_536,
    maxDevelopmentBootstrapReportUtf8Bytes: 65_536,
    maxDevelopmentBootstrapRepositoryBytes: 1_073_741_824,
    maxDevelopmentBootstrapStagingBytes: 2_147_483_648,
    maxEventReplay: 500,
    maxGitReceivePackBytes: 268_435_456,
    maxJsonPayloadUtf8Bytes: 524_288,
    maxRepositoryBytes: 1_073_741_824,
    maxUploadsPerBootstrapAttempt: 1,
    minEventRetentionDays: 30,
    minRetainedEventCount: 10_000,
    uploadDeadlineMs: 900_000,
    uploadIdleTimeoutMs: 30_000,
  }),
});

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
  if (
    snapshot === null
    || typeof snapshot !== 'object'
    || Array.isArray(snapshot)
    || snapshot.schemaVersion !== 2
  ) {
    throw new Error(`Unsupported current snapshot schema: ${snapshot?.schemaVersion}`);
  }
  exactFields(snapshot, SNAPSHOT_FIELDS, 'snapshot');
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

function isStringArraySubset(base, current) {
  return Array.isArray(base)
    && Array.isArray(current)
    && base.every(value => typeof value === 'string' && current.includes(value));
}

function withoutKeys(value, keys) {
  const result = { ...value };
  for (const key of keys) delete result[key];
  return result;
}

export function classifyPackageApiChange(base, current) {
  validateCurrentSnapshot(base);
  validateCurrentSnapshot(current);
  const classification = strongestClassification([
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
  return classification;
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

function effectiveCloudBindingContract(snapshot) {
  const snapshotSha256 = createHash('sha256')
    .update(stableJson(snapshot))
    .digest('hex');
  const publishedBaseline = snapshotSha256 === PUBLISHED_3_3_1_SNAPSHOT_SHA256
    ? PUBLISHED_3_3_1_CLOUD_BINDING_ENRICHMENT
    : {};
  return stableValue({
    ...publishedBaseline,
    ...snapshot.contract.cloudBinding,
    jsonOperations: [
      'getProjectSnapshot',
      ...snapshot.contract.wire.operations,
    ],
  });
}

function withoutImplementationDigests(contract) {
  const semantics = { ...contract };
  delete semantics.runtimeBehaviorDigests;
  return semantics;
}

function contractSemantics(snapshot) {
  return {
    ...withoutImplementationDigests(snapshot.contract),
    wire: withoutImplementationDigests(snapshot.contract.wire),
    cloudBinding: withoutImplementationDigests(snapshot.contract.cloudBinding),
  };
}

function snapshotDigest(snapshot) {
  return createHash('sha256').update(stableJson(snapshot)).digest('hex');
}

function operationAdditions(base, current) {
  if (
    !isStringArraySubset(base, current)
    || current.length <= base.length
  ) throw new Error('Versioned operation review requires only additive operation inventory changes');
  return current.filter(operation => !base.includes(operation)).sort();
}

function declarationShape(declaration) {
  const source = ts.createSourceFile(
    'contract.d.ts',
    declaration,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  if (source.statements.length !== 1) return null;
  const statement = source.statements[0];
  const memberShape = (members, kind, header = null) => {
    const entries = [];
    const names = new Set();
    for (const member of members) {
      if (!ts.isPropertySignature(member) || member.name === undefined) return null;
      const name = ts.isIdentifier(member.name) || ts.isStringLiteral(member.name)
        ? member.name.text
        : null;
      if (name === null || names.has(name)) return null;
      names.add(name);
      entries.push([name, member.getText(source).replace(/\s+/gu, ' ')]);
    }
    return { kind, entries, header };
  };
  if (ts.isInterfaceDeclaration(statement)) {
    return memberShape(statement.members, 'members', stableJson({
      heritage: statement.heritageClauses?.map(clause => (
        clause.getText(source).replace(/\s+/gu, ' ')
      )) ?? [],
      modifiers: statement.modifiers?.map(modifier => modifier.getText(source)) ?? [],
      name: statement.name.text,
      typeParameters: statement.typeParameters?.map(parameter => (
        parameter.getText(source).replace(/\s+/gu, ' ')
      )) ?? [],
    }));
  }
  if (!ts.isVariableStatement(statement) || statement.declarationList.declarations.length !== 1) {
    return null;
  }
  const variable = statement.declarationList.declarations[0];
  let type = variable.type;
  if (type && ts.isTypeOperatorNode(type) && type.operator === ts.SyntaxKind.ReadonlyKeyword) {
    type = type.type;
  }
  if (
    type
    && ts.isTypeReferenceNode(type)
    && ts.isIdentifier(type.typeName)
    && type.typeName.text === 'Readonly'
    && type.typeArguments?.length === 1
  ) [type] = type.typeArguments;
  if (type && ts.isTypeLiteralNode(type)) return memberShape(type.members, 'members');
  if (type && ts.isTupleTypeNode(type)) {
    const values = [];
    for (const element of type.elements) {
      if (!ts.isLiteralTypeNode(element) || !ts.isStringLiteral(element.literal)) return null;
      values.push(element.literal.text);
    }
    return { kind: 'tuple', values };
  }
  return null;
}

function preservesOperationMembers(baseDeclaration, currentDeclaration, additions) {
  const base = declarationShape(baseDeclaration);
  const current = declarationShape(currentDeclaration);
  if (base?.kind !== 'members' || current?.kind !== 'members') return false;
  if (base.header !== current.header) return false;
  const baseMembers = new Map(base.entries);
  const currentMembers = new Map(current.entries);
  if (baseMembers.size + additions.length !== currentMembers.size) return false;
  for (const [name, declaration] of baseMembers) {
    if (currentMembers.get(name) !== declaration) return false;
  }
  return additions.every(name => currentMembers.has(name) && !baseMembers.has(name));
}

function preservesOperationTuple(baseDeclaration, currentDeclaration, additions) {
  const base = declarationShape(baseDeclaration);
  const current = declarationShape(currentDeclaration);
  if (base?.kind !== 'tuple' || current?.kind !== 'tuple') return false;
  if (new Set(current.values).size !== current.values.length) return false;
  return stableJson(current.values.filter(value => base.values.includes(value)))
      === stableJson(base.values)
    && current.values.filter(value => !base.values.includes(value)).sort().join('\0')
      === additions.join('\0');
}

function isAllowedChangedOperationDeclaration(base, current, additions, snapshots) {
  if (base.source !== current.source || base.exportName !== current.exportName) return false;
  if (
    base.exportName === 'CollabAuthorityTransferOperationMap'
    || base.exportName === 'COLLAB_CONTROL_OPERATION_CODECS'
  ) return preservesOperationMembers(base.declaration, current.declaration, additions);
  if (base.exportName === 'COLLAB_AUTHORITY_TRANSFER_OPERATIONS') {
    return preservesOperationTuple(base.declaration, current.declaration, additions);
  }
  const versionDeclaration = (name, version) => `export declare const ${name}: ${version};`;
  if (base.exportName === 'COLLAB_PROTOCOL_VERSION') {
    return base.declaration === versionDeclaration(base.exportName, snapshots.base.protocolVersion)
      && current.declaration === versionDeclaration(current.exportName, snapshots.current.protocolVersion);
  }
  if (base.exportName === 'COLLAB_CLOUD_BINDING_VERSION') {
    return base.declaration === versionDeclaration(base.exportName, snapshots.base.cloudBindingVersion)
      && current.declaration === versionDeclaration(current.exportName, snapshots.current.cloudBindingVersion);
  }
  return false;
}

function sourceFile(source, fileName) {
  return ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function syntaxSignature(node, source, { omitCases = false } = {}) {
  if (omitCases && ts.isCaseClause(node)) return [];
  const children = node.getChildren(source);
  if (children.length === 0) return [[node.kind, node.getText(source)]];
  return children.flatMap(child => syntaxSignature(child, source, { omitCases }));
}

function parsedTopLevel(sourceText, fileName) {
  const source = sourceFile(sourceText, fileName);
  const named = new Map();
  const unnamed = [];
  for (const statement of source.statements) {
    const names = declaredNames(statement);
    if (names.length === 0) {
      unnamed.push(stableJson(syntaxSignature(statement, source)));
      continue;
    }
    if (names.length !== 1 || named.has(names[0])) {
      throw new Error(`Unsupported source declaration in ${fileName}`);
    }
    named.set(names[0], { source, statement });
  }
  return { named, source, unnamed };
}

function topLevelReferenceGraph(sourceText) {
  const fileName = 'authority-transfer-source.ts';
  const options = {
    noLib: true,
    noResolve: true,
    target: ts.ScriptTarget.Latest,
  };
  const source = sourceFile(sourceText, fileName);
  const host = ts.createCompilerHost(options, true);
  host.fileExists = candidate => candidate === fileName;
  host.readFile = candidate => candidate === fileName ? sourceText : undefined;
  host.getSourceFile = candidate => candidate === fileName ? source : undefined;
  const program = ts.createProgram([fileName], options, host);
  const checker = program.getTypeChecker();
  const symbols = new Map();
  const statements = new Map();
  for (const statement of source.statements) {
    const names = declaredNames(statement);
    if (names.length !== 1) continue;
    let nameNode;
    if (ts.isVariableStatement(statement)) {
      const declaration = statement.declarationList.declarations[0];
      nameNode = ts.isIdentifier(declaration?.name) ? declaration.name : undefined;
    } else if (
      ts.isClassDeclaration(statement)
      || ts.isEnumDeclaration(statement)
      || ts.isFunctionDeclaration(statement)
      || ts.isInterfaceDeclaration(statement)
      || ts.isTypeAliasDeclaration(statement)
    ) {
      nameNode = statement.name;
    }
    if (!nameNode) continue;
    const symbol = checker.getSymbolAtLocation(nameNode);
    if (symbol) symbols.set(symbol, names[0]);
    statements.set(names[0], statement);
  }
  const graph = new Map();
  for (const [owner, statement] of statements) {
    const references = new Set();
    function visit(node) {
      if (ts.isIdentifier(node)) {
        const referenced = symbols.get(checker.getSymbolAtLocation(node));
        if (referenced !== undefined && referenced !== owner) references.add(referenced);
      }
      ts.forEachChild(node, visit);
    }
    visit(statement);
    graph.set(owner, references);
  }
  return graph;
}

function propertyNameText(name) {
  return ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : null;
}

function operationMapAddedMembers(statement, additions) {
  if (!ts.isInterfaceDeclaration(statement)) return [];
  const members = new Map();
  for (const member of statement.members) {
    if (!ts.isPropertySignature(member) || member.name === undefined) continue;
    const name = propertyNameText(member.name);
    if (name !== null) members.set(name, member);
  }
  return additions.map((operation) => {
    const member = members.get(operation);
    if (!member) throw new Error(`Authority-transfer operation map is missing ${operation}`);
    return member;
  });
}

function unwrapExpression(expression) {
  let current = expression;
  while (
    ts.isAsExpression(current)
    || ts.isSatisfiesExpression(current)
    || ts.isTypeAssertionExpression(current)
    || ts.isParenthesizedExpression(current)
  ) current = current.expression;
  return current;
}

function freezeArgument(statement) {
  if (!ts.isVariableStatement(statement) || statement.declarationList.declarations.length !== 1) {
    return null;
  }
  const initializer = statement.declarationList.declarations[0].initializer;
  if (
    !initializer
    || !ts.isCallExpression(initializer)
    || !ts.isPropertyAccessExpression(initializer.expression)
    || !ts.isIdentifier(initializer.expression.expression)
    || initializer.expression.expression.text !== 'Object'
    || initializer.expression.name.text !== 'freeze'
    || initializer.arguments.length !== 1
  ) return null;
  return unwrapExpression(initializer.arguments[0]);
}

function sourceOperationTuple(statement) {
  const argument = freezeArgument(statement);
  if (!argument || !ts.isArrayLiteralExpression(argument)) return null;
  const values = [];
  for (const element of argument.elements) {
    if (!ts.isStringLiteral(element)) return null;
    values.push(element.text);
  }
  return values;
}

function assertSourceOperationTuple(baseStatement, currentStatement, additions) {
  const base = sourceOperationTuple(baseStatement);
  const current = sourceOperationTuple(currentStatement);
  if (
    base === null
    || current === null
    || stableJson(current.filter(value => base.includes(value))) !== stableJson(base)
    || stableJson(current.filter(value => !base.includes(value)).sort()) !== stableJson(additions)
  ) throw new Error('Authority-transfer operation source tuple is not strictly additive');
}

function caseClauses(statement) {
  const result = new Map();
  function visit(node) {
    if (ts.isCaseClause(node)) {
      if (!ts.isStringLiteral(node.expression) || result.has(node.expression.text)) {
        throw new Error('Unsupported authority-transfer decoder case');
      }
      result.set(node.expression.text, node);
    }
    ts.forEachChild(node, visit);
  }
  visit(statement);
  return result;
}

function operationDecoderName(operation) {
  return `decode${operation[0].toUpperCase()}${operation.slice(1)}`;
}

function assertDispatchAddition(baseRecord, currentRecord, additions) {
  const baseCases = caseClauses(baseRecord.statement);
  const currentCases = caseClauses(currentRecord.statement);
  if (
    stableJson(syntaxSignature(baseRecord.statement, baseRecord.source, { omitCases: true }))
      !== stableJson(syntaxSignature(currentRecord.statement, currentRecord.source, { omitCases: true }))
  ) throw new Error('Authority-transfer dispatch changed outside operation cases');
  for (const [operation, clause] of baseCases) {
    const current = currentCases.get(operation);
    if (
      !current
      || stableJson(syntaxSignature(clause, baseRecord.source))
        !== stableJson(syntaxSignature(current, currentRecord.source))
    ) throw new Error(`Authority-transfer dispatch changed existing decoder case: ${operation}`);
  }
  const addedCases = [...currentCases.keys()].filter(operation => !baseCases.has(operation)).sort();
  if (stableJson(addedCases) !== stableJson(additions)) {
    throw new Error('Authority-transfer dispatch cases do not match reviewed operations');
  }
  for (const operation of additions) {
    const clause = currentCases.get(operation);
    const statement = clause?.statements[0];
    const expression = statement && ts.isReturnStatement(statement) ? statement.expression : null;
    if (
      clause?.statements.length !== 1
      || !expression
      || !ts.isCallExpression(expression)
      || !ts.isIdentifier(expression.expression)
      || expression.expression.text !== operationDecoderName(operation)
      || expression.arguments.length !== 1
      || !ts.isIdentifier(expression.arguments[0])
      || expression.arguments[0].text !== 'value'
    ) throw new Error(`Authority-transfer dispatch added a non-canonical decoder case: ${operation}`);
  }
}

function assertControlCodecAddition(baseRecord, currentRecord, additions) {
  const objectProperties = (record) => {
    const argument = freezeArgument(record.statement);
    if (!argument || !ts.isObjectLiteralExpression(argument)) return null;
    const properties = new Map();
    const other = [];
    for (const property of argument.properties) {
      if (!ts.isPropertyAssignment(property)) {
        other.push(stableJson(syntaxSignature(property, record.source)));
        continue;
      }
      const name = propertyNameText(property.name);
      if (name === null || properties.has(name)) return null;
      properties.set(name, property);
    }
    return { other, properties };
  };
  const base = objectProperties(baseRecord);
  const current = objectProperties(currentRecord);
  if (!base || !current) throw new Error('Unsupported control operation codec registry');
  if (stableJson(base.other) !== stableJson(current.other)) {
    throw new Error('Control operation codec registry changed its shared entries');
  }
  for (const [operation, property] of base.properties) {
    const candidate = current.properties.get(operation);
    if (
      !candidate
      || stableJson(syntaxSignature(property, baseRecord.source))
        !== stableJson(syntaxSignature(candidate, currentRecord.source))
    ) throw new Error(`Control operation codec changed existing operation: ${operation}`);
  }
  const added = [...current.properties.keys()]
    .filter(operation => !base.properties.has(operation)).sort();
  if (stableJson(added) !== stableJson(additions)) {
    throw new Error('Control operation codec additions do not match reviewed operations');
  }
  for (const operation of additions) {
    const initializer = current.properties.get(operation)?.initializer;
    if (
      !initializer
      || !ts.isCallExpression(initializer)
      || !ts.isIdentifier(initializer.expression)
      || initializer.expression.text !== 'codec'
      || initializer.arguments.length !== 1
      || !ts.isStringLiteral(initializer.arguments[0])
      || initializer.arguments[0].text !== operation
    ) throw new Error(`Control operation codec addition is not canonical: ${operation}`);
  }
}

function assertOnlyNamedChange(baseParsed, currentParsed, allowedChanged, label) {
  if (stableJson(baseParsed.unnamed) !== stableJson(currentParsed.unnamed)) {
    throw new Error(`${label} changed an unnamed source statement`);
  }
  for (const [name, base] of baseParsed.named) {
    const current = currentParsed.named.get(name);
    if (!current) throw new Error(`${label} removed existing source declaration: ${name}`);
    if (
      !allowedChanged.has(name)
      && stableJson(syntaxSignature(base.statement, base.source))
        !== stableJson(syntaxSignature(current.statement, current.source))
    ) throw new Error(`${label} changed existing source declaration: ${name}`);
  }
}

function normalizedVersionSource(source, name, currentVersion, baseVersion) {
  return source.replace(
    new RegExp(`(export\\s+const\\s+${name}\\s*=\\s*)${currentVersion}(\\s+as\\s+const)`, 'u'),
    `$1${baseVersion}$2`,
  );
}

function sourceSyntax(source, fileName) {
  const parsed = sourceFile(source, fileName);
  return stableJson(syntaxSignature(parsed, parsed));
}

function assertCloudBindingVersionMigration(
  baseSource,
  currentSource,
  baseVersion,
  currentVersion,
) {
  const fileName = 'src/CollabCloudBinding.ts';
  const groupedTopLevel = (sourceText) => {
    const source = sourceFile(sourceText, fileName);
    const named = new Map();
    const unnamed = [];
    for (const statement of source.statements) {
      const names = declaredNames(statement);
      if (names.length === 0) {
        unnamed.push(stableJson(syntaxSignature(statement, source)));
        continue;
      }
      if (names.length !== 1) {
        throw new Error('Cloud binding changed beyond the reviewed version-prefix increase');
      }
      const statements = named.get(names[0]) ?? [];
      statements.push(statement);
      named.set(names[0], statements);
    }
    return { named, source, unnamed };
  };
  const base = groupedTopLevel(baseSource);
  const current = groupedTopLevel(currentSource);
  if (
    stableJson(base.unnamed) !== stableJson(current.unnamed)
    || base.named.size !== current.named.size
  ) throw new Error('Cloud binding changed beyond the reviewed version-prefix increase');
  const literalKinds = new Set([
    ts.SyntaxKind.StringLiteral,
    ts.SyntaxKind.NoSubstitutionTemplateLiteral,
    ts.SyntaxKind.TemplateHead,
    ts.SyntaxKind.TemplateMiddle,
    ts.SyntaxKind.TemplateTail,
  ]);
  const routePrefixOwners = new Set([
    'collabCloudProjectOperationRoute',
    'collabCloudProjectEventsRoute',
    'collabCloudGitRoute',
    'collabCloudAuthorityTransferArtifactRoute',
    'collabCloudProjectCheckpointExportArtifactRoute',
    'collabCloudProjectCheckpointExportRoute',
    'collabDevelopmentBootstrapRoute',
  ]);
  for (const [name, beforeStatements] of base.named) {
    const afterStatements = current.named.get(name);
    if (!afterStatements || beforeStatements.length !== afterStatements.length) {
      throw new Error('Cloud binding changed beyond the reviewed version-prefix increase');
    }
    if (name === 'COLLAB_CLOUD_BINDING_VERSION') {
      const [before] = beforeStatements;
      const [after] = afterStatements;
      const normalized = normalizedVersionSource(
        after.getText(current.source),
        name,
        currentVersion,
        baseVersion,
      );
      if (sourceSyntax(normalized, fileName) !== sourceSyntax(
        before.getText(base.source),
        fileName,
      )) throw new Error('Cloud binding changed beyond the reviewed version-prefix increase');
      continue;
    }
    const beforeTokens = beforeStatements.flatMap(statement => (
      syntaxSignature(statement, base.source)
    ));
    const afterTokens = afterStatements.flatMap(statement => (
      syntaxSignature(statement, current.source)
    ));
    if (beforeTokens.length !== afterTokens.length) {
      throw new Error('Cloud binding changed beyond the reviewed version-prefix increase');
    }
    for (let index = 0; index < beforeTokens.length; index += 1) {
      const [beforeKind, beforeText] = beforeTokens[index];
      const [afterKind, afterText] = afterTokens[index];
      if (beforeKind === afterKind && beforeText === afterText) continue;
      const quotedVersion = new RegExp(`^(['"])v${baseVersion}\\1$`, 'u');
      const routePrefix = new RegExp(`^(['"\\x60])/v${baseVersion}/`, 'u');
      const expected = name === 'matchCollabCloudRoute' && quotedVersion.test(beforeText)
        ? beforeText.replace(`v${baseVersion}`, `v${currentVersion}`)
        : routePrefixOwners.has(name) && routePrefix.test(beforeText)
          ? beforeText.replace(`/v${baseVersion}/`, `/v${currentVersion}/`)
          : null;
      if (
        beforeKind !== afterKind
        || !literalKinds.has(beforeKind)
        || expected !== afterText
      ) throw new Error('Cloud binding changed beyond the reviewed version-prefix increase');
    }
  }
}

function assertIndexAddition(baseSource, currentSource, allowedNames) {
  const exportsByKey = (sourceText) => {
    const source = sourceFile(sourceText, 'src/index.ts');
    const result = new Map();
    const other = [];
    for (const statement of source.statements) {
      if (
        ts.isExportDeclaration(statement)
        && statement.moduleSpecifier
        && ts.isStringLiteral(statement.moduleSpecifier)
        && statement.moduleSpecifier.text === './CollabAuthorityTransfer'
        && statement.exportClause
        && ts.isNamedExports(statement.exportClause)
      ) {
        const key = statement.isTypeOnly ? 'types' : 'values';
        const entries = result.get(key) ?? [];
        entries.push(...statement.exportClause.elements.map(element => ({
          aliased: element.propertyName !== undefined,
          exported: element.name.text,
          local: element.propertyName?.text ?? element.name.text,
        })));
        result.set(key, entries);
      } else {
        other.push(stableJson(syntaxSignature(statement, source)));
      }
    }
    return { other, result };
  };
  const base = exportsByKey(baseSource);
  const current = exportsByKey(currentSource);
  if (stableJson(base.other) !== stableJson(current.other)) {
    throw new Error('Protocol index changed outside authority-transfer exports');
  }
  for (const key of ['types', 'values']) {
    const before = base.result.get(key) ?? [];
    const after = current.result.get(key) ?? [];
    const beforeByExport = new Map(before.map(entry => [entry.exported, entry]));
    const afterByExport = new Map(after.map(entry => [entry.exported, entry]));
    if (
      beforeByExport.size !== before.length
      || afterByExport.size !== after.length
      || [...beforeByExport].some(([exported, entry]) => (
        stableJson(afterByExport.get(exported)) !== stableJson(entry)
      ))
    ) {
      throw new Error('Protocol index removed or changed an authority-transfer export');
    }
    for (const { aliased, exported, local } of after) {
      if (beforeByExport.has(exported)) continue;
      if (aliased || local !== exported) {
        throw new Error(`Protocol index added an aliased authority-transfer export: ${exported}`);
      }
      if (!allowedNames.has(exported)) {
        throw new Error(`Protocol index added an unreachable authority-transfer export: ${exported}`);
      }
    }
  }
}

export function assertAuthorityTransferOperationSourceAddition(input) {
  const requiredPaths = [
    'src/CollabAuthorityTransfer.ts',
    'src/CollabCloudBinding.ts',
    'src/CollabConstants.ts',
    'src/CollabControlOperationCodecs.ts',
    'src/index.ts',
  ];
  if (
    !Array.isArray(input?.addedOperations)
    || input.addedOperations.length === 0
    || requiredPaths.some(pathname => typeof input.baseFiles?.[pathname] !== 'string'
      || typeof input.currentFiles?.[pathname] !== 'string')
  ) throw new Error('Invalid authority-transfer operation source review input');
  const additions = [...input.addedOperations].sort();
  const authorityPath = 'src/CollabAuthorityTransfer.ts';
  const baseAuthority = parsedTopLevel(input.baseFiles[authorityPath], authorityPath);
  const currentAuthority = parsedTopLevel(input.currentFiles[authorityPath], authorityPath);
  const allowedChanged = new Set([
    'COLLAB_AUTHORITY_TRANSFER_OPERATIONS',
    'CollabAuthorityTransferOperationMap',
    'decodeCollabAuthorityTransferOperationRequest',
  ]);
  assertOnlyNamedChange(baseAuthority, currentAuthority, allowedChanged, 'Authority-transfer contract');
  assertSourceOperationTuple(
    baseAuthority.named.get('COLLAB_AUTHORITY_TRANSFER_OPERATIONS')?.statement,
    currentAuthority.named.get('COLLAB_AUTHORITY_TRANSFER_OPERATIONS')?.statement,
    additions,
  );
  const baseMap = baseAuthority.named.get('CollabAuthorityTransferOperationMap');
  const currentMap = currentAuthority.named.get('CollabAuthorityTransferOperationMap');
  if (
    !baseMap
    || !currentMap
    || !preservesOperationMembers(
      baseMap.statement.getText(baseMap.source),
      currentMap.statement.getText(currentMap.source),
      additions,
    )
  ) throw new Error('Authority-transfer operation map is not strictly additive');
  const baseDispatch = baseAuthority.named.get('decodeCollabAuthorityTransferOperationRequest');
  const currentDispatch = currentAuthority.named.get('decodeCollabAuthorityTransferOperationRequest');
  if (!baseDispatch || !currentDispatch) throw new Error('Authority-transfer dispatch is missing');
  assertDispatchAddition(baseDispatch, currentDispatch, additions);

  const newNames = new Set(
    [...currentAuthority.named.keys()].filter(name => !baseAuthority.named.has(name)),
  );
  const roots = new Set();
  operationMapAddedMembers(currentMap.statement, additions);
  const referenceGraph = topLevelReferenceGraph(input.currentFiles[authorityPath]);
  for (const name of referenceGraph.get('CollabAuthorityTransferOperationMap') ?? []) {
    if (newNames.has(name)) roots.add(name);
  }
  for (const operation of additions) roots.add(operationDecoderName(operation));
  const reachable = new Set();
  const pending = [...roots];
  const expandReachable = () => {
    while (pending.length > 0) {
      const name = pending.pop();
      if (reachable.has(name) || !newNames.has(name)) continue;
      reachable.add(name);
      const record = currentAuthority.named.get(name);
      if (!record) continue;
      for (const dependency of referenceGraph.get(name) ?? []) {
        if (newNames.has(dependency) && !reachable.has(dependency)) pending.push(dependency);
      }
    }
  };
  expandReachable();
  for (const name of newNames) {
    const record = currentAuthority.named.get(name);
    if (!record || !ts.isFunctionDeclaration(record.statement) || !hasModifier(
      record.statement,
      ts.SyntaxKind.ExportKeyword,
    )) continue;
    const signingPayload = [...reachable].find(typeName => (
      typeName.endsWith('ProofSigningPayload')
      && name === `encode${typeName.replace(/SigningPayload$/u, '')}SigningInput`
    ));
    const [parameter] = record.statement.parameters;
    if (
      signingPayload !== undefined
      && (record.statement.typeParameters?.length ?? 0) === 0
      && record.statement.parameters.length === 1
      && parameter.type
      && ts.isTypeReferenceNode(parameter.type)
      && ts.isIdentifier(parameter.type.typeName)
      && parameter.type.typeName.text === signingPayload
      && referenceGraph.get(name)?.has(signingPayload) === true
      && record.statement.type?.kind === ts.SyntaxKind.StringKeyword
    ) pending.push(name);
  }
  expandReachable();
  for (const name of newNames) {
    if (!reachable.has(name)) {
      throw new Error(`Authority-transfer contract added unreachable source declaration: ${name}`);
    }
  }

  const codecsPath = 'src/CollabControlOperationCodecs.ts';
  const baseCodecs = parsedTopLevel(input.baseFiles[codecsPath], codecsPath);
  const currentCodecs = parsedTopLevel(input.currentFiles[codecsPath], codecsPath);
  assertOnlyNamedChange(
    baseCodecs,
    currentCodecs,
    new Set(['COLLAB_CONTROL_OPERATION_CODECS']),
    'Control operation codecs',
  );
  if (currentCodecs.named.size !== baseCodecs.named.size) {
    throw new Error('Control operation codecs added an unrelated source declaration');
  }
  assertControlCodecAddition(
    baseCodecs.named.get('COLLAB_CONTROL_OPERATION_CODECS'),
    currentCodecs.named.get('COLLAB_CONTROL_OPERATION_CODECS'),
    additions,
  );

  const constantsPath = 'src/CollabConstants.ts';
  if (sourceSyntax(
    normalizedVersionSource(
      input.currentFiles[constantsPath],
      'COLLAB_PROTOCOL_VERSION',
      input.currentProtocolVersion,
      input.baseProtocolVersion,
    ),
    constantsPath,
  ) !== sourceSyntax(input.baseFiles[constantsPath], constantsPath)) {
    throw new Error('Protocol constants changed beyond the reviewed version increase');
  }
  const bindingPath = 'src/CollabCloudBinding.ts';
  assertCloudBindingVersionMigration(
    input.baseFiles[bindingPath],
    input.currentFiles[bindingPath],
    input.baseCloudBindingVersion,
    input.currentCloudBindingVersion,
  );
  assertIndexAddition(
    input.baseFiles['src/index.ts'],
    input.currentFiles['src/index.ts'],
    reachable,
  );
}

function assertVersionedOperationAdditionReview(base, current, review) {
  exactFields(review, VERSIONED_OPERATION_ADDITION_REVIEW_FIELDS, 'versioned operation addition review');
  if (
    review.schemaVersion !== 1
    || review.reviewKind !== 'versioned-operation-addition'
    || typeof review.reason !== 'string'
    || review.reason.trim().length === 0
    || review.reason.length > 4096
  ) throw new Error('Invalid versioned operation addition review');
  if (
    review.baseSnapshotSha256 !== snapshotDigest(base)
    || review.candidateSnapshotSha256 !== snapshotDigest(current)
  ) throw new Error('Versioned operation addition review does not match the exact base and candidate snapshots');

  const additions = operationAdditions(
    base.contract.wire.operations,
    current.contract.wire.operations,
  );
  if (
    stableJson(review.addedOperations) !== stableJson(additions)
    || stableJson(operationAdditions(
      base.contract.cloudBinding.jsonOperations,
      current.contract.cloudBinding.jsonOperations,
    )) !== stableJson(additions)
    || current.protocolVersion <= base.protocolVersion
    || current.cloudBindingVersion <= base.cloudBindingVersion
    || !isStringArraySubset(
      base.contract.publicRuntimeExports,
      current.contract.publicRuntimeExports,
    )
    || stableJson(withoutKeys(base.contract.wire, [
      'declarations',
      'operations',
      'runtimeBehaviorDigests',
    ])) !== stableJson(withoutKeys(current.contract.wire, [
      'declarations',
      'operations',
      'runtimeBehaviorDigests',
    ]))
    || stableJson(withoutKeys(base.contract.cloudBinding, [
      'declarations',
      'jsonOperations',
      'runtimeBehaviorDigests',
    ])) !== stableJson(withoutKeys(current.contract.cloudBinding, [
      'declarations',
      'jsonOperations',
      'runtimeBehaviorDigests',
    ]))
  ) throw new Error('Versioned operation addition review exceeds additive wire or Cloud semantics');

  const baseDeclarations = new Map(
    base.contract.publicDeclarations.map(entry => [entry.exportName, entry]),
  );
  const currentDeclarations = new Map(
    current.contract.publicDeclarations.map(entry => [entry.exportName, entry]),
  );
  for (const declaration of base.contract.publicDeclarations) {
    const candidate = currentDeclarations.get(declaration.exportName);
    if (!candidate) throw new Error(`Versioned operation review removed existing public declaration: ${declaration.exportName}`);
    if (
      stableJson(candidate) !== stableJson(declaration)
      && !isAllowedChangedOperationDeclaration(
        declaration,
        candidate,
        additions,
        { base, current },
      )
    ) throw new Error(`Versioned operation review changed existing public declaration: ${declaration.exportName}`);
  }
  const addedDeclarationSources = new Set();
  for (const declaration of current.contract.publicDeclarations) {
    if (baseDeclarations.has(declaration.exportName)) continue;
    if (!WIRE_MODULES.has(declaration.source) && !CLOUD_BINDING_MODULES.has(declaration.source)) {
      throw new Error(`Versioned operation review added a declaration outside protocol contracts: ${declaration.exportName}`);
    }
    addedDeclarationSources.add(declaration.source);
  }

  const allowedRuntimeModules = new Set([
    './CollabCloudBinding',
    './CollabConstants',
    './CollabControlOperationCodecs',
    './index',
    ...addedDeclarationSources,
  ]);
  const baseDigests = new Map(
    base.contract.runtimeBehaviorDigests.map(entry => [entry.path, entry.sha256]),
  );
  const currentDigests = new Map(
    current.contract.runtimeBehaviorDigests.map(entry => [entry.path, entry.sha256]),
  );
  for (const digest of base.contract.runtimeBehaviorDigests) {
    const candidate = currentDigests.get(digest.path);
    if (candidate === undefined) throw new Error(`Versioned operation review removed runtime module: ${digest.path}`);
    if (
      candidate !== digest.sha256
      && !allowedRuntimeModules.has(moduleForBehaviorPath(digest.path))
    ) throw new Error(`Versioned operation review changed unrelated runtime module: ${digest.path}`);
  }
  for (const digest of current.contract.runtimeBehaviorDigests) {
    if (
      !baseDigests.has(digest.path)
      && !allowedRuntimeModules.has(moduleForBehaviorPath(digest.path))
    ) throw new Error(`Versioned operation review added unrelated runtime module: ${digest.path}`);
  }
}

export function createVersionedOperationAdditionReview(base, current, reason) {
  validateCurrentSnapshot(base);
  validateCurrentSnapshot(current);
  const review = {
    schemaVersion: 1,
    baseSnapshotSha256: snapshotDigest(base),
    candidateSnapshotSha256: snapshotDigest(current),
    reviewKind: 'versioned-operation-addition',
    addedOperations: operationAdditions(
      base.contract.wire.operations,
      current.contract.wire.operations,
    ),
    reason,
  };
  assertVersionedOperationAdditionReview(base, current, review);
  return review;
}

function assertImplementationOnlyReview(base, current, review) {
  exactFields(review, IMPLEMENTATION_REVIEW_FIELDS, 'implementation-only review');
  if (
    review.schemaVersion !== 1
    || typeof review.reason !== 'string'
    || review.reason.trim().length === 0
    || review.reason.length > 4096
  ) throw new Error('Invalid implementation-only review');
  if (
    review.baseSnapshotSha256 !== snapshotDigest(base)
    || review.candidateSnapshotSha256 !== snapshotDigest(current)
  ) throw new Error('Implementation-only review does not match the exact base and candidate snapshots');
  if (stableJson(contractSemantics(base)) !== stableJson(contractSemantics(current))) {
    throw new Error('Implementation-only review cannot change public API, wire, or Cloud binding semantic facts');
  }
}

export function createImplementationOnlyReview(base, current, reason) {
  validateCurrentSnapshot(base);
  validateCurrentSnapshot(current);
  const review = {
    schemaVersion: 1,
    baseSnapshotSha256: snapshotDigest(base),
    candidateSnapshotSha256: snapshotDigest(current),
    reason,
  };
  assertImplementationOnlyReview(base, current, review);
  return review;
}

export function assertVersionedContractChange(base, current, review) {
  validateCurrentSnapshot(base);
  validateCurrentSnapshot(current);
  const versionedOperationAddition = review?.reviewKind === 'versioned-operation-addition';
  if (versionedOperationAddition) {
    assertVersionedOperationAdditionReview(base, current, review);
  } else if (review !== undefined) {
    assertImplementationOnlyReview(base, current, review);
  }
  const failures = [];
  if (compareSemver(current.packageVersion, base.packageVersion) < 0) {
    failures.push('package version cannot decrease');
  }
  if (current.protocolVersion < base.protocolVersion) {
    failures.push('wire protocol version cannot decrease');
  }

  if (current.cloudBindingVersion < base.cloudBindingVersion) {
    failures.push('Cloud binding version cannot decrease');
  }
  const classification = versionedOperationAddition
    ? 'minor'
    : review === undefined ? classifyPackageApiChange(base, current) : 'none';
  if (!packageReleaseSatisfies(base.packageVersion, current.packageVersion, classification)) {
    failures.push(classification === 'major'
      ? 'public API change requires a package major release'
      : 'additive public API requires a package minor or major release');
  }
  const comparedContract = review !== undefined && !versionedOperationAddition
    ? withoutImplementationDigests
    : value => value;
  if (
    stableJson(comparedContract(base.contract.wire)) !== stableJson(comparedContract(current.contract.wire))
    && current.protocolVersion <= base.protocolVersion
  ) {
    failures.push('wire protocol version must increase for a wire contract change');
  }
  if (
    stableJson(comparedContract(effectiveCloudBindingContract(base)))
      !== stableJson(comparedContract(effectiveCloudBindingContract(current)))
    && current.cloudBindingVersion <= base.cloudBindingVersion
  ) {
    failures.push('Cloud binding version must increase for a Cloud binding change');
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

function hasModifier(statement, kind) {
  return statement.modifiers?.some(modifier => modifier.kind === kind) ?? false;
}

function declarationText(statement, sourceFile) {
  return statement.getText(sourceFile).replace(/\r\n/gu, '\n');
}

export function publicDeclarationsFromDist(distRoot) {
  const indexPath = path.join(distRoot, 'index.d.ts');
  if (!existsSync(indexPath)) throw new Error(`Declaration entry point is missing: ${indexPath}`);
  const indexSource = ts.createSourceFile(
    indexPath,
    readFileSync(indexPath, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const declarations = [];
  for (const statement of indexSource.statements) {
    if (ts.isExportDeclaration(statement)) {
      if (
        !statement.moduleSpecifier
        || !ts.isStringLiteral(statement.moduleSpecifier)
        || !statement.exportClause
        || !ts.isNamedExports(statement.exportClause)
      ) {
        throw new Error(`Unsupported public export declaration: ${declarationText(statement, indexSource)}`);
      }
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
        const matches = declarationSource.statements
          .filter(item => declaredNames(item).includes(localName));
        if (matches.length === 0) {
          throw new Error(`Cannot resolve public declaration ${localName} from ${moduleName}`);
        }
        declarations.push({
          declaration: matches.map(item => declarationText(item, declarationSource)).join('\n'),
          exportName: element.name.text,
          source: moduleName,
        });
      }
      continue;
    }
    if (ts.isExportAssignment(statement) || ts.isNamespaceExportDeclaration(statement)) {
      throw new Error(`Unsupported public declaration: ${declarationText(statement, indexSource)}`);
    }
    if (!hasModifier(statement, ts.SyntaxKind.ExportKeyword)) continue;
    const names = declaredNames(statement);
    const isDefault = hasModifier(statement, ts.SyntaxKind.DefaultKeyword);
    if (names.length === 0 && !isDefault) {
      throw new Error(`Cannot classify public declaration: ${declarationText(statement, indexSource)}`);
    }
    for (const exportName of isDefault ? ['default'] : names) {
      declarations.push({
        declaration: declarationText(statement, indexSource),
        exportName,
        source: '.',
      });
    }
  }
  return declarations.sort((left, right) => left.exportName.localeCompare(right.exportName, 'en-US'));
}

function publicDeclarations() {
  const distRoot = path.join(repositoryRoot, 'dist');
  if (!existsSync(distRoot)) throw new Error('dist is missing; run npm run build first');
  return publicDeclarationsFromDist(distRoot);
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
        checkpointArtifacts: [...protocol.COLLAB_PROJECT_CHECKPOINT_ARTIFACTS],
        capabilities: [...protocol.COLLAB_CLOUD_CAPABILITIES],
        eventKinds: [...protocol.COLLAB_CLOUD_EVENT_KINDS],
        jsonOperations: [...protocol.COLLAB_CLOUD_JSON_OPERATIONS],
        limits: {
          ...protocol.COLLAB_CLOUD_BINDING_LIMITS,
          maxJsonPayloadUtf8Bytes: protocol.COLLAB_LIMITS.maxJsonPayloadUtf8Bytes,
        },
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
    throw new Error(
      `Cannot read base protocol snapshot at ${baseSha}: ${stderr || 'commit unavailable'}`,
      { cause: error },
    );
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
    throw new Error(
      `Cannot read base protocol snapshot at ${baseSha}: ${stderr.trim() || error.message}`,
      { cause: error },
    );
  }
}

const AUTHORITY_TRANSFER_ADDITION_SOURCE_PATHS = Object.freeze([
  'src/CollabAuthorityTransfer.ts',
  'src/CollabCloudBinding.ts',
  'src/CollabConstants.ts',
  'src/CollabControlOperationCodecs.ts',
  'src/index.ts',
]);

function authorityTransferSourceReviewInput(baseSha, base, current) {
  const basePaths = execFileSync(
    'git',
    ['ls-tree', '-r', '--name-only', baseSha, 'src'],
    { cwd: repositoryRoot, encoding: 'utf8' },
  ).trim().split('\n').filter(pathname => pathname.endsWith('.ts')).sort();
  const currentPaths = sourceFiles().map(absolutePath => (
    path.posix.join('src', path.relative(
      path.join(repositoryRoot, 'src'),
      absolutePath,
    ).split(path.sep).join('/'))
  ));
  if (stableJson(basePaths) !== stableJson(currentPaths)) {
    throw new Error('Versioned authority-transfer operation review cannot add or remove source modules');
  }
  const allowed = new Set(AUTHORITY_TRANSFER_ADDITION_SOURCE_PATHS);
  const baseFiles = {};
  const currentFiles = {};
  for (const pathname of basePaths) {
    const baseSource = execFileSync('git', ['show', `${baseSha}:${pathname}`], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    });
    const currentSource = readFileSync(path.join(repositoryRoot, pathname), 'utf8');
    if (baseSource !== currentSource && !allowed.has(pathname)) {
      throw new Error(`Versioned authority-transfer operation review changed unrelated source: ${pathname}`);
    }
    if (allowed.has(pathname)) {
      baseFiles[pathname] = baseSource;
      currentFiles[pathname] = currentSource;
    }
  }
  return {
    addedOperations: operationAdditions(
      base.contract.wire.operations,
      current.contract.wire.operations,
    ),
    baseCloudBindingVersion: base.cloudBindingVersion,
    baseFiles,
    baseProtocolVersion: base.protocolVersion,
    currentCloudBindingVersion: current.cloudBindingVersion,
    currentFiles,
    currentProtocolVersion: current.protocolVersion,
  };
}

function assertReviewedSourceChange(baseSha, base, current, review) {
  if (review?.reviewKind !== 'versioned-operation-addition') return;
  assertAuthorityTransferOperationSourceAddition(
    authorityTransferSourceReviewInput(baseSha, base, current),
  );
}

function run() {
  const args = process.argv.slice(2);
  const write = args.includes('--write');
  const baseIndex = args.indexOf('--base');
  const baseSha = baseIndex >= 0 ? args[baseIndex + 1] : null;
  if (baseIndex >= 0 && !baseSha) throw new Error('--base requires a commit SHA');
  if (write && baseSha) throw new Error('--write cannot be combined with --base');
  if (!write && !baseSha) throw new Error('Compatibility check requires --base unless --write');
  const implementationReviewIndex = args.indexOf('--record-implementation-only-review');
  const operationReviewIndex = args.indexOf('--record-versioned-operation-addition-review');
  if (implementationReviewIndex >= 0 && operationReviewIndex >= 0) {
    throw new Error('Only one compatibility review kind may be recorded');
  }
  const reviewIndex = implementationReviewIndex >= 0
    ? implementationReviewIndex
    : operationReviewIndex;
  const reviewReason = reviewIndex >= 0 ? args[reviewIndex + 1] : null;
  if (reviewIndex >= 0 && (!baseSha || !reviewReason || reviewReason.startsWith('--') || write)) {
    throw new Error('--record-implementation-only-review requires a reason, --base, and a current written snapshot');
  }
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
    if (!base) throw new Error('Compatibility comparison requires an existing base snapshot');
    if (reviewReason !== null) {
        if (operationReviewIndex >= 0) {
          assertAuthorityTransferOperationSourceAddition(
            authorityTransferSourceReviewInput(baseSha, base, committed),
          );
        }
        const review = operationReviewIndex >= 0
          ? createVersionedOperationAdditionReview(base, committed, reviewReason)
          : createImplementationOnlyReview(base, committed, reviewReason);
        assertVersionedContractChange(base, committed, review);
        writeFileSync(reviewPath, `${JSON.stringify(review, null, 2)}\n`);
        process.stdout.write(`Recorded ${reviewRelativePath}\n`);
    } else {
      try {
        assertVersionedContractChange(base, committed);
      } catch (error) {
        if (!existsSync(reviewPath)) throw error;
        const review = JSON.parse(readFileSync(reviewPath, 'utf8'));
        assertReviewedSourceChange(baseSha, base, committed, review);
        assertVersionedContractChange(base, committed, review);
      }
    }
  }
  process.stdout.write('Collab protocol compatibility: PASS\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) run();
