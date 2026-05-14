# Resizable Shell Columns — Design

**Date:** 2026-05-13
**Target branch:** `tarcode2004/enhancement/listy-injection-main-app`
**Scope:** Make the center and related-posts columns horizontally resizable via draggable borders. Wrap the shell in a centered, max-width container with viewport-edge gutters (Twitter/X style).

## Problem

The current `Shell` layout uses Mantine's `AppShell` with hard-coded `clamp()` widths for the navbar and aside, and a flexible main area. Users on wide monitors cannot reclaim the gutters for content, and users who want a wider related-posts panel (or a narrower one) have no way to adjust it. The layout also expands to the full viewport, which on very wide displays leaves content edges far apart.

## Goals

1. Users can drag two vertical borders to set the **center column** and **related-posts column** widths independently.
2. Chosen widths persist across sessions (localStorage).
3. The whole UI sits in a centered max-width container, with the viewport background visible as gutters on either side.
4. The navbar (left column) width is **not** affected by either drag.
5. No resize affordance on mobile/narrow screens (matches existing aside mobile-collapse behavior).

## Non-goals

- Resizing the navbar via a border (it keeps its existing burger collapse + `clamp()` width).
- Vertical resizing.
- Touch-drag resizing (covered by "no mobile resize").
- Per-route width overrides (a single global pair persists across all shell routes).

## Layout

After the change, the shell renders inside a centered container:

```
viewport
┌──────────────────────────────────────────────────────────────┐
│ gutter ┌──────────────────────────────────────────┐ gutter   │
│        │ nav (fixed)   │ center   │ related      │           │
│        │               ║          ║              │           │
│        │               ║          ║              │           │
│        └──────────────────────────────────────────┘           │
└──────────────────────────────────────────────────────────────┘
                        ↑ container (max-width ~1600px, centered)
                        ║ = draggable border
```

- **Container:** width is **the sum of nav + center + related widths**, capped at a max (~1900px = sum of all maxes). `margin: 0 auto` centers it. Background outside the container shows through (page/body background = the gutter color). The container does not have empty space inside it — it fits its content exactly.
- **Navbar:** unchanged. Existing `clamp(200px, 22vw, 300px)` and burger-collapse behavior preserved. Width is read at runtime (via ref) to compute container width.
- **Center column:** width is determined by `centerWidth` state. Because the container width = sum of all three columns, and the aside is explicitly sized, AppShell.Main flex-fills to exactly `centerWidth` without needing a direct width assignment.
- **Related column:** width = `relatedWidth` from state (default: current `clamp(360px, 26vw, 520px)` baseline value, resolved to a number on first render).

### Bounds

- `centerWidth`: `min 500px`, `max 900px` (tunable). Existing `AppShell.Main miw={500}` is the hard floor.
- `relatedWidth`: `min 320px`, `max 700px` (tunable).

These bounds are enforced during drag — the divider stops at the limit. No collapsing past minimum.

## Draggable Borders

Two `<ResizableDivider>` instances:

- **Divider 1 (nav ↔ center):** drag changes `centerWidth`. Drag right → center grows; drag left → center shrinks.
- **Divider 2 (center ↔ related):** drag changes `relatedWidth`. Drag right → related shrinks; drag left → related grows.

`centerWidth` and `relatedWidth` are independent values. Moving one divider does not change the other column's width — instead, the container's total width changes (it grows or shrinks to fit), and the gutters on either side absorb the difference (gutters shrink when columns grow, grow when columns shrink).

### Hover / interaction

- Hit zone: 8px wide, centered on the visible 1px border line.
- Cursor: `col-resize` on hover.
- Visual cue on hover: the 1px border line thickens to 3px and shifts to a slightly darker tone (~`#D6D2C0` against the `#FCFBF5` shell background).
- During drag: body cursor locked to `col-resize`; user-select disabled to prevent text selection.
- **Double-click resets** that column to its default width (`undefined` in state → falls back to default).

### Drag geometry (known trade-off)

Because the container is **centered** and **fits content** (its width = sum of column widths), when a column grows, the container also grows, and both gutters shrink equally. This means:

- Drag divider 1 right by Δ → `centerWidth` grows by Δ → container grows by Δ → left gutter shrinks by Δ/2 → divider 1 (at `containerLeft + navW`) moves right by only Δ/2 in viewport coords.
- The divider visually lags the cursor at half-speed.

This is a known visual quirk of pairing centered layout with content-fit sizing. Implementation uses simple delta-based dragging (`centerWidth += cursorDelta`) and accepts the drift. The end-state position is what the user cares about — they'll release when the column looks right.

Alternative (deferred): pin the container's left edge during drag, snap back to centered on `pointerup`. More complex; only worth implementing if the drift feels bad in practice.

### Responsive behavior

- Hidden below Mantine's `lg` breakpoint (matches existing `aside.breakpoint: "lg"` where the aside is mobile-hidden anyway).
- Below `lg`, the existing AppShell collapse + mobile drawer behavior takes over unchanged.

## State + Persistence

New hook: `useResizableColumns()` in `src/app/(shell)/useResizableColumns.ts`.

```ts
type ColumnWidths = {
  centerWidth: number | undefined;   // undefined = use default
  relatedWidth: number | undefined;
};

function useResizableColumns(): {
  widths: ColumnWidths;
  setCenterWidth: (w: number | undefined) => void;
  setRelatedWidth: (w: number | undefined) => void;
};
```

