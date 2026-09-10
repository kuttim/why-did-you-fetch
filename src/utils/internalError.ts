const ISSUES_URL = 'https://github.com/kuttim/why-did-you-fetch/issues';

/**
 * Reports a bug in the library's own instrumentation (or in a user-supplied option callback,
 * like `ignore`/`normalizeUrl`/`normalizeBody`, throwing) — never in the app being instrumented.
 * Always goes straight to `console.error`, independent of `onIssue`, since it isn't a detected
 * *issue* to route wherever the caller sends those; it's a "this library broke" signal. Modeled
 * on why-did-you-render's own internal-error reporting: fail loud here, but never let it take the
 * real fetch/XHR call down with it — every call site wrapping this always still makes the real
 * call.
 */
export function reportInternalError(context: string, error: unknown): void {
  console.error(`why-did-you-fetch error in ${context}. Please file a bug at ${ISSUES_URL}.`, { error });
}
