// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const auth = vi.hoisted(() => ({ user: null as { id: string } | null }));

vi.mock('@/lib/auth/auth-provider', () => ({
  useAuth: () => ({ user: auth.user }),
}));

vi.mock('@/hooks/use-ai-assistant', () => ({
  useAiAssistant: () => ({
    isOpen: false,
    toggleOpen: vi.fn(),
    closeAssistant: vi.fn(),
    isDismissed: false,
    disabledByAdmin: false,
    isSettingsLoading: false,
    dismissAssistant: vi.fn(),
    messages: [],
    sendMessage: vi.fn(),
    isTyping: false,
    assistantName: 'Estate Assistant',
  }),
}));

import { EstateAiAssistant } from '@/components/layout/estate-ai-assistant';

beforeEach(() => {
  auth.user = null;
});
afterEach(() => cleanup());

describe('EstateAiAssistant visibility (#772)', () => {
  it('renders nothing when no user is signed in, as on the login screen', () => {
    render(<EstateAiAssistant />);
    expect(screen.queryByText('Estate Assistant')).not.toBeInTheDocument();
  });

  it('renders the assistant pill for a signed-in user', () => {
    auth.user = { id: 'user-1' };
    render(<EstateAiAssistant />);
    expect(screen.getByText('Estate Assistant')).toBeInTheDocument();
  });
});
