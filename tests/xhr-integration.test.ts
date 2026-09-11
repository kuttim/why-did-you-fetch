import { describe, expect, it, vi } from 'vitest';
import { init } from '../src/index.js';
import type { Issue } from '../src/types.js';

/** Minimal fake XHR: enough surface for patchXHR (open/send/status/loadend) without a real network. */
class FakeXHR extends EventTarget {
  method = '';
  url = '';
  status = 200;
  open(method: string, url: string): void {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(_name: string, _value: string): void {}
  send(_body?: unknown): void {
    queueMicrotask(() => this.dispatchEvent(new Event('loadend')));
  }
  abort(): void {
    this.status = 0;
    this.dispatchEvent(new Event('loadend'));
  }
}

function fakeTarget() {
  return { XMLHttpRequest: FakeXHR } as unknown as typeof globalThis;
}

function settle(xhr: FakeXHR): Promise<void> {
  return new Promise((resolve) => xhr.addEventListener('loadend', () => resolve(), { once: true }));
}

describe('init() with XMLHttpRequest', () => {
  it('restores the original open/send on uninstall', () => {
    const target = fakeTarget();
    const originalOpen = FakeXHR.prototype.open;
    const originalSend = FakeXHR.prototype.send;
    const uninstall = init({ enabled: true, patch: ['xhr'] }, target);

    expect(target.XMLHttpRequest).toBe(FakeXHR); // same class reference; only its prototype methods change
    expect(FakeXHR.prototype.open).not.toBe(originalOpen);
    expect(FakeXHR.prototype.send).not.toBe(originalSend);

    uninstall();
    expect(FakeXHR.prototype.open).toBe(originalOpen);
    expect(FakeXHR.prototype.send).toBe(originalSend);
  });

  it('reports a duplicate in-flight XHR request', async () => {
    const issues: Issue[] = [];
    const target = fakeTarget();
    const uninstall = init({ enabled: true, patch: ['xhr'], onIssue: (i) => issues.push(i) }, target);

    const a = new target.XMLHttpRequest() as unknown as FakeXHR;
    const b = new target.XMLHttpRequest() as unknown as FakeXHR;
    (a as unknown as XMLHttpRequest).open('GET', '/users/1');
    (b as unknown as XMLHttpRequest).open('GET', '/users/1');
    const settled = Promise.all([settle(a), settle(b)]);
    (a as unknown as XMLHttpRequest).send();
    (b as unknown as XMLHttpRequest).send();
    await settled;

    expect(issues.filter((i) => i.kind === 'duplicate-inflight')).toHaveLength(1);
    uninstall();
  });

  it('settles the right tracked request when one XHR instance is reused before the prior request settles', async () => {
    const issues: Issue[] = [];
    const target = fakeTarget();
    const uninstall = init({ enabled: true, patch: ['xhr'], onIssue: (i) => issues.push(i) }, target);

    const xhr = new target.XMLHttpRequest() as unknown as FakeXHR;
    const raw = xhr as unknown as XMLHttpRequest;

    raw.open('GET', '/a');
    raw.send();
    // Reuse the same instance for a different request before the first has settled — the
    // "cancel and restart on new input" pattern this library exists to help with.
    raw.open('GET', '/b');
    raw.send();

    // A single loadend, as a real browser reusing an XHR may deliver only once. dispatchEvent
    // is synchronous, so both internally-registered listeners run before this returns.
    xhr.dispatchEvent(new Event('loadend'));
    issues.length = 0;

    // If the first request never actually settled (the bug this regresses), it's still sitting
    // in the tracker's in-flight bucket for "GET /a" and this wrongly reports another duplicate.
    raw.open('GET', '/a');
    raw.send();

    expect(issues.filter((i) => i.kind === 'duplicate-inflight')).toHaveLength(0);
    uninstall();
    await Promise.resolve(); // let the two send()s' own scheduled loadend dispatches flush
  });

  it('treats a non-2xx/3xx XHR status as rejected', async () => {
    const issues: Issue[] = [];
    const target = fakeTarget();
    const uninstall = init({ enabled: true, patch: ['xhr'], onIssue: (i) => issues.push(i) }, target);

    const a = new target.XMLHttpRequest() as unknown as FakeXHR;
    (a as unknown as XMLHttpRequest).open('GET', '/flaky');
    a.status = 500;
    const settled = settle(a);
    (a as unknown as XMLHttpRequest).send();
    await settled;

    const b = new target.XMLHttpRequest() as unknown as FakeXHR;
    (b as unknown as XMLHttpRequest).open('GET', '/flaky');
    b.status = 500;
    const settledB = settle(b);
    (b as unknown as XMLHttpRequest).send(); // same request, shortly after -> duplicate-recent
    await settledB;

    const dup = issues.find((i) => i.kind === 'duplicate-recent');
    expect(dup).toBeDefined();
    expect(dup?.kind === 'duplicate-recent' && dup.previous.status).toBe('rejected');
    uninstall();
  });

  it('settles (and does not leak) an aborted request', async () => {
    const issues: Issue[] = [];
    const target = fakeTarget();
    const uninstall = init({ enabled: true, patch: ['xhr'], onIssue: (i) => issues.push(i) }, target);

    const a = new target.XMLHttpRequest() as unknown as FakeXHR;
    (a as unknown as XMLHttpRequest).open('GET', '/a');
    (a as unknown as XMLHttpRequest).send();
    a.abort();

    issues.length = 0;
    // If the aborted request never settled, it would still be sitting in the in-flight bucket
    // and this would wrongly report a duplicate.
    const b = new target.XMLHttpRequest() as unknown as FakeXHR;
    (b as unknown as XMLHttpRequest).open('GET', '/a');
    (b as unknown as XMLHttpRequest).send();

    expect(issues.filter((i) => i.kind === 'duplicate-inflight')).toHaveLength(0);
    uninstall();
  });

  it('does not flag requests to the same URL as duplicates when a buildKey folds in a differing header', async () => {
    const issues: Issue[] = [];
    const target = fakeTarget();
    const uninstall = init(
      {
        enabled: true,
        patch: ['xhr'],
        onIssue: (i) => issues.push(i),
        buildKey: ({ method, url, headers }) => `${method} ${url} ${headers['x-tenant-id'] ?? ''}`,
      },
      target,
    );

    const a = new target.XMLHttpRequest() as unknown as FakeXHR;
    const b = new target.XMLHttpRequest() as unknown as FakeXHR;
    const rawA = a as unknown as XMLHttpRequest;
    const rawB = b as unknown as XMLHttpRequest;

    rawA.open('GET', '/users/1');
    rawA.setRequestHeader('X-Tenant-Id', 'a');
    rawB.open('GET', '/users/1');
    rawB.setRequestHeader('X-Tenant-Id', 'b');
    const settled = Promise.all([settle(a), settle(b)]);
    rawA.send();
    rawB.send();
    await settled;

    expect(issues.filter((i) => i.kind === 'duplicate-inflight')).toHaveLength(0);
    uninstall();
  });

  it('still sends and settles the real request when a user callback throws during instrumentation', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const target = fakeTarget();
    const uninstall = init(
      {
        enabled: true,
        patch: ['xhr'],
        normalizeUrl: () => {
          throw new Error('boom');
        },
      },
      target,
    );

    const xhr = new target.XMLHttpRequest() as unknown as FakeXHR;
    const raw = xhr as unknown as XMLHttpRequest;
    raw.open('GET', '/users/1');
    const settled = settle(xhr);
    raw.send();
    await settled;

    expect(xhr.status).toBe(200);
    expect(consoleError).toHaveBeenCalled();
    expect(consoleError.mock.calls[0]?.[0]).toContain('why-did-you-fetch error in patchXHR (send)');
    uninstall();
  });
});
