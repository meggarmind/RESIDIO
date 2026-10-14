/**
 * Per-action scanner behind the server-action ratchet (#390).
 *
 * The ratchet in integration/module-integration.test.ts used to read each file
 * under src/actions/** as ONE string, so a file with one guarded and one
 * unguarded write action passed. This module parses each file with the
 * TypeScript compiler API and judges every exported async function on its own.
 *
 * It parses; it never string-scans for braces. The first `{` after a function
 * name is frequently an inline object type in the signature, and brace
 * scanning on that produced false positives on this repo.
 *
 * The detection rules are each a small named function below so a later change
 * (for example an "audited-write module" that makes the guard implicit) only
 * has to touch the one rule it alters.
 *
 * Known limits (found by QA on #390; none is a regression against the old scan):
 *  - A write done only through `.rpc(...)` is not classed as a write, so an
 *    unguarded RPC-only action passes. About a dozen action files call `.rpc`.
 *  - A write inside a non-exported helper called from an exported action is not
 *    seen: neither the guard nor the audit is checked for it.
 *  - Actions declared as object-literal methods are not discovered.
 *  - The guard only has to appear as a call before the first database operation;
 *    a call in a dead branch or an unused nested callback still satisfies it.
 *  - `.update(` / `.delete(` on a non-database object counts as a write; the
 *    allowlist is the escape hatch.
 */

import ts from 'typescript';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Rule vocabulary
// ---------------------------------------------------------------------------

/** Method names that mean the function changes data: `.insert(`, `.update(` ... */
const WRITE_METHODS = new Set(['insert', 'update', 'delete', 'upsert']);

/**
 * Method names / property accesses that touch the database or storage. The
 * permission guard must appear in the source BEFORE the first of these.
 */
const DB_METHODS = new Set(['from', 'select', 'rpc', ...WRITE_METHODS]);

/** Calls that count as the permission guard. */
const GUARD_FUNCTIONS = new Set([
  'authorizePermission',
  'authorizeAction',
  'authorizeAnyPermission',
]);

/** The audit call. */
const AUDIT_FUNCTION = 'logAudit';

// ---------------------------------------------------------------------------
// Per-file facts
// ---------------------------------------------------------------------------

export interface FunctionFacts {
  name: string;
  exported: boolean;
  isAsync: boolean;
  /** Body contains a write call (.insert( .update( .delete( .upsert( ). */
  isWrite: boolean;
  /** Source position of the first guard call, or null. */
  guardPos: number | null;
  /** Source position of the first database/storage operation, or null. */
  firstDbOpPos: number | null;
  /** Body calls logAudit directly. */
  hasAudit: boolean;
  /** Bare identifiers this body calls (used to follow audit delegation). */
  calls: Set<string>;
}

export interface FileAnalysis {
  /** Path relative to src/actions, forward slashes. */
  file: string;
  functions: FunctionFacts[];
  /** local name -> { module specifier, imported name }. */
  imports: Map<string, { module: string; importedName: string }>;
}

type FunctionLike = ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression;

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return ts.canHaveModifiers(node) && !!ts.getModifiers(node)?.some((m) => m.kind === kind);
}

/** Name of a called method, for `x.insert(...)` style calls; null otherwise. */
function calledMethodName(call: ts.CallExpression): string | null {
  const callee = call.expression;
  return ts.isPropertyAccessExpression(callee) ? callee.name.text : null;
}

/** Name of a called bare identifier, for `authorizePermission(...)` style calls. */
function calledFunctionName(call: ts.CallExpression): string | null {
  return ts.isIdentifier(call.expression) ? call.expression.text : null;
}

/**
 * Walk one function body and collect the facts the rules need. Nested
 * callbacks are walked too: a write inside `.map(async ...)` still belongs to
 * the enclosing action.
 */
