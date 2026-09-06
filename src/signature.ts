import { fnv1a } from './utils/hash.js';

/**
 * Best-effort, synchronous fingerprint of a request body. We deliberately avoid reading
 * streams or async-only sources (that would mean consuming the body before the real fetch
 * gets to it) — those bodies just hash as their type name, which still lets two truly
 * identical calls with, say, the same FormData collide.
 */
export function hashBody(body: unknown): string | null {
  if (body == null) return null;

  if (typeof body === 'string') {
    return fnv1a(body);
  }

  if (body instanceof URLSearchParams) {
    return fnv1a(body.toString());
  }

  if (typeof FormData !== 'undefined' && body instanceof FormData) {
    const parts: string[] = [];
    body.forEach((value, key) => {
      if (typeof value === 'string') {
        parts.push(`${key}=${value}`);
      } else {
        // File/Blob entry — fingerprint by shape, not content, to stay synchronous.
        const file = value as File;
        parts.push(`${key}=<file:${file.name ?? ''}:${file.size ?? ''}:${file.lastModified ?? ''}>`);
      }
    });
    parts.sort();
    return fnv1a(parts.join('&'));
  }

  if (typeof Blob !== 'undefined' && body instanceof Blob) {
    return fnv1a(`<blob:${body.type}:${body.size}>`);
  }

  if (body instanceof ArrayBuffer) {
    return fnv1a(`<arraybuffer:${body.byteLength}>`);
  }

  if (ArrayBuffer.isView(body)) {
    return fnv1a(`<typedarray:${body.byteLength}>`);
  }

  try {
    return fnv1a(JSON.stringify(body));
  } catch {
    return fnv1a(String(body));
  }
}

/** Builds the identity used to decide whether two requests are "the same" request. */
export function buildSignature(method: string, normalizedUrl: string, bodyHash: string | null): string {
  return `${method.toUpperCase()} ${normalizedUrl} ${bodyHash ?? ''}`;
}
