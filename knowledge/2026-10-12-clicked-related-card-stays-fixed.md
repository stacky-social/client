---
knowledge_type: decision
decision_status: accepted
visibility: public
title: The clicked related card stays fixed when grouping
recorded_on: 2026-10-12
---

# The clicked related card stays fixed when grouping

The rule: a span click, a type-icon click, and the group × leave the clicked card (and the clicked span) at the same viewport position, to within 1px. The other cards gather around it.

## Causes measured at f26d18f

All three are in `RelatedStacks.tsx`. The bridge-height fix (506df4c) did not change any of them.

- **Pagination reset on group change.** `paginationResetKey` included the grouping, so every toggle reset the panel to ten cards after paint. Dismissing a group anchored past the first page removed the anchor from the DOM. A frozen-header × jumped 340px, and a Home icon click jumped 156px. Fix: grouping is no longer in the key, and a toggle keeps the cards already on screen.
- **Scroll clamping at the panel edges.** When the card is at the top of the panel (scrollTop 0), the × removes the group header above it. Scrolling cannot compensate for that, so the card jumped 54px. Fix: the pin effect puts the shortfall into a top or bottom spacer (`data-related-pin-spacer`). A spacer collapses without visible movement once it scrolls out of view.
- **Uncovering the clicked element from the frozen header.** After an icon click near the top, the pin effect scrolled the card 22px so the frozen header copy would not cover the icons. This replaces the "never left beneath the frozen copy" behavior: the copy now stays hidden until the reader scrolls the panel (wheel, touch, keys, or scrollbar).

Regression cover: `e2e/related-anchor-stability.spec.ts` runs Home and `/Tariffs/posts/cw-98ap5xG92L0LqEbQ` against cards 1, 7, and 14 (14 is past the first page). Each run covers span on, header ×, icon on, icon off, icon switch, and the frozen-header ×. All measured drifts are 0.0px.
