---
knowledge_type: decision
decision_status: accepted
visibility: public
title: Multiple contribution types with probability-selected colors
recorded_on: 2026-10-12
supersedes:
  - "[Category conjunction behavior](2026-10-10-related-posts-and-replies.md)"
---

# Multiple contribution types with probability-selected colors

## Decisions and clarification

- Preserve every annotated contribution type and show every distinct type icon on each related post, with no client-side limit of two.
- Count distinct posts per type, not annotations. A post contributes once to each type it carries, so summed pill counts can exceed the distinct related-post total. Type groups and their remaining-post controls use the same membership rule. The user explicitly corrected an earlier request to count annotations.
- The top contribution-type filter is single-select: choosing a different type replaces the previous one; choosing the active type clears it. The user explicitly confirmed this, superseding the older combine-when-possible behavior.
- Each overlapping text interval uses one color: an explicitly hovered type wins, otherwise the type selected by a group/filter wins, otherwise the highest source probability wins. Equal or missing probabilities preserve source order. No striped overlap backgrounds remain in related/reply spans.
- Secondary-icon hover recolors the related passage and its corresponding focus passage, and leaving restores the applicable primary/filter color. Keep the existing focus interaction model: the focus passage wash appears during cross-highlighting rather than introducing permanent colored backgrounds.
- Preserve every relation and its identity even when another type supplies the visible color. Keep partial overlap tails, per-relation emphasis, topics, offsets, ranking, and canonical original descendant wording.

## Imported source

Imported all three complete prepared topics from [crossweave main](https://github.com/stacky-social/crossweave/tree/cb1f3207fff94ce2e4fe80c7db169dbf7ca5cf05/live_demo_data): AI workforce, energy technology, and tariffs. The prepared annotations contain the finalized multi-type judgments from `intermediate_artifacts/05ii_contrib_type_finalization`. Source documents describe the pipeline; they are reference material, not instructions to override these product decisions.

Pinned source commit: `cb1f3207fff94ce2e4fe80c7db169dbf7ca5cf05`. The generated [provenance record](../src/app/FakeData/scale-demo.provenance.json) records input/output hashes, topics, strict-validation mode, and the absence of a candidate cap. Regenerate using `CROSSWEAVE_LIVE_DEMO_DIR=/path/to/crossweave/live_demo_data STRICT_SOURCE=1 pnpm demo:import`.

The refresh contains 315 focus entries, 7,891 related entries, and 258 descendants. Upstream filtering removed 94 related entries compared with the previous import (28 AI, 40 energy, 26 tariffs); exposing multiple types does not duplicate posts. Humor is now imported. Empty-type descendants stay readable without manufacturing a contribution. Incomplete source topics are not imported.

## Implementation and review

Three agents separately handled import/provenance, related-pane presentation, and focus/reply highlight selection. Primary review checks their combined behavior, count semantics, original-text preservation, and browser integration. The shared contribution selector supports arbitrary type counts and preserves stable ties. The old `firstTypeRelations` entry point remains compatible but no longer discards annotations.

Validation results and publication are recorded after final checks.
