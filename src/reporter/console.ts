import type { Issue } from '../types.js';

const BADGE_STYLE: Record<Issue['kind'], string> = {
  'duplicate-inflight': 'background:#e11d48;color:#fff;padding:2px 6px;border-radius:3px;font-weight:bold',
  'duplicate-recent': 'background:#d97706;color:#fff;padding:2px 6px;border-radius:3px;font-weight:bold',
  'sequential-chain': 'background:#2563eb;color:#fff;padding:2px 6px;border-radius:3px;font-weight:bold',
  'rapid-calls': 'background:#7c3aed;color:#fff;padding:2px 6px;border-radius:3px;font-weight:bold',
};

const LABEL: Record<Issue['kind'], string> = {
  'duplicate-inflight': 'DUPLICATE (in-flight)',
  'duplicate-recent': 'DUPLICATE (recent)',
  'sequential-chain': 'SEQUENTIAL CHAIN',
  'rapid-calls': 'RAPID CALLS',
};

/**
 * The default reporter: a collapsed, color-badged console group per issue, with the relevant
 * call stacks logged underneath so you can jump straight to the offending code.
 */
export function consoleReporter(issue: Issue): void {
  const canGroup = typeof console.groupCollapsed === 'function';
  const log = canGroup ? console.groupCollapsed : console.log;
  log(`%c${LABEL[issue.kind]}%c ${issue.message}`, BADGE_STYLE[issue.kind], '');

  switch (issue.kind) {
    case 'duplicate-inflight':
      console.log('First call:');
      console.log(issue.first.stack);
      console.log('Duplicate call:');
      console.log(issue.second.stack);
      break;
    case 'duplicate-recent':
      console.log(`Previous call finished ${Math.round(issue.gapMs)}ms ago.`);
      console.log('Previous call:');
      console.log(issue.previous.stack);
      console.log('Repeated call:');
      console.log(issue.current.stack);
      break;
    case 'sequential-chain':
      issue.requests.forEach((req, i) => {
        console.log(`${i + 1}. ${req.method} ${req.url}`);
        console.log(req.stack);
      });
      break;
    case 'rapid-calls':
      issue.requests.forEach((req, i) => {
        console.log(`${i + 1}. ${req.url}`);
        console.log(req.stack);
      });
      break;
  }

  if (canGroup) console.groupEnd();
}
