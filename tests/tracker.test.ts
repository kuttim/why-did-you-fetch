import { describe, expect, it } from 'vitest';
import { RequestTracker } from '../src/tracker.js';
import type { Issue } from '../src/types.js';

const OPTIONS = {
  dedupeWindowMs: 2000,
  chainGapMs: 10,
  chainMinLength: 3,
  retainMs: 5000,
  maxInflightAgeMs: 60000,
  rapidCallWindowMs: 1000,
  rapidCallMinCount: 5,
  nPlusOneWindowMs: 500,
  nPlusOneMinCount: 5,
};

function makeClock(start = 0) {
  let now = start;
  return { advance: (ms: number) => (now += ms), fn: () => now };
}

describe('RequestTracker', () => {
  it('flags a request fired while an identical one is still in flight', () => {
    const issues: Issue[] = [];
    const tracker = new RequestTracker(
      OPTIONS,
      (i) => issues.push(i),
      () => 0,
    );

    const first = tracker.start({ kind: 'fetch', method: 'GET', url: '/a', signature: 'GET /a', stack: () => 's1' });
    tracker.start({ kind: 'fetch', method: 'GET', url: '/a', signature: 'GET /a', stack: () => 's2' });

    expect(issues).toHaveLength(1);
    expect(issues[0]?.kind).toBe('duplicate-inflight');
    tracker.settle(first, 'resolved');
  });

  it('does not flag two different in-flight requests', () => {
    const issues: Issue[] = [];
    const tracker = new RequestTracker(
      OPTIONS,
      (i) => issues.push(i),
      () => 0,
    );

    tracker.start({ kind: 'fetch', method: 'GET', url: '/a', signature: 'GET /a', stack: () => 's1' });
    tracker.start({ kind: 'fetch', method: 'GET', url: '/b', signature: 'GET /b', stack: () => 's2' });

    expect(issues).toHaveLength(0);
  });

  it('flags an identical request repeated shortly after the first settles', () => {
    const clock = makeClock();
    const issues: Issue[] = [];
    const tracker = new RequestTracker(OPTIONS, (i) => issues.push(i), clock.fn);

    const first = tracker.start({ kind: 'fetch', method: 'GET', url: '/a', signature: 'GET /a', stack: () => 's1' });
    clock.advance(100);
    tracker.settle(first, 'resolved');
    clock.advance(500); // well within the 2000ms dedupe window

    tracker.start({ kind: 'fetch', method: 'GET', url: '/a', signature: 'GET /a', stack: () => 's2' });

    expect(issues).toHaveLength(1);
    expect(issues[0]?.kind).toBe('duplicate-recent');
    expect((issues[0] as { gapMs: number }).gapMs).toBeCloseTo(500, 0);
  });

  it('does not flag an identical request repeated after the dedupe window has passed', () => {
    const clock = makeClock();
    const issues: Issue[] = [];
    const tracker = new RequestTracker(OPTIONS, (i) => issues.push(i), clock.fn);

    const first = tracker.start({ kind: 'fetch', method: 'GET', url: '/a', signature: 'GET /a', stack: () => 's1' });
    clock.advance(100);
    tracker.settle(first, 'resolved');
    clock.advance(3000); // outside the 2000ms window

    tracker.start({ kind: 'fetch', method: 'GET', url: '/a', signature: 'GET /a', stack: () => 's2' });

    expect(issues).toHaveLength(0);
  });

  it('flags a run of requests fired back-to-back with tiny gaps', () => {
    const clock = makeClock();
    const issues: Issue[] = [];
    const tracker = new RequestTracker(OPTIONS, (i) => issues.push(i), clock.fn);

    for (let i = 0; i < 3; i++) {
      const req = tracker.start({
        kind: 'fetch',
        method: 'GET',
        url: `/item/${i}`,
        signature: `GET /item/${i}`,
        stack: () => `s${i}`,
      });
      clock.advance(2); // well under chainGapMs of 10
      tracker.settle(req, 'resolved');
      clock.advance(1);
    }

    const chainIssues = issues.filter((i) => i.kind === 'sequential-chain');
    expect(chainIssues).toHaveLength(1);
    expect(chainIssues[0]?.kind === 'sequential-chain' && chainIssues[0].requests).toHaveLength(3);
  });

  it('only reports a given chain once even as it keeps growing', () => {
    const clock = makeClock();
    const issues: Issue[] = [];
    const tracker = new RequestTracker(OPTIONS, (i) => issues.push(i), clock.fn);

    for (let i = 0; i < 6; i++) {
      const req = tracker.start({
        kind: 'fetch',
        method: 'GET',
        url: `/item/${i}`,
        signature: `GET /item/${i}`,
        stack: () => `s${i}`,
      });
      clock.advance(2);
      tracker.settle(req, 'resolved');
      clock.advance(1);
    }

    expect(issues.filter((i) => i.kind === 'sequential-chain')).toHaveLength(1);
  });

  it('does not flag concurrent (parallel) requests as a chain', () => {
    const clock = makeClock();
    const issues: Issue[] = [];
    const tracker = new RequestTracker(OPTIONS, (i) => issues.push(i), clock.fn);

    const reqs = [0, 1, 2].map((i) =>
      tracker.start({
        kind: 'fetch',
        method: 'GET',
        url: `/item/${i}`,
        signature: `GET /item/${i}`,
        stack: () => `s${i}`,
      }),
    );
    clock.advance(50);
    reqs.forEach((r) => tracker.settle(r, 'resolved'));

    expect(issues.filter((i) => i.kind === 'sequential-chain')).toHaveLength(0);
  });

  it('does not chain requests with large gaps between them', () => {
    const clock = makeClock();
    const issues: Issue[] = [];
    const tracker = new RequestTracker(OPTIONS, (i) => issues.push(i), clock.fn);

    for (let i = 0; i < 3; i++) {
      const req = tracker.start({
        kind: 'fetch',
        method: 'GET',
        url: `/item/${i}`,
        signature: `GET /item/${i}`,
        stack: () => `s${i}`,
      });
      clock.advance(2);
      tracker.settle(req, 'resolved');
      clock.advance(1000); // far beyond chainGapMs of 10
    }

    expect(issues.filter((i) => i.kind === 'sequential-chain')).toHaveLength(0);
  });

  it('evicts a request that never settles so it stops permanently flagging duplicates', () => {
    const clock = makeClock();
    const issues: Issue[] = [];
    const tracker = new RequestTracker(OPTIONS, (i) => issues.push(i), clock.fn);

    tracker.start({ kind: 'fetch', method: 'GET', url: '/hung', signature: 'GET /hung', stack: () => 's1' });
    // never settled — simulates a hung connection

    clock.advance(OPTIONS.maxInflightAgeMs + 1);
    tracker.start({ kind: 'fetch', method: 'GET', url: '/hung', signature: 'GET /hung', stack: () => 's2' });

    expect(issues.filter((i) => i.kind === 'duplicate-inflight')).toHaveLength(0);
  });

  it('still flags a genuine duplicate while the first request is within maxInflightAgeMs', () => {
    const clock = makeClock();
    const issues: Issue[] = [];
    const tracker = new RequestTracker(OPTIONS, (i) => issues.push(i), clock.fn);

    tracker.start({ kind: 'fetch', method: 'GET', url: '/a', signature: 'GET /a', stack: () => 's1' });
    clock.advance(OPTIONS.maxInflightAgeMs - 1);
    tracker.start({ kind: 'fetch', method: 'GET', url: '/a', signature: 'GET /a', stack: () => 's2' });

    expect(issues.filter((i) => i.kind === 'duplicate-inflight')).toHaveLength(1);
  });

  it('flags a burst of rapid calls to the same path with varying query strings', () => {
    const clock = makeClock();
    const issues: Issue[] = [];
    const tracker = new RequestTracker(OPTIONS, (i) => issues.push(i), clock.fn);

    for (let i = 0; i < OPTIONS.rapidCallMinCount; i++) {
      tracker.start({
        kind: 'fetch',
        method: 'GET',
        url: `/search?q=${'a'.repeat(i + 1)}`,
        signature: `GET /search?q=${'a'.repeat(i + 1)} `,
        stack: () => 's',
      });
      clock.advance(50);
    }

    const rapid = issues.filter((i) => i.kind === 'rapid-calls');
    expect(rapid).toHaveLength(1);
    expect(rapid[0]?.kind === 'rapid-calls' && rapid[0].path).toBe('/search');
  });

  it('does not flag a burst of identical calls as rapid-calls (that is duplicate-recent/inflight territory)', () => {
    const clock = makeClock();
    const issues: Issue[] = [];
    const tracker = new RequestTracker(OPTIONS, (i) => issues.push(i), clock.fn);

    for (let i = 0; i < OPTIONS.rapidCallMinCount + 2; i++) {
      const req = tracker.start({
        kind: 'fetch',
        method: 'GET',
        url: '/search?q=a',
        signature: 'GET /search?q=a',
        stack: () => 's',
      });
      tracker.settle(req, 'resolved');
      clock.advance(50);
    }

    expect(issues.filter((i) => i.kind === 'rapid-calls')).toHaveLength(0);
  });

  it('reports a rapid-calls burst once, then again after it cools down', () => {
    const clock = makeClock();
    const issues: Issue[] = [];
    const tracker = new RequestTracker(OPTIONS, (i) => issues.push(i), clock.fn);

    for (let i = 0; i < OPTIONS.rapidCallMinCount + 3; i++) {
      tracker.start({
        kind: 'fetch',
        method: 'GET',
        url: `/search?q=${i}`,
        signature: `GET /search?q=${i}`,
        stack: () => 's',
      });
      clock.advance(50);
    }
    expect(issues.filter((i) => i.kind === 'rapid-calls')).toHaveLength(1);

    clock.advance(OPTIONS.rapidCallWindowMs + 1); // let the burst fully cool down

    for (let i = 100; i < 100 + OPTIONS.rapidCallMinCount + 1; i++) {
      tracker.start({
        kind: 'fetch',
        method: 'GET',
        url: `/search?q=${i}`,
        signature: `GET /search?q=${i}`,
        stack: () => 's',
      });
      clock.advance(50);
    }
    expect(issues.filter((i) => i.kind === 'rapid-calls')).toHaveLength(2);
  });

  it('flags a burst of parallel requests to the same route shape with different ids', () => {
    const clock = makeClock();
    const issues: Issue[] = [];
    const tracker = new RequestTracker(OPTIONS, (i) => issues.push(i), clock.fn);

    for (let i = 1; i <= OPTIONS.nPlusOneMinCount; i++) {
      tracker.start({
        kind: 'fetch',
        method: 'GET',
        url: `/api/users/${i}`,
        signature: `GET /api/users/${i}`,
        stack: () => 's',
      });
      clock.advance(5);
    }

    const nPlusOne = issues.filter((i) => i.kind === 'n-plus-one');
    expect(nPlusOne).toHaveLength(1);
    expect(nPlusOne[0]?.kind === 'n-plus-one' && nPlusOne[0].pathTemplate).toBe('/api/users/:id');
  });

  it('does not flag a rapid-calls burst (same path, varying query) as n-plus-one', () => {
    const clock = makeClock();
    const issues: Issue[] = [];
    const tracker = new RequestTracker(OPTIONS, (i) => issues.push(i), clock.fn);

    for (let i = 0; i < OPTIONS.rapidCallMinCount; i++) {
      tracker.start({
        kind: 'fetch',
        method: 'GET',
        url: `/search?q=${i}`,
        signature: `GET /search?q=${i}`,
        stack: () => 's',
      });
      clock.advance(5);
    }

    expect(issues.filter((i) => i.kind === 'rapid-calls')).toHaveLength(1);
    expect(issues.filter((i) => i.kind === 'n-plus-one')).toHaveLength(0);
  });

  it('does not flag repeated calls to the same id as n-plus-one (that is duplicate territory)', () => {
    const clock = makeClock();
    const issues: Issue[] = [];
    const tracker = new RequestTracker(OPTIONS, (i) => issues.push(i), clock.fn);

    for (let i = 0; i < OPTIONS.nPlusOneMinCount + 2; i++) {
      const req = tracker.start({
        kind: 'fetch',
        method: 'GET',
        url: '/api/users/1',
        signature: 'GET /api/users/1',
        stack: () => 's',
      });
      tracker.settle(req, 'resolved');
      clock.advance(5);
    }

    expect(issues.filter((i) => i.kind === 'n-plus-one')).toHaveLength(0);
  });
});
