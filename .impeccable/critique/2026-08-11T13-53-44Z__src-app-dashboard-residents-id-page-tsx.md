---
target: src/app/(dashboard)/residents/[id]/page.tsx
total_score: 22
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 3
timestamp: 2026-08-11T13-53-44Z
slug: src-app-dashboard-residents-id-page-tsx
---
Method: dual-agent (A: ses_00ef82e7fffepe8xrygZ0eojkm · B: ses_00ef811d2ffelqXLCN4QtODilj)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Bare "Loading..." text, no skeleton shell; tab switching has no loading indicator; wallet/widget Skeletons create partial-content flash |
| 2 | Match System / Real World | 3 | Strong domain terminology (resident_code, account_status, house roles) but layout doesn't map to admin mental models (financial ops scattered) |
| 3 | User Control and Freedom | 3 | Tabs, edit/cancel flow, and AlertDialog for status changes work well; but archive uses browser confirm() with no undo |
| 4 | Consistency and Standards | 3 | Standard shadcn components used consistently, but DESIGN_AGENTS.md requirements (IconBox, PageTransition, semantic wrappers) are ignored |
| 5 | Error Prevention | 2 | Zod validation on form; AlertDialog for status changes; but archive uses native confirm(); form silently clears corporate fields on entity_type change |
| 6 | Recognition Rather Than Recall | 2 | Tab icons aid scannability; but wallet balance has no label, role badges lack legends, no tooltips on complex terminology |
| 7 | Flexibility and Efficiency | 2 | No tab URL persistence, no keyboard shortcuts, no inline editing, no batch actions from detail page |
| 8 | Aesthetic and Minimalist Design | 2 | Functional but visually flat — all cards identically styled, no micro-animations, no glass effects, no OKLCH colors, no IconBox usage |
| 9 | Error Recovery | 2 | Toast notifications for mutations (good); but no retry buttons, no undo for archive, no unsaved-changes warning on form navigation |
| 10 | Help and Documentation | 1 | No contextual help anywhere; no tooltips; the emergency contacts empty state is the sole example of proactive guidance |
| **Total** | | **22/40** | **Acceptable** — significant UX investment needed before this meets the DESIGN_AGENTS.md premium standard |

## Design Specificity Verdict

**LLM Assessment**: The domain logic is genuinely specific to residential estate management — house-state-driven role filtering, sponsor dependency chains, levy cross-property summaries, emergency-contact resident linking, and resident codes. However, the visual treatment and IA are indistinguishable from any generic shadcn admin dashboard. Swap the resident table for a product catalog and the visual design would hold identically. The Overview tab is a dense grid of identically-shaped Card/CardHeader/CardTitle blocks with text-sm font-semibold titles and no visual hierarchy. The page ignores the DESIGN_AGENTS.md standard entirely: zero IconBox usage, zero PageTransition, zero OKLCH colors, zero glassmorphism, zero framer-motion, and no .card-hover-modern. Raw shadcn components are used directly in the page rather than wrapped in semantic layout components. The only visual signal that this is an operational management tool (not a generic CRM) is the monospace resident_code badge at line 173.

**Deterministic Scan**: The detector found 1 warning-level finding across the resident components:
- `cross-property-payment-summary.tsx:110` — **side-tab accent border** (`border-l-4 border-l-destructive`): a thick red left-border on the card when overdue properties exist. This is the classic "side-tab accent" antipattern — the most recognizable tell of AI-generated UI. The fix: use a top-colored Badge or an internal status indicator instead of a thick colored border.

The page.tsx itself (470 lines) passed the detector cleanly with zero structural antipatterns.

