"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Text, Paper, Box, Group, Divider, Button, Skeleton } from "@mantine/core";
import { IconArrowLeft } from "@tabler/icons-react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { notifications } from "@mantine/notifications";
import Post from "../../../components/Posts/Post";
import type { ListyInjectionEntry, RelatedPostMock, FocusPostMock, Relation, CategoryKey } from "../../../types/PostType";
import { useRelatedStacks } from "../related-stacks-context";
import { firstTypeRelations } from "../../../utils/relationFirstType.mjs";
import { registerNavigateCallback } from "../../../utils/highlightStore";
import ReplySection from "../../../components/ReplySection";
import { useLocalStore, useHydrated, getHashtagAuthors, followAll, unfollowAll, areAllFollowing } from "../../../utils/localStore";
import { DEMO_TIMELINE_PAGE_SIZE, getChineseEvTimelinePage, type TimelineStats } from "../../../services/demoApiClient";
import { getMockReplyCount } from "../../../utils/mockPostResolver";

// ── Thread line constants ────────────────────────────────────────────────────
const THREAD_LINE_COLOR = "#ccd1dc";
const THREAD_LINE_LEFT = 32;

// ── Data helpers ─────────────────────────────────────────────────────────────

function toTopPost(rp: RelatedPostMock) {
  return {
    id: rp.id,
    created_at: rp.created_at,
    replies_count: getMockReplyCount(rp.id),
    favourites_count: rp.favourites_count,
    favourited: rp.favourited,
    bookmarked: rp.bookmarked,
    content: rp.content,
    account: { avatar: rp.account.avatar, display_name: rp.account.display_name, acct: rp.account.acct },
    content_rewritten: "",
    rewrite: {
      content: rp.rewrite?.content ?? rp.content,
      significant: rp.rewrite?.significant ?? false,
      editSummary: rp.rewrite?.editSummary,
    },
    // First contribution type only per highlight (relationFirstType.mjs) — the
    // backend now emits one relation PER TYPE on the same span, which rendered
    // as stacked two-colour bands on every highlight.
    relations: firstTypeRelations(rp.relations),
  };
}

function toPostData(entry: ListyInjectionEntry) {
  const flatStacks = entry.relatedPosts.map((rp) => ({
    stackId: `stack-${rp.id}`, rel: rp.category, size: 1, topPost: toTopPost(rp),
  }));
  const categoryMap = new Map<string, { count: number; rank: number; topPost: ReturnType<typeof toTopPost> }>();
  for (const rp of entry.relatedPosts) {
    const existing = categoryMap.get(rp.category);
    if (!existing) {
      categoryMap.set(rp.category, { count: 1, rank: rp.rank, topPost: toTopPost(rp) });
    } else {
      // Count this item exactly once, then promote the top post only if this
      // one ranks higher (lower rank number = better).
      existing.count++;
      if (rp.rank < existing.rank) {
        existing.rank = rp.rank;
        existing.topPost = toTopPost(rp);
      }
    }
  }
  const aggregatedStacks = Array.from(categoryMap.entries()).map(([cat, { count, topPost }]) => ({
    stackId: `agg-${entry.focusPost.id}-${cat}`, rel: cat, size: count, topPost,
  }));
  // All focus-post relations from every related post (for dimmed always-visible
  // marks). Deduped to the first contribution type PER related post — distinct
  // posts marking the same focus span still both contribute.
  const focusRelations = entry.relatedPosts.flatMap((rp) => firstTypeRelations(rp.relations));
  return {
    postId: entry.focusPost.id,
    text: entry.focusPost.content,
    author: entry.focusPost.account.display_name,
    account: entry.focusPost.account.acct,
    avatar: entry.focusPost.account.avatar,
    createdAt: entry.focusPost.created_at,
    replies_count: getMockReplyCount(entry.focusPost.id),
    stackCount: entry.relatedPosts.length,
    favouritesCount: entry.focusPost.favourites_count,
    favourited: entry.focusPost.favourited,
    bookmarked: entry.focusPost.bookmarked,
    mediaAttachments: [] as string[],
    relatedStacks: flatStacks,
    aggregatedStacks,
    previewCard: null,
    replies: entry.replies ?? [],
    focusRelations,
  };
}

/** Create a synthetic entry for a related post that has no real entry.
 *  Generates related posts by taking the parent entry's related posts,
 *  removing the current post, and reordering them for the new focus. */
const STOP_WORDS = new Set(["the","a","an","is","are","was","were","be","been","being","have","has","had","do","does","did","will","would","could","should","may","might","shall","can","need","dare","to","of","in","for","on","with","at","by","from","as","into","through","during","before","after","above","below","between","out","off","over","under","again","further","then","once","that","this","these","those","it","its","and","but","or","nor","not","so","very","just","about","also","than","too","only","same","both","each","all","any","few","more","most","other","some","such","no","up","if","we","they","i","you","he","she","who","which","what","when","where","how","why"]);

