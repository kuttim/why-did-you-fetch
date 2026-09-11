import { describe, expect, it } from 'vitest';
import { headersToRecord } from '../src/utils/headers.js';

describe('headersToRecord', () => {
  it('returns an empty record for null/undefined', () => {
    expect(headersToRecord(null)).toEqual({});
    expect(headersToRecord(undefined)).toEqual({});
  });

  it('lower-cases keys from a plain object', () => {
    expect(headersToRecord({ 'X-Tenant-Id': 'a' })).toEqual({ 'x-tenant-id': 'a' });
  });

  it('lower-cases keys from an array of tuples', () => {
    expect(
      headersToRecord([
        ['X-Tenant-Id', 'a'],
        ['Accept', 'json'],
      ]),
    ).toEqual({ 'x-tenant-id': 'a', accept: 'json' });
  });

  it('reads a Headers instance', () => {
    const headers = new Headers();
    headers.set('X-Tenant-Id', 'a');
    expect(headersToRecord(headers)).toEqual({ 'x-tenant-id': 'a' });
  });
});
