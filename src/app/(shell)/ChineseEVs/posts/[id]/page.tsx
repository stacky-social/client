"use client";

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
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
  getMockReplyCount,
  getMockPlainText,
  mockHasPost,
  type MockPostType,
} from "../../../../../utils/mockPostResolver";
import { resolveReplyCount } from "../../../../../utils/replyCount.mjs";
import type { Relation } from "../../../../../types/PostType";
import { getCurrentUser } from "../../../../../utils/getCurrentUser";
import { useLocalStore, useHydrated, getComments, type Post as StorePost } from "../../../../../utils/localStore";
import { useExperimentFlags } from "../../../../../utils/experimentFlags";
import { sortReplies } from "../../../../../utils/replySort.mjs";
import { allowedTabsFor, coerceTab, defaultTabFor } from "../../../../../utils/replyTabs.mjs";
import { filterReplies, clusterTopLevel, applyBaseOrder } from "../../../../../utils/threadFilter.mjs";
import { getMockReplyRank } from "../../../../../utils/mockPostResolver";
import ReplyFilterBar from "../../../../../components/ReplyFilterBar";
import FocusPostStickyBar from "../../../../../components/Posts/FocusPostStickyBar";
import { TOP_NAV_HEIGHT } from "../../../../../components/NavBar/TopNav";
import { getCategoryColors } from "../../../../../utils/categoryStyles";
import {
  useHighlightStore,
  setFilterCategories,
  clearResponseFilter,
  activateReplyTopic,
  clearTopicInteraction,
  setReplyTopicCounts,
  registerReplyTopicResolver,
  topicKeyOf,
  replyGrouping,
  replyTopicFilter,
  beginPanelInteraction,
  beginUndoablePanelInteractionIfDetail,
  setReplyBaseOrder,
  currentPanelScope,
  navigateFromPanelScope,
} from "../../../../../utils/highlightStore";

// Thread connector line style — mirrors /posts/[id]
const THREAD_LINE_COLOR = "#ccd1dc";
// Avatar center x = Paper.border (2) + paddingLeft (16) + half-avatar (19) = 37.
// Subtract 1 (half line width) so the 2px line is centered on the avatar.
const THREAD_LINE_LEFT = 36;

// WS3/T2 — X-style click-to-focus arrival animation. A reply/ancestor click
// stashes this intent (keyed by the DESTINATION post id) right before navigating;
// the destination consumes it on mount to pin the clicked post under the nav and
// play a brief settle/fade. Keyed so a stale intent never animates an unrelated
// load (deep link / browser Back never carry it).
const ANIMATE_INTENT_KEY = "stacky:focusAnimateIntent";
// Where the pinned focus post lands: just under the fixed top nav (matches
// FocusPostStickyBar.returnToPost's TOP_NAV_HEIGHT + 8 convention).
const FOCUS_PIN_OFFSET = TOP_NAV_HEIGHT + 8;
// The arrival fade: rise from 6px below its resting spot, fading in.
const FOCUS_ENTER_TRANSLATE = 6;
const FOCUS_ENTER_OPACITY = 0.4;
const FOCUS_ENTER_TRANSITION =
  "transform 240ms ease-out, opacity 240ms ease-out";

function stripHtmlToPlain(html: string): string {
  if (typeof document !== "undefined") {
    const el = document.createElement("div");
    el.innerHTML = html;
    return el.textContent ?? el.innerText ?? "";
  }
  return html.replace(/<[^>]*>/g, "");
}

/** Resolve a store-backed post's parent chain (oldest → direct parent). */
function getStoreAncestors(id: string, posts: Record<string, StorePost>): MockPostType[] {
  const chain: StorePost[] = [];
  const seen = new Set<string>([id]);
  let cursor = posts[id]?.in_reply_to_id ?? null;
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    const parent = posts[cursor];
    if (!parent) break;
    chain.unshift(parent);
    cursor = parent.in_reply_to_id ?? null;
  }
  return chain as unknown as MockPostType[];
}

