"use client";

/**
 * localStore.ts — localStorage-backed, REST-shaped data store for local (no-backend) mode.
 * =========================================================================================
 *
 * This is the keystone of the local/demo/research mode described in
 * `docs/superpowers/specs/2026-06-23-local-persistence-layer-design.md`.
 *
 * The app behaves as if it has a backend — like, bookmark, comment, follow, and
 * posting all work and PERSIST across reloads — but there is no network. All mutable
 * state lives here, is persisted to `localStorage` under a single versioned key, and
 * is seeded from the existing mock data (`FakeData/listy-injection.json` +
 * `FakeData/FakeUsers.js`) on first load.
 *
 * SWAP-TO-REST STORY
 * ------------------
 * The public API below is intentionally shaped like the eventual Mastodon REST API.
 * Each mutating/reading function carries, in a comment, the REST endpoint(s) it will
 * call once the app goes live. Going live is then a *mechanical* edit of THIS FILE
 * ONLY: reimplement the function bodies to `fetch` those endpoints and point `me` at
 * the authenticated OAuth account. No UI/page changes required.
 *
 * POST / ACCOUNT SHAPES
 * ---------------------
 * Posts are produced in the same Mastodon-flavoured snake_case shape that
 * `mockPostResolver.ts` already emits (`MockPostType`-compatible), so the existing
 * `Post` component, feed (`PostList`), and thread views can render store posts with no
 * adaptation. See the `Post` / `Account` / `Comment` types exported below.
 */

import mockData from "../app/FakeData/listy-injection.json";
import { fakeUsers } from "../app/FakeData/FakeUsers.js";
import type {
  ListyInjectionData,
  ListyInjectionEntry,
  FocusPostMock,
  RelatedPostMock,
  Relation,
} from "../types/PostType";
import { getMockFocusRelations, getMockRelatedStacks } from "./mockPostResolver";

// ─── Exported data shapes ────────────────────────────────────────────────────

/**
 * An account/author. Mirrors the `account` object on mock posts (display_name /
 * acct / avatar) plus the extra profile fields a user page needs. `acct` is the
 * stable identity key (e.g. "nickl_nyt@stacky-nyt.com" or "you").
 *
 * REST equivalent: Mastodon `Account` entity (GET /api/v1/accounts/{id}).
 */
export interface Account {
  /** Stable identity key — the handle, e.g. "nickl_nyt@stacky-nyt.com" or "you". */
  acct: string;
  /** Human-readable display name, e.g. "nickl_nyt". */
  display_name: string;
  /** Local part of the handle (before the @), used as @username. */
  username: string;
  avatar: string;
  /** Profile counters — zero for generated/unknown accounts. */
  followers_count: number;
  following_count: number;
  statuses_count: number;
  note: string;
}

/**
 * A post (focus post, ancestor, reply, related post, or user-created post).
 *
 * Snake_case Mastodon-style shape, identical to what `mockPostResolver.MockPostType`
 * produces so the `Post` component / feed / thread render it directly. `account`
 * exposes `username` (= display_name) for the component's `author` prop and `acct`
 * for navigation, matching the mapping in PostList / listy-injection pages.
 *
 * REST equivalent: Mastodon `Status` entity (GET /api/v1/statuses/{id}).
 */
export interface Post {
  id: string;
  /** HTML content (Mastodon-style, e.g. "<p>…</p>"). */
  content: string;
  account: {
    /** Display name — the `Post` component reads this as `author`. */
    username: string;
    /** Handle / identity key — the `Post` component reads this as `account`. */
    acct: string;
    avatar: string;
  };
  replies_count: number;
  created_at: string;
  /** Aside stack count; null when there are no related stacks. */
  stackCount: number | null;
  favourites_count: number;
  favourited: boolean;
  bookmarked: boolean;
  /** Media attachment objects ({ url }); empty for seeded text posts. */
  media_attachments: any[];
  /** Aside-format related stacks for this post (see mockPostResolver.getMockRelatedStacks). */
  relatedStacks: any[];
  /** Offset annotations connecting this post to its related responses. */
  focusRelations: Relation[];
  /** Parent post id for thread hierarchy; null for roots. */
  in_reply_to_id?: string | null;
}

