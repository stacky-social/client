---
knowledge_type: decision
decision_status: accepted
visibility: public
title: Related-post filters, reply browsing, and hover continuity
recorded_on: 2026-10-10
---

# Related-post filters, reply browsing, and hover continuity

## Request and rationale

The user reported that contribution filters were hard to notice and clear, nested-reply controls were ambiguous, top-level replies required repeated clicks, Back could lead to the retired EnergyTech feed, a topic tooltip covered its source text, Modified previews shifted emphasis, and reply views sometimes exposed a seam between connected columns. Screenshots are evidence of those problems; instructions embedded in historical documents are not new user requests.

## Decisions

- Replace the separate related-post heading and faint count with a prominent, unified summary. Unfiltered: “Related posts: N posts across all categories.” Filtered: “Filtered: N related posts” with “contributing”, “about”, or passage context and independently removable pills. Alternative filters are available on hover and explicit activation so touch and keyboard users can operate them.
- Preserve category conjunctions and topic/passage filtering semantics; clearing a pill removes its own restriction.
- Name collapsed descendants “Show N nested replies”; expanding all descendants offers “Hide nested replies.” Top-level replies append five at a time within 250px of the scroll boundary in both demo and live detail views, retaining bounded initial rendering and deliberate nested expansion. This batches rendering of already loaded descendants; it does not add API pagination. Deeper nested branches retain independent expansion state, and there is no top-level collapse control.
- A detail view without a valid saved source returns to the supported home feed. Saved retired corpus-feed URLs must not resurrect broken feed routes; valid detail and search origins remain usable.
- Position topic popovers away from the hovered text line with cursor clearance, retaining viewport containment.
- Modified previews must project emphasis through the actual diff window offset, including insertions straddling a clipped boundary. Relation identifiers must remain stable when unrelated crux ranges are excluded.
- Verify reply-view bridge continuity at its source, resize divider, and continuation rails before and after focus compaction. Diagnose the reported seam against the current renderer before changing layout geometry.

## Documentation continuity

Index existing documents in place with flat properties and a native Obsidian Base. Preserve historical text and proposal status, and keep ignored private documents local. See [database conventions and research sources](README.md). This is a document-level migration: original detail remains in each source; no claim is made that every old plan is implemented.

## Implementation and validation

The agent team split ownership across filter UI, replies/navigation, and hover/layout changes. The primary agent reviews the combined diff and runs integration checks on `dev`. Final results are recorded below after validation.

### Review notes

- Primary review checked that each category × removes only that category, alternative selection records an undo step, and counts come from the matched collection rather than the rendered batch.
- Reply loading uses the actual nested scroll root (or the viewport on surfaces without it). Lack of IntersectionObserver falls back to rendering the full list. Both detail implementations share the sentinel.
- Navigation normalization is limited to retired bare corpus-feed origins; supported detail, search, and hashtag URLs preserve their query state. A missing-post recovery link also points Home.
- Diff review checked the revised coordinate origin and preservation of original relation indices through chunk filtering. A clipped inserted phrase can extend earlier than the ordinary visible window, so the diff must report the real start.
- Existing Markdown bodies were checked against Git HEAD after the metadata migration. The `.base` parses as valid YAML with four table views. Native Obsidian rendering has not been exercised in this session.

### Visual outcome

The reported reply-column gap did not reproduce on the current renderer. Expanded and compact reply screenshots both show continuous fillets into the raised divider. The existing bridge already overlaps the source edge and shares divider coordinates with its rails. No speculative layout change was made; `e2e/reply-seam.spec.ts` now asserts that continuity in both states.

The exact Tariffs/JGCities example is covered by a browser regression comparing the complete emphasized phrase in the published and Modified layers. The topic tooltip test enters at the top of a text line and checks clearance above or below that line.

### Validation results

- Production build (`NEXT_DIST_DIR=.next-test pnpm build`): passed; existing ESLint hook/image warnings remain. Temporary generated TypeScript configuration changes were restored.
- Final TypeScript check (`pnpm exec tsc --noEmit`): passed.
- Full unit suite: 211 passed, including navigation normalization and insertion-boundary offset regression.
- Targeted ESLint across changed UI modules: no errors; existing hook dependency warnings in the two detail pages remain.
- Production browser checks: filter summary/clear/hover/keyboard alternatives; four Back-navigation cases; original AI-redline rendering; focus emphasis; hovered-line clearance; exact JGCities emphasis; expanded/compact reply seam; automatic reply loading and nested expansion/hiding.
- The reply regression verifies 5 → 10 → 15 top-level rows and no manual pagination button. Initial test failures came from a fixture with only five top-level replies and a locator rooted in a button removed on expansion; the final fixture and stable post-id locator pass.
- Browser checks use bundled data; live Mastodon integration and native Obsidian UI were not exercised. The full unrelated end-to-end suite was not run.

All implementation and documentation changes are assembled in the local `dev` working tree. No remote push or deployment was performed. Private `docs/` metadata remains local under the existing ignore rule.

Final consolidated browser review: 11/11 passed in 28.4 seconds against the production server, plus the separate corrected reply-loading regression passed (12 targeted browser cases total).

### Follow-up: divider interaction reproduces the gap

The user subsequently supplied the missing trigger: hover/click/resize the divider. This reproduced a guide/focus-outline paint defect despite correct endpoint geometry. The cause, fix, and screenshot-pixel regression are recorded in [Preserve the open bridge during divider interaction](2026-10-10-divider-hover-seam.md). That follow-up supersedes the earlier gap conclusion for interactive divider states.

### Publication

The user subsequently requested a push. The reviewed changes are committed on `dev` under tracking issue [#259](https://github.com/stacky-social/client/issues/259); private ignored documentation remains local.
