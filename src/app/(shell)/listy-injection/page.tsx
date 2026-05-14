"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Text, Paper, Box, Group, Divider, Button } from "@mantine/core";
import { IconArrowLeft } from "@tabler/icons-react";
import { motion, AnimatePresence } from "framer-motion";
import Post from "../../../components/Posts/Post";
import mockData from "../../FakeData/listy-injection.json";
import type { ListyInjectionData, ListyInjectionEntry, RelatedPostMock, FocusPostMock, Relation, CategoryKey } from "../../../types/PostType";
import { useRelatedStacks } from "../related-stacks-context";
import { resetHighlightStore, registerNavigateCallback } from "../../../utils/highlightStore";
import ReplySection from "../../../components/ReplySection";

const entries = mockData as unknown as ListyInjectionData;

// ── Thread line constants ────────────────────────────────────────────────────
const THREAD_LINE_COLOR = "#ccd1dc";
const THREAD_LINE_LEFT = 32;

// ── Data helpers ─────────────────────────────────────────────────────────────

function toTopPost(rp: RelatedPostMock) {
  return {
    id: rp.id,
    created_at: rp.created_at,
    replies_count: rp.replies_count,
    favourites_count: rp.favourites_count,
    favourited: rp.favourited,
    bookmarked: rp.bookmarked,
    content: rp.content,
    account: { avatar: rp.account.avatar, display_name: rp.account.display_name, acct: rp.account.acct },
    content_rewritten: "",
    rewrite: { content: rp.rewrite?.content ?? rp.content, significant: rp.rewrite?.significant ?? false },
    relations: rp.relations,
  };
}