/**
 * A user-authored comment/reply. Persisted per-post and rendered into the thread.
 * It is a `Post` (so thread components can render it like any other reply) tagged
 * with `postId` (its parent) for convenient grouping/retrieval.
 *
 * REST equivalent: a reply Status created via POST /api/v1/statuses
 * (`{ status, in_reply_to_id }`), surfaced through the context timeline.
 */
export interface Comment extends Post {
  /** Id of the post this comment replies to. */
  postId: string;
}

/** The full persisted state. Serialised to localStorage as-is. */
export interface LocalState {
  /** Every seeded post/reply + user-created posts/comments, by id. */
  posts: Record<string, Post>;
  /** Every known account, by acct. */
  accounts: Record<string, Account>;
  /** Liked post ids. */
  liked: string[];
  /** Bookmarked post ids. */
  bookmarked: string[];
  /** Followed account acct keys. */
  following: string[];
  /** postId -> user-authored replies (also mirrored into `posts`). */
  comments: Record<string, Comment[]>;
  /** The local "current user". */
  me: Account;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const STORAGE_KEY = "stacky:localStore:v1";
const DEFAULT_AVATAR = "https://beta.stacky.social/avatars/original/missing.png";

const entries = mockData as unknown as ListyInjectionData;

// ─── Helpers: shape conversion ───────────────────────────────────────────────

/** Build the HTML `content` for a seeded post (related posts store plain text). */
function htmlContentFor(p: FocusPostMock | RelatedPostMock): string {
  // FocusPostMock content is already HTML; RelatedPostMock content is plain text.
  if ("plainText" in p && p.content.trim().startsWith("<")) return p.content;
  return `<p>${(p as RelatedPostMock).content}</p>`;
}

/** Convert a mock post (focus/ancestor/reply/related) into the store `Post` shape. */
function mockToPost(p: FocusPostMock | RelatedPostMock): Post {
  return {
    id: p.id,
    content: htmlContentFor(p),
    account: {
      username: p.account.display_name,
      acct: p.account.acct,
      avatar: p.account.avatar || DEFAULT_AVATAR,
    },
    replies_count: p.replies_count,
    created_at: p.created_at,
    stackCount: null,
    favourites_count: p.favourites_count,
    favourited: p.favourited,
    bookmarked: p.bookmarked,
    media_attachments: [],
    relatedStacks: [],
    focusRelations: [],
    in_reply_to_id: p.inReplyToId ?? null,
  };
}

/** Build an Account from a mock post's embedded account object. */
function mockAccount(a: { display_name: string; acct: string; avatar: string }): Account {
  return {
    acct: a.acct,
    display_name: a.display_name,
    username: usernameFromAcct(a.acct),
    avatar: a.avatar || DEFAULT_AVATAR,
    followers_count: 0,
    following_count: 0,
    statuses_count: 0,
    note: "",
  };
}

/** "nickl_nyt@stacky-nyt.com" -> "nickl_nyt"; "you" -> "you". */
function usernameFromAcct(acct: string): string {
  return acct.split("@")[0] || acct;
}

/** Title-case a handle into a friendly display name: "rural_voice" -> "Rural Voice". */
function displayNameFromAcct(acct: string): string {
  const local = usernameFromAcct(acct);
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ") || acct;
}

/** Generated default profile for an unknown handle (no posts, zero counts). */
function defaultAccountFor(acct: string): Account {
  return {
    acct,
    display_name: displayNameFromAcct(acct),
    username: usernameFromAcct(acct),
    avatar: DEFAULT_AVATAR,
    followers_count: 0,
    following_count: 0,
    statuses_count: 0,
    note: "",
  };
}

/** Newest-first comparator on `created_at`. */
function byNewest(a: Post, b: Post): number {
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
}

// ─── Seeding ─────────────────────────────────────────────────────────────────

/** The local current-user identity. When real auth returns, populate from OAuth. */
function makeMe(): Account {
  return {
    acct: "you",
    display_name: "You",
    username: "you",
    avatar: DEFAULT_AVATAR,
    followers_count: 0,
    following_count: 0,
    statuses_count: 0,
    note: "This is you, in local mode.",
  };
}

/** Build the initial state from the mock dataset. Pure — no localStorage access. */
function seedState(meOverride?: Account): LocalState {
  const posts: Record<string, Post> = {};
  const accounts: Record<string, Account> = {};

  const addPost = (mp: FocusPostMock | RelatedPostMock) => {
    if (!posts[mp.id]) posts[mp.id] = mockToPost(mp);
    if (mp.account && !accounts[mp.account.acct]) {
      accounts[mp.account.acct] = mockAccount(mp.account);
    }
  };

  for (const e of entries) {
    addPost(e.focusPost);
    for (const a of e.ancestors ?? []) addPost(a);
    for (const r of e.replies ?? []) addPost(r);
    for (const rp of e.relatedPosts ?? []) addPost(rp);
  }

  // Keep the demo store backend-shaped: focus posts carry their own related
  // response payload and annotation offsets. Consumers should never need to
  // know which fixture produced a post or perform a second hidden resolver
  // lookup just to decide whether the related pane exists.
  for (const e of entries) {
    const post = posts[e.focusPost.id];
    if (!post) continue;
    const relatedStacks = getMockRelatedStacks(e.focusPost.id);
    posts[e.focusPost.id] = {
      ...post,
      stackCount: relatedStacks.length || null,
      relatedStacks,
      focusRelations: getMockFocusRelations(e.focusPost.id),
    };
  }

  // Seed accounts from FakeUsers too (they have no posts, but should resolve).
  for (const u of fakeUsers) {
    const acct = u.email?.split("@")[0] || u.accountId;
    if (acct && !accounts[acct]) {
      accounts[acct] = {
        acct,
        display_name: u.name || displayNameFromAcct(acct),
        username: usernameFromAcct(acct),
        avatar: u.profilePictureUrl || DEFAULT_AVATAR,
        followers_count: 0,
        following_count: 0,
        statuses_count: 0,
        note: "",
      };
    }
  }

  // Compute statuses_count per author from seeded posts.
  for (const p of Object.values(posts)) {
    const acc = accounts[p.account.acct];
    if (acc) acc.statuses_count += 1;
  }

  const me = meOverride ?? makeMe();
  accounts[me.acct] = me;

  return {
    posts,
    accounts,
    liked: [],
    bookmarked: [],
    following: [],
    comments: {},
    me,
  };
}

// ─── Persistence (SSR-safe) ──────────────────────────────────────────────────

const isBrowser = (): boolean => typeof window !== "undefined";

/**
 * In-memory state. On the server this is always a fresh seed (empty personal
 * lists), so SSR renders cleanly and the client re-hydrates from localStorage on
 * first read. On the client it is lazily loaded/migrated from localStorage once.
 */
let state: LocalState = seedState();
let hydrated = false;

/** Read + parse persisted state, falling back to (and persisting) a fresh seed. */
function load(): LocalState {
  if (!isBrowser()) return seedState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const seeded = seedState();
      persist(seeded);
      return seeded;
    }
    const parsed = JSON.parse(raw) as LocalState;
    // Defensive: ensure all top-level keys exist (forward-compat with older blobs).
    const seed = seedState();
    const persistedPosts = parsed.posts ?? {};
    const posts: Record<string, Post> = { ...seed.posts, ...persistedPosts };

