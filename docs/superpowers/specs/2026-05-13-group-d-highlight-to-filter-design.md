# Group D — Highlight-to-Filter Interaction (Design Spec)

**Date:** 2026-05-13
**Status:** Ready for implementation
**Scope:** Focus-post highlight hover (neutral), click-to-filter-by-span, shortest-common-related-text label in sidebar cards.
**Owner:** tarcode2004
**Approach:** Event delegation on focus post container; new `filterFocusSpan` store field; surgical filter clause in RelatedStacks; label injected in card UI.

---

## 1. Problem

The focus post shows colorful `<mark>` elements when a sidebar card is hovered (cross-highlighting). These marks are inert — no hover feedback, no click behavior, no way for the user to say "filter the sidebar to posts that relate to THIS phrase."

Three missing interaction layers:

1. **No hover feedback on focus-post marks.** The user cannot tell that marks are interactive.
2. **No span-click-to-filter.** Clicking a focus-post mark does nothing — no bridge from "this phrase caught my eye" to "show me only posts that respond to this phrase."
3. **No "what phrase connects these?" label in the sidebar.** When a span filter is active, users cannot easily see which substring all visible sidebar posts share.

---

## 2. Goals

- **D1.** Hovering a `<mark>` on the focus post applies a neutral grey highlight to that span only (hover visual). Releasing hover restores the category color. No tooltip.
- **D2.** Clicking a `<mark>` on the focus post filters the sidebar panel to stacks whose `relations[i].focusStart..focusEnd` overlaps the clicked span. The span filter ANDs with C's category filter. Clicking the same mark again clears the span filter.
- **D3.** When `filterFocusSpan` is active, each sidebar card shows a small label: the shortest substring of the focus post's plain text that all currently-visible stacks' relevant spans collectively cover (intersection). If the intersection is empty (non-overlapping spans), fall back to `filterFocusSpan` itself. Truncate at 60 chars + `…`.

---

## 3. Non-Goals

- No tooltip text when hovering focus-post marks (Group B owns tooltips).
- No change to the cross-highlighting behavior when hovering sidebar cards — D1 only activates when the user hovers directly on the focus post.
- No change to HoverTooltip.tsx.
- No change to Shell.tsx.
- No change to ThreadedReplyList.tsx (Group G).
- No change to ReplySection.tsx (Group I).
- No visual redesign of cards (Group F).
- No reordering logic (Group E).
- No URL persistence of filter state.
- No mobile/touch handling beyond what already exists for the span filter clear.

---

## 4. Decisions Locked (Judgment Calls Made Without User Input)

