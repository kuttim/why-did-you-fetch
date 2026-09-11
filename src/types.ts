export type RequestKind = 'fetch' | 'xhr';

export type RequestStatus = 'pending' | 'resolved' | 'rejected';

/** A single network call we've observed, from the moment it was issued. */
export interface TrackedRequest {
  /** Monotonically increasing id, unique per page load. */
  id: number;
  /** Which API was used to make the call. */
  kind: RequestKind;
  method: string;
  url: string;
  /** Identity used for duplicate matching: method + normalized url + body hash. */
  signature: string;
  /** performance.now() timestamp when the call was issued. */
  startedAt: number;
  /** performance.now() timestamp when it settled, or null while pending. */
  settledAt: number | null;
  status: RequestStatus;
  /** Captured call stack (with our own internal frames stripped), for locating the call site. */
  stack: string;
  /** The response's Cache-Control header, if known (fetch only) and the request has settled. */
  cacheControl: string | null;
  /** Internal: chain id assigned by the sequential-chain detector. */
  chainId?: number;
}

interface IssueBase {
  /** Human-readable one-liner, ready to log. */
  message: string;
}

export interface DuplicateInflightIssue extends IssueBase {
  kind: 'duplicate-inflight';
  method: string;
  url: string;
  /** The request that was already in flight. */
  first: TrackedRequest;
  /** The new, redundant request. */
  second: TrackedRequest;
}

export interface DuplicateRecentIssue extends IssueBase {
  kind: 'duplicate-recent';
  method: string;
  url: string;
  /** The earlier request, already settled. */
  previous: TrackedRequest;
  /** The new request that repeated it. */
  current: TrackedRequest;
  gapMs: number;
}

export interface SequentialChainIssue extends IssueBase {
  kind: 'sequential-chain';
  /** The requests that make up the chain, in order. */
  requests: TrackedRequest[];
  /** Total wall-clock time spent serialized, start of first to end of last. */
  totalGapMs: number;
}

export interface RapidCallsIssue extends IssueBase {
  kind: 'rapid-calls';
  method: string;
  /** The path shared by every call in this burst (query string and fragment stripped). */
  path: string;
  /** The calls that make up this burst, oldest first — each has a different query string. */
  requests: TrackedRequest[];
  /** Wall-clock span from the first call in the burst to the one that crossed the threshold. */
  windowMs: number;
}

export interface NPlusOneIssue extends IssueBase {
  kind: 'n-plus-one';
  method: string;
  /** The shared route shape, id-like segments collapsed to `:id` — e.g. `/api/users/:id`. */
  pathTemplate: string;
  /** The calls that make up this burst, oldest first — each hits a different concrete URL. */
  requests: TrackedRequest[];
  /** Wall-clock span from the first call in the burst to the one that crossed the threshold. */
  windowMs: number;
}

export type Issue =
  DuplicateInflightIssue | DuplicateRecentIssue | SequentialChainIssue | RapidCallsIssue | NPlusOneIssue;

export type IgnoreMatcher = string | RegExp | ((url: string, method: string) => boolean);

/** Raw (unnormalized) request info passed to a custom `buildKey`. */
export interface BuildKeyRequest {
  method: string;
  url: string;
  body: unknown;
  /**
   * Lower-cased header names. For fetch, combines a `Request` object's own headers with
   * `init.headers` (the latter wins on conflict, matching real `fetch` behavior). For XHR,
   * only headers set via `setRequestHeader` — not ones the browser adds automatically, like
   * `Content-Length`.
   */
  headers: Record<string, string>;
}

