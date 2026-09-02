// Converts CrossWeave's multi-source live-demo prepared data into the frontend
// fixture consumed by the simulated API and local demo store.
//
// Input contract:
//   live_demo_data/prepared_data/{topic}/corpus_threads.json
//   live_demo_data/prepared_data/{topic}/annotations/*.json
//
// Run:
//   CROSSWEAVE_LIVE_DEMO_DIR=/path/to/crossweave/live_demo_data \
//     node scripts/convert-live-demo-data.mjs
//
// Optional:
//   DEMO_TOPICS=ai-workforce,tariffs  Import only selected complete topics.
//   MAX_CANDIDATES=30               Cap each side pane after MMR sorting.
//   STRICT_SOURCE=1                 Fail instead of omitting malformed pairs.

// The importer intentionally keeps source data outside this repository. Only the
// generated FE fixture is committed. It validates every join and every offset.

// Display contract from live_demo_data/README.md:
//   focused post       -> body
//   side/descendant    -> decontextualized_text (fallback body)
//   quote-tweet root   -> embedded_key is rendered as an embedded quote

// Related-post `content` is the rewritten display/offset base. The authored body
// is retained as `rewrite.originalContent`, allowing the FE to show its existing
// "Modified by AI" redline without remapping backend-provided offsets.

import { createHash } from 'node:crypto';
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
// Live topics own their fixture; the legacy Chinese-EVs importer writes a
// separate file. Callers may redirect output for validation without editing
// the script or risking the other corpus.
const CHINESE_EVS_PATH = resolve(here, '../src/app/FakeData/chinese-evs.json');
const LEGACY_STACKY_PATH = resolve(here, '../src/app/FakeData/listy-injection.json');
const OUT_PATH = resolve(process.env.DEMO_OUTPUT_PATH
  || join(here, '../src/app/FakeData/scale-demo.json'));
if (OUT_PATH === CHINESE_EVS_PATH) {
  throw new Error('Refusing to overwrite the Chinese-EVs fixture with live-demo data');
}
if (OUT_PATH === LEGACY_STACKY_PATH) {
  throw new Error('Refusing to overwrite the legacy Stacky-injection fixture with curated scale-demo data');
}
const LIVE_DEMO_DIR = process.env.CROSSWEAVE_LIVE_DEMO_DIR
  || '/tmp/crossweave-scale-demo/live_demo_data';
const PREPARED_ROOT = join(LIVE_DEMO_DIR, 'prepared_data');
const MAX_CANDIDATES = Number(process.env.MAX_CANDIDATES || 0);
const STRICT_SOURCE = process.env.STRICT_SOURCE === '1';
const AVATAR = '/icon.svg';

const CATEGORY_MAP = {
  'Evidence (Public)': 'evidence_public',
  'Evidence (Personal)': 'evidence_personal',
  Framing: 'framing',
  Connections: 'connections',
  Proposals: 'proposals',
  Pointers: 'pointers',
  Predictions: 'predictions',
  Questions: 'questions',
  Values: 'values',
  Agree: 'agree',
  Disagree: 'disagree',
  Uncategorized: 'uncategorized',
};
const VALID_CATEGORIES = new Set(Object.values(CATEGORY_MAP));

function assert(condition, message) {
  if (!condition) throw new Error(`VALIDATION: ${message}`);
}

