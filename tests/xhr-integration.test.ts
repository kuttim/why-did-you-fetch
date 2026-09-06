import { describe, expect, it } from 'vitest';
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
  send(_body?: unknown): void {
    queueMicrotask(() => this.dispatchEvent(new Event('loadend')));
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
});
