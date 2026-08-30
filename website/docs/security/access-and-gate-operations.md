---
id: access-and-gate-operations
title: Access and gate operations
sidebar_label: Access and gate operations
residio_sources:
  - src/actions/security/**
  - src/lib/security/**
residio_verified_commit: e51b591
residio_verified_at: '2026-08-30'
residio_app_version: '0.4.0'
---

# Access and gate operations

Security workflows connect resident status, contact validity, access codes, and gate activity.

## Check an access issue

1. Confirm the person or visitor identity.
2. Search **Security** for the active contact or code.
3. Check the validity period, usage limit, and time window.
4. Review the access log for the attempted entry.
5. Correct the underlying contact or code only after confirming authorization.

## Visitor operations

Use the security contact and visitor tools to create time-bounded access where supported. A temporary code should have a clear owner, purpose, validity period, and expiry.

## Escalation

Escalate suspected misuse or repeated failed access attempts to the security lead. Preserve the access log and do not erase evidence while investigating.
