/**
 * Strips the query string and fragment from a URL, leaving the method-agnostic path (or, for an
 * absolute URL, everything before the query). Used by the rapid-calls detector to group requests
 * that hit the same endpoint with different query strings — e.g. `/search?q=a` and `/search?q=ab`.
 */
export function stripQueryAndHash(url: string): string {
  const withoutHash = url.split('#')[0]!;
  return withoutHash.split('?')[0]!;
}

/** A path segment that looks like a resource id rather than a fixed route part. */
const ID_SEGMENT = /^(?:\d+|[0-9a-f]{24}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/**
 * Replaces id-like path segments (numeric ids, UUIDs, Mongo-style ObjectIds) with `:id`, so
 * `/api/users/1` and `/api/users/42` collapse to the same template `/api/users/:id`. Used by the
 * n-plus-one detector to recognize "many rows each fetching their own record" as one shape.
 * Deliberately conservative — a slug like `/posts/hello-world` is left alone, since it isn't
 * reliably distinguishable from a meaningful fixed route segment.
 */
export function templatePath(path: string): string {
  return path
    .split('/')
    .map((segment) => (ID_SEGMENT.test(segment) ? ':id' : segment))
    .join('/');
}