    // Migrate existing v1 browser data without discarding likes, bookmarks, or
    // user-created posts. Related stacks, annotations, and contextual rewrites
    // are read-only fixture enrichment, so always refresh those fields from the
    // latest seed instead of pinning a participant to a stale demo payload.
    for (const [id, seededPost] of Object.entries(seed.posts)) {
      const persistedPost = persistedPosts[id];
      if (!persistedPost) continue;
      posts[id] = {
        ...seededPost,
        ...persistedPost,
        relatedStacks: seededPost.relatedStacks,
        focusRelations: seededPost.focusRelations,
        stackCount: seededPost.stackCount,
      };
    }

    return {
      posts,
      accounts: parsed.accounts ?? seed.accounts,
      liked: parsed.liked ?? [],
      bookmarked: parsed.bookmarked ?? [],
      following: parsed.following ?? [],
      comments: parsed.comments ?? {},
      me: parsed.me ?? seed.me,
    };
  } catch {
    // Corrupt blob — reset to a clean seed.
    const seeded = seedState();
    persist(seeded);
    return seeded;
  }
}

/** Ensure `state` reflects localStorage on the client (idempotent). */
function ensureHydrated(): void {
  if (hydrated || !isBrowser()) return;
  state = load();
  hydrated = true;
}

/** Write `state` to localStorage synchronously (no-op on the server). */
function persist(next: LocalState): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Quota / serialisation failure — keep the in-memory copy authoritative.
  }
}

