# Group B — Tooltip & Label Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the per-render `SeeMoreTooltip` in `RelatedStacks.tsx` with a single global cursor-following tooltip primitive, apply the new "N more **Topic**" format in the tooltip and the show-more-link button, and hide both when the topic is missing (with a diagnostic warning).

**Architecture:** A new `HoverTooltip` primitive renders into a `document.body` portal and is driven by an imperative `showTooltip` / `hideTooltip` API backed by a tiny module-level store. The single mounted instance lives in `Shell.tsx`. Existing `<mark>` handlers in `RelatedStacks.tsx` call the imperative API instead of rendering inline tooltip JSX.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript, Mantine v7, `react-dom`'s `createPortal`. No new dependencies. No test framework available — verification is `pnpm lint`, `pnpm build` (`tsc`), and manual browser walk-through.

**Spec:** [docs/superpowers/specs/2026-05-13-group-b-tooltip-and-label-design.md](../specs/2026-05-13-group-b-tooltip-and-label-design.md) (commit `19dc10c`).

**Branch:** `claude/unruffled-einstein-13834c` (current worktree).

---

## File Structure

| Path | Action | Responsibility |
|---|---|---|
| `src/components/HoverTooltip.tsx` | **Create** | Single-instance portal-mounted tooltip + imperative `showTooltip` / `hideTooltip` + internal store. |
| `src/app/(shell)/Shell.tsx` | Modify | Mount `<HoverTooltip />` once at the shell root so the portal target exists for all authenticated routes. |
| `src/components/RelatedStacks.tsx` | Modify | Replace `SeeMoreTooltip` rendering with `showTooltip`/`hideTooltip` calls inside existing `<mark>` handlers; apply bold + category-color format; gate `showMoreLink` and tooltip on `!!anchorTopic`; add missing-topic warning helper. |

No other files touched. No new dependencies.

---

## Task 1: Create the `HoverTooltip` primitive

**Files:**
- Create: `src/components/HoverTooltip.tsx`

- [ ] **Step 1.1: Create the file with the complete primitive**

Write `src/components/HoverTooltip.tsx`:

```tsx
"use client";

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface TooltipColors {
  text: string;
  border: string;
}

interface TooltipState {
  visible: boolean;
  content: React.ReactNode;
  colors: TooltipColors;
  initialX: number;
  initialY: number;
}

const DEFAULT_COLORS: TooltipColors = { text: "#334155", border: "#cbd5e1" };

const initialState: TooltipState = {
  visible: false,
  content: null,
  colors: DEFAULT_COLORS,
  initialX: -9999,
  initialY: -9999,
};

type Listener = (state: TooltipState) => void;

const listeners = new Set<Listener>();
let currentState: TooltipState = initialState;

function setState(partial: Partial<TooltipState>) {
  currentState = { ...currentState, ...partial };
  listeners.forEach((l) => l(currentState));
}

export function showTooltip(opts: {
  content: React.ReactNode;
  colors: TooltipColors;
  x: number;
  y: number;
}): void {
  setState({
    visible: true,
    content: opts.content,
    colors: opts.colors,
    initialX: opts.x,
    initialY: opts.y,
  });
}

export function hideTooltip(): void {
  setState({ visible: false, content: null });
}

export function HoverTooltip(): JSX.Element | null {
  const [state, setLocalState] = useState<TooltipState>(currentState);
  const nodeRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const listener: Listener = (s) => setLocalState(s);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  // Position on initial show + continuous follow while visible.
  useEffect(() => {
    if (!state.visible) return;

    const position = (clientX: number, clientY: number) => {
      const el = nodeRef.current;
      if (!el) return;
      const tw = el.offsetWidth;
      const th = el.offsetHeight;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const offsetX = 14;
      const offsetY = 18;
      let x = clientX + offsetX;
      let y = clientY + offsetY;
      if (x + tw > vw - 8) x = vw - tw - 8;
      if (x < 8) x = 8;
      if (y + th > vh - 8) y = clientY - offsetY - th;
      if (y < 8) y = 8;
      el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    };

    // Position once with the cursor location captured at show time.
    position(state.initialX, state.initialY);

    const onMove = (e: MouseEvent) => position(e.clientX, e.clientY);
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, [state.visible, state.initialX, state.initialY]);

  if (typeof document === "undefined") return null;
  if (!state.visible) return null;

  return createPortal(
    <div
      ref={nodeRef}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        transform: "translate3d(-9999px, -9999px, 0)",
        pointerEvents: "none",
        zIndex: 10000,
        background: "rgba(255,255,255,0.92)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        borderRadius: 8,
        padding: "4px 10px",
        boxShadow:
          "0 4px 14px rgba(0,0,0,0.10), 0 1px 2px rgba(0,0,0,0.05)",
        border: `1px solid ${state.colors.border}55`,
        fontSize: 11,
        fontWeight: 600,
        color: state.colors.text,
        whiteSpace: "nowrap",
      }}
    >
      {state.content}
    </div>,
    document.body,
  );
}
```

