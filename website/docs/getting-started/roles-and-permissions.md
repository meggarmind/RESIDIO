---
id: roles-and-permissions
title: Roles and permissions
sidebar_label: Roles and permissions
residio_sources:
  - src/lib/auth/**
  - src/actions/roles/**
  - src/app/(dashboard)/settings/access/**
  - src/app/(dashboard)/settings/two-factor/**
  - src/actions/two-factor/**
  - src/app/(dashboard)/settings/roles/**
  - src/app/(dashboard)/settings/user-roles/**
  - src/app/(dashboard)/system/accounts/**
  - src/components/admin/role-assignment-section.tsx
  - src/components/admin/admin-role-actions.tsx
  - src/components/admin/role-title-picker.tsx
  - src/components/admin/role-titles-manager.tsx
  - src/components/admin/pending-accounts-list.tsx
residio_verified_commit: 438c01df
residio_verified_at: '2026-10-22'
residio_app_version: '0.4.0'
---

# Roles and permissions

Residio uses granular role-based access control. A role determines which modules a person can see and which actions they can perform within those modules.

## Approving new accounts

Signing up does not grant access. Anyone can create an account — with Google, or with an email address and password — but a new account starts as **pending**. It can sign in and sees a holding page explaining that it is waiting for approval, and nothing else. A pending account holds no permissions in the database either, so it cannot reach estate data by any route.

Review sign-ups in **Settings → Roles & Access → Pending sign-ups**. The queue shows each person's name, email, whether that email is verified, how they signed up, and when they requested access. An account already linked to a resident record is tagged **Resident**.

- **Approve** opens a dialog where you choose the role the account will hold. Approval and role assignment are a single step; there is no approve-without-a-role.
- **Reject** requires a reason. The account is marked rejected, the person is signed out, and they are told the account was not approved and to contact the estate office. The reason you give is recorded in the audit log.

:::warning[Approve deliberately]
Approval is the gate. Everyone in this queue is asking for access to resident names, addresses, contact details, and financial records. Confirm who someone is before approving. If you cannot, reject rather than leave them waiting.
:::

## Two-factor sign-in

Two-factor authentication is optional: it applies only to accounts that have turned it on. For those accounts, entering the right password is not enough. After signing in, the person is taken to a verification page and sees nothing else until they enter a code from their chosen method (authenticator app, SMS or email). A backup code can be used instead if the device is unavailable; each backup code works once.

- **Turning it on.** In **Settings → Two-factor login**, choose **Set up authenticator app**, add the key shown to an authenticator app (or use the link on a phone), and enter the 6-digit code the app shows. Ten backup codes are then shown once: save them before closing the dialog.
- **Backup codes and turning it off.** On the same page, **Make new backup codes** replaces the old ones and **Turn off** removes two-factor and its backup codes. Both ask for a new code from the app.
- Each authenticator code works once. A code already used, for signing in or on this page, is refused; wait for the next one.
- The verification lasts for that sign-in. Signing in again, or waiting 24 hours, asks for a code again.
- Until the code is entered, the account has no admin access in the database either, not only in the app.
- After five wrong codes in 15 minutes code entry is locked for the rest of those 15 minutes. Making new backup codes and turning two-factor off have their own limit of five tries.
- Accounts without two-factor turned on sign in exactly as before. Setting it up needs the `two_factor.enable` permission; turning it off needs `two_factor.disable`.

## Roles

| Role | Titles | Typical responsibility | Primary guide sections |
| --- | --- | --- | --- |
| Super Administrator | — | Full estate configuration and oversight. An operator role, not tied to a resident | All sections |
| Chairman | Chairman, Vice Chairman | Governance, approvals, reports, settings, projects and role assignment | Dashboard, operations, reports, settings |
| Financial Officer | Treasurer, Financial Secretary | Payments, billing, imports, expenditure, and finance reports | Finance |
| Secretary | Secretary, Assistant Secretary | Documents, communications, and resident records | Residents, operations |
| Security Officer | Chief Security Officer, Assistant Chief Security Officer | Security contacts, access records, and gate operations | Security |
| Welfare Officer | Welfare Officer | Announcements, notes and notifications; reads residents, houses and documents | Operations |
| Trustee | Trustee (any number) | Oversight: reads every module except Settings and exports reports. Changes nothing except their own two-factor setting | Dashboard, reports |
| Security Guard Supervisor | Security Guard Supervisor | Gate work: views, creates and updates security contacts, creates and verifies access codes, records check-ins. No security settings and no deletes | Security |

A **title** is the post a person holds within a role. A backup officer, such as the Vice Chairman or the Financial Secretary, holds the same role as the principal and has exactly the same permissions; the title is what tells them apart. Each title has one seat, except Trustee, which has no limit.

Every role except Super Administrator and Security Guard Supervisor can only be held by an account linked to a resident record. If that resident moves out or is deactivated, the role is removed automatically.

A role with only view access, such as Trustee, sees no create, edit, delete, approve or settings buttons on the admin pages: each control appears only when the role holds the matching write permission.

A plain resident holds no role at all. They have no admin dashboard and reach the resident portal through their resident record.

:::info[Resident portal links]
Whether an admin sees *My Portal*, *Resident Portal* and *View as Resident* depends on the estate-wide **Resident portal** switch (Settings → Estate & Property → Estate Profile) and a per-account override (Settings → Roles & Access: Inherit, Enabled or Disabled). The links are hidden by default. An account with no linked resident never sees *My Portal* or *Resident Portal*, whatever its role, including the Super Administrator. Hiding the links does not block the `/portal` address.
:::

:::info[What the Chairman cannot do]
The Chairman has every operational module, the **Settings** section, projects and role assignment. It does not have the rest of **System** — defining roles, maintenance mode, data retention, system health — and it cannot view the portal as a resident (impersonation). Approving impersonation requests and changing impersonation settings belong to the Super Administrator alone, so no officer can approve their own request. Assigning the Super Administrator, Chairman or Trustee role needs the **Assign Board Roles** permission, which only the Super Administrator holds.
:::

Your deployment may contain additional custom roles, created under **Roles**. A custom role behaves exactly like a built-in one: its holder signs in to the admin dashboard and sees the modules it was granted. Ask a super administrator to confirm the exact permission set before assigning responsibility.

## Creating a role

**Settings → Roles & Access → Roles → Add Role**. The Roles tab needs the Manage roles permission; an admin who can only assign roles does not see it.

Name the role, give it a display name, pick its category, then choose its access in the same dialog. Names reserved for the built-in roles, or that only look like them, are refused.

- **Start from** copies another role's access as a starting point. This is usually the quickest route — "the same as the Secretary, plus finance" is one selection and a few ticks.
- Tick a **module** to grant everything in it.
- Open a module to grant **individual privileges** within it, when a role should read a module but not change it.

Some privileges end in **(database)**, for example *Manage House Records (database)*. They control what the role can read and write directly in the database, underneath the screens. Ticking a whole module includes its database privileges; picking individual privileges does not, so a role that can open a page but lacks the matching database privilege may see the page refuse to save. **Start from** an existing role copies these along with everything else, which is the simplest way to get them right. **View All Document Categories** is the one that decides whether a role sees staff-only document categories; without it, the role sees only uncategorised documents and categories marked as visible to residents.

The footer counts what you have selected. A role created with nothing selected is created with no access at all and its holder will see an empty dashboard, so grant something before saving.

If the privileges cannot be saved, the role is not created either — you will not be left with a half-made role to clean up.

Only a Super Administrator can give a role a permission they do not hold themselves, or change a built-in system role. Nobody can change their own role or its permissions; ask another administrator.

To change a role later, use the **Access** column in the roles table. It shows how many modules and privileges the role holds and opens the same picker.

:::warning[Changes apply at next sign-in]
Permission changes take effect when the affected user next signs in. Ask them to sign out and back in rather than waiting.
:::

## Assigning a role

**Settings → Roles & Access → Administrators** lists everyone who currently holds an admin role, and lets you search for the person whose role you want to change.

The search has two modes, chosen with the **Residents / Accounts** switch above the search box. They are two different populations, not one list with a filter, so pick the one that matches who you are looking for:

- **Residents** searches people with a resident record on an estate property. A resident must already have a linked account before a role will attach — if they do not, the result is tagged **No Account** and you can link one from the selected record.
- **Accounts** searches everyone who has a login, whether or not they live on the estate. This is how you reach staff such as a hired security officer or a treasurer after they have been approved.

Select someone, choose a role, then choose a **title** under that role and confirm. If they already hold a role you are asked to confirm the replacement instead.

- **Title.** The list shows only the titles that belong to the chosen role. A title whose seats are all taken is greyed out and names who holds it, for example "Vice Chairman — held by Jane Doe"; move that person to another title first. Choosing **No title** is allowed. Changing someone's role clears their old title, so pick the new one in the same step.
- **Residents only.** A role that can only be held by a resident, such as Chairman or Trustee, cannot be given to an account with no resident record. The page says so before you submit; link the account to a resident first.
- **Change role and Remove role.** Each row on the **Administrators** tab has both buttons, so you do not need to search for the person again. They appear only when you are allowed to change that account, and Remove role is never offered on a Super Administrator.
- **Titles.** On the **Roles** tab, the **Titles** card lists every title with its seats and current holders. A holder of Manage Roles can add a title, rename one, or change its seats; seats cannot be set below the number of people who hold the title. Leave seats empty for no limit.

The signed-in person's title shows next to their role in the header and sidebar, in the Administrators list and in the Roles tab.

Who can change whom follows two permissions. **Assign Board Roles**, which only the Super Administrator holds, is needed to assign the Super Administrator, Chairman or Trustee role, and to change an account that holds the Super Administrator or Chairman role. **Assign Roles** covers every other role and every other account, a Trustee's included, so a Chairman can manage Trustee accounts but cannot appoint a Trustee. The same rules apply to approving, rejecting and removing roles, linking or unlinking an account and a resident, and resetting someone's two-factor authentication, and an Assignment Rule cannot allow a role you could not assign yourself.

### Accounts that are not yet approved

An account only holds permissions once it is approved, so the Accounts search will show you a pending, rejected, or suspended account but will not let you assign a role to it. Approve it under **Settings → Roles & Access → Pending sign-ups** instead — that step chooses the role and grants access in one go.

### Removing a role

**Remove Current Role** takes the role away. What happens next depends on the person:

- Someone with a resident record is left with no role. They lose every administrative permission and keep nothing but resident access.
- An account with no resident record has no role to fall back on, so it returns to **pending** and loses access entirely until it is approved again. You are warned before this happens.

Assigning roles happens on the same Settings page where roles are defined, **Settings → Roles & Access**. The **Super Administrator** always has access, and the permission can also be granted on its own to another role. The Super Administrator role cannot be removed through the app at all.

**Settings → Roles & Access → Who can hold each role** controls which resident types are eligible for each executive role. Set that before assigning, not after.

### The estate always keeps one Super Administrator

At least one active account must hold **Super Administrator** at all times. If only one account holds it, Residio refuses to:

- move that account to a different role,
- reject that account, or
- delete the Super Administrator role itself.

You will see *"This is the last active Super Administrator. Grant the Super Administrator role to another active account first."*

Handing the job over is fine — grant Super Administrator to the incoming person, then change the outgoing person's role. It is only leaving the estate with nobody that is refused.

:::warning[This one is not just a screen message]
The rule is enforced in the database, not only in the app, so it also holds for anything that changes accounts outside the dashboard. There is no override, and no support path that bypasses it: the only way through is to give someone else the role first.
:::

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
2. Confirm the account has been approved. An unapproved account never reaches the dashboard — it is sent to the waiting-for-approval page instead. Check **Settings → Roles & Access → Pending sign-ups**.
3. Confirm the correct role is assigned. Search for them under **Settings → Roles & Access → Administrators** — switch to **Accounts** if they are staff without a resident record.
4. Ask a super administrator to review the role's access under **Settings → Roles & Access → Roles**, using the **Access** column to see exactly which modules and privileges it holds.
5. Retry after the role or permission change has propagated.
