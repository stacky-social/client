"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Text, Paper, Box, Group, Divider, Button } from "@mantine/core";
import { IconArrowLeft } from "@tabler/icons-react";
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
    topic: "Related",
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

  const resolveEntry = useCallback((id: string): ListyInjectionEntry | null => {
    const real = entryMap.get(id);
    if (real) return real;
    const found = allRelatedPosts.get(id);
    if (found) return syntheticEntryFromRelated(found.rp, found.parentEntry);
    return null;
  }, [entryMap, allRelatedPosts]);

  /** Get the flat stacks for a given post id (for sidebar) */
  const getRelatedStacks = useCallback((id: string) => {
    const entry = resolveEntry(id);
    if (entry) return toPostData(entry).relatedStacks;
    return [];
  }, [resolveEntry]);

  // ── Navigation stack ───────────────────────────────────────────────────────
  const [navStack, setNavStack] = useState<string[]>([]);
  const inThreadMode = navStack.length > 0;
  const savedScrollRef = useRef<Map<string, number>>(new Map());

  const navigateToPost = useCallback((postId: string) => {
    // Save current scroll
    const key = navStack.length > 0 ? navStack[navStack.length - 1] : "__feed__";
    savedScrollRef.current.set(key, window.scrollY);

    setNavStack(prev => {
      const next = [...prev];
      // From feed mode: push active feed post as ancestor if different
      if (next.length === 0 && activePostIdRef.current && activePostIdRef.current !== postId) {
        next.push(activePostIdRef.current);
      }
      next.push(postId);
      return next;
    });

    // Update sidebar to show this post's related stacks
    const stacks = getRelatedStacks(postId);
    setFromPostRef.current(stacks, postId, { force: true });
    setActivePostId(postId);
    activePostIdRef.current = postId;
    window.scrollTo(0, 0);
  }, [navStack, getRelatedStacks]);

  const navigateBack = useCallback(() => {
    setNavStack(prev => {
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

  // Scroll-based focus detection (feed mode only)
  useEffect(() => {
    if (inThreadMode) return;
    let rafId = 0;
    const onScroll = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const viewportCenter = window.innerHeight / 2;
        let bestIdx: number | null = null;
        let bestDist = Infinity;
        for (let i = 0; i < postRefs.current.length; i++) {
          const el = postRefs.current[i];
          if (!el) continue;
          const rect = el.getBoundingClientRect();
          if (rect.bottom <= 0 || rect.top >= window.innerHeight) continue;
          const dist = Math.abs(rect.top + rect.height / 2 - viewportCenter);
          if (dist < bestDist) { bestDist = dist; bestIdx = i; }
        }
        if (bestIdx !== null) {
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
      />
    );
  }

  // ── Thread mode render ─────────────────────────────────────────────────────
  if (inThreadMode) {
    const currentId = navStack[navStack.length - 1];
    const ancestorIds = navStack.slice(0, -1);
    const currentEntry = resolveEntry(currentId);
    const currentPost = currentEntry ? toPostData(currentEntry) : null;

    return (
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
                    // Pop stack down to this ancestor
                    const targetIdx = ancestorIds.indexOf(aId);
                    setNavStack(prev => prev.slice(0, targetIdx + 1));
                    const stacks = getRelatedStacks(aId);
                    setFromPostRef.current(stacks, aId, { force: true });
                    setActivePostId(aId);
                    activePostIdRef.current = aId;
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

        {/* Replies */}
        {currentPost && currentPost.replies.length > 0 && (
          <div style={{ marginTop: "0.5rem" }}>
            <Text size="xs" fw={600} c="dimmed" mb="sm" style={{ textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Replies
            </Text>
            {currentPost.replies.map((reply, index) => (
              <div key={reply.id} style={{ position: "relative", marginBottom: index < currentPost.replies.length - 1 ? "0.5rem" : 0 }}>
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

  // ── Feed mode render ───────────────────────────────────────────────────────
  const totalRelated = posts.reduce((sum, p) => sum + p.relatedStacks.length, 0);
  const uniqueAuthors = new Set(posts.flatMap(p => p.relatedStacks.map(s => s.topPost.account.display_name)));

  return (
    <div>
      <Paper
        style={{
          backgroundColor: "#fff", boxShadow: "rgba(0, 0, 0, 0.1) 0px 1px 1px",
          borderRadius: "8px", padding: "20px", marginBottom: "20px",
        }}
        withBorder
      >
        <Group style={{ justifyContent: "space-between" }}>
          <Text size="xl" fw={700}>#FourDayWorkWeek</Text>
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
}
