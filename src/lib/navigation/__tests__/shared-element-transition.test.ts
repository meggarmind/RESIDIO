// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const reduced = vi.hoisted(() => ({ value: false }));
vi.mock('@/lib/utils/accessibility', () => ({
  prefersReducedMotion: () => reduced.value,
}));

import {
  getLastSharedElementName,
  isModifiedClick,
  navigateWithSharedElement,
} from '../shared-element-transition';

type Doc = { startViewTransition?: unknown };

function mockStartViewTransition() {
  const state = { finish: () => {} };
  const fn = vi.fn((cb: () => Promise<void>) => {
    const finished = cb().then(() => new Promise<void>((r) => { state.finish = r; }));
    return { finished };
  });
  (document as unknown as Doc).startViewTransition = fn;
  return { fn, state };
}

describe('navigateWithSharedElement', () => {
  let el: HTMLElement;
  const push = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    el = document.createElement('div');
    document.body.appendChild(el);
    reduced.value = false;
    push.mockReset();
    window.history.pushState({}, '', '/residents');
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (document as unknown as Doc).startViewTransition;
    document.body.innerHTML = '';
    delete document.documentElement.dataset.sharedTransition;
  });

  it('falls back to plain push without API support', async () => {
    await navigateWithSharedElement({ push, href: '/residents/1', sourceEl: el, name: 'resident-1' });
    expect(push).toHaveBeenCalledExactlyOnceWith('/residents/1');
    expect(el.style.viewTransitionName).toBe('');
    expect(document.documentElement.dataset.sharedTransition).toBeUndefined();
  });

  it('falls back to plain push under reduced motion', async () => {
    const { fn } = mockStartViewTransition();
    reduced.value = true;
    await navigateWithSharedElement({ push, href: '/residents/1', sourceEl: el, name: 'resident-1' });
    expect(fn).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledExactlyOnceWith('/residents/1');
  });

  it('falls back to plain push on modifier-key clicks', async () => {
    const { fn } = mockStartViewTransition();
    await navigateWithSharedElement({
      push, href: '/residents/1', sourceEl: el, name: 'resident-1', event: { metaKey: true },
    });
    expect(fn).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledExactlyOnceWith('/residents/1');
    expect(isModifiedClick({ button: 1 })).toBe(true);
    expect(isModifiedClick({ button: 0 })).toBe(false);
  });

  it('names the source and sets the flag during the transition, then clears both', async () => {
    const { fn, state } = mockStartViewTransition();
    let nameDuringPush = '';
    let flagDuringPush: string | undefined;
    push.mockImplementation((href: string) => {
      nameDuringPush = el.style.viewTransitionName;
      flagDuringPush = document.documentElement.dataset.sharedTransition;
      // simulate the route change landing a few frames later
      setTimeout(() => window.history.pushState({}, '', href), 40);
    });

    const done = navigateWithSharedElement({ push, href: '/residents/1', sourceEl: el, name: 'resident-1' });
    expect(fn).toHaveBeenCalledOnce();
    expect(push).toHaveBeenCalledExactlyOnceWith('/residents/1');
    expect(nameDuringPush).toBe('resident-1');
    expect(flagDuringPush).toBe('true');
    expect(getLastSharedElementName()).toBe('resident-1');

    await vi.advanceTimersByTimeAsync(16);
    expect(window.location.pathname).toBe('/residents');
    expect(el.style.viewTransitionName).toBe('resident-1');

    await vi.advanceTimersByTimeAsync(100); // pathname now matches, callback resolves
    expect(window.location.pathname).toBe('/residents/1');
    expect(el.style.viewTransitionName).toBe('resident-1'); // still animating
    state.finish();
    await done;

    expect(el.style.viewTransitionName).toBe('');
    expect(document.documentElement.dataset.sharedTransition).toBeUndefined();
    expect(getLastSharedElementName()).toBeNull();
  });

  it('does not settle until location.pathname matches the target', async () => {
    // `finished` resolves as soon as the update callback resolves.
    (document as unknown as Doc).startViewTransition = (cb: () => Promise<void>) => ({ finished: cb() });
    let settled = false;
    const done = navigateWithSharedElement({ push, href: '/residents/1', sourceEl: el, name: 'resident-1' })
      .then(() => { settled = true; });

    await vi.advanceTimersByTimeAsync(1000); // well under the 1500ms safety timeout
    expect(settled).toBe(false);
    expect(el.style.viewTransitionName).toBe('resident-1');

    window.history.pushState({}, '', '/residents/1');
    await vi.advanceTimersByTimeAsync(50);
    await done;
    expect(settled).toBe(true);
  });

  it('leaves no shared-target marker or stray name behind after finishing', async () => {
    const { state } = mockStartViewTransition();
    const row = document.createElement('tr');
    row.dataset.sharedTarget = 'true';
    row.style.viewTransitionName = 'resident-1';
    document.body.appendChild(row);

    const done = navigateWithSharedElement({ push, href: '/residents/1', sourceEl: el, name: 'resident-1' });
    window.history.pushState({}, '', '/residents/1');
    await vi.advanceTimersByTimeAsync(50);
    state.finish();
    await done;

    expect(document.querySelectorAll('[data-shared-target]')).toHaveLength(0);
    expect(row.style.viewTransitionName).toBe('');
    expect(el.style.viewTransitionName).toBe('');
  });

  it('still navigates when startViewTransition throws synchronously', async () => {
    (document as unknown as Doc).startViewTransition = () => {
      throw new Error('InvalidStateError');
    };
    await navigateWithSharedElement({ push, href: '/residents/1', sourceEl: el, name: 'resident-1' });
    expect(push).toHaveBeenCalledExactlyOnceWith('/residents/1');
    expect(el.style.viewTransitionName).toBe('');
    expect(document.documentElement.dataset.sharedTransition).toBeUndefined();
  });

  it('does not push twice when the transition rejects after running the callback', async () => {
    (document as unknown as Doc).startViewTransition = (cb: () => Promise<void>) => ({
      finished: cb().then(() => { throw new Error('skipped'); }),
    });
    const done = navigateWithSharedElement({ push, href: '/residents/1', sourceEl: el, name: 'resident-1' });
    window.history.pushState({}, '', '/residents/1');
    await vi.advanceTimersByTimeAsync(50);
    await done;
    expect(push).toHaveBeenCalledTimes(1);
  });

  it('gives up waiting for the pathname after the timeout and still cleans up', async () => {
    const { state } = mockStartViewTransition();
    const done = navigateWithSharedElement({ push, href: '/residents/1', sourceEl: el, name: 'resident-1' });
    await vi.advanceTimersByTimeAsync(2000); // pathname never changes
    state.finish();
    await done;
    expect(el.style.viewTransitionName).toBe('');
    expect(document.documentElement.dataset.sharedTransition).toBeUndefined();
  });
});
