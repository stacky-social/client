---
knowledge_type: decision
decision_status: accepted
visibility: public
title: Focus post has two states, full and flowing or compact and pinned
recorded_on: 2026-10-12
---

# Focus post has two states, full and flowing or compact and pinned

## Problem

On a post page, scrolling into the replies switched the focus post to its compact form with a jump. The reply region scrolled first. At 40px of reply scroll the focus collapsed, and the page was pinned with one instant `scrollBy` (about 256px on `/ChineseEVs/posts/152053690` at 1280×900). The reply being read moved 367px in two frames.

The first fix (below, superseded) anchored the switch. That removed the jump but introduced extra modes. The researcher's report on `/EnergyTech/posts/cw-ie_db4lx1rv_UOr_` said: "When scrolling down it first makes the focus post small, and then attaches it to the top. These two modes are not necessary." Measured at 1400×900 with 20px wheel steps, the sequence was:

1. The page scrolled 0→44 and the full post pinned at its sticky top (64px).
2. The replies then scrolled 0→300 under the pinned full post.
3. The post collapsed (389px→146px), and the anchoring residual scrolled the page back to 0. The compact post sat unpinned at 108px with the Back link showing. A few steps later the page jumped back to 44 and the post pinned again.

Scrolling back up, the post expanded while pinned, the replies scrolled another 240px under the full pinned post, and then the page unpinned. Once full and pinned, the region also contained the wheel, so on most runs upward wheeling over the replies could never scroll the page back to the top.

## Decision

`useCompactFocus` (both post pages) has exactly two states:

- **FULL.** The post is full size and flows with the page up to its pin line. The reply region is not user-scrollable (`overflow-y: hidden`), so input scrolls the page and the replies move with it.
- **COMPACT.** The post is compact and stuck at its pin line, and the reply region scrolls. Compact always means pinned.

Transitions:

- **Down.** Downward wheel, touch, or key input that would carry the page past the pin line collapses the post and pins it (`pinFocus`) in the same step. The transition consumes that input. Nothing collapses while unpinned, and nothing scrolls the page back up.
- **Up.** Upward input in COMPACT with the replies at their top expands the post. The full post then flows again, and the next upward input scrolls the page natively, detaching it.
- **Hysteresis.** Only input direction changes the state. A scroll event on its own (layout, restoration, script) never does, so the boundary cannot flip-flop.
- **Compact stays pinned.** In COMPACT, wheel and keys outside the replies (over the compact post, the margins, or the aside) scroll the replies instead of the page. An inner scroller that can take the input keeps it. A page scroll by touch or the scrollbar is handed back to the replies in the scroll handler.
- **Animated size change.** The wrapper's height animates over 200ms (ease-out cubic; instant under `prefers-reduced-motion`). Just before the change commits, the wrapper is locked to its current height (and the gap below it to an inline margin, since a fixed height stops the post's bottom margin collapsing through). Each frame then sets the height and `--cw-focus-budget` together, toward a natural height that is re-measured every frame because the compact post settles over a couple of passes. The region's bottom edge never moves, so the replies slide with the post's edge in the scroll direction, while the document height, the page scroll and the sticky aside stay put. Heights are whole pixels, because a fractional height against the `ceil()`ed budget nudged the aside by up to 0.7px.
- **Programmatic positions.** A restored or scripted reply scroll above 40px (`reply-scroll:<id>` on Back or reload, `scrollIntoView`) shows the compact post, pinned, with no animation.
- **`holdReplies(delta)`.** In COMPACT, the region scrolls by `delta`. In FULL, the page scrolls up to the pin line and the region holds the rest while the post stays full, because collapsing would move the clicked reply by the height the post gives back (77px in `reply-type-tag-grouping`). This one state (full, pinned, replies held slightly scrolled) is the only exception to the two-state contract. The next input resolves it: down collapses, and up first scrolls the held replies back.

### Superseded: anchored switch

The earlier decision kept the reply region scrollable once the full post pinned, collapsed after `giveBack + 40px` of progress into the replies, and offset each focus height change in the region's `scrollTop` for 400ms. Whatever the region couldn't absorb went to the page with `window.scrollBy`. That residual scrolled the page up and unpinned the compact post, which is the reported bug. The design also required pinning the full post over scrolled replies by construction. The giveBack threshold, anchoring window, residual page scroll, compact-height guess and user-input heuristics are removed. Two parts are kept: page-first scrolling while the post is full, and writing the budget before paint.

## Validation

Prod build, per-step state after each input settles (scrollY, region scrollTop, `data-focus-compact`, focus wrapper top and height, top of the second aside card), plus per-frame aside position. Both posts were tested at 1400×900 and 1280×700, with wheel steps of 10, 20 and 60px and with ArrowDown and PageDown keys, scrolling down into the replies and back up to the top (20 runs).

| | Before (dev at `4b2f70a`) | After |
| --- | --- | --- |
| Settled steps with the compact post unpinned | 29, 7 and 3 (EnergyTech 1400×900 wheel 10, 20 and 60) | 0 in every run |
| Settled steps with the full post pinned over scrolled replies | 4–55 per wheel run | 0 in every run |
| Back to the page top by wheeling up over the replies | stuck pinned at y=44 in most wheel runs | every run |
| Keyboard | never collapsed; the page stopped at the pin | collapses and pins, expands and detaches |
| Aside card movement over a run | up to 24.9px (EnergyTech) and 56.7px (ChineseEVs) | 0px |
| Compact transitions per down-and-up run | 2 | 2 |

`e2e/focus-collapse-continuity.spec.ts` encodes the contract. It samples every painted frame while wheeling 20px down into the replies and back to the top, and asserts the following on every frame:

- compact ⇔ pinned, and the full post is never pinned over scrolled replies;
- exactly one collapse and one expand;
- the replies move only in the scroll direction, with no frame moving them more than 100px, and they slide over several frames;
- the related card moves at most 1px per frame.

It also checks keyboard paging (PageDown and PageUp) and that wheeling over the compact post scrolls the replies, not the page.
