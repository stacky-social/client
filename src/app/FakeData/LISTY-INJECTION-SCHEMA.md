# Listy Injection Data Schema

Data format for the listy injection prototype (`/listy-injection`). Describes the contract between backend and frontend for focus posts, related posts, and their NLP-derived relations.

## Top-level structure

```typescript
type ListyInjectionData = ListyInjectionEntry[];

interface ListyInjectionEntry {
  focusPost: FocusPost;
  relatedPosts: RelatedPost[];
  ancestors?: FocusPost[];     // optional ancestor chain (root → immediate parent)
  replies?: FocusPost[];       // optional direct replies
}
```

### Ancestors

`ancestors` is an ordered list of posts that come *above* `focusPost` in the
conversation tree.

- `ancestors[0]` is the **top-most** ancestor — typically the thread root.
- `ancestors[ancestors.length - 1]` is the **immediate parent** (the post that
  `focusPost` is a direct reply to).
- Each consecutive pair `ancestors[i]` → `ancestors[i+1]` is a direct
  parent → child relationship.
- Omitted or an empty array means `focusPost` is a root post with no parent.

Together with `replies`, the entry encodes a full vertical slice of the thread:

```
ancestors[0]            (root)
  └─ ancestors[1]
      └─ …
          └─ ancestors[N-1]    (immediate parent)
              └─ focusPost     (the post under analysis)
                  ├─ replies[0]
                  ├─ replies[1]
                  └─ …
```

Each entry in `ancestors` is a full `FocusPost`, so the UI can render
collapsed/expanded parent context exactly the same way it renders the focus
post itself.

## FocusPost

A feed post that other posts respond to.

```typescript
interface FocusPost {
  id: string;
  content: string;       // HTML (Mastodon-style, e.g. <p>...</p>)
  plainText: string;     // plain text — used as the offset base for relations
  account: {
    display_name: string;
    acct: string;
    avatar: string;
  };
  created_at: string;    // ISO 8601
  favourites_count: number;
  replies_count: number;
  favourited: boolean;
  bookmarked: boolean;
}
```

## RelatedPost

A post that relates to the focus post. Contains one or more `Relation` entries describing how specific substrings map between the two posts.

```typescript
interface RelatedPost {
  id: string;
  category: CategoryKey;   // primary relation type (used for badge, filter chips)
  rank: number;             // rank within category (1 = most relevant)
  globalRank: number;       // rank across all categories
  content: string;          // plain text of the related post
  relations: Relation[];    // offset-based substring pairs (see below)
  account: {
    display_name: string;
    acct: string;
    avatar: string;
  };
  created_at: string;
  favourites_count: number;
  replies_count: number;
  favourited: boolean;
  bookmarked: boolean;
}
```

## Relation

A single relation between a substring in the focus post and a substring in the related post. Each relation is an NLP-derived link between two passages.

```typescript
interface Relation {
  // Highlighted range on the focus post's plainText
  focusStart: number;
  focusEnd: number;

  // Highlighted range on the related post's content
  contentStart: number;
  contentEnd: number;

  // Comment: key phrase to bold within the focus post highlight
  // Must satisfy: focusStart <= focusCommentStart < focusCommentEnd <= focusEnd
  focusCommentStart: number;
  focusCommentEnd: number;

  // Comment: key phrase to bold within the related post highlight
  // Must satisfy: contentStart <= contentCommentStart < contentCommentEnd <= contentEnd
  contentCommentStart: number;
  contentCommentEnd: number;

  // Relation type for this specific substring pair
  category: CategoryKey;

  // Short topic label from NLP
  topic: string;
}
```

### Offsets

All offsets are zero-based character indices into plain text strings:

- `focusStart` / `focusEnd` / `focusCommentStart` / `focusCommentEnd` index into `focusPost.plainText`
- `contentStart` / `contentEnd` / `contentCommentStart` / `contentCommentEnd` index into `relatedPost.content`

Usage: `focusPost.plainText.slice(focusStart, focusEnd)` returns the highlighted substring.

### Topic vs Comment (NLP)

These fields follow the NLP topic-comment structure:

| Field | What it represents | Example |
|---|---|---|
| `topic` | What's being talked about (noun phrase) | "Trial results" |
| `focusComment` | The assertion/claim in the focus post highlight (predicate) | "showed no productivity drop" |
| `contentComment` | The assertion/claim in the related post highlight (predicate) | "they all confirm the same thing" |

The **topic** is the subject. The **comment** is what's being asserted about it. Comments are the phrases the UI bolds within highlights to draw the eye to key claims.

Rule of thumb: the comment is the part you'd quote if summarizing "what did they actually claim?" It's the predicate, not the subject or entity list.

### Example

Given a focus post with `plainText`:
> "The 4-day work week is not a perk ... Iceland's four-year trial covering 1% of its entire workforce showed no productivity drop. Microsoft Japan saw a 40% productivity spike ..."

And a related post with `content`:
> "The data is in and it's overwhelming. Iceland, Microsoft Japan, Unilever NZ -- they all confirm the same thing. Output doesn't suffer; it improves."

A relation between them:

```json
{
  "focusStart": 90,
  "focusEnd": 226,
  "contentStart": 38,
  "contentEnd": 133,
  "focusCommentStart": 152,
  "focusCommentEnd": 179,
  "contentCommentStart": 78,
  "contentCommentEnd": 110,
  "category": "agree",
  "topic": "Trial results"
}
```

Which resolves to:

| Field | Slice | Text |
|---|---|---|
| Focus highlight | `plainText[90:226]` | "Iceland's four-year trial covering 1% of its entire workforce showed no productivity drop. Microsoft Japan saw a 40% productivity spike." |
| Focus comment | `plainText[152:179]` | "showed no productivity drop" |
| Content highlight | `content[38:133]` | "Iceland, Microsoft Japan, Unilever NZ -- they all confirm the same thing. Output doesn't suffer;" |
| Content comment | `content[78:110]` | "they all confirm the same thing." |

### Overlapping relations

Multiple relations within the same related post can have overlapping ranges. For example, two relations might highlight overlapping portions of the related post's content with different categories. The frontend handles overlap rendering with layered gradient backgrounds and tooltips.

## CategoryKey

```typescript
type CategoryKey =
  | 'agree'
  | 'disagree'
  | 'predictions'
  | 'evidence_public'
  | 'evidence_personal'
  | 'connections'
  | 'questions'
  | 'humor'
  | 'values'
  | 'framing'
  | 'proposals'
  | 'uncategorized';
```

## Validation rules

1. A related post must have at least one relation
2. All offsets must be non-negative integers
3. `focusStart < focusEnd` and `contentStart < contentEnd`
4. Comment ranges must be within their parent highlight ranges
5. `focusStart` / `focusEnd` must be valid indices into `focusPost.plainText`
6. `contentStart` / `contentEnd` must be valid indices into the related post's `content`
7. The number of relations per related post is typically 1-4
8. If `ancestors` is present, it must be ordered root-first: `ancestors[0]` is the top-most ancestor and `ancestors[ancestors.length - 1]` is the immediate parent of `focusPost`
