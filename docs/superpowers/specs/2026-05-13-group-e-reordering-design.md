# Group E — Reordering Algorithm (Design Spec)

**Date:** 2026-05-13
**Status:** Ready for implementation.
**Scope:** Change the "see-more" anchor reordering so that matched posts above the anchor stay above, matched posts below stay below, and switching anchors resets the base rather than composing.
**Owner:** tarcode2004

---

## 1. Problem

The current reranking logic in `RelatedStacks.tsx` (`displayStacks` memo, lines ~716–796) pulls all similar posts **below** the anchor regardless of their original positions. This violates the user's reading direction: posts the user has already scrolled past should not resurface below the anchor because that creates re-exposure to content already seen above.

Additionally, when the user clicks a second "see more" on a different anchor while one is already active, the two groupings silently compose (the second anchor also moves its matches, possibly interleaving with the first group). The brief requires that selecting a new anchor **abandons** the prior grouping — the new base is the visible order at the moment of selection.

## 2. Goals

1. **Above → above, below → below.** Matched posts originally above the anchor (in `baseOrder`) move immediately above the anchor; matched posts originally below move immediately below. Non-matched posts stay put.
2. **Unselect reverts.** When an anchor is toggled off, the list reverts to `baseOrder` (the order before that grouping was applied).
3. **Single active grouping.** Only one anchor may be "active" at a time for the reordering effect. If the user clicks a new anchor while another is active, the prior grouping is abandoned; the *current visible order* becomes the new `baseOrder`.
4. **Consistent with existing pagination.** The `shownByAnchor` / `SHOWN_INCREMENT` pagination (how many matched items are shown before the "N more Topic" link) continues to work as before.

## 3. Non-Goals

- Composing multiple simultaneous groupings (not in scope; brief explicitly says "not grouped by both").
- Changing the "see more" button styling or tooltip UI (Group B territory).
- Changing the filter chip behavior (Group C territory).
- Changing highlight-to-filter interactions (Group D territory).
- Threaded replies, focus-post marks (Groups G and D respectively).

## 4. Decisions Locked

| # | Question | Decision |
|---|---|---|
| Q1 | How many anchors can drive reordering at once? | **Exactly one.** Multiple anchors in `reRankAnchorIds` is still possible (the store supports it for nested grouping), but the reordering algorithm only acts on the *most recently added* anchor. The prior anchor's grouping is abandoned when a new one is created. |
| Q2 | What is `baseOrder`? | The array of stack IDs representing the order at the moment the **current** anchor was created. When no anchor is active it is empty/null. |
| Q3 | When does `baseOrder` reset? | On two events: (a) a new anchor **replaces** the existing one — `baseOrder` is captured from `displayStacks` at that moment; (b) the anchor is toggled off — `baseOrder` is cleared and `displayStacks` reverts to `relatedStacks` order. |
| Q4 | Where to track `baseOrder`? | A `useRef<string[]>` inside `RelatedStacks`. Not a state variable — updates do not need to re-render; they are read synchronously inside the `displayStacks` memo on the same render cycle that processes the new anchor. |
| Q5 | Does `baseOrder` interact with the filter? | No. Filtering runs after reordering (same as today). `baseOrder` only records unfiltered stack IDs. |
| Q6 | What about the similarity-based fallback (word-overlap)? | The same above/below split applies. If `anchorTopic` is undefined and content-similarity is used, the same algorithm: above-matched go above, below-matched go below. |
| Q7 | Do sub-anchors (nested groupings via `anchorParent`) survive? | Judgment call: Group E does not attempt to preserve nested sub-anchor behavior. If the user adds a second anchor while one is active, the first is cleared from `reRankAnchorIds` before the second is processed. See "Judgment Calls" section. |

## 5. Behavior Specification

### 5.1 State additions

```ts
// Inside RelatedStacks component:
const baseOrderRef = useRef<string[]>([]);          // stack IDs before current grouping
const activeAnchorIdRef = useRef<string | null>(null); // the anchor currently driving reordering
```

### 5.2 Reorder algorithm

