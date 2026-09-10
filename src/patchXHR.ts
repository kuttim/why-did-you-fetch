import { shouldIgnore } from './ignore';
import { buildSignature, hashBody } from './signature';
import type { RequestTracker } from './tracker';
import type { TrackedRequest } from './types';
import type { ResolvedWdyfOptions } from './types';
import { reportInternalError } from './utils/internalError';
import { captureStack } from './utils/stack';

type OpenFn = typeof XMLHttpRequest.prototype.open;
type SendFn = typeof XMLHttpRequest.prototype.send;

interface OpenState {
  method: string;
  url: string;
  stack: () => string;
}

/**
 * Wraps `XMLHttpRequest.prototype.open`/`send` so every call is recorded in the tracker.
 * Covers libraries (older axios configs, analytics SDKs, etc.) that use XHR directly instead
 * of `fetch`. Returns an `uninstall` function that restores both originals.
 */
export function patchXHR(target: typeof globalThis, tracker: RequestTracker, options: ResolvedWdyfOptions): () => void {
  const XHR = target.XMLHttpRequest;
  if (!XHR) return () => {};

  const openState = new WeakMap<XMLHttpRequest, OpenState>();

  const originalOpen: OpenFn = XHR.prototype.open;
  const originalSend: SendFn = XHR.prototype.send;

  XHR.prototype.open = function patchedOpen(
    this: XMLHttpRequest,
    method: string,
    url: string | URL,
    ...rest: unknown[]
  ) {
    // A bug here (ours, or in a user callback) must never take the real open() call down with
    // it — see the matching comment in patchFetch.
    try {
      openState.set(this, { method: method.toUpperCase(), url: url.toString(), stack: captureStack() });
    } catch (error) {
      reportInternalError('patchXHR (open)', error);
    }
    return (originalOpen as (...args: unknown[]) => void).apply(this, [method, url, ...rest]);
  } as OpenFn;

  XHR.prototype.send = function patchedSend(this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null) {
    let tracked: TrackedRequest | null = null;
    try {
      const state = openState.get(this);
      if (state && !shouldIgnore(state.url, state.method, options.ignore)) {
        const bodyHash = hashBody(options.normalizeBody(body));
        const signature = buildSignature(state.method, options.normalizeUrl(state.url), bodyHash);
        tracked = tracker.start({
          kind: 'xhr',
          method: state.method,
          url: state.url,
          signature,
          stack: state.stack,
        });
      }
    } catch (error) {
      reportInternalError('patchXHR (send)', error);
    }

    if (tracked) {
      const request = tracked;
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
  };
}
