"use client";
import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Text, Paper, Divider, Group, Button, Anchor } from '@mantine/core';
import axios from 'axios';
import Posts from '../../../../components/Posts/Posts';
import { invalidatePostListCache } from '../../../../components/PostList';
import ChineseEvsPage from '../../ChineseEVs/page';
import { getHashtagDefinition } from '../../../../data/hashtagCatalog';
import { MASTODON_INSTANCE_URL } from '../../../../utils/mastodonApi';
import { useAccessToken } from '../../../../utils/useAccessToken';
import { useRelatedStacks } from '../../related-stacks-context';

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
  const definition = getHashtagDefinition(tagName ?? '');

  if (definition?.local) return <ChineseEvsPage />;
  if (!tagName) return null;

  return (
    <MastodonTagPage
      tagName={tagName}
      apiTag={definition?.apiTag ?? tagName}
      description={definition?.description}
    />
  );
}

function MastodonTagPage({
  tagName,
  apiTag,
  description,
}: {
  tagName: string;
  apiTag: string;
  description?: string;
}) {
  const { token: accessToken, ready: authReady } = useAccessToken();
  const { enterFeedSurface } = useRelatedStacks();
  const timelineUrl = `${MASTODON_INSTANCE_URL}/api/v1/timelines/tag/${encodeURIComponent(apiTag)}`;

  const rawCached = tagName ? tagDataCache.get(tagName) : undefined;
  const cached = rawCached && Date.now() - rawCached._ts < TAG_CACHE_TTL ? rawCached : undefined;
  const [tagData, setTagData] = useState<TagData | null>(cached ?? null);
  const [loading, setLoading] = useState(!cached);
  const [loadError, setLoadError] = useState(false);
  const [isFollowing, setIsFollowing] = useState(cached?.following ?? false);
  const [toggling, setToggling] = useState(false);

  // Claim the route before either public read completes. If metadata or the
  // timeline is empty/unavailable, the tag page must not inherit related posts
  // selected on Home or #AIWorkforce from the long-lived shell provider.
  useEffect(() => {
    enterFeedSurface(`api:${timelineUrl}`);
  }, [enterFeedSurface, timelineUrl]);

  const fetchTagData = useCallback(async (tag: string) => {
    try {
      setLoadError(false);
      const headers: Record<string, string> = {};
      if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
      const response = await axios.get(`${MASTODON_INSTANCE_URL}/api/v1/tags/${encodeURIComponent(apiTag)}`, {
        headers,
      });
      setTagData(response.data);
      setIsFollowing(Boolean(response.data.following));
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
  }, [accessToken, apiTag]);

  useEffect(() => {
    if (!tagName || !authReady) return;
    // Mastodon hashtag metadata and timelines are public. Authentication only
    // enriches metadata with the current user's follow state; it must never be
    // required just to read a conversation.
    fetchTagData(tagName);
  }, [authReady, fetchTagData, tagName]);

  const handleFollowToggle = async () => {
    if (toggling) return;
    if (!accessToken) return;
    setToggling(true);
    try {
      const url = isFollowing
        ? `${MASTODON_INSTANCE_URL}/api/v1/tags/${encodeURIComponent(apiTag)}/unfollow`
        : `${MASTODON_INSTANCE_URL}/api/v1/tags/${encodeURIComponent(apiTag)}/follow`;

      await axios.post(url, {}, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      setIsFollowing(!isFollowing);
      invalidatePostListCache('/api/v1/timelines/home');
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
          Couldn&apos;t load this conversation right now. Check your connection and try again.
        </Text>
        <Group mt="md" gap="xl">
          <Anchor component={Link} href="/home" size="sm" fw={600}>
            Back to home
          </Anchor>
          <Anchor component={Link} href="/tag/AIWorkforce" size="sm" fw={600}>
            Browse the demo thread
          </Anchor>
        </Group>
      </Paper>
    );
  }

  if (loading || !tagData) {
    return <div>Loading...</div>;
  }

  const postCount = tagData.history.reduce(
    (total: number, day: TagHistory) => total + Number.parseInt(day.uses, 10),
    0,
  );
  const participantCount = tagData.history.reduce(
    (total: number, day: TagHistory) => total + Number.parseInt(day.accounts, 10),
    0,
  );
  const showCounts = postCount > 0 || participantCount > 0 || !description;

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
            disabled={toggling || !accessToken}
          >
            {toggling
              ? 'Loading...'
              : !accessToken
                ? 'Sign in to follow'
                : isFollowing
                  ? 'Unfollow hashtag'
                  : 'Follow hashtag'}
          </Button>
        </Group>
        <Divider my="md" />

        {description && <Text size="sm" c="dimmed">{description}</Text>}
        {showCounts && (
          <Group mt={description ? 'md' : undefined} style={{ justifyContent: 'center', gap: '2rem' }}>
            <div>
              <Text size="lg" style={{ textAlign: 'center' }}>{postCount}</Text>
              <Text size="sm" c="dimmed" style={{ textAlign: 'center' }}>Posts</Text>
            </div>
            <div>
              <Text size="lg" style={{ textAlign: 'center' }}>{participantCount}</Text>
              <Text size="sm" c="dimmed" style={{ textAlign: 'center' }}>Participants</Text>
            </div>
          </Group>
        )}
      </Paper>
      <div style={{ marginTop: '20px' }}>
        <Posts apiUrl={timelineUrl} loadStackInfo={true} showSubmitAndSearch={false} />
      </div>
    </div>
  );
}
