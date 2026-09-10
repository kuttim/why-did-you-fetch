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
  it('logs a duplicate-inflight issue as nested collapsed groups, one per call site', () => {
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

    // Outer issue group, plus one sub-group per call site.
    expect(groupCollapsed).toHaveBeenCalledTimes(3);
    expect(groupCollapsed.mock.calls[0]?.[0]).toContain('why-did-you-fetch');
    expect(groupCollapsed.mock.calls[0]?.[0]).toContain('DUPLICATE (in-flight)');
    expect(groupCollapsed.mock.calls[0]?.[0]).toContain(issue.message);
    expect(groupCollapsed.mock.calls[1]?.[0]).toContain('First call');
    expect(groupCollapsed.mock.calls[2]?.[0]).toContain('Duplicate call');
    expect(log).toHaveBeenCalledWith('first-stack');
    expect(log).toHaveBeenCalledWith('second-stack');
    expect(groupEnd).toHaveBeenCalledTimes(3);
  });

  it('logs a duplicate-recent issue with the gap and both call sites, each in its own sub-group', () => {
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

  it('logs a sequential-chain issue as a request table plus a stack sub-group per request', () => {
    vi.spyOn(console, 'groupCollapsed').mockImplementation(() => {});
    const table = vi.spyOn(console, 'table').mockImplementation(() => {});
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'groupEnd').mockImplementation(() => {});

    const issue: SequentialChainIssue = {
      kind: 'sequential-chain',
      requests: [
        makeRequest({ method: 'GET', url: '/a', stack: 'stack-a' }),
        makeRequest({ method: 'GET', url: '/b', stack: 'stack-b' }),
        makeRequest({ method: 'GET', url: '/c', stack: 'stack-c' }),
      ],
      totalGapMs: 30,
      message: '3 requests fired back-to-back',
    };
    consoleReporter(issue);

    expect(table).toHaveBeenCalledWith([
      { Method: 'GET', URL: '/a' },
      { Method: 'GET', URL: '/b' },
      { Method: 'GET', URL: '/c' },
    ]);
    expect(log).toHaveBeenCalledWith('stack-a');
    expect(log).toHaveBeenCalledWith('stack-b');
    expect(log).toHaveBeenCalledWith('stack-c');
  });

  it('logs a rapid-calls issue as a request table plus a stack sub-group per request', () => {
    vi.spyOn(console, 'groupCollapsed').mockImplementation(() => {});
    const table = vi.spyOn(console, 'table').mockImplementation(() => {});
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

    expect(table).toHaveBeenCalledWith([
      { Method: 'GET', URL: '/search?q=a' },
      { Method: 'GET', URL: '/search?q=ab' },
    ]);
    expect(log).toHaveBeenCalledWith('stack-a');
    expect(log).toHaveBeenCalledWith('stack-ab');
  });

  it('logs an n-plus-one issue as a request table plus a stack sub-group per request', () => {
    vi.spyOn(console, 'groupCollapsed').mockImplementation(() => {});
    const table = vi.spyOn(console, 'table').mockImplementation(() => {});
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

    expect(table).toHaveBeenCalledWith([
      { Method: 'GET', URL: '/api/users/1' },
      { Method: 'GET', URL: '/api/users/2' },
    ]);
    expect(log).toHaveBeenCalledWith('stack-1');
    expect(log).toHaveBeenCalledWith('stack-2');
  });

  it('falls back to a plain numbered list when console.table is unavailable', () => {
    vi.spyOn(console, 'groupCollapsed').mockImplementation(() => {});
    vi.spyOn(console, 'groupEnd').mockImplementation(() => {});
    const original = console.table;
    // @ts-expect-error - simulating an environment without console.table
    console.table = undefined;
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    consoleReporter({
      kind: 'sequential-chain',
      requests: [makeRequest({ method: 'GET', url: '/a', stack: 'stack-a' })],
      totalGapMs: 10,
      message: '1 request',
    });

    expect(log).toHaveBeenCalledWith('1. GET /a');
    console.table = original;
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
