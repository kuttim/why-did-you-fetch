import { shouldIgnore } from './ignore';
import { buildSignature, hashBody } from './signature';
import type { RequestTracker } from './tracker';
import type { TrackedRequest } from './types';
import type { ResolvedWdyfOptions } from './types';
import { reportInternalError } from './utils/internalError';
import { captureStack } from './utils/stack';

type OpenFn = typeof XMLHttpRequest.prototype.open;
type SendFn = typeof XMLHttpRequest.prototype.send;
type SetRequestHeaderFn = typeof XMLHttpRequest.prototype.setRequestHeader;

interface OpenState {
  method: string;
  url: string;
  stack: () => string;
  /** Headers set via `setRequestHeader` since the matching `open()` call, lower-cased keys. */
  headers: Record<string, string>;
}

/**
 * Wraps `XMLHttpRequest.prototype.open`/`send` so every call is recorded in the tracker.
 * Covers libraries (older axios configs, analytics SDKs, etc.) that use XHR directly instead
 * of `fetch`. Returns an `uninstall` function that restores both originals.
 */
export function patchXHR(
  target: typeof globalThis,
  resolveTracker: () => RequestTracker,
  options: ResolvedWdyfOptions,
): () => void {
  const XHR = target.XMLHttpRequest;
  if (!XHR) return () => {};

  const openState = new WeakMap<XMLHttpRequest, OpenState>();

  const originalOpen: OpenFn = XHR.prototype.open;
  const originalSend: SendFn = XHR.prototype.send;
  const originalSetRequestHeader: SetRequestHeaderFn = XHR.prototype.setRequestHeader;

  XHR.prototype.open = function patchedOpen(
    this: XMLHttpRequest,
    method: string,
    url: string | URL,
    ...rest: unknown[]
  ) {
    // A bug here (ours, or in a user callback) must never take the real open() call down with
    // it — see the matching comment in patchFetch.
    try {
      openState.set(this, { method: method.toUpperCase(), url: url.toString(), stack: captureStack(), headers: {} });
    } catch (error) {
      reportInternalError('patchXHR (open)', error);
    }
    return (originalOpen as (...args: unknown[]) => void).apply(this, [method, url, ...rest]);
  } as OpenFn;

  XHR.prototype.setRequestHeader = function patchedSetRequestHeader(this: XMLHttpRequest, name: string, value: string) {
    try {
      const state = openState.get(this);
      if (state) state.headers[name.toLowerCase()] = value;
    } catch (error) {
      reportInternalError('patchXHR (setRequestHeader)', error);
    }
    return originalSetRequestHeader.call(this, name, value);
  } as SetRequestHeaderFn;

  XHR.prototype.send = function patchedSend(this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null) {
    let tracked: { tracker: RequestTracker; request: TrackedRequest } | null = null;
    try {
      const state = openState.get(this);
      if (state && !shouldIgnore(state.url, state.method, options.ignore)) {
        const signature = options.buildKey
          ? options.buildKey({ method: state.method, url: state.url, body, headers: state.headers })
          : buildSignature(state.method, options.normalizeUrl(state.url), hashBody(options.normalizeBody(body)));
        // Resolved once per call, up front — see the matching comment in patchFetch.ts.
        const tracker = resolveTracker();
        const request = tracker.start({
          kind: 'xhr',
          method: state.method,
          url: state.url,
          signature,
          stack: state.stack,
        });
        tracked = { tracker, request };
      }
    } catch (error) {
      reportInternalError('patchXHR (send)', error);
    }

    if (tracked) {
      const { tracker, request } = tracked;
      // `request` is captured directly in this closure rather than looked up from a map keyed
      // by `this` — an XHR instance can be reused (open()+send() again before the prior
      // request's loadend fires, e.g. cancel-and-restart on user input), and a shared per-instance
      // map would let a later send() clobber the earlier request's association. Each send() call
      // gets its own self-contained listener, so this always settles the right request.
      const onSettle = (): void => {
        try {
          const status = this.status >= 200 && this.status < 400 ? 'resolved' : 'rejected';
          let cacheControl: string | null = null;
          try {
            cacheControl = this.getResponseHeader('Cache-Control');
          } catch {
            // readyState too early, or a cross-origin response hiding headers — just skip it.
          }
          tracker.settle(request, status, cacheControl);
        } catch (error) {
          reportInternalError('patchXHR (settle)', error);
        } finally {
          this.removeEventListener('loadend', onSettle);
        }
      };
      this.addEventListener('loadend', onSettle);
    }

    return originalSend.call(this, body as never);
  } as SendFn;

  return () => {
    XHR.prototype.open = originalOpen;
    XHR.prototype.send = originalSend;
    XHR.prototype.setRequestHeader = originalSetRequestHeader;
  };
}
