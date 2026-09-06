import { cleanup, render } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useWhyDidYouFetch } from '../src/react.js';
import type { Issue, WdyfOptions } from '../src/types.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function TestComponent({ options }: { options?: WdyfOptions }) {
  useWhyDidYouFetch(options);
  return null;
}

describe('useWhyDidYouFetch', () => {
  it('installs the patch on mount and restores it on unmount', () => {
    const originalFetch = globalThis.fetch;
    const { unmount } = render(createElement(TestComponent));

    expect(globalThis.fetch).not.toBe(originalFetch);
    unmount();
    expect(globalThis.fetch).toBe(originalFetch);
  });

  it('wires onIssue through to init() and reports through it', () => {
    // Stub a never-settling fetch so we only exercise the synchronous in-flight check,
    // without depending on a real network call.
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    const issues: Issue[] = [];
    const { unmount } = render(createElement(TestComponent, { options: { onIssue: (i) => issues.push(i) } }));

    const url = 'http://localhost/why-did-you-fetch-react-test';
    void fetch(url);
    void fetch(url);

    expect(issues.filter((i) => i.kind === 'duplicate-inflight')).toHaveLength(1);
    unmount();
  });

  it('does not reinstall when a new options object is passed on re-render', () => {
    const { rerender } = render(createElement(TestComponent, { options: { chainMinLength: 5 } }));
    const patchedFetch = globalThis.fetch;

    rerender(createElement(TestComponent, { options: { chainMinLength: 5 } })); // new object, same shape

    expect(globalThis.fetch).toBe(patchedFetch); // untouched: mount-once by design
  });
});
