# Group D — Highlight-to-Filter Implementation Plan

**Date:** 2026-05-13
**Status:** Ready
**Spec:** `docs/superpowers/specs/2026-05-13-group-d-highlight-to-filter-design.md`

---

## Step 1 — highlightStore: add filterFocusSpan field + actions

**File:** `src/utils/highlightStore.ts`

### 1.1 Add type + field to HighlightState

Add to the `HighlightState` interface:
```ts
/** D2: focus-post mark clicked — filter sidebar to spans overlapping this range */
filterFocusSpan: { start: number; end: number; text: string } | null;
```

### 1.2 Update INITIAL constant

Add `filterFocusSpan: null` to `INITIAL`.

### 1.3 Add SERVER_SNAPSHOT update

Add `filterFocusSpan: null` to the `SERVER_SNAPSHOT` object.

### 1.4 Add actions

```ts
export function setFilterFocusSpan(span: { start: number; end: number; text: string }): void {
  state = { ...state, filterFocusSpan: span };
  notify();
}

export function clearFilterFocusSpan(): void {
  if (state.filterFocusSpan === null) return;
  state = { ...state, filterFocusSpan: null };
  notify();
}
```

### 1.5 Update resetHighlightStore

Add `filterFocusSpan: null` to the reset state.

**Verification:** `pnpm build` — no errors.

---

## Step 2 — Post.tsx: add data-range-id to renderMultiHighlightHtml marks

**File:** `src/components/Posts/Post.tsx`

### 2.1 In `renderMultiHighlightHtml`

Change the `markHtml` construction at line ~94:
```ts
const markHtml = `<mark data-range-id="${entry.index}" style="background:${entry.bgColor};padding:1px 0;color:inherit;border-radius:3px;transition:background 200ms ease">${innerHtml}</mark>`;
```

**Verification:** `pnpm build` — no errors.

---

## Step 3 — Post.tsx: event delegation + D1 neutral hover + D2 click filter

**File:** `src/components/Posts/Post.tsx`

### 3.1 Import new store actions

Add to imports from `../../utils/highlightStore`:
```ts
import { useHighlightStore, setFilterFocusSpan, clearFilterFocusSpan } from '../../utils/highlightStore';
```

### 3.2 Add state + unique ID in `ActiveHighlightedContent`

Add inside the component, after existing state:
```ts
const { filterFocusSpan } = useHighlightStore();  // already has hoveredPostId, etc.
const [hoveredFocusMarkIndex, setHoveredFocusMarkIndex] = useState<number | null>(null);
const containerIdRef = useRef<string>(`ahc-${Math.random().toString(36).slice(2)}`);
```

### 3.3 Event delegation via useEffect

After the existing `useLayoutEffect` and `useEffect` blocks, add:

```ts
// D1/D2: event delegation on container for focus-post mark hover + click
useEffect(() => {
  const el = innerRef.current;
  if (!el) return;

  const handleMouseOver = (e: MouseEvent) => {
    if (showCrossHighlight) return; // D1 suppressed during cross-highlight
    const target = (e.target as HTMLElement).closest('mark');
    if (!target) return;
    const rid = target.getAttribute('data-range-id');
    if (rid !== null) setHoveredFocusMarkIndex(parseInt(rid, 10));
  };
  const handleMouseOut = (e: MouseEvent) => {
    const target = (e.target as HTMLElement).closest('mark');
    if (!target) return;
    const related = e.relatedTarget as HTMLElement | null;
    if (related && target.contains(related)) return;
    setHoveredFocusMarkIndex(null);
  };
  const handleClick = (e: MouseEvent) => {
    const target = (e.target as HTMLElement).closest('mark');
    if (!target) return;
    const rid = target.getAttribute('data-range-id');
    if (rid === null) return;
    const idx = parseInt(rid, 10);
    const rels = hoveredRelations;
    if (!rels || idx >= rels.length) return;
    const rel = rels[idx];
    e.stopPropagation();
    // Toggle: same span clears, different span sets
    if (
      filterFocusSpan !== null &&
      filterFocusSpan.start === rel.focusStart &&
      filterFocusSpan.end === rel.focusEnd
    ) {
      clearFilterFocusSpan();
    } else {
      const plainText = stripHtml(rawText);
      setFilterFocusSpan({
        start: rel.focusStart,
        end: rel.focusEnd,
        text: plainText.slice(rel.focusStart, rel.focusEnd),
      });
    }
  };

  el.addEventListener('mouseover', handleMouseOver);
  el.addEventListener('mouseout', handleMouseOut);
  el.addEventListener('click', handleClick, true); // capture to beat card navigation click
  return () => {
    el.removeEventListener('mouseover', handleMouseOver);
    el.removeEventListener('mouseout', handleMouseOut);
    el.removeEventListener('click', handleClick, true);
  };
}, [showCrossHighlight, hoveredRelations, filterFocusSpan, rawText]);
```

