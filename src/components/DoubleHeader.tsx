"use client";
import { useState } from 'react';
import { Container, Anchor, Group, Burger, Box } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useRouter } from 'next/navigation';
import classes from './DoubleHeader.module.css';

const mainLinks = [
  { link: '/explore/posts', label: 'Posts' },
  { link: '/explore/hashtags', label: 'Hashtags' },
  { link: '/explore/people', label: 'People' },
  { link: '/explore/news', label: 'News' },
];

export function DoubleHeader() {
  const [opened, { toggle }] = useDisclosure(false);
  const [active, setActive] = useState(0);
  const router = useRouter();

  const mainItems = mainLinks.map((item, index) => (
    <a
      href={item.link}
      key={item.label}
      className={classes.mainLink}
      data-active={index === active || undefined}
      onClick={(event) => {
        event.preventDefault();
        setActive(index);
        router.push(item.link);
      }}
    >
      {item.label}
    </a>
  ));

  return (
    <header className={classes.header}>
      <Container className={classes.inner}>
        <Box className={classes.links} visibleFrom="sm">
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
