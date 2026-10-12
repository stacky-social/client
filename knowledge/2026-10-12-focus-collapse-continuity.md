---
knowledge_type: decision
decision_status: accepted
visibility: public
title: Focus post collapses without moving the replies
recorded_on: 2026-10-12
---

# Focus post collapses without moving the replies

## Problem

On a post page, scrolling into the replies switched the focus post to its compact form with a jump. The reply region scrolled first. At 40px of reply scroll the focus collapsed, and the page was pinned with one instant `scrollBy` (about 256px on `/ChineseEVs/posts/152053690` at 1280×900). The reply being read moved 367px in two frames (the 256px pin plus the 111px of height the focus gave back). Scrolling back up moved it 111px the other way. On some posts the stale region budget also shortened the document, and the browser clamped `scrollY` back to 0, which unpinned the focus.

The reply region's `max-height` came from a ResizeObserver → `setState` round trip, and the compact post settles over two passes. For one or two frames the region was too short, which shortened the shell row that holds the sticky aside. Before the [bridge height fix](2026-10-12-bridge-document-height.md), that pushed the aside up.

## Decision

`useCompactFocus` (both post pages):

- **Page first.** The reply region has `overflow-y: hidden` until the focus is stuck at its pin line. Input therefore scrolls the page natively, and the replies move exactly with it. Once the focus is stuck, or the replies are scrolled or compact, the region scrolls as before. `scrollbar-gutter: stable` keeps the toggle from reflowing the replies.
- **Anchored switch.** A scroll-driven collapse or expand opens a 400ms anchoring window. During it, each focus height change is offset in the region's `scrollTop` before paint. Anything the region can't absorb goes to the page. The offsets are incremental, so the reader's own scrolling is never undone.
- **Budget before paint.** The hook writes `--cw-focus-budget` on the region from the ResizeObserver and from a layout effect. The pages' `max-height` reads that property, so no frame shows a stale budget.
- **Hysteresis.** A user-driven collapse needs `giveBack + 40px` of progress into the replies (reply scroll plus any page scroll past the pin line). `giveBack` is the full height minus the measured compact height (guessed at 120px before the first collapse). Expansion still needs upward input at the top of the replies. After a collapse the replies sit at 40px, and after an expand they sit at `giveBack`. Both positions are strictly inside the band, so layout-driven scroll events can't flip the state. Programmatic or restored reply positions still collapse at 40px and pin once.

## Validation

`e2e/focus-collapse-continuity.spec.ts` samples each frame after the app's ResizeObservers have run, which matches the painted state. It wheels 10px steps down through the pin and collapse, then back up through the expand. On a build with the bridge fix but without this change, the worst per-frame reply move was 266px on `/ChineseEVs/posts/152053690` and 117.6px on `/Tariffs/posts/cw-fxp4bHADekz7QC-b`. With this change it is 10px, one wheel step. Related cards moved 0px per frame, and there was exactly one collapse and one expand.
