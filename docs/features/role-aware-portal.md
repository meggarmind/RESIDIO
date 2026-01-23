# Feature: Role-Aware Single Portal

**Status**: 🚧 In Progress
**Phase**: Phase 18 - UX & Portal Refinement
**Related**: `docs/architecture/resident-types-roles.md`, `implementation_plan.md`

---

## Overview

The **Role-Aware Single Portal** architectural pattern serves all resident types (Tenants, Resident Landlords, Non-Resident Landlords, etc.) through a single unified interface (`/portal`) that adapts contextually to the user's role.

For users with multiple roles (e.g., a **Resident Landlord** who also owns other investment properties in the estate), the system provides a **Context Switcher** to toggle between "My Home" (resident view) and "My Portfolio" (landlord view).

### Goals

1.  **Unified Experience**: A single entry point for all users, reducing confusion and maintenance.
2.  **Contextual Relevance**: Dashboards that show only what matters for the current "mode".
3.  **Scalability**: Easily add features for specific roles without duplicating the entire portal.

---

## Architecture: The Hybrid View

### Context Switcher

A toggle in the Portal Header (visible only to users with mixed roles) allows switching between:

1.  **My Home (Resident Mode)**
    *   **User Persona**: Owner-Occupier, Tenant, Co-Resident.
    *   **Focus**: Living in the property.
    *   **Key Widgets**:
        *   Wallet Balance
        *   Bills Due (for the occupied unit)
        *   Security Contacts (Gate access)
        *   Visitors
        *   Panic Button
    *   **Data Scope**: Restricted to the property `resident_houses.is_active = true` AND `is_live_in = true`.

2.  **My Portfolio (Landlord Mode)**
    *   **User Persona**: Non-Resident Landlord, Resident Landlord (acting as investor), Developer.
    *   **Focus**: Managing assets.
    *   **Key Widgets**:
        *   **Portfolio Overview**: List of all owned units with "Occupied/Vacant" status.
        *   **Compliance Status**: Development Levy, Service Charge status for all units.
        *   **Tenant Overview**: Privacy-restricted view of current occupants.
        *   **Bulk Actions**: "Pay All Dues".
    *   **Data Scope**: All properties where user is `owner` or `landlord`, regardless of residency.

### Navigation Updates

Terminology updated to match user mental models:

*   **Transactions** (formerly "Imports"): Bank feeds, payments, history.
*   **Contractors & Staff** (formerly "Personnel"): Vendors, domestic staff, workers.
*   **Invoices & Dues** (formerly "Billing"): Invoices, levies, service charges.

---

## Feature Roadmap

### Phase 1: Foundation & Navigation
- [ ] Rename navigation items (Transactions, Contractors, Invoices).
- [ ] Implement `useUserRoles` hook.
- [ ] Create `DashboardContextSwitcher` component.

### Phase 2: Dashboard Views
- [ ] Update `ResidentPortalHomePage` to support modes.
- [ ] Build `PortfolioDashboard` component.
- [ ] Implement widgets: `PropertyPortfolioCard`, `ComplianceStatusWidget`.

### Phase 3: UX Polish
- [ ] "Spotlight" Global Search adjustments.
- [ ] System Theme sync (Auto Dark/Light).
- [ ] Mobile Pull-to-Refresh.

---

## Technical Details

### State Management
*   **Mode State**: Stored in URL query param (`?mode=portfolio`) or local storage, defaulting to 'home'.
*   **Permissions**: Reuse existing `src/lib/portal/permissions.ts`.

### Components
*   `src/components/portal/dashboard-context-switcher.tsx`
*   `src/components/portal/portfolio-dashboard.tsx`
*   `src/hooks/use-user-roles.ts`
