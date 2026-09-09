import { describe, expect, it } from 'vitest';
import { stripQueryAndHash, templatePath } from '../src/utils/path.js';

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

describe('templatePath', () => {
  it('collapses a numeric id segment', () => {
    expect(templatePath('/api/users/42')).toBe('/api/users/:id');
  });

  it('collapses a UUID segment', () => {
    expect(templatePath('/api/orders/550e8400-e29b-41d4-a716-446655440000')).toBe('/api/orders/:id');
  });

  it('collapses a Mongo-style ObjectId segment', () => {
    expect(templatePath('/api/posts/507f1f77bcf86cd799439011')).toBe('/api/posts/:id');
  });

  it('collapses multiple id segments in one path', () => {
    expect(templatePath('/api/users/42/orders/7')).toBe('/api/users/:id/orders/:id');
  });

  it('leaves a slug-like segment alone', () => {
    expect(templatePath('/posts/hello-world')).toBe('/posts/hello-world');
  });

  it('leaves a path with no id-like segments unchanged', () => {
    expect(templatePath('/api/users')).toBe('/api/users');
  });
});
