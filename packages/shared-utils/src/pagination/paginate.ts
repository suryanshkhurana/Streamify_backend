export interface PaginationInput {
  page?: number | string;
  limit?: number | string;
}

export interface PaginationResult {
  page: number;
  limit: number;
  skip: number;
}

/**
 * Parse and normalise pagination query params.
 * Defaults: page = 1, limit = 20, max limit = 100.
 */
export function paginate(
  input: PaginationInput = {},
  maxLimit = 100,
): PaginationResult {
  const page = Math.max(1, parseInt(String(input.page ?? 1), 10) || 1);
  const limit = Math.min(
    maxLimit,
    Math.max(1, parseInt(String(input.limit ?? 20), 10) || 20),
  );
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}
