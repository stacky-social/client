import React from "react";
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
  // Sort each bucket oldest-first so the conversation reads top-to-bottom
  // Use Array.from instead of for-of on Map.values() due to es5 target.
  Array.from(map.values()).forEach((bucket) => {
    bucket.sort((a, b) => a.created_at.localeCompare(b.created_at));
  });
  return map;
}

// ── Sub-renderer ─────────────────────────────────────────────────────────────

function renderTree(
  post: PostType,
  depth: number,
  childMap: Map<string, PostType[]>,
  renderPost: (p: PostType) => React.ReactNode
): React.ReactNode {
  const effectiveDepth = Math.min(depth, MAX_DEPTH);
  const children = childMap.get(post.id) ?? [];

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

      {/* Recursively render children */}
      {children.map((child) =>
        renderTree(child, depth + 1, childMap, renderPost)
      )}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ThreadedReplyList({
  replies,
  rootId,
  renderPost,
}: ThreadedReplyListProps) {
  const childMap = buildChildMap(replies);
  const topLevelReplies = childMap.get(rootId) ?? [];

  if (topLevelReplies.length === 0) {
    return null;
  }

  return (
    <div>
      {topLevelReplies.map((post) =>
        renderTree(post, 0, childMap, renderPost)
      )}
    </div>
  );
}
