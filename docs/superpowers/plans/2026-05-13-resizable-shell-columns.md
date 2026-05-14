# Resizable Shell Columns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three draggable borders that resize the center and related-posts columns. Center column stays pinned to viewport center; nav and related float to its sides. Widths persist to localStorage. Active at `lg+` breakpoint only.

**Architecture:** New `useResizableColumns` hook owns width state + localStorage. New `ResizableDivider` component handles pointer-drag UI. `Shell.tsx` is restructured: existing AppShell is preserved for `<lg` (mobile/tablet); a custom absolute-positioned three-column layout takes over at `lg+`, with the active layout selected via `useMediaQuery`. CSS variables (`--center-w`, `--related-w`, `--nav-w`) drive all positioning math so React only sets values.

**Tech Stack:** Next.js 14 App Router, TypeScript, React 18 (client components), Mantine v7 (`@mantine/hooks` for `useMediaQuery`, `Burger`, `Drawer`), Tabler icons. No test framework — verification is manual via `pnpm dev` and browser.

**Spec:** `docs/superpowers/specs/2026-05-13-resizable-shell-columns-design.md`

**Target branch:** `tarcode2004/enhancement/listy-injection-main-app` (not `dev`).

---

## File Structure

Files this plan creates or modifies:

- **Create:** `src/app/(shell)/useResizableColumns.ts` — width state, localStorage I/O, viewport-clamped bounds.
- **Create:** `src/app/(shell)/ResizableDivider.tsx` — drag/double-click UI for one border.
- **Modify:** `src/app/(shell)/Shell.tsx` — add desktop branch with custom layout + dividers; preserve mobile branch (existing AppShell).
- **Modify:** `src/styles/globals.css` — body background (gutter color) + `overflow-x: hidden`.

No other files are touched.

---

## Constants Used Across Tasks

These values appear in multiple tasks. Treat as canonical:

```ts
// Bounds
const CENTER_MIN = 500;
const CENTER_MAX = 1100;
const RELATED_MIN = 320;
const RELATED_MAX = 700;

// localStorage keys
const LS_CENTER = "stacky:centerWidth";
const LS_RELATED = "stacky:relatedWidth";

// Breakpoint: Mantine's default lg = 1200px (em-based in Mantine, but useMediaQuery accepts px)
const LG_QUERY = "(min-width: 1200px)";

// Default related width (resolved at first paint)
const DEFAULT_RELATED = 460; // mid-point of clamp(360, 26vw, 520) for typical viewport

// Divider hit zone
const DIVIDER_HIT_WIDTH = 8;   // px
const DIVIDER_LINE_WIDTH = 1;  // visible line
const DIVIDER_HOVER_LINE = 3;  // visible line on hover
const DIVIDER_COLOR = "rgba(0, 0, 0, 0.08)";
const DIVIDER_HOVER_COLOR = "rgba(0, 0, 0, 0.20)";
```

---

## Task 1: `useResizableColumns` hook

**Files:**
- Create: `src/app/(shell)/useResizableColumns.ts`

The hook owns two persisted numbers (`centerWidth`, `relatedWidth`), reads/writes localStorage, enforces bounds (including viewport-derived bound for centerWidth), and survives SSR by returning `undefined` defaults until mount.

- [ ] **Step 1: Create the file with full implementation**

Create `src/app/(shell)/useResizableColumns.ts`:

