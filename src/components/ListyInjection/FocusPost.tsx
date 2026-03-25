"use client";

import React, { useEffect, useRef, useState } from "react";
import { Avatar, Text, Divider, Group } from "@mantine/core";
import {
  IconHeart,
  IconHeartFilled,
  IconMessageCircle,
  IconBookmark,
  IconBookmarkFilled,
} from "@tabler/icons-react";
import { formatDistanceToNow } from "date-fns";
import type { FocusPostMock, RelatedPostMock, CategoryKey } from "../../types/PostType";
import { parseHighlight, buildSegments } from "./highlightUtils";
import { CATEGORY_COLORS, CATEGORY_LABELS } from "./constants";
import { useListyStore } from "./listyStore";
import InteractionControl from "../InteractionControl";

interface FocusPostProps {
  post: FocusPostMock;
  relatedPosts: RelatedPostMock[];
  /** Render in muted ancestor style (no "Focus Post" badge, reduced opacity) */
  isAncestor?: boolean;
  /** Whether this is the currently active post that should respond to highlights */
  isActive?: boolean;
  /** Called when an ancestor post is clicked to navigate back to it */
  onClick?: () => void;
}

export default function FocusPost({ post, relatedPosts, isAncestor, isActive = false, onClick }: FocusPostProps) {
  const { activeRelatedPostId } = useListyStore();

  // Only respond to highlights when this post is the active one
  const effectiveRelatedPostId = isActive ? activeRelatedPostId : null;

  // ── Transition state ────────────────────────────────────────────────────────
  const [displayedId, setDisplayedId] = useState<string | null>(null);
  const [markOpacity, setMarkOpacity] = useState<0 | 1>(0);
  const prevIdRef = useRef<string | null>(null);

  const prefersReducedMotion =
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false;

  useEffect(() => {
    // Ancestors don't get highlights
    if (isAncestor) return;

    if (effectiveRelatedPostId === prevIdRef.current) return;
    prevIdRef.current = effectiveRelatedPostId;

    if (prefersReducedMotion) {
      setDisplayedId(effectiveRelatedPostId);
      setMarkOpacity(effectiveRelatedPostId ? 1 : 0);
      return;
    }

    setMarkOpacity(0);
    const t = setTimeout(() => {
      setDisplayedId(effectiveRelatedPostId);
      requestAnimationFrame(() => {
        setMarkOpacity(effectiveRelatedPostId ? 1 : 0);
      });
    }, 200);

    return () => clearTimeout(t);
  }, [effectiveRelatedPostId, prefersReducedMotion, isAncestor]);

  // ── Derive highlight segments ────────────────────────────────────────────────
  const activePost = !isAncestor && displayedId
    ? relatedPosts.find((p) => p.id === displayedId) ?? null
    : null;

  const category = activePost?.category as CategoryKey | undefined;
  const colors = category ? CATEGORY_COLORS[category] : null;

  type Segment = { text: string; highlighted: boolean };
  let segments: Segment[];

  if (activePost?.focusHighlight) {
    const { highlights } = parseHighlight(activePost.focusHighlight, "category");
    segments = buildSegments(post.plainText, highlights);
  } else {
    segments = [{ text: post.plainText, highlighted: false }];
  }

  // ── Local interaction state ──────────────────────────────────────────────────
  const [favourited, setFavourited] = useState(post.favourited);
  const [bookmarked, setBookmarked] = useState(post.bookmarked);
  const [favCount, setFavCount] = useState(post.favourites_count);

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <article
      aria-label={`${isAncestor ? "Ancestor" : "Focus"} post by ${post.account.display_name}`}
      onClick={isAncestor && onClick ? onClick : undefined}
      style={{
        background: "#ffffff",
        borderRadius: "12px",
        border: `2px solid ${colors ? colors.border : isAncestor ? "#e8ecf0" : "#e2e8f0"}`,
        boxShadow: isAncestor ? "none" : "0 2px 12px rgba(0,0,0,0.06)",
        padding: isAncestor ? "0.85rem 1rem" : "1.25rem",
        transition: "border-color 300ms ease, opacity 150ms ease",
        position: "relative",
        overflow: "hidden",
        opacity: isAncestor ? 0.8 : 1,
        cursor: isAncestor && onClick ? "pointer" : undefined,
      }}
    >
      {/* Colored top accent bar — only on non-ancestor */}
      {!isAncestor && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "3px",
            background: colors ? colors.border : "transparent",
            transition: "background 300ms ease",
            borderRadius: "12px 12px 0 0",
          }}
        />
      )}

      {/* Author row */}
      <Group gap="sm" mb={isAncestor ? "xs" : "sm"}>
        <Avatar
          src={post.account.avatar || undefined}
          alt={post.account.display_name}
          radius="xl"
          size={isAncestor ? 32 : 40}
          color="blue"
        >
          {post.account.display_name[0]}
        </Avatar>
        <div>
          <Text fw={700} size={isAncestor ? "xs" : "sm"} c="#011445">
            {post.account.display_name}
          </Text>
          <Text size="xs" c="dimmed">
            @{post.account.acct} ·{" "}
            {formatDistanceToNow(new Date(post.created_at))} ago
          </Text>
        </div>
        {/* "Focus Post" label — only on the current focus */}
        {!isAncestor && (
          <div
            style={{
              marginLeft: "auto",
              background: "#f0f4ff",
              border: "1px solid #c7d7fe",
              borderRadius: "6px",
              padding: "2px 8px",
              fontSize: "11px",
              fontWeight: 600,
              color: "#3730a3",
              letterSpacing: "0.03em",
            }}
          >
            Focus Post
          </div>
        )}
      </Group>

      {/* Post content */}
      <Text
        component="p"
        size={isAncestor ? "xs" : "sm"}
        lh={isAncestor ? 1.5 : 1.65}
        c="#011445"
        style={{ margin: 0, marginBottom: isAncestor ? "0.5rem" : "0.75rem" }}
        aria-live={isAncestor ? undefined : "polite"}
        aria-atomic={isAncestor ? undefined : "true"}
      >
        {segments.map((seg, i) =>
          seg.highlighted && colors ? (
            <mark
              key={i}
              style={{
                background: colors.bg,
                color: colors.text,
                fontWeight: 600,
                borderRadius: "3px",
                padding: "1px 3px",
                borderBottom: `2px solid ${colors.border}`,
                opacity: markOpacity,
                transition: prefersReducedMotion
                  ? "none"
                  : "opacity 200ms ease",
              }}
            >
              {seg.text}
            </mark>
          ) : (
            <span key={i}>{seg.text}</span>
          )
        )}
      </Text>

      {/* Active category indicator — only on current focus */}
      {!isAncestor && activePost && category && colors && (
        <div
          aria-live="polite"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            marginBottom: "0.75rem",
            padding: "4px 10px",
            background: colors.bg,
            border: `1px solid ${colors.border}`,
            borderRadius: "6px",
            width: "fit-content",
            opacity: markOpacity,
            transition: prefersReducedMotion ? "none" : "opacity 200ms ease",
          }}
        >
          <Text size="xs" fw={600} c={colors.text}>
            Responding to:{" "}
            <span style={{ fontWeight: 700 }}>
              {CATEGORY_LABELS[category]}
            </span>
          </Text>
        </div>
      )}

      <Divider mb="xs" />

      {/* Interaction row */}
      <Group gap="lg">
        <InteractionControl
          icon={<IconMessageCircle size={isAncestor ? 16 : 18} />}
          label={post.replies_count}
          ariaLabel="Replies"
          onClick={() => {}}
        />
        <InteractionControl
          icon={
            favourited ? (
              <IconHeartFilled size={isAncestor ? 16 : 18} />
            ) : (
              <IconHeart size={isAncestor ? 16 : 18} />
            )
          }
          label={favCount}
          ariaLabel={favourited ? "Unfavourite" : "Favourite"}
          active={favourited}
          onClick={() => {
            setFavourited((f) => !f);
            setFavCount((c) => (favourited ? c - 1 : c + 1));
          }}
        />
        <InteractionControl
          icon={
            bookmarked ? (
              <IconBookmarkFilled size={isAncestor ? 16 : 18} />
            ) : (
              <IconBookmark size={isAncestor ? 16 : 18} />
            )
          }
          ariaLabel={bookmarked ? "Remove bookmark" : "Bookmark"}
          active={bookmarked}
          onClick={() => setBookmarked((b) => !b)}
        />
      </Group>
    </article>
  );
}
