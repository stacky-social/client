"use client";

import React, { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Text, Avatar, Group, Paper, Divider, Button, Loader } from "@mantine/core";
import Post from "../../../../components/Posts/Post";
import {
  getUserProfile,
  getUserPosts,
  hasUserProfile,
  isFollowing as storeIsFollowing,
  toggleFollow,
  useLocalStore,
  useHydrated,
  type Post as StorePost,
} from "../../../../utils/localStore";
import {
  MASTODON_INSTANCE_URL,
  type MastodonAccount,
  type MastodonStatus,
} from "../../../../utils/mastodonApi";
import { useAccessToken } from "../../../../utils/useAccessToken";
import { restoreFeedScrollSnapshot } from "../../../../utils/feedScrollRestoration";

interface LiveAccount extends MastodonAccount {
  followers_count?: number;
  following_count?: number;
  statuses_count?: number;
  note?: string;
}

export default function UserPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const rawUserName = Array.isArray(params.userName) ? params.userName[0] : params.userName;
  const acct = safelyDecodeHandle(rawUserName ?? "");
  const accountId = searchParams.get("source") === "mastodon" ? searchParams.get("id") : null;

  return accountId
    ? <MastodonUserPage accountId={accountId} fallbackAcct={acct} />
    : <ResolvedUserPage acct={acct} />;
}

/**
 * Post payloads from the related-post service do not always include the stable
 * Mastodon account id. Keep known fixture accounts local; resolve every unknown
 * handle against Mastodon so those profile links do not fall into a fabricated
 * empty local profile or crash on unusual URL characters.
 */
function ResolvedUserPage({ acct }: { acct: string }) {
  const hydrated = useHydrated();
  const isLocalAccount = useLocalStore(() => hasUserProfile(acct));

  if (!hydrated) return <ProfileLoader />;
  return isLocalAccount ? <LocalUserPage acct={acct} /> : <MastodonAccountLookup acct={acct} />;
}

function MastodonAccountLookup({ acct }: { acct: string }) {
  const { token, ready } = useAccessToken();
  const [accountId, setAccountId] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!ready || !acct) {
      if (ready) setFailed(true);
      return;
    }

    const controller = new AbortController();
    const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
    fetch(
      `${MASTODON_INSTANCE_URL}/api/v1/accounts/lookup?acct=${encodeURIComponent(acct.replace(/^@/, ""))}`,
      { headers, signal: controller.signal },
    )
      .then(async (response) => {
        if (!response.ok) throw new Error("Account lookup failed");
        const data = await response.json();
        if (!data?.id) throw new Error("Account lookup returned no id");
        setAccountId(String(data.id));
      })
      .catch((requestError) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setFailed(true);
      });

    return () => controller.abort();
  }, [acct, ready, token]);

  if (!ready || (!accountId && !failed)) return <ProfileLoader />;
  if (failed || !accountId) return <ProfileError acct={acct} />;
  return <MastodonUserPage accountId={accountId} fallbackAcct={acct} />;
}

function LocalUserPage({ acct }: { acct: string }) {
  const userData = useLocalStore(() => getUserProfile(acct));
  const posts = useLocalStore(() => getUserPosts(acct));
  const hydrated = useHydrated();
  const followingLive = useLocalStore(() => storeIsFollowing(acct));
  const following = hydrated ? followingLive : false;

  return (
    <ProfileLayout
      displayName={userData.display_name}
      acct={userData.acct}
      avatar={userData.avatar}
      note={userData.note}
      followers={userData.followers_count}
      following={userData.following_count}
      statuses={userData.statuses_count}
      isFollowing={following}
      onFollow={() => { if (acct) toggleFollow(acct); }}
      posts={posts.map(storePostProps)}
    />
  );
}

