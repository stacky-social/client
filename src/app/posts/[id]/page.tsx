"use client"

import { useRouter } from 'next/navigation';
import { Shell } from "../../../components/Shell";
import {
    Avatar,
    Group,
    LoadingOverlay,
    Paper,
    Text,
    Divider,
    UnstyledButton,
    Button,
    Image,
    TextInput,
    Card,
    Modal
} from "@mantine/core";
import FakePosts from '../../FakeData/FakePosts';
import { useEffect, useState } from "react";
import { PostType, ReplyType } from '../../../types/PostType';
import { IconBookmark, IconHeart, IconMessageCircle, IconShare, IconSearch } from "@tabler/icons-react";
import classes from './postId.module.css';
import expandModal from "../../../components/ExpandModal";
import ExpandModal from "../../../components/ExpandModal";


export default function PostView({ params }: { params: { id: string } }) {
    const router = useRouter();
    const { id } = params;
    const [loading, setLoading] = useState(true);
    const [post, setPost] = useState<PostType | ReplyType | null>(null);
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
        const foundItem = findPostOrReply(FakePosts, id);
        setPost(foundItem);
        setLoading(false);
    }, [id]);

    useEffect(() => {
        generateRandomTexts();
    }, []);

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
                            <Avatar src={post?.avatar} alt={post?.author} radius="xl"/>
                            <div>
                                <Text size="sm">{post?.author}</Text>
                                <Text size="xs">10 minutes ago</Text>
                            </div>
                        </Group>
                        <Text pl={54} pt="sm" size="sm">{post?.text}</Text>
                        <Text pl={54} pt="sm" size="sm">Post Id: {post?.postId}</Text>
                        <Divider my="md"/>
                        <Group justify="space-between" mx="20">
                            <Button variant="subtle" size="sm" radius="lg" onClick={() => handleReplyClick(id)}>
                                <IconMessageCircle size={20}/> <Text>{post?.replies?.length}</Text>
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
                        <Avatar src={post?.avatar} alt={post?.author} radius="xl"/>
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
                    {post?.replies?.map((reply, index) => (
                        <div key={index}>
                            <Paper withBorder radius="md" mt={20} p="lg" style={{position: 'relative'}} shadow="md">
                                <LoadingOverlay visible={loading} zIndex={1000} overlayProps={{radius: "sm", blur: 2}}/>
                                <Group>
                                    <Avatar src={reply?.avatar} alt={reply?.author} radius="xl"/>
                                    <div>
                                        <Text size="sm">{reply?.author}</Text>
                                        <Text size="xs">10 minutes ago</Text>
                                    </div>
                                </Group>
                                <Text pl={54} pt="sm" size="sm">{reply.text}</Text>
                                <Text pl={54} pt="sm" size="sm">Reply Id: {reply.postId}</Text>
                                <Divider my="md"/>
                                <Group justify="space-between" mx="20">
                                    <Button variant="subtle" size="sm" radius="lg" onClick={() => handleReplyClick(reply.postId)}>
                                        <IconMessageCircle size={20}/> <Text>{reply?.replies?.length}</Text>
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
