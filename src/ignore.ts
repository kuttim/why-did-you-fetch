import type { IgnoreMatcher } from './types.js';

export function shouldIgnore(url: string, method: string, matchers: IgnoreMatcher[]): boolean {
  return matchers.some((matcher) => {
    if (typeof matcher === 'string') return url.includes(matcher);
    if (matcher instanceof RegExp) return matcher.test(url);
    return matcher(url, method);
  });
}
