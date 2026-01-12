# Resident Association Solution - User Stories & Scenarios
## Comprehensive Dev Guide, Specs & BDD/TDD Framework

**Project:** OPERA SmartSec (Resident Association Platform)  
**Version:** 1.0  
**Date:** November 2025  
**Tech Stack:** Next.js (Vercel), Supabase PostgreSQL, n8n/Twilio (WhatsApp), SendGrid (Email)  

---

## Table of Contents

1. [System Architecture & Core Concepts](#1-system-architecture--core-concepts)
2. [User Roles & Personas](#2-user-roles--personas)
3. [Property & Unit Management](#3-property--unit-management)
4. [Authentication & RBAC](#4-authentication--rbac)
5. [Financial Management Module](#5-financial-management-module)
6. [Communication Module](#6-communication-module)
7. [Document Management Module](#7-document-management-module)
8. [Visitor Management](#8-visitor-management)
9. [Maintenance & Service Requests](#9-maintenance--service-requests)
10. [Admin & Estate Management](#10-admin--estate-management)
11. [Notifications & Alerts](#11-notifications--alerts)
12. [Integration Patterns](#12-integration-patterns)
13. [Testing Framework & Scenarios](#13-testing-framework--scenarios)

---

## 1. System Architecture & Core Concepts

### 1.1 Central Unit Object

The **Unit** is the foundational entity around which all features, permissions, and financial records are organized.

**Definition:** A Unit represents a physical property within the estate (e.g., "A-101", "Building B - Unit 5", "Commercial Space 1").

**Attributes:**
- `unit_id` (UUID): Unique identifier
- `unit_name` (string): Display name (e.g., "A-101")
- `unit_type` (enum): Property type (Residential, Commercial, Mixed-Use, Penthouse, Studio)
- `unit_status` (enum): Current state (In Development, Vacant, Occupied - Owner-Resident, Occupied - Rented)
- `billing_profile_id` (FK): Links to applicable billing rates
- `created_at`, `updated_at` (timestamps)
- `metadata` (JSONB): Floor number, square footage, amenities, etc.

**Business Rule:** A single Property Owner can own multiple units. Each unit maintains its own financial ledgers, visitor access, and residency status independently.

---

## 2. User Roles & Personas

### 2.1 Super Admin

**Persona:** Trustee, Technical Lead, or System Owner

**Scope:** Global system access

**Key Responsibilities:**
- System initialization and configuration
- Estate-level branding and settings
- Payment gateway setup
- Creation and deactivation of EXCO accounts
- EXCO handover workflows
- System monitoring and audit logs

### 2.2 Estate Manager (EXCO)

**Persona:** Elected committee member responsible for day-to-day estate operations

**Scope:** Global (all units, users, and finances)

**Key Responsibilities:**
- User account management and registration approval
- Financial oversight and charge management
- Payment reconciliation and tracking
- Maintenance ticket assignment and resolution
- Global communications and announcements
- Document management and record-keeping

### 2.3 Property Owner

**Persona:** Legal owner of the unit(s), focused on financial and asset management

**Scope:** Unit-specific (can own multiple units)

**Key Responsibilities:**
- Financial management (view and pay charges)
- Unit residency status management
- Tenant invitation and revocation (if rented)
- Visitor management (context-dependent)
- Voting participation

### 2.4 Primary Resident

**Persona:** Main person operationally responsible for the household (Owner-Resident or Tenant)

**Scope:** Unit-specific

**Key Responsibilities:**
- Maintenance request submission and tracking
- Visitor pre-registration and management
- Household member invitation and management
- Communication reception

### 2.5 Household Member

**Persona:** Dependent of Primary Resident (spouse, child, relative)

**Scope:** Unit-specific

**Key Responsibilities:**
- Personal visitor management
- Communication reception

### 2.6 Developer / Contractor

**Persona:** Third-party stakeholder with project-based involvement in a unit

**Scope:** Unit-specific (temporary, project-based)

---

## 3. Property & Unit Management

### 3.1 Unit Type System

The system uses a normalized, three-tier structure to manage billing rates:

**Tier 1: Billing Profile (Rate Card)**
- Reusable rate cards containing service charge amounts
- Example: "Standard 3-Bed Rate" with 50,000 NGN/month

**Tier 2: Unit Type**
- Category linking physical units to a billing profile
- Example: "3-Bedroom Apartment" → "Standard 3-Bed Rate"

**Tier 3: Unit (Physical Property)**
- Actual property assigned a Unit Type
- Example: "A-101" → "3-Bedroom Apartment"

### 3.2 Unit Residency Status & Lifecycle

**Status Values:**
- **In Development:** Construction phase
- **Vacant (For Sale/Rent):** Complete but empty
- **Occupied (Owner-Resident):** Owner lives there
- **Occupied (Rented):** Tenant occupies, owner elsewhere

**State Transitions & Permissions vary by status**

---

## 4. Authentication & RBAC

### 4.1 Authentication Flow

**User Story: Property Owner Registration**

```gherkin
Feature: Property Owner Self-Registration

Scenario: First-time Property Owner receives access credentials
  Given the EXCO has created a user account for property owner "John Doe"
  When John receives a welcome email with a temporary link
  Then John's account status changes to "Active"
  And John is prompted to set the Unit Residency Status
```

### 4.2 Session & Token Management

- **Session Timeout:** 30 minutes of inactivity
- **Device Limits:** Maximum 3 concurrent active sessions per user
- **Token Storage:** Access in memory, Refresh in secure HTTP-only cookie

### 4.3 Unit-Based Access Control

Permission computation is based on:
1. User role
2. Unit assignment
3. Unit residency status

---

## 5. Financial Management Module

### 5.1 Service Charge & Invoice Generation

**User Story: Monthly Service Charge Invoice Generation**

```gherkin
Feature: Automated Monthly Service Charge Generation

Scenario: Monthly invoices are generated for all units
  Given the billing cycle is set to the 1st of each month
  When the automated job runs at 00:00 UTC on the 1st
  Then the system generates invoices for all active units
  And each Property Owner receives an email with the invoice

Scenario: Rate changes apply to future invoices only
  Given the billing profile rate is changed
  When the next billing cycle runs
  Then the system generates invoices at the new rate
  And historical unpaid invoices remain unchanged
```

### 5.2 Project Levy Management

**User Story: Create and Apply Mandatory Project Levy**

```gherkin
Feature: Project Levy Creation and Application

Scenario: EXCO creates a new project levy for specific units
  Given there are 50 units in the estate
  When I create a levy: "Phase 2 Infrastructure Fee" at 50,000 NGN per unit
  Then the system calculates per-owner totals
  And creates a single invoice per owner
  And sends email notifications
```

### 5.3 Payment Recording & Status Tracking

**Payment States:**
- Pending Confirmation (awaiting bank confirmation)
- Bank Confirmed (verified in statement)
- Received & Posted (finalized)

### 5.4 Reconciliation & Unlinked Journal

**Process:**
1. Upload bank statement
2. Auto-match pending payments
3. Manually assign remaining transactions
4. Move unmatched to unlinked journal

### 5.5 Financial Dashboard & Reporting

**Property Owner View:**
- Total outstanding balance
- Total paid this year
- Invoice list with status
- Statement of account export

### 5.6 Credit & Debit Notes

- **Credit Notes:** Reduce amount owed
- **Debit Notes:** Add charges outside normal billing

---

## 6. Communication Module

### 6.1 Multi-Channel Notification System

**Supported Channels:**
1. WhatsApp (Primary for residents)
2. Email (Primary for official notices)
3. SMS (Secondary/Fallback)

**Message Types & Routing:**

| Message Type | Priority | Channels | Trigger |
|--------------|----------|----------|---------|
| Invoice Generated | High | Email + WhatsApp | Automated monthly |
| Payment Received | Medium | WhatsApp | Payment confirmed |
| Payment Overdue | High | Email + SMS + WhatsApp | 14 days overdue |
| Maintenance Update | Medium | WhatsApp | Status change |
| EXCO Announcement | High | All channels | Manual broadcast |

### 6.2 WhatsApp Integration (n8n + Twilio)

**Message Flow:**
```
Twilio Webhook → n8n WhatsApp_Inbound_Router → SmartRes_v061025_1.0 FSM
Response generated → Sent back via Twilio
```

**Outbound Flow:**
```
System Event (Invoice) → n8n Notification_Dispatcher → Twilio → WhatsApp
Message logged in communication_log
```

### 6.3 Email Notification System

**User Story: EXCO Sends Announcement**

```gherkin
Feature: EXCO Global Announcement via Email

Scenario: EXCO creates and sends announcement
  Given I am logged in as EXCO
  When I navigate to Communications → Announcements
  And I compose message and select recipients
  Then the system sends branded emails via SendGrid
  And provides delivery metrics dashboard
```

### 6.4 Communication Preferences & Opt-Out

**User Control:**
- Residents can customize which channels receive which message types
- Unsubscribe from specific categories (not account)
- Still able to access portal

---

## 7. Document Management Module

### 7.1 Estate Document Repository

**User Story: EXCO Uploads Estate Documents**

```gherkin
Feature: Centralized Estate Document Repository

Scenario: EXCO uploads governance document
  Given I am logged in as EXCO
  When I navigate to Documents → Upload
  Then I provide title, category, file, visibility level
  And the document is stored with metadata and preview
```

**Document Categories:**
- Governance (Constitution, By-Laws, Minutes)
- Financial (Budget, Audited Accounts, Summaries)
- Maintenance & Safety (Schedules, Procedures)
- Notices & Announcements

### 7.2 Financial Document Visibility

**Property Owner Access:**
- Aggregate estate financial summary (high-level only)
- Audited accounts for previous years
- Request additional information form

**Does NOT see:**
- Individual resident financial data
- Payment reconciliation details
- EXCO-only reports

**EXCO Access:**
- Complete reconciliation reports
- Individual unit payment histories
- Aging analysis by resident
- Collection rate metrics

### 7.3 Document Versioning & Audit Trail

**Features:**
- Version history with dates
- Track who uploaded and when
- Audit log of access (who, when, what)
- Archive previous versions

---

## 8. Visitor Management

### 8.1 Visitor Pass System

**User Story: Primary Resident Creates Visitor Pass**

```gherkin
Feature: Direct Visitor Pass Creation

Scenario: Resident pre-registers a visitor
  Given I am a Primary Resident (Occupied - Owner-Resident status)
  When I navigate to Visitor Management → Add Visitor
  Then I provide visitor name, purpose, date/time, parking needed
  And the system generates unique pass code with QR
  And sends pass details to my phone (WhatsApp)
```

### 8.2 Visitor Request Workflow (Rented Status)

**User Story: Landlord Requests Visitor Access**

```gherkin
Feature: Visitor Request Approval Workflow

Scenario: Landlord requests visitor access
  Given my unit is Occupied (Rented)
  When I submit visitor request
  Then tenant receives notification to approve/deny
  And approved requests generate visitor passes
```

### 8.3 Developer/Contractor Visitor Management

**Features:**
- Contractor creates supplier/delivery passes
- Group passes for multi-person visits
- Vehicle registration tracking

### 8.4 Gate Access Integration

**Features:**
- Security team scans QR code
- System validates pass validity
- Entry logged with timestamp
- Residents can extend passes

---

## 9. Maintenance & Service Requests

### 9.1 Maintenance Request Submission

**User Story: Resident Submits Request**

```gherkin
Feature: Maintenance Request Submission & Tracking

Scenario: Resident submits urgent request
  Given I notice critical issue (elevator breakdown)
  When I submit request with high priority
  Then system sends immediate WhatsApp alert to EXCO
  And creates ticket with urgency flag
  And logs submission timestamp
```

**Request Fields:**
- Category (Common Area, Unit, Grounds, etc.)
- Priority level
- Description with attachments
- Desired resolution date
- Contact preference

### 9.2 EXCO Maintenance Management

**User Story: EXCO Reviews and Assigns**

```gherkin
Feature: EXCO Maintenance Dashboard

Scenario: EXCO assigns ticket to contractor
  Given urgent maintenance ticket exists
  When I click Assign
  Then I select contractor and set resolution deadline
  And system notifies contractor
  And resident receives update
```

**Dashboard Shows:**
- Active tickets sorted by priority
- Ticket status (NEW, ASSIGNED, IN_PROGRESS, RESOLVED, CLOSED)
- SLA indicators (on-track, at-risk, breached)
- Filters by status, category, priority, unit

### 9.3 Contractor Updates & Resolution

**Features:**
- Contractor can add updates with photos
- Progress tracking visible to resident and EXCO
- Completion marking with final status
- Cost tracking

### 9.4 Maintenance Categories & SLA

**User Story: EXCO Sets Up Categories**

```gherkin
Feature: Maintenance Categories and SLAs

Scenario: EXCO configures maintenance SLAs
  Given I navigate to Settings → Maintenance Configuration
  Then I define categories with:
    - Response Time SLA (max acknowledgment time)
    - Resolution Time SLA (max completion time)
    - Priority Level
    - Auto-escalation settings if SLA breached
```

**Auto-Escalation:**
- System identifies breached SLAs
- Flags ticket with red indicator
- Notifies EXCO
- Escalates to backup contractor

---

## 10. Admin & Estate Management

### 10.1 Super Admin System Setup

**User Story: Initialize New Estate**

```gherkin
Feature: System Initialization

Scenario: Super Admin sets up new estate
  Given I am setting up OPERA estate (72 units)
  When I go through initialization wizard:
    Step 1: Estate Information (name, location, code)
    Step 2: Unit Structure (buildings, total units, naming)
    Step 3: Define Unit Types
    Step 4: Create Billing Profiles
    Step 5: Assign Units to Types/Profiles
    Step 6: Bank Account Configuration
    Step 7: Create First EXCO Account
  Then estate is configured and ready for user registration
```

### 10.2 EXCO Handover Workflow

**User Story: Term-End EXCO Handover**

```gherkin
Feature: Periodic EXCO Handover

Scenario: Super Admin performs EXCO handover
  Given current EXCO term is ending
  When I navigate to System Setup → EXCO Handover
  Then I deactivate outgoing EXCO
  And activate incoming EXCO members
  And transfer pending tasks/tickets
  And generate handover report
  And log entire event for audit
```

### 10.3 User Account Management

**User Story: Account Lifecycle**

```gherkin
Feature: User Account Management

Scenario: EXCO creates Property Owner account
  Given new owner is ready to onboard
  When I create account with:
    - Name, email, phone
    - Unit(s) assignment
  Then system sends activation email
  And owner must set password
  And owner must set unit residency status

Scenario: Account deactivation
  Given resident is moving away
  When I deactivate account
  Then account gets status INACTIVE
  And login is prevented
  And historical data retained for audit
```

---

## 11. Notifications & Alerts

### 11.1 Notification Types & Routing

| Category | Urgency | Channels | Example |
|----------|---------|----------|---------|
| Financial | High | Email, WhatsApp | Invoice, Payment overdue |
| Operational | Medium | WhatsApp, Email | Maintenance assigned |
| Security | Critical | All | Unauthorized access |
| Administrative | Low | Email | System updates |
| Community | Low | WhatsApp | Events, announcements |

### 11.2 Notification Delivery Pipeline

**Steps:**
1. Event triggered (invoice created)
2. Notification queued in communication queue
3. Sent via priority channels (email first, then WhatsApp)
4. Status tracked (QUEUED → SENT → DELIVERED → READ/BOUNCED)
5. Retry logic on failure (3 attempts over 24 hours)
6. Logged in communication_log table

### 11.3 Escalation Matrices

**Payment Reminders:**
- 7 days before due: Email
- 3 days before due: WhatsApp
- 1 day before due: SMS + WhatsApp
- On due date: All channels
- After due date: Additional follow-ups

**Critical Alerts (Immediate):**
- Gas leak / Power outage: All channels
- Security breach: All channels + EXCO direct contact

---

## 12. Integration Patterns

### 12.1 WhatsApp Integration Architecture

**Inbound Message Flow:**
```
Twilio Webhook
  ↓ (Phone +234 format)
n8n WhatsApp_Inbound_Router
  ├─ Phone conversion: +234 → 080
  ├─ Resident lookup
  └─ Route to SmartRes_v061025_1.0 FSM
      ↓
FSM Router (Finite State Machine)
  ├─ Intent detection
  ├─ Context from Menu_Builder tempData
  ├─ Process request
  └─ Generate response
      ↓
Response sent via Twilio
  └─ Logged in communication_log
```

**Outbound Notification Flow:**
```
System Event (Invoice created)
  ↓
Notification Job (n8n Invoice_Notification_Dispatcher)
  ├─ Query resident contact
  ├─ Prepare message + PDF
  ├─ Retrieve SendGrid templates
  ├─ Send Email via SendGrid
  ├─ Send WhatsApp via Twilio
  ├─ Log status in communication_log
  └─ Update notification_status
```

**Phone Number Format Conversion:**
- WhatsApp sends: `whatsapp:+234812345678`
- Database stores: `08012345678`
- Conversion RPC handles both formats with validation

### 12.2 Email Integration (SendGrid)

**Template Structure:**
```javascript
{
  from: 'noreply@operasmartsec.ng',
  replyTo: 'support@operasmartsec.ng',
  template_id: 'd-template-id', // SendGrid dynamic template
  dynamic_template_data: {
    ownerName, unitName, amount, invoiceNumber, ...
  },
  tracking_settings: {
    click_tracking: { enable: true },
    open_tracking: { enable: true }
  },
  asm: { group_id: 123 } // Unsubscribe group
}
```

**Event-Driven Triggers:**
- Invoice created → Send invoice email
- Payment received → Send receipt email
- 14 days overdue → Send payment reminder
- Maintenance update → Send notification

### 12.3 Database Integration

**Use PostgreSQL node for all queries (NOT Supabase node)** per requirements

**RPC Functions for business logic:**
- `generate_service_charge_invoices()` - Monthly billing
- `reconcile_bank_statement()` - Payment reconciliation
- `get_unit_permissions()` - RBAC computation
- `apply_project_levy()` - Levy calculation
- `receive_whatsapp_message()` - Inbound handler

**Supabase Storage for documents:**
- Document files stored in Supabase Storage
- Metadata in PostgreSQL tables
- Versioning tracked with timestamps

---

## 13. Testing Framework & Scenarios

### 13.1 BDD Feature Files (Gherkin)

**Feature: Service Charge Invoice Generation**

```gherkin
# features/financial/service-charge-generation.feature

Feature: Automated Monthly Service Charge Invoice Generation

  Background:
    Given billing cycle is set for 1st of month at 00:00 UTC
    And there are 50 units with valid billing profiles
    And each unit assigned to Unit Type → Billing Profile

  Scenario: System generates invoices on scheduled billing date
    Given current date is Oct 31, 2025
    When billing job executes Nov 1 at 00:00 UTC
    Then 50 invoices generated with:
      - invoice_type: SERVICE_CHARGE
      - status: UNPAID
      - issue_date: 2025-11-01
      - due_date: 2025-12-01
      - amount: from billing profile
    And each Property Owner receives email
    And each invoice posted to Service Charge Ledger

  Scenario: Duplicate invoices prevented for same period
    Given invoices for Nov 2025 already exist
    When billing job reruns
    Then no additional invoices created
    And system logs: "Invoices already exist for Nov 2025"

  Scenario: Rate changes don't affect historical invoices
    Given unpaid Nov invoice for A-101: 50,000 NGN
    When billing profile increased to 55,000 NGN
    Then Nov invoice remains 50,000 NGN
    And Dec invoice will be 55,000 NGN
    And owner's total outstanding: 105,000 NGN
```

**Feature: Payment Reconciliation**

```gherkin
# features/financial/payment-reconciliation.feature

Feature: Bank Statement Reconciliation

  Scenario: Auto-match pending payments with bank statement
    Given 5 pending payment records exist
    And bank statement CSV contains matching transactions
    When I upload bank statement
    Then system matches:
      - Pending TXN-001 (50k) ← Bank TXN-001 (50k) [MATCH]
      - Pending TXN-002 (75k) ← Bank TXN-002 (75k) [MATCH]
      - Unmatched bank TXN-UNK (100k) → UNLINKED_JOURNAL
    And I confirm matched payments
    Then payments change to BANK_CONFIRMED
    And corresponding invoices change to PAID

  Scenario: EXCO manually assigns unlinked transaction
    Given 100k transaction in UNLINKED_JOURNAL
    When I apply to Unit C-305
    Then system creates payment with BANK_CONFIRMED status
    And matches to unpaid invoice
    And invoice marked PAID
    And owner receives confirmation email
```

**Feature: Visitor Management**

```gherkin
# features/visitor-management.feature

Feature: Visitor Pass Management

  Scenario: Primary Resident creates direct visitor pass (Owner-Resident)
    Given I am Primary Resident (status: Occupied - Owner-Resident)
    When I submit visitor:
      - Name: "James Smith"
      - Purpose: "Personal Guest"
      - Date/Time: "Nov 20, 2:00-6:00 PM"
      - Parking: Yes
    Then system generates:
      - Unique pass code: VIS-A101-112025-001
      - QR code
      - PIN for gate access
    And sends pass to my WhatsApp
    And security team receives in system

  Scenario: Landlord requests visitor for rented property
    Given unit status is Occupied (Rented)
    When I (landlord) request visitor access
    Then tenant receives approval notification
    And can approve/deny request
    If approved:
      - Pass generated
      - Both parties notified
      - Security team updated
```

**Feature: RBAC Access Control**

```gherkin
# features/authentication/rbac.feature

Feature: Role-Based Access Control

  Scenario: PropertyOwner cannot access EXCO-only functions
    Given I am logged in as PropertyOwner
    When I navigate to Admin → Financial Reports
    Then system returns HTTP 403 Forbidden
    And shows: "You don't have permission"
    And logs unauthorized access attempt

  Scenario: Different views based on unit status
    Given I own unit with status "Rented"
    When I navigate to Visitor Management
    Then I see "Request Visitor Access" option
    And NOT "Create Direct Pass"
    
    Given I own unit with status "Occupied - Owner-Resident"
    When I navigate to Visitor Management
    Then I see "Create Direct Pass" option
    And NOT "Request Visitor Access"

  Scenario: EXCO sees all resident data
    Given I am logged in as EXCO
    When I navigate to Financial Management
    Then I can see:
      - All invoices across all units
      - All payments and reconciliation
      - Aging reports
      - Collection status
      - Unlinked transactions
```

### 13.2 Unit Tests (TypeScript/Jest)

**Test File: financial.calculator.test.ts**

```typescript
describe('Financial Calculator', () => {

  describe('Invoice Amount Calculation', () => {
    
    it('should calculate total from billing profile charges', () => {
      const profile = {
        security_dues: 50000,
        water_allocation: 2000,
        parking_fee: 3000,
        amenities: 5000
      };
      
      const total = calculateInvoiceTotal(profile);
      expect(total).toBe(60000);
    });

    it('should handle null/zero charges gracefully', () => {
      const profile = {
        security_dues: 50000,
        water_allocation: 0,
        parking_fee: null,
        amenities: 5000
      };
      
      const total = calculateInvoiceTotal(profile);
      expect(total).toBe(55000);
    });

    it('should apply discount if configured', () => {
      const profile = {
        base_amount: 50000,
        discount_percentage: 10
      };
      
      const total = calculateInvoiceTotal(profile);
      expect(total).toBe(45000);
    });
  });

  describe('Project Levy Calculation', () => {
    
    it('should calculate per-owner total for multi-unit ownership', () => {
      const levy = {
        cost_per_unit: 50000,
        applicable_unit_ids: ['A-101', 'A-102', 'B-204']
      };
      
      const unitOwners = {
        'owner1': ['A-101', 'A-102'],
        'owner2': ['B-204']
      };
      
      const totals = calculateLevyPerOwner(levy, unitOwners);
      
      expect(totals.owner1).toBe(100000); // 2 × 50000
      expect(totals.owner2).toBe(50000);  // 1 × 50000
    });

    it('should exclude units with insufficient permissions', () => {
      const levy = {
        cost_per_unit: 50000,
        applicable_unit_ids: ['A-101', 'A-102']
      };
      
      const totalInvoiced = calculateTotalLevyAmount(levy);
      expect(totalInvoiced).toBe(100000);
    });
  });

  describe('Outstanding Balance Calculation', () => {
    
    it('should sum unpaid invoices and subtract credits', () => {
      const invoices = [
        { status: 'PAID', amount: 50000 },
        { status: 'UNPAID', amount: 50000 },
        { status: 'UNPAID', amount: 75000 },
        { status: 'PENDING_CONFIRMATION', amount: 30000 }
      ];
      
      const credits = [
        { status: 'APPLIED', amount: -10000 }
      ];
      
      const balance = calculateOutstandingBalance(invoices, credits);
      expect(balance).toBe(145000); // 50 + 75 + 30 - 10
    });

    it('should exclude paid invoices from balance', () => {
      const invoices = [
        { status: 'PAID', amount: 1000000 },
        { status: 'UNPAID', amount: 100 }
      ];
      
      const balance = calculateOutstandingBalance(invoices, []);
      expect(balance).toBe(100);
    });
  });
});
```

**Test File: permissions.test.ts**

```typescript
describe('Role-Based Access Control', () => {

  describe('PropertyOwner Permissions by Unit Status', () => {
    
    it('should allow viewing charges for any unit status', () => {
      const statuses = ['IN_DEVELOPMENT', 'VACANT', 'OWNER_RESIDENT', 'RENTED'];
      
      statuses.forEach(status => {
        const unit = { id: 'A-101', status };
        const perms = computePermissions('PropertyOwner', unit);
        
        expect(perms).toContain('VIEW_SERVICE_CHARGES');
        expect(perms).toContain('MAKE_PAYMENT');
      });
    });

    it('should restrict visitor request to RENTED status only', () => {
      const ownerResidentUnit = { id: 'A-101', status: 'OWNER_RESIDENT' };
      const rentedUnit = { id: 'A-102', status: 'RENTED' };
      
      expect(computePermissions('PropertyOwner', ownerResidentUnit))
        .not.toContain('REQUEST_VISITOR_ACCESS');
      
      expect(computePermissions('PropertyOwner', rentedUnit))
        .toContain('REQUEST_VISITOR_ACCESS');
    });

    it('should allow direct visitor creation for non-RENTED status', () => {
      const ownerResidentUnit = { id: 'A-101', status: 'OWNER_RESIDENT' };
      const vacantUnit = { id: 'A-102', status: 'VACANT' };
      
      expect(computePermissions('PropertyOwner', ownerResidentUnit))
        .toContain('CREATE_VISITOR_PASS');
      
      expect(computePermissions('PropertyOwner', vacantUnit))
        .toContain('CREATE_VISITOR_PASS');
    });
  });

  describe('PrimaryResident Permissions', () => {
    
    it('should never access financial information', () => {
      const unit = { id: 'A-101', status: 'OWNER_RESIDENT' };
      const perms = computePermissions('PrimaryResident', unit);
      
      expect(perms).not.toContain('VIEW_SERVICE_CHARGES');
      expect(perms).not.toContain('VIEW_PROJECT_LEVIES');
      expect(perms).not.toContain('MAKE_PAYMENT');
    });

    it('should access maintenance functionality', () => {
      const unit = { id: 'A-101', status: 'OWNER_RESIDENT' };
      const perms = computePermissions('PrimaryResident', unit);
      
      expect(perms).toContain('SUBMIT_MAINTENANCE_REQUEST');
      expect(perms).toContain('VIEW_MAINTENANCE_STATUS');
      expect(perms).toContain('CREATE_VISITOR_PASS');
    });
  });

  describe('EXCO Permissions', () => {
    
    it('should have global access to all financial data', () => {
      const unit = { id: 'A-101', status: 'OWNER_RESIDENT' };
      const perms = computePermissions('EXCO', unit);
      
      expect(perms).toContain('VIEW_ALL_INVOICES');
      expect(perms).toContain('VIEW_ALL_PAYMENTS');
      expect(perms).toContain('RECONCILE_PAYMENTS');
      expect(perms).toContain('CREATE_CHARGES');
      expect(perms).toContain('ISSUE_CREDITS_DEBITS');
    });

    it('should manage users and accounts', () => {
      const perms = computePermissions('EXCO', null);
      
      expect(perms).toContain('CREATE_USER_ACCOUNT');
      expect(perms).toContain('DEACTIVATE_USER');
      expect(perms).toContain('SET_UNIT_STATUS');
    });
  });
});
```

### 13.3 Integration Tests

**Test File: invoice-generation.integration.test.ts**

```typescript
describe('Invoice Generation Integration Tests', () => {

  beforeAll(async () => {
    // Setup test database with sample data
    await setupTestEstate();
    await seedUnitTypes();
    await seedBillingProfiles();
    await seedUnits();
  });

  afterAll(async () => {
    await cleanupTestDatabase();
  });

  describe('Monthly billing cycle', () => {
    
    it('should generate invoices for all units on scheduled date', async () => {
      // Arrange
      const targetDate = new Date('2025-11-01T00:00:00Z');
      const expectedInvoiceCount = 50;
      
      // Act
      const result = await runBillingCycle(targetDate);
      
      // Assert
      expect(result.generated_count).toBe(expectedInvoiceCount);
      expect(result.failed_count).toBe(0);
      
      const invoices = await getInvoicesByDate(targetDate);
      expect(invoices).toHaveLength(expectedInvoiceCount);
      
      invoices.forEach(inv => {
        expect(inv.status).toBe('UNPAID');
        expect(inv.issue_date).toEqual(targetDate);
        expect(inv.amount).toBeGreaterThan(0);
      });
    });

    it('should send email notification for each invoice', async () => {
      const targetDate = new Date('2025-11-01T00:00:00Z');
      
      await runBillingCycle(targetDate);
      
      const sendGridCalls = getSendGridMockCalls();
      expect(sendGridCalls.length).toBe(50);
      
      sendGridCalls.forEach(call => {
        expect(call.to).toBeDefined();
        expect(call.template_id).toBe('d-invoice-notification');
        expect(call.dynamic_template_data.amount).toBeGreaterThan(0);
      });
    });

    it('should not create duplicate invoices for same period', async () => {
      const targetDate = new Date('2025-11-01T00:00:00Z');
      
      // First run
      const result1 = await runBillingCycle(targetDate);
      expect(result1.generated_count).toBe(50);
      
      // Second run (should be idempotent)
      const result2 = await runBillingCycle(targetDate);
      expect(result2.generated_count).toBe(0);
    });
  });

  describe('Project levy application', () => {
    
    it('should calculate per-owner totals correctly', async () => {
      const levy = {
        name: 'Infrastructure Levy',
        costPerUnit: 50000,
        applicableUnitIds: ['A-101', 'A-102', 'B-204']
      };
      
      const result = await applyProjectLevy(levy);
      
      expect(result.invoices).toHaveLength(2); // 2 owners
      
      const owner1Invoice = result.invoices.find(i => i.owner_id === 'owner1');
      expect(owner1Invoice.amount).toBe(100000); // 2 units
      
      const owner2Invoice = result.invoices.find(i => i.owner_id === 'owner2');
      expect(owner2Invoice.amount).toBe(50000); // 1 unit
    });
  });

  describe('Payment reconciliation', () => {
    
    it('should auto-match pending payments with bank transactions', async () => {
      // Arrange
      await createPendingPayments([
        { unit_id: 'A-101', amount: 50000, reference: 'TXN-001' },
        { unit_id: 'A-102', amount: 75000, reference: 'TXN-002' }
      ]);
      
      const bankStatement = [
        { amount: 50000, reference: 'TXN-001' },
        { amount: 75000, reference: 'TXN-002' }
      ];
      
      // Act
      const result = await reconcileBankStatement(bankStatement);
      
      // Assert
      expect(result.matched_count).toBe(2);
      expect(result.unmatched_count).toBe(0);
      
      const payments = await getPaymentsByStatus('BANK_CONFIRMED');
      expect(payments).toHaveLength(2);
    });
  });
});
```

### 13.4 E2E Test Scenarios (Cypress/Playwright)

**Test File: full-resident-workflow.e2e.spec.ts**

```typescript
describe('Full Resident Workflow E2E', () => {

  describe('Property Owner Complete Journey', () => {
    
    it('should allow property owner to register, view invoice, and request payment', () => {
      // 1. Registration
      cy.visit('/login');
      cy.get('[data-cy=signup-link]').click();
      cy.get('[data-cy=email-input]').type('owner@test.com');
      cy.get('[data-cy=password-input]').type('SecurePassword123');
      cy.get('[data-cy=submit-button]').click();
      cy.contains('Account created successfully');

      // 2. First login - Set unit status
      cy.get('[data-cy=unit-status-select]').select('Occupied - Owner-Resident');
      cy.get('[data-cy=confirm-button]').click();

      // 3. View finances
      cy.visit('/dashboard');
      cy.get('[data-cy=finances-tab]').click();
      cy.get('[data-cy=outstanding-balance]').should('exist');
      cy.contains('Service Charge Ledger');

      // 4. View invoice
      cy.get('[data-cy=invoice-list]').should('be.visible');
      cy.get('[data-cy=invoice-item]').first().click();
      cy.get('[data-cy=invoice-detail]').should('be.visible');
      cy.get('[data-cy=invoice-amount]').should('contain', 'NGN');
      cy.get('[data-cy=download-invoice]').click();

      // 5. Make payment request
      cy.get('[data-cy=payment-instructions]').should('be.visible');
      cy.get('[data-cy=bank-account-number]').should('contain', '0');
    });

    it('should allow property owner to manage visitors', () => {
      cy.login('owner@test.com', 'SecurePassword123');
      
      cy.visit('/visitors');
      cy.get('[data-cy=add-visitor-button]').click();
      
      // Fill form
      cy.get('[data-cy=visitor-name]').type('John Smith');
      cy.get('[data-cy=visitor-date]').type('2025-11-20');
      cy.get('[data-cy=visitor-time-start]').type('14:00');
      cy.get('[data-cy=visitor-time-end]').type('18:00');
      cy.get('[data-cy=parking-checkbox]').check();
      
      cy.get('[data-cy=submit-button]').click();
      cy.contains('Visitor pass created');
      
      cy.get('[data-cy=pass-qr]').should('be.visible');
      cy.get('[data-cy=pass-code]').should('contain', 'VIS-');
    });
  });

  describe('EXCO Administrative Workflow', () => {
    
    it('should allow EXCO to create charges and track payments', () => {
      cy.login('exco@opera.ng', 'ExcoPass123');
      
      cy.visit('/admin/financial');
      
      // Create project levy
      cy.get('[data-cy=create-levy-button]').click();
      cy.get('[data-cy=levy-name]').type('Phase 2 Infrastructure');
      cy.get('[data-cy=cost-per-unit]').type('50000');
      
      // Select units
      cy.get('[data-cy=unit-checkbox-A101]').check();
      cy.get('[data-cy=unit-checkbox-A102]').check();
      
      cy.get('[data-cy=submit-button]').click();
      cy.contains('Levy created successfully');
      
      // View payments
      cy.visit('/admin/payments');
      cy.get('[data-cy=pending-payments]').should('exist');
    });

    it('should allow EXCO to reconcile bank statements', () => {
      cy.login('exco@opera.ng', 'ExcoPass123');
      
      cy.visit('/admin/reconciliation');
      cy.get('[data-cy=upload-statement]').click();
      
      // Upload file
      cy.get('input[type=file]').attachFile('bank-statement.csv');
      
      cy.contains('Processing reconciliation');
      
      // Verify matched transactions
      cy.get('[data-cy=matched-transactions]').should('contain', '4 matched');
      cy.get('[data-cy=confirm-matches]').click();
      
      cy.contains('Reconciliation complete');
    });
  });
});
```

---

## Summary: Development Roadmap

### Phase 1: Foundation (Weeks 1-4)
- [ ] Super Admin system initialization
- [ ] Database schema finalization
- [ ] RBAC authentication system
- [ ] Property Owner registration flow

### Phase 2: Financial Core (Weeks 5-8)
- [ ] Invoice generation system
- [ ] Payment recording and tracking
- [ ] Bank reconciliation workflow
- [ ] Financial dashboard

### Phase 3: Communication (Weeks 9-12)
- [ ] Email notification system
- [ ] WhatsApp integration with n8n
- [ ] Communication preferences
- [ ] Multi-channel routing

### Phase 4: Operational (Weeks 13-16)
- [ ] Visitor management system
- [ ] Maintenance request tracking
- [ ] Document management
- [ ] EXCO dashboard

### Phase 5: Polish & Testing (Weeks 17-20)
- [ ] Comprehensive BDD/TDD coverage
- [ ] Performance optimization
- [ ] Security hardening
- [ ] UAT and bug fixes

---

## Tech Stack Recommendations

**Frontend:**
- Next.js (Vercel) ✓
- TypeScript for type safety
- Tailwind CSS for styling
- React Query for state management
- Jest + Playwright for testing

**Backend/Database:**
- Supabase PostgreSQL ✓
- RPC functions for business logic
- Postgres triggers for audit logging
- Connection pooling for scalability

**Communication:**
- SendGrid for email ✓
- Twilio for WhatsApp & SMS ✓
- n8n workflows ✓

**DevOps:**
- GitHub for version control
- GitHub Actions for CI/CD
- Vercel for frontend deployment
- Supabase for database hosting

**Testing:**
- Gherkin for BDD specs ✓
- Jest for unit tests
- Playwright for E2E tests
- Postman for API testing

---

**End of Document**

