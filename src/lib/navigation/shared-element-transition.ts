import { prefersReducedMotion } from '@/lib/utils/accessibility';

/**
 * Shared-element (spatial) navigation using the native View Transitions API.
 *
 * The browser morphs the element carrying a given `view-transition-name` on
 * the outgoing page into the element carrying the same name on the incoming
 * page. Names must be unique per page, so the source is only named for the
 * duration of the transition -- never statically.
 *
 * Progressive enhancement: with no API support, reduced motion, or a modified
 * click, this is exactly `push(href)`.
 *
 * Known limitation: the browser back button does not go through this helper,
 * so it gets the generic page transition only. Not engineered around.
 */

export const SHARED_TRANSITION_ATTR = 'sharedTransition';
const TIMEOUT_MS = 1500;

/** Name used by the most recent shared-element navigation (module state). */
let lastSharedElementName: string | null = null;

export function getLastSharedElementName(): string | null {
  return lastSharedElementName;
}

export function isSharedTransitionActive(): boolean {
  return typeof document !== 'undefined' &&
    document.documentElement.dataset[SHARED_TRANSITION_ATTR] === 'true';
}

interface ClickLike {
  button?: number;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}

/** True for anything other than a plain, unmodified left click. */
export function isModifiedClick(event?: ClickLike | null): boolean {
  if (!event) return false;
  return (
    (event.button !== undefined && event.button !== 0) ||
    !!(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
  );
}

interface Options {
  push: (href: string) => void;
  href: string;
  sourceEl: HTMLElement | null | undefined;
  name: string;
  event?: ClickLike | null;
}

type StartViewTransition = (cb: () => Promise<void>) => { finished: Promise<unknown> };

function waitForPath(href: string): Promise<void> {
  const target = new URL(href, window.location.origin).pathname;
  return new Promise((resolve) => {
    const started = Date.now();
    const check = () => {
      if (window.location.pathname === target || Date.now() - started > TIMEOUT_MS) {
        resolve();
        return;
      }
      requestAnimationFrame(check);
    };
    check();
  });
}

export async function navigateWithSharedElement({
  push,
  href,
  sourceEl,
  name,
  event,
}: Options): Promise<void> {
  const start = typeof document !== 'undefined'
    ? (document as unknown as { startViewTransition?: StartViewTransition }).startViewTransition
    : undefined;

  if (!start || !sourceEl || isModifiedClick(event) || prefersReducedMotion()) {
    push(href);
    return;
  }

  const root = document.documentElement;
  lastSharedElementName = name;
  sourceEl.style.viewTransitionName = name;
  root.dataset[SHARED_TRANSITION_ATTR] = 'true';

  try {
    const transition = start.call(document, () => {
      push(href);
      return waitForPath(href);
    });
    await transition.finished;
  } catch {
    // An aborted/skipped transition still leaves navigation intact.
  } finally {
    sourceEl.style.viewTransitionName = '';
    document
      .querySelectorAll<HTMLElement>('[data-shared-target]')
      .forEach((el) => {
        el.style.viewTransitionName = '';
        delete el.dataset.sharedTarget;
      });
    delete root.dataset[SHARED_TRANSITION_ATTR];
    lastSharedElementName = null;
  }
}
