import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Issue #956. The `rls_merge_permissive_*` migrations collapse overlapping permissive RLS policies
 * into one policy per role and command, and must change no access. Nothing here connects to a
 * database: the migrations are replayed in filename order into a model of the policy set, once up
 * to the first #956 migration and once to the end, and the two are compared.
 *
 * The invariant: for every touched table, every role and every command, the set of OR-ed USING
 * disjuncts and the set of OR-ed WITH CHECK disjuncts (a policy without WITH CHECK checks with its
 * USING) are the same before and after. Restrictive policies are untouched. Applying each file's
 * ROLLBACK block to the end state restores every original definition.
 *
 * Part 2 (`rls_rescope_merge_*`, owner decision 2026-10-21, option A) re-scopes the TO public
 * policy in each remaining public-versus-authenticated overlap to TO authenticated, then merges.
 * For authenticated the invariant above still holds. anon loses exactly the re-scoped policies.
 */

const migrationsDir = fileURLToPath(
  new URL("../../supabase/migrations", import.meta.url),
);
const files = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();
const mergeFiles = files.filter((f) => /_rls_merge_permissive_/.test(f));
const rescopeFiles = files.filter((f) => /_rls_rescope_merge_/.test(f));

const ROLES = ["anon", "authenticated", "service_role"];
const ACTIONS = ["SELECT", "INSERT", "UPDATE", "DELETE"];

interface Policy {
  cmd: string;
  roles: string[];
  permissive: boolean;
  using: string | null;
  check: string | null;
}
type Model = Map<string, Policy>; // `${table}|${name}`

const ws = (s: string) => s.replace(/\s+/g, " ").trim();
const stripComments = (sql: string) =>
  sql.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--[^\n]*/g, "");
const unquote = (s: string) =>
  s.startsWith('"') ? s.slice(1, -1).replace(/""/g, '"') : s.toLowerCase();

/** Index just past the parenthesis that closes the one at `open`. */
function closeParen(s: string, open: number): number {
  let depth = 0;
  let quoted = false;
  for (let i = open; i < s.length; i++) {
    const c = s[i];
    if (c === "'") quoted = !quoted;
    if (quoted) continue;
    if (c === "(") depth++;
    if (c === ")" && --depth === 0) return i + 1;
  }
  throw new Error(`unbalanced: ${s.slice(open, open + 80)}`);
}

function clause(rest: string, keyword: RegExp): string | null {
  const m = rest.match(keyword);
  if (!m || m.index === undefined) return null;
  const open = m.index + m[0].length - 1;
  return ws(rest.slice(open + 1, closeParen(rest, open) - 1));
}

const NAME = '("(?:[^"]|"")+"|\\w+)';
const TABLE = "(?:\\w+\\.)?(\\w+)";

