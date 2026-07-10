// Converts the CrossWeave NYT demo corpus (crossweave repo `demo_data/`) into the
// FE feed fixture `src/app/FakeData/listy-injection.json`.
//
// Source of truth for the mapping: crossweave `demo_data/README.md`. It reads
//   prepared_data_with_descendants/*.json → FE-ready focused posts + ranked candidate
//        side posts + `descendant_posts` (ANNOTATED nested replies). Falls back to
//        the older prepared_data/*.json (no descendants) when that dir is absent.
//   src_data/*.json            → raw NYT scrape, for REAL like/reply counts + the flat
//        reply threads used by the fallback path
//   src_data/descendants/*.json → raw per-thread reply scrapes, for REAL engagement
//        counts on the annotated descendants
// and joins them by numeric `comment_id`. Offsets transfer 1:1 because every prepared
// candidate AND every descendant carries exactly one verbatim focus/side highlight
// pair (span_match_ok) whose focus span indexes the focus post and whose side span
// indexes the candidate/reply. The script self-validates every emitted record
// (related + reply relations) against the listy-injection schema and throws on any
// violation — it never guesses offsets.
//
// The crossweave repo is separate/private, so the source path is configurable and
// nothing from it is vendored in; only the generated fixture is committed here.
//
// Run: CROSSWEAVE_DEMO_DIR=/path/to/crossweave/demo_data node scripts/convert-demo-data.mjs

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(here, '../src/app/FakeData/listy-injection.json');

const DEMO_DIR = process.env.CROSSWEAVE_DEMO_DIR || '/tmp/crossweave-demo/demo_data';
// Prefer `prepared_data_with_descendants/` (adds a `descendant_posts` array of
// ANNOTATED nested replies alongside the same focused_post + candidate_posts) when
// the checkout has it; fall back to the flat `prepared_data/` otherwise. The focus
// + candidate side is byte-identical between the two dirs, so the related pane is
// unchanged — the new dir only adds the real reply-side annotations.
const PREPARED_WITH_DESC = join(DEMO_DIR, 'prepared_data_with_descendants');
const PREPARED_DIR = existsSync(PREPARED_WITH_DESC) ? PREPARED_WITH_DESC : join(DEMO_DIR, 'prepared_data');
const SRC_DIR = join(DEMO_DIR, 'src_data');
// Raw NYT reply-thread scrapes (recommendedCount/replyCount per descendant id).
// Only present in the descendants checkout; used to give annotated replies REAL
// engagement counts where available (missing ids default to 0).
const DESCENDANTS_DIR = join(SRC_DIR, 'descendants');

// Optional per-focus cap on candidate side posts, kept by MMR rank (1 = best).
// Unset/0 = keep all. A cap keeps the focus-post highlight nesting shallow: with
// every candidate painting a span onto the focus post, an uncapped ~140-candidate
// set nests <mark> elements ~130 deep, which suppresses the crux-bold emphasis and
// stresses the hover re-parse. subtopic drill-down counts stay honest because the
// FE derives them from the emitted relatedPosts, not a stored total.
const MAX_CANDIDATES = Number(process.env.MAX_CANDIDATES || 0);

const AVATAR = 'https://beta.stacky.social/avatars/original/missing.png';

// crossweave contribution_type label → FE CategoryKey. `Pointers` gets its own
// key (the data also has a distinct `Connections` type, so they must not merge).
const CATEGORY_MAP = {
  'Evidence (Public)': 'evidence_public',
  'Evidence (Personal)': 'evidence_personal',
  'Framing': 'framing',
  'Connections': 'connections',
  'Proposals': 'proposals',
  'Pointers': 'pointers',
  'Predictions': 'predictions',
  'Questions': 'questions',
  'Values': 'values',
  'Agree': 'agree',
  'Disagree': 'disagree',
  'Uncategorized': 'uncategorized',
};
const VALID_CATEGORIES = new Set(Object.values(CATEGORY_MAP));

function mapCategory(label) {
  const c = CATEGORY_MAP[label];
  if (!c) throw new Error(`unknown contribution_type label: ${JSON.stringify(label)}`);
  return c;
}

// ─── HTML + account helpers ──────────────────────────────────────────────────
function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
/** Plain text → Mastodon-style HTML for display. CRITICAL: the focus highlight
 *  offsets index the plain text, and the FE renders the marks by walking this HTML
 *  and stripping tags — so `stripHtml(toHtml(text))` MUST equal `text` exactly, or
 *  every highlight drifts. We therefore keep ALL newlines as LITERAL text (the
 *  `\n\n` separators live between the block <p> tags, where the browser collapses
 *  them so paragraphs still render separated; intra-paragraph newlines stay literal
 *  and render as a space). A <br> or trimmed paragraph would be dropped by stripHtml
 *  and shift the offsets — hence neither is used. */
