"use client";

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Anchor, Button, Divider, Loader, Paper, Tabs, Text } from "@mantine/core";
import Link from "next/link";
import { notifications } from "@mantine/notifications";
import Post from "../../../../../components/Posts/Post";
import ReplySection from "../../../../../components/ReplySection";
import BackButton from "../../../../../components/BackButton";
import ThreadedReplyList from "../../../../../components/ThreadedReplyList";
import { useRelatedStacks } from "../../../related-stacks-context";
import { useUrlSync } from "../../../../../utils/useUrlSync";
import {
  getMockPost,
  getMockAncestors,
  getMockReplies,
  getMockRelatedStacks,
  getMockRecommended,
  getMockFocusRelations,
  getMockReplyRelations,
  getMockPlainText,
  mockHasPost,
  type MockPostType,
} from "../../../../../utils/mockPostResolver";
import type { Relation } from "../../../../../types/PostType";
import { getCurrentUser } from "../../../../../utils/getCurrentUser";
import { useLocalStore, useHydrated, getComments } from "../../../../../utils/localStore";
import { useExperimentFlags } from "../../../../../utils/experimentFlags";
import { sortReplies } from "../../../../../utils/replySort.mjs";
import { allowedTabsFor, coerceTab, defaultTabFor } from "../../../../../utils/replyTabs.mjs";
import { filterReplies, clusterTopLevel } from "../../../../../utils/threadFilter.mjs";
import { getMockReplyRank } from "../../../../../utils/mockPostResolver";
import ReplySummaryCard from "../../../../../components/ReplySummaryCard";
import ReplyFilterBar from "../../../../../components/ReplyFilterBar";
import FocusPostStickyBar from "../../../../../components/Posts/FocusPostStickyBar";
import { getCategoryColors } from "../../../../../utils/categoryStyles";
import {
  useHighlightStore,
  setFilterCategories,
  clearResponseFilter,
  toggleReplyAnchor,
  setReplyAnchor,
  clearReplyAnchor,
  setReRankAnchor,
  clearReRankAnchors,
  setReplyTopicCounts,
} from "../../../../../utils/highlightStore";

// Thread connector line style — mirrors /posts/[id]
const THREAD_LINE_COLOR = "#ccd1dc";
// Avatar center x = Paper.border (2) + paddingLeft (16) + half-avatar (19) = 37.
// Subtract 1 (half line width) so the 2px line is centered on the avatar.
const THREAD_LINE_LEFT = 36;

function stripHtmlToPlain(html: string): string {
  if (typeof document !== "undefined") {
    const el = document.createElement("div");
    el.innerHTML = html;
    return el.textContent ?? el.innerText ?? "";
  }
  return html.replace(/<[^>]*>/g, "");
}

