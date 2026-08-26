"use client";
import React, { useCallback, useState, useEffect, useRef } from 'react';
import { Button, Text, Textarea } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { getMe, createPost, searchPosts, useLocalStore, type Post as LocalPost } from '../../utils/localStore';
import {
  createMastodonStatus,
  MASTODON_STATUS_MAX_LENGTH,
  publishCreatedMastodonStatus,
  searchMastodon,
  type MastodonAccount,
  type MastodonStatus,
} from '../../utils/mastodonApi';
import { useAccessToken } from '../../utils/useAccessToken';
import { useRelatedStacks } from '../../app/(shell)/related-stacks-context';
import axios from 'axios';
import { FeedbackBlock } from './ComposerFeedback';
import classes from './SubmitPost.module.css';
import ProfileAvatar from '../ProfileAvatar';

type FeedbackMemoryEntry = {
  draftText: string;
  advice: string | null;
  praise: string | null;
  simulatedReplies: Array<{ id?: string; content: string }>;
};

const MAX_FEEDBACK_MEMORY = 4;
const DRAFT_RETRIEVAL_LIMIT = 6;
const DRAFT_STOP_WORDS = new Set([
  'about', 'after', 'again', 'also', 'because', 'been', 'before', 'being', 'could',
  'from', 'have', 'into', 'just', 'more', 'most', 'should', 'some', 'than', 'that',
  'their', 'them', 'then', 'there', 'these', 'they', 'this', 'through', 'want',
  'what', 'when', 'where', 'which', 'while', 'with', 'would', 'your',
]);

