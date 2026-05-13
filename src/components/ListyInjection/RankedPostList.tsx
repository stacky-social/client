"use client";

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { RelatedPostMock } from "../../types/PostType";
import { setActiveRelatedPost, registerSidebarRef } from "./listyStore";
import RankedPostCard from "./RankedPostCard";

interface RankedPostListProps {
  posts: RelatedPostMock[];
  /** When true, show category rank instead of global rank */
  filtered: boolean;
  /** Called when a post is clicked */
  onPostClick?: (postId: string) => void;
}

export default function RankedPostList({
  posts,
  filtered,
  onPostClick,
}: RankedPostListProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Register the sidebar scroll container so the store can save/restore it
  useEffect(() => {
    registerSidebarRef(containerRef);
  }, []);

  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const setCardRef = useCallback(
    (id: string) => (el: HTMLDivElement | null) => {
      if (el) cardRefs.current.set(id, el);
      else cardRefs.current.delete(id);
    },
    []
  );

  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const handleHover = useCallback((id: string | null) => {
    setHoveredId(id);
    setActiveRelatedPost(id);
  }, []);

  return (
    <div
      ref={containerRef}
      role="list"
      aria-label="Ranked related posts"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.75rem",
        overflowY: "auto",
        overflowX: "hidden",
        flex: 1,
        paddingRight: "2px",
        paddingBottom: "1rem",
        scrollbarWidth: "thin",
        scrollbarColor: "#c1c9d6 transparent",
      }}
    >
      {posts.map((post) => (
        <RankedPostCard
          key={post.id}
          ref={setCardRef(post.id)}
          post={post}
          displayRank={filtered ? post.rank : post.globalRank}
          isHovered={hoveredId === post.id}
          onHover={handleHover}
          onClick={onPostClick}
        />
      ))}
    </div>
  );
}
