# Residio User Stories

This document translates the technical features of Residio into user-centric stories to define value and acceptance criteria.

---

## 1. Persona: Estate Administrator (Exco Roles)
*Roles: Super Admin, Chairman, Financial Officer, Security Officer, Secretary*

| ID | User Story | Related Feature |
|:---|:---|:---|
| AD-01 | As an **Estate Admin**, I want to **audit all system actions**, so that I can ensure accountability and track changes. | Audit Logging |
| AD-02 | As a **Financial Officer**, I want to **generate estate-wide invoices automatically**, so that I don't have to manually bill hundreds of residents. | Automated Invoice Gen |
| AD-03 | As a **Financial Officer**, I want the system to **automatically allocate wallet balances to unpaid invoices**, so that I don't have to manually reconcile payments. | Wallet System |
| AD-04 | As a **Security Officer**, I want to **view real-time visitor analytics**, so that I can monitor traffic patterns and identify potential security risks. | Visitor Analytics |
| AD-05 | As an **Estate Admin**, I want to **impersonate a resident's portal view**, so that I can help them troubleshoot issues they are seeing. | Admin Impersonation |
| AD-06 | As a **Secretary**, I want to **send emergency announcements to all residents**, so that everyone receives critical estate updates instantly. | Announcement Sys |
| AD-07 | As a **Financial Officer**, I want to **import bank statements directly via Gmail**, so that I can automate the verification of resident payments. | Gmail Integration |
| AD-08 | As a **Financial Officer**, I want to **import bank statements from PDF files** (including password-protected ones), so that I can process statements even when CSVs are unavailable. | PDF Statement Import |

---

## 2. Persona: Resident (Primary)
*Roles: Resident Landlord, Non-Resident Landlord, Tenant, Developer*

| ID | User Story | Related Feature |
|:---|:---|:---|
| RS-01 | As a **Resident**, I want to **view my current wallet balance and unpaid invoices**, so that I can stay up-to-date with my financial obligations. | Resident Portal |
| RS-02 | As a **Tenant**, I want to **generate a one-time access code for my visitor**, so that they can enter the estate without me being physically present at the gate. | Access Codes |
| RS-03 | As a **Tenant**, I want the **Smart Action Center to suggest generating a code for my regular cleaner on Friday mornings**, so that I don't forget to grant them access. | Smart Action Ctr |
| RS-04 | As a **Resident Landlord**, I want to **manage my household members and domestic staff**, so that they have the appropriate level of access to the estate. | Household Mgmt |
| RS-05 | As a **Resident**, I want to **verify my contact information via OTP**, so that my account remains secure and I receive important alerts. | Contact Verification |
| RS-06 | As a **Tenant**, I want to **receive a financial clearance certificate** when moving out, so that I can prove I have no outstanding debts to the estate. | Renter Move-Out |
| RS-07 | As a **Non-Resident Landlord**, I want to **approve access requests from my tenants**, so that I retain control over who is added to my property. | Approval Workflows |

---

## 3. Persona: Security Guard / Gate Personnel
*Roles: Security Guard, Security Officer*

| ID | User Story | Related Feature |
|:---|:---|:---|
| SG-01 | As a **Security Guard**, I want to **verify a visitor's access code at the gate**, so that I can ensure only authorized individuals enter the estate. | Code Verification |
| SG-02 | As a **Security Guard**, I want to **log every entry and exit with license plate details**, so that there is a full record of vehicle movement. | Access Logs |
| SG-03 | As a **Security Guard**, I want to **see if a visitor's code has expired or been used already**, so that I can prevent unauthorized re-entry. | Time-Limited Codes |

---

## 4. Persona: Secondary Resident / staff
*Roles: Co-Resident, Household Member, Domestic Staff, Caretaker, Contractor*

| ID | User Story | Related Feature |
|:---|:---|:---|
| SS-01 | As a **Household Member**, I want to **view estate announcements**, so that I am informed about community events or maintenance schedules. | Announcement Sys |
| SS-02 | As a **Domestic Staff member**, I want to **have a unique access code that is valid during my working hours**, so that I can enter and exit the estate without calling my employer. | Time Windows |
| SS-03 | As a **Contractor**, I want a **temporary access code for the duration of my work**, so that I can access the site only when needed. | Access Codes |
