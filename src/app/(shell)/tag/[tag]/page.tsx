"use client";
import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Text, Paper, Divider, Group, Button, Anchor } from '@mantine/core';
import axios from 'axios';
import Posts from '../../../../components/Posts/Posts';

const MastodonInstanceUrl = 'https://beta.stacky.social';

interface TagHistory {
  day: string;
  uses: string;
  accounts: string;
}

interface TagData {
  name: string;
  url: string;
  history: TagHistory[];
  following: boolean;
}

// Module-level cache for tag data so back navigation is instant
const tagDataCache = new Map<string, TagData & { _ts: number }>();
const TAG_CACHE_TTL = 5 * 60 * 1000;
const MAX_TAG_CACHE = 20;

export default function TagPage() {
  const params = useParams();
  const tagName = Array.isArray(params.tag) ? params.tag[0] : params.tag;

  const rawCached = tagName ? tagDataCache.get(tagName) : undefined;
  const cached = rawCached && Date.now() - rawCached._ts < TAG_CACHE_TTL ? rawCached : undefined;
  const [tagData, setTagData] = useState<TagData | null>(cached ?? null);
  const [loading, setLoading] = useState(!cached);
  const [loadError, setLoadError] = useState(false);
  const [isFollowing, setIsFollowing] = useState(cached?.following ?? false);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    if (!tagName) return;
    // The tag endpoint needs a bearer token — with no signed-in session the
    // fetch is doomed, so show the explanation card immediately instead of
    // hanging on "Loading..." (F-24).
    const accessToken = localStorage.getItem('accessToken');
    if (!accessToken) {
      setLoadError(true);
      setLoading(false);
      return;
    }
    fetchTagData(tagName);
  }, [tagName]);

  const fetchTagData = async (tag: string) => {
    try {
      const accessToken = localStorage.getItem('accessToken');
      const response = await axios.get(`${MastodonInstanceUrl}/api/v1/tags/${encodeURIComponent(tag)}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      setTagData(response.data);
      setIsFollowing(response.data.following);
      tagDataCache.set(tag, { ...response.data, _ts: Date.now() });
      if (tagDataCache.size > MAX_TAG_CACHE) {
        const oldest = tagDataCache.keys().next().value;
        if (oldest !== undefined) tagDataCache.delete(oldest);
      }
    } catch (error) {
      console.error('Error fetching tag data:', error);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  const handleFollowToggle = async () => {
    if (toggling) return;
    setToggling(true);
    try {
      const accessToken = localStorage.getItem('accessToken');
      const url = isFollowing
        ? `${MastodonInstanceUrl}/api/v1/tags/${encodeURIComponent(tagName)}/unfollow`
        : `${MastodonInstanceUrl}/api/v1/tags/${encodeURIComponent(tagName)}/follow`;

      await axios.post(url, {}, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      setIsFollowing(!isFollowing);
      // Update cache with new following state
      if (tagData && tagName) {
        tagDataCache.set(tagName, { ...tagData, following: !isFollowing, _ts: Date.now() });
      }
    } catch (error) {
      console.error('Error toggling follow status:', error);
    } finally {
      setToggling(false);
    }
  };

  // Failed (or unauthenticated) with nothing cached — explain instead of
  // hanging on "Loading..." forever (F-24). A stale error flag is ignored
  // whenever we do have data to show.
  if (loadError && !tagData) {
    return (
      <Paper
        style={{
          backgroundColor: '#fff',
          boxShadow: 'rgba(0, 0, 0, 0.1) 0px 1px 1px',
          borderRadius: '8px',
          padding: '20px',
        }}
        withBorder
        data-testid="tag-load-error"
      >
        <Text size="xl">#{tagName}</Text>
        <Divider my="md" />
        <Text size="sm" c="dimmed">
          Couldn&apos;t load this tag. It may require a signed-in session with a reachable backend.
        </Text>
        <Group mt="md" gap="xl">
          <Anchor component={Link} href="/home" size="sm" fw={600}>
            Back to home
          </Anchor>
          <Anchor component={Link} href="/ChineseEVs" size="sm" fw={600}>
            Browse the demo thread
          </Anchor>
        </Group>
      </Paper>
    );
  }

  if (loading || !tagData) {
    return <div>Loading...</div>;
  }

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
          <Text size="xl">#{tagName}</Text>
          <Button
            color={isFollowing ? 'red' : 'blue'}
            onClick={handleFollowToggle}
            disabled={toggling}
          >
            {toggling ? 'Loading...' : (isFollowing ? 'Unfollow hashtag' : 'Follow hashtag')}
          </Button>
        </Group>
        <Divider my="md" />

        <Group style={{ justifyContent: 'center', gap: '2rem' }}>
          <div>
            <Text size="lg" style={{ textAlign: 'center' }}>
              {tagData.history.reduce((acc: number, day: TagHistory) => acc + parseInt(day.uses), 0)}
            </Text>
            <Text size="sm" c="dimmed" style={{ textAlign: 'center' }}>Posts</Text>
          </div>
          <div>
            <Text size="lg" style={{ textAlign: 'center' }}>
              {tagData.history.reduce((acc: number, day: TagHistory) => acc + parseInt(day.accounts), 0)}
            </Text>
            <Text size="sm" c="dimmed" style={{ textAlign: 'center' }}>Participants</Text>
          </div>
        </Group>
      </Paper>
      <div style={{ marginTop: '20px' }}>
        <Posts apiUrl={`${MastodonInstanceUrl}/api/v1/timelines/tag/${encodeURIComponent(tagName)}`} loadStackInfo={true} showSubmitAndSearch={false} />
      </div>
    </div>
  );
}
