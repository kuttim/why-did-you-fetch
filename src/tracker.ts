import { describeCacheFreshness } from './utils/cacheFreshness.js';
import { stripQueryAndHash } from './utils/path.js';
import type { Issue, RequestKind, ResolvedWdyfOptions, TrackedRequest } from './types.js';

export interface StartParams {
  kind: RequestKind;
  method: string;
  url: string;
  signature: string;
  /** Lazy — formatting a captured stack is the expensive part, deferred until actually read. */
  stack: () => string;
}

type Clock = () => number;
type TrackerOptions = Pick<
  ResolvedWdyfOptions,
  | 'dedupeWindowMs'
  | 'chainGapMs'
  | 'chainMinLength'
  | 'retainMs'
  | 'maxInflightAgeMs'
  | 'rapidCallWindowMs'
  | 'rapidCallMinCount'
>;

interface RapidCallBucket {
  requests: TrackedRequest[];
  lastReportedAt: number | null;
}

/**
 * Holds everything we know about in-flight and recently-settled requests, and runs the four
 * detectors (in-flight duplicate, recent duplicate, sequential chain, rapid calls) as requests
 * start and settle. Framework/transport agnostic — patchFetch and patchXHR both feed it the same
 * shape.
 */
export class RequestTracker {
  private nextId = 1;
  private nextChainId = 1;
  private inflight = new Map<string, TrackedRequest[]>();
  private settled = new Map<string, TrackedRequest>();
  private lastSettledGlobal: TrackedRequest | null = null;
  private chains = new Map<number, TrackedRequest[]>();
  private reportedChains = new Set<number>();
  private rapidCalls = new Map<string, RapidCallBucket>();

  constructor(
    private options: TrackerOptions,
    private emit: (issue: Issue) => void,
    private clock: Clock = () => performance.now(),
  ) {}

  start(params: StartParams): TrackedRequest {
    const now = this.clock();
    this.pruneStaleInflight(now);

    const request = {
      id: this.nextId++,
      kind: params.kind,
      method: params.method,
      url: params.url,
      signature: params.signature,
      startedAt: now,
      settledAt: null,
      status: 'pending',
      cacheControl: null,
    } as TrackedRequest;
    // Defined via a lazy getter (rather than a plain field) so formatting the stack only
    // happens for the minority of requests that actually end up in a reported issue.
    Object.defineProperty(request, 'stack', { enumerable: true, configurable: true, get: params.stack });

    this.checkInflightDuplicate(request);
    this.checkRecentDuplicate(request, now);
    this.assignChain(request, now);
    this.checkRapidCalls(request, now);

    const bucket = this.inflight.get(request.signature) ?? [];
    bucket.push(request);
    this.inflight.set(request.signature, bucket);

    return request;
  }

  settle(request: TrackedRequest, status: 'resolved' | 'rejected', cacheControl: string | null = null): void {
    request.status = status;
    request.settledAt = this.clock();
    request.cacheControl = cacheControl;

    const bucket = this.inflight.get(request.signature);
    if (bucket) {
      const idx = bucket.indexOf(request);
      if (idx !== -1) bucket.splice(idx, 1);
      if (bucket.length === 0) this.inflight.delete(request.signature);
    }

    this.settled.set(request.signature, request);
    this.lastSettledGlobal = request;

    this.prune(request.settledAt);
  }

  private checkInflightDuplicate(request: TrackedRequest): void {
    const bucket = this.inflight.get(request.signature);
    const first = bucket?.[0];
    if (!first) return;
    this.emit({
      kind: 'duplicate-inflight',
      method: request.method,
      url: request.url,
      first,
      second: request,
      message: `Duplicate in-flight request: ${request.method} ${request.url} was requested again before the first call finished. If both call sites need the response, share one promise instead of firing two requests.`,
    });
  }

  private checkRecentDuplicate(request: TrackedRequest, now: number): void {
    const previous = this.settled.get(request.signature);
    if (!previous || previous.settledAt == null) return;
    const gapMs = now - previous.settledAt;
    if (gapMs >= 0 && gapMs <= this.options.dedupeWindowMs) {
      const freshness = describeCacheFreshness(previous.cacheControl, gapMs);
      this.emit({
        kind: 'duplicate-recent',
        method: request.method,
        url: request.url,
        previous,
        current: request,
        gapMs,
        message:
          `Repeated request: ${request.method} ${request.url} was fetched again only ${Math.round(
            gapMs,
          )}ms after an identical call finished. Consider caching or deduplicating it.` +
          (freshness ? ` ${freshness}` : ''),
      });
    }
  }

