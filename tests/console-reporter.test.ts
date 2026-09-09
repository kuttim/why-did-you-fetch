import { afterEach, describe, expect, it, vi } from 'vitest';
import { consoleReporter } from '../src/reporter/console.js';
import type {
  DuplicateInflightIssue,
  DuplicateRecentIssue,
  NPlusOneIssue,
  RapidCallsIssue,
  SequentialChainIssue,
  TrackedRequest,
} from '../src/types.js';

function makeRequest(overrides: Partial<TrackedRequest> = {}): TrackedRequest {
  return {
    id: 1,
    kind: 'fetch',
    method: 'GET',
    url: '/a',
    signature: 'GET /a',
    startedAt: 0,
    settledAt: 10,
    status: 'resolved',
    stack: 'at Somewhere (file.ts:1:1)',
    cacheControl: null,
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('consoleReporter', () => {
  it('logs a duplicate-inflight issue as a collapsed group with both call sites', () => {
    const groupCollapsed = vi.spyOn(console, 'groupCollapsed').mockImplementation(() => {});
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const groupEnd = vi.spyOn(console, 'groupEnd').mockImplementation(() => {});

    const issue: DuplicateInflightIssue = {
      kind: 'duplicate-inflight',
      method: 'GET',
      url: '/a',
      first: makeRequest({ id: 1, stack: 'first-stack' }),
      second: makeRequest({ id: 2, stack: 'second-stack' }),
      message: 'Duplicate in-flight request: GET /a',
    };
    consoleReporter(issue);

    expect(groupCollapsed).toHaveBeenCalledTimes(1);
    expect(groupCollapsed.mock.calls[0]?.[0]).toContain('DUPLICATE (in-flight)');
    expect(groupCollapsed.mock.calls[0]?.[0]).toContain(issue.message);
    expect(log).toHaveBeenCalledWith('first-stack');
    expect(log).toHaveBeenCalledWith('second-stack');
    expect(groupEnd).toHaveBeenCalledTimes(1);
  });

  it('logs a duplicate-recent issue with the gap and both call sites', () => {
    vi.spyOn(console, 'groupCollapsed').mockImplementation(() => {});
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'groupEnd').mockImplementation(() => {});

    const issue: DuplicateRecentIssue = {
      kind: 'duplicate-recent',
      method: 'GET',
      url: '/a',
      previous: makeRequest({ stack: 'prev-stack' }),
      current: makeRequest({ stack: 'curr-stack' }),
      gapMs: 512.4,
      message: 'Repeated request: GET /a',
    };
    consoleReporter(issue);

    expect(log).toHaveBeenCalledWith('Previous call finished 512ms ago.');
    expect(log).toHaveBeenCalledWith('prev-stack');
    expect(log).toHaveBeenCalledWith('curr-stack');
  });

  it('logs each request in a sequential-chain issue, in order', () => {
    vi.spyOn(console, 'groupCollapsed').mockImplementation(() => {});
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'groupEnd').mockImplementation(() => {});

    const issue: SequentialChainIssue = {
      kind: 'sequential-chain',
      requests: [
        makeRequest({ url: '/a', stack: 'stack-a' }),
        makeRequest({ url: '/b', stack: 'stack-b' }),
        makeRequest({ url: '/c', stack: 'stack-c' }),
      ],
      totalGapMs: 30,
      message: '3 requests fired back-to-back',
    };
    consoleReporter(issue);

    expect(log).toHaveBeenCalledWith('1. GET /a');
    expect(log).toHaveBeenCalledWith('stack-a');
    expect(log).toHaveBeenCalledWith('2. GET /b');
    expect(log).toHaveBeenCalledWith('3. GET /c');
  });

  it('logs each request in a rapid-calls issue', () => {
    vi.spyOn(console, 'groupCollapsed').mockImplementation(() => {});
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'groupEnd').mockImplementation(() => {});

    const issue: RapidCallsIssue = {
      kind: 'rapid-calls',
      method: 'GET',
      path: '/search',
      requests: [
        makeRequest({ url: '/search?q=a', stack: 'stack-a' }),
        makeRequest({ url: '/search?q=ab', stack: 'stack-ab' }),
      ],
      windowMs: 100,
      message: '2 requests to GET /search fired within 100ms',
    };
    consoleReporter(issue);

    expect(log).toHaveBeenCalledWith('1. /search?q=a');
    expect(log).toHaveBeenCalledWith('stack-a');
    expect(log).toHaveBeenCalledWith('2. /search?q=ab');
    expect(log).toHaveBeenCalledWith('stack-ab');
  });

  it('logs each request in an n-plus-one issue', () => {
    vi.spyOn(console, 'groupCollapsed').mockImplementation(() => {});
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'groupEnd').mockImplementation(() => {});

    const issue: NPlusOneIssue = {
      kind: 'n-plus-one',
      method: 'GET',
      pathTemplate: '/api/users/:id',
      requests: [
        makeRequest({ url: '/api/users/1', stack: 'stack-1' }),
        makeRequest({ url: '/api/users/2', stack: 'stack-2' }),
      ],
      windowMs: 40,
      message: '2 requests to different GET /api/users/:id URLs fired within 40ms',
    };
    consoleReporter(issue);

    expect(log).toHaveBeenCalledWith('1. /api/users/1');
    expect(log).toHaveBeenCalledWith('stack-1');
    expect(log).toHaveBeenCalledWith('2. /api/users/2');
    expect(log).toHaveBeenCalledWith('stack-2');
  });

  it('falls back to console.log when console.groupCollapsed is unavailable', () => {
    const original = console.groupCollapsed;
    // @ts-expect-error - simulating an environment without console.groupCollapsed
    console.groupCollapsed = undefined;
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const groupEnd = vi.spyOn(console, 'groupEnd').mockImplementation(() => {});

    consoleReporter({
      kind: 'duplicate-inflight',
      method: 'GET',
      url: '/a',
      first: makeRequest(),
      second: makeRequest(),
      message: 'Duplicate in-flight request: GET /a',
    });

    expect(log.mock.calls[0]?.[0]).toContain('DUPLICATE (in-flight)');
    expect(groupEnd).not.toHaveBeenCalled();

    console.groupCollapsed = original;
  });
});
