"use client";

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Divider, Loader, Paper, Tabs, Text } from "@mantine/core";
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
  getMockPlainText,
  mockHasPost,
  type MockPostType,
} from "../../../../../utils/mockPostResolver";
import type { Relation } from "../../../../../types/PostType";
import { getCurrentUser } from "../../../../../utils/getCurrentUser";

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

  const [post, setPost] = useState<MockPostType | null>(null);
  const [ancestors, setAncestors] = useState<MockPostType[]>([]);
  const [replies, setReplies] = useState<MockPostType[]>([]);
  const [recommendedPosts, setRecommendedPosts] = useState<MockPostType[]>([]);
  const [focusRelations, setFocusRelations] = useState<Relation[]>([]);
  const [activeTab, setActiveTab] = useState<string>("time");
  const [visibleTopLevelReplies, setVisibleTopLevelReplies] = useState(5);
  const [activePostId, setActivePostId] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<any | null>(null);
  // Defer the (potentially large) reply thread one task so the focus post +
  // ancestors paint immediately and the heavy thread render doesn't block the
  // main thread as one giant synchronous task (fixes slow nav + the freeze).
  const [showThread, setShowThread] = useState(false);

  const plainPostText = post ? stripHtmlToPlain(post.content) : null;

  const filteredReplies = useMemo(() => replies.filter((r) => r.in_reply_to_id === id), [replies, id]);
  const totalTopLevelReplies = filteredReplies.length;

  // -------------------- Load mock data --------------------
  useEffect(() => {
    if (!mockHasPost(id)) {
      setPost(null);
      return;
    }
    const p = getMockPost(id);
    setPost(p);
    setAncestors(getMockAncestors(id));
    setReplies(getMockReplies(id));
    setRecommendedPosts(getMockRecommended(id));
    setFocusRelations(getMockFocusRelations(id));
    if (p) {
      setFromPost(p.relatedStacks, id, { force: true });
      setActivePostId(id);
    }
    // Read currentUser from localStorage if present (ReplySection wants it; mock allows null).
    const user = getCurrentUser();
    if (user) setCurrentUser(user);
  }, [id]);

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
  });

  // H5: seed BackButton sessionStorage from ?from= when opening a shared link
  useEffect(() => {
    const fromId = searchParamsObj?.get("from");
    if (!fromId) return;
    const key = `previousPath:${window.location.pathname}`;
    if (!sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, `/listy-injection/posts/${fromId}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleTabChange = (value: string | null) => {
    if (value) setActiveTab(value);
  };

  // Stack icons are hidden on the focused view; related stacks live in the aside.
  const renderPost = (p: MockPostType, isFocusPost: boolean = false) => (
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
      clampLines={10}
    />
  );

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

        {showThread && replies.length > 0 && (
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
                  replies={replies as any}
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