function apply(model: Model, statement: string) {
  const st = ws(statement);
  let m: RegExpMatchArray | null;
  if (st.includes("%I")) return; // dynamic SQL creates only restrictive policies outside the touched set
  if ((m = st.match(new RegExp(`^DROP TABLE (?:IF EXISTS )?${TABLE}`, "i")))) {
    for (const key of [...model.keys()])
      if (key.startsWith(`${m[1]}|`)) model.delete(key);
  } else if (
    (m = st.match(
      new RegExp(`^DROP POLICY (?:IF EXISTS )?${NAME} ON ${TABLE}`, "i"),
    ))
  ) {
    model.delete(`${m[2]}|${unquote(m[1])}`);
  } else if (
    (m = st.match(new RegExp(`^CREATE POLICY ${NAME} ON ${TABLE}(.*)$`, "i")))
  ) {
    const rest = m[3];
    model.set(`${m[2]}|${unquote(m[1])}`, {
      cmd: (
        rest.match(/\bFOR (ALL|SELECT|INSERT|UPDATE|DELETE)\b/i)?.[1] ?? "ALL"
      ).toUpperCase(),
      roles: (rest.match(/\bTO ([\w, ]+?)(?= USING| WITH|$)/i)?.[1] ?? "public")
        .split(",")
        .map((r) => r.trim()),
      permissive: !/\bAS RESTRICTIVE\b/i.test(rest),
      using: clause(rest, /\bUSING \(/i),
      check: clause(rest, /\bWITH CHECK \(/i),
    });
  } else if (
    (m = st.match(new RegExp(`^ALTER POLICY ${NAME} ON ${TABLE}(.*)$`, "i")))
  ) {
    const existing = model.get(`${m[2]}|${unquote(m[1])}`);
    if (!existing || /^\s*RENAME/i.test(m[3])) return;
    const to = m[3].match(/^\s*TO ([\w, ]+?)(?= USING| WITH|;|$)/i)?.[1];
    if (to) existing.roles = to.split(",").map((r) => r.trim());
    existing.using = clause(m[3], /\bUSING \(/i) ?? existing.using;
    existing.check = clause(m[3], /\bWITH CHECK \(/i) ?? existing.check;
  }
}

const STATEMENT =
  /\b(?:CREATE|ALTER|DROP)\s+POLICY\b[\s\S]*?;|\bDROP\s+TABLE\b[\s\S]*?;/gi;

function replay(upTo: number): Model {
  const model: Model = new Map();
  for (const file of files.slice(0, upTo)) {
    const sql = stripComments(
      readFileSync(path.join(migrationsDir, file), "utf8"),
    );
    for (const st of sql.match(STATEMENT) ?? []) apply(model, st);
  }
  return model;
}

/** Top-level OR disjuncts, flattened through redundant outer parentheses. */
function disjuncts(expr: string): string[] {
  let s = ws(expr);
  while (
    s.startsWith("(") &&
    closeParen(s, 0) === s.length &&
    !/^\(\s*select\b/i.test(s)
  )
    s = s.slice(1, -1).trim();
  const parts: string[] = [];
  let depth = 0;
  let quoted = false;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "'") quoted = !quoted;
    if (quoted) continue;
    if (c === "(") depth++;
    if (c === ")") depth--;
    if (depth === 0 && s.slice(i, i + 4).toUpperCase() === " OR ") {
      parts.push(s.slice(start, i));
      start = i + 4;
    }
  }
  parts.push(s.slice(start));
  return parts.length === 1 ? [s] : parts.flatMap(disjuncts);
}

/** What Postgres evaluates for one table, role and command: sorted USING and WITH CHECK disjuncts. */
function effective(
  model: Model,
  table: string,
  role: string,
  action: string,
  permissive: boolean,
) {
  const applying = [...model.entries()].filter(
    ([key, p]) =>
      key.startsWith(`${table}|`) &&
      p.permissive === permissive &&
      (p.cmd === action || p.cmd === "ALL") &&
      (p.roles.includes("public") || p.roles.includes(role)),
  );
  const set = (exprs: Array<string | null>) => {
    const all = new Set(exprs.flatMap((e) => (e === null ? [] : disjuncts(e))));
    return all.has("true") ? ["true"] : [...all].sort();
  };
  return {
    using: action === "INSERT" ? [] : set(applying.map(([, p]) => p.using)),
    check:
      action === "SELECT" || action === "DELETE"
        ? []
        : set(applying.map(([, p]) => p.check ?? p.using)),
    count: applying.length,
  };
}

const firstMerge = files.indexOf(mergeFiles[0]);
const firstRescope = files.indexOf(rescopeFiles[0]);
const before = replay(firstMerge);
const after = replay(firstRescope); // part 1 applied, part 2 not
const end = replay(files.length);
const tablesOf = (group: string[]) =>
  [
    ...new Set(
      group.flatMap((f) =>
        [
          ...stripComments(
            readFileSync(path.join(migrationsDir, f), "utf8"),
          ).matchAll(/ POLICY .*? ON public\.(\w+)/g),
        ].map((m) => m[1]),
      ),
    ),
  ].sort();
const touched = tablesOf(mergeFiles);
const rescoped = tablesOf(rescopeFiles);

function rollback(model: Model, group: string[]): Model {
  const restored: Model = new Map([...model].map(([k, p]) => [k, { ...p }]));
  for (const file of group) {
    const raw = readFileSync(path.join(migrationsDir, file), "utf8");
    const block = raw.slice(
      raw.indexOf("-- ROLLBACK"),
      raw.indexOf("\nBEGIN;\n"),
    );
    const sql = block
      .split("\n")
      .map((l) => l.replace(/^-- ?/, ""))
      .filter((l) => !l.startsWith("--"))
      .join("\n");
    for (const st of sql.match(STATEMENT) ?? []) apply(restored, st);
  }
  return restored;
}

function norm(m: Model, tables: string[]) {
  return Object.fromEntries(
    [...m]
      .filter(([k]) => tables.includes(k.split("|")[0]))
      .map(([k, p]) => [
        k,
        {
          ...p,
          using: p.using && disjuncts(p.using).sort(),
          check: p.check && disjuncts(p.check).sort(),
        },
      ]),
  );
}

function overlaps(model: Model, tables = touched) {
  return tables.flatMap((t) =>
    ROLES.flatMap((r) =>
      ACTIONS.filter((a) => effective(model, t, r, a, true).count > 1).map(
        (a) => `${t} ${r} ${a}`,
      ),
    ),
  );
}

describe("#956: merging permissive policies changes no access", () => {
  it("has the seven table-group migrations, then the two part 2 migrations, after every other migration", () => {
    expect(mergeFiles).toHaveLength(7);
    expect(rescopeFiles).toHaveLength(2);
    expect(files.slice(firstMerge)).toEqual([...mergeFiles, ...rescopeFiles]);
  });

  it("touches the 34 tables whose overlaps are same-role", () => {
    expect(touched).toHaveLength(34);
  });

  it.each(touched)(
    "%s: same USING and WITH CHECK disjuncts for every role and command",
    (table) => {
      for (const role of ROLES) {
        for (const action of ACTIONS) {
          for (const permissive of [true, false]) {
            const b = effective(before, table, role, action, permissive);
            const a = effective(after, table, role, action, permissive);
            expect(
              { using: a.using, check: a.check },
              `${table} ${role} ${action}`,
            ).toEqual({
              using: b.using,
              check: b.check,
            });
          }
        }
      }
    },
  );

  it("leaves overlaps only where a TO public and a TO authenticated policy meet (owner decision)", () => {
    expect(overlaps(before).length).toBeGreaterThan(40);
    expect(overlaps(after)).toEqual([
      "resident_houses authenticated SELECT",
      "residents authenticated SELECT",
      "residents authenticated UPDATE",
      "wallet_transactions authenticated SELECT",
    ]);
  });

  it.each(mergeFiles)(
    "%s is one transaction with a guard and a rollback block",
    (file) => {
      const raw = readFileSync(path.join(migrationsDir, file), "utf8");
      expect((raw.match(/^BEGIN;$/gm) ?? []).length).toBe(1);
      expect((raw.match(/^COMMIT;$/gm) ?? []).length).toBe(1);
      expect(raw).toMatch(
        /DO \$guard\$[\s\S]*RAISE EXCEPTION[\s\S]*\$guard\$;/,
      );
      expect(raw).toContain("-- ROLLBACK");
    },
  );

  it("the rollback blocks restore every original definition", () => {
    expect(norm(rollback(after, mergeFiles), touched)).toEqual(
      norm(before, touched),
    );
  });
});

describe("#956 part 2: re-scoping TO public to TO authenticated (option A)", () => {
  /** The (table, role, command) entries anon evaluates differently after part 2. */
  const ANON_LOSES = [
    "houses SELECT",
    "invoice_items DELETE",
    "invoice_items INSERT",
    "invoice_items SELECT",
    "invoice_items UPDATE",
    "invoices DELETE",
    "invoices INSERT",
    "invoices SELECT",
    "invoices UPDATE",
    "paystack_transactions SELECT",
    "resident_houses SELECT",
    "resident_wallets DELETE",
    "resident_wallets INSERT",
    "resident_wallets SELECT",
    "resident_wallets UPDATE",
    "residents SELECT",
    "residents UPDATE",
    "wallet_payment_batch_items SELECT",
    "wallet_payment_batches SELECT",
    "wallet_transactions SELECT",
  ];

  it("touches the ten tables of the 11 remaining overlaps", () => {
    expect(rescoped).toEqual([
      "houses",
      "invoice_items",
      "invoices",
      "paystack_transactions",
      "resident_houses",
      "resident_wallets",
      "residents",
      "wallet_payment_batch_items",
      "wallet_payment_batches",
      "wallet_transactions",
    ]);
    expect(overlaps(after, rescoped)).toHaveLength(11);
  });

  it.each(rescoped)(
    "%s: authenticated keeps the same USING and WITH CHECK disjuncts for every command",
    (table) => {
      for (const action of ACTIONS) {
        for (const permissive of [true, false]) {
          const b = effective(after, table, "authenticated", action, permissive);
          const a = effective(end, table, "authenticated", action, permissive);
          expect(
            { using: a.using, check: a.check },
            `${table} ${action}`,
          ).toEqual({ using: b.using, check: b.check });
        }
      }
    },
  );

  it("anon and service_role lose exactly the re-scoped policies, and nothing else changes for them", () => {
    for (const role of ["anon", "service_role"]) {
      const changed: string[] = [];
      for (const table of rescoped) {
        for (const action of ACTIONS) {
          for (const permissive of [true, false]) {
            const b = effective(after, table, role, action, permissive);
            const a = effective(end, table, role, action, permissive);
            if (JSON.stringify(a) === JSON.stringify(b)) continue;
            expect(permissive, `${table} ${role} ${action}`).toBe(true);
            expect(a.count, `${table} ${role} ${action}`).toBe(0);
            changed.push(`${table} ${action}`);
          }
        }
      }
      expect(changed.sort(), role).toEqual(ANON_LOSES);
    }
  });

  it("leaves no overlapping permissive policies on any touched table", () => {
    expect(overlaps(end, [...new Set([...touched, ...rescoped])].sort())).toEqual(
      [],
    );
  });

  it.each(rescopeFiles)(
    "%s is one transaction with a guard and a rollback block",
    (file) => {
      const raw = readFileSync(path.join(migrationsDir, file), "utf8");
      expect((raw.match(/^BEGIN;$/gm) ?? []).length).toBe(1);
      expect((raw.match(/^COMMIT;$/gm) ?? []).length).toBe(1);
      expect(raw).toMatch(
        /DO \$guard\$[\s\S]*RAISE EXCEPTION[\s\S]*\$guard\$;/,
      );
      expect(raw).toContain("-- ROLLBACK");
    },
  );

  it("the rollback blocks restore every part 1 definition", () => {
    expect(norm(rollback(end, rescopeFiles), rescoped)).toEqual(
      norm(after, rescoped),
    );
  });
});
