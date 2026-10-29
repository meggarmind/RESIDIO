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
  - src/components/dashboard/header.tsx
  - src/app/(dashboard)/settings/roles/**
  - src/app/(dashboard)/settings/user-roles/**
  - src/app/(dashboard)/system/accounts/**
  - src/components/admin/role-assignment-section.tsx
  - src/components/admin/admin-role-actions.tsx
  - src/components/admin/role-title-picker.tsx
  - src/components/admin/role-titles-manager.tsx
  - src/components/admin/pending-accounts-list.tsx
residio_verified_commit: 95131b9a
residio_verified_at: '2026-10-29'
residio_app_version: '0.4.0'
---

# Roles and permissions

Residio uses granular role-based access control. A role determines which modules a person can see and which actions they can perform within those modules.

## Approving new accounts

Signing up does not grant access. Anyone can create an account — with Google, or with an email address and password — but a new account starts as **pending**. It can sign in and sees a holding page explaining that it is waiting for approval, and nothing else. A pending account holds no permissions in the database either, so it cannot reach estate data by any route.

Review sign-ups in **Settings → Roles & Access → Pending sign-ups**. The queue shows each person's name, email, whether that email is verified, how they signed up, and when they requested access. An account already linked to a resident record is tagged **Resident**.

- **Approve** opens a dialog. Approval and role assignment are one step. You cannot approve an account without a role. The dialog has these fields:
  - **Resident record (optional).** Search for the resident record of the person. The list shows only residents that have no account. If the account already has a resident record, the dialog tells you and does not show the search.
  - **Role.** The list shows only the roles that you can give. If you can give no role, the dialog shows "No roles you can give". If the roles do not load, the dialog shows the reason.
  - **Title.** This field shows when you choose a role. If the role has no titles, the dialog shows "No titles for this role".
- Residio checks all the data before it changes the account. It checks the resident record, the **Who can hold each role** rules and the title seats. If a check fails, the dialog shows the reason and the account does not change. A role that only a resident can hold needs a resident record. Choose the resident record in the same dialog.
- **Reject** needs a reason. The account gets no access. When the person signs in, they see that the request was declined and the reason that you gave. The audit log records the reason. You cannot approve a rejected sign-up later. The person must sign up again.

:::warning[Approve deliberately]
Approval is the gate. Everyone in this queue is asking for access to resident names, addresses, contact details, and financial records. Confirm who someone is before approving. If you cannot, reject rather than leave them waiting.
:::

## Two-factor sign-in

Two-factor authentication is optional: it applies only to accounts that have turned it on. For those accounts, entering the right password is not enough. After signing in, the person is taken to a verification page and sees nothing else until they enter a code from their chosen method (authenticator app, SMS or email). A backup code can be used instead if the device is unavailable; each backup code works once.

- **Turning it on.** Open **Settings → Two-factor login**, or choose **Two-factor login** in the profile menu (the round icon at the top right). Choose **Set up authenticator app**, scan the QR code shown with an authenticator app (or type the key shown under it, or use the link on a phone), and enter the 6-digit code the app shows. Ten backup codes are then shown once: save them before closing the dialog. **Copy codes** copies them, **Save as file** downloads them as a text file, and on a phone **Share** sends the file to an app you choose, such as WhatsApp, email or Files. **Email me** and **WhatsApp me** send the codes to your own email address or the WhatsApp number on your profile, for up to 15 minutes after they are made.
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
| Chairman | Chairman, Vice Chairman | Governance, approvals, reports, settings, projects, collections and role assignment | Dashboard, operations, reports, settings |
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

Type a display name, pick a category, then choose the access of the role in the same dialog. Residio makes the stored name of the role from the display name: it removes accents, changes spaces to underscores, and keeps only the letters a to z, the digits 0 to 9 and underscores. The dialog shows the stored name. If no letter or digit stays, the dialog tells you, and you cannot save. Names reserved for the built-in roles, or names that look like them, are refused. If a role with the same name exists, a message tells you.

Select **Resident only** if only an account linked to a resident can hold the role. You cannot change this setting on a built-in system role.

- **Start from** copies another role's access as a starting point. This is usually the quickest route — "the same as the Secretary, plus finance" is one selection and a few ticks.
- Tick a **module** to grant everything in it.
- Open a module to grant **individual privileges** within it, when a role should read a module but not change it.

Some privileges end in **(database)**, for example *Manage House Records (database)*. They control what the role can read and write directly in the database, underneath the screens. Ticking a whole module includes its database privileges; picking individual privileges does not, so a role that can open a page but lacks the matching database privilege may see the page refuse to save. **Start from** an existing role copies these along with everything else, which is the simplest way to get them right. **View All Document Categories** is the one that decides whether a role sees staff-only document categories; without it, the role sees only uncategorised documents and categories marked as visible to residents.

The footer counts what you have selected. A role created with nothing selected is created with no access at all and its holder will see an empty dashboard, so grant something before saving.

If the privileges cannot be saved, the role is not created either — you will not be left with a half-made role to clean up.

Only a Super Administrator can give a role a permission they do not hold themselves, or change a built-in system role. Nobody can change their own role or its permissions; ask another administrator.

To change a role later, use the **Access** column in the roles table. It shows how many modules and privileges the role holds and opens the same picker. Before you save, the dialog lists the privileges that you add and the privileges that you remove. Residio adds the new privileges first, then removes the old ones. If a step fails, the role does not lose more privileges than you removed, and the message tells you what was saved. A privilege that is no longer in use (inactive) stays on the role. The picker does not show it, and the count does not include it.

The **Edit** and **Delete** buttons, and the **Access** button, show only on a role that you can change. On other roles, the Access column shows the count as text.

The Super Administrator role is always active, and it always keeps **Manage Roles**, **Assign Roles** and **Assign Board Roles**. The **Active** switch is not available on that role.

You cannot delete a role while a person holds it, or holds a title under it. When you delete a role, its titles and its **Who can hold each role** rules are deleted with it.

:::warning[Changes apply at next sign-in]
Permission changes take effect when the affected user next signs in. Ask them to sign out and back in rather than waiting.
:::

## Assigning a role

**Settings → Roles & Access → Administrators** lists everyone who currently holds an admin role, and lets you search for the person whose role you want to change.

The search has two modes, chosen with the **Residents / Accounts** switch above the search box. They are two different populations, not one list with a filter, so pick the one that matches who you are looking for:

- **Residents** searches people with a resident record on an estate property. A resident must already have a linked account before a role will attach — if they do not, the result is tagged **No Account** and you can link one from the selected record.
- **Accounts** searches everyone who has a login, whether or not they live on the estate. This is how you reach staff such as a hired security officer or a treasurer after they have been approved.

Select someone, choose a role, then choose a **title** under that role and confirm. The role list shows only the roles that you can give. If you can give no role, the page shows "No roles you can give". If the roles do not load, the page shows the reason. An admin with the Assign Roles permission and without the Manage Roles permission, such as the Chairman, also sees the role list. If they already hold a role you are asked to confirm the replacement instead.

- **Title.** The Title field shows when you choose a role. If the role has no titles, the page shows "No titles for this role". The list shows only the titles that belong to the chosen role. A title whose seats are all taken is greyed out and names who holds it, for example "Vice Chairman — held by Jane Doe"; move that person to another title first. Choosing **No title** is allowed. Changing someone's role clears their old title, so pick the new one in the same step.
- **Residents only.** A role that can only be held by a resident, such as Chairman or Trustee, cannot be given to an account with no resident record. The page says so before you submit; link the account to a resident first.
- **Search by full name.** You can type a first name and a last name together, for example "John Smith".
- **Change role and Remove role.** Each row on the **Administrators** tab has both buttons, so you do not need to search for the person again. They appear only when you are allowed to change that account, and Remove role is never offered on a Super Administrator.
- **Titles.** On the **Roles** tab, the **Titles** card lists every title with its seats and current holders. It also shows the titles of inactive roles, marked **Inactive**. A holder of Manage Roles can add a title, rename it, change its seats, move it to a different role, or delete it. The rules for the role itself apply: only a Super Administrator can change the titles of a system role, or of the role that they hold. Seats must be a whole number from 1 to 99. Leave seats empty for no limit. You cannot set seats below the number of people who hold the title. A person whose account is not active still counts as a holder, and shows with the account status, for example "Jane Doe (suspended)". You cannot move or delete a title while a person holds it. You cannot move or delete the principal title of a role; rename it instead.

The signed-in person's title shows next to their role in the header and sidebar, in the Administrators list and in the Roles tab.

Who can change whom follows two permissions. **Assign Board Roles**, which only the Super Administrator holds, is needed to assign the Super Administrator, Chairman or Trustee role, and to change an account that holds the Super Administrator or Chairman role. **Assign Roles** covers every other role and every other account, a Trustee's included, so a Chairman can manage Trustee accounts but cannot appoint a Trustee. The same rules apply to approving, rejecting and removing roles, linking or unlinking an account and a resident, and resetting someone's two-factor authentication, and an Assignment Rule cannot allow a role you could not assign yourself.

### Accounts that are not yet approved

An account only holds permissions once it is approved. The search shows a pending, rejected or suspended account, but you cannot give it a role. This applies in both search modes. Approve a pending account under **Settings → Roles & Access → Pending sign-ups**. That step chooses the role and gives access in one step. You cannot give a role to a rejected or suspended account on this page.

### Removing a role

**Remove Current Role** takes the role away. What happens next depends on the person:

- Someone with a resident record is left with no role. They lose every administrative permission and keep nothing but resident access.
- An account with no resident record has no role to fall back on, so it returns to **pending** and loses access entirely until it is approved again. You are warned before this happens.

Assigning roles happens on the same Settings page where roles are defined, **Settings → Roles & Access**. The **Super Administrator** always has access, and the permission can also be granted on its own to another role. The Super Administrator role cannot be removed through the app at all.

**Settings → Roles & Access → Who can hold each role** controls which resident types can hold each executive role. The table shows only active roles. Residio applies these rules when you assign a role and when you approve a sign-up. If a rule does not allow the role, Residio does not save the change and shows the reason. Set the rules before you assign roles.

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
