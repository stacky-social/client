import React, { useState, useRef, useEffect } from 'react';
import { Avatar, Group, Textarea, Button, Text, Stack, Divider, Paper, Badge, Loader } from "@mantine/core";
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { formatDistanceToNow } from 'date-fns';

interface ReplySectionProps {
    postId: string;
    currentUser: any;
    fetchPostAndReplies: (postId: string) => void;
}

const MastodonInstanceUrl = 'https://beta.stacky.social';

const avatars = [
    '/avatar/stacky_angry.PNG',
    '/avatar/stacky_cracked.PNG',
    '/avatar/stacky_default.PNG',
    '/avatar/stacky_haha.PNG',
    '/avatar/stacky_love.PNG',
    '/avatar/stacky_queasy.PNG',
    '/avatar/stacky_sad.PNG',
    '/avatar/stacky_sweet.PNG'
];

const ReplySection: React.FC<ReplySectionProps> = ({ postId, currentUser, fetchPostAndReplies }) => {
    const [replyContent, setReplyContent] = useState<string>('');
    const [buttonLabel, setButtonLabel] = useState('Submit?');
    const [buttonDisabled, setButtonDisabled] = useState(true);
    const [advice, setAdvice] = useState<string | null>(null);
    const [praise, setPraise] = useState<string | null>(null);
    const [loading, setLoading] = useState<boolean>(false);  // 新增的 loading 状态

    const [countdown, setCountdown] = useState<number | null>(null);
    const feedbackTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const draftId = useRef(uuidv4()).current;
    const [simulatedReplies, setSimulatedReplies] = useState<any[]>([]);
    const [avatar, setAvatar] = useState(avatars[0]); 

    const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
        
        if (debounceTimeoutRef.current) {
            clearTimeout(debounceTimeoutRef.current);
        }

        debounceTimeoutRef.current = setTimeout(() => {
            fetchRealTimeFeedback(newContent);
        }, 1000); // 等待1秒后发送请求
    };

    const fetchRealTimeFeedback = async (inputContent: string) => {
        setLoading(true);  // 开始加载
        try {
            const response = await axios.post('https://beta.stacky.social:3002/posts/feedback', {
                draftID: draftId,
                parentPostID: postId,
                draftText: inputContent
            });

            const { advice, praise, simulatedReplies } = response.data;

            setAdvice(advice);
            setPraise(praise);
            setSimulatedReplies(simulatedReplies);

            const isSignificantChange = advice && advice.length > 0;

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
        } finally {
            setLoading(false);  // 加载结束
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
            setPraise(null);
            setAdvice(null);
            setSimulatedReplies([]);
            fetchPostAndReplies(postId);
        } catch (error) {
            console.error('Failed to post reply:', error);
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontFamily: 'Roboto, sans-serif' }}>
            <Group>
                <Avatar src={currentUser?.avatar || 'defaultAvatarUrl'} alt="Current User" radius="xl" />
                <Textarea
                    placeholder="Post your reply"
                    radius="lg"
                    size="xl"
                    value={replyContent}
                    onChange={handleReplyContentChange}
                    style={{ flex: 1, fontFamily: 'Roboto, sans-serif', fontSize: '16px' }}
                />
                <Button onClick={handleReplySubmit} disabled={buttonDisabled} style={{ backgroundColor: buttonDisabled ? 'grey' : 'green' }}>
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
                                <Paper
                                    style={{
                                        padding: '10px',
                                        backgroundColor: '#f9f9f9',
                                        borderRadius: '8px',
                                        fontFamily: 'Roboto, sans-serif',
                                        fontSize: '14px',
                                        marginBottom: '10px'
                                    }}
                                >
                                    <Text fw="900" size="xl">Feedback</Text>
                                    {praise && <Text >{praise}</Text>}
                                    {advice && <Text>{advice}</Text>}
                                </Paper>
                            )}

                            {simulatedReplies.length > 0 && (
                                <Stack>
                                    {simulatedReplies.map((reply, index) => (
                                        <div key={index} style={{ position: 'relative' }}>
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
                                                    <Avatar src={avatar} radius="xl" />
                                                    <div>
                                                        <Text fw="700" size="sm">Robot {index + 1}</Text>
                                                    </div>
                                                </Group>
                                                <Text>{reply.content}</Text>
                                                <Badge
                                                    color="gray"
                                                    variant="outline"
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
