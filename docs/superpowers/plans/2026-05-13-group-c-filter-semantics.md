# Group C — Filter Semantics & Color Affordances (Implementation Plan)

**Date:** 2026-05-13
**Spec:** `docs/superpowers/specs/2026-05-13-group-c-filter-semantics-design.md`
**Branch:** `worktree-agent-a0f645904b58d8089`
**Target PR base:** `dev`

---

## Task Breakdown

### Task 1 — Upgrade highlightStore to multi-filter

**Files:** `src/utils/highlightStore.ts`

**Steps:**

- [ ] Replace `filterCategory: string | null` field with `filterCategories: Set<string>` in `HighlightState` interface and `INITIAL`.
- [ ] Add `setFilterCategories(cats: Set<string>)` export function.
- [ ] Keep `filterCategory` as a backward-compat computed read (first item of set, or null) — add a getter comment: `// @deprecated — use filterCategories; kept for StackCount.tsx compat`.
- [ ] Update `setFilterCategory(category: string | null)` to delegate: set `filterCategories` to `new Set([category])` or empty set.
- [ ] Update `toggleFilterCategory(category: string)` to delegate: if in set → remove, else → replace with `new Set([category])` (still single-exclusive for StackCount backward compat).
- [ ] Add `clickFilterChip(category: string, relStacks: string[])` — this is the new smart conjunction action. Parameter `relStacks` = array of `rel` strings for all stacks (passed from component).
- [ ] Update `useHighlightStore()` hook return type to include `filterCategories: Set<string>`.

**Commit:** `Upgrade highlightStore to multi-category filter set`

**Verification gate:** `pnpm build` passes (no TypeScript errors from the store change).

---

### Task 2 — Update StackCount.tsx for multi-category compat

**Files:** `src/components/StackCount.tsx`

**Steps:**

- [ ] Update the destructured import: `const { filterCategories } = useHighlightStore();`
- [ ] Update line `const isFilterActive = filterCategory === stack.rel;` → `const isFilterActive = filterCategories.has(stack.rel);`
- [ ] Update `toggleFilterCategory(stack.rel)` calls (2 places) to `toggleFilterCategory(stack.rel)` — no change needed, the function still toggles single category, that's the StackCount desired behavior.

**Commit:** `Update StackCount to read filterCategories set`

**Verification gate:** `pnpm build` passes.

---

### Task 3 — C1: Smart conjunction click in RelatedStacks

**Files:** `src/components/RelatedStacks.tsx`

**Steps:**

- [ ] Update destructuring at line ~529: add `filterCategories` next to existing `filterCategory`.
- [ ] Add `handleFilterChipClick(category: string)` function in the component:
  ```ts
  const handleFilterChipClick = (category: string) => {
    const active = filterCategories;
    if (active.has(category)) {
      const next = new Set(active); next.delete(category);
      setFilterCategories(next);
    } else if (active.size === 0) {
      setFilterCategories(new Set([category]));
    } else {
      const hasAny = relatedStacks.some(s => s.rel === category);
      setFilterCategories(hasAny ? new Set([...active, category]) : new Set([category]));
    }
  };
  ```
- [ ] Update `displayStacks` memo (~line 679): replace `if (filterCategory)` check with:
  ```ts
  if (filterCategories.size > 0) {
    result = result.filter((s) => filterCategories.has(s.rel));
  }
  ```
  Also update the dependency array to use `filterCategories`.
- [ ] Update `FilterChip` usage at line ~905: replace `onClick={() => toggleFilterCategory(category)}` with `onClick={() => handleFilterChipClick(category)}` and `active={filterCategories.has(category)}`.
- [ ] Update the count display at lines ~911-912:
  ```tsx
  {filterCategories.size > 0
    ? `${displayStacks.length} ${[...filterCategories].map(c => CATEGORY_LABELS[c] ?? c).join(' + ')} post${displayStacks.length !== 1 ? 's' : ''}`
    : `${displayStacks.length} posts across all categories`}
  ```

**Commit:** `Add conjunction-vs-switch filter chip click logic (C1)`

**Verification gate:** `pnpm build` passes.

---

### Task 4 — C2: Hover preview on filter chips

**Files:** `src/components/RelatedStacks.tsx`

**Steps:**

- [ ] Add `const [chipHovered, setChipHovered] = useState<string | null>(null)` near other state declarations.
- [ ] Add `computePreviewMode` pure function (outside component or as a `useMemo`):
  ```ts
  function computePreviewMode(
    hoveredCat: string | null,
    activeCats: Set<string>,
    relStacks: RelatedStackType[],
  ): 'none' | 'add' | 'switch' {
    if (!hoveredCat || activeCats.has(hoveredCat) || activeCats.size === 0) return 'none';
    return relStacks.some(s => s.rel === hoveredCat) ? 'add' : 'switch';
  }
  ```
