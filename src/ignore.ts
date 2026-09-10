import type { IgnoreMatcher } from './types.js';

export function shouldIgnore(url: string, method: string, matchers: IgnoreMatcher[]): boolean {
  return matchers.some((matcher) => {
    if (typeof matcher === 'string') return url.includes(matcher);
    if (matcher instanceof RegExp) {
      // A global/sticky regex is stateful (lastIndex) and reused across every request, so it
      // must be reset before each test or it silently misses every other match.
      matcher.lastIndex = 0;
      return matcher.test(url);
    }
    return matcher(url, method);
  });
}
