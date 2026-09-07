import { describe, expect, it } from 'vitest';
import { RequestTracker } from '../src/tracker.js';
import type { Issue } from '../src/types.js';

const OPTIONS = { dedupeWindowMs: 2000, chainGapMs: 10, chainMinLength: 3, retainMs: 5000, maxInflightAgeMs: 60000 };

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
});
