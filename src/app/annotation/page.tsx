"use client";
import React, { useState, useEffect } from 'react';
import { Container, Paper, Group, Avatar, Text, LoadingOverlay, Divider, Button, Card, Progress } from '@mantine/core';
import { IconHeart, IconBookmark, IconMessageCircle, IconHeartFilled, IconBookmarkFilled, IconGripVertical, IconThumbUp, IconThumbDown, IconThumbUpFilled, IconThumbDownFilled } from '@tabler/icons-react';
import { rem } from '@mantine/core';
import axios from 'axios';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';

const MastodonInstanceUrl = "https://beta.stacky.social";

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
    itemIndex: number;  
    viewed:boolean;
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
        <div style={{ flex: 1, paddingLeft: rem(10), paddingTop: rem(20) }}>
            <DragDropContext onDragEnd={({ destination, source }) => {
                if (destination) {
                    const reorderedPosts = Array.from(relatedPosts);
                    const [removed] = reorderedPosts.splice(source.index, 1);
                    reorderedPosts.splice(destination.index, 0, removed);
                    console.log('Reordered Posts:', reorderedPosts);
                    setRelatedPosts(reorderedPosts);
                }
            }}>
                <Droppable droppableId="post-list" direction="vertical">
                    {(provided) => (
                        <div {...provided.droppableProps} ref={provided.innerRef}>
                            {relatedPosts.map((post, index) => (
                               <Draggable key={post.postID} draggableId={String(post.postID)} index={index}>

                                    {(provided, snapshot) => {
                                        const postIDNumber = Number(post.postID);
                                        return (
                                            <div
                                                ref={provided.innerRef}
                                                {...provided.draggableProps}
                                                style={{
                                                    ...provided.draggableProps.style,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    borderRadius: 'var(--mantine-radius-md)',
                                                    border: `${rem(1)} solid`,
                                                    borderColor: 'var(--mantine-color-gray-2)',
                                                    padding: `${rem(10)} ${rem(20)}`,
                                                    paddingLeft: `calc(${rem(20)} - ${rem(10)})`,
                                                    backgroundColor: snapshot.isDragging ? 'lightgrey' : (postIDNumber < 0 ? "#ffcccc" : 'white'),
                                                    marginBottom: `${rem(10)}`
                                                }}
                                            >
                                                <div {...provided.dragHandleProps} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', paddingRight: rem(10) }}>
                                                    <IconGripVertical style={{ width: rem(18), height: rem(18) }} stroke={1.5} />
                                                </div>

                                                {postIDNumber > 0 ? (
                                                    <Paper withBorder radius="md" p="lg">
                                                        <Text size="sm">{post.content}</Text>
                                                        <Divider my="md" />
                                                        <Group>
                                                            <Button variant="subtle" size="sm" radius="lg" onClick={() => handleAgree(post.postID)} style={{ display: 'flex', alignItems: 'center' }}>
                                                                {post.agree ? <IconThumbUpFilled size={20} /> : <IconThumbUp size={20} />} <Text ml={4}>Agrees</Text>
                                                            </Button>
                                                            <Button variant="subtle" size="sm" radius="lg" onClick={() => handleDisagree(post.postID)} style={{ display: 'flex', alignItems: 'center' }}>
                                                                {post.disagree ? <IconThumbDownFilled size={20} /> : <IconThumbDown size={20} />} <Text ml={4}>Disagrees</Text>
                                                            </Button>
                                                        </Group>
                                                    </Paper>
                                                ) : (
                                                    <Text size="sm">{post.content}</Text>
                                                )}
                                            </div>
                                        );
                                    }}
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

const AvatarDisplay = ({ avatar }: { avatar: string }) => {
    return <Avatar src={avatar} alt="Random Avatar" radius="xl" size={rem(80)} />;
};

const ProgressCard = ({ currentTaskIndex, totalTasks }: { currentTaskIndex: number, totalTasks: number }) => {
    const progress = ((currentTaskIndex + 1) / totalTasks) * 100;

    return (
        <Card withBorder radius="md" padding="xl" bg="var(--mantine-color-body)">
            <Text fz="xs" tt="uppercase" fw={700} c="dimmed">
                Task Progress
            </Text>
            <Text fz="lg" fw={500}>
                {currentTaskIndex + 1} / {totalTasks}
            </Text>
            <Progress value={progress} mt="md" size="lg" radius="xl" />
        </Card>
    );
};

export default function Annotation() {
    const [post, setPost] = useState<PostType | null>(null);
    const [replies, setReplies] = useState<PostType[]>([]);
    const [ancestors, setAncestors] = useState<PostType[]>([]);
    const [loading, setLoading] = useState(false);
    const [relatedPosts, setRelatedPosts] = useState<RelatedPostType[]>([]);
    const [taskID, setTaskID] = useState<string | null>(null);
    const [taskList, setTaskList] = useState<TaskType[]>([]);
    const [currentTaskIndex, setCurrentTaskIndex] = useState(0);
    const [taskChanges, setTaskChanges] = useState<Record<string, Record<number, RelatedPostType[]>>>({});
    const [avatar, setAvatar] = useState(avatars[0]); 
    

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
            console.log('Post:', postResponse.data);

            const repliesResponse = await axios.get(`${MastodonInstanceUrl}/api/v1/statuses/${postId}/context`, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });

            setReplies(repliesResponse.data.descendants);
            setAncestors(repliesResponse.data.ancestors);

        } catch (error) {
            console.error('Failed to fetch post or replies:', error);
        }
    };

    const fetchTaskList = async () => {
        setLoading(true);
        const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
        const userID = currentUser.id; 
        try {
     
            setTaskList([]);
            setCurrentTaskIndex(0);
            setRelatedPosts([]);
            
            const response = await axios.get('https://beta.stacky.social:3002/annotation/task', {
                params: { user_id: userID },
            }); 
            const data: TaskType[] = response.data;
            const dataWithIndex = data.map((task, index) => ({
                ...task,
                itemIndex: index,
                viewed: false
            }));
            
            setTaskList(dataWithIndex);
            loadTask(dataWithIndex[0]);
        } catch (error) {
            console.error('Failed to fetch task list:', error);
        } finally {
            setLoading(false);
        }
        refreshAvatar();
    };
    

    const loadTask = (task: TaskType) => {
        console.log('Loading task:', task);
        setTaskID(task.TaskID);
        const savedChanges = taskChanges[task.TaskID]?.[task.itemIndex];
        if (savedChanges) {
            setRelatedPosts(savedChanges);
        } else {
            const placeholders: RelatedPostType[] = [
                { content: "", postID: "-1", agree: false, disagree: false },
                { content: "", postID: "-2", agree: false, disagree: false },
            ];
            setRelatedPosts([...placeholders, ...task.candidate_related_posts]);
        }
        fetchPostAndReplies(task.focus_postID);

        setTaskList(prevTasks =>
            prevTasks.map(t =>
                t.itemIndex === task.itemIndex ? { ...t, viewed: true } : t
            )
        );
    };

    const saveCurrentTaskChanges = () => {
        if (taskID !== null) {
            setTaskChanges(prev => ({
                ...prev,
                [taskID]: {
                    ...prev[taskID],
                    [currentTaskIndex]: relatedPosts
                }
            }));
        }
    };

    const handleNextTask = () => {
        console.log('Current task index:', currentTaskIndex);
        saveCurrentTaskChanges();
        if (currentTaskIndex < taskList.length - 1) {
            const nextIndex = currentTaskIndex + 1;
            setCurrentTaskIndex(nextIndex);
            loadTask(taskList[nextIndex]);
        } else {
            alert('No more tasks.');
        }
        refreshAvatar();
    };

    const handlePreviousTask = () => {
        console.log('Current task index:', currentTaskIndex);
        saveCurrentTaskChanges();
        if (currentTaskIndex > 0) {
            const nextIndex = currentTaskIndex - 1;
            setCurrentTaskIndex(nextIndex);
            loadTask(taskList[nextIndex]);
        } else {
            alert('No more tasks.');
        }
        refreshAvatar();
    };

    const handleSubmit = async () => {
        saveCurrentTaskChanges();
        const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
        const userID = currentUser.id; 

        if (!userID) {
            console.error('User ID is missing.');
            return;
        }

        const allViewed = taskList.every(task => task.viewed);
        console.log(taskList);
        if (!allViewed) {
            alert('You must view all tasks before submitting.');
            return;
        }

        const allTasksPayload = taskList.map(task => {
            const orderedRelatedPosts = taskChanges[task.TaskID]?.[task.itemIndex]?.map(post => ({
                postID: post.postID,
                content: post.content,
                agree: post.agree,
                disagree: post.disagree
            })) || task.candidate_related_posts;

            return {
                taskID: task.TaskID,
                userID,
                ordered_related_posts: orderedRelatedPosts,
                itemIndex: task.itemIndex 
            };
        });

        console.log('Submitting all tasks:', allTasksPayload);

        try {
            await axios.post('https://beta.stacky.social:3002/annotation/submit', { tasks: allTasksPayload });
            alert('Submission successful!');
        } catch (error) {
            console.error('Failed to submit:', error);
            alert('Submission failed.');
        }
        refreshAvatar();
    };

    const refreshAvatar = () => {
        const randomAvatar = avatars[Math.floor(Math.random() * avatars.length)];
        setAvatar(randomAvatar);
    };

    return (
        <Container fluid>
            <div style={{ 
                marginTop: rem(20),
                marginBottom: rem(20) }}>
                <Button style={{ marginRight: rem(20) }} onClick={fetchTaskList}>GET NEW TASK LIST</Button>
                <Button style={{ marginRight: rem(20) }} onClick={handlePreviousTask}>PREVIOUS</Button>
                <Button style={{ marginRight: rem(20) }} onClick={handleNextTask}>NEXT</Button>
                <Button style={{ marginRight: rem(20) }} onClick={handleSubmit}>SUBMIT</Button>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', width: '80%'  }}>
                <div style={{width:'10%'}}>
                    <AvatarDisplay avatar={avatar} />
                </div>
           
                <div style={{width:'50%'}}>
                    <ProgressCard currentTaskIndex={currentTaskIndex} totalTasks={taskList.length} />
                </div>
          
            </div>
               
            <div style={{ display: 'flex', width: '100%' }}>
                <div style={{ width: '35%', paddingRight: rem(10) }}>
                    {loading && <LoadingOverlay visible={loading} />}
                    {ancestors.map(ancestor => (
                        <PostCard key={ancestor.id} post={ancestor} />
                    ))}
                    {post && <PostCard post={post} isFocusPost={true} />}
                </div>
                <RightColumn relatedPosts={relatedPosts} setRelatedPosts={setRelatedPosts} />
            </div>
        </Container>
    );
}
