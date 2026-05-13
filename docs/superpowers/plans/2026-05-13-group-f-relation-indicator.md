# Group F — Per-Card Relation Indicator (Implementation Plan)

**Date:** 2026-05-13
**Branch:** `tarcode2004/enhancement/group-f-relation-indicator`
**Base:** `tarcode2004/enhancement/group-e-reordering`
**Spec:** `docs/superpowers/specs/2026-05-13-group-f-relation-indicator-design.md`

---

## File Modified

`src/components/RelatedStacks.tsx` — card rendering region only (lines ~1411–1663).

---

## Step-by-Step Plan

### Step 1 — Write spec and plan docs ✓
Files: `docs/superpowers/specs/2026-05-13-group-f-relation-indicator-design.md`, this file.
Commit: `Add Group F design spec and implementation plan`

---

### Step 2 — Remove the existing top-right navigation chevron

**Location:** lines 1569–1571 in `RelatedStacks.tsx`:
```tsx
<div style={{ position: 'absolute', top: '12px', right: '10px', zIndex: 10 }}>
  <IconChevronRight size={14} color="#94a3b8" />
</div>
```

**Action:** Delete this block.

**Rationale:** Per JC #1 — the card has explicit cursor/border affordance; the chevron is redundant and occupies the same corner as the new relation indicator.

**Commit:** `Remove nav-chevron from related card top-right (Group F)`

---

### Step 3 — Add the relation indicator element

**Location:** Inside the `<Paper>` element, after the existing category-tags block (after the closing `</div>` of the tags block at line ~1567) and before `<UnstyledButton>` at line 1573. Specifically, place it as a sibling to the tags div, also `position: absolute`.

**What to insert:**

```tsx
{/* F: Relation indicator — top-right, dominant topic + cluster count */}
{(() => {
  const rels = stack.topPost.relations ?? [];
  if (rels.length === 0) return null;
  const dominantRel = rels[0];
  const dominantTopic = dominantRel.topic;
  if (!dominantTopic) return null;
  const isMultiType = new Set(rels.map(r => r.category)).size > 1;
  const dominantColors = getCategoryColors(dominantRel.category);
  const showColor = !isMultiType || panelHovered;
  const indicatorColor = showColor ? dominantColors.text : '#888888';
  const clusterCount = topicTotal.get(dominantTopic) ?? 0;
  const isCurrentAnchor =
    reRankAnchorIds.length > 0 &&
    reRankAnchorIds[reRankAnchorIds.length - 1] === stack.topPost.id;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        handleToggleAnchor(stack.topPost.id, 0);
      }}
      aria-label={`Show more posts about ${dominantTopic}`}
      aria-pressed={isCurrentAnchor}
      style={{
        position: 'absolute',
        top: '10px',
        right: '10px',
        zIndex: 10,
        background: isCurrentAnchor ? dominantColors.bg : 'transparent',
        border: isCurrentAnchor ? `1px solid ${dominantColors.border}55` : 'none',
        borderRadius: '4px',
        padding: isCurrentAnchor ? '1px 5px' : '1px 4px',
        cursor: 'pointer',
        color: indicatorColor,
        fontSize: '11px',
        fontWeight: 600,
        lineHeight: 1.3,
        maxWidth: '160px',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        opacity: showColor ? (isCurrentAnchor ? 1 : 0.75) : 0.6,
        transition: 'opacity 200ms ease, background 200ms ease, color 200ms ease',
        display: 'flex',
        alignItems: 'center',
        gap: '2px',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.opacity = '1';
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLElement;
        const currentAnchor =
          reRankAnchorIds.length > 0 &&
          reRankAnchorIds[reRankAnchorIds.length - 1] === stack.topPost.id;
        el.style.opacity = currentAnchor ? '1' : (showColor ? '0.75' : '0.6');
      }}
    >
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '130px' }}>
        {dominantTopic} ({clusterCount})
      </span>
      <span aria-hidden style={{ flexShrink: 0, fontSize: '10px', marginLeft: '1px' }}>›</span>
    </button>
  );
})()}
```

**Commit:** `Add relation indicator (top-right) to related-post cards (F1-F4)`

---

### Step 4 — Verify build passes

Run `pnpm build`. Fix any TypeScript errors. Common risks:
- `reRankAnchorIds` already in scope (from `useHighlightStore` destructure at line 598)
- `topicTotal` already in scope (computed in `useMemo` at line 679)
- `panelHovered` already in scope (state at line 602)
- `handleToggleAnchor` already in scope (defined at line 948)

**Commit:** (only if build-only fixes needed) `Fix TS errors in Group F indicator`

---

### Step 5 — Open PR

```bash
gh pr create \
  --base tarcode2004/enhancement/group-e-reordering \
  --head tarcode2004/enhancement/group-f-relation-indicator \
  --title "Add per-card relation indicator (Group F)" \
  --body "..."
```

---

## Verification Checklist

| Test | Expected |
|---|---|
| Card with single relation, panel not hovered | Indicator shows topic + count, category color, opacity ~0.75 |
| Card with single relation, panel hovered | Indicator full opacity |
| Card with multiple relations, panel not hovered | Indicator shows first relation's topic, grey color |
| Card with multiple relations, panel hovered | Indicator shows dominant-category color |
| Click indicator on unanchored card | Card becomes anchor; list reorders; indicator shows active bg |
| Click indicator on already-anchored card | Anchor clears; list reverts; indicator returns to default |
| Click indicator while different card is anchor | Anchor switches; old group collapses; new group forms |
| Card with no relations | No indicator rendered |
| Card with relations but first relation has no topic | No indicator rendered |
| Card is a "claim" under an anchor | Indicator still renders; clicking it switches anchor |
| Navigation still works | Clicking card body (not indicator) still navigates |
| Indicator `aria-pressed` | `true` when card is active anchor, `false` otherwise |
