type SupabaseRangeResult<TRow> = {
  data: TRow[] | null
  error: Error | { message?: string } | null
}

type SupabaseRangeQuery<TRow> = {
  range(from: number, to: number): PromiseLike<SupabaseRangeResult<TRow>>
}

const DEFAULT_PAGE_SIZE = 1000

function normalizeSupabaseError(error: Error | { message?: string }): Error {
  return error instanceof Error ? error : new Error(error.message || "Supabase query failed")
}

export async function fetchAllSupabaseRows<TRow>(
  createQuery: () => SupabaseRangeQuery<TRow>,
  options: { pageSize?: number } = {}
): Promise<TRow[]> {
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE
  const rows: TRow[] = []

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await createQuery().range(offset, offset + pageSize - 1)

    if (error) {
      throw normalizeSupabaseError(error)
    }

    const page = data ?? []
    rows.push(...page)

    if (page.length < pageSize) {
      return rows
    }
  }
}