Given:
- `baseOrder`: array of `stackId` (not `postId`; both are unique but the component primarily uses `stackId` for keys — see JC #1)
- `targetId`: the anchor's `topPost.id`
- `matchPredicate(id: string) => boolean`: returns true if the stack with that post ID matches

```ts
function reorderForAnchor(
  stacks: RelatedStackType[],
  targetPostId: string,
  matchPredicate: (postId: string) => boolean,
): RelatedStackType[] {
  const targetIdx = stacks.findIndex(s => s.topPost.id === targetPostId);
  if (targetIdx < 0) return stacks;

  const above = stacks.slice(0, targetIdx);
  const target = stacks[targetIdx];
  const below = stacks.slice(targetIdx + 1);

  const aboveMatched   = above.filter(s => matchPredicate(s.topPost.id));
  const aboveUnmatched = above.filter(s => !matchPredicate(s.topPost.id));
  const belowMatched   = below.filter(s => matchPredicate(s.topPost.id));
  const belowUnmatched = below.filter(s => !matchPredicate(s.topPost.id));

  return [
    ...aboveUnmatched,
    ...aboveMatched,
    target,
    ...belowMatched,
    ...belowUnmatched,
  ];
}
```

The target is **excluded** from `matchPredicate` results (it is always in the center).

### 5.3 Integration into `displayStacks` memo

Replace the existing nested-reranking loop with:

1. If `reRankAnchorIds` is empty: return `[...relatedStacks]` (no reordering). Clear `baseOrderRef` and `activeAnchorIdRef`.
2. Take the **last** element of `reRankAnchorIds` as the active anchor (`anchorId = reRankAnchorIds[reRankAnchorIds.length - 1]`). Group E only processes one anchor.
3. If `anchorId !== activeAnchorIdRef.current` (new anchor was added or replaced):
   - Capture `baseOrderRef.current` = the IDs of `relatedStacks` in their current display order (from the *previous* render's `displayStacks`, if available, or `relatedStacks` directly).
   - Update `activeAnchorIdRef.current = anchorId`.
4. Build `baseStacks`: reconstruct `RelatedStackType[]` from `baseOrderRef.current` IDs, mapping back to `relatedStacks` objects. Filter out any IDs that no longer exist in `relatedStacks` (safety).
5. Compute `anchorTopic` from `anchoredRangeByPost[anchorId]` as today.
6. Build `matchPredicate`: `(postId) => postId !== anchorId && (stack.topPost.relations?.some(r => r.topic === anchorTopic) ?? false)`. If no `anchorTopic`, fall back to `similarityScore > SIMILARITY_THRESHOLD`.
7. Apply `reorderForAnchor(baseStacks, anchorId, matchPredicate)` → `reordered`.
8. Apply pagination: compute `visible` (first `shownByAnchor[anchorId] ?? SHOWN_INCREMENT` matched items). This is needed to drive `groupShown` / `groupTotal` and the "N more" link.
9. Build `claimedBy`, `anchorSet`, `groupTotal`, `groupShown` from the matched/visible sets.
10. The `displayStacks` output is `reordered` with only `visible` matched posts (non-visible matched posts are removed from the list, same as today).
11. Apply filter chips on the final result (same as today).

### 5.4 `baseOrder` capture timing

The critical challenge: `baseOrderRef` must be captured from the **currently displayed** order, not from `relatedStacks` (which is always the server order). But `displayStacks` is computed inside a memo — we cannot read it from a ref inside its own computation without a cycle.

**Solution:** Use a separate `useRef<RelatedStackType[]>` called `prevDisplayStacksRef` that is updated at render-bottom using a plain `useEffect(..., [displayStacks])`. When a new anchor triggers, `baseOrderRef` is set to the IDs from `prevDisplayStacksRef.current` at that moment.

```
render N  → displayStacks computed (old anchor or no anchor)
          → useEffect fires (after paint): prevDisplayStacksRef = displayStacks
render N+1 (new anchor): memo sees new anchorId, reads prevDisplayStacksRef.current
                          → captures baseOrder from the order that was visible to the user
```

There is a one-render lag: the base is from the *previous* render's visible order, not the current render. This is correct and acceptable — when the user clicks a new anchor, the order they saw was render N's `displayStacks`, which is what `prevDisplayStacksRef` holds.

### 5.5 Unselect

When `reRankAnchorIds` becomes empty:
- `baseOrderRef.current = []`
- `activeAnchorIdRef.current = null`
- `displayStacks` returns `[...relatedStacks]`

### 5.6 Different-grouping replaces base

When `reRankAnchorIds.length > 0` and the last ID differs from `activeAnchorIdRef.current`:
- `baseOrderRef.current = prevDisplayStacksRef.current.map(s => s.topPost.id)`
- `activeAnchorIdRef.current = newAnchorId`
- Reorder runs on top of the captured base.

**Important sub-case:** The brief says "the current visible order becomes the new ground truth." We capture from `prevDisplayStacksRef` (the order the user saw on screen), not from `relatedStacks`. This correctly encodes "what the user had in front of them."

### 5.7 `anchorParent` / nested anchors

Group E does not support nested anchors. The `anchorParent` map is still computed for compatibility with the label-rendering and connector-line code (which uses it for indentation), but `reorderForAnchor` only runs on the single active anchor.

## 6. Files Touched

| File | Change |
|---|---|
| `src/components/RelatedStacks.tsx` | Replace the nested-reranking loop in `displayStacks` memo; add `baseOrderRef`, `activeAnchorIdRef`, `prevDisplayStacksRef`; add `reorderForAnchor` helper (or import it). |
| `src/utils/reorderForAnchor.ts` | New utility file with the pure `reorderForAnchor` function (YAGNI: only if the function benefits from isolation; otherwise inline). |

Do NOT touch: `HoverTooltip.tsx`, `Shell.tsx`, `ThreadedReplyList.tsx`, `ReplySection.tsx`, `Post.tsx`, `highlightStore.ts`.

## 7. Verification

```bash
pnpm build   # must produce zero TypeScript errors and zero ESLint errors
```

Manual test plan:
1. Open a focus post with ≥ 6 related stacks.
2. Note the initial order (mentally label: stack A at position 1, B at 2, … F at 6).
3. Hover stack C and click one of its highlight marks to trigger the anchor.
4. **Verify:** stacks that share C's topic AND were originally *above* C (A, B) are now immediately above C; stacks originally *below* C that share the topic are immediately below C.
5. Click the anchor label's "×" to deselect. **Verify:** list reverts to original order.
6. Trigger anchor on D (different post), then click "N more [topic]". **Verify:** the "show more" still works (pagination increases).
7. With D's grouping active, trigger anchor on B (different post). **Verify:** D's grouping is abandoned, B becomes the new anchor, reordering runs on the order visible just before B was clicked.

## 8. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| `prevDisplayStacksRef` one-render lag shows wrong base | Low | The lag is exactly one render, which is imperceptible to users. The base is always the most recently *painted* order. |
| `anchorParent` / connector-line rendering breaks | Low | `anchorParent` is still computed (now for a single anchor only), so label and connector-line code is unaffected. |
| Pagination ("N more") breaks because `groupTotal`/`groupShown` changes | Low | `groupTotal` = total matched count across `baseStacks`; `groupShown` = visible slice. Logic is identical to today's. |
| Filter categories interact badly | Low | Filter still runs after reordering, same as today. |
| Framer Motion FLIP jumps on reorder | Low | `layout` props are already set on `motion.div` and the scroll-pinning `useLayoutEffect` already compensates. |

## 9. Next Steps

1. Write implementation plan (`docs/superpowers/plans/2026-05-13-group-e-reordering.md`).
2. Implement step-by-step.
3. `pnpm build` verification.
4. Open PR against `tarcode2004/enhancement/listy-injection-main-app`.

---

## Judgment Calls Made Without User Input

**JC-1: Use `postId` (not `stackId`) as the key in `baseOrder`.**
The reorder algorithm needs to identify individual stacks by a stable ID. `topPost.id` (postId) is what `toggleReRankAnchor`, `claimedBy`, and the match predicate already use. `stackId` is the React `key` for `motion.div`. Using `postId` in `baseOrder` is consistent with the existing codebase. Risk: near-zero (postId and stackId are both unique and one-to-one per card).

**JC-2: Only the *last* anchor in `reRankAnchorIds` drives reordering.**
The brief says "if the user picks a different group-by while already grouped, the prior grouping is abandoned." This implies single-active-anchor semantics. The existing store supports multiple anchors (nested re-ranking), but Group E's reordering replaces the nested loop with a single-anchor algorithm. Older anchors in `reRankAnchorIds` are preserved in state (for the "Grouped by: Topic ×" header UI) but do not drive reordering. Conservative choice: the UI still shows all anchors so the user can deselect them; only the last one actually moves cards.

**JC-3: Capture `baseOrder` from `prevDisplayStacksRef`, not from `relatedStacks`.**
The brief: "the current visible order becomes the new ground truth." `relatedStacks` is the server order; it does not reflect any active grouping. To capture what the user *sees*, we must read the previously-rendered `displayStacks`. The one-render lag is acceptable.

**JC-4: Non-visible matched posts are *removed* from `displayStacks` (same as today).**
When `shownByAnchor[anchorId] = 3` and there are 8 matches, only 3 are shown. The other 5 are removed from the list (they are "claimed" but not displayed until the user clicks "N more"). This is the same as the existing behavior and is not changed by Group E.

**JC-5: `anchorParent` is retained in the memo output for compatibility.**
The label-rendering and connector-line code references `anchorParent` for visual indentation. Group E preserves this map even though reordering now only acts on one anchor. This avoids breaking the visual grouping chrome while keeping the reordering logic simple.
