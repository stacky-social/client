---
knowledge_type: decision
decision_status: accepted
visibility: public
title: Initial search focus and stable topic-group outlines
recorded_on: 2026-10-10
---

# Initial search focus and stable topic-group outlines

## Decisions

- Search selects its first post as soon as results arrive, making related posts discoverable even for a single result without scrolling. Each new query/entity surface gets an initial selection. Subsequent result hydration preserves the reader's selection; existing scroll and explicit-selection rules continue to apply. Empty results release the search surface and clear its related pane.
- Hovering a related post continues to dim other post surfaces and their decorative stacked layers. The enclosing topic/category frame, header, and footer controls stay fully visible. The frame represents the group, not the transient active card.
- Existing cross-pane topic filtering is retained: clicking a right-pane topic filters left replies when an eligible reply branch matches. Matching descendants retain their ancestor branch. With no matching branch, no topic restriction/chip is applied; other existing filters are not cleared. Aside-origin filtering depends on the cross-pane and reply-sort feature flags.

## Implementation rationale

`SearchPostFeed` previously waited for an actual scroll gesture before publishing any post. It now publishes the first result once per search surface, with a guard against a stale hydration effect republishing the previous selection during a query change.

### Search-bar visibility follow-up

Automatic selection publishes related-post state without scrolling to the card. New/refined searches scroll only to the page top and skip saved-position restoration entirely, preventing a restore animation from racing the top reset. Search restoration accepts only an exact URL snapshot; it must not reuse a pathname-only or legacy position from a different query. Other feed surfaces retain their existing restoration fallback. Returning to a matching saved search may still deliberately restore its reading position.

The no-jump browser regression uses a 1280×600 viewport and stale 700px search snapshots. It samples every animation frame through first-result selection, pane setup, and query refinement, requiring zero page scroll and the complete search input below the fixed navigation bar. It also checks a direct query URL against the stale snapshot.

Follow-up validation: both search lifecycle and no-jump browser checks passed without retries (20.8s); TypeScript, targeted ESLint, and diff whitespace checks passed.

`RelatedStacks` applied opacity and grayscale to an outer wrapper that also contained each segment of the shared group outline. Moving those styles to the post Paper and decorative layers prevents inherited fading of the outline. Group geometry and ranking are unchanged.

## Review and validation

The agent team split search and group-frame ownership; the primary agent reviewed the combined changes. Browser regression coverage checks a one-result search without scrolling, return from Home, a changed query, empty results, and sibling-card dimming with every group-frame ancestor remaining fully opaque and unfiltered. Existing hover assertions now target the card surface rather than its structural wrapper.

Related records: [earlier interaction decisions](2026-10-10-related-posts-and-replies.md), [divider continuity](2026-10-10-divider-hover-seam.md), and [feed ranking investigation](2026-10-10-feed-ranking-investigation.md).

Validation: TypeScript and targeted ESLint passed. The new group-frame check and both existing pointer/scroll hover checks passed. The search lifecycle check passed, then a final rerun passed on retry after Home navigation exceeded the default five-second assertion timeout on the development server. The primary agent reviewed the group-hover screenshot and confirmed continuous colored rails beside dimmed cards. The user subsequently requested publication to `dev`; these follow-ups are tracked with issue #259. The later no-jump validation above passed without retries.
