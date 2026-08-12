"use client";
import React, { useCallback, useState, useEffect, useRef } from 'react';
import { Avatar, Button, Text, Textarea } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { getMe, createPost, useLocalStore } from '../../utils/localStore';
import { useRelatedStacks } from '../../app/(shell)/related-stacks-context';
import {
  createMastodonStatus,
  MASTODON_STATUS_MAX_LENGTH,
  publishCreatedMastodonStatus,
  type MastodonAccount,
} from '../../utils/mastodonApi';
import { useAccessToken } from '../../utils/useAccessToken';
import axios from 'axios';
import classes from './SubmitPost.module.css';

export function SubmitPost({ appearance = 'card' }: { appearance?: 'card' | 'timeline' }) {
  // Local current user — reactive so the avatar reflects store identity.
  const currentUser = useLocalStore(() => getMe());
  const { token: accessToken } = useAccessToken();
  const [mastodonUser, setMastodonUser] = useState<MastodonAccount | null>(null);
  // Publish live writing-feedback to the aside (rendered by the feed @aside slot).
  const { setComposerFeedback } = useRelatedStacks();
  const [postText, setPostText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const draftIdRef = useRef(`draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const feedbackReqIdRef = useRef(0);

  useEffect(() => {
    if (!accessToken) {
      setMastodonUser(null);
      return;
    }
    try {
      const stored = localStorage.getItem('currentUser');
      setMastodonUser(stored ? JSON.parse(stored) as MastodonAccount : null);
    } catch {
      setMastodonUser(null);
    }
  }, [accessToken]);

  const requestFeedback = useCallback(async (text: string, requestId: number) => {
    setFeedbackLoading(true);
    setFeedbackError(null);
    setComposerFeedback({ loading: true });
    try {
      const res = await axios.post('https://beta.stacky.social:3002/posts/feedback', {
        draftID: draftIdRef.current,
        parentPostID: null,
        draftText: text,
      });
      if (requestId !== feedbackReqIdRef.current) return;
      const { advice, praise, simulatedReplies } = res.data || {};
      setComposerFeedback({ loading: false, advice, praise, simulatedReplies });
    } catch (error) {
      if (requestId !== feedbackReqIdRef.current) return;
      console.error('Failed to fetch writing feedback:', error);
      setComposerFeedback(null);
      setFeedbackError('Writing feedback could not load. You can still post this draft.');
    } finally {
      if (requestId === feedbackReqIdRef.current) setFeedbackLoading(false);
    }
  }, [setComposerFeedback]);

  // Live writing feedback: debounce the draft, ask the same backend that powers
  // comment-draft feedback, and surface the result in the aside via context.
  // The feedback service is remote; posting remains available if it is offline.
  useEffect(() => {
    const text = postText.trim();
    const requestId = ++feedbackReqIdRef.current;
    setFeedbackError(null);
    if (text.length < 10) {
      setComposerFeedback(null);
      setFeedbackLoading(false);
      return;
    }
    const t = setTimeout(() => void requestFeedback(text, requestId), 600);
    return () => clearTimeout(t);
  }, [postText, requestFeedback, setComposerFeedback]);

  // Clear feedback from the aside when the composer unmounts.
  useEffect(() => () => {
    feedbackReqIdRef.current++;
    setComposerFeedback(null);
  }, [setComposerFeedback]);

  const retryFeedback = () => {
    const text = postText.trim();
    if (text.length < 10 || feedbackLoading) return;
    const requestId = ++feedbackReqIdRef.current;
    void requestFeedback(text, requestId);
  };

  const handleSubmit = async () => {
    if (submitting) return;
    const text = postText.trim();
    if (!text) {
      notifications.show({
        title: 'Error',
        message: 'Please enter some text before posting.',
        color: 'red',
      });
      return;
    }
    if (text.length > MASTODON_STATUS_MAX_LENGTH) {
      notifications.show({
        title: 'Post is too long',
        message: `Shorten it to ${MASTODON_STATUS_MAX_LENGTH} characters before posting.`,
        color: 'red',
      });
      return;
    }

    setSubmitting(true);
    try {
      if (accessToken) {
        const status = await createMastodonStatus(accessToken, text);
        publishCreatedMastodonStatus(status);
      } else {
        // JSON demo mode remains local and reactive.
        createPost(text);
      }
      notifications.show({
        title: 'Success',
        message: accessToken ? 'Posted to Stacky.' : 'Post created successfully.',
        color: 'green',
      });
      setPostText(''); // Clear the composer after posting.
      // Clear the aside feedback and start a fresh draft id for the next post.
      feedbackReqIdRef.current++;
      setComposerFeedback(null);
      setFeedbackError(null);
      setFeedbackLoading(false);
      draftIdRef.current = `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    } catch (error) {
      console.error('Error creating post:', error);
      notifications.show({
        title: 'Post was not published',
        message: error instanceof Error ? error.message : 'Please try again later.',
        color: 'red',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const visibleUser = accessToken ? mastodonUser : currentUser;
  const charactersRemaining = MASTODON_STATUS_MAX_LENGTH - postText.length;

  return (
    <section
      className={`${classes.composer} ${appearance === 'timeline' ? classes.timeline : ''}`}
      aria-label="Create a post"
    >
      <div className={classes.threadRail} aria-hidden="true">
        <span /><span /><span /><span />
      </div>

      <div className={classes.composerBody}>
        <div className={classes.avatarArea}>
        {visibleUser ? (
          <Avatar src={visibleUser.avatar} alt={visibleUser.display_name || 'Your profile'} radius="xl" size={42} />
        ) : (
          <Avatar alt="Your profile" radius="xl" size={42} />
        )}
        </div>

        <div className={classes.inputArea}>
          <Text className={classes.eyebrow}>Start a conversation</Text>
          <Textarea
          aria-label="Post text"
          placeholder="Share a perspective, question, or response…"
          variant="unstyled"
          autosize
          minRows={3}
          maxRows={9}
          resize="none"
          maxLength={MASTODON_STATUS_MAX_LENGTH}
          value={postText}
          onChange={(event) => setPostText(event.currentTarget.value)}
          className={classes.textarea}
        />

          {feedbackError && (
            <div className={classes.feedbackError} role="alert">
              <Text size="sm">{feedbackError}</Text>
              <Button
                variant="subtle"
                size="compact-sm"
                color="red"
                onClick={retryFeedback}
                loading={feedbackLoading}
              >
                Retry feedback
              </Button>
            </div>
          )}

          <div className={classes.buttonArea}>
            <div className={classes.composerMeta}>
              <Text size="xs" className={classes.feedbackHint}>
                {feedbackLoading ? 'Checking your draft…' : 'AI feedback appears as you write'}
              </Text>
              <Text size="xs" className={classes.characterCount} data-near-limit={charactersRemaining <= 50 || undefined}>
                {charactersRemaining}
              </Text>
            </div>
            <Button className={classes.button} onClick={() => void handleSubmit()} loading={submitting} disabled={submitting || !postText.trim()}>
              Post
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
