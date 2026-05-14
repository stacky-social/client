"use client";

import mockData from "../app/FakeData/listy-injection.json";
import type {
  ListyInjectionData,
  ListyInjectionEntry,
  FocusPostMock,
  RelatedPostMock,
  CategoryKey,
  Relation,
} from "../types/PostType";

const entries = mockData as unknown as ListyInjectionData;

export interface MockPostType {
  id: string;
  content: string;
  account: { username: string; acc?: string; acct?: string; avatar: string };
  replies_count: number;
  created_at: string;
  stackCount: number | null;
  favourites_count: number;
  favourited: boolean;
  bookmarked: boolean;
  media_attachments: any[];
  relatedStacks: any[];
  in_reply_to_id?: string | null;
}

function htmlContent(p: FocusPostMock | RelatedPostMock): string {
  if ("plainText" in p && p.content.trim().startsWith("<")) return p.content;
  return `<p>${(p as any).content}</p>`;
}

function toMockPostType(p: FocusPostMock | RelatedPostMock, relatedStacks: any[] = [], stackCount: number | null = null): MockPostType {
  return {
    id: p.id,
    content: htmlContent(p),
    account: {
      username: p.account.display_name,
      acct: p.account.acct,
      avatar: p.account.avatar,
    },
    replies_count: p.replies_count,
    created_at: p.created_at,
    stackCount,
    favourites_count: p.favourites_count,
    favourited: p.favourited,
    bookmarked: p.bookmarked,
    media_attachments: [],
    relatedStacks,
    in_reply_to_id: p.inReplyToId ?? null,
  };
}

// ─── Lookup maps (built once at module load) ─────────────────────────────────

const entryByFocusId = new Map<string, ListyInjectionEntry>();
const relatedById = new Map<string, { rp: RelatedPostMock; parent: ListyInjectionEntry }>();
const replyById = new Map<string, { reply: FocusPostMock; parent: ListyInjectionEntry }>();
const allPostsById = new Map<string, FocusPostMock | RelatedPostMock>();
/** child id → parent id (inherent thread hierarchy) */
const parentMap = new Map<string, string>();
/** parent id → child ids */
const childrenByParent = new Map<string, string[]>();

for (const e of entries) {
  entryByFocusId.set(e.focusPost.id, e);
  allPostsById.set(e.focusPost.id, e.focusPost);
  if (e.focusPost.inReplyToId) parentMap.set(e.focusPost.id, e.focusPost.inReplyToId);

  for (const reply of e.replies ?? []) {
    if (!replyById.has(reply.id)) replyById.set(reply.id, { reply, parent: e });
    if (!allPostsById.has(reply.id)) allPostsById.set(reply.id, reply);
    const parentId = reply.inReplyToId ?? e.focusPost.id;
    if (!parentMap.has(reply.id)) parentMap.set(reply.id, parentId);
  }

  for (const rp of e.relatedPosts) {
    if (!relatedById.has(rp.id)) relatedById.set(rp.id, { rp, parent: e });
    if (!allPostsById.has(rp.id)) allPostsById.set(rp.id, rp);
    if (rp.inReplyToId && !parentMap.has(rp.id)) parentMap.set(rp.id, rp.inReplyToId);
  }
}

parentMap.forEach((parentId, childId) => {
  const arr = childrenByParent.get(parentId) ?? [];
  arr.push(childId);
  childrenByParent.set(parentId, arr);
});

// ─── Public resolver API ─────────────────────────────────────────────────────

/** Get the focus PostType for a given id. Returns null if the id is not in the mock. */
export function getMockPost(id: string): MockPostType | null {
  const post = allPostsById.get(id);
  if (!post) return null;
  const stacks = getMockRelatedStacks(id);
  return toMockPostType(post, stacks, stacks.length || null);
}

/** Plain text of the post — for useUrlSync ?fs= hydration. */
export function getMockPlainText(id: string): string | null {
  const post = allPostsById.get(id);
  if (!post) return null;
  if ("plainText" in post) return post.plainText;
  return (post as RelatedPostMock).content;
}

