"use client";

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Divider, Loader, Paper, Tabs, Text } from "@mantine/core";
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
import { getMockReplyRank } from "../../../../../utils/mockPostResolver";
import ReplySummaryCard from "../../../../../components/ReplySummaryCard";

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
  const { setFromPost } = useRelatedStacks();
  const flags = useExperimentFlags();

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
  const topLevelOrder = useMemo(() => {
    if (!flags.replySortTabs) return undefined;
    const mode = activeTab === "top" || activeTab === "liked" ? activeTab : "time";
    return sortReplies(filteredReplies, mode, sortOpts).map((r: MockPostType) => r.id);
  }, [flags.replySortTabs, activeTab, filteredReplies, sortOpts]);

  // Keep the active tab valid for whichever tab set the flag selects.
  useEffect(() => {
    if (flags.replySortTabs) {
      if (activeTab === "recommended" || activeTab === "stacked" || activeTab === "summary") {
        setActiveTab("top");
      }
    } else if (activeTab === "top" || activeTab === "liked") {
      setActiveTab("time");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flags.replySortTabs]);

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
    defaultTab: flags.replySortTabs ? "top" : "time",
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
    return (
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
      focusRelations={isFocusPost ? focusRelations : []}
      contentRelations={showReplyContributions ? replyRelationsById.get(p.id) : undefined}
      categoryBadges={showReplyContributions ? replyBadgesById.get(p.id) : undefined}
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
  };

  if (!mockHasPost(id)) {
    return (
      <Paper withBorder radius="md" mt={20} p="lg">
        <Text size="sm">
          Post <code>{id}</code> not found in mock data.
        </Text>
        <Text size="xs" c="dimmed" mt="xs">
          This route is the mock-backed mirror of <code>/posts/[id]</code> for H/G verification.
          Try a post id that exists in <code>FakeData/listy-injection.json</code>.
        </Text>
      </Paper>
    );
  }

  if (!post) return <Loader size="lg" />;

  return (
    <div style={{ position: "relative" }}>
      <BackButton />
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
          <div style={{ position: "relative" }}>
            {renderPost(post, /* isFocusPost */ true)}
          </div>
        </div>

        <Divider my="md" />

        {showThread && <ReplySection postId={id} currentUser={currentUser} fetchPostAndReplies={() => {}} />}

        {/* Summary follows the same small-thread suppression as the sort tabs:
            with a handful of replies, a digest is noise (Jason's <=5 rule). */}
        {showThread && flags.summaryCard && totalTopLevelReplies > 5 && filteredReplies.length > 0 && (
          <div style={{ marginTop: "1rem" }}>
            <ReplySummaryCard replies={filteredReplies as any} relationsOf={relationsOfReply} />
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