function MastodonUserPage({ accountId, fallbackAcct }: { accountId: string; fallbackAcct: string }) {
  const { token, ready } = useAccessToken();
  const [account, setAccount] = useState<LiveAccount | null>(null);
  const [posts, setPosts] = useState<MastodonStatus[]>([]);
  const [following, setFollowing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
    const relationshipRequest = token
      ? fetch(`${MASTODON_INSTANCE_URL}/api/v1/accounts/relationships?id[]=${encodeURIComponent(accountId)}`, { headers, signal: controller.signal })
      : Promise.resolve(null);
    Promise.all([
      fetch(`${MASTODON_INSTANCE_URL}/api/v1/accounts/${encodeURIComponent(accountId)}`, { headers, signal: controller.signal }),
      fetch(`${MASTODON_INSTANCE_URL}/api/v1/accounts/${encodeURIComponent(accountId)}/statuses?limit=20`, { headers, signal: controller.signal }),
      relationshipRequest,
    ])
      .then(async ([accountResponse, postsResponse, relationshipResponse]) => {
        if (!accountResponse.ok || !postsResponse.ok) throw new Error("Profile request failed");
        const [accountData, postsData, relationshipData] = await Promise.all([
          accountResponse.json(),
          postsResponse.json(),
          relationshipResponse?.ok ? relationshipResponse.json() : [],
        ]);
        setAccount(accountData);
        setPosts(Array.isArray(postsData) ? postsData : []);
        setFollowing(Boolean(relationshipData?.[0]?.following));
      })
      .catch((requestError) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [accountId, ready, token]);

  const handleFollow = async () => {
    if (!token || toggling) return;
    setToggling(true);
    try {
      const response = await fetch(
        `${MASTODON_INSTANCE_URL}/api/v1/accounts/${encodeURIComponent(accountId)}/${following ? "unfollow" : "follow"}`,
        { method: "POST", headers: { Authorization: `Bearer ${token}` } },
      );
      if (!response.ok) throw new Error("Follow request failed");
      const relationship = await response.json();
      setFollowing(Boolean(relationship.following));
    } catch {
      // Preserve the current state; the button remains available for retry.
    } finally {
      setToggling(false);
    }
  };

  if (loading) return <ProfileLoader />;
  if (error || !account) return <ProfileError acct={fallbackAcct} />;

  return (
    <ProfileLayout
      displayName={account.display_name || account.username}
      acct={account.acct}
      avatar={account.avatar}
      note={stripHtml(account.note || "")}
      followers={Number(account.followers_count ?? 0)}
      following={Number(account.following_count ?? 0)}
      statuses={Number(account.statuses_count ?? posts.length)}
      isFollowing={following}
      onFollow={handleFollow}
      followDisabled={toggling || !token}
      posts={posts.map(mastodonPostProps)}
    />
  );
}

interface ProfilePostProps {
  id: string;
  text: string;
  author: string;
  account: string;
  accountId?: string;
  avatar: string;
  repliesCount: number;
  createdAt: string;
  favouritesCount: number;
  favourited: boolean;
  bookmarked: boolean;
  mediaAttachments: string[];
}

function storePostProps(post: StorePost): ProfilePostProps {
  return {
    id: post.id,
    text: post.content,
    author: post.account.username,
    account: post.account.acct,
    avatar: post.account.avatar,
    repliesCount: post.replies_count,
    createdAt: post.created_at,
    favouritesCount: post.favourites_count,
    favourited: post.favourited,
    bookmarked: post.bookmarked,
    mediaAttachments: (post.media_attachments || []).map((item: any) => item.url),
  };
}

function mastodonPostProps(post: MastodonStatus): ProfilePostProps {
  return {
    id: post.id,
    text: post.content,
    author: post.account.display_name || post.account.username,
    account: post.account.acct,
    accountId: post.account.id,
    avatar: post.account.avatar,
    repliesCount: post.replies_count,
    createdAt: post.created_at,
    favouritesCount: post.favourites_count,
    favourited: post.favourited,
    bookmarked: post.bookmarked,
    mediaAttachments: (post.media_attachments || []).map((item) => item.url),
  };
}

function ProfileLayout({
  displayName,
  acct,
  avatar,
  note,
  followers,
  following,
  statuses,
  isFollowing,
  onFollow,
  followDisabled = false,
  posts,
}: {
  displayName: string;
  acct: string;
  avatar: string;
  note: string;
  followers: number;
  following: number;
  statuses: number;
  isFollowing: boolean;
  onFollow: () => void;
  followDisabled?: boolean;
  posts: ProfilePostProps[];
}) {
  const noop = () => {};
  const restoredRouteRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const route = `${window.location.pathname}${window.location.search}`;
    if (restoredRouteRef.current === route) return;
    restoredRouteRef.current = route;
    return restoreFeedScrollSnapshot(route);
  }, [acct, posts.length]);

  return (
    <div>
      <Paper style={{ backgroundColor: "#fff", boxShadow: "rgba(0, 0, 0, 0.1) 0 1px 1px", borderRadius: 8, padding: 20 }} withBorder>
        <Group style={{ justifyContent: "space-between" }}>
          <Group>
            <Avatar src={avatar} alt={displayName} radius="xl" size="lg" />
            <div>
              <Text size="xl">{displayName}</Text>
              <Text size="sm" c="dimmed">@{acct}</Text>
            </div>
          </Group>
          <Button color={isFollowing ? "red" : "blue"} onClick={onFollow} disabled={followDisabled}>
            {isFollowing ? "Unfollow" : "Follow"}
          </Button>
        </Group>
        <Divider my="md" />
        <Text>{note}</Text>
        <Divider my="md" />
        <Group style={{ justifyContent: "center", gap: "2rem" }}>
          <Stat value={followers} label="Followers" />
          <Stat value={following} label="Following" />
          <Stat value={statuses} label="Posts" />
        </Group>
      </Paper>
      <div style={{ marginTop: 20 }}>
        {posts.length > 0 ? posts.map((post) => (
          <Post
            key={post.id}
            {...post}
            stackCount={-1}
            onStackIconClick={noop}
            setIsModalOpen={noop}
            setIsExpandModalOpen={noop}
            relatedStacks={[]}
            setActivePostId={noop}
            activePostId={null}
          />
        )) : (
          <Text size="sm" c="dimmed" style={{ textAlign: "center", marginTop: "2rem" }}>No posts yet.</Text>
        )}
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return <div><Text size="lg" ta="center">{value}</Text><Text size="sm" c="dimmed" ta="center">{label}</Text></div>;
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function safelyDecodeHandle(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    // Next normally gives this page an already-decoded param. A literal `%` in
    // a federated handle must not turn profile navigation into an exception.
    return value;
  }
}

function ProfileLoader() {
  return <div style={{ minHeight: 180, display: "grid", placeItems: "center" }}><Loader size="sm" /></div>;
}

function ProfileError({ acct }: { acct: string }) {
  return (
    <Paper withBorder p="xl">
      <Text fw={600}>Couldn&apos;t load @{acct}.</Text>
      <Text size="sm" c="dimmed" mt={4}>Check the handle or your connection, then try again.</Text>
    </Paper>
  );
}
