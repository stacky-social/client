# Backend integration and user-study plan

This is a planning artifact only. No changes have been made to the Mastodon fork.

## What exists today

The frontend now consumes the `/ChineseEVs` fixture through a typed, cursor-paginated
API boundary. The bundled `/api/demo` route simulates latency and backend enrichment;
`src/services/demoApiClient.ts` is the seam a live adapter can replace.

The server repository is cloned at `/Users/tarikmetin/Desktop/DevWork/server`.
Its branches have materially different roles:

- `main` is essentially upstream Mastodon 4.3-alpha and has no Stacky related-post API.
- `dev` contains the Stacky injection work and is the branch to inventory before any
  migration. It is also substantially behind/diverged from `main`, so it should not
  be merged blindly.
- `prod` contains an older production snapshot.
- `tom-data-injection` is an earlier checkpoint of the injection work.

The `dev` branch already exposes standard Mastodon OAuth and status APIs for login,
timelines, posting, replies, favourites, bookmarks, and status context. It also has
custom `/inject-data/*` routes that create external accounts/posts through ActivityPub
internals, tag injected statuses, suppress outgoing federation for injected objects,
and maintain a synthetic favourite count.

Important gaps in that custom path:

- Access is restricted by a hard-coded IP address and the controller still contains
  an authentication TODO. It should use a scoped service credential, not network
  location as identity.
- The `modify` action is a dry run.
- Request bodies and debug details are printed to logs.
- The create/delete pipeline bypasses several normal remote verification checks.
- The Mastodon post service calls the curate service synchronously at a hard-coded
  `https://beta.stacky.social:3002` URL and does not define robust timeouts/retries.
- Related-stack reads are not implemented in this repository; port `3002` is a
  separate curate/index service that must be inventoried independently.

## Recommended target boundary

Keep Mastodon as the source of truth for identity, original posts, thread hierarchy,
and user actions. Keep relation/LLM output in a separate enrichment service. Do not
rewrite the canonical Mastodon status body.

| Frontend need | Live source | Notes |
|---|---|---|
| Login/current user | Mastodon OAuth + `verify_credentials` | Prefer authorization-code + PKCE/BFF; never ship a client secret in `NEXT_PUBLIC_*`. |
| Home/tag feeds | Mastodon timeline endpoints | Preserve Mastodon's `Link` cursor headers and normalize them in the client adapter. |
| Full post | Mastodon status endpoint | Canonical, unmodified content. |
| Ancestors/descendants | Mastodon status context endpoint | Already returns both collections. |
| Post/reply | Mastodon status create endpoint | Use an idempotency key for retries. |
| Like/bookmark | Mastodon favourite/bookmark endpoints | Keep the existing optimistic UI and revert on failure. |
| Related posts | Enrichment service | Cursor page keyed by canonical Mastodon status IDs. Empty results are a normal success. |
| Contextual AI edit | Enrichment service | Return edit text, reason, provenance/version, and original-content hash; never overwrite the status. |

A proposed related-post response shape:

```json
{
  "items": [
    {
      "status": {},
      "relations": [],
      "contextual_edit": {
        "content": "...",
        "reason": "Makes the evidence-to-claim connection explicit.",
        "model": "...",
        "version": 1,
        "source_content_hash": "..."
      }
    }
  ],
  "next_cursor": "opaque-token-or-null",
  "has_more": true
}
```

The enrichment endpoint should return HTTP 200 with `items: []` when no related posts
exist. The UI should retain the selected focus post and show the existing calm empty
state, not hide the panel or report an error.

## Migration sequence

1. **Establish a reproducible server baseline.** Record the deployed commit and
   database schema, compare `dev` with `prod`, then rebase the small Stacky-specific
   changes onto a supported Mastodon release in isolated commits. Add request specs
   before changing behavior.
2. **Connect standard Mastodon capabilities first.** Implement a live adapter behind
   the same frontend service interface used by the simulator. Wire OAuth/current user,
   tag/home timelines, status/context, create/reply, favourite, and bookmark. Run the
   demo and live adapters in parallel behind a flag until their normalized entities
   pass the same contract tests.
3. **Harden curated import.** Replace `/inject-data/*` with a versioned internal API,
   scoped service tokens, JSON-schema validation, idempotency keys, audit records, and
   Sidekiq jobs. Provide validate/dry-run, import-status, retry, and delete/rollback
   operations. Remove parameter logging and hard-coded caller IPs.