function toHtml(text) {
  if (!text) return `<p>${esc(text)}</p>`;
  // split on paragraph breaks, KEEPING the separators (capture group) as literal text
  return text
    .split(/(\n{2,})/)
    .map((part) => (/^\n{2,}$/.test(part) ? part : part ? `<p>${esc(part)}</p>` : ''))
    .join('');
}
/** "Tony Hartnett (Ireland)" → stable acct slug "tony_hartnett". */
function acctSlug(displayName) {
  const name = displayName.replace(/\s*\(.*\)\s*$/, '').trim();
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return slug || 'anon';
}
/** "Tony Hartnett (Ireland)" → "Tony Hartnett" — drop the trailing location paren
 *  for display. The acct slug already strips it, so acct is unaffected. */
function stripLocation(handle) {
  return handle.replace(/\s*\([^)]*\)\s*$/, '').trim() || handle;
}
function accountFromHandle(handle) {
  return { display_name: stripLocation(handle), acct: `${acctSlug(handle)}@stacky-nyt.com`, avatar: AVATAR };
}
function accountFromAuthor(author) {
  return accountFromHandle(author?.name || 'Anonymous');
}

// ─── Load src_data: real counts + reply threads, keyed by comment id ─────────
/** node.comment on top-level edges; bare comment objects inside node.replies. */
function commentOf(node) {
  return node && node.comment ? node.comment : node;
}
function loadSrc() {
  const counts = new Map(); // id → { favourites_count, replies_count }
  const focusReplies = new Map(); // top-level id → [reply comment, …]
  const record = (c) => {
    if (c?.id == null) return;
    counts.set(String(c.id), {
      favourites_count: Number(c.recommendedCount ?? 0),
      replies_count: Number(c.replyCount ?? 0),
    });
  };
  for (const file of readdirSync(SRC_DIR).filter((f) => f.endsWith('.json'))) {
    // Skip the non-article helper files in src_data/.
    if (['crossweave_focused_and_candidates.json', 'per_entry_schema.json', 'sample_judgments.json'].includes(file)) continue;
    const raw = JSON.parse(readFileSync(join(SRC_DIR, file), 'utf8'));
    const edges = raw?.data?.communityComments?.edges;
    if (!Array.isArray(edges)) continue;
    for (const edge of edges) {
      const c = commentOf(edge.node);
      record(c);
      const reps = (edge.node.replies ?? []).map(commentOf).filter(Boolean);
      focusReplies.set(String(c.id), reps);
      for (const r of reps) record(r);
    }
  }
  // Real engagement counts for the annotated descendants (nested replies) come from
  // the raw per-thread scrapes in src_data/descendants/. Each file is one comment's
  // reply subtree: data.communityThreadCommentTree.comments[] with recommendedCount /
  // replyCount. Merge them into the same id-keyed counts map; ids missing here
  // (descendants whose thread wasn't scraped) fall back to 0 in countsFor.
  if (existsSync(DESCENDANTS_DIR)) {
    for (const file of readdirSync(DESCENDANTS_DIR).filter((f) => f.endsWith('.json'))) {
      const tree = JSON.parse(readFileSync(join(DESCENDANTS_DIR, file), 'utf8'));
      const comments = tree?.data?.communityThreadCommentTree?.comments;
      if (!Array.isArray(comments)) continue;
      for (const c of comments) record(c);
    }
  }
  return { counts, focusReplies };
}

// ─── Post builders ───────────────────────────────────────────────────────────
function countsFor(id, counts) {
  return counts.get(String(id)) ?? { favourites_count: 0, replies_count: 0 };
}

/** focused_post / side_post → FE FocusPost-shaped object (id/plainText/content/account/counts). */
function basePost(p, counts) {
  const { favourites_count, replies_count } = countsFor(p.comment_id, counts);
  return {
    id: String(p.comment_id),
    content: toHtml(p.text),
    plainText: p.text,
    account: accountFromHandle(p.author_handle),
    created_at: p.created_at,
    favourites_count,
    replies_count,
    favourited: false,
    bookmarked: false,
  };
}

