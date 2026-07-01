# Group E — Reordering Algorithm (Implementation Plan)

**Date:** 2026-05-13
**Spec:** `docs/superpowers/specs/2026-05-13-group-e-reordering-design.md`
**Branch:** `tarcode2004/enhancement/group-e-reordering`
**Base branch:** `tarcode2004/enhancement/listy-injection-main-app`

---

## Prerequisites

- [ ] Branch created from `tarcode2004/enhancement/listy-injection-main-app`.
- [ ] `pnpm build` passes on the base branch before any changes.

---

## Step 1 — Add `reorderForAnchor` utility

**File:** `src/utils/reorderForAnchor.ts` (new file)

- [ ] Create the file with the pure `reorderForAnchor<T>` function.
  ```ts
  /**
   * Reorders `stacks` so that posts matching `matchPredicate` above `targetPostId`
   * move immediately above it, and those below move immediately below it.
   * Non-matching posts stay in their relative positions.
   */
  export function reorderForAnchor<T extends { topPost: { id: string } }>(
    stacks: T[],
    targetPostId: string,
    matchPredicate: (postId: string) => boolean,
  ): T[]
  ```
- [ ] Implementation: find `targetIdx`; split into `above`/`below`; partition each by predicate; return `[...aboveUnmatched, ...aboveMatched, target, ...belowMatched, ...belowUnmatched]`.
- [ ] Export only the function (no React imports needed).

**Commit:** `Add reorderForAnchor utility for above/below grouping`

---

## Step 2 — Add refs to `RelatedStacks`

**File:** `src/components/RelatedStacks.tsx`

- [ ] Add `baseOrderRef = useRef<string[]>([])` — stack post IDs at the time the current anchor was created.
- [ ] Add `activeAnchorIdRef = useRef<string | null>(null)` — the anchor currently driving reordering.
- [ ] Add `prevDisplayStacksRef = useRef<RelatedStackType[]>([])` — updated by a `useEffect` after each render to track the most recently painted displayStacks.
- [ ] Add `useEffect(() => { prevDisplayStacksRef.current = displayStacks; }, [displayStacks])` — must be placed AFTER the `displayStacks` memo and before the return statement.

**Commit:** `Add baseOrder and prevDisplayStacks refs to RelatedStacks`

---

## Step 3 — Replace the reranking loop in `displayStacks`

**File:** `src/components/RelatedStacks.tsx`

The existing loop (lines ~724–781) processes every anchor in `reRankAnchorIds` in order, using a cumulative "remove-and-reinsert-after" pattern. Replace it with the single-anchor above/below algorithm.

- [ ] Import `reorderForAnchor` from `../utils/reorderForAnchor`.
- [ ] At the top of the `useMemo` body, keep the same declarations: `anchorSet`, `claimedBy`, `anchorParent`, `groupTotal`, `groupShown`, `result = [...relatedStacks]`.
- [ ] If `reRankAnchorIds.length === 0`:
  - Reset `baseOrderRef.current = []` and `activeAnchorIdRef.current = null`.
  - Skip the reranking block entirely.
