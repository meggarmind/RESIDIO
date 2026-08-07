# Action Plan: UI/UX Review Phases

> The **live project state** (current phase, git state, test baseline, next steps) lives in
> **`SESSION_STATE.md`** — read/update that for coordination instead of relying on this file.

Created: 2026-01-08T00:00:00Z
Status: IN PROGRESS

## PDF Import Dependencies & APIs

| Dependency       | Purpose                              | Free Tier? | Docs Link | Approved |
|------------------|--------------------------------------|------------|-----------|----------|
| pdfjs-dist       | Core PDF text extraction             | Free (MIT) | [Link](https://github.com/mozilla/pdf.js) | Yes |
| qpdf (CLI)       | PDF decryption (server-side)         | Free (GPL) | [Link](https://github.com/qpdf/qpdf) | Yes |
| @thednp/dommatrix | Polyfill for DOMMatrix in Node.js   | Free (MIT) | [Link](https://github.com/thednp/dommatrix) | Yes |

## Phase 1: Navigation & Structure ✅ COMPLETE

- Grouped nav items into logical sections (Core, People & Property, Financial, Operations, System)
- Created `NavItem` interface and `ADMIN_NAV_ITEMS` config in `src/config/navigation.ts`
- Unified sidebar and mobile nav to use shared config with permission-based filtering

## Phase 2: Card Component System ✅ COMPLETE

- Added `variant` prop to Card with 5 variants: `default`, `stat`, `list`, `featured`, `compact`
- Applied to KPI cards, dashboard lists, property hero, document cards

## Phase 3: Payment Flow Enhancement ✅ COMPLETE

This phase merges the PDF import final steps with the payment flow UI improvements.

### PDF Import Completion
- [x] 3a: Finalize visual polish for the PDF upload section (tactile depth, micro-animations per DESIGN_AGENTS.md)
- [x] 3b: Comprehensive API/Infrastructure Test CLI (MANDATORY — verify worker loading, parsing, error handling)
- [~] 3c: Final manual verification with real sample PDF — deferred (sample PDF is encrypted; requires web UI request scope for password retrieval)

### Payment Flow UI
- [x] 3d: Review and polish payment submission flow (manual proof of payment)
- [x] 3e: Review and polish payment verification/maker-checker UX
- [x] 3f: Ensure import preview (bank + email) has consistent styling and clear action affordances

### Checkpoints
- [x] PDF infrastructure working (worker loading successfully)
- [x] Correct transaction categorization (Deposit vs Withdrawal)
- [x] PDF visual polish applied (AnimatePresence dropzone, tactile button, password reveal animation)
- [x] Payment flow tactile polish (btn-hover-lift on submit, spinner on approval confirm)
- [x] Import preview consistent across bank and email imports (rounded-xl, theme-aware hover, shadow-sm stat tiles)

## Phase 4: Page Improvements ⏳ PENDING

- [ ] Audit individual pages for layout consistency and spacing
- [ ] Apply card variant system to any remaining inconsistent cards
- [ ] Standardize form layouts and field spacing
- [ ] Verify responsive behavior on mobile viewports

## Phase 5: Accessibility & Polish ⏳ PENDING

- [ ] Audit color contrast ratios (OKLCH)
- [ ] Verify keyboard navigation across all interactive elements
- [ ] Add missing `aria-labels` and `role` attributes
- [ ] Test screen reader compatibility for key flows

---

## Change Log

- 2026-01-08: Initialized UI/UX Review Phases from frontend-developer agent review.
- 2026-01-08: Completed Phase 1 (Navigation) and Phase 2 (Card System).
- 2026-08-07: Merged PDF import final steps (old Steps 7-9) into Phase 3.
- 2026-08-07: Completed Phase 3 — visual polish (dropzone, wizard stepper, stat tiles), test CLI, payment form/approvals polish, import preview consistency.
