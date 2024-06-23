"use client";
import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Text, Avatar, Group, Paper, Divider } from '@mantine/core';
import axios from 'axios';
import { Shell } from "../../../components/Shell";

const MastodonInstanceUrl = 'https://beta.stacky.social';

export default function UserPage() {
  const params = useParams();
  const userName = Array.isArray(params.userName) ? params.userName[0] : params.userName;
  const [userData, setUserData] = useState<any>(null);

  useEffect(() => {
    if (userName) {
      fetchUserData(userName);
    }
  }, [userName]);

  const fetchUserData = async (username: string) => {
    try {
      const response = await axios.get(`${MastodonInstanceUrl}/api/v1/accounts/lookup?acct=${username}`);
      setUserData(response.data);
    } catch (error) {
      console.error('Error fetching user data:', error);
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
        <Group>
          <Avatar src={userData.avatar} alt={userData.username} radius="xl" size="lg" />
          <div>
            <Text size="xl">{userData.username}</Text>
            <Text size="sm" color="dimmed">@{userData.acct}</Text>
          </div>
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
