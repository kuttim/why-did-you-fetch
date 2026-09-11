import { consoleReporter } from './reporter/console';
import { patchFetch } from './patchFetch';
import { patchXHR } from './patchXHR';
import { RequestTracker } from './tracker';
import type { Issue, ResolvedWdyfOptions, WdyfOptions } from './types';

export type {
  BuildKeyRequest,
  DuplicateInflightIssue,
  DuplicateRecentIssue,
  Issue,
  IgnoreMatcher,
  NPlusOneIssue,
  RapidCallsIssue,
  RequestKind,
  RequestStatus,
  SequentialChainIssue,
  TrackedRequest,
  WdyfOptions,
} from './types';
export { consoleReporter } from './reporter/console';

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
    maxInflightAgeMs: options.maxInflightAgeMs ?? 60000,
    rapidCallWindowMs: options.rapidCallWindowMs ?? 1000,
    rapidCallMinCount: options.rapidCallMinCount ?? 5,
    nPlusOneWindowMs: options.nPlusOneWindowMs ?? 500,
    nPlusOneMinCount: options.nPlusOneMinCount ?? 5,
    ignoreKeepalive: options.ignoreKeepalive ?? true,
    normalizeBody: options.normalizeBody ?? ((body: unknown) => body),
    buildKey: options.buildKey,
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

export interface IssueCollector {
  /** Every issue detected since collectIssues() was called. Mutated in place as new ones arrive. */
  issues: Issue[];
  /** Restores the original fetch/XHR — same as init()'s own return value. */
  uninstall: () => void;
}

/**
 * Same as `init()`, but collects every detected issue into an array you can assert on, instead
 * of (only) printing them — for asserting network hygiene in a test, e.g.
 * `expect(issues).toHaveLength(0)` at the end of a Cypress/Playwright/Jest run. Doesn't silently
 * drop your own `onIssue` if you pass one — it still runs, right after the issue is collected.
 * See `examples/cypress-ci-check` for a full CI-enforced example.
 */
export function collectIssues(options: WdyfOptions = {}, target: typeof globalThis = globalThis): IssueCollector {
  const issues: Issue[] = [];
  const userOnIssue = options.onIssue;
  const uninstall = init(
    {
      ...options,
      onIssue: (issue) => {
        issues.push(issue);
        userOnIssue?.(issue);
      },
    },
    target,
  );
  return { issues, uninstall };
}
