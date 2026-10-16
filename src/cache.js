const MAX_ENTRIES = 256;
const MAX_RETAINED_CHARS = 1000000;

/**
 * Bound cached data by both entry count and estimated retained string size.
 * @template T
 * @param {(value: T) => number} sizeOf
 */
export function createCache(sizeOf) {
  const entries = new Map();
  let size = 0;
  function remove(key) {
    const entry = entries.get(key);
    if (entry) {
      size -= entry.size;
      entries.delete(key);
    }
  }
  return {
    has: (key) => entries.has(key),
    get: (key) => entries.get(key)?.value,
    clear() {
      entries.clear();
      size = 0;
    },
    /** @param {string} key @param {T} value */
    set(key, value) {
      remove(key);
      const weight = key.length + sizeOf(value);
      if (weight > MAX_RETAINED_CHARS) return;
      entries.set(key, { value, size: weight });
      size += weight;
      while (entries.size > MAX_ENTRIES || size > MAX_RETAINED_CHARS)
        remove(entries.keys().next().value);
    },
  };
}
