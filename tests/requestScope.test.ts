import { describe, expect, it, vi } from 'vitest';
import { init } from '../src/index';
import type { Issue } from '../src/types';

function fakeTarget(responder: (url: string) => Promise<Response>) {
  return { fetch: vi.fn((input: RequestInfo | URL) => responder(input.toString())) } as unknown as typeof globalThis;
}

describe('withRequestScope', () => {
  it('does not cross-report duplicate-inflight between two concurrent request scopes', async () => {
    const issues: Issue[] = [];
    const target = fakeTarget(
      () => new Promise<Response>((resolve) => setTimeout(() => resolve(new Response('ok')), 10)),
    );
    const handle = init({ enabled: true, onIssue: (i) => issues.push(i) }, target);
    await handle.ready;

    // Two "requests" (e.g. two different users hitting the same-shaped endpoint on a Node
    // server) firing the exact same URL concurrently. Without per-scope isolation, the shared
    // tracker would see the second as a duplicate of the first's still-in-flight call.
    await Promise.all([
      handle.withRequestScope(() => target.fetch('/users/1')),
      handle.withRequestScope(() => target.fetch('/users/1')),
    ]);

    expect(issues.filter((i) => i.kind === 'duplicate-inflight')).toHaveLength(0);
    handle();
  });

  it('still reports a genuine duplicate-inflight within a single request scope', async () => {
    const issues: Issue[] = [];
    let resolveResponse: (r: Response) => void;
    const pending = new Promise<Response>((resolve) => (resolveResponse = resolve));
    const target = fakeTarget(() => pending);
    const handle = init({ enabled: true, onIssue: (i) => issues.push(i) }, target);
    await handle.ready;

    await handle.withRequestScope(async () => {
      const p1 = target.fetch('/users/1');
      const p2 = target.fetch('/users/1');
      resolveResponse!(new Response('ok'));
      await Promise.all([p1, p2]);
    });

    expect(issues.filter((i) => i.kind === 'duplicate-inflight')).toHaveLength(1);
    handle();
  });

  it('falls back to the shared tracker outside any request scope, unchanged from before', async () => {
    const issues: Issue[] = [];
    let resolveResponse: (r: Response) => void;
    const pending = new Promise<Response>((resolve) => (resolveResponse = resolve));
    const target = fakeTarget(() => pending);
    const handle = init({ enabled: true, onIssue: (i) => issues.push(i) }, target);
    await handle.ready;

    const p1 = target.fetch('/users/1');
    const p2 = target.fetch('/users/1');
    resolveResponse!(new Response('ok'));
    await Promise.all([p1, p2]);

    expect(issues.filter((i) => i.kind === 'duplicate-inflight')).toHaveLength(1);
    handle();
  });
});
