/**
 * Small, fast, non-cryptographic string hash (FNV-1a, 32-bit). We only need this to collapse
 * a request body down to something cheap to compare and store — collisions are acceptable in
 * the rare case, since the worst outcome is a missed or spurious duplicate warning, not a
 * correctness bug.
 */
export function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}
