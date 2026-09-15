import type { RequestTracker } from './tracker';

interface AsyncLocalStorageLike<T> {
  run<R>(store: T, callback: () => R): R;
  getStore(): T | undefined;
}

let als: AsyncLocalStorageLike<RequestTracker> | undefined;

/**
 * Loaded once, lazily, via a dynamic import so bundlers targeting browser-only output never have
 * to statically resolve a Node builtin they don't have — `node:async_hooks` simply doesn't exist
 * outside Node (and Node-compatible runtimes), and every call site below falls back to running
 * un-scoped instead (today's single-shared-tracker behavior) wherever it isn't. Await
 * `whenRequestScopeReady()` (exposed as `ready` on the handle `init()` returns) for a guarantee
 * that this has settled one way or the other before relying on `withRequestScope` isolation.
 */
const ready: Promise<void> = import('node:async_hooks')
  .then((mod) => {
    als = new mod.AsyncLocalStorage<RequestTracker>();
  })
  .catch(() => {
    als = undefined;
  });

export function whenRequestScopeReady(): Promise<void> {
  return ready;
}

/**
 * Runs `fn` with its own fresh `RequestTracker` (built via `createTracker`), so every fetch/XHR
 * call made anywhere inside it — however deep, across awaits and callbacks — is compared only
 * against other calls from the same invocation, never against a concurrent, unrelated one. This
 * is what makes concurrent Node/SSR request handling safe: without it, `init()`'s single shared
 * tracker would see two different users' requests to the same-shaped endpoint at the same moment
 * and wrongly flag them as duplicates of each other.
 *
 * Falls back to running `fn` un-scoped (today's behavior) wherever `AsyncLocalStorage` isn't
 * available — browsers, workers, or the brief window before its dynamic import resolves.
 */
export function withRequestScope<T>(createTracker: () => RequestTracker, fn: () => T): T {
  return als ? als.run(createTracker(), fn) : fn();
}

/**
 * The tracker for the current request scope, if any — `undefined` outside `withRequestScope` (or
 * wherever scoping is unavailable), in which case callers should fall back to their own shared
 * tracker instance.
 */
export function getScopedTracker(): RequestTracker | undefined {
  return als?.getStore();
}