### 3.4 Inject scoped CSS for D1 neutral hover

After the effect above, add:

```ts
// D1: inject scoped style to override mark background on hover
useEffect(() => {
  const id = containerIdRef.current;
  const styleId = `d1-hover-${id}`;
  let styleEl = document.getElementById(styleId) as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = styleId;
    document.head.appendChild(styleEl);
  }
  if (hoveredFocusMarkIndex !== null && !showCrossHighlight) {
    styleEl.textContent = `#${id} mark[data-range-id="${hoveredFocusMarkIndex}"] { background: rgba(100,116,139,0.30) !important; cursor: pointer; }`;
  } else {
    styleEl.textContent = `#${id} mark { cursor: ${showCrossHighlight ? 'default' : 'pointer'}; }`;
  }
  return () => {
    // cleanup only on unmount
  };
}, [hoveredFocusMarkIndex, showCrossHighlight]);

// Cleanup style on unmount
useEffect(() => {
  const id = containerIdRef.current;
  return () => {
    const el = document.getElementById(`d1-hover-${id}`);
    if (el) el.remove();
  };
}, []);
```

### 3.5 Add id attribute to the container div

Change the return statement in `ActiveHighlightedContent`:
```tsx
return <div ref={setRefs} id={containerIdRef.current} className={className} style={mergedStyle} dangerouslySetInnerHTML={{ __html: html }} />;
```

**Verification:** `pnpm build` — no errors.

---

## Step 4 — RelatedStacks.tsx: span filter + D3 label

**File:** `src/components/RelatedStacks.tsx`

### 4.1 Destructure filterFocusSpan from store

In line ~595 where `useHighlightStore()` is destructured:
```ts
const { filterCategories, filterFocusSpan, hoveredHighlightRangeIndex, hoveredCategory, tappedCardPostId, tappedRangeIndex, reRankAnchorIds, anchoredRangeByPost } = useHighlightStore();
```

### 4.2 Import clearFilterFocusSpan

Add to the import from `../utils/highlightStore`:
```ts
import { ..., clearFilterFocusSpan } from '../utils/highlightStore';
```

### 4.3 Add span filter clause to displayStacks useMemo

After the existing category filter block (around line 776):
```ts
// D2: span filter — keep only stacks whose relations overlap the clicked focus-post span
if (filterFocusSpan !== null) {
  result = result.filter(s =>
    (s.topPost.relations ?? []).some(r =>
      r.focusStart < filterFocusSpan.end && filterFocusSpan.start < r.focusEnd
    )
  );
}
```

Also add `filterFocusSpan` to the useMemo dependency array.

### 4.4 Add clearFilterFocusSpan to relatedStacks change effect

In the `useEffect` that runs on `relatedStacks` change (around line 960):
```ts
useEffect(() => {
  setHoveredCardIndex(null);
  setHoveredIndex(null);
  if (rangeHoverTimer.current) clearTimeout(rangeHoverTimer.current);
  clearReRankAnchors();
  clearTapped();
  clearFilterFocusSpan(); // D2: clear span filter when focus post changes
}, [relatedStacks]);
```

### 4.5 Compute shortestCommonText

After `displayStacks` is computed, add a useMemo:
```ts
/** D3: shortest common related text for span filter label. Null when filterFocusSpan is null. */
const shortestCommonText = useMemo<string | null>(() => {
  if (!filterFocusSpan) return null;
  if (displayStacks.length === 0) return null;

  let maxStart = filterFocusSpan.start;
  let minEnd = filterFocusSpan.end;

  for (const s of displayStacks) {
    const rels = (s.topPost.relations ?? []).filter(r =>
      filterCategories.size === 0 || filterCategories.has(r.category)
    );
    for (const r of rels) {
      if (r.focusStart > maxStart) maxStart = r.focusStart;
      if (r.focusEnd < minEnd) minEnd = r.focusEnd;
    }
  }

  let text: string;
  if (maxStart < minEnd && maxStart >= filterFocusSpan.start && minEnd <= filterFocusSpan.end) {
    text = filterFocusSpan.text.slice(maxStart - filterFocusSpan.start, minEnd - filterFocusSpan.start);
  } else {
    text = filterFocusSpan.text; // fallback: entire clicked span
  }

  return text.length > 60 ? text.slice(0, 60) + '…' : text;
}, [displayStacks, filterFocusSpan, filterCategories]);
```

### 4.6 Update sticky header count label

Replace the existing count text (around line 1019):
```tsx
<Text size="xs" c="dimmed" mb={4}>
  {filterCategories.size > 0 && filterFocusSpan !== null
    ? `${displayStacks.length} post${displayStacks.length !== 1 ? 's' : ''} (category + span filter)`
    : filterFocusSpan !== null
    ? `${displayStacks.length} post${displayStacks.length !== 1 ? 's' : ''} (span filter active)`
    : filterCategories.size > 0
    ? `${displayStacks.length} ${Array.from(filterCategories).map(c => CATEGORY_LABELS[c] ?? c).join(' + ')} post${displayStacks.length !== 1 ? 's' : ''}`
    : `${displayStacks.length} posts across all categories`}
