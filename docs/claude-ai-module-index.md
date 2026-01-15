# Residio Module Index

> **Purpose**: Reference document for Claude.ai prompt enrichment
> **Last Updated**: 2026-01-15
> **Total Server Actions**: 185 files across 31 modules

---

## Server Actions (src/actions/)

### Core Modules

#### residents/
Resident management - CRUD, house assignments, verification, ownership transfers
- `create-resident` - Create new resident with role assignment
- `update-resident` - Update resident details
- `delete-resident` - Soft delete resident
- `get-resident` / `get-residents` - Fetch resident(s)
- `get-resident-stats` - Dashboard statistics
- `assign-house` / `unassign-house` - Property assignments
- `add-household-member` - Add secondary residents (household_member, domestic_staff, caretaker)
- `transfer-ownership` - Transfer property ownership between residents
- `move-out-landlord` / `move-out-renter` - Move-out workflows
- `verify-resident` - Verification status management
- `update-resident-house` - Update assignment details
- `remove-ownership` - Remove ownership without full transfer
- `inherit-domestic-staff` - Transfer staff to new owner
- `swap-resident-roles` - Swap roles between residents
- `sponsor-cascade` - Handle sponsor relationship cascades
- `aliases` - Manage payment aliases for bank matching

#### houses/
Property management - CRUD, ownership history, transitions
- `create-house` / `update-house` / `delete-house` - CRUD operations
- `get-house` / `get-houses` - Fetch property(ies)
- `get-house-stats` - Property statistics
- `get-house-residents` - Get residents assigned to property
- `get-ownership-history` - Property ownership timeline
- `property-transition` - Handle property state transitions

#### billing/
Invoice generation, levies, wallet operations, late fees
- `generate-invoices` - Generate service charge invoices
- `generate-levies` - Generate one-time levy invoices
- `get-invoices` - Fetch invoices with filters
- `apply-late-fees` - Apply late fees to overdue invoices
- `check-overdue-invoices` - Check and mark overdue status
- `wallet` (via profiles) - Wallet credit/debit operations
- `pay-invoice-with-wallet` - Pay single invoice from wallet
- `pay-multiple-invoices-with-wallet` - Pay multiple invoices from wallet
- `get-account-statement` - Generate account statement
- `create-invoice-correction` - Create invoice adjustments
- `get-invoice-corrections` - Fetch corrections
- `dispute-invoice` - Handle invoice disputes
- `reverse-payment-allocation` - Reverse payment allocations
- `get-generation-log` - Invoice generation history
- `late-fee-waivers` - Manage late fee waivers

#### payments/
Payment recording, bulk operations, split payments
- `create-payment` - Record new payment
- `update-payment` / `delete-payment` - Modify/remove payment
- `get-payment` / `get-payments` - Fetch payment(s)
- `get-payment-stats` - Payment statistics
- `bulk-update-payments` - Bulk status updates
- `create-split-payment` - Split payment across invoices
- `get-resident-properties-for-payment` - Get properties for payment form
- `check-overdue` - Check overdue payments

#### security/
Security contacts, access codes, visitor management
- `contacts` - CRUD for security contacts
- `codes` - Generate/revoke access codes
- `categories` - Security contact categories
- `settings` - Security module settings
- `access-logs` - Check-in/check-out logging
- `export` - CSV export for contacts/logs
- `vehicles` - Visitor vehicle management
- `visitor-analytics` - Visitor statistics

#### documents/
Document management, categories, access control
- `upload-document` - Upload new document
- `update-document` / `delete-document` - Modify/remove document
- `get-document` / `get-documents` - Fetch document(s)
- `download-document` - Generate signed download URL
- `categories` - Document category management

---

### Communication Modules

#### announcements/
Community announcements, scheduling, read receipts
- CRUD operations for announcements
- Scheduling and publishing
- Read receipt tracking

#### notifications/
Notification system - templates, schedules, queue, preferences
- `templates` - CRUD for notification templates
- `schedules` - Notification trigger schedules
- `queue` / `queue-management` - Queue operations
- `history` - Notification history queries
- `preferences` - Per-resident notification preferences
- `send` - Send notifications
- `invoice-reminders` - Invoice reminder logic
- `reminder-config` - Reminder configuration

#### in-app-notifications/
In-app notification center
- Real-time notification management

---

### Financial Modules

#### imports/
Bank statement import processing
- Statement upload and parsing
- Row matching to residents
- Transaction categorization

#### email-imports/
Gmail integration for bank statements
- `gmail-oauth` - OAuth flow
- `fetch-emails` - Retrieve emails
- `parse-email` - Parse bank emails
- `process-email-import` - Process imported transactions
- `create-email-import` - Create import batch
- `bank-passwords` - Encrypted PDF passwords

