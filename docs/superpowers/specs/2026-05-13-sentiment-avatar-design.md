# Sentiment-Driven Feedback Avatars

## Problem

In [`src/components/ReplySection.tsx`](../../../src/components/ReplySection.tsx), each simulated robot reply gets its avatar via `avatars[index % avatars.length]`. The first entry in that array is `stacky_angry.PNG`, and since the backend typically returns one or a small number of simulated replies, **Robot 1 is always angry regardless of its content**. The avatar is decoupled from the reply's actual tone.

## Goal

Replace index-based avatar selection with content-aware selection: each simulated reply's avatar is chosen by running a simple sentiment/emotion classifier over `reply.content`, so a praising reply shows the love or sweet avatar, a critical reply shows angry or sad, etc.

Scope is limited to the `ReplySection` simulated-reply panel. The `annotation/page.tsx` random-avatar behavior is unchanged.

## Non-Goals

- No ML model, external API, or npm sentiment library — pure keyword lookup
- No sarcasm/irony detection
- No multilingual support (English-only keyword sets)
- No avatar for the praise/advice text block — that section keeps its current layout (no avatar)
- No changes to the backend `/posts/feedback` contract

## Approach

### Module: `src/utils/sentimentAvatar.ts`

A single new utility module exports:

```ts
export type EmotionKey =
  | 'angry' | 'cracked' | 'default' | 'haha'
  | 'love'  | 'queasy'  | 'sad'     | 'sweet';

export const AVATAR_BY_EMOTION: Record<EmotionKey, string>;
export function pickAvatarForText(text: string): string;
```

- `AVATAR_BY_EMOTION` maps each emotion key to its `/avatar/stacky_<emotion>.PNG` path
- `pickAvatarForText(text)` returns one of the 8 avatar paths

### Algorithm

1. **Normalize**: lowercase, strip HTML tags (the backend may return HTML-formatted content), collapse whitespace
2. **Score**: for each emotion bucket, count how many of its keywords appear as whole-word matches (using word-boundary regex) in the normalized text
3. **Pick winner**: emotion with the highest score wins
4. **Tie / no match**: return `default`. When two emotions tie above zero, break the tie using a fixed priority order (declared as a constant in the module) so output is deterministic and reproducible

The priority order (used only for ties) is: `love > angry > haha > sad > queasy > cracked > sweet > default`. This favors stronger emotions over milder ones when signals are mixed.

### Keyword Sets

Initial keyword lists, declared inline in the module so they're easy to audit and extend:

- **angry**: angry, hate, awful, terrible, worst, stupid, ridiculous, furious, mad, outrage, wrong, bad, no, never
- **cracked**: crazy, insane, wild, bizarre, weird, whoa, wow, unbelievable, mind-blown
- **haha**: haha, lol, lmao, rofl, funny, hilarious, joke, laugh, lmfao
- **love**: love, amazing, brilliant, wonderful, perfect, fantastic, beautiful, incredible, awesome, ❤
- **queasy**: gross, ew, ugh, yuck, nasty, vile, disgusting, eww
- **sad**: sad, sorry, unfortunately, disappointed, regret, miss, lonely, hurt, cry
- **sweet**: sweet, nice, kind, thanks, thank, appreciate, glad, happy, lovely, agree, good
- **default**: (no keywords — pure fallback)

### Wire-up in ReplySection.tsx

Replace:
```tsx
<Avatar src={avatars[index % avatars.length]} radius="xl" />
```
with:
```tsx
<Avatar src={pickAvatarForText(reply.content)} radius="xl" />
```

The local `avatars` array in `ReplySection.tsx` is no longer used and can be removed in the same change. The corresponding array in `annotation/page.tsx` stays — different feature, different purpose.

## Data Flow

```
[user types reply]
   → debounced fetchRealTimeFeedback
   → backend /posts/feedback → { advice, praise, simulatedReplies }
   → render simulatedReplies.map((reply, i) =>
        <Avatar src={pickAvatarForText(reply.content)} /> )
```

No new state, no extra requests, no async work. Sentiment is computed at render time — cheap enough (string scan over short text) that memoization is not needed.

## Edge Cases

- **Empty content**: returns `default`
- **HTML-only content** (e.g. `<p></p>`): strips to empty → `default`
- **All-caps SHOUTING**: lowercase normalization handles it
- **Multiple emotions in one reply**: highest count wins; deterministic tiebreaker if equal
- **Unicode emoji (❤)**: included as a love keyword. Other emoji are ignored in v1

## Testing

The project has no test framework configured (per `CLAUDE.md`). Verification is manual:

1. `pnpm dev`, navigate to a thread, type a reply long enough (≥10 chars) to trigger feedback
2. Confirm in the simulated-replies panel that the avatar matches the tone of each reply's content
3. Test with replies containing obvious praise words ("love this!") → love/sweet avatar
4. Test with replies containing critique words ("terrible point") → angry/sad avatar
5. Test with neutral content → default avatar

Optionally, a small `__tests__`-style assertion script can be added under `src/utils/` later, but it's out of scope for v1.

## File Changes

- **New**: `src/utils/sentimentAvatar.ts` — classifier + avatar mapping
- **Modified**: `src/components/ReplySection.tsx`
  - Remove the local `avatars` constant
  - Import `pickAvatarForText`
  - Replace the `<Avatar src=…>` expression on the simulated-reply card

No other files touched.

## Branch & PR

- Base branch: `tarcode2004/enhancement/listy-injection-main-app` (not `dev`)
- Branch name: follow the convention in `.claude/rules/branch-naming.md`
- PR body: include `Closes #<issue>` if an issue exists, keep under 400 lines (this change is ~50 lines)