/**
 * Replace every participant-controlled value with a freshly seeded store.
 *
 * Study sessions use this at both entry and exit so posts, replies, likes,
 * bookmarks, and follows from one participant cannot leak into the next. An
 * optional local identity lets the composer and replies render the active
 * participant consistently without creating a Mastodon access token.
 */
export function resetLocalStore(me?: Account): void {
  state = seedState(me);
  hydrated = isBrowser();
  memoState = null;
  memo = new Map();
  persist(state);
  listeners.forEach((listener) => listener());
}

// ─── Subscription (useSyncExternalStore wiring) ──────────────────────────────

const listeners = new Set<() => void>();

/** Subscribe to any store mutation. Returns an unsubscribe fn. */
export function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Current immutable snapshot — the identity changes on every mutation. */
export function getSnapshot(): LocalState {
  ensureHydrated();
  return state;
}

/** Server snapshot — a stable fresh seed (empty personal lists) for hydration. */
let serverSnapshot: LocalState | null = null;
function getServerSnapshot(): LocalState {
  if (!serverSnapshot) serverSnapshot = seedState();
  return serverSnapshot;
}

/**
 * Apply a mutation: replace `state` with a new object, persist, notify.
 * `mutator` receives a shallow-cloned draft it may mutate; the returned object
 * becomes the new snapshot (new identity → React re-renders).
 */
function mutate(mutator: (draft: LocalState) => LocalState | void): void {
  ensureHydrated();
  // Shallow clone the containers we may touch so the snapshot identity changes.
  const draft: LocalState = {
    posts: { ...state.posts },
    accounts: { ...state.accounts },
    liked: [...state.liked],
    bookmarked: [...state.bookmarked],
    following: [...state.following],
    comments: { ...state.comments },
    me: state.me,
  };
  const result = mutator(draft);
  state = result ?? draft;
  persist(state);
  listeners.forEach((l) => l());
}

// ─── React hook ──────────────────────────────────────────────────────────────

import { useSyncExternalStore } from "react";

/**
 * Subscribe a component to a slice of the store. Re-renders on ANY mutation when
 * the selected value changes by identity. SSR-safe via a stable server snapshot.
 *
 * Example: `const liked = useLocalStore((s) => getLiked());`
 */
export function useLocalStore<T>(selector: (snapshot: LocalState) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => selector(getSnapshot()),
    () => selector(getServerSnapshot()),
  );
}

const noopSubscribe = () => () => {};

/**
 * True only AFTER client mount — false on the server and on the first client
 * (hydration) render. Gate any localStorage-dependent UI on this so the first
 * client render matches the server HTML, then re-renders with real data. Avoids
 * React hydration mismatches for store-backed feeds/states.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

// ─── Internal read helpers ───────────────────────────────────────────────────

/** Resolve a post by id from current state (hydrating first). */
function readPost(id: string): Post | undefined {
  ensureHydrated();
  return state.posts[id];
}

/** All posts authored by a given acct, newest first. */
function postsByAcct(acct: string): Post[] {
  ensureHydrated();
  return Object.values(state.posts)
    .filter((p) => p.account.acct === acct)
    .sort(byNewest);
}

