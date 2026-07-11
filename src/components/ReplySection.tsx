"use client";

import React, { useState, useRef, useEffect } from 'react';
import { Avatar, Group, Button, Textarea } from "@mantine/core";
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
}

const MastodonInstanceUrl = 'https://beta.stacky.social';

const ReplySection: React.FC<ReplySectionProps> = ({ postId, currentUser, fetchPostAndReplies, onDraftActiveChange, stickyMode = false }) => {
    const [replyContent, setReplyContent] = useState<string>('');
    const [buttonLabel, setButtonLabel] = useState('Submit');
    const [advice, setAdvice] = useState<string | null>(null);
    const [praise, setPraise] = useState<string | null>(null);
    const [loading, setLoading] = useState<boolean>(false);
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
    const [countdown, setCountdown] = useState<number>(0);
    const [simulatedReplies, setSimulatedReplies] = useState<any[]>([]);

    const draftIdRef = useRef(uuidv4());
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
    const clearFeedback = () => {
        reqIdRef.current++; // invalidate any in-flight request
        if (debounceTimeoutRef.current) {
            clearTimeout(debounceTimeoutRef.current);
            debounceTimeoutRef.current = null;
        }
        setAdvice(null);
        setPraise(null);
        setSimulatedReplies([]);
        setLoading(false);
        setCountdown(0);
    };

    const handleReplyContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const newContent = e.currentTarget.value;
        setReplyContent(newContent);

        // Stopped writing: an (effectively) cleared draft takes its feedback with
        // it immediately — stale robots reacting to deleted text read as a bug.
        if (newContent.trim().length < 3) {
            clearFeedback();
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
        if (replyContent.trim().length === 0) clearFeedback();
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

        try {
            const response = await axios.post('https://beta.stacky.social:3002/posts/feedback', {
                draftID: draftIdRef.current,
                parentPostID: onDemo ? null : postId,
                draftText: inputContent
            });

            if (myReqId !== reqIdRef.current) return;

            const { advice, praise, simulatedReplies } = response.data;

            setAdvice(advice);
            setPraise(praise);
            setSimulatedReplies(simulatedReplies);

            if (advice && advice.length > 0) {
                setCountdown(5);
            } else {
                setCountdown(0);
            }
        }
        catch (error) {
            console.error('Failed to fetch real-time feedback:', error);
            // The offline demo (/ChineseEVs) isn't guaranteed a backend, so degrade
            // silently there — showing nothing beats firing a red error toast on
            // every keystroke when the presenter has no internet. On the live
            // surfaces a failed feedback call is worth surfacing to the user.
            if (myReqId === reqIdRef.current && !onDemo) {
                notifications.show({
                    title: 'Error',
                    message: 'Could not fetch writing feedback. Please try again.',
                    color: 'red',
                });
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
            addComment(postId, replyContent);

            setReplyContent('');
            setPraise(null);
            setAdvice(null);
            setSimulatedReplies([]);
            setCountdown(0);
            setButtonLabel('Submit');

            fetchPostAndReplies(postId);
        } catch (error) {
            console.error('Failed to post reply:', error);
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

            {/* Live draft feedback — shared presentation with the /home composer's
                aside panel (FeedbackBlock): "Feedback" title, praise + advice as
                one comment in one box, and the simulated replies formatted like
                actual replies (robot avatars, "Possible Reply" author, SIMULATED
                chip) hanging off thread connector lines. */}
            {!stickyMode && (advice || praise || simulatedReplies.length > 0 || loading) && (
                <div role="status" aria-live="polite">
                    <FeedbackBlock
                        loading={loading}
                        praise={praise}
                        advice={advice}
                        simulatedReplies={simulatedReplies}
                        attachedToDraft
                    />
                </div>
            )}
        </div>
    );
};

export default ReplySection;
