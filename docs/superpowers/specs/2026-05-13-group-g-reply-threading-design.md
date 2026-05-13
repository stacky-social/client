# Group G — Reply Threading Design Spec
**Date:** 2026-05-13
**Author:** Group G Agent (claude/unruffled-einstein-13834c)
**Status:** Locked for implementation

---

## Problem

The post detail view (`/posts/[id]`) renders all replies as a flat list with no visual hierarchy. When a reply A gets a reply B, there is no indication that B is a child of A. This makes threaded conversations hard to follow, especially when multiple branches of discussion exist simultaneously.

The Mastodon context API already returns the full descendant tree (all nested replies), and each post carries `in_reply_to_id`. The data is there; the visual presentation is missing.

---

## Goals

1. Visually indent replies at each nesting level using a continuous vertical "thread line" (Twitter/X style).
2. Make the nesting hierarchy immediately legible at a glance without user interaction.
3. Apply threading only to the "Time" tab replies panel, where the flat list currently lives.
4. Keep the change purely visual/structural — no new data fetching, no new API calls.

---

## Non-Goals

- Do not change the "Recommended," "Stacked," or "Summary" tabs.
- Do not add collapse/expand controls for thread branches (YAGNI; may be added in a later iteration).
- Do not modify `RepliesStack.tsx`, `ReplySection.tsx`, `RelatedStacks.tsx`, `HoverTooltip.tsx`, or `Shell.tsx`.
- Do not touch the ancestors thread line (existing `CONNECTOR_STYLE` in `page.tsx`).
- Do not add new API endpoints or modify data fetching logic.

---

## Decisions Locked