export interface WdyfOptions {
  /**
   * Turn the whole thing on/off. Defaults to `true` unless `process.env.NODE_ENV === 'production'`
   * (when that variable is readable), so it's safe to call `init()` unconditionally and let it
   * no-op in production builds.
   */
  enabled?: boolean;
  /** Which network APIs to patch. Defaults to both. */
  patch?: Array<'fetch' | 'xhr'>;
  /**
   * If an identical request (method + url + body) completes and then fires again within this
   * many milliseconds, it's flagged as a probably-avoidable duplicate. Default: 2000.
   */
  dedupeWindowMs?: number;
  /**
   * Maximum gap (ms) between one request settling and the next starting for them to be
   * considered part of the same "back-to-back" chain. Default: 10.
   */
  chainGapMs?: number;
  /**
   * How many requests must chain back-to-back before it's reported as a likely waterfall.
   * Default: 3.
   */
  chainMinLength?: number;
  /** URLs matching any of these are never tracked or reported. */
  ignore?: IgnoreMatcher[];
  /**
   * Rewrite a URL before it's used for duplicate matching — e.g. to strip cache-busting
   * query params. Does not affect the actual request or the URL shown in reports.
   */
  normalizeUrl?: (url: string) => string;
  /**
   * Called with every detected issue. Defaults to a console reporter. Provide your own to
   * ship issues elsewhere (e.g. an on-page overlay, or your analytics).
   */
  onIssue?: (issue: Issue) => void;
  /** How long settled requests are kept around for dedupe/chain comparisons. Default: 5000. */
  retainMs?: number;
  /**
   * A request that never settles (a hung connection, one swallowed by a service worker) is
   * stopped tracking after this long, so it can't leak memory or permanently flag every future
   * identical request as a duplicate. Default: 60000 (1 minute).
   */
  maxInflightAgeMs?: number;
  /**
   * Rolling window (ms) for the `rapid-calls` detector: this many calls to the same method +
   * path (query string ignored) within this window — each with a *different* query string, so
   * it doesn't overlap with duplicate-inflight/duplicate-recent — is reported as likely
   * unthrottled input (e.g. a search box firing on every keystroke). Default: 1000.
   */
  rapidCallWindowMs?: number;
  /** How many calls within `rapidCallWindowMs` trigger the `rapid-calls` detector. Default: 5. */
  rapidCallMinCount?: number;
  /**
   * Rolling window (ms) for the `n-plus-one` detector: this many calls to the same method +
   * route shape (id-like path segments collapsed, e.g. `/api/users/:id`) within this window —
   * each to a *different* concrete URL, so it doesn't overlap with `rapid-calls` — is reported
   * as likely "N+1": a list rendering many rows that each fetch their own record instead of one
   * batched request. Default: 500 (tighter than `rapidCallWindowMs`, since a render pass's
   * fetches typically fire within the same tick, not spread out like keystrokes).
   */
  nPlusOneWindowMs?: number;
  /** How many distinct-URL calls within `nPlusOneWindowMs` trigger the `n-plus-one` detector. Default: 5. */
  nPlusOneMinCount?: number;
  /**
   * Skip requests made with `fetch(url, { keepalive: true })` — analytics/beacon calls fired on
   * page unload are usually intentional and repetitive by design. XHR has no equivalent flag.
   * Default: true.
   */
  ignoreKeepalive?: boolean;
  /**
   * Transform a request body before it's used for duplicate matching — e.g. to strip a volatile
   * field (a trace id, a timestamp) so two otherwise-identical bodies are recognized as the same
   * request. Does not affect the actual request body sent. Default: identity (no change).
   */
  normalizeBody?: (body: unknown) => unknown;
  /**
   * Fully overrides how the duplicate-matching key is computed, given the raw method, URL,
   * body, and headers of a request — e.g. to fold an auth token or tenant header into the
   * signature, or to ignore a header-only difference the default method+URL+body signature
   * would otherwise treat as a different request. When provided, this replaces the default
   * signature entirely — `normalizeUrl`/`normalizeBody` are not applied unless you apply them
   * yourself inside `buildKey`. Default: undefined (use the built-in method+url+body signature).
   */
  buildKey?: (req: BuildKeyRequest) => string;
}

export type ResolvedWdyfOptions = Required<Omit<WdyfOptions, 'buildKey'>> & Pick<WdyfOptions, 'buildKey'>;
