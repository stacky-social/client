"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Shell } from "../../../components/Shell";
import {
    Avatar,
    Group,
    LoadingOverlay,
    Paper,
    Text,
    Divider,
    Button,
    Image,
    TextInput,
    Card,
    Modal
} from "@mantine/core";
import { IconBookmark, IconHeart, IconMessageCircle, IconShare, IconSearch } from "@tabler/icons-react";
import axios from 'axios';
import classes from './postId.module.css';
import ExpandModal from "../../../components/ExpandModal";

const MastodonInstanceUrl = 'https://mastodon.social'; // Mastodon instance URL

export default function PostView({ params }: { params: { id: string } }) {
    const router = useRouter();
    const { id } = params;
    const [loading, setLoading] = useState(true);
    const [post, setPost] = useState<any | null>(null);
    const [replies, setReplies] = useState<any[]>([]);
    const [randomTexts, setRandomTexts] = useState<string[]>([]);
    const [modalOpened, setModalOpened] = useState(false);
    const [modalContent, setModalContent] = useState<string>('');

    const initialRandomTexts = [
        "Exploring the depths of space!",
        "Discovering new programming paradigms.",
        "The future of artificial intelligence.",
        "Advancements in quantum computing.",
        "The rise of renewable energy."
    ];

    useEffect(() => {
        fetchPostAndReplies(id);
    }, [id]);

    useEffect(() => {
        generateRandomTexts();
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
        } catch (error) {
            console.error('Failed to fetch post or replies:', error);
        } finally {
            setLoading(false);
        }
    };

    const generateRandomTexts = () => {
        const shuffledTexts = initialRandomTexts.sort(() => 0.5 - Math.random()).slice(0, 4);
        setRandomTexts(shuffledTexts);
    };

    if (!post && !loading) {
        return (
            <Shell>
                <Paper withBorder radius="md" mt={20} p="lg">
                    <Text size="sm">Post not found.</Text>
                </Paper>
            </Shell>
        );
    }

    const handleNavigate = (replyId: string) => {
        router.push(`/posts/${replyId}`);
    };

    const handleLike = () => {
        console.log("Like post:", id);
        // handle like logic
    };

    const handleSave = () => {
        console.log("Save post:", id);
        // hanle save logic
    };

    const handleShare = () => {
        console.log("Share post:", id);
        // hanle share logic
    };

    const handleReplyClick = (replyId: string) => {
        router.push(`/posts/${replyId}`);
    };

    const explorePages = () => {
        generateRandomTexts();
    };

    const handleCardClick = (text: string) => {
        setModalContent(text);
        setModalOpened(true);
    };

    const stacks = () => {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', margin: '2rem' }}>
                {randomTexts.map((text, index) => (
                    <Card withBorder radius="md" p={0} className={classes.card} key={index} style={{ margin: '1rem' }} onClick={() => handleCardClick(text)}>
                        <Group wrap="nowrap" gap={0}>
                            <Image
                                src="https://images.unsplash.com/photo-1602080858428-57174f9431cf?ixlib=rb-1.2.1&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=400&q=80"
                                height={160}
                            />
                            <div className={classes.body}>
                                <Text tt="uppercase" c="dimmed" fw={700} size="xs">
                                    technology
                                </Text>
                                <Text className={classes.title} mt="xs" mb="md">
                                    {text}
                                </Text>
                                <Group wrap="nowrap" gap="xs">
                                    <Group gap="xs" wrap="nowrap">
                                        <Avatar
                                            size={20}
                                            src="https://raw.githubusercontent.com/mantinedev/mantine/master/.demo/avatars/avatar-8.png"
                                        />
                                        <Text size="xs">Elsa Typechecker</Text>
                                    </Group>
                                    <Text size="xs" c="dimmed">
                                        •
                                    </Text>
                                    <Text size="xs" c="dimmed">
                                        Feb 6th
                                    </Text>
                                </Group>
                            </div>
                        </Group>
                    </Card>
                ))}
            </div>
        );
    };

    return (
        <Shell>
            <Modal
                opened={modalOpened}
                onClose={() => setModalOpened(false)}
                title="Expand Content"
                centered
                size="auto"
            >
                <ExpandModal />
            </Modal>

            <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', width: '100%'}}>
                <div style={{gridColumn: '1 / 2'}}>
                    <Paper withBorder radius="md" mt={20} p="lg" style={{position: 'relative'}} shadow="lg">
                        <LoadingOverlay visible={loading} zIndex={1000} overlayProps={{radius: "sm", blur: 2}}/>
                        <Group>
                            <Avatar src={post?.account.avatar} alt={post?.account.username} radius="xl"/>
                            <div>
                                <Text size="sm">{post?.account.username}</Text>
                                <Text size="xs">{new Date(post?.created_at).toLocaleString()}</Text>
                            </div>
                        </Group>
                        <Text pl={54} pt="sm" size="sm" dangerouslySetInnerHTML={{ __html: post?.content }} />
                        <Text pl={54} pt="sm" size="sm">Post Id: {post?.id}</Text>
                        <Divider my="md"/>
                        <Group justify="space-between" mx="20">
                            <Button variant="subtle" size="sm" radius="lg" onClick={() => handleReplyClick(id)}>
                                <IconMessageCircle size={20}/> <Text>{post?.replies_count}</Text>
                            </Button>
                            <Button variant="subtle" size="sm" radius="lg" onClick={handleLike}>
                                <IconHeart size={20}/>
                            </Button>
                            <Button variant="subtle" size="sm" radius="lg" onClick={handleSave}>
                                <IconBookmark size={20}/>
                            </Button>
                            <Button variant="subtle" size="sm" radius="lg" onClick={handleShare}>
                                <IconShare size={20}/>
                            </Button>
                            <Button variant="subtle" size="sm" radius="lg" onClick={explorePages}>
                                <IconSearch size={20}/>
                            </Button>
                        </Group>
                    </Paper>
                    <Divider my="md"/>
                    <Group>
                        <Avatar src={post?.account.avatar} alt={post?.account.username} radius="xl"/>
                        <TextInput
                            placeholder="Post your reply"
                            radius="lg"
                            size="xl"
                            rightSection={
                                <Button>
                                    Send
                                </Button>
                            }
                            rightSectionWidth={100}
                            style={{flex: 1}}
                        />
                    </Group>
                    <Divider my="md"/>
                    {replies.map((reply, index) => (
                        <div key={index}>
                            <Paper withBorder radius="md" mt={20} p="lg" style={{position: 'relative'}} shadow="md">
                                <LoadingOverlay visible={loading} zIndex={1000} overlayProps={{radius: "sm", blur: 2}}/>
                                <Group>
                                    <Avatar src={reply.account.avatar} alt={reply.account.username} radius="xl"/>
                                    <div>
                                        <Text size="sm">{reply.account.username}</Text>
                                        <Text size="xs">{new Date(reply.created_at).toLocaleString()}</Text>
                                    </div>
                                </Group>
                                <Text pl={54} pt="sm" size="sm" dangerouslySetInnerHTML={{ __html: reply.content }} />
                                <Button onClick={() => handleNavigate(reply.id)}>view details</Button>
                            </Paper>
                        </div>
                    ))}
                </div>
                <div style={{gridColumn: '2 / 3'}}>
                    {stacks()}
                </div>
            </div>
        </Shell>
    );
}