/** ancestors[] from prepared focused_post → FE FocusPost[] (article = ancestors[0]). */
function buildAncestors(ancestors, counts) {
  return (ancestors ?? []).map((a) => {
    if (a.kind === 'article') {
      const headline = a.headline ?? a.text ?? '';
      const summary = a.summary ?? '';
      const plain = summary ? `${headline}\n\n${summary}` : headline;
      const id = `article-${(a.source_file ?? 'nyt').replace(/\.json$/, '')}`;
      return {
        id,
        // keep the '\n\n' between the blocks as literal text so stripHtml(content)
        // === plainText (same round-trip invariant as toHtml).
        content: `<p><strong>${esc(headline)}</strong></p>` + (summary ? `\n\n<p>${esc(summary)}</p>` : ''),
        plainText: plain,
        account: { display_name: a.author_handle || 'The New York Times', acct: 'nytimes@stacky-nyt.com', avatar: AVATAR },
        created_at: a.created_at,
        favourites_count: 0,
        replies_count: 0,
        favourited: false,
        bookmarked: false,
      };
    }
    // Non-article ancestor (a parent comment): same shape as a normal post.
    return basePost(a, counts);
  });
}

/** src reply comments → FE replies[] (flat, threaded via inReplyToId). */
function buildReplies(focusId, focusReplies, counts) {
  const reps = focusReplies.get(String(focusId)) ?? [];
  return reps.map((r) => ({
    id: String(r.id),
    inReplyToId: String(r.replyToID ?? focusId),
    content: toHtml(r.text ?? ''),
    plainText: r.text ?? '',
    account: accountFromAuthor(r.author),
    created_at: r.acceptedAt ?? null,
    favourites_count: Number(r.recommendedCount ?? 0),
    replies_count: Number(r.replyCount ?? 0),
    favourited: false,
    bookmarked: false,
  }));
}

// ─── Descendant (annotated nested reply) builders ─────────────────────────────
/** "…::143203257" → "143203257" (the comment id lives after the key's "::"). */
function idOfKey(key) {
  return String(key ?? '').split('::').pop() ?? '';
}

/** Immediate parent of a descendant = the last COMMENT in its ancestors chain
 *  (article ancestors skipped). A depth-2 reply's only comment ancestor is the
 *  focus post, so it points at focusId; a depth-3 reply points at its depth-2
 *  parent. Verified against the corpus: every parent resolves inside the same
 *  focus entry (zero orphans). */
function descendantParentId(descPost, focusId) {
  const comments = (descPost.ancestors ?? []).filter((a) => a.kind === 'comment');
  const last = comments[comments.length - 1];
  return last ? idOfKey(last.key) : String(focusId);
}

/** One annotated descendant → the reply's `relations[]`, mapped exactly like a
 *  related post (buildRelatedPost): focus* offsets index the FOCUS post's
 *  plainText, content* index the reply's own text, one relation per contribution
 *  type sharing the single verbatim highlight pair. Verified across the corpus:
 *  for every descendant (incl. every depth-3 grandchild) the focus highlight
 *  indexes the focus post and the side highlight indexes the reply, so these are
 *  REAL reply→focus relations, not synthesized. */
function descendantRelations(desc) {
  const hf = desc.highlights_focused?.[0];
  const hs = desc.highlights_side?.[0];
  if (!hf || !hs) return [];
  const types = desc.judgment?.contribution_types?.length ? desc.judgment.contribution_types : [{ label: 'Uncategorized' }];
  const topic = desc.judgment?.topic ?? '';
  return types.map((t) => ({
    focusStart: hf.start,
    focusEnd: hf.end,
    contentStart: hs.start,
    contentEnd: hs.end,
    focusCommentStart: hf.crux_start,
    focusCommentEnd: hf.crux_end,
    contentCommentStart: hs.crux_start,
    contentCommentEnd: hs.crux_end,
    category: mapCategory(t.label),
    topic,
  }));
}

/** prepared `descendant_posts` → FE replies[] (threaded via inReplyToId, nested to
 *  depth 3) carrying REAL topic relations. Supersedes the src_data flat-reply path
 *  when the checkout provides annotated descendants. `replies_count` is set to the
 *  number of children ACTUALLY present so the "Show N replies" affordance is honest
 *  (unannotated siblings we don't render are not counted). */
