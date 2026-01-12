# Admin Impersonation

Admin Impersonation allows estate administrators to view the Resident Portal exactly as a specific resident would. This is essential for troubleshooting issues, validating billing displays, and providing support.

## Security First Design

Impersonation is a highly privileged action and includes multiple security layers:

1. **Read-Only Mode**: While impersonating, the administrator is restricted to read-only access. Any attempts to modify data (create, update, delete) are blocked at the server level.
2. **Audit Trails**: Every impersonation session is logged in the `impersonation_sessions` table, recording who began the session, which resident was impersonated, and the duration.
3. **Active Indicators**: A prominent amber banner is displayed at the top of the screen during an impersonation session to prevent confusion.
4. **Session Timeouts**: Sessions automatically expire after a configurable period of inactivity.

## Approval Workflow

To prevent abuse, non-super admins require approval to impersonate residents:
- **Requesting**: An admin selects a resident and submits an impersonation request.
- **Approving**: A Super Admin or designated role (e.g., Chairman) receives a notification and can approve or deny the request.
- **Duration**: Approvals can be granted for a specific time window or a single session.

## Configuration

Settings for impersonation can be found in `/settings/system`:
- **Approval Mode**: `always_required`, `required_for_non_super_admins`, or `disabled`.
- **Default Timeout**: Duration for sessions before automatic logout.
- **Restricted Data**: Ability to hide highly sensitive fields (e.g., specific payment details) even during impersonation.