// ─── Derived-list memoization ────────────────────────────────────────────────
// useSyncExternalStore requires getSnapshot (and any selector built on it) to
// return a STABLE reference when nothing changed — otherwise it warns about an
// uncached snapshot, loops, and breaks hydration. The list getters below build
// fresh arrays, so memoize them keyed on the current `state` identity (which only
// changes inside mutate()). Same state → same array reference; a mutation resets
// the cache so consumers re-render exactly once.
let memoState: LocalState | null = null;
let memo = new Map<string, unknown>();
function memoized<T>(key: string, compute: () => T): T {
  ensureHydrated();
  if (memoState !== state) {
    memoState = state;
    memo = new Map();
  }
  if (!memo.has(key)) memo.set(key, compute());
  return memo.get(key) as T;
}

// ─── Public REST-shaped API ──────────────────────────────────────────────────
//
// Each function notes the Mastodon endpoint it will call when swapped to REST.

/**
 * Home timeline: posts authored by (following ∪ me), newest first.
 * Empty until you follow someone or post.
 *
 * REST: GET /api/v1/timelines/home
 */
export function getHomeFeed(): Post[] {
  return memoized("home", () => {
    const sources = new Set<string>([state.me.acct, ...state.following]);
    const personal = Object.values(state.posts).filter((p) => sources.has(p.account.acct));

    // A fresh local profile still needs a meaningful Home to evaluate. This is
    // the simulated equivalent of a backend "For you" blend: three focus posts
    // with annotated related responses, interleaved with three ordinary replies
    // that deliberately have no related payload. Following and self-authored
    // posts merge into the same chronological timeline without duplicates.
    const starterIds = [
      "152053690", "152052643", "152047717",
      "149294079", "149289030", "143203257",
    ];
    const starter = starterIds
      .map((id) => state.posts[id])
      .filter((post): post is Post => !!post);
    return Array.from(new Map([...personal, ...starter].map((post) => [post.id, post])).values())
      .sort(byNewest);
  });
}

/**
 * JSON-backed posts authored by accounts the participant explicitly followed.
 *
 * Authenticated Home uses this as a temporary supplemental source beside the
 * real Mastodon timeline. Once the curated corpus is imported into Mastodon,
 * the same UI can rely on the server timeline and remove this adapter.
 */
export function getFollowedDemoFeed(): Post[] {
  return memoized("followedDemo", () => {
    const followed = new Set(state.following);
    if (followed.size === 0) return [];
    // Match the actual /ChineseEVs timeline contract: its feed contains focus
    // posts, while ancestors, replies, and related responses belong inside the
    // focus/detail experience. Returning every stored record here buried focus
    // posts beneath newer standalone replies that correctly had no related pane.
    const focusPostIds = new Set(entries.map((entry) => entry.focusPost.id));
    return Object.values(state.posts)
      .filter((post) => focusPostIds.has(post.id) && followed.has(post.account.acct))
      .sort(byNewest);
  });
}

/**
 * Bookmarked posts, newest first.
 *
 * REST: GET /api/v1/bookmarks
 */
export function getBookmarks(): Post[] {
  return memoized("bookmarks", () =>
    state.bookmarked
      .map((id) => state.posts[id])
      .filter((p): p is Post => !!p)
      .sort(byNewest),
  );
}

/**
 * Liked (favourited) posts, newest first.
 *
 * REST: GET /api/v1/favourites
 */
export function getLiked(): Post[] {
  return memoized("liked", () =>
    state.liked
      .map((id) => state.posts[id])
      .filter((p): p is Post => !!p)
      .sort(byNewest),
  );
}

/**
 * Profile for an acct. Unknown handle → generated default (name/username from the
 * acct, default avatar, zero counts).
 *
 * REST: GET /api/v1/accounts/lookup?acct={acct}  (then GET /api/v1/accounts/{id})
 */
export function getUserProfile(acct: string): Account {
  ensureHydrated();
  return state.accounts[acct] ?? defaultAccountFor(acct);
}

/**
 * All posts authored by an acct, newest first. Unknown handle → [].
 *
 * REST: GET /api/v1/accounts/{id}/statuses
 */
export function getUserPosts(acct: string): Post[] {
  return memoized("userPosts:" + acct, () => postsByAcct(acct));
}

/**
 * Resolve a single post by id.
 *
 * REST: GET /api/v1/statuses/{id}
 */
