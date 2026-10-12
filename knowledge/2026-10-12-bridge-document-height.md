---
knowledge_type: decision
decision_status: accepted
visibility: public
title: Weave bridge must not extend the document
recorded_on: 2026-10-12
---

# Weave bridge must not extend the document

## Problem

Opening a post from deep in a topic feed and then scrolling gently (trackpad-sized steps that never freeze the aside) could leave the related pane almost blank: only the tail of one related card under the nav, white space below.

## Cause

The bridge SVG is absolutely positioned and sized to the document height, and it read that height from `documentElement.scrollHeight`. That value includes the SVG itself, so the height could grow but never shrink. A feed-sized SVG (about 2,200px) survived into the short post-detail page (about 850px), and the window stayed scrollable far past the content group. The aside is `position: sticky` inside that group, so it scrolled up and off screen along with it. A fast scroll hid the problem because the freeze unmounts the SVG, which lets the document collapse. The same ratchet also caused a smaller version on direct loads: after the focus post went compact and the feed got shorter, the document stayed 25 to 70px too tall and the aside slid under the nav.

## Decision

The SVG height is the page's own content height (`body`'s box, at least the viewport). It is part of the geometry signature, so the SVG resizes when the content shrinks. The aside's sticky layout and the compact-focus logic are unchanged.

## Validation

`e2e/aside-after-feed-navigation.spec.ts` fails on the base commit (document 2170px tall against an 845px body, aside top at 35px) and passes with the fix.
