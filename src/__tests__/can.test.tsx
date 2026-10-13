// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const auth = vi.hoisted(() => ({
  isLoading: false,
  permissions: [] as string[],
}));

vi.mock('@/lib/auth/auth-provider', () => ({
  useAuth: () => ({
    isLoading: auth.isLoading,
    hasPermission: (p: string) => auth.permissions.includes(p),
  }),
}));

import { Can, useCan } from '@/components/auth/can';

function Probe({ permission }: { permission: string }) {
  return <span>{useCan(permission) ? 'yes' : 'no'}</span>;
}

beforeEach(() => {
  auth.isLoading = false;
  auth.permissions = [];
});
afterEach(() => cleanup());

describe('Can', () => {
  it('renders children when the permission is held', () => {
    auth.permissions = ['payments.delete'];
    render(<Can permission="payments.delete"><button>Delete</button></Can>);
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  it('renders nothing when only a different permission is held', () => {
    auth.permissions = ['payments.view'];
    render(<Can permission="payments.delete"><button>Delete</button></Can>);
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });

  it('renders the fallback when denied', () => {
    render(
      <Can permission="payments.delete" fallback={<span>read only</span>}>
        <button>Delete</button>
      </Can>
    );
    expect(screen.getByText('read only')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders nothing while auth is loading, even for a permitted user', () => {
    auth.isLoading = true;
    auth.permissions = ['payments.delete'];
    const { container } = render(
      <Can permission="payments.delete"><button>Delete</button></Can>
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });
});

describe('useCan', () => {
  it('is true only when loaded and permitted', () => {
    auth.permissions = ['a.b'];
    const { rerender } = render(<Probe permission="a.b" />);
    expect(screen.getByText('yes')).toBeInTheDocument();

    auth.isLoading = true;
    rerender(<Probe permission="a.b" />);
    expect(screen.getByText('no')).toBeInTheDocument();

    auth.isLoading = false;
    rerender(<Probe permission="x.y" />);
    expect(screen.getByText('no')).toBeInTheDocument();
  });
});
