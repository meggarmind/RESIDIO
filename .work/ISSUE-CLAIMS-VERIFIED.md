# Independent verification of the issues' factual claims

Done by me before dispatching any agent, because #163 turned out to rest on a stale
premise and I could not assume the others were sound. Every `file:line` an issue cites
was checked against `epic/180`.

| Issue | Claim | Verdict |
|-------|-------|---------|
| #163 | "prettier is in neither `package.json` nor `node_modules`"; "a fresh `npm ci` reproduces the breakage" | **DOUBTFUL — under test.** `package.json` genuinely omits it, but `prettier@3.7.4` is a declared **`dependencies`** entry of `@react-email/render@2.0.0` and is present in the **committed** `package-lock.json` since `4590ecd` (2025-12-21), long before the issue was filed. `npm ls prettier` resolves it cleanly under the render tree, not as extraneous. A cold `npm ci` in a fresh clone is running to settle it. |
| #164 | search route's only auth touch is `supabase.auth.getUser()` for logging | **CONFIRMED.** Single match, `src/app/api/search/route.ts:185`. `QUICK_ACTIONS` at line 69, filtered only by query text at 129–130. |
| #165 | the read side is mounted nowhere | **CONFIRMED.** An uncapped grep for `useSearchAnalytics`, `SearchAnalyticsCard` and `getSearchAnalytics` across `src/**`, excluding the three definition files themselves, returns **zero** matches. |
| #166 | badge order (`groupOrder`) and hotkey order (flat `results`) differ | **CONFIRMED.** `groupOrder` declared at `global-search-command.tsx:227`, consumed for rendering at 399. |
| #171 | audit-log links at `recent-activity-card.tsx:203`, `modern-recent-activity.tsx:154`; redirect precedent at `settings/user-roles/page.tsx`; `settings-nav-coverage.test.ts` exists | **CONFIRMED**, all four, at the exact lines cited. |
| #173 | `queue-management.ts` is 153 lines, `queue.ts` is 395; "View History" link at `settings/notifications/page.tsx:264` | **CONFIRMED.** 153 and 395 exactly; the link is on line 264. |
| #174 | `/api/health/cron-status` has **no** authentication at all | **CONFIRMED — this is a live hole.** `grep -c` for `authorizePermission` or `getUser` across the whole route file returns **0**. Stale email link confirmed at `send-admin-alert.ts:158` (`actionUrl: '/settings/system'`). |
| #175 | dead `dataManagementVisible` branch at `settings/page.tsx:38`; `revalidatePath('/settings/system')` at `prune-data.ts:78` | **CONFIRMED**, both at the cited lines. |
| #177 | header health link at `header.tsx:94` points at `/settings/system` | **CONFIRMED.** |
| #178 | two e2e group-name regexes will silently stop matching | **CONFIRMED.** `e2e/enhancements.spec.ts:96` `/billing.*finance/i` and `:113` `/estate configuration/i`. Both Gmail pages exist. |

**Conclusion:** the issue set is unusually well-researched — sixteen of seventeen
factual claims verified exactly, including line numbers. #163 is the lone outlier, and
its premise appears to have been overtaken by the repository's own history rather than
being wrong when written.
