import {AppShell, Burger, Group, Skeleton, Text, MantineProvider, Space} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { MantineLogo } from '@mantinex/mantine-logo';
import { ReactNode } from 'react';
import {Navbar} from "./Navbar";

interface ShellProps {
    children?: ReactNode;
}

export function Shell({ children }: ShellProps) {
    const [opened, { toggle }] = useDisclosure();
    return (
        <AppShell
            layout="alt"
            header={{height: 60}}
            footer={{ height: 60 }}
            navbar={{ width: {sm: 200, lg: 300}, breakpoint: 'md', collapsed: { mobile: !opened } }}
            aside={{ width: {sm: 200, md: 400, lg: 600}, breakpoint: 'md', collapsed: { desktop: false, mobile: true } }}
            padding="md"
        >
            <AppShell.Header>
                <Group h="100%" px="md">
                    <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
                    <MantineLogo size={30} />
                </Group>
            </AppShell.Header>
            <AppShell.Navbar p="md">
                <Group >
                    <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
                </Group>
                <Navbar />
            </AppShell.Navbar>
            <AppShell.Main>
                {children}
            </AppShell.Main>
            <AppShell.Aside p="md">
                Aside
            </AppShell.Aside>
            {/*<AppShell.Footer p="md">*/}
            {/*    Footer*/}
            {/*</AppShell.Footer>*/}
        </AppShell>
    );
}
