# Resizable Shell Columns — Design

**Date:** 2026-05-13
**Target branch:** `tarcode2004/enhancement/listy-injection-main-app`
**Scope:** Make the center and related-posts columns horizontally resizable via draggable borders. The center column is anchored to viewport center; nav and related float to its sides.

## Problem

The current `Shell` layout uses Mantine's `AppShell` with hard-coded `clamp()` widths for the navbar and aside, and a flexible main area. Users on wide monitors cannot reclaim the gutters for content, and users who want a wider related-posts panel (or a narrower one) have no way to adjust it. The layout also expands to the full viewport, which on very wide displays leaves content edges far apart.

## Goals

1. Users can drag three vertical borders to set the **center column** and **related-posts column** widths.
2. The **center column is always centered on the viewport**. Nav floats to its left; related floats to its right. Resizing center moves nav and related accordingly.
3. Both borders of the center column (left and right edges) symmetrically control `centerWidth`. Dragging either one resizes center; the opposite edge mirrors automatically.
4. The right (outer) edge of the related column controls `relatedWidth`.
5. Chosen widths persist across sessions (localStorage).
6. The navbar width is **not** changed by any drag (its existing `clamp()` + burger-collapse behavior is preserved).
7. No resize affordance on mobile/narrow screens.

## Non-goals

- Resizing the navbar via a border (it keeps its existing burger collapse + `clamp()` width).
- Vertical resizing.
- Touch-drag resizing (covered by "no mobile resize").
- Per-route width overrides (a single global pair persists across all shell routes).
- Centering the **whole layout** (nav + center + related) on the viewport. Only the center column is centered.
- Allowing center column to slide off-center (no left-anchored or right-anchored variant).

## Layout

The center column is pinned to viewport center. Nav and related are positioned relative to it. The "gutters" (visible viewport background) are whatever space remains on either side after nav and related are placed:

```
viewport
┌────────────────────────────────────────────────────────────────────┐
│                              viewport.center                       │
│                                  ↓                                 │
│  gutter   ┃ nav  ║  center column  ║  related  ┃  gutter           │
│           ┃      ║                 ║           ┃                   │
│           ┃ navW ║     centerW     ║  relatedW ┃                   │
│           ║      ║                 ║           ┃                   │
│           A      B                 C           D                   │
│                                                                    │
│   A = border between gutter and nav (NOT draggable — nav fixed)    │
│   B = LEFT BORDER of center (draggable → changes centerW symmetric)│
│   C = RIGHT BORDER of center (draggable → changes centerW symmetric)│
│   D = RIGHT BORDER of related (draggable → changes relatedW)       │
```

**Position formulas (in viewport coordinates):**

- `center.left   = viewport.center - centerW / 2`
- `center.right  = viewport.center + centerW / 2`
- `nav.right     = center.left`            (nav anchored to center.left)
- `nav.left      = center.left - navW`
- `related.left  = center.right`           (related anchored to center.right)
- `related.right = center.right + relatedW`

**Column behavior:**

- **Navbar:** unchanged width (`clamp(200px, 22vw, 300px)` + burger collapse). Position floats with `center.left`. Width is read at runtime via ref so layout calculations have a number.
- **Center column:** width = `centerWidth` from state. Always horizontally centered on the viewport. Default value (no saved width): `min(900, viewport - 2 * max(navW, relatedW))` on first paint, clamped to the viewport-derived bound (see Edge Cases).
- **Related column:** width = `relatedWidth` from state. Default: current baseline `clamp(360px, 26vw, 520px)` resolved to a number.
- **Gutters:** whatever space remains on either side of the layout. Because `navW` and `relatedW` can differ, the overall layout may sit slightly off-center relative to the viewport even though the center column is perfectly centered. This is intentional — "center column centered" is the contract, not "whole layout centered".

### Bounds

- `centerWidth`: `min 500px`, `max 1100px` (tunable). Existing `AppShell.Main miw={500}` is the hard floor.
- `relatedWidth`: `min 320px`, `max 700px` (tunable).
- **Viewport-derived upper bound for centerWidth:** because center is centered, `centerW/2 + max(navW, relatedW)` must fit inside viewport/2. So `centerW ≤ viewport - 2 * max(navW, relatedW)`. Enforced live during drag and on viewport resize.

These bounds are enforced during drag — the border stops at the limit. No collapsing past minimum.

## Draggable Borders

Three `<ResizableDivider>` instances. Borders B and C share state — they both edit `centerWidth` symmetrically, so dragging one moves the other in real time:

- **Border B (left edge of center):** drag right by Δ → `centerWidth` shrinks by `2Δ`. Drag left by Δ → `centerWidth` grows by `2Δ`. Border B tracks cursor exactly.
- **Border C (right edge of center):** drag right by Δ → `centerWidth` grows by `2Δ`. Drag left by Δ → `centerWidth` shrinks by `2Δ`. Border C tracks cursor exactly.
- **Border D (right edge of related):** drag right by Δ → `relatedWidth` grows by Δ. Drag left by Δ → `relatedWidth` shrinks by Δ. Border D tracks cursor exactly.

