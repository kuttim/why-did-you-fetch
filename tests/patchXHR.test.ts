import { afterEach, describe, expect, it, vi } from 'vitest';
import { patchXHR } from '../src/patchXHR.js';
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

/** Minimal fake XHR: enough surface for patchXHR (open/send/status/loadend). */
class FakeXHR extends EventTarget {
  status = 200;
  open(_method: string, _url: string | URL): void {}
  send(_body?: unknown): void {
    queueMicrotask(() => this.dispatchEvent(new Event('loadend')));
  }
  getResponseHeader(_name: string): string | null {
    return null;
  }
}

function fakeTracked(): TrackedRequest {
  return {
    id: 1,
    kind: 'xhr',
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

describe('patchXHR', () => {
  it('still calls the real open() when a URL whose toString() throws is passed', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const tracker = { start: vi.fn(), settle: vi.fn() } as unknown as RequestTracker;
    const target = { XMLHttpRequest: FakeXHR } as unknown as typeof globalThis;
    patchXHR(target, tracker, OPTIONS);

    const xhr = new FakeXHR() as unknown as XMLHttpRequest;
    const badUrl = { toString: () => throwing() } as unknown as URL;
    function throwing(): string {
      throw new Error('boom');
    }

    expect(() => xhr.open('GET', badUrl)).not.toThrow();
    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(consoleError.mock.calls[0]?.[0]).toContain('why-did-you-fetch error in patchXHR (open)');
  });

  it('still sends and settles when tracker.settle() throws', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const tracker = {
      start: vi.fn(() => fakeTracked()),
      settle: vi.fn(() => {
        throw new Error('boom');
      }),
    } as unknown as RequestTracker;
    const target = { XMLHttpRequest: FakeXHR } as unknown as typeof globalThis;
    patchXHR(target, tracker, OPTIONS);

    const xhr = new FakeXHR();
    const raw = xhr as unknown as XMLHttpRequest;
    const settled = new Promise<void>((resolve) => xhr.addEventListener('loadend', () => resolve(), { once: true }));
    raw.open('GET', '/a');
    raw.send();
    await settled;

    expect(xhr.status).toBe(200);
    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(consoleError.mock.calls[0]?.[0]).toContain('why-did-you-fetch error in patchXHR (settle)');
  });
});