```ts
"use client";

import { useCallback, useEffect, useState } from "react";

export const CENTER_MIN = 500;
export const CENTER_MAX = 1100;
export const RELATED_MIN = 320;
export const RELATED_MAX = 700;
export const DEFAULT_RELATED = 460;

const LS_CENTER = "stacky:centerWidth";
const LS_RELATED = "stacky:relatedWidth";

function readNumber(key: string): number | undefined {
  if (typeof window === "undefined") return undefined;
  const raw = window.localStorage.getItem(key);
  if (raw === null) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export type ColumnWidths = {
  centerWidth: number | undefined;
  relatedWidth: number | undefined;
};

export type UseResizableColumns = {
  widths: ColumnWidths;
  setCenterWidth: (w: number | undefined, viewportMax?: number) => void;
  setRelatedWidth: (w: number | undefined) => void;
};

export function useResizableColumns(): UseResizableColumns {
  const [centerWidth, setCenterRaw] = useState<number | undefined>(undefined);
  const [relatedWidth, setRelatedRaw] = useState<number | undefined>(undefined);

  useEffect(() => {
    const c = readNumber(LS_CENTER);
    const r = readNumber(LS_RELATED);
    if (c !== undefined) setCenterRaw(clamp(c, CENTER_MIN, CENTER_MAX));
    if (r !== undefined) setRelatedRaw(clamp(r, RELATED_MIN, RELATED_MAX));
  }, []);

  const setCenterWidth = useCallback((w: number | undefined, viewportMax?: number) => {
    if (w === undefined) {
      setCenterRaw(undefined);
      if (typeof window !== "undefined") window.localStorage.removeItem(LS_CENTER);
      return;
    }
    const hardMax = viewportMax !== undefined ? Math.min(CENTER_MAX, viewportMax) : CENTER_MAX;
    const clamped = clamp(w, CENTER_MIN, hardMax);
    setCenterRaw(clamped);
    if (typeof window !== "undefined") window.localStorage.setItem(LS_CENTER, String(clamped));
  }, []);

  const setRelatedWidth = useCallback((w: number | undefined) => {
    if (w === undefined) {
      setRelatedRaw(undefined);
      if (typeof window !== "undefined") window.localStorage.removeItem(LS_RELATED);
      return;
    }
    const clamped = clamp(w, RELATED_MIN, RELATED_MAX);
    setRelatedRaw(clamped);
    if (typeof window !== "undefined") window.localStorage.setItem(LS_RELATED, String(clamped));
  }, []);

  return {
    widths: { centerWidth, relatedWidth },
    setCenterWidth,
    setRelatedWidth,
  };
}
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm exec tsc --noEmit`
Expected: no errors related to this file. (Pre-existing errors elsewhere are fine — note them but don't fix.)

- [ ] **Step 3: Commit**

```bash
git add src/app/\(shell\)/useResizableColumns.ts
git commit -m "Add useResizableColumns hook for shell column widths"
```

---

## Task 2: `ResizableDivider` component

**Files:**
- Create: `src/app/(shell)/ResizableDivider.tsx`

A single vertical divider with pointer-drag. Caller decides what to do with the delta. The component handles pointer capture, body cursor lock, and double-click.

- [ ] **Step 1: Create the file with full implementation**

Create `src/app/(shell)/ResizableDivider.tsx`:

```tsx
"use client";

import { CSSProperties, PointerEvent as ReactPointerEvent, useCallback, useRef, useState } from "react";

type Props = {
  onResize: (deltaPx: number) => void;
  onDoubleClick?: () => void;
  /** Inline style — caller supplies `left`/`right` for absolute positioning. */
  style?: CSSProperties;
  ariaLabel?: string;
};

const HIT_WIDTH = 8;
const LINE_WIDTH = 1;
const LINE_HOVER_WIDTH = 3;
const LINE_COLOR = "rgba(0, 0, 0, 0.08)";
const LINE_HOVER_COLOR = "rgba(0, 0, 0, 0.20)";

export function ResizableDivider({ onResize, onDoubleClick, style, ariaLabel }: Props) {
  const lastClientX = useRef<number | null>(null);
  const [hovered, setHovered] = useState(false);
  const [dragging, setDragging] = useState(false);

  const handlePointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    lastClientX.current = e.clientX;
    setDragging(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  const handlePointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (lastClientX.current === null) return;
    const delta = e.clientX - lastClientX.current;
    if (delta !== 0) {
      lastClientX.current = e.clientX;
      onResize(delta);
    }
  }, [onResize]);

  const handlePointerUp = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
    lastClientX.current = null;
    setDragging(false);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, []);

  const lineActive = hovered || dragging;

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={ariaLabel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onDoubleClick={onDoubleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        width: HIT_WIDTH,
        marginLeft: -HIT_WIDTH / 2,
        cursor: "col-resize",
        touchAction: "none",
        zIndex: 250,
        display: "flex",
        justifyContent: "center",
        ...style,
      }}
    >
      <div
        style={{
          width: lineActive ? LINE_HOVER_WIDTH : LINE_WIDTH,
          backgroundColor: lineActive ? LINE_HOVER_COLOR : LINE_COLOR,
          transition: "width 120ms ease, background-color 120ms ease",
          height: "100%",
        }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm exec tsc --noEmit`
Expected: no new errors from this file.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(shell\)/ResizableDivider.tsx
git commit -m "Add ResizableDivider component for column borders"
```

---

## Task 3: Body background + horizontal overflow guard

**Files:**
- Modify: `src/styles/globals.css`

Add body background (so gutters show the right color) and `overflow-x: hidden` (so transient column expansion past viewport doesn't introduce horizontal scroll).

- [ ] **Step 1: Append to `src/styles/globals.css`**

Append at the end of the file:

```css
/* Resizable shell columns: body background = gutter color; suppress horizontal scroll. */
body {
    background-color: #FCFBF5;
    overflow-x: hidden;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/styles/globals.css
git commit -m "Add body background and horizontal overflow guard for shell gutters"
```

---

## Task 4: Restructure `Shell.tsx` — desktop branch with custom layout

**Files:**
- Modify: `src/app/(shell)/Shell.tsx`

This is the largest task. We replace the file with one that renders either the existing AppShell layout (below `lg`) or a new custom three-column layout (`lg+`). The branch is chosen via `useMediaQuery`. The mobile branch is identical to the current code; the desktop branch uses absolute positioning and CSS variables.

The full replacement is provided so you can apply it as one edit. Read the current file first to confirm it matches what's documented below.

- [ ] **Step 1: Read the current `Shell.tsx` for sanity check**

Read: `src/app/(shell)/Shell.tsx`
Confirm the imports and the structure roughly match what was last committed (RelatedStacksProvider, AppShell with Header/Navbar/Aside/Main, Drawer, HoverTooltip, Burger). If the file has changed materially since this plan was written, surface the diff and stop.

- [ ] **Step 2: Replace the entire file with the new version**

Write `src/app/(shell)/Shell.tsx`:

```tsx
"use client";

import { AppShell, Burger, Drawer, Group } from "@mantine/core";
import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Navbar } from "../../components/NavBar/Navbar";
import StackLogo from "../../utils/StackLogo";
import { HoverTooltip } from "../../components/HoverTooltip";
import { RelatedStacksProvider } from "./related-stacks-context";
import { ResizableDivider } from "./ResizableDivider";
import {
    CENTER_MAX,
    CENTER_MIN,
    DEFAULT_RELATED,
    RELATED_MAX,
    RELATED_MIN,
    useResizableColumns,
} from "./useResizableColumns";

const LG_QUERY = "(min-width: 1200px)";

export default function Shell({ children, aside }: { children: React.ReactNode; aside: React.ReactNode }) {
    const [drawerOpened, { toggle: toggleDrawer, close: closeDrawer }] = useDisclosure();
    const [navCollapsed, { toggle: toggleNav }] = useDisclosure(false);

    // useMediaQuery returns `undefined` on SSR and first client render; treat as "not lg" to keep
    // the AppShell mobile layout during hydration. After mount it resolves to true/false.
    const isDesktop = useMediaQuery(LG_QUERY) ?? false;

    return (
        <RelatedStacksProvider>
            {isDesktop ? (
                <DesktopShell
                    aside={aside}
                    navCollapsed={navCollapsed}
                    toggleNav={toggleNav}
                    drawerOpened={drawerOpened}
                    closeDrawer={closeDrawer}
                >
                    {children}
                </DesktopShell>
            ) : (
                <MobileShell
                    aside={aside}
                    drawerOpened={drawerOpened}
                    toggleDrawer={toggleDrawer}
                    closeDrawer={closeDrawer}
                    navCollapsed={navCollapsed}
                    toggleNav={toggleNav}
                >
                    {children}
                </MobileShell>
            )}
            <HoverTooltip />
        </RelatedStacksProvider>
    );
}

/* ---------- Mobile / tablet branch: unchanged AppShell behavior ---------- */

function MobileShell({
    children,
    aside,
    drawerOpened,
    toggleDrawer,
    closeDrawer,
    navCollapsed,
    toggleNav,
}: {
    children: React.ReactNode;
    aside: React.ReactNode;
    drawerOpened: boolean;
    toggleDrawer: () => void;
    closeDrawer: () => void;
    navCollapsed: boolean;
    toggleNav: () => void;
}) {
    return (
        <>
            <AppShell
                header={{ height: { base: 64, sm: 0 } }}
                navbar={{
                    width: navCollapsed ? 0 : "clamp(200px, 22vw, 300px)",
                    breakpoint: "sm",
                    collapsed: { mobile: !drawerOpened, desktop: navCollapsed },
                }}
                aside={{
                    width: navCollapsed ? "clamp(400px, 32vw, 600px)" : "clamp(360px, 26vw, 520px)",
                    breakpoint: "lg",
                    collapsed: { mobile: true },
                }}
                padding="md"
            >
                <AppShell.Header hiddenFrom="sm" bg="#FCFBF5">
                    <Group h="100%" px="md">
                        <Burger opened={drawerOpened} onClick={toggleDrawer} hiddenFrom="sm" size="sm" />
                        <StackLogo size={30} />
                    </Group>
                </AppShell.Header>
                <AppShell.Navbar
                    p="md"
                    visibleFrom="sm"
                    style={{
                        backgroundColor: "#FCFBF5",
                        overflow: "hidden",
                        opacity: navCollapsed ? 0 : 1,
                        transition: "opacity 200ms ease",
                    }}
                >
                    <Navbar />
                </AppShell.Navbar>
                <AppShell.Aside
                    p="md"
                    pt="0"
                    withBorder
                    style={{
                        background: "#FCFBF5",
                        overflowY: "auto",
                        overscrollBehavior: "contain",
                        scrollbarWidth: "none",
                    }}
                >
                    {aside ?? null}
                </AppShell.Aside>
                <Drawer
                    opened={drawerOpened}
                    onClose={closeDrawer}
                    padding="md"
                    size="xs"
                    styles={{
                        content: { backgroundColor: "#FCFBF5" },
                        header: { backgroundColor: "#FCFBF5" },
                    }}
                    lockScroll={false}
                >
                    <Navbar />
                </Drawer>
                <AppShell.Main miw={500}>{children}</AppShell.Main>
            </AppShell>
            <Burger
                opened={!navCollapsed}
                onClick={toggleNav}
                visibleFrom="sm"
                size="sm"
                aria-label={navCollapsed ? "Expand navigation" : "Collapse navigation"}
                style={{
                    position: "fixed",
                    left: navCollapsed ? 16 : "calc(clamp(200px, 22vw, 300px) - 42px)",
                    top: 16,
                    zIndex: 300,
                    transition: "left 200ms ease",
                }}
            />
        </>
    );
}

/* ---------- Desktop branch: custom three-column layout with resizable borders ---------- */

function DesktopShell({
    children,
    aside,
    navCollapsed,
    toggleNav,
    drawerOpened,
    closeDrawer,
}: {
    children: React.ReactNode;
    aside: React.ReactNode;
    navCollapsed: boolean;
    toggleNav: () => void;
    drawerOpened: boolean;
    closeDrawer: () => void;
}) {
    const { widths, setCenterWidth, setRelatedWidth } = useResizableColumns();

    // Resolve actual nav width by measuring the rendered nav element (clamp(200px, 22vw, 300px)).
    const navRef = useRef<HTMLDivElement | null>(null);
    const [navW, setNavW] = useState<number>(260); // fallback before measurement
    useLayoutEffect(() => {
        const el = navRef.current;
        if (!el) return;
        const measure = () => {
            const w = el.getBoundingClientRect().width;
            if (w > 0) setNavW(w);
        };
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    // Viewport width for clamping centerWidth.
    const [viewportW, setViewportW] = useState<number>(() =>
        typeof window === "undefined" ? 1440 : window.innerWidth
    );
    useEffect(() => {
        const onResize = () => setViewportW(window.innerWidth);
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, []);

    // Effective values used for layout (defaults applied when state is undefined).
    const effectiveNavW = navCollapsed ? 0 : navW;
    const effectiveRelatedW = widths.relatedWidth ?? DEFAULT_RELATED;
    const viewportCenterMax = viewportW - 2 * Math.max(effectiveNavW, effectiveRelatedW);
    const defaultCenter = Math.max(
        CENTER_MIN,
        Math.min(900, viewportCenterMax > 0 ? viewportCenterMax : 900)
    );
    const effectiveCenterW = Math.max(
        CENTER_MIN,
        Math.min(
            widths.centerWidth ?? defaultCenter,
            Math.min(CENTER_MAX, viewportCenterMax > 0 ? viewportCenterMax : CENTER_MAX)
        )
    );

    // Handlers: borders B/C resize center symmetrically; border D resizes related.
    const onBorderB = (delta: number) => {
        setCenterWidth(effectiveCenterW - 2 * delta, viewportCenterMax);
    };
    const onBorderC = (delta: number) => {
        setCenterWidth(effectiveCenterW + 2 * delta, viewportCenterMax);
    };
    const onBorderD = (delta: number) => {
        setRelatedWidth(effectiveRelatedW + delta);
    };

    const resetCenter = () => setCenterWidth(undefined);
    const resetRelated = () => setRelatedWidth(undefined);

    // Position formulas (in viewport coordinates). Using calc() with CSS vars lets the browser
    // do the math on each frame without React re-rendering the columns.
    const wrapperStyle = useMemo(
        () =>
            ({
                "--center-w": `${effectiveCenterW}px`,
                "--related-w": `${effectiveRelatedW}px`,
                "--nav-w": `${effectiveNavW}px`,
            }) as React.CSSProperties,
        [effectiveCenterW, effectiveRelatedW, effectiveNavW]
    );

    return (
        <div style={{ ...wrapperStyle, position: "relative", minHeight: "100vh" }}>
            {/* Nav column (anchored to left edge of center column) */}
            <div
                ref={navRef}
                style={{
                    position: "fixed",
                    top: 0,
                    bottom: 0,
                    left: "calc(50vw - var(--center-w) / 2 - var(--nav-w))",
                    width: "clamp(200px, 22vw, 300px)",
                    backgroundColor: "#FCFBF5",
                    padding: 16,
                    overflow: "hidden",
                    opacity: navCollapsed ? 0 : 1,
                    pointerEvents: navCollapsed ? "none" : "auto",
                    transition: "opacity 200ms ease",
                    zIndex: 100,
                }}
            >
                <Navbar />
            </div>

            {/* Center column (flow content) */}
            <div
                style={{
                    position: "relative",
                    marginLeft: "calc(50vw - var(--center-w) / 2)",
                    width: "var(--center-w)",
                    minWidth: CENTER_MIN,
                    padding: 16,
                    minHeight: "100vh",
                }}
            >
                {children}
            </div>

            {/* Related column (anchored to right edge of center column) */}
            <div
                style={{
                    position: "fixed",
                    top: 0,
                    bottom: 0,
                    left: "calc(50vw + var(--center-w) / 2)",
                    width: "var(--related-w)",
                    backgroundColor: "#FCFBF5",
                    borderLeft: "1px solid rgba(0,0,0,0.08)",
                    overflowY: "auto",
                    overscrollBehavior: "contain",
                    scrollbarWidth: "none",
                    padding: 16,
                    paddingTop: 0,
                    zIndex: 100,
                }}
            >
                {aside ?? null}
            </div>

            {/* Border B: left edge of center column */}
            <ResizableDivider
                ariaLabel="Resize center column (left edge)"
                onResize={onBorderB}
                onDoubleClick={resetCenter}
                style={{ left: "calc(50vw - var(--center-w) / 2)", position: "fixed" }}
            />

            {/* Border C: right edge of center column */}
            <ResizableDivider
                ariaLabel="Resize center column (right edge)"
                onResize={onBorderC}
                onDoubleClick={resetCenter}
                style={{ left: "calc(50vw + var(--center-w) / 2)", position: "fixed" }}
            />

            {/* Border D: right edge of related column */}
            <ResizableDivider
                ariaLabel="Resize related column"
                onResize={onBorderD}
                onDoubleClick={resetRelated}
                style={{ left: "calc(50vw + var(--center-w) / 2 + var(--related-w))", position: "fixed" }}
            />

            {/* Burger for nav collapse */}
            <Burger
                opened={!navCollapsed}
                onClick={toggleNav}
                size="sm"
                aria-label={navCollapsed ? "Expand navigation" : "Collapse navigation"}
                style={{
                    position: "fixed",
                    left: navCollapsed
                        ? 16
                        : "calc(50vw - var(--center-w) / 2 - var(--nav-w) + 16px)",
                    top: 16,
                    zIndex: 300,
                    transition: "left 200ms ease",
                }}
            />

            {/* Mobile drawer not used at lg+, but kept here in case user shrinks window mid-session */}
            <Drawer
                opened={drawerOpened}
                onClose={closeDrawer}
                padding="md"
                size="xs"
                styles={{
                    content: { backgroundColor: "#FCFBF5" },
                    header: { backgroundColor: "#FCFBF5" },
                }}
                lockScroll={false}
            >
                <Navbar />
            </Drawer>
        </div>
    );
}
```

- [ ] **Step 3: Verify it compiles**

Run: `pnpm exec tsc --noEmit`
Expected: no new errors. If `tsc` complains about missing types from `@mantine/hooks` for `useMediaQuery` or `useDisclosure`, confirm `@mantine/hooks` is in `package.json` (it should be).

- [ ] **Step 4: Start the dev server**

Run: `pnpm dev`
Expected: Next.js starts on `http://localhost:3000` without errors.

- [ ] **Step 5: Manual verification in a browser ≥ 1200px wide**

Open `http://localhost:3000`. Sign in if needed and navigate to `/home`. Confirm:

1. **Layout looks correct:** nav on left, center column in the middle of the viewport, related column on right, gutters on both sides.
2. **Center is centered:** the horizontal midpoint of the center column matches the viewport's horizontal midpoint (use the browser ruler or eyeball it against the URL bar).
3. **Border B (left edge of center) drags:** hover over the line between nav and center — cursor becomes `col-resize`, line thickens. Drag right — center shrinks symmetrically (you see related slide left too). Drag left — center grows symmetrically (related slides right).
4. **Border C (right edge of center) drags:** same as above, mirrored. Dragging right grows center; dragging left shrinks it.
5. **Border D (right edge of related) drags:** drag right — related grows. Drag left — related shrinks.
6. **Min/max bounds:** keep dragging in one direction; the column stops at its limit (center: 500–1100, related: 320–700).
7. **Double-click any divider:** that column resets to default.
8. **Reload the page:** non-default widths persist.
9. **Burger toggle:** click the burger at top-left; navbar fades and slides out, `--nav-w` becomes 0, center stays centered.

- [ ] **Step 6: Manual verification at < 1200px (mobile/tablet)**

Resize the browser to ~1100px wide.

1. **Layout switches:** the custom desktop layout disappears; the original AppShell layout takes over (navbar at left, no related aside, no resize affordance).
2. **No console errors during the transition.**
3. **Below ~768px (sm):** mobile header with burger and logo appears; aside is hidden; clicking burger opens drawer with nav.

- [ ] **Step 7: Commit**

```bash
git add src/app/\(shell\)/Shell.tsx
git commit -m "Add desktop custom three-column layout with resizable borders"
```

---

## Task 5: Verify against the spec's manual test checklist

This is a final sweep against the spec's `Testing (manual)` section to catch anything missed.

- [ ] **Step 1: Open `docs/superpowers/specs/2026-05-13-resizable-shell-columns-design.md`, find the Testing section, and run each numbered item against the dev server.**

The spec has 10 checks. Confirm each one. Pay special attention to:
- **#4:** center midpoint stays on viewport center across all drags.
- **#7:** narrow the viewport to a point where the saved center width no longer fits — center should clamp down. Widen again — center should grow back to its saved value.
- **#9:** burger collapse with various saved center widths — no jank.

- [ ] **Step 2: If any check fails, fix the underlying issue in `Shell.tsx` or the hook. Commit each fix as a separate commit referencing what was broken.**

- [ ] **Step 3: Stop the dev server (Ctrl-C).**

---

## Task 6: Open PR against the listy-injection-main-app branch

**Note:** The user's branching convention (per `CLAUDE.md` and `.claude/rules/`) targets the team's collaborative feature branch, not `dev`.

- [ ] **Step 1: Confirm branch state is clean**

Run: `git status`
Expected: working tree clean.

Run: `git log --oneline tarcode2004/enhancement/listy-injection-main-app..HEAD`
Expected: lists the commits added by this plan (5–6 commits).

- [ ] **Step 2: Push the branch**

Run: `git push -u origin claude/suspicious-bhabha-7d24ed`
Expected: branch pushed.

- [ ] **Step 3: Open the PR with `gh`**

The repo follows `Closes #<number>` convention, but no issue is associated with this work yet — omit that footer or ask the user before opening if they want an issue number.

Run:
```bash
gh pr create \
  --base tarcode2004/enhancement/listy-injection-main-app \
  --title "Add resizable center and related shell columns" \
  --body "$(cat <<'EOF'
## Summary
- Center column is now pinned to viewport center; nav and related float to its sides.
- Three draggable borders: left and right of center (symmetric, both adjust centerWidth) and right of related (adjusts relatedWidth).
- Widths persist in localStorage. Double-click a divider to reset that column.
- Active at `lg+` (≥1200px). Below `lg`, the existing AppShell mobile/tablet layout is preserved unchanged.

## Spec
docs/superpowers/specs/2026-05-13-resizable-shell-columns-design.md

## Plan
docs/superpowers/plans/2026-05-13-resizable-shell-columns.md

## Test plan
- [ ] Center column visually centered on viewport at ≥1200px
- [ ] All three borders show col-resize cursor on hover
- [ ] Border B (left of center) and Border C (right of center) both resize center symmetrically; opposite border mirrors in real time
- [ ] Border D resizes related independently
- [ ] Min/max bounds enforced (center: 500–1100, related: 320–700)
- [ ] Widths persist across reload
- [ ] Double-click resets that column to default
- [ ] Burger collapse still works (nav slides out; center stays centered)
- [ ] Below 1200px reverts to original AppShell layout
EOF
)"
```

Expected: PR URL printed.

- [ ] **Step 4: Share the PR URL with the user.**

---

## Self-review notes (for the implementer)

This plan was self-reviewed before publication:

- **Spec coverage:** All 7 goals in the spec map to tasks 1–4. Both bounds (static and viewport-derived) are enforced in Task 1 + Task 4. Drag geometry (symmetric for center) is implemented in Task 4 (`onBorderB`/`onBorderC` apply `±2*delta`).
- **Placeholders:** none — every code step has full code.
- **Type consistency:** `useResizableColumns` exports `CENTER_MIN/MAX`, `RELATED_MIN/MAX`, `DEFAULT_RELATED`. Task 4 imports those exact names. The hook returns `widths` (object with `centerWidth`/`relatedWidth`) and Task 4 destructures it with those names.
- **Known soft spot:** the viewport-derived center bound depends on `navW` which is measured asynchronously via `ResizeObserver`. On the first paint, `navW = 260` (fallback) — the real measurement may shift bounds slightly. This is acceptable for an initial implementation; tighten only if it causes visible jumps.
