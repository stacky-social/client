"use client";

import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { Avatar, Divider, Group, Text } from "@mantine/core";
import {
  IconArrowLeft,
  IconHeart,
  IconMessageCircle,
  IconBookmark,
} from "@tabler/icons-react";
import { formatPostDate } from "../../utils/formatPostDate";
import type { ListyInjectionData, ListyInjectionEntry, FocusPostMock, RelatedPostMock } from "../../types/PostType";
import {
  useListyStore,
  resetListyStore,
  setActiveFeedEntry,
  navigateToPost,
  navigateBack,
  getAncestorIds,
  getCurrentFocusId,
} from "./listyStore";
import FocusPost from "./FocusPost";
import InteractionControl from "../InteractionControl";

// ── Thread line constants (matches posts/[id]/page.tsx) ─────────────────────

const THREAD_LINE_COLOR = "#ccd1dc";
const THREAD_LINE_LEFT = 32;
// Vertical avatar-center offset inside FocusPost — used as line endpoints.
const THREAD_LINE_AVATAR_Y = 24;

/** Convert a RelatedPostMock into a synthetic ListyInjectionEntry */
function syntheticEntry(
  related: RelatedPostMock,
  parentEntry: ListyInjectionEntry
): ListyInjectionEntry {
  return {
    focusPost: {
      id: related.id,
      content: `<p>${related.content}</p>`,
      plainText: related.content,
      account: related.account,
      created_at: related.created_at,
      favourites_count: related.favourites_count,
      replies_count: related.replies_count,
      favourited: related.favourited,
      bookmarked: related.bookmarked,
    },
    relatedPosts: [],
    replies: [],
  };
}

interface ListyInjectionShellProps {
  entries: ListyInjectionData;
}

