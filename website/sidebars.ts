import {readdirSync} from 'node:fs';
import path from 'node:path';
import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

/**
 * Creating a sidebar enables you to:
 - create an ordered group of docs
 - render a sidebar for each doc of that group
 - provide next/previous navigation

 The sidebars can be generated from the filesystem, or explicitly defined here.

 Create as many sidebars as you want.
 */
// Release notes pages (docs/agents/release-notes.md), newest first. Read from the folder, so the
// release workflow adds a page without editing this file.
const releaseNotes = readdirSync(path.join(__dirname, 'docs', 'release-notes'))
  .map((file) => /^v(\d+)-(\d+)-(\d+)\.md$/.exec(file))
  .filter((match): match is RegExpExecArray => match !== null)
  .sort((a, b) => Number(b[1]) - Number(a[1]) || Number(b[2]) - Number(a[2]) || Number(b[3]) - Number(a[3]))
  .map((match) => `release-notes/v${match[1]}-${match[2]}-${match[3]}`);

const sidebars: SidebarsConfig = {
  adminGuideSidebar: [
    {
      type: 'category',
      label: 'Getting started',
      items: ['getting-started/dashboard-overview', 'getting-started/navigation-and-search', 'getting-started/roles-and-permissions'],
    },
    {
      type: 'category',
      label: 'Residents',
      items: ['residents/resident-directory', 'residents/add-and-assign-resident', 'residents/resident-details'],
    },
    {
      type: 'category',
      label: 'Properties',
      items: ['properties/houses-and-occupancy', 'properties/streets-and-house-types'],
    },
    {
      type: 'category',
      label: 'Finance',
      items: ['finance/invoices-and-dues', 'finance/payments-and-imports', 'finance/collections', 'finance/expenditure-and-wallets', 'finance/reports-and-analytics'],
    },
    {
      type: 'category',
      label: 'Security',
      items: ['security/security-contacts', 'security/access-and-gate-operations'],
    },
    {
      type: 'category',
      label: 'Operations',
      items: ['operations/approvals-and-announcements', 'operations/documents-and-personnel'],
    },
    {
      type: 'category',
      label: 'Settings',
      items: ['settings/settings-overview', 'settings/billing-and-notifications', 'settings/access-and-system-health'],
    },
    {
      type: 'category',
      label: 'Integrations',
      items: ['integrations/integrations-overview', 'integrations/whatsapp-operations', 'integrations/email-and-sms', 'integrations/bank-feeds-and-email-import', 'integrations/payment-gateway', 'integrations/scheduled-jobs'],
    },
    {
      type: 'category',
      label: 'Administration',
      items: ['administration/audit-logs-and-data-management', 'administration/troubleshooting'],
    },
    {
      type: 'category',
      label: 'Release notes',
      link: {type: 'doc', id: 'release-notes/index'},
      items: releaseNotes,
    },
  ],
};

export default sidebars;
