"use client";

import React, { useState, useRef, useEffect } from 'react';
import { Avatar, Group, Textarea, Button,Text,Stack } from "@mantine/core";
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { set } from 'date-fns';

interface ReplySectionProps {
    postId: string;
    currentUser: any;
    fetchPostAndReplies: (postId: string) => void;
}

const MastodonInstanceUrl = 'https://beta.stacky.social';

const ReplySection: React.FC<ReplySectionProps> = ({ postId, currentUser, fetchPostAndReplies }) => {
    const [replyContent, setReplyContent] = useState<string>('');
    const [buttonLabel, setButtonLabel] = useState('Submit?');
    const [buttonDisabled, setButtonDisabled] = useState(true);
    const [score, setScore] = useState<number | null>(null);
    const [feedback, setFeedback] = useState<string | null>(null);
    const [countdown, setCountdown] = useState<number | null>(null);
    const feedbackTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const draftId = useRef(uuidv4()).current;

    const fakeData = {
        score: 85,
        advice: "Your input is positive, keep it concise.",
        isSignificantChange: true,
        simulatedReplies: [
            {
                postId: uuidv4(),
                content: "This is a simulated reply 1.",
                author: "Author 1",
                createdAt: new Date().toISOString(),
                isSynthetic: false
            },
            {
                postId: uuidv4(),
                content: "This is a simulated reply 2.",
                author: "Author 2",
                createdAt: new Date().toISOString(),
                isSynthetic: true
            },
            {
                postId: uuidv4(),
                content: "This is a simulated reply 3.",
                author: "Author 3",
                createdAt: new Date().toISOString(),
                isSynthetic: false
            }
        ]
    };

    useEffect(() => {
        if (countdown === null || countdown === 0) return;

        const timer = setInterval(() => {
            setCountdown(prev => {
                if (prev === null || prev <= 1) {
                    clearInterval(timer);
                    setButtonLabel('Submit!');
                    setButtonDisabled(false);
                    return null;
                } else {
                    setButtonLabel(`Submit? (Wait ${prev - 1} seconds)`);
                    return prev - 1;
                }
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [countdown]);


    const handleReplyContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const newContent = e.target.value;
        setReplyContent(newContent);
        setButtonLabel('Submit?');
        setButtonDisabled(true);
        setScore(null);
        setFeedback(null);
        fetchRealTimeFeedback(newContent);
    };

    const fetchRealTimeFeedback = async (inputContent: string) => {
        try {
            const response = fakeData;
            const { score,advice,isSignificantChange } = response;

            setScore(score);
            setFeedback(advice);

            
            if (isSignificantChange) {
                setCountdown(5);
                setButtonDisabled(true);
                setButtonLabel('Submit? (Wait 5 seconds)');
                if (feedbackTimeoutRef.current) {
                    clearTimeout(feedbackTimeoutRef.current);
                }

                feedbackTimeoutRef.current = setTimeout(() => {
                    setCountdown(null);
                    setButtonLabel('Submit!');
                    setButtonDisabled(false);
                }, 5000);
            } else {
                setButtonLabel('Submit!');
                setButtonDisabled(false);
            }
        } catch (error) {
            console.error('Failed to fetch real-time feedback:', error);
        }
    };

    const handleReplySubmit = async () => {
        const accessToken = localStorage.getItem('accessToken');
        if (!accessToken) {
            console.error('Access token is missing.');
            return;
        }

        try {
            await axios.post(`${MastodonInstanceUrl}/api/v1/statuses`, {
                status: replyContent,
                in_reply_to_id: postId
            }, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });
            setReplyContent('');
            setScore(null);
            setFeedback(null);
            fetchPostAndReplies(postId); // Refresh replies after posting
        } catch (error) {
            console.error('Failed to post reply:', error);
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <Group>
                <Avatar src={currentUser?.avatar || 'defaultAvatarUrl'} alt="Current User" radius="xl" />
                <Textarea
                    placeholder="Post your reply"
                    radius="lg"
                    size="xl"
                    value={replyContent}
                    onChange={handleReplyContentChange}
                    style={{ flex: 1 }}
                />
                <Button onClick={handleReplySubmit} disabled={buttonDisabled} style={{ backgroundColor: buttonDisabled ? 'grey' : 'green' }}>
                    {buttonLabel}
                </Button>
            </Group>
            {score !== null && feedback !== null && (
                <div>
                    <Text>Score: {score}</Text>
                    <Text>Feedback: {feedback}</Text>
                </div>
            )}
        </div>
    );
};

export default ReplySection;