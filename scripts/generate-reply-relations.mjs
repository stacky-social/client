// Generates reply relations, reply ranks, dual-role posts, and the small-entry
// replies for the listy-injection mock dataset. Offsets are COMPUTED against the
// real strings (never hand-typed): each relation is declared as exact snippets,
// located with indexOf, and the script throws on missing/ambiguous snippets.
// Idempotent — safe to re-run; it overwrites what it owns and touches nothing else.
//
// Run: node scripts/generate-reply-relations.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(here, '../src/app/FakeData/listy-injection.json');

const BIG_ENTRY_ID = '112880124583497150';
const SMALL_ENTRY_ID = '112880110824825811';
/** Related posts that are ALSO replies to the focus post (suppression demo).
 *  Chosen to avoid ids that are another entry's focus post — those would
 *  corrupt the other entry's ancestor chain via the global parentMap. */
const DUAL_ROLE_RELATED_IDS = ['112880118820779624', '112880115863645226'];

const data = JSON.parse(readFileSync(DATA_PATH, 'utf8'));
const entry = data.find((e) => e.focusPost.id === BIG_ENTRY_ID);
if (!entry) throw new Error(`entry ${BIG_ENTRY_ID} not found`);
const focusPlain = entry.focusPost.plainText;

/** Locate `snippet` in `hay`; throw when absent or ambiguous. Returns [start, end). */
function spanIn(hay, snippet, label) {
  const i = hay.indexOf(snippet);
  if (i < 0) throw new Error(`snippet not found (${label}): ${JSON.stringify(snippet)}`);
  if (hay.indexOf(snippet, i + 1) >= 0) throw new Error(`snippet ambiguous (${label}): ${JSON.stringify(snippet)}`);
  return [i, i + snippet.length];
}

/** Optional comment sub-snippet located INSIDE the span; zero-length at span start when omitted. */
function commentSpan(hay, spanStart, spanEnd, sub, label) {
  if (!sub) return [spanStart, spanStart];
  const region = hay.slice(spanStart, spanEnd);
  const j = region.indexOf(sub);
  if (j < 0) throw new Error(`comment not inside span (${label}): ${JSON.stringify(sub)}`);
  return [spanStart + j, spanStart + j + sub.length];
}

// ─── Relation definitions ─────────────────────────────────────────────────────
// topic values reuse the entry's related-post topics wherever a cross-pane
// intersection is wanted; 'Build quality' is deliberately replies-only.

const REPLY_DEFS = [
  {
    id: 'bs-001', rank: 4, relations: [
      { category: 'framing', topic: 'Manufacturing',
        focus: 'The problem is ours, not theirs.',
        focusComment: 'ours, not theirs',
        content: 'the manufacturing-inferiority framing is the right starting point',
        contentComment: 'right starting point' },
      { category: 'values', topic: 'Affordable EV access',
        focus: 'By resorting to tariffs we’re only making consumers pay more',
        content: 'cheap EVs would benefit millions' },
    ],
  },
  {
    id: 'bs-002', rank: 9, relations: [
      { category: 'questions', topic: 'Industrial policy',
        focus: 'The fastest way a manufacturing company can boost its profits is to cut costs.',
        content: 'at what cost to long-term jobs?',
        contentComment: 'long-term jobs' },
    ],
  },
  {
    id: 'bs-003', rank: 7, relations: [
      { category: 'connections', topic: 'Climate and tradeoffs',
        focus: 'Cars, iPhones, solar panels, wind turbines, batteries, all of which we rely on China to make for us.',
        focusComment: 'solar panels, wind turbines, batteries',
        content: 'every BYD sold is a US gas car not sold' },
    ],
  },
  {
    id: 'bs-004', rank: 6, relations: [
      { category: 'evidence_personal', topic: 'Manufacturing',
        focus: 'Mortgage the future for the sake of a few more dollars today.',
        content: 'Cheap imports, towns hollowed out, then nobody around to buy the cheap stuff anyway' },
    ],
  },
  {
    id: 'bs-005', rank: 3, relations: [
      { category: 'evidence_public', topic: 'Industrial policy',
        focus: 'we blame China for our own manufacturing inferiority',
        content: 'Autor 2013 on the China shock, and Pierce-Schott 2016 on PNTR',
        contentComment: 'China shock' },
    ],
  },
  {
    id: 'bs-007', rank: 2, relations: [
      { category: 'framing', topic: 'Climate and tradeoffs',
        focus: 'our money obsessed culture that prizes profits above all else',
        content: 'Climate is the missing axis here' },
      { category: 'proposals', topic: 'Affordable EV access',
        focus: 'making consumers pay more for things that we can’t manufacture as well or as inexpensively as others can',
        content: 'The fastest path to fleet electrification is the cheapest EV, not the patriotic one',
        contentComment: 'cheapest EV' },
    ],
  },
  {
    id: 'bs-008', rank: 1, relations: [
      { category: 'evidence_personal', topic: 'Manufacturing',
        focus: 'Chinese manufacturers are adept at mass-producing electric vehicles.',
        focusComment: 'adept at mass-producing',
        content: 'BYD vertical integration is the story. They control the battery cell, the pack, the motor, and the platform.',
        contentComment: 'vertical integration' },
    ],
  },
  {
    id: 'bs-009', rank: 11, relations: [
      { category: 'evidence_personal', topic: 'Build quality',
        focus: 'can make EVs, and most other manufactured goods, better than we can',
        content: 'build quality was a notch above what I expected' },
    ],
  },
  {
    id: 'bs-010', rank: 10, relations: [
      { category: 'framing', topic: 'Build quality',
        focus: 'The fastest way a manufacturing company can boost its profits is to cut costs.',
        content: 'Cost engineering does not equal corner cutting',
        contentComment: 'corner cutting' },
    ],
  },
  {
    id: 'bs-011', rank: 5, relations: [
      { category: 'connections', topic: 'Industrial policy',
        focus: 'Over the past few decades we’ve rationalized becoming',
        content: 'the retraining money never showed up' },
    ],
  },
  {
    id: 'bs-012', rank: 8, relations: [
      { category: 'questions', topic: 'Tariffs',
        focus: 'By resorting to tariffs we’re only making consumers pay more',
        content: 'What is the over/under on a US tariff exemption for EV battery components?' },
      { category: 'predictions', topic: 'Industrial policy',
        focus: 'Our laws and court actions have repeatedly reaffirmed a company’s highest responsibility',
        content: 'Hard to imagine the IRA tax credits surviving a full tariff wall.' },
    ],
  },
  // bs-002a, bs-002a1, bs-006, bs-013 stay relation-free on purpose:
  // substantive-but-unlinked and "me too" replies must render plain.
];

