# Group I — Simulated Feedback Polish: Design Spec

**Date:** 2026-05-13
**Branch:** worktree-agent-a9f6fe233f47dca02
**PR base:** tarcode2004/enhancement/listy-injection-main-app
**Author (agent):** Group I

---

## 1. Problem Statement

The existing `ReplySection.tsx` already implements real-time simulated feedback (debounced fetch, advice/praise display, simulated robot replies, 5-second countdown gate). However a close comparison of the current implementation against the reference screenshots surfaces several visual and behavioral gaps.

---

## 2. Scope

**In scope (this group):**
- Fix per-robot avatar cycling (all robots currently show the same avatar).
- Tighten "SIMULATED" badge styling to match screenshots (pill, uppercase text, clear contrast).
- Polish the "Feedback" paper: ensure bold header renders correctly, add gentle visual separation between praise and advice.
- Verify and improve the submit button disabled-state styling (countdown text, grey color).
- Remove the unused `avatar` state variable (dead code after per-robot fix).
- SubmitPost extension: see Judgment Call #1 below — **skipped** due to API constraint.

**Out of scope:**
- RelatedStacks.tsx, HoverTooltip.tsx, Shell.tsx, ThreadedReplyList.tsx, Post.tsx, highlightStore.ts.
- Any new routes or pages.
- Any changes to the feedback API itself.

---

## 3. Current vs. Target State

### 3a. Per-Robot Avatars

| Current | Target |
|---------|--------|
| `<Avatar src={avatar} />` where `avatar = avatars[0]` (always `stacky_angry.PNG`) | `<Avatar src={avatars[index % avatars.length]} />` — distinct robot face per row |

### 3b. SIMULATED Badge

| Current | Target |
|---------|--------|
| `color="gray" variant="outline"` — rendered in Mantine's default small text size | Keep `color="gray" variant="outline"` but add `tt="uppercase"` for all-caps, `fw={700}`, and explicit `fontSize: '10px'` already present. Also verify badge text is exactly "SIMULATED" (it is). |

After reading the code the badge is already structurally correct (gray outline, positioned top-right, 10px). The only missing piece is the all-caps transform which Mantine `Badge` does NOT apply by default even with uppercase text — `tt="uppercase"` fixes it. The screenshots show "SIMULATED" in all-caps with a slightly heavier feel.

### 3c. Robot Card Layout

The avatar and "Robot N" label sit in a `<Group>` but the label div only has a single `<Text>` child. The screenshots show the robot name appears slightly bolder and at medium size. Current: `fw="700" size="sm"`. This is acceptable — no change needed.

### 3d. Submit Button Disabled State

Current: `style={{ backgroundColor: isDisabled ? 'grey' : 'green' }}`. The countdown label reads `Submit? (Wait N seconds)` which is verbose and shows a question mark. This is functional but the question mark is odd. Change to `Wait ${countdown}s…` for clarity and conciseness while keeping the same UX intent.

The button already goes grey while disabled — this matches the screenshots adequately. No further styling change needed.

### 3e. Feedback Paper Nesting

Currently there is a `<Paper>` wrapping the outer feedback block AND a nested `<Paper>` inside for the advice/praise section, both with identical `backgroundColor: '#f9f9f9'`. This double-nesting is invisible visually but causes unnecessary DOM nesting. Flatten: keep the outer Paper as the card boundary; make the inner advice block just a `<div>` with bottom margin.

### 3f. Dead Code Removal

`const [avatar, setAvatar] = useState(avatars[0])` — `setAvatar` is never called; the state is only read in the old per-robot render (which we are replacing). Remove this state variable after the fix.

---

## 4. SubmitPost Extension Analysis

The `/posts/feedback` API call in `ReplySection.tsx` sends:
```json
{ "draftID": "...", "parentPostID": "<postId>", "draftText": "..." }
```

`parentPostID` is always the current post's ID. There is no documentation in the codebase about whether `parentPostID: null` is accepted for top-level posts. The field name "parentPostID" strongly implies a reply context is required by the backend contract.

Attempting to call the endpoint with `parentPostID: null` or omitting it would require runtime verification against the live backend. Running speculative API calls against production without the user's explicit confirmation of that contract is outside YAGNI bounds for a polish pass.

**Judgment Call #1 — Skip SubmitPost extension.** The feature is not extended to the top-level post composer. This is documented here and will be called out in the PR description as a known limitation.

---

## 5. Judgment Calls

| # | Decision | Rationale |
|---|----------|-----------|
| JC1 | Skip SubmitPost.tsx simulated-feedback extension | `parentPostID` field name implies reply context; no API doc for null case; YAGNI for polish pass |
| JC2 | Keep `color="gray" variant="outline"` for SIMULATED badge | Matches screenshots — gray pill outline is visible and distinct |
| JC3 | Flatten inner Paper nesting | No visual impact, cleaner DOM; low-risk refactor |
| JC4 | Change countdown label from `Submit? (Wait N seconds)` to `Wait Ns…` | Shorter, no question mark ambiguity; same behavioral intent |
| JC5 | Do not add a separate CSS module for ReplySection | Component is self-contained with inline styles; adding a module file would be disproportionate |

---

## 6. Visual Gaps That Cannot Be Addressed Without More Design Input

- The screenshots show robot cards with a subtle left-colored accent border (hard to tell if it is a design intent or screenshot compression artifact). No change made without confirmation.
- The "Feedback" paper background in screenshots appears pure white (`#fff`) rather than the current `#f9f9f9`. This is a judgment call to leave as-is since `#f9f9f9` provides a subtle but useful visual distinction.
