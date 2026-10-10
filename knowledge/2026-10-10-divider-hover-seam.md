---
knowledge_type: decision
decision_status: accepted
visibility: public
title: Preserve the open bridge during divider interaction
recorded_on: 2026-10-10
---

# Preserve the open bridge during divider interaction

## Follow-up and root cause

This corrects the initial gap investigation in [the related-posts and replies record](2026-10-10-related-posts-and-replies.md). Idle expanded/compact geometry was continuous, but the user's additional reproduction step—hover or click the resize divider—exposed a paint defect the geometry-only check could not detect.

`ResizableDivider` draws a full-height guide, increasing from one to three pixels while hovered, dragged, or focused. The open bridge ended at the guide's centerline, so part of the guide remained visible through the opening. Keyboard focus also outlines the entire eight-pixel hit target; that outline remains while focus is retained. The result looks like a disconnected vertical seam even though the bridge endpoints are mathematically correct. A simple mouse click does not always focus the separator (pointer down prevents the default), so focus persistence must not be assumed for every pointer gesture.

A screenshot-pixel regression failed on the previous production build immediately after hover, while the idle surface passed. Keyboard focus separately reproduced the persistent line. This explains why the previous idle-only regression missed the report.

## Decision and implementation

Extend the open bridge's white surface over the divider through the opening, up to the measured hit target's right edge plus two pixels of outline allowance. The extension stays inside the existing gutter. Keep the separator's full hit area, native keyboard focus, and guide feedback above/below the opening.

`WeaveBridge.tsx` stores the cover bound in its geometry, updates the cover synchronously with the paths during resizing/scrolling, and includes it in the opening/closing reveal width. The cover paints before the edge paths and continuation rails. Classic and border-only modes retain their existing rendering.

An independent agent reviewed the bounds, hit testing, animation lifecycle, and synchronous geometry updates; no blocking concern was found.

## Verification

`e2e/divider-seam-interaction.spec.ts` samples rendered screenshot pixels through the opening, rather than just asserting coordinates. It covers hover, click, drag/release, pointer exit, retained keyboard focus, Arrow-key resizing, Home reset, and blur. A second case covers a compacted reply view at 1010, 1440, and 1280 pixel viewport widths. `e2e/reply-seam.spec.ts` retains the existing expanded/compact endpoint checks.

The original production build fails the new hover regression. The patched implementation passes the interaction and existing geometry checks. TypeScript and targeted ESLint also pass. Changes remain in the local `dev` working tree; no deployment or remote push was performed.

Final targeted browser run: 3/3 passed in 13.2 seconds on the patched development server, including all interaction states and compacted viewport resizes. The before/after keyboard-focus screenshots were visually reviewed; focus remains visible outside the opening and no line crosses the connected surface.
