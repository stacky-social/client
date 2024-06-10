import React, { useState, useEffect } from 'react';
import { Group, Avatar, TextInput, Button, ActionIcon } from '@mantine/core';
import { IconCamera, IconGif, IconMessage2, IconMoodSmile, IconMapPin } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import classes from './SubmitPost.module.css';

const MastodonInstanceUrl = 'https://mastodon.social';

export function SubmitPost() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [postText, setPostText] = useState('');
  const [accessToken, setAccessToken] = useState<string | null>(null);

  const iconStyle = { width: 20, height: 20, marginLeft: 7, marginRight: 7 };

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    setAccessToken(token);

    const user = localStorage.getItem('currentUser');
    if (user) {
      setCurrentUser(JSON.parse(user));
    }
  }, []);

  const handleSubmit = async () => {
    try {
      if (!postText.trim()) {
        notifications.show({
          title: 'Error',
          message: 'Please enter some text before posting.',
          color: 'red',
        });
        return;
      }

      if (!accessToken) {
        notifications.show({
          title: 'Error',
          message: 'Access token is missing. Please log in again.',
          color: 'red',
        });
        return;
      }

      const response = await fetch(`${MastodonInstanceUrl}/api/v1/statuses`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: postText,
        }),
      });

      if (response.ok) {
        notifications.show({
          title: 'Success',
          message: 'Post created successfully.',
          color: 'green',
        });
        setPostText(''); // Clear the input field
      } else {
        const data = await response.json();
        console.error('Failed to create post:', data);
        notifications.show({
          title: 'Error',
          message: 'Failed to create post.',
          color: 'red',
        });
      }
    } catch (error) {
      console.error('Error creating post:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to create post. Please try again later.',
        color: 'red',
      });
    }
  };

  return (
    <div className={classes.PostBar}>
      <div className={classes.AvatarArea}>
        {currentUser ? (
          <Avatar src={currentUser.avatar} radius="xl" size={40} />
        ) : (
          <Avatar radius="xl" size={40} />
        )}
      </div>

      <div className={classes.inputArea}>
        <div className={classes.textArea}>
          <TextInput
            placeholder="What's on your mind?"
            radius="xl"
            size="xl"
            value={postText}
            onChange={(event) => setPostText(event.currentTarget.value)}
            styles={{ input: { width: '100%' } }}
          />
        </div>
        <div className={classes.ButtonArea}>
          <div className="iconlist">
            <Group>
              <ActionIcon style={iconStyle}>
                <IconCamera size={20} />
              </ActionIcon>
              <ActionIcon style={iconStyle}>
                <IconGif size={20} />
              </ActionIcon>
              <ActionIcon style={iconStyle}>
                <IconMessage2 size={20} />
              </ActionIcon>
              <ActionIcon style={iconStyle}>
                <IconMoodSmile size={20} />
              </ActionIcon>
              <ActionIcon style={iconStyle}>
                <IconMapPin size={20} />
              </ActionIcon>
            </Group>
          </div>
          <div className="postbutton">
            <Button className={classes.button} onClick={handleSubmit}>
              Post
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
