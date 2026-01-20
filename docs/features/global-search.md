# Global Search Feature

**Status:** In Progress  
**Last Updated:** 2026-01-20

## Overview

The Global Search command palette provides real-time search across multiple modules:
- Quick Actions (static)
- Residents (by name, phone, email)
- Properties (by house number, street name)
- Payments (by reference, amount)
- Security Contacts (by name)
- Documents (by title)

Uses cmdk for keyboard navigation with Modern theme styling. Adapts shortcuts based on OS (⌘K vs Ctrl+K).

## Component

- **File:** `src/components/dashboard/global-search-command.tsx`
- **Used by:** Dashboard Header (`src/components/dashboard/header.tsx`)

## Known Issues & Fixes

### 2026-01-20: Phone Column Mismatch (FIXED)
- **Issue:** Search queried `phone` column which doesn't exist (correct column: `phone_primary`)
- **Impact:** Resident search silently failed, returning no results
- **Fix:** Updated `.select()` and `.or()` to use `phone_primary`

## Enhancement Roadmap

### Phase 1: Performance Optimization ✅ Partial
- [x] Fix phone column bug
- [ ] Parallel query execution with `Promise.all()`
- [ ] Add error handling to all entity searches

### Phase 2: API Consolidation (High Priority)
- [ ] Create `/api/search` unified endpoint
- [ ] Migrate client to single API call
- [ ] Add server-side error handling and logging
- [ ] Reduce network round-trips from 5+ to 1

### Phase 3: Database Optimization (High Priority)
- [ ] Enable `pg_trgm` extension via migration
- [ ] Create trigram indexes on search columns:
  - `residents.first_name`, `residents.last_name`
  - `houses.house_number`
  - `streets.name`
- [ ] Update queries to use similarity functions

### Phase 4: Client Caching (High Priority)
- [ ] Implement React Query with `staleTime` of 30 seconds
- [ ] Cache results by query string
- [ ] Show cached results immediately while refetching

### Phase 5: UX Enhancements (Medium Priority)
- [ ] Result prioritization with weighted scoring
- [ ] Recent searches stored in localStorage
- [ ] Popular entities suggestions
- [ ] Keyboard shortcuts for power users (⌘1-5)

### Phase 6: Advanced Features (Lower Priority)
- [ ] Async search worker for background processing
- [ ] Search analytics integration with existing Analytics page

## Technology Considerations

### Redis/Memcache Evaluation
**Not recommended for current scale.** The application is a single-tenant estate management system with likely <5000 searchable entities. PostgreSQL with proper indexes (`pg_trgm`) will handle this efficiently.

Redis would add:
- Operational complexity (separate service to manage)
- Sync concerns (cache invalidation on data changes)
- Minimal benefit at current scale

**When to reconsider:** If search latency exceeds 500ms with pg_trgm indexes, or if the application evolves to multi-tenant with 100k+ entities.

### Mobile User Impact
All proposed optimizations benefit mobile users:
- **Unified API:** Reduces battery drain from multiple network calls
- **React Query caching:** Less data transfer, faster perceived response
- **pg_trgm:** Server-side optimization, transparent to client

## Testing

### Manual Verification
1. Navigate to any admin page
2. Press `Ctrl+K` (or `⌘+K` on Mac)
3. Type a resident's first or last name (e.g., "Feyijimi")
4. Verify results appear under "Residents" group
5. Click result → confirm navigation to `/residents/{id}`

### Performance Check
1. Open browser DevTools → Network tab
2. Perform a search
3. Target response time: < 500ms
