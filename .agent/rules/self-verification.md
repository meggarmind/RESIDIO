---
trigger: always_on
---

# Self-correction and verification protocol

Superseded by `CORE.md` -- read `CORE.md` section 13 ("Verification protocol").

It is the same protocol, kept in one place so every harness sees it rather than only the tools
that load this directory: static analysis, Supabase/database integrity (explicit join syntax
where a table has multiple foreign keys to the same relation, schema sync into `.select()`
strings), UI consistency (payload symmetry, state sync, payee/context handling), and error
handling.
