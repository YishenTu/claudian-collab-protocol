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
  './CollabAuthorityTransfer',
  './CollabConstants',
  './CollabControlOperationCodecs',
  './CollabError',
  './CollabProtocol',
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

const ADDITIVE_CONTROL_DECLARATIONS = new Set([
  'COLLAB_AUTHORITY_TRANSFER_OPERATIONS',
  'COLLAB_CONTROL_OPERATION_CODECS',
  'CollabAuthorityTransferOperationMap',
]);
const ADDITIVE_CONTROL_RUNTIME_PATHS = new Set([
  'src/CollabAuthorityTransfer.ts',
  'src/CollabControlOperationCodecs.ts',
]);
const CONTROL_OPERATION_ADDITION_PROOF = Symbol('control-operation-addition-proof');
const PROJECT_BACKUP_MODULE_ADDITION_PROOF = Symbol('project-backup-module-addition-proof');
const PROJECT_BACKUP_MODULE = './CollabProjectBackupCheckpoint';
const PROJECT_BACKUP_MODULE_PATH = 'src/CollabProjectBackupCheckpoint.ts';
const INDEX_MODULE_PATH = 'src/index.ts';

function entriesBy(entries, key, label) {
  keyedEntries(entries, key, label);
  return new Map(entries.map(entry => [entry[key], entry]));
}