- [ ] **Step 1.2: Verify the file type-checks**

Run: `pnpm build`
Expected: build completes without errors. The new file should not be referenced anywhere yet, so this only confirms its own types are valid. If `pnpm build` is slow, you can run `pnpm exec tsc --noEmit -p .` for a faster type-only check.

- [ ] **Step 1.3: Commit**

```bash
git add src/components/HoverTooltip.tsx
git commit -m "Add HoverTooltip primitive for cursor-following tooltips"
```

---

## Task 2: Mount `<HoverTooltip />` in the shell

**Files:**
- Modify: `src/app/(shell)/Shell.tsx`

- [ ] **Step 2.1: Add the import**

In `src/app/(shell)/Shell.tsx`, add this import alongside the existing component imports (after the `RelatedStacksProvider` import on line 8):

```tsx
import { HoverTooltip } from '../../components/HoverTooltip';
```

- [ ] **Step 2.2: Render the tooltip once inside the provider**

In `src/app/(shell)/Shell.tsx`, find the line `</AppShell>` (line 77) and add `<HoverTooltip />` immediately after it (still inside `<RelatedStacksProvider>`). The relevant region becomes:

```tsx
            <AppShell.Main miw={500}>
                {children}
            </AppShell.Main>
        </AppShell>
        <HoverTooltip />
        <Burger
            opened={!navCollapsed}
            onClick={toggleNav}
```

(Placement is after `</AppShell>` but before the existing fixed `<Burger>`; both are siblings of the AppShell and live inside `RelatedStacksProvider`.)

- [ ] **Step 2.3: Verify build and lint pass**

Run: `pnpm build && pnpm lint`
Expected: both succeed. No visible change in the browser yet — nothing calls `showTooltip`.

- [ ] **Step 2.4: Manual sanity check that nothing regressed**

Run `pnpm dev`. Open `http://localhost:3000`, sign in if needed, navigate to a post-detail page (`/posts/[id]`) so the related panel is visible. Confirm:
- The page loads.
- Hovering related-post highlights still shows the **old** floating tooltip (since `RelatedStacks.tsx` still renders `SeeMoreTooltip` inline; nothing was migrated yet).
- No console errors.

This catches a broken mount before any behavioral changes are mixed in.

- [ ] **Step 2.5: Commit**

```bash
git add src/app/\(shell\)/Shell.tsx
git commit -m "Mount HoverTooltip at shell root"
```

---

## Task 3: Add the missing-topic warning helper and a topic-label renderer in `RelatedStacks.tsx`

**Files:**
- Modify: `src/components/RelatedStacks.tsx`

This task only adds new helpers — it does not yet touch the existing tooltip render or button text. Keeping the helpers as a separate commit makes the migration commit (Task 4) read cleanly.

- [ ] **Step 3.1: Add the imports at the top of `RelatedStacks.tsx`**

Find the existing imports at the top of `src/components/RelatedStacks.tsx` and add this import alongside them:

```tsx
import { showTooltip, hideTooltip, type TooltipColors } from './HoverTooltip';
```

- [ ] **Step 3.2: Add module-level helpers above the `SeeMoreTooltip` definition**

Insert the following block immediately before the existing `// ─── Passive "See more like this" tooltip` comment block (which currently starts at line 109):

