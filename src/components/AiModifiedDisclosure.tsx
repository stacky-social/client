"use client";

import React, { useEffect, useId, useRef } from "react";
import { IconSparkles } from "@tabler/icons-react";

type AiModifiedDisclosureProps = {
  active: boolean;
  editSummary?: string;
  onActiveChange: (active: boolean) => void;
};

/** Controls the in-card track-changes layer without opening a tooltip. */
export default function AiModifiedDisclosure({
  active,
  editSummary,
  onActiveChange,
}: AiModifiedDisclosureProps) {
  const descriptionId = useId();
  const lastPointerTypeRef = useRef<string | null>(null);
  const activeAtPointerDownRef = useRef(active);

  useEffect(() => {
    if (!active) return;
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onActiveChange(false);
    };
    document.addEventListener("keydown", dismissOnEscape);
    return () => document.removeEventListener("keydown", dismissOnEscape);
  }, [active, onActiveChange]);

  return (
    <span
      className="ai-edit-disclosure"
      data-ai-edit
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => {
        lastPointerTypeRef.current = event.pointerType;
        // Touching a button also focuses it before `click`, and focus reveals
        // the diff. Preserve the pre-gesture state so that focus cannot turn a
        // first tap into an accidental reveal-then-hide toggle.
        activeAtPointerDownRef.current = active;
      }}
      onPointerEnter={(event) => {
        if (event.pointerType !== "touch") onActiveChange(true);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType !== "touch") onActiveChange(false);
      }}
      onFocus={() => onActiveChange(true)}
      onBlur={() => onActiveChange(false)}
    >
      <button
        type="button"
        className="ai-edit-badge"
        aria-pressed={active}
        aria-describedby={descriptionId}
        onClick={(event) => {
          event.stopPropagation();
          const pointerType = lastPointerTypeRef.current;
          // Do not let a previous finger gesture misclassify a later keyboard
          // activation, whose synthesized click has no preceding pointerdown.
          lastPointerTypeRef.current = null;
          if (pointerType === "touch" && event.detail > 0) {
            onActiveChange(!activeAtPointerDownRef.current);
          }
          else onActiveChange(true);
        }}
      >
        <IconSparkles size={12} stroke={2} aria-hidden />
        Modified by AI
      </button>
      <span id={descriptionId} className="ai-edit-sr-only">
        This post shows the edited wording by default. Hover or focus to reveal
        additions and removals directly in place.
        {editSummary ? ` ${editSummary}` : ""}
      </span>
    </span>
  );
}
