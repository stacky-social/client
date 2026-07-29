"use client";

import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { IconSparkles } from "@tabler/icons-react";
import { createWordDiffExcerpt } from "../utils/wordDiff.mjs";

type AiModifiedDisclosureProps = {
  originalContent: string;
  rewrittenContent: string;
  editSummary?: string;
};

/** Editorial track-changes disclosure used only on compact related-post cards. */
export default function AiModifiedDisclosure({
  originalContent,
  rewrittenContent,
  editSummary,
}: AiModifiedDisclosureProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const popoverId = useId();
  const diff = useMemo(
    () => createWordDiffExcerpt(originalContent, rewrittenContent),
    [originalContent, rewrittenContent],
  );

  useEffect(() => {
    if (!open) return;
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", dismissOnEscape);
    return () => document.removeEventListener("keydown", dismissOnEscape);
  }, [open]);

  return (
    <div
      ref={rootRef}
      className="ai-edit-disclosure"
      data-ai-edit
      onClick={(event) => event.stopPropagation()}
      onPointerEnter={(event) => {
        if (event.pointerType !== "touch") setOpen(true);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType !== "touch") setOpen(false);
      }}
      onFocus={() => setOpen(true)}
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (!(next instanceof Node) || !rootRef.current?.contains(next)) setOpen(false);
      }}
    >
      <button
        type="button"
        className="ai-edit-badge"
        aria-expanded={open}
        aria-controls={popoverId}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((current) => !current);
        }}
      >
        <IconSparkles size={12} stroke={2} aria-hidden />
        Modified by AI
      </button>

      {open && (
        <div id={popoverId} className="ai-edit-popover" role="note" aria-label="Changes made by AI">
          <div className="ai-edit-popover-heading">
            <span>Context edit</span>
            <span className="ai-edit-legend" aria-hidden>
              <i className="ai-edit-legend-delete" /> removed
              <i className="ai-edit-legend-insert" /> added
            </span>
          </div>
          <p className="ai-edit-summary">
            {editSummary || "AI added context to clarify why this post is related."}
          </p>
          <p className="ai-edit-diff" aria-label="AI-edited text">
            {diff.map((chunk, index) => {
              if (chunk.kind === "delete") return <del key={index}>{chunk.text}</del>;
              if (chunk.kind === "insert") return <ins key={index}>{chunk.text}</ins>;
              return <React.Fragment key={index}>{chunk.text}</React.Fragment>;
            })}
          </p>
          <p className="ai-edit-original-note">The original post is preserved when you open it.</p>
        </div>
      )}
    </div>
  );
}
