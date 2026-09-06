import { consoleReporter } from './reporter/console.js';
import { patchFetch } from './patchFetch.js';
import { patchXHR } from './patchXHR.js';
import { RequestTracker } from './tracker.js';
import type { Issue, ResolvedWdyfOptions, WdyfOptions } from './types.js';

export type {
  DuplicateInflightIssue,
  DuplicateRecentIssue,
  Issue,
  IgnoreMatcher,
  RequestKind,
  RequestStatus,
  SequentialChainIssue,
  TrackedRequest,
  WdyfOptions,
} from './types.js';

function defaultEnabled(): boolean {
  try {
    // Guarded so this never throws in environments without `process` (browsers without a bundler define).
    return typeof process === 'undefined' || process.env?.NODE_ENV !== 'production';
  } catch {
    return true;
  }
}

function resolveOptions(options: WdyfOptions): ResolvedWdyfOptions {
  return {
    enabled: options.enabled ?? defaultEnabled(),
    patch: options.patch ?? ['fetch', 'xhr'],
    dedupeWindowMs: options.dedupeWindowMs ?? 2000,
    chainGapMs: options.chainGapMs ?? 10,
    chainMinLength: options.chainMinLength ?? 3,
    ignore: options.ignore ?? [],
    normalizeUrl: options.normalizeUrl ?? ((url: string) => url),
    onIssue: options.onIssue ?? consoleReporter,
    retainMs: options.retainMs ?? 5000,
  };
}

/** No-op uninstall, returned when init() doesn't patch anything (disabled, or no global to patch). */
const NOOP = (): void => {};

/**
 * Patches `fetch`/`XMLHttpRequest` on `target` (defaults to `globalThis`) to detect and report
 * duplicate and needlessly-sequential network requests. Call it once, as early as possible —
 * typically at the top of your app's entry point, gated to development:
 *
 * ```ts
 * import { init } from 'why-did-you-fetch';
 * init(); // no-ops automatically when NODE_ENV === 'production'
 * ```
 *
 * Returns an `uninstall` function that restores the original `fetch`/`XMLHttpRequest`.
 */
export function init(options: WdyfOptions = {}, target: typeof globalThis = globalThis): () => void {
  const resolved = resolveOptions(options);
  if (!resolved.enabled) return NOOP;

  const tracker = new RequestTracker(resolved, (issue: Issue) => resolved.onIssue(issue));

  const uninstallers: Array<() => void> = [];
  if (resolved.patch.includes('fetch')) uninstallers.push(patchFetch(target, tracker, resolved));
  if (resolved.patch.includes('xhr')) uninstallers.push(patchXHR(target, tracker, resolved));

  return () => {
    for (const uninstall of uninstallers) uninstall();
  };
}
