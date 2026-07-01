# Group B — Tooltip & Label Polish (Design Spec)

**Date:** 2026-05-13
**Status:** Approved by user; ready for implementation plan.
**Scope:** Polish pass on the related-panel tooltip and the "X more Topic" label format. One sub-project in the broader B → C → D → E → F → G → I → H roadmap.
**Owner:** tarcode2004
**Approach selected:** Surgical patch (Approach 1 of 3 considered).

---

## 1. Problem

Three issues in the related panel:

1. **Duplicate tooltip.** When the user hovers a tag inside a related-post group, the "`3 more Trial Results`" tooltip appears in two places at once — one near the tag, one over the highlighted span. The tooltip is also statically positioned above the hovered element rather than following the cursor.
2. **Unclear label format.** The string "`N more <topic>`" reads ambiguously because the topic word is unstyled and indistinguishable from surrounding text; and the empty-state today renders "`Only <topic>`", which feels truncated.
3. **Missing-topic data leakage.** When `topic` is undefined in the relation data, the UI silently substitutes `'related'` (button) or `'See more like this'` (tooltip), hiding a real data-integrity problem.

## 2. Goals

- Exactly one tooltip ever in the DOM, regardless of which element triggered the hover.
- Continuous cursor-following position with viewport clamping.
- Consistent, scannable `"N more <Topic>"` format with the topic visually emphasized.
- Missing-topic cases render *nothing* and log a diagnostic warning, so data-integrity issues are visible in study logs rather than papered over.

## 3. Non-Goals (explicit out-of-scope)

- Any change to the focus post's highlight rendering (`renderMultiHighlightHtml` in [src/components/Posts/Post.tsx](src/components/Posts/Post.tsx)). The focus post uses `<mark>` tags via `dangerouslySetInnerHTML` and renders no tooltip; nothing here touches it.
- Hover-color affordances on filter chips → deferred to **Group C**.
- Highlight-to-filter interaction on the focus post → deferred to **Group D**.
- Related-panel visual redesign (option 3 from the meeting; relation indicator placement) → deferred to **Group F**.
- The simulated-feedback feature on draft replies → deferred to **Group I**.

## 4. Decisions Locked During Brainstorm

| # | Decision | Choice |
|---|---|---|
| Q1 | Cursor-following behavior | **Continuous follow** — position updates on every `mousemove`. |
| Q2 | Topic-name emphasis | **Bold + category color** — `<strong>` styled with `categoryColors.text`. |
| Q3 | Empty-state phrasing | **Literal `"0 more <Topic>"`** — no special-case branch for count = 0. |
| Q4 | Missing-topic behavior | **Hide entirely** — tooltip returns `null`; button does not render; `console.warn` logs the case. |

## 5. Behavior Specification

### 5.1 Single Cursor-Following Tooltip

**Single instance, portal-mounted.** A new module exposes an imperative API:

```ts
showTooltip({ content: React.ReactNode, colors: CategoryStyle }): void
hideTooltip(): void
```

A single `<HoverTooltip />` component, mounted near the app root, subscribes to a small internal store. The DOM contains either one tooltip node or zero — never two.

**Continuous follow.** While a tooltip is active, a global `mousemove` listener is attached to `window`. On each event, position updates via `transform: translate3d(x, y, 0)` (GPU-accelerated; avoids layout thrash from `left`/`top` updates). The listener is removed on `hideTooltip()`.

**Cursor offset.** Default: cursor + (14px right, 18px below). The tooltip's `pointerEvents: 'none'` is preserved so it cannot intercept hovers on elements underneath.

**Viewport clamping (recomputed every move):**
- `x` clamped to `[8, viewportWidth - tooltipWidth - 8]`.
- If `cursorY + 18 + tooltipHeight > viewportHeight - 8`, flip vertically: render above the cursor at `cursorY - 18 - tooltipHeight`.

**Why this beats a `Set`-based dedupe.** The existing `tooltipRendered: Set<number>` in `RelatedStacks.tsx` line 265 is per-render and shared across two render paths (lines 343 and 428). Single-instance portal removes the dedupe concern *structurally* — there is no second render site to coordinate with.

### 5.2 Label Format

The "X more Topic" string appears in two places. Both render with the new JSX shape:

```tsx
<>{count} more <strong style={{ color: colors.text }}>{topic}</strong></>
```

