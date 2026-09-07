import { describe, expect, it } from 'vitest';
import { stripQueryAndHash } from '../src/utils/path.js';

describe('stripQueryAndHash', () => {
  it('strips a query string', () => {
    expect(stripQueryAndHash('/search?q=a')).toBe('/search');
  });

  it('strips a fragment', () => {
    expect(stripQueryAndHash('/page#section')).toBe('/page');
  });

  it('strips both a query string and a trailing fragment', () => {
    expect(stripQueryAndHash('/search?q=a#top')).toBe('/search');
  });

  it('leaves a plain path unchanged', () => {
    expect(stripQueryAndHash('/users/1')).toBe('/users/1');
  });

  it('works on absolute URLs', () => {
    expect(stripQueryAndHash('https://api.example.com/search?q=a')).toBe('https://api.example.com/search');
  });
});
