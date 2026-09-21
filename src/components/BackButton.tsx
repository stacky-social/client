"use client";

import { useRouter } from 'next/navigation';
import { UnstyledButton, Text, Group } from '@mantine/core';
import { IconArrowLeft } from '@tabler/icons-react';

interface BackButtonProps {
  /**
   * Where to go when nothing recorded how this page was reached — a deep link
   * or a shared URL without `?from=`. Defaults to Home.
   */
  fallbackHref?: string;
}

/**
 * A PAGE control: it returns you to wherever you opened this post from.
 *
 * It deliberately does not call `router.back()`. Filter interactions push
 * history entries, so browser Back walks back through them one at a time —
 * useful, and left exactly as it is. But spending a labelled "Back" button on
 * that leaves the reader on the same post wondering why nothing happened, which
 * is not what the affordance promises. The two are now separate: this leaves the
 * page, browser Back and the keyboard shortcut undo the filters.
 */
export default function BackButton({ fallbackHref = '/home' }: BackButtonProps) {
  const router = useRouter();

  const leavePage = () => {
    const here = window.location.pathname;
    let previous: string | null = null;
    try {
      previous = sessionStorage.getItem(`previousPath:${here}`);
    } catch {
      // Private mode or blocked storage: fall through to the fallback route.
      previous = null;
    }
    // A recorded origin pointing back at this same post would strand the
    // reader here, which is the very thing this button exists to avoid.
    const target = previous && previous.split('?')[0] !== here ? previous : fallbackHref;
    router.push(target);
  };

  return (
    <UnstyledButton onClick={leavePage} style={{ marginBottom: '1rem' }}>
      <Group gap={6}>
        <IconArrowLeft size={18} color="#1c2b4a" />
        <Text size="sm" fw={600} c="#1c2b4a">Back</Text>
      </Group>
    </UnstyledButton>
  );
}
