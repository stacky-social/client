"use client";

import React, { forwardRef, useState } from "react";
import { Avatar, Text, Group, Divider, Anchor } from "@mantine/core";
import {
  IconHeart,
  IconHeartFilled,
  IconMessageCircle,
  IconBookmark,
  IconBookmarkFilled,
  IconChevronRight,
} from "@tabler/icons-react";
import { formatDistanceToNow } from "date-fns";
import type { RelatedPostMock } from "../../types/PostType";
import { parseHighlight, buildSegments } from "./highlightUtils";
import type { HighlightRange } from "./highlightUtils";
import { CATEGORY_COLORS, CATEGORY_ICONS, CATEGORY_LABELS, rankOrdinal } from "./constants";
import InteractionControl from "../InteractionControl";

interface RankedPostCardProps {
  post: RelatedPostMock;
  /** Which rank number to display (global or category rank) */
  displayRank: number;
  isHovered: boolean;
  onHover: (id: string | null) => void;
  /** Called when post is clicked */
  onClick?: (postId: string) => void;
}

// ── Smart windowing ───────────────────────────────────────────────────────────
// When content is long, show a window centered on the highlighted span.
const WINDOW_CHARS = 140;

function windowContent(
  content: string,
  highlights: HighlightRange[],
  expanded: boolean
): {
  text: string;
  adjustedHighlights: HighlightRange[];
  hasPrefix: boolean;
  hasSuffix: boolean;
} {
  const totalChars = WINDOW_CHARS * 2;
  if (expanded || !highlights.length || content.length <= totalChars) {
    return { text: content, adjustedHighlights: highlights, hasPrefix: false, hasSuffix: false };
  }

  const first = highlights[0];
  const center = Math.floor((first.start + first.end) / 2);
  const start = Math.max(0, center - WINDOW_CHARS);
  const end = Math.min(content.length, center + WINDOW_CHARS);
  const text = content.slice(start, end);

  const adjustedHighlights = highlights
    .map((h) => ({ ...h, start: h.start - start, end: h.end - start }))
    .filter((h) => h.end > 0 && h.start < text.length)
    .map((h) => ({ ...h, start: Math.max(0, h.start), end: Math.min(text.length, h.end) }));

  return {
    text,
    adjustedHighlights,
    hasPrefix: start > 0,
    hasSuffix: end < content.length,
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

const RankedPostCard = forwardRef<HTMLDivElement, RankedPostCardProps>(
  function RankedPostCard({ post, displayRank, isHovered, onHover, onClick }, ref) {
    const colors = CATEGORY_COLORS[post.category] ?? CATEGORY_COLORS.uncategorized;
    const [expanded, setExpanded] = useState(false);

    // Build highlight ranges from relations' content ranges
    const highlights = (post.relations ?? []).map(r => ({
      start: r.contentStart, end: r.contentEnd, category: r.category, source: "category" as const,
    }));

    // Compute windowed content for truncation
    const { text: visibleText, adjustedHighlights, hasPrefix, hasSuffix } =
      windowContent(post.content, highlights, expanded);

    const isTruncated = hasPrefix || hasSuffix;
    const segments = buildSegments(visibleText, adjustedHighlights);

    // Local optimistic interaction state
    const [favourited, setFavourited] = useState(post.favourited);
    const [bookmarked, setBookmarked] = useState(post.bookmarked);
    const [favCount, setFavCount] = useState(post.favourites_count);

    return (
      <div
        ref={ref}
        data-post-id={post.id}
        role="article"
        aria-label={`${CATEGORY_LABELS[post.category]} post by ${post.account.display_name}`}
        onMouseEnter={() => onHover(post.id)}
        onMouseLeave={() => onHover(null)}
        onFocus={() => onHover(post.id)}
        onBlur={() => onHover(null)}
        onClick={onClick ? () => onClick(post.id) : undefined}
        style={{
          position: "relative",
          backgroundColor: "#fff",
          borderRadius: "10px",
          border: isHovered
            ? `2px solid ${colors.border}`
            : "2px solid #e7e7e7",
          boxShadow: isHovered
            ? "rgba(0,0,0,0.18) 0px 12px 24px, rgba(0,0,0,0.12) 0px 6px 12px"
            : "none",
          transform: isHovered ? "translateY(-2px)" : "none",
          transition:
            "box-shadow 150ms ease, border-color 150ms ease, transform 150ms ease",
          padding: "1rem",
          cursor: onClick ? "pointer" : undefined,
        }}
      >
        {/* Top row: rank + category badge */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            marginBottom: "0.5rem",
          }}
        >
          {/* Rank indicator */}
          <span
            style={{
              fontSize: "13px",
              color: "#64748b",
              fontWeight: 600,
              lineHeight: 1,
              userSelect: "none",
              minWidth: "20px",
            }}
          >
            {rankOrdinal(displayRank)}
          </span>

          {/* Category badge */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              background: colors.bg,
              border: `1px solid ${colors.border}`,
              borderRadius: "5px",
              padding: "2px 7px",
              color: colors.text,
            }}
          >
            {React.cloneElement(
              CATEGORY_ICONS[post.category] ?? CATEGORY_ICONS.uncategorized,
              { color: colors.text, size: 12 }
            )}
            <Text size="xs" fw={700} c={colors.text} style={{ fontSize: "11px" }}>
              {CATEGORY_LABELS[post.category]}
            </Text>
          </div>

          {/* Category rank (small secondary indicator) */}
          <Text size="xs" c="dimmed" style={{ fontSize: "10px", marginLeft: "auto" }}>
            #{post.rank} in {CATEGORY_LABELS[post.category]}
          </Text>

          {/* Navigation indicator */}
          {onClick && (
            <IconChevronRight size={14} color="#94a3b8" style={{ flexShrink: 0 }} />
          )}
        </div>

        {/* Author row */}
        <Group gap="xs" mb="xs">
          <Avatar
            src={post.account.avatar || undefined}
            alt={post.account.display_name}
            radius="xl"
          >
            {post.account.display_name[0]}
          </Avatar>
          <div>
            <Text fw={700} size="sm" c="#011445" style={{ lineHeight: 1.3 }}>
              {post.account.display_name}
            </Text>
            <Text size="xs" c="dimmed" style={{ lineHeight: 1.3 }}>
              {formatDistanceToNow(new Date(post.created_at))} ago
            </Text>
          </div>
        </Group>

        {/* Content — windowed with highlight marks */}
        <div style={{ paddingLeft: "2.75rem" }}>
          <Text
            component="p"
            size="sm"
            lh={1.55}
            c="#011445"
            style={{ margin: "0 0 0.4rem 0" }}
          >
            {hasPrefix && (
              <span style={{ color: "#94a3b8", userSelect: "none" }}>…</span>
            )}
            {segments.map((seg, i) =>
              seg.highlighted ? (
                <mark
                  key={i}
                  style={{
                    background: isHovered ? colors.bg : "transparent",
                    color: "inherit",
                    borderRadius: "3px",
                    padding: "0 2px",
                    transition: "background 150ms ease",
                  }}
                >
                  {seg.text}
                </mark>
              ) : (
                <span key={i}>{seg.text}</span>
              )
            )}
            {hasSuffix && !expanded && (
              <span style={{ color: "#94a3b8", userSelect: "none" }}>…</span>
            )}
          </Text>

          {/* See more / See less */}
          {(isTruncated || expanded) && (
            <Anchor
              component="button"
              type="button"
              size="sm"
              underline="hover"
              styles={{
                root: {
                  padding: 0,
                  background: "none",
                  color: "#5a71a8",
                  fontWeight: 600,
                  cursor: "pointer",
                  marginBottom: "0.4rem",
                  display: "block",
                },
              }}
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                setExpanded((v) => !v);
              }}
              onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}
            >
              {expanded ? "See less" : "See more"}
            </Anchor>
          )}

          <Divider mb="xs" />

          {/* Interaction row */}
          <Group gap="md">
            <InteractionControl
              icon={<IconMessageCircle size={18} />}
              label={post.replies_count}
              ariaLabel="Replies"
              onClick={(e?: React.MouseEvent) => e?.stopPropagation?.()}
            />
            <InteractionControl
              icon={favourited ? <IconHeartFilled size={18} /> : <IconHeart size={18} />}
              label={favCount}
              ariaLabel={favourited ? "Unfavourite" : "Favourite"}
              active={favourited}
              onClick={(e?: React.MouseEvent) => {
                e?.stopPropagation?.();
                setFavourited((f) => !f);
                setFavCount((c) => (favourited ? c - 1 : c + 1));
              }}
            />
            <InteractionControl
              icon={bookmarked ? <IconBookmarkFilled size={18} /> : <IconBookmark size={18} />}
              ariaLabel={bookmarked ? "Remove bookmark" : "Bookmark"}
              active={bookmarked}
              onClick={(e?: React.MouseEvent) => {
                e?.stopPropagation?.();
                setBookmarked((b) => !b);
              }}
            />
          </Group>
        </div>
      </div>
    );
  }
);

export default RankedPostCard;
