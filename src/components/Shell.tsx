import {AppShell, Burger, Group, Skeleton, Text, MantineProvider, Space, Paper} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';

import { ReactNode } from 'react';
import {Navbar} from "./NavBar/Navbar";
import StackLogo from '../utils/StackLogo';
import SearchBar from "./SearchBar/SearchBar";
import { SubmitPost } from "./SubmitPost/SubmitPost";
import React from 'react';

interface ShellProps {
    children?: ReactNode;
}

export function Shell({ children }: ShellProps) {
    const [opened, { toggle }] = useDisclosure();
    return (
        <AppShell

        header={{ height: 60 }}
        navbar={{ width: { sm: 200, lg: 300 }, breakpoint: 'md', collapsed: { mobile: !opened } }}
        aside={{ width: 500, breakpoint: 'md', collapsed: { desktop: false, mobile: true } }}
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
            <AppShell.Main
            
            >
                {children}
            </AppShell.Main>
              <AppShell.Aside p="lg">
                <SearchBar />
                <SubmitPost />
            </AppShell.Aside>
            <AppShell.Aside p="lg">
                <SearchBar />
                <SubmitPost />
            </AppShell.Aside>

            {/*    Footer*/}
            {/*</AppShell.Footer>*/}
        </AppShell>
    );
}
