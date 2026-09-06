import { shouldIgnore } from './ignore.js';
import { buildSignature, hashBody } from './signature.js';
import type { RequestTracker } from './tracker.js';
import type { ResolvedWdyfOptions } from './types.js';
import { captureStack } from './utils/stack.js';

type FetchFn = typeof fetch;

function extractMethodAndUrl(input: RequestInfo | URL, init?: RequestInit): { method: string; url: string } {
  if (typeof input === 'string' || input instanceof URL) {
    return { method: (init?.method ?? 'GET').toUpperCase(), url: input.toString() };
  }
  return { method: (init?.method ?? input.method ?? 'GET').toUpperCase(), url: input.url };
}

/**
 * We only fingerprint bodies we can read synchronously without consuming a stream. A body
 * passed via `init.body` is safe (the original fetch call still gets it, untouched); a body
 * baked into a `Request` object is not read here (that would require cloning and awaiting),
 * so those calls are still tracked and matched by method + URL, just not by body content.
 */
function extractBody(input: RequestInfo | URL, init?: RequestInit): unknown {
  if (init && 'body' in init) return init.body;
  return undefined;
}

/**
 * Wraps `target.fetch` so every call is recorded in the tracker before being handed to the
 * real implementation. Returns an `uninstall` function that restores the original.
 */
export function patchFetch(target: typeof globalThis, tracker: RequestTracker, options: ResolvedWdyfOptions): () => void {
  const original = target.fetch as FetchFn | undefined;
  if (typeof original !== 'function') return () => {};

  const patched: FetchFn = function patchedFetch(input, init) {
    const { method, url } = extractMethodAndUrl(input, init);

    if (shouldIgnore(url, method, options.ignore)) {
      return original.call(target, input, init);
    }

    const stack = captureStack();
    const bodyHash = hashBody(extractBody(input, init));
    const signature = buildSignature(method, options.normalizeUrl(url), bodyHash);
    const tracked = tracker.start({ kind: 'fetch', method, url, signature, stack });

    const result = original.call(target, input, init);
    result.then(
      () => tracker.settle(tracked, 'resolved'),
      () => tracker.settle(tracked, 'rejected'),
    );
    return result;
  };

  target.fetch = patched;
  return () => {
    target.fetch = original;
  };
}
