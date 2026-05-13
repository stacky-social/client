# Listy Injection Prototype — Handoff Document

## Original Requirements (from conversation)

### First screen (feed mode)
1. Focus posts in a vertical feed on the left, related responses ranked in sidebar
2. Related posts are a **single ranked list** across all categories (not grouped by category)
3. Each post shows its **category badge**; has both a **global rank** and a **within-category rank**
4. **Category filter chips** at the top of the sidebar to filter by category (in-place, no navigation)
5. **Hovering** a related post highlights the relevant parts in **both** the focus post and the sidebar post
6. Long related posts **truncated** to show just the highlighted portion, with "See more" to expand
7. As user scrolls the feed, the sidebar shows the related posts **for the focus post currently in view**

### Drill-down navigation (thread mode)
8. Clicking a related post in the sidebar → that post **becomes the focus post**
9. The **previous focus post appears as an ancestor** above with Twitter-style thread connector lines
10. Clicking deeper continues building the ancestor chain
11. **Comments/replies** shown under the focus post in thread mode
12. **Related response panel** still visible, showing the new focus post's related posts
13. **Back navigation** restores previous view with scroll positions preserved (both feed and sidebar)

---

## Current State — What Works

| Feature | Status | Notes |
|---------|--------|-------|
| Ranked list of all related posts | **Working** | globalRank + category rank displayed |
| Category badges on each card | **Working** | Icon + label + color per category |
| Category filter chips | **Working** | Toggle filter, shows count |
| Hover cross-highlighting | **Working** | Only the active focus post highlights (isActive prop) |
| Truncation + "See more" | **Working** | Smart windowing around highlighted span |
| Feed mode with multiple focus posts | **Working** | 3 entries rendered vertically |
| Thread mode with ancestors + thread lines | **Working** | Twitter-style 2px connector lines |
| Replies in thread mode | **Working** | Mock replies shown below focus post |
| Back button in thread mode | **Working** | Pops navigation stack |
| Ancestor click to navigate back | **Working** | Truncates stack to that level |
| Feed post click → thread view | **Working** | Click any feed post to drill in |
| Sidebar click → thread view with ancestor | **Partially broken** | See Bug #1 below |
| Feed scroll-based focus switching | **Removed** | See Bug #2 explanation below |

---

## Bugs to Fix

### Bug #1: Most sidebar posts are not clickable (CRITICAL)

**Symptom**: User clicks related posts in the sidebar and nothing happens.

**Root cause**: The `navigable` prop on `RankedPostCard` gates the click handler:

```
// RankedPostCard.tsx line 102
onClick={navigable && onClick ? () => onClick(post.id) : undefined}
```

`navigable` is `true` only when `navigableIds.has(post.id)` — and `navigableIds` is the set of focus post IDs from the entries array: `{"focus-001", "focus-002", "focus-003"}`.

**The problem**: Out of 26 related posts in entry 0, only 2 have IDs matching other entries (`focus-002`, `focus-003`). The other 24 have IDs like `post-agree-1`, `post-disagree-2`, etc. — they are NOT in the navigable set, so clicking them does nothing. No cursor change, no click handler.

**Fix options**:

**Option A — Make ALL posts clickable, show simplified thread view for non-entry posts**:
- Remove the `navigable` gate entirely — every related post is clickable
- When clicked post has a matching entry → full thread view (current behavior)
- When clicked post has NO entry → show a simplified thread view: the focus post as ancestor, the clicked related post rendered as the focus post (using its `content`, `account`, etc. from `RelatedPostMock`), but with an empty related posts sidebar and no replies. This at least shows the ancestry context.
- Requires a small adapter: `RelatedPostMock` → `FocusPostMock` conversion (add `plainText` = `content`, `content` = wrap in `<p>` tags)

**Option B — Add entries for all related posts** (data-heavy):
- Create a `ListyInjectionEntry` for every related post in the JSON
- Each would need its own `relatedPosts` array with highlight data
- This is the "correct" approach but requires generating ~26+ more entries with fake related posts and highlight annotations