function declarationStatement(declaration) {
  const source = ts.createSourceFile(
    'contract.d.ts',
    declaration,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  if (source.statements.length !== 1) return null;
  return { source, statement: source.statements[0] };
}

function typeLiteralMembers(declaration) {
  const parsed = declarationStatement(declaration);
  if (parsed === null) return null;
  const { source, statement } = parsed;
  let members;
  if (ts.isInterfaceDeclaration(statement)) {
    members = statement.members;
  } else if (ts.isVariableStatement(statement)) {
    const [item] = statement.declarationList.declarations;
    let type = item?.type;
    if (
      type
      && ts.isTypeReferenceNode(type)
      && ts.isIdentifier(type.typeName)
      && type.typeName.text === 'Readonly'
      && type.typeArguments?.length === 1
    ) [type] = type.typeArguments;
    if (!type || !ts.isTypeLiteralNode(type)) return null;
    members = type.members;
  } else {
    return null;
  }
  const result = new Map();
  for (const member of members) {
    if (!ts.isPropertySignature(member) || member.name === undefined) return null;
    const name = ts.isIdentifier(member.name) || ts.isStringLiteral(member.name)
      ? member.name.text
      : null;
    if (name === null || result.has(name)) return null;
    result.set(name, member.getText(source).replace(/\s+/gu, ' ').trim());
  }
  return result;
}

function readonlyTupleStrings(declaration) {
  const parsed = declarationStatement(declaration);
  if (parsed === null || !ts.isVariableStatement(parsed.statement)) return null;
  const [item] = parsed.statement.declarationList.declarations;
  let type = item?.type;
  if (type && ts.isTypeOperatorNode(type) && type.operator === ts.SyntaxKind.ReadonlyKeyword) {
    type = type.type;
  }
  if (!type || !ts.isTupleTypeNode(type)) return null;
  const values = [];
  for (const element of type.elements) {
    if (!ts.isLiteralTypeNode(element) || !ts.isStringLiteral(element.literal)) return null;
    values.push(element.literal.text);
  }
  return values;
}

function exactMemberAddition(baseDeclaration, currentDeclaration, addedOperations) {
  const base = typeLiteralMembers(baseDeclaration);
  const current = typeLiteralMembers(currentDeclaration);
  if (base === null || current === null) return false;
  for (const [name, declaration] of base) {
    if (current.get(name) !== declaration) return false;
  }
  const addedMembers = [...current.keys()].filter(name => !base.has(name)).sort();
  return stableJson(addedMembers) === stableJson([...addedOperations].sort());
}

function exactTupleAddition(baseDeclaration, currentDeclaration, addedOperations) {
  const base = readonlyTupleStrings(baseDeclaration);
  const current = readonlyTupleStrings(currentDeclaration);
  if (base === null || current === null) return false;
  if (stableJson(current.filter(value => !addedOperations.has(value))) !== stableJson(base)) {
    return false;
  }
  return stableJson(current.filter(value => addedOperations.has(value)).sort())
    === stableJson([...addedOperations].sort());
}

function unchangedExceptAddedEntries(baseEntries, currentEntries, key, allowedChanged) {
  const base = entriesBy(baseEntries, key, key);
  const current = entriesBy(currentEntries, key, key);
  for (const [name, entry] of base) {
    if (!current.has(name)) return false;
    if (stableJson(entry) !== stableJson(current.get(name)) && !allowedChanged.has(name)) {
      return false;
    }
  }
  return true;
}

function sourceFile(source, name) {
  const parsed = ts.createSourceFile(
    name,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  return parsed.parseDiagnostics.length === 0 ? parsed : null;
}

function syntaxFingerprint(node, source, omittedCaseOperations = new Set()) {
  if (
    ts.isCaseClause(node)
    && ts.isStringLiteral(node.expression)
    && omittedCaseOperations.has(node.expression.text)
  ) return '';
  const children = node.getChildren(source);
  if (children.length === 0) return `${node.kind}:${node.getText(source)}`;
  return `${node.kind}[${children
    .map(child => syntaxFingerprint(child, source, omittedCaseOperations))
    .filter(Boolean)
    .join('|')}]`;
}

function statementIdentity(statement, source) {
  if (ts.isImportDeclaration(statement)) {
    return `import:${statement.moduleSpecifier.getText(source)}:${syntaxFingerprint(statement, source)}`;
  }
  const names = declaredNames(statement);
  return names.length === 1 ? `declaration:${names[0]}` : null;
}

function statementMap(source) {
  const result = new Map();
  for (const statement of source.statements) {
    const identity = statementIdentity(statement, source);
    if (identity === null || result.has(identity)) return null;
    result.set(identity, statement);
  }
  return result;
}

function variableArrayStrings(statement) {
  if (!ts.isVariableStatement(statement)) return null;
  const [declaration] = statement.declarationList.declarations;
  const initializer = declaration?.initializer;
  let argument = ts.isCallExpression(initializer) ? initializer.arguments[0] : undefined;
  if (argument && ts.isAsExpression(argument)) argument = argument.expression;
  if (
    !initializer
    || !ts.isCallExpression(initializer)
    || initializer.arguments.length !== 1
    || initializer.expression.getText() !== 'Object.freeze'
    || !argument
    || !ts.isArrayLiteralExpression(argument)
  ) return null;
  const values = [];
  for (const element of argument.elements) {
    if (!ts.isStringLiteral(element)) return null;
    values.push(element.text);
  }
  return values;
}

function variableObjectMembers(statement, source) {
  if (!ts.isVariableStatement(statement)) return null;
  const [declaration] = statement.declarationList.declarations;
  const initializer = declaration?.initializer;
  let argument = ts.isCallExpression(initializer) ? initializer.arguments[0] : undefined;
  while (argument && (ts.isAsExpression(argument) || ts.isSatisfiesExpression(argument))) {
    argument = argument.expression;
  }
  if (
    !initializer
    || !ts.isCallExpression(initializer)
    || initializer.arguments.length !== 1
    || initializer.expression.getText(source) !== 'Object.freeze'
    || !argument
    || !ts.isObjectLiteralExpression(argument)
  ) return null;
  const result = new Map();
  for (const property of argument.properties) {
    if (!ts.isPropertyAssignment(property)) return null;
    const name = ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)
      ? property.name.text
      : null;
    if (name === null || result.has(name)) return null;
    result.set(name, Object.freeze({
      fingerprint: syntaxFingerprint(property, source),
      property,
    }));
  }
  return result;
}

function exactSourceMemberAddition(base, current, addedOperations) {
  if (!ts.isInterfaceDeclaration(base) || !ts.isInterfaceDeclaration(current)) return false;
  const baseMembers = new Map();
  const currentMembers = new Map();
  for (const [statement, target] of [[base, baseMembers], [current, currentMembers]]) {
    for (const member of statement.members) {
      if (!ts.isPropertySignature(member) || member.name === undefined) return false;
      const name = ts.isIdentifier(member.name) || ts.isStringLiteral(member.name)
        ? member.name.text
        : null;
      if (name === null || target.has(name)) return false;
      target.set(name, syntaxFingerprint(member, statement.getSourceFile()));
    }
  }
  for (const [name, fingerprint] of baseMembers) {
    if (currentMembers.get(name) !== fingerprint) return false;
  }
  return stableJson([...currentMembers.keys()].filter(name => !baseMembers.has(name)).sort())
    === stableJson([...addedOperations].sort());
}

function exactSourceObjectAddition(base, current, baseSource, currentSource, addedOperations) {
  const baseMembers = variableObjectMembers(base, baseSource);
  const currentMembers = variableObjectMembers(current, currentSource);
  if (baseMembers === null || currentMembers === null) return false;
  for (const [name, item] of baseMembers) {
    if (currentMembers.get(name)?.fingerprint !== item.fingerprint) return false;
  }
  const additions = [...currentMembers.keys()].filter(name => !baseMembers.has(name)).sort();
  if (stableJson(additions) !== stableJson([...addedOperations].sort())) return false;
  for (const operation of additions) {
    const property = currentMembers.get(operation)?.property;
    const initializer = property?.initializer;
    if (
      !initializer
      || !ts.isCallExpression(initializer)
      || initializer.typeArguments?.length
      || !ts.isIdentifier(initializer.expression)
      || initializer.expression.text !== 'codec'
      || initializer.arguments.length !== 1
      || !ts.isStringLiteral(initializer.arguments[0])
      || initializer.arguments[0].text !== operation
    ) return false;
  }
  return true;
}

function exactAddedDispatchCases(statement, addedOperations) {
  if (!ts.isFunctionDeclaration(statement)) return false;
  const counts = new Map([...addedOperations].map(operation => [operation, 0]));
  let valid = true;
  function visit(node) {
    if (
      ts.isCaseClause(node)
      && ts.isStringLiteral(node.expression)
      && addedOperations.has(node.expression.text)
    ) {
      const operation = node.expression.text;
      counts.set(operation, counts.get(operation) + 1);
      const [only] = node.statements;
      const call = only && ts.isReturnStatement(only) ? only.expression : undefined;
      valid = valid
        && node.statements.length === 1
        && call !== undefined
        && ts.isCallExpression(call)
        && !call.typeArguments?.length
        && ts.isIdentifier(call.expression)
        && /^decode[A-Z][A-Za-z0-9]*$/u.test(call.expression.text)
        && call.arguments.length === 1
        && ts.isIdentifier(call.arguments[0])
        && call.arguments[0].text === 'value';
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(statement);
  return valid && [...counts.values()].every(count => count === 1);
}

function compatibleAuthoritySourceAddition(baseSourceText, currentSourceText, addedOperations) {
  const baseSource = sourceFile(baseSourceText, 'base-authority.ts');
  const currentSource = sourceFile(currentSourceText, 'current-authority.ts');
  if (baseSource === null || currentSource === null) return false;
  const base = statementMap(baseSource);
  const current = statementMap(currentSource);
  if (base === null || current === null) return false;
  const operationInventory = 'declaration:COLLAB_AUTHORITY_TRANSFER_OPERATIONS';
  const operationMap = 'declaration:CollabAuthorityTransferOperationMap';
  const dispatchFunctions = new Set([
    'declaration:decodeCollabAuthorityTransferOperationRequest',
    'declaration:decodeCollabAuthorityTransferOperationResponse',
  ]);
  for (const [identity, baseStatement] of base) {
    const currentStatement = current.get(identity);
    if (currentStatement === undefined) return false;
    if (identity === operationInventory) {
      const before = variableArrayStrings(baseStatement);
      const after = variableArrayStrings(currentStatement);
      if (
        before === null
        || after === null
        || stableJson(after.filter(value => !addedOperations.has(value))) !== stableJson(before)
        || stableJson(after.filter(value => addedOperations.has(value)).sort())
          !== stableJson([...addedOperations].sort())
      ) return false;
      continue;
    }
    if (identity === operationMap) {
      if (!exactSourceMemberAddition(baseStatement, currentStatement, addedOperations)) {
        return false;
      }
      continue;
    }
    if (dispatchFunctions.has(identity)
      && !exactAddedDispatchCases(currentStatement, addedOperations)) return false;
    const currentFingerprint = syntaxFingerprint(
      currentStatement,
      currentSource,
      dispatchFunctions.has(identity) ? addedOperations : new Set(),
    );
    if (syntaxFingerprint(baseStatement, baseSource) !== currentFingerprint) return false;
  }
  for (const [identity, statement] of current) {
    if (base.has(identity)) continue;
    if (
      identity.startsWith('import:')
      || (!ts.isFunctionDeclaration(statement)
        && !ts.isInterfaceDeclaration(statement)
        && !ts.isTypeAliasDeclaration(statement))
    ) return false;
  }
  return true;
}

function compatibleCodecsSourceAddition(baseSourceText, currentSourceText, addedOperations) {
  const baseSource = sourceFile(baseSourceText, 'base-codecs.ts');
  const currentSource = sourceFile(currentSourceText, 'current-codecs.ts');
  if (baseSource === null || currentSource === null) return false;
  const base = statementMap(baseSource);
  const current = statementMap(currentSource);
  if (base === null || current === null) return false;
  const registry = 'declaration:COLLAB_CONTROL_OPERATION_CODECS';
  for (const [identity, baseStatement] of base) {
    const currentStatement = current.get(identity);
    if (currentStatement === undefined) return false;
    if (identity === registry) {
      if (!exactSourceObjectAddition(
        baseStatement,
        currentStatement,
        baseSource,
        currentSource,
        addedOperations,
      )) return false;
    } else if (
      syntaxFingerprint(baseStatement, baseSource)
      !== syntaxFingerprint(currentStatement, currentSource)
    ) return false;
  }
  return [...current.keys()].every(identity => base.has(identity));
}

export function proveCompatibleControlOperationAdditionSources({
  addedOperations,
  baseAuthoritySource,
  baseCodecsSource,
  currentAuthoritySource,
  currentCodecsSource,
}) {
  const operations = new Set(addedOperations);
  if (
    operations.size === 0
    || [...operations].some(operation => !/^[A-Za-z][A-Za-z0-9]*$/u.test(operation))
    || !compatibleAuthoritySourceAddition(
      baseAuthoritySource,
      currentAuthoritySource,
      operations,
    )
    || !compatibleCodecsSourceAddition(baseCodecsSource, currentCodecsSource, operations)
  ) return null;
  return Object.freeze({
    [CONTROL_OPERATION_ADDITION_PROOF]: true,
    addedOperations: Object.freeze([...operations].sort()),
    runtimeDigests: Object.freeze({
      base: Object.freeze({
        'src/CollabAuthorityTransfer.ts': digestTypeScriptBehavior(baseAuthoritySource),
        'src/CollabControlOperationCodecs.ts': digestTypeScriptBehavior(baseCodecsSource),
      }),
      current: Object.freeze({
        'src/CollabAuthorityTransfer.ts': digestTypeScriptBehavior(currentAuthoritySource),
        'src/CollabControlOperationCodecs.ts': digestTypeScriptBehavior(currentCodecsSource),
      }),
    }),
  });
}

function backupIndexExports(source) {
  const parsed = sourceFile(source, 'index.ts');
  if (parsed === null) return null;
  const exportedNames = new Set();
  const runtimeNames = new Set();
  const retainedFingerprints = [];
  for (const statement of parsed.statements) {
    if (
      !ts.isExportDeclaration(statement)
      || !statement.moduleSpecifier
      || !ts.isStringLiteral(statement.moduleSpecifier)
      || statement.moduleSpecifier.text !== PROJECT_BACKUP_MODULE
    ) {
      retainedFingerprints.push(syntaxFingerprint(statement, parsed));
      continue;
    }
    if (!statement.exportClause || !ts.isNamedExports(statement.exportClause)) return null;
    for (const element of statement.exportClause.elements) {
      if (element.propertyName || exportedNames.has(element.name.text)) return null;
      exportedNames.add(element.name.text);
      if (!statement.isTypeOnly && !element.isTypeOnly) runtimeNames.add(element.name.text);
    }
  }
  return Object.freeze({
    exportedNames: Object.freeze([...exportedNames].sort()),
    retainedFingerprints: Object.freeze(retainedFingerprints),
    runtimeNames: Object.freeze([...runtimeNames].sort()),
  });
}

function exportedModuleDeclarations(source) {
  const parsed = sourceFile(source, 'CollabProjectBackupCheckpoint.ts');
  if (parsed === null) return null;
  const names = new Set();
  for (const statement of parsed.statements) {
    if (!hasModifier(statement, ts.SyntaxKind.ExportKeyword)) continue;
    if (hasModifier(statement, ts.SyntaxKind.DefaultKeyword)) return null;
    for (const name of declaredNames(statement)) {
      if (names.has(name)) return null;
      names.add(name);
    }
  }
  return names;
}

export function proveCompatibleProjectBackupModuleAdditionSources({
  baseCheckpointSource,
  baseIndexSource,
  currentCheckpointSource,
  currentIndexSource,
  currentModuleSource,
}) {
  const base = backupIndexExports(baseIndexSource);
  const current = backupIndexExports(currentIndexSource);
  const moduleDeclarations = exportedModuleDeclarations(currentModuleSource);
  if (
    base === null
    || current === null
    || moduleDeclarations === null
    || baseCheckpointSource !== currentCheckpointSource
    || base.exportedNames.length !== 0
    || current.exportedNames.length === 0
    || stableJson(base.retainedFingerprints) !== stableJson(current.retainedFingerprints)
    || current.exportedNames.some(name => !moduleDeclarations.has(name))
  ) return null;
  return Object.freeze({
    [PROJECT_BACKUP_MODULE_ADDITION_PROOF]: true,
    checkpointSourceSha256: createHash('sha256')
      .update(currentCheckpointSource, 'utf8')
      .digest('hex'),
    exportedNames: current.exportedNames,
    runtimeDigests: Object.freeze({
      baseIndex: digestTypeScriptBehavior(baseIndexSource),
      currentIndex: digestTypeScriptBehavior(currentIndexSource),
      currentModule: digestTypeScriptBehavior(currentModuleSource),
    }),
    runtimeNames: current.runtimeNames,
  });
}

function isCompatibleProjectBackupModuleAddition(base, current, proof) {
  if (proof?.[PROJECT_BACKUP_MODULE_ADDITION_PROOF] !== true) return false;
  const baseDeclarations = entriesBy(
    base.contract.publicDeclarations,
    'exportName',
    'public declaration',
  );
  const currentDeclarations = entriesBy(
    current.contract.publicDeclarations,
    'exportName',
    'public declaration',
  );
  for (const [name, declaration] of baseDeclarations) {
    if (stableJson(currentDeclarations.get(name)) !== stableJson(declaration)) return false;
  }
  const addedDeclarations = [...currentDeclarations.entries()]
    .filter(([name]) => !baseDeclarations.has(name));
  if (
    stableJson(addedDeclarations.map(([name]) => name).sort())
      !== stableJson(proof.exportedNames)
    || addedDeclarations.some(([, declaration]) => declaration.source !== PROJECT_BACKUP_MODULE)
  ) return false;

  const baseRuntimeExports = new Set(base.contract.publicRuntimeExports);
  if ([...baseRuntimeExports].some(name => !current.contract.publicRuntimeExports.includes(name))) {
    return false;
  }
  const addedRuntimeExports = current.contract.publicRuntimeExports
    .filter(name => !baseRuntimeExports.has(name))
    .sort();
  if (stableJson(addedRuntimeExports) !== stableJson(proof.runtimeNames)) return false;

  const baseDigests = entriesBy(
    base.contract.runtimeBehaviorDigests,
    'path',
    'runtime behavior digest',
  );
  const currentDigests = entriesBy(
    current.contract.runtimeBehaviorDigests,
    'path',
    'runtime behavior digest',
  );
  for (const [pathName, digest] of baseDigests) {
    if (pathName === INDEX_MODULE_PATH) continue;
    if (stableJson(currentDigests.get(pathName)) !== stableJson(digest)) return false;
  }
  const addedDigestPaths = [...currentDigests.keys()]
    .filter(pathName => !baseDigests.has(pathName));
  if (
    stableJson(addedDigestPaths) !== stableJson([PROJECT_BACKUP_MODULE_PATH])
    || baseDigests.get(INDEX_MODULE_PATH)?.sha256 !== proof.runtimeDigests.baseIndex
    || currentDigests.get(INDEX_MODULE_PATH)?.sha256 !== proof.runtimeDigests.currentIndex
    || currentDigests.get(PROJECT_BACKUP_MODULE_PATH)?.sha256
      !== proof.runtimeDigests.currentModule
  ) return false;
  return true;
}

function proofMatchesRuntimeDigests(base, current, proof, addedOperations) {
  if (
    proof?.[CONTROL_OPERATION_ADDITION_PROOF] !== true
    || stableJson(proof.addedOperations) !== stableJson([...addedOperations].sort())
  ) return false;
  for (const [side, snapshot] of [['base', base], ['current', current]]) {
    const publicDigests = entriesBy(
      snapshot.contract.runtimeBehaviorDigests,
      'path',
      'runtime behavior digest',
    );
    const wireDigests = entriesBy(
      snapshot.contract.wire.runtimeBehaviorDigests,
      'path',
      'wire runtime behavior digest',
    );
    for (const pathName of ADDITIVE_CONTROL_RUNTIME_PATHS) {
      const expected = proof.runtimeDigests[side][pathName];
      if (
        publicDigests.get(pathName)?.sha256 !== expected
        || wireDigests.get(pathName)?.sha256 !== expected
      ) return false;
    }
  }
  return true;
}

function isCompatibleControlOperationAddition(base, current, proof) {
  const baseOperations = base.contract.wire?.operations;
  const currentOperations = current.contract.wire?.operations;
  if (!Array.isArray(baseOperations) || !Array.isArray(currentOperations)) return false;
  if (
    baseOperations.some(operation => typeof operation !== 'string')
    || currentOperations.some(operation => typeof operation !== 'string')
    || baseOperations.some(operation => !currentOperations.includes(operation))
  ) return false;
  const addedOperations = new Set(
    currentOperations.filter(operation => !baseOperations.includes(operation)),
  );
  if (
    addedOperations.size === 0
    || [...addedOperations].some(operation => !/^[A-Za-z][A-Za-z0-9]*$/u.test(operation))
    || !proofMatchesRuntimeDigests(base, current, proof, addedOperations)
  ) return false;

  const baseDeclarations = entriesBy(
    base.contract.publicDeclarations,
    'exportName',
    'public declaration',
  );
  const currentDeclarations = entriesBy(
    current.contract.publicDeclarations,
    'exportName',
    'public declaration',
  );
  if (!unchangedExceptAddedEntries(
    base.contract.publicDeclarations,
    current.contract.publicDeclarations,
    'exportName',
    ADDITIVE_CONTROL_DECLARATIONS,
  )) return false;
  if (!unchangedExceptAddedEntries(
    base.contract.runtimeBehaviorDigests,
    current.contract.runtimeBehaviorDigests,
    'path',
    ADDITIVE_CONTROL_RUNTIME_PATHS,
  )) return false;
  if (classifyMapChange(
    stringEntries(base.contract.publicRuntimeExports, 'public runtime export'),
    stringEntries(current.contract.publicRuntimeExports, 'public runtime export'),
  ) === 'major') return false;

  for (const exportName of ADDITIVE_CONTROL_DECLARATIONS) {
    const before = baseDeclarations.get(exportName)?.declaration;
    const after = currentDeclarations.get(exportName)?.declaration;
    if (typeof before !== 'string' || typeof after !== 'string') return false;
    const valid = exportName === 'COLLAB_AUTHORITY_TRANSFER_OPERATIONS'
      ? exactTupleAddition(before, after, addedOperations)
      : exactMemberAddition(before, after, addedOperations);
    if (!valid) return false;
  }

  const baseWire = base.contract.wire;
  const currentWire = current.contract.wire;
  const wireKeys = new Set([...Object.keys(baseWire), ...Object.keys(currentWire)]);
  for (const key of wireKeys) {
    if (key === 'declarations' || key === 'operations' || key === 'runtimeBehaviorDigests') {
      continue;
    }
    if (stableJson(baseWire[key]) !== stableJson(currentWire[key])) return false;
  }
  return unchangedExceptAddedEntries(
    baseWire.declarations,
    currentWire.declarations,
    'exportName',
    ADDITIVE_CONTROL_DECLARATIONS,
  ) && unchangedExceptAddedEntries(
    baseWire.runtimeBehaviorDigests,
    currentWire.runtimeBehaviorDigests,
    'path',
    ADDITIVE_CONTROL_RUNTIME_PATHS,
  );
}

export function classifyPackageApiChange(base, current, proof = null) {
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
  if (classification === 'major' && isCompatibleControlOperationAddition(base, current, proof)) {
    return 'minor';
  }
  if (
    classification === 'major'
    && isCompatibleProjectBackupModuleAddition(base, current, proof)
  ) return 'minor';
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

export function assertVersionedContractChange(base, current, proof = null) {
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
    const classification = classifyPackageApiChange(base, current, proof);
    if (!packageReleaseSatisfies(base.packageVersion, current.packageVersion, classification)) {
      failures.push(classification === 'major'
        ? 'public API change requires a package major release'
        : 'additive public API requires a package minor or major release');
    }
    const wireChanged = stableJson(base.contract.wire) !== stableJson(current.contract.wire);
    if (
      wireChanged
      && !isCompatibleControlOperationAddition(base, current, proof)
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

function readBaseSource(baseSha, relativePath) {
  try {
    return execFileSync('git', ['show', `${baseSha}:${relativePath}`], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const stderr = typeof error?.stderr === 'string' ? error.stderr.trim() : '';
    throw new Error(
      `Cannot read base protocol source ${relativePath} at ${baseSha}: ${stderr || error.message}`,
      { cause: error },
    );
  }
}

function controlOperationAdditionProof(baseSha, base, current) {
  const baseOperations = base.contract?.wire?.operations;
  const currentOperations = current.contract?.wire?.operations;
  if (!Array.isArray(baseOperations) || !Array.isArray(currentOperations)) return null;
  const addedOperations = currentOperations
    .filter(operation => !baseOperations.includes(operation));
  if (addedOperations.length === 0) return null;
  return proveCompatibleControlOperationAdditionSources({
    addedOperations,
    baseAuthoritySource: readBaseSource(baseSha, 'src/CollabAuthorityTransfer.ts'),
    baseCodecsSource: readBaseSource(baseSha, 'src/CollabControlOperationCodecs.ts'),
    currentAuthoritySource: readFileSync(
      path.join(repositoryRoot, 'src/CollabAuthorityTransfer.ts'),
      'utf8',
    ),
    currentCodecsSource: readFileSync(
      path.join(repositoryRoot, 'src/CollabControlOperationCodecs.ts'),
      'utf8',
    ),
  });
}

function projectBackupModuleAdditionProof(baseSha, base, current) {
  const basePaths = new Set(
    base.contract?.runtimeBehaviorDigests?.map(item => item.path) ?? [],
  );
  const currentPaths = new Set(
    current.contract?.runtimeBehaviorDigests?.map(item => item.path) ?? [],
  );
  if (
    basePaths.has(PROJECT_BACKUP_MODULE_PATH)
    || !currentPaths.has(PROJECT_BACKUP_MODULE_PATH)
  ) return null;
  return proveCompatibleProjectBackupModuleAdditionSources({
    baseCheckpointSource: readBaseSource(baseSha, 'src/CollabProjectCheckpoint.ts'),
    baseIndexSource: readBaseSource(baseSha, INDEX_MODULE_PATH),
    currentCheckpointSource: readFileSync(
      path.join(repositoryRoot, 'src/CollabProjectCheckpoint.ts'),
      'utf8',
    ),
    currentIndexSource: readFileSync(path.join(repositoryRoot, INDEX_MODULE_PATH), 'utf8'),
    currentModuleSource: readFileSync(
      path.join(repositoryRoot, PROJECT_BACKUP_MODULE_PATH),
      'utf8',
    ),
  });
}

function compatibleAdditionProof(baseSha, base, current) {
  const control = controlOperationAdditionProof(baseSha, base, current);
  const backup = projectBackupModuleAdditionProof(baseSha, base, current);
  if (control === null) return backup;
  if (backup === null) return control;
  return Object.freeze({ ...control, ...backup });
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
    if (base) {
      const proof = compatibleAdditionProof(baseSha, base, committed);
      assertVersionedContractChange(base, committed, proof);
    }
  }
  process.stdout.write('Collab protocol compatibility: PASS\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) run();
