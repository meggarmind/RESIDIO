---
trigger: always_on
---

# Supabase

Superseded by `CORE.md` -- read `CORE.md` section 5.

Supabase is cloud, not local. Use the Supabase MCP server for all Supabase operations, and never
the local CLI. The `supabase:*` and `db:migrate` scripts in `package.json` are guards that fail
loudly, and `npm run db:types` reads the cloud project (`CORE.md` section 5).
