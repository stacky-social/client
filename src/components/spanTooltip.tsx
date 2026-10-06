import React from "react";

/**
 * Tooltip for a highlighted span in a related card or a reply. It says what a
 * click will do, so spans are discoverable and a dead click is never a
 * surprise:
 *   - "Click to show N more posts on <Topic>": the click groups those posts
 *   - "No other posts on <Topic>": nothing to group, the click does nothing
 *   - "Showing <Topic>": that topic is already the active grouping (no-op)
 *   - "Click to group by <Topic>": another topic is active, so a count for
 *     this one would be misleading
 */
export function buildTooltipLabel(
  topic: string | undefined,
  otherCount: number | undefined,
  textColor: string,
  activeTopic: string | null = null,
): React.ReactNode | null {
  if (!topic) return null;
  const name = <strong style={{ color: textColor }}>{topic}</strong>;
  if (activeTopic !== null && activeTopic === topic) return <>Showing {name}</>;
  if (activeTopic !== null) return <>Click to group by {name}</>;
  const count = otherCount ?? 0;
  if (count === 0) return <>No other posts on {name}</>;
  return <>Click to show {count} more post{count === 1 ? "" : "s"} on {name}</>;
}

/** True when clicking the span does something (see the "0 more" no-op). */
export function spanIsActionable(otherCount: number, topic: string | undefined, activeTopic: string | null): boolean {
  if (activeTopic !== null) return activeTopic !== topic;
  return otherCount > 0;
}
