"use client";

import React, { useState, useRef, useEffect } from 'react';
import { Avatar, Group, Button, Text, Stack, Paper, Badge, Loader, TextInput } from "@mantine/core";
import { notifications } from '@mantine/notifications';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { pickAvatarForText } from '../utils/sentimentAvatar';
import { addComment } from '../utils/localStore';

interface ReplySectionProps {
    postId: string;
    currentUser: any;
    fetchPostAndReplies: (postId: string) => void;
}

const MastodonInstanceUrl = 'https://beta.stacky.social';

const ReplySection: React.FC<ReplySectionProps> = ({ postId, currentUser, fetchPostAndReplies }) => {
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

    const handleReplyContentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newContent = e.target.value;
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
        // Local/demo mode: the mock thread route has no live backend, so the
        // draft-feedback POST would only ever fail silently — skip it entirely.
        if (window.location.pathname.startsWith('/ChineseEVs')) {
            return;
        }
        if (inputContent.trim().length < 10) {
            return;
        }

        const myReqId = ++reqIdRef.current;
        setLoading(true);

        try {
            const response = await axios.post('https://beta.stacky.social:3002/posts/feedback', {
                draftID: draftIdRef.current,
                parentPostID: postId,
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
            if (myReqId === reqIdRef.current) {
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
            <Group>
                <Avatar src={currentUser?.avatar || undefined} alt="Current User" radius="xl" />
                <TextInput
                    placeholder="Post your reply"
                    variant="unstyled"
                    radius="lg"
                    size="xl"
                    value={replyContent}
                    onChange={handleReplyContentChange}
                    onBlur={handleBlur}
                    style={{ flex: 1, fontFamily: 'Roboto, sans-serif', fontSize: '16px' }}
                />
                <Button
                    onClick={handleReplySubmit}
                    disabled={isDisabled}
                    style={{ backgroundColor: isDisabled ? 'grey' : 'green' }}
                >
                    {buttonLabel}
                </Button>
            </Group>

            {(advice || praise || simulatedReplies.length > 0 || loading) && (
                <Paper
                    style={{
                        padding: '10px',
                        backgroundColor: '#f9f9f9',
                        borderRadius: '8px',
                        fontFamily: 'Roboto, sans-serif',
                        fontSize: '14px',
                    }}
                >
                    {loading ? (
                        <Loader size="sm" />
                    ) : (
                        <>
                            {(advice || praise) && (
                                <div style={{ marginBottom: '10px' }}>
                                    <Text fw="900" size="xl">Feedback</Text>
                                    {praise && <Text mt={4}>{praise}</Text>}
                                    {advice && <Text mt={4}>{advice}</Text>}
                                </div>
                            )}

                            {simulatedReplies.length > 0 && (
                                <Stack>
                                    {simulatedReplies.map((reply, index) => (
                                        <div key={reply.id ?? reply.content} style={{ position: 'relative' }}>
                                            <Paper
                                                style={{
                                                    position: 'relative',
                                                    width: "100%",
                                                    backgroundColor: '#fff',
                                                    zIndex: 5,
                                                    boxShadow: '0 3px 10px rgba(0,0,0,0.1)',
                                                    borderRadius: '8px',
                                                    padding: '10px',
                                                    fontFamily: 'Roboto, sans-serif',
                                                    fontSize: '14px',
                                                }}
                                            >
                                                <Group>
                                                    <Avatar src={pickAvatarForText(reply.content)} radius="xl" />
                                                    <div>
                                                        <Text fw="700" size="sm">Robot {index + 1}</Text>
                                                    </div>
                                                </Group>
                                                <Text>{reply.content}</Text>
                                                <Badge
                                                    color="gray"
                                                    variant="outline"
                                                    tt="uppercase"
                                                    fw={700}
                                                    style={{
                                                        position: 'absolute',
                                                        top: '10px',
                                                        right: '10px',
                                                        fontSize: '10px',
                                                    }}
                                                >
                                                    Simulated
                                                </Badge>
                                            </Paper>
                                        </div>
                                    ))}
                                </Stack>
                            )}
                        </>
                    )}
                </Paper>
            )}
        </div>
    );
};

export default ReplySection;