function collectBodyFacts(
  name: string,
  exported: boolean,
  fn: FunctionLike,
  sf: ts.SourceFile
): FunctionFacts {
  const facts: FunctionFacts = {
    name,
    exported,
    isAsync: hasModifier(fn, ts.SyntaxKind.AsyncKeyword),
    isWrite: false,
    guardPos: null,
    firstDbOpPos: null,
    hasAudit: false,
    calls: new Set(),
  };

  const noteDbOp = (pos: number) => {
    if (facts.firstDbOpPos === null || pos < facts.firstDbOpPos) facts.firstDbOpPos = pos;
  };

  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const method = calledMethodName(node);
      const fnName = calledFunctionName(node);

      if (method && WRITE_METHODS.has(method)) facts.isWrite = true;
      if (method && DB_METHODS.has(method)) noteDbOp(node.getStart(sf));

      if (fnName) {
        facts.calls.add(fnName);
        if (GUARD_FUNCTIONS.has(fnName)) {
          const pos = node.getStart(sf);
          if (facts.guardPos === null || pos < facts.guardPos) facts.guardPos = pos;
        }
        if (fnName === AUDIT_FUNCTION) facts.hasAudit = true;
      }
    } else if (ts.isPropertyAccessExpression(node) && node.name.text === 'storage') {
      // `supabase.storage.from(...)`: any use of .storage is a storage op.
      noteDbOp(node.getStart(sf));
    }
    ts.forEachChild(node, visit);
  };

  if (fn.body) visit(fn.body);
  return facts;
}

/** Parse one source file into per-function facts and its import table. */
export function analyzeSource(file: string, source: string): FileAnalysis {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const functions: FunctionFacts[] = [];
  const imports = new Map<string, { module: string; importedName: string }>();
  const exportedViaList = new Set<string>();

  for (const stmt of sf.statements) {
    if (ts.isImportDeclaration(stmt) && ts.isStringLiteral(stmt.moduleSpecifier)) {
      const bindings = stmt.importClause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) {
        for (const el of bindings.elements) {
          imports.set(el.name.text, {
            module: stmt.moduleSpecifier.text,
            importedName: (el.propertyName ?? el.name).text,
          });
        }
      }
    } else if (ts.isFunctionDeclaration(stmt) && stmt.body) {
      const exported = hasModifier(stmt, ts.SyntaxKind.ExportKeyword);
      const isDefault = hasModifier(stmt, ts.SyntaxKind.DefaultKeyword);
      const name = stmt.name?.text ?? (isDefault ? 'default' : null);
      if (name) functions.push(collectBodyFacts(name, exported, stmt, sf));
    } else if (ts.isVariableStatement(stmt)) {
      // `export const foo = async () => {}` / `= async function () {}`
      const exported = hasModifier(stmt, ts.SyntaxKind.ExportKeyword);
      for (const decl of stmt.declarationList.declarations) {
        const init = decl.initializer;
        if (
          ts.isIdentifier(decl.name) &&
          init &&
          (ts.isArrowFunction(init) || ts.isFunctionExpression(init))
        ) {
          functions.push(collectBodyFacts(decl.name.text, exported, init, sf));
        }
      }
    } else if (ts.isExportDeclaration(stmt) && !stmt.moduleSpecifier) {
      // `export { a, b }`
      const clause = stmt.exportClause;
      if (clause && ts.isNamedExports(clause)) {
        for (const el of clause.elements) exportedViaList.add((el.propertyName ?? el.name).text);
      }
    }
  }

  for (const fn of functions) if (exportedViaList.has(fn.name)) fn.exported = true;
  return { file, functions, imports };
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

/** Only exported async functions are server-action endpoints. */
export function isAction(fn: FunctionFacts): boolean {
  return fn.exported && fn.isAsync;
}

export type PermissionResult = 'ok' | 'missing' | 'late';

/**
 * Permission rule: a write action must call a guard, and the guard must come
 * textually BEFORE the first database/storage operation. 'late' means a guard
 * exists but the DB was touched first (a guard after the read is no guard).
 * Creating a Supabase client before the guard is fine: it is not a DB op.
 */
export function checkPermission(fn: FunctionFacts): PermissionResult {
  if (fn.guardPos === null) return 'missing';
  if (fn.firstDbOpPos !== null && fn.firstDbOpPos < fn.guardPos) return 'late';
  return 'ok';
}