| # | Question | Decision | Rationale |
|---|---|---|---|
| JC1 | How to attach handlers to `<mark>` elements in `dangerouslySetInnerHTML` output? | Event delegation on the container div in `ActiveHighlightedContent`. Listen for `mouseover`/`mouseout`/`click` on the container; check `e.target.closest('mark')`. | Less invasive than rebuilding `renderMultiHighlightHtml` as JSX. The marks already use inline style; we just need to identify which one was interacted with. |
| JC2 | How to identify which mark/relation was clicked? | Add `data-range-id="{i}"` attribute to each `<mark>` in `renderMultiHighlightHtml`. The `index` variable is already in scope at construction time. | Zero additional state; deterministic; mirrors RelatedStacks.tsx pattern. |
| JC3 | D1: hover neutral color | `rgba(100, 116, 139, 0.30)` (slate-500 at 30%) as background override. Applied via React state `hoveredFocusMarkIndex: number | null` in `ActiveHighlightedContent`, which injects a `<style>` scoped to a CSS class. | Can't do per-element style override because the `<mark>` is inside `dangerouslySetInnerHTML`. A CSS class + `useEffect` injects the override rule. |
| JC4 | D1 + cross-highlight layering | Focus-post marks are **invisible by default**. They appear only when: a sidebar card is hovered (cross-highlight, full brightness), the user has dwelled over the focus-post text area for ≥1500ms (dimmed ~0.25 alpha), or a span filter is active (dimmed). D1 hover (neutral grey `!important`) fires whenever a mark is present in the DOM. Cross-highlight produces bright marks; dwell and filter produce dimmed marks. The dwell timer (`FOCUS_HOVER_DWELL_MS = 1500`) is a named constant. | Avoids always-on visual noise while keeping marks discoverable. The dwell threshold is long enough to distinguish deliberate exploration from accidental hover. A named constant makes it easy to tune without touching logic. |
| JC5 | `filterFocusSpan` storage location | New field in `highlightStore.ts`, same module as `filterCategories`. Type: `{ start: number; end: number } | null`. | Keeps all filter state co-located; both RelatedStacks and Post.tsx can subscribe via `useHighlightStore`. |
| JC6 | D2: "same mark again" detection | Clicking a mark whose `focusStart === filterFocusSpan.start && focusEnd === filterFocusSpan.end` clears the filter. | Toggle semantics — consistent with how C's category filter toggles. |
| JC7 | D2: what offsets does a mark carry? | `data-range-id` lets us index into the active relations array to get `focusStart`/`focusEnd`. When cross-highlight is active (`showCrossHighlight` is true), the active array is `hoveredRelations`. Otherwise it is `focusRelations` (the focus post's own relations passed as a prop). The D2 click handler resolves the same way as the HTML useMemo: `const rels = showCrossHighlight && hoveredRelations ? hoveredRelations : focusRelations`. | Marks are now always present (dimmed or bright), so D2 must work in both states. `focusRelations` is the merged list of all related posts' relation arrays, wired in `toPostData` and passed as a prop. |
| JC8 | D3: "relevant relations" for shortest-common computation | Use ALL of a stack's relations (not just the active-category-filtered ones), since the user may have no category filter active. If `filterCategories` is non-empty, restrict to relations whose category is in `filterCategories`. | Consistent with how the category filter behaves in the display pipeline. |
| JC9 | D3: intersection empty → fallback | When `maxStart >= minEnd` across visible stacks, fall back to rendering the text of `filterFocusSpan` itself (the clicked span). This covers the case where different stacks respond to non-overlapping parts of the focus post. | Graceful degradation; still informative. |
| JC10 | D3: zero visible stacks | When no stacks pass the combined filter, the label is not rendered (there are no cards to label). | No label needed with no cards. |
| JC11 | D3: label placement | Below the category tag row (absolute top-left area), inside the card's content `div`, before `contentNodes`. A small dim chip: `font-size: 10px`, slate background `#f1f5f9`, border `#cbd5e1`, color `#64748b`. | Unobtrusive; consistent with existing chip aesthetics in the panel. |
| JC12 | D3: focus post plain text | `hoveredRelations[i].focusStart..focusEnd` points into `stripHtml(rawText)` (the plain text). But `RelatedStacks` does not have the focus post's plain text. The `filterFocusSpan` store field needs to also carry the relevant text snippet for D3 to render without the panel needing access to the full focus post text. | Store `{ start, end, text }` in `filterFocusSpan` where `text = focusPlainText.slice(start, end)`. |
| JC13 | D3: one stack visible | If exactly one stack passes the filter, the "shortest common" is just that stack's focus range text (same as if all stacks have the same range). Fall through normally — the intersection of one span is itself. | No special case needed. |
| JC14 | Clearing filterFocusSpan | Clear on: same-mark click (D2 toggle), `resetHighlightStore()` call (navigating away), when `relatedStacks` changes (new focus post). RelatedStacks already calls `clearReRankAnchors()` and `clearTapped()` on `relatedStacks` change — add `clearFilterFocusSpan()` to that effect. | Prevents stale filter from persisting across focus post changes. |

### Dwell-Triggered Mark Visibility (Option B — Revised)

The original Option B implementation rendered marks in a **permanently dimmed state** (~0.25 alpha) whenever the focus post had relations. User feedback found this too noisy — the always-on tinting was visually distracting.

**Current behavior:** Marks on the focus post are **invisible by default** (absent from the DOM). They become visible only under three conditions, computed as `marksVisible`:

```
marksVisible = showCrossHighlight || focusHoverShowMarks || filterFocusSpan !== null
```

- **`showCrossHighlight`** — the user is hovering a sidebar card (existing cross-highlight path). Marks appear at full category brightness.
- **`focusHoverShowMarks`** — the user has held the cursor inside the focus-post text area continuously for ≥ **1500ms** (`FOCUS_HOVER_DWELL_MS`, a named constant). Marks appear dimmed (~0.25 alpha).
- **`filterFocusSpan !== null`** — a span filter is active (D2 click was used). Marks stay visible so the user can see which span is filtered and toggle it off.

The dwell timer is managed via `focusHoverTimerRef` (a `useRef<ReturnType<typeof setTimeout> | null>`). `onMouseEnter` starts the timer; `onMouseLeave` cancels it and immediately clears `focusHoverShowMarks`. A `useEffect` cleanup on unmount prevents timer leaks.

The constant `FOCUS_HOVER_DWELL_MS = 1500` is declared at module level and can be tuned without touching component logic.

Mark states when `marksVisible` is true:

| Trigger | Mark appearance |
|---|---|
| Cross-highlight (`showCrossHighlight`) | Bright category colors (alpha 1.0 for hovered range, 0.2 for others) |
| Dwell (`focusHoverShowMarks`) | Dimmed category colors (~0.25 alpha) |
| Span filter active (`filterFocusSpan !== null`) | Dimmed category colors (~0.25 alpha) |
| D1 hover (mark directly hovered on focus post) | Neutral grey `rgba(100,116,139,0.30)` via `!important` scoped style |

When `marksVisible` is false, no `<mark>` elements are present in the DOM.

The expand-to-reveal animation now triggers on **any** `marksVisible → true` transition (cross-highlight OR dwell). The collapse animation fires when `marksVisible` becomes false. This ensures dwell-revealed marks that fall below the 5-line clamp are also expanded to view.

---

## 5. Behavior Specification

### D1 — Neutral highlight on focus-post hover

- Applies ONLY in `ActiveHighlightedContent` (the component rendered for the active/focus post).
- Marks are **invisible by default** (absent from DOM). They become visible only when `marksVisible` is true: cross-highlight active, dwell threshold (1500ms) reached, or span filter active.
- D1 activates when the user moves the mouse over a `<mark>` element that is currently in the DOM — regardless of which trigger made `marksVisible` true.
- While active: the hovered mark's background becomes `rgba(100, 116, 139, 0.30)` — overrides the current category color (whether dimmed or bright) via a dynamically injected `<style>` block scoped to a unique ID using `!important`.
- On `mouseout` from a `<mark>`, `hoveredFocusMarkIndex` resets to null, removing the override.
- Cursor over all `<mark>` elements: `pointer` (always indicates clickability).

### D2 — Click → filter related panel by span

- Activates when user clicks a `<mark>` on the focus post (marks are always visible, so this works in any state).
- On click: extract `data-range-id` → index into the active relations array (`hoveredRelations` during cross-highlight, `focusRelations` otherwise) → get `focusStart`, `focusEnd`. Compute `focusPlainText.slice(focusStart, focusEnd)` as the text snippet.
- Call `setFilterFocusSpan({ start: focusStart, end: focusEnd, text: snippet })`.
- Toggle: if `filterFocusSpan.start === focusStart && filterFocusSpan.end === focusEnd`, call `clearFilterFocusSpan()`.
- In `RelatedStacks.tsx`, in the `displayStacks` useMemo filter pipeline (after the category filter clause):

```
if (filterFocusSpan !== null) {
  result = result.filter(s =>
    (s.topPost.relations ?? []).some(r =>
      r.focusStart < filterFocusSpan.end && filterFocusSpan.start < r.focusEnd
    )
  );
}
```

- The category filter runs first, then the span filter, resulting in AND semantics.

### D3 — Shortest common related text label

- Only rendered when `filterFocusSpan !== null`.
- For each visible stack (post-filter), collect its relevant relations:
  - If `filterCategories.size > 0`: only relations whose `category` is in `filterCategories`.
  - Otherwise: all relations.
- From those relations, collect all `(focusStart, focusEnd)` pairs.
- Compute `maxStart = max(all focusStart)` and `minEnd = min(all focusEnd)`.
- If `maxStart < minEnd`: intersection text = `filterFocusSpan.text` trimmed at [maxStart - filterFocusSpan.start, minEnd - filterFocusSpan.start] relative offsets within the snippet.
  - Actually simpler: intersection is `focusPlainText.slice(maxStart, minEnd)`. Since we stored the snippet text and we know `filterFocusSpan.start`, we can compute `snippet.slice(maxStart - filterFocusSpan.start, minEnd - filterFocusSpan.start)` — but this requires knowing the full plain text. Instead, store full snippet of the filterFocusSpan but also compute the intersection against a reconstructed plain text slice stored in the store.
  - **Simplification (JC15):** Store `focusPlainText` as a module-level variable in `highlightStore.ts` set when `setFilterFocusSpan` is called. OR pass the intersected text directly. The cleanest approach: store only the clicked span's text in `filterFocusSpan.text` and in RelatedStacks compute the narrowed intersection by string search within that snippet.

  **Practical D3 computation in `RelatedStacks`:**
  Given `filterFocusSpan = { start, end, text }` and `visibleStacks`:
  1. Collect all `(r.focusStart, r.focusEnd)` from each visible stack's relevant relations.
  2. `maxStart = Math.max(...all focusStart values)`.
  3. `minEnd = Math.min(...all focusEnd values)`.
  4. If `maxStart < minEnd && maxStart >= filterFocusSpan.start && minEnd <= filterFocusSpan.end`:
     - `intersectionText = filterFocusSpan.text.slice(maxStart - filterFocusSpan.start, minEnd - filterFocusSpan.start)`.
  5. Else: `intersectionText = filterFocusSpan.text` (fallback).
  6. Truncate to 60 chars + `…` if longer.
  7. Display as a small chip above the content in each card.

- Label chip styling: `background: #f1f5f9`, `border: 1px solid #cbd5e1`, `color: #64748b`, `font-size: 10px`, `border-radius: 4px`, `padding: 1px 6px`, `max-width: 100%`, overflow hidden + ellipsis.

---

## 6. Files Touched

| File | Change |
|---|---|
| `src/utils/highlightStore.ts` | Add `filterFocusSpan: { start: number; end: number; text: string } \| null` to `HighlightState`. Add `setFilterFocusSpan`, `clearFilterFocusSpan` actions. Export both. |
| `src/components/Posts/Post.tsx` | In `renderMultiHighlightHtml`: add `data-range-id="${entry.index}"` to each `<mark>`. In `ActiveHighlightedContent`: add `hoveredFocusMarkIndex` state, event delegation via `useEffect` on the container div's `addEventListener`. Add pointer cursor CSS when cross-highlight is inactive. Handle click → `setFilterFocusSpan`. |
| `src/components/RelatedStacks.tsx` | 1. Destructure `filterFocusSpan` from `useHighlightStore`. 2. Add span filter clause to `displayStacks` useMemo. 3. Add `clearFilterFocusSpan()` call in the `relatedStacks` change `useEffect`. 4. Compute `shortestCommonText` for visible stacks when `filterFocusSpan` is active. 5. Render the label chip in the card UI. 6. Update count label in sticky header to mention span filter. |

---

## 7. Verification

1. `pnpm build` must produce zero TypeScript errors and zero build warnings related to changed files.
2. Manual test (documented in PR test plan):
   - Open a post with related stacks.
   - Hover briefly over the focus post text — marks should NOT appear (under 1500ms).
   - Hover and hold over the focus post text for 1.5s → marks fade in at dimmed category colors.
   - Move mouse away → marks disappear immediately.
   - Hover a sidebar card → focus post marks appear in full category colors (cross-highlight).
   - While sidebar card is hovered, move mouse to a focus-post mark → neutral grey (D1) overrides.
   - Un-hover sidebar card → marks disappear. Now dwell (1.5s) on focus post → dimmed marks appear.
   - Click a mark during dwell-visible state → sidebar filters to only posts relating to that span. Count label updates.
   - Click same mark again → filter clears, all sidebar posts return.
   - Click a different mark → span filter switches.
   - With span filter active, leave focus post — marks stay visible (filter keeps `marksVisible` true).
   - With span filter active, each sidebar card shows the intersection label chip.
   - Apply a category filter (Group C chips) → AND: only stacks matching both span and category show.
   - Navigate away → no stale span filter on next post.

---

## 8. Risks

- **R1: Mark position drift.** `renderMultiHighlightHtml` uses text replacement in HTML strings, not offset-based injection. If the plain text extraction (`stripHtml`) doesn't perfectly align with actual HTML positions, `data-range-id` might point to wrong offsets. Mitigation: `data-range-id` maps to an index in `hoveredRelations` array — the `focusStart/End` are read from the already-correct `hoveredRelations[i]` not re-computed.
- **R2: Multiple marks for same relation.** If `renderMultiHighlightHtml` creates multiple `<mark>` elements for the same relation (unlikely but possible if the snippet appears twice), clicking either one should work — they share the same `data-range-id`.
- **R3: D1 style injection SSR.** The `<style>` element injection needs to happen only in `useEffect` (client-side), not during SSR. Standard guard: `useEffect` already runs only client-side.
- **R4: Clearing span filter on stack change.** If `relatedStacks` changes (navigating to a new focus post) while `filterFocusSpan` is set, the sidebar would briefly show 0 results. The `useEffect` on `relatedStacks` change clears it synchronously.
- **R5: Non-overlapping spans across stacks.** D3 intersection may be empty (maxStart >= minEnd). Fallback to `filterFocusSpan.text` handles this gracefully per JC9.
- **R6: Hover conflict when user moves from sidebar card to focus post rapidly.** Event delegation fires on the focus post container. If `showCrossHighlight` is still true (mouseleave of sidebar card fires after mouseover of focus post mark), D1 is suppressed. The 150ms-ish debounce on `setHoveredSidebarPost(null)` means D1 takes a moment to activate. This is acceptable behavior and is not perceptible in normal use.

---

## 9. Next Steps

- Group E: reordering (independent of D).
- Group F: visual redesign of cards (reads D3 label placement as a stable anchor).
- Group H: URL persistence of `filterFocusSpan` (could serialize `start` and `end` in the URL).

---

## Judgment Calls Made Without User Input

(Verbatim for PR description)

1. **JC1 — Event delegation over JSX rebuild.** Rather than rewriting `renderMultiHighlightHtml` to return React nodes (invasive), we use event delegation on the wrapper div. Simpler, less risk to the existing cross-highlight rendering.

2. **JC2 — data-range-id identifies relation index.** Each `<mark>` gets `data-range-id="{i}"` where `i` is its position in the `hoveredRelations` array. Relation's `focusStart/End` read from the store array.

3. **JC3 — Neutral hover via scoped `<style>` injection.** Cannot override per-element inline style inside `dangerouslySetInnerHTML` from outside. Inject a `<style>` block with a class selector that overrides the mark's background, scoped to a stable unique ID on the container.

4. **JC4 — Dwell-triggered marks; D1 fires whenever marks are present.** Focus-post marks are invisible by default (absent from DOM). They appear only when `marksVisible = showCrossHighlight || focusHoverShowMarks || filterFocusSpan !== null`. `focusHoverShowMarks` becomes true after 1500ms of continuous cursor presence over the focus-post text area (`FOCUS_HOVER_DWELL_MS`, tunable constant). D1 (neutral grey hover) fires on direct mark hover regardless of which trigger made marks visible. The always-on dimmed state (original Option B) was replaced because it produced constant visual noise; the dwell threshold filters out accidental hover while keeping marks discoverable on deliberate inspection.

5. **JC5 — filterFocusSpan in highlightStore.** Co-locates all filter state. Both Post.tsx (writer) and RelatedStacks.tsx (reader) access it through the same store hook.

6. **JC6 — Click same mark toggles filter off.** Consistent with C's category filter toggle semantics.

7. **JC7 — D2 resolves relations from active state.** Marks are always present. The click handler resolves relations as `showCrossHighlight && hoveredRelations ? hoveredRelations : focusRelations`, the same logic as the HTML useMemo. `focusRelations` is the merged flat list of all related posts' relation arrays, provided via the new `focusRelations` prop on `Post`.

8. **JC8 — D3 uses category-filtered relations when filter is active.** If the user has both a category filter and a span filter active, the intersection label only considers the filtered relation categories.

9. **JC9 — Empty intersection falls back to filterFocusSpan.text.** When stacks respond to non-overlapping parts of the span, we display the original clicked-span text.

10. **JC10 — No label when zero visible stacks.** Nothing to display.

11. **JC11 — Label placement: above content, below tags.** Placed as a chip between category tags and the post content text. Stays out of the way of the action bar.

12. **JC12 — Store carries text snippet.** `filterFocusSpan = { start, end, text }` where `text = plainText.slice(start, end)`. This means `RelatedStacks` doesn't need access to the full focus post's plain text to compute D3.

13. **JC13 — One visible stack: no special case.** Intersection of one span is itself.

14. **JC14 — Clear span filter on relatedStacks change.** Added to the existing cleanup effect in `RelatedStacks`.

15. **JC15 — Intersection computed in RelatedStacks from relation offsets + stored snippet.** RelatedStacks knows `filterFocusSpan.start` (base offset) and the `text` snippet. Each relation's `focusStart/End` are absolute offsets in the focus post's plain text. The intersection `[maxStart, minEnd]` can be sliced from the snippet as `text.slice(maxStart - start, minEnd - start)` when both offsets fall within `[start, end]`.
