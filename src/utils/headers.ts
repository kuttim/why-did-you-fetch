/** Any shape fetch's `init.headers` or a `Request`'s `.headers` can take. */
export type HeadersLike = Headers | Record<string, string> | Array<[string, string]>;

/** Normalizes any of the shapes above into a plain, lower-cased-key record. */
export function headersToRecord(headers: HeadersLike | null | undefined): Record<string, string> {
  const record: Record<string, string> = {};
  if (!headers) return record;

  if (typeof Headers !== 'undefined' && headers instanceof Headers) {
    headers.forEach((value, key) => {
      record[key.toLowerCase()] = value;
    });
    return record;
  }

  if (Array.isArray(headers)) {
    for (const [key, value] of headers) record[key.toLowerCase()] = value;
    return record;
  }

  const plain = headers as Record<string, string>;
  for (const key of Object.keys(plain)) record[key.toLowerCase()] = plain[key]!;
  return record;
}
