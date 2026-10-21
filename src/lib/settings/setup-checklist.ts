/**
 * The first-time setup steps the Settings landing page shows (#786), each
 * linking to the page that completes it. Whether a step is done is read by
 * `getSetupStatus` in `@/actions/settings/get-setup-status`.
 */
export const SETUP_STEPS = [
  { id: 'estate', title: 'Add the estate name and address', href: '/settings/estate' },
  { id: 'street', title: 'Add a street', href: '/settings/property' },
  { id: 'houseType', title: 'Add a house type', href: '/settings/property' },
  { id: 'bankAccount', title: 'Add a bank account', href: '/settings/banking' },
  { id: 'billingProfile', title: 'Create a billing profile', href: '/settings/billing/profiles' },
  { id: 'billingSettings', title: 'Save the billing settings', href: '/settings/billing' },
  { id: 'notificationChannel', title: 'Turn on a notification channel', href: '/settings/sending' },
  { id: 'reminderSchedule', title: 'Turn on payment reminders', href: '/settings/reminders' },
  { id: 'customRole', title: 'Give someone a custom role', href: '/settings/access?tab=roles' },
] as const;

export type SetupStepId = (typeof SETUP_STEPS)[number]['id'];
export type SetupStatus = Record<SetupStepId, boolean>;

export function summarizeSetup(status: SetupStatus) {
  const steps = SETUP_STEPS.map((step) => ({ ...step, done: status[step.id] }));
  const done = steps.filter((step) => step.done).length;
  return { steps, done, total: steps.length, complete: done === steps.length };
}