**Browser Scan**: The page renders without critical failures — no horizontal overflow, no text truncation, no console errors. Two borderline tap-target issues flagged (a 20px nav link and a 22px icon button, below WCAG's recommended 24px minimum). Overlay injection was unavailable in this configuration. The Payments, Aliases, Security, Emergency, Notifications, and Notes tabs were not individually inspected.

## Overall Impression

The page has the right architectural bones — tabbed layout, permission-gating, mutation feedback via toasts — but the visual execution is entirely default shadcn. The domain logic in the sub-components (especially resident-form's house-state role filtering and the cross-property payment aggregation) is genuinely sophisticated for an estate management tool, but you'd never know it from the visual treatment. The page reads as a functional prototype that needs a premium pass to match the DESIGN_AGENTS.md standard and the product's ambitions. The biggest single opportunity is the complete absence of DESIGN_AGENTS.md's mandated premium utilities (IconBox, PageTransition, glass, micro-animations, OKLCH) — fixing this would lift every metric simultaneously.

## What's Working

1. **Domain-grounded architecture**: The resident form's house-state-driven role filtering, sponsor dependency chains, and corporate entity sub-fields demonstrate genuine understanding of residential estate management — this isn't commodity CRUD.
2. **Verification workflow UX**: AdminContactVerification's AlertDialog pattern with audit-logging disclosure text ("This action will be logged for audit purposes") is well-judged for an admin tool where trust matters.
3. **Empty states exist**: The emergency contacts empty state provides both a visual cue (opacity-40 AlertCircle icon) and actionable guidance ("An emergency contact can be added from the Edit Resident form") — many dashboards skip this entirely.
4. **Resident code identity detail**: The monospace badge (`font-mono text-xs bg-muted px-1.5 py-0.5 rounded tabular-nums`) on line 173 gives the page operational tool character and provides a scannable, copy-paste-friendly identifier.

## Priority Issues

### [P0] Archive action uses browser native `confirm()` instead of a proper destructive dialog
**Why it matters**: This is a potentially irreversible operation with cascading data implications (house unlinks, payment histories, audit trails). Browser `confirm()` provides no summary, no explanation of consequences, no visual gravity, and is trivial to muscle-memory through. It also fails screen-reader accessibility and keyboard navigation expectations. This is the single biggest trust-eroding interaction on the page.

**Fix**: Replace line 68's `confirm()` call with the same AlertDialog pattern used for status changes (lines 218-235). Include a summary of what will be affected (linked houses, active payments, notes, audit trail retention). Use "Archive Resident" as the action button text, not a generic "OK".

**Suggested command**: `$impeccable harden` (or direct replacement of the confirm() pattern)

---

### [P0] No skeleton loading states at the page shell level
**Why it matters**: The page shows bare "Loading..." text and "Resident not found" centered on a blank page while potentially 8+ data hooks resolve. WalletBalance and CrossPropertyPaymentSummary render their own internal Skeletons, creating a partial-content flash that's more jarring than a unified loading state. Violates both the visibility heuristic and DESIGN_AGENTS.md's "anticipatory minimalism".

**Fix**: Wrap the loading branch (lines 103-109) with a 2-column skeleton card grid matching the Overview layout — 2 skeleton cards top row, 2 middle, 2 bottom, 1 full-width. Use the existing ShimmerSkeleton component.

**Suggested command**: `$impeccable polish`

---

### [P1] Overview tab layout lacks semantic grouping — financial data is scattered
**Why it matters**: Wallet balance (row 1), cross-property payments (row 3), and wallet transactions (row 4) are separated by unrelated content (verification, houses, notes). Users must visually scan and mentally categorize each card instead of recognizing grouped sections. Financial cognition is a distinct mental model for estate admins.

**Fix**: Restructure lines 266-358 into semantic sections with labeled dividers: "Identity & Contact" (personal info + verification), "Housing" (linked houses), "Financial" (wallet balance + cross-property summary + wallet transactions as a single vertical stack). Add section divider headers with appropriate icons.

**Suggested command**: `$impeccable layout`

---

### [P1] Zero use of DESIGN_AGENTS.md premium utilities (IconBox, PageTransition, glass)
**Why it matters**: DESIGN_AGENTS.md explicitly mandates IconBox wrappers with soft backgrounds, glassmorphism for sticky elements, card-hover-modern, and framer-motion page transitions. PageTransition and IconBox exist in `src/components/ui/` but are not imported. The sticky TabBar would benefit from `.glass` backdrop-filter. The page looks like an unstyled prototype next to the design system's stated ambitions.

**Fix**: Wrap the entire return in `<PageTransition>`. Replace every `CardTitle` icon pattern (lines 272, 349, etc.) with IconBox components using color semantics (blue for identity, green for finance, orange for housing). Add staggered framer-motion entrance to Overview cards. Apply `.glass` to the sticky TabBar.

**Suggested command**: `$impeccable bolder` (or `$impeccable polish`)

---

### [P1] No tab URL persistence — tab state is lost on refresh or link-sharing
**Why it matters**: Alex (power user) cannot deep-link a colleague to "check the payments tab for resident XYZ." On page refresh, the tab resets to Overview. On browser back/forward, tab state is lost. This is a basic web navigation affordance that tabs should support natively.

**Fix**: Sync the active tab value with a `?tab=payments` URL search parameter. Read `defaultValue` from `searchParams.get('tab')` on mount. Use `router.replace()` with the updated param on `onValueChange` without triggering a full navigation.

**Suggested command**: `$impeccable harden`

---

### [P2] Severe accessibility gaps — only 2 aria-labels on a 470-line page
**Why it matters**: Sam (keyboard-only, screen-reader user) encounters: Trash2 icon buttons with no accessible name (screen reader announces "button"), no `role="tabpanel"` or `aria-labelledby` on TabsContent (tab panels are invisible to assistive tech), no `aria-describedby` linking FormDescription to inputs in resident-form.tsx, and no focus management when switching tabs.

**Fix**: Add `aria-label` to all icon-only buttons. Add `role="tabpanel"` and `aria-labelledby` to each TabsContent. Implement focus management (focus the tab panel on selection). Add `aria-describedby` connecting FormDescription to FormControl inputs.

**Suggested command**: `$impeccable audit`

---

### [P2] Resident form silently clears corporate fields on entity_type change
**Why it matters**: Lines 162-170 use `useEffect` to clear company_name, rc_number, and liaison fields when entityType changes away from "corporate." A user who accidentally toggles from Corporate to Individual and back loses all their entered corporate data with no warning. Jordan (first-timer) may toggle experimentally and lose work. This is a data-loss bug.

**Fix**: Preserve corporate form values in state but hide the fields via conditional rendering. Only clear them on explicit form submission when entity_type !== "corporate", not on every toggle. Alternatively, add a warning dialog before clearing.

**Suggested command**: `$impeccable harden`

---

### [P3] Resident notes redundantly shown in Overview and Notes tab — different experiences
**Why it matters**: The Overview tab shows `resident.notes` as a dead, read-only Card (lines 343-353) while the Notes tab shows a rich, interactive NotesTimeline component. This creates two different note experiences for the same data, and the Overview card has no editing capability or link to the Notes tab.

**Fix**: Either remove the notes Card from Overview entirely (notes are a separate tab) or make it a preview widget showing the 1-2 most recent notes with a "View All Notes" button that switches to the Notes tab.

**Suggested command**: `$impeccable distill`

---

## Cognitive Load Assessment

**Score: 4/8 items failed — High cognitive load (critical fix needed)**

| Checklist Item | Status | Notes |
|----------------|--------|-------|
| Single focus | **FAIL** | 7 disparate widgets in Overview with no focal point |
| Chunking | **FAIL** | Financial data scattered across 3 non-contiguous grid rows |
| Grouping | Partial | Related items co-located but no section headers |
| Visual hierarchy | **FAIL** | All cards identically styled — no primary/secondary distinction |
| One thing at a time | **FAIL** | Wallet, verification, and cross-property summaries compete simultaneously |
| Minimal choices | Pass | Tab architecture provides clean boundaries; action buttons are limited |
| Working memory | Partial | Form conditional logic is smart but requires remembering hidden fields |
| Progressive disclosure | Pass | CrossPropertyPaymentSummary uses Collapsible; tabs provide top-level disclosure |

## Emotional Journey

The page delivers a flat, low-emotion arc. Landing state is a dense grid of identically-styled cards with no welcome, no summary, no visual anchor — a first-time admin faces immediate cognitive overwhelm. The peak emotional moment is the verification workflow (AdminContactVerification dialog with audit-logging disclosure), which is well-judged. However, the emotional valley is deep — the archive action uses browser `confirm()` for what could be the most consequential action on the page. There's no peak-end moment: after browsing tabs, the user leaves with no sense of completion. No celebratory animation for verification. No "recent activity" timeline giving narrative context to the resident's record. The notes in Overview are buried in dense content rather than surfaced as a humanizing anchor.

## Persona Red Flags

**Alex (Power User)** — Admin managing many residents quickly:
- No tab deep-linking via URL — cannot bookmark or share specific resident tabs
- No keyboard shortcuts for tab navigation or common actions (Verify, Edit, Archive)
- Must navigate to separate edit page losing tab context rather than inline-editing
- Archive uses native confirm() — a 2-click pattern where a keyboard shortcut would serve
- All cards equal visual weight — cannot prioritize high-signal data (financial standing, verification gaps)

**Jordan (First-Timer)** — New admin staff member:
- 7+ widgets on first load with no onboarding or guided introduction
- Complex terms (entity_type, resident_role, sponsor, wallet, levy) have no tooltips or inline definitions
- Overview tab mixes unrelated concepts with no narrative flow — financial data next to emergency contacts
- Archive via confirm() — a single accidental enter-press could archive with no recovery
- Form silently clears corporate fields on entity type toggle without warning

**Sam (Accessibility-Dependent)** — Keyboard-only, screen-reader user:
- Only 2 aria-label attributes across 470 lines — dozens of unlabeled interactive elements
- Trash2 icon buttons in linked-houses have no accessible name — screen reader announces "button"
- No role="tabpanel", aria-labelledby, or aria-controls on TabsContent panels
- Sticky z-10 tab bar may create focus trapping for keyboard navigation
- No aria-describedby linking FormDescription to form inputs in resident-form.tsx
- No skip-link mechanism to bypass the action bar

## Minor Observations

- Edit mode heading uses text-3xl while view mode uses text-xl — should be consistent
- Verify button uses inline green-600/700 rather than a semantic variant or success color token
- 17 icons imported but LinkIcon and Users appear unused in the view mode — clean up
- Tab content spacing: mt-3 for Overview, mt-6 for all others — inconsistent vertical rhythm
- Personal Info card repeats AccountStatusBadge already shown in the header bar — duplicate information
- max-h-[340px] on housing section vs max-h-[380px] on wallet transactions — why different?
- WalletBalance has internal Skeleton but page-level doesn't — creates half-populated card flash
- CrossPropertyPaymentSummary uses Collapsible (sole progressive disclosure example on page) — pattern should be replicated
- Resident form at 752 lines pushes readability thresholds — onSubmit type transformation could be extracted
- Avatar components exist in the UI kit but no profile photo used on the detail page

## Questions to Consider

1. **Priority direction**: I found problems with visual hierarchy, financial data grouping, accessibility, and premium visual treatment. Which area matters most right now — making it look premium (IconBox, animations, glass) or fixing ergonomics (tab URLs, archive UX, accessibility)?
2. **Design intent**: The page reads as a functional prototype that hasn't received the DESIGN_AGENTS.md premium pass. Is this an intentional "build first, polish later" phase, or was the DESIGN_AGENTS.md standard unknown to the engineers building this page?
3. **Scope**: 8 priority issues found (2 P0, 3 P1, 2 P2, 1 P3). Three major improvement axes: **premium visual treatment** (IconBox, PageTransition, glass), **ergonomics** (tab URLs, archive dialog, skeleton loading), and **accessibility** (aria labels, tab roles, focus management). How much do you want to take on — all of it, or just the P0/P1 items?
