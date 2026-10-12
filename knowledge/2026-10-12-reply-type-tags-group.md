---
knowledge_type: decision
decision_status: accepted
visibility: public
title: A reply's contribution-type tag groups like the aside type icon
recorded_on: 2026-10-12
---

# A reply's contribution-type tag groups like the aside type icon

## Problem

On a post page, the contribution-type pills on a reply (for example a red "Disagree") were passive. A click bubbled to the reply header and opened the reply as a post. The same type on a related card's icon groups "more like this" ([#224](2026-10-12-multiple-contribution-types.md)).

## Decision

- A reply's type tag runs the aside icon's interaction: `activateAsideTopic({ groupBy: 'category' })`. The URL (`fg=category`, `fo=aside`), Back-undo, aside group block, and reply-list filtering are the same code paths. No separate reply-side type interaction exists.
- The tag never navigates, by click or by Enter/Space.
- **Anchor.** A type group must anchor on a related card. The panel builds the block around that card and validates the URL tuple against it. The anchor is the reply itself when it is also a related post. Otherwise it is the first card of that type as the panel currently draws it, and then the first in data order (`pickTypeGroupAnchor` in `src/utils/typeGroupAnchor.mjs`). The group then gathers below that card, so nothing above it moves.
- **No related post of the type.** Then there is nothing to group (5 of 460 reply types in the scale demo). The tag shows only its label, has a default cursor, and does nothing.
- **Toggle.** The active type toggles off from any reply tag or aside icon that shows it. Another type, or a tag of a multi-type reply, switches the group to that type.
- **Tooltip.** The tag uses the span tooltip wording: "N more <Type>" (related cards plus other displayed replies of the type), or "Showing <Type>" while that group is active.
- **The clicked reply stays put.** The filter bar that appears above the replies is offset in the reply region's scroll. This uses `holdReplies` from `useCompactFocus`, which counts the offset as reader scroll, so it collapses the focus only past the hysteresis threshold and then anchored. As a plain programmatic `scrollTop` write, the 49px offset collapsed the focus unanchored and moved the reply 111px. Reply span clicks share this pin and get the same fix.

## Validation

`e2e/reply-type-tag-grouping.spec.ts` checks the following. A click keeps the path and sets `ft`, `fo=aside`, and `fg=category`. The aside shows the type header, and the reply filter chip shows the type. The reply moves at most 1px. Clicking again clears the group, Back restores it, and Back again clears it. Enter works. Each tag of a multi-type reply acts on its own type. An aside icon and a reply tag toggle the same group.
