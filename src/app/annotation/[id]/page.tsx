"use client";
import React, { useState, useEffect } from 'react';
import { Container, Paper, Group, Avatar, Text, LoadingOverlay, Divider, Button } from '@mantine/core';
import { IconHeart, IconBookmark, IconMessageCircle, IconHeartFilled, IconBookmarkFilled, IconGripVertical, IconThumbUp, IconThumbDown, IconThumbUpFilled, IconThumbDownFilled } from '@tabler/icons-react';
import { rem } from '@mantine/core';
import axios from 'axios';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';

const MastodonInstanceUrl = "https://beta.stacky.social";

interface PostType {
    id: string;
    created_at: string;
    replies_count: number;
    favourites_count: number;
    favourited: boolean;
    bookmarked: boolean;
    content: string;
    account: {
        avatar: string;
        display_name: string;
        username: string;
    };
}

interface RelatedPostType {
    content: string;
    postID: string;
    agree: boolean;
    disagree: boolean;
}

interface TaskType {
    TaskID: string;
    candidate_related_posts: RelatedPostType[];
    focus_postID: string;
}

const PostCard = ({ post, isFocusPost }: { post: PostType, isFocusPost?: boolean }) => (
    <Paper withBorder radius="md" mt={20} p="lg" style={{ position: 'relative', zIndex: 5, backgroundColor: isFocusPost ? '#C5F6FA' : 'inherit' }}>
        <Group>
            <Avatar src={post.account.avatar} alt={post.account.username} radius="xl" />
            <div>
                <Text size="sm">{post.account.username}</Text>
                <Text size="xs">{new Date(post.created_at).toLocaleString()}</Text>
            </div>
        </Group>
        <Text pl={54} pt="sm" size="sm" dangerouslySetInnerHTML={{ __html: post.content }} />
        <Divider my="md" />
        <Group>
            <Button variant="subtle" size="sm" radius="lg">
                <IconMessageCircle size={20} /> <Text ml={4}>{post.replies_count}</Text>
            </Button>
            <Button variant="subtle" size="sm" radius="lg" style={{ display: 'flex', alignItems: 'center' }}>
                {post.favourited ? <IconHeartFilled size={20} /> : <IconHeart size={20} />} <Text ml={4}>{post.favourites_count}</Text>
            </Button>
            <Button variant="subtle" size="sm" radius="lg" style={{ display: 'flex', alignItems: 'center' }}>
                {post.bookmarked ? <IconBookmarkFilled size={20} /> : <IconBookmark size={20} />}
            </Button>
        </Group>
    </Paper>
);

const RightColumn = ({ relatedPosts, setRelatedPosts }: { relatedPosts: RelatedPostType[], setRelatedPosts: React.Dispatch<React.SetStateAction<RelatedPostType[]>> }) => {
    const handleAgree = (postID: string) => {
        setRelatedPosts(prevPosts =>
            prevPosts.map(post =>
                post.postID === postID ? { ...post, agree: !post.agree } : post
            )
        );
    };

    const handleDisagree = (postID: string) => {
        setRelatedPosts(prevPosts =>
            prevPosts.map(post =>
                post.postID === postID ? { ...post, disagree: !post.disagree } : post
            )
        );
    };

    return (
        <div style={{ flex: 1, paddingLeft: rem(10) }}>
            <DragDropContext onDragEnd={({ destination, source }) => {
                if (destination) {
                    const reorderedPosts = Array.from(relatedPosts);
                    const [removed] = reorderedPosts.splice(source.index, 1);
                    reorderedPosts.splice(destination.index, 0, removed);
                    setRelatedPosts(reorderedPosts);
                }
            }}>
                <Droppable droppableId="post-list" direction="vertical">
                    {(provided) => (
                        <div {...provided.droppableProps} ref={provided.innerRef}>
                            {relatedPosts.map((post, index) => (
                                <Draggable key={post.postID} draggableId={post.postID} index={index}>
                                    {(provided, snapshot) => (
                                        <div
                                            ref={provided.innerRef}
                                            {...provided.draggableProps}
                                            style={{
                                                ...provided.draggableProps.style,
                                                display: 'flex',
                                                alignItems: 'center',
                                                borderRadius: 'var(--mantine-radius-md)',
                                                border: `${rem(1)} solid`,
                                                padding: `${rem(10)} ${rem(20)}`,
                                                paddingLeft: `calc(${rem(20)} - ${rem(10)})`,
                                                backgroundColor: snapshot.isDragging ? 'lightgrey' : 'white',
                                                marginBottom: `${rem(10)}`
                                            }}
                                        >
                                            <div {...provided.dragHandleProps} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', paddingRight: rem(10) }}>
                                                <IconGripVertical style={{ width: rem(18), height: rem(18) }} stroke={1.5} />
                                            </div>

                                           
                                                <Paper withBorder radius="md" p="lg">
                                                    <Text size="sm">{post.content}</Text>
                                                    <Divider my="md" />
                                                    <Group>
                                                        <Button variant="subtle" size="sm" radius="lg" onClick={() => handleAgree(post.postID)} style={{ display: 'flex', alignItems: 'center' }}>
                                                            {post.agree ? <IconThumbUpFilled size={20} /> : <IconThumbUp size={20} />} <Text ml={4}>Agree</Text>
                                                        </Button>
                                                        <Button variant="subtle" size="sm" radius="lg" onClick={() => handleDisagree(post.postID)} style={{ display: 'flex', alignItems: 'center' }}>
                                                            {post.disagree ? <IconThumbDownFilled size={20} /> : <IconThumbDown size={20} />} <Text ml={4}>Disagree</Text>
                                                        </Button>
                                                    </Group>
                                                </Paper>
                                            
                                        </div>
                                    )}
                                </Draggable>
                            ))}
                            {provided.placeholder}
                        </div>
                    )}
                </Droppable>
            </DragDropContext>
        </div>
    );
};

