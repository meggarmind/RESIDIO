---
id: roles-and-permissions
title: Roles and permissions
sidebar_label: Roles and permissions
residio_sources:
  - src/lib/auth/**
  - src/actions/roles/**
  - src/app/(dashboard)/settings/roles/**
  - src/app/(dashboard)/settings/user-roles/**
  - src/app/(dashboard)/system/accounts/**
  - src/components/admin/role-assignment-section.tsx
  - src/components/admin/pending-accounts-list.tsx
residio_verified_commit: 8b49d5d
residio_verified_at: '2026-09-03'
residio_app_version: '0.4.0'
---

# Roles and permissions

Residio uses granular role-based access control. A role determines which modules a person can see and which actions they can perform within those modules.

## Approving new accounts

Signing up does not grant access. Anyone can create an account — with Google, or with an email address and password — but a new account starts as **pending**. It can sign in and sees a holding page explaining that it is waiting for approval, and nothing else. A pending account holds no permissions in the database either, so it cannot reach estate data by any route.

Review sign-ups in **System → Accounts → Pending Accounts**. The queue shows each person's name, email, whether that email is verified, how they signed up, and when they requested access. An account already linked to a resident record is tagged **Resident**.

- **Approve** opens a dialog where you choose the role the account will hold. Approval and role assignment are a single step; there is no approve-without-a-role.
- **Reject** requires a reason. The account is marked rejected, the person is signed out, and they are told the account was not approved and to contact the estate office. The reason you give is recorded in the audit log.

:::warning[Approve deliberately]
Approval is the gate. Everyone in this queue is asking for access to resident names, addresses, contact details, and financial records. Confirm who someone is before approving. If you cannot, reject rather than leave them waiting.
:::

## Roles

| Role | Typical responsibility | Primary guide sections |
| --- | --- | --- |
| Super Administrator | Full estate configuration and oversight | All sections |
| Chairman | Governance, approvals, reports, and oversight — everything the Super Administrator can do apart from Settings | Dashboard, operations, reports |
| Vice Chairman | Deputises for the chairman | Dashboard, operations, reports |
| Financial Officer | Payments, billing, imports, expenditure, and finance reports | Finance |
| Secretary | Documents, communications, and resident records | Residents, operations |
| Security Officer | Security contacts, access records, and gate operations | Security |
| Project Manager | Capital projects and development levies | Operations |
| Resident | Self-service portal only, no admin dashboard | — |

:::info[Chairman and the Settings module]
The Chairman is the Super Administrator without configuration. Every operational module is available — residents, houses, payments, billing, security, reports, documents, announcements, approvals — but the whole **Settings** section is not, and does not appear in the sidebar. That includes Role Definitions and Assignment Rules, so creating roles is the Super Administrator's job. Role *assignment* is a separate permission on **System → Accounts**, outside Settings, so it can be granted to a role such as Chairman independently of Settings access.
:::

Your deployment may contain additional custom roles, created under **Role Definitions**. A custom role behaves exactly like a built-in one: its holder signs in to the admin dashboard and sees the modules it was granted. Ask a super administrator to confirm the exact permission set before assigning responsibility.

## Creating a role

**Settings → Roles & Permissions → Role Definitions → Add Role**.

Name the role, give it a display name, pick its category and level, then choose its access in the same dialog:

- **Start from** copies another role's access as a starting point. This is usually the quickest route — "the same as the Secretary, plus finance" is one selection and a few ticks.
- Tick a **module** to grant everything in it.
- Open a module to grant **individual privileges** within it, when a role should read a module but not change it.

The footer counts what you have selected. A role created with nothing selected is created with no access at all and its holder will see an empty dashboard, so grant something before saving.

If the privileges cannot be saved, the role is not created either — you will not be left with a half-made role to clean up.

To change a role later, use the **Access** column in the roles table. It shows how many modules and privileges the role holds and opens the same picker.

:::warning[Changes apply at next sign-in]
Permission changes take effect when the affected user next signs in. Ask them to sign out and back in rather than waiting.
:::

## Assigning a role

**System → Accounts → Role Assignments** lists everyone who currently holds an admin role, and lets you search for the person whose role you want to change.

The search has two modes, chosen with the **Residents / Accounts** switch above the search box. They are two different populations, not one list with a filter, so pick the one that matches who you are looking for:

- **Residents** searches people with a resident record on an estate property. A resident must already have a linked account before a role will attach — if they do not, the result is tagged **No Account** and you can link one from the selected record.
- **Accounts** searches everyone who has a login, whether or not they live on the estate. This is how you reach staff such as a hired security officer or a treasurer after they have been approved.

Select someone, choose a role, and confirm. If they already hold a role you are asked to confirm the replacement instead.

### Accounts that are not yet approved

An account only holds permissions once it is approved, so the Accounts search will show you a pending, rejected, or suspended account but will not let you assign a role to it. Approve it under **System → Accounts → Pending Accounts** instead — that step chooses the role and grants access in one go.

### Removing a role

**Remove Current Role** takes the role away. What happens next depends on the person:

- Someone with a resident record drops back to the plain resident role. They lose every administrative permission and keep nothing but resident access.
- An account with no resident record has no role to fall back on, so it returns to **pending** and loses access entirely until it is approved again. You are warned before this happens.

Assigning roles is day-to-day account work rather than configuration, so it lives under **System → Accounts** rather than Settings. The **Super Administrator** always has access, and the permission can also be granted on its own to another role. The Super Administrator role cannot be removed through the app at all.

**Settings → Roles & Permissions → Assignment Rules** controls which resident types are eligible for each executive role. Set that before assigning, not after.

## Permission levels

- **View:** open a list or detail page.
- **Create:** add a new record or initiate a workflow.
- **Update:** change an existing record or approve a pending item.
- **Delete:** remove or deactivate a record where the workflow allows it.

:::warning[Least privilege]
Give a user the smallest role that lets them complete their job. Financial and security permissions should not be bundled into a general operations role without a business reason.
:::

## When access is denied

1. Confirm the user is signed in with the expected account.
2. Confirm the account has been approved. An unapproved account never reaches the dashboard — it is sent to the waiting-for-approval page instead. Check **System → Accounts → Pending Accounts**.
3. Confirm the correct role is assigned. Search for them under **System → Accounts → Role Assignments** — switch to **Accounts** if they are staff without a resident record.
4. Ask a super administrator to review the role's access under **Settings → Roles & Permissions → Role Definitions**, using the **Access** column to see exactly which modules and privileges it holds.
5. Retry after the role or permission change has propagated.