function buildDescendantReplies(descendantPosts, focusId, counts) {
  const ranked = descendantPosts.slice().sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
  const replies = ranked.map((desc) => {
    const p = desc.descendant_post;
    const id = idOfKey(p.key);
    const { favourites_count } = countsFor(id, counts);
    const relations = descendantRelations(desc);
    return {
      id,
      inReplyToId: descendantParentId(p, focusId),
      content: toHtml(p.text ?? ''),
      plainText: p.text ?? '',
      account: accountFromHandle(p.author_handle),
      created_at: p.created_at ?? null,
      favourites_count,
      replies_count: 0, // overwritten below from actual children
      favourited: false,
      bookmarked: false,
      ...(relations.length ? { relations } : {}),
    };
  });
  const childCount = new Map();
  for (const r of replies) childCount.set(r.inReplyToId, (childCount.get(r.inReplyToId) ?? 0) + 1);
  for (const r of replies) r.replies_count = childCount.get(r.id) ?? 0;
  return replies;
}

/** One prepared candidate → FE RelatedPost. Emits one relation per contribution
 *  type (1–2), all sharing the candidate's single verbatim highlight pair. */
function buildRelatedPost(cand, counts) {
  const side = cand.side_post;
  const hf = cand.highlights_focused[0];
  const hs = cand.highlights_side[0];
  const types = cand.judgment.contribution_types?.length ? cand.judgment.contribution_types : [{ label: 'Uncategorized' }];
  const topic = cand.judgment.topic ?? '';
  const relations = types.map((t) => ({
    focusStart: hf.start,
    focusEnd: hf.end,
    contentStart: hs.start,
    contentEnd: hs.end,
    focusCommentStart: hf.crux_start,
    focusCommentEnd: hf.crux_end,
    contentCommentStart: hs.crux_start,
    contentCommentEnd: hs.crux_end,
    category: mapCategory(t.label),
    topic,
  }));
  const { favourites_count, replies_count } = countsFor(side.comment_id, counts);
  return {
    id: String(side.comment_id),
    category: relations[0].category, // primary = first (most salient) contribution type
    rank: 0, // filled in per-category below
    globalRank: cand.rank,
    content: side.text, // PLAIN text — the offset base for content* offsets
    relations,
    account: accountFromHandle(side.author_handle),
    created_at: side.created_at,
    favourites_count,
    replies_count,
    favourited: false,
    bookmarked: false,
    __cross_article: !!cand.cross_article, // internal; stripped before write
  };
}