- [ ] If `reRankAnchorIds.length > 0`:
  - Take `anchorId = reRankAnchorIds[reRankAnchorIds.length - 1]` (the most recently added anchor).
  - If `anchorId !== activeAnchorIdRef.current` (new anchor):
    - `baseOrderRef.current = prevDisplayStacksRef.current.map(s => s.topPost.id)`.
    - `activeAnchorIdRef.current = anchorId`.
  - Build `baseStacks: RelatedStackType[]` from `baseOrderRef.current`: for each ID in `baseOrderRef`, find the matching entry in `relatedStacks`. Drop IDs with no match (stale data safety). If `baseOrderRef.current` is empty (first activation on this focus post), fall back to `[...relatedStacks]`.
  - Compute `anchorTopic` (same as today: `anchorRangeIdx = anchoredRangeByPost[anchorId]`, then `anchor.topPost.relations?.[anchorRangeIdx]?.topic`).
  - Build `matchPredicate`:
    ```ts
    const matchPredicate = anchorTopic
      ? (pid: string) => pid !== anchorId && (relatedStacks.find(s => s.topPost.id === pid)?.topPost.relations?.some(r => r.topic === anchorTopic) ?? false)
      : (pid: string) => pid !== anchorId && similarityScore(relatedStacks.find(s => s.topPost.id === pid)?.topPost.content ?? '', anchorContent) > SIMILARITY_THRESHOLD;
    ```
  - Compute `allMatched = baseStacks.filter(s => matchPredicate(s.topPost.id))`.
  - Compute `shown = shownByAnchor[anchorId] ?? SHOWN_INCREMENT`.
  - `visibleMatched = allMatched.slice(0, shown)`.
  - Set `groupTotal.set(anchorId, allMatched.length)`.
  - Set `groupShown.set(anchorId, visibleMatched.length)`.
  - `visibleMatchedIds = new Set(visibleMatched.map(s => s.topPost.id))`.
  - For each of `visibleMatched`: `claimedBy.set(s.topPost.id, anchorId)`.
  - Remove non-visible matched posts from `baseStacks`: `paginatedBase = baseStacks.filter(s => s.topPost.id === anchorId || !matchPredicate(s.topPost.id) || visibleMatchedIds.has(s.topPost.id))`.
  - Apply `result = reorderForAnchor(paginatedBase, anchorId, (pid) => visibleMatchedIds.has(pid))`.
  - Populate `anchorSet.add(anchorId)`.
  - For compatibility with label/connector rendering, also populate `anchorParent` (walk the `anchorSet` to find if the anchor is inside another anchor's claimed group — keep the existing parent-detection loop but only for this single anchor).

- [ ] Keep the filter-chip application block (`if (filterCategories.size > 0) ...`) unchanged after the reranking block.
- [ ] Return the same shape: `{ displayStacks: result, claimedBy, anchorSet, anchorParent, groupTotal, groupShown }`.

**Commit:** `Replace reranking loop with above/below split algorithm`

---

## Step 4 — Verify build

- [ ] Run `pnpm build` — must produce zero TypeScript errors and zero ESLint errors.
- [ ] Fix any type errors (the main risk is the generic parameter on `reorderForAnchor`).

**Commit:** (fix errors if any, otherwise skip)

---

## Step 5 — Manual smoke test (mental walkthrough)

With the implementation in place, trace through the algorithm manually with a small example:

- `relatedStacks` = [A, B, C, D, E] (IDs a, b, c, d, e)
- User clicks anchor on C (postId = c), topic = "Contract reform"
- A and D share that topic; B, E do not.
- `baseOrder` = [a, b, c, d, e] (from prevDisplayStacks, which at first activation = relatedStacks order)
- `allMatched` = [A, D]
- `shown` = 3 (SHOWN_INCREMENT)
- `visibleMatched` = [A, D] (both fit)
- `paginatedBase` = [A, B, C, D, E] (no non-visible matched to drop)
- `reorderForAnchor`: above = [A, B], below = [D, E]; aboveMatched = [A], aboveUnmatched = [B]; belowMatched = [D], belowUnmatched = [E]
- `result` = [B, A, C, D, E]

Expected: A moves from above-C to immediately-above-C (stays above), D stays below C (already was). B (unmatched above) stays above. E (unmatched below) stays below. Correct.

Now user clicks anchor on B while C's grouping is active:
- `prevDisplayStacks` = [B, A, C, D, E] (the order from the last render)
- New anchor = b; `activeAnchorIdRef` = c → new anchor detected
- `baseOrderRef` = [b, a, c, d, e] (captured from prevDisplayStacks)
- New reordering runs on top of this base.

Correct per spec.

---

## Step 6 — Open PR

- [ ] `git push -u origin tarcode2004/enhancement/group-e-reordering`
- [ ] `gh pr create --base tarcode2004/enhancement/listy-injection-main-app --head tarcode2004/enhancement/group-e-reordering`

---

## Verification Checklist

- [ ] `pnpm build` exits 0
- [ ] Related stacks above anchor with matching topic move immediately above anchor
- [ ] Related stacks below anchor with matching topic move immediately below anchor
- [ ] Unmatched stacks remain in relative positions
- [ ] Clicking anchor "×" or the header badge reverts to original order
- [ ] "N more [topic]" pagination still works (increases visible count)
- [ ] Selecting a second anchor while first is active: first grouping abandoned, new base = current visible order
- [ ] No TypeScript `any` types introduced without existing precedent
- [ ] No touched files outside `RelatedStacks.tsx` and `src/utils/reorderForAnchor.ts`
