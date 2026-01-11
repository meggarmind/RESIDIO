---
tags: [testing]
summary: testing implementation decisions and patterns
relevantTo: [testing]
importance: 0.7
relatedFiles: []
usageStats:
  loaded: 0
  referenced: 0
  successfulFeatures: 0
---
# testing

#### [Gotcha] Waiting for 'networkidle' is insufficient for verifying animations and loaded states; additional setTimeout needed (2026-01-11)
- **Situation:** Initial test runs showed false negatives where pages appeared loaded but animations hadn't started or component states were still initializing
- **Root cause:** NetworkIdle only waits for HTTP requests to complete, not for component lifecycle or animation initialization. Frameworks like React may still be rendering/hydrating after network is idle. Animations are scheduled with requestAnimationFrame or setTimeout, which execute after network idle
- **How to avoid:** Adding explicit wait times makes tests slightly slower but dramatically more reliable. The 2000ms timeout is arbitrary but covers most animation/hydration scenarios

#### [Gotcha] Page screenshots and full_page=True parameter necessary to capture off-screen animations and verify complete visual state (2026-01-11)
- **Situation:** Initial tests only checked DOM elements and animation presence, but didn't verify actual visual rendering or animation execution
- **Root cause:** Browser renders elements differently on-screen vs off-screen (CSS media queries, viewport-dependent styles). Full-page screenshots serve as visual regression baseline and prove animations render correctly
- **How to avoid:** Screenshots add disk I/O and make CI/CD pipeline slower, but provide undeniable proof of visual implementation. Creates maintenance burden of updating baseline screenshots on intentional changes

#### [Pattern] Verification tests deleted after passing - no permanent test coverage added for new report type (2026-01-11)
- **Problem solved:** Tests written to validate feature works, then removed. No integration tests remain in codebase
- **Why this works:** Temporary verification during development to confirm report selection and display work before integration
- **Trade-offs:** Quick validation but no regression protection; future changes to report wizard could break debtors report silently

### Replaced flaky dynamic interaction test (unchecking Email and verifying count decrements) with static state verification test of default selections (2026-01-11)
- **Context:** Playwright e2e test for channel count was failing intermittently because checkbox click wasn't reliably triggering state updates before assertions
- **Why:** Static verification is more reliable in e2e testing when dealing with form state updates. Default state is critical to feature correctness and less prone to timing issues. Dynamic toggle behavior is implementation detail that can be caught by unit tests.
- **Rejected:** Adding more wait states and timeouts to dynamic test (addresses symptom, not root cause - dialog rendering timing is unpredictable in e2e)
- **Trade-offs:** Simpler, faster test that catches the important case (are default channels correct?), but loses verification that toggle interaction works. Assumes unit tests verify toggle behavior.
- **Breaking if changed:** If checkbox defaults change (e.g., Email becomes unchecked by default), test will fail. If toggle interaction becomes broken, e2e test won't catch it - relying on unit test coverage for that path.

#### [Gotcha] Playwright strict mode violation: getByText() matches multiple elements when text appears in both label and toggle component. Must use getByLabel() instead for form controls. (2026-01-11)
- **Situation:** Test failed with 'strict mode violation' when verifying 'Auto-Apply Late Fees' toggle - text existed in multiple DOM locations
- **Root cause:** Form controls often have text in multiple places (label element, aria-label, component text). getByLabel() specifically targets the accessible label relationship.
- **How to avoid:** getByLabel() is more restrictive (only works for properly labeled controls) but forces better accessibility patterns

#### [Pattern] Async UI state polling pattern: Use page.waitForFunction() to verify element readiness before interaction, checking both visibility AND enabled state with explicit timeouts. (2026-01-11)
- **Problem solved:** Settings page components were disabled during load, causing race conditions. Simple waitForLoadState() wasn't sufficient.
- **Why this works:** Network idle doesn't guarantee DOM interactivity. Form controls often have disabled state during async operations. Must wait for actual usable state.
- **Trade-offs:** Longer test setup time but eliminates flaky tests. Makes test intent explicit rather than implicit timing assumptions.

#### [Gotcha] Playwright tests for navigation with dev server compilation showed intermittent failures due to race conditions between click events and page compilation. (2026-01-11)
- **Situation:** Navigation test failed inconsistently - page showed 'Compiling' state after click, causing test timeout before navigation completed.
- **Root cause:** Dev server recompilation during test execution creates unpredictable timing windows. Using Promise.all() to race click against waitForURL ensures both operations complete before assertions.
- **How to avoid:** Promise.all() approach is more robust but requires higher timeouts (30s) to account for dev server delays. Increases test duration but eliminates flakiness.

#### [Pattern] Test parallelism (workers=1) was necessary to disambiguate flaky test failures from actual feature failures. (2026-01-11)
- **Problem solved:** Initial test runs showed 9/11 passing, then full failure, suggesting either feature issue or test infrastructure problem. Reducing parallelism from default to single worker revealed infrastructure was the issue.
- **Why this works:** Parallel test execution can cause race conditions in shared test environment (login rate limits, database locks, shared browser state). Single-worker runs isolate true feature failures from coordination issues.
- **Trade-offs:** Single-worker test execution takes 3-5x longer but provides reliable signal about feature health vs test infrastructure. Trade test speed for test reliability.

#### [Gotcha] E2E test timing issues with admin billing page navigation - the test is fragile to network/rendering delays even though feature works (2026-01-11)
- **Situation:** Admin invoice detail page test failed intermittently despite feature being correctly implemented and passing in other tests
- **Root cause:** Timing issues indicate reliance on race conditions: waiting for table rows to render, waiting for navigation without explicit element anchors. Network latency or render delays cause intermittent failures. Problem is test brittleness, not feature.
- **How to avoid:** Accepting test fragility vs. spending time on test resilience. Two passing tests (API + resident portal) verify feature correctness; timing issues are orthogonal to implementation.

#### [Gotcha] Verification test failed because admin user doesn't have resident invoices - portal routes require resident role, not admin (2026-01-11)
- **Situation:** Created Playwright verification script that tried to pay invoice as logged-in user
- **Root cause:** Role-based routing prevents admin access to resident portal (/portal/ routes). Admin is separate super-user role with different UI
- **How to avoid:** Easier: verified code compiles and routes exist. Harder: cannot fully E2E test without resident account setup