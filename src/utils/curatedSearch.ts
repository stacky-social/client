import {
  DEMO_CORPORA,
  SCALE_DEMO_TOPIC_IDS,
  scaleDemoEntries,
} from '../data/demoCorpora';
import type {
  FocusPostMock,
  RelatedPostMock,
  ReplyMock,
} from '../types/PostType';
import {
  getMockFocusRelations,
  getMockRelatedStacks,
  getMockReplyCount,
  getMockReplyParentId,
} from './mockPostResolver';
import {
  curatedSearchScore,
  matchesCuratedSearch,
  normalizeCuratedSearchText,
} from './curatedSearchCore.mjs';
import { normalizeMastodonText } from './mastodonContent.mjs';

type CuratedSourcePost = FocusPostMock | RelatedPostMock | ReplyMock;

export interface CuratedSearchAccount {
  acct: string;
  display_name: string;
  username: string;
  avatar: string;
  followers_count: number;
  following_count: number;
  statuses_count: number;
  note: string;
}

export interface CuratedSearchPost {
  id: string;
  content: string;
  account: {
    username: string;
    acct: string;
    avatar: string;
  };
  replies_count: number;
  created_at: string;
  stackCount: number | null;
  favourites_count: number;
  favourited: boolean;
  bookmarked: boolean;
  media_attachments: Array<{ url: string }>;
  previewCard?: FocusPostMock['previewCard'];
  quotedPost?: FocusPostMock['quotedPost'];
  relatedStacks: any[];
  focusRelations: ReturnType<typeof getMockFocusRelations>;
  in_reply_to_id?: string | null;
  topicId: string;
  timelineRoot: boolean;
}

export interface CuratedSearchHashtag {
  name: string;
  description: string;
  local: true;
  topicId: string;
}

interface IndexedPost {
  post: CuratedSourcePost;
  topicId: string;
  timelineRoot: boolean;
  canonicalFocus: boolean;
  searchText: string;
}

const indexedById = new Map<string, IndexedPost>();

function postPlainText(post: CuratedSourcePost): string {
  return 'plainText' in post ? post.plainText : post.content;
}

function indexPost(
  post: CuratedSourcePost,
  topicId: string,
  timelineRoot: boolean,
  canonicalFocus = false,
): void {
  const existing = indexedById.get(post.id);
  // A focus-post copy is the canonical searchable representation when one id
  // also appears as a reply/related response elsewhere in the corpus.
  if (existing && (!canonicalFocus || existing.canonicalFocus)) return;
  indexedById.set(post.id, {
    post,
    topicId,
    timelineRoot,
    canonicalFocus,
    // Post results are content matches only. Author/handle matches live in the
    // People section; keeping them separate guarantees every returned post has
    // an actual in-body term for the visual search highlight.
    searchText: normalizeMastodonText(postPlainText(post)),
  });
}

for (const entry of scaleDemoEntries) {
  const topicId = String(entry.topicId ?? '');
  indexPost(entry.focusPost, topicId, entry.timelineRoot === true, true);
  for (const post of entry.ancestors ?? []) indexPost(post, topicId, false);
  for (const post of entry.replies ?? []) indexPost(post, topicId, false);
  for (const post of entry.relatedPosts ?? []) indexPost(post, topicId, false);
}

const indexedPosts = Array.from(indexedById.values());

const accountsByAcct = new Map<string, CuratedSearchAccount>();
for (const { post } of indexedPosts) {
  const key = normalizeCuratedSearchText(post.account.acct);
  const existing = accountsByAcct.get(key);
  if (existing) {
    existing.statuses_count += 1;
    continue;
  }
  accountsByAcct.set(key, {
    acct: post.account.acct,
    display_name: post.account.display_name,
    username: post.account.acct.split('@')[0] || post.account.acct,
    avatar: post.account.avatar,
    followers_count: 0,
    following_count: 0,
    statuses_count: 1,
    note: '',
  });
}

