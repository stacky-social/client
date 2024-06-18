import React, { useState, useEffect, useRef } from 'react';
import { Group, Avatar, Button, ActionIcon } from '@mantine/core';
import { IconPhoto, IconChartBar, IconAlertTriangle, IconMoodSmile,  } from '@tabler/icons-react';
import EmojiPicker, { EmojiClickData } from 'emoji-picker-react';
import { notifications } from '@mantine/notifications';
import classes from './SubmitPost.module.css';

const MastodonInstanceUrl = 'https://beta.stacky.social';

export function SubmitPost() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [postText, setPostText] = useState('');
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const iconStyle = { width: 20, height: 20, marginLeft: 7, marginRight: 7 };

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    setAccessToken(token);

    const user = localStorage.getItem('currentUser');
    if (user) {
      setCurrentUser(JSON.parse(user));
    }
  }, []);

  useEffect(() => {
    adjustTextareaHeight();
  }, [postText]);


  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        emojiPickerRef.current &&
        !emojiPickerRef.current.contains(event.target as Node) &&
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setShowEmojiPicker(false);
      }
    };

    if (showEmojiPicker) {
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showEmojiPicker]);

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

      const formData = new FormData();
      formData.append('status', postText);
      if (fileInputRef.current?.files?.[0]) {
        formData.append('media[]', fileInputRef.current.files[0]);
      }

      const response = await fetch(`${MastodonInstanceUrl}/api/v1/statuses`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: formData,
      });

      if (response.ok) {
        notifications.show({
          title: 'Success',
          message: 'Post created successfully.',
          color: 'green',
        });
        setPostText(''); // Clear the post text after successful post
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

  const handleEmojiSelect = (emoji: EmojiClickData) => {
    setPostText((prevText) => prevText + emoji.emoji);
    setShowEmojiPicker(false);
  };

  const toggleEmojiPicker = () => {
    setShowEmojiPicker((prev) => !prev);
  };

  const adjustTextareaHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  };

  return (
    <div ref={containerRef} className={classes.PostBar} >
      <div className={classes.AvatarArea}>
        {currentUser ? (
          <Avatar src={currentUser.avatar} radius="xl" size={40} />
        ) : (
          <Avatar radius="xl" size={40} />
        )}
      </div>

      <div className={classes.inputArea}>
        <div className={classes.textArea}>
          <textarea
            ref={textareaRef}
            placeholder="What's on your mind?"
            value={postText}
            onChange={(event) => setPostText(event.currentTarget.value)}
            className={classes.textarea}
          />
        </div>
        <div className={classes.ButtonArea}>
          <div className="iconlist">
            <Group>
              <ActionIcon style={iconStyle} onClick={() => fileInputRef.current?.click()}>
                <IconPhoto size={20} />
              </ActionIcon>
              <input
                type="file"
                ref={fileInputRef}
                style={{ display: 'none' }}
                accept="image/*"
              />
              <ActionIcon style={iconStyle}>
                <IconChartBar size={20} />
              </ActionIcon>
              <ActionIcon style={iconStyle}>
                <IconAlertTriangle size={20} />
              </ActionIcon>
              <ActionIcon style={iconStyle} onClick={toggleEmojiPicker}>
                <IconMoodSmile size={20} />
              </ActionIcon>
              {showEmojiPicker && (
                <div ref={emojiPickerRef} className={classes.EmojiPicker}>
                  <EmojiPicker onEmojiClick={handleEmojiSelect} />
                </div>
              )}
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