  private assignChain(request: TrackedRequest, now: number): void {
    const prev = this.lastSettledGlobal;
    const canContinue =
      prev != null && prev.settledAt != null && prev.chainId != null && now - prev.settledAt <= this.options.chainGapMs;

    const chainId = canContinue ? prev!.chainId! : this.nextChainId++;
    request.chainId = chainId;

    const chain = this.chains.get(chainId) ?? [];
    chain.push(request);
    this.chains.set(chainId, chain);

    if (chain.length >= this.options.chainMinLength && !this.reportedChains.has(chainId)) {
      this.reportedChains.add(chainId);
      const first = chain[0]!;
      const totalGapMs = now - first.startedAt;
      this.emit({
        kind: 'sequential-chain',
        requests: chain.slice(),
        totalGapMs,
        message: `${chain.length} requests fired back-to-back with barely any gap between them (at least ${Math.round(
          totalGapMs,
        )}ms serialized so far: ${chain.map((r) => r.url).join(' -> ')}). If they don't depend on each other's results, consider firing them together with Promise.all.`,
      });
    }
  }

  /**
   * Flags a burst of calls to the same method + path (query string ignored) with *varying*
   * query strings — the "search box refetching on every keystroke, no debounce" pattern. This
   * is deliberately disjoint from duplicate-inflight/duplicate-recent (which require an exact
   * signature match): requiring at least 2 distinct signatures in the bucket means a burst of
   * truly identical calls is left to those detectors instead of double-reported here.
   */
  private checkRapidCalls(request: TrackedRequest, now: number): void {
    const path = stripQueryAndHash(request.url);
    const key = `${request.method} ${path}`;
    const bucket = this.rapidCalls.get(key) ?? { requests: [], lastReportedAt: null };
    bucket.requests = bucket.requests.filter((r) => now - r.startedAt <= this.options.rapidCallWindowMs);
    bucket.requests.push(request);
    this.rapidCalls.set(key, bucket);

    const distinctSignatures = new Set(bucket.requests.map((r) => r.signature)).size;
    const cooling = bucket.lastReportedAt != null && now - bucket.lastReportedAt <= this.options.rapidCallWindowMs;

    if (bucket.requests.length >= this.options.rapidCallMinCount && distinctSignatures >= 2 && !cooling) {
      bucket.lastReportedAt = now;
      const first = bucket.requests[0]!;
      const windowMs = now - first.startedAt;
      this.emit({
        kind: 'rapid-calls',
        method: request.method,
        path,
        requests: bucket.requests.slice(),
        windowMs,
        message: `${bucket.requests.length} requests to ${request.method} ${path} fired within ${Math.round(
          windowMs,
        )}ms of each other, each with a different query string — looks like input firing on every keystroke without debouncing. Consider debouncing, or cancelling the previous request before firing the next.`,
      });
    }
  }

  /**
   * A request that never settles — a hung connection, one swallowed by a service worker —
   * would otherwise sit in `inflight` forever, leaking memory and permanently flagging every
   * future identical request as a duplicate. If it does eventually settle, `settle()` no-ops
   * harmlessly on the (already-removed) inflight bookkeeping but still records it as settled.
   */
  private pruneStaleInflight(now: number): void {
    for (const [sig, bucket] of this.inflight) {
      const fresh = bucket.filter((req) => now - req.startedAt <= this.options.maxInflightAgeMs);
      if (fresh.length === bucket.length) continue;
      if (fresh.length === 0) this.inflight.delete(sig);
      else this.inflight.set(sig, fresh);
    }
  }

  /** Drops settled/chain/rapid-call bookkeeping older than retainMs so long-lived pages don't leak memory. */
  private prune(now: number): void {
    for (const [sig, req] of this.settled) {
      if (req.settledAt != null && now - req.settledAt > this.options.retainMs) {
        this.settled.delete(sig);
      }
    }
    for (const [id, chain] of this.chains) {
      const last = chain[chain.length - 1];
      if (last?.settledAt != null && now - last.settledAt > this.options.retainMs) {
        this.chains.delete(id);
        this.reportedChains.delete(id);
      }
    }
    for (const [key, bucket] of this.rapidCalls) {
      const last = bucket.requests[bucket.requests.length - 1];
      if (!last || now - last.startedAt > this.options.retainMs) {
        this.rapidCalls.delete(key);
      }
    }
  }
}
