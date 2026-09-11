import { shouldIgnore } from './ignore';
import { buildSignature, hashBody } from './signature';
import type { RequestTracker } from './tracker';
import type { TrackedRequest } from './types';
import type { ResolvedWdyfOptions } from './types';
import { reportInternalError } from './utils/internalError';
import { captureStack } from './utils/stack';

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

/** `init.keepalive` takes precedence; falls back to a `Request` object's own flag. */
function isKeepalive(input: RequestInfo | URL, init?: RequestInit): boolean {
  if (init && 'keepalive' in init) return init.keepalive === true;
  if (typeof input === 'object' && !(input instanceof URL) && 'keepalive' in input) return input.keepalive === true;
  return false;
}

/**
 * Wraps `target.fetch` so every call is recorded in the tracker before being handed to the
 * real implementation. Returns an `uninstall` function that restores the original.
 */
export function patchFetch(
  target: typeof globalThis,
  tracker: RequestTracker,
  options: ResolvedWdyfOptions,
): () => void {
  const original = target.fetch as FetchFn | undefined;
  if (typeof original !== 'function') return () => {};

  const patched: FetchFn = function patchedFetch(input, init) {
    // A bug here (ours, or in a user-supplied ignore/normalizeUrl/normalizeBody callback) must
    // never take the real fetch call down with it — instrumentation is best-effort, wrapped
    // separately from the real call below, which always happens regardless.
    let tracked: TrackedRequest | null = null;
    try {
      const { method, url } = extractMethodAndUrl(input, init);
      if (!(shouldIgnore(url, method, options.ignore) || (options.ignoreKeepalive && isKeepalive(input, init)))) {
        const stack = captureStack();
        const bodyHash = hashBody(options.normalizeBody(extractBody(input, init)));
        const signature = buildSignature(method, options.normalizeUrl(url), bodyHash);
        tracked = tracker.start({ kind: 'fetch', method, url, signature, stack });
      }
    } catch (error) {
      reportInternalError('patchFetch', error);
    }

    const result = original.call(target, input, init);
    if (tracked) {
      const request = tracked;
      result.then(
        (res) => {
          try {
            // An opaque response (mode: 'no-cors' to a cross-origin URL) always reports
            // status 0 / ok: false per spec, regardless of whether the request actually
            // succeeded — that's not a real rejection signal, so treat it as resolved.
            const isOpaque = res.type === 'opaque' || res.type === 'opaqueredirect';
            tracker.settle(request, res.ok || isOpaque ? 'resolved' : 'rejected', res.headers.get('cache-control'));
          } catch (error) {
            reportInternalError('patchFetch (settle)', error);
          }
        },
        () => {
          try {
            tracker.settle(request, 'rejected');
          } catch (error) {
            reportInternalError('patchFetch (settle)', error);
          }
        },
      );
    }
    return result;
  };

  target.fetch = patched;
  return () => {
    target.fetch = original;
  };
}
