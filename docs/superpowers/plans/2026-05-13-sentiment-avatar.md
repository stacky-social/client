# Sentiment-Driven Feedback Avatars Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace index-based avatar selection in `ReplySection` simulated replies with a content-aware keyword classifier that picks one of 8 emotion avatars per reply.

**Architecture:** New `src/utils/sentimentAvatar.ts` exports `pickAvatarForText(text)`. `ReplySection.tsx` imports it and uses it in place of the existing `avatars[index % avatars.length]` expression. Pure client-side, no dependencies, no async work.

**Tech Stack:** TypeScript, React (Next.js 14), Mantine v7. No test framework in this repo (per `CLAUDE.md`) — verification is manual via `pnpm dev`.

**Base branch:** `tarcode2004/enhancement/listy-injection-main-app` (already the upstream for this worktree). PR will target that branch, not `dev`.

---

## Task 0: Sync branch and commit the spec

**Files:**
- Existing: `docs/superpowers/specs/2026-05-13-sentiment-avatar-design.md` (untracked)

- [ ] **Step 1: Fast-forward to upstream listy-injection**

```bash
git pull --ff-only
```

Expected: branch advances to include commit `1a21972` ("Expand listy-injection dataset and switch post dates to absolute"). If pull fails with a non-fast-forward error, stop and report — do not force.

- [ ] **Step 2: Commit the spec**

```bash
git add docs/superpowers/specs/2026-05-13-sentiment-avatar-design.md docs/superpowers/plans/2026-05-13-sentiment-avatar.md
git commit -m "Add sentiment-driven avatar spec and plan"
```

Expected: one commit added on `claude/crazy-dubinsky-e849e8`.

---

## Task 1: Create the sentiment classifier utility

**Files:**
- Create: `src/utils/sentimentAvatar.ts`

- [ ] **Step 1: Write the classifier module**

Create `src/utils/sentimentAvatar.ts` with this exact content:

```ts
export type EmotionKey =
  | 'angry'
  | 'cracked'
  | 'default'
  | 'haha'
  | 'love'
  | 'queasy'
  | 'sad'
  | 'sweet';

export const AVATAR_BY_EMOTION: Record<EmotionKey, string> = {
  angry: '/avatar/stacky_angry.PNG',
  cracked: '/avatar/stacky_cracked.PNG',
  default: '/avatar/stacky_default.PNG',
  haha: '/avatar/stacky_haha.PNG',
  love: '/avatar/stacky_love.PNG',
  queasy: '/avatar/stacky_queasy.PNG',
  sad: '/avatar/stacky_sad.PNG',
  sweet: '/avatar/stacky_sweet.PNG',
};

const KEYWORDS: Record<Exclude<EmotionKey, 'default'>, readonly string[]> = {
  angry: ['angry', 'hate', 'awful', 'terrible', 'worst', 'stupid', 'ridiculous', 'furious', 'mad', 'outrage', 'wrong', 'bad', 'no', 'never'],
  cracked: ['crazy', 'insane', 'wild', 'bizarre', 'weird', 'whoa', 'wow', 'unbelievable', 'mind-blown'],
  haha: ['haha', 'lol', 'lmao', 'rofl', 'funny', 'hilarious', 'joke', 'laugh', 'lmfao'],
  love: ['love', 'amazing', 'brilliant', 'wonderful', 'perfect', 'fantastic', 'beautiful', 'incredible', 'awesome', '❤'],
  queasy: ['gross', 'ew', 'ugh', 'yuck', 'nasty', 'vile', 'disgusting', 'eww'],
  sad: ['sad', 'sorry', 'unfortunately', 'disappointed', 'regret', 'miss', 'lonely', 'hurt', 'cry'],
  sweet: ['sweet', 'nice', 'kind', 'thanks', 'thank', 'appreciate', 'glad', 'happy', 'lovely', 'agree', 'good'],
};

const PRIORITY: readonly EmotionKey[] = ['love', 'angry', 'haha', 'sad', 'queasy', 'cracked', 'sweet', 'default'];

function normalize(text: string): string {
  return text
    .replace(/<[^>]*>/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function countMatches(text: string, keyword: string): number {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = /^[a-z0-9]+$/.test(keyword)
    ? new RegExp(`\\b${escaped}\\b`, 'g')
    : new RegExp(escaped, 'g');
  return (text.match(pattern) ?? []).length;
}

export function pickAvatarForText(text: string): string {
  const normalized = normalize(text);
  if (!normalized) return AVATAR_BY_EMOTION.default;

  const scores = new Map<EmotionKey, number>();
  for (const [emotion, words] of Object.entries(KEYWORDS) as [Exclude<EmotionKey, 'default'>, readonly string[]][]) {
    let score = 0;
    for (const w of words) score += countMatches(normalized, w);
    if (score > 0) scores.set(emotion, score);
  }

  if (scores.size === 0) return AVATAR_BY_EMOTION.default;

  const max = Math.max(...scores.values());
  for (const emotion of PRIORITY) {
    if (scores.get(emotion) === max) return AVATAR_BY_EMOTION[emotion];
  }
  return AVATAR_BY_EMOTION.default;
}
```

Notes for the engineer:
- Word-boundary matching avoids `"national"` lighting up the `"no"` keyword.
- Emoji like `❤` aren't word-bounded, so the function falls back to substring match for non-alphanumeric keywords.
- `PRIORITY` only matters for ties; otherwise the highest count wins directly.

