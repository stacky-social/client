# Group F — Per-Card Relation Indicator (Design Spec)

**Date:** 2026-05-13
**Status:** Ready for implementation.
**Scope:** Add a top-right "relation indicator" to each related-post card showing the post's topic name, a count of other posts sharing that topic, and a right-chevron. Clicking the indicator triggers the same "see more like this" behavior that the existing bottom "N more Topic" button uses.
**Owner:** tarcode2004
**Base branch:** `tarcode2004/enhancement/group-e-reordering`

---

## 1. Problem

Currently, the relationship between a related post and the focus post is signaled only through (a) left-side category tags and (b) in-text highlight marks that appear on hover. Neither of these surfaces the *topic* of a relation at a glance, nor do they invite the user to explore related posts without first hovering.

The user's meeting notes describe a "3rd option": show the relation topic prominently at the top-right of each card. This gives every card an at-a-glance label ("Trial results (8)") that communicates both *what* it is about and *how common* that relation is in the current panel — a direct invitation to explore the cluster.

## 2. Goals

1. **F1. Top-right relation indicator on each card.** Each card renders, at position `top: 10px, right: 10px`, a compact inline element showing the post's dominant topic name plus `(N)` — where N is the total count of posts in the current panel that share that topic (including the current post; use `topicTotal` directly).
2. **F2. Color affordance.** Single-topic posts: indicator uses that topic's category color. Multi-topic posts: neutral grey until the panel mouse-enters (`panelHovered`), then dominant-category color.
3. **F3. Click → activate anchor.** Clicking the indicator calls `handleToggleAnchor(postId, relIdx)` where `relIdx` is the index of the dominant relation. If the current card is already the active anchor for this relation, the click unselects (same toggle semantics as `handleToggleAnchor` already provides via `toggleReRankAnchor`).
4. **F4. Navigation chevron disposition.** Remove the existing `<IconChevronRight>` at `top:12px, right:10px`. See Judgment Call #1.

## 3. Non-Goals

- Changing the existing top-left category tags (Group C territory).
- Changing the existing bottom "N more Topic" pagination button (Group E territory).
- Changing `reorderForAnchor` logic (Group E territory).
- Changing filter chip behavior (Group C territory).
- Adding animations beyond what framer-motion already provides for card layout.

## 4. Visual Specification

### 4.1 Indicator element

```
┌────────────────────────────────────────────────┐
│ [Agree ▪ Evidence]             Trial results (8) ›│  ← top bar (absolute)
│                                                  │
│ @username · 4 minutes ago                        │
│ Post content with highlighted spans…             │
│                                                  │
│ ── ──────────────────────────────────────────── │
│ 💬 0   ♥ 2   🔖   ⤢                            │
└────────────────────────────────────────────────┘
```

- **Position:** `position: absolute`, `top: 10px`, `right: 10px`, `zIndex: 10`
- **Font size:** `11px`
- **Font weight:** `600`
- **Color:** category text color (or `#888888` for neutral)
- **Content:** `{topic} ({N}) ›`
  - `›` is a right-chevron character (Unicode `›`, U+203A) — visually lighter than `<IconChevronRight>`, avoids a second icon element at the same corner
- **Cursor:** `pointer`
- **Max-width:** `160px` with `overflow: hidden`, `textOverflow: ellipsis`, `whiteSpace: nowrap`
- **Hover effect:** `opacity` transitions from `0.7` → `1` on hover (subtle brightening)
- **Active state:** when this card is the current anchor, the indicator uses full opacity and a faint background tint (the category `bg` color) to communicate "this is active"

### 4.2 Color logic (F2)

| Card type | `panelHovered = false` | `panelHovered = true` |
|---|---|---|
| Single topic | category text color, opacity 0.75 | category text color, opacity 1 |
| Multi-topic | `#888888`, opacity 0.6 | dominant-category text color, opacity 1 |

`panelHovered` already exists in the component and is toggled by the wrapper div's `onMouseEnter`/`onMouseLeave` at line 1172.

### 4.3 Count display

Use `topicTotal.get(dominantTopic) ?? 0`. This gives the total across all posts in the current panel (including the card itself). We do NOT subtract self because:
- The tooltip on the bottom "MORE" button already subtracts self (to show "others")
- The top-right indicator is meant to communicate cluster size — "you are looking at one of 8 Trial-results posts" — so including self is appropriate and consistent with what the user sees in the brief's screenshot

### 4.4 Dominant-topic selection rule (F2 multi-topic case)

**Rule:** Use the **first relation** (`relations[0]`) as the dominant. Rationale:
- The first relation is generally the most prominent (the API orders them by offset in the content, so the first-mentioned relation is the most salient)
- A smarter frequency-based rule would need to compare across posts and adds complexity with marginal visual benefit
- This rule is deterministic, stable, and easy to explain

See Judgment Call #2 for full discussion.

## 5. Interaction Specification (F3)

### 5.1 Click behavior

```
onClick (on indicator):
  e.stopPropagation()         // prevent card navigation
  handleToggleAnchor(postId, dominantRelIdx)
```

