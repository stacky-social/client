---
knowledge_type: decision
decision_status: accepted
visibility: public
title: Truncation ellipses hide whole characters
recorded_on: 2026-10-12
---

# Truncation ellipses hide whole characters

## Decision

- A character is either fully shown or fully hidden; an ellipsis never paints over part of a glyph. The user reported "happens" rendering as "happen" plus a clipped "s" under a feed post's trailing "…".
- Ellipses stay drawn over the text (never inserted), so line breaks cannot move. Covered characters keep their metrics and turn transparent through a CSS custom highlight: `post-clamp-covered` (trailing, Post.tsx) and `focus-window-covered` (leading, FocusTopicHighlightedContent). Both registered with priority 1 so the search-match highlight cannot repaint them.
- Trailing ellipsis: it goes right after the last glyph when it fits. Otherwise the word it would cut is hidden whole ("Many …", not "Many utiliti…"), falling back to whole characters only when that word is the line's only word. The marker starts right after the last visible glyph and is vertically aligned to the line box (it used to sit half a leading low).
- The marker stays opaque to hide Chrome's native line-clamp "…", painted in `--cw-post-surface`, the variable that also sets the post card's background, so it matches the card in any theme or state.

## Root cause

`measureClampEllipsis` deliberately started the marker one ellipsis width before the last laid-out glyph's right edge, to cover the native "…", at an arbitrary x with no regard to glyph boundaries. It also looked for the marker in the wrong container (the focus-reveal shell), so the caret hit test could land on the marker itself.

## Validation

- `tests/unit/ellipsisCover.test.mjs` covers the choice of covered glyphs.
- `e2e/ellipsis-whole-characters.spec.ts` checks every shown ellipsis on /home (three widths and on resize), a post detail page, and the /ChineseEVs focus window while related-card hovers scroll it. A glyph that overlaps an ellipsis box must be inside its covered highlight. The spec fails on the parent commit.
