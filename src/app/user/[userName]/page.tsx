"use client";
import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Text, Avatar, Group, Paper, Divider, Button } from '@mantine/core';
import axios from 'axios';
import { Shell } from "../../../components/Shell";

const MastodonInstanceUrl = 'https://beta.stacky.social';

export default function UserPage() {
  const params = useParams();
  const userName = Array.isArray(params.userName) ? params.userName[0] : params.userName;
  const [userData, setUserData] = useState<any>(null);
  const [isFollowing, setIsFollowing] = useState(false);

  useEffect(() => {
    if (userName) {
      fetchUserData(userName);
    }
  }, [userName]);

  const fetchUserData = async (username: string) => {
    try {
      const response = await axios.get(`${MastodonInstanceUrl}/api/v1/accounts/lookup?acct=${username}`);
      setUserData(response.data);
      setIsFollowing(response.data.following); // set initial follow status
    } catch (error) {
      console.error('Error fetching user data:', error);
    }
  };

  const handleFollowToggle = async () => {
    try {
      const accessToken = localStorage.getItem('accessToken'); // access token
      if (!accessToken) {
        console.error('Access token not found');
        return;
      }

      if (isFollowing) {
        // 取消关注用户
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
        // follow user
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

      setIsFollowing(!isFollowing); // toggle follow status
    } catch (error) {
      console.error('Error toggling follow status:', error);
    }
  };

  if (!userData) {
    return <div>Loading...</div>;
  }

  return (
    <Shell>
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
            >
              {isFollowing ? 'Unfollow' : 'Follow'}
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
      </div>
    </Shell>
  );
}
