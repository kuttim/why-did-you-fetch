import { afterEach, describe, expect, it, vi } from 'vitest';
import { patchFetch } from '../src/patchFetch.js';
import type { RequestTracker } from '../src/tracker.js';
import type { ResolvedWdyfOptions, TrackedRequest } from '../src/types.js';

const OPTIONS: ResolvedWdyfOptions = {
  enabled: true,
  patch: ['fetch', 'xhr'],
  dedupeWindowMs: 2000,
  chainGapMs: 10,
  chainMinLength: 3,
  ignore: [],
  normalizeUrl: (url) => url,
  onIssue: () => {},
  retainMs: 5000,
  maxInflightAgeMs: 60000,
  rapidCallWindowMs: 1000,
  rapidCallMinCount: 5,
  nPlusOneWindowMs: 500,
  nPlusOneMinCount: 5,
  ignoreKeepalive: true,
  normalizeBody: (body) => body,
};

function fakeTracked(): TrackedRequest {
  return {
    id: 1,
    kind: 'fetch',
    method: 'GET',
    url: '/a',
    signature: 'GET /a',
    startedAt: 0,
    settledAt: null,
    status: 'pending',
    stack: 's',
    cacheControl: null,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('patchFetch', () => {
  it('still resolves the real response when tracker.settle() throws', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const tracker = {
      start: vi.fn(() => fakeTracked()),
      settle: vi.fn(() => {
        throw new Error('boom');
      }),
    } as unknown as RequestTracker;

    const target = { fetch: vi.fn(() => Promise.resolve(new Response('ok'))) } as unknown as typeof globalThis;
    patchFetch(target, () => tracker, OPTIONS);

    const res = await target.fetch('/a');

    expect(res.status).toBe(200);
    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(consoleError.mock.calls[0]?.[0]).toContain('why-did-you-fetch error in patchFetch (settle)');
  });

  it('still resolves (does not reject) when tracker.settle() throws on a failed fetch', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const tracker = {
      start: vi.fn(() => fakeTracked()),
      settle: vi.fn(() => {
        throw new Error('boom');
      }),
    } as unknown as RequestTracker;

    const target = { fetch: vi.fn(() => Promise.reject(new Error('network down'))) } as unknown as typeof globalThis;
    patchFetch(target, () => tracker, OPTIONS);

    await expect(target.fetch('/a')).rejects.toThrow('network down');
    // let the settle-rejection handler's microtask run
    await Promise.resolve();
    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(consoleError.mock.calls[0]?.[0]).toContain('why-did-you-fetch error in patchFetch (settle)');
  });

  it('settles a real failed (non-opaque) response as rejected', async () => {
    const tracker = { start: vi.fn(() => fakeTracked()), settle: vi.fn() } as unknown as RequestTracker;
    const target = {
      fetch: vi.fn(() => Promise.resolve(new Response('nope', { status: 500 }))),
    } as unknown as typeof globalThis;
    patchFetch(target, () => tracker, OPTIONS);

    await target.fetch('/a');

    expect(tracker.settle).toHaveBeenCalledWith(fakeTracked(), 'rejected', null);
  });

  it('settles an opaque (no-cors) response as resolved, not rejected', async () => {
    const tracker = { start: vi.fn(() => fakeTracked()), settle: vi.fn() } as unknown as RequestTracker;
    const opaqueResponse = {
      ok: false,
      status: 0,
      type: 'opaque',
      headers: { get: () => null },
    } as unknown as Response;
    const target = { fetch: vi.fn(() => Promise.resolve(opaqueResponse)) } as unknown as typeof globalThis;
    patchFetch(target, () => tracker, OPTIONS);

    await target.fetch('/a');

    expect(tracker.settle).toHaveBeenCalledWith(fakeTracked(), 'resolved', null);
  });

  it('settles an opaqueredirect response as resolved, not rejected', async () => {
    const tracker = { start: vi.fn(() => fakeTracked()), settle: vi.fn() } as unknown as RequestTracker;
    const opaqueRedirectResponse = {
      ok: false,
      status: 0,
      type: 'opaqueredirect',
      headers: { get: () => null },
    } as unknown as Response;
    const target = { fetch: vi.fn(() => Promise.resolve(opaqueRedirectResponse)) } as unknown as typeof globalThis;
    patchFetch(target, () => tracker, OPTIONS);

    await target.fetch('/a');

    expect(tracker.settle).toHaveBeenCalledWith(fakeTracked(), 'resolved', null);
  });
});