</Text>
```

And add an indicator chip for the active span filter after that text:
```tsx
{filterFocusSpan !== null && (
  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
    <Text size="xs" c="#5a71a8" fw={600} style={{ fontSize: '11px' }}>Span filter:</Text>
    <span style={{
      background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#64748b',
      borderRadius: '4px', padding: '1px 8px', fontSize: '10px', fontWeight: 600,
      maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    }}>
      "{filterFocusSpan.text.length > 40 ? filterFocusSpan.text.slice(0, 40) + '…' : filterFocusSpan.text}"
    </span>
    <button
      type="button"
      onClick={() => clearFilterFocusSpan()}
      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '14px', lineHeight: 1, padding: '0 2px' }}
      aria-label="Clear span filter"
    >×</button>
  </div>
)}
```

### 4.7 Render D3 label in each card

Inside the `displayStacks.flatMap` loop, inside the card `<Paper>`, after the category tags div and before the avatar/content:

Find where `contentNodes` is rendered (inside the `<div onClick={handleCardClick}>`) and add above the `<Text component="p">`:
```tsx
{/* D3: shortest common related text label */}
{shortestCommonText !== null && (
  <div style={{
    display: 'inline-flex', alignItems: 'center', gap: '4px',
    background: '#f1f5f9', border: '1px solid #cbd5e1',
    borderRadius: '4px', padding: '1px 6px', marginBottom: '4px',
    maxWidth: '100%',
  }}>
    <Text size="xs" c="#64748b" style={{ fontSize: '10px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
      "{shortestCommonText}"
    </Text>
  </div>
)}
```

**Verification:** `pnpm build` — no errors.

---

## Step 5 — Final build verification

Run `pnpm build` from the worktree root. Confirm:
- Zero TypeScript errors.
- Zero Next.js build errors.
- Bundle sizes not dramatically increased.

---

## Commit sequence

1. `Add filterFocusSpan field and actions to highlightStore (#N)`
2. `Add data-range-id to focus-post marks for event delegation (#N)`
3. `Add D1 neutral hover and D2 click-to-filter on focus post (#N)`
4. `Add D2 span filter and D3 label in RelatedStacks (#N)`
5. `Add Group D design spec and implementation plan (#N)`
