"use client";
import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Text, Paper, Divider, Group, Button } from '@mantine/core';
import axios from 'axios';
import Posts from '../../../components/Posts/Posts';

const MastodonInstanceUrl = 'https://beta.stacky.social';

export default function TagPage() {
  const params = useParams();
  const tagName = Array.isArray(params.tag) ? params.tag[0] : params.tag;
  const [tagData, setTagData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const accessToken = localStorage.getItem('accessToken');

  useEffect(() => {
    if (tagName) {
      fetchTagData(tagName);
    }
  }, [tagName]);

  const fetchTagData = async (tag: string) => {
    try {
      const response = await axios.get(`${MastodonInstanceUrl}/api/v1/tags/${tag}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      setTagData(response.data);
      setIsFollowing(response.data.following);
    } catch (error) {
      console.error('Error fetching tag data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFollowToggle = async () => {
    try {
      setLoading(true);
      const url = isFollowing
        ? `${MastodonInstanceUrl}/api/v1/tags/${tagName}/unfollow`
        : `${MastodonInstanceUrl}/api/v1/tags/${tagName}/follow`;

      await axios.post(url, {}, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      setIsFollowing(!isFollowing);
    } catch (error) {
      console.error('Error toggling follow status:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div style={{ margin: '15px', width: '90%' }}>
      <Paper
        style={{
          backgroundColor: '#fff',
          boxShadow: '0 3px 10px rgba(0,0,0,0.1)',
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
        <Text>{tagData ? tagData.description : 'No description available'}</Text>
        <Divider my="md" />
        <Group style={{ justifyContent: 'center', gap: '2rem' }}>
          <div>
            {/* <Text size="lg" style={{ textAlign: 'center' }}>{tagData.history.reduce((acc, day) => acc + parseInt(day.uses), 0)}</Text> */}
            <Text size="sm" color="dimmed" style={{ textAlign: 'center' }}>Posts</Text>
          </div>
          <div>
            {/* <Text size="lg" style={{ textAlign: 'center' }}>{tagData.history.reduce((acc, day) => acc + parseInt(day.accounts), 0)}</Text> */}
            <Text size="sm" color="dimmed" style={{ textAlign: 'center' }}>Participants</Text>
          </div>
        </Group>
      </Paper>
      <div style={{ marginTop: '20px' }}>
        <Posts apiUrl={`${MastodonInstanceUrl}/api/v1//timelines/tags/${tagName}`} loadStackInfo={true} showSubmitAndSearch={false} />
      </div>
    </div>
  );
}
