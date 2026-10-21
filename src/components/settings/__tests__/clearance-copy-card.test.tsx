// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const { options } = vi.hoisted(() => ({ options: { value: { data: [] as unknown[], isLoading: false, error: null as Error | null } } }));
vi.mock('@/hooks/use-settings', () => ({ useClearanceCopyOptions: () => options.value }));

import { ClearanceCopyCard } from '@/components/settings/clearance-copy-card';

const officials = {
  id: 'g1',
  name: 'Estate officials',
  description: null,
  usedBy: ['Clearance certificate copies'],
  members: [
    { residentId: 'm1', name: 'A. Bello', inactive: false, warning: 'not opted in' },
    { residentId: 'm2', name: 'B. Okafor', inactive: false, warning: null },
    { residentId: 'm3', name: 'C. Eze', inactive: false, warning: 'no WhatsApp number' },
  ],
};

afterEach(() => cleanup());

function card(groupId: string, canEdit = true) {
  return render(<ClearanceCopyCard groupId={groupId} canEdit={canEdit} pending={false} onChange={vi.fn()} />);
}

describe('ClearanceCopyCard (#816 decisions 19, 23)', () => {
  it('lists the selected group\'s members and warns for the ones who cannot receive', () => {
    options.value = { data: [officials], isLoading: false, error: null };
    card('g1');

    expect(screen.getByText('Members of Estate officials')).toBeInTheDocument();
    expect(screen.getByText(/A\. Bello/)).toHaveTextContent('A. Bello: not opted in');
    expect(screen.getByText(/C\. Eze/)).toHaveTextContent('C. Eze: no WhatsApp number');
    expect(screen.getByText(/B\. Okafor/)).not.toHaveTextContent(':');
  });

  it('says no copies will be sent for an empty group, and shows no members for "no copies"', () => {
    options.value = { data: [{ ...officials, members: [] }], isLoading: false, error: null };
    card('g1');
    expect(screen.getByText(/This group has no members yet/)).toBeInTheDocument();

    cleanup();
    card('');
    expect(screen.queryByText(/Members of/)).not.toBeInTheDocument();
  });

  it('treats a group id that no longer exists as no copies', () => {
    options.value = { data: [officials], isLoading: false, error: null };
    card('deleted-group');
    expect(screen.queryByText(/Members of/)).not.toBeInTheDocument();
  });

  it('disables the choice without the permission, and says when the groups could not load', () => {
    options.value = { data: [officials], isLoading: false, error: null };
    card('g1', false);
    expect(screen.getByRole('combobox', { name: /Send copies to/ })).toBeDisabled();

    cleanup();
    options.value = { data: [], isLoading: false, error: new Error('Unauthorized') };
    card('g1');
    expect(screen.getByText(/Could not load the groups: Unauthorized/)).toBeInTheDocument();
  });
});
