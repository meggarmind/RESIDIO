
## Transaction Tags: Keyword Auto-Tagging & Learning System
**Added**: 2025-12-19  
**Type**: Feature  
**Module**: Billing System  
**Priority**: Medium  
**Status**: Prompt request generated

Enhance transaction tagging with keyword-based auto-tagging, pattern learning, and tag deletion protection for intelligent transaction categorization.

**Dependencies**: None

---

## Replace Dollar Symbol with Naira Throughout System
**Added**: 2025-12-19  
**Type**: Bug Fix  
**Module**: Core Platform  
**Priority**: High  
**Status**: Prompt request generated

Replace all $ currency symbols with ₦ (Naira) throughout the entire application, including Late Fee Configuration header and all other monetary displays.

**Dependencies**: None

---

## Flexible RBAC System with 7 Configurable Admin Roles
**Added**: 2025-12-19  
**Type**: Feature  
**Module**: Core Platform  
**Priority**: High  
**Status**: Prompt request generated

Transform hardcoded 4-role system into flexible RBAC with 7 configurable roles (Super Admin, Chairman, Vice Chairman, Financial Officer, Security Officer, Secretary, Project Manager) supporting EXCO/BOT structure with granular module permissions and resident-only assignment.

**Dependencies**: None

---

## Bank Statement Import - Transaction Flow & Visual Indicators
**Added**: 2025-12-19  
**Type**: Improvement  
**Module**: Billing System  
**Priority**: High  
**Status**: Prompt request generated

Differentiate credit/debit workflows in bank import; add visual indicators and expense breakdown

**Dependencies**: None

---

## Resident View - Complete Portal & Self-Service Features
**Added**: 2025-12-21  
**Type**: Feature  
**Module**: Resident Portal  
**Priority**: High  
**Status**: Prompt request generated

Build a complete Resident View portal enabling residents to manage properties, view bills and payments, control security access, and manage notifications while maintaining strict access controls.

**Dependencies**: payment gateway, notification service

---

## Build Comprehensive Alert Management Module
**Added**: 2025-12-21  
**Type**: Feature  
**Module**: Core Platform  
**Priority**: High  
**Status**: Prompt request generated

Centralized alert management system with multi-channel delivery (Email primary, SMS opt-in, WhatsApp future opt-out), configurable timing rules, automatic escalation workflows, smart deduplication, and comprehensive audit trails for all notifications across billing, security, and resident management.

**Dependencies**: SMS gateway, notification service, email service

---

## Add Email Receipt Button to Payment Details
**Added**: 2025-12-22  
**Type**: Feature  
**Module**: Billing System  
**Priority**: Medium  
**Status**: Prompt request generated

Add email button next to Print Receipt button to send receipts to residents. Include modal for selecting recipients when house has multiple co-residents.

**Dependencies**: notification service, email service, payment gateway

---

## Add Aggregate House Payment Status to Property Details
**Added**: 2025-12-22  
**Type**: Feature  
**Module**: Billing System  
**Priority**: Medium  
**Status**: Prompt request generated

Add cumulative payment status to House Detail View showing total outstanding balance from all past/present residents plus landlord fees, with drill-down to detailed breakdown.

**Dependencies**: payment gateway

---

## Enable Payment Allocation to Previous Properties
**Added**: 2025-12-22  
**Type**: Feature  
**Module**: Payment Gateway  
**Priority**: Medium  
**Status**: Prompt request generated

Allow residents to allocate payments toward outstanding balances at previous properties, with conditional display when old debts exist and default allocation to current house.

**Dependencies**: payment gateway

---

## Add Cross-Property Payment History to Resident Detail View
**Added**: 2025-12-22  
**Type**: Feature  
**Module**: Billing System  
**Priority**: Medium  
**Status**: Prompt request generated

Add consolidated payment history to Resident Detail View showing total outstanding and per-property breakdown across all properties the resident has been associated with, visible in both Admin and Resident portals.

**Dependencies**: payment gateway

---
