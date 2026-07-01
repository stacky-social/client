# Group G — Reply Threading Implementation Plan
**Date:** 2026-05-13
**Branch:** claude/unruffled-einstein-13834c
**Spec:** docs/superpowers/specs/2026-05-13-group-g-reply-threading-design.md

---

## Pre-flight

- [ ] Read `src/app/(shell)/posts/[id]/page.tsx` to confirm `replies` state shape and tab rendering entry points.
- [ ] Confirm `replies` contains ALL descendants (not just direct children) — verified via `fetchContext` which sets from `data.descendants`.
- [ ] Confirm `Post.tsx` signature — it accepts `id, text, author, account, avatar, repliesCount, createdAt, stackCount, favouritesCount, favourited, bookmarked, mediaAttachments, onStackIconClick, setIsModalOpen, setIsExpandModalOpen, relatedStacks, activePostId, setActivePostId`.

---

## Task 1 — Create CSS Module for thread lines

**File:** `src/components/ThreadedReplyList.module.css`

- [ ] Create file with `.replyGroup` and `.threadLine` classes.
- [ ] `.threadLine`: `position: absolute; left: 20px; top: 0; bottom: 0; width: 2px; background-color: #cbd5e1; z-index: 0;`
- [ ] `.replyGroup`: `position: relative;` (so thread line is contained within this stacking context)

**Commit:** `Add CSS module for reply thread lines (#G)`

---

## Task 2 — Create ThreadedReplyList component

**File:** `src/components/ThreadedReplyList.tsx`

- [ ] Define constants: `INDENT_PX = 28`, `MAX_DEPTH = 3`.
- [ ] Define `PostType` interface (minimal, matching the shape used in `page.tsx`):
  ```ts
  interface PostType {
    id: string;
    content: string;
    account: { username: string; acc?: string; acct?: string; avatar: string; };
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
  ```
- [ ] Define `ThreadedReplyListProps`:
  ```ts
  interface ThreadedReplyListProps {
    replies: PostType[];       // all descendants
    rootId: string;            // focus post id
    renderPost: (p: PostType) => React.ReactNode;
  }
  ```
  Accept `renderPost` as a prop so the component does NOT need to duplicate the `Post` rendering logic or any of the handler wiring already set up in `page.tsx`.

- [ ] Implement `buildChildMap(replies: PostType[]): Map<string, PostType[]>`:
  - Creates a map from `in_reply_to_id` → sorted-by-`created_at`-ascending array of children.
  - Posts whose `in_reply_to_id` is null or undefined are ignored (shouldn't appear in descendants but defensive).

- [ ] Implement recursive renderer `renderTree(postId: string, childMap, depth: number): React.ReactNode`:
  - Looks up children of `postId` from `childMap`.
  - For each child: renders a wrapper div with `marginLeft: effectiveDepth * INDENT_PX` and `position: relative`, conditionally renders the thread line div (only when `depth > 0`), then renders `renderPost(child)`, then recurses for grandchildren.
  - `effectiveDepth = Math.min(depth, MAX_DEPTH)`.

- [ ] Export `ThreadedReplyList` as default React FC that:
  1. Calls `buildChildMap(replies)`.
  2. Gets direct children of `rootId` from the map.
  3. Maps over them calling `renderTree(child.id, childMap, 1)`.
  4. Wraps the whole output in a `<div>`.

- [ ] Zero external dependencies beyond React and the CSS module. No framer-motion, no Mantine, no axios.

**Commit:** `Add ThreadedReplyList component with tree-building logic (#G)`

---

## Task 3 — Wire ThreadedReplyList into page.tsx

**File:** `src/app/(shell)/posts/[id]/page.tsx`

- [ ] Import `ThreadedReplyList` from `../../../../components/ThreadedReplyList`.
- [ ] In the "time" `Tabs.Panel`:
  - Remove the `repliesByTimeDesc.slice(0, visibleReplies).map((p) => renderPost(p))` flat render.
  - Remove the "More Replies" `Button`.
  - Replace with `<ThreadedReplyList replies={replies} rootId={id} renderPost={renderPost} />`.
- [ ] Remove `visibleReplies` state and `handleShowMoreReplies` handler **only if they are used nowhere else**. Check: `visibleReplies` is only used in the time tab panel and `handleShowMoreReplies`. Remove both.
- [ ] Keep `filteredReplies`, `repliesByTimeDesc`, and `replyIDs` derived values — `replyIDs` is still used by `fetchRecommended`, `fetchRepliesStack`, and `fetchSummary`; `filteredReplies` computes `replyIDs`. Keep `repliesByTimeDesc` removal deferred — check if used elsewhere.
  - After check: `repliesByTimeDesc` is only used in the time panel. Remove it.
  - `filteredReplies` is used to compute `replyIDs`. Keep it.

**Commit:** `Wire ThreadedReplyList into post detail time tab (#G)`

---

## Task 4 — Verification

- [ ] Run `pnpm build` in the worktree. Fix any TypeScript errors.
- [ ] If TS errors occur in `ThreadedReplyList.tsx`, ensure the `PostType` interface there matches actual shape from `page.tsx`.

**Commit (if fixes needed):** `Fix TypeScript errors in ThreadedReplyList (#G)`

---

## Task 5 — Write spec and plan docs

- [x] Spec written at `docs/superpowers/specs/2026-05-13-group-g-reply-threading-design.md`
- [x] Plan written at `docs/superpowers/plans/2026-05-13-group-g-reply-threading.md`

**Commit:** `Add spec and plan docs for Group G reply threading (#G)`

---

## Task 6 — Open PR

- [ ] Push branch to remote.
- [ ] `gh pr create` targeting `dev` with full description.

---

## Definition of Done

- `pnpm build` exits 0 with no errors.
- `ThreadedReplyList.tsx` and `ThreadedReplyList.module.css` exist in `src/components/`.
- The time tab in `/posts/[id]` renders replies as an indented tree with grey vertical thread lines.
- No other tabs, components, or CSS files are modified.
- PR open targeting `dev`.
