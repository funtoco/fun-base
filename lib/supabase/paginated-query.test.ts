import { describe, expect, test } from "vitest"

import { fetchAllSupabaseRows } from "./paginated-query"

type RangeCall = { from: number; to: number }

function createRows(count: number) {
  return Array.from({ length: count }, (_, index) => ({ id: index + 1 }))
}

describe("fetchAllSupabaseRows", () => {
  test("fetches every page until the final partial page", async () => {
    const rows = createRows(205)
    const ranges: RangeCall[] = []

    const result = await fetchAllSupabaseRows(
      () => ({
        async range(from: number, to: number) {
          ranges.push({ from, to })
          return { data: rows.slice(from, to + 1), error: null }
        },
      }),
      { pageSize: 100 }
    )

    expect(result).toEqual(rows)
    expect(ranges).toEqual([
      { from: 0, to: 99 },
      { from: 100, to: 199 },
      { from: 200, to: 299 },
    ])
  })

  test("continues past Supabase's default 1000 row response window", async () => {
    const rows = createRows(1380)

    const result = await fetchAllSupabaseRows(
      () => ({
        async range(from: number, to: number) {
          return { data: rows.slice(from, to + 1), error: null }
        },
      }),
      { pageSize: 1000 }
    )

    expect(result).toHaveLength(1380)
    expect(result.at(-1)).toEqual({ id: 1380 })
  })

  test("throws the Supabase error from any page", async () => {
    await expect(
      fetchAllSupabaseRows(
        () => ({
          async range(from: number) {
            if (from >= 100) {
              return { data: null, error: new Error("boom") }
            }
            return { data: createRows(100), error: null }
          },
        }),
        { pageSize: 100 }
      )
    ).rejects.toThrow("boom")
  })
})
