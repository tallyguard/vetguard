/**
 * Runs `fn` over `items` with at most `limit` in flight at once. Order of the
 * returned array matches the input. Keeps registry lookups from stampeding the
 * network on a large dependency tree, dependency-free.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  const effectiveLimit = Math.max(1, Math.min(limit, items.length));
  let next = 0;

  async function worker(): Promise<void> {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index] as T, index);
    }
  }

  await Promise.all(Array.from({ length: effectiveLimit }, () => worker()));
  return results;
}