export default function ListyInjectionShell({ entries }: ListyInjectionShellProps) {
  const { navigationStack, activeFeedEntryId } = useListyStore();
  const inThreadMode = navigationStack.length > 0;

  // Build lookup map: focusPost.id → entry
  const entryMap = useMemo(() => {
    const map = new Map<string, ListyInjectionEntry>();
    for (const entry of entries) {
      map.set(entry.focusPost.id, entry);
    }
    return map;
  }, [entries]);

  // Build a lookup of all related posts across all entries (for synthetic entries)
  const allRelatedPosts = useMemo(() => {
    const map = new Map<string, { related: RelatedPostMock; parentEntry: ListyInjectionEntry }>();
    for (const entry of entries) {
      for (const rp of entry.relatedPosts) {
        if (!map.has(rp.id)) {
          map.set(rp.id, { related: rp, parentEntry: entry });
        }
      }
    }
    return map;
  }, [entries]);

  // Resolve an entry by ID — real entries first, then synthetic from related posts
  const resolveEntry = useCallback(
    (id: string): ListyInjectionEntry | null => {
      const real = entryMap.get(id);
      if (real) return real;
      const found = allRelatedPosts.get(id);
      if (found) return syntheticEntry(found.related, found.parentEntry);
      return null;
    },
    [entryMap, allRelatedPosts]
  );

  // ── Scroll-based focus detection (feed mode) ─────────────────────────────
  const feedPostRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const setFeedPostRef = useCallback(
    (id: string) => (el: HTMLDivElement | null) => {
      if (el) feedPostRefs.current.set(id, el);
      else feedPostRefs.current.delete(id);
    },
    []
  );

  // Use a scroll listener to detect which feed post is closest to viewport center.
  // Unlike IntersectionObserver, this fires on every scroll tick for precise tracking.
  useEffect(() => {
    if (inThreadMode || entries.length === 0) return;

    let rafId = 0;
    const updateActiveFeedPost = () => {
      const viewportCenter = window.innerHeight / 2;
      let closestId: string | null = null;
      let closestDist = Infinity;

      feedPostRefs.current.forEach((el, id) => {
        const rect = el.getBoundingClientRect();
        const elCenter = rect.top + rect.height / 2;
        const dist = Math.abs(elCenter - viewportCenter);
        if (dist < closestDist) {
          closestDist = dist;
          closestId = id;
        }
      });

      if (closestId) {
        setActiveFeedEntry(closestId);
      }
    };

    const onScroll = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(updateActiveFeedPost);
    };

    // Run once immediately to set the initial active post
    updateActiveFeedPost();

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(rafId);
    };
  }, [inThreadMode, entries.length]);

  // Reset store on mount/unmount
  useEffect(() => {
    resetListyStore();
    if (entries.length > 0) {
      setActiveFeedEntry(entries[0].focusPost.id);
    }
    return () => resetListyStore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Click a feed post → enter thread view for that post
  const handleFeedPostClick = useCallback((entryId: string) => {
    setActiveFeedEntry(entryId);
    navigateToPost(entryId);
  }, []);

  // ── Thread mode: derive ancestors + current entry ─────────────────────────
  const currentFocusId = getCurrentFocusId();
  const ancestorIds = getAncestorIds();

  const currentEntry = currentFocusId ? resolveEntry(currentFocusId) : null;
  const ancestorEntries = ancestorIds
    .map((id) => resolveEntry(id))
    .filter((e): e is ListyInjectionEntry => !!e);

  // ── Render: Thread mode ───────────────────────────────────────────────────

  if (inThreadMode && currentEntry) {
    return (
      <div style={{ maxWidth: "680px", margin: "0 auto", padding: "1rem 0" }}>
        {/* Back button */}
        <button
          onClick={() => navigateBack()}
          aria-label="Go back"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            background: "#f1f5f9",
            border: "none",
            borderRadius: "8px",
            padding: "6px 12px",
            cursor: "pointer",
            marginBottom: "1rem",
            fontSize: "13px",
            fontWeight: 600,
            color: "#475569",
            transition: "background 150ms ease",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = "#e2e8f0";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = "#f1f5f9";
          }}
        >
          <IconArrowLeft size={16} />
          Back
        </button>

        {/* Ancestor chain with thread lines.
            Line starts at avatar y on the first ancestor and runs through
            each post body + gap below. zIndex: 2 puts it above the FocusPost
            wrap (zIndex: 1, which contains FocusPost's white background). */}
        {ancestorEntries.map((entry, index) => (
          <div
            key={entry.focusPost.id}
            style={{ position: "relative", paddingBottom: "0.5rem" }}
          >
            <div
              aria-hidden
              style={{
                position: "absolute",
                left: THREAD_LINE_LEFT,
                top: index === 0 ? THREAD_LINE_AVATAR_Y : 0,
                bottom: 0,
                width: 2,
                backgroundColor: THREAD_LINE_COLOR,
                zIndex: 2,
              }}
            />
            <div style={{ position: "relative", zIndex: 1 }}>
              <FocusPost
                post={entry.focusPost}
                relatedPosts={entry.relatedPosts}
                isAncestor
                isActive={false}
                onClick={() => {
                  const targetIdx = ancestorIds.indexOf(entry.focusPost.id);
                  const popCount = ancestorIds.length - targetIdx;
                  for (let i = 0; i < popCount; i++) {
                    navigateBack();
                  }
                }}
              />
            </div>
          </div>
        ))}

        {/* Current focus post with connector from ancestors */}
        <div style={{ position: "relative", marginBottom: "1.5rem" }}>
          {ancestorEntries.length > 0 && (
            <div
              aria-hidden
              style={{
                position: "absolute",
                left: THREAD_LINE_LEFT,
                top: 0,
                height: THREAD_LINE_AVATAR_Y,
                width: 2,
                backgroundColor: THREAD_LINE_COLOR,
                zIndex: 2,
              }}
            />
          )}
          <div style={{ position: "relative", zIndex: 1 }}>
            <FocusPost
              post={currentEntry.focusPost}
              relatedPosts={currentEntry.relatedPosts}
              isActive
            />
          </div>
        </div>

        {/* Replies */}
        {currentEntry.replies && currentEntry.replies.length > 0 && (
          <div style={{ marginTop: "0.5rem" }}>
            <Text size="xs" fw={600} c="dimmed" mb="sm" style={{ textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Replies
            </Text>
            {currentEntry.replies.map((reply: FocusPostMock, index: number) => (
              <div
                key={reply.id}
                style={{
                  position: "relative",
                  marginBottom: index < currentEntry.replies!.length - 1 ? "0.5rem" : 0,
                }}
              >
                <div
                  aria-hidden
                  style={{
                    position: "absolute",
                    left: THREAD_LINE_LEFT,
                    top: 0,
                    height: 8,
                    width: 2,
                    backgroundColor: THREAD_LINE_COLOR,
                    zIndex: 0,
                  }}
                />
                <ReplyCard reply={reply} />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Render: Feed mode ─────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: "680px", margin: "0 auto", padding: "1rem 0" }}>
      <div style={{ marginBottom: "1.25rem" }}>
        <Text
          size="xs"
          fw={600}
          c="dimmed"
          style={{ textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "2px" }}
        >
          Listy Injection · Demo
        </Text>
        <Text size="lg" fw={700} c="#011445">
          Cross-post Highlighting
        </Text>
        <Text size="sm" c="dimmed" mt={2}>
          Click any post to explore its thread. Hover responses in the sidebar
          to see cross-highlights.
        </Text>
      </div>

      {entries.map((entry) => {
        const isActive = activeFeedEntryId === entry.focusPost.id;
        return (
          <div
            key={entry.focusPost.id}
            ref={setFeedPostRef(entry.focusPost.id)}
            onClick={() => handleFeedPostClick(entry.focusPost.id)}
            style={{
              marginBottom: "1.5rem",
              borderLeft: isActive
                ? "3px solid #4338ca"
                : "3px solid transparent",
              paddingLeft: "0.75rem",
              transition: "border-color 200ms ease",
              cursor: "pointer",
            }}
          >
            <FocusPost
              post={entry.focusPost}
              relatedPosts={entry.relatedPosts}
              isActive={isActive}
            />
          </div>
        );
      })}
    </div>
  );
}

// ── Simple reply card ────────────────────────────────────────────────────────

function ReplyCard({ reply }: { reply: FocusPostMock }) {
  return (
    <article
      style={{
        background: "#fafbfc",
        borderRadius: "10px",
        border: "1.5px solid #e8ecf0",
        padding: "0.75rem 1rem",
        position: "relative",
        zIndex: 1,
      }}
    >
      <Group gap="xs" mb="xs">
        <Avatar
          src={reply.account.avatar || undefined}
          alt={reply.account.display_name}
          radius="xl"
          size={28}
          color="gray"
        >
          {reply.account.display_name[0]}
        </Avatar>
        <div>
          <Text fw={600} size="xs" c="#011445" style={{ lineHeight: 1.3 }}>
            {reply.account.display_name}
          </Text>
          <Text size="xs" c="dimmed" style={{ lineHeight: 1.3, fontSize: "10px" }}>
            @{reply.account.acct} · {formatPostDate(reply.created_at)}
          </Text>
        </div>
      </Group>
      <Text size="xs" lh={1.5} c="#374151" mb="xs">
        {reply.plainText}
      </Text>
      <Divider mb="xs" />
      <Group gap="md">
        <InteractionControl
          icon={<IconMessageCircle size={15} />}
          label={reply.replies_count}
          ariaLabel="Replies"
          onClick={() => {}}
        />
        <InteractionControl
          icon={<IconHeart size={15} />}
          label={reply.favourites_count}
          ariaLabel="Favourite"
          onClick={() => {}}
        />
        <InteractionControl
          icon={<IconBookmark size={15} />}
          ariaLabel="Bookmark"
          onClick={() => {}}
        />
      </Group>
    </article>
  );
}