export default function Annotation() {
    const [post, setPost] = useState<PostType | null>(null);
    const [replies, setReplies] = useState<PostType[]>([]);
    const [ancestors, setAncestors] = useState<PostType[]>([]);
    const [loading, setLoading] = useState(true);
    const [relatedPosts, setRelatedPosts] = useState<RelatedPostType[]>([]);
    const [taskID, setTaskID] = useState<string | null>(null);
    const [taskList, setTaskList] = useState<TaskType[]>([]);
    const [currentTaskIndex, setCurrentTaskIndex] = useState(0);

    useEffect(() => {
        fetchTaskList();
    }, []);

    const fetchPostAndReplies = async (postId: string) => {
        const accessToken = localStorage.getItem('accessToken');
        if (!accessToken) {
            console.error('Access token is missing.');
            setLoading(false);
            return;
        }

        try {
            const postResponse = await axios.get(`${MastodonInstanceUrl}/api/v1/statuses/${postId}`, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });
            setPost(postResponse.data);

            const repliesResponse = await axios.get(`${MastodonInstanceUrl}/api/v1/statuses/${postId}/context`, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });

            setReplies(repliesResponse.data.descendants);
            setAncestors(repliesResponse.data.ancestors);

        } catch (error) {
            console.error('Failed to fetch post or replies:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchTaskList = async () => {
        setLoading(true);
        try {
            const response = await axios.get('https://beta.stacky.social:3002/annotation/task'); // Assume this endpoint returns a list of tasks
            const data: TaskType[] = response.data;
            setTaskList(data);
            setCurrentTaskIndex(0);
            loadTask(data[0]);
        } catch (error) {
            console.error('Failed to fetch task list:', error);
        } finally {
            setLoading(false);
        }
    };

    const loadTask = (task: TaskType) => {
        console.log('Loading task:', task);
        setTaskID(task.TaskID);
        const placeholders: RelatedPostType[] = [
            { content: "Above this is good", postID: "-1", agree: false, disagree: false },
            { content: "Below this is bad", postID: "-2", agree: false, disagree: false },
        ];
        setRelatedPosts([...placeholders, ...task.candidate_related_posts]);
        fetchPostAndReplies(task.focus_postID);
    };

    const handleNextTask = () => {
        console.log('Current task index:', currentTaskIndex);
        if (currentTaskIndex < taskList.length - 1) {
            const nextIndex = currentTaskIndex + 1;
            setCurrentTaskIndex(nextIndex);
            loadTask(taskList[nextIndex]);
        } else {
            alert('No more tasks.');
        }
    };

    const handleSubmit = async () => {
        const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
        const userID = currentUser.id; 

        if (!taskID || !userID) {
            console.error('Task ID or User ID is missing.');
            return;
        }

        const orderedRelatedPosts = relatedPosts.map(post => ({
            postID: post.postID,
            content: post.content,
            agree: post.agree,
            disagree: post.disagree
        }));

        const payload = {
            taskID,
            userID,
            ordered_related_posts: orderedRelatedPosts
        };

        console.log('Submitting:', payload);

        try {
            await axios.post('https://beta.stacky.social:3002/annotation/submit', payload);
            alert('Submission successful!');
        } catch (error) {
            console.error('Failed to submit:', error);
            alert('Submission failed.');
        }
    };

    return (
        <Container fluid>
            <div style={{ marginBottom: rem(20) }}>
            <Button style={{ marginRight: rem(20) }} onClick={handleNextTask}>PREVIOUS</Button>
                <Button style={{ marginRight: rem(20) }} onClick={fetchTaskList}>GET NEW TASK LIST</Button>
                <Button style={{ marginRight: rem(20) }} onClick={handleSubmit}>SUBMIT</Button>
                <Button onClick={handleNextTask}>NEXT</Button>
            </div>
            <div style={{ display: 'flex', width: '100%' }}>
                <div style={{ width: '35%', paddingRight: rem(10) }}>
                    {loading && <LoadingOverlay visible={loading} />}
                    {ancestors.map(ancestor => (
                        <PostCard key={ancestor.id} post={ancestor} />
                    ))}
                    {post && <PostCard post={post} isFocusPost={true} />}
                    {/* {replies.map(reply => (
                        <PostCard key={reply.id} post={reply} />
                    ))} */}
                </div>
                <RightColumn relatedPosts={relatedPosts} setRelatedPosts={setRelatedPosts} />
            </div>
        </Container>
    );
}
