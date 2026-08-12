export function weaveTimeline<T extends { postId: string }>(
  primary: T[],
  supplemental: T[],
  primaryRun?: number,
): T[];
