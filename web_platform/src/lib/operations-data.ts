type PageResult = { data: unknown[] | null; error: { message: string } | null };

// Fetch all pages for aggregate displays rather than silently stopping at max_rows.
export async function readAllOperationsRows(fetchPage: (start: number, end: number) => PromiseLike<PageResult>) {
  const data: unknown[] = [];
  const pageSize = 500;
  for (let start = 0; ; start += pageSize) {
    const result = await fetchPage(start, start + pageSize - 1);
    if (result.error) throw result.error;
    const rows = result.data || [];
    data.push(...rows);
    if (rows.length < pageSize) return { data, error: null };
  }
}
