"use client";
import { Dispatch, SetStateAction } from 'react';
import { Container, Group, Box } from '@mantine/core';
import classes from './DoubleHeader.module.css';

const mainLinks = [
    { link: 'posts', label: 'Posts' },
    { link: 'hashtags', label: 'Hashtags' },
    { link: 'people', label: 'People' },
    { link: 'news', label: 'News' },
];

interface DoubleHeaderProps {
    active: string;
    setActive: Dispatch<SetStateAction<string>>;
}

export function DoubleHeader({ active, setActive }: DoubleHeaderProps) {
    const mainItems = mainLinks.map((item) => (
        <a
            key={item.label}
            className={classes.mainLink}
            data-active={item.link === active || undefined}
            onClick={(event) => {
                event.preventDefault();
                setActive(item.link);
            }}
        >
            {item.label}
        </a>
    ));

    return (
        <header className={classes.header}>
            <Container className={classes.inner}>
                <Box className={classes.links}>
                    <Group gap={2} justify="center" className={classes.mainLinks}>
                        {mainItems}
                    </Group>
                </Box>
            </Container>
        </header>
    );
}