4. **Import `#ChineseEVs` topologically.** Create/resolve authors first, import root
   statuses, then replies in parent-before-child order. Persist a mapping from fixture
   IDs/source URIs to Mastodon status IDs. Apply the public `ChineseEVs` tag separately
   from private provenance tags. Re-run the import to prove idempotency.
5. **Connect enrichment.** Index status create/update/delete asynchronously using an
   outbox/job pattern. Add cursor-paginated related reads. Store relations and
   contextual edits against canonical status IDs and an original-content hash so a
   stale edit is never shown after the source changes.
6. **Exercise merge scenarios.** Cover zero, one, ten, and hundreds of related posts;
   deleted/private/muted related statuses; missing topics; stale enrichments; failed
   enrichment calls; and mixed injected/user-created conversations.
7. **Release progressively.** Internal seed users, then study participants, then a
   small production cohort. Track latency/error budgets separately for Mastodon and
   enrichment so related-post failures never block ordinary social actions.

## Curated import checklist

- Confirm the source and reuse rights for every post and avatar.
- Decide whether imported authors represent real identities, pseudonymous study
  identities, or clearly labeled synthetic accounts.
- Use stable source URIs and a unique `(source, external_id)` constraint.
- Preserve original timestamps and reply relationships.
- Sanitize HTML through Mastodon's normal formatting path.
- Keep injected/synthetic engagement separate from real user engagement in storage;
  decide explicitly whether the UI shows a combined or split count.
- Make import deletion reversible and auditable.
- Ensure injected objects cannot federate unless that is an explicit product decision.

## Formative usability study

### Questions

1. Can people understand why a related post is relevant without coaching?
2. Does the “Modified by AI” disclosure increase comprehension without implying that
   the original author wrote the added words?
3. Can people distinguish the compact contextual edit from the canonical full post?
4. Do pagination, loading, and empty-related states feel responsive and trustworthy?
5. Can people complete ordinary social tasks (login, post, reply, like, bookmark) while
   using related-post exploration?

### Suggested design

Run a formative, moderated study with 12–18 participants split between frequent social
media users and people who regularly read long discussion threads. Counterbalance two
conditions:

- **A:** related highlighting with original text only;
- **B:** related highlighting plus the contextual AI disclosure and track changes.

Use the same posts but rotate task order. Do not compare an obviously polished
condition with a broken control; both must include identical navigation and latency.

### Tasks

1. Sign in and find the `#ChineseEVs` discussion.
2. Explain the focus post's main claim in one sentence.
3. Choose a related post and explain why it is connected.
4. Inspect a “Modified by AI” disclosure and identify which words came from the
   original author versus the AI.
5. Open that post full screen, find an ancestor and a descendant, then return.
6. Like and bookmark a post, write a reply, and verify each action persists.
7. Continue to later feed/related pages.
8. Select a post with no related results and say what they expect to happen next.

### Measures

- Task completion and critical errors.
- Time to first meaningful feed content and time to identify a relevant response.
- Relation-comprehension accuracy, scored blind from the participant's explanation.
- AI provenance comprehension: “Who wrote the green text?” and “Was the original post
  changed?”
- Trust/confidence after each condition (7-point scale).
- Perceived speed after initial load and pagination (7-point scale).
- UMUX-Lite or SUS at the end, plus a short preference interview.

Instrument only study-relevant events: timeline page requested/rendered, related panel
opened, empty panel shown, AI badge hover/focus/click, diff visible duration, related
post opened, full-post back navigation, like/bookmark/reply attempt/result, and request
latency/error. Use random study IDs; do not record post drafts or free-form content
without explicit consent.

### Pilot acceptance checks

- At least 80% correctly identify AI-added versus original wording.
- At least 80% successfully open a related post and return to the same panel state.
- Zero participants interpret an empty related panel as a crash.
- No pagination duplicates or omissions in a scripted 100-item fixture.
- Optimistic actions reconcile correctly under 300 ms, 1.5 s, and failed requests.
- Keyboard-only participants can reveal and dismiss the diff and retain visible focus.

## Decisions needed before backend implementation

- Which server branch/commit is actually deployed at `beta.stacky.social`?
- Where is the curate/index service that owns port `3002`?
- Should contextual edits be generated at ingestion time or on demand, and who approves
  them before study use?
- Are imported counts meant to simulate historical engagement or remain visibly
  separate from real engagement?
- What retention/consent policy applies to study telemetry and participant replies?
