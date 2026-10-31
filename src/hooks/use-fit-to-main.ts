'use client';

import * as React from 'react';

/**
 * Fits a sticky side menu to what is visible of <main>, the only scroller in the h-dvh shell (#1012).
 * A fixed height cannot fit both states: at the top of the page the menu starts below the title and its
 * foot falls off screen. So the height is set on every scroll and resize; the element's class height is
 * only the first-paint fallback. Shared by the Settings and Oversight menus (#1347).
 */
export function useFitToMain<T extends HTMLElement>(): React.RefObject<T | null> {
    const ref = React.useRef<T>(null);
    React.useLayoutEffect(() => {
        const element = ref.current;
        const main = element?.closest('main');
        if (!element || !main) return;
        const fit = () => {
            const visibleBottom = main.getBoundingClientRect().bottom - parseFloat(getComputedStyle(main).paddingBottom);
            // Also stop at the row's foot: past it, sticky pushes the menu up and each fit would grow it again.
            const rowBottom = element.parentElement?.getBoundingClientRect().bottom ?? visibleBottom;
            element.style.height = `${Math.max(240, Math.min(visibleBottom, rowBottom) - element.getBoundingClientRect().top)}px`;
        };
        fit();
        main.addEventListener('scroll', fit, { passive: true });
        window.addEventListener('resize', fit);
        return () => {
            main.removeEventListener('scroll', fit);
            window.removeEventListener('resize', fit);
        };
    }, []);
    return ref;
}
