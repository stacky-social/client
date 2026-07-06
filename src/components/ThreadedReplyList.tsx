import React, { useEffect, useState } from "react";
import styles from "./ThreadedReplyList.module.css";

// ── Constants ────────────────────────────────────────────────────────────────

/** Horizontal indent added per nesting level (px). */
const INDENT_PX = 28;

/** Deepest level that receives additional indentation.
 *  Level 0 = direct reply, 1 = reply-to-reply, 2, 3.
 *  Level 4+ is capped at MAX_DEPTH (same visual indent as level 3). */
const MAX_DEPTH = 3;

// ── Types ────────────────────────────────────────────────────────────────────

interface PostType {
  id: string;
  content: string;
  account: {
    username: string;
    acc?: string;
    acct?: string;
    avatar: string;
  };
  replies_count: number;
  created_at: string;
  stackCount: number | null;
  favourites_count: number;
  favourited: boolean;
  bookmarked: boolean;
  media_attachments: any[];
  relatedStacks: any[];
  in_reply_to_id?: string | null;
}

interface ThreadedReplyListProps {
  /** All descendants of the focus post (every nested reply). */
  replies: PostType[];
  /** The id of the focus post — children of this id are the top-level replies. */
  rootId: string;
  /** Render function provided by page.tsx so Post wiring (handlers, highlights)
   *  stays in one place and is not duplicated here. */
  renderPost: (p: PostType) => React.ReactNode;
  /** How many top-level reply branches to show. Each branch includes its full
   *  descendant subtree — no branch is split. Omit to show all. */
  visibleTopLevelCount?: number;
  /**
   * Explicit top-level ordering AND filter: when provided, only these ids
   * render as top-level branches, in this order (ids missing from the thread
   * are ignored). Nested children keep their own newest-first order. Omit for
   * the default newest-first top level.
   */
  topLevelOrder?: string[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a map from parentId → children sorted oldest-first.
 * Posts whose in_reply_to_id is null/undefined are skipped (defensive guard
 * against malformed API responses).
 */
function buildChildMap(replies: PostType[]): Map<string, PostType[]> {
  const map = new Map<string, PostType[]>();
  for (const post of replies) {
    const parentId = post.in_reply_to_id;
    if (!parentId) continue;
    if (!map.has(parentId)) {
      map.set(parentId, []);
    }
    map.get(parentId)!.push(post);
  }
  // Sort each bucket newest-first so the conversation reads top-to-bottom
  // Use Array.from instead of for-of on Map.values() due to es5 target.
  Array.from(map.values()).forEach((bucket) => {
    bucket.sort((a, b) => b.created_at.localeCompare(a.created_at));
  });
  return map;
}

// ── Sub-renderer ─────────────────────────────────────────────────────────────

/** Nested children shown per parent before the "see more" pagination kicks in,
 *  and the increment each click reveals (mirrors the top-level 5-at-a-time). */
const NESTED_PAGE = 5;

function renderTree(
  post: PostType,
  depth: number,
  childMap: Map<string, PostType[]>,
  renderPost: (p: PostType) => React.ReactNode,
  shownByParent: Record<string, number>,
  onShowMore: (parentId: string) => void
): React.ReactNode {
  const effectiveDepth = Math.min(depth, MAX_DEPTH);
  const children = childMap.get(post.id) ?? [];
  const shown = shownByParent[post.id] ?? NESTED_PAGE;
  const visibleChildren = children.slice(0, shown);
  const remaining = children.length - visibleChildren.length;

  return (
    <div
      key={post.id}
      className={styles.replyGroup}
      style={{ marginLeft: effectiveDepth * INDENT_PX }}
    >
      {/* Thread line — only shown when this node is itself a child (depth > 0) */}
      {depth > 0 && <div className={styles.threadLine} aria-hidden="true" />}

      {/* The post card itself */}
      {renderPost(post)}

      {/* Recursively render children — paginated per parent so a branch with
          many nested descendants doesn't dump its whole subtree at once. */}
      {visibleChildren.map((child) =>
        renderTree(child, depth + 1, childMap, renderPost, shownByParent, onShowMore)
      )}
      {remaining > 0 && (
        <button
          type="button"
          data-testid={`nested-see-more-${post.id}`}
          onClick={(e) => {
            e.stopPropagation();
            onShowMore(post.id);
          }}
          aria-label={`Show more replies to this comment (${remaining} hidden)`}
          style={{
            display: "block",
            marginLeft: Math.min(depth + 1, MAX_DEPTH) * INDENT_PX,
            marginBottom: "0.75rem",
            background: "none",
            border: "none",
            padding: "2px 0",
            cursor: "pointer",
            color: "#5a71a8",
            fontWeight: 600,
            fontSize: 13,
          }}
        >
          See {remaining} more {remaining === 1 ? "reply" : "replies"}
        </button>
      )}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ThreadedReplyList({
  replies,
  rootId,
  renderPost,
  visibleTopLevelCount,
  topLevelOrder,
}: ThreadedReplyListProps) {
  // Per-parent nested pagination: parentId → children currently shown.
  // Reset when the thread root changes (navigating to a different post).
  const [shownByParent, setShownByParent] = useState<Record<string, number>>({});
  useEffect(() => {
    setShownByParent({});
  }, [rootId]);
  const handleShowMore = (parentId: string) =>
    setShownByParent((prev) => ({ ...prev, [parentId]: (prev[parentId] ?? NESTED_PAGE) + NESTED_PAGE }));

  const childMap = buildChildMap(replies);
  let topLevelReplies = childMap.get(rootId) ?? [];
  if (topLevelOrder) {
    const byId = new Map(topLevelReplies.map((p) => [p.id, p]));
    topLevelReplies = topLevelOrder
      .map((id) => byId.get(id))
      .filter((p): p is PostType => p !== undefined);
  }

  if (topLevelReplies.length === 0) {
    return null;
  }

  // Slice at the top-level only; each shown branch gets its full subtree.
  const visibleReplies =
    visibleTopLevelCount !== undefined
      ? topLevelReplies.slice(0, visibleTopLevelCount)
      : topLevelReplies;

  return (
    <div>
      {visibleReplies.map((post) =>
        renderTree(post, 0, childMap, renderPost, shownByParent, handleShowMore)
      )}
    </div>
  );
}
