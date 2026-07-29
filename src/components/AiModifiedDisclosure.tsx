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
          if (lastPointerTypeRef.current === "touch") onActiveChange(!active);
          else onActiveChange(true);
        }}
      >
        <IconSparkles size={12} stroke={2} aria-hidden />
        Modified by AI
      </button>
      <span id={descriptionId} className="ai-edit-sr-only">
        Hover or focus to show tracked edits directly in this post.
        {editSummary ? ` ${editSummary}` : ""}
      </span>
    </span>
  );
}