/** Resolve a called name to a function in the project, or null. */
function resolveCallee(
  project: Map<string, FileAnalysis>,
  from: FileAnalysis,
  name: string
): { analysis: FileAnalysis; fn: FunctionFacts } | null {
  const local = from.functions.find((f) => f.name === name);
  if (local) return { analysis: from, fn: local };

  const imp = from.imports.get(name);
  if (!imp) return null;

  // Only follow imports that stay inside src/actions.
  let target: string;
  if (imp.module.startsWith('@/actions/')) {
    target = imp.module.slice('@/actions/'.length);
  } else if (imp.module.startsWith('.')) {
    target = path.posix.normalize(path.posix.join(path.posix.dirname(from.file), imp.module));
  } else {
    return null;
  }
  for (const candidate of [`${target}.ts`, `${target}/index.ts`]) {
    const analysis = project.get(candidate);
    const fn = analysis?.functions.find((f) => f.name === imp.importedName);
    if (analysis && fn) return { analysis, fn };
  }
  return null;
}

/**
 * Audit rule: the action calls logAudit itself, OR it delegates: it calls a
 * function (same file, or imported from src/actions) that is itself audited,
 * transitively. Example: updateMultipleSettings calls setHierarchicalSetting.
 */
export function isAudited(
  project: Map<string, FileAnalysis>,
  analysis: FileAnalysis,
  fn: FunctionFacts,
  seen: Set<FunctionFacts> = new Set()
): boolean {
  if (fn.hasAudit) return true;
  if (seen.has(fn)) return false; // cycle guard
  seen.add(fn);
  for (const callee of fn.calls) {
    const target = resolveCallee(project, analysis, callee);
    if (target && target.fn !== fn && isAudited(project, target.analysis, target.fn, seen)) {
      return true;
    }
  }
  return false;
}

/**
 * Allowlist match. Entries are `relative/path.ts::functionName`. A bare
 * `relative/path.ts` entry exempts every function in the file; it exists only
 * for the permanent, deliberate entries (resident self-service, cron, webhook,
 * pre-auth) and must not be used for new ones.
 */
export function isAllowlisted(file: string, fnName: string, allowlist: readonly string[]): boolean {
  return allowlist.includes(`${file}::${fnName}`) || allowlist.includes(file);
}

// ---------------------------------------------------------------------------
// Project scan
// ---------------------------------------------------------------------------

export interface Violation {
  /** `relative/path.ts::functionName` */
  id: string;
  check: 'permission-missing' | 'permission-late' | 'audit-missing';
}

export interface ScanOptions {
  permissionAllowlist: readonly string[];
  auditAllowlist: readonly string[];
  /** Files exempt from the permission check entirely (types.ts, helpers.ts). */
  skipPermission?: (file: string) => boolean;
  /** Files exempt from the audit check entirely (types, helpers, exports). */
  skipAudit?: (file: string) => boolean;
}

/** Parse every source (path relative to src/actions -> contents). */
export function analyzeProject(sources: Record<string, string>): Map<string, FileAnalysis> {
  const project = new Map<string, FileAnalysis>();
  for (const [file, source] of Object.entries(sources)) {
    const normalized = file.replace(/\\/g, '/');
    project.set(normalized, analyzeSource(normalized, source));
  }
  return project;
}

/** Run both rules over a parsed project and return every violation. */
export function findViolations(
  project: Map<string, FileAnalysis>,
  options: ScanOptions
): Violation[] {
  const violations: Violation[] = [];

  for (const analysis of project.values()) {
    for (const fn of analysis.functions) {
      if (!isAction(fn) || !fn.isWrite) continue;
      const id = `${analysis.file}::${fn.name}`;

      if (
        !options.skipPermission?.(analysis.file) &&
        !isAllowlisted(analysis.file, fn.name, options.permissionAllowlist)
      ) {
        const result = checkPermission(fn);
        if (result === 'missing') violations.push({ id, check: 'permission-missing' });
        if (result === 'late') violations.push({ id, check: 'permission-late' });
      }

      if (
        !options.skipAudit?.(analysis.file) &&
        !isAllowlisted(analysis.file, fn.name, options.auditAllowlist) &&
        !isAudited(project, analysis, fn)
      ) {
        violations.push({ id, check: 'audit-missing' });
      }
    }
  }

  return violations;
}
