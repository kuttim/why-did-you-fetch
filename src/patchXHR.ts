import { shouldIgnore } from './ignore.js';
import { buildSignature, hashBody } from './signature.js';
import type { RequestTracker } from './tracker.js';
import type { ResolvedWdyfOptions, TrackedRequest } from './types.js';
import { captureStack } from './utils/stack.js';

type OpenFn = typeof XMLHttpRequest.prototype.open;
type SendFn = typeof XMLHttpRequest.prototype.send;

interface OpenState {
  method: string;
  url: string;
  stack: string;
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
  const trackedRequest = new WeakMap<XMLHttpRequest, TrackedRequest>();

  const originalOpen: OpenFn = XHR.prototype.open;
  const originalSend: SendFn = XHR.prototype.send;

  XHR.prototype.open = function patchedOpen(this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) {
    openState.set(this, { method: method.toUpperCase(), url: url.toString(), stack: captureStack() });
    return (originalOpen as (...args: unknown[]) => void).apply(this, [method, url, ...rest]);
  } as OpenFn;

  XHR.prototype.send = function patchedSend(this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null) {
    const state = openState.get(this);
    if (!state || shouldIgnore(state.url, state.method, options.ignore)) {
      return originalSend.call(this, body as never);
    }

    const bodyHash = hashBody(body);
    const signature = buildSignature(state.method, options.normalizeUrl(state.url), bodyHash);
    const tracked = tracker.start({
      kind: 'xhr',
      method: state.method,
      url: state.url,
      signature,
      stack: state.stack,
    });
    trackedRequest.set(this, tracked);

    const onSettle = (): void => {
      const t = trackedRequest.get(this);
      if (!t) return;
      tracker.settle(t, this.status >= 200 && this.status < 400 ? 'resolved' : 'rejected');
      trackedRequest.delete(this);
      this.removeEventListener('loadend', onSettle);
    };
    this.addEventListener('loadend', onSettle);

    return originalSend.call(this, body as never);
  } as SendFn;

  return () => {
    XHR.prototype.open = originalOpen;
    XHR.prototype.send = originalSend;
  };
}
