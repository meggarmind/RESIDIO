// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const { step } = vi.hoisted(() => ({ step: {
  id: 'step-1',
  daysFromDue: -7,
  escalationLevel: 'friendly' as const,
  channels: ['email' as const],
  isActive: true,
  priority: 5,
} }));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/actions/notifications/reminder-config', () => ({
  getReminderSettings: vi.fn().mockResolvedValue({
    schedule: { id: 'default', name: 'Std', isDefault: true, isActive: true, steps: [step] },
  }),
  addReminderStep: vi.fn(),
  updateReminderStep: vi.fn(),
  removeReminderStep: vi.fn(),
  toggleReminderStep: vi.fn(),
  resetToDefaultSchedule: vi.fn(),
}));

import ReminderSchedulePage from '@/app/(dashboard)/settings/notifications/reminders/schedule/page';

afterEach(cleanup);

describe('reminder schedule page while SMS is off', () => {
  it('offers no SMS toggle in the add-step dialog', async () => {
    render(<ReminderSchedulePage />);
    fireEvent.click(await screen.findByRole('button', { name: /add step/i }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Email' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'SMS' })).not.toBeInTheDocument();
  });

  it('offers no SMS toggle in the edit-step dialog', async () => {
    render(<ReminderSchedulePage />);
    await screen.findByText('7 days before');
    const rowButtons = within(screen.getByRole('row', { name: /7 days before/i })).getAllByRole(
      'button'
    );
    fireEvent.click(rowButtons[0]);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Email' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'SMS' })).not.toBeInTheDocument();
  });
});
