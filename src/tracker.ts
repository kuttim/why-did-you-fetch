import type { Issue, RequestKind, ResolvedWdyfOptions, TrackedRequest } from './types.js';

export interface StartParams {
  kind: RequestKind;
  method: string;
  url: string;
  signature: string;
  stack: string;
}

type Clock = () => number;
type TrackerOptions = Pick<ResolvedWdyfOptions, 'dedupeWindowMs' | 'chainGapMs' | 'chainMinLength' | 'retainMs'>;

/**
 * Holds everything we know about in-flight and recently-settled requests, and runs the three
 * detectors (in-flight duplicate, recent duplicate, sequential chain) as requests start and
 * settle. Framework/transport agnostic — patchFetch and patchXHR both feed it the same shape.
 */
export class RequestTracker {
  private nextId = 1;
  private nextChainId = 1;
  private inflight = new Map<string, TrackedRequest[]>();
  private settled = new Map<string, TrackedRequest>();
  private lastSettledGlobal: TrackedRequest | null = null;
  private chains = new Map<number, TrackedRequest[]>();
  private reportedChains = new Set<number>();

  constructor(
    private options: TrackerOptions,
    private emit: (issue: Issue) => void,
    private clock: Clock = () => performance.now(),
  ) {}

  start(params: StartParams): TrackedRequest {
    const now = this.clock();
    const request: TrackedRequest = {
      id: this.nextId++,
      kind: params.kind,
      method: params.method,
      url: params.url,
      signature: params.signature,
      startedAt: now,
      settledAt: null,
      status: 'pending',
      stack: params.stack,
    };

    this.checkInflightDuplicate(request);
    this.checkRecentDuplicate(request, now);
    this.assignChain(request, now);

    const bucket = this.inflight.get(request.signature) ?? [];
    bucket.push(request);
    this.inflight.set(request.signature, bucket);

    return request;
  }

  settle(request: TrackedRequest, status: 'resolved' | 'rejected'): void {
    request.status = status;
    request.settledAt = this.clock();

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
      this.emit({
        kind: 'duplicate-recent',
        method: request.method,
        url: request.url,
        previous,
        current: request,
        gapMs,
        message: `Repeated request: ${request.method} ${request.url} was fetched again only ${Math.round(
          gapMs,
        )}ms after an identical call finished. Consider caching or deduplicating it.`,
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

  /** Drops settled/chain bookkeeping older than retainMs so long-lived pages don't leak memory. */
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
  }
}