// ─── Validation (schema rules — throw on any violation) ──────────────────────
function assert(cond, msg) {
  if (!cond) throw new Error(`VALIDATION: ${msg}`);
}
function validateRelation(rel, focusPlain, content, ctx) {
  const inRange = (s, e, len) => Number.isInteger(s) && Number.isInteger(e) && s >= 0 && s < e && e <= len;
  assert(inRange(rel.focusStart, rel.focusEnd, focusPlain.length), `${ctx}: focus span out of range [${rel.focusStart},${rel.focusEnd}] len ${focusPlain.length}`);
  assert(inRange(rel.contentStart, rel.contentEnd, content.length), `${ctx}: content span out of range [${rel.contentStart},${rel.contentEnd}] len ${content.length}`);
  assert(rel.focusStart <= rel.focusCommentStart && rel.focusCommentStart < rel.focusCommentEnd && rel.focusCommentEnd <= rel.focusEnd, `${ctx}: focus comment not within highlight`);
  assert(rel.contentStart <= rel.contentCommentStart && rel.contentCommentStart < rel.contentCommentEnd && rel.contentCommentEnd <= rel.contentEnd, `${ctx}: content comment not within highlight`);
  assert(VALID_CATEGORIES.has(rel.category), `${ctx}: invalid category ${rel.category}`);
}
function validateEntry(entry) {
  const fp = entry.focusPost;
  assert(typeof fp.id === 'string' && fp.id.length > 0, 'focusPost.id missing');
  assert(typeof fp.plainText === 'string' && fp.plainText.length > 0, `focus ${fp.id}: empty plainText`);
  for (const rp of entry.relatedPosts) {
    assert(Array.isArray(rp.relations) && rp.relations.length >= 1, `related ${rp.id}: needs >=1 relation`);
    for (let i = 0; i < rp.relations.length; i++) {
      validateRelation(rp.relations[i], fp.plainText, rp.content, `focus ${fp.id} related ${rp.id} rel ${i}`);
    }
  }
  // Reply side: every parent must resolve within the entry (no orphaned nesting),
  // and any reply relation must satisfy the same offset/nesting/category rules as a
  // related post — content* offsets index the reply's own plainText.
  const replyIds = new Set((entry.replies ?? []).map((r) => r.id));
  for (const reply of entry.replies ?? []) {
    assert(
      reply.inReplyToId === fp.id || replyIds.has(reply.inReplyToId),
      `focus ${fp.id} reply ${reply.id}: inReplyToId ${reply.inReplyToId} does not resolve within entry`,
    );
    for (let i = 0; i < (reply.relations?.length ?? 0); i++) {
      validateRelation(reply.relations[i], fp.plainText, reply.plainText, `focus ${fp.id} reply ${reply.id} rel ${i}`);
    }
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────
const { counts, focusReplies } = loadSrc();
const files = readdirSync(PREPARED_DIR).filter((f) => f.endsWith('.json')).sort();
if (files.length === 0) throw new Error(`no prepared_data files in ${PREPARED_DIR}`);

const entries = [];
for (const file of files) {
  const d = JSON.parse(readFileSync(join(PREPARED_DIR, file), 'utf8'));
  const focusPost = basePost(d.focused_post, counts);

  const ranked = d.candidate_posts.slice().sort((a, b) => a.rank - b.rank);
  const kept = MAX_CANDIDATES > 0 ? ranked.slice(0, MAX_CANDIDATES) : ranked;
  const relatedPosts = kept.map((c) => buildRelatedPost(c, counts));

  // Rank within primary category (1 = top by global MMR rank).
  const perCat = new Map();
  for (const rp of relatedPosts) {
    const n = (perCat.get(rp.category) ?? 0) + 1;
    perCat.set(rp.category, n);
    rp.rank = n;
    delete rp.__cross_article;
  }

  // Real annotated nested replies when the checkout provides them; otherwise the
  // flat src_data reply threads (relation-free) as a graceful fallback.
  const focusId = String(d.focused_post.comment_id);
  const replies = Array.isArray(d.descendant_posts) && d.descendant_posts.length
    ? buildDescendantReplies(d.descendant_posts, focusId, counts)
    : buildReplies(d.focused_post.comment_id, focusReplies, counts);

  const entry = {
    focusPost,
    relatedPosts,
    ancestors: buildAncestors(d.focused_post.ancestors, counts),
    replies,
  };
  validateEntry(entry);
  entries.push(entry);
}

writeFileSync(OUT_PATH, JSON.stringify(entries, null, 2) + '\n', 'utf8');

// ─── Report ──────────────────────────────────────────────────────────────────
const totalRelated = entries.reduce((n, e) => n + e.relatedPosts.length, 0);
const totalReplies = entries.reduce((n, e) => n + e.replies.length, 0);
const catUse = new Set();
for (const e of entries) for (const rp of e.relatedPosts) for (const r of rp.relations) catUse.add(r.category);
const withLikes = entries.filter((e) => e.focusPost.favourites_count > 0).length;

// Reply-side fidelity: how many replies carry real relations, how deep the threads
// nest, and how many reply relations land on a topic that also exists on the related
// pane (a live cross-pane intersection). deadXpane are real annotations whose topic
// simply isn't on the related side — the FE handles them (unfiltered, no chip).
let replyRelations = 0, repliesAnnotated = 0, nestedDeep = 0, liveXpane = 0, deadXpane = 0;
for (const e of entries) {
  const byId = new Map((e.replies ?? []).map((r) => [r.id, r]));
  const relatedTopics = new Set((e.relatedPosts ?? []).flatMap((rp) => (rp.relations ?? []).map((r) => r.topic)));
  for (const r of e.replies ?? []) {
    if (r.relations?.length) repliesAnnotated++;
    replyRelations += r.relations?.length ?? 0;
    let depth = 0, cur = r; const seen = new Set();
    while (cur && cur.inReplyToId !== e.focusPost.id && byId.has(cur.inReplyToId) && !seen.has(cur.id)) {
      seen.add(cur.id); depth++; cur = byId.get(cur.inReplyToId);
    }
    if (cur && cur.inReplyToId === e.focusPost.id) depth++;
    if (depth >= 2) nestedDeep++;
    for (const rel of r.relations ?? []) (relatedTopics.has(rel.topic) ? liveXpane++ : deadXpane++);
  }
}
console.log(`✓ wrote ${OUT_PATH}`);
console.log(`  ${entries.length} focus posts, ${totalRelated} related posts, ${totalReplies} replies`);
console.log(`  replies: ${repliesAnnotated} annotated (${replyRelations} relations), ${nestedDeep} nested at depth >= 2`);
console.log(`  reply cross-pane topics: ${liveXpane} live / ${deadXpane} not present on the related side`);
console.log(`  ${withLikes}/${entries.length} focus posts have real like counts`);
console.log(`  categories used: ${[...catUse].sort().join(', ')}`);
