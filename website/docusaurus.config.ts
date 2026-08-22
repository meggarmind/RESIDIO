import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

const config: Config = {
  title: 'Residio Admin Guide',
  tagline: 'The practical field guide for running your estate.',
  favicon: 'img/favicon.svg',

  // Future flags, see https://docusaurus.io/docs/api/docusaurus-config#future
  future: {
    v4: true, // Improve compatibility with the upcoming Docusaurus v4
  },

  // Set the production url of your site here
  url: process.env.DOCS_URL ?? 'http://localhost:3000',
  // Set the /<baseUrl>/ pathname under which your site is served
  // For GitHub pages deployment, it is often '/<projectName>/'
  baseUrl: process.env.DOCS_BASE_URL ?? '/',
  trailingSlash: false,

  // GitHub pages deployment config.
  // If you aren't using GitHub pages, you don't need these.
  organizationName: 'meggarmind',
  projectName: 'RESIDIO',

  onBrokenLinks: 'throw',

  // Even if you don't use internationalization, you can use this field to set
  // useful metadata like html lang. For example, if your site is Chinese, you
  // may want to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          editUrl: 'https://github.com/meggarmind/RESIDIO/edit/master/website/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    // Replace with your project's social card
    image: 'img/social-card.svg',
    colorMode: {
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'Residio Admin Guide',
      logo: {
        alt: 'Residio Admin Guide logo',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'adminGuideSidebar',
          position: 'left',
          label: 'Admin guide',
        },
        {
          to: '/docs/getting-started/dashboard-overview',
          label: 'Quick start',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            {
              label: 'Start here',
              to: '/docs/getting-started/dashboard-overview',
            },
          ],
        },
        {
          title: 'Admin workflows',
          items: [
            {
              label: 'Finance',
              to: '/docs/finance/invoices-and-dues',
            },
            {
              label: 'Operations',
              to: '/docs/operations/approvals-and-announcements',
            },
            {
              label: 'Settings',
              to: '/docs/settings/settings-overview',
            },
          ],
        },
        {
          title: 'Product',
          items: [
            {
              label: 'Residio repository',
              href: 'https://github.com/meggarmind/RESIDIO',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Residio. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
