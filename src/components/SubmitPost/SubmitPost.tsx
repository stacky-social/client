"use client";
import React, { useState, useEffect, useRef } from 'react';
import { Group, Avatar, Button, ActionIcon, Textarea, TextInput } from '@mantine/core';
import { IconPhoto, IconChartBar, IconAlertTriangle, IconMoodSmile,  } from '@tabler/icons-react';
import EmojiPicker, { EmojiClickData } from 'emoji-picker-react';
import { notifications } from '@mantine/notifications';
import { getMe, createPost, useLocalStore } from '../../utils/localStore';
import { useRelatedStacks } from '../../app/(shell)/related-stacks-context';
import axios from 'axios';
import classes from './SubmitPost.module.css';

export function SubmitPost() {
  // Local current user — reactive so the avatar reflects store identity.
  const currentUser = useLocalStore(() => getMe());
  // Publish live writing-feedback to the aside (rendered by the feed @aside slot).
  const { setComposerFeedback } = useRelatedStacks();
  const [postText, setPostText] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const draftIdRef = useRef(`draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const feedbackReqIdRef = useRef(0);

  const iconStyle = { width: 20, height: 20};

  useEffect(() => {
    adjustTextareaHeight();
  }, [postText]);

  // Live writing feedback: debounce the draft, ask the same backend that powers
  // comment-draft feedback, and surface the result in the aside via context.
  // Real remote call (POST /posts/feedback) — fails gracefully when offline.
  useEffect(() => {
    const text = postText.trim();
    if (text.length < 10) {
      setComposerFeedback(null);
      return;
    }
    const t = setTimeout(async () => {
      const myReqId = ++feedbackReqIdRef.current;
      setComposerFeedback({ loading: true });
      try {
        const res = await axios.post('https://beta.stacky.social:3002/posts/feedback', {
          draftID: draftIdRef.current,
          parentPostID: null,
          draftText: text,
        });
        if (myReqId !== feedbackReqIdRef.current) return;
        const { advice, praise, simulatedReplies } = res.data || {};
        setComposerFeedback({ loading: false, advice, praise, simulatedReplies });
      } catch {
        if (myReqId !== feedbackReqIdRef.current) return;
        setComposerFeedback(null);
      }
    }, 600);
    return () => clearTimeout(t);
  }, [postText, setComposerFeedback]);

  // Clear feedback from the aside when the composer unmounts.
  useEffect(() => () => {
    feedbackReqIdRef.current++;
    setComposerFeedback(null);
  }, [setComposerFeedback]);


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

  const handleSubmit = () => {
    if (submitting) return;
    if (!postText.trim()) {
      notifications.show({
        title: 'Error',
        message: 'Please enter some text before posting.',
        color: 'red',
      });
      return;
    }

    setSubmitting(true);
    try {
      // Local mode: persist the post to the store. It surfaces at the top of
      // Home immediately (the store is reactive).
      createPost(postText.trim());
      notifications.show({
        title: 'Success',
        message: 'Post created successfully.',
        color: 'green',
      });
      setPostText(''); // Clear the composer after posting.
      if (fileInputRef.current) fileInputRef.current.value = '';
      setShowEmojiPicker(false);
      // Clear the aside feedback and start a fresh draft id for the next post.
      feedbackReqIdRef.current++;
      setComposerFeedback(null);
      draftIdRef.current = `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    } catch (error) {
      console.error('Error creating post:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to create post. Please try again later.',
        color: 'red',
      });
    } finally {
      setSubmitting(false);
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
        <TextInput
          placeholder="What's on your mind?"
          variant="unstyled"
          value={postText}
          onChange={(event) => setPostText(event.currentTarget.value)}
        />
        <div className={classes.ButtonArea} style={{ marginTop: '20px' }}>
            <Group className="iconlist">
              <ActionIcon
              className={classes.actionIcon}
              style={iconStyle} onClick={() => fileInputRef.current?.click()}>
                <IconPhoto size={20} />
              </ActionIcon>
              <input
                type="file"
                ref={fileInputRef}
                style={{ display: 'none' }}
                accept="image/*"
              />
              <ActionIcon
              className={classes.actionIcon}
              style={iconStyle}>
                <IconChartBar size={20} />
              </ActionIcon>
              <ActionIcon
              className={classes.actionIcon}
              style={iconStyle}>
                <IconAlertTriangle size={20} />
              </ActionIcon>
              <ActionIcon
              className={classes.actionIcon}
              style={iconStyle} onClick={toggleEmojiPicker}>
                <IconMoodSmile size={20} />
              </ActionIcon>
              {showEmojiPicker && (
                <div ref={emojiPickerRef} className={classes.EmojiPicker}>
                  <EmojiPicker onEmojiClick={handleEmojiSelect} />
                </div>
              )}
            </Group>
          <div className="postbutton">
            <Button className={classes.button} onClick={handleSubmit} loading={submitting} disabled={submitting}>
              Post
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