`handleToggleAnchor` internally calls `toggleReRankAnchor(postId, rangeIndex)`, which:
- If not active: adds `postId` to `reRankAnchorIds`, sets `anchoredRangeByPost[postId] = rangeIndex`
- If already active: removes it (unselects)

The "click while anchored on a different topic → switches" behavior is already handled: `toggleReRankAnchor` with a new postId replaces the old one (Group E single-anchor semantics).

### 5.2 Active visual state

The indicator should reflect whether the card is currently the active anchor:

```tsx
const isCurrentAnchor = reRankAnchorIds[reRankAnchorIds.length - 1] === stack.topPost.id;
```

When `isCurrentAnchor`:
- Background: `anchorColors.bg` (or `dominantColors.bg` if not in a group yet)
- Border: `1px solid {dominantColors.border}55`
- Opacity: 1

When not anchor:
- Background: `transparent`
- No border
- Opacity per F2 color logic above

## 6. Behavior in Edge Cases

| Case | Behavior |
|---|---|
| Post has no relations | Indicator not rendered (guard: `!rels || rels.length === 0`) |
| Post has relations but first relation has no topic | Indicator not rendered (guard: `!dominantTopic`) |
| `topicTotal.get(dominantTopic)` is 0 or 1 | Still render indicator; "1" means only this post has that topic — valid information |
| Card is a "claim" (pulled in under another anchor) | Indicator still renders; clicking it would switch the anchor to this card (Group E abandon-prior semantics) |
| Panel cross-highlight active (another card hovered) | Indicator obeys the same `cardDimStyle` that dims non-hovered cards — no special handling needed |

## 7. Judgment Calls

### JC #1 — Navigation chevron disposition

**Question:** The existing `<IconChevronRight>` at `top:12px, right:10px` (line 1569-1571) occupies the same corner as the new indicator. What to do?

**Options:**
- A. Remove the existing chevron (card is still fully clickable; chevron is redundant)
- B. Move it to bottom-right corner
- C. Stack both vertically at the right edge

**Decision: Option A — remove the existing chevron.**

Rationale:
- The entire card has `cursor: pointer` and a solid border — affordance is clear without a chevron
- The existing chevron is 14px grey icon with no label; it adds visual noise
- The new relation indicator is more information-dense and more semantically useful in that position
- Removing the old icon avoids a two-element top-right cluster
- This is the simplest change and produces the cleanest visual output

### JC #2 — Dominant-topic selection for multi-relation posts

**Question:** When a post has multiple relations (e.g., relation 0 = "agree → Trial results", relation 1 = "evidence_public → Contract"), which topic does the indicator show?

**Decision: First relation (`relations[0]`).**

Rationale:
- Relations are ordered by content offset (first-mentioned = topically leading the post)
- Alternative (highest-frequency topic across the panel) requires a cross-post lookup per card — O(n) per render for each card, adds complexity
- Alternative (match active anchor's topic) would cause the indicator to change dynamically as the user clicks around — confusing
- `relations[0]` is stable, deterministic, and already used by existing code as the fallback in multiple places

### JC #3 — Count semantics: total vs. others

**Decision: Show `topicTotal.get(topic)` (total including self), NOT `total - 1`.**

The indicator reads as "you are in a cluster of N". The bottom "N more" button already says "others". These two affordances are complementary: indicator = cluster size, bottom button = how many more to load.

### JC #4 — Cross-highlight interaction

**Question:** Should the relation indicator hide or change when a different card is hovered (cross-highlight active)?

**Decision: No special handling.** The card's `cardDimStyle` already applies `opacity: 0.45, filter: grayscale(0.3)` to non-hovered cards. The indicator inherits this dimming naturally as part of the card. No additional logic needed.

### JC #5 — `stopPropagation` on indicator click

**Decision:** Call `e.stopPropagation()` on the indicator's `onClick`. The `Paper` and the content `div` both route clicks to `handleCardClick` → `handleNavigate`. The indicator click should not navigate; it should only toggle the anchor.

## 8. Implementation Checklist

- [ ] Derive `dominantRel` from `rels[0]` (guard: empty rels)
- [ ] Derive `dominantColors` from `getCategoryColors(dominantRel.category)`
- [ ] Compute `isMultiType` (already available in the category-tags block)
- [ ] Compute indicator color based on `isMultiType` and `panelHovered`
- [ ] Compute `isCurrentAnchor`
- [ ] Remove existing `<IconChevronRight>` at line 1569
- [ ] Render `<button type="button">` or `<div role="button">` at `position: absolute, top: 10px, right: 10px` inside `<Paper>`
- [ ] Count: `topicTotal.get(dominantTopic) ?? 0`
- [ ] Click: `e.stopPropagation()` then `handleToggleAnchor(postId, 0)` (index 0 for dominant)
- [ ] Active state: faint background when card is current anchor
- [ ] Hover opacity transition
- [ ] Guard: skip render when no relations or no topic on first relation
