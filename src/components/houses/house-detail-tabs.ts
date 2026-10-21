export const HOUSE_DETAIL_TABS = ['residents', 'billing', 'history'] as const;
export type HouseDetailTab = (typeof HOUSE_DETAIL_TABS)[number];

/** The tab to show for a `?tab=` value. Overview was merged into the header (#784), so it lands on Residents. */
export function resolveHouseTab(tabParam: string | null): HouseDetailTab {
  return HOUSE_DETAIL_TABS.includes(tabParam as HouseDetailTab) ? (tabParam as HouseDetailTab) : 'residents';
}
