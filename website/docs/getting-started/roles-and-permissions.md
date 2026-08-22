---
id: roles-and-permissions
title: Roles and permissions
sidebar_label: Roles and permissions
---

# Roles and permissions

Residio uses granular role-based access control. A role determines which modules a person can see and which actions they can perform within those modules.

## Role families

| Role family | Typical responsibility | Primary guide sections |
| --- | --- | --- |
| Super administrator | Full estate configuration and oversight | All sections |
| Chairman | Governance, approvals, reports, and oversight | Dashboard, operations, reports |
| Financial secretary | Payments, billing, imports, expenditure, and finance reports | Finance |
| Security officer | Security contacts, access records, and gate operations | Security |
| Operations or staff role | Assigned operational workflows | Residents, properties, operations |

Your deployment may contain additional custom roles. Ask a super administrator to confirm the exact permission set before assigning responsibility.

## Permission levels

- **View:** open a list or detail page.
- **Create:** add a new record or initiate a workflow.
- **Update:** change an existing record or approve a pending item.
- **Delete:** remove or deactivate a record where the workflow allows it.

:::warning Least privilege
Give a user the smallest role that lets them complete their job. Financial and security permissions should not be bundled into a general operations role without a business reason.
:::

## When access is denied

1. Confirm the user is signed in with the expected account.
2. Confirm the correct role is assigned.
3. Ask a super administrator to review **Settings → Roles & Permissions**.
4. Retry after the role or permission change has propagated.
