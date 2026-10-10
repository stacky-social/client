---
knowledge_type: decision
decision_status: accepted
visibility: public
title: Preserve alternate-topic tooltip counts during grouping
recorded_on: 2026-10-10
---

# Preserve alternate-topic tooltip counts during grouping

When a topic box is open, hovering its topic reads “Showing **Topic**”. Hovering another topic reads “N more **Topic**”, just as before opening a box. Only the topic name is bold; the prefix uses regular weight. This shared rendering also applies to reply-span tooltips and group-footer previews.

The shared `buildTooltipLabel` previously suppressed the count whenever any different topic was active. The count itself already came from the full related collection and applicable cross-pane reply counts, minus the hovered post; the label should continue to display that calculation. Cross-pane filtering can change the displayed reply branches and thus the numeric count. Remove only the presentation suppression, preserving the existing count calculations and grouping behavior. Group-footer callers continue to supply their remaining-member count.

The tooltip container uses semibold text by default, so the topic label explicitly sets a regular-weight wrapper and a bold topic. Other tooltip types retain their styling.

The primary agent reviewed the count calculation with a second agent. Browser regression replaces the older name-only expectation with a two-topic interaction: capture Topic 2's count, open Topic 1, verify “Showing”, verify Topic 2 still displays its count, and click to replace the box. Both label states assert regular prefix and bold topic styling.

Related: [search focus and stable group outlines](2026-10-10-search-focus-and-topic-frame.md). Historical name-only expectations are superseded by this request.

Validation: the two-topic browser regression passed (6.2s), including switching the box and both font weights. TypeScript, targeted ESLint, and diff whitespace checks passed. An initial test incorrectly assumed the count could not change after grouping; inspecting displayed-reply counts confirmed the existing cross-pane filter legitimately changes it, so the regression checks that the computed count remains visible. The user subsequently requested deployment to `dev`; publication is tracked with issue #259.
