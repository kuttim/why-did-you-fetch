import { describe, expect, it, vi } from 'vitest';
import { collectIssues } from '../src/index.js';
import type { Issue } from '../src/types.js';

function fakeTarget(responder: (url: string) => Promise<Response>) {
  return { fetch: vi.fn((input: RequestInfo | URL) => responder(input.toString())) } as unknown as typeof globalThis;
}

describe('collectIssues', () => {
  it('collects detected issues into an array', async () => {
    let resolveResponse: (r: Response) => void;
    const pending = new Promise<Response>((resolve) => (resolveResponse = resolve));
    const target = fakeTarget(() => pending);

    const { issues, uninstall } = collectIssues({ enabled: true }, target);

    const p1 = target.fetch('/users/1');
    const p2 = target.fetch('/users/1');
    resolveResponse!(new Response('ok'));
    await Promise.all([p1, p2]);

    expect(issues).toHaveLength(1);
    expect(issues[0]?.kind).toBe('duplicate-inflight');
    uninstall();
  });

  it('stays empty for a clean run with no duplicate/sequential patterns', async () => {
    const target = fakeTarget(() => Promise.resolve(new Response('ok')));
    const { issues, uninstall } = collectIssues({ enabled: true }, target);

    await Promise.all([target.fetch('/users/1'), target.fetch('/users/2')]);

    expect(issues).toHaveLength(0);
    uninstall();
  });

  it('still calls a user-supplied onIssue alongside collecting', async () => {
    let resolveResponse: (r: Response) => void;
    const pending = new Promise<Response>((resolve) => (resolveResponse = resolve));
    const target = fakeTarget(() => pending);
    const seen: Issue[] = [];

    const { issues, uninstall } = collectIssues({ enabled: true, onIssue: (i) => seen.push(i) }, target);

    const p1 = target.fetch('/users/1');
    const p2 = target.fetch('/users/1');
    resolveResponse!(new Response('ok'));
    await Promise.all([p1, p2]);

    expect(issues).toHaveLength(1);
    expect(seen).toEqual(issues);
    uninstall();
  });
});