export default function MockPostView({ params }: { params: { id: string } }) {
  const router = useRouter();
  const searchParamsObj = useSearchParams();
  const { id } = params;
  const { setFromPost, relatedStacks: ctxRelatedStacks } = useRelatedStacks();
  const flags = useExperimentFlags();
  const { filterCategories, responseFilter, replyAnchor, reRankAnchorIds, anchoredRangeByPost } = useHighlightStore();

  const [post, setPost] = useState<MockPostType | null>(null);
  const [ancestors, setAncestors] = useState<MockPostType[]>([]);
  const [replies, setReplies] = useState<MockPostType[]>([]);
  const [recommendedPosts, setRecommendedPosts] = useState<MockPostType[]>([]);
  const [focusRelations, setFocusRelations] = useState<Relation[]>([]);
  // Default tab: "top" under the reply-sort-tabs flag (its default), "time" legacy.
  const [activeTab, setActiveTab] = useState<string>("top");
  const [visibleTopLevelReplies, setVisibleTopLevelReplies] = useState(5);
  const [activePostId, setActivePostId] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<any | null>(null);
  // Defer the (potentially large) reply thread one task so the focus post +
  // ancestors paint immediately and the heavy thread render doesn't block the
  // main thread as one giant synchronous task (fixes slow nav + the freeze).
  const [showThread, setShowThread] = useState(false);

  const plainPostText = post ? stripHtmlToPlain(post.content) : null;

  // User-authored replies from the local store (reactive: a just-posted comment
  // re-renders this component immediately). Already in the right Post shape with
  // in_reply_to_id === id, so they slot in as top-level replies of the focus post.
  // Store comments live in localStorage; gate on mount so the thread matches the
  // server render, then merge them in.
  const hydrated = useHydrated();
  const userCommentsLive = useLocalStore(() => getComments(id));
  const userComments = hydrated ? userCommentsLive : [];

  // Merge seeded mock replies with the user's store comments so both appear in
  // the thread. De-dupe by id defensively (a store comment should never collide
  // with a seeded reply, but this guards against accidental overlap).
  const mergedReplies = useMemo(() => {
    if (userComments.length === 0) return replies;
    const seen = new Set(replies.map((r) => r.id));
    const extra = userComments.filter((c) => !seen.has(c.id));
    return [...replies, ...(extra as unknown as MockPostType[])];
  }, [replies, userComments]);

  const filteredReplies = useMemo(
    () => mergedReplies.filter((r) => r.in_reply_to_id === id),
    [mergedReplies, id]
  );
  const totalTopLevelReplies = filteredReplies.length;

  // Reply contributions: relations + deduped category badges per reply id.
  // Memoized maps keep prop references stable so React.memo on Post holds.
  const replyRelationsById = useMemo(() => {
    const m = new Map<string, Relation[]>();
    for (const r of mergedReplies) {
      const rels = getMockReplyRelations(r.id, id);
      if (rels.length > 0) m.set(r.id, rels);
    }
    return m;
  }, [mergedReplies, id]);

  const replyBadgesById = useMemo(() => {
    const m = new Map<string, string[]>();
    replyRelationsById.forEach((rels, rid) => {
      const cats: string[] = [];
      for (const r of rels) if (!cats.includes(r.category)) cats.push(r.category);
      m.set(rid, cats);
    });
    return m;
  }, [replyRelationsById]);

  const relationsOfReply = useCallback(
    (rid: string) => replyRelationsById.get(rid) ?? [],
    [replyRelationsById]
  );

  // Branch-union relations: a top-level reply's own relations plus every
  // descendant's. Filters match against the whole branch, so a matching nested
  // reply keeps its branch visible (root as context) instead of being silently
  // hidden when only the root is inspected.
  const branchRelationsById = useMemo(() => {
    const childIds = new Map<string, string[]>();
    for (const r of mergedReplies) {
      const pid = r.in_reply_to_id;
      if (!pid) continue;
      const arr = childIds.get(pid) ?? [];
      arr.push(r.id);
      childIds.set(pid, arr);
    }
    const m = new Map<string, Relation[]>();
    for (const r of mergedReplies) {
      if (r.in_reply_to_id !== id) continue;
      const union: Relation[] = [];
      const stack = [r.id];
      const seen = new Set<string>();
      while (stack.length) {
        const rid = stack.pop()!;
        if (seen.has(rid)) continue;
        seen.add(rid);
        union.push(...(replyRelationsById.get(rid) ?? []));
        for (const cid of childIds.get(rid) ?? []) stack.push(cid);
      }
      if (union.length > 0) m.set(r.id, union);
    }
    return m;
  }, [mergedReplies, id, replyRelationsById]);

  // Focus-post mark coverage: related-post relations PLUS reply relations.
  // A reply can connect to a passage no related post covers (bs-011's was the
  // canary) — without merging, hovering that reply had no mark to light up in
  // the focus post or the pinned post. Gated with reply contributions: when
  // replies render plain, their regions don't mark the focus post either.
  const focusRelationsAll = useMemo(() => {
    if (!flags.replyContributions) return focusRelations;
    const merged = [...focusRelations];
    replyRelationsById.forEach((rels) => merged.push(...rels));
    return merged;
  }, [flags.replyContributions, focusRelations, replyRelationsById]);

  // Top-level order for the current sort mode (also the pagination order).
  // Only computed under the reply-sort-tabs flag; legacy tabs keep the
  // component-internal newest-first order.
  const sortOpts = useMemo(
    () => ({
      rankOf: (r: MockPostType) => getMockReplyRank(r.id),
      relationsOf: (r: MockPostType) => replyRelationsById.get(r.id) ?? [],
    }),
    [replyRelationsById]
  );
  // ── Cross-pane filtering + symmetric topic grouping (Task 7, revised) ─────
  // FILTERS (categories + passage) apply to both panes and are worn visibly in
  // ReplyFilterBar. TOPIC interactions never filter: one topic GROUPS BOTH
  // panes — each pane reranks in place around its own anchor, and the two
  // anchors are kept in sync below. One concept, one pill per pane.
  const crossFilterActive = flags.crossPaneFiltering && flags.replySortTabs;

  const displayedTopLevel = useMemo(() => {
    if (!crossFilterActive) return filteredReplies;
    return filterReplies(
      filteredReplies,
      (r: MockPostType) => replyRelationsById.get(r.id) ?? [],
      { filterCategories, responseFilter },
      (r: MockPostType) => branchRelationsById.get(r.id) ?? []
    );
  }, [crossFilterActive, filteredReplies, replyRelationsById, branchRelationsById, filterCategories, responseFilter]);

  const replyAnchorTopic = useMemo(() => {
    if (!replyAnchor) return null;
    const rels = replyRelationsById.get(replyAnchor.replyId) ?? [];
    return rels[replyAnchor.rangeIndex]?.topic ?? null;
  }, [replyAnchor, replyRelationsById]);

  // Topic of the related panel's active anchor (explicit topics only — the
  // curated dataset always carries them).
  const relatedAnchorTopic = useMemo(() => {
    const aid = reRankAnchorIds.length > 0 ? reRankAnchorIds[reRankAnchorIds.length - 1] : null;
    if (!aid) return null;
    const stack = (ctxRelatedStacks ?? []).find((s: any) => s?.topPost?.id === aid);
    const ri = anchoredRangeByPost[aid] ?? 0;
    return ((stack as any)?.topPost?.relations?.[ri]?.topic as string | undefined) ?? null;
  }, [reRankAnchorIds, anchoredRangeByPost, ctxRelatedStacks]);

  // Grouping sync, related → replies: when the right pane groups by a topic,
  // cluster the replies around their first post on that topic; when the right
  // grouping clears, the reply cluster clears with it. (The reply → related
  // direction is handled synchronously in handleReplySpanClick.) Converges in
  // one pass: once the reply anchor's topic matches, this effect no-ops.
  useEffect(() => {
    if (!crossFilterActive || !flags.replyReranking) return;
    if (relatedAnchorTopic === null) {
      if (replyAnchor) setReplyAnchor(null);
      return;
    }
    if (replyAnchorTopic === relatedAnchorTopic) return;
    for (const r of displayedTopLevel) {
      const rels = replyRelationsById.get(r.id) ?? [];
      const idx = rels.findIndex((x) => x.topic === relatedAnchorTopic);
      if (idx >= 0) {
        setReplyAnchor({ replyId: r.id, rangeIndex: idx });
        return;
      }
    }
    setReplyAnchor(null);
  }, [crossFilterActive, flags.replyReranking, relatedAnchorTopic, replyAnchorTopic, replyAnchor, displayedTopLevel, replyRelationsById]);

  const replyCluster =
    flags.replyReranking && flags.replySortTabs && replyAnchor && replyAnchorTopic
      ? { anchorId: replyAnchor.replyId, topic: replyAnchorTopic, rangeIndex: replyAnchor.rangeIndex }
      : null;
  const replyClusterColor = replyCluster
    ? getCategoryColors(
        (replyRelationsById.get(replyCluster.anchorId) ?? [])[replyCluster.rangeIndex]?.category ?? "uncategorized"
      )
    : null;

  const { topLevelOrder, clusterMemberIds } = useMemo(() => {
    if (!flags.replySortTabs) return { topLevelOrder: undefined, clusterMemberIds: null as Set<string> | null };
    const mode = activeTab === "top" || activeTab === "liked" ? activeTab : "time";
    let order = sortReplies(displayedTopLevel, mode, sortOpts).map((r: MockPostType) => r.id);
    let memberIds: Set<string> | null = null;
    if (replyCluster) {
      const res = clusterTopLevel(
        order,
        (rid: string) => replyRelationsById.get(rid) ?? [],
        replyCluster.anchorId,
        replyCluster.topic
      );
      order = res.order;
      memberIds = res.memberIds;
    }
    return { topLevelOrder: order, clusterMemberIds: memberIds };
  }, [flags.replySortTabs, activeTab, displayedTopLevel, sortOpts, replyCluster, replyRelationsById]);
  const displayedTotal = topLevelOrder ? topLevelOrder.length : totalTopLevelReplies;

  // A cluster must form IN VIEW (visibility of system status): grow the visible
  // top-level window to cover the anchor plus at least its first 3 below-matches,
  // so the grouping pill never points at an off-screen block. Grows only —
  // Math.max keeps the effect convergent and never shrinks a user's expansion.
  useEffect(() => {
    if (!replyCluster || !topLevelOrder || !clusterMemberIds) return;
    const anchorIdx = topLevelOrder.indexOf(replyCluster.anchorId);
    if (anchorIdx < 0) return;
    const below = topLevelOrder.slice(anchorIdx + 1).filter((rid) => clusterMemberIds.has(rid));
    const needed = anchorIdx + 1 + Math.min(3, below.length);
    setVisibleTopLevelReplies((v) => Math.max(v, needed));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replyCluster?.anchorId, replyCluster?.topic, topLevelOrder, clusterMemberIds]);

  // Topic → displayed-reply count, published to the store so the related
  // panel's "N more <topic>" tooltips count across both panes. Counts every
  // reply in the displayed branches — nested replies carry contributions too.
  const replyTopicCountsMap = useMemo(() => {
    const childIds = new Map<string, string[]>();
    for (const r of mergedReplies) {
      const pid = r.in_reply_to_id;
      if (!pid) continue;
      const arr = childIds.get(pid) ?? [];
      arr.push(r.id);
      childIds.set(pid, arr);
    }
    const m = new Map<string, number>();
    const stack = displayedTopLevel.map((r) => r.id);
    const seen = new Set<string>();
    while (stack.length) {
      const rid = stack.pop()!;
      if (seen.has(rid)) continue;
      seen.add(rid);
      const topics = new Set(
        (replyRelationsById.get(rid) ?? []).map((x) => x.topic).filter(Boolean) as string[]
      );
      topics.forEach((t) => m.set(t, (m.get(t) ?? 0) + 1));
      for (const cid of childIds.get(rid) ?? []) stack.push(cid);
    }
    return m;
  }, [displayedTopLevel, mergedReplies, replyRelationsById]);

  useEffect(() => {
    if (!crossFilterActive) {
      setReplyTopicCounts({});
      return;
    }
    const obj: Record<string, number> = {};
    replyTopicCountsMap.forEach((n, t) => {
      obj[t] = n;
    });
    setReplyTopicCounts(obj);
  }, [crossFilterActive, replyTopicCountsMap]);
  useEffect(() => () => setReplyTopicCounts({}), []);

  // Cross-pane tooltip count for reply spans: related posts + displayed replies
  // sharing the topic, minus the hovered reply itself. Related side counts
  // explicit topics only (the curated entries always carry them).
  const relatedTopicCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of ctxRelatedStacks ?? []) {
      const topics = new Set(
        (((s as any)?.topPost?.relations ?? []) as Relation[]).map((r) => r.topic).filter(Boolean) as string[]
      );
      topics.forEach((t) => m.set(t, (m.get(t) ?? 0) + 1));
    }
    return m;
  }, [ctxRelatedStacks]);
  const replyTopicCountFn = useCallback(
    (topic: string) =>
      Math.max(0, (relatedTopicCounts.get(topic) ?? 0) + (replyTopicCountsMap.get(topic) ?? 0) - 1),
    [relatedTopicCounts, replyTopicCountsMap]
  );

  // Dwell-tooltip reply counts for the FOCUS post: how many displayed top-level
  // branches respond to the hovered span union. Merged into "Click to show
  // N related posts · M replies" so a reply-only span never reads a misleading
  // "0 related posts" (honest counts across both panes).
  const replyCountForSpans = useCallback(
    (ranges: Array<{ fs: number; fe: number }>) => {
      if (!crossFilterActive) return 0;
      let n = 0;
      for (const r of displayedTopLevel) {
        // Branch-union match — the same rule the passage filter applies, so the
        // promised count equals exactly what the click reveals.
        const rels = branchRelationsById.get(r.id) ?? [];
        if (rels.some((rel) => ranges.some((u) => rel.focusStart < u.fe && u.fs < rel.focusEnd))) n++;
      }
      return n;
    },
    [crossFilterActive, displayedTopLevel, branchRelationsById]
  );

  // Reply span click: rerank in place. The clicked card is scroll-pinned so the
  // user never loses their place (same contract as the related panel's anchors).
  const replyPinRef = useRef<{ id: string; top: number } | null>(null);
  // Sticky focus bar anchors: the focus post wrapper + the center column.
  const focusWrapRef = useRef<HTMLDivElement | null>(null);
  const columnRef = useRef<HTMLDivElement | null>(null);
  const handleReplySpanClick = useCallback(
    (replyId: string, rangeIndex: number) => {
      if (!flags.replyReranking) return;
      const rels = replyRelationsById.get(replyId) ?? [];
      const topic = rels[rangeIndex]?.topic ?? null;
      const el = document.querySelector(`[data-post-id="${replyId}"]`) as HTMLElement | null;
      replyPinRef.current = el ? { id: replyId, top: el.getBoundingClientRect().top } : null;

      const isSame = replyAnchor?.replyId === replyId && replyAnchor.rangeIndex === rangeIndex;
      if (isSame) {
        // Dismissing the topic group clears BOTH panes' grouping.
        clearReplyAnchor();
        if (flags.crossPaneFiltering) clearReRankAnchors();
        return;
      }
      // R-REORDER-9 parity with the aside: re-picking the ALREADY-GROUPED topic
      // from any other span is a no-op (its tooltip reads "(shown)") — the block
      // must not jump to a different anchor. Only the active anchor span toggles
      // the group off (handled above).
      if (topic !== null && topic === replyAnchorTopic) return;
      toggleReplyAnchor(replyId, rangeIndex);
      // Mirror the grouping onto the related panel: anchor its first card that
      // carries the same topic. No topic match over there → no grouping there.
      if (flags.crossPaneFiltering && topic) {
        const stack = (ctxRelatedStacks ?? []).find((s: any) =>
          ((s?.topPost?.relations ?? []) as Relation[]).some((x) => x.topic === topic)
        );
        if (stack) {
          const ri = ((stack as any).topPost.relations as Relation[]).findIndex((x) => x.topic === topic);
          setReRankAnchor((stack as any).topPost.id, ri);
        } else {
          clearReRankAnchors();
        }
      }
    },
    [flags.replyReranking, flags.crossPaneFiltering, replyRelationsById, replyAnchor, replyAnchorTopic, ctxRelatedStacks]
  );

  useLayoutEffect(() => {
    const pin = replyPinRef.current;
    replyPinRef.current = null;
    if (!pin) return;
    const el = document.querySelector(`[data-post-id="${pin.id}"]`) as HTMLElement | null;
    if (!el) return;
    const delta = el.getBoundingClientRect().top - pin.top;
    if (Math.abs(delta) > 0.5) window.scrollTo(0, Math.max(0, window.scrollY + delta));
  }, [replyAnchor]);

  // Keep the active tab inside whichever tab set the flag selects. Depends on
  // activeTab too, so a foreign tab arriving AFTER a flag change (URL
  // hydration of a stale cross-condition link — audit F-1) degrades to the
  // active set's default instead of selecting a tab with no panel.
  useEffect(() => {
    const coerced = coerceTab(activeTab, flags.replySortTabs);
    if (coerced !== activeTab) setActiveTab(coerced);
  }, [flags.replySortTabs, activeTab]);

  // -------------------- Load mock data --------------------
  useEffect(() => {
    if (!mockHasPost(id)) {
      setPost(null);
      return;
    }
    const p = getMockPost(id);
    setPost(p);
    const threadAncestors = getMockAncestors(id);
    const threadReplies = getMockReplies(id);
    setAncestors(threadAncestors);
    setReplies(threadReplies);
    setRecommendedPosts(getMockRecommended(id));
    setFocusRelations(getMockFocusRelations(id));
    if (p) {
      // D1 suppression: posts already visible in the thread (the focus post,
      // its ancestors, its replies) are dropped from the related panel so the
      // user never meets the same post in both panes. The context only ever
      // holds the suppressed list, which keeps chip/topic counts honest.
      const threadIds = new Set<string>([
        id,
        ...threadAncestors.map((a) => a.id),
        ...threadReplies.map((r) => r.id),
      ]);
      const visibleStacks = flags.suppressThreadPosts
        ? p.relatedStacks.filter((s: any) => !threadIds.has(s?.topPost?.id))
        : p.relatedStacks;
      // ?related={id}: arrived via a shared "pairing" link — emphasise that
      // related card in the aside. If the id isn't among this post's related
      // responses (stale/invalid link, or suppressed into the thread), still
      // show the post, but flag it.
      const relatedId = searchParamsObj?.get("related") ?? null;
      setFromPost(visibleStacks, id, { force: true, highlightPostId: relatedId });
      setActivePostId(id);
      if (relatedId && !visibleStacks.some((s: any) => s?.topPost?.id === relatedId)) {
        notifications.show({
          title: "Pairing unavailable",
          message: "That related response isn't available for this post anymore.",
          color: "yellow",
        });
      }
    }
    // Read currentUser from localStorage if present (ReplySection wants it; mock allows null).
    const user = getCurrentUser();
    if (user) setCurrentUser(user);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, flags.suppressThreadPosts]);

  // Defer the reply thread to the next task so the focus post + ancestors
  // paint immediately instead of blocking on one big synchronous render.
  useEffect(() => {
    setShowThread(false);
    const t = setTimeout(() => setShowThread(true), 0);
    return () => clearTimeout(t);
  }, [id]);

  // -------------------- URL sync (H1/H2/H4/H5) --------------------
  useUrlSync({
    activeTab,
    setActiveTab,
    plainPostText,
    // Mock mode: tab switches don't require data fetches (data is already loaded).
    onHydratedTab: () => {},
    defaultTab: defaultTabFor(flags.replySortTabs),
    allowedTabs: allowedTabsFor(flags.replySortTabs),
  });

  // H5: seed BackButton sessionStorage from ?from= when opening a shared link
  useEffect(() => {
    const fromId = searchParamsObj?.get("from");
    if (!fromId) return;
    const key = `previousPath:${window.location.pathname}`;
    if (!sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, `/ChineseEVs/posts/${fromId}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleTabChange = (value: string | null) => {
    if (value) setActiveTab(value);
  };

  // Stack icons are hidden on the focused view; related stacks live in the aside.
  const renderPost = (p: MockPostType, isFocusPost: boolean = false) => {
    // Replies (incl. dual-role related posts) get contribution spans + badges;
    // the focus post keeps its grey marks; ancestors stay passive by design.
    const showReplyContributions =
      !isFocusPost && flags.replyContributions && replyRelationsById.has(p.id);
    const inCluster = !!clusterMemberIds?.has(p.id) && !!replyClusterColor;
    const postEl = (
    <Post
      key={p.id}
      id={p.id}
      text={p.content}
      author={p.account.username}
      account={p.account.acct || p.account.acc || p.account.username}
      avatar={p.account.avatar}
      repliesCount={p.replies_count}
      createdAt={p.created_at}
      stackCount={-1}
      favouritesCount={p.favourites_count}
      favourited={p.favourited}
      bookmarked={p.bookmarked}
      mediaAttachments={(p.media_attachments || []).map((m: any) => m.url)}
      onStackIconClick={() => {}}
      setIsModalOpen={() => {}}
      setIsExpandModalOpen={() => {}}
      relatedStacks={[]}
      setActivePostId={setActivePostId}
      activePostId={activePostId}
      focusRelations={isFocusPost ? focusRelationsAll : []}
      contentRelations={showReplyContributions ? replyRelationsById.get(p.id) : undefined}
      categoryBadges={showReplyContributions ? replyBadgesById.get(p.id) : undefined}
      onContentSpanClick={
        showReplyContributions && flags.replyReranking && flags.replySortTabs
          ? (ri: number) => handleReplySpanClick(p.id, ri)
          : undefined
      }
      replyTopicCount={
        showReplyContributions && flags.crossPaneFiltering ? replyTopicCountFn : undefined
      }
      activeClusterTopic={showReplyContributions ? replyCluster?.topic ?? null : undefined}
      replyCountForSpans={isFocusPost ? replyCountForSpans : undefined}
      clampLines={10}
      // Keep every post/reply on the mock-backed detail route. Without this the
      // Post component falls back to the real /posts/[id] route, which requires a
      // Mastodon access token and renders a blank "Access token is missing" screen.
      onNavigate={(pid: string) => {
        sessionStorage.setItem(`previousPath:/ChineseEVs/posts/${pid}`, window.location.pathname + window.location.search);
        router.push(`/ChineseEVs/posts/${pid}`);
      }}
    />
    );
    // Reply-cluster members carry a rail in the anchor's category color so the
    // grouped block reads as one thread (mirrors the related panel's rail).
    return inCluster && replyClusterColor ? (
      <div
        key={`cluster-${p.id}`}
        data-reply-cluster-member
        style={{ borderLeft: `3px solid ${replyClusterColor.border}`, borderRadius: 0, paddingLeft: 8 }}
      >
        {postEl}
      </div>
    ) : (
      postEl
    );
  };

  if (!mockHasPost(id)) {
    return (
      <Paper withBorder radius="md" mt={20} p="lg">
        <Text size="sm">
          Post <code>{id}</code> not found in mock data.
        </Text>
        <Text size="xs" c="dimmed" mt="xs">
          This demo thread runs on bundled sample data. Head back to the{" "}
          <Anchor component={Link} href="/ChineseEVs" size="xs">
            demo feed
          </Anchor>{" "}
          to pick a post that exists.
        </Text>
      </Paper>
    );
  }

  if (!post) return <Loader size="lg" />;

  return (
    <div style={{ position: "relative" }} ref={columnRef}>
      <BackButton />
      {flags.stickyFocusBar && post && plainPostText && (
        <FocusPostStickyBar
          author={post.account.username}
          avatar={post.account.avatar}
          plainText={plainPostText}
          focusRelations={focusRelationsAll}
          anchorRef={focusWrapRef}
          containerRef={columnRef}
        />
      )}
      <div>
        <div style={{ position: "relative" }}>
          {/* Ancestors — thread connector line runs at the avatar column,
              BEHIND the Post's Paper (zIndex 0 < Paper's zIndex 5). The line
              is hidden inside each card and visible only in the gap between
              cards, matching the Twitter-style thread look (line connects
              cards without cutting across post bodies).

              paddingBottom on each wrapper holds the Post's marginBottom
              inside so the absolute line can span through to the next post;
              negative marginBottom cancels the extra height for layout. */}
          {ancestors.length > 0 && (
            <div style={{ position: "relative" }}>
              {ancestors.map((a) => (
                <div
                  key={a.id}
                  style={{
                    position: "relative",
                    paddingBottom: "3rem",
                    marginBottom: "-3rem",
                  }}
                >
                  <div
                    aria-hidden
                    style={{
                      position: "absolute",
                      left: THREAD_LINE_LEFT,
                      top: 0,
                      bottom: 0,
                      width: 2,
                      backgroundColor: THREAD_LINE_COLOR,
                      zIndex: 0,
                    }}
                  />
                  {renderPost(a)}
                </div>
              ))}
            </div>
          )}

          {/* Focus post */}
          <div style={{ position: "relative" }} ref={focusWrapRef}>
            {renderPost(post, /* isFocusPost */ true)}
          </div>
        </div>

        <Divider my="md" />

        {showThread && <ReplySection postId={id} currentUser={currentUser} fetchPostAndReplies={() => {}} />}

        {/* Visible filter state for the replies list — cross-pane filters only
            act when they are worn by the list they hide posts from. */}
        {showThread && crossFilterActive && (
          <ReplyFilterBar
            filterCategories={filterCategories}
            responseFilter={responseFilter}
            shown={displayedTotal}
            total={totalTopLevelReplies}
            onRemoveCategory={(cat) => {
              const next = new Set(filterCategories);
              next.delete(cat);
              setFilterCategories(next);
            }}
            onClearResponse={clearResponseFilter}
            onClearAll={() => {
              setFilterCategories(new Set());
              clearResponseFilter();
            }}
          />
        )}

        {/* Summary follows the same small-thread suppression as the sort tabs:
            with a handful of replies, a digest is noise (Jason's <=5 rule).
            It digests the CURRENTLY DISPLAYED (post-filter) replies. */}
        {showThread && flags.summaryCard && totalTopLevelReplies > 5 && displayedTopLevel.length > 0 && (
          <div style={{ marginTop: crossFilterActive ? 0 : "1rem" }}>
            <ReplySummaryCard replies={displayedTopLevel as any} relationsOf={relationsOfReply} />
          </div>
        )}

        {showThread && mergedReplies.length > 0 && flags.replySortTabs && (
          <Paper
            style={{
              borderRadius: "0 0 8px 8px",
              fontFamily: "Roboto, sans-serif",
              fontSize: 14,
              marginTop: flags.summaryCard ? 0 : "1rem",
              width: "100%",
            }}
          >
            {/* Reply grouping pill — dismissing clears the topic group in BOTH
                panes (the grouping is one concept shared across them). Hidden
                when the anchor itself is filtered out of the displayed list: a
                state chip must describe visible state, never a ghost group. */}
            {replyCluster && replyClusterColor && topLevelOrder?.includes(replyCluster.anchorId) && (
              <div
                data-testid="reply-cluster-pill"
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  background: replyClusterColor.bg, border: `1px solid ${replyClusterColor.border}55`,
                  borderRadius: 6, padding: "4px 8px", marginBottom: "0.5rem",
                }}
              >
                <Text size="xs" fw={600} c={replyClusterColor.text} style={{ fontSize: 11 }}>
                  Replies grouped by:
                </Text>
                <button
                  type="button"
                  onClick={() => {
                    clearReplyAnchor();
                    if (flags.crossPaneFiltering) clearReRankAnchors();
                  }}
                  aria-label={`Remove ${replyCluster.topic} reply grouping`}
                  style={{
                    background: "#ffffffaa", borderRadius: 4, padding: "2px 8px",
                    fontSize: 10, fontWeight: 600, color: replyClusterColor.text,
                    cursor: "pointer", border: "none",
                    display: "inline-flex", alignItems: "center", gap: 4, minHeight: 22,
                  }}
                >
                  <span>{replyCluster.topic}</span>
                  <span aria-hidden style={{ fontSize: 13, lineHeight: 1 }}>×</span>
                </button>
              </div>
            )}

            {/* Tabs are suppressed for small threads (<=5 top-level replies):
                with a handful of comments a sort control is noise — show the
                thread newest-first, as a traditional interface would. */}
            {totalTopLevelReplies > 5 && (
              <Tabs color="#002379" value={activeTab} onChange={handleTabChange}>
                <Tabs.List style={{ marginBottom: "1rem" }} data-testid="reply-sort-tabs">
                  {([["top", "Top"], ["time", "Newest"], ["liked", "Most liked"]] as const).map(([val, label]) => (
                    <Tabs.Tab
                      key={val}
                      value={val}
                      style={{ fontWeight: activeTab === val ? "bold" : "normal" }}
                    >
                      {label}
                    </Tabs.Tab>
                  ))}
                </Tabs.List>
              </Tabs>
            )}
            {/* One list for every sort: rendering never varies with the tab —
                only the top-level order does (subtrees stay intact). */}
            <ThreadedReplyList
              replies={mergedReplies as any}
              rootId={id}
              renderPost={renderPost as any}
              visibleTopLevelCount={visibleTopLevelReplies}
              topLevelOrder={topLevelOrder}
              opAcct={post?.account?.acct || post?.account?.username}
            />
            {displayedTotal === 0 && (
              <Text size="sm" c="dimmed" p="md" data-testid="no-matching-replies">
                No replies match the active filters.
              </Text>
            )}
            {visibleTopLevelReplies < displayedTotal && (
              <Button
                onClick={() =>
                  setVisibleTopLevelReplies((v) => Math.min(v + 5, displayedTotal))
                }
                variant="outline"
                fullWidth
                style={{ marginTop: 10 }}
              >
                {displayedTotal - visibleTopLevelReplies} more{" "}
                {displayedTotal - visibleTopLevelReplies === 1 ? "reply" : "replies"}
              </Button>
            )}
            {visibleTopLevelReplies > 5 && (
              <Button
                onClick={() => setVisibleTopLevelReplies(5)}
                variant="subtle"
                color="gray"
                fullWidth
                size="compact-sm"
                style={{ marginTop: 6 }}
                data-testid="top-level-show-fewer"
              >
                Show fewer replies
              </Button>
            )}
          </Paper>
        )}

        {showThread && mergedReplies.length > 0 && !flags.replySortTabs && (
          <Paper
            style={{
              borderRadius: "0 0 8px 8px",
              fontFamily: "Roboto, sans-serif",
              fontSize: 14,
              marginTop: "1rem",
              width: "100%",
            }}
          >
            <Tabs color="#002379" defaultValue="time" value={activeTab} onChange={handleTabChange}>
              <Tabs.List style={{ marginBottom: "1rem" }}>
                {(["time", "recommended", "stacked", "summary"] as const).map((tab) => (
                  <Tabs.Tab
                    key={tab}
                    value={tab}
                    style={{ fontWeight: activeTab === tab ? "bold" : "normal" }}
                  >
                    {tab[0].toUpperCase() + tab.slice(1)}
                  </Tabs.Tab>
                ))}
              </Tabs.List>

              <Tabs.Panel value="time">
                <ThreadedReplyList
                  replies={mergedReplies as any}
                  rootId={id}
                  renderPost={renderPost as any}
                  visibleTopLevelCount={visibleTopLevelReplies}
                />
                {visibleTopLevelReplies < totalTopLevelReplies && (
                  <Button
                    onClick={() =>
                      setVisibleTopLevelReplies((v) => Math.min(v + 5, totalTopLevelReplies))
                    }
                    variant="outline"
                    fullWidth
                    style={{ marginTop: 10 }}
                  >
                    {totalTopLevelReplies - visibleTopLevelReplies} more{" "}
                    {totalTopLevelReplies - visibleTopLevelReplies === 1 ? "reply" : "replies"}
                  </Button>
                )}
              </Tabs.Panel>

              <Tabs.Panel value="recommended">
                {recommendedPosts.length > 0
                  ? recommendedPosts.map((p) => renderPost(p))
                  : <Text size="sm" c="dimmed" p="md">No recommended posts in mock data for this id.</Text>}
              </Tabs.Panel>

              <Tabs.Panel value="stacked">
                <Text size="sm" c="dimmed" p="md">
                  Stacked view is API-backed in the default route — not available in mock mode.
                </Text>
              </Tabs.Panel>

              <Tabs.Panel value="summary">
                <Text size="sm" c="dimmed" p="md">
                  Summary view is API-backed in the default route — not available in mock mode.
                </Text>
              </Tabs.Panel>
            </Tabs>
          </Paper>
        )}

        <div style={{ height: "100vh" }} />
      </div>
    </div>
  );
}