function toPostData(entry: ListyInjectionEntry) {
  const flatStacks = entry.relatedPosts.map((rp) => ({
    stackId: `stack-${rp.id}`, rel: rp.category, size: 1, topPost: toTopPost(rp),
  }));
  const categoryMap = new Map<string, { count: number; topPost: ReturnType<typeof toTopPost> }>();
  for (const rp of entry.relatedPosts) {
    const existing = categoryMap.get(rp.category);
    if (!existing || rp.rank < (existing as any).rank) {
      categoryMap.set(rp.category, { count: (existing?.count ?? 0) + 1, topPost: toTopPost(rp) });
    } else { existing.count++; }
  }
  const aggregatedStacks = Array.from(categoryMap.entries()).map(([cat, { count, topPost }]) => ({
    stackId: `agg-${entry.focusPost.id}-${cat}`, rel: cat, size: count, topPost,
  }));
  // All focus-post relations from every related post (for dimmed always-visible marks)
  const focusRelations = entry.relatedPosts.flatMap((rp) => rp.relations ?? []);
  return {
    postId: entry.focusPost.id,
    text: entry.focusPost.content,
    author: entry.focusPost.account.display_name,
    account: entry.focusPost.account.acct,
    avatar: entry.focusPost.account.avatar,
    createdAt: entry.focusPost.created_at,
    replies_count: entry.focusPost.replies_count,
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
      replies_count: rp.replies_count,
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
    replies_count: reply.replies_count,
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
  const { setFromPost } = useRelatedStacks();
  const [activePostId, setActivePostId] = useState<string | null>(null);
  const activePostIdRef = useRef<string | null>(null);
  const setFromPostRef = useRef(setFromPost);
  setFromPostRef.current = setFromPost;
  const postRefs = useRef<Array<HTMLDivElement | null>>([]);

  // ── Lookup maps ────────────────────────────────────────────────────────────
  const entryMap = useMemo(() => {
    const map = new Map<string, ListyInjectionEntry>();
    for (const e of entries) map.set(e.focusPost.id, e);
    return map;
  }, []);

  const allRelatedPosts = useMemo(() => {
    const map = new Map<string, { rp: RelatedPostMock; parentEntry: ListyInjectionEntry }>();
    for (const e of entries) for (const rp of e.relatedPosts) if (!map.has(rp.id)) map.set(rp.id, { rp, parentEntry: e });
    return map;
  }, []);

  /**
   * Global parent map (childId → parentId) derived from inherent thread hierarchy:
   *  - Each post in `entry.replies` is a comment to that entry's focusPost
   *  - Any post (focus, related, reply) with an explicit `inReplyToId` overrides
   * Posts with no inherent parent are roots and have no ancestors.
   */
  const parentMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of entries) {
      // Focus post may declare a parent
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
  }, []);

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
            replies_count: rp.replies_count,
            favourited: rp.favourited,
            bookmarked: rp.bookmarked,
          });
        }
      }
    }
    return map;
  }, []);

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
  const savedScrollRef = useRef<Map<string, number>>(new Map());
  // Direction of the last navigation — drives the slide animation in AnimatePresence.
  const [navDirection, setNavDirection] = useState<'forward' | 'backward'>('forward');

  const navigateToPost = useCallback((postId: string) => {
    // Save current scroll
    const key = historyStack.length > 0 ? historyStack[historyStack.length - 1] : "__feed__";
    savedScrollRef.current.set(key, window.scrollY);

    setNavDirection('forward');
    setHistoryStack(prev => [...prev, postId]);

    // Update sidebar to show this post's related stacks
    const stacks = getRelatedStacks(postId);
    setFromPostRef.current(stacks, postId, { force: true });
    setActivePostId(postId);
    activePostIdRef.current = postId;
    window.scrollTo(0, 0);
  }, [historyStack, getRelatedStacks]);

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

      return next;
    });
  }, [getRelatedStacks]);

  // Register the navigate callback so the aside's RelatedStacks can trigger it
  useEffect(() => {
    registerNavigateCallback(navigateToPost);
    return () => registerNavigateCallback(null);
  }, [navigateToPost]);

  // ── Feed mode posts ────────────────────────────────────────────────────────
  const posts = useMemo(() => entries.map(toPostData), []);

  // Reset on mount/unmount
  useEffect(() => {
    resetHighlightStore();
    return () => { resetHighlightStore(); registerNavigateCallback(null); };
  }, []);

  // Auto-activate first post
  useEffect(() => {
    if (posts.length > 0 && !activePostId) {
      const first = posts[0];
      setActivePostId(first.postId);
      setFromPost(first.relatedStacks, first.postId, { force: true });
    }
  }, []);

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
    onScroll();
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
        repliesCount={postData.replies_count}
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
        {currentPost && (
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
  const totalRelated = posts.reduce((sum, p) => sum + p.relatedStacks.length, 0);
  const uniqueAuthors = new Set(posts.flatMap(p => p.relatedStacks.map(s => s.topPost.account.display_name)));

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
          <Button color="blue" variant="outline" size="sm">Follow hashtag</Button>
        </Group>
        <Divider my="md" />
        <Group style={{ justifyContent: "center", gap: "2rem" }}>
          <div>
            <Text size="lg" style={{ textAlign: "center" }}>{posts.length}</Text>
            <Text size="sm" c="dimmed" style={{ textAlign: "center" }}>Posts</Text>
          </div>
          <div>
            <Text size="lg" style={{ textAlign: "center" }}>{uniqueAuthors.size}</Text>
            <Text size="sm" c="dimmed" style={{ textAlign: "center" }}>Participants</Text>
          </div>
          <div>
            <Text size="lg" style={{ textAlign: "center" }}>{totalRelated}</Text>
            <Text size="sm" c="dimmed" style={{ textAlign: "center" }}>Responses</Text>
          </div>
        </Group>
      </Paper>

      <Box style={{ width: "100%", position: "relative" }}>
        {posts.map((post, index) => (
          <div
            key={post.postId}
            data-post-id={post.postId}
            ref={(el) => { postRefs.current[index] = el; }}
            style={{ marginBottom: "2rem" }}
          >
            {renderPost(post)}
          </div>
        ))}
        <div style={{ height: "60vh" }} />
      </Box>
    </div>
  );

  // ── Animated mode switch ───────────────────────────────────────────────────
  // Forward navigation (clicking into a post): old view slides left, new view slides in from right.
  // Backward navigation (Back button): old view slides right, new view slides in from left.
  const enterX = navDirection === 'forward' ? 40 : -40;
  const exitX = navDirection === 'forward' ? -40 : 40;

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={inThreadMode ? threadKey : 'feed'}
        initial={{ opacity: 0, x: enterX }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: exitX }}
        transition={{ duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}
      >
        {inThreadMode ? threadContent : feedContent}
      </motion.div>
    </AnimatePresence>
  );
}