function json(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function requestedTopics() {
  const configured = (process.env.DEMO_TOPICS || '')
    .split(',')
    .map((topic) => topic.trim())
    .filter(Boolean);
  const discovered = readdirSync(PREPARED_ROOT)
    .filter((topic) => {
      const dir = join(PREPARED_ROOT, topic);
      return statSync(dir).isDirectory()
        && existsSync(join(dir, 'corpus_threads.json'))
        && existsSync(join(dir, 'annotations'));
    })
    .sort();
  const topics = configured.length ? configured : discovered;
  assert(topics.length > 0, `no complete topics found under ${PREPARED_ROOT}`);
  for (const topic of topics) {
    assert(discovered.includes(topic), `topic ${topic} is not FE-ready under ${PREPARED_ROOT}`);
  }
  return topics;
}

function stableId(topic, key) {
  const digest = createHash('sha256').update(`${topic}\0${key}`).digest('base64url');
  return `cw-${digest.slice(0, 16)}`;
}

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Keep literal paragraph separators outside tags so the frontend's stripHtml
// transform returns the exact source string used by annotation offsets.
function toHtml(text) {
  return String(text ?? '')
    .split(/(\n{2,})/)
    .map((part) => (/^\n{2,}$/.test(part) ? part : part ? `<p>${esc(part)}</p>` : ''))
    .join('');
}

// Reddit bodies may contain HTML entities even though the prepared contract is
// otherwise plain text. The Post component decodes entities while stripping
// HTML, so normalize them once here and translate annotation boundaries onto
// the normalized string. This keeps rendered text and relation offsets aligned.
const SOURCE_ENTITIES = new Map([
  ['&amp;', '&'],
  ['&lt;', '<'],
  ['&gt;', '>'],
  ['&quot;', '"'],
  ['&#39;', "'"],
  ['&nbsp;', ' '],
]);

function sourceText(value) {
  const raw = String(value ?? '');
  const boundaryMap = new Array(raw.length + 1);
  let text = '';
  let cursor = 0;
  boundaryMap[0] = 0;
  while (cursor < raw.length) {
    let matched = null;
    for (const [entity, replacement] of SOURCE_ENTITIES) {
      if (raw.startsWith(entity, cursor)) {
        matched = { entity, replacement };
        break;
      }
    }
    if (!matched) {
      text += raw[cursor];
      cursor += 1;
      boundaryMap[cursor] = text.length;
      continue;
    }
    const end = cursor + matched.entity.length;
    for (let index = cursor + 1; index < end; index += 1) boundaryMap[index] = text.length;
    text += matched.replacement;
    cursor = end;
    boundaryMap[cursor] = text.length;
  }
  return { raw, text, boundaryMap };
}

function acctSlug(value) {
  return String(value || 'unknown')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'unknown';
}

function publisherFor(sourceFile) {
  if (sourceFile.startsWith('nyt_')) return { slug: 'nyt', domain: 'nytimes.com' };
  if (sourceFile.startsWith('fox_')) return { slug: 'fox', domain: 'foxnews.com' };
  if (sourceFile.startsWith('cmv_')) return { slug: 'cmv', domain: 'reddit.com' };
  return { slug: 'crossweave', domain: 'crossweave.local' };
}

function accountFor(author, sourceFile) {
  const displayName = String(author || 'Unknown');
  const publisher = publisherFor(sourceFile);
  return {
    display_name: displayName,
    acct: `${acctSlug(displayName)}@${publisher.domain}`,
    avatar: AVATAR,
  };
}

function sourceFileOfRoot(rootKey, root) {
  if (root.source_file) return root.source_file;
  const marker = '.json::';
  const index = rootKey.indexOf(marker);
  return index >= 0 ? rootKey.slice(0, index + '.json'.length) : rootKey.split('::')[0];
}

function indexCorpus(topic, corpus) {
  assert(corpus.topic_id === topic, `${topic}: corpus topic_id is ${corpus.topic_id}`);
  assert(corpus.threads && typeof corpus.threads === 'object', `${topic}: threads missing`);

  const byKey = new Map();
  const roots = new Map(Object.entries(corpus.threads));
  const children = new Map();

  const addChild = (parentKey, childKey) => {
    if (!parentKey) return;
    const values = children.get(parentKey) ?? [];
    if (!values.includes(childKey)) values.push(childKey);
    children.set(parentKey, values);
  };

  for (const [rootKey, root] of roots) {
    const sourceFile = sourceFileOfRoot(rootKey, root);
    // Keep the source edge while reconstructing full_thread_text annotations.
    // The display fixture omits this edge from ancestors: a lifted depth-1
    // comment is a quote-tweet, not a reply to the embedded article.
    const rootParentKey = root.embedded_key || null;
    const walk = (node, parentKey) => {
      const key = `${sourceFile}::${node.post_id}`;
      assert(!byKey.has(key), `${topic}: duplicate corpus key ${key}`);
      byKey.set(key, { key, node, parentKey, rootKey, sourceFile });
      addChild(parentKey, key);
      for (const child of node.replies ?? []) walk(child, key);
    };
    walk(root, rootParentKey);
  }

  assert(
    byKey.size === corpus.post_keys.length,
    `${topic}: indexed ${byKey.size} nodes but post_keys has ${corpus.post_keys.length}`,
  );
  for (const key of corpus.post_keys) {
    assert(byKey.has(key), `${topic}: post_keys entry does not resolve: ${key}`);
  }
  for (const item of byKey.values()) {
    if (item.parentKey) assert(byKey.has(item.parentKey), `${topic}: parent does not resolve: ${item.parentKey}`);
  }

  return { topic, corpus, byKey, roots, children };
}

function articleRootFor(index, item) {
  const root = index.roots.get(item.rootKey);
  if (!root) return null;
  return root.embedded_key ? index.roots.get(root.embedded_key) ?? null : root;
}

function previewCardFor(index, item) {
  const root = articleRootFor(index, item);
  if (!root?.article_url) return null;
  return {
    title: root.title || 'Source article',
    description: sourceText(root.body).text,
    url: root.article_url,
  };
}

function quotedPostFor(index, item) {
  if (!item.node.embedded_key) return null;
  const embedded = index.byKey.get(item.node.embedded_key);
  assert(embedded, `${index.topic}: quote embedded_key does not resolve: ${item.node.embedded_key}`);
  const original = sourceText(embedded.node.body).text;
  const title = String(embedded.node.title ?? '').trim();
  const content = title && original.startsWith(`${title}\n\n`)
    ? original.slice(title.length + 2)
    : original;
  return {
    id: stableId(index.topic, embedded.key),
    title: title || undefined,
    content,
    account: accountFor(embedded.node.author, embedded.sourceFile),
    created_at: embedded.node.create_date,
    url: embedded.node.article_url || undefined,
  };
}

function basePost(index, item, mode = 'focused') {
  const original = sourceText(item.node.body);
  const rewritten = sourceText(item.node.decontextualized_text ?? item.node.body);
  const plainText = mode === 'focused' ? original.text : rewritten.text;
  return {
    id: stableId(index.topic, item.key),
    sourceKey: item.key,
    content: toHtml(plainText),
    plainText,
    account: accountFor(item.node.author, item.sourceFile),
    created_at: item.node.create_date,
    favourites_count: Number(item.node.num_upvotes ?? 0),
    replies_count: index.children.get(item.key)?.length ?? 0,
    favourited: false,
    bookmarked: false,
    previewCard: previewCardFor(index, item),
    quotedPost: quotedPostFor(index, item),
  };
}

function ancestorsFor(index, key) {
  const chain = [];
  const seen = new Set([key]);
  const focusItem = index.byKey.get(key);
  let cursor = focusItem?.node.embedded_key ? null : focusItem?.parentKey ?? null;
  while (cursor) {
    assert(!seen.has(cursor), `${index.topic}: ancestor cycle at ${cursor}`);
    seen.add(cursor);
    const item = index.byKey.get(cursor);
    assert(item, `${index.topic}: missing ancestor ${cursor}`);
    chain.unshift(basePost(index, item, 'focused'));
    cursor = item.parentKey;
  }
  return chain;
}

function mapCategory(label, context) {
  const category = CATEGORY_MAP[label];
  assert(category, `${context}: unknown contribution type ${JSON.stringify(label)}`);
  return category;
}

function validRange(start, end, length) {
  return Number.isInteger(start)
    && Number.isInteger(end)
    && start >= 0
    && start < end
    && end <= length;
}

function validateSourceHighlight(highlight, text, context) {
  if (!highlight) return `${context}: missing highlight`;
  if (highlight.field && highlight.field !== 'text') {
    return `${context}: unsupported highlight field ${highlight.field}`;
  }
  if (!validRange(highlight.start, highlight.end, text.length)) {
    return `${context}: span [${highlight.start},${highlight.end}] outside text length ${text.length}`;
  }
  if (text.slice(highlight.start, highlight.end) !== highlight.text) {
    return `${context}: span text does not match display text`;
  }
  if (!(
    highlight.start <= highlight.crux_start
    && highlight.crux_start < highlight.crux_end
    && highlight.crux_end <= highlight.end
  )) {
    return `${context}: crux is not nested within highlight`;
  }
  return null;
}

// The judge may ground a focused-side span in `full_thread_text` when the
// relevant claim came from an ancestor rather than the focused reply itself.
// The FE relation contract indexes one displayed post, so structurally map that
// span back to the exact ancestor body that owns it. The prepared corpus keeps
// the same root-first `[author | date]` block format used by the judge.
function resolveFocusedHighlight(index, focusItem, row, context) {
  const highlight = row.highlights_focused?.[0];
  if (!highlight || !highlight.field || highlight.field === 'text') {
    return { error: null, targetItem: focusItem, row, retargeted: false };
  }
  if (highlight.field !== 'full_thread_text') {
    return {
      error: `${context} focus: unsupported highlight field ${highlight.field}`,
      targetItem: null,
      row: null,
      retargeted: false,
    };
  }

  const chain = [];
  const seen = new Set();
  let cursor = focusItem;
  while (cursor) {
    assert(!seen.has(cursor.key), `${context}: ancestor cycle at ${cursor.key}`);
    seen.add(cursor.key);
    chain.unshift(cursor);
    cursor = cursor.parentKey ? index.byKey.get(cursor.parentKey) : null;
  }

  let fullOffset = 0;
  for (const [position, item] of chain.entries()) {
    const isFocusedBlock = position === chain.length - 1;
    const marker = `[${item.node.author || 'unknown'} | ${item.node.create_date || 'unknown'}]`;
    const header = `${isFocusedBlock ? `**${marker}**` : marker}\n`;
    const body = String(item.node.body ?? '');
    const title = String(item.node.title ?? '').trim();
    // The judge renders a root *ancestor* as a bold title followed by its body,
    // while the prepared corpus stores that same text as `title\n\nbody`.
    const rootBody = title && body.startsWith(`${title}\n\n`)
      ? body.slice(title.length + 2)
      : body;
    const threadBody = !isFocusedBlock && position === 0 && title
      ? `**${title}**\n${rootBody}`
      : body;
    const bodyStart = fullOffset + header.length;
    const bodyEnd = bodyStart + threadBody.length;
    const ownsSpan = highlight.start >= bodyStart && highlight.end <= bodyEnd;
    if (ownsSpan) {
      if (threadBody.slice(highlight.start - bodyStart, highlight.end - bodyStart) !== highlight.text) {
        return {
          error: `${context} focus: full_thread_text offsets do not match the reconstructed thread`,
          targetItem: null,
          row: null,
          retargeted: false,
        };
      }
      const bodyMatches = [];
      let match = body.indexOf(highlight.text);
      while (match >= 0) {
        bodyMatches.push(match);
        match = body.indexOf(highlight.text, match + 1);
      }
      if (bodyMatches.length !== 1) {
        return {
          error: `${context} focus: full_thread_text span has ${bodyMatches.length} matches in ${item.key}`,
          targetItem: null,
          row: null,
          retargeted: false,
        };
      }
      const start = bodyMatches[0];
      const translated = {
        ...highlight,
        start,
        end: start + highlight.text.length,
        crux_start: start + (highlight.crux_start - highlight.start),
        crux_end: start + (highlight.crux_end - highlight.start),
        field: 'text',
      };
      const error = validateSourceHighlight(
        translated,
        body,
        `${context} focus (resolved from full_thread_text to ${item.key})`,
      );
      if (error) {
        return { error, targetItem: null, row: null, retargeted: false };
      }
      return {
        error: null,
        targetItem: item,
        row: { ...row, highlights_focused: [translated] },
        retargeted: item.key !== focusItem.key,
      };
    }
    fullOffset = bodyEnd + 2;
  }

  return {
    error: `${context} focus: full_thread_text span does not resolve to a post body`,
    targetItem: null,
    row: null,
    retargeted: false,
  };
}

function relationsFor(row, focusText, sideText, context) {
  const focusHighlight = row.highlights_focused?.[0];
  const sideHighlight = row.highlights_side?.[0];
  const error = validateSourceHighlight(focusHighlight, focusText.raw, `${context} focus`)
    || validateSourceHighlight(sideHighlight, sideText.raw, `${context} side`)
    || (row.span_match_ok !== true ? `${context}: span_match_ok is not true` : null);
  if (error) return { error, relations: [] };

  const types = row.judgment?.contribution_types?.length
    ? row.judgment.contribution_types
    : [{ label: 'Uncategorized' }];
  const topic = row.judgment?.topic ?? '';
  const relations = types.map((type) => ({
    focusStart: focusText.boundaryMap[focusHighlight.start],
    focusEnd: focusText.boundaryMap[focusHighlight.end],
    contentStart: sideText.boundaryMap[sideHighlight.start],
    contentEnd: sideText.boundaryMap[sideHighlight.end],
    focusCommentStart: focusText.boundaryMap[focusHighlight.crux_start],
    focusCommentEnd: focusText.boundaryMap[focusHighlight.crux_end],
    contentCommentStart: sideText.boundaryMap[sideHighlight.crux_start],
    contentCommentEnd: sideText.boundaryMap[sideHighlight.crux_end],
    category: mapCategory(type.label, context),
    topic,
  }));
  return { error: null, relations };
}

function relatedPost(index, row, focusItem, context) {
  const sideItem = index.byKey.get(row.side_post?.key);
  assert(sideItem, `${context}: side_post key does not resolve: ${row.side_post?.key}`);
  const original = sourceText(sideItem.node.body);
  const rewritten = sourceText(sideItem.node.decontextualized_text ?? sideItem.node.body);
  const built = relationsFor(row, sourceText(focusItem.node.body), rewritten, context);
  if (built.error) return { error: built.error, post: null };
  const base = basePost(index, sideItem, 'side');
  return {
    error: null,
    post: {
      id: base.id,
      sourceKey: sideItem.key,
      inReplyToId: sideItem.node.embedded_key
        ? null
        : sideItem.parentKey ? stableId(index.topic, sideItem.parentKey) : null,
      category: built.relations[0].category,
      rank: 0,
      globalRank: Number(row.rank),
      content: rewritten.text,
      relations: built.relations,
      account: base.account,
      created_at: base.created_at,
      favourites_count: base.favourites_count,
      replies_count: base.replies_count,
      favourited: false,
      bookmarked: false,
      previewCard: base.previewCard,
      quotedPost: base.quotedPost,
      rewrite: {
        content: rewritten.text,
        originalContent: original.text,
        significant: rewritten.text !== original.text,
        editSummary: rewritten.text !== original.text
          ? 'Adds the context needed to read this response outside its original thread.'
          : undefined,
      },
    },
  };
}

function descendantReply(index, row, focusItem, context) {
  const item = index.byKey.get(row.descendant_post?.key);
  assert(item, `${context}: descendant_post key does not resolve: ${row.descendant_post?.key}`);
  const rewritten = sourceText(item.node.decontextualized_text ?? item.node.body);
  const hasNoMarkup = row.span_match_ok === false
    && (row.highlights_focused?.length ?? 0) === 0
    && (row.highlights_side?.length ?? 0) === 0;
  const built = relationsFor(row, sourceText(focusItem.node.body), rewritten, context);
  // The prepared-data contract deliberately keeps every in-thread descendant,
  // including responsive descendants whose judge spans did not match. Those
  // render as ordinary replies without relation highlighting.
  if (!hasNoMarkup) assert(!built.error, built.error);
  assert(item.parentKey, `${context}: descendant has no parent`);
  const base = basePost(index, item, 'side');
  return {
    ...base,
    inReplyToId: stableId(index.topic, item.parentKey),
    rank: Number(row.rank),
    relations: hasNoMarkup ? [] : built.relations,
    unmarked: hasNoMarkup,
  };
}

// Prepared descendant lists contain the annotated descendants, but a deeper
// descendant can be retained even when its direct parent has no annotation.
// The frontend reply contract is a closed tree, so include those intermediate
// corpus parents as plain replies. They intentionally have no relation markup.
function closeReplyTree(index, focusItem, annotatedReplies, context) {
  const repliesByKey = new Map(
    annotatedReplies.map((reply) => [reply.sourceKey, reply]),
  );
  let addedParents = 0;

  for (const reply of annotatedReplies) {
    let cursor = index.byKey.get(reply.sourceKey);
    assert(cursor, `${context}: descendant source key does not resolve: ${reply.sourceKey}`);
    const seen = new Set([cursor.key]);

    while (cursor.parentKey && cursor.parentKey !== focusItem.key) {
      assert(!seen.has(cursor.parentKey), `${context}: descendant parent cycle at ${cursor.parentKey}`);
      seen.add(cursor.parentKey);
      const parent = index.byKey.get(cursor.parentKey);
      assert(parent, `${context}: descendant parent does not resolve: ${cursor.parentKey}`);
      if (!repliesByKey.has(parent.key)) {
        repliesByKey.set(parent.key, {
          ...basePost(index, parent, 'side'),
          inReplyToId: parent.parentKey ? stableId(index.topic, parent.parentKey) : focusItem.key,
          relations: [],
        });
        addedParents += 1;
      }
      cursor = parent;
    }

    assert(
      cursor.parentKey === focusItem.key,
      `${context}: ${reply.sourceKey} is not a descendant of focused post ${focusItem.key}`,
    );
  }

  // corpus.post_keys is emitted in deterministic forest order, which also puts
  // every parent before its children.
  const sourceOrder = new Map(index.corpus.post_keys.map((key, position) => [key, position]));
  const replies = [...repliesByKey.values()].sort(
    (left, right) => sourceOrder.get(left.sourceKey) - sourceOrder.get(right.sourceKey),
  );
  return { replies, addedParents };
}

function validateRelation(relation, focusText, sideText, context) {
  assert(validRange(relation.focusStart, relation.focusEnd, focusText.length), `${context}: focus range invalid`);
  assert(validRange(relation.contentStart, relation.contentEnd, sideText.length), `${context}: content range invalid`);
  assert(
    relation.focusStart <= relation.focusCommentStart
      && relation.focusCommentStart < relation.focusCommentEnd
      && relation.focusCommentEnd <= relation.focusEnd,
    `${context}: focus comment not nested`,
  );
  assert(
    relation.contentStart <= relation.contentCommentStart
      && relation.contentCommentStart < relation.contentCommentEnd
      && relation.contentCommentEnd <= relation.contentEnd,
    `${context}: content comment not nested`,
  );
  assert(VALID_CATEGORIES.has(relation.category), `${context}: invalid category ${relation.category}`);
  assert(typeof relation.topic === 'string' && relation.topic.length > 0, `${context}: topic missing`);
}

function validateEntry(entry) {
  const focus = entry.focusPost;
  assert(focus.plainText.length > 0, `focus ${focus.id}: empty body`);
  for (const related of entry.relatedPosts) {
    assert(related.relations.length > 0, `focus ${focus.id} related ${related.id}: no relations`);
    related.relations.forEach((relation, index) => {
      validateRelation(relation, focus.plainText, related.content, `focus ${focus.id} related ${related.id}[${index}]`);
    });
  }
  const replyIds = new Set(entry.replies.map((reply) => reply.id));
  for (const reply of entry.replies) {
    assert(
      reply.inReplyToId === focus.id || replyIds.has(reply.inReplyToId),
      `focus ${focus.id} reply ${reply.id}: parent ${reply.inReplyToId} not present`,
    );
    reply.relations.forEach((relation, index) => {
      validateRelation(relation, focus.plainText, reply.plainText, `focus ${focus.id} reply ${reply.id}[${index}]`);
    });
  }
}

function convertTopic(topic) {
  const topicDir = join(PREPARED_ROOT, topic);
  const index = indexCorpus(topic, json(join(topicDir, 'corpus_threads.json')));
  const annotationDir = join(topicDir, 'annotations');
  const files = readdirSync(annotationDir).filter((file) => file.endsWith('.json')).sort();
  assert(files.length > 0, `${topic}: no annotation files`);

  const records = files.map((file) => {
    const record = json(join(annotationDir, file));
    const focusKey = record.focused_post?.key;
    const focusItem = index.byKey.get(focusKey);
    assert(focusItem, `${topic}/${file}: focused_post key does not resolve: ${focusKey}`);
    return { file, record, focusKey, focusItem };
  });

  const diagnostics = [];
  const candidateBuckets = new Map();
  let retargetedCandidates = 0;
  for (const { file, record, focusItem } of records) {
    const rows = [...(record.candidate_posts ?? [])].sort((a, b) => a.rank - b.rank);
    const keptRows = MAX_CANDIDATES > 0 ? rows.slice(0, MAX_CANDIDATES) : rows;
    for (const row of keptRows) {
      const context = `${topic}/${file} candidate rank ${row.rank}`;
      const resolved = resolveFocusedHighlight(index, focusItem, row, context);
      if (resolved.error) {
        diagnostics.push(resolved.error);
        if (STRICT_SOURCE) throw new Error(`SOURCE: ${resolved.error}`);
        continue;
      }
      if (resolved.retargeted) retargetedCandidates += 1;
      const bucket = candidateBuckets.get(resolved.targetItem.key) ?? [];
      bucket.push({ row: resolved.row, context });
      candidateBuckets.set(resolved.targetItem.key, bucket);
    }
  }

  const entries = [];
  let mergedCandidates = 0;
  let closureReplies = 0;
  let unmarkedDescendants = 0;
  for (const { file, record, focusKey, focusItem } of records) {
    const relatedPosts = [];
    const relatedById = new Map();
    for (const { row, context } of candidateBuckets.get(focusKey) ?? []) {
      const built = relatedPost(index, row, focusItem, context);
      if (built.error) {
        diagnostics.push(built.error);
        if (STRICT_SOURCE) throw new Error(`SOURCE: ${built.error}`);
        continue;
      }
      const existing = relatedById.get(built.post.id);
      if (existing) {
        const relationKeys = new Set(existing.relations.map((relation) => JSON.stringify(relation)));
        for (const relation of built.post.relations) {
          const key = JSON.stringify(relation);
          if (!relationKeys.has(key)) {
            existing.relations.push(relation);
            relationKeys.add(key);
          }
        }
        mergedCandidates += 1;
        continue;
      }
      relatedPosts.push(built.post);
      relatedById.set(built.post.id, built.post);
    }

    const perCategory = new Map();
    for (const [index, post] of relatedPosts.entries()) {
      const rank = (perCategory.get(post.category) ?? 0) + 1;
      perCategory.set(post.category, rank);
      post.rank = rank;
      post.globalRank = index + 1;
    }

    const annotatedReplies = [...(record.descendant_posts ?? [])]
      .sort((a, b) => a.rank - b.rank)
      .map((row) => descendantReply(
        index,
        row,
        focusItem,
        `${topic}/${file} descendant rank ${row.rank}`,
      ));
    const closedReplies = closeReplyTree(
      index,
      focusItem,
      annotatedReplies,
      `${topic}/${file}`,
    );
    closureReplies += closedReplies.addedParents;
    unmarkedDescendants += annotatedReplies.filter((reply) => reply.unmarked).length;
    for (const reply of annotatedReplies) delete reply.unmarked;

    const entry = {
      topicId: topic,
      timelineRoot: focusItem.rootKey === focusItem.key,
      focusPost: basePost(index, focusItem, 'focused'),
      relatedPosts,
      ancestors: ancestorsFor(index, focusKey),
      replies: closedReplies.replies,
    };
    validateEntry(entry);
    entries.push(entry);
  }

  assert(
    entries.length === index.corpus.post_keys.length,
    `${topic}: ${entries.length} annotations for ${index.corpus.post_keys.length} corpus posts`,
  );
  return {
    entries,
    diagnostics,
    index,
    retargetedCandidates,
    mergedCandidates,
    closureReplies,
    unmarkedDescendants,
  };
}

const topics = requestedTopics();
const results = topics.map(convertTopic);
const entries = results
  .flatMap((result) => result.entries)
  .sort((left, right) => {
    if (left.timelineRoot !== right.timelineRoot) return left.timelineRoot ? -1 : 1;
    return new Date(right.focusPost.created_at).getTime() - new Date(left.focusPost.created_at).getTime();
  });
writeFileSync(OUT_PATH, `${JSON.stringify(entries, null, 2)}\n`, 'utf8');

const totalRelated = entries.reduce((sum, entry) => sum + entry.relatedPosts.length, 0);
const totalReplies = entries.reduce((sum, entry) => sum + entry.replies.length, 0);
const totalQuotes = results.reduce(
  (sum, result) => sum + [...result.index.roots.values()].filter((root) => root.embedded_key).length,
  0,
);
const diagnostics = results.flatMap((result) => result.diagnostics);
const rewritten = entries.reduce(
  (sum, entry) => sum + entry.relatedPosts.filter((post) => post.rewrite.significant).length,
  0,
);
const retargetedCandidates = results.reduce((sum, result) => sum + result.retargetedCandidates, 0);
const mergedCandidates = results.reduce((sum, result) => sum + result.mergedCandidates, 0);
const closureReplies = results.reduce((sum, result) => sum + result.closureReplies, 0);
const unmarkedDescendants = results.reduce((sum, result) => sum + result.unmarkedDescendants, 0);
const missingUpvotes = results.reduce(
  (sum, result) => sum + [...result.index.byKey.values()]
    .filter((item) => item.node.num_upvotes == null).length,
  0,
);

console.log(`✓ wrote ${OUT_PATH}`);
console.log(`  topics: ${topics.join(', ')}`);
console.log(`  ${entries.length} focus posts, ${totalRelated} related posts, ${totalReplies} descendant replies`);
console.log(`  ${totalQuotes} quote-tweet roots, ${rewritten} related cards with backend AI rewrites`);
if (retargetedCandidates) {
  console.log(
    `  retained ${retargetedCandidates} full-thread candidate connections on their owning ancestors`
      + ` (${mergedCandidates} merged with an existing side card)`,
  );
}
if (closureReplies) {
  console.log(`  included ${closureReplies} unannotated intermediate replies to keep descendant trees connected`);
}
if (unmarkedDescendants) {
  console.log(`  retained ${unmarkedDescendants} source descendants without relation markup (span_match_ok=false)`);
}
if (missingUpvotes) {
  console.log(`  defaulted ${missingUpvotes} source roots without num_upvotes to zero`);
}
if (diagnostics.length) {
  console.warn(`  omitted ${diagnostics.length} malformed candidate connections:`);
  diagnostics.forEach((diagnostic) => console.warn(`    - ${diagnostic}`));
}