#### expenses/ & expenditure/
Expense tracking and management

#### paystack/
Payment gateway integration
- Online payment processing

---

### System Modules

#### settings/
System and estate configuration
- `get-settings` - Fetch settings
- `update-setting` - Update setting value
- `hierarchical-settings` - Estate/house/resident level settings
- `theme-preferences` - Visual theme settings
- `update-maintenance-mode` - Maintenance mode toggle
- `upload-estate-logo` - Logo upload
- `backfill-ownership-history` - Data migration helper

#### auth/
Authentication and account management
- `register-resident-portal` - Resident self-registration
- `link-account` - Link auth account to resident
- `check-email-availability` - Email uniqueness check

#### roles/
RBAC role management
- Role CRUD operations
- Permission assignments

#### impersonation/
Admin impersonation system
- `index` - Start/end/search impersonation sessions
- `approval` - Approval workflow for non-super admins

#### verification/
Email and phone verification
- Send verification codes
- Verify submitted codes

#### two-factor/
Two-factor authentication
- TOTP setup and verification
- Backup codes

#### audit/
Audit logging
- `get-audit-logs` - Query audit trail

---

### Reporting Modules

#### reports/
Financial reporting engine
- `report-engine` - Generate financial reports
- `get-financial-overview` - Dashboard overview
- `report-schedules` - Scheduled report generation

#### report-subscriptions/
Report subscription management
- User report subscriptions

#### analytics/
Analytics data aggregation
- `get-analytics-data` - Dashboard analytics

---

### Other Modules

#### notes/
Entity notes system
- `create-note` / `update-note` / `delete-note` - CRUD
- `get-notes` - Fetch notes
- `get-note-history` - Note version history

#### projects/
Project tracking module
- `create-project` - Create project
- `get-projects` / `get-project-details` - Fetch projects

#### approvals/
Approval workflow system
- Maker-checker approvals

#### vendors/
Vendor management

#### dashboard/
Dashboard data aggregation

---

## React Query Hooks (src/hooks/)

| Hook File | Purpose |
|-----------|---------|
| `use-residents.ts` | Resident CRUD, search, stats |
| `use-houses.ts` | House CRUD, search, stats |
| `use-payments.ts` | Payment CRUD, bulk operations |
| `use-billing.ts` | Invoices, billing profiles, levies |
| `use-wallet.ts` | Wallet balance, transactions |
| `use-security.ts` | Security contacts, codes, logs, categories |
| `use-documents.ts` | Document CRUD, categories |
| `use-announcements.ts` | Announcement CRUD, read receipts |
| `use-notifications.ts` | Templates, schedules, queue, history |
| `use-in-app-notifications.ts` | In-app notification center |
| `use-analytics.ts` | Analytics data with date range |
| `use-reports.ts` | Report generation and history |
| `use-report-subscriptions.ts` | Report subscriptions |
| `use-settings.ts` | System and general settings |
| `use-theme-preferences.ts` | Visual theme management |
| `use-roles.ts` | Role and permission management |
| `use-impersonation.ts` | Impersonation session management |
| `use-verification.ts` | Email/phone verification |
| `use-two-factor.ts` | 2FA setup and verification |
| `use-audit-logs.ts` | Audit log queries |
| `use-reference.ts` | Streets, house types, transaction tags |
| `use-notes.ts` | Entity notes |
| `use-imports.ts` | Bank statement imports |
| `use-gmail-connection.ts` | Gmail OAuth status |
| `use-approvals.ts` | Approval workflow |
| `use-portal-permissions.ts` | Portal-specific permissions |
| `use-paystack.ts` | Payment gateway hooks |
| `use-dashboard.ts` | Dashboard data aggregation |
| `use-navigation.ts` | Permission-filtered navigation |
| `use-estate-logo.ts` | Estate logo fetching |
| `use-media-query.ts` | Responsive viewport detection |
| `use-sidebar-state.ts` | Sidebar collapse state |
| `use-date-range.ts` | URL-based date range |
| `use-debounce.ts` / `use-debounced-value.ts` | Debounce utilities |
| `use-ai-assistant.ts` | AI chatbot integration |
| `use-announcement-analytics.ts` | Announcement engagement stats |
| `use-auth-accounts.ts` | Linked auth accounts |
| `use-email.ts` | Email sending status |

---

## UI Components (src/components/)

### Base UI (src/components/ui/)
shadcn/ui components - button, card, form, table, dialog, sheet, tabs, badge, alert, skeleton, tooltip, popover, dropdown-menu, select, input, textarea, checkbox, radio-group, switch, calendar, date-picker, command, responsive-sheet, theme-switcher, sonner (toasts)

### Domain Components