```tsx
// ─── Missing-topic diagnostic (rate-limited) ─────────────────────────────────
// Surface data-integrity issues (relations with no `topic`) in study logs
// without spamming the console. One warning per (stackId, rangeIndex) pair
// per session; the tooltip and "X more" button are suppressed in that case.
const warnedMissingTopic = new Set<string>();
function warnMissingTopic(stackId: string, rangeIndex: number): void {
  const key = `${stackId}:${rangeIndex}`;
  if (warnedMissingTopic.has(key)) return;
  warnedMissingTopic.add(key);
  // eslint-disable-next-line no-console
  console.warn(
    '[stacky] missing topic on relation; tooltip/button suppressed',
    { stackId, rangeIndex },
  );
}

// ─── Tooltip label renderer ───────────────────────────────────────────────────
// "N more <Topic>" with the topic bolded in the category color. Returns null
// when topic is absent, so callers can short-circuit without rendering.
function buildTooltipLabel(
  topic: string | undefined,
  otherCount: number | undefined,
  textColor: string,
): React.ReactNode | null {
  if (!topic) return null;
  const count = otherCount ?? 0;
  return (
    <>
      {count} more <strong style={{ color: textColor }}>{topic}</strong>
    </>
  );
}
```

- [ ] **Step 3.3: Verify build and lint pass**

Run: `pnpm build && pnpm lint`
Expected: both succeed. The helpers exist but are not yet called, so they should not change any behavior. If `tsc` complains the helpers are unused, that's fine — they will be wired in Task 4. ESLint may flag the unused functions; if the project's ESLint config errors on `no-unused-vars` at the build step, temporarily proceed without the lint gate here and re-run it after Task 4 wires them up.

- [ ] **Step 3.4: Commit**

```bash
git add src/components/RelatedStacks.tsx
git commit -m "Add missing-topic warning and tooltip label helpers"
```

---

## Task 4: Migrate the highlight tooltip to `HoverTooltip` and remove `SeeMoreTooltip`

**Files:**
- Modify: `src/components/RelatedStacks.tsx`

This is the behavioral change for the highlight-hover tooltip. After this task, hovering a `<mark>` in a related-post card produces a single cursor-following tooltip via the new primitive.

- [ ] **Step 4.1: Pass `stackId` into `buildMultiHighlightNodes` so the warning helper has context**

The existing `buildMultiHighlightNodes` signature is (lines 227-242 of the current file):

```tsx
function buildMultiHighlightNodes(
  plain: string,
  relations: Relation[] | undefined,
  primaryColors: CategoryStyle,
  opts: {
    isCardHovered: boolean;
    anyCardHovered: boolean;
    hoveredRangeIndex: number | null;
    hoveredCategory: string | null;
    anchoredRangeIndex: number | null;
    onRangeHover: (index: number | null) => void;
    onRangeClick?: (index: number) => void;
    /** topic → number of OTHER posts (excluding current) that share this topic */
    otherCountByTopic?: (topic: string) => number;
  },
): React.ReactNode[]
```

Add `stackId: string` to `opts`. Update the call site at line ~1011 (search for `const contentNodes = buildMultiHighlightNodes(`) to pass `stackId: stack.stackId`. Use the variable name already in scope at that call site — confirm by reading 5-10 lines above the call.

- [ ] **Step 4.2: Replace the overlap-segment inline tooltip render with imperative calls**

In `src/components/RelatedStacks.tsx`, lines 343-353 currently render the overlap tooltip:

```tsx
{hoveredBandContributor && !tooltipRendered.has(hoveredBandContributor.rangeIndex) && (() => {
  tooltipRendered.add(hoveredBandContributor.rangeIndex);
  const topic = hoveredBandContributor.topic;
  return (
    <SeeMoreTooltip
      topic={topic}
      otherCount={topic && opts.otherCountByTopic ? opts.otherCountByTopic(topic) : undefined}
      categoryColors={getCategoryColors(hoveredBandContributor.category)}
    />
  );
})()}
```

Remove this entire block (and the wrapping `<span>` is fine to keep around the `<mark>`; only delete the conditional tooltip JSX).

Then update the existing `overlapHover` helper (currently at lines 304-309) to also drive the tooltip. The replacement reads:

