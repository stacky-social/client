"use client";
import React from 'react';
import { useParams } from 'next/navigation';
import { Text, Avatar, Group, Paper, Divider, Button } from '@mantine/core';
import Post from '../../../../components/Posts/Post';
import {
  getUserProfile,
  getUserPosts,
  isFollowing as storeIsFollowing,
  toggleFollow,
  useLocalStore,
  useHydrated,
  type Post as StorePost,
} from '../../../../utils/localStore';

export default function UserPage() {
  const params = useParams();
  const rawUserName = Array.isArray(params.userName) ? params.userName[0] : params.userName;
  // Route param may be URL-encoded (e.g. "nickl_nyt%40stacky-nyt.com").
  const acct = rawUserName ? decodeURIComponent(rawUserName) : '';

  // Reactive store reads: re-render when the profile / posts / follow state change.
  const userData = useLocalStore(() => getUserProfile(acct));
  const posts = useLocalStore(() => getUserPosts(acct));
  // Follow state comes from localStorage — gate on mount so the button label
  // matches the server render (which can't see localStorage), then re-sync.
  const hydrated = useHydrated();
  const followingLive = useLocalStore(() => storeIsFollowing(acct));
  const following = hydrated ? followingLive : false;

  const handleFollowToggle = () => {
    if (acct) toggleFollow(acct);
  };

  // No-op handlers — the profile page renders posts as a simple, static list.
  const noop = () => {};

  const renderPost = (p: StorePost) => (
    <Post
      key={p.id}
      id={p.id}
      text={p.content}
      author={p.account.username}
      account={p.account.acct}
      avatar={p.account.avatar}
      repliesCount={p.replies_count}
      createdAt={p.created_at}
      stackCount={-1}
      favouritesCount={p.favourites_count}
      favourited={p.favourited}
      bookmarked={p.bookmarked}
      mediaAttachments={(p.media_attachments || []).map((m: any) => m.url)}
      onStackIconClick={noop}
      setIsModalOpen={noop}
      setIsExpandModalOpen={noop}
      relatedStacks={[]}
      setActivePostId={noop}
      activePostId={null}
    />
  );

  return (
    <div>
      <Paper
        style={{
          backgroundColor: '#fff',
          boxShadow: 'rgba(0, 0, 0, 0.1) 0px 1px 1px',
          borderRadius: '8px',
          padding: '20px',
        }}
        withBorder
      >
        <Group style={{ justifyContent: 'space-between' }}>
          <Group>
            <Avatar src={userData.avatar} alt={userData.username} radius="xl" size="lg" />
            <div>
              <Text size="xl">{userData.display_name}</Text>
              <Text size="sm" color="dimmed">@{userData.acct}</Text>
            </div>
          </Group>
          <Button
            color={following ? 'red' : 'blue'}
            onClick={handleFollowToggle}
          >
            {following ? 'Unfollow' : 'Follow'}
          </Button>
        </Group>
        <Divider my="md" />
        <Text>{userData.note}</Text>
        <Divider my="md" />
        <Group style={{ justifyContent: 'center', gap: '2rem' }}>
          <div>
            <Text size="lg" style={{ textAlign: 'center' }}>{userData.followers_count}</Text>
            <Text size="sm" color="dimmed" style={{ textAlign: 'center' }}>Followers</Text>
          </div>
          <div>
            <Text size="lg" style={{ textAlign: 'center' }}>{userData.following_count}</Text>
            <Text size="sm" color="dimmed" style={{ textAlign: 'center' }}>Following</Text>
          </div>
          <div>
            <Text size="lg" style={{ textAlign: 'center' }}>{userData.statuses_count}</Text>
            <Text size="sm" color="dimmed" style={{ textAlign: 'center' }}>Posts</Text>
          </div>
        </Group>
      </Paper>
      <div style={{ marginTop: '20px' }}>
        {posts.length > 0 ? (
          posts.map(renderPost)
        ) : (
          <Text size="sm" color="dimmed" style={{ textAlign: 'center', marginTop: '2rem' }}>
            No posts yet.
          </Text>
        )}
      </div>
    </div>
  );
}
