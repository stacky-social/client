"use client"

import { Text, Avatar, Group, TypographyStylesProvider, Paper } from '@mantine/core';
import { useRouter } from 'next/navigation';

interface PostProps {
    id: number;
    text: string;
}

export default function Post({ id, text }: PostProps) {
    const router = useRouter();

    // Function to handle click event and redirect to the post page
    const handleNavigate = () => {
        router.push(`/posts/${id}`);
    };

    return (
        <Paper withBorder radius="md"  mt={20} p="lg">
            <Group>
                <Avatar
                    src="https://raw.githubusercontent.com/mantinedev/mantine/master/.demo/avatars/avatar-1.png"
                    alt="Jacob Warnhalter"
                    radius="xl"
                />
                <div>
                    <Text size="sm">Jacob Warnhalter</Text>
                    <Text size="xs" c="dimmed">
                        10 minutes ago
                    </Text>
                </div>
            </Group>
            <Text pl={54} pt="sm" size="sm">
                {text}
            </Text>
            <Text pl={54} pt="sm" size="sm">
              Post Id: {id}
            </Text>
        </Paper>
    );
}
