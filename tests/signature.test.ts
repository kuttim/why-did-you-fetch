import { describe, expect, it } from 'vitest';
import { buildSignature, hashBody } from '../src/signature.js';

describe('hashBody', () => {
  it('returns null for no body', () => {
    expect(hashBody(undefined)).toBeNull();
    expect(hashBody(null)).toBeNull();
  });

  it('hashes identical strings to the same value', () => {
    expect(hashBody('{"id":1}')).toBe(hashBody('{"id":1}'));
  });

  it('hashes different strings to different values', () => {
    expect(hashBody('{"id":1}')).not.toBe(hashBody('{"id":2}'));
  });

  it('hashes plain objects by their JSON representation', () => {
    expect(hashBody({ id: 1 })).toBe(hashBody({ id: 1 }));
    expect(hashBody({ id: 1 })).not.toBe(hashBody({ id: 2 }));
  });

  it('hashes URLSearchParams consistently regardless of instance', () => {
    const a = new URLSearchParams('a=1&b=2');
    const b = new URLSearchParams('a=1&b=2');
    expect(hashBody(a)).toBe(hashBody(b));
  });

  it('hashes FormData by its entries, order-independent', () => {
    const a = new FormData();
    a.append('a', '1');
    a.append('b', '2');
    const b = new FormData();
    b.append('b', '2');
    b.append('a', '1');
    expect(hashBody(a)).toBe(hashBody(b));
  });

  it('hashes a FormData file entry by name/size/lastModified, not content', () => {
    const a = new FormData();
    a.append('avatar', new File(['x'], 'a.png', { type: 'image/png', lastModified: 1000 }));
    const b = new FormData();
    b.append('avatar', new File(['x'], 'a.png', { type: 'image/png', lastModified: 1000 }));
    const c = new FormData();
    c.append('avatar', new File(['x'], 'b.png', { type: 'image/png', lastModified: 1000 }));
    expect(hashBody(a)).toBe(hashBody(b));
    expect(hashBody(a)).not.toBe(hashBody(c));
  });

  it('hashes a Blob by type and size', () => {
    const a = new Blob(['hello'], { type: 'text/plain' });
    const b = new Blob(['hello'], { type: 'text/plain' });
    const c = new Blob(['hello world'], { type: 'text/plain' });
    expect(hashBody(a)).toBe(hashBody(b));
    expect(hashBody(a)).not.toBe(hashBody(c));
  });

  it('hashes an ArrayBuffer by byte length', () => {
    expect(hashBody(new ArrayBuffer(8))).toBe(hashBody(new ArrayBuffer(8)));
    expect(hashBody(new ArrayBuffer(8))).not.toBe(hashBody(new ArrayBuffer(16)));
  });

  it('hashes a typed array view by byte length', () => {
    expect(hashBody(new Uint8Array(4))).toBe(hashBody(new Uint8Array(4)));
    expect(hashBody(new Uint8Array(4))).not.toBe(hashBody(new Uint8Array(8)));
  });

  it('falls back to String(body) when JSON.stringify throws (e.g. a circular object)', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => hashBody(circular)).not.toThrow();
    expect(typeof hashBody(circular)).toBe('string');
  });
});

describe('buildSignature', () => {
  it('combines method, url and body hash', () => {
    expect(buildSignature('get', '/a', 'xyz')).toBe('GET /a xyz');
  });

  it('treats a missing body hash as empty', () => {
    expect(buildSignature('GET', '/a', null)).toBe('GET /a ');
  });

  it('differs for different methods on the same url', () => {
    expect(buildSignature('GET', '/a', null)).not.toBe(buildSignature('POST', '/a', null));
  });
});
