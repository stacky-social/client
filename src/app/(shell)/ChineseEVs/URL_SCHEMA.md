# Baby Stacky — URL schema

The `/ChineseEVs/*` routes are the research prototype ("baby stacky") for the future production Stacky system. This doc defines the URL contract so studies, deep-links, and the eventual production routes stay consistent.

## Routes

| Path | Purpose | Data source |
|---|---|---|
| `/ChineseEVs` | Feed view (hashtag stream + per-post in-page thread) | `src/app/FakeData/listy-injection.json` |
| `/ChineseEVs/posts/[id]` | Post-detail with threaded replies + related-post aside | Same JSON, resolver in `src/utils/mockPostResolver.ts` |

The post-detail route mirrors the future `/posts/[id]` route. The same React components are shared (`Post`, `ThreadedReplyList`, `RelatedStacks`, `BackButton`, `ReplySection`) and the same URL-sync hook (`useUrlSync`) is reused, so the URL contract carries over verbatim.

## Search params

All params are managed by [`useUrlSync`](../../../utils/useUrlSync.ts) unless noted.

| Param | Type / format | Default | Hydration | Write | Purpose |
|---|---|---|---|---|---|
| `tab` | `time \| recommended \| stacked \| summary \| top \| liked` | `top` when the reply-sort-tabs experiment flag is on (its default), else `time`; the default is omitted from the URL | yes | yes | Active reply tab. `top`/`liked` belong to the flagged Top / Newest / Most liked set; `recommended`/`stacked`/`summary` to the legacy set — an out-of-set value is coerced on mount |
| `fc` | CSV of category keys, sorted alpha | empty | yes | yes | Active filter chips (AND semantics) |
| `fs` | `start-end` (numeric offsets into focus-post plaintext) | none | deferred until post content loads | yes | Focus-span filter from clicking a mark on the focus post |
| `from` | `{post-id}` | none | one-shot on mount (seeds `previousPath`) | no | Back-link source — sets `sessionStorage['previousPath:/.../posts/{current}']` so BackButton can render |
| `stackId` | `{stack-id}` | none | pass-through | pass-through | Preserved across navigation; not modified by `useUrlSync` |
| `related` | `{post-id}` | none | one-shot on page mount | no — ⚠️ dropped by the first debounced write (see below) | Shared-pairing emphasis: the matching related card in the aside is emphasised and scrolled into view |

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

### `related` — shared pairing (one-shot; known limitation)

Written by the aside's **"Share pairing"** action, which copies
`…/ChineseEVs/posts/{focusId}?related={relatedId}` to the clipboard (sharing the
focus post itself omits the param). On page mount the detail route reads
`related` once and passes it to the aside as `highlightPostId`: the matching
related card is emphasised and smooth-scrolled into view. If the id isn't among
the post's related responses (stale/invalid link, or the post was suppressed
into the thread) the page still renders normally and shows a "Pairing
unavailable" notice.

> ⚠️ **Known limitation — the param is currently one-shot.** `related` is
> **not** in `useUrlSync`'s pass-through set (only `from` and `stackId` are
> preserved on write), so the first debounced `router.replace` (~300 ms after
> mount) rewrites the URL without it. The emphasis still applies — it was read
> at mount — but **re-copying the visible URL loses the pairing**.
>
> **TODO (audit F-46):** add `related` to the pass-through set alongside
> `from`/`stackId`, after the in-flight tab-validation change (audit F-1) lands
> in `useUrlSync`.

### Reserved (not yet wired)

These are intentionally absent today but reserved for forward compatibility:

| Param | Intended use | Why not wired yet |
|---|---|---|
| `anchor` | Active see-more anchor (single `reRankAnchorIds[0]`) | Open call #6 — sharing of see-more cluster state. Restore would also need `show={n}` for `shownByAnchor` pagination. |
| `aside` | Explicit aside post id (when different from route's focus post) | Open call #7 — aside currently derives from route id; deep-link to a non-default aside post is not yet a use case. |

If/when these land, follow the same patterns as `fc` and `fs`: hydrate once per pathname, write back debounced, and respect the `from`/`stackId` pass-through contract.

## Hydration semantics

1. **Read direction (mount):** the first effect under a given `pathname` reads `?tab` / `?fc` / `?fs` once and applies to local state. A `hydratedRef` guards against re-application until the route changes.
2. **Write direction (state change):** any change to `activeTab`, `filterCategories`, or `responseFilter` (the "Responses to" passage filter) schedules a `router.replace()` with a 300 ms debounce. `router.replace` (not `push`) — filter toggles don't pollute history.
3. **Passage text reconstruction:** `?fs=12-89` carries offsets only (the `fs` param key is kept for URL back-compat). The `text` field of `responseFilter` is reconstructed from `plainPostText.slice(start, end)` after the post loads. Hand-edited URLs need to know the post's exact text.
4. **`?from` is one-shot:** seeded into `sessionStorage` on mount, never written. The `BackButton` reads from `sessionStorage['previousPath:{pathname}']` on its own mount. Navigating away clears the read but the storage entry stays until next session.

## How a study deep-link reconstructs

A URL like:

```
/ChineseEVs/posts/112880124583497150?fc=connections,framing&fs=12-89&tab=recommended&from=112854373877034288
```

reconstructs:
- Focus post `112880124583497150`
- Connections + Framing filter chips active
- Focus-span filter on plaintext offsets `12..89`
- Recommended tab active (with `onHydratedTab` triggering the data fetch in the real route)
- Back-button labeled "Back" pointing to post `112854373877034288`

## Compatibility with the future production route

When the real Stacky platform exposes `/posts/[id]`, it can adopt the same schema unchanged — `useUrlSync` is shared. Differences will live only in the **data layer** (live Mastodon API vs. `mockPostResolver`).
