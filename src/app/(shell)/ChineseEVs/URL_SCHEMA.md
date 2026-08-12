# CrossWeave detail-view URL schema

The curated `/ChineseEVs/*` routes and Mastodon-backed `/posts/[id]` route share
one detail-view URL contract. This keeps study links, copied filter states, and
browser Back/Forward behavior consistent across both data sources.

## Routes

| Path | Purpose | Data source |
|---|---|---|
| `/ChineseEVs` | Feed view (hashtag stream + per-post in-page thread) | Cursor-paginated `/api/demo/timelines/chinese-evs` contract backed by the fixture |
| `/ChineseEVs/posts/[id]` | Post-detail with threaded replies + related-post aside | Same JSON, resolver in `src/utils/mockPostResolver.ts` |
| `/posts/[id]` | Signed-in post detail | Mastodon status/context APIs plus Stacky related/reply endpoints |

The post-detail route mirrors the future `/posts/[id]` route. The same React components are shared (`Post`, `ThreadedReplyList`, `RelatedStacks`, `BackButton`, `ReplySection`) and the same URL-sync hook (`useUrlSync`) is reused, so the URL contract carries over verbatim.

## Search params

Filter params are managed by [`useUrlSync`](../../../utils/useUrlSync.ts). The
three interaction forms (`fc`, `fs`, or the complete `ft` tuple) are mutually
exclusive: starting one replaces the other rather than creating an ambiguous
combined state.

| Param | Type / format | Default | Hydration | Write | Purpose |
|---|---|---|---|---|---|
| `tab` | `time \| recommended \| stacked \| summary \| top \| liked` | `top` when the reply-sort-tabs experiment flag is on (its default), else `time`; the default is omitted from the URL | yes | yes | Active reply tab. `top`/`liked` belong to the flagged Top / Newest / Most liked set; `recommended`/`stacked`/`summary` to the legacy set — an out-of-set value is coerced on mount |
| `fc` | CSV of category keys, sorted alpha | empty | yes | yes | Active filter chips (AND semantics) |
| `fs` | `start-end` (numeric offsets into focus-post plaintext) | none | deferred until post content loads | yes | Focus-span filter from clicking a mark on the focus post |
| `ft` | non-empty normalized topic key | none | yes, when the complete tuple resolves | yes | Cross-pane topic/group key |
| `fo` | `aside \| replies` | none | with `ft` | yes | Pane where the topic interaction began; that pane groups and the other filters |
| `fa` | `{post-id}` | none | with `ft` | yes | Post containing the topic anchor |
| `fi` | non-negative integer | none | with `ft` | yes | Relation-range index within the anchor post |
| `from` | `{post-id}` | none | one-shot on mount (seeds `previousPath`) | no | Back-link source — sets `sessionStorage['previousPath:/.../posts/{current}']` so BackButton can render |
| `stackId` | `{stack-id}` | none | pass-through | pass-through | Preserved across navigation; not modified by `useUrlSync` |
| `related` | `{post-id}` | none | one-shot on page mount | pass-through | Shared-pairing emphasis: the matching related card in the aside is emphasised and scrolled into view |
| `flags` | comma-separated `flagKey:0\|1` entries | persisted/default condition | consumed by the experiment store, then pass-through | pass-through | Session-only study-condition provenance; filter writes and session trails preserve it without persisting it to local storage |

A topic state is accepted only when all four `ft`, `fo`, `fa`, and `fi` fields
are syntactically valid. Once related data is loaded, the anchor is resolved
against the actual relations. A stale topic/anchor pair is cleared atomically
and the four fields are removed from the visible URL.

### `tab` — label ↔ value mapping (for log readers)

The flagged sort tabs render as **Top / Newest / Most liked** but write partly
**legacy internal values**, kept for URL back-compat — don't be confused when
reading logs or shared URLs:

| UI label | URL value |
|---|---|
| Top | `tab=top` |
| Newest | `tab=time` (legacy value — *not* `newest`) |
| Most liked | `tab=liked` |

The legacy tab set (rendered when the reply-sort-tabs experiment flag is off)
uses its internal values directly: `time`, `recommended`, `stacked`, `summary`.

### `related` — shared pairing

Written by the aside's **"Share pairing"** action, which copies
`…/ChineseEVs/posts/{focusId}?related={relatedId}` to the clipboard (sharing the
focus post itself omits the param). On page mount the detail route reads
`related` once and passes it to the aside as `highlightPostId`: the matching
related card is emphasised and smooth-scrolled into view. If the id isn't among
the post's related responses (stale/invalid link, or the post was suppressed
into the thread) the page still renders normally and shows a "Pairing
unavailable" notice.

`related` is in `useUrlSync`'s pass-through set (alongside `from`, `stackId`, and
`flags`), so filter-history writes preserve it and re-copying the visible URL
keeps the pairing.

### Reserved (not yet wired)

These are intentionally absent today but reserved for forward compatibility:

| Param | Intended use | Why not wired yet |
|---|---|---|
| `anchor` | Active see-more anchor (single `reRankAnchorIds[0]`) | Open call #6 — sharing of see-more cluster state. Restore would also need `show={n}` for `shownByAnchor` pagination. |
| `aside` | Explicit aside post id (when different from route's focus post) | Open call #7 — aside currently derives from route id; deep-link to a non-default aside post is not yet a use case. |

If/when these land, follow the same patterns as the current managed dimensions:
hydrate from the URL, write a complete state, and respect all pass-through
parameters.

## Hydration semantics

1. **Read direction:** initial load and `popstate` parse the complete URL state.
   Passage hydration waits for plaintext; valid-but-foreign tab values wait
   briefly for the experiment condition to settle, then normalize away.
2. **Write direction:** a genuine tab/category/passage/topic gesture pushes a
   real same-document history entry. All managed dimensions are serialized
   together and pass-through provenance is copied forward.
3. **Bounded history:** the first 24 filter transitions push. The 25th and later
   transitions replace the newest entry until Back frees capacity. This gives
   predictable Back undo without unbounded browser history.
4. **Back/Forward restoration:** `popstate` restores the public URL dimensions
   plus an in-memory snapshot of exact panel/reply ordering. Snapshot matching
   is scoped by both detail pathname and focus id, including live `/posts/[id]`.
5. **Passage text reconstruction:** `?fs=12-89` carries offsets only. The `text`
   field of `responseFilter` is reconstructed from
   `plainPostText.slice(start, end)` after the post loads.
6. **`?from` is one-shot:** it seeds
   `sessionStorage['previousPath:{pathname}']` for the visible in-app Back
   control. Browser Back independently owns filter-by-filter undo.

## How a study deep-link reconstructs

A category-filter URL like:

```
/ChineseEVs/posts/112880124583497150?fc=connections,framing&tab=recommended&from=112854373877034288&flags=replySortTabs:0
```

reconstructs:
- Focus post `112880124583497150`
- Connections + Framing filter chips active
- Recommended tab active (with `onHydratedTab` triggering the data fetch in the real route)
- Back-button labeled "Back" pointing to post `112854373877034288`
- The legacy reply-tab study condition for this session

A topic URL uses a complete atomic tuple, for example:

```
/ChineseEVs/posts/112880124583497150?ft=Battery+supply&fo=aside&fa=112880100000000000&fi=2
```

## Compatibility with the future production route

The live `/posts/[id]` route already uses the same schema and URL-sync hook.
Differences remain in the data layer: Mastodon/Stacky APIs for the live route,
and the simulated cursor API plus fixture resolver for curated demo content.
