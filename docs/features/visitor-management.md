# Visitor Management Enhancements

**Last Updated**: 2026-01-13
**Status**: Implemented (Database Layer)
**Related**: [Security Contact Management](../security/security-contact-categories.md) | [Database Schema](../architecture/database-schema.md)

---

## Overview

The Visitor Management system has been significantly enhanced to support recurring visitors, vehicle registration, and detailed visit analytics. These changes allow for more robust security tracking and convenience for residents with regular staff or guests.

## key Features

### 1. Recurring Visitors

Visitors can now be scheduled with specific recurrence patterns, transforming them from ad-hoc contacts to managed relationships.

**New Fields (`security_contacts`):**

- `is_recurring`: Boolean flag for recurring status.
- `recurrence_pattern`: Enum (`daily`, `weekly`, `biweekly`, `monthly`, `custom`).
- `recurrence_days`: Array of days (e.g., `['monday', 'wednesday']`).
- `expected_arrival_time` / `expected_departure_time`: Time windows.
- `purpose`: Reason for recurrence (e.g., "Cleaning", "Tutoring").

### 2. Vehicle Registration

Vehicles can now be registered and linked to specific visitors (`security_contacts`), enabling license plate tracking and gate security verification.

**Entity (`visitor_vehicles`):**

- `vehicle_type`: Enum (`car`, `motorcycle`, `truck`, etc.).
- `plate_number`: License plate (Required).
- `photo_url`: Vehicle image.
- `is_primary`: Flag for the main vehicle.
- `is_active`: For managing vehicle history.

### 3. Visit Analytics & History

The system now tracks detailed metrics for every visit.

**Enhanced Access Logs (`access_logs`):**

- `expected_duration_minutes` vs `actual_duration_minutes`.
- `vehicle_id`: Link to the specific vehicle used.
- `entry_method`: How they entered (code, manual, photo).
- `photo_captured_at` / `photo_url`: Gate verification photos.

**Analytics Views (`visitor_analytics`):**

- `visit_count`: Total historical visits.
- `last_visit_at`: Timestamp of last entry.
- `is_frequent_visitor`: Auto-calculated flag (e.g., >5 visits in 30 days).
- `avg_visit_duration_minutes`.

## Business Logic

### Frequent Visitor Detection

A database trigger (`update_visitor_statistics`) automatically monitors access logs. If a visitor enters more than 5 times in 30 days, they are flagged as `is_frequent_visitor`. This helps security identify patterns and potential unregistered residents.

### Live Duration Tracking

When a visitor checks out (`check_out_time` is set), a trigger calculates the `actual_duration_minutes` automatically, providing precise data for time-on-site reporting.

## Permissions

**RBAC Controls:**

- View Vehicles: `admin`, `chairman`, `financial_secretary`, `security_officer`.
- Manage Vehicles: `admin`, `chairman`, `financial_secretary`.
- Analytics Access: `authenticated` (with RBAC policy filters).

## Database Components

- **Tables**: `visitor_vehicles`
- **Enums**: `visitor_recurrence_pattern`, `day_of_week`, `vehicle_type`
- **Views**: `visitor_analytics`
- **Functions**: `get_frequent_visitors()`, `get_visitor_history_summary()`
