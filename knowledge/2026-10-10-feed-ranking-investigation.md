---
knowledge_type: reference
decision_status: reference
visibility: public
title: Home ordering differs across browser sessions, not corpus branches
recorded_on: 2026-10-10
---

# Home ordering and branch comparison

The user reported different posts between local dev and the older x-weave.org deployment and suspected removed ranking.

## Findings

- The October UX commit `9146c11` changes neither the corpus JSON nor Home ordering, importer, reply ranking, or mock resolver.
- The latest corpus import across available local/remote refs is `f4fd795` (2026-09-21), already included in dev. Modern branches share the same `scale-demo.json` blob; older branches retain the preceding import, not newer ranking work.
- Imported related-post order is ascending `mergedRank` with stable ID ties; the importer writes the resulting `globalRank`. Related-stack construction preserves this array order until an explicit filter/grouping gesture.
- The Top replies comparator prefers imported `mergedRank` via `getMockReplyRank`, falling back to the older rank and then the existing heuristic.
- Home first selects the curated collection, but **then shuffles it per browser tab/session** in `PostList.tsx`. The sessionStorage key is `crossweave:curatedHomeSeed:v1`. This was introduced by `c7faebb` (2026-08-31, #228), not the October UX work. The store's newest-first sort is therefore not Home's final displayed order.

## Browser evidence

Fresh isolated browser contexts on `https://www.x-weave.org/home` and local dev initially displayed different Home orders. Giving both test contexts the same seed (`ranking-comparison-2026-10-10`) produced exactly identical complete rendered Home ID sequences.

On `/Tariffs/posts/cw-bpvqBrw_B23dLVfY`, the first ten rendered related-post IDs and their order also matched exactly between live and local dev, without changing ranking or adding a filter.

The test changed only isolated automation contexts; it did not clear or modify the user's browser state. Different saved filters, reply tabs, experimental settings, or authenticated Home mode can still affect an existing user session. A specific differing URL/post is needed to investigate those separately.

No ranking or post data was changed during this investigation. The previously reported statement that Home displays newest-first was incomplete: the downstream session shuffle determines its visible order.
