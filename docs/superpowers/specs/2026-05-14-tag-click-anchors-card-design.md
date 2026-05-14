# Tag-Click Anchors Card (Design Spec)

**Date:** 2026-05-14
**Status:** Ready for implementation
**Scope:** Change the desktop click handler on the relation tag pills (top-left of each related-post card, e.g. "Framing", "Agree", "Disagree") from filter-by-category to anchor-and-reorder.
**Owner:** tarcode2004
**Approach:** One-line swap in `RelatedStacks.tsx`. No new state, no new files, no API changes.
**Base branch:** `tarcode2004/enhancement/listy-injection-main-app`
**Target branch (PR):** `tarcode2004/enhancement/listy-injection-main-app` (NOT `dev`)

---

## 1. Problem

The relation tags on each related-post card (top-left: "Framing", "Agree", "Disagree", etc.) currently behave inconsistently with the rest of the card's clickable surfaces.

| Surface | Click behavior |
|---|---|
| Highlight substring on a related post | `handleToggleAnchor(postId, rangeIndex)` → pin card, cluster same-topic posts above/below |
| F-indicator chip on top-right of card | `handleToggleAnchor(postId, 0)` → pin card, cluster same-topic posts above/below |
| **Relation tag pill on top-left of card** | **`handleFilterChipClick(cat)` → filter the panel down to that category** ← inconsistent |
| Category sidebar chips at top of panel | `handleFilterChipClick(cat)` → filter the panel down to that category |

The tag pill sits on the card itself — semantically it identifies *this card's* relation to the focus post. Users reading "Framing" on a card and clicking it expect to see other posts that frame the focus post the way this one does, sitting next to this card. Instead the panel filters and reorders globally, hiding context.

The correct behavior matches the F-indicator and the highlight substring: clicking the tag should anchor the card and bring related (same-topic) posts above and below it.

## 2. Goal

Single goal: **G1 — Desktop click on a relation tag pill calls `handleToggleAnchor(stack.topPost.id, indices[0])` instead of `handleFilterChipClick(cat)`.**

`indices[0]` is the index of the first relation on this card whose `category` matches the clicked tag — same convention already used by the touch-path's two-tap anchor commit at [src/components/RelatedStacks.tsx:1705](src/components/RelatedStacks.tsx:1705).

## 3. Non-Goals

- No change to the touch-path two-tap behavior at [src/components/RelatedStacks.tsx:1702-1712](src/components/RelatedStacks.tsx:1702). It already commits via `handleToggleAnchor(stack.topPost.id, indices[0])` on second tap.
- No change to hover behavior on the tag (`setHoveredCategory(cat)` + tooltip). Both unchanged.
- No change to the category sidebar filter chips at the top of the panel. They keep `handleFilterChipClick`.
- No change to the F-indicator on top-right of cards.
- No change to `toggleReRankAnchor` semantics, `reorderForAnchor`, or any other shared logic.
- No change to `highlightStore` shape.
- No new visual "active" treatment on the tag itself; anchored state is already communicated by the F-indicator turning colored and by the reorder/pin animation.
- No URL state for tag-click anchoring beyond what `reRankAnchorIds` already syncs (Group H).
- No change to the C3 "neutral-until-hover" multi-type tag coloring rule.
- No change to the C4 conjunction filter logic (filter chips and chip preview).

## 4. Decisions Locked

| # | Question | Decision | Rationale |
|---|---|---|---|
| JC1 | Which `rangeIndex` to pass to `handleToggleAnchor` when a tag spans multiple relation indices on one card? | `indices[0]` — the first relation index whose `category` matches the tag. | Matches the touch-path's existing convention on the same component (line 1705). Deterministic and stable across re-renders. |
| JC2 | What happens when clicking a *different* tag on a card that is already the active anchor (different `rangeIndex`, same `postId`)? | The anchor clears. To re-anchor on a different category, user clicks again. | This is the existing `toggleReRankAnchor` toggle behavior (keys on `postId` only). Matches the behavior of clicking different highlight substrings on the same card. Consistent, no new inconsistency introduced. |
| JC3 | Should touch behavior change to single-tap-to-anchor for parity with desktop? | No. Touch keeps the two-tap pattern (first tap previews via `setHoveredCategory`, second tap anchors). | Touch already commits to `handleToggleAnchor` on second tap. Changing touch is out of scope and would lose the preview. |
| JC4 | Should hover behavior change? | No. Hover keeps `setHoveredCategory(cat)` + tooltip via `tagHover`. | Hover preview (dimming non-matching highlights) is still useful even though click no longer filters — it tells the user which highlights on the focus post correspond to this tag's category. |
| JC5 | Should the tag get an "active" visual when its card is anchored? | No. F-indicator already turns colored when its card is the active anchor (existing behavior). Adding a second active-state cue would be redundant. | Minimal change; feedback already exists. Can be revisited if user testing shows it's unclear. |
| JC6 | Update the C4 inline comment at line 1714? | Yes — change `"C4 desktop: clicking a relation tag filters the panel by this category"` to a comment describing the anchor-and-reorder behavior. | The comment will be wrong after the change. |
| JC7 | Branch and PR target | Base on `tarcode2004/enhancement/listy-injection-main-app`; PR back to the same. Do not target `dev`. | Per user instruction. |

