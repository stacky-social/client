"use client";

import React, { useMemo } from "react";
import { Text } from "@mantine/core";
import type { RelatedPostMock, CategoryKey } from "../../types/PostType";
import {
  useListyStore,
  toggleFilterCategory,
} from "./listyStore";
import {
  CATEGORY_COLORS,
  CATEGORY_ICONS,
  CATEGORY_LABELS,
} from "./constants";
import RankedPostList from "./RankedPostList";

interface CategorySidebarProps {
  relatedPosts: RelatedPostMock[];
  /** Called when a post is clicked */
  onPostClick?: (postId: string) => void;
}

// ── Filter chip ──────────────────────────────────────────────────────────────

interface FilterChipProps {
  category: CategoryKey;
  count: number;
  active: boolean;
  onClick: () => void;
}

function FilterChip({ category, count, active, onClick }: FilterChipProps) {
  const colors = CATEGORY_COLORS[category];

  return (
    <button
      onClick={onClick}
      aria-label={`${active ? "Remove" : "Show"} ${CATEGORY_LABELS[category]} filter`}
      aria-pressed={active}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        background: active ? colors.bg : "#f8f9fa",
        border: `1.5px solid ${active ? colors.border : "#e2e8f0"}`,
        borderRadius: "16px",
        padding: "3px 10px 3px 7px",
        cursor: "pointer",
        transition: "all 150ms ease",
        outline: "none",
        flexShrink: 0,
      }}
    >
      {React.cloneElement(
        CATEGORY_ICONS[category] ?? CATEGORY_ICONS.uncategorized,
        { color: active ? colors.text : "#64748b", size: 13 }
      )}
      <Text
        size="xs"
        fw={active ? 700 : 500}
        c={active ? colors.text : "#64748b"}
        style={{ fontSize: "11px", lineHeight: 1, whiteSpace: "nowrap" }}
      >
        {CATEGORY_LABELS[category]}
      </Text>
      <Text
        size="xs"
        c={active ? colors.text : "#94a3b8"}
        style={{ fontSize: "10px", lineHeight: 1 }}
      >
        {count}
      </Text>
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CategorySidebar({ relatedPosts, onPostClick }: CategorySidebarProps) {
  const { filterCategory } = useListyStore();

  // Build category counts sorted by post count descending
  const categories = useMemo(() => {
    const map = new Map<CategoryKey, number>();
    for (const post of relatedPosts) {
      map.set(post.category, (map.get(post.category) ?? 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [relatedPosts]);

  // Filter and sort posts
  const displayPosts = useMemo(() => {
    let posts = relatedPosts;
    if (filterCategory) {
      posts = posts.filter((p) => p.category === filterCategory);
      return posts.sort((a, b) => a.rank - b.rank);
    }
    return posts.sort((a, b) => a.globalRank - b.globalRank);
  }, [relatedPosts, filterCategory]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
      }}
      aria-label="Related posts"
    >
      {/* Header */}
      <Text size="sm" fw={700} c="#374151" mb={6}>
        Related responses
      </Text>

      <Text size="xs" c="dimmed" mb="xs">
        Hover a post to highlight the relevant parts
      </Text>

      {/* Filter chips */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "5px",
          marginBottom: "0.75rem",
          flexShrink: 0,
        }}
      >
        {categories.map(([category, count]) => (
          <FilterChip
            key={category}
            category={category}
            count={count}
            active={filterCategory === category}
            onClick={() => toggleFilterCategory(category)}
          />
        ))}
      </div>

      {/* Post count indicator */}
      <Text size="xs" c="dimmed" mb="xs" style={{ flexShrink: 0 }}>
        {filterCategory
          ? `${displayPosts.length} ${CATEGORY_LABELS[filterCategory as CategoryKey]} post${displayPosts.length !== 1 ? "s" : ""}`
          : `${displayPosts.length} posts across all categories`}
      </Text>

      <RankedPostList
        posts={displayPosts}
        filtered={!!filterCategory}
        onPostClick={onPostClick}
      />
    </div>
  );
}
