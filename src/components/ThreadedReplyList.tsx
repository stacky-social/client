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
  /**
   * The focus post's author handle. A nested reply by the ORIGINAL POSTER is
   * always the branch's inline preview (X's rule: author replies surface
   * first), before falling back to the most-liked child.
   */
  opAcct?: string;
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

/** X-style branch preview: each parent shows ONE nested reply inline by
 *  default (the OP's reply if there is one, else the most-liked child) — the
 *  rest collapse behind "Show N more replies", which expands in place. */
const NESTED_PREVIEW = 1;
/** Children revealed per "show more" click (mirrors the top-level 5-at-a-time). */
const NESTED_PAGE = 5;

/** OP reply first, then most-liked, then newest — X's relevance, approximated. */
function pickPreviewFirst(children: PostType[], opAcct?: string): PostType[] {
  if (children.length <= 1) return children;
  const score = (p: PostType) => {
    const isOp = opAcct && (p.account.acct === opAcct || p.account.username === opAcct) ? 1 : 0;
    return isOp * 1e9 + (p.favourites_count ?? 0);
  };
  let best = children[0];
  for (const c of children) {
    if (score(c) > score(best)) best = c;
  }
  if (best === children[0]) return children;
  return [best, ...children.filter((c) => c !== best)];
}

const expanderStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  padding: "2px 0",
  cursor: "pointer",
  color: "#5a71a8",
  fontWeight: 600,
  fontSize: 13,
};

function renderTree(
  post: PostType,
  depth: number,
  childMap: Map<string, PostType[]>,
  renderPost: (p: PostType) => React.ReactNode,
  shownByParent: Record<string, number>,
  onShowMore: (parentId: string) => void,
  onShowLess: (parentId: string) => void,
  opAcct?: string
): React.ReactNode {
  const effectiveDepth = Math.min(depth, MAX_DEPTH);
  const children = pickPreviewFirst(childMap.get(post.id) ?? [], opAcct);
  const shown = shownByParent[post.id] ?? NESTED_PREVIEW;
  const visibleChildren = children.slice(0, shown);
  const remaining = children.length - visibleChildren.length;
  const isExpanded = visibleChildren.length > NESTED_PREVIEW;

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

      {/* Recursively render children — one preview inline, the rest behind the
          in-place expander, so a branch never dumps its whole subtree at once.
          Preview children apply the same rule to THEIR children, so the default
          view reads as X-style linear chains. */}
      {visibleChildren.map((child) =>
        renderTree(child, depth + 1, childMap, renderPost, shownByParent, onShowMore, onShowLess, opAcct)
      )}
      {(remaining > 0 || isExpanded) && (
        <div
          style={{
            display: "flex",
            gap: 16,
            marginLeft: Math.min(depth + 1, MAX_DEPTH) * INDENT_PX,
            marginBottom: "0.75rem",
          }}
        >
          {remaining > 0 && (
            <button
              type="button"
              data-testid={`nested-see-more-${post.id}`}
              onClick={(e) => {
                e.stopPropagation();
                onShowMore(post.id);
              }}
              aria-label={`Show more replies to this comment (${remaining} hidden, expands in place)`}
              style={expanderStyle}
            >
              Show {remaining} more {remaining === 1 ? "reply" : "replies"}
            </button>
          )}
          {isExpanded && (
            <button
              type="button"
              data-testid={`nested-show-less-${post.id}`}
              onClick={(e) => {
                e.stopPropagation();
                onShowLess(post.id);
              }}
              aria-label="Collapse this branch back to its preview reply"
              style={{ ...expanderStyle, color: "#94a3b8" }}
            >
              Show fewer
            </button>
          )}
        </div>
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
  opAcct,
}: ThreadedReplyListProps) {
  // Per-parent nested pagination: parentId → children currently shown.
  // Reset when the thread root changes (navigating to a different post).
  const [shownByParent, setShownByParent] = useState<Record<string, number>>({});
  useEffect(() => {
    setShownByParent({});
  }, [rootId]);
  const handleShowMore = (parentId: string) =>
    setShownByParent((prev) => ({ ...prev, [parentId]: (prev[parentId] ?? NESTED_PREVIEW) + NESTED_PAGE }));
  // Collapse folds the branch back to its one-reply preview. Descendants'
  // own expansion counts are kept, so re-expanding restores where you were.
  const handleShowLess = (parentId: string) =>
    setShownByParent((prev) => {
      const { [parentId]: _gone, ...rest } = prev;
      return rest;
    });

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
        renderTree(post, 0, childMap, renderPost, shownByParent, handleShowMore, handleShowLess, opAcct)
      )}
    </div>
  );
}