| Decision | Choice | Rationale |
|---|---|---|
| Indent per level | 28 px | Narrower than Twitter's ~40 px but generous enough for the existing card widths in Stacky. At 3 levels deep, total offset is 84 px, which still leaves ample card width on typical laptop viewports (≥1024 px). |
| Thread line color | `#cbd5e1` (Tailwind slate-300 equivalent) | Neutral, low-contrast grey that is visible on white cards without competing with content. Matches the existing grey palette used elsewhere (`#e7e7e7` borders). |
| Thread line width | 2 px | Consistent with the existing ancestor connector (`CONNECTOR_STYLE.width = 2`). |
| Thread line left position | Aligned with center of parent avatar (20 px from left edge of the indented container, which places the line at the avatar's horizontal center given 40 px avatar diameter). | Avatar diameter in Mantine `Avatar radius="xl"` is 40 px. Center is at 20 px. |
| Max nesting depth rendered with indentation | 4 levels (0 = direct reply, 1 = reply-to-reply, 2, 3). Level 4+ gets the same indent as level 3 (capped). | Prevents runaway indentation on pathological threads while still accurately showing structure for common cases (real Mastodon threads rarely exceed 3 levels). |
| Thread line vertical extent | Runs from the bottom of the parent's avatar row to the top of the last child's avatar row, implemented via a left-border on the wrapper div of each threaded group. | Using `border-left` on the group container rather than an absolutely-positioned pseudo-element allows the line to naturally stretch with variable card heights. |
| Where threading is implemented | New `ThreadedReplyList` component wrapping the time-tab's reply output. `page.tsx` passes the full `replies` array (all descendants) and the `id` of the focus post; the component builds the tree internally. | Keeps `Post.tsx` unmodified; all threading logic is isolated to one new file. |

---

## Behavior Spec

### Data model used

The Mastodon `/api/v1/statuses/:id/context` endpoint returns `descendants` — every post in the thread below the focus post. Each descendant has `in_reply_to_id`. The existing `page.tsx` already stores all descendants in `replies` state.

### Tree building

`ThreadedReplyList` receives `replies: PostType[]` (all descendants) and `rootId: string` (the focus post id). It builds a `Map<string, PostType[]>` of parent-id → children, then recursively renders starting from `rootId`.

```
buildChildren(replies) → Map<parentId, PostType[]>
renderNode(post, depth) →
  <ThreadedGroup depth={depth}>
    {renderPost(post)}
    {children.map(child => renderNode(child, depth + 1))}
  </ThreadedGroup>
```

### ThreadedGroup layout

```
<div style={{ marginLeft: depth * INDENT_PX, position: 'relative' }}>
  {depth > 0 && <div className={styles.threadLine} />}
  {renderPost(post)}
  {children.length > 0 && renderChildren}
</div>
```

The `threadLine` div is `position: absolute; left: 20px; top: 0; bottom: 0; width: 2px; background: #cbd5e1`.

Because the wrapper is `position: relative` and the thread line is `position: absolute` spanning `top:0` to `bottom:0`, it naturally covers the full height of the subtree without any JS measurement.

### Pagination / "show more"

The existing `visibleReplies` / "More Replies" logic is replaced by rendering the full tree (all descendants). The existing `visibleReplies` pagination was designed for a flat slice; tree rendering makes slice-based pagination non-trivial and would truncate threads mid-branch. Since the existing cap was 15 and was controlled by `filteredReplies` (direct replies only), removing it for the threaded view is safe — the full descendant list is already loaded in memory.

**Judgment call:** Removing the "More Replies" button entirely from the time tab. The full descendant count for typical Mastodon threads is small (< 50). If a thread is extremely long, the existing lazy-load at the page level already limits to what the API returns.

### Depth capping

`const effectiveDepth = Math.min(depth, MAX_DEPTH)` where `MAX_DEPTH = 3`.
At depth ≥ 3, no further left margin is added (same indent as depth 3). Thread lines continue rendering normally.

### Sort order within each level

Children are sorted by `created_at` ascending (oldest first), matching the existing time-tab behavior.

---

## Files Touched

| File | Change |
|---|---|
| `src/components/ThreadedReplyList.tsx` | **New.** Contains tree-building logic, recursive renderer, and `ThreadedGroup` layout. |
| `src/components/ThreadedReplyList.module.css` | **New.** CSS Module with `.threadLine` and `.replyGroup` classes. |
| `src/app/(shell)/posts/[id]/page.tsx` | **Modified.** Import and use `ThreadedReplyList` in the "time" tab panel. Remove `filteredReplies` / `visibleReplies` / "More Replies" button from that tab only. Pass full `replies` array and `id` to `ThreadedReplyList`. |

No other files are modified.

---

## Verification

1. `pnpm build` must succeed with zero TypeScript errors.
2. Manual: navigate to `/posts/[id]` for a post with replies. Confirm:
   - Direct replies appear at no indent.
   - Replies-to-replies are indented 28 px with a grey vertical line on the left.
   - Lines connect visually through multi-level nesting.
   - At depth 4+, indentation is capped (no overflow).
3. Manual: confirm no visual regressions on the "Recommended," "Stacked," and "Summary" tabs.
4. Manual: confirm ancestor thread-line (above the focus post) is unaffected.

---

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Mastodon API returns descendants in non-tree order | Low — Mastodon returns them breadth-first but `in_reply_to_id` is always present | Tree builder is purely map-based, order-independent |
| Very wide thread at depth 3+ overflows container | Low — capped at MAX_DEPTH=3 | CSS `overflow: hidden` on outer container as safety net |
| Removing `visibleReplies` pagination breaks UX on huge threads | Low — typical Mastodon threads are small | No code path currently fetches paginated replies; API returns all descendants in one call |
| Thread line color too faint on non-white backgrounds | Low — Stacky cards use `#fff` | Can be adjusted in CSS Module without touching component logic |

---

## Judgment Calls Made Without User Input

1. **Indent = 28 px per level.** The brief said "28–48 px." Chose the lower bound because Stacky's post cards have less horizontal space than Twitter's full-width timeline, and 28 px at 4 levels = 112 px total is still readable.

2. **Thread line implemented via `position: absolute; top:0; bottom:0` on a wrapper div, not measured pixel-by-pixel.** This avoids JS ResizeObserver complexity and works correctly when cards have variable heights (e.g., long text, media attachments).

3. **Removed "More Replies" pagination from the Time tab.** The existing pagination was a flat-list slice; it cannot be trivially adapted to a tree without splitting branches. For the tree view, all descendants are already in memory. This is a deliberate simplification that makes the feature correct.

4. **Children sorted ascending by `created_at` within each level.** The existing "time" tab sorts descending (newest first) for the flat list. For a threaded tree, ascending (oldest first) is the convention used by Twitter/X and Mastodon's own web client, and makes conversational flow easier to follow. This is a behavior change, documented here.

5. **Max depth cap = 3 (4 rendered levels: 0, 1, 2, 3).** The brief mentioned "3–4 levels." Chose 3 (cap) so 4 levels are visible before capping, matching Twitter's behavior.

---

## Next Step

Implement per the plan at `docs/superpowers/plans/2026-05-13-group-g-reply-threading.md`.
