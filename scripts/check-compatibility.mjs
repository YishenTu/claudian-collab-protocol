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
  './operations/CollabAuthorityTransfer',
  './core/CollabConstants',
  './operations/CollabControlOperationCodecs',
  './core/CollabError',
  './operations/CollabProtocol',
  './operations/CollabProjectMembership',
  './checkpoints/CollabProjectCheckpoint',
  './operations/CollabProjectRetirement',
  './operations/CollabRequestTicketRequestCodecs',
  './operations/CollabRequestTicketResponseCodecs',
  './core/CollabValidation',
  './core/types',
]);
const CLOUD_BINDING_MODULES = new Set([
  './cloud/CollabCloudBinding',
  './cloud/CollabCloudProjectEvent',
  './cloud/CollabCloudProjectSnapshot',
  './cloud/DevelopmentBootstrap',
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
    base.exportName === 'CollabControlOperationMap'
    || base.exportName === 'CollabAuthorityTransferOperationMap'
    || base.exportName === 'COLLAB_CONTROL_OPERATION_CODECS'
  ) return preservesOperationMembers(base.declaration, current.declaration, additions);
  if (base.exportName === 'COLLAB_AUTHORITY_TRANSFER_OPERATIONS') {
    return preservesOperationTuple(base.declaration, current.declaration, additions);
  }
  if (base.exportName === 'CollabRequestTicketOperation') {
    return preservesOperationUnion(base.declaration, current.declaration, additions);
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

function syntaxSignature(node, source, { omittedNodes = new Set() } = {}) {
  if (omittedNodes.has(node)) return [];
  const children = node.getChildren(source);
  if (children.length === 0) return [[node.kind, node.getText(source)]];
  return children.flatMap(child => syntaxSignature(child, source, { omittedNodes }));
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

function topLevelReferenceGraph(sourceText, { includeImports = false } = {}) {
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
    if (includeImports && ts.isImportDeclaration(statement)) {
      const bindings = statement.importClause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) {
          const symbol = checker.getSymbolAtLocation(element.name);
          if (symbol) symbols.set(symbol, element.name.text);
        }
      }
    }
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

function assertExistingReferenceBindings(baseParsed, currentParsed, newBindings) {
  // Restore existing declarations while retaining candidate module bindings. This lets
  // the checker detect capture without counting references introduced by new cases.
  const retainedSource = currentParsed.source.statements.map(statement => {
    const [name] = declaredNames(statement);
    const original = baseParsed.named.get(name);
    return original ? original.statement.getText(original.source) : statement.getText(currentParsed.source);
  }).join('\n');
  const retainedReferences = topLevelReferenceGraph(retainedSource, { includeImports: true });
  for (const name of baseParsed.named.keys()) {
    for (const reference of retainedReferences.get(name) ?? []) {
      if (newBindings.has(reference)) {
        throw new Error(`Operation addition changed an existing reference binding: ${name} -> ${reference}`);
      }
    }
  }
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

function assertDispatchAddition(baseRecord, currentRecord, additions, inputName = 'value', suffix = '') {
  const baseCases = caseClauses(baseRecord.statement);
  const currentCases = caseClauses(currentRecord.statement);
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
  const addedNodes = new Set(additions.map(operation => currentCases.get(operation)));
  if (stableJson(syntaxSignature(baseRecord.statement, baseRecord.source))
    !== stableJson(syntaxSignature(currentRecord.statement, currentRecord.source, { omittedNodes: addedNodes }))) {
    throw new Error('Operation dispatch changed existing clause sequence or surrounding source');
  }
  const operationSwitches = record => {
    const result = [];
    function visit(node) {
      if (ts.isSwitchStatement(node)) {
        result.push(node);
      }
      ts.forEachChild(node, visit);
    }
    visit(record.statement);
    return result;
  };
  const baseSwitches = operationSwitches(baseRecord);
  const currentSwitches = operationSwitches(currentRecord);
  if (baseSwitches.length !== 1 || currentSwitches.length !== 1) {
    throw new Error('Operation dispatch requires one existing operation switch');
  }
  const [currentSwitch] = currentSwitches;
  if (!ts.isIdentifier(currentSwitch.expression) || currentSwitch.expression.text !== 'operation') {
    throw new Error('Operation dispatch must switch on the canonical operation parameter');
  }
  if (currentSwitch.caseBlock.clauses.slice(0, additions.length).some(clause => !addedNodes.has(clause))
    || [...addedNodes].some(clause => clause.parent !== currentSwitch.caseBlock)) {
    throw new Error('Operation dispatch additions must be a leading prefix of the existing operation switch');
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
      || expression.expression.text !== `${operationDecoderName(operation)}${suffix}`
      || expression.arguments.length !== 1
      || !ts.isIdentifier(expression.arguments[0])
      || expression.arguments[0].text !== inputName
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

export function assertCloudBindingVersionMigration(
  baseSource,
  currentSource,
  baseVersion,
  currentVersion,
  reviewedDeclarations = new Set(),
) {
  const fileName = 'src/cloud/CollabCloudBinding.ts';
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
    if (reviewedDeclarations.has(name)
      && name !== 'COLLAB_CLOUD_BINDING_VERSION'
      && name !== 'matchCollabCloudRoute'
      && !routePrefixOwners.has(name)) continue;
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

function assertIndexAddition(baseSource, currentSource, allowedNames, modules = new Set(['./operations/CollabAuthorityTransfer'])) {
  const exportsByKey = (sourceText) => {
    const source = sourceFile(sourceText, 'src/index.ts');
    const result = new Map();
    const other = [];
    for (const statement of source.statements) {
      if (
        ts.isExportDeclaration(statement)
        && statement.moduleSpecifier
        && ts.isStringLiteral(statement.moduleSpecifier)
        && modules.has(statement.moduleSpecifier.text)
        && statement.exportClause
        && ts.isNamedExports(statement.exportClause)
      ) {
        const key = `${statement.moduleSpecifier.text}:${statement.isTypeOnly ? 'types' : 'values'}`;
        const entries = result.get(key) ?? [];
        entries.push(...statement.exportClause.elements.map(element => ({
          aliased: element.propertyName !== undefined,
          typeOnly: element.isTypeOnly,
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
  for (const key of [...modules].flatMap(module => [`${module}:types`, `${module}:values`])) {
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

function preservesOperationUnion(baseText, currentText, additions) {
  const shape = text => {
    const source = sourceFile(text, 'operation-union.ts');
    const [statement] = source.statements;
    if (source.statements.length !== 1 || !ts.isTypeAliasDeclaration(statement)) return null;
    const types = ts.isUnionTypeNode(statement.type) ? statement.type.types : [statement.type];
    if (types.some(type => !ts.isLiteralTypeNode(type) || !ts.isStringLiteral(type.literal))) return null;
    return {
      header: syntaxSignature(statement, source, { omittedNodes: new Set([statement.type]) }),
      values: types.map(type => type.literal.text),
    };
  };
  const before = shape(baseText);
  const after = shape(currentText);
  return before !== null && after !== null
    && stableJson(before.header) === stableJson(after.header)
    && new Set(before.values).size === before.values.length
    && new Set(after.values).size === after.values.length
    && stableJson(after.values.filter(value => before.values.includes(value))) === stableJson(before.values)
    && stableJson(after.values.filter(value => !before.values.includes(value)).sort()) === stableJson(additions);
}

function assertRequestTicketImports(baseSource, currentSource, pathname) {
  const shape = text => {
    const parsed = parsedTopLevel(text, pathname);
    const imports = new Map();
    const other = [];
    for (const statement of parsed.source.statements) {
      if (!ts.isImportDeclaration(statement)) {
        if (declaredNames(statement).length === 0) other.push(syntaxSignature(statement, parsed.source));
        continue;
      }
      const clause = statement.importClause;
      const bindings = clause?.namedBindings;
      if (!ts.isStringLiteral(statement.moduleSpecifier) || !clause || clause.name
        || !bindings || !ts.isNamedImports(bindings) || statement.attributes) {
        other.push(syntaxSignature(statement, parsed.source));
        continue;
      }
      const key = `${statement.moduleSpecifier.text}:${clause.isTypeOnly}`;
      if (imports.has(key)) throw new Error('Request/Ticket review rejects duplicate import clauses');
      const entries = new Map();
      for (const element of bindings.elements) {
        if (entries.has(element.name.text)) throw new Error('Request/Ticket review rejects duplicate import bindings');
        entries.set(element.name.text, {
          aliased: element.propertyName !== undefined,
          signature: syntaxSignature(element, parsed.source),
        });
      }
      imports.set(key, entries);
    }
    return { imports, other, parsed };
  };
  const before = shape(baseSource);
  const after = shape(currentSource);
  if (stableJson(before.other) !== stableJson(after.other)
    || stableJson([...before.imports.keys()].sort()) !== stableJson([...after.imports.keys()].sort())) {
    throw new Error('Request/Ticket review changed unrelated module access or unnamed statements');
  }
  const added = new Set();
  for (const [key, entries] of before.imports) {
    const candidates = after.imports.get(key);
    for (const [name, entry] of entries) {
      if (stableJson(candidates.get(name)) !== stableJson(entry)) {
        throw new Error(`Request/Ticket review changed existing import identity: ${name}`);
      }
    }
    for (const [name, entry] of candidates) {
      if (entries.has(name)) continue;
      if (entry.aliased || added.has(name)) throw new Error('Request/Ticket review added aliased or duplicate imports');
      added.add(name);
    }
  }
  before.parsed.unnamed = [];
  after.parsed.unnamed = [];
  return { before: before.parsed, after: after.parsed, addedImports: added };
}

function assertSafeReasonAddition(before, after, additions) {
  const shape = record => {
    if (!record || !ts.isVariableStatement(record.statement)
      || record.statement.declarationList.declarations.length !== 1) return null;
    const initializer = record.statement.declarationList.declarations[0].initializer;
    if (!initializer) return null;
    const object = unwrapExpression(initializer);
    if (!ts.isObjectLiteralExpression(object)) return null;
    const properties = new Map();
    for (const property of object.properties) {
      if (!ts.isPropertyAssignment(property) || !ts.isStringLiteral(property.initializer)) return null;
      const name = propertyNameText(property.name);
      if (name === null || properties.has(name)) return null;
      properties.set(name, syntaxSignature(property, record.source));
    }
    return { properties, header: syntaxSignature(record.statement, record.source, { omittedNodes: new Set([object]) }) };
  };
  const base = shape(before);
  const current = shape(after);
  if (!base || !current || stableJson(base.header) !== stableJson(current.header)
    || [...base.properties].some(([name, entry]) => stableJson(current.properties.get(name)) !== stableJson(entry))
    || stableJson([...current.properties.keys()].filter(name => !base.properties.has(name)).sort()) !== stableJson(additions)) {
    throw new Error('Request/Ticket safe reasons are not strictly additive');
  }
}

export function assertRequestTicketOperationSourceAddition(input) {
  const moduleChanges = new Map([
    ['src/operations/CollabProtocol.ts', new Set(['CollabControlOperationMap'])],
    ['src/operations/CollabRequestTicketRequestCodecs.ts', new Set(['CollabRequestTicketOperation', 'decodeRequestTicketRequest', 'INVALID_REASONS'])],
    ['src/operations/CollabRequestTicketResponseCodecs.ts', new Set()],
    ['src/operations/CollabControlOperationCodecs.ts', new Set(['decodeResponse', 'COLLAB_CONTROL_OPERATION_CODECS'])],
  ]);
  const requiredPaths = [...moduleChanges.keys(), 'src/core/CollabConstants.ts', 'src/cloud/CollabCloudBinding.ts', 'src/index.ts'];
  if (!Array.isArray(input?.addedOperations) || input.addedOperations.length === 0
    || requiredPaths.some(pathname => typeof input.baseFiles?.[pathname] !== 'string'
      || typeof input.currentFiles?.[pathname] !== 'string')) {
    throw new Error('Invalid Request/Ticket operation source review input');
  }
  const additions = [...input.addedOperations].sort();
  const modules = new Map();
  const exportNames = new Set();
  for (const [pathname, allowed] of moduleChanges) {
    const module = assertRequestTicketImports(input.baseFiles[pathname], input.currentFiles[pathname], pathname);
    assertOnlyNamedChange(module.before, module.after, allowed, 'Request/Ticket contract');
    const newNames = new Set([...module.after.named.keys()].filter(name => !module.before.named.has(name)));
    assertExistingReferenceBindings(module.before, module.after, new Set([...newNames, ...module.addedImports]));
    const graph = topLevelReferenceGraph(input.currentFiles[pathname], { includeImports: true });
    const roots = [...allowed];
    if (pathname.endsWith('ResponseCodecs.ts')) roots.push(...additions.map(operation => `${operationDecoderName(operation)}Response`));
    const reachable = new Set();
    const pending = [...roots];
    while (pending.length > 0) {
      const name = pending.pop();
      if (reachable.has(name)) continue;
      reachable.add(name);
      for (const dependency of graph.get(name) ?? []) {
        if (newNames.has(dependency) || module.addedImports.has(dependency)) pending.push(dependency);
      }
    }
    for (const name of [...newNames, ...module.addedImports]) {
      if (!reachable.has(name)) throw new Error(`Request/Ticket added unreachable declaration or import: ${name}`);
    }
    if (pathname.endsWith('ControlOperationCodecs.ts') && newNames.size !== 0) {
      throw new Error('Request/Ticket control codecs added unrelated declarations');
    }
    for (const name of newNames) exportNames.add(name);
    modules.set(pathname, module);
  }
  const protocol = modules.get('src/operations/CollabProtocol.ts');
  const baseMap = protocol.before.named.get('CollabControlOperationMap');
  const currentMap = protocol.after.named.get('CollabControlOperationMap');
  if (!baseMap || !currentMap || !preservesOperationMembers(baseMap.statement.getText(baseMap.source),
    currentMap.statement.getText(currentMap.source), additions)) {
    throw new Error('Request/Ticket operation map is not strictly additive');
  }
  const requests = modules.get('src/operations/CollabRequestTicketRequestCodecs.ts');
  const baseUnion = requests.before.named.get('CollabRequestTicketOperation');
  const currentUnion = requests.after.named.get('CollabRequestTicketOperation');
  if (!baseUnion || !currentUnion || !preservesOperationUnion(baseUnion.statement.getText(baseUnion.source),
    currentUnion.statement.getText(currentUnion.source), additions)) {
    throw new Error('Request/Ticket operation union is not strictly additive');
  }
  assertDispatchAddition(requests.before.named.get('decodeRequestTicketRequest'),
    requests.after.named.get('decodeRequestTicketRequest'), additions, 'input');
  assertSafeReasonAddition(requests.before.named.get('INVALID_REASONS'), requests.after.named.get('INVALID_REASONS'), additions);
  const codecs = modules.get('src/operations/CollabControlOperationCodecs.ts');
  assertDispatchAddition(codecs.before.named.get('decodeResponse'), codecs.after.named.get('decodeResponse'), additions, 'input', 'Response');
  assertControlCodecAddition(codecs.before.named.get('COLLAB_CONTROL_OPERATION_CODECS'),
    codecs.after.named.get('COLLAB_CONTROL_OPERATION_CODECS'), additions);
  const constantsPath = 'src/core/CollabConstants.ts';
  if (sourceSyntax(normalizedVersionSource(input.currentFiles[constantsPath], 'COLLAB_PROTOCOL_VERSION',
    input.currentProtocolVersion, input.baseProtocolVersion), constantsPath)
    !== sourceSyntax(input.baseFiles[constantsPath], constantsPath)) {
    throw new Error('Protocol constants changed beyond the reviewed version increase');
  }
  assertCloudBindingVersionMigration(input.baseFiles['src/cloud/CollabCloudBinding.ts'], input.currentFiles['src/cloud/CollabCloudBinding.ts'],
    input.baseCloudBindingVersion, input.currentCloudBindingVersion);
  assertIndexAddition(input.baseFiles['src/index.ts'], input.currentFiles['src/index.ts'], exportNames,
    new Set(['./operations/CollabProtocol', './operations/CollabRequestTicketRequestCodecs', './operations/CollabRequestTicketResponseCodecs']));
}

export function assertAuthorityTransferOperationSourceAddition(input) {
  const requiredPaths = [
    'src/operations/CollabAuthorityTransfer.ts',
    'src/cloud/CollabCloudBinding.ts',
    'src/core/CollabConstants.ts',
    'src/operations/CollabControlOperationCodecs.ts',
    'src/index.ts',
  ];
  if (
    !Array.isArray(input?.addedOperations)
    || input.addedOperations.length === 0
    || requiredPaths.some(pathname => typeof input.baseFiles?.[pathname] !== 'string'
      || typeof input.currentFiles?.[pathname] !== 'string')
  ) throw new Error('Invalid authority-transfer operation source review input');
  const additions = [...input.addedOperations].sort();
  const authorityPath = 'src/operations/CollabAuthorityTransfer.ts';
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
  assertExistingReferenceBindings(baseAuthority, currentAuthority, newNames);
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

  const codecsPath = 'src/operations/CollabControlOperationCodecs.ts';
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

  const constantsPath = 'src/core/CollabConstants.ts';
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
  const bindingPath = 'src/cloud/CollabCloudBinding.ts';
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
    './cloud/CollabCloudBinding',
    './core/CollabConstants',
    './operations/CollabControlOperationCodecs',
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

function optionalDeclarationAddition(beforeText, afterText) {
  const beforeSource = sourceFile(beforeText, 'before.d.ts');
  const afterSource = sourceFile(afterText, 'after.d.ts');
  if (beforeSource.statements.length !== 1 || afterSource.statements.length !== 1) return false;
  const [before] = beforeSource.statements;
  const [after] = afterSource.statements;
  const text = (node, source) => stableJson(syntaxSignature(node, source));
  if (ts.isInterfaceDeclaration(before) && ts.isInterfaceDeclaration(after)) {
    const beforeShape = declarationShape(beforeText);
    const afterShape = declarationShape(afterText);
    if (!beforeShape || !afterShape || beforeShape.header !== afterShape.header) return false;
    const previous = new Map(beforeShape.entries);
    const next = new Map(afterShape.entries);
    return next.size > previous.size
      && [...previous].every(([name, value]) => next.get(name) === value)
      && after.members.every(member => previous.has(propertyNameText(member.name)) || member.questionToken !== undefined);
  }
  if (ts.isFunctionDeclaration(before) && ts.isFunctionDeclaration(after)) {
    const header = (node, source) => stableJson({
      name: node.name?.text,
      modifiers: node.modifiers?.map(item => text(item, source)) ?? [],
      typeParameters: node.typeParameters?.map(item => text(item, source)) ?? [],
      result: node.type ? text(node.type, source) : null,
    });
    return header(before, beforeSource) === header(after, afterSource)
      && after.parameters.length > before.parameters.length
      && before.parameters.every((parameter, index) => text(parameter, beforeSource) === text(after.parameters[index], afterSource))
      && after.parameters.slice(before.parameters.length).every(parameter => parameter.questionToken !== undefined && parameter.dotDotDotToken === undefined);
  }
  return false;
}

function assertOptionalContractAdditionReview(base, current, review) {
  exactFields(review, new Set([...IMPLEMENTATION_REVIEW_FIELDS, 'reviewKind', 'implementationDeclarations']), 'optional contract addition review');
  if (review.schemaVersion !== 1 || review.reviewKind !== 'optional-contract-addition'
    || typeof review.reason !== 'string' || review.reason.trim().length === 0 || review.reason.length > 4096) {
    throw new Error('Invalid optional contract addition review');
  }
  if (review.baseSnapshotSha256 !== snapshotDigest(base) || review.candidateSnapshotSha256 !== snapshotDigest(current)) {
    throw new Error('Optional contract review does not match the exact base and candidate snapshots');
  }
  const semantics = contract => withoutKeys(contract, ['declarations', 'runtimeBehaviorDigests']);
  if (current.protocolVersion <= base.protocolVersion || current.cloudBindingVersion <= base.cloudBindingVersion
    || stableJson(semantics(base.contract.wire)) !== stableJson(semantics(current.contract.wire))
    || stableJson(semantics(base.contract.cloudBinding)) !== stableJson(semantics(current.contract.cloudBinding))
    || stableJson(base.contract.publicRuntimeExports) !== stableJson(current.contract.publicRuntimeExports)) {
    throw new Error('Optional contract review changed inventories or omitted a version increase');
  }
  const previous = keyedEntries(base.contract.publicDeclarations, 'exportName', 'public declaration');
  const next = keyedEntries(current.contract.publicDeclarations, 'exportName', 'public declaration');
  if (previous.size !== next.size) throw new Error('Optional contract review changed export inventory');
  const additions = new Set();
  for (const declaration of base.contract.publicDeclarations) {
    const candidate = current.contract.publicDeclarations.find(item => item.exportName === declaration.exportName);
    if (!candidate || candidate.source !== declaration.source) throw new Error('Optional contract review changed export inventory');
    if (stableJson(candidate) === stableJson(declaration)) continue;
    if (isAllowedChangedOperationDeclaration(declaration, candidate, [], { base, current })
      && ['COLLAB_PROTOCOL_VERSION', 'COLLAB_CLOUD_BINDING_VERSION'].includes(declaration.exportName)) continue;
    if (declaration.source !== './cloud/CollabCloudBinding'
      || !optionalDeclarationAddition(declaration.declaration, candidate.declaration)) {
      throw new Error(`Not an optional public addition: ${declaration.exportName}`);
    }
    additions.add(declaration.exportName);
  }
  if (additions.size === 0) throw new Error('Optional contract review requires an optional public addition');
  const graph = topLevelReferenceGraph(base.contract.publicDeclarations
    .filter(declaration => declaration.source === './cloud/CollabCloudBinding')
    .map(declaration => declaration.declaration).join('\n'));
  const reachesAddition = name => {
    const pending = [name];
    const visited = new Set();
    while (pending.length > 0) {
      const currentName = pending.pop();
      if (additions.has(currentName)) return true;
      if (visited.has(currentName)) continue;
      visited.add(currentName);
      pending.push(...(graph.get(currentName) ?? []));
    }
    return false;
  };
  const implementations = stringEntries(review.implementationDeclarations, 'implementation declaration');
  for (const name of implementations.keys()) {
    const declaration = base.contract.publicDeclarations.find(item => item.exportName === name);
    if (declaration?.source !== './cloud/CollabCloudBinding'
      || !ts.isFunctionDeclaration(sourceFile(declaration.declaration, 'contract.d.ts').statements[0])) {
      throw new Error('Optional contract implementation review must name an existing public function');
    }
    if (!reachesAddition(name)) {
      throw new Error('Optional contract implementation review must name a related codec');
    }
  }
  const beforeDigests = keyedEntries(base.contract.runtimeBehaviorDigests, 'path', 'runtime behavior digest');
  const afterDigests = keyedEntries(current.contract.runtimeBehaviorDigests, 'path', 'runtime behavior digest');
  if (beforeDigests.size !== afterDigests.size) throw new Error('Optional contract review changed runtime modules');
  for (const [pathname, value] of beforeDigests) {
    if (!afterDigests.has(pathname) || (afterDigests.get(pathname) !== value
      && !['src/core/CollabConstants.ts', 'src/cloud/CollabCloudBinding.ts'].includes(pathname))) {
      throw new Error('Optional contract review changed unrelated runtime modules');
    }
  }
}

export function createOptionalContractAdditionReview(base, current, reason, implementationDeclarations) {
  validateCurrentSnapshot(base);
  validateCurrentSnapshot(current);
  const review = {
    schemaVersion: 1,
    baseSnapshotSha256: snapshotDigest(base),
    candidateSnapshotSha256: snapshotDigest(current),
    reviewKind: 'optional-contract-addition',
    implementationDeclarations,
    reason,
  };
  assertOptionalContractAdditionReview(base, current, review);
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

function relocationPaths(base, current, moduleMoves) {
  const before = keyedEntries(base.contract.runtimeBehaviorDigests, 'path', 'runtime behavior digest');
  const after = keyedEntries(current.contract.runtimeBehaviorDigests, 'path', 'runtime behavior digest');
  if (!Array.isArray(moduleMoves) || moduleMoves.length === 0) throw new Error('Module relocation requires an explicit move map');
  const forward = new Map();
  const reverse = new Map();
  for (const move of moduleMoves) {
    exactFields(move, new Set(['from', 'to']), 'module move');
    for (const name of [move.from, move.to]) {
      if (typeof name !== 'string' || !/^src\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.ts$/u.test(name)) {
        throw new Error('Invalid module relocation path');
      }
    }
    if (move.from === move.to || move.from === 'src/index.ts' || move.to === 'src/index.ts'
      || !before.has(move.from) || !after.has(move.to)
      || forward.has(move.from) || reverse.has(move.to)) {
      throw new Error('Module relocation requires a one-to-one map of existing modules and preserves the root entry point');
    }
    forward.set(move.from, move.to);
    reverse.set(move.to, move.from);
  }
  const mapped = [...before.keys()].map(name => forward.get(name) ?? name).sort();
  if (stableJson(mapped) !== stableJson([...after.keys()].sort())) {
    throw new Error('Module relocation must preserve the complete source inventory');
  }
  return { before: new Set(before.keys()), after: new Set(after.keys()), forward, reverse };
}

function relocateSpecifiers(sourceText, fileName, paths, reverse, publicDeclarations = new Map()) {
  const parsed = sourceFile(sourceText, fileName);
  if (parsed.parseDiagnostics.length > 0) throw new Error(`Cannot parse relocated module: ${fileName}`);
  const edits = [];
  const originalName = reverse.get(fileName) ?? fileName;
  function moduleSpecifier(node, qualifier) {
    if (!ts.isStringLiteral(node)) throw new Error('Module relocation cannot review computed module access');
    if (!node.text.startsWith('.')) return;
    const extension = path.posix.extname(node.text);
    if (extension !== '' && extension !== '.js' && extension !== '.ts') {
      throw new Error('Module relocation cannot resolve this module extension');
    }
    const target = path.posix.normalize(path.posix.join(path.posix.dirname(fileName), node.text));
    const candidates = extension === ''
      ? [`${target}.ts`, `${target}/index.ts`]
      : [`${target.slice(0, -extension.length)}.ts`];
    const matches = candidates.filter(candidate => paths.has(candidate));
    if (matches.length !== 1) throw new Error(`Module relocation cannot resolve import unambiguously in ${fileName}`);
    const [targetPath] = matches;
    let declarationPath = targetPath;
    if (targetPath === 'src/index.ts' && qualifier && ts.isIdentifier(qualifier) && publicDeclarations.size > 0) {
      const declaration = publicDeclarations.get(qualifier.text);
      if (!declaration) throw new Error('Module relocation cannot resolve a root type re-export');
      declarationPath = declaration.source === '.' ? 'src/index.ts' : `src/${declaration.source.slice(2)}.ts`;
      if (!paths.has(declarationPath)) throw new Error('Module relocation type re-export has no source module');
      const names = [...new Set(sourceFile(declaration.declaration, declarationPath).statements.flatMap(declaredNames))];
      if (names.length !== 1) throw new Error('Module relocation cannot resolve an ambiguous type re-export');
      edits.push({ start: qualifier.getStart(parsed), end: qualifier.end, text: names[0] });
    }
    const originalTarget = reverse.get(declarationPath) ?? declarationPath;
    let specifier = path.posix.relative(path.posix.dirname(originalName), originalTarget).slice(0, -3) + extension;
    if (!specifier.startsWith('.')) specifier = `./${specifier}`;
    edits.push({ start: node.getStart(parsed), end: node.end, text: JSON.stringify(specifier) });
  }
  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      moduleSpecifier(node.moduleSpecifier);
    } else if (ts.isImportTypeNode(node)) {
      if (!ts.isLiteralTypeNode(node.argument)) throw new Error('Unsupported relocated import type');
      moduleSpecifier(node.argument.literal, node.qualifier);
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      moduleSpecifier(node.arguments[0]);
    } else if (ts.isMetaProperty(node)
      || (ts.isIdentifier(node) && ['__dirname', '__filename', 'require'].includes(node.text))) {
      throw new Error('Module relocation cannot review location-dependent runtime access');
    }
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  let result = sourceText;
  for (const edit of edits.sort((left, right) => right.start - left.start)) {
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
  }
  return result;
}

function relocatedContract(contract, paths, reverse) {
  keyedEntries(contract.publicDeclarations, 'exportName', 'public declaration');
  const publicDeclarations = new Map(contract.publicDeclarations.map(entry => [entry.exportName, entry]));
  const declarations = entries => entries.map(entry => {
    const fileName = entry.source === '.' ? 'src/index.ts' : `src/${entry.source.replace(/^\.\//u, '')}.ts`;
    if (!paths.has(fileName)) throw new Error('Module relocation declaration has no source module');
    const originalName = reverse.get(fileName) ?? fileName;
    return {
      ...entry,
      source: entry.source === '.' ? '.' : moduleForBehaviorPath(originalName),
      declaration: sourceSyntax(relocateSpecifiers(entry.declaration, fileName, paths, reverse, publicDeclarations), originalName),
    };
  });
  const digests = entries => {
    keyedEntries(entries, 'path', 'runtime behavior digest');
    return entries.map(entry => {
      if (!paths.has(entry.path)) throw new Error('Module relocation contract has an unknown source module');
      return { path: reverse.get(entry.path) ?? entry.path };
    }).sort((left, right) => left.path.localeCompare(right.path, 'en-US'));
  };
  const group = value => ({ ...value, declarations: declarations(value.declarations), runtimeBehaviorDigests: digests(value.runtimeBehaviorDigests) });
  return {
    ...contract,
    publicDeclarations: declarations(contract.publicDeclarations),
    runtimeBehaviorDigests: digests(contract.runtimeBehaviorDigests),
    wire: group(contract.wire),
    cloudBinding: group(contract.cloudBinding),
  };
}

function assertModuleRelocationReview(base, current, review) {
  exactFields(review, new Set([...IMPLEMENTATION_REVIEW_FIELDS, 'reviewKind', 'moduleMoves']), 'module relocation review');
  if (review.schemaVersion !== 1 || review.reviewKind !== 'module-relocation'
    || typeof review.reason !== 'string' || review.reason.trim().length === 0 || review.reason.length > 4096) {
    throw new Error('Invalid module relocation review');
  }
  if (review.baseSnapshotSha256 !== snapshotDigest(base) || review.candidateSnapshotSha256 !== snapshotDigest(current)) {
    throw new Error('Module relocation review does not match the exact base and candidate snapshots');
  }
  const paths = relocationPaths(base, current, review.moduleMoves);
  if (base.protocolVersion !== current.protocolVersion || base.cloudBindingVersion !== current.cloudBindingVersion
    || stableJson(relocatedContract(base.contract, paths.before, new Map()))
      !== stableJson(relocatedContract(current.contract, paths.after, paths.reverse))) {
    throw new Error('Module relocation cannot change public API, wire, or Cloud binding semantic facts');
  }
  return paths;
}

function assertModuleRelocationSource(baseSha, base, current, review) {
  const paths = assertModuleRelocationReview(base, current, review);
  const baseFiles = execFileSync('git', ['ls-tree', '-r', '--name-only', baseSha, 'src'],
    { cwd: repositoryRoot, encoding: 'utf8' }).trim().split('\n').filter(name => name.endsWith('.ts')).sort();
  const currentFiles = sourceFiles().map(name => path.relative(repositoryRoot, name).split(path.sep).join('/')).sort();
  if (stableJson(baseFiles) !== stableJson([...paths.before].sort())
    || stableJson(currentFiles) !== stableJson([...paths.after].sort())) {
    throw new Error('Module relocation snapshots must cover the complete source inventory');
  }
  for (const beforePath of baseFiles) {
    const afterPath = paths.forward.get(beforePath) ?? beforePath;
    const beforeText = execFileSync('git', ['show', `${baseSha}:${beforePath}`], { cwd: repositoryRoot, encoding: 'utf8' });
    const afterText = readFileSync(path.join(repositoryRoot, afterPath), 'utf8');
    if (sourceSyntax(relocateSpecifiers(beforeText, beforePath, paths.before, new Map()), beforePath)
      !== sourceSyntax(relocateSpecifiers(afterText, afterPath, paths.after, paths.reverse), beforePath)) {
      throw new Error(`Module relocation changed source beyond module specifiers: ${afterPath}`);
    }
  }
}

export function assertVersionedContractChange(base, current, review) {
  validateCurrentSnapshot(base);
  validateCurrentSnapshot(current);
  if (review?.reviewKind === 'module-relocation') {
    assertModuleRelocationReview(base, current, review);
    assertVersionedContractChange(base, { ...current, contract: base.contract });
    return;
  }
  const optionalContractAddition = review?.reviewKind === 'optional-contract-addition';
  const versionedOperationAddition = review?.reviewKind === 'versioned-operation-addition';
  if (optionalContractAddition) {
    assertOptionalContractAdditionReview(base, current, review);
  } else if (versionedOperationAddition) {
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
  const classification = versionedOperationAddition || optionalContractAddition
    ? 'minor'
    : review === undefined ? classifyPackageApiChange(base, current) : 'none';
  if (!packageReleaseSatisfies(base.packageVersion, current.packageVersion, classification)) {
    failures.push(classification === 'major'
      ? 'public API change requires a package major release'
      : 'additive public API requires a package minor or major release');
  }
  const comparedContract = review !== undefined && !versionedOperationAddition && !optionalContractAddition
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

export function assertVersionedOperationSourceAddition(input) {
  const additions = input?.addedOperations;
  if (!Array.isArray(additions) || additions.length === 0) throw new Error('Invalid versioned operation source review input');
  const families = [
    { pathname: 'src/operations/CollabAuthorityTransfer.ts', name: 'CollabAuthorityTransferOperationMap',
      paths: ['src/operations/CollabAuthorityTransfer.ts'], check: assertAuthorityTransferOperationSourceAddition },
    { pathname: 'src/operations/CollabProtocol.ts', name: 'CollabControlOperationMap',
      paths: ['src/operations/CollabProtocol.ts', 'src/operations/CollabRequestTicketRequestCodecs.ts', 'src/operations/CollabRequestTicketResponseCodecs.ts'],
      check: assertRequestTicketOperationSourceAddition },
  ].filter(family => {
    const before = input.baseFiles?.[family.pathname];
    const after = input.currentFiles?.[family.pathname];
    if (typeof before !== 'string' || typeof after !== 'string') return false;
    const baseMap = parsedTopLevel(before, family.pathname).named.get(family.name);
    const currentMap = parsedTopLevel(after, family.pathname).named.get(family.name);
    return baseMap !== undefined && currentMap !== undefined
      && preservesOperationMembers(baseMap.statement.getText(baseMap.source),
        currentMap.statement.getText(currentMap.source), [...additions].sort());
  });
  if (families.length !== 1) throw new Error('Versioned addition must belong to exactly one supported operation family');
  const [family] = families;
  const allowed = new Set([...family.paths, 'src/cloud/CollabCloudBinding.ts', 'src/core/CollabConstants.ts',
    'src/operations/CollabControlOperationCodecs.ts', 'src/index.ts']);
  if (stableJson(Object.keys(input.baseFiles).sort()) !== stableJson(Object.keys(input.currentFiles).sort())) {
    throw new Error('Versioned operation review cannot add or remove source modules');
  }
  for (const pathname of Object.keys(input.baseFiles)) {
    if (input.baseFiles[pathname] !== input.currentFiles[pathname] && !allowed.has(pathname)) {
      throw new Error(`Versioned operation review changed unrelated source: ${pathname}`);
    }
  }
  family.check(input);
}

function operationSourceReviewInput(baseSha, base, current) {
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
  const baseFiles = {};
  const currentFiles = {};
  for (const pathname of basePaths) {
    const baseSource = execFileSync('git', ['show', `${baseSha}:${pathname}`], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    });
    const currentSource = readFileSync(path.join(repositoryRoot, pathname), 'utf8');
    baseFiles[pathname] = baseSource;
    currentFiles[pathname] = currentSource;
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
  if (review?.reviewKind === 'module-relocation') {
    assertModuleRelocationSource(baseSha, base, current, review);
    return;
  }
  if (review?.reviewKind === 'optional-contract-addition') {
    const readBefore = pathname => execFileSync('git', ['show', `${baseSha}:${pathname}`], { cwd: repositoryRoot, encoding: 'utf8' });
    const constantsPath = 'src/core/CollabConstants.ts';
    const currentConstants = normalizedVersionSource(readFileSync(path.join(repositoryRoot, constantsPath), 'utf8'),
      'COLLAB_PROTOCOL_VERSION', current.protocolVersion, base.protocolVersion);
    if (sourceSyntax(readBefore(constantsPath), constantsPath) !== sourceSyntax(currentConstants, constantsPath)) {
      throw new Error('Optional contract review changed unrelated constants');
    }
    const changed = current.contract.publicDeclarations.filter(candidate => {
      const previous = base.contract.publicDeclarations.find(item => item.exportName === candidate.exportName);
      return previous && previous.declaration !== candidate.declaration && candidate.source === './cloud/CollabCloudBinding'
        && candidate.exportName !== 'COLLAB_CLOUD_BINDING_VERSION';
    }).map(item => item.exportName);
    assertCloudBindingVersionMigration(readBefore('src/cloud/CollabCloudBinding.ts'),
      readFileSync(path.join(repositoryRoot, 'src/cloud/CollabCloudBinding.ts'), 'utf8'),
      base.cloudBindingVersion, current.cloudBindingVersion,
      new Set([...changed, ...review.implementationDeclarations]));
    return;
  }
  if (review?.reviewKind !== 'versioned-operation-addition') return;
  assertVersionedOperationSourceAddition(
    operationSourceReviewInput(baseSha, base, current),
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
  const optionalReviewIndex = args.indexOf('--record-optional-contract-addition-review');
  const relocationReviewIndex = args.indexOf('--record-module-relocation-review');
  if ([implementationReviewIndex, operationReviewIndex, optionalReviewIndex, relocationReviewIndex].filter(index => index >= 0).length > 1) {
    throw new Error('Only one compatibility review kind may be recorded');
  }
  const reviewIndex = implementationReviewIndex >= 0
    ? implementationReviewIndex
    : operationReviewIndex >= 0 ? operationReviewIndex : optionalReviewIndex >= 0 ? optionalReviewIndex : relocationReviewIndex;
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
          assertVersionedOperationSourceAddition(
            operationSourceReviewInput(baseSha, base, committed),
          );
        }
        const movesIndex = args.indexOf('--module-moves');
        if (relocationReviewIndex >= 0 && (movesIndex < 0 || !args[movesIndex + 1] || args[movesIndex + 1].startsWith('--'))) {
          throw new Error('Module relocation review requires --module-moves <json-file>');
        }
        const review = relocationReviewIndex >= 0
          ? { schemaVersion: 1, reviewKind: 'module-relocation', reason: reviewReason,
            baseSnapshotSha256: snapshotDigest(base), candidateSnapshotSha256: snapshotDigest(committed),
            moduleMoves: JSON.parse(readFileSync(path.resolve(repositoryRoot, args[movesIndex + 1]), 'utf8')) }
          : optionalReviewIndex >= 0
          ? createOptionalContractAdditionReview(base, committed, reviewReason,
            (args[args.indexOf('--implementation-declarations') + 1] ?? '').split(',').filter(Boolean))
          : operationReviewIndex >= 0
          ? createVersionedOperationAdditionReview(base, committed, reviewReason)
          : createImplementationOnlyReview(base, committed, reviewReason);
        assertReviewedSourceChange(baseSha, base, committed, review);
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