// ─── Apply reply relations + ranks ────────────────────────────────────────────

for (const def of REPLY_DEFS) {
  const reply = (entry.replies ?? []).find((r) => r.id === def.id);
  if (!reply) throw new Error(`reply ${def.id} not found`);
  const plain = reply.plainText ?? reply.content;
  reply.relations = def.relations.map((d, i) => {
    const label = `${def.id}[${i}]`;
    const [focusStart, focusEnd] = spanIn(focusPlain, d.focus, `${label}.focus`);
    const [contentStart, contentEnd] = spanIn(plain, d.content, `${label}.content`);
    const [focusCommentStart, focusCommentEnd] = commentSpan(focusPlain, focusStart, focusEnd, d.focusComment, `${label}.focusComment`);
    const [contentCommentStart, contentCommentEnd] = commentSpan(plain, contentStart, contentEnd, d.contentComment, `${label}.contentComment`);
    return {
      focusStart, focusEnd, focusCommentStart, focusCommentEnd,
      contentStart, contentEnd, contentCommentStart, contentCommentEnd,
      category: d.category, topic: d.topic,
    };
  });
  reply.rank = def.rank;
}

// Overlap guard: content spans within one reply must not overlap (renderer assumption).
for (const reply of entry.replies ?? []) {
  const spans = (reply.relations ?? []).map((r) => [r.contentStart, r.contentEnd]).sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < spans.length; i++) {
    if (spans[i][0] < spans[i - 1][1]) throw new Error(`content spans overlap in ${reply.id}`);
  }
}

// Topic sanity: shared topics must exist among related posts; Build quality must not.
const relatedTopics = new Set(entry.relatedPosts.flatMap((rp) => (rp.relations ?? []).map((r) => r.topic)));
for (const def of REPLY_DEFS) {
  for (const d of def.relations) {
    if (d.topic === 'Build quality') {
      if (relatedTopics.has(d.topic)) throw new Error('Build quality unexpectedly present in related posts');
    } else if (!relatedTopics.has(d.topic)) {
      throw new Error(`topic ${d.topic} not present in related posts — cross-pane demo would be dead`);
    }
  }
}

// ─── Dual-role related posts (suppression demo) ───────────────────────────────

for (const id of DUAL_ROLE_RELATED_IDS) {
  const rp = entry.relatedPosts.find((p) => p.id === id);
  if (!rp) throw new Error(`dual-role related post ${id} not found`);
  const isFocusElsewhere = data.some((e) => e.focusPost.id === id);
  if (isFocusElsewhere) throw new Error(`dual-role pick ${id} is another entry's focus post`);
  rp.inReplyToId = BIG_ENTRY_ID;
}

// ─── Small entry: 3 relation-free replies (tabs-suppressed state) ─────────────

