import React, { useEffect, useState } from "react";
import styles from "./ThreadedReplyList.module.css";
import { useExperimentFlags } from "../utils/experimentFlags";
import { postDateTimestamp } from "../utils/postDate.mjs";

// ── Constants ────────────────────────────────────────────────────────────────

/** Horizontal indent added per nesting level (px). */
const INDENT_PX = 28;

/** Deepest level that receives additional indentation.
 *  Level 0 = direct reply, 1 = reply-to-reply, 2, 3.
 *  Level 4+ is capped at MAX_DEPTH (same visual indent as level 3). */
const MAX_DEPTH = 3;

/** Reply-cluster bracket geometry — matches the aside (RelatedStacks
 *  GROUP_LINE_WIDTH / GROUP_CORNER_R) so both panes read identically. */
const RAIL_W = 2;
const RAIL_R = 12;

// ── Types ────────────────────────────────────────────────────────────────────

/**
 * Active reply-cluster bracket. The grouped top-level members render inside a
 * single continuous rail whose top-left / bottom-left corners are rounded and
 * whose first member carries the topic tag. Applied at the BRANCH level (the
 * depth-0 wrapper) so the rail spans each member's whole subtree — post + its
 * "Show N more" expander + any expanded children — and never breaks.
 */
interface ClusterRail {
  memberIds: Set<string>;
  firstId: string | null;
  lastId: string | null;
  color: { border: string; bg: string; text: string };
  topic: string;
  count: number;
  onDismiss: () => void;
}

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
  /**
   * Parent reply ids whose nested subtree must be force-revealed (all children
   * shown, no collapse / no expander). page.tsx populates this with the branches
   * that contain a reply matching the active filter, so a matching grandchild is
   * not hidden behind the default collapsed count. Omit for default collapse.
   */
  forceRevealParentIds?: Set<string>;
  /**
   * Active reply-cluster bracket. When present, the grouped top-level members
   * render inside a continuous rail (rounded corners + topic tag) that wraps each
   * member's whole branch, so it never breaks at a member's "Show N more" expander
   * the way a per-post wrapper did. Mirrors the aside's related-card grouping.
   */
  clusterRail?: ClusterRail;
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
  // Sort each bucket newest-first so the conversation reads top-to-bottom.
  // Numeric timestamp compare with an id tiebreak keeps the order deterministic
  // across locales and for same-second replies (reproducible study orderings).
  // Use Array.from instead of for-of on Map.values() due to es5 target.
  Array.from(map.values()).forEach((bucket) => {
    bucket.sort(
      (a, b) =>
        (postDateTimestamp(b.created_at) ?? 0) - (postDateTimestamp(a.created_at) ?? 0)
        || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    );
  });
  return map;
}

// ── Sub-renderer ─────────────────────────────────────────────────────────────

/** X-style branch preview: nested replies (replies-to-replies, i.e. depth >= 2
 *  from the focus post) are HIDDEN by default — each parent collapses its whole
 *  subtree behind "Show N more replies", which expands in place. When a reply
 *  filter is active, page.tsx passes the matching branches' parent ids in
 *  `forceRevealParentIds` so a matching grandchild surfaces instead of staying
 *  hidden behind the collapsed count. */
