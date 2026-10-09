/**
 * PostgREST caps responses (1000 rows by default) and truncates silently.
 * Scores computed from a truncated event list would be wrong without any
 * error, so every unbounded list read goes through this helper.
 *
 * `fetchPage` must apply a deterministic order (e.g. by id) so pages don't
 * overlap or skip rows.
 */
export async function fetchAllRows<T>(
  fetchPage: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 1000,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) throw new Error(`Failed to load rows: ${error.message}`);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}