const small = data.find((e) => e.focusPost.id === SMALL_ENTRY_ID);
if (!small) throw new Error(`entry ${SMALL_ENTRY_ID} not found`);
small.replies = small.replies ?? [];
const templateAccount = entry.replies[0].account;
const SMALL_REPLIES = [
  { id: 'bs2-001', display_name: 'Garage Skeptic', acct: 'garage_skeptic', created_at: '2024-07-31T13:05:00.000Z', favourites_count: 2,
    text: 'The Ford numbers get repeated a lot but they fold fixed R&D into per-unit loss. Still bad, just not 50k-per-car bad.' },
  { id: 'bs2-002', display_name: 'Tony P', acct: 'tony_p', created_at: '2024-07-31T13:22:00.000Z', favourites_count: 1,
    text: 'Point 4 is the sleeper issue. No sales tax parity means the incentives push in opposite directions.' },
  { id: 'bs2-003', display_name: 'Quietreader', acct: 'quietreader', created_at: '2024-07-31T13:41:00.000Z', favourites_count: 0,
    text: 'Same.' },
];
const wrapsHtml = typeof entry.replies[0].content === 'string' && entry.replies[0].content.trim().startsWith('<');
for (const r of SMALL_REPLIES) {
  if (small.replies.some((x) => x.id === r.id)) continue;
  small.replies.push({
    id: r.id,
    inReplyToId: SMALL_ENTRY_ID,
    content: wrapsHtml ? `<p>${r.text}</p>` : r.text,
    plainText: r.text,
    account: { ...templateAccount, display_name: r.display_name, acct: r.acct },
    created_at: r.created_at,
    favourites_count: r.favourites_count,
    replies_count: 0,
    favourited: false,
    bookmarked: false,
  });
}

// ─── Nested-thread depth: 7 extra children under bs-002a ─────────────────────
// Exercises the per-parent "See N more replies" pagination (5 shown at a time)
// inside a branch: bs-002a ends up with 8 children (bs-002a1 + these).

const NESTED_PARENT = 'bs-002a';
const NESTED_REPLIES = [
  { id: 'bs-002a-r1', display_name: 'Econ PhD', acct: 'econ_phd', created_at: '2024-07-31T13:50:00.000Z', favourites_count: 6,
    text: 'TAA take-up rates hover around a quarter of eligible workers. The program design is the failure mode, not the concept.' },
  { id: 'bs-002a-r2', display_name: 'Union Rep', acct: 'union_rep', created_at: '2024-07-31T13:56:00.000Z', favourites_count: 4,
    text: 'Design AND funding. Every renewal cycle it gets trimmed before it reaches a single shop floor.' },
  { id: 'bs-002a-r3', display_name: 'Garage Skeptic', acct: 'garage_skeptic', created_at: '2024-07-31T14:02:00.000Z', favourites_count: 2,
    text: 'Retraining a 55-year-old machinist into "software" was always a brochure fantasy.' },
  { id: 'bs-002a-r4', display_name: 'Jane Dev', acct: 'jane_dev', created_at: '2024-07-31T14:11:00.000Z', favourites_count: 3,
    text: 'Denmark manages it with flexicurity. It is not impossible, it is just not what we fund.' },
  { id: 'bs-002a-r5', display_name: 'Tony P', acct: 'tony_p', created_at: '2024-07-31T14:19:00.000Z', favourites_count: 1,
    text: 'Denmark is five million people with sectoral bargaining. Scale matters.' },
  { id: 'bs-002a-r6', display_name: 'Quietreader', acct: 'quietreader', created_at: '2024-07-31T14:24:00.000Z', favourites_count: 0,
    text: 'Following this thread.' },
  { id: 'bs-002a-r7', display_name: 'Analyst B', acct: 'analyst_b', created_at: '2024-07-31T14:31:00.000Z', favourites_count: 2,
    text: 'Wage insurance pilots polled better than retraining in every evaluation I have seen.' },
];
if (!(entry.replies ?? []).some((x) => x.id === NESTED_PARENT)) {
  throw new Error(`nested parent ${NESTED_PARENT} not found`);
}
for (const r of NESTED_REPLIES) {
  if (entry.replies.some((x) => x.id === r.id)) continue;
  entry.replies.push({
    id: r.id,
    inReplyToId: NESTED_PARENT,
    content: wrapsHtml ? `<p>${r.text}</p>` : r.text,
    plainText: r.text,
    account: { ...templateAccount, display_name: r.display_name, acct: r.acct },
    created_at: r.created_at,
    favourites_count: r.favourites_count,
    replies_count: 0,
    favourited: false,
    bookmarked: false,
  });
}

writeFileSync(DATA_PATH, JSON.stringify(data, null, 2) + '\n');

const nestedCount = entry.replies.filter((r) => r.inReplyToId === NESTED_PARENT).length;
const relCount = (entry.replies ?? []).reduce((n, r) => n + (r.relations?.length ?? 0), 0);
console.log(`ok: ${REPLY_DEFS.length} replies annotated (${relCount} relations), ` +
  `${DUAL_ROLE_RELATED_IDS.length} dual-role posts, small entry has ${small.replies.length} replies, ` +
  `${NESTED_PARENT} has ${nestedCount} children`);
