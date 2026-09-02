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
      items: ['finance/invoices-and-dues', 'finance/payments-and-imports', 'finance/expenditure-and-wallets', 'finance/reports-and-analytics'],
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
      items: ['integrations/whatsapp-operations'],
    },
    {
      type: 'category',
      label: 'Administration',
      items: ['administration/audit-logs-and-data-management', 'administration/troubleshooting'],
    },
  ],
};

export default sidebars;
