"use client"

import {AppShell, Burger, Group, Drawer, Container} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { ReactNode } from 'react';
import {Navbar} from "../../components/NavBar/Navbar";
import StackLogo from '../../utils/StackLogo';
import { RelatedStacksProvider } from './related-stacks-context';
import { HoverTooltip } from '../../components/HoverTooltip';

export default function Shell({ children, aside }: {  children: React.ReactNode; aside: React.ReactNode; }) {
    const [opened, { toggle }] = useDisclosure();
    const [navCollapsed, { toggle: toggleNav }] = useDisclosure(false);

    return (
        <RelatedStacksProvider>
        <AppShell
            header={{ height: { base: 64, sm: 0 } }}
            navbar={{
                width: navCollapsed ? 0 : "clamp(200px, 22vw, 300px)",
                breakpoint: "sm",
                collapsed: { mobile: !opened, desktop: navCollapsed },
              }}
            aside={{
            width: navCollapsed ? "clamp(400px, 32vw, 600px)" : "clamp(360px, 26vw, 520px)",
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
            <AppShell.Navbar p="md" visibleFrom="sm" style={{
                backgroundColor: '#FCFBF5',
                overflow: 'hidden',
                opacity: navCollapsed ? 0 : 1,
                transition: 'opacity 200ms ease',
            }}>
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
        <HoverTooltip />
        <Burger
            opened={!navCollapsed}
            onClick={toggleNav}
            visibleFrom="sm"
            size="sm"
            aria-label={navCollapsed ? "Expand navigation" : "Collapse navigation"}
            style={{
                position: 'fixed',
                left: navCollapsed ? 16 : 'calc(clamp(200px, 22vw, 300px) - 42px)',
                top: 16,
                zIndex: 300,
                transition: 'left 200ms ease',
            }}
        />
        </RelatedStacksProvider>
    );
}
