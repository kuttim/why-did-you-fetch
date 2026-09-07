import { describe, expect, it } from 'vitest';
import { captureStack } from '../src/utils/stack.js';

describe('captureStack', () => {
  it('returns a lazy thunk, not a string', () => {
    const stack = captureStack();
    expect(typeof stack).toBe('function');
  });

  it('formats to a string only when called, and caches the result', () => {
    const stack = captureStack();
    const first = stack();
    const second = stack();
    expect(typeof first).toBe('string');
    expect(first).toBe(second); // same cached string instance, not reformatted each call
  });

  it('strips frames mentioning its own internal modules', () => {
    const stack = captureStack();
    expect(stack()).not.toMatch(/captureStack/);
  });

  it('strips a frame from a function literally named patchFetch', () => {
    function patchFetch() {
      return captureStack();
    }
    const stack = patchFetch();
    expect(stack()).not.toMatch(/\bpatchFetch\b/);
  });
});
