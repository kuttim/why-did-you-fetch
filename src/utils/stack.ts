/**
 * Captures the current call stack cheaply and returns a thunk that formats it lazily. Reading
 * `Error#stack` is what actually costs anything (V8 formats it on first access) — capturing the
 * `Error` itself is cheap, so we do that eagerly (it must happen synchronously, at the real call
 * site) and defer the formatting/filtering until something actually needs the string, which for
 * most requests never happens.
 */
export function captureStack(): () => string {
  const err = new Error();
  let cached: string | null = null;

  return () => {
    if (cached !== null) return cached;
    const raw = err.stack ?? '';
    const lines = raw.split('\n');
    // Drop the "Error" header line and any frame that mentions our own internal modules.
    const filtered = lines.slice(1).filter((line) => !/why-did-you-fetch|patchFetch|patchXHR|captureStack/.test(line));
    cached = filtered.join('\n').trim() || raw.trim();
    return cached;
  };
}