- [ ] **Step 2: Type-check**

Run: `pnpm lint`

Expected: no new errors related to `sentimentAvatar.ts`. If lint reports unrelated warnings already present on the branch, that's fine — only fail on new ones.

- [ ] **Step 3: Quick smoke test in Node**

Run a one-off REPL check (does not commit anything):

```bash
npx tsx -e "import('./src/utils/sentimentAvatar.ts').then(m => { console.log('love', m.pickAvatarForText('I love this, amazing point!')); console.log('angry', m.pickAvatarForText('this is the worst, terrible take')); console.log('neutral', m.pickAvatarForText('Okay, I see what you mean.')); console.log('empty', m.pickAvatarForText('')); console.log('html', m.pickAvatarForText('<p>haha lol so funny</p>')); })"
```

Expected output (paths, not labels — labels here for clarity):
```
love /avatar/stacky_love.PNG
angry /avatar/stacky_angry.PNG
neutral /avatar/stacky_default.PNG
empty /avatar/stacky_default.PNG
html /avatar/stacky_haha.PNG
```

If `tsx` is unavailable, skip this step — Task 2's manual UI verification covers correctness.

- [ ] **Step 4: Commit**

```bash
git add src/utils/sentimentAvatar.ts
git commit -m "Add sentiment-driven avatar utility"
```

---

## Task 2: Wire it into ReplySection

**Files:**
- Modify: `src/components/ReplySection.tsx`

- [ ] **Step 1: Add the import**

In `src/components/ReplySection.tsx`, just after the existing imports at the top of the file (after the `import axios from 'axios';` and `import { v4 as uuidv4 } from 'uuid';` lines), add:

```ts
import { pickAvatarForText } from '../utils/sentimentAvatar';
```

- [ ] **Step 2: Remove the unused avatars array**

Delete lines 14–23 (the `const avatars = [...]` block that lists the 8 PNG paths). It is no longer referenced after Step 3.

- [ ] **Step 3: Replace the avatar src expression**

Find this line (currently around line 223):

```tsx
<Avatar src={avatars[index % avatars.length]} radius="xl" />
```

Replace with:

```tsx
<Avatar src={pickAvatarForText(reply.content)} radius="xl" />
```

- [ ] **Step 4: Type-check and lint**

Run: `pnpm lint`

Expected: no errors. If lint complains about an unused `index` parameter in the `.map((reply, index) => …)` callback, change the callback to drop `index`: `.map((reply, _index) => …)` or `.map((reply) => …)`. (Confirm by reading the surrounding JSX; if `index` is still used as the React `key={index}`, leave it.)

- [ ] **Step 5: Manual UI verification**

```bash
pnpm dev
```

Then in a browser at `localhost:3000`:
1. Log in via the OAuth flow if not already authed.
2. Open a thread, click into a post that has a reply box.
3. Type a clearly positive reply (e.g., `"I love this, amazing point!"`) — wait for the debounced feedback panel to appear.
4. Confirm the simulated robot reply card shows an avatar matching the reply's tone (one of `love`, `sweet`, or `haha` — not always `angry`).
5. Type a clearly negative reply (e.g., `"this is terrible, worst take"`) and confirm the avatar changes to `angry` or `sad`.
6. Type a neutral reply (e.g., `"Interesting, will think about it."`) and confirm `default`.

Verification claim: only mark complete if you actually saw the avatars change in the browser. If you can't get the feedback panel to populate (e.g., backend unavailable), say so explicitly rather than claim success.

- [ ] **Step 6: Commit**

```bash
git add src/components/ReplySection.tsx
git commit -m "Use sentiment-based avatar in ReplySection simulated replies"
```

---

## Task 3: Open the PR

- [ ] **Step 1: Push the branch**

```bash
git push -u origin claude/crazy-dubinsky-e849e8
```

- [ ] **Step 2: Create the PR against the listy-injection branch**

```bash
gh pr create \
  --base tarcode2004/enhancement/listy-injection-main-app \
  --title "Pick simulated-reply avatar from content sentiment" \
  --body "$(cat <<'EOF'
## Summary
- Add `src/utils/sentimentAvatar.ts`: a keyword classifier that maps reply text to one of 8 stacky avatars.
- `ReplySection.tsx`: replace `avatars[index % avatars.length]` with `pickAvatarForText(reply.content)`. Robot 1 is no longer always angry.

## Test plan
- [ ] Manual: positive reply shows a positive avatar
- [ ] Manual: negative reply shows angry/sad avatar
- [ ] Manual: neutral reply shows default avatar
- [ ] `pnpm lint` clean
EOF
)"
```

Notes:
- Confirm with the user before pushing or opening the PR. Pushing is reversible but visible — get an explicit go-ahead.
- Do not target `dev` — `--base` must be `tarcode2004/enhancement/listy-injection-main-app`.

---

## Self-Review

- **Spec coverage:** Utility module ✓, algorithm ✓, keyword sets ✓, ReplySection wire-up ✓, manual verification ✓, branch/PR target ✓.
- **Placeholders:** None — every step has real code, real commands, real expected output.
- **Type consistency:** `EmotionKey`, `AVATAR_BY_EMOTION`, `pickAvatarForText` defined in Task 1; only `pickAvatarForText` is imported in Task 2. Signatures match.
- **Test discipline:** Repo has no test framework, so TDD is replaced with a focused manual verification step in Task 2 and a smoke test in Task 1. This is the appropriate adaptation per CLAUDE.md.
