---
trigger: always_on
---

# Supabase

Superseded by `CORE.md` -- read `CORE.md` section 5.

Supabase is cloud, not local. Use the Supabase MCP server for all Supabase operations, and never
the local CLI. Note the known defect recorded there: `db:types` and `db:migrate` in
`package.json` are wired to `--local` and contradict this rule.
