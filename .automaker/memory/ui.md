---
tags: [ui]
summary: ui implementation decisions and patterns
relevantTo: [ui]
importance: 0.7
relatedFiles: []
usageStats:
  loaded: 0
  referenced: 0
  successfulFeatures: 0
---
# ui

#### [Pattern] Data-slot attributes used as primary testing selectors and CSS targeting hooks instead of relying on class names or semantic HTML (2026-01-11)
- **Problem solved:** Needed stable selectors for Playwright tests that wouldn't break with CSS refactoring, and wanted theme-aware styling without coupling to implementation details
- **Why this works:** Data attributes decouple test selectors from styling concerns. If CSS classes change during theme updates or refactors, tests still work. Allows multiple unrelated style systems to target same elements independently
- **Trade-offs:** Requires explicit markup additions (+5-10% template verbosity) but gains test stability and cleaner separation between styling layers. Makes component variants self-documenting through markup

### CVA variant system used for component styling instead of conditional className concatenation (2026-01-11)
- **Context:** Multiple visual variants needed (glass, elevated, interactive for cards; modern, outline, ghost, etc for buttons) with complex state combinations
- **Why:** CVA provides type-safe variant composition, prevents invalid variant combinations at compile time, and centralizes variant definitions. Reduces runtime style computation vs string concatenation
- **Rejected:** Tailwind arbitrary values (no type safety, variant combinations scattered across components), CSS modules (verbose, less DRY), inline styles (performance, maintainability)
- **Trade-offs:** Adds build-time dependency and small bundle overhead, but eliminates entire class of runtime errors where invalid variant combinations create broken UI. Makes variants explicit and auditable
- **Breaking if changed:** Changing CVA variant schema breaks all component instantiations. If removing a variant like 'glass', all usages must be updated. The type system catches this at build time rather than runtime

#### [Pattern] Skeleton screens with shimmer animation used as standard loading state across all pages rather than spinners or simple empty states (2026-01-11)
- **Problem solved:** Needed visual feedback during data loading that matches final component layout to prevent layout shift and jarring transitions
- **Why this works:** Skeleton screens maintain layout stability (no CLS violations), provide content preview that matches final render, and feel more modern/premium than spinners. Shimmer animation holds user attention without being distracting
- **Trade-offs:** Requires creating skeleton versions of each component (more code), but eliminates cumulative layout shift and provides better perceived performance. Users see content shape immediately

### Staggered animations applied at CSS level with delay classes rather than JavaScript orchestration (2026-01-11)
- **Context:** Multiple cards needed sequential entrance animations to create visual hierarchy and guide user attention
- **Why:** CSS delays (animate-slide-up with stagger-delay-{n} classes) are declarative, performant (runs on compositor thread), and work without JavaScript. Easier to adjust timing globally via CSS variables
- **Rejected:** JavaScript animation libraries (added runtime complexity, more code), GSAP (external dependency, overkill for simple delays), hardcoded delays in components (not reusable, hard to tune globally)
- **Trade-offs:** Limited to CSS-capable animations, but covers 95% of use cases. Simpler than JS solution. Makes timing changes a one-line CSS update instead of component refactor
- **Breaking if changed:** If removing animation utilities from globals.css, all stagger classes become inert. Changing CSS variable --animation-duration affects all staggered animations globally (good or bad depending on intent)

#### [Gotcha] Report type selection uses visual checkmark (bg-emerald-500) for selection state, not radio/checkbox (2026-01-11)
- **Situation:** Playwright test specifically validates for `.bg-emerald-500` div appearance on click, not form control state
- **Root cause:** Card-based selection UI (design-first approach) vs semantic HTML controls. Matches modern report wizard UX pattern
- **How to avoid:** Visual consistency but harder to test programmatically (selector-dependent); accessibility must be manually verified (aria-checked, role attributes)

#### [Gotcha] Checkbox state changes in multi-select dialogs require explicit waitForLoadState and timeout assertions rather than relying on synchronous click events (2026-01-11)
- **Situation:** Initial test attempted to verify that unchecking Email checkbox would decrement channel count from 3 to 2, but checkbox.click() wasn't reliably unchecking the element
- **Root cause:** Dialog rendering is asynchronous - checkbox may be visually present but not yet interactive. Click registers but state update propagates after React re-render cycle. Without explicit waits, assertions race against state updates.
- **How to avoid:** Lost test coverage of dynamic channel selection toggling, but gained reliability. Test now only verifies default state, not user interactions with channel toggles.

### Reminder configuration UI uses 'Reset to Default' button rather than auto-reverting to defaults or requiring explicit schema selection. (2026-01-11)
- **Context:** Users need to quickly restore standard reminder schedule after experimentation without navigating to documentation.
- **Why:** Explicit reset button makes the destructive action visible and intentional. Auto-revert would silently overwrite changes on certain triggers, confusing users. Schema selection adds friction to common case.
- **Rejected:** Auto-revert on page reload - unexpected behavior, users lose changes without warning. Schema selection dropdown - adds cognitive load for 95% of users who use defaults.
- **Trade-offs:** Requires one more click to reset, but makes action discoverable and intentional. Users can experiment freely knowing reset is one click away.
- **Breaking if changed:** Removing the reset button forces users to manually reconfigure 4 standard steps, creating support burden and increasing configuration errors from typos.

#### [Pattern] Preset date ranges (last month, 3/6/12 months, YTD, custom) in dialog instead of just custom date picker (2026-01-11)
- **Problem solved:** Residents generating statements for billing inquiries or reports
- **Why this works:** Preset ranges handle 90% of use cases (most people want last month or YTD). Custom option remains for edge cases. Reduces cognitive load and clicks for common scenarios. Mirrors accounting software patterns.
- **Trade-offs:** Slightly more UI complexity for cleaner UX. Preset options slightly constrain use cases but align with user expectations from accounting software.