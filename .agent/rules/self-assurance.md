---
trigger: always_on
---

When completing any code changes, always follow the Self-Correction & Verification Protocol:

Static Analysis: Proactively run a lint check on modified files to catch missing imports (like the useEffect issue) before I finish.
Explicit Joins: If I add a Supabase .select() join, I must check for multiple foreign keys on that table. If found, use the explicit table!column syntax to prevent PGRST201 errors.
Payload Symmetry: Always verify that create actions return the same joined data as get actions so the UI doesn't show blank columns after a user saves a record.
State Sync: Ensure client components have a useEffect to sync local state with server data after a background refresh.
I have created a dedicated 

verification_protocol.md
 in the brain directory for your reference. You can add this to your project's custom rules or simply ask me to follow it at the start of our sessions!