"use client"

import { AppShell, Burger, Group, Skeleton, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { MantineLogo } from '@mantinex/mantine-logo';
import {Navbar} from "../../components/Navbar";

export default function HomePage() {
    const [opened, { toggle }] = useDisclosure();

    return (
        <AppShell
            layout="alt"
            header={{ height: 60 }}
            footer={{ height: 60 }}
            navbar={{ width: 310, breakpoint: 'sm', collapsed: { mobile: !opened } }}
            padding="md"
        >
            <AppShell.Header>
                <Group h="100%" px="md">
                    <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
                    <Text> STACK</Text>
                </Group>
            </AppShell.Header>
            <AppShell.Navbar>
                <Navbar />
            </AppShell.Navbar>
            <AppShell.Main>
                Alt layout – Navbar and Aside are rendered on top on Header and Footer
            </AppShell.Main>
            <AppShell.Footer p="md">Footer</AppShell.Footer>
        </AppShell>
    );
}