```tsx
const overlapHover = (clientX: number, clientY: number, currentTarget: HTMLElement) => {
  const rect = currentTarget.getBoundingClientRect();
  const rel = (clientY - rect.top) / rect.height;
  const bandIdx = Math.max(0, Math.min(cats.length - 1, Math.floor(rel * cats.length)));
  const band = cats[bandIdx];
  opts.onRangeHover(band.rangeIndex);

  if (!band.topic) {
    warnMissingTopic(opts.stackId, band.rangeIndex);
    hideTooltip();
    return;
  }
  const count = opts.otherCountByTopic ? opts.otherCountByTopic(band.topic) : undefined;
  const colors: TooltipColors = { text: band.colors.text, border: band.colors.border };
  showTooltip({
    content: buildTooltipLabel(band.topic, count, band.colors.text),
    colors,
    x: clientX,
    y: clientY,
  });
};
```

Note `clientX` is now also passed in. Update the three call sites (lines 316, 318, and the `onClick` at 320-329 — only the move/hover ones; `onClick` does not call `overlapHover`):

- `onMouseMove={(e) => overlapHover(e.clientX, e.clientY, e.currentTarget as HTMLElement)}`
- `onPointerMove={(e) => { if (e.pointerType === 'mouse') overlapHover(e.clientX, e.clientY, e.currentTarget as HTMLElement); }}`

Update the leave handlers (lines 317 and 319) to also hide the tooltip:

- `onMouseLeave={() => { opts.onRangeHover(null); hideTooltip(); }}`
- `onPointerLeave={(e) => { if (e.pointerType === 'mouse') { opts.onRangeHover(null); hideTooltip(); } }}`

- [ ] **Step 4.3: Replace the single-contributor segment inline tooltip render with imperative calls**

In `src/components/RelatedStacks.tsx`, lines 428-435 currently render the single-contributor tooltip (verify exact bounds — the rendering uses an IIFE similar to the overlap case). Remove the entire `{isThisRangeHovered && !tooltipRendered.has(c.rangeIndex) && (() => { ... })()}` block.

Then add a tooltip-driving variant to the `<mark>` handlers in the single-contributor branch. The existing handlers (lines 406-414) are:

```tsx
onMouseEnter={() => opts.onRangeHover(c.rangeIndex)}
onMouseLeave={() => opts.onRangeHover(null)}
onPointerEnter={(e) => { if (e.pointerType === 'mouse') opts.onRangeHover(c.rangeIndex); }}
onPointerLeave={(e) => { if (e.pointerType === 'mouse') opts.onRangeHover(null); }}
onClick={(e) => { ... }}
```

Replace them with:

```tsx
onMouseEnter={(e) => {
  opts.onRangeHover(c.rangeIndex);
  if (!c.topic) {
    warnMissingTopic(opts.stackId, c.rangeIndex);
    hideTooltip();
    return;
  }
  const count = opts.otherCountByTopic ? opts.otherCountByTopic(c.topic) : undefined;
  showTooltip({
    content: buildTooltipLabel(c.topic, count, colors.text),
    colors: { text: colors.text, border: colors.border },
    x: e.clientX,
    y: e.clientY,
  });
}}
onMouseLeave={() => { opts.onRangeHover(null); hideTooltip(); }}
onPointerEnter={(e) => {
  if (e.pointerType !== 'mouse') return;
  opts.onRangeHover(c.rangeIndex);
  if (!c.topic) {
    warnMissingTopic(opts.stackId, c.rangeIndex);
    hideTooltip();
    return;
  }
  const count = opts.otherCountByTopic ? opts.otherCountByTopic(c.topic) : undefined;
  showTooltip({
    content: buildTooltipLabel(c.topic, count, colors.text),
    colors: { text: colors.text, border: colors.border },
    x: e.clientX,
    y: e.clientY,
  });
}}
onPointerLeave={(e) => { if (e.pointerType === 'mouse') { opts.onRangeHover(null); hideTooltip(); } }}
onClick={(e) => {
  if (!opts.onRangeClick) return;
  e.stopPropagation();
  (e.currentTarget as HTMLElement).blur();
  opts.onRangeClick(c.rangeIndex);
}}
```

- [ ] **Step 4.4: Delete the now-unused `SeeMoreTooltip` component and the `tooltipRendered` Set**

