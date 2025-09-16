"use client"

import {AppShell, Burger, Group, Skeleton, Text, MantineProvider, Space, Paper, Drawer} from '@mantine/core';
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
            header={{ height: { base: 64, sm: 0 } }}
            navbar={{ width: 210, breakpoint: 'sm' }}
            // aside={{ width: 500, breakpoint: 'md', collapsed: { desktop: false, mobile: true } }}
            padding="md"
        >
            <AppShell.Header hiddenFrom="sm" bg="#FCFBF5">
                <Group h="100%" px="md">
                    <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
                    <StackLogo size={30} />
                </Group>
            </AppShell.Header>
            <AppShell.Navbar p="md" visibleFrom="sm" style={{ backgroundColor: '#FCFBF5' }}>
                <Navbar />
            </AppShell.Navbar>
            <Drawer 
                opened={opened} 
                onClose={toggle} 
                padding="md" 
                size="xs" 
                styles={{
                    content: {
                      backgroundColor: '#FCFBF5',
                    },
                    header: {
                      backgroundColor: '#FCFBF5',
                    },
                  }}
                  lockScroll={false}
            >
                <Navbar />
            </Drawer>
            <AppShell.Main
            style={
                {
                    backgroundColor: '#FEFEFB',
                    marginLeft: 'auto',
                    marginRight: 'auto',
                    width: '800px',
                    marginTop: '2rem',
                }
            }>
                {children}
            </AppShell.Main>
        </AppShell>
    );
}
