/**
 * Scanner behind the audit entityId ratchet (#594).
 *
 * audit_logs.entity_id is `uuid NOT NULL` and logAudit() swallows insert
 * errors, so a call whose entityId is not a uuid writes nothing, silently.
 * Strings and templates are non-uuid by construction, so this finds every
 * `logAudit({ entityId: <that> })` call by parsing the source, including
 * fallbacks (`x ?? 'lit'`, ternaries), one-level local const resolution and
 * aliased calls. It does not guess at arbitrary identifiers by name.
 */
import ts from 'typescript';

export interface EntityIdFinding {
  file: string;
  line: number;
  /** Source text of the offending initializer. */
  text: string;
}

export interface EntityIdScan {
  findings: EntityIdFinding[];
  /** logAudit calls whose options are not an object literal with an entityId (spread-built, variable): not checked. */
  unverifiable: number;
  /** entityId is a bare identifier (or shorthand) that did not resolve to a literal const: not classifiable. */
  bareIdentifiers: number;
}

type ConstMap = Map<string, ts.Expression>;

/** Names `logAudit` is reachable through: itself plus any `import { logAudit as x }` alias. */
function logAuditNames(sf: ts.SourceFile): Set<string> {
  const names = new Set<string>(['logAudit']);
  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) && st.importClause?.namedBindings && ts.isNamedImports(st.importClause.namedBindings)) {
      for (const el of st.importClause.namedBindings.elements) {
        if ((el.propertyName ?? el.name).text === 'logAudit') names.add(el.name.text);
      }
    }
  }
  return names;
}

function isLogAuditCall(node: ts.CallExpression, names: Set<string>): boolean {
  const callee = node.expression;
  if (ts.isIdentifier(callee)) return names.has(callee.text);
  // `audit.logAudit(...)` / `ns.logAudit(...)`
  return ts.isPropertyAccessExpression(callee) && callee.name.text === 'logAudit';
}

const isFunctionLike = (n: ts.Node): boolean =>
  ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n) || ts.isMethodDeclaration(n);

/** `const NAME = <initializer>` declared anywhere inside `scope`. Resolution is one level only. */
function localConsts(scope: ts.Node): ConstMap {
  const out: ConstMap = new Map();
  const walk = (n: ts.Node) => {
    if (
      ts.isVariableDeclaration(n) &&
      ts.isIdentifier(n.name) &&
      n.initializer &&
      ts.isVariableDeclarationList(n.parent) &&
      (n.parent.flags & ts.NodeFlags.Const) !== 0
    ) {
      out.set(n.name.text, n.initializer);
    }
    ts.forEachChild(n, walk);
  };
  walk(scope);
  return out;
}

function unwrap(expr: ts.Expression): ts.Expression {
  while (
    ts.isParenthesizedExpression(expr) ||
    ts.isAsExpression(expr) ||
    ts.isNonNullExpression(expr) ||
    ts.isSatisfiesExpression(expr)
  ) {
    expr = expr.expression;
  }
  return expr;
}

/**
 * True when the expression is statically a non-uuid string: a literal or template, a
 * conditional / `??` / `||` / `&&` with such a branch, or (one level) an identifier or
 * `obj.prop` resolving to such a const in the enclosing function or module scope.
 */
function isNonUuidConstruction(expr: ts.Expression, scopes: ConstMap[], depth = 0): boolean {
  expr = unwrap(expr);
  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr) || ts.isTemplateExpression(expr)) {
    return true;
  }
  if (ts.isConditionalExpression(expr)) {
    return isNonUuidConstruction(expr.whenTrue, scopes, depth) || isNonUuidConstruction(expr.whenFalse, scopes, depth);
  }
  if (ts.isBinaryExpression(expr)) {
    const k = expr.operatorToken.kind;
    if (
      k === ts.SyntaxKind.QuestionQuestionToken ||
      k === ts.SyntaxKind.BarBarToken ||
      k === ts.SyntaxKind.AmpersandAmpersandToken
    ) {
      return isNonUuidConstruction(expr.left, scopes, depth) || isNonUuidConstruction(expr.right, scopes, depth);
    }
    return false;
  }
  if (depth >= 1) return false; // one-level local resolution only
  const lookup = (name: string) => {
    for (const scope of scopes) {
      const hit = scope.get(name);
      if (hit) return hit;
    }
    return undefined;
  };
  if (ts.isIdentifier(expr)) {
    const init = lookup(expr.text);
    return init ? isNonUuidConstruction(init, scopes, depth + 1) : false;
  }
  if (ts.isPropertyAccessExpression(expr) && ts.isIdentifier(expr.expression)) {
    const init = lookup(expr.expression.text);
    const obj = init && unwrap(init);
    if (obj && ts.isObjectLiteralExpression(obj)) {
      for (const prop of obj.properties) {
        if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name) && prop.name.text === expr.name.text) {
          return isNonUuidConstruction(prop.initializer, scopes, depth + 1);
        }
      }
    }
  }
  return false;
}

export function scanEntityIds(file: string, source: string): EntityIdScan {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const scan: EntityIdScan = { findings: [], unverifiable: 0, bareIdentifiers: 0 };
  const names = logAuditNames(sf);
  const moduleConsts: ConstMap = new Map();
  for (const st of sf.statements) {
    if (ts.isVariableStatement(st) && (st.declarationList.flags & ts.NodeFlags.Const) !== 0) {
      for (const d of st.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && d.initializer) moduleConsts.set(d.name.text, d.initializer);
      }
    }
  }
  const fnConsts = new Map<ts.Node, ConstMap>();

  const scopesFor = (node: ts.Node): ConstMap[] => {
    const scopes: ConstMap[] = [];
    for (let p: ts.Node | undefined = node.parent; p; p = p.parent) {
      if (isFunctionLike(p)) {
        if (!fnConsts.has(p)) fnConsts.set(p, localConsts(p));
        scopes.push(fnConsts.get(p)!);
      }
    }
    scopes.push(moduleConsts);
    return scopes;
  };

  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && isLogAuditCall(node, names)) {
      const arg = node.arguments[0];
      let checked = false;
      if (arg && ts.isObjectLiteralExpression(arg)) {
        const scopes = scopesFor(node);
        for (const prop of arg.properties) {
          let init: ts.Expression | undefined;
          if (ts.isShorthandPropertyAssignment(prop) && prop.name.text === 'entityId') {
            init = prop.name;
          } else if (
            ts.isPropertyAssignment(prop) &&
            (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name)) &&
            prop.name.text === 'entityId'
          ) {
            init = prop.initializer;
          }
          if (!init) continue;
          checked = true;
          if (isNonUuidConstruction(init, scopes)) {
            scan.findings.push({
              file,
              line: sf.getLineAndCharacterOfPosition(prop.getStart(sf)).line + 1,
              text: init.getText(sf),
            });
          } else if (ts.isIdentifier(unwrap(init))) {
            scan.bareIdentifiers++;
          }
        }
      }
      if (!checked) scan.unverifiable++;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return scan;
}
