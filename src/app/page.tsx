"use client"

import {Navbar} from "../components/Navbar";
import {Shell} from "../components/Shell";
import {Header} from "../components/Header";
import {Footer} from "../components/Footer";
import {Title, Text, Button, Group, Space} from "@mantine/core";
import classes from './LandingPage.module.css';

export default function LandingPage() {
  return (
      <>
          <Header />
          <Title className={classes.title} ta="center" mt={60}>
              Project{' '}
              <Text inherit variant="gradient" component="span" gradient={{ from: 'pink', to: 'yellow' }}>
                  STACKS
              </Text>
          </Title>
          <Text c="dimmed" ta="center" size="lg" maw={580} mx="auto" mt="xl">
              AI-Curated Democratic Discourse
          </Text>
          <Group justify="center" mt="1rem">
              <Button
                  component="a"
                  href="/home"
                  size="xl"
                  variant="gradient"
                  className={classes.control}
                  gradient={{ from: 'blue', to: 'cyan' }}
              >
                  Enter
              </Button>
          </Group>
          <Footer />
      </>
  );
}