**Tooltip body** ([src/components/RelatedStacks.tsx:111-158](src/components/RelatedStacks.tsx#L111), `SeeMoreTooltip`):
- The current branch at lines 128-132 (`topic ? (otherCount > 0 ? "${n} more ${topic}" : "Only ${topic}") : 'See more like this'`) is replaced.
- New behavior: if `topic` is missing, return `null` (do not render). Otherwise always render `"{otherCount ?? 0} more <strong>{topic}</strong>"`.

**Show-more-link button** ([src/components/RelatedStacks.tsx:1095-1106](src/components/RelatedStacks.tsx#L1095)):
- Same JSX shape inside the existing `<button>`.
- The `?? 'related'` fallback at line 1104 is removed — see § 5.3 for the gating condition.

**Topic chip at the top of the group** ([src/components/RelatedStacks.tsx:1136-1144](src/components/RelatedStacks.tsx#L1136), `labelEl`):
- Unchanged. The chip already renders the topic name with category styling and serves as the group header; it carries no "X more" prefix.

### 5.3 Missing-Topic Behavior

**Tooltip.** `SeeMoreTooltip` (or rather its call site that invokes `showTooltip`) checks `!topic` and short-circuits: no `showTooltip` call is made on hover. If somehow called with `!topic`, the component returns `null`.

**Show-more-link button.** `showMoreLink` condition at [src/components/RelatedStacks.tsx:1070](src/components/RelatedStacks.tsx#L1070) becomes:

```ts
const showMoreLink = isClaim && isLastInGroup && groupRemaining > 0 && !!anchorTopic;
```

When this is false because of missing topic, the entire `<div>` containing the button and its connector-line stub (lines 1077-1107) does not render.

**Diagnostic warning.** On the first encounter of a missing-topic case per session, `console.warn("[stacky] missing topic on relation; tooltip/button suppressed", { stackId, rangeIndex })` fires once. A module-level `Set<string>` tracks already-warned keys so the warning is rate-limited per (`stackId`, `rangeIndex`) pair.

## 6. Files Touched

| File | Action | Approx LOC |
|---|---|---|
| [src/components/HoverTooltip.tsx](src/components/HoverTooltip.tsx) | **New.** Single-instance portal-mounted tooltip + imperative `showTooltip`/`hideTooltip` API + internal store. | ~80 |
| [src/components/RelatedStacks.tsx](src/components/RelatedStacks.tsx) | Modify. Rewrite `SeeMoreTooltip` to call `showTooltip`/`hideTooltip`. Collapse render sites at lines 343 and 428 to a single hover-state effect. Update label JSX at line 1104. Update `showMoreLink` gating at line 1070. Add missing-topic warning helper. Remove the local `tooltipRendered: Set` (no longer needed). | ~50 |
| [src/app/(shell)/Shell.tsx](src/app/\(shell\)/Shell.tsx) | Modify. Mount `<HoverTooltip />` once near the app root so its portal target exists in the tree. | ~3 |

No other files are expected to change. No new dependencies.

**On "surgical" plus a new file.** The selected approach is surgical in scope (no library, no refactor of existing call sites beyond the immediate change), but it does introduce one ~80-LOC primitive file. Rationale: the alternative — adding a global `mousemove` listener inside `SeeMoreTooltip` and relying on a per-render `Set` to deduplicate — is the kind of subtle, hope-it-works fix that drifts back into bugs. A small portal-mounted primitive removes the failure mode structurally. Approved during brainstorm.

## 7. Verification

Manual verification (no test framework in this repo per [CLAUDE.md](CLAUDE.md)):

| Check | Expected |
|---|---|
| Hover a highlighted span inside a related card | Exactly one tooltip node in the DOM (DevTools Elements); content `"N more <Topic>"`. |
| Hover the show-more-link button at the bottom of a group | Same tooltip moves to cursor; no second tooltip appears anywhere. |
| Hover the topic chip at the top of a group | Tooltip near cursor (no second). |
| Move cursor while hovered | Tooltip follows continuously, smooth (no judder). |
| Move cursor near right viewport edge | Tooltip clamps; does not overflow. |
| Move cursor near bottom viewport edge | Tooltip flips above cursor. |
| Hover a group whose `otherCount` is 0 | Tooltip renders `"0 more <Topic>"`. |
| Hover a relation with `topic === undefined` | No tooltip. No "X more" button rendered. `console.warn` once per (stackId, rangeIndex). |
| Run `pnpm lint` and `pnpm build` | Both pass. |

## 8. Risks & Open Questions

- **Mount-site assumption.** `<HoverTooltip />` must be mounted inside the React tree but its portal target is `document.body`. Mounting in [Shell.tsx](src/app/\(shell\)/Shell.tsx) covers all authenticated routes. Unauthenticated routes (`/`, `/callback`) don't render related stacks, so they don't need the tooltip — confirm during implementation that no `RelatedStacks` is rendered outside the shell.
- **Mousemove cost.** A global `mousemove` listener while a tooltip is active is cheap (one `transform` write per event, no React re-render — done imperatively on the DOM node). The listener is removed on `hideTooltip`. If profiling shows jitter, throttle with `requestAnimationFrame`.
- **Aside parallel route.** If the related panel is ever rendered in *both* the main area and `@aside/` simultaneously, the single-instance tooltip still holds because both `RelatedStacks` calls dispatch to the same store. No special handling needed.
- **Duplicate-tooltip root cause not fully diagnosed.** Static analysis didn't isolate which of (dual-render across panels, hover-state race, segment-overlap edge case) is producing the duplicate today. Implementation will diagnose during testing. Design is robust regardless: structural single-instance guarantees the bug cannot recur.

## 9. Next Step

Hand off to the `writing-plans` skill to produce a step-by-step implementation plan.