export function getPost(id: string): Post | undefined {
  return readPost(id);
}

/**
 * Create a post authored by `me`. Added to the pool; surfaces at the top of Home
 * (newest first). Returns the created post.
 *
 * REST: POST /api/v1/statuses  ({ status })
 */
export function createPost(text: string): Post {
  ensureHydrated();
  const me = state.me;
  const id = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const post: Post = {
    id,
    content: `<p>${escapeHtml(text)}</p>`,
    account: { username: me.display_name, acct: me.acct, avatar: me.avatar },
    replies_count: 0,
    created_at: new Date().toISOString(),
    stackCount: null,
    favourites_count: 0,
    favourited: false,
    bookmarked: false,
    media_attachments: [],
    relatedStacks: [],
    focusRelations: [],
    in_reply_to_id: null,
  };
  mutate((draft) => {
    draft.posts[id] = post;
    const meAcc = draft.accounts[me.acct];
    if (meAcc) draft.accounts[me.acct] = { ...meAcc, statuses_count: meAcc.statuses_count + 1 };
  });
  return post;
}

/**
 * Add a comment (reply) authored by `me` to `postId`. Persisted, retrievable via
 * getComments, and added to the post pool so thread components can render it.
 * Increments the parent post's replies_count. Returns the created comment.
 *
 * REST: POST /api/v1/statuses  ({ status, in_reply_to_id: postId })
 */
