"use client";

import { AppShell, Burger, Group, Text, Title, Stack } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { ReactNode } from 'react';

import StackLogo from '../../utils/StackLogo';

export default function AnnotationPageLayout({ children }: { children: ReactNode }) {
    const [opened, { toggle }] = useDisclosure();

    return (
        <AppShell
            header={{ height: 60 }}
            padding="md"
        >
            <AppShell.Header>
                <Group h="100%" px="md">
                    <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
                    <StackLogo size={30} />
                </Group>
            </AppShell.Header>

            <AppShell.Main>
                <Stack>
                    <Title order={2}>Annotation Guidelines</Title>
                    <Text>
                        Read the conversation on the left, ending in the BLUE POST.<br/>
                        Rank the 8 posts on the right by whether they EXTEND this conversation in a USEFUL way, continuing from the topic of the blue post.
                    </Text>
                    <Text>
                        That is, which single post should someone read next if they were trying to understand and frame the topic according to their own values?
                        <br/>
                        Useful posts may offer additional perspectives, values, predictions, proposals, comparisons, or evidence about the topic of the discussion.
                        <br/>
                        Posts that are understandable, engagingly written, or funny are more likely to help readers and convince them to keep reading.
                    </Text>
                    <Text>
                        Rank all 8 posts from most to least useful.
                        <br/>
                        Drag the red bars to divide them into 3 tiers:
                        <br/>
                        * top tier: Reading any ONE of these posts would be a good use of time.
                    <br/>
                        * middle tier: These posts are on-topic, but could be counted rather than read.
                    <br/>
                        * bottom tier: This post is off-topic.
                    </Text>
                    <Text>
                        Also, does each of the 8 posts AGREE or DISAGREE with the blue post's main views, claims, evidence, or values?
                        <br/>
                        Select "Agrees" or "Disagrees" accordingly. You may select neither or both.
                    </Text>
                </Stack>

                {children}
            </AppShell.Main>
        </AppShell>
    );
}