/** Get significant words from text */
function getSignificantWords(text: string): Set<string> {
  return new Set(
    text.toLowerCase().replace(/[^a-z0-9\s'-]/g, '').split(/\s+/)
      .filter(w => w.length > 2 && !STOP_WORDS.has(w))
  );
}

/** Generate a synthetic Relation by finding the sentence in newFocusText
 *  that shares the most significant words with the sibling's content. */
function generateSyntheticRelation(newFocusText: string, siblingContent: string, category: CategoryKey): Relation {
  const siblingWords = getSignificantWords(siblingContent);

  // Find best matching sentence in the new focus text
  const sentences = newFocusText.match(/[^.!?]+[.!?]+/g) || [newFocusText];
  let bestStart = 0, bestEnd = newFocusText.length, bestScore = 0;

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    const start = newFocusText.indexOf(trimmed);
    const words = getSignificantWords(trimmed);
    let score = 0;
    words.forEach(w => { if (siblingWords.has(w)) score++; });
    if (score > bestScore) {
      bestScore = score;
      bestStart = start;
      bestEnd = start + trimmed.length;
    }
  }

  return {
    focusStart: bestStart, focusEnd: bestEnd,
    contentStart: 0, contentEnd: Math.min(siblingContent.length, 100),
    focusCommentStart: bestStart, focusCommentEnd: bestEnd,
    contentCommentStart: 0, contentCommentEnd: Math.min(siblingContent.length, 50),
    category,
  };
}

/** Get the primary focus range from a post's relations (first relation's focus range) */
function getPrimaryFocusRange(rp: RelatedPostMock): { start: number; end: number } | null {
  if (!rp.relations || rp.relations.length === 0) return null;
  return { start: rp.relations[0].focusStart, end: rp.relations[0].focusEnd };
}

/** Score how much two ranges overlap */
function rangeOverlap(a: { start: number; end: number } | null, b: { start: number; end: number } | null): number {
  if (!a || !b) return 0;
  const s = Math.max(a.start, b.start), e = Math.min(a.end, b.end);
  return e > s ? e - s : 0;
}

function syntheticEntryFromRelated(rp: RelatedPostMock, parentEntry: ListyInjectionEntry): ListyInjectionEntry {
  const focusRange = getPrimaryFocusRange(rp);
  const newFocusPlain = rp.content;

  const siblings = parentEntry.relatedPosts
    .filter(p => p.id !== rp.id)
    .map(p => {
      const siblingRange = getPrimaryFocusRange(p);
      const overlap = rangeOverlap(focusRange, siblingRange);
      const categoryBonus = p.category === rp.category ? 50 : 0;
      const syntheticRelation = generateSyntheticRelation(newFocusPlain, p.content, p.category);
      return { post: p, score: overlap + categoryBonus, syntheticRelation };
    })
    .sort((a, b) => b.score - a.score)
    .map(({ post, syntheticRelation }, idx) => ({
      ...post,
      globalRank: idx + 1,
      rank: idx + 1,
      relations: [syntheticRelation],
    }));

  return {
    focusPost: {
      id: rp.id,
      content: `<p>${rp.content}</p>`,
      plainText: rp.content,
      account: rp.account,
      created_at: rp.created_at,
      favourites_count: rp.favourites_count,
      replies_count: getMockReplyCount(rp.id),
      favourited: rp.favourited,
      bookmarked: rp.bookmarked,
    },
    relatedPosts: siblings,
    replies: [],
  };
}

function replyToPostData(reply: FocusPostMock) {
  return {
    postId: reply.id,
    text: reply.content,
    author: reply.account.display_name,
    account: reply.account.acct,
    avatar: reply.account.avatar,
    createdAt: reply.created_at,
    replies_count: getMockReplyCount(reply.id),
    stackCount: -1,
    favouritesCount: reply.favourites_count,
    favourited: reply.favourited,
    bookmarked: reply.bookmarked,
    mediaAttachments: [] as string[],
    relatedStacks: [] as ReturnType<typeof toPostData>["relatedStacks"],
    aggregatedStacks: [] as ReturnType<typeof toPostData>["aggregatedStacks"],
    previewCard: null,
    replies: [] as FocusPostMock[],
    focusRelations: [] as ReturnType<typeof toPostData>["focusRelations"],
  };
}

// ── Component ────────────────────────────────────────────────────────────────

export default function ListyInjectionPage() {
  const router = useRouter();
  const { setFromPost, activePostId: ctxActivePostId } = useRelatedStacks();
  const [entries, setEntries] = useState<ListyInjectionEntry[]>([]);
  const [timelineStats, setTimelineStats] = useState<TimelineStats | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const pageSentinelRef = useRef<HTMLDivElement | null>(null);
  const inFlightCursorsRef = useRef(new Map<string, symbol>());
  const [activePostId, setActivePostId] = useState<string | null>(null);
  const activePostIdRef = useRef<string | null>(null);
  const setFromPostRef = useRef(setFromPost);
  setFromPostRef.current = setFromPost;
  const postRefs = useRef<Array<HTMLDivElement | null>>([]);

  const loadTimelinePage = useCallback(async (
    cursor: string | null,
    append: boolean,
    signal?: AbortSignal,
  ) => {
    const requestKey = cursor ?? "__first__";
    if (inFlightCursorsRef.current.has(requestKey)) return;
    const requestToken = Symbol(requestKey);
    inFlightCursorsRef.current.set(requestKey, requestToken);
    setLoadError(null);
    if (append) setLoadingMore(true);
    else setInitialLoading(true);

    try {
      const page = await getChineseEvTimelinePage(cursor, { signal });
      setEntries((current) => {
        if (!append) return page.items;
        const seen = new Set(current.map((entry) => entry.focusPost.id));
        return [...current, ...page.items.filter((entry) => !seen.has(entry.focusPost.id))];
      });
      setTimelineStats(page.stats);
      setNextCursor(page.nextCursor);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setLoadError(error instanceof Error ? error.message : "The demo timeline could not be loaded.");
    } finally {
      if (inFlightCursorsRef.current.get(requestKey) === requestToken) {
        inFlightCursorsRef.current.delete(requestKey);
      }
      if (append) setLoadingMore(false);
      else setInitialLoading(false);
    }
  }, []);

  // The page knows only the API contract. The bundled route currently serves
  // the JSON fixture with latency; a live service can replace its base URL.
  useEffect(() => {
    const controller = new AbortController();
    const inFlightCursors = inFlightCursorsRef.current;
    void loadTimelinePage(null, false, controller.signal);
    return () => {
      // React Strict Mode immediately re-runs effects in development. Release
      // this subscription synchronously so the replacement can share the
      // underlying client request instead of being mistaken for a duplicate.
      inFlightCursors.delete("__first__");
      controller.abort();
    };
  }, [loadTimelinePage]);

  // Near-viewport preloading keeps the next cursor page ready without fetching
  // the entire collection up front. The visible button remains a manual/a11y
  // fallback when IntersectionObserver is unavailable.
  useEffect(() => {
    const node = pageSentinelRef.current;
    if (!node || !nextCursor || loadingMore || loadError) return;
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((observations) => {
      if (observations.some((observation) => observation.isIntersecting)) {
        void loadTimelinePage(nextCursor, true);
      }
    }, { rootMargin: "300px 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [loadError, nextCursor, loadingMore, loadTimelinePage]);

  // ── Lookup maps ────────────────────────────────────────────────────────────
  const entryMap = useMemo(() => {
    const map = new Map<string, ListyInjectionEntry>();
    for (const e of entries) map.set(e.focusPost.id, e);
    return map;
  }, [entries]);

  const allRelatedPosts = useMemo(() => {
    const map = new Map<string, { rp: RelatedPostMock; parentEntry: ListyInjectionEntry }>();
    for (const e of entries) for (const rp of e.relatedPosts) if (!map.has(rp.id)) map.set(rp.id, { rp, parentEntry: e });
    return map;
  }, [entries]);

  /**
   * Global parent map (childId → parentId) derived from inherent thread hierarchy:
   *  - `entry.ancestors` is an oldest-first chain; the last element is focusPost's parent.
   *  - Each post in `entry.replies` is a comment to that entry's focusPost
   *  - Any post (focus, related, reply) with an explicit `inReplyToId` overrides
   * Posts with no inherent parent are roots and have no ancestors.
   */
  const parentMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of entries) {
      // entry.ancestors: oldest-first chain. Each consecutive pair is parent → child,
      // and the last ancestor is the immediate parent of focusPost.
      const ancestors = e.ancestors ?? [];
      for (let i = 1; i < ancestors.length; i++) {
        if (!map.has(ancestors[i].id)) {
          map.set(ancestors[i].id, ancestors[i - 1].id);
        }
      }
      if (ancestors.length > 0 && !map.has(e.focusPost.id)) {
        map.set(e.focusPost.id, ancestors[ancestors.length - 1].id);
      }
      // Focus post may declare an explicit parent (overrides ancestor-derived link)
      if (e.focusPost.inReplyToId) {
        map.set(e.focusPost.id, e.focusPost.inReplyToId);
      }
      // entry.replies are implicit children of the focus post
      for (const reply of e.replies ?? []) {
        const parent = reply.inReplyToId ?? e.focusPost.id;
        if (!map.has(reply.id)) map.set(reply.id, parent);
      }
      // Related posts may declare an explicit parent
      for (const rp of e.relatedPosts) {
        if (rp.inReplyToId && !map.has(rp.id)) {
          map.set(rp.id, rp.inReplyToId);
        }
      }
    }
    return map;
  }, [entries]);

  /** childrenByParent[parentId] = ids of posts whose inherent parent is parentId */
  const childrenByParent = useMemo(() => {
    const map = new Map<string, string[]>();
    parentMap.forEach((parentId, childId) => {
      const arr = map.get(parentId) ?? [];
      arr.push(childId);
      map.set(parentId, arr);
    });
    return map;
  }, [parentMap]);

  /**
   * Global post lookup. Returns a normalized FocusPostMock for any id —
   * focus posts, related posts (via synthetic conversion), or replies stored
   * inside entry.replies arrays.
   */
  const postById = useMemo(() => {
    const map = new Map<string, FocusPostMock>();
    for (const e of entries) {
      map.set(e.focusPost.id, e.focusPost);
      for (const ancestor of e.ancestors ?? []) {
        if (!map.has(ancestor.id)) map.set(ancestor.id, ancestor);
      }
      for (const reply of e.replies ?? []) {
        if (!map.has(reply.id)) map.set(reply.id, reply);
      }
      for (const rp of e.relatedPosts) {
        if (!map.has(rp.id)) {
          map.set(rp.id, {
            id: rp.id,
            inReplyToId: rp.inReplyToId ?? null,
            content: `<p>${rp.content}</p>`,
            plainText: rp.content,
            account: rp.account,
            created_at: rp.created_at,
            favourites_count: rp.favourites_count,
            replies_count: getMockReplyCount(rp.id),
            favourited: rp.favourited,
            bookmarked: rp.bookmarked,
          });
        }
      }
    }
    return map;
  }, [entries]);

  /** Walk inherent parent chain. Returns oldest-ancestor-first (root → parent). */
  const getAncestorChain = useCallback((id: string): string[] => {
    const chain: string[] = [];
    let cursor = parentMap.get(id);
    const seen = new Set<string>([id]);
    while (cursor && !seen.has(cursor)) {
      chain.unshift(cursor);
      seen.add(cursor);
      cursor = parentMap.get(cursor);
    }
    return chain;
  }, [parentMap]);

  const resolveEntry = useCallback((id: string): ListyInjectionEntry | null => {
    const real = entryMap.get(id);
    if (real) return real;
    const found = allRelatedPosts.get(id);
    if (found) return syntheticEntryFromRelated(found.rp, found.parentEntry);
    // Reply-only post (lives only inside entry.replies). Build a minimal entry.
    const post = postById.get(id);
    if (post) {
      return { focusPost: post, relatedPosts: [], replies: [] };
    }
    return null;
  }, [entryMap, allRelatedPosts, postById]);

  /** Get the flat stacks for a given post id (for sidebar) */
  const getRelatedStacks = useCallback((id: string) => {
    const entry = resolveEntry(id);
    if (entry) return toPostData(entry).relatedStacks;
    return [];
  }, [resolveEntry]);

  // ── Navigation history ─────────────────────────────────────────────────────
  // historyStack is the *visit history* used by the back button. The thread
  // mode's ancestor chain is NOT derived from this — it's derived from each
  // post's inherent parent (see getAncestorChain). Visiting a related post
  // does not artificially make the previously focused post an ancestor.
  const [historyStack, setHistoryStack] = useState<string[]>([]);
  const inThreadMode = historyStack.length > 0;
  /** True while back-nav restoration is in progress — used to suppress the
   *  scroll listener's mount-time onScroll() so it doesn't override the
   *  restored active post before scrollTo lands. Cleared after the RAFs fire. */
  const isRestoringRef = useRef(false);
  const savedScrollRef = useRef<Map<string, number>>(new Map());
  // Direction of the last navigation — drives the slide animation in AnimatePresence.
  const [navDirection, setNavDirection] = useState<'forward' | 'backward'>('forward');

  /** Marker we push onto window.history when entering thread mode so the
   *  browser back button is captured by the popstate handler below. Without
   *  this, a browser-back press tears the user off /ChineseEVs entirely,
   *  losing their thread context (A4). */
  const browserBackInstalledRef = useRef(false);
  // Forward-declared ref so popInPageOnly can re-seed the aside with the first
  // post's stacks when returning to feed mode. `posts` is declared after this
  // block; the ref is populated by the effect below once it's available.
  const postsRef = useRef<ReturnType<typeof toPostData>[]>([]);

  /** Pops the in-page historyStack without triggering window.history.back()
   *  (used when popstate fires — the browser already did the URL pop). */
  const popInPageOnly = useCallback(() => {
    setNavDirection('backward');
    setHistoryStack(prev => {
      if (prev.length === 0) return prev;
      const next = prev.slice(0, -1);
      const restoreKey = next.length > 0 ? next[next.length - 1] : "__feed__";
      const restoreId = next.length > 0 ? next[next.length - 1] : null;

      if (restoreId) {
        const stacks = getRelatedStacks(restoreId);
        setFromPostRef.current(stacks, restoreId, { force: true });
        setActivePostId(restoreId);
        activePostIdRef.current = restoreId;
      } else {
        // Returning to feed mode — re-activate the first post so the aside has
        // something to display instead of going empty.
        const first = postsRef.current[0];
        if (first) {
          setFromPostRef.current(first.relatedStacks, first.postId, { force: true });
          setActivePostId(first.postId);
          activePostIdRef.current = first.postId;
        }
      }

      if (next.length === 0) browserBackInstalledRef.current = false;

      requestAnimationFrame(() => {
        const savedY = savedScrollRef.current.get(restoreKey) ?? 0;
        window.scrollTo(0, savedY);
      });
      return next;
    });
  }, [getRelatedStacks]);

  const navigateToPost = useCallback((postId: string) => {
    // A1 (Group A robustness): refuse to navigate to a post we cannot resolve.
    // Without this guard, an empty-data scenario reads as a study-session
    // crash. The console.warn makes the data-integrity gap visible without
    // swallowing it silently.
    if (!postId || !resolveEntry(postId)) {
      // eslint-disable-next-line no-console
      console.warn('[ChineseEVs] navigateToPost: unknown postId, ignoring', { postId });
      return;
    }
    // Save feed state for back-nav restoration: scroll position and the
    // post the user clicked (which is what should re-focus on return).
    // Direct feed clicks pass the clicked feed-post id. Aside clicks may
    // pass a related-post id that isn't a feed entry — the restore effect
    // handles that by leaving the aside alone if the id isn't found in posts.
    sessionStorage.setItem(`scrollY:/ChineseEVs`, String(window.scrollY));
    // Restore the FOCUSED feed post (whose related panel — grouping/filters — the
    // user was working in), not the post being opened. Opening a related post and
    // coming back should land you back on your grouped/filtered panel. Falls back
    // to the opened post if nothing is focused yet.
    sessionStorage.setItem(`activeFeedPost:/ChineseEVs`, activePostIdRef.current ?? postId);
    // Seed BackButton's previousPath so the post-detail route shows "Back".
    sessionStorage.setItem(
      `previousPath:/ChineseEVs/posts/${postId}`,
      "/ChineseEVs",
    );
    // Supersedes the prior in-page thread mode + ?focus= URL approach: we
    // now route to a dedicated detail page so URLs are true REST resources
    // rather than query-param state. Group A's A4 (browser-back capture via
    // pushState marker) is therefore obsolete — router.push gives the
    // browser-back behavior we want for free.
    router.push(`/ChineseEVs/posts/${postId}`);
  }, [router, resolveEntry]);

  const navigateBack = useCallback(() => {
    setNavDirection('backward');
    setHistoryStack(prev => {
      const next = prev.slice(0, -1);
      const restoreKey = next.length > 0 ? next[next.length - 1] : "__feed__";
      const restoreId = next.length > 0 ? next[next.length - 1] : null;

      // Update sidebar
      if (restoreId) {
        const stacks = getRelatedStacks(restoreId);
        setFromPostRef.current(stacks, restoreId, { force: true });
        setActivePostId(restoreId);
        activePostIdRef.current = restoreId;
      }

      // Restore scroll after React re-renders
      requestAnimationFrame(() => {
        const savedY = savedScrollRef.current.get(restoreKey) ?? 0;
        window.scrollTo(0, savedY);
      });

      // Keep URL in sync with the new top-of-stack focus (or clear ?focus on return to feed)
      const targetSearch = restoreId ? `?focus=${restoreId}` : "";
      if (typeof window !== "undefined" && window.location.search !== targetSearch) {
        window.history.pushState(
          restoreId ? { focus: restoreId } : null,
          "",
          `/ChineseEVs${targetSearch}`,
        );
      }

      return next;
    });
  }, [getRelatedStacks]);

  // Register the navigate callback so the aside's RelatedStacks can trigger it
  useEffect(() => {
    registerNavigateCallback(navigateToPost);
    return () => registerNavigateCallback(null);
  }, [navigateToPost]);

  // Legacy ?focus= URL hydration kept as a fallback for any URLs that may
  // still exist in users' history from the prior in-page thread mode.
  // Primary navigation is now /ChineseEVs/posts/[id] (router.push),
  // so this code path is rarely hit; when it is, it calls navigateToPost
  // which (with A1 guard) router.push's to the detail route.
  const hydratedFocusRef = useRef(false);
  useEffect(() => {
    if (hydratedFocusRef.current) return;
    if (typeof window === "undefined") return;
    const focusId = new URLSearchParams(window.location.search).get("focus");
    if (!focusId) { hydratedFocusRef.current = true; return; }
    hydratedFocusRef.current = true;
    requestAnimationFrame(() => navigateToPost(focusId));
  }, [navigateToPost]);

  // popstate listener for legacy ?focus= URLs (in-page fallback path only).
  useEffect(() => {
    const onPopState = () => {
      const focusId = new URLSearchParams(window.location.search).get("focus");
      if (focusId) {
        setHistoryStack([focusId]);
        const stacks = getRelatedStacks(focusId);
        setFromPostRef.current(stacks, focusId, { force: true });
        setActivePostId(focusId);
        activePostIdRef.current = focusId;
      } else {
        setHistoryStack([]);
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [getRelatedStacks]);

  // ── Feed mode posts ────────────────────────────────────────────────────────
  const posts = useMemo(() => entries.map(toPostData), [entries]);
  // Keep postsRef in sync so the popstate-driven back path can re-seed feed
  // mode without `posts` having to be declared above it.
  postsRef.current = posts;

  // Clean up the shared navigate callback on unmount. Grouping/filters are NOT
  // reset here anymore — they persist per focus post (setPanelFocus), so the
  // related panel survives navigating into a post and back to the feed.
  useEffect(() => {
    return () => { registerNavigateCallback(null); };
  }, []);

  // Unified mount-time focus + scroll restoration.
  //
  // Three cases handled in priority order:
  //   1. Saved state in sessionStorage (came back from a post detail page via
  //      browser-back or our UI BackButton — both pop history and remount
  //      this route). Restore the active feed post + scroll position; aside
  //      repopulates from setFromPost.
  //   2. Context already has an active post (typical for React Strict Mode's
  //      2nd mount in dev, where sessionStorage was cleared by the 1st mount's
  //      RAF). Sync local state from context so the Post highlight reappears.
  //   3. Fresh visit with no prior state — auto-activate the first feed post.
  //
  // All three end with: local activePostId set, activePostIdRef synced,
  // and aside populated. The scroll listener's mount-time onScroll() is
  // suppressed while isRestoringRef is true so it can't override the
  // restored post with bestIdx=0 before scrollTo lands.
  useEffect(() => {
    if (posts.length === 0 || activePostId) return;

    const savedY = typeof window !== "undefined"
      ? sessionStorage.getItem("scrollY:/ChineseEVs")
      : null;
    const savedActiveId = typeof window !== "undefined"
      ? sessionStorage.getItem("activeFeedPost:/ChineseEVs")
      : null;

    // Pick the post to focus, in priority order. Falls back to first feed post.
    const candidateId = savedActiveId ?? ctxActivePostId ?? posts[0].postId;
    const target = posts.find((p) => p.postId === candidateId) ?? posts[0];

    // Apply focus + aside synchronously so the Post highlight is in place
    // before the user sees the page paint.
    setActivePostId(target.postId);
    activePostIdRef.current = target.postId;
    setFromPost(target.relatedStacks, target.postId, { force: true });

    // Schedule scroll restoration if we have a saved position.
    const y = savedY ? parseInt(savedY, 10) : NaN;
    if (!Number.isNaN(y) && y > 0) {
      isRestoringRef.current = true;
      // Two RAFs so feed posts settle to their final laid-out heights.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          window.scrollTo(0, y);
          isRestoringRef.current = false;
          sessionStorage.removeItem("scrollY:/ChineseEVs");
          sessionStorage.removeItem("activeFeedPost:/ChineseEVs");
        });
      });
    } else {
      sessionStorage.removeItem("scrollY:/ChineseEVs");
      sessionStorage.removeItem("activeFeedPost:/ChineseEVs");
    }
  }, [posts, activePostId, ctxActivePostId, setFromPost]);

  // Keep ref in sync
  useEffect(() => { activePostIdRef.current = activePostId; }, [activePostId]);

  // Scroll-based focus detection (feed mode only).
  // Top-anchored: a post becomes active once its top crosses the active line
  // (30% from the viewport top), and stays active until the next post crosses.
  // Distance-to-center would let the SECOND post win at scroll-top on tall
  // viewports because the first post's center sits too far above the middle.
  useEffect(() => {
    if (inThreadMode) return;
    let rafId = 0;
    const onScroll = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const activeY = window.innerHeight * 0.3;
        let bestIdx = -1;
        for (let i = 0; i < postRefs.current.length; i++) {
          const el = postRefs.current[i];
          if (!el) continue;
          if (el.getBoundingClientRect().top <= activeY) bestIdx = i;
        }
        // Fallback: nothing has crossed the line yet (page hasn't scrolled),
        // pick the first visible post so something is always active.
        if (bestIdx === -1) {
          for (let i = 0; i < postRefs.current.length; i++) {
            const el = postRefs.current[i];
            if (!el) continue;
            const rect = el.getBoundingClientRect();
            if (rect.bottom > 0 && rect.top < window.innerHeight) { bestIdx = i; break; }
          }
        }
        // Bottom-of-feed guard (R-FEED-3): on a tall viewport the last post's
        // top can sit below the 30% active line even at max scroll, leaving
        // nothing active. When scrolled to the bottom, the last rendered post
        // is what's in view.
        const atBottom =
          window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
        if (atBottom) {
          for (let i = postRefs.current.length - 1; i >= 0; i--) {
            if (postRefs.current[i]) { bestIdx = i; break; }
          }
        }
        if (bestIdx >= 0) {
          const post = posts[bestIdx];
          if (post && post.postId !== activePostIdRef.current) {
            activePostIdRef.current = post.postId;
            setActivePostId(post.postId);
            setFromPostRef.current(post.relatedStacks, post.postId, { force: true });
          }
        }
      });
    };
    // Skip the mount-time onScroll() while a back-nav restoration is in
    // flight — the restore effect has already set the right active post,
    // and we don't want to clobber it with bestIdx=0 (top of feed) before
    // scrollTo lands. Subsequent scroll events still fire normally.
    if (!isRestoringRef.current) onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); cancelAnimationFrame(rafId); };
  }, [posts, inThreadMode]);

  const handleStackIconClick = useCallback(
    (_agg: any[], postId: string, _pos: { top: number; height: number }) => {
      const post = posts.find((p) => p.postId === postId);
      if (post) { setActivePostId(postId); setFromPost(post.relatedStacks, postId); }
    },
    [posts, setFromPost]
  );

  // ── Shared Post renderer ──────────────────────────────────────────────────
  function renderPost(postData: ReturnType<typeof toPostData>, opts?: { isAncestor?: boolean; onAncestorClick?: () => void }) {
    return (
      <Post
        id={postData.postId}
        text={postData.text}
        author={postData.author}
        account={postData.account}
        avatar={postData.avatar}
        repliesCount={
          hydrated
            ? localPosts[postData.postId]?.replies_count ?? postData.replies_count
            : postData.replies_count
        }
        createdAt={postData.createdAt}
        stackCount={-1}
        favouritesCount={postData.favouritesCount}
        favourited={postData.favourited}
        bookmarked={postData.bookmarked}
        mediaAttachments={postData.mediaAttachments}
        onStackIconClick={handleStackIconClick}
        setIsModalOpen={() => {}}
        setIsExpandModalOpen={() => {}}
        relatedStacks={opts?.isAncestor ? [] : postData.aggregatedStacks}
        activePostId={opts?.isAncestor ? null : activePostId}
        setActivePostId={(id) => {
          setActivePostId(id);
          if (id) {
            const p = posts.find((p) => p.postId === id);
            if (p) setFromPost(p.relatedStacks, p.postId, { force: true });
          }
        }}
        initialCard={null}
        onNavigate={opts?.isAncestor ? opts.onAncestorClick ? () => opts.onAncestorClick!() : undefined : navigateToPost}
        focusRelations={opts?.isAncestor ? [] : postData.focusRelations}
        // Span-dwell tooltip count for NON-focused feed posts: their stacks
        // aren't in context, so count linked responses from this post's own
        // flat stacks (one stack per related post — distinct-post semantics).
        relatedCountForSpans={
          opts?.isAncestor
            ? undefined
            : (ranges) =>
                postData.relatedStacks.filter((s: any) =>
                  (s.topPost?.relations ?? []).some((r: any) =>
                    ranges.some((u) => r.focusStart < u.fe && u.fs < r.focusEnd)
                  )
                ).length
        }
      />
    );
  }

  // ── Thread mode content ────────────────────────────────────────────────────
  let threadContent: React.ReactNode = null;
  let threadKey = "thread";
  if (inThreadMode) {
    const currentId = historyStack[historyStack.length - 1];
    threadKey = `thread-${currentId}`;
    // Ancestors come from the post's *inherent* hierarchy (what it is a comment to),
    // NOT from the navigation history. Roots have an empty chain.
    const ancestorIds = getAncestorChain(currentId);
    const currentEntry = resolveEntry(currentId);
    const currentPost = currentEntry ? toPostData(currentEntry) : null;

    // Inherent children of the current post (replies below).
    const inherentReplyIds = childrenByParent.get(currentId) ?? [];
    const inherentReplies = inherentReplyIds
      .map((rid) => postById.get(rid))
      .filter((p): p is FocusPostMock => !!p);

    threadContent = (
      <div style={{ padding: "1rem 0" }}>
        {/* Back button — sticky so it stays visible while scrolling */}
        <button
          onClick={navigateBack}
          aria-label="Go back"
          style={{
            position: "sticky", top: 8, zIndex: 20,
            display: "flex", alignItems: "center", gap: "6px",
            background: "#f1f5f9", border: "none", borderRadius: "8px",
            padding: "6px 12px", cursor: "pointer", marginBottom: "1rem",
            fontSize: "13px", fontWeight: 600, color: "#475569",
            transition: "background 150ms ease",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#e2e8f0"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "#f1f5f9"; }}
        >
          <IconArrowLeft size={16} /> Back
        </button>

        {/* Ancestor chain with thread lines */}
        {ancestorIds.map((aId, index) => {
          const aEntry = resolveEntry(aId);
          if (!aEntry) return null;
          const aPost = toPostData(aEntry);
          return (
            <div key={aId} style={{ position: "relative", paddingBottom: "0.5rem" }}>
              <div aria-hidden style={{
                position: "absolute", left: THREAD_LINE_LEFT,
                top: index === 0 ? "50%" : 0, bottom: 0, width: 2,
                backgroundColor: THREAD_LINE_COLOR, zIndex: 0,
              }} />
              <div style={{ position: "relative", zIndex: 1, opacity: 0.75 }}>
                {renderPost(aPost, {
                  isAncestor: true,
                  onAncestorClick: () => {
                    // Navigate to this ancestor — its own ancestor chain will
                    // be rebuilt structurally on the next render.
                    navigateToPost(aId);
                  }
                })}
              </div>
            </div>
          );
        })}

        {/* Current focus post with connector */}
        {currentPost ? (
          <div style={{ position: "relative", marginBottom: "1.5rem" }}>
            {ancestorIds.length > 0 && (
              <div aria-hidden style={{
                position: "absolute", left: THREAD_LINE_LEFT, top: 0, height: "50%",
                width: 2, backgroundColor: THREAD_LINE_COLOR, zIndex: 0,
              }} />
            )}
            <div style={{ position: "relative", zIndex: 1 }}>
              {renderPost(currentPost)}
            </div>
          </div>
        ) : (
          // A1 fallback: we entered thread mode for a post that couldn't be
          // resolved. Show an explicit empty state with a recovery affordance
          // instead of an invisible page that looks crashed to a study subject.
          <Paper
            withBorder
            role="status"
            aria-live="polite"
            style={{
              backgroundColor: "#fff",
              borderRadius: 8,
              padding: 20,
              marginBottom: "1.5rem",
            }}
          >
            <Text size="sm" fw={600} c="#374151" mb={6}>
              Post unavailable
            </Text>
            <Text size="xs" c="dimmed">
              This post couldn&apos;t be loaded. Press <strong>Back</strong> to return.
            </Text>
          </Paper>
        )}

        {/* Comment input — right under the focus post, before replies */}
        {currentPost && (
          <div style={{ marginTop: "0.5rem", marginBottom: "1rem" }}>
            <ReplySection
              postId={currentId}
              currentUser={(() => {
                try { return JSON.parse(localStorage.getItem("currentUser") || "null"); } catch { return null; }
              })()}
              fetchPostAndReplies={() => {}}
            />
          </div>
        )}

        {/* Replies — derived from inherent hierarchy (children of currentId) */}
        {inherentReplies.length > 0 && (
          <div style={{ marginTop: "0.5rem" }}>
            <Text size="xs" fw={600} c="dimmed" mb="sm" style={{ textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Replies
            </Text>
            {inherentReplies.map((reply, index) => (
              <div key={reply.id} style={{ position: "relative", marginBottom: index < inherentReplies.length - 1 ? "0.5rem" : 0 }}>
                <div aria-hidden style={{
                  position: "absolute", left: THREAD_LINE_LEFT, top: 0, height: 8,
                  width: 2, backgroundColor: THREAD_LINE_COLOR, zIndex: 0,
                }} />
                <div style={{ position: "relative", zIndex: 1 }}>
                  {renderPost(replyToPostData(reply), { isAncestor: true })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Feed mode content ──────────────────────────────────────────────────────
  const totalRelated = timelineStats?.responses ?? posts.reduce((sum, p) => sum + p.relatedStacks.length, 0);
  const uniqueAuthors = new Set(posts.flatMap(p => p.relatedStacks.map(s => s.topPost.account.display_name)));
  const totalPosts = timelineStats?.posts ?? posts.length;
  const participantCount = timelineStats?.participants ?? uniqueAuthors.size;
  const remainingPosts = Math.max(0, totalPosts - posts.length);

  // Follow every demo participant so the JSON-backed conversation is blended
  // into Home. This stays local until the curated corpus is imported to Mastodon.
  const hydrated = useHydrated();
  const localPosts = useLocalStore((snapshot) => snapshot.posts);
  const hashtagFollowed = useLocalStore(() => areAllFollowing(getHashtagAuthors()));
  const handleFollowHashtag = () => {
    const authors = getHashtagAuthors();
    const wasFollowing = areAllFollowing(authors);
    if (wasFollowing) unfollowAll(authors);
    else followAll(authors);

    const notificationId = `chinese-evs-follow-${Date.now()}`;
    notifications.show({
      id: notificationId,
      title: wasFollowing ? "Demo feed unfollowed" : "Following demo feed",
      color: "blue",
      message: (
        <Group gap="xs" justify="space-between" wrap="nowrap">
          <Text size="sm">
            {wasFollowing
              ? "These curated posts were removed from Home."
              : "These curated posts now appear on Home alongside Mastodon posts."}
          </Text>
          <Button
            variant="subtle"
            size="compact-xs"
            onClick={() => {
              if (wasFollowing) followAll(authors);
              else unfollowAll(authors);
              notifications.hide(notificationId);
            }}
          >
            Undo
          </Button>
        </Group>
      ),
    });
  };

  const feedContent = (
    <div>
      <Paper
        style={{
          backgroundColor: "#fff", boxShadow: "rgba(0, 0, 0, 0.1) 0px 1px 1px",
          borderRadius: "8px", padding: "20px", marginBottom: "20px",
        }}
        withBorder
      >
        <Group style={{ justifyContent: "space-between" }}>
          <Text size="xl" fw={700}>#ChineseEVs</Text>
          <Button
            color="blue"
            variant={hydrated && hashtagFollowed ? "filled" : "outline"}
            size="sm"
            onClick={handleFollowHashtag}
          >
            {hydrated && hashtagFollowed ? "Following demo feed" : "Follow demo feed"}
          </Button>
        </Group>
        <Divider my="md" />
        <Group style={{ justifyContent: "center", gap: "2rem" }}>
          <div>
            <Text size="lg" style={{ textAlign: "center" }}>{totalPosts}</Text>
            <Text size="sm" c="dimmed" style={{ textAlign: "center" }}>Posts</Text>
          </div>
          <div>
            <Text size="lg" style={{ textAlign: "center" }}>{participantCount}</Text>
            <Text size="sm" c="dimmed" style={{ textAlign: "center" }}>Participants</Text>
          </div>
          <div>
            <Text size="lg" style={{ textAlign: "center" }}>{totalRelated}</Text>
            <Text size="sm" c="dimmed" style={{ textAlign: "center" }}>Responses</Text>
          </div>
        </Group>
        <Text size="xs" c="dimmed" mt="md">
          Demo follows are saved on this device until the curated posts move to Mastodon.
        </Text>
      </Paper>

      <Box style={{ width: "100%", position: "relative" }}>
        {initialLoading && posts.length === 0 && (
          <div data-testid="demo-feed-loading" aria-label="Loading posts">
            {[0, 1].map((index) => (
              <Paper key={index} withBorder p="lg" mb="sm" radius="md">
                <Group mb="md">
                  <Skeleton circle height={40} />
                  <div style={{ flex: 1 }}>
                    <Skeleton height={10} width="34%" mb={8} />
                    <Skeleton height={8} width="22%" />
                  </div>
                </Group>
                <Skeleton height={10} mb={8} />
                <Skeleton height={10} mb={8} />
                <Skeleton height={10} width="72%" />
              </Paper>
            ))}
          </div>
        )}

        {loadError && posts.length === 0 && (
          <Paper withBorder p="lg" radius="md" role="alert" data-testid="demo-feed-error">
            <Text fw={700} size="sm" mb={4}>Posts didn&apos;t load</Text>
            <Text c="dimmed" size="xs" mb="md">{loadError}</Text>
            <Button size="xs" variant="light" onClick={() => void loadTimelinePage(null, false)}>
              Try again
            </Button>
          </Paper>
        )}

        {posts.map((post, index) => (
          <div
            key={post.postId}
            data-post-id={post.postId}
            ref={(el) => { postRefs.current[index] = el; }}
            style={{ marginBottom: "0.5rem" }}
          >
            {renderPost(post)}
          </div>
        ))}

        {nextCursor && (
          <div ref={pageSentinelRef} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, margin: "18px 0" }}>
            <Button
              variant="light"
              loading={loadingMore}
              disabled={loadingMore}
              data-testid="demo-load-more"
              onClick={() => void loadTimelinePage(nextCursor, true)}
            >
              Load {Math.min(DEMO_TIMELINE_PAGE_SIZE, remainingPosts)} more posts
            </Button>
            <Text size="xs" c="dimmed" aria-live="polite">
              {posts.length} of {totalPosts} loaded
            </Text>
            {loadError && (
              <Text size="xs" c="red" role="alert">Couldn&apos;t load the next page. Try again.</Text>
            )}
          </div>
        )}
        <div style={{ height: "60vh" }} />
      </Box>
    </div>
  );

  // ── Animated mode switch ───────────────────────────────────────────────────
  // Forward navigation (clicking into a post): old view slides left, new view slides in from right.
  // Backward navigation (Back button): old view slides right, new view slides in from left.
  const enterX = navDirection === 'forward' ? 40 : -40;
  const exitX = navDirection === 'forward' ? -40 : 40;

  // NOTE: Previous version wrapped this in <AnimatePresence mode="wait"> with
  // x-slide enter/exit animations. That blocked the feed→thread mode transition
  // — the exit animation never released, leaving the page stuck in feed mode
  // even when historyStack was populated. We render directly here; revisit
  // animation later if needed (Group's UX polish can re-add it without
  // mode="wait", e.g. via layout-aware mode="popLayout" or by animating the
  // whole tree at the layout level).
  return (
    <motion.div
      key={inThreadMode ? threadKey : 'feed'}
      initial={{ opacity: 0, x: enterX }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}
    >
      {inThreadMode ? threadContent : feedContent}
    </motion.div>
  );
}
