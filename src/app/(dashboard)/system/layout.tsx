/**
 * System section layout.
 *
 * Unlike Settings, System has no in-page sidebar — its pages are things an
 * administrator watches rather than configures, and there is no landing page
 * to navigate between yet (see #177).
 */
export default function SystemLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6 p-4 md:p-10 pb-16 block">
      {children}
    </div>
  );
}