Delete lines 109-158 (the `SeeMoreTooltip` function and its comment header). Delete the `const tooltipRendered = new Set<number>();` line (currently line 265) and the comment block immediately above it (lines 263-264). After this, no callers reference `SeeMoreTooltip` and no callers reference `tooltipRendered`.

- [ ] **Step 4.5: Verify build and lint pass**

Run: `pnpm build && pnpm lint`
Expected: both succeed. Any `unused variable` warnings for `SeeMoreTooltip` should disappear because the function is deleted. If `tsc` errors about a missing `stackId` field, double-check that Step 4.1 was applied at the call site.

- [ ] **Step 4.6: Manual verification of highlight-hover behavior**

Run `pnpm dev` and walk through:

| Check | Expected |
|---|---|
| Hover a single-category highlight inside a related card | One tooltip appears at cursor + (14, 18). Content: `N more <Topic>` with topic bolded and tinted with the category color. |
| Move cursor while still on the highlight | Tooltip follows continuously, smoothly, with no judder. |
| Move cursor away from the highlight | Tooltip disappears. |
| Hover an overlap region (two stripes) | Tooltip content changes as cursor moves between bands, reflecting the topic of the band under the cursor. |
| Hover near the right viewport edge | Tooltip clamps to viewport. |
| Hover near the bottom of the viewport | Tooltip flips above the cursor instead of overflowing. |
| Inspect DOM in DevTools while hovering | Exactly one tooltip node exists at any time (a child of `<body>`). |
| Test with a relation whose `topic` is undefined | No tooltip. `console.warn("[stacky] missing topic ...")` fires once. Second hover of the same range does not re-warn. (Reproduce by editing `src/app/FakeData/mock_related_stacks.json` to clear one `topic` field, OR by adding a temporary `topic = undefined` override in the dev console; revert after.) |

- [ ] **Step 4.7: Commit**

```bash
git add src/components/RelatedStacks.tsx
git commit -m "Migrate related-panel tooltip to single cursor-following primitive"
```

---

## Task 5: Apply the new format and missing-topic gate to the "X more" button

**Files:**
- Modify: `src/components/RelatedStacks.tsx`

The show-more-link button at the bottom of a group renders its own text (`{groupRemaining} more {anchorTopic ?? 'related'}`). With the new format and missing-topic policy, this needs two adjustments.

- [ ] **Step 5.1: Gate `showMoreLink` on a present topic**

In `src/components/RelatedStacks.tsx`, find the existing condition at line ~1070:

```tsx
const showMoreLink = isClaim && isLastInGroup && groupRemaining > 0;
```

Replace with:

```tsx
const showMoreLink = isClaim && isLastInGroup && groupRemaining > 0 && !!anchorTopic;
```

Also add a missing-topic warning when the button would otherwise have rendered. Immediately above the new line, add:

```tsx
if (isClaim && isLastInGroup && groupRemaining > 0 && !anchorTopic && anchorForThisCard) {
  warnMissingTopic(anchorForThisCard, anchorRangeIdx ?? -1);
}
```

(`anchorForThisCard` is the anchor stack id; `anchorRangeIdx` is in scope from the surrounding loop — confirm both are still in scope by reading 30 lines above the gate.)

- [ ] **Step 5.2: Apply the bold + category color format to the button label**

In `src/components/RelatedStacks.tsx`, the button label is at line ~1104:

```tsx
{groupRemaining} more {anchorTopic ?? 'related'}
```

Because the gate now guarantees `anchorTopic` is truthy when this renders, replace with:

```tsx
{groupRemaining} more <strong style={{ color: anchorColors.text }}>{anchorTopic}</strong>
```

- [ ] **Step 5.3: Verify build and lint pass**

Run: `pnpm build && pnpm lint`
Expected: both succeed.

- [ ] **Step 5.4: Manual verification of button behavior**

Run `pnpm dev` and walk through:

| Check | Expected |
|---|---|
| Group with `groupRemaining > 0` and a topic | Button shows `N more `**`<Topic>`** with the topic bolded in the anchor's category color. |
| Group with `groupRemaining > 0` but `anchorTopic` missing | Button does NOT render. `console.warn` fires once. The connector line stub above the button (the `<div aria-hidden>` at lines 1086-1094 of the original file, contained in the same outer `<div>`) also doesn't render because the whole `moreEl` block is gated. |
| Click the button | Pagination still works (`handleShowMore` runs). |