## 5. Behavior Specification

### 5.1 Desktop click on a relation tag pill (the change)

Currently at [src/components/RelatedStacks.tsx:1713-1716](src/components/RelatedStacks.tsx:1713):

```tsx
} else {
  // C4 desktop: clicking a relation tag filters the panel by this category
  handleFilterChipClick(cat);
}
```

After:

```tsx
} else {
  // Clicking a relation tag pin-anchors this card and clusters same-topic
  // posts immediately above/below it — same as clicking a highlight substring
  // or the F-indicator chip on the top-right.
  handleToggleAnchor(stack.topPost.id, indices[0]);
}
```

`indices` is already in scope at this site — it is the array of relation indices whose `category === cat`, computed in the dedupe pass at [src/components/RelatedStacks.tsx:1668-1675](src/components/RelatedStacks.tsx:1668).

### 5.2 Effect on the rendered list

`handleToggleAnchor` calls `toggleReRankAnchor(postId, rangeIndex)` which sets `reRankAnchorIds = [postId]` (single-anchor invariant). The memoized `displayStacks` pipeline at [src/components/RelatedStacks.tsx:920-963](src/components/RelatedStacks.tsx:920) then runs `reorderForAnchor`, placing same-topic posts immediately above and below the pinned card. The pinned card stays visually in place via the existing scroll-compensation `useLayoutEffect`.

A second click on the same tag (same `postId`) clears the anchor — the panel returns to its prior global order.

### 5.3 What does not change

- **Hover on tag:** still calls `setHoveredCategory(cat)` (desktop) + `tagHover` tooltip. Dims non-matching highlights on the focus post — useful as a preview, regardless of whether click filters or anchors.
- **Touch two-tap on tag:** unchanged. First tap previews; second tap on the same tag commits `handleToggleAnchor(stack.topPost.id, indices[0])`. Already correct.
- **Filter sidebar chips:** unchanged. `handleFilterChipClick` still applies the C1-C4 conjunction/preview filter logic.
- **F-indicator on top-right:** unchanged. Still `handleToggleAnchor(stack.topPost.id, 0)`.
- **C3 neutral-until-hover styling:** unchanged.
- **All shared logic** (`toggleReRankAnchor`, `reorderForAnchor`, `highlightStore` shape, scroll pinning): unchanged.

## 6. Files Touched

| File | Change |
|---|---|
| [src/components/RelatedStacks.tsx](src/components/RelatedStacks.tsx) | Single edit: line 1715 swap `handleFilterChipClick(cat)` → `handleToggleAnchor(stack.topPost.id, indices[0])`; update the inline comment at line 1714. |

No other files modified.

## 7. Risks & Edge Cases

- **R1. Anchor clears on tag-of-different-category on already-anchored card.** Same as JC2 — consistent with substring click; not a regression because the previous behavior (filter) also didn't handle this case meaningfully.
- **R2. Tag click no longer adds to the multi-category filter set.** Users who relied on the old behavior (clicking tags to build a multi-category filter) must use the top-panel sidebar chips instead. Acceptable — the sidebar chips are the canonical filter affordance; tag clicks were a duplicate path that conflicted with the more useful anchor behavior.
- **R3. `indices[0]` could differ from the user's intent if a card has the same category at multiple positions and the user is "thinking of" the second one.** The choice of `indices[0]` is deterministic and matches the touch path. Acceptable.
- **R4. No new test scaffolding exists for this codebase.** Verification will be manual via `pnpm dev` — confirm the click reorders rather than filters, hover/tooltip still works, sidebar chips still filter.

## 8. Verification

Manual, in `pnpm dev`:

1. Open a focus post with related stacks that include multiple cards sharing a category.
2. Click a relation tag (e.g., "Framing") on one card. Expected: the panel reorders with same-category posts immediately above/below the clicked card; the clicked card stays in place; the F-indicator on that card turns colored (anchored state).
3. Click the same tag again on the same card. Expected: anchor clears; panel returns to prior order.
4. Hover the tag (without clicking). Expected: tooltip appears; non-matching highlights on the focus post dim. No reorder.
5. Click a sidebar filter chip at the top of the panel. Expected: panel filters down to that category (unchanged behavior).
6. Click the F-indicator on a card. Expected: same anchor-and-reorder as the tag click (unchanged behavior).
7. On a touch device (or with `isTouch` forced true): tap a tag once. Expected: tag highlights as preview; no reorder. Tap the same tag again. Expected: anchor-and-reorder.
