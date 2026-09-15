import { shouldIgnore } from './ignore';
import { buildSignature, hashBody } from './signature';
import type { RequestTracker } from './tracker';
import type { TrackedRequest } from './types';
import type { ResolvedWdyfOptions } from './types';
import { headersToRecord, type HeadersLike } from './utils/headers';
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

/** Combines a `Request` object's own headers with `init.headers` (init wins on conflict, matching real `fetch`). */
function extractHeaders(input: RequestInfo | URL, init?: RequestInit): Record<string, string> {
  let record: Record<string, string> = {};
  if (typeof input === 'object' && !(input instanceof URL) && 'headers' in input) {
    record = headersToRecord((input as Request).headers);
  }
  if (init?.headers) {
    record = { ...record, ...headersToRecord(init.headers as HeadersLike) };
  }
  return record;
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
  resolveTracker: () => RequestTracker,
  options: ResolvedWdyfOptions,
): () => void {
  const original = target.fetch as FetchFn | undefined;
  if (typeof original !== 'function') return () => {};

  const patched: FetchFn = function patchedFetch(input, init) {
    // A bug here (ours, or in a user-supplied ignore/normalizeUrl/normalizeBody callback) must
    // never take the real fetch call down with it — instrumentation is best-effort, wrapped
    // separately from the real call below, which always happens regardless.
    let tracked: { tracker: RequestTracker; request: TrackedRequest } | null = null;
    try {
      const { method, url } = extractMethodAndUrl(input, init);
      if (!(shouldIgnore(url, method, options.ignore) || (options.ignoreKeepalive && isKeepalive(input, init)))) {
        const stack = captureStack();
        const body = extractBody(input, init);
        const signature = options.buildKey
          ? options.buildKey({ method, url, body, headers: extractHeaders(input, init) })
          : buildSignature(method, options.normalizeUrl(url), hashBody(options.normalizeBody(body)));
        // Resolved once per call, up front — the current request scope's tracker if init() is
        // running under Node/SSR request scoping (see requestScope.ts), else the single shared
        // one. Kept alongside `request` rather than re-resolved at settle time, so a call is
        // always matched against the same tracker it started in even if the scope has since exited.
        const tracker = resolveTracker();
        const request = tracker.start({ kind: 'fetch', method, url, signature, stack });
        tracked = { tracker, request };
      }
    } catch (error) {
      reportInternalError('patchFetch', error);
    }

    const result = original.call(target, input, init);
    if (tracked) {
      const { tracker, request } = tracked;
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