- On mount: read `stacky:centerWidth` and `stacky:relatedWidth` from `localStorage`. Parse as numbers; if missing or out of bounds, set to `undefined` (default).
- On `setCenterWidth(n)`: clamp to `[500, 900]`, write to localStorage, update state.
- On `setRelatedWidth(n)`: clamp to `[320, 700]`, write to localStorage, update state.
- On `setX(undefined)`: remove the key from localStorage (used by double-click reset).
- SSR-safe: read inside `useEffect` so the initial render matches server output, then hydrate.

## Components

### New: `ResizableDivider.tsx`

```tsx
type Props = {
  onResize: (deltaPx: number) => void;
  onDoubleClick: () => void;
  style?: React.CSSProperties;
};
```

- Renders a 8px-wide vertical `<div>` with the 1px border line centered.
- `onPointerDown`: capture pointer, record initial clientX, set `body { cursor: col-resize; user-select: none }`.
- `onPointerMove` (while captured): call `onResize(currentClientX - lastClientX)`; update lastClientX.
- `onPointerUp`/`onPointerCancel`: release capture, restore body styles.
- `onDoubleClick`: forward to prop.
- Below `lg` breakpoint: `display: none` (Mantine `visibleFrom="lg"` or CSS media query).

### Modified: `Shell.tsx`

- Wrap the entire `<AppShell>` (and the burger trigger) in a centered container `<div style={{ width: navW + centerW + relatedW, maxWidth: 1900, margin: '0 auto', position: 'relative', height: '100vh' }}>`. Container width is computed from current widths; max-width caps it at the sum of all maxes.
- Body/global CSS gets a background color so the gutter outside the container is visible.
- Use `useResizableColumns()` to read widths.
- Use a ref on the navbar element to read its current rendered width (since `clamp(200px, 22vw, 300px)` varies with viewport). Update on `ResizeObserver`.
- Replace `AppShell` `aside.width` with `widths.relatedWidth ?? defaultRelatedWidth`.
- Do **not** explicitly set Main's width. Because the container is sized exactly to fit all three columns and Aside is explicit, Main flex-fills to exactly `centerWidth`.
- Render two `<ResizableDivider>` instances as absolutely-positioned overlays at the column boundaries (positioned at `left = navW` and `left = navW + centerW`).

### Modified: `globals.css` (or equivalent root CSS)

- Set body background to gutter color (the existing `#FCFBF5` cream or a slightly different tone — see open question Q1 below).

## Data Flow

```
localStorage  ←→  useResizableColumns hook  →  Shell.tsx
                                                ├─ Container width (= navW + centerW + relatedW)
                                                ├─ AppShell.Aside width = relatedW
                                                ├─ AppShell.Main flex-fills → resolves to centerW
                                                └─ ResizableDivider × 2
                                                    └─ onResize → setCenterWidth / setRelatedWidth
```

No new context provider needed — the hook is called once in `Shell.tsx` and the values flow down by props/inline style. Other components don't need to know widths changed.

## Edge Cases

- **First render before localStorage hydrated:** widths are `undefined`, columns fall back to current defaults. After hydration, widths update; if a saved value differs from the default, columns visibly shift once. This is acceptable for an enhancement of this kind, but to minimize flash, the hook returns defaults during the SSR/initial render and switches on `useEffect`.
- **Narrowing the viewport below the sum of column widths:** if `navW + centerW + relatedW > viewportWidth`, container overflows the viewport horizontally. Mitigation: the body has `overflow-x: hidden` and the user can resize back, or double-click to reset. We accept this edge case — alternative is to dynamically shrink columns on resize, which complicates the model.
- **Nav collapsed via burger:** when `navCollapsed === true`, the navbar width is 0. The left divider's position must update accordingly. Solution: divider positions are computed from current navbar width (0 or clamped value).
- **Below `lg` breakpoint:** dividers hidden; widths still saved but unused. When user resizes back up to `lg+`, saved widths apply.

## Testing (manual)

No automated test framework is configured. Manual verification checklist:

1. Drag right divider — related column resizes; center stays the same width; widths persist after reload.
2. Drag left divider — center column resizes; related stays the same width; widths persist.
3. Double-click each divider — column resets to default; localStorage key removed.
4. Drag past min/max — divider stops at the bound.
5. Narrow viewport below `lg` (≈1200px) — dividers disappear; layout reverts to mobile-aware AppShell behavior.
6. Toggle navbar collapse (burger) — left divider repositions correctly; resizing still works.
7. Reload — saved widths restored on page load without flash beyond the one-frame hydration shift.

## Open questions (to resolve while writing the plan or during implementation)

1. **Gutter color:** keep gutter = `#FCFBF5` (matches the shell), or use a slightly different tone for visual distinction? Recommendation: same color for now; revisit if it looks too flat.
2. **Container max-width:** ~1900px = sum of max column widths. If tuned, must stay ≥ nav_max + center_max + related_max or the rightmost column will clip.
3. **Default center width:** since `centerWidth` is derived from container width minus other columns in the steady state, the "default" stored value is `undefined` until the user drags. The initial render needs a default container width — derive from current viewport at first paint (e.g., `min(viewport, 1600)` minus nav minus default related). Implementation plan should specify this exactly.

## File diff summary

- `src/app/(shell)/Shell.tsx` — wrap in container; integrate hook + dividers; dynamic widths.
- `src/app/(shell)/useResizableColumns.ts` *(new)* — state + localStorage.
- `src/app/(shell)/ResizableDivider.tsx` *(new)* — drag UI.
- `src/app/globals.css` (or equivalent) — body background for gutters.

## Out of scope (deferred)

- Resizable navbar.
- Touch / mobile resize.
- Per-route width overrides.
- Animated transitions on width change (instant only).
- Width sync across tabs (single-tab localStorage is fine).
