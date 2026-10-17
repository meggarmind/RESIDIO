# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The admin dashboard is used primarily by volunteer committee members of an Owners and Property-holders Residents Estate Association (OPREA): chairman, treasurer, secretary and similar officers. They use it occasionally, are not necessarily technical, and often work from a phone as much as a laptop. Paid estate office staff and security personnel also appear in the system, but the committee member is the person the interface is designed around.

The Resident Portal and other resident self-service surfaces exist in code but are not scheduled for rollout. Forward work is admin-dashboard-first (CORE.md section 3).

## Product Purpose

Residio is a residential estate administration system. It manages the resident roster and the houses they hold, billing (invoices, levies, billing profiles, wallet), payments and their matching to invoices, expenses, security contacts and access, community communications (email, SMS, WhatsApp) and reporting, from one admin dashboard. Success is a committee that can see who owes what, record and reconcile payments, and communicate with residents without a spreadsheet or a specialist.

## Positioning

An estate-native domain model that generic accounting tools and spreadsheets do not have: Residents attached to Houses through role-bearing Resident Houses, levies and billing profiles per house, a per-resident Wallet drawn down against invoices, bank-statement payment matching, Personnel and their Engagements, and a link from paid-up status to estate security and access control.

## Operating Context

- Cloud-hosted: Next.js 16 on Coolify, Supabase (Residio_Stage for UAT, Residio_Prod for production).
- Roles and permissions are enforced per action (RBAC); the same screens show different controls to different officers.
- Money is handled in the estate's local currency; payment evidence arrives as bank statements, receipts and proofs of payment.
- Messaging runs through Resend email, SMS and a WhatsApp Assistant, with a debug and override mode on non-production environments.
- Domain terms are fixed in CONTEXT.md and must be used as written: Resident, House, Resident House, Personnel, Personnel Engagement, Invoice, Payment, Wallet, Billing Profile.

## Capabilities and Constraints

- Admin modules: residents and houses, billing, payments, expenses, security contacts, reporting, communications, settings.
- Every write action is permission-checked and audit-logged; UI controls must be gated on the write permission, not only on the route's view permission.
- Existing design conventions live in DESIGN_AGENTS.md (OKLCH colors, shadcn New-York style, lucide icons in IconBox wrappers, tactile micro-animations). Wrap shadcn primitives in semantic layout components rather than using them directly in pages.
- Mobile is a first-class target: every admin screen must be fully usable on a phone.
- Resident-facing and portal surfaces are out of scope until the owner says otherwise.

## Brand Commitments

The product name is Residio. No logo, voice guide or brand identity beyond DESIGN_AGENTS.md has been confirmed as binding.

## Evidence on Hand

Real product: a running admin dashboard in `src/app/(dashboard)`, a wiki in `website/docs`, domain glossary in `CONTEXT.md`, decisions in `docs/adr/`. No customer testimonials, case studies, press or pricing exist in the repository, and none should be invented.

## Product Principles

1. Built for the occasional volunteer officer: the next action and the state of the books should be obvious without training.
2. Money screens must be trustworthy: amounts, statuses and who-did-what are unambiguous, and nothing implies a payment or balance the data does not support.
3. Mobile equals desktop in capability: no admin task requires a laptop.
4. Use the estate's own words (Resident, House, Wallet, Levy) consistently; never generic substitutes.
5. Permissions shape the interface: users see only the actions they are allowed to take.

## Accessibility & Inclusion

Mobile usability on every admin screen is required. No formal standard has been confirmed; treat WCAG AA contrast and full keyboard operation as the working floor until the owner states otherwise.