`centerWidth` and `relatedWidth` are two independent persisted values; borders B and C are two handles on the same value.

### Hover / interaction

- Hit zone: 8px wide, centered on the visible 1px border line.
- Cursor: `col-resize` on hover.
- Visual cue on hover: the 1px border line thickens to 3px and shifts to a slightly darker tone (~`#D6D2C0` against the `#FCFBF5` shell background).
- During drag: body cursor locked to `col-resize`; user-select disabled to prevent text selection.
- **Double-click resets** that column to its default width (`undefined` in state → falls back to default). Double-clicking B or C resets `centerWidth`; double-clicking D resets `relatedWidth`.

### Drag geometry (resolved)

Because the center column is **anchored to viewport center**, both edges move symmetrically when `centerWidth` changes. This means dragging border B by Δ shifts `center.left` by Δ (since `center.left = viewport.center - centerW/2`, so a Δ-pixel cursor move corresponds to a `centerW` change of `2Δ`, which moves `center.left` by exactly Δ). The border tracks the cursor perfectly — no drift.

Border D is on the outer edge of related and only affects `relatedWidth`, so it also tracks cursor 1:1.

Side effects of resizing center:
- When center grows (border B left or border C right), nav slides left and related slides right (they're anchored to center's edges). Their widths don't change.
- When center shrinks, nav slides right and related slides left.
- This is the intended behavior — keeps center anchored visually.

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
- On `setCenterWidth(n)`: clamp to `[500, 1100]` AND to viewport-derived max, write to localStorage, update state.
- On `setRelatedWidth(n)`: clamp to `[320, 700]`, write to localStorage, update state.
- On `setX(undefined)`: remove the key from localStorage (used by double-click reset).
- SSR-safe: read inside `useEffect` so the initial render matches server output, then hydrate.

## Components

### New: `ResizableDivider.tsx`

```tsx
type Props = {
  onResize: (deltaPx: number) => void;     // called with cursor delta per frame
  onDoubleClick: () => void;
  style?: React.CSSProperties;             // for absolute positioning
};
```

- Renders an 8px-wide vertical `<div>` (full viewport height) with the 1px border line centered.
- `onPointerDown`: capture pointer, record initial clientX, set `body { cursor: col-resize; user-select: none }`.
- `onPointerMove` (while captured): call `onResize(currentClientX - lastClientX)`; update lastClientX.
- `onPointerUp`/`onPointerCancel`: release capture, restore body styles.
- `onDoubleClick`: forward to prop.
- Below `lg` breakpoint: `display: none` (CSS media query).

The caller maps the raw `deltaPx` to a width change. Borders B and C call `setCenterWidth(prev => prev + sign * 2 * delta)` (where `sign` is `-1` for B and `+1` for C). Border D calls `setRelatedWidth(prev => prev + delta)`.

### Modified: `Shell.tsx`

The center column must be anchored to viewport center, which AppShell's built-in grid layout doesn't support. We restructure Shell.tsx into two branches based on breakpoint:

- **Below `lg`:** existing AppShell behavior is preserved (mobile header, burger drawer). No resize affordance. The mobile/tablet experience does not change.
- **At `lg` and above:** a custom three-column layout replaces the AppShell internals. The mobile Header and Drawer components (currently inside AppShell) are extracted so they can be rendered alongside the new desktop layout without depending on AppShell.

Desktop layout structure (lg+):

- Outer wrapper element with CSS custom properties for widths: `style={{ '--center-w': centerW + 'px', '--related-w': relatedW + 'px', '--nav-w': navW + 'px' }}`. The `--nav-w` value is read from a `ResizeObserver` on the rendered nav element (since `clamp(200px, 22vw, 300px)` depends on viewport).
- Three absolutely-positioned column containers, each `top: 0; bottom: 0`:
  - Nav: `left: calc(50vw - var(--center-w) / 2 - var(--nav-w)); width: var(--nav-w)`
  - Center: `left: calc(50vw - var(--center-w) / 2); width: var(--center-w)`
  - Related: `left: calc(50vw + var(--center-w) / 2); width: var(--related-w)`
- Three `<ResizableDivider>` overlays positioned via `left: calc(...)` with z-index above the columns:
  - Border B at `calc(50vw - var(--center-w) / 2 - 4px)` (center.left)
  - Border C at `calc(50vw + var(--center-w) / 2 - 4px)` (center.right)
  - Border D at `calc(50vw + var(--center-w) / 2 + var(--related-w) - 4px)` (related.right)

React's job is to set CSS variables and render the column content. CSS handles all positioning math. Width changes only re-set vars — no React re-layout, just a smooth CSS update.

