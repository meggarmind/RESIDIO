# Residio Feature Inventory

This document provides a low-level inventory of existing capabilities, business rules, and technical implementation details for the Residio application. It serves as a reference for manual verification and a roadmap for automated testing.

---

## 1. Authentication & Access Control (RBAC)

| Feature | Capability | Business Rules | Technical Implementation | test scenarios |
| :--- | :--- | :--- | :--- | :--- |
| **Granular RBAC** | 7+ Configurable Roles | Roles have hierarchical levels (0=Super Admin). | `app_roles` table, `app_permissions` enum. | Create custom role; verify hierarchy enforcement. |
| **Permissions Check** | View/Create/Update/Delete per module | `has_permission()` SQL function & `authorizePermission()` server action. | `role_permissions` junction table. | Attempt action without permission (expect 403). |
| **Admin Impersonation** | Admins view portal as residents | Read-only mode; session logging; automatic expiration. | `impersonation_sessions` table; `use-impersonation.ts` hook. | Start/Exit impersonation; verify read-only constraints. |
| **Audit Logging** | Immutable activity trail | Every write action (DML) MUST be logged with old/new values. | `logAudit()` server action; `audit_logs` table. | Perform update; verify detailed log entry creation. |

---

## 2. Resident Management

| Feature | Capability | Business Rules | Technical Implementation | Test Scenarios |
| :--- | :--- | :--- | :--- | :--- |
| **Resident Creation** | Add new resident with auto-code | Auto-generates 6-digit numeric `resident_code`. | `create-resident.ts` action; DB Trigger. | Create resident; verify code format and uniqueness. |
| **House Assignment** | Link resident to property | enforces occupancy rules (e.g., max 1 Owner-Occupier). | `resident_houses` table; `validateHouseAssignment`. | Assign tenant to house with owner-occupier. |
| **Renter Move-Out** | Initiate/Confirm move-out | requires financial clearance (net balance >= 0). | `move-out-renter.ts`; `ClearanceCertificate` generation. | Initiate move-out for resident with debt (expect fail). |
| **Household Mgmt** | Add dependence/staff | Primary residents can manage their household members. | `add-household-member.ts`; `is_primary` flag. | Primary resident adds household member in portal. |
| **Code Verification** | Phone/Email verification | 6-digit OTP for contact verification. | `20251231100000_add_contact_verification.sql`. | Trigger OTP; verify with correct/incorrect code. |

---

## 3. House & Property Management

| Feature | Capability | Business Rules | Technical Implementation | Test Scenarios |
| :--- | :--- | :--- | :--- | :--- |
| **Ownership History** | Track property transitions | Immutable history of who lived where and when. | `house_ownership_history` table; `OwnershipHistory` component. | Confirm move-out; verify history record entry. |
| **Property ID** | Shortname mapping | support for display IDs (e.g., "PALM-10"). | `short_name` column in `houses`; `getPropertyShortname` util. | Update house shortname; verify UI update across portal. |
| **Occupancy Status** | Logic-based status | House is "Occupied" if it has an active Resident-Landlord or Tenant. | `is_occupied` column updated by triggers. | Remove all residents; verify status flips to "Vacant". |

---

## 4. Billing & Financials

| Feature | Capability | Business Rules | Technical Implementation | Test Scenarios |
| :--- | :--- | :--- | :--- | :--- |
| **Invoice Gen** | Automated monthly billing | Priority: Tenant > Resident Landlord > Non-Resident Landlord. | `generate-invoices.ts`; Cron/Manual trigger. | Generate invoices; verify pro-rata for move-in month. |
| **Wallet System** | Resident credit/debit | Auto-allocation to unpaid invoices (FIFO). | `wallets` table; `debitWalletForInvoice` action. | Record payment; verify auto-payment of oldest invoice. |
| **Late Fees** | Automated penalties | Applies flat fee or percentage after grace period. | `apply-late-fees.ts`; `late_fee_settings`. | Reach due date; verify late fee addition to invoice. |
| **Levies** | One-time global fees | Support for flat fees per house (e.g., Development Levy). | `is_one_time` flag in `billing_profiles`. | Create levy; verify all eligible houses receive invoice. |
| **Split Payments** | partial payments | Invoice remains 'partial' until amount_due is met. | `create-split-payment.ts`. | Pay 50% of invoice; verify status is 'partial'. |

---

## 5. Security & Gate Operations

| Feature | Capability | Business Rules | Technical Implementation | Test Scenarios |
| :--- | :--- | :--- | :--- | :--- |
| **Access Codes** | Temporary/Permanent codes | Auto-expired; usage limits (e.g., "one-time"). | `access_codes` table; `generateAccessCode`. | Generate one-time code; use it twice (expect failure). |
| **Time Windows** | Restricted access times | e.g., "Staff only allowed 8am-5pm Mon-Fri". | `isCodeValidForTimeWindow` logic. | Verify code outside allowed time window. |
| **Access Logs** | Entry/Exit tracking | Records timestamp, guard ID, and contact details. | `access_logs` table; `record_access` action. | Verify code at gate; verify log entry creation. |
| **Visitor Analytics** | Traffic trends | Heatmaps and volume charts for gate activity. | `visitor-analytics.ts`; Recharts components. | Log multiple entries; verify analytics dashboard updates. |

---

## 6. Integrations & Automation

| Feature | Capability | Business Rules | Technical Implementation | Test Scenarios |
| :--- | :--- | :--- | :--- | :--- |
| **Gmail Import** | Sync bank statements | Automated fetching and parsing of PDF statements. | `gmail-oauth.ts`; `parse-email.ts`; `qpdf` for decryption. | Import First Bank statement; verify transaction parsing. |
| **Notification Sys** | Multi-channel alerts | In-app + Email for invoices, receipts, and announcements. | `in_app_notifications` table; `sendEmail` util. | Generate invoice; verify email delivery and in-app alert. |
| **Announcement Sys** | Estate-wide broadcasts | Scheduling; read receipts; emergency priority. | `announcements` table; `broadcast_priority` enum. | Create emergency announcement; verify sticky visibility. |

---

## 7. UI/UX & Theming

| Feature | Capability | Business Rules | Technical Implementation | Test Scenarios |
| :--- | :--- | :--- | :--- | :--- |
| **Theme Registry** | 10 Preset Themes | High-aesthetic presets (Supabase, Doom-64, etc.) via tweakcn. | `tweakcn-registry.ts`; `OKLCH` color system. | Switch theme; verify CSS variable injection in DOM. |
| **Responsive UI** | Mobile-first portal | Bottom navigation; cards-based layouts for small screens. | `portal-bottom-nav.tsx`; Tailwind breakpoints. | Check portal on mobile breakpoint; verify bottom nav. |
| **Smart Action Ctr** | Contextual actions | Suggests actions based on resident status and context (e.g., Friday morning cleaner code, end-of-month bill review). | `smart-action-center.tsx`. | Resident with debt logs in; verify "Pay Bills" suggestion. |
| **AI Assistant** | Floating chatbot | Proactive suggestions via bubble; Mock AI responses for estate info. | `use-ai-assistant.ts`; `EstateAiAssistant.tsx`. | Trigger Friday morning suggestion; verify AI bubble content. |