**Option C — Make non-navigable posts show a "no deeper data" state**:
- Keep the `navigable` gate for full navigation
- But make ALL posts clickable with `cursor: pointer`
- Non-navigable clicks show a toast/indicator: "No deeper data available for this post"
- Least effort, but doesn't match the user's expectation

**Recommended**: Option A. It's the smallest code change that matches user expectations.

**Files to change for Option A**:
- `RankedPostCard.tsx`: Remove `navigable` gate — always wire onClick
- `RankedPostList.tsx`: Always pass onClick, remove navigableIds
- `CategorySidebar.tsx`: Remove navigableIds prop
- `listyStore.ts` or `ListyInjectionShell.tsx`: Handle the case where `entryMap.get(postId)` returns undefined — create a synthetic entry from the `RelatedPostMock` data
- `@aside/listy-injection/page.tsx`: Remove navigableIds, update handlePostClick

### Bug #2: Feed scroll-based focus detection removed

**Symptom**: In feed mode, only the first post starts active (purple left border). Scrolling doesn't change which post is active.

**Why it was removed**: With only 3 posts that barely exceed viewport height (~1002px content vs ~900px viewport = 78px max scroll), no scroll-based algorithm could reliably distinguish between posts. The middle post's center was always closest to the viewport center. Multiple algorithms were tried (viewport center, anchor line at 20%, topmost visible) — all failed because the posts simply don't move enough relative to each other.

**Current behavior**: First post starts active. Click a different post to activate it + enter thread view. There is no way to change which post is active without entering thread mode.

**Fix options**:
- **If more entries are added** (10+), re-enable the scroll-based detection from `PostList.tsx` (viewport center algorithm). It works well with many posts.
- **For the current 3 posts**: Could add a click-to-activate-without-navigating interaction (e.g., click the left border area or a small "focus" icon). But this adds UI complexity for a prototype.
- **Simplest**: Accept that click → thread is the primary interaction for the prototype's 3 posts.

---

## Architecture Overview

### Files

| File | Purpose |
|------|---------|
| `src/components/ListyInjection/listyStore.ts` | Module-level singleton store (useSyncExternalStore). Holds activeRelatedPostId, filterCategory, activeFeedEntryId, navigationStack, scroll positions. Shared between center panel and aside via module scope. |
| `src/components/ListyInjection/ListyInjectionShell.tsx` | Center panel orchestrator. Feed mode: renders all entries. Thread mode: renders ancestors with thread lines → focus post → replies. |
| `src/components/ListyInjection/FocusPost.tsx` | Focus post card. Props: `isAncestor` (muted styling), `isActive` (gates highlight reactivity), `onClick` (for ancestor navigation). |
| `src/components/ListyInjection/CategorySidebar.tsx` | Sidebar container. Filter chips + post count + delegates to RankedPostList. |
| `src/components/ListyInjection/RankedPostList.tsx` | Scrollable list of RankedPostCards. Registers sidebar scroll ref with store. |
| `src/components/ListyInjection/RankedPostCard.tsx` | Individual related post card. Hover-driven highlighting, smart truncation, category badge, navigable indicator (chevron). |
| `src/components/ListyInjection/constants.tsx` | Category colors, icons, labels, rank ordinals. |
| `src/components/ListyInjection/highlightUtils.ts` | Parses `⌊bracket⌋` markers into highlight ranges, builds text segments. |
| `src/app/(shell)/listy-injection/page.tsx` | Route page — imports JSON, passes to shell. |
| `src/app/(shell)/@aside/listy-injection/page.tsx` | Aside parallel route — reads store state, picks which entry's relatedPosts to show, passes navigableIds + onPostClick to sidebar. |
| `src/app/FakeData/listy-injection.json` | Mock data: 3 entries, each with focusPost + relatedPosts + replies. |
| `src/types/PostType.tsx` | TypeScript interfaces: FocusPostMock, RelatedPostMock (with globalRank), ListyInjectionEntry, ListyInjectionData. |

