/**
 * Captures the current call stack and strips the frames that belong to why-did-you-fetch
 * itself, so the first line a developer sees is their own code, not our fetch/XHR wrapper.
 */
export function captureStack(): string {
  const err = new Error();
  const raw = err.stack ?? '';
  const lines = raw.split('\n');
  // Drop the "Error" header line and any frame that mentions our own internal modules.
  const filtered = lines
    .slice(1)
    .filter((line) => !/why-did-you-fetch|patchFetch|patchXHR|captureStack/.test(line));
  return filtered.join('\n').trim() || raw.trim();
}
