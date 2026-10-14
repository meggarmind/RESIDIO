/**
 * Scanner behind the audit entityId ratchet (#594).
 *
 * audit_logs.entity_id is `uuid NOT NULL` and logAudit() swallows insert
 * errors, so a call whose entityId is not a uuid writes nothing, silently.
 * Strings and templates are non-uuid by construction, so
 * this finds every `logAudit({ entityId: <that> })` call by parsing the source.
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
}

/** True when the expression is a string literal or template (possibly parenthesized or cast). */
function isNonUuidConstruction(expr: ts.Expression): boolean {
  if (ts.isParenthesizedExpression(expr) || ts.isAsExpression(expr) || ts.isNonNullExpression(expr)) {
    return isNonUuidConstruction(expr.expression);
  }
  if (
    ts.isStringLiteral(expr) ||
    ts.isNoSubstitutionTemplateLiteral(expr) ||
    ts.isTemplateExpression(expr)
  ) {
    return true;
  }
  // Fallbacks such as `id ?? 'x'` are deliberately not judged here.
  return false;
}

export function scanEntityIds(file: string, source: string): EntityIdScan {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const scan: EntityIdScan = { findings: [], unverifiable: 0 };

  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'logAudit') {
      const arg = node.arguments[0];
      let checked = false;
      if (arg && ts.isObjectLiteralExpression(arg)) {
        for (const prop of arg.properties) {
          if (ts.isShorthandPropertyAssignment(prop) && prop.name.text === 'entityId') {
            checked = true; // an identifier: not statically a literal
          } else if (
            ts.isPropertyAssignment(prop) &&
            (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name)) &&
            prop.name.text === 'entityId'
          ) {
            checked = true;
            if (isNonUuidConstruction(prop.initializer)) {
              scan.findings.push({
                file,
                line: sf.getLineAndCharacterOfPosition(prop.getStart(sf)).line + 1,
                text: prop.initializer.getText(sf),
              });
            }
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