function toSearchPost(indexed: IndexedPost): CuratedSearchPost {
  const { post, topicId, timelineRoot, canonicalFocus } = indexed;
  const relatedStacks = canonicalFocus ? getMockRelatedStacks(post.id) : [];
  const content = 'plainText' in post && post.content.trim().startsWith('<')
    ? post.content
    : `<p>${postPlainText(post)}</p>`;
  return {
    id: post.id,
    content,
    account: {
      username: post.account.display_name,
      acct: post.account.acct,
      avatar: post.account.avatar,
    },
    replies_count: getMockReplyCount(post.id),
    created_at: post.created_at,
    stackCount: relatedStacks.length || null,
    favourites_count: post.favourites_count,
    favourited: post.favourited,
    bookmarked: post.bookmarked,
    media_attachments: [],
    previewCard: post.previewCard ?? null,
    quotedPost: post.quotedPost ?? null,
    relatedStacks,
    focusRelations: canonicalFocus ? getMockFocusRelations(post.id) : [],
    in_reply_to_id: getMockReplyParentId(post.id) ?? post.inReplyToId ?? null,
    topicId,
    timelineRoot,
  };
}

/** Immutable corpus search. No localStorage or generic Mastodon data is read. */
export function searchCuratedPosts(query: string, limit = 60): CuratedSearchPost[] {
  return indexedPosts
    .filter((record) => matchesCuratedSearch(record.searchText, query))
    .map((record) => ({
      record,
      score: curatedSearchScore({
        text: postPlainText(record.post),
        author: record.post.account.display_name,
        account: record.post.account.acct,
        timelineRoot: record.timelineRoot,
      }, query),
    }))
    .sort((left, right) =>
      right.score - left.score
      || Number(right.record.timelineRoot) - Number(left.record.timelineRoot)
      || Date.parse(right.record.post.created_at) - Date.parse(left.record.post.created_at)
      || left.record.post.id.localeCompare(right.record.post.id)
    )
    .slice(0, Math.max(0, limit))
    .map(({ record }) => toSearchPost(record));
}

export function searchCuratedAccounts(query: string, limit = 10): CuratedSearchAccount[] {
  if (!query.trim()) return [];
  return Array.from(accountsByAcct.values())
    .filter((account) => matchesCuratedSearch(
      `${account.display_name} ${account.username} ${account.acct}`,
      query,
    ))
    .sort((left, right) =>
      right.statuses_count - left.statuses_count
      || left.display_name.localeCompare(right.display_name)
    )
    .slice(0, Math.max(0, limit));
}

export function getCuratedSuggestedAccounts(limit = 3): CuratedSearchAccount[] {
  return Array.from(accountsByAcct.values())
    .sort((left, right) =>
      right.statuses_count - left.statuses_count
      || left.display_name.localeCompare(right.display_name)
    )
    .slice(0, Math.max(0, limit));
}

export function getCuratedHashtags(query = ''): CuratedSearchHashtag[] {
  const normalized = normalizeCuratedSearchText(query).replace(/^#/, '');
  return SCALE_DEMO_TOPIC_IDS
    .map((topicId) => DEMO_CORPORA[topicId])
    .filter((corpus) => !normalized || matchesCuratedSearch(
      `${corpus.hashtag} ${corpus.label} ${corpus.description}`,
      normalized,
    ))
    .map((corpus) => ({
      name: corpus.hashtag,
      description: corpus.description,
      local: true as const,
      topicId: corpus.id,
    }));
}

export function getCuratedPostsByHashtag(hashtag: string): CuratedSearchPost[] {
  const corpus = SCALE_DEMO_TOPIC_IDS
    .map((topicId) => DEMO_CORPORA[topicId])
    .find((candidate) => normalizeCuratedSearchText(candidate.hashtag) === normalizeCuratedSearchText(hashtag).replace(/^#/, ''));
  if (!corpus) return [];
  return indexedPosts
    .filter((record) => record.topicId === corpus.id && record.timelineRoot)
    .sort((left, right) =>
      Date.parse(right.post.created_at) - Date.parse(left.post.created_at)
      || left.post.id.localeCompare(right.post.id)
    )
    .map(toSearchPost);
}

export function getCuratedPostsByAccount(account: string): CuratedSearchPost[] {
  const normalized = normalizeCuratedSearchText(account).replace(/^@/, '');
  return indexedPosts
    .filter((record) => normalizeCuratedSearchText(record.post.account.acct) === normalized)
    .sort((left, right) =>
      Date.parse(right.post.created_at) - Date.parse(left.post.created_at)
      || left.post.id.localeCompare(right.post.id)
    )
    .slice(0, 60)
    .map(toSearchPost);
}
