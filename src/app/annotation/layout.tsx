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
                <Stack >
                    <Title order={2}>Annotation Guidelines</Title>
                    <Text>
                        (1) How relevant is this comment to the focus post?
                    </Text>
                    <Text>
                        (2) In general does this post agree with the focus post, disagree with the focus post, or is it unclear?
                    </Text>
                    <Text>
                        (3) Does this post make an explicit argument/claim?
                    </Text>
                    <Text>
                        (4) Does this post present explicit evidence/claim to truth?
                    </Text>
                    <Text>
                        (5) Is this post compelling to read (funny, exciting, easy to understand, etc.)?
                    </Text>
                    <Text>
                        (6) Overall, does this post add to a conversation or argument about the topic?
                    </Text>
                </Stack>

                {children}
            </AppShell.Main>
        </AppShell>
    );
}
