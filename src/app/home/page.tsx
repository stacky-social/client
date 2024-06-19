"use client";

import { AppShell, Burger, Group } from "@mantine/core";
import StackLogo from "../../utils/StackLogo";
import { Navbar } from "../../components/NavBar/Navbar";
import { useDisclosure } from "@mantine/hooks";
import {SubmitPost} from "../../components/SubmitPost/SubmitPost";
import Posts from "../../components/Posts/Posts";

export default function HomePage() {
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
                <Navbar />
            </AppShell.Navbar>
            <AppShell.Main>
                <Posts />
            </AppShell.Main>
            <AppShell.Aside p="md">
                <SubmitPost />
            </AppShell.Aside>
        </AppShell>
    );
}