| Directory | Components |
|-----------|------------|
| `dashboard/` | Sidebar, ModernSidebar, Header, MobileNav, StatsCards, QuickStatsCard, RecentActivityCard |
| `resident-portal/` | PortalSidebar, PortalHeader, PortalBottomNav, PropertyHeroCard, PropertyCarousel, InvoiceCard, SecurityContactForm, HouseholdMemberForm, ContactVerificationCard, ActivityFeed, ImpersonationBanner |
| `residents/` | ResidentsTable, ResidentForm, ResidentStatusBadge, ResidentRoleBadge, LinkedHouses, ResidentPayments, EmergencyContacts |
| `houses/` | HousesTable, HouseForm, HouseStatusBadge, OwnershipHistory, OccupancyTimeline |
| `payments/` | PaymentsTable, PaymentForm, PaymentReceipt, PaymentStatusBadge |
| `billing/` | InvoicesTable, BillingProfileForm, BillingProfileCard, InvoiceDetail, WalletCard, WalletTransactions |
| `security/` | SecurityContactsTable, SecurityContactForm, SecurityContactStatusBadge, AccessCodeDisplay, CodeVerification, AccessLogsTable |
| `documents/` | DocumentsTable, DocumentUploadForm, DocumentPreview, CategoryBadge, DocumentCard |
| `announcements/` | AnnouncementsTable, AnnouncementForm, AnnouncementCard, ReadReceiptStats |
| `notifications/` | TemplateList, TemplateForm, ScheduleList, ScheduleForm, NotificationHistory, QueueViewer, PreferencesForm |
| `analytics/` | DateRangeFilter, KPISummaryCards, RevenueTrendChart, CollectionRateChart, OccupancyGauge, PaymentComplianceCard, PaymentMethodBreakdown, CategoryBreakdownChart |
| `reports/` | ReportWizard, ReportTemplates, FinancialOverview |
| `settings/` | VisualThemeSelector, RolePermissionsDialog, SettingsNav |
| `imports/` | ImportPreview, ImportBreakdown, ColumnMapper |
| `admin/` | StreetsList, HouseTypesList, TransactionTagsList, BankAccountsList |
| `audit/` | AuditLogsTable, AuditDetailDialog |
| `notes/` | NotesList, NoteForm, NoteCard |
| `projects/` | ProjectsTable, ProjectForm |
| `expenditure/` | ExpenditureTable, ExpenditureForm |
| `layout/` | EstateAiAssistant |
| `icons/` | Custom icon components |

---

## Page Routes (src/app/)

### Authentication (/(auth)/)
- `/login` - User login
- `/register` - New user registration
- `/forgot-password` - Password reset request
- `/reset-password` - Password reset form
- `/auth/verify-2fa` - Two-factor verification

### Admin Dashboard (/(dashboard)/)

| Route | Purpose |
|-------|---------|
| `/dashboard` | Main admin dashboard |
| `/residents`, `/residents/[id]`, `/residents/new` | Resident management |
| `/houses`, `/houses/[id]`, `/houses/new` | Property management |
| `/payments`, `/payments/[id]`, `/payments/new` | Payment management |
| `/payments/import` | Bank statement import |
| `/payments/email-imports`, `/payments/email-imports/[importId]` | Gmail import |
| `/billing`, `/billing/[id]` | Invoices and billing |
| `/security`, `/security/contacts/*`, `/security/verify`, `/security/logs` | Security module |
| `/documents`, `/documents/[id]` | Document library |
| `/announcements`, `/announcements/[id]/*`, `/announcements/new` | Announcements |
| `/notifications` | In-app notification center |
| `/analytics`, `/analytics/announcements` | Analytics dashboards |
| `/reports`, `/reports/financial-overview` | Financial reports |
| `/expenditure` | Expense tracking |
| `/projects` | Project tracking |
| `/approvals` | Approval queue |
| `/settings/*` | All settings pages (see below) |

### Settings Pages (/(dashboard)/settings/)
- `/settings` - General settings
- `/settings/appearance` - Theme settings
- `/settings/billing` - Billing configuration
- `/settings/security` - Security settings
- `/settings/roles`, `/settings/user-roles` - Role management
- `/settings/notifications/*` - Notification settings (templates, schedules, history, reminders)
- `/settings/audit-logs` - Audit trail viewer
- `/settings/system` - System settings (maintenance mode, etc.)
- `/settings/streets`, `/settings/house-types` - Reference data
- `/settings/bank-accounts`, `/settings/transaction-tags` - Financial reference
- `/settings/document-categories`, `/settings/announcement-categories` - Category management
- `/settings/email-integration`, `/settings/email` - Email configuration
- `/settings/message-templates` - Message template library
- `/settings/cron-status` - Cron job monitoring
- `/settings/notification-queue` - Queue management