The existing burger button + Drawer (for mobile nav) and the navbar collapse logic still apply at lg+ as well (the same nav can be collapsed via burger). When collapsed, `--nav-w` becomes 0 and the nav element is hidden; center stays centered.

### Modified: `globals.css` (or equivalent root CSS)

- Set body background to gutter color (`#FCFBF5` to match the shell). Add `overflow-x: hidden` to avoid horizontal scroll if columns briefly exceed viewport.

## Data Flow

```
localStorage  ←→  useResizableColumns hook  →  Shell.tsx (desktop wrapper)
                                                ├─ CSS var --center-w
                                                ├─ CSS var --related-w
                                                ├─ CSS var --nav-w (from ResizeObserver)
                                                └─ ResizableDivider × 3
                                                    ├─ Border B  → setCenterWidth(prev => prev - 2*Δ)
                                                    ├─ Border C  → setCenterWidth(prev => prev + 2*Δ)
                                                    └─ Border D  → setRelatedWidth(prev => prev + Δ)
```

No new context provider needed — the hook is called once in `Shell.tsx` and the values flow down by CSS variables and props. Other components don't need to know widths changed.

## Edge Cases

- **First render before localStorage hydrated:** widths are `undefined`, columns fall back to defaults. The hook returns defaults on the initial SSR/client render and updates on `useEffect`. If saved values differ from defaults, columns visibly shift once on hydration.
- **Viewport too narrow for current center + sides:** if `centerW/2 + max(navW, relatedW) > viewport/2`, the wider side (nav or related) would extend past the viewport edge. On viewport resize, the hook clamps `centerWidth` down to the viewport-derived maximum (`viewport - 2 * max(navW, relatedW)`). On the way back up, saved values are restored if they fit.
- **Nav collapsed via burger:** when `navCollapsed === true`, navW is 0. Center stays centered; only the left gutter grows. Border B sits at `viewport.center - centerW/2` (still the left edge of center).
- **Asymmetric gutters:** because `navW` and `relatedW` differ, the left gutter (`= center.left - navW`) and right gutter (`= viewport.width - related.right`) are not equal. This is intentional — center is centered, the rest falls where it falls.
- **Below `lg` breakpoint:** dividers hidden; existing AppShell mobile behavior takes over. Saved widths are not applied. When user resizes back up to `lg+`, saved widths apply.

## Testing (manual)

No automated test framework is configured. Manual verification checklist:

1. Drag border B (left edge of center) — center column resizes symmetrically; the opposite border (C) mirrors in real time; cursor tracks border B exactly; widths persist after reload.
2. Drag border C (right edge of center) — same as above, mirrored.
3. Drag border D (right edge of related) — related column resizes; center is unaffected; cursor tracks border D exactly; persists after reload.
4. Verify the center column's horizontal midpoint stays at `viewport.center` (use a ruler or DevTools).
5. Double-click each border — corresponding column resets to default; localStorage key removed.
6. Drag past min/max — border stops at the bound; cursor can keep moving but border doesn't.
7. Resize browser to narrow the viewport — center clamps to viewport-derived max if it was wider; widens back when viewport grows.
8. Narrow viewport below `lg` (~1200px) — borders disappear; layout reverts to existing AppShell mobile behavior.
9. Toggle navbar collapse (burger) — nav width becomes 0; center stays centered; borders B/C/D reposition without jank.
10. Reload — saved widths restored on page load with at most one hydration-frame flash.

## Open questions (to resolve while writing the plan or during implementation)

1. **Background color:** the body background (which shows as gutters) is `#FCFBF5` today. We keep it. If the gutters end up looking too flat next to the shell content, consider a subtle tone shift later.
2. **Default `centerWidth`:** when no saved value exists, what's the initial center width? Recommendation: `min(900, viewport - 2 * max(navW, relatedW))` — wide enough to feel intentional, narrow enough to fit common monitors.
3. **Default `relatedWidth`:** keep the current `clamp(360px, 26vw, 520px)` baseline by resolving it to a px number at first render. Or pick a fixed default like `460px`. To decide during implementation.
4. **Header visibility on desktop:** the existing AppShell.Header is `hiddenFrom="sm"` (mobile only). The new layout doesn't introduce a desktop header, so this is unchanged. Just confirming.

## File diff summary

- `src/app/(shell)/Shell.tsx` — keep AppShell for mobile (header + drawer); add desktop custom-layout overlay with three absolutely-positioned columns and three dividers. Use CSS variables for widths.
- `src/app/(shell)/useResizableColumns.ts` *(new)* — state, localStorage, viewport-clamped bounds.
- `src/app/(shell)/ResizableDivider.tsx` *(new)* — drag UI.
- `src/app/globals.css` (or equivalent) — body background; `overflow-x: hidden`.

## Out of scope (deferred)

- Resizable navbar.
- Touch / mobile resize.
- Per-route width overrides.
- Animated transitions on width change (instant only).
- Width sync across tabs (single-tab localStorage is fine).
