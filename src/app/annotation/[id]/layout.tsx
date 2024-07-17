"use client";

import { AppShell, Burger, Group } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { ReactNode } from 'react';
import {Navbar} from "../../../components/NavBar/Navbar";
import StackLogo from '../../../utils/StackLogo';


export default function AnnotationPageLayout({ children }: { children: ReactNode }) {
    const [opened, { toggle }] = useDisclosure();

    return (
        <AppShell
            header={{ height: 60 }}
            padding="md"
        >
            <AppShell.Header>
                <Group h="100%" px="md">
                    <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
                    <StackLogo size={30} />
                </Group>
            </AppShell.Header>
          
            <AppShell.Main>
                {children}
            </AppShell.Main>
        </AppShell>
    );
}
