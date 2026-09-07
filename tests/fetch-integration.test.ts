import { describe, expect, it, vi } from 'vitest';
import { init } from '../src/index.js';
import type { Issue } from '../src/types.js';

function fakeTarget(responder: (url: string) => Promise<Response>) {
  const target = {
    fetch: vi.fn((input: RequestInfo | URL) => responder(input.toString())),
  } as unknown as typeof globalThis;
  return target;
}

describe('init() with fetch', () => {
  it('is a no-op when disabled', () => {
    const target = fakeTarget(() => Promise.resolve(new Response('ok')));
    const originalFetch = target.fetch;
    const uninstall = init({ enabled: false }, target);
    expect(target.fetch).toBe(originalFetch);
    uninstall();
  });

  it('restores the original fetch on uninstall', () => {
    const target = fakeTarget(() => Promise.resolve(new Response('ok')));
    const originalFetch = target.fetch;
    const uninstall = init({ enabled: true }, target);
    expect(target.fetch).not.toBe(originalFetch);
    uninstall();
    expect(target.fetch).toBe(originalFetch);
  });

  it('reports a duplicate in-flight fetch and still resolves both calls', async () => {
    const issues: Issue[] = [];
    let resolveResponse: (r: Response) => void;
    const pending = new Promise<Response>((resolve) => (resolveResponse = resolve));
    const target = fakeTarget(() => pending);

    const uninstall = init({ enabled: true, onIssue: (i) => issues.push(i) }, target);

    const p1 = target.fetch('/users/1');
    const p2 = target.fetch('/users/1');
    resolveResponse!(new Response('ok'));
    await Promise.all([p1, p2]);

    expect(issues).toHaveLength(1);
    expect(issues[0]?.kind).toBe('duplicate-inflight');
    uninstall();
  });

  it('does not report unrelated concurrent requests', async () => {
    const issues: Issue[] = [];
    const target = fakeTarget(() => Promise.resolve(new Response('ok')));
    const uninstall = init({ enabled: true, onIssue: (i) => issues.push(i) }, target);

    await Promise.all([target.fetch('/users/1'), target.fetch('/users/2')]);

    expect(issues).toHaveLength(0);
    uninstall();
  });

  it('treats a non-ok HTTP response as rejected, not resolved', async () => {
    const issues: Issue[] = [];
    const target = fakeTarget(() => Promise.resolve(new Response('error', { status: 500 })));
    const uninstall = init({ enabled: true, onIssue: (i) => issues.push(i) }, target);

    await target.fetch('/flaky');
    await target.fetch('/flaky'); // same request, shortly after -> triggers duplicate-recent

    const dup = issues.find((i) => i.kind === 'duplicate-recent');
    expect(dup).toBeDefined();
    expect(dup?.kind === 'duplicate-recent' && dup.previous.status).toBe('rejected');
    uninstall();
  });

  it('normalizeUrl lets two differently-cache-busted URLs be treated as the same request', async () => {
    const issues: Issue[] = [];
    const target = fakeTarget(() => Promise.resolve(new Response('ok')));
    const uninstall = init(
      {
        enabled: true,
        normalizeUrl: (url) => url.replace(/([?&])_=\d+/, ''),
        onIssue: (i) => issues.push(i),
      },
      target,
    );

    await target.fetch('/stats?_=1');
    await target.fetch('/stats?_=2'); // different cache-busting param, same underlying request

    expect(issues.filter((i) => i.kind === 'duplicate-recent')).toHaveLength(1);
    uninstall();
  });

  it('tracks a Request-object input, matching duplicates by method + URL', async () => {
    const issues: Issue[] = [];
    let resolveResponse: (r: Response) => void;
    const pending = new Promise<Response>((resolve) => (resolveResponse = resolve));
    const target = fakeTarget(() => pending);
    const uninstall = init({ enabled: true, onIssue: (i) => issues.push(i) }, target);

    const p1 = target.fetch(new Request('http://localhost/users/1'));
    const p2 = target.fetch(new Request('http://localhost/users/1'));
    resolveResponse!(new Response('ok'));
    await Promise.all([p1, p2]);

    expect(issues.filter((i) => i.kind === 'duplicate-inflight')).toHaveLength(1);
    uninstall();
  });

  it('reports a sequential-chain end to end, through init() and patched fetch', async () => {
    const issues: Issue[] = [];
    const target = fakeTarget(() => Promise.resolve(new Response('ok')));
    const uninstall = init({ enabled: true, chainGapMs: 50, onIssue: (i) => issues.push(i) }, target);

    await target.fetch('/a');
    await target.fetch('/b');
    await target.fetch('/c');

    const chain = issues.find((i) => i.kind === 'sequential-chain');
    expect(chain).toBeDefined();
    expect(chain?.kind === 'sequential-chain' && chain.requests).toHaveLength(3);
    uninstall();
  });

  it('respects the ignore list', async () => {
    const issues: Issue[] = [];
    const target = fakeTarget(() => Promise.resolve(new Response('ok')));
    const uninstall = init({ enabled: true, ignore: ['/analytics'], onIssue: (i) => issues.push(i) }, target);

    await Promise.all([target.fetch('/analytics/ping'), target.fetch('/analytics/ping')]);

    expect(issues).toHaveLength(0);
    uninstall();
  });

  it('skips keepalive requests by default', async () => {
    const issues: Issue[] = [];
    const target = fakeTarget(() => Promise.resolve(new Response('ok')));
    const uninstall = init({ enabled: true, onIssue: (i) => issues.push(i) }, target);

    await Promise.all([target.fetch('/beacon', { keepalive: true }), target.fetch('/beacon', { keepalive: true })]);

    expect(issues).toHaveLength(0);
    uninstall();
  });

  it('tracks keepalive requests when ignoreKeepalive is disabled', async () => {
    const issues: Issue[] = [];
    let resolveResponse: (r: Response) => void;
    const pending = new Promise<Response>((resolve) => (resolveResponse = resolve));
    const target = fakeTarget(() => pending);
    const uninstall = init({ enabled: true, ignoreKeepalive: false, onIssue: (i) => issues.push(i) }, target);

    const p1 = target.fetch('/beacon', { keepalive: true });
    const p2 = target.fetch('/beacon', { keepalive: true });
    resolveResponse!(new Response('ok'));
    await Promise.all([p1, p2]);

    expect(issues.filter((i) => i.kind === 'duplicate-inflight')).toHaveLength(1);
    uninstall();
  });

  it('normalizeBody lets bodies differing only in a volatile field count as the same request', async () => {
    const issues: Issue[] = [];
    const target = fakeTarget(() => Promise.resolve(new Response('ok')));
    const uninstall = init(
      {
        enabled: true,
        normalizeBody: (body) => {
          if (typeof body !== 'string') return body;
          try {
            const parsed = JSON.parse(body);
            delete parsed.traceId;
            return parsed;
          } catch {
            return body;
          }
        },
        onIssue: (i) => issues.push(i),
      },
      target,
    );

    await target.fetch('/orders', { method: 'POST', body: JSON.stringify({ item: 'x', traceId: 'a' }) });
    await target.fetch('/orders', { method: 'POST', body: JSON.stringify({ item: 'x', traceId: 'b' }) });

    expect(issues.filter((i) => i.kind === 'duplicate-recent')).toHaveLength(1);
    uninstall();
  });

  it('reports rapid-calls end to end for varying-query calls to the same path', async () => {
    const issues: Issue[] = [];
    const target = fakeTarget(() => Promise.resolve(new Response('ok')));
    const uninstall = init({ enabled: true, rapidCallMinCount: 3, onIssue: (i) => issues.push(i) }, target);

    await target.fetch('/search?q=a');
    await target.fetch('/search?q=ab');
    await target.fetch('/search?q=abc');

    const rapid = issues.find((i) => i.kind === 'rapid-calls');
    expect(rapid).toBeDefined();
    expect(rapid?.kind === 'rapid-calls' && rapid.path).toBe('/search');
    uninstall();
  });

  it('adds a cache-freshness hint to duplicate-recent when the previous response was cacheable', async () => {
    const issues: Issue[] = [];
    const target = fakeTarget(() =>
      Promise.resolve(new Response('ok', { headers: { 'Cache-Control': 'max-age=60' } })),
    );
    const uninstall = init({ enabled: true, onIssue: (i) => issues.push(i) }, target);

    await target.fetch('/config');
    await target.fetch('/config');

    const dup = issues.find((i) => i.kind === 'duplicate-recent');
    expect(dup?.message).toContain('cacheable for 60s');
    uninstall();
  });
});
