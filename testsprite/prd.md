# Residio - Product Requirements Document

## Product Overview
Residio is a residential estate access management web application that automates resident access control by managing payment status, security contact lists, and providing APIs for external systems.

## Application URLs
- **Local Development**: http://localhost:3000
- **Staging**: https://residio-staging.vercel.app (if deployed)
- **Authentication Required**: Yes

## Test User Credentials
| Email | Password | Role | Access Level |
|-------|----------|------|--------------|
| admin@residio.test | password123 | admin | Full system access |
| chairman@residio.test | password123 | chairman | Resident, house, payment management |
| finance@residio.test | password123 | financial_secretary | Resident, house, payment management |
| security@residio.test | password123 | security_officer | Read-only security contacts |

## Login Flow
1. Navigate to `/login`
2. Enter email in the email input field
3. Enter password in the password field
4. Click "Sign In" button
5. On success: redirect to `/dashboard`
6. On failure: show error toast notification

---

## Phase 1: Authentication & RBAC

### Features
1. **Login Page** (`/login`)
   - Email/password authentication via Supabase Auth
   - Error handling for invalid credentials
   - Redirect to dashboard on success
   - Form validation on empty fields

2. **Role-Based Access Control**
   - Roles: admin, chairman, financial_secretary, security_officer
   - Route protection via Next.js middleware
   - Different navigation items per role
   - Protected routes redirect to login if unauthenticated

### Test Cases

#### TC1.1: Valid admin login redirects to dashboard
- **Precondition**: User is not logged in
- **Steps**:
  1. Go to `/login`
  2. Enter `admin@residio.test` in email field
  3. Enter `password123` in password field
  4. Click "Sign In" button
- **Expected**: Page redirects to `/dashboard`

#### TC1.2: Invalid credentials show error message
- **Precondition**: User is not logged in
- **Steps**:
  1. Go to `/login`
  2. Enter `invalid@test.com` in email field
  3. Enter `wrongpassword` in password field
  4. Click "Sign In" button
- **Expected**: Error toast notification appears with authentication failure message

#### TC1.3: Unauthenticated access to /dashboard redirects to /login
- **Precondition**: User is not logged in, no session cookies
- **Steps**:
  1. Navigate directly to `/dashboard`
- **Expected**: Page redirects to `/login`

#### TC1.4: Security officer cannot access admin routes
- **Precondition**: Logged in as security@residio.test
- **Steps**:
  1. Try to navigate to `/residents`
- **Expected**: Access denied or redirect to dashboard

#### TC1.5: Session persists after page refresh
- **Precondition**: Logged in as admin
- **Steps**:
  1. Refresh the page (F5)
- **Expected**: User remains logged in, stays on current page

---

## Phase 2: Dashboard Shell

### Features
1. **Dashboard Layout**
   - Collapsible sidebar navigation with role-filtered items
   - Header with user avatar dropdown and sign out
   - Responsive design (mobile sidebar as sheet overlay)

2. **Dashboard Home** (`/dashboard`)
   - Stats overview cards (Total Residents, Houses, Payments, etc.)
   - Quick action buttons

### Test Cases

#### TC2.1: Dashboard displays stats cards
- **Precondition**: Logged in as admin
- **Steps**:
  1. Navigate to `/dashboard`
- **Expected**: Page shows stat cards with numbers

#### TC2.2: Sidebar shows correct navigation for admin role
- **Precondition**: Logged in as admin
- **Steps**:
  1. Look at sidebar navigation
- **Expected**: Shows: Dashboard, Residents, Houses, Payments, Billing, Security, Settings

#### TC2.3: Sidebar shows correct navigation for security_officer role
- **Precondition**: Logged in as security@residio.test
- **Steps**:
  1. Look at sidebar navigation
- **Expected**: Shows limited items: Dashboard, Security

#### TC2.4: Sign out button logs user out
- **Precondition**: Logged in as any user
- **Steps**:
  1. Click user avatar/menu in header
  2. Click "Sign Out" button
- **Expected**: User logged out, redirected to `/login`

#### TC2.5: Mobile menu opens/closes correctly
- **Precondition**: Logged in, viewport width < 768px
- **Steps**:
  1. Click hamburger menu icon
  2. Verify sidebar sheet opens
  3. Click outside or close button
- **Expected**: Sidebar sheet toggles properly

---

## Phase 3: Resident & House Management

