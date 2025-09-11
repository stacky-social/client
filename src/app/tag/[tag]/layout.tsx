"use client";

import { AppShell, Burger, Group, Drawer } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { ReactNode } from 'react';
import { Navbar } from '../../../components/NavBar/Navbar';
import StackLogo from '../../../utils/StackLogo';

export default function TagPageLayout({ children }: { children: ReactNode }) {
    const [opened, { toggle }] = useDisclosure();

    return (
        <AppShell
            header={{ height: { base: 64, sm: 0 } }}
            navbar={{ width: 210, breakpoint: 'sm' }}
            padding="md"
        >
            <AppShell.Header hiddenFrom="sm">
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
                removeScrollProps={{ removeScrollBar: false }}
            >
                <Navbar />
            </Drawer>
            <AppShell.Main>
                {children}
            </AppShell.Main>
        </AppShell>
    );
}
