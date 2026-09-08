// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import {
  AdminAccessCodeGenerationMenu,
  AdminAccessCodeTypeBadge,
} from '@/components/security/admin-access-code-generation';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>{children}</button>
  ),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('AdminAccessCodeGenerationMenu', () => {
  it('explains a one-day multi-use validity window before generation', () => {
    render(
      <AdminAccessCodeGenerationMenu
        defaultValidityDays={1}
        isPending={false}
        onGenerate={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: /Multi-use Code/i })).toBeTruthy();
    expect(screen.getByText('Valid for 1 day from generation')).toBeTruthy();
  });

  it('shows the server-compatible 30-day fallback when category validity is absent', () => {
    render(
      <AdminAccessCodeGenerationMenu
        defaultValidityDays={null}
        isPending={false}
        onGenerate={vi.fn()}
      />
    );

    expect(screen.getByText('Valid for 30 days from generation')).toBeTruthy();
  });

  it('sends the permanent contract value and uses the multi-use success toast', async () => {
    const onGenerate = vi.fn().mockResolvedValue(undefined);
    render(
      <AdminAccessCodeGenerationMenu
        defaultValidityDays={7}
        isPending={false}
        onGenerate={onGenerate}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Multi-use Code/i }));

    await waitFor(() => expect(onGenerate).toHaveBeenCalledWith('permanent'));
    expect(toast.success).toHaveBeenCalledWith('Multi-use code generated successfully');
  });

  it('sends the one-time contract value and uses the one-time success toast', async () => {
    const onGenerate = vi.fn().mockResolvedValue(undefined);
    render(
      <AdminAccessCodeGenerationMenu
        defaultValidityDays={7}
        isPending={false}
        onGenerate={onGenerate}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'One-Time Code' }));

    await waitFor(() => expect(onGenerate).toHaveBeenCalledWith('one_time'));
    expect(toast.success).toHaveBeenCalledWith('One-time code generated successfully');
  });

  it('shows an error and no success toast when generation fails', async () => {
    const onGenerate = vi.fn().mockRejectedValue(new Error('Generation unavailable'));
    render(
      <AdminAccessCodeGenerationMenu
        defaultValidityDays={7}
        isPending={false}
        onGenerate={onGenerate}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Multi-use Code/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Generation unavailable'));
    expect(toast.success).not.toHaveBeenCalled();
  });
});

describe('AdminAccessCodeTypeBadge', () => {
  it('labels stored permanent codes as multi-use while preserving one-time wording', () => {
    const { rerender } = render(<AdminAccessCodeTypeBadge type="permanent" />);
    expect(screen.getByText('Multi-use')).toBeTruthy();

    rerender(<AdminAccessCodeTypeBadge type="one_time" />);
    expect(screen.getByText('One-Time')).toBeTruthy();
  });
});

describe('admin access-code generator wiring', () => {
  it.each([
    'src/app/(dashboard)/security/contacts/[id]/page.tsx',
    'src/components/residents/resident-security-contacts.tsx',
  ])('%s passes category validity into the shared generator', (relativePath) => {
    const source = readFileSync(resolve(process.cwd(), relativePath), 'utf8');
    const generatorUsage = source.match(/<AdminAccessCodeGenerationMenu[\s\S]*?\/>/)?.[0];

    expect(generatorUsage).toBeDefined();
    expect(generatorUsage).toContain(
      'defaultValidityDays={contact.category?.default_validity_days}'
    );
  });
});