const NESTED_PREVIEW = 0;
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
  color: "#1c2b4a",
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
  opAcct?: string,
  previewsEnabled: boolean = true,
  forceRevealParentIds?: Set<string>,
  clusterRail?: ClusterRail
): React.ReactNode {
  const effectiveDepth = Math.min(depth, MAX_DEPTH);
  // Control condition (branchPreviews flag off): pure chronological order,
  // every child visible, no expanders — the flat "traditional" thread.
  const children = previewsEnabled
    ? pickPreviewFirst(childMap.get(post.id) ?? [], opAcct)
    : childMap.get(post.id) ?? [];
  // A filter-matched branch is force-revealed (all children, no expander); else
  // the default is NESTED_PREVIEW (0 → grandchildren collapsed) plus whatever the
  // user has manually expanded via "Show N more replies".
  const forced = forceRevealParentIds?.has(post.id) ?? false;
  const shown = forced
    ? children.length
    : previewsEnabled
    ? shownByParent[post.id] ?? NESTED_PREVIEW
    : children.length;
  const visibleChildren = children.slice(0, shown);
  const remaining = children.length - visibleChildren.length;
  const isExpanded = previewsEnabled && !forced && visibleChildren.length > NESTED_PREVIEW;

  // Cluster bracket (depth 0 only): when this top-level branch is a reply-cluster
  // member, its WHOLE .replyGroup gets a continuous visual rail. The frame is
  // absolutely positioned, not a layout border/padding, so grouping never changes
  // reply card width and never pushes the divider. The extra footprint goes left.
  const inCluster = depth === 0 && !!clusterRail?.memberIds.has(post.id);
  const isFirstMember = inCluster && post.id === clusterRail!.firstId;
  const isLastMember = inCluster && post.id === clusterRail!.lastId;
  const bracketStyle: React.CSSProperties = inCluster
    ? {
        position: "relative",
        display: "flow-root",
        // Breathing room between the closed bracket and the next (ungrouped) reply.
        marginBottom: isLastMember ? "0.9rem" : undefined,
      }
    : {};

  return (
    <div
      key={post.id}
      className={styles.replyGroup}
      data-reply-depth={depth}
      // Stable hook for the cluster (present only on a grouped member's branch).
      data-reply-cluster-member={inCluster ? "" : undefined}
      style={{ marginLeft: effectiveDepth * INDENT_PX, ...bracketStyle }}
    >
      {inCluster && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: -RAIL_W * 2,
            right: 0,
            pointerEvents: "none",
            borderLeft: `${RAIL_W}px solid ${clusterRail!.color.border}`,
            borderRight: `${RAIL_W}px solid ${clusterRail!.color.border}`,
            borderTop: isFirstMember ? `${RAIL_W}px solid ${clusterRail!.color.border}` : undefined,
            borderBottom: isLastMember ? `${RAIL_W}px solid ${clusterRail!.color.border}` : undefined,
            borderTopLeftRadius: isFirstMember ? RAIL_R : undefined,
            borderTopRightRadius: isFirstMember ? RAIL_R : undefined,
            borderBottomLeftRadius: isLastMember ? RAIL_R : undefined,
            borderBottomRightRadius: isLastMember ? RAIL_R : undefined,
            zIndex: 6,
          }}
        />
      )}

      {/* Thread line — only shown when this node is itself a child (depth > 0) */}
      {depth > 0 && <div className={styles.threadLine} aria-hidden="true" />}

      {/* Topic tag riding the top rule — the left pane's counterpart of the aside
          header, shown only on the first cluster member. */}
      {isFirstMember && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px 4px 4px" }}>
          <span
            style={{
              fontSize: "11px", fontWeight: 600, color: clusterRail!.color.text,
              background: clusterRail!.color.bg, border: `1px solid ${clusterRail!.color.border}55`,
              borderRadius: "4px", padding: "1px 6px",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "220px",
            }}
          >
            {clusterRail!.topic} ({clusterRail!.count})
          </span>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); clusterRail!.onDismiss(); }}
            aria-label={`Dismiss ${clusterRail!.topic} group`}
            style={{
              background: "none", border: "none", cursor: "pointer", color: "#94a3b8",
              fontSize: "16px", lineHeight: 1, padding: "4px 6px",
              minWidth: 24, minHeight: 24,
              display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 4,
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* The post card itself */}
      {renderPost(post)}

      {/* Recursively render children — one preview inline, the rest behind the
          in-place expander, so a branch never dumps its whole subtree at once.
          Preview children apply the same rule to THEIR children, so the default
          view reads as X-style linear chains. */}
      {visibleChildren.map((child) =>
        renderTree(child, depth + 1, childMap, renderPost, shownByParent, onShowMore, onShowLess, opAcct, previewsEnabled, forceRevealParentIds, clusterRail)
      )}
      {previewsEnabled && !forced && (remaining > 0 || isExpanded) && (
        <div
          style={{
            display: "flex",
            gap: 16,
            marginLeft: Math.min(depth + 1, MAX_DEPTH) * INDENT_PX,
            // Pull up close to the parent card (whose wrapper adds a 1rem bottom
            // gap): the expander belongs to that comment, so the space BEFORE it
            // should be tight; the 0.75rem below keeps a normal gap to the next reply.
            marginTop: "-0.6rem",
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
  forceRevealParentIds,
  clusterRail,
}: ThreadedReplyListProps) {
  // Per-parent nested pagination: parentId → children currently shown.
  // Reset when the thread root changes (navigating to a different post).
  const { branchPreviews } = useExperimentFlags();
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
    <div data-testid="threaded-replies">
      {visibleReplies.map((post) =>
        renderTree(post, 0, childMap, renderPost, shownByParent, handleShowMore, handleShowLess, opAcct, branchPreviews, forceRevealParentIds, clusterRail)
      )}
    </div>
  );
}
