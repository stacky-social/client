export function trailingEllipsisCover(
  glyphs: ReadonlyArray<{ left: number; right: number; spaceBefore?: boolean }>,
  lineRight: number,
  ellipsisWidth: number,
): { coverFrom: number; left: number } | null;
