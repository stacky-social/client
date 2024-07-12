"use client";
import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Text, Avatar, Group, Paper, Divider, Button } from '@mantine/core';
import axios from 'axios';
import Posts from '../../../components/Posts/Posts'; 
import PostList from '../../../components/PostList';

const MastodonInstanceUrl = 'https://beta.stacky.social';

export default function UserPage() {
  const params = useParams();
  const userName = Array.isArray(params.userName) ? params.userName[0] : params.userName;
  const [userData, setUserData] = useState<any>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(false);
  const accessToken = localStorage.getItem('accessToken');

  useEffect(() => {
    if (userName) {
      fetchUserData(userName);
    }
  }, [userName]);

  const fetchUserData = async (username: string) => {
    try {
      const userResponse = await axios.get(`${MastodonInstanceUrl}/api/v1/accounts/lookup?acct=${username}`);
      setUserData(userResponse.data);
      fetchRelationship(userResponse.data.id);
    } catch (error) {
      console.error('Error fetching user data:', error);
    }
  };

  const fetchRelationship = async (userId: string) => {
    try {
      if (!accessToken) {
        console.error('Access token not found');
        return;
      }
      const relationshipResponse = await axios.get(`${MastodonInstanceUrl}/api/v1/accounts/relationships?id=${userId}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      if (relationshipResponse.data && relationshipResponse.data.length > 0) {
        setIsFollowing(relationshipResponse.data[0].following);
      }
    } catch (error) {
      console.error('Error fetching relationship data:', error);
    }
  };

  const handleFollowToggle = async () => {
    try {
      setLoading(true);
      if (!accessToken) {
        console.error('Access token not found');
        setLoading(false);
        return;
      }

      if (isFollowing) {
        await axios.post(
          `${MastodonInstanceUrl}/api/v1/accounts/${userData.id}/unfollow`,
          {},
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          }
        );
      } else {
        await axios.post(
          `${MastodonInstanceUrl}/api/v1/accounts/${userData.id}/follow`,
          {},
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          }
        );
      }

      console.log('Follow toggle successful');
      await fetchUserData(userName);
    } catch (error) {
      console.error('Error toggling follow status:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!userData) {
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
          <Group>
            <Avatar src={userData.avatar} alt={userData.username} radius="xl" size="lg" />
            <div>
              <Text size="xl">{userData.username}</Text>
              <Text size="sm" color="dimmed">@{userData.acct}</Text>
            </div>
          </Group>
          <Button
            color={isFollowing ? 'red' : 'blue'}
            onClick={handleFollowToggle}
            disabled={loading}
          >
            {loading ? 'Loading...' : (isFollowing ? 'Unfollow' : 'Follow')}
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
      {/* <Posts apiUrl={`${MastodonInstanceUrl}/api/v1/accounts/${userData.id}/statuses`}  loadStackInfo={true} /> */}
        <PostList 
          apiUrl={`${MastodonInstanceUrl}/api/v1/accounts/${userData.id}/statuses`} 
          handleStackIconClick={() => {}} 
          loadStackInfo={false} 
          accessToken={accessToken} 
          setIsModalOpen={() => {}} 
          setIsExpandModalOpen={() => {}}
        />
      </div>
    </div>
  );
}