### Features
1. **Houses Module** (`/houses`)
   - Table with columns: House Number, Street, Type, Status, Occupants
   - "Add House" button
   - Filter by street dropdown
   - Click row to view details

2. **Residents Module** (`/residents`)
   - Table with columns: Resident Code, Name, Role, Status, House
   - "Add Resident" button
   - Auto-generated 6-digit resident codes
   - Filter by status dropdown

### Test Cases

#### TC3.1: Houses list page loads with table
- **Precondition**: Logged in as admin
- **Steps**:
  1. Navigate to `/houses`
- **Expected**: Table displays with house data or empty state

#### TC3.2: Create new house with valid data
- **Precondition**: Logged in as admin
- **Steps**:
  1. Go to `/houses/new`
  2. Enter house number "Test-001"
  3. Select a street from dropdown
  4. Select house type
  5. Click "Create House" button
- **Expected**: Success toast, redirect to house list or detail

#### TC3.3: House form validates required fields
- **Precondition**: On `/houses/new`
- **Steps**:
  1. Leave all fields empty
  2. Click "Create House" button
- **Expected**: Validation errors shown for required fields

#### TC3.4: Residents list page loads with table
- **Precondition**: Logged in as admin
- **Steps**:
  1. Navigate to `/residents`
- **Expected**: Table displays with resident data or empty state

#### TC3.5: Create new resident with valid data
- **Precondition**: Logged in as admin
- **Steps**:
  1. Go to `/residents/new`
  2. Enter first name "Test"
  3. Enter last name "Resident"
  4. Select role "tenant"
  5. Click "Create Resident" button
- **Expected**: Success toast, resident code auto-generated

#### TC3.6: Resident code is auto-generated (6 digits)
- **Precondition**: Created a new resident
- **Steps**:
  1. View created resident details
- **Expected**: Resident code shows 6-digit number format

#### TC3.7: Link resident to house
- **Precondition**: Resident and house exist
- **Steps**:
  1. Go to resident detail page
  2. Click "Add House" or house assignment button
  3. Select a house
  4. Save
- **Expected**: Resident now associated with house

#### TC3.8: Filter residents by status
- **Precondition**: Multiple residents with different statuses exist
- **Steps**:
  1. Go to `/residents`
  2. Select "Active" from status filter dropdown
- **Expected**: Table shows only active residents

---

## Phase 4: Enhancements

### Features
1. **Reference Management** (`/settings/references`)
   - Streets tab: Add/edit/delete streets
   - House Types tab: Manage with billing profiles

2. **Emergency Contacts**
   - Link existing resident as emergency contact
   - Manual entry with name/phone

3. **Multiple House Linking**
   - Resident can be linked to multiple houses
   - Primary residence designation

### Test Cases

#### TC4.1: Add new street via reference management
- **Precondition**: Logged in as admin
- **Steps**:
  1. Go to `/settings/references`
  2. Click "Add Street" button
  3. Enter street name "Test Street"
  4. Click Save
- **Expected**: New street added to list

#### TC4.2: Add new house type with billing profile
- **Precondition**: On reference management page
- **Steps**:
  1. Switch to House Types tab
  2. Click "Add House Type"
  3. Enter name and billing details
  4. Save
- **Expected**: House type with billing info saved

#### TC4.3: Link existing resident as emergency contact
- **Precondition**: Multiple residents exist
- **Steps**:
  1. Go to a resident's detail page
  2. In emergency contact section, select "Link Existing Resident"
  3. Choose a resident from dropdown
  4. Save
- **Expected**: Emergency contact linked successfully

#### TC4.4: Assign resident to multiple houses
- **Precondition**: Resident exists, multiple houses exist
- **Steps**:
  1. View resident detail page
  2. Add first house assignment
  3. Add second house assignment
- **Expected**: Resident linked to multiple houses

#### TC4.5: Set primary residence
- **Precondition**: Resident linked to multiple houses
- **Steps**:
  1. Click "Set as Primary" on one house
- **Expected**: That house marked as primary residence

---

## Phase 5: Payment & Billing System

### Features
1. **Payment Records** (`/payments`)
   - Table with: Date, Resident, Amount, Method, Status, Reference
   - Filters: Status dropdown, Date range, Resident search
   - Bulk selection checkboxes
   - Floating action bar on selection

