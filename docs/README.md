# Residio Documentation

> Estate management web application for OPERA (Owners and Property-holders Residents Estate Association)

Residio automates resident access control by managing payment status, security contact lists, billing, and provides APIs for external systems (e.g., security barriers).

---

## Tech Stack

| Category | Technology |
|----------|------------|
| **Framework** | Next.js 16 (App Router) with TypeScript |
| **Database/Auth** | Supabase (PostgreSQL + Auth) |
| **UI** | Tailwind CSS v4 + shadcn/ui components |
| **State** | TanStack React Query for server state |
| **Forms** | React Hook Form + Zod validation |
| **Notifications** | Sonner for toasts |
| **Icons** | Lucide React |

---

## Quick Start

```bash
# Clone and install
git clone https://github.com/meggarmind/RESIDIO.git
cd residio
npm install

# Configure environment
cp .env.example .env
# Edit .env with your Supabase credentials

# Start development
npm run dev
```

See [Development Environment](setup/development-environment.md) for detailed setup instructions.

---

## Documentation Index

### Architecture
- [Database Schema](architecture/database-schema.md) - Core entities, relationships, triggers, and enums
- [Resident Types & Roles](architecture/resident-types-roles.md) - Resident classification, roles, and business logic

### Features
- [Analytics Dashboard](features/analytics.md) - Revenue trends, collection rates, and performance tracking
- [Document Management](features/document-management.md) - Categories, storage, and access control
- [Announcements System](features/announcements.md) - Community communication, scheduling, and read receipts
- [Admin Impersonation](features/admin-impersonation.md) - Secure resident portal preview for admins
- [Gmail Integration](features/gmail-integration.md) - Automated bank statement import and processing

### API
- [Supabase Integration](api/supabase-integration.md) - Data layer patterns, client configuration, MCP tools, form handling

### UI & UX
- [Card System](ui/card-system.md) - Standardized UI component variants
- [Theme Customization](ui/portal-theme-migration-guide.md) - Dual-theme system and visual options
- [Iconography](ui/icon-theming-guide.md) - Theme-aware icons and SVG usage

### Setup
- [Development Environment](setup/development-environment.md) - Prerequisites, commands, environment variables, project structure
- [Project Management](setup/project-management.md) - Git workflow, session commands, documentation updates

### Security
- [Access Control](security/access-control.md) - Authentication, RBAC, route protection, RLS, audit logging
- [RBAC Permissions Audit](security/rbac-permissions-audit.md) - Complete permission inventory, role-permission matrix

---

## Project Status

Current development phase and progress are tracked in [TODO.md](../TODO.md).

---

## Key Features

- **Resident Management** - Track residents, assign to properties, manage roles
- **House Management** - Property registry with ownership/occupancy history
- **Payment & Billing** - Invoice generation, wallet system, payment recording
- **Security Contacts** - Access codes, check-in/out logging, visitor management
- **Analytics Dashboard** - interactive charts for revenue and collection rates
- **Document Management** - Categorized cloud storage with access control
- **Community Communication** - Announcements, emergency broadcasts, and templates
- **Admin Impersonation** - View portal exactly as a resident does
- **Multi-Theme UI** - Support for "Modern" and "Default" visual themes
- **Gmail Integration** - Automated bank statement import from Gmail
- **Audit Logging** - Immutable activity trail for compliance
- **Role-Based Access** - Granular permissions with 7+ configurable roles

---

## Repository

- **GitHub**: https://github.com/meggarmind/RESIDIO
- **License**: Private
