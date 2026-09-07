/**
 * Turns a previous response's Cache-Control header into an extra, actionable sentence for a
 * duplicate-recent report — e.g. "this could likely have been served from cache" versus "the
 * response said not to cache it, so dedupe the in-flight request instead." Returns null when
 * there's nothing worth adding (no header, or a directive we don't specifically call out).
 */
export function describeCacheFreshness(cacheControl: string | null, gapMs: number): string | null {
  if (!cacheControl) return null;

  if (/\b(no-store|no-cache)\b/i.test(cacheControl)) {
    return `The previous response was marked "${cacheControl}", so a cache wouldn't have helped here — consider deduplicating in-flight requests instead.`;
  }

  const match = cacheControl.match(/max-age=(\d+)/i);
  if (match) {
    const maxAgeMs = Number(match[1]) * 1000;
    if (gapMs < maxAgeMs) {
      return `The previous response was cacheable for ${Math.round(maxAgeMs / 1000)}s via Cache-Control — this one could likely have been served from cache.`;
    }
  }

  return null;
}
