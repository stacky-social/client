"use client";

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import {
  Avatar,
  Button,
  Divider,
  Group,
  Loader,
  Modal,
  Paper,
  Tabs,
  Text,
  UnstyledButton,
} from "@mantine/core";
import { AnimatePresence, motion } from "framer-motion";
import {
  IconBookmark,
  IconBookmarkFilled,
  IconHeart,
  IconHeartFilled,
  IconLink,
  IconMessageCircle,
} from "@tabler/icons-react";

import Post from "../../../../components/Posts/Post";
import StackCount from "../../../../components/StackCount";
import RelatedStacks from "../../../../components/RelatedStacks";
import RepliesStack from "../../../../components/RepliesStack";
import ReplySection from "../../../../components/ReplySection";

// -------------------- Types --------------------
interface Account {
  username: string;
  acc: string;
  avatar: string;
}

interface PostType {
  id: string;
  content: string;
  account: Account;
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

const MastodonInstanceUrl = "https://beta.stacky.social";

// -------------------- Helpers --------------------
const withAuth = () => {
  const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
  if (!token) throw new Error("Access token is missing.");
  return { headers: { Authorization: `Bearer ${token}` } } as const;
};

const mapWithStackFields = <T extends object>(x: T) => ({
  ...(x as any),
  relatedStacks: [],
  stackCount: null,
});

// -------------------- Component --------------------
export default function PostView({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { id } = params;

  // Data
  const [post, setPost] = useState<PostType | null>(null);
  const [replies, setReplies] = useState<PostType[]>([]);
  const [ancestors, setAncestors] = useState<PostType[]>([]);
  const [currentUser, setCurrentUser] = useState<any | null>(null);
  const [focusRelatedStacks, setFocusRelatedStacks] = useState<any[]>([]);
  const [size, setSize] = useState(0);

  // UI state
  const [loading, setLoading] = useState(true);
  const [modalOpened, setModalOpened] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("time");
  const [visibleReplies, setVisibleReplies] = useState(15);
  const [recommendedLoading, setRecommendedLoading] = useState(false);
  const [recommendedPosts, setRecommendedPosts] = useState<PostType[]>([]);
  const [loadingRepliesStack, setLoadingRepliesStack] = useState(false);
  const [repliesStack, setRepliesStack] = useState<any[]>([]);
  const [summary, setSummary] = useState<string | null>(null);
  const [liked, setLiked] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);

  // Layout/positioning
  const currentPostRef = useRef<HTMLDivElement>(null);
  const [isExpanded, setIsExpanded] = useState(true);
  const [showFocusRelatedStacks, setShowFocusRelatedStacks] = useState(true);
  const [activePostId, setActivePostId] = useState<string | null>(null);
  const [postPosition, setPostPosition] = useState<{ top: number; height: number } | null>(null);
  const [focusPostPosition, setFocusPostPosition] = useState<{ top: number; height: number } | null>(null);

  // -------------------- Derived values --------------------
  const filteredReplies = useMemo(() => replies.filter((r) => r.in_reply_to_id === id), [replies, id]);
  const replyIDs = useMemo(() => filteredReplies.map((r) => r.id), [filteredReplies]);

  // -------------------- Position helpers --------------------
  const readRectOf = (el: HTMLElement | null) => {
    if (!el) return { top: 0, height: 0 };
    const { top, height } = el.getBoundingClientRect();
    return { top: top + window.scrollY, height };
  };

  const updateFocusPostPosition = useCallback(() => {
    setFocusPostPosition(readRectOf(currentPostRef.current));
  }, []);

  // -------------------- Fetchers --------------------
  const fetchCurrentUser = useCallback(async () => {
    try {
      const res = await axios.get(`${MastodonInstanceUrl}/api/v1/accounts/verify_credentials`, withAuth());
      setCurrentUser(res.data);
    } catch (e) {
      console.error("Failed to fetch current user:", e);
    }
  }, []);

  const fetchPost = useCallback(
    async (postId: string) => {
      try {
        const { data } = await axios.get(`${MastodonInstanceUrl}/api/v1/statuses/${postId}`, withAuth());
        const enriched: PostType = { ...data, relatedStacks: focusRelatedStacks, stackCount: null };
        setPost(enriched);
        setLiked(data.favourited);
        setBookmarked(data.bookmarked);
        setLikeCount(data.favourites_count);
      } catch (e) {
        console.error("Failed to fetch post:", e);
      }
    },
    [focusRelatedStacks]
  );

  const fetchContext = useCallback(async (postId: string) => {
    try {
      const { data } = await axios.get(`${MastodonInstanceUrl}/api/v1/statuses/${postId}/context`, withAuth());
      setReplies(data.descendants.map(mapWithStackFields));
      setAncestors(data.ancestors.map(mapWithStackFields));
    } catch (e) {
      console.error("Failed to fetch context:", e);
    }
  }, []);

  const fetchFocusRelatedStacks = useCallback(async () => {
    try {
      const { data } = await axios.get(`${MastodonInstanceUrl}:3002/stacks/${id}/related`, withAuth());
      setFocusRelatedStacks(data.relatedStacks || []);
      setSize(data.size);
    } catch (e) {
      console.error("Error fetching related stacks from API:", e);
    }
  }, [id]);

  const fetchRelatedStacksFor = useCallback(async (p: PostType) => {
    try {
      const { data } = await axios.get(`${MastodonInstanceUrl}:3002/stacks/${p.id}/related`, withAuth());
      const stackData = data.relatedStacks || [];
      const stackCount = data.size;

      setPost((prev) => (prev && prev.id === p.id ? { ...prev, relatedStacks: stackData, stackCount } : prev));
      setReplies((prev) => prev.map((x) => (x.id === p.id ? { ...x, relatedStacks: stackData, stackCount } : x)));
      setAncestors((prev) => prev.map((x) => (x.id === p.id ? { ...x, relatedStacks: stackData, stackCount } : x)));
      setRecommendedPosts((prev) => prev.map((x) => (x.id === p.id ? { ...x, relatedStacks: stackData, stackCount } : x)));
    } catch (e) {
      console.error(`Error fetching stack data for post ${p.id}:`, e);
    }
  }, []);

  const fetchRecommended = useCallback(async () => {
    setRecommendedLoading(true);
    try {
      const { data } = await axios.post(
        `${MastodonInstanceUrl}:3002/replies/${id}/list`,
        { immediateReplyIDs: replyIDs },
        withAuth()
      );
      const formatted: PostType[] = data.map(mapWithStackFields);
      setRecommendedPosts(formatted);
      formatted.forEach(fetchRelatedStacksFor);
    } catch (e) {
      console.error("Failed to fetch recommended posts:", e);
    } finally {
      setRecommendedLoading(false);
    }
  }, [fetchRelatedStacksFor, id, replyIDs]);

  const fetchRepliesStack = useCallback(async () => {
    setLoadingRepliesStack(true);
    try {
      const { data } = await axios.post(
        `${MastodonInstanceUrl}:3002/replies/${id}/stacks?no_cache=false`,
        { immediateReplyIDs: replyIDs },
        withAuth()
      );
      setRepliesStack(data);
    } catch (e) {
      console.error("Error fetching replies stack:", e);
    } finally {
      setLoadingRepliesStack(false);
    }
  }, [id, replyIDs]);

  const fetchSummary = useCallback(async () => {
    try {
      const { data } = await axios.post(
        `${MastodonInstanceUrl}:3002/replies/${id}/summary`,
        { immediateReplyIDs: replyIDs },
        withAuth()
      );
      setSummary(data.summary);
    } catch (e) {
      console.error("Failed to fetch summary:", e);
    }
  }, [id, replyIDs]);

  // -------------------- Effects --------------------
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      try {
        await Promise.all([fetchCurrentUser(), fetchFocusRelatedStacks(), fetchPost(id), fetchContext(id)]);
      } finally {
        setLoading(false);
        updateFocusPostPosition();
      }
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    [...replies, ...ancestors].forEach(fetchRelatedStacksFor);
  }, [replies, ancestors, fetchRelatedStacksFor]);

  useEffect(() => {
    updateFocusPostPosition();
    const onResize = () => updateFocusPostPosition();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [updateFocusPostPosition]);

  // -------------------- Handlers --------------------
  const handleNavigate = (replyId: string) => router.push(`/posts/${replyId}`);

  const handleLike = async () => {
    try {
      if (liked) {
        await axios.post(`${MastodonInstanceUrl}/api/v1/statuses/${id}/unfavourite`, {}, withAuth());
      } else {
        await axios.post(`${MastodonInstanceUrl}/api/v1/statuses/${id}/favourite`, {}, withAuth());
      }
      await Promise.all([fetchPost(id), fetchContext(id)]);
    } catch (e) {
      console.error("Error liking post:", e);
    }
  };

  const handleSave = async () => {
    try {
      if (bookmarked) {
        await axios.post(`${MastodonInstanceUrl}/api/v1/statuses/${id}/unbookmark`, {}, withAuth());
      } else {
        await axios.post(`${MastodonInstanceUrl}/api/v1/statuses/${id}/bookmark`, {}, withAuth());
      }
      await Promise.all([fetchPost(id), fetchContext(id)]);
    } catch (e) {
      console.error("Error bookmarking post:", e);
    }
  };

  const handleCopyLink = () => {
    const url = `${window.location.origin}/posts/${id}`;
    navigator.clipboard.writeText(url).catch((e) => console.error("Copy failed:", e));
  };

  const handleStackIconClick = (
    relatedStacks: any[],
    postId: string,
    position: { top: number; height: number }
  ) => {
    setIsExpanded(false);
    setShowFocusRelatedStacks(false);
    setActivePostId(postId);
    setPostPosition(position);
  };

  const handleFocusPostClick = () => {
    setIsExpanded(true);
    setShowFocusRelatedStacks(true);
    updateFocusPostPosition();
    setActivePostId(null);
  };

  const handleShowMoreReplies = () => setVisibleReplies((v) => Math.min(v + 15, filteredReplies.length));

  const handleTabChange = async (value: string | null) => {
    if (!value) return;
    setActiveTab(value);
    if (value === "recommended") await fetchRecommended();
    if (value === "stacked") await fetchRepliesStack();
    if (value === "summary") await fetchSummary();
  };

  // -------------------- Render helpers --------------------
  const renderPost = (p: PostType) => (
    <Post
      key={p.id}
      id={p.id}
      text={p.content}
      author={p.account.username}
      account={p.account.acc}
      avatar={p.account.avatar}
      repliesCount={p.replies_count}
      createdAt={p.created_at}
      stackCount={p.stackCount}
      favouritesCount={p.favourites_count}
      favourited={p.favourited}
      bookmarked={p.bookmarked}
      mediaAttachments={[]}
      onStackIconClick={handleStackIconClick}
      setIsModalOpen={() => {}}
      setIsExpandModalOpen={() => {}}
      relatedStacks={p.relatedStacks}
      setActivePostId={setActivePostId}
      activePostId={activePostId}
    />
  );

  if (!post && !loading) {
    return (
      <Paper withBorder radius="md" mt={20} p="lg">
        <Text size="sm">Post not found.</Text>
      </Paper>
    );
  }

  return (
    <div>
      <Modal opened={modalOpened} onClose={() => setModalOpened(false)} title="Expand Content" centered size="auto" />

      <div>
        <div style={{ gridColumn: "1 / 2", position: "relative" }}>
          {/* Ancestors */}
          {ancestors.map((a) => (
            <div key={a.id} style={{ position: "relative", marginBottom: "1rem", marginLeft: 40 }}>
              {renderPost(a)}
              <div
                style={{
                  position: "absolute",
                  left: "10%",
                  bottom: -48,
                  width: 2,
                  height: 48,
                  backgroundColor: "#545454",
                  transform: "translateX(-50%)",
                  zIndex: 0,
                }}
              />
            </div>
          ))}

          {/* Current Post */}
          <div ref={currentPostRef} style={{ position: "relative" }}>
            {post && (
              <Post
                key={post.id}
                id={post.id}
                text={post.content}
                author={post.account.username}
                account={post.account.acc}
                avatar={post.account.avatar}
                repliesCount={post.replies_count}
                createdAt={post.created_at}
                stackCount={size}
                favouritesCount={post.favourites_count}
                favourited={post.favourited}
                bookmarked={post.bookmarked}
                mediaAttachments={[]}
                onStackIconClick={handleStackIconClick}
                setIsModalOpen={() => {}}
                setIsExpandModalOpen={() => {}}
                relatedStacks={focusRelatedStacks}
                setActivePostId={setActivePostId}
                activePostId={activePostId}
              />
            )}
          </div>
          </div>

          <Divider my="md" />

          <ReplySection postId={id} currentUser={currentUser} fetchPostAndReplies={() => fetchContext(id)} />

          {replies.length > 0 && (
            <Paper
              style={{
                borderRadius: "0 0 8px 8px",
                fontFamily: "Roboto, sans-serif",
                fontSize: 14,
                marginTop: "1rem",
                width: "100%",
              }}
            >
              {/* Horizontal tabs at the top */}
              <Tabs color="#002379" defaultValue="time" value={activeTab} onChange={handleTabChange}>
                <Tabs.List style={{ marginBottom: "1rem" }}>
                  <Tabs.Tab value="time" style={{ fontWeight: activeTab === "time" ? "bold" : "normal" }}>
                    Time
                  </Tabs.Tab>
                  <Tabs.Tab value="recommended" style={{ fontWeight: activeTab === "recommended" ? "bold" : "normal" }}>
                    Recommended
                  </Tabs.Tab>
                  <Tabs.Tab value="stacked" style={{ fontWeight: activeTab === "stacked" ? "bold" : "normal" }}>
                    Stacked
                  </Tabs.Tab>
                  <Tabs.Tab value="summary" style={{ fontWeight: activeTab === "summary" ? "bold" : "normal" }}>
                    Summary
                  </Tabs.Tab>
                </Tabs.List>

                <Tabs.Panel value="time">
                  <>
                    {filteredReplies.slice(0, visibleReplies).map(renderPost)}
                    {visibleReplies < filteredReplies.length && (
                      <Button onClick={handleShowMoreReplies} variant="outline" fullWidth style={{ marginTop: 10 }}>
                        More Replies
                      </Button>
                    )}
                  </>
                </Tabs.Panel>

                <Tabs.Panel value="recommended">
                  <div style={{ textAlign: "center" }}>
                    {recommendedLoading ? <Loader size="lg" /> : recommendedPosts.map(renderPost)}
                  </div>
                </Tabs.Panel>

                <Tabs.Panel value="stacked">
                  <div style={{ textAlign: "center" }}>
                    {loadingRepliesStack ? (
                      <Loader size="lg" />
                    ) : (
                      <RepliesStack
                        repliesStacks={repliesStack}
                        cardWidth={450}
                        onStackClick={() => {}}
                        showupdate={true}
                      />
                    )}
                  </div>
                </Tabs.Panel>

                <Tabs.Panel value="summary">
                  <div style={{ padding: "1rem", fontSize: "1.1rem" }}>{summary}</div>
                </Tabs.Panel>
              </Tabs>
            </Paper>
          )}

          <div style={{ height: "100vh" }} />
        </div>

        {/* Right rail related stacks */}
        <div style={{ gridColumn: "2 / 3", marginTop: 0 }}>
          <div style={{ position: "relative" }}>
            {showFocusRelatedStacks && focusRelatedStacks.length > 0 && (
              <AnimatePresence>
                {focusPostPosition && (
                  <motion.div
                    style={{ position: "absolute", top: focusPostPosition.top - 34, left: 20, zIndex: 10 }}
                    initial={{ opacity: 0, x: -200 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -200 }}
                    transition={{ duration: 0.2 }}
                  >
                    <RelatedStacks
                      relatedStacks={focusRelatedStacks}
                      cardWidth={450}
                      onStackClick={() => {}}
                      showupdate={true}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            )}

            <AnimatePresence>
              {!showFocusRelatedStacks && postPosition && (
                <motion.div
                  style={{ position: "absolute", top: postPosition.top - 32, left: 20, zIndex: 10 }}
                  initial={{ opacity: 0, x: -200 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -200 }}
                  transition={{ duration: 0.2 }}
                >
                  <RelatedStacks
                    relatedStacks={post?.relatedStacks || []}
                    cardWidth={450}
                    onStackClick={() => {}}
                    showupdate={true}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
  );
}