2. **Payment Form** (`/payments/new`)
   - Resident selector
   - Amount field (CurrencyInput with comma formatting)
   - Payment method dropdown
   - Date picker
   - Notes field

3. **Payment Receipt** (`/payments/[id]`)
   - Tabs: Edit Details, Receipt Preview
   - Print button for receipt

4. **Wallet System**
   - Balance displayed on resident detail
   - Adjustment dialog for manual credits/debits
   - Auto-allocates to unpaid invoices

5. **Billing & Invoices** (`/billing`)
   - "Generate Invoices" button
   - "Check Overdue" button with alert banner
   - Invoice table with filters
   - Pagination

### Test Cases

#### TC5.1: Payments list page loads
- **Precondition**: Logged in as admin
- **Steps**:
  1. Navigate to `/payments`
- **Expected**: Payments table displayed

#### TC5.2: Record new payment for resident
- **Precondition**: At least one resident exists
- **Steps**:
  1. Go to `/payments/new`
  2. Select a resident
  3. Enter amount "10,000" (auto-formats with comma)
  4. Select payment method "Bank Transfer"
  5. Click "Record Payment"
- **Expected**: Payment created, success toast shown

#### TC5.3: Payment form validates amount
- **Precondition**: On payment form
- **Steps**:
  1. Leave amount empty or enter 0
  2. Try to submit
- **Expected**: Validation error for amount field

#### TC5.4: View payment details
- **Precondition**: Payment exists
- **Steps**:
  1. Go to `/payments`
  2. Click "View" on a payment row
- **Expected**: Payment detail page loads with tabs

#### TC5.5: Print payment receipt
- **Precondition**: On payment detail page
- **Steps**:
  1. Click "Receipt Preview" tab
  2. Click "Print Receipt" button
- **Expected**: Print dialog opens or receipt prints

#### TC5.6: Bulk update payment status
- **Precondition**: Multiple payments exist
- **Steps**:
  1. Go to `/payments`
  2. Check 2+ payment checkboxes
  3. Click "Update Status" dropdown in action bar
  4. Select "Paid"
- **Expected**: Selected payments updated to Paid status

#### TC5.7: Export payments to CSV
- **Precondition**: Payments selected
- **Steps**:
  1. Select payments with checkboxes
  2. Click "Export CSV" button
- **Expected**: CSV file downloads

#### TC5.8: Wallet balance updates on payment
- **Precondition**: Resident has wallet
- **Steps**:
  1. Record a payment for resident
  2. Check resident detail page
- **Expected**: Wallet balance increased

#### TC5.9: Manual wallet adjustment
- **Precondition**: On resident detail page
- **Steps**:
  1. Click "Adjust Wallet" button
  2. Enter adjustment amount
  3. Select credit/debit
  4. Submit
- **Expected**: Wallet balance updated

#### TC5.10: Generate monthly invoices
- **Precondition**: Billing profiles and residents configured
- **Steps**:
  1. Go to `/billing`
  2. Click "Generate Invoices" button
- **Expected**: Invoices generated, toast shows count

#### TC5.11: Check overdue invoices shows alert
- **Precondition**: Overdue invoices exist (past due date)
- **Steps**:
  1. Go to `/billing`
  2. Click "Check Overdue" button
- **Expected**: Alert banner shows overdue count and total

#### TC5.12: Billing profiles page loads
- **Precondition**: Logged in as admin
- **Steps**:
  1. Navigate to `/settings/billing`
- **Expected**: Billing profiles list displayed

#### TC5.13: Create new billing profile
- **Precondition**: On billing settings page
- **Steps**:
  1. Click "Add Billing Profile"
  2. Enter name and amount items
  3. Save
- **Expected**: Profile created successfully

---

## UI Components Reference
- **Framework**: Next.js 16 with App Router
- **UI Library**: shadcn/ui components
- **Styling**: Tailwind CSS v4
- **Forms**: React Hook Form + Zod validation
- **Notifications**: Sonner toast
- **Icons**: Lucide React
- **Currency Input**: Custom CurrencyInput component (comma-separated)

## Key Selectors
- Login email: `input[type="email"]` or `input[name="email"]`
- Login password: `input[type="password"]`
- Login submit: `button[type="submit"]`
- Tables: `table` or `[role="table"]`
- Checkboxes: `input[type="checkbox"]` or `[role="checkbox"]`
- Dialogs: `[role="dialog"]`
- Toasts: `[data-sonner-toast]`
