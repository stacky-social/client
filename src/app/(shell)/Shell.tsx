"use client"

import {AppShell, Burger, Group, Drawer, Container} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { ReactNode } from 'react';
import {Navbar} from "../../components/NavBar/Navbar";
import StackLogo from '../../utils/StackLogo';
import { RelatedStacksProvider } from './related-stacks-context';

export default function Shell({ children, aside }: {  children: React.ReactNode; aside: React.ReactNode; }) {
    const [opened, { toggle }] = useDisclosure();

    return (
        <RelatedStacksProvider>
        <AppShell
            header={{ height: { base: 64, sm: 0 } }}
            navbar={{
                width: "clamp(200px, 22vw, 300px)",
                breakpoint: "sm",
                collapsed: { mobile: !opened },
              }}
            aside={{
            width: "clamp(360px, 26vw, 520px)",
            breakpoint: "lg",
            collapsed: { mobile: true },
            }}
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
            <AppShell.Aside
                p="md"
                pt="0"
                withBorder
                style={{ background: "#FCFBF5",
                    overflowY: 'auto',
                    overscrollBehavior: 'contain',
                    scrollbarWidth: 'none',
                    '-ms-overflow-style': 'none',
                    }}
            >
                {aside ?? null}
            </AppShell.Aside>  
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
            <AppShell.Main miw={500}>
                {children}
            </AppShell.Main>
        </AppShell>
        </RelatedStacksProvider>
    );
}
