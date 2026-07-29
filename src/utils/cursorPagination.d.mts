export function encodeCursor(lastId: string): string | null;
export function decodeCursor(cursor: string | null | undefined): string | null;
export function paginateByCursor<T>(
  items: T[],
  options: { cursor?: string | null; limit: number; idOf: (item: T) => string },
): { items: T[]; nextCursor: string | null; hasMore: boolean };
