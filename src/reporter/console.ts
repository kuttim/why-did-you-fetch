import type { Issue, TrackedRequest } from '../types';

const ACCENT: Record<Issue['kind'], string> = {
  'duplicate-inflight': '#e11d48',
  'duplicate-recent': '#d97706',
  'sequential-chain': '#2563eb',
  'rapid-calls': '#7c3aed',
  'n-plus-one': '#059669',
};

const LABEL: Record<Issue['kind'], string> = {
  'duplicate-inflight': 'DUPLICATE (in-flight)',
  'duplicate-recent': 'DUPLICATE (recent)',
  'sequential-chain': 'SEQUENTIAL CHAIN',
  'rapid-calls': 'RAPID CALLS',
  'n-plus-one': 'N+1',
};

const badgeStyle = (color: string): string =>
  `background:${color};color:#fff;padding:2px 6px;border-radius:3px;font-weight:bold`;
const labelStyle = (color: string): string => `color:${color};font-weight:700`;
const BRAND_STYLE = 'color:#6b7280;font-weight:600';

const canGroup = (): boolean => typeof console.groupCollapsed === 'function';

/** A collapsed sub-group (falls back to a plain labeled log) holding one call site's stack. */
function stackGroup(label: string, color: string, stack: string): void {
  const log = canGroup() ? console.groupCollapsed : console.log;
  log(`%c${label}`, labelStyle(color));
  console.log(stack);
  if (canGroup()) console.groupEnd();
}

/** `console.table` of method + URL when available, falling back to a plain numbered list. */
function requestTable(requests: TrackedRequest[]): void {
  if (typeof console.table === 'function') {
    console.table(requests.map((r) => ({ Method: r.method, URL: r.url })));
  } else {
    requests.forEach((r, i) => console.log(`${i + 1}. ${r.method} ${r.url}`));
  }
}

/**
 * The default reporter: a collapsed, color-badged console group per issue, prefixed with the
 * library's own name — so in a real app's console, shared with whatever else is logging things,
 * it's obvious at a glance where the warning came from without expanding anything. A quick
 * `console.table` for issues with several requests, then each call site's stack tucked into its
 * own collapsed sub-group — so you can jump straight to the offending code without a wall of
 * stack trace text pushing everything else out of view.
 */
export function consoleReporter(issue: Issue): void {
  const color = ACCENT[issue.kind];
  const log = canGroup() ? console.groupCollapsed : console.log;
  log(`%cwhy-did-you-fetch%c %c${LABEL[issue.kind]}%c ${issue.message}`, BRAND_STYLE, '', badgeStyle(color), '');

  switch (issue.kind) {
    case 'duplicate-inflight':
      stackGroup('First call', color, issue.first.stack);
      stackGroup('Duplicate call', color, issue.second.stack);
      break;
    case 'duplicate-recent':
      console.log(`Previous call finished ${Math.round(issue.gapMs)}ms ago.`);
      stackGroup('Previous call', color, issue.previous.stack);
      stackGroup('Repeated call', color, issue.current.stack);
      break;
    case 'sequential-chain':
    case 'rapid-calls':
    case 'n-plus-one':
      requestTable(issue.requests);
      issue.requests.forEach((req, i) => stackGroup(`${i + 1}. ${req.method} ${req.url}`, color, req.stack));
      break;
  }

  if (canGroup()) console.groupEnd();
}
