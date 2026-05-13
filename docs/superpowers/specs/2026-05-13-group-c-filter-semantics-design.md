# Group C — Filter Semantics & Color Affordances (Design Spec)

**Date:** 2026-05-13
**Status:** Ready for implementation
**Scope:** Conjunction-based filter chips, hover-preview state, neutral-until-hover relation tags, tag-hover-filters-panel. Part of the B → C → D → E → F → G → I → H roadmap.
**Owner:** tarcode2004
**Approach:** Surgical patch to RelatedStacks.tsx and highlightStore.ts. No new files needed.

---

## 1. Problem

Four related interaction deficiencies in the filter/category layer of the related panel:

1. **Filter chip click is always a toggle (exclusive).** Clicking a second chip replaces the first, regardless of whether both filters would return results. No AND semantics exist yet.
2. **No hover preview of what clicking a chip will do.** The user cannot tell whether a click will ADD a second category or REPLACE the current one.
3. **Relation-type tags on cards are always colored.** When a post has multiple relation types, all tags show full category color immediately — providing no progressive disclosure cue for the multi-category case.
4. **Relation-type tags on cards have no hover-filter behavior.** Hovering or clicking these tags does not interact with the panel filter the way highlighted regions do.

## 2. Goals

- C1: Smart conjunction logic — add to filter if the intersection is non-empty; switch if empty.
- C2: Hover preview on filter chips — one of two visual signals (add vs. switch) before the user commits.
- C3: Neutral-until-hover coloring for relation tags on multi-type cards.
- C4: Tag hover triggers panel highlight filter; tag click groups by that category.

## 3. Non-Goals (explicit out-of-scope)

