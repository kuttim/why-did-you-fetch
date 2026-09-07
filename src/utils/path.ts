/**
 * Strips the query string and fragment from a URL, leaving the method-agnostic path (or, for an
 * absolute URL, everything before the query). Used by the rapid-calls detector to group requests
 * that hit the same endpoint with different query strings — e.g. `/search?q=a` and `/search?q=ab`.
 */
export function stripQueryAndHash(url: string): string {
  const withoutHash = url.split('#')[0]!;
  return withoutHash.split('?')[0]!;
}
