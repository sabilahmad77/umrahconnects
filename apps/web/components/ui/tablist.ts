'use client';

import type { KeyboardEvent, KeyboardEventHandler } from 'react';

/**
 * Arrow-key behaviour for the hand-rolled tab strips (`role="tablist"` with
 * `role="tab"` buttons). Spread it on the element that carries the tablist
 * role: Left/Right (and Up/Down for a vertical strip) move to the neighbouring
 * tab and activate it, Home/End jump to the ends. The tabs keep their place in
 * the normal tab order, so nothing that worked before changes — this only adds
 * the movement the ARIA tab pattern promises (WCAG 2.1.1).
 *
 * Activation follows focus, which is what every one of these strips already
 * does on click: the tab's own onClick switches the panel.
 */
export function tablistKeys(orientation: 'horizontal' | 'vertical' = 'horizontal'): {
  onKeyDown: KeyboardEventHandler<HTMLElement>;
} {
  const next = orientation === 'vertical' ? 'ArrowDown' : 'ArrowRight';
  const previous = orientation === 'vertical' ? 'ArrowUp' : 'ArrowLeft';
  return {
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (![next, previous, 'Home', 'End'].includes(event.key)) return;
      const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]')).filter(
        (tab) => !tab.hasAttribute('disabled') && tab.getAttribute('aria-disabled') !== 'true',
      );
      const current = tabs.indexOf(document.activeElement as HTMLElement);
      if (tabs.length < 2 || current < 0) return;
      event.preventDefault();
      const index =
        event.key === 'Home' ? 0
        : event.key === 'End' ? tabs.length - 1
        : event.key === next ? (current + 1) % tabs.length
        : (current - 1 + tabs.length) % tabs.length;
      tabs[index].focus();
      tabs[index].click();
    },
  };
}
