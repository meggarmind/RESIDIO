# Next Session Handoff Prompt

Copy and paste this prompt to start the next Claude Code session:

---

Continue building the Residio residential estate access management application.

## First Steps
1. Run `date` to confirm current date/time
2. Read the following files to understand project state:
   - `residio/CLAUDE.md` - Project conventions and architecture
   - `residio/TODO.md` - Current phase status and task list
   - `residio/HANDOFF_SUMMARY.md` - Last session summary

## Current State

**Project:** Residio - Residential estate access management web app
**Tech Stack:** Next.js 16, Supabase, TypeScript, Tailwind CSS, shadcn/ui, React Query
**Current Phase:** Phase 5 - Payment & Billing System (Mostly Complete)

### What's Complete
- Phase 0-4: Infrastructure, Auth, Dashboard, Resident/House Management
- Phase 5.1: Payment Records (CRUD, pre-fill from resident page)
- Phase 5.2: Wallet System (auto-create, transactions, manual adjustments)
- Phase 5.3: Billing & Invoices (profiles, generation, pagination/filters)

### MCP Servers Configured
- **Supabase MCP** (project): Cloud instance kzugmyjjqttardhfejzc
- **GitHub MCP** (user): Connected
- **Memory MCP** (user): SQLite-based, connected
- **TestSprite MCP** (project): Configured

## Next Tasks (Choose One Path)

### Option A: Complete Phase 5.4 Pending Items
1. Implement bulk payment status update
2. Create overdue notifications logic
3. Add payment receipts/export feature

### Option B: Start Phase 6 - Security Contact List
1. Create security_contacts table migration
2. Build security contacts management UI
3. Implement access code generation
4. Create validity period management
5. Build security contact list export

## Key Files to Reference
- Server actions: `src/actions/`
- React Query hooks: `src/hooks/`
- UI components: `src/components/`
- Database migrations: `supabase/migrations/`

## Test Users
| Email | Password | Role |
|-------|----------|------|
| admin@residio.test | password123 | admin |
| chairman@residio.test | password123 | chairman |
| finance@residio.test | password123 | financial_secretary |
| security@residio.test | password123 | security_officer |

## Commands
```bash
cd /home/feyijimiohioma/projects/Residio/residio
npm run dev              # Start dev server
npm run supabase:start   # Start local Supabase
claude mcp list          # Verify MCP servers
```

---

Ask the user which path they want to take (Phase 5.4 completion or Phase 6) before proceeding.
