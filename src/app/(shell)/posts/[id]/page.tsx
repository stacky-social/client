"use client";

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { Button, Divider, Loader, Paper, Tabs, Text } from "@mantine/core";
import { AnimatePresence, motion } from "framer-motion";

import Post from "../../../../components/Posts/Post";
import RelatedStacks from "../../../../components/RelatedStacks";
import RepliesStack from "../../../../components/RepliesStack";
import ReplySection from "../../../../components/ReplySection";
import { useRelatedStacks } from "../../related-stacks-context";

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

// UI constants (avoid magic numbers sprinkled throughout)
const CONNECTOR_STYLE = {
  position: "absolute" as const,
  left: "10%",
  bottom: -48,
  width: 2,
  height: 48,
  backgroundColor: "#545454",
  transform: "translateX(-50%)",
  zIndex: 0,
};

// -------------------- Component --------------------
export default function PostView({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { id } = params;
  const { setFromPost, activePostId: asideActivePostId, relatedStacks: asideStacks } = useRelatedStacks();

  // Data
  const [post, setPost] = useState<PostType | null>(null);
  const [replies, setReplies] = useState<PostType[]>([]);
  const [ancestors, setAncestors] = useState<PostType[]>([]);
  const [currentUser, setCurrentUser] = useState<any | null>(null);
  const [focusRelatedStacks, setFocusRelatedStacks] = useState<any[]>([]);
  const [size, setSize] = useState(0);

  // UI state
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>("time");
  const [visibleReplies, setVisibleReplies] = useState(15);
  const [recommendedLoading, setRecommendedLoading] = useState(false);
  const [recommendedPosts, setRecommendedPosts] = useState<PostType[]>([]);
  const [loadingRepliesStack, setLoadingRepliesStack] = useState(false);
  const [repliesStack, setRepliesStack] = useState<any[]>([]);
  const [summary, setSummary] = useState<string | null>(null);

  // Layout/positioning
  const currentPostRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const [showFocusRelatedStacks, setShowFocusRelatedStacks] = useState(true);
  const [activePostId, setActivePostId] = useState<string | null>(null);
  const [postPosition, setPostPosition] = useState<{ top: number; height: number } | null>(null);
  const [focusPostPosition, setFocusPostPosition] = useState<{ top: number; height: number } | null>(null);
  const [containerOffset, setContainerOffset] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  // --- Deduping fetches for related stacks ---
  const fetchedRelatedIds = useRef<Set<string>>(new Set());
  const inFlightRelatedIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    fetchedRelatedIds.current.clear();
    inFlightRelatedIds.current.clear();
  }, [id]);

  // -------------------- Derived values --------------------
  const filteredReplies = useMemo(() => replies.filter((r) => r.in_reply_to_id === id), [replies, id]);
  const repliesByTimeDesc = useMemo(
    () => filteredReplies.slice().sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [filteredReplies]
  );
  const replyIDs = useMemo(() => filteredReplies.map((r) => r.id), [filteredReplies]);

  // Allow quick lookup of any post by id (ancestors, replies, recommended, and the focus post)
  const allPostsById = useMemo(() => {
    const map = new Map<string, PostType>();
    if (post) map.set(post.id, post);
    [...ancestors, ...replies, ...recommendedPosts].forEach((p) => map.set(p.id, p));
    return map;
  }, [post, ancestors, replies, recommendedPosts]);

  // -------------------- Position helpers --------------------
  const readRectOf = (el: HTMLElement | null) => {
    if (!el) return { top: 0, height: 0 };
    const { top, height } = el.getBoundingClientRect();
    return { top: top + window.scrollY, height };
  };

  const updateFocusPostPosition = useCallback(() => {
    setFocusPostPosition(readRectOf(currentPostRef.current));
  }, []);
  const updateContainerOffset = useCallback(() => {
    const rect = mainRef.current?.getBoundingClientRect();
    if (rect) {
      setContainerOffset({ top: rect.top + window.scrollY, left: rect.left + window.scrollX });
    }
  }, []);

  // -------------------- Collection updater --------------------
  const updateCollectionsById = useCallback(
    (targetId: string, updater: (p: PostType) => PostType) => {
      setPost((prev) => (prev && prev.id === targetId ? updater(prev) : prev));
      setReplies((prev) => prev.map((x) => (x.id === targetId ? updater(x) : x)));
      setAncestors((prev) => prev.map((x) => (x.id === targetId ? updater(x) : x)));
      setRecommendedPosts((prev) => prev.map((x) => (x.id === targetId ? updater(x) : x)));
    },
    []
  );

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
        setPost((prev) => ({
          ...data,
          relatedStacks: prev?.relatedStacks?.length ? prev.relatedStacks : focusRelatedStacks,
          stackCount: prev?.stackCount ?? null,
        }));
      } catch (e) {
        console.error("Failed to fetch post:", e);
      }
    },
    [focusRelatedStacks]
  );

  const fetchContext = useCallback(async (postId: string) => {
    try {
      const { data } = await axios.get(`${MastodonInstanceUrl}/api/v1/statuses/${postId}/context`, withAuth());

      setReplies((prev) => {
        const prevMap = new Map(prev.map((p) => [p.id, p]));
        return data.descendants.map((desc: PostType) => {
          const existing = prevMap.get(desc.id);
          const base = mapWithStackFields(desc);
          return existing
            ? { ...base, stackCount: existing.stackCount, relatedStacks: existing.relatedStacks }
            : base;
        });
      });

      setAncestors((prev) => {
        const prevMap = new Map(prev.map((p) => [p.id, p]));
        return data.ancestors.map((ancestor: PostType) => {
          const existing = prevMap.get(ancestor.id);
          const base = mapWithStackFields(ancestor);
          return existing
            ? { ...base, stackCount: existing.stackCount, relatedStacks: existing.relatedStacks }
            : base;
        });
      });
    } catch (e) {
      console.error("Failed to fetch context:", e);
    }
  }, []);

  const fetchFocusRelatedStacks = useCallback(async () => {
    try {
      const { data } = await axios.get(`${MastodonInstanceUrl}:3002/stacks/${id}/related`, withAuth());
      setFocusRelatedStacks(data.relatedStacks || []);
      setSize(data.size);
      // publish to aside when focus stacks load
      setFromPost(data.relatedStacks || [], id, { force: true });
    } catch (e) {
      console.error("Error fetching related stacks from API:", e);
    }
  }, [id]);

  // ---- Guarded per-post related fetch (prevents storms) ----
  const fetchRelatedStacksFor = useCallback(
    async (p: PostType) => {
      const hasData =
        p.stackCount !== null || (Array.isArray(p.relatedStacks) && p.relatedStacks.length > 0);

      if (hasData || fetchedRelatedIds.current.has(p.id) || inFlightRelatedIds.current.has(p.id)) {
        return;
      }

      inFlightRelatedIds.current.add(p.id);
      try {
        const { data } = await axios.get(`${MastodonInstanceUrl}:3002/stacks/${p.id}/related`, withAuth());
        const stackData = data.relatedStacks || [];
        const stackCount = data.size;

        updateCollectionsById(p.id, (x) => {
          const sameCount = x.stackCount === stackCount;
          const sameLen = (x.relatedStacks?.length || 0) === stackData.length;
          if (sameCount && sameLen) return x; // avoid pointless setState
          return { ...x, relatedStacks: stackData, stackCount };
        });

        fetchedRelatedIds.current.add(p.id);
      } catch (e) {
        console.error(`Error fetching stack data for post ${p.id}:`, e);
      } finally {
        inFlightRelatedIds.current.delete(p.id);
      }
    },
    [updateCollectionsById]
  );

  const prefetchRelatedStacksInBatches = useCallback(
    async (postsToFetch: PostType[], batchSize = 4) => {
      for (let i = 0; i < postsToFetch.length; i += batchSize) {
        const batch = postsToFetch.slice(i, i + batchSize);
        await Promise.all(batch.map((p) => fetchRelatedStacksFor(p)));
      }
    },
    [fetchRelatedStacksFor]
  );

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
      formatted.forEach((p) => {
        fetchRelatedStacksFor(p);
      });
      // No explicit per-item fetch here; the guarded effect below will handle only what's needed.
    } catch (e) {
      console.error("Failed to fetch recommended posts:", e);
    } finally {
      setRecommendedLoading(false);
    }
  }, [id, replyIDs]);

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
  }, [id]);

  useEffect(() => {
    const candidates = [...replies, ...ancestors, ...recommendedPosts];
    const toFetch = candidates.filter(
      (p) =>
        p.stackCount === null &&
        (!p.relatedStacks || p.relatedStacks.length === 0) &&
        !fetchedRelatedIds.current.has(p.id) &&
        !inFlightRelatedIds.current.has(p.id)
    );

    if (toFetch.length) {
      void prefetchRelatedStacksInBatches(toFetch);
    }
  }, [replies, ancestors, recommendedPosts, prefetchRelatedStacksInBatches]);

  useEffect(() => {
    updateFocusPostPosition();
    updateContainerOffset();
    const onResize = () => {
      updateFocusPostPosition();
      updateContainerOffset();
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [updateFocusPostPosition, updateContainerOffset]);

  // -------------------- Handlers --------------------
  const handleStackIconClick = (
    relatedStacks: any[],
    postId: string,
    position: { top: number; height: number }
  ) => {
    if (postId === id) {
      const togglingOff = asideActivePostId === id && Array.isArray(asideStacks) && asideStacks.length > 0;
      if (togglingOff) {
        setShowFocusRelatedStacks(false);
        setActivePostId(null);
        setPostPosition(null);
        setFromPost([], id);
        return;
      }
      setShowFocusRelatedStacks(true);
      setActivePostId(null);
      setPostPosition(null);
      const stacksToPublish = Array.isArray(relatedStacks) && relatedStacks.length > 0 ? relatedStacks : focusRelatedStacks;
      setFromPost(stacksToPublish, id, { force: true });
      return;
    }

    const togglingOff = asideActivePostId === postId && Array.isArray(asideStacks) && asideStacks.length > 0;
    if (togglingOff) {
      setActivePostId(null);
      setPostPosition(null);
      setFromPost([], postId);
      return;
    }

    setShowFocusRelatedStacks(false);
    setActivePostId(postId);
    setPostPosition(position);

    if (!relatedStacks || relatedStacks.length === 0) {
      const targetPost = allPostsById.get(postId);
      if (targetPost) {
        void fetchRelatedStacksFor(targetPost);
      }
    }

    if (Array.isArray(relatedStacks)) {
      setFromPost(relatedStacks, postId);
    }
  };

  const handleShowMoreReplies = () =>
    setVisibleReplies((v) => Math.min(v + 15, filteredReplies.length));

  const handleTabChange = async (value: string | null) => {
    if (!value) return;
    setActiveTab(value);

    const actions: Record<string, (() => Promise<void>) | undefined> = {
      recommended: fetchRecommended,
      stacked: fetchRepliesStack,
      summary: fetchSummary,
    };
    const fn = actions[value];
    if (fn) await fn();
  };

  // -------------------- Render helpers --------------------
  const renderPost = (
    p: PostType,
    overrides?: Partial<Pick<PostType, "stackCount" | "relatedStacks">>
  ) => (
    <Post
      key={p.id}
      id={p.id}
      text={p.content}
      author={p.account.username}
      account={p.account.acc}
      avatar={p.account.avatar}
      repliesCount={p.replies_count}
      createdAt={p.created_at}
      stackCount={overrides?.stackCount ?? p.stackCount}
      favouritesCount={p.favourites_count}
      favourited={p.favourited}
      bookmarked={p.bookmarked}
      mediaAttachments={[]}
      onStackIconClick={handleStackIconClick}
      setIsModalOpen={() => {}}
      setIsExpandModalOpen={() => {}}
      relatedStacks={overrides?.relatedStacks ?? p.relatedStacks}
      setActivePostId={setActivePostId}
      activePostId={highlightId}
    />
  );

  if (!post && !loading) {
    return (
      <Paper withBorder radius="md" mt={20} p="lg">
        <Text size="sm">Post not found.</Text>
      </Paper>
    );
  }

  // Right-rail data selection unified (no duplicate blocks)
  const activePost = showFocusRelatedStacks ? post : activePostId ? allPostsById.get(activePostId) ?? null : null;
  const railStacks = showFocusRelatedStacks ? focusRelatedStacks : activePost?.relatedStacks || [];
  const railTop = showFocusRelatedStacks ? focusPostPosition?.top : postPosition?.top;
  const highlightId = showFocusRelatedStacks ? id : activePostId;

  const railTopOffset = railTop != null ? railTop - containerOffset.top - 15 : null;

  return (
    <div ref={mainRef} style={{ position: "relative" }}>
      <div>
        <div style={{ position: "relative" }}>
          {/* Ancestors */}
          {ancestors.map((a) => (
            <div key={a.id} style={{ position: "relative", marginBottom: "1rem", marginLeft: 40 }}>
              {renderPost(a)}
              <div style={CONNECTOR_STYLE} />
            </div>
          ))}

          {/* Current Post */}
          <div ref={currentPostRef} style={{ position: "relative" }}>
            {post && renderPost(post, { stackCount: size, relatedStacks: focusRelatedStacks })}
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
            <Tabs color="#002379" defaultValue="time" value={activeTab} onChange={handleTabChange}>
              <Tabs.List style={{ marginBottom: "1rem" }}>
                {(["time", "recommended", "stacked", "summary"] as const).map((tab) => (
                  <Tabs.Tab
                    key={tab}
                    value={tab}
                    style={{ fontWeight: activeTab === tab ? ("bold" as const) : ("normal" as const) }}
                  >
                    {tab[0].toUpperCase() + tab.slice(1)}
                  </Tabs.Tab>
                ))}
              </Tabs.List>

              <Tabs.Panel value="time">
                <>
                  {repliesByTimeDesc.slice(0, visibleReplies).map((p) => renderPost(p))}
                  {visibleReplies < repliesByTimeDesc.length && (
                    <Button onClick={handleShowMoreReplies} variant="outline" fullWidth style={{ marginTop: 10 }}>
                      More Replies
                    </Button>
                  )}
                </>
              </Tabs.Panel>

              <Tabs.Panel value="recommended">
                {recommendedLoading ? <Loader size="lg" /> : recommendedPosts.map((p) => renderPost(p))}
              </Tabs.Panel>

              <Tabs.Panel value="stacked">
                {loadingRepliesStack ? (
                  <Loader size="lg" />
                ) : (
                  <RepliesStack repliesStacks={repliesStack} cardWidth={450} onStackClick={() => {}} showupdate={true} />
                )}
              </Tabs.Panel>

              <Tabs.Panel value="summary">
                <div style={{ padding: "1rem", fontSize: "1.1rem" }}>{summary}</div>
              </Tabs.Panel>
            </Tabs>
          </Paper>
        )}

        <div style={{ height: "100vh" }} />
      </div>

      {/* Related stacks are rendered in AppShell.Aside via context */}
    </div>
  );
}