### Resident Portal (/(resident)/portal/)
- `/portal` - Portal dashboard
- `/portal/invoices` - Payment history
- `/portal/wallet` - Wallet balance and transactions
- `/portal/payments/callback` - Payment gateway callback
- `/portal/properties`, `/portal/properties/[id]` - Property details
- `/portal/security-contacts` - Manage security contacts
- `/portal/visitors` - Visitor management
- `/portal/documents` - View estate documents
- `/portal/announcements` - View announcements
- `/portal/notifications` - Notification center
- `/portal/profile` - Profile and settings
- `/portal/onboarding` - New resident onboarding wizard

### Other
- `/` - Landing/redirect
- `/maintenance` - Maintenance mode page

---

## Database Types (Key Enums & Types)

### Resident Types
```typescript
ResidentRole = 'resident_landlord' | 'non_resident_landlord' | 'tenant' | 'developer'
             | 'co_resident' | 'household_member' | 'domestic_staff' | 'caretaker' | 'contractor'

PrimaryResidentRole = 'resident_landlord' | 'non_resident_landlord' | 'tenant' | 'developer'
SecondaryResidentRole = 'co_resident' | 'household_member' | 'domestic_staff' | 'caretaker' | 'contractor'

ResidentType = 'primary' | 'secondary'
EntityType = 'individual' | 'corporate'
VerificationStatus = 'pending' | 'submitted' | 'verified' | 'rejected'
AccountStatus = 'active' | 'inactive' | 'suspended' | 'archived'
```

### Financial Types
```typescript
PaymentStatus = 'current' | 'overdue' | 'suspended' | 'exempt'
InvoiceStatus = 'unpaid' | 'paid' | 'void' | 'partially_paid' | 'overdue'
InvoiceType = 'SERVICE_CHARGE' | 'LEVY' | 'ADJUSTMENT' | 'OTHER'
BillingFrequency = 'monthly' | 'yearly' | 'one_off'
BillingTargetType = 'house' | 'resident'
```

### Security Types
```typescript
SecurityContactStatus = 'active' | 'suspended' | 'expired' | 'revoked'
AccessCodeType = 'permanent' | 'one_time'
IdDocumentType = 'nin' | 'voters_card' | 'drivers_license' | 'passport' | 'company_id' | 'other'
VehicleType = 'car' | 'motorcycle' | 'bicycle' | 'truck' | 'van' | 'bus' | 'other'
```

### System Types
```typescript
AppRoleName = 'super_admin' | 'chairman' | 'financial_officer' | 'security_officer' | 'resident' | ...
ApprovalStatus = 'pending' | 'approved' | 'rejected'
AnnouncementStatus = 'draft' | 'scheduled' | 'published' | 'archived'
AnnouncementPriority = 'low' | 'normal' | 'high' | 'emergency'
```

### Key Interfaces
- `Resident`, `ResidentWithHouses` - Resident data
- `House`, `HouseWithStreet`, `HouseWithResidents` - Property data
- `Invoice`, `InvoiceWithDetails` - Invoice data
- `PaymentRecord`, `PaymentRecordWithDetails` - Payment data
- `SecurityContact`, `SecurityContactWithDetails` - Security contact data
- `Document`, `DocumentWithRelations` - Document data
- `Announcement`, `AnnouncementWithRelations` - Announcement data
- `Profile`, `ProfileWithRole` - User profile data

---

## Conflict Zones (Shared Files)

These files affect multiple modules - modifications require careful coordination:

| File | Impact |
|------|--------|
| `src/types/database.ts` | All modules - type definitions |
| `src/components/ui/*` | All UI - base components |
| `src/app/globals.css` | All UI - global styles |
| `tailwind.config.ts` | All UI - Tailwind configuration |
| `src/contexts/*` | Multiple modules - shared state |
| `src/lib/supabase/*` | All data operations |
| `src/app/(dashboard)/layout.tsx` | Admin layout |
| `src/app/(resident)/layout.tsx` | Portal layout |

---

## Pattern References

For implementation patterns, reference these files:

| Pattern | Example File |
|---------|-------------|
| Server Action (with permissions + audit) | `src/actions/residents/create-resident.ts` |
| React Query Hook | `src/hooks/use-residents.ts` |
| Zod Validator | `src/lib/validators/resident.ts` |
| Data Table | `src/components/residents/residents-table.tsx` |
| Form Component | `src/components/residents/resident-form.tsx` |
| Page with RBAC | `src/app/(dashboard)/residents/page.tsx` |
| Portal Page | `src/app/(resident)/portal/invoices/page.tsx` |

---

*This index is for Claude.ai prompt enrichment. Keep it updated when major modules are added or renamed.*
