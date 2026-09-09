"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { FocusTopicCandidate } from "../../utils/focusTopics.mjs";
import styles from "./FocusTopicPicker.module.css";

// Long enough to cross the visual gap at an ordinary pointer speed, while still
// feeling like the hover surface dismissed itself when the user moves away.
const POINTER_EXIT_GRACE_MS = 400;

export interface FocusTopicPickerAnchor {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

interface FocusTopicPickerProps {
  anchor: FocusTopicPickerAnchor;
  anchorElement?: HTMLElement | null;
  topics: FocusTopicCandidate[];
  selectedTopic: string | null;
  focusOnOpen?: boolean;
  onSelect: (topic: FocusTopicCandidate) => void;
  onClose: () => void;
  dismissOnPointerLeave?: boolean;
}

export default function FocusTopicPicker({
  anchor,
  anchorElement = null,
  topics,
  selectedTopic,
  focusOnOpen = false,
  onSelect,
  onClose,
  dismissOnPointerLeave = false,
}: FocusTopicPickerProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [position, setPosition] = useState({ left: anchor.left, top: anchor.bottom + 8 });

  const updatePosition = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const currentAnchor = anchorElement?.isConnected
      ? anchorElement.getBoundingClientRect()
      : anchor;
    const gap = 8;
    const inset = 12;
    const width = root.offsetWidth;
    const height = root.offsetHeight;
    const maxLeft = Math.max(inset, window.innerWidth - width - inset);
    const maxTop = Math.max(inset, window.innerHeight - height - inset);
    const left = Math.max(inset, Math.min(currentAnchor.left, maxLeft));
    const below = currentAnchor.bottom + gap;
    const preferredTop = below + height <= window.innerHeight - inset
      ? below
      : currentAnchor.top - height - gap;
    const top = Math.max(inset, Math.min(preferredTop, maxTop));
    setPosition({ left, top });
  }, [anchor, anchorElement]);

  useLayoutEffect(() => {
    updatePosition();
  }, [topics.length, updatePosition]);

  useEffect(() => {
    let animationFrame = 0;
    const onViewportChange = () => {
      if (animationFrame) cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(updatePosition);
    };
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);
    return () => {
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
      if (animationFrame) cancelAnimationFrame(animationFrame);
    };
  }, [updatePosition]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) onClose();
    };
    const cancelDismiss = () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    };
    const scheduleDismiss = () => {
      if (!dismissOnPointerLeave || dismissTimerRef.current) return;
      dismissTimerRef.current = setTimeout(() => {
        dismissTimerRef.current = null;
        onClose();
      }, POINTER_EXIT_GRACE_MS);
    };
    const onPointerMove = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const staysWithinHoverSurface = Boolean(
        target
        && (
          rootRef.current?.contains(target)
          || target.closest('[data-testid="focus-reveal"] mark[data-range-ids]')
        )
      );
      if (staysWithinHoverSurface) cancelDismiss();
      else scheduleDismiss();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("pointermove", onPointerMove);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("keydown", onKeyDown);
      cancelDismiss();
    };
  }, [dismissOnPointerLeave, onClose]);

  useEffect(() => {
    if (!focusOnOpen) return;
    const selected = rootRef.current?.querySelector<HTMLElement>('[aria-checked="true"]');
    const first = rootRef.current?.querySelector<HTMLElement>('[role="menuitemradio"]');
    (selected ?? first)?.focus();
  }, [focusOnOpen]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={rootRef}
      className={styles.picker}
      data-testid="focus-topic-picker"
      role="menu"
      aria-label="Topics for this phrase"
      style={position}
      onKeyDown={(event) => {
        if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
        event.preventDefault();
        const buttons = Array.from(
          rootRef.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? [],
        );
        if (buttons.length === 0) return;
        const current = buttons.indexOf(document.activeElement as HTMLElement);
        const delta = event.key === "ArrowDown" ? 1 : -1;
        buttons[(current + delta + buttons.length) % buttons.length].focus();
      }}
    >
      <div className={styles.eyebrow}>Filter by topic</div>
      {topics.map((topic) => {
        const selected = topic.topicKey === selectedTopic;
        return (
          <button
            key={topic.topicKey}
            type="button"
            role="menuitemradio"
            aria-checked={selected}
            className={`${styles.option} ${selected ? styles.selected : ""}`}
            onClick={() => onSelect(topic)}
          >
            <span className={styles.topic}>{topic.topicKey}</span>
            <span className={styles.count}>
              {topic.count} {topic.count === 1 ? "post" : "posts"}
            </span>
          </button>
        );
      })}
    </div>,
    document.body,
  );
}