- [ ] In the render, before the FilterChip map, compute:
  ```ts
  const previewMode = computePreviewMode(chipHovered, filterCategories, relatedStacks);
  ```
- [ ] Update `FilterChip` component signature to accept `previewActive?: boolean` and `previewDim?: boolean`.
- [ ] In `FilterChip` render logic, apply preview overrides:
  - `previewActive` → override background/border/color to active style (same as `active` prop visuals)
  - `previewDim` → `opacity: 0.5, filter: 'grayscale(0.4)'`
- [ ] Update FilterChip usage in the chips row:
  ```tsx
  <FilterChip
    key={category}
    category={category}
    count={count}
    active={filterCategories.has(category)}
    previewActive={previewMode !== 'none' && category === chipHovered}
    previewDim={previewMode === 'switch' && filterCategories.has(category)}
    onClick={() => handleFilterChipClick(category)}
    onMouseEnter={() => setChipHovered(category)}
    onMouseLeave={() => setChipHovered(null)}
  />
  ```
- [ ] Add `transition: 'all 150ms ease'` to `FilterChip` button style if not present.

**Commit:** `Add hover preview to filter chips (C2)`

**Verification gate:** `pnpm build` passes.

---

### Task 5 — C3: Neutral-until-hover for multi-type relation tags

**Files:** `src/components/RelatedStacks.tsx`

**Steps:**

- [ ] Add `const [panelHovered, setPanelHovered] = useState(false)` near other state declarations.
- [ ] Wrap the `<LayoutGroup>` cards area in an outer `<div>` with:
  ```tsx
  onMouseEnter={() => setPanelHovered(true)}
  onMouseLeave={() => setPanelHovered(false)}
  ```
  (Specifically: wrap the `<LayoutGroup>` element, NOT the sticky header, so hovering the filter chips does not trigger color reveal.)
- [ ] In the per-card tag rendering section (~lines 1244-1297), after `tags` is built:
  ```ts
  const isMultiType = tags.length > 1;
  const showTagColor = !isMultiType || panelHovered;
  ```
- [ ] Update each tag's style:
  ```ts
  background: showTagColor ? tc.bg : '#f0f0f0',
  color:      showTagColor ? tc.text : '#888888',
  border:     `1px solid ${showTagColor ? tc.border : '#d0d0d0'}`,
  transition: 'background 200ms ease, color 200ms ease, border-color 200ms ease',
  ```
- [ ] Keep `opacity` for bright/dim behavior (tagBright) unchanged — it stacks with the neutral coloring.

**Commit:** `Neutral tag colors for multi-type posts until panel hover (C3)`

**Verification gate:** `pnpm build` passes.

---

### Task 6 — C4: Tag hover filters panel / click groups

**Files:** `src/components/RelatedStacks.tsx`

**Steps:**

- [ ] In the per-card tag `onClick` handler (~lines 1265-1279), add desktop click behavior:
  ```tsx
  onClick={(e) => {
    e.stopPropagation();
    if (isTouch) {
      // existing touch logic unchanged
    } else {
      // Desktop: toggle filter for this category
      handleFilterChipClick(cat);
    }
  }}
  ```
  Note: the existing `onMouseEnter` already calls `setHoveredCategory(cat)` which handles the hover-based dimming. No change needed for hover side.
- [ ] Import `setFilterCategories` from highlightStore (if not already imported from Task 1).
- [ ] Verify that `handleFilterChipClick` is accessible from within the per-card rendering (it is, since it's defined in the component body).

**Commit:** `Clicking relation-type tag filters by category (C4)`

**Verification gate:** `pnpm build` passes.

---

### Task 7 — Final integration: pnpm build + commit docs

**Steps:**

- [ ] Commit spec and plan files:
  ```
  Add Group C design spec and implementation plan
  ```
- [ ] Run `pnpm build` one final time; confirm zero errors.
- [ ] Commit any final cleanup.

---

## Import Reference

All new imports from `highlightStore.ts` that need to be added to `RelatedStacks.tsx`:
- `setFilterCategories` (new)
- Remove old `toggleFilterCategory` import if no longer used

All new imports from `highlightStore.ts` that need to be added to `StackCount.tsx`:
- `filterCategories` (from useHighlightStore destructuring)

---

## Risk Checklist

- [ ] `Set<string>` in store snapshot — confirm React re-renders correctly when set changes (must return new Set reference each time).
- [ ] `displayStacks` memo dependency updated from `filterCategory` to `filterCategories`.
- [ ] No lint errors from unused `filterCategory` import (remove it once replaced).
- [ ] Touch path in tag onClick handler — don't break existing touch toggle logic.
