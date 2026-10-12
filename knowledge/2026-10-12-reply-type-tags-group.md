---
knowledge_type: decision
decision_status: accepted
visibility: public
title: A reply's contribution-type tag groups the comments and filters the aside
recorded_on: 2026-10-12
---

# A reply's contribution-type tag groups the comments and filters the aside

## Problem

On a post page, the contribution-type pills on a reply (for example a red "Disagree") were passive. A click bubbled to the reply header and opened the reply as a post. The same type on a related card's icon groups "more like this" ([#224](2026-10-12-multiple-contribution-types.md)).

## Decision

The pane you click in groups; the other pane filters. This is the rule every topic interaction already follows (a reply span's topic clusters the replies and filters the aside).

- **Reply tag.** A click (or Enter/Space) is a reply-origin interaction keyed by type: `activateReplyTopic({ groupBy: 'category' })`, so the URL reads `fo=replies&fg=category`. The comment list groups the top-level replies that carry the type in any relation around the clicked reply, in the same cluster rail a reply-span click draws ("Agree (N)", with a × to dismiss). The related panel filters to the posts carrying the type in any relation and shows a "contributing <Type>" chip (`aside-type-filter`). Its count is those posts.
- **Aside icon.** Unchanged: a card's type icon groups the related panel (bordered block around the clicked card) and filters the comments by type (`reply-topic-filter` chip).
- The tag never navigates.
- **Anchor.** The clicked reply, at its first relation of that type. No related card is needed.
- **Nothing else of the type.** When no other reply (and, with cross-pane filtering, no related post) carries the type, the tag shows only its label, has a default cursor, and does nothing, as a "0 more" span does.
- **Toggle.** Any reply tag of the active reply type group clears it. Another type, or another tag of a multi-type reply, switches the group. A reply tag clicked while an aside type group is active moves the group to the comments.
- **Tooltip.** "N more <Type>": other displayed replies of the type plus related posts of the type, as the reply-span tooltip counts topics. "Showing <Type>" while that tag's group is active.
- **The clicked reply stays put.** It uses the same `replyPinRef`/`holdReplies` pin as a reply-span click.
- Back-undo is the reply-span path: `beginPanelInteraction` before the change.

## Superseded

The first version (same day) made the reply tag run the aside icon's interaction (`activateAsideTopic({ groupBy: 'category' })`, `fo=aside`). The aside grouped around a related card picked by `pickTypeGroupAnchor` (the reply itself if it was a related post, otherwise the first drawn card of the type) and the comments were filtered. The user corrected this: a click in the comments should group the comments and filter the right panel. `pickTypeGroupAnchor` and its unit tests were removed; `src/utils/typeGroupAnchor.mjs` keeps only the count helpers.

## Validation

`e2e/reply-type-tag-grouping.spec.ts` checks the following. A reply-tag click keeps the path and sets `ft`, `fo=replies`, `fa=<reply>`, and `fg=category`. The comments show the cluster rail with the clicked reply inside it, and every member carries the type. The aside shows the type chip, no group block, and "Filtered: N related posts", where N is the type's chip count. Every drawn card carries the type. The reply moves at most 1px. Clicking again clears both panes. Back restores the group, and Back again clears it. Enter works, and each tag of a multi-type reply acts on its own type. An aside icon groups the aside and filters the comments (chip, no rail). A reply tag clicked then moves the group to the comments. `tests/unit/filterUrlState.test.mjs` round-trips a reply-origin type group, and `fg=category` with `fo=focus` is rejected.
