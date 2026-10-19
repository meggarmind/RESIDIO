import type { ReactNode } from 'react';

/** One line under a billing setting saying what a change reaches (#790). */
export function SettingEffect({ children }: { children: ReactNode }) {
  return (
    <p className="text-xs text-muted-foreground">
      <span className="font-medium text-foreground">Affects:</span> {children}
    </p>
  );
}