export function addComment(postId: string, text: string): Comment {
  ensureHydrated();
  const me = state.me;
  const id = `local-reply-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const comment: Comment = {
    id,
    postId,
    content: `<p>${escapeHtml(text)}</p>`,
    account: { username: me.display_name, acct: me.acct, avatar: me.avatar },
    replies_count: 0,
    created_at: new Date().toISOString(),
    stackCount: null,
    favourites_count: 0,
    favourited: false,
    bookmarked: false,
    media_attachments: [],
    relatedStacks: [],
    focusRelations: [],
    in_reply_to_id: postId,
  };
  mutate((draft) => {
    draft.posts[id] = comment;
    draft.comments[postId] = [...(draft.comments[postId] ?? []), comment];
    const parent = draft.posts[postId];
    if (parent) draft.posts[postId] = { ...parent, replies_count: parent.replies_count + 1 };
  });
  return comment;
}

/**
 * User-authored replies for a post (newest first). Does not include seeded mock
 * replies — those come from mockPostResolver. Use this for the local reply thread.
 *
 * REST: GET /api/v1/statuses/{id}/context  (filtered to the user's own replies)
 */
export function getComments(postId: string): Comment[] {
  return memoized("comments:" + postId, () =>
    [...(state.comments[postId] ?? [])].sort(byNewest),
  );
}

/**
 * Toggle like on a post. Updates liked[], the post's `favourited` flag and
 * `favourites_count`. Returns the new liked state.
 *
 * REST: POST /api/v1/statuses/{id}/favourite  |  /api/v1/statuses/{id}/unfavourite
 */
export function toggleLike(postId: string): { ok: true; value: boolean } {
  ensureHydrated();
  const isNowLiked = !state.liked.includes(postId);
  mutate((draft) => {
    draft.liked = isNowLiked
      ? [...draft.liked, postId]
      : draft.liked.filter((id) => id !== postId);
    const p = draft.posts[postId];
    if (p) {
      draft.posts[postId] = {
        ...p,
        favourited: isNowLiked,
        favourites_count: Math.max(0, p.favourites_count + (isNowLiked ? 1 : -1)),
      };
    }
  });
  return { ok: true, value: isNowLiked };
}

/**
 * Toggle bookmark on a post. Updates bookmarked[] and the post's `bookmarked`
 * flag. Returns the new bookmarked state.
 *
 * REST: POST /api/v1/statuses/{id}/bookmark  |  /api/v1/statuses/{id}/unbookmark
 */
export function toggleBookmark(postId: string): { ok: true; value: boolean } {
  ensureHydrated();
  const isNowBookmarked = !state.bookmarked.includes(postId);
  mutate((draft) => {
    draft.bookmarked = isNowBookmarked
      ? [...draft.bookmarked, postId]
      : draft.bookmarked.filter((id) => id !== postId);
    const p = draft.posts[postId];
    if (p) draft.posts[postId] = { ...p, bookmarked: isNowBookmarked };
  });
  return { ok: true, value: isNowBookmarked };
}

/**
 * Toggle following an account. Updates following[]. Returns the new follow state.
 *
 * REST: POST /api/v1/accounts/{id}/follow  |  /api/v1/accounts/{id}/unfollow
 */
export function toggleFollow(acct: string): { following: boolean } {
  ensureHydrated();
  const isNowFollowing = !state.following.includes(acct);
  mutate((draft) => {
    draft.following = isNowFollowing
      ? [...draft.following, acct]
      : draft.following.filter((a) => a !== acct);
    // Ensure the account exists so getUserProfile resolves a real entry.
    if (isNowFollowing && !draft.accounts[acct]) {
      draft.accounts[acct] = defaultAccountFor(acct);
    }
  });
  return { following: isNowFollowing };
}

/**
 * Distinct authors of the hashtag's posts — everyone whose post is in the feed,
 * excluding the local user. Backs the "Follow demo feed" action, which surfaces
 * the whole conversation on Home by following all of them.
 */
export function getHashtagAuthors(): string[] {
  return memoized("hashtagAuthors", () => {
    const set = new Set<string>();
    for (const p of Object.values(state.posts)) {
      if (p.account.acct !== state.me.acct) set.add(p.account.acct);
    }
    return Array.from(set);
  });
}

/** Follow every account in `accts` (idempotent). REST: bulk POST /accounts/{id}/follow. */
export function followAll(accts: string[]): void {
  ensureHydrated();
  mutate((draft) => {
    for (const acct of accts) {
      if (!draft.following.includes(acct)) draft.following.push(acct);
      if (!draft.accounts[acct]) draft.accounts[acct] = defaultAccountFor(acct);
    }
  });
}

/** Unfollow every account in `accts`. */
export function unfollowAll(accts: string[]): void {
  ensureHydrated();
  const remove = new Set(accts);
  mutate((draft) => {
    draft.following = draft.following.filter((a) => !remove.has(a));
  });
}

/** True when every acct in `accts` is followed (and the list is non-empty). */
export function areAllFollowing(accts: string[]): boolean {
  ensureHydrated();
  return accts.length > 0 && accts.every((a) => state.following.includes(a));
}

/** Whether a post is currently liked. */
export function isLiked(id: string): boolean {
  ensureHydrated();
  return state.liked.includes(id);
}

/** Whether a post is currently bookmarked. */
export function isBookmarked(id: string): boolean {
  ensureHydrated();
  return state.bookmarked.includes(id);
}

/** Whether an account is currently followed. */
export function isFollowing(acct: string): boolean {
  ensureHydrated();
  return state.following.includes(acct);
}

/**
 * The current-user identity. When real auth returns, populate from the OAuth
 * `currentUser` instead of the default mock account.
 *
 * REST: GET /api/v1/accounts/verify_credentials
 */
export function getMe(): Account {
  ensureHydrated();
  return state.me;
}

/**
 * Search accounts by display name / username / handle (case-insensitive).
 * REST: GET /api/v2/search?type=accounts&q=…
 */
export function searchAccounts(query: string): Account[] {
  ensureHydrated();
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return Object.values(state.accounts).filter(
    (a) =>
      a.display_name.toLowerCase().includes(q) ||
      a.username.toLowerCase().includes(q) ||
      a.acct.toLowerCase().includes(q),
  );
}

/**
 * Search posts by their (tag-stripped) text content, newest first.
 * REST: GET /api/v2/search?type=statuses&q=…
 */
export function searchPosts(query: string): Post[] {
  ensureHydrated();
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return Object.values(state.posts)
    .filter((p) => p.content.replace(/<[^>]*>/g, " ").toLowerCase().includes(q))
    .sort(byNewest);
}

// ─── Misc ────────────────────────────────────────────────────────────────────

/** Minimal HTML escaping for user-entered post/comment text. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
