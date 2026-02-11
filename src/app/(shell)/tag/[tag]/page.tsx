"use client";
import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Text, Paper, Divider, Group, Button } from '@mantine/core';
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
const tagDataCache = new Map<string, TagData>();

export default function TagPage() {
  const params = useParams();
  const tagName = Array.isArray(params.tag) ? params.tag[0] : params.tag;

  const cached = tagName ? tagDataCache.get(tagName) : undefined;
  const [tagData, setTagData] = useState<TagData | null>(cached ?? null);
  const [loading, setLoading] = useState(!cached);
  const [isFollowing, setIsFollowing] = useState(cached?.following ?? false);

  useEffect(() => {
    if (tagName) {
      fetchTagData(tagName);
    }
  }, [tagName]);

  const fetchTagData = async (tag: string) => {
    if (!loading) setLoading(false); // don't flash if we have cached data
    try {
      const accessToken = localStorage.getItem('accessToken');
      const response = await axios.get(`${MastodonInstanceUrl}/api/v1/tags/${tag}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      setTagData(response.data);
      setIsFollowing(response.data.following);
      tagDataCache.set(tag, response.data);
    } catch (error) {
      console.error('Error fetching tag data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFollowToggle = async () => {
    try {
      const accessToken = localStorage.getItem('accessToken');
      const url = isFollowing
        ? `${MastodonInstanceUrl}/api/v1/tags/${tagName}/unfollow`
        : `${MastodonInstanceUrl}/api/v1/tags/${tagName}/follow`;

      await axios.post(url, {}, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      setIsFollowing(!isFollowing);
      // Update cache with new following state
      if (tagData && tagName) {
        tagDataCache.set(tagName, { ...tagData, following: !isFollowing });
      }
    } catch (error) {
      console.error('Error toggling follow status:', error);
    }
  };

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
            disabled={loading}
          >
            {loading ? 'Loading...' : (isFollowing ? 'Unfollow hashtag' : 'Follow hashtag')}
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
        <Posts apiUrl={`${MastodonInstanceUrl}/api/v1/timelines/tag/${tagName}`} loadStackInfo={true} showSubmitAndSearch={false} />
      </div>
    </div>
  );
}
