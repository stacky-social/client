import {AppShell, Burger, Group, Skeleton, Text, MantineProvider, Space, Paper} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { MantineLogo } from '@mantinex/mantine-logo';
import { ReactNode } from 'react';
import {Navbar} from "./NavBar/Navbar";
import StackLogo from '../utils/StackLogo';

interface ShellProps {
    children?: ReactNode;
}

export function Shell({ children }: ShellProps) {
    const [opened, { toggle }] = useDisclosure();
    return (
        <AppShell
            layout="alt"
            header={{height: 60}}
            navbar={{ width: {sm: 200, lg: 300}, breakpoint: 'md', collapsed: { mobile: !opened } }}
            padding="md"
        >
            <AppShell.Header>
                <Group h="100%" px="md">
                    <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
                    <StackLogo size={30} />
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

            {/*    Footer*/}
            {/*</AppShell.Footer>*/}
        </AppShell>
    );
}
