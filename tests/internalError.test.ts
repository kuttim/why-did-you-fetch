import { afterEach, describe, expect, it, vi } from 'vitest';
import { reportInternalError } from '../src/utils/internalError.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('reportInternalError', () => {
  it('logs a message pointing at the issue tracker, with the context and error', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const err = new Error('boom');

    reportInternalError('patchFetch', err);

    expect(consoleError).toHaveBeenCalledTimes(1);
    const [message, details] = consoleError.mock.calls[0]!;
    expect(message).toContain('why-did-you-fetch error in patchFetch');
    expect(message).toContain('https://github.com/kuttim/why-did-you-fetch/issues');
    expect(details).toEqual({ error: err });
  });
});