/** Ancestor chain (oldest → direct parent). Walks parentMap. */
export function getMockAncestors(id: string): MockPostType[] {
  const chain: string[] = [];
  let cursor = parentMap.get(id);
  const seen = new Set<string>([id]);
  while (cursor && !seen.has(cursor)) {
    chain.unshift(cursor);
    seen.add(cursor);
    cursor = parentMap.get(cursor);
  }
  return chain
    .map((aid) => {
      const post = allPostsById.get(aid);
      return post ? toMockPostType(post) : null;
    })
    .filter((p): p is MockPostType => p !== null);
}

/** All descendant posts (flat). ThreadedReplyList rebuilds the tree from in_reply_to_id. */
export function getMockReplies(id: string): MockPostType[] {
  const out: MockPostType[] = [];
  const stack: string[] = [...(childrenByParent.get(id) ?? [])];
  const seen = new Set<string>();
  while (stack.length) {
    const cid = stack.shift()!;
    if (seen.has(cid)) continue;
    seen.add(cid);
    const post = allPostsById.get(cid);
    if (post) out.push(toMockPostType(post));
    const grand = childrenByParent.get(cid);
    if (grand) stack.push(...grand);
  }
  return out;
}

/** Build the focusRelations array for a given focus id — used by the Post
 *  component to render dimmed marks on the focus post (research-only signal).
 *  Mirrors /listy-injection/page.tsx line 53. Returns empty array when the
 *  post has no entry (synthetic / reply-only ids). */
export function getMockFocusRelations(id: string): Relation[] {
  const entry = entryByFocusId.get(id);
  if (!entry) return [];
  return entry.relatedPosts.flatMap((rp) => rp.relations ?? []);
}

/** Build aside-format related stacks (one per related post) for a given focus id.
 *  Mirrors the logic in /listy-injection/page.tsx::toPostData (flat stacks). */
export function getMockRelatedStacks(id: string): any[] {
  const entry = entryByFocusId.get(id);
  if (!entry) {
    // Synthetic: this id is a related post or reply in some other entry.
    // Build a synthetic sibling set from its parent entry (same logic as
    // syntheticEntryFromRelated in /listy-injection/page.tsx, simplified).
    const fromRelated = relatedById.get(id);
    if (!fromRelated) return [];
    const { rp, parent } = fromRelated;
    return parent.relatedPosts
      .filter((p) => p.id !== rp.id)
      .map((p) => ({
        stackId: `synthetic-${id}-${p.id}`,
        rel: p.category,
        size: 1,
        topPost: {
          id: p.id,
          created_at: p.created_at,
          replies_count: p.replies_count,
          favourites_count: p.favourites_count,
          favourited: p.favourited,
          bookmarked: p.bookmarked,
          content: `<p>${p.content}</p>`,
          account: {
            avatar: p.account.avatar,
            display_name: p.account.display_name,
            acct: p.account.acct,
          },
          content_rewritten: "",
          rewrite: { content: p.rewrite?.content ?? p.content, significant: p.rewrite?.significant ?? false },
          relations: p.relations,
        },
      }));
  }
  return entry.relatedPosts.map((rp) => ({
    stackId: `stack-${rp.id}`,
    rel: rp.category,
    size: 1,
    topPost: {
      id: rp.id,
      created_at: rp.created_at,
      replies_count: rp.replies_count,
      favourites_count: rp.favourites_count,
      favourited: rp.favourited,
      bookmarked: rp.bookmarked,
      content: `<p>${rp.content}</p>`,
      account: {
        avatar: rp.account.avatar,
        display_name: rp.account.display_name,
        acct: rp.account.acct,
      },
      content_rewritten: "",
      rewrite: { content: rp.rewrite?.content ?? rp.content, significant: rp.rewrite?.significant ?? false },
      relations: rp.relations,
    },
  }));
}

/** For the Recommended tab — show all related posts of this focus as flat MockPostType list. */
export function getMockRecommended(id: string): MockPostType[] {
  const entry = entryByFocusId.get(id);
  if (!entry) return [];
  return entry.relatedPosts.map((rp) => toMockPostType(rp));
}

/** True if the id exists anywhere in the mock data. */
export function mockHasPost(id: string): boolean {
  return allPostsById.has(id);
}