- [ ] **Step 5.5: Commit**

```bash
git add src/components/RelatedStacks.tsx
git commit -m "Format show-more-link as bold topic and hide when topic missing"
```

---

## Task 6: End-to-end verification against the spec

**Files:** none modified — verification only.

- [ ] **Step 6.1: Re-run lint and build cleanly**

```bash
pnpm lint
pnpm build
```

Both should pass. If either reports warnings introduced by Tasks 1-5, fix them before proceeding.

- [ ] **Step 6.2: Walk through the spec's verification checklist**

From [docs/superpowers/specs/2026-05-13-group-b-tooltip-and-label-design.md § 7](../specs/2026-05-13-group-b-tooltip-and-label-design.md), confirm each row:

- [ ] Hover a highlighted span in a related card → exactly one tooltip node in the DOM; content `N more <Topic>`.
- [ ] Hover the show-more-link button → no second tooltip near the button; the button's own bold-topic text is sufficient.
- [ ] Hover the topic chip at the top of a group → no second tooltip near the chip (the chip already shows the topic).
- [ ] Move cursor across viewport while a tooltip is open → tooltip follows smoothly; clamps near right edge; flips above cursor near bottom edge.
- [ ] Hover a relation whose `otherCount` is 0 → tooltip reads `0 more <Topic>`.
- [ ] Hover a relation whose `topic` is undefined → no tooltip, no button; one `console.warn` per (stackId, rangeIndex) per session.

- [ ] **Step 6.3: If any check fails, fix the smallest possible diff and re-verify before committing**

For each failure, identify the root cause (rather than papering over with another conditional). Common likely failures and where to look:
- Tooltip appears in two places after Task 4 → check that the `SeeMoreTooltip` deletion in Step 4.4 was complete, and there is no other call site outside the two render sites in `buildMultiHighlightNodes`.
- Tooltip lingers after `mouseleave` → ensure both `onMouseLeave` *and* `onPointerLeave` call `hideTooltip()` (Step 4.2 and 4.3).
- Tooltip doesn't follow → ensure the `useEffect` in Task 1 correctly attaches `mousemove` only while `state.visible`.

Commit any fix:

```bash
git add src/components/RelatedStacks.tsx src/components/HoverTooltip.tsx
git commit -m "<one-line summary of the fix>"
```

- [ ] **Step 6.4: Confirm final git log shows the expected sequence**

```bash
git log --oneline -7
```

Expected (in reverse chronological order, after `19dc10c`):

```
<sha> Format show-more-link as bold topic and hide when topic missing
<sha> Migrate related-panel tooltip to single cursor-following primitive
<sha> Add missing-topic warning and tooltip label helpers
<sha> Mount HoverTooltip at shell root
<sha> Add HoverTooltip primitive for cursor-following tooltips
19dc10c Add Group B design spec for tooltip and label polish
```

(If verification fixes were needed in Step 6.3, an extra commit at the top is expected.)

---

## Self-Review Notes

**Spec coverage:**
- §5.1 Single cursor-following tooltip → Tasks 1, 2, 4.
- §5.2 "X more Topic" format (tooltip) → Tasks 3, 4 (via `buildTooltipLabel`).
- §5.2 "X more Topic" format (button) → Task 5.
- §5.3 Hide tooltip when topic missing → Task 4 (overlap and single-contributor branches).
- §5.3 Hide button when topic missing → Task 5.
- §5.3 Diagnostic warning → Task 3 (helper) + Tasks 4 and 5 (call sites).
- §6 Files touched → matches `HoverTooltip.tsx`, `Shell.tsx`, `RelatedStacks.tsx`.
- §7 Verification → Task 6.

**Type-consistency:** `TooltipColors` interface defined in Task 1, imported in Task 3, used in Task 4 — names and shapes match. `showTooltip` / `hideTooltip` signatures referenced in Task 4 match the export shapes in Task 1.

**Placeholder scan:** no `TBD`, `TODO`, "implement later", or vague "handle edge cases" left in any task.

**Bite-size:** each step is a single concrete edit, a single command, or a single verification — typically 2-5 minutes.
