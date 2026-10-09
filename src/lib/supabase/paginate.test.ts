import { describe, expect, it, vi } from "vitest";

import { fetchAllRows } from "./paginate";

function source(total: number) {
  const rows = Array.from({ length: total }, (_, i) => i);
  return vi.fn(async (from: number, to: number) => ({
    data: rows.slice(from, to + 1),
    error: null,
  }));
}

describe("fetchAllRows", () => {
  it.each([0, 1, 999, 1000, 1001, 2500])(
    "returns all %d rows",
    async (total) => {
      const fetchPage = source(total);
      const rows = await fetchAllRows(fetchPage, 1000);
      expect(rows).toHaveLength(total);
      expect(rows.at(-1)).toBe(total === 0 ? undefined : total - 1);
    },
  );

  it("requests consecutive, non-overlapping ranges", async () => {
    const fetchPage = source(2500);
    await fetchAllRows(fetchPage, 1000);
    expect(fetchPage.mock.calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it("throws instead of returning partial data", async () => {
    let call = 0;
    const failing = async () =>
      call++ === 0
        ? { data: Array.from({ length: 10 }, () => 1), error: null }
        : { data: null, error: { message: "timeout" } };
    await expect(fetchAllRows(failing, 10)).rejects.toThrow("timeout");
  });
});
