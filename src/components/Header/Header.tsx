"use client"

import { useState } from 'react';
import { Container, Anchor, Group, Burger, Box } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import classes from './Header.module.css';

const userLinks = [
    { link: '#', label: 'Placeholder' },
    { link: '#', label: 'Placeholder' },
    { link: '#', label: 'Placeholder' },
];

const mainLinks = [
    { link: '#', label: 'Placeholder' },
    { link: '#', label: 'Placeholder' },
    { link: '#', label: 'Placeholder' },
    { link: '#', label: 'Placeholder' },
    { link: '#', label: 'Placeholder' },
];

export function Header() {
    const [opened, { toggle }] = useDisclosure(false);
    const [active, setActive] = useState(0);

    const mainItems = mainLinks.map((item, index) => (
        <Anchor<'a'>
            href={item.link}
            key={item.label}
            className={classes.mainLink}
            data-active={index === active || undefined}
            onClick={(event) => {
                event.preventDefault();
                setActive(index);
            }}
        >
            {item.label}
        </Anchor>
    ));

    const secondaryItems = userLinks.map((item) => (
        <Anchor
            href={item.link}
            key={item.label}
            onClick={(event) => event.preventDefault()}
            className={classes.secondaryLink}
        >
            {item.label}
        </Anchor>
    ));

    return (
        <header className={classes.header}>
            <Container className={classes.inner}>
                <Box className={classes.links} visibleFrom="sm">
                    <Group justify="flex-end">{secondaryItems}</Group>
                    <Group gap={0} justify="flex-end" className={classes.mainLinks}>
                        {mainItems}
                    </Group>
                </Box>
                <Burger
                    opened={opened}
                    onClick={toggle}
                    className={classes.burger}
                    size="sm"
                    hiddenFrom="sm"
                />
            </Container>
        </header>
    );
}
