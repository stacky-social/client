"use client"

import {AppShell, Burger, Group} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';

import {Navbar} from "../../components/NavBar/Navbar";
import StackLogo from '../../utils/StackLogo';


export default function PostsPageLayout({ children }: {  children: React.ReactNode; }) {
    const [opened, { toggle }] = useDisclosure();

    return (
        <AppShell
            header={{ height: 60 }}
            navbar={{ width: { sm: 200, lg: 300 }, breakpoint: 'sm', collapsed: { mobile: !opened } }}
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
                   backgroundColor: 'F1FAFF',
                }
            }
            >
                {children}
            </AppShell.Main>
        </AppShell>
    );
}
