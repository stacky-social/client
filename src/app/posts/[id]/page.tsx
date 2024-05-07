"use client"

import { useRouter } from 'next/navigation';
import { Shell } from "../../../components/Shell";
import {Avatar, Group, LoadingOverlay, Paper, Text, Divider, UnstyledButton, Button} from "@mantine/core";
import FakePosts from '../../FakeData/FakePosts';
import { useEffect, useState } from "react";
import { PostType, ReplyType } from '../../../types/PostType';
import {IconBookmark, IconHeart, IconMessageCircle, IconShare} from "@tabler/icons-react";

export default function PostView({ params }: { params: { id: string } }) {
    const router = useRouter();
    const { id } = params;
    const [loading, setLoading] = useState(true);
    const [post, setPost] = useState<PostType | ReplyType | null>(null);

    function findPostOrReply(posts: (PostType | ReplyType)[], id: string): PostType | ReplyType | null {
        for (const post of posts) {
            if (post.postId === id) {  // Assuming all posts and replies share a unique 'postId' field
                return post;
            }
            if (post.replies) {
                const foundReply = findPostOrReply(post.replies, id);
                if (foundReply) {
                    return foundReply;
                }
            }
        }
        return null;
    }

    useEffect(() => {
        const foundItem = findPostOrReply(FakePosts, id);
        setPost(foundItem);
        setLoading(false);
    }, [id]);

    if (!post && !loading) {
        return (
            <Shell>
                <Paper withBorder radius="md" mt={20} p="lg">
                    <Text size="sm">Post not found.</Text>
                </Paper>
            </Shell>
        );
    }

    const handleNavigate = () => {
        router.push(`/posts/${id}`);
    };


    const handleLike = () => {
        console.log("Like post:", id);
        // Add like handling logic here
    };

    const handleSave = () => {
        console.log("Save post:", id);
        // Add save handling logic here
    };

    const handleShare = () => {
        console.log("Share post:", id);
        // Add share handling logic here
    };

    const handleReplyClick = (replyId: string) => {
        router.push(`/posts/${replyId}`);
    };

    return (
        <Shell>
            <Paper withBorder radius="md" mt={20} p="lg" style={{ position: 'relative' }} shadow="lg">
                <LoadingOverlay visible={loading} zIndex={1000} overlayProps={{ radius: "sm", blur: 2 }} />
                <Group>
                    <Avatar src={post?.avatar} alt={post?.author} radius="xl" />
                    <div>
                        <Text size="sm">{post?.author}</Text>
                        <Text size="xs" >10 minutes ago</Text>
                    </div>
                </Group>
                <Text pl={54} pt="sm" size="sm">{post?.text}</Text>
                <Text pl={54} pt="sm" size="sm">Post Id: {post?.postId}</Text>
                <Divider my="md" />
                <Group justify="space-between" mx="20">
                    <Button variant="subtle" size="sm" radius="lg" onClick={handleNavigate}>
                        <IconMessageCircle size={20} /> <Text>{post?.replies?.length}</Text>
                    </Button>
                    <Button variant="subtle" size="sm" radius="lg" onClick={handleLike}>
                        <IconHeart size={20} />
                    </Button>
                    <Button variant="subtle" size="sm" radius="lg" onClick={handleSave}>
                        <IconBookmark size={20} />
                    </Button>
                    <Button variant="subtle" size="sm" radius="lg" onClick={handleShare}>
                        <IconShare size={20} />
                    </Button>
                </Group>
            </Paper>
            <Divider my="md" />
            {post?.replies?.map((reply, index) => (
                <div key={index} >
                    <Paper withBorder radius="md" mt={20} p="lg" style={{ position: 'relative' }} shadow="md">
                        <LoadingOverlay visible={loading} zIndex={1000} overlayProps={{ radius: "sm", blur: 2 }} />
                        <UnstyledButton onClick={() => handleReplyClick(reply.postId)} style={{ width: '100%' }}>
                        <Group>
                            <Avatar src={reply?.avatar} alt={reply?.author} radius="xl" />
                            <div>
                                <Text size="sm">{reply?.author}</Text>
                                <Text size="xs" >10 minutes ago</Text>
                            </div>
                        </Group>
                        <Text pl={54} pt="sm" size="sm">{reply.text}</Text>
                        <Text pl={54} pt="sm" size="sm">Reply Id: {reply.postId}</Text>
                            <Divider my="md" />
                            <Group justify="space-between" mx="20">
                                <Button variant="subtle" size="sm" radius="lg" onClick={handleNavigate}>
                                    <IconMessageCircle size={20} /> <Text>{reply?.replies?.length}</Text>
                                </Button>
                                <Button variant="subtle" size="sm" radius="lg" onClick={handleLike}>
                                    <IconHeart size={20} />
                                </Button>
                                <Button variant="subtle" size="sm" radius="lg" onClick={handleSave}>
                                    <IconBookmark size={20} />
                                </Button>
                                <Button variant="subtle" size="sm" radius="lg" onClick={handleShare}>
                                    <IconShare size={20} />
                                </Button>
                            </Group>
                        </UnstyledButton>
                    </Paper>
                </div>
            ))}
        </Shell>
    );
}
