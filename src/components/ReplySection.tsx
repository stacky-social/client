"use client";

import React, { useState, useRef, useEffect } from 'react';
import { Avatar, Group, Button, Textarea, Paper, Text } from "@mantine/core";
import { notifications } from '@mantine/notifications';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { FeedbackBlock } from './SubmitPost/ComposerFeedback';
import { addComment } from '../utils/localStore';

interface ReplySectionProps {
    postId: string;
    currentUser: any;
    fetchPostAndReplies: (postId: string) => void;
    /** Reports whether a draft is in progress (non-empty reply box). The demo
     *  thread gates the composer's sticky pinning on this, so an idle composer
     *  scrolls away with the page instead of following the reader. */
    onDraftActiveChange?: (active: boolean) => void;
    /** Compact pinned composer mode: keep the draft controls visible while the
     *  full writing feedback remains only at the inline thread composer. */
    stickyMode?: boolean;
    /** Lets the thread reveal and focus the newly persisted local reply. */
    onReplyPosted?: (replyId: string) => void;
}

type FeedbackMemoryEntry = {
    draftText: string;
    advice: string | null;
    praise: string | null;
    simulatedReplies: Array<{ id?: string; content: string }>;
};

const MAX_FEEDBACK_MEMORY = 4;

const ReplySection: React.FC<ReplySectionProps> = ({ postId, currentUser, fetchPostAndReplies, onDraftActiveChange, stickyMode = false, onReplyPosted }) => {
    const [replyContent, setReplyContent] = useState<string>('');
    const [buttonLabel, setButtonLabel] = useState('Submit');
    const [advice, setAdvice] = useState<string | null>(null);
    const [praise, setPraise] = useState<string | null>(null);
    const [loading, setLoading] = useState<boolean>(false);
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
    const [countdown, setCountdown] = useState<number>(0);
    const [simulatedReplies, setSimulatedReplies] = useState<any[]>([]);
    const [feedbackError, setFeedbackError] = useState<string | null>(null);

    const draftIdRef = useRef(uuidv4());
    const feedbackMemoryRef = useRef<FeedbackMemoryEntry[]>([]);
    const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const reqIdRef = useRef(0);

    const isDisabled =
        isSubmitting ||
        loading ||
        countdown > 0 ||
        replyContent.trim().length === 0;

    useEffect(() => {
        if (countdown > 0) {
            setButtonLabel(`Wait ${countdown}s…`);
            if (!countdownIntervalRef.current) {
                countdownIntervalRef.current = setInterval(() => {
                    setCountdown((c) => Math.max(0, c - 1));
                }, 1000);
            }
        } else {
            setButtonLabel('Submit');
            if (countdownIntervalRef.current) {
                clearInterval(countdownIntervalRef.current);
                countdownIntervalRef.current = null;
            }
        }
    }, [countdown]);

    useEffect(() => {
        return () => {
            if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);
            if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
        };
    }, []);

    // Draft-in-progress signal, derived from the single source of truth
    // (replyContent) so every path reports — typing, deleting back to empty,
    // and the post-submit reset alike.
    useEffect(() => {
        onDraftActiveChange?.(replyContent.trim().length > 0);
    }, [replyContent, onDraftActiveChange]);

    /** Drop any visible/in-flight feedback — the draft no longer exists. */
    const clearFeedback = (resetMemory = false) => {
        reqIdRef.current++; // invalidate any in-flight request
        if (debounceTimeoutRef.current) {
            clearTimeout(debounceTimeoutRef.current);
            debounceTimeoutRef.current = null;
        }
        setAdvice(null);
        setPraise(null);
        setSimulatedReplies([]);
        setFeedbackError(null);
        setLoading(false);
        setCountdown(0);
        if (resetMemory) {
            feedbackMemoryRef.current = [];
            draftIdRef.current = uuidv4();
        }
    };

    const handleReplyContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const newContent = e.currentTarget.value;
        setReplyContent(newContent);

        // Stopped writing: an (effectively) cleared draft takes its feedback with
        // it immediately — stale robots reacting to deleted text read as a bug.
        if (newContent.trim().length < 3) {
            clearFeedback(newContent.trim().length === 0);
            return;
        }

        if (debounceTimeoutRef.current) {
            clearTimeout(debounceTimeoutRef.current);
        }
        debounceTimeoutRef.current = setTimeout(() => {
            void fetchRealTimeFeedback(newContent);
        }, 500);
    };

    /** Unfocusing an empty composer also dismisses leftover feedback. */
    const handleBlur = () => {
        if (replyContent.trim().length === 0) clearFeedback(true);
    };

    const fetchRealTimeFeedback = async (inputContent: string) => {
        if (inputContent.trim().length < 10) {
            return;
        }

        // The demo (/ChineseEVs) is served from local mock data, so its post ids
        // don't exist on the live feedback backend — passing one as parentPostID
        // makes the backend 500. Send null there (generic draft feedback derived
        // from the draft text, same as the /home composer) so simulated replies
        // still generate; live surfaces keep postId for real thread context.
        const onDemo = window.location.pathname.startsWith('/ChineseEVs');

        const myReqId = ++reqIdRef.current;
        setLoading(true);
        setFeedbackError(null);

        try {
            const response = await axios.post('https://beta.stacky.social:3002/posts/feedback', {
                draftID: draftIdRef.current,
                parentPostID: onDemo ? null : postId,
                draftText: inputContent,
                // Keep a short client-side transcript as well as the stable
                // draft id. This preserves refinement context even when two
                // feedback calls land on different backend workers.
                feedbackHistory: feedbackMemoryRef.current.slice(-MAX_FEEDBACK_MEMORY),
            });

            if (myReqId !== reqIdRef.current) return;

            const { advice, praise, simulatedReplies } = response.data || {};

            const normalizedAdvice = typeof advice === 'string' ? advice : null;
            const normalizedPraise = typeof praise === 'string' ? praise : null;
            const normalizedReplies = Array.isArray(simulatedReplies) ? simulatedReplies : [];

            setAdvice(normalizedAdvice);
            setPraise(normalizedPraise);
            setSimulatedReplies(normalizedReplies);
            const memoryEntry: FeedbackMemoryEntry = {
                draftText: inputContent,
                advice: normalizedAdvice,
                praise: normalizedPraise,
                simulatedReplies: normalizedReplies,
            };
            const previousMemory = feedbackMemoryRef.current;
            const retainedMemory = previousMemory.at(-1)?.draftText === inputContent
                ? previousMemory.slice(0, -1)
                : previousMemory;
            feedbackMemoryRef.current = [
                ...retainedMemory,
                memoryEntry,
            ].slice(-MAX_FEEDBACK_MEMORY);

            if (advice && advice.length > 0) {
                setCountdown(5);
            } else {
                setCountdown(0);
            }
        }
        catch (error) {
            console.error('Failed to fetch real-time feedback:', error);
            if (myReqId === reqIdRef.current) {
                setFeedbackError('Writing feedback could not load. You can still post this reply.');
            }
            setCountdown(0);
        }
        finally {
            if (myReqId === reqIdRef.current) {
                setLoading(false);
            }
        }
    };

    const handleReplySubmit = async () => {
        if (isDisabled) return;

        setIsSubmitting(true);
        try {
            // Local mode: persist the reply through the local store. It is created
            // as a Post-shaped Comment authored by the local user "me" with
            // in_reply_to_id === postId, so thread views render it directly.
            const postedReply = addComment(postId, replyContent);

            setReplyContent('');
            setPraise(null);
            setAdvice(null);
            setSimulatedReplies([]);
            setFeedbackError(null);
            setCountdown(0);
            setButtonLabel('Submit');
            feedbackMemoryRef.current = [];
            draftIdRef.current = uuidv4();

            fetchPostAndReplies(postId);
            onReplyPosted?.(postedReply.id);
            notifications.show({
                title: 'Reply posted',
                message: 'Your reply is now visible in the conversation.',
                color: 'green',
            });
        } catch (error) {
            console.error('Failed to post reply:', error);
            notifications.show({
                title: 'Reply not posted',
                message: 'Your draft was kept. Please try again.',
                color: 'red',
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontFamily: 'Roboto, sans-serif' }}>
            <Group align="flex-start" wrap="nowrap" style={{ position: 'relative' }}>
                {/* Rail bridge: spans the composer row itself (top pinned just
                    under the avatar, bottom pinned to the row's bottom edge +
                    the 10px flex gap), so the simulated-reply thread rail
                    reaches the user's PHOTO no matter how many lines the
                    draft wraps to. Same x/color as FeedbackBlock's rail. */}
                {!stickyMode && !loading && simulatedReplies.length > 0 && (
                    <div
                        aria-hidden
                        data-testid="draft-rail-bridge"
                        style={{
                            position: 'absolute', left: 19, top: 36, bottom: -10,
                            width: 2, background: '#cbd5e1', zIndex: 0,
                        }}
                    />
                )}
                <Avatar src={currentUser?.avatar || undefined} alt="Current User" radius="xl" />
                <Textarea
                    placeholder="Post your reply"
                    variant="unstyled"
                    radius="lg"
                    size="xl"
                    autosize
                    minRows={stickyMode ? 1 : 2}
                    maxRows={stickyMode ? 3 : undefined}
                    resize="none"
                    value={replyContent}
                    onChange={handleReplyContentChange}
                    onBlur={handleBlur}
                    style={{ flex: 1, fontFamily: 'Roboto, sans-serif', fontSize: '16px' }}
                    styles={{
                        input: {
                            lineHeight: 1.45,
                        },
                    }}
                />
                <Button
                    onClick={handleReplySubmit}
                    disabled={isDisabled}
                    style={{ backgroundColor: isDisabled ? 'grey' : 'green' }}
                >
                    {buttonLabel}
                </Button>
            </Group>

            {/* Use the latest shared robot-thread presentation for successful
                feedback. A failed request replaces stale feedback with a clear,
                retryable error while the user's draft remains untouched. */}
            {!stickyMode && (advice || praise || simulatedReplies.length > 0 || loading || feedbackError) && (
                <div role="status" aria-live="polite">
                    {feedbackError && !loading ? (
                        <Paper withBorder p="sm" radius="md" role="alert" style={{ background: '#fff2ef', borderColor: '#e6b9b1' }}>
                            <Group justify="space-between" align="flex-start" wrap="nowrap">
                                <Text size="xs" c="#8a2f2f">{feedbackError}</Text>
                                <Button
                                    variant="subtle"
                                    color="red"
                                    size="compact-xs"
                                    onClick={() => void fetchRealTimeFeedback(replyContent)}
                                >
                                    Retry
                                </Button>
                            </Group>
                        </Paper>
                    ) : (
                        <FeedbackBlock
                            loading={loading}
                            praise={praise}
                            advice={advice}
                            simulatedReplies={simulatedReplies}
                            attachedToDraft
                        />
                    )}
                </div>
            )}
        </div>
    );
};

export default ReplySection;