function draftRetrievalQuery(text: string): string {
  const tokens = text.toLowerCase().match(/[a-z0-9][a-z0-9'’-]*/g) ?? [];
  return Array.from(new Set(tokens))
    .filter((token) => token.length >= 4 && !DRAFT_STOP_WORDS.has(token))
    .sort((left, right) => right.length - left.length)
    .slice(0, 6)
    .join(' ');
}

function retrievalStackFromLocal(post: LocalPost) {
  return {
    stackId: `draft-local:${post.id}`,
    rel: 'connections',
    size: 1,
    topPost: {
      id: post.id,
      created_at: post.created_at,
      replies_count: post.replies_count,
      favourites_count: post.favourites_count,
      favourited: post.favourited,
      bookmarked: post.bookmarked,
      content: post.content,
      account: {
        avatar: post.account.avatar,
        display_name: post.account.username,
        acct: post.account.acct,
      },
      content_rewritten: '',
      rewrite: { content: '', significant: false },
      relations: [],
    },
  };
}

function retrievalStackFromMastodon(status: MastodonStatus) {
  return {
    stackId: `draft-mastodon:${status.id}`,
    rel: 'connections',
    size: 1,
    topPost: {
      id: status.id,
      created_at: status.created_at,
      replies_count: status.replies_count,
      favourites_count: status.favourites_count,
      favourited: status.favourited,
      bookmarked: status.bookmarked,
      content: status.content,
      account: {
        id: status.account.id,
        avatar: status.account.avatar,
        display_name: status.account.display_name || status.account.username,
        acct: status.account.acct,
        username: status.account.username,
      },
      content_rewritten: '',
      rewrite: { content: '', significant: false },
      relations: [],
      card: status.card ?? null,
    },
  };
}

export function SubmitPost({ appearance = 'card' }: { appearance?: 'card' | 'timeline' }) {
  // Local current user — reactive so the avatar reflects store identity.
  const currentUser = useLocalStore(() => getMe());
  const { token: accessToken } = useAccessToken();
  const {
    activePostId: panePostId,
    activeSurfaceKey: paneSurfaceKey,
    relatedStacks: paneStacks,
    leaveFeedSurface,
    setFromPost,
  } = useRelatedStacks();
  const [mastodonUser, setMastodonUser] = useState<MastodonAccount | null>(null);
  const [postText, setPostText] = useState('');
  const [feedback, setFeedback] = useState<{
    loading: boolean;
    advice?: string | null;
    praise?: string | null;
    simulatedReplies?: Array<{ id?: string; content: string }>;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const draftIdRef = useRef(`draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const feedbackMemoryRef = useRef<FeedbackMemoryEntry[]>([]);
  const feedbackReqIdRef = useRef(0);
  const hadDraftRef = useRef(false);
  const retrievalReqIdRef = useRef(0);
  const currentDraftStacksRef = useRef<any[]>([]);
  const previousPaneRef = useRef<{
    postId: string | null;
    surfaceKey: string | null;
    stacks: any[];
  } | null>(null);
  const composerSurfaceKeyRef = useRef(`composer:${draftIdRef.current}`);
  const paneStateRef = useRef({
    postId: panePostId,
    surfaceKey: paneSurfaceKey,
    stacks: paneStacks,
  });
  paneStateRef.current = {
    postId: panePostId,
    surfaceKey: paneSurfaceKey,
    stacks: paneStacks,
  };

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
    setFeedback((current) => ({ ...(current ?? {}), loading: true }));
    try {
      const res = await axios.post('https://beta.stacky.social:3002/posts/feedback', {
        draftID: draftIdRef.current,
        parentPostID: null,
        draftText: text,
        // The stable draft id lets the service keep its own session memory.
        // Sending a bounded transcript also makes refinements contextual when
        // requests are handled by different backend workers.
        feedbackHistory: feedbackMemoryRef.current.slice(-MAX_FEEDBACK_MEMORY),
      });
      if (requestId !== feedbackReqIdRef.current) return;
      const { advice, praise, simulatedReplies } = res.data || {};
      const normalizedAdvice = typeof advice === 'string' ? advice : null;
      const normalizedPraise = typeof praise === 'string' ? praise : null;
      const normalizedReplies = Array.isArray(simulatedReplies) ? simulatedReplies : [];
      feedbackMemoryRef.current = [
        ...feedbackMemoryRef.current,
        {
          draftText: text,
          advice: normalizedAdvice,
          praise: normalizedPraise,
          simulatedReplies: normalizedReplies,
        },
      ].slice(-MAX_FEEDBACK_MEMORY);
      setFeedback(
        normalizedAdvice || normalizedPraise || normalizedReplies.length > 0
          ? {
              loading: false,
              advice: normalizedAdvice,
              praise: normalizedPraise,
              simulatedReplies: normalizedReplies,
            }
          : null,
      );
    } catch (error) {
      if (requestId !== feedbackReqIdRef.current) return;
      console.error('Failed to fetch writing feedback:', error);
      setFeedback(null);
      setFeedbackError('Writing feedback could not load. You can still post this draft.');
    } finally {
      if (requestId === feedbackReqIdRef.current) setFeedbackLoading(false);
    }
  }, []);

  // Live writing feedback: debounce the draft and ask the same backend that
  // powers comment-draft feedback. The result stays directly below this box so
  // the related-post pane remains dedicated to the post currently in view.
  // The feedback service is remote; posting remains available if it is offline.
  useEffect(() => {
    const text = postText.trim();
    const requestId = ++feedbackReqIdRef.current;
    setFeedbackError(null);
    if (!text && hadDraftRef.current) {
      feedbackMemoryRef.current = [];
      draftIdRef.current = `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    }
    hadDraftRef.current = Boolean(text);
    if (text.length < 10) {
      setFeedback(null);
      setFeedbackLoading(false);
      return;
    }
    const t = setTimeout(() => void requestFeedback(text, requestId), 600);
    return () => clearTimeout(t);
  }, [postText, requestFeedback]);

  useEffect(() => () => {
    feedbackReqIdRef.current++;
  }, []);

  // The right pane stays useful while feedback moves below the composer. A
  // debounced content query searches the live Mastodon corpus plus the bundled
  // study corpus, then renders those results through the same related-card UI
  // used by feed posts. The previously focused feed post is restored when the
  // draft is cleared, so composing never destroys reading context.
  useEffect(() => {
    const text = postText.trim();
    const query = draftRetrievalQuery(text);
    const requestId = ++retrievalReqIdRef.current;
    const surfaceKey = composerSurfaceKeyRef.current;

    if (text.length < 10 || !query) {
      currentDraftStacksRef.current = [];
      const previous = previousPaneRef.current;
      previousPaneRef.current = null;
      if (paneStateRef.current.surfaceKey === surfaceKey) {
        leaveFeedSurface(surfaceKey);
        if (previous?.postId) {
          setFromPost(previous.stacks, previous.postId, {
            force: true,
            surfaceKey: previous.surfaceKey ?? undefined,
          });
        }
      }
      return;
    }

    if (!previousPaneRef.current && paneStateRef.current.surfaceKey !== surfaceKey) {
      previousPaneRef.current = {
        postId: paneStateRef.current.postId,
        surfaceKey: paneStateRef.current.surfaceKey,
        stacks: paneStateRef.current.stacks,
      };
    }

    // Claim the pane immediately so an old feed card is not mistaken for a
    // draft match while retrieval is in flight.
    setFromPost([], draftIdRef.current, { force: true, surfaceKey });
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const localById = new Map<string, LocalPost>();
      for (const term of query.split(' ')) {
        for (const post of searchPosts(term)) localById.set(post.id, post);
      }

      let remoteStatuses: MastodonStatus[] = [];
      if (accessToken) {
        try {
          remoteStatuses = (await searchMastodon(accessToken, query, controller.signal)).statuses;
        } catch (error) {
          if (!(error instanceof DOMException && error.name === 'AbortError')) {
            console.warn('Live draft retrieval was unavailable:', error);
          }
        }
      }
      if (controller.signal.aborted || requestId !== retrievalReqIdRef.current) return;

      const combined = [
        ...Array.from(localById.values()).map(retrievalStackFromLocal),
        ...remoteStatuses.map(retrievalStackFromMastodon),
      ];
      const unique = Array.from(new Map(
        combined.map((stack) => [stack.topPost.id, stack]),
      ).values()).slice(0, DRAFT_RETRIEVAL_LIMIT);
      currentDraftStacksRef.current = unique;
      setFromPost(unique, draftIdRef.current, { force: true, surfaceKey });
    }, 500);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [accessToken, leaveFeedSurface, postText, setFromPost]);

  useEffect(() => () => {
    retrievalReqIdRef.current++;
  }, []);

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
        createPost(text, currentDraftStacksRef.current);
      }
      notifications.show({
        title: 'Success',
        message: accessToken ? 'Posted to CrossWeave.' : 'Post created successfully.',
        color: 'green',
      });
      setPostText(''); // Clear the composer after posting.
      // Published text starts a genuinely new feedback conversation.
      feedbackReqIdRef.current++;
      setFeedback(null);
      setFeedbackError(null);
      setFeedbackLoading(false);
      feedbackMemoryRef.current = [];
      currentDraftStacksRef.current = [];
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
          <ProfileAvatar src={visibleUser.avatar} alt={visibleUser.display_name || 'Your profile'} radius="xl" size={42} />
        ) : (
          <ProfileAvatar alt="Your profile" radius="xl" size={42} />
        )}
        </div>

        <div className={classes.inputArea}>
          <Text className={classes.eyebrow}>Create a post</Text>
          <Textarea
          aria-label="Post text"
          placeholder="What do you want to share?"
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
                {feedbackLoading ? 'Checking your draft…' : 'Draft feedback updates as you write'}
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

      {feedback && (
        <div className={classes.feedbackPanel} role="status" aria-live="polite">
          <FeedbackBlock
            loading={feedback.loading}
            praise={feedback.praise}
            advice={feedback.advice}
            simulatedReplies={feedback.simulatedReplies}
            alignWithDraft
          />
        </div>
      )}
    </section>
  );
}
