import { describe, expect, it } from 'vitest';
import { describeCacheFreshness } from '../src/utils/cacheFreshness.js';

describe('describeCacheFreshness', () => {
  it('returns null when there is no Cache-Control header', () => {
    expect(describeCacheFreshness(null, 100)).toBeNull();
  });

  it('flags a still-fresh max-age response', () => {
    const msg = describeCacheFreshness('max-age=60', 500);
    expect(msg).toContain('cacheable for 60s');
  });

  it('does not flag a max-age response once it has gone stale', () => {
    expect(describeCacheFreshness('max-age=1', 5000)).toBeNull();
  });

  it('calls out a no-store response instead of suggesting caching', () => {
    const msg = describeCacheFreshness('no-store', 500);
    expect(msg).toContain('no-store');
    expect(msg).toContain('deduplicating in-flight');
  });

  it('calls out a no-cache response the same way', () => {
    expect(describeCacheFreshness('no-cache', 500)).toContain('no-cache');
  });

  it('returns null for a Cache-Control value with no directive it specifically calls out', () => {
    expect(describeCacheFreshness('private', 500)).toBeNull();
  });
});