- Tooltip polish on tags → Group B.
- Highlight-to-filter interaction on the focus post → Group D.
- URL state persistence of filter → Group H.
- Reply threading changes → Group G.
- Simulated feedback → Group I.
- Any change to `HoverTooltip.tsx` (Group B's new file).

## 4. Decisions Locked During Brainstorm (Judgment Calls)

See also "Judgment Calls Made Without User Input" section below.

| # | Question | Choice | Rationale |
|---|---|---|---|
| Q1 | How is "conjunction non-empty" computed? | Count posts with `stack.rel` matching ALL active filter categories | `rel` is a single string per stack, not multi-valued; AND means rel must equal ALL selected cats, which for `rel` (single) means the intersection is non-empty only when hovering a chip that shares at least one stack with every currently active filter. REVISED: see Q1b. |
| Q1b | Multi-category filter mode: how do we store multiple active filters? | New `filterCategories: Set<string>` replaces `filterCategory: string \| null` in highlightStore | The store currently uses a single string; multi-filter needs a set. Updating the store is the cleanest approach — it affects `filterCategory` reads in `RelatedStacks.tsx` (one place) and the `toggleFilterCategory` action. |
| Q2 | Which posts count as matching AND filter? | A post matches if its `rel` category is in the active set | Since `rel` is one string per stack, "AND" across two categories can never be satisfied by a single stack. So instead we interpret "conjunction non-empty" as: does at least one post exist with `rel === hoveredCategory`? If yes, ADD (set gets larger). If no (hovering a category that has zero posts currently shown), SWITCH. Conservative: matches user's mental model of "keep what's visible, add more." |
| Q3 | How to represent hover-preview visual state? | CSS classes / inline style deltas on filter chips; no new React state needed beyond existing `hoveredChip: string \| null` | One new `useState` for which chip is currently hovered. |
| Q4 | Hover preview: when add — what lights up? | Hovered chip gets full active style; current active chips stay fully lit | The result state if user clicks is: both lit. So preview mirrors that. |
| Q5 | Hover preview: when switch — what dims? | Hovered chip lights up; current active chips drop to 50% opacity with a subtle grayscale | Communicates replacement clearly without being jarring. |
| Q6 | Relation tags: what defines "has multiple types"? | Post has ≥2 distinct category values across its `relations` array | Consistent with how tags are deduplicated for rendering. |
| Q7 | Neutral tag color | `#f0f0f0` background, `#888` text, `#d0d0d0` border | Unambiguously neutral, matches the general chip neutral style already in `FilterChip`. |
| Q8 | "Hover anywhere in related panel" to reveal colors | The container `div` `onMouseEnter`/`onMouseLeave` manages a `panelHovered: boolean` state | Simplest; no global event needed. |
| Q9 | C4 tag hover: what does "filter the related panel" mean? | Sets `hoveredCategory` in the store, which dims non-matching highlights (already wired) | The same as category-tag hover in the existing card code (lines 1263–1267 in 1411-line version). No extra work except triggering it on any relation tag, not just within-card. |
| Q10 | C4 tag click: "group by that dimension" | Calls `toggleFilterCategory(cat)` on the store, which filters visible stacks to that category | Conservative: "group by" = filter to. Grouping (re-ordering by category) is heavier work; using filter as the initial interpretation. |
| Q11 | C4 interaction: hover/click on tags already exists for within-card hover | Yes — the existing `onMouseEnter` on tags sets `setHoveredCategory`. We need to ALSO set `hoveredCategory` in the store for the panel filter. The existing code already calls `setHoveredCategory` from highlightStore. | No change needed for C4 hover; click needs `toggleFilterCategory`. |
| Q12 | Touch device handling | Mirror existing pattern: C1/C2 chip behavior unchanged on touch (tapping = clicking); C3 always shows colors on touch (no hover state); C4 tag hover skipped on touch per `isTouch` guard | Consistent with existing touch guards in the codebase. |
| Q13 | filterCategories in store: migration from filterCategory | The store's `filterCategory: string | null` field becomes `filterCategories: Set<string>`. The existing `toggleFilterCategory` is replaced by new multi-filter logic. `setFilterCategory` remains for backward compatibility (sets a single category, clearing others). | Minimize breakage; other files that read `filterCategory` must be updated. |
| Q14 | Are other files reading `filterCategory` from the store? | Must audit. The listy-injection page and CategorySidebar likely read it. | See Files Touched. |

## 5. Behavior Specification

### 5.1 C1 — Conjunction-vs-Switch Logic

**Data structure change.** `highlightStore.ts` changes `filterCategory: string | null` to `filterCategories: Set<string>` (empty = show all). The `toggleFilterCategory` function is replaced by `clickFilterChip(category: string)`:

```ts
export function clickFilterChip(category: string): void {
  const active = state.filterCategories;
  if (active.has(category)) {
    // Deselect this chip
    const next = new Set(active);
    next.delete(category);
    state = { ...state, filterCategories: next };
  } else if (active.size === 0) {
    // Nothing active → activate this one
    state = { ...state, filterCategories: new Set([category]) };
  } else {
    // Something active → check conjunction
    // "Conjunction non-empty" = at least one post has rel === category
    // (checked against ALL relatedStacks, not just filtered ones)
    // This check is done at the call site in RelatedStacks.tsx since the store
    // doesn't have access to relatedStacks.
    // The store action accepts a flag: addMode = true → add to set, false → replace.
    // (See clickFilterChipWithMode below)
  }
  notify();
}
```

Actually, the store cannot compute "conjunction non-empty" because it doesn't have `relatedStacks`. The check must happen in `RelatedStacks.tsx`. The store gets a simpler action:

```ts
export function setFilterCategories(cats: Set<string>): void { ... }
```

In `RelatedStacks.tsx`, the chip `onClick` handler:

```ts
const handleFilterChipClick = (category: string) => {
  const active = filterCategories;
  if (active.has(category)) {
    // Deselect
    const next = new Set(active);
    next.delete(category);
    setFilterCategories(next);
  } else if (active.size === 0) {
    // First selection
    setFilterCategories(new Set([category]));
  } else {
    // Conjunction check: does hovering category have any posts?
    const conjunctionNonEmpty = relatedStacks.some(s => s.rel === category);
    if (conjunctionNonEmpty) {
      // ADD
      setFilterCategories(new Set([...active, category]));
    } else {
      // SWITCH — replace with just this category
      setFilterCategories(new Set([category]));
    }
  }
};
```

**Filtering the display.** The existing filter line:

```ts
if (filterCategory) {
  result = result.filter((s) => s.rel === filterCategory);
}
```

Becomes:

```ts
if (filterCategories.size > 0) {
  result = result.filter((s) => filterCategories.has(s.rel));
}
```

### 5.2 C2 — Hover Preview on Filter Chips

**New local state.** `const [chipHovered, setChipHovered] = useState<string | null>(null)` in `RelatedStacks`.

**Preview computation.** A pure function given current state:

```ts
function computePreviewState(
  hoveredCat: string | null,
  activeCats: Set<string>,
  relatedStacks: RelatedStackType[],
): 'none' | 'add' | 'switch' {
  if (!hoveredCat) return 'none';
  if (activeCats.has(hoveredCat)) return 'none'; // already active, no preview
  if (activeCats.size === 0) return 'none'; // first chip, no preview needed
  const conjunctionNonEmpty = relatedStacks.some(s => s.rel === hoveredCat);
  return conjunctionNonEmpty ? 'add' : 'switch';
}
```

**Visual behavior per chip, given `previewMode` and `chipHovered`:**

| Chip state | When `previewMode === 'add'` | When `previewMode === 'switch'` | No hover |
|---|---|---|---|
| Active chip | Full active style | 50% opacity, slight grayscale (`filter: grayscale(0.4)`) | Full active style |
| Hovered chip | Full active style (preview: will become active) | Full active style (preview: will become active) | Depends on `active` prop |
| Inactive chips | Unchanged | Unchanged | Normal inactive style |

Implementation: the `FilterChip` component receives additional props `previewActive?: boolean` and `previewDim?: boolean`. These override background/border/opacity.

### 5.3 C3 — Neutral-Until-Hover for Multi-Type Tags

**What counts as multi-type.** The `tags` array derived from `relations` has ≥2 distinct entries.

**Panel hover state.** New local state: `const [panelHovered, setPanelHovered] = useState(false)` on the outer container `div` wrapping the cards.

**Tag rendering.** In the per-card tag `<div>`:

```ts
const isMultiType = tags.length > 1;
const showColor = !isMultiType || panelHovered;

// Style:
background: showColor ? tc.bg : '#f0f0f0',
color:      showColor ? tc.text : '#888888',
border:     `1px solid ${showColor ? tc.border : '#d0d0d0'}`,
transition: 'background 200ms ease, color 200ms ease, border-color 200ms ease',
```

For single-type posts (isMultiType = false), colors always show (no change from current behavior).
For multi-type posts, colors only show when `panelHovered` is true.

### 5.4 C4 — Tag Hover Filters Panel / Click Groups

**Hover on relation tag.** The existing `onMouseEnter` already calls `setHoveredCategory(cat)`. This drives the highlight dimming in `buildMultiHighlightNodes`. No additional work needed for the highlight side of hover.

**Click on relation tag.** The existing `onClick` on tags (lines 1265–1279 in 1411-line version) handles touch. For desktop, the click calls `e.stopPropagation()` but doesn't call `toggleFilterCategory`. We add:

```ts
onClick={(e) => {
  e.stopPropagation();
  if (isTouch) {
    // existing touch logic
  } else {
    // Desktop: toggle filter for this category (group by = filter to)
    clickFilterChip(cat);
  }
}}
```

**Clarification of "group by."** The brief says "click groups by that dimension." Given the conservative interpretation, we use `clickFilterChip(cat)` which applies the same conjunction-vs-switch logic as C1. This means clicking a relation tag is semantically equivalent to clicking the corresponding filter chip — consistent behavior across the two entry points.

## 6. Files Touched

| File | Action | Est. LOC changed |
|---|---|---|
| `src/utils/highlightStore.ts` | Add `filterCategories: Set<string>`, add `setFilterCategories`, deprecate `filterCategory` (keep for backward compat reading), update `toggleFilterCategory` to delegate to `setFilterCategories`. | ~25 |
| `src/components/RelatedStacks.tsx` | Update `FilterChip` props (previewActive, previewDim). Add `chipHovered` and `panelHovered` states. Implement `handleFilterChipClick` and `computePreviewMode`. Update `filterCategory` reads to `filterCategories`. Update tag onClick for C4. Update card filter logic in `displayStacks` memo. | ~80 |
| `src/components/ListyInjection/CategorySidebar.tsx` | Audit and update any `filterCategory` reads → `filterCategories`. | ~10 |
| `src/app/(shell)/listy-injection/page.tsx` | Audit and update any `filterCategory` reads. | ~5 |

No new files. No changes to HoverTooltip.tsx, Shell.tsx, or any Group B files.

## 7. Verification

Manual checklist (no test framework):

| Check | Expected result |
|---|---|
| C1: Click chip A (none active) | Chip A becomes active. All posts shown if A matches all, else filtered. |
| C1: Click chip A then chip B (B has posts) | Both A and B lit; posts matching A OR B shown. |
| C1: Click chip A then chip B (B has zero posts visible) | Only B lit; A deactivated. Posts matching B shown. |
| C1: Click active chip A | A deactivated. All posts shown. |
| C2: Hover chip B when A is active and B has posts | B lights up at full active color; A stays fully lit. No state change committed. |
| C2: Hover chip B when A is active and B has zero posts | B lights up at full active; A dims to 50%/grayscale. |
| C2: Mouse off chip without clicking | All chips return to pre-hover state. |
| C3: Single-type post (1 relation category) | Tag shows category color always. |
| C3: Multi-type post (2+ relation categories) | Tags show neutral color (gray) before panel hover; show category colors on panel hover. |
| C3: Mouse off panel | Multi-type tags return to neutral. |
| C4: Hover relation tag on a post | `hoveredCategory` fires; non-matching highlights dim in the post's text. |
| C4: Click relation tag on a post | Chip for that category becomes active (using conjunction logic same as C1). |
| `pnpm build` | No TypeScript errors; build succeeds. |

## 8. Risks & Open Questions

- **`filterCategory` compat reads.** CategorySidebar and listy-injection page may read `filterCategory` from the store. If they do, they will break when the field is removed. We keep the field as a computed alias (first item of filterCategories, or null) to minimize breakage. OR we simply search-and-replace all reads.
- **Set serialization.** `Set<string>` in the store's `useSyncExternalStore` snapshot. The snapshot function returns the state object reference, which changes on every `setFilterCategories` call — React will re-render subscribers correctly. `Set` does not serialize to JSON but we're not persisting to localStorage/URL (Group H handles that).
- **AND semantics interpretation.** "Conjunction non-empty" under single-`rel`-per-stack data cannot produce a true AND (intersection). Our interpretation (hovering category has at least one post) is the closest reasonable approximation and matches the user's mental model of "add more posts" vs "switch view." Document this in PR for user override.
- **Tag click and `clickFilterChip` conjunction.** The conjunction check in C4 (tag click) uses `relatedStacks.some(s => s.rel === cat)` — this checks the full set, not the filtered set. Conservative: always finds posts for that category since the tag is visible on a real post.

## 9. Judgment Calls Made Without User Input

| # | Ambiguity | Choice Made | Rationale |
|---|---|---|---|
| JC1 | "Conjunction non-empty" — AND across multiple selected categories is impossible when `rel` is a single string per stack. | "Conjunction non-empty" = clicking category X while A is active: any stack has `rel === X` → ADD; else → SWITCH. This is "can we show more" not "would there be overlap." | Most conservative reading that matches the user's stated intent. |
| JC2 | How many categories can be selected simultaneously? | No cap. All categories can be active at once. | Simpler; cap can be added later if needed. |
| JC3 | Does C2 hover preview apply when hovering over an already-active chip? | No preview — the chip is already active; hover has no distinct "add" or "switch" meaning. | Simplest; avoids ambiguity about what hover on an active chip means. |
| JC4 | "Multiple types → stay neutral until the user hovers into the related panel" — does "related panel" mean any part of the aside, or just the card area? | The cards container div specifically. Hovering the sticky header (filter chips) does NOT trigger color reveal. | Tightest interpretation; avoids unintended color reveal from scrolling near the top. |
| JC5 | C4 "click groups by that dimension" — interpreted as "filter to that category" using the same conjunction logic as C1. | Could also mean re-rank/sort by category. Using filter as the conservative interpretation. | Matches existing `toggleFilterCategory` semantics; closer to the "highlight hover → filter" pattern described in the brief. |
| JC6 | C4: tag hover on a card — does it also set `filterCategory` in the panel (filtering away non-matching cards), or just dim highlights? | Hover only dims highlights (via `hoveredCategory`). Click filters. | Separates transient hover from committed filter state. User can see effect before committing. |
| JC7 | Touch devices and C2 hover preview | No hover preview on touch (no hover events). Touch tap = click directly. | Standard touch handling; consistent with existing `isTouch` guards. |
| JC8 | `filterCategory: string | null` backward-compat field | Keep as computed property returning `filterCategories.size === 1 ? [...filterCategories][0] : null` for any code that still reads the old field. Removes it only after audit confirms no readers remain. | Defensive migration. |

## 10. Next Step

Hand off to implementation plan.
