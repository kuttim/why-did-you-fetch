import { describe, expect, it } from 'vitest';
import { shouldIgnore } from '../src/ignore.js';

describe('shouldIgnore', () => {
  it('matches a string substring', () => {
    expect(shouldIgnore('/api/analytics/ping', 'GET', ['/analytics'])).toBe(true);
    expect(shouldIgnore('/api/users/1', 'GET', ['/analytics'])).toBe(false);
  });

  it('matches a RegExp', () => {
    expect(shouldIgnore('/health-check', 'GET', [/\/health-?check/i])).toBe(true);
    expect(shouldIgnore('/HealthCheck', 'GET', [/\/health-?check/i])).toBe(true); // case-insensitive, dash optional
    expect(shouldIgnore('/users/1', 'GET', [/\/health-?check/i])).toBe(false);
  });

  it('matches a custom predicate function, passing url and method through', () => {
    const seen: Array<[string, string]> = [];
    const matcher = (url: string, method: string) => {
      seen.push([url, method]);
      return method === 'GET' && url.endsWith('.png');
    };
    expect(shouldIgnore('/logo.png', 'GET', [matcher])).toBe(true);
    expect(shouldIgnore('/logo.png', 'POST', [matcher])).toBe(false);
    expect(seen).toEqual([
      ['/logo.png', 'GET'],
      ['/logo.png', 'POST'],
    ]);
  });

  it('returns false when there are no matchers', () => {
    expect(shouldIgnore('/anything', 'GET', [])).toBe(false);
  });

  it('matches every call with a global/sticky RegExp, not just every other one', () => {
    const matcher = /\/health-?check/gi;
    for (let i = 0; i < 4; i++) {
      expect(shouldIgnore('/health-check', 'GET', [matcher])).toBe(true);
    }
  });

  it('matches if any matcher in a mixed list matches', () => {
    const matchers = ['/analytics', /\/health-?check/i, (url: string) => url === '/exact'];
    expect(shouldIgnore('/exact', 'GET', matchers)).toBe(true);
    expect(shouldIgnore('/healthcheck', 'GET', matchers)).toBe(true);
    expect(shouldIgnore('/nope', 'GET', matchers)).toBe(false);
  });
});
