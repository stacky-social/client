import React from "react";

/**
 * Tooltip for a highlighted span in a related card or a reply: "N more <Topic>"
 * (the click shows them; that it is clickable is implied by the tooltip and
 * cursor). "0 more <Topic>" pairs with a plain cursor: the click does nothing.
 * While a grouping is active, the grouped topic reads "Showing <Topic>" and
 * other topics retain their count so switching groups previews the same action.
 */
export function buildTooltipLabel(
  topic: string | undefined,
  otherCount: number | undefined,
  textColor: string,
  activeTopic: string | null = null,
): React.ReactNode | null {
  if (!topic) return null;
  const name = <strong style={{ color: textColor, fontWeight: 700 }}>{topic}</strong>;
  return (
    <span style={{ fontWeight: 400 }}>
      {activeTopic === topic ? 'Showing ' : `${otherCount ?? 0} more `}{name}
    </span>
  );
}

/** True when clicking the span does something (see the "0 more" no-op). */
export function spanIsActionable(otherCount: number, topic: string | undefined, activeTopic: string | null): boolean {
  if (activeTopic !== null) return activeTopic !== topic;
  return otherCount > 0;
}
