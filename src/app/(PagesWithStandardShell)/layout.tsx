"use client"

import {AppShell, Burger, Group, Skeleton, Text, MantineProvider, Space, Paper} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { ReactNode } from 'react';
import {Navbar} from "../../components/NavBar/Navbar";
import StackLogo from '../../utils/StackLogo';
import SearchBar from "../../components/SearchBar/SearchBar";
import { SubmitPost } from "../../components/SubmitPost/SubmitPost";

interface ShellProps {
    children?: ReactNode;
}

export default function NormalPageLayout({ children }: {  children: React.ReactNode; }) {
    const [opened, { toggle }] = useDisclosure();

    return (
        <AppShell
            header={{ height: 60 }}
            navbar={{ width: { sm: 200, lg: 300 }, breakpoint: 'sm', collapsed: { mobile: !opened } }}
            // aside={{ width: 500, breakpoint: 'md', collapsed: { desktop: false, mobile: true } }}
            padding="md"
        >
            <AppShell.Header>
                <Group h="100%" px="md">
                    <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
                    <StackLogo size={30} />
                </Group>
            </AppShell.Header>
            <AppShell.Navbar p="md">
                <Navbar />
            </AppShell.Navbar>
            <AppShell.Main
            style={
                {
                    backgroundColor: '#FCFBF5',
                }
            }>
                {children}
            </AppShell.Main>
            {/* <AppShell.Aside p="lg">
                <SearchBar />
                <SubmitPost />
            
            </AppShell.Aside> */}
        </AppShell>
    );
}
