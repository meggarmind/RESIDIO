/** The part of `URLSearchParams` / `ReadonlyURLSearchParams` the active-state check reads. */
export interface SearchParamsReader {
  get(name: string): string | null;
}

/**
 * Whether a menu child is the current page. A plain href matches on the path alone (or any page under it
 * when `prefix` is set). An href with a query string, like `/reports?tab=recent`, matches only when the
 * path is the same and every query value in the href is also in the address bar (#1373), so three
 * children of one page do not all light up.
 */
export function isNavHrefActive(
  pathname: string,
  searchParams: SearchParamsReader | null | undefined,
  href: string,
  options: { prefix?: boolean } = {}
): boolean {
  const queryAt = href.indexOf('?');
  if (queryAt === -1) {
    return pathname === href || (options.prefix === true && pathname.startsWith(`${href}/`));
  }
  if (pathname !== href.slice(0, queryAt)) return false;
  const wanted = new URLSearchParams(href.slice(queryAt + 1));
  for (const [key, value] of wanted) {
    if (searchParams?.get(key) !== value) return false;
  }
  return true;
}