### Data model

```
ListyInjectionData = ListyInjectionEntry[]

ListyInjectionEntry {
  focusPost: FocusPostMock       // The main post
  relatedPosts: RelatedPostMock[] // Ranked responses with highlight annotations
  replies?: FocusPostMock[]       // Comment replies (shown in thread mode)
}

RelatedPostMock {
  id: string                     // If matches a focusPost.id → navigable
  category: CategoryKey          // agree, disagree, evidence_public, etc.
  rank: number                   // Within-category rank
  globalRank: number             // Across all categories
  content_highlight: string      // Content with ⌊bracket⌋ markers for sidebar highlights
  focusHighlight: string         // Focus post text with ⌊bracket⌋ markers for cross-highlighting
  ...
}
```

### Navigation state machine

```
FEED MODE (navigationStack = [])
  activeFeedEntryId → determines which entry's relatedPosts show in sidebar

  Click feed post → navigateToPost(postId)
    → stack becomes [postId]
    → THREAD MODE

  Click sidebar post → navigateToPost(relatedPostId)
    → stack becomes [activeFeedEntryId, relatedPostId]  (active feed entry pushed as ancestor)
    → THREAD MODE

THREAD MODE (navigationStack = [ancestor1, ancestor2, ..., current])
  getCurrentFocusId() → last element
  getAncestorIds() → all but last

  Click sidebar post → navigateToPost(postId)
    → stack becomes [...existing, postId]
    → deeper THREAD MODE

  Click back → navigateBack()
    → pops last element
    → if stack empty → FEED MODE (restores feed scroll)
    → if stack non-empty → shallower THREAD MODE (restores scroll)

  Click ancestor → pops stack down to that ancestor
```

### Cross-highlighting flow

```
1. User hovers RankedPostCard
2. → setActiveRelatedPost(post.id) via listyStore
3. → FocusPost reads activeRelatedPostId (only if isActive=true)
4. → Finds matching RelatedPostMock by id
5. → Parses focusHighlight field with parseHighlight()
6. → buildSegments() splits focus post plainText into highlighted/normal segments
7. → Renders <mark> elements with category-colored backgrounds
8. → 200ms fade transition via markOpacity state
```

---

## JSON data cross-linking

Current entries and their navigable links:

```
Entry 0 (focus-001, Robin Patel — 4-day work week)
  26 related posts, 2 navigable:
    focus-002 → Entry 1 (Taylor Brooks)
    focus-003 → Entry 2 (Blair O'Brien)
  2 replies

Entry 1 (focus-002, Taylor Brooks — cherry-picked data skeptic)
  4 related posts, 2 navigable:
    focus-001 → Entry 0
    focus-003 → Entry 2
  2 replies

Entry 2 (focus-003, Blair O'Brien — personal 4-day week experience)
  4 related posts, 2 navigable:
    focus-001 → Entry 0
    focus-002 → Entry 1
  2 replies
```

---

## How to test

```bash
pnpm dev
# Navigate to http://localhost:3000/listy-injection
```

1. **Feed mode**: See 3 focus posts. First one has active border. Sidebar shows its 26 related posts.
2. **Click a feed post**: Enters thread view for that post. No ancestors (it's the root). Replies shown below. Sidebar shows that post's related posts.
3. **Click a navigable sidebar post** (one with `›` chevron — only `focus-002` or `focus-003` in entry 0): Enters thread view with the previous focus post as ancestor, connector lines visible.
4. **Click back**: Returns to previous view.
5. **Hover sidebar posts**: Cross-highlighting appears on the active focus post.
6. **Category filter chips**: Filter the sidebar list by category.

**Known failures**:
- Clicking non-navigable sidebar posts (24 out of 26 in entry 0) does nothing
- No scroll-based focus switching in feed mode