/** Resolve every locally stored descendant so reply-to-reply threads survive. */
function getStoreReplies(id: string, posts: Record<string, StorePost>): MockPostType[] {
  const children = new Map<string, StorePost[]>();
  for (const candidate of Object.values(posts)) {
    const parentId = candidate.in_reply_to_id;
    if (!parentId) continue;
    const bucket = children.get(parentId) ?? [];
    bucket.push(candidate);
    children.set(parentId, bucket);
  }
  const out: StorePost[] = [];
  const queue = [...(children.get(id) ?? [])];
  const seen = new Set<string>();
  while (queue.length > 0) {
    const child = queue.shift()!;
    if (seen.has(child.id)) continue;
    seen.add(child.id);
    out.push(child);
    queue.push(...(children.get(child.id) ?? []));
  }
  return out as unknown as MockPostType[];
}

export default function MockPostView() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParamsObj = useSearchParams();
  const { id } = params;
  const { setFromPost, relatedStacks: ctxRelatedStacks } = useRelatedStacks();
  const flags = useExperimentFlags();
  const { filterCategories, responseFilter, topicInteraction, replyBaseOrderIds } = useHighlightStore();

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
  const [postedReplyId, setPostedReplyId] = useState<string | null>(null);

  const plainPostText = post ? stripHtmlToPlain(post.content) : null;

  // User-authored replies from the local store (reactive: a just-posted comment
  // re-renders this component immediately). Already in the right Post shape with
  // in_reply_to_id === id, so they slot in as top-level replies of the focus post.
  // Store comments live in localStorage; gate on mount so the thread matches the
  // server render, then merge them in.
  const hydrated = useHydrated();
  // Read the whole immutable snapshot by identity. This makes user-created
  // posts/replies resolvable after hydration and updates the thread immediately
  // when a new local reply is persisted.
  const localState = useLocalStore((snapshot) => snapshot);
  const storePost = hydrated ? localState.posts[id] : undefined;
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
  // Publish a resolver so the aside's `setPanelFocus` restore-validation can
  // resolve a restored REPLY-origin interaction against THIS thread's reply
  // relations — the aside owns the single setPanelFocus call but only knows
  // related-card anchors. Registered during render (not in an effect) so it is
  // current before the aside's setPanelFocus layout-effect runs on a focus
  // switch; cross-slot effect order between the @aside slot and this page is
  // otherwise unguaranteed, and a stale resolver would wrongly drop the
  // interaction. Cleared on unmount below.
  registerReplyTopicResolver((anchor) => {
    const rels = replyRelationsById.get(anchor.postId) ?? [];
    return rels[anchor.rangeIndex]?.topic ?? null;
  });
  useEffect(() => () => registerReplyTopicResolver(null), []);

  // The reply pane owns the data needed to validate a reply-origin deep link.
  // Wait until the requested focus post (and its reply map) has loaded, then
  // heal a syntactically valid tuple whose claimed anchor/topic no longer
  // exists. Aside-origin tuples are validated by RelatedStacks after its data
  // arrives, so each pane validates only the anchor domain it understands.
  useEffect(() => {
    if (post?.id !== id || !topicInteraction || topicInteraction.origin !== "replies") return;
    const rels = replyRelationsById.get(topicInteraction.anchor.postId) ?? [];
    const currentTopic = rels[topicInteraction.anchor.rangeIndex]?.topic ?? null;
    if (currentTopic !== topicInteraction.topicKey) clearTopicInteraction();
  }, [id, post?.id, replyRelationsById, topicInteraction]);

  // ── Cross-pane grouping / filtering (T7) ─────────────────────────────────
  // The reply pane's role is DERIVED from the single shared `topicInteraction`:
  // a reply-origin interaction CLUSTERS this pane (replyGrouping → the cluster
  // rail below), an aside-origin interaction FILTERS it (replyTopicFilter → the
  // "Filtered by" chip). One primitive, one origin — never both at once. This
  // replaces the legacy local `replyAnchor` rerank (converted in
  // handleReplySpanClick) and the symmetric related→replies mirror (deleted in
  // T4). Category/passage FILTERS still apply to both panes via ReplyFilterBar.
  //
  // The filter half is gated by `crossPaneFiltering` (mirrors the aside's
  // filter branch in T4); reply-origin clustering stays gated by the reply
  // flags only, so it degrades to in-pane clustering when cross-pane is off.
  const crossFilterActive = flags.crossPaneFiltering && flags.replySortTabs;

  const replyGroupingInteraction = useMemo(
    () => replyGrouping(topicInteraction),
    [topicInteraction]
  );
  const replyGroupTopic = useMemo(() => {
    if (!replyGroupingInteraction) return null;
    const rels = replyRelationsById.get(replyGroupingInteraction.anchor.postId) ?? [];
    return rels[replyGroupingInteraction.anchor.rangeIndex]?.topic ?? null;
  }, [replyGroupingInteraction, replyRelationsById]);

  // Aside-origin topic that would filter this reply list. Gated on the cross-pane
  // flag so it never acts when cross-pane filtering is off.
  const replyFilterKey = useMemo(() => {
    if (!crossFilterActive) return null;
    return replyTopicFilter(topicInteraction)?.topicKey ?? null;
  }, [crossFilterActive, topicInteraction]);

  // Precompute matches before applying the topic filter: if NO displayed branch
  // carries the topic, leave the list unfiltered and show no chip — an empty
  // reply list reads as "no replies" when the truth is "no replies on that
  // topic". Mirrors the aside's fail-safe (RelatedStacks displayStacks branch).
  const activeReplyTopicFilter = useMemo(() => {
    if (!replyFilterKey) return null;
    const hasMatch = filteredReplies.some((r) =>
      (branchRelationsById.get(r.id) ?? replyRelationsById.get(r.id) ?? []).some(
        (rel) => rel.topic === replyFilterKey
      )
    );
    return hasMatch ? replyFilterKey : null;
  }, [replyFilterKey, filteredReplies, branchRelationsById, replyRelationsById]);

  const displayedTopLevel = useMemo(() => {
    if (!crossFilterActive) return filteredReplies;
    return filterReplies(
      filteredReplies,
      (r: MockPostType) => replyRelationsById.get(r.id) ?? [],
      { filterCategories, responseFilter, topicFilter: activeReplyTopicFilter },
      (r: MockPostType) => branchRelationsById.get(r.id) ?? []
    );
  }, [crossFilterActive, filteredReplies, replyRelationsById, branchRelationsById, filterCategories, responseFilter, activeReplyTopicFilter]);

  // T8 filter auto-reveal: grandchildren (depth >= 2) are collapsed by default,
  // but a nested reply that MATCHES the active reply-list filter must not stay
  // hidden behind the collapsed count. Find every nested reply whose OWN
  // relations satisfy the active filter (mirrors filterReplies' per-reply test)
  // and force-reveal its ancestor chain so the match surfaces (root as context).
  const forceRevealParentIds = useMemo(() => {
    const anyFilter =
      crossFilterActive && (filterCategories.size > 0 || !!responseFilter || !!activeReplyTopicFilter);
    if (!anyFilter) return undefined;
    const cats = Array.from(filterCategories);
    const matches = (rid: string) => {
      const rels = replyRelationsById.get(rid) ?? [];
      if (cats.length > 0) {
        const own = new Set<string>(rels.map((r) => r.category));
        if (!cats.every((c) => own.has(c))) return false;
      }
      if (responseFilter && !rels.some((r) => r.focusStart < responseFilter.end && responseFilter.start < r.focusEnd)) {
        return false;
      }
      if (activeReplyTopicFilter && !rels.some((r) => r.topic === activeReplyTopicFilter)) return false;
      return true;
    };
    const parentOf = new Map(mergedReplies.map((r) => [r.id, r.in_reply_to_id]));
    const reveal = new Set<string>();
    for (const r of mergedReplies) {
      if (r.in_reply_to_id === id) continue; // top-level already visible
      if (!matches(r.id)) continue;
      let cur: string | null | undefined = r.in_reply_to_id;
      const seen = new Set<string>();
      while (cur && cur !== id && !seen.has(cur)) {
        seen.add(cur);
        reveal.add(cur);
        cur = parentOf.get(cur);
      }
    }
    return reveal.size > 0 ? reveal : undefined;
  }, [crossFilterActive, filterCategories, responseFilter, activeReplyTopicFilter, mergedReplies, id, replyRelationsById]);

  // Reply-origin cluster (rail + growth). Gated on the reply flags AND
  // origin==='replies' (replyGrouping is null otherwise), so an aside-origin
  // interaction never grows a rail here — that pane is filtered, not grouped.
  const replyCluster =
    flags.replyReranking && flags.replySortTabs && replyGroupingInteraction && replyGroupTopic
      ? { anchorId: replyGroupingInteraction.anchor.postId, topic: replyGroupTopic, rangeIndex: replyGroupingInteraction.anchor.rangeIndex }
      : null;
  const replyClusterColor = replyCluster
    ? getCategoryColors(
        (replyRelationsById.get(replyCluster.anchorId) ?? [])[replyCluster.rangeIndex]?.category ?? "uncategorized"
      )
    : null;

  const { topLevelOrder, clusterMemberIds } = useMemo(() => {
    if (!flags.replySortTabs) return { topLevelOrder: undefined, clusterMemberIds: null as Set<string> | null };
    const mode = activeTab === "top" || activeTab === "liked" ? activeTab : "time";
    // Permanence rule (tech plan): a cluster's rearrangement outlives its
    // dismissal. The persisted base order (last clustered arrangement) wins
    // over the sort until an explicit re-sort clears it (tab switch below).
    let order = applyBaseOrder(
      sortReplies(displayedTopLevel, mode, sortOpts).map((r: MockPostType) => r.id),
      replyBaseOrderIds
    );
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
  }, [flags.replySortTabs, activeTab, displayedTopLevel, sortOpts, replyCluster, replyRelationsById, replyBaseOrderIds]);

  // Write-through: while a cluster is active, its arrangement IS the permanent
  // base — so any dismissal path (re-click, header ×, replacement by another
  // interaction) leaves the replies where the cluster put them. Equality-guarded
  // in the store, so steady state doesn't loop. Not undoable: Back-undo restores
  // the pre-gesture snapshot (including the old replyBaseOrderIds) instead.
  useEffect(() => {
    if (replyCluster && topLevelOrder) setReplyBaseOrder(topLevelOrder);
  }, [replyCluster, topLevelOrder]);
  const displayedTotal = topLevelOrder ? topLevelOrder.length : totalTopLevelReplies;

  // A newly submitted reply should never vanish below the current sort/window.
  // Switch to chronological order, include its row, then bring it into view and
  // briefly emphasize the card once React has committed the store update.
  const handleReplyPosted = useCallback((replyId: string) => {
    setActiveTab("time");
    setVisibleTopLevelReplies((visible) => Math.max(visible, totalTopLevelReplies + 1));
    setPostedReplyId(replyId);
  }, [totalTopLevelReplies]);

  useEffect(() => {
    if (!postedReplyId || !mergedReplies.some((reply) => reply.id === postedReplyId)) return;
    const frame = requestAnimationFrame(() => {
      const element = document.querySelector(`[data-post-id="${postedReplyId}"]`) as HTMLElement | null;
      if (!element) return;
      element.scrollIntoView({ behavior: "smooth", block: "center" });
      element.animate(
        [
          { boxShadow: "0 0 0 4px rgba(0, 35, 121, 0.28)" },
          { boxShadow: "0 0 0 0 rgba(0, 35, 121, 0)" },
        ],
        { duration: 1800, easing: "ease-out" },
      );
      setPostedReplyId(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [postedReplyId, mergedReplies]);

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

  // T5/WS5b: the first and last cluster member ACTUALLY RENDERED (top-level order
  // sliced to the visible window) bound the reply cluster block. renderPost tags
  // each member with a horizontal top rule (on the first) and bottom rule (on the
  // last) so the block reads as one delimited unit, mirroring the aside.
  const { clusterFirstId, clusterLastId } = useMemo(() => {
    if (!replyCluster || !topLevelOrder || !clusterMemberIds) {
      return { clusterFirstId: null as string | null, clusterLastId: null as string | null };
    }
    const visibleMembers = topLevelOrder
      .slice(0, visibleTopLevelReplies)
      .filter((rid) => clusterMemberIds.has(rid));
    return {
      clusterFirstId: visibleMembers[0] ?? null,
      clusterLastId: visibleMembers[visibleMembers.length - 1] ?? null,
    };
  }, [replyCluster, topLevelOrder, clusterMemberIds, visibleTopLevelReplies]);

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
  // Bottom viewport-Y of the pinned focus-post bar while shown (null otherwise).
  // Drives the reply composer to stick right beneath the collapsed post so the
  // comment bar stays visible for the whole scroll, mirroring the post itself.
  const [composerStickyTop, setComposerStickyTop] = useState<number | null>(null);
  // Whether the reply box holds a draft (reported by ReplySection). The composer
  // only earns its sticky pinning while the user is actually writing — an empty
  // composer scrolls away with the page like any other element.
  const [composerDraftActive, setComposerDraftActive] = useState(false);
  const handleReplySpanClick = useCallback(
    (replyId: string, rangeIndex: number) => {
      if (!flags.replyReranking) return;
      const rels = replyRelationsById.get(replyId) ?? [];
      // Topic key computed at the click site (the store can't derive it).
      const clickTopicKey = topicKeyOf(rels[rangeIndex]);
      const el = document.querySelector(`[data-post-id="${replyId}"]`) as HTMLElement | null;
      replyPinRef.current = el ? { id: replyId, top: el.getBoundingClientRect().top } : null;

      const active = replyGroupingInteraction;
      const isSameSpan =
        active !== null &&
        active.anchor.postId === replyId &&
        active.anchor.rangeIndex === rangeIndex;
      if (isSameSpan) {
        // Re-clicking the active span clears the interaction — BOTH panes reset
        // (clearTopicInteraction is the single primitive now: the reply cluster
        // dissolves here and the aside's "Filtered by" chip clears with it).
        // WS6: undoable — record the pre-clear snapshot first (null: reply
        // clustering doesn't rebase the aside base order).
        const scope = currentPanelScope();
        if (scope) beginPanelInteraction(scope, null);
        clearTopicInteraction();
        return;
      }
      // Topicless span → cannot start a topic interaction (grouping and the
      // cross-pane filter must key identically). Leave state as-is.
      if (clickTopicKey === null) return;
      // R-REORDER-9 parity with the aside: re-picking the ALREADY-GROUPED topic
      // from a different span is a no-op — the block must not jump anchors. Only
      // the active anchor span toggles the group off (handled above).
      if (active !== null && clickTopicKey === replyGroupTopic) return;
      // Convert to the shared primitive: a reply-origin topic interaction
      // CLUSTERS this reply list (replyGrouping) and, under crossPaneFiltering,
      // FILTERS the aside to the same topic (asideTopicFilter, consumed in T4).
      // Replaces any active aside grouping (replace-not-stack, in the store).
      // WS6: undoable — snapshot the prior view before the mutation.
      const scope = currentPanelScope();
      if (scope) beginPanelInteraction(scope, null);
      activateReplyTopic({ topicKey: clickTopicKey, anchor: { postId: replyId, rangeIndex } });
    },
    [flags.replyReranking, replyRelationsById, replyGroupingInteraction, replyGroupTopic]
  );

  useLayoutEffect(() => {
    const pin = replyPinRef.current;
    replyPinRef.current = null;
    if (!pin) return;
    const el = document.querySelector(`[data-post-id="${pin.id}"]`) as HTMLElement | null;
    if (!el) return;
    const delta = el.getBoundingClientRect().top - pin.top;
    if (Math.abs(delta) > 0.5) window.scrollTo(0, Math.max(0, window.scrollY + delta));
  }, [topicInteraction]);

  // ── X-style click-to-focus: arrival pin + fade (WS3/T2) ──────────────────
  // When we land here from a reply/ancestor click, an animate-intent keyed to
  // this focus id is waiting in sessionStorage. Consume it (single-fire), pin
  // the focus wrapper just under the nav — OVERRIDING the route's normal scroll
  // position for this one navigation — and play a brief rise+fade. A deep link,
  // browser Back, or any other load has no matching intent, so it neither pins
  // nor animates and keeps the browser's default scroll behaviour.
  const [focusEnter, setFocusEnter] = useState<"idle" | "from" | "to">("idle");
  const animatedForIdRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!post) return;
    if (animatedForIdRef.current === id) return;
    let intent: { postId?: string } | null = null;
    try {
      const raw = sessionStorage.getItem(ANIMATE_INTENT_KEY);
      if (raw) intent = JSON.parse(raw);
    } catch {
      intent = null;
    }
    if (!intent || intent.postId !== id) return;
    // Consume so it fires exactly once (and never on a later Back to this id).
    sessionStorage.removeItem(ANIMATE_INTENT_KEY);
    animatedForIdRef.current = id;
    const anchor = focusWrapRef.current;
    if (!anchor) return;
    // Pin the focus post under the nav (scroll-compensation pattern, mirrors the
    // reply-pin useLayoutEffect above): translate the wrapper's current viewport
    // top to FOCUS_PIN_OFFSET, so ancestors sit above and replies below.
    const y = window.scrollY + anchor.getBoundingClientRect().top - FOCUS_PIN_OFFSET;
    window.scrollTo(0, Math.max(0, y));
    // Start from the pre-fade state; the effect below flips to "to" one frame
    // later so the CSS transition actually runs.
    setFocusEnter("from");
  }, [post, id]);

  // Flip to the resting state after the "from" frame has painted so the fade
  // transition plays (useEffect fires post-paint; the rAF adds a safety frame).
  useEffect(() => {
    if (focusEnter !== "from") return;
    const raf = requestAnimationFrame(() => setFocusEnter("to"));
    return () => cancelAnimationFrame(raf);
  }, [focusEnter]);

  // Keep the active tab inside whichever tab set the flag selects. Depends on
  // activeTab too, so a foreign tab arriving AFTER a flag change (URL
  // hydration of a stale cross-condition link — audit F-1) degrades to the
  // active set's default instead of selecting a tab with no panel.
  useEffect(() => {
    const coerced = coerceTab(activeTab, flags.replySortTabs);
    if (coerced !== activeTab) setActiveTab(coerced);
  }, [flags.replySortTabs, activeTab]);

  // -------------------- Load mock + local study data --------------------
  useEffect(() => {
    const mockPost = getMockPost(id);
    const p = mockPost
      ? {
          ...mockPost,
          replies_count: resolveReplyCount(
            getMockReplyCount(id),
            userComments.length,
          ),
        }
      : (storePost as unknown as MockPostType | undefined) ?? null;
    if (!p) {
      setPost(null);
      return;
    }
    setPost(p);
    const isMockPost = !!mockPost;
    const threadAncestors = isMockPost
      ? getMockAncestors(id)
      : getStoreAncestors(id, localState.posts);
    const threadReplies = isMockPost
      ? getMockReplies(id)
      : getStoreReplies(id, localState.posts);
    setAncestors(threadAncestors);
    setReplies(threadReplies);
    setRecommendedPosts(isMockPost ? getMockRecommended(id) : []);
    setFocusRelations(isMockPost ? getMockFocusRelations(id) : []);
    {
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
  }, [id, flags.suppressThreadPosts, storePost, localState.posts, hydrated, userComments.length]);

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
    if (!value) return;
    beginUndoablePanelInteractionIfDetail(id);
    // Explicit re-sort: the user asked for a fresh ordering, so the permanent
    // cluster arrangement yields (permanence rule's one escape hatch besides
    // Back-undo). With a cluster still active, the write-through effect
    // re-persists its arrangement over the fresh sort on the next render.
    setReplyBaseOrder([]);
    setActiveTab(value);
  };

  // Stack icons are hidden on the focused view; related stacks live in the aside.
  const renderPost = (p: MockPostType, isFocusPost: boolean = false) => {
    // Replies (incl. dual-role related posts) get contribution spans + badges;
    // the focus post keeps its grey marks; ancestors stay passive by design.
    const showReplyContributions =
      !isFocusPost && flags.replyContributions && replyRelationsById.has(p.id);
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
      initialCard={p.card ?? null}
      quotedPost={p.quotedPost ?? null}
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
        // WS3/T2: stash the arrival animation intent BEFORE navigating so the
        // destination pins this clicked post to the top and plays the fade
        // (X-style click-to-focus). Keyed by the destination id — a stale intent
        // never animates an unrelated load. The clicked card's current viewport
        // top is recorded for potential from-anchored motion (the fade itself is
        // a fixed rise; the top keeps the intent self-describing).
        try {
          const clicked = document.querySelector(`[data-post-id="${pid}"]`) as HTMLElement | null;
          sessionStorage.setItem(
            ANIMATE_INTENT_KEY,
            JSON.stringify({ postId: pid, top: clicked ? clicked.getBoundingClientRect().top : null })
          );
        } catch {
          /* sessionStorage unavailable — fall back to a normal (unanimated) nav */
        }
        // WS6: route through navigateFromPanelScope so a stranded undo sentinel is
        // collapsed (replace OVER it when it is the current entry, else push) —
        // Back from the destination returns here without a phantom extra Back.
        navigateFromPanelScope(`/ChineseEVs/posts/${pid}`, router);
      }}
    />
    );
    // Reply-cluster members render inside a connected rounded bracket, but that
    // bracket now lives in ThreadedReplyList (the clusterRail prop on the list
    // below), applied at the BRANCH level so the rail wraps each member's whole
    // subtree — post + its "Show N more" expander + any expanded children — and
    // never breaks at the expander. renderPost just returns the bare post.
    return postEl;
  };

  if (!mockHasPost(id) && !storePost) {
    if (!hydrated) return <Loader size="lg" />;
    return (
      <Paper withBorder radius="md" mt={20} p="lg">
        <Text size="sm">
          Post <code>{id}</code> was not found in this study session.
        </Text>
        <Text size="xs" c="dimmed" mt="xs">
          It may have been removed or created in a different participant session. Head back to the{" "}
          <Anchor component={Link} href="/ChineseEVs" size="xs">
            #AIWorkforce discussion
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
          onStickyChange={setComposerStickyTop}
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

          {/* Focus post — WS3/T2 arrival fade: on a click-to-focus nav the
              wrapper rises from FOCUS_ENTER_TRANSLATE px + FOCUS_ENTER_OPACITY
              to its resting spot. "from"/"to" are only set when the animate
              intent fired; "idle" leaves it untouched for normal loads. */}
          <div
            style={{
              position: "relative",
              transform:
                focusEnter === "from"
                  ? `translateY(${FOCUS_ENTER_TRANSLATE}px)`
                  : "translateY(0)",
              opacity: focusEnter === "from" ? FOCUS_ENTER_OPACITY : 1,
              transition: focusEnter === "to" ? FOCUS_ENTER_TRANSITION : undefined,
              willChange: focusEnter === "idle" ? undefined : "transform, opacity",
            }}
            ref={focusWrapRef}
          >
            {renderPost(post, /* isFocusPost */ true)}
          </div>
        </div>

        <Divider my="md" />

        {showThread && (
          // While the focus post is collapsed into the pinned bar AND the user is
          // mid-draft, keep the reply composer visible by sticking it directly
          // beneath that bar (top = reported bar-bottom). Sticky keeps the
          // composer in flow, so the reply list below never jumps; replies just
          // scroll under the pinned composer. An empty composer never pins —
          // it renders inline and scrolls away like the rest of the thread.
          <div
            style={
              composerStickyTop != null && composerDraftActive
                ? {
                    position: "sticky",
                    top: composerStickyTop,
                    zIndex: 140,
                    background: "#ffffff",
                    border: "1px solid #dbe2ea",
                    borderTop: "none",
                    borderRadius: "0 0 10px 10px",
                    boxShadow: "0 6px 16px rgba(0,0,0,0.08)",
                    padding: "10px 14px",
                  }
                : undefined
            }
          >
            <ReplySection
              postId={id}
              currentUser={currentUser}
              fetchPostAndReplies={() => {}}
              onReplyPosted={handleReplyPosted}
              onDraftActiveChange={setComposerDraftActive}
              stickyMode={composerStickyTop != null && composerDraftActive}
            />
          </div>
        )}

        {/* Visible filter state for the replies list — cross-pane filters only
            act when they are worn by the list they hide posts from. */}
        {showThread && crossFilterActive && (
          <ReplyFilterBar
            filterCategories={filterCategories}
            responseFilter={responseFilter}
            topicFilter={activeReplyTopicFilter}
            shown={displayedTotal}
            total={totalTopLevelReplies}
            onRemoveCategory={(cat) => {
              // WS6: a chip REMOVE is an undoable filter action — snapshot before
              // the mutation so Back re-adds the removed category.
              beginUndoablePanelInteractionIfDetail(id);
              const next = new Set(filterCategories);
              next.delete(cat);
              setFilterCategories(next);
            }}
            onClearResponse={() => {
              beginUndoablePanelInteractionIfDetail(id);
              clearResponseFilter();
            }}
            onClearTopic={() => {
              beginUndoablePanelInteractionIfDetail(id);
              clearTopicInteraction();
            }}
            onClearAll={() => {
              // One snapshot before clearing every dimension → one undo step
              // restores category + passage + topic together.
              beginUndoablePanelInteractionIfDetail(id);
              setFilterCategories(new Set());
              clearResponseFilter();
              clearTopicInteraction();
            }}
          />
        )}

        {showThread && mergedReplies.length > 0 && flags.replySortTabs && (
          <Paper
            style={{
              // Transparent so the bright-white application canvas shows
              // through around the white reply cards, matching the aside pane —
              // the left column read as a solid white block before.
              backgroundColor: "transparent",
              borderRadius: "0 0 8px 8px",
              fontFamily: "Roboto, sans-serif",
              fontSize: 14,
              marginTop: "1rem",
              width: "100%",
            }}
          >
            {/* T4: the top-of-thread "Replies grouped by:" pill is removed — reply
                grouping (legacy, local) is shown by the inline cluster rail only.
                T7 owns the shared "Filtered by" chip for reply-origin topics. */}

            {/* Tabs are suppressed for small threads (<=5 top-level replies):
                with a handful of comments a sort control is noise — show the
                thread newest-first, as a traditional interface would. */}
            {totalTopLevelReplies > 5 && (
              <Tabs color="#45a99e" value={activeTab} onChange={handleTabChange}>
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
              forceRevealParentIds={forceRevealParentIds}
              clusterRail={
                replyCluster && replyClusterColor
                  ? {
                      memberIds: clusterMemberIds ?? new Set<string>(),
                      firstId: clusterFirstId,
                      lastId: clusterLastId,
                      color: replyClusterColor,
                      topic: replyCluster.topic,
                      count: clusterMemberIds ? clusterMemberIds.size : 0,
                      onDismiss: clearTopicInteraction,
                    }
                  : undefined
              }
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
              backgroundColor: "transparent",
              borderRadius: "0 0 8px 8px",
              fontFamily: "Roboto, sans-serif",
              fontSize: 14,
              marginTop: "1rem",
              width: "100%",
            }}
          >
            <Tabs color="#45a99e" defaultValue="time" value={activeTab} onChange={handleTabChange}>
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

      </div>
    </div>
  );
}
