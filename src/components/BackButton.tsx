'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { UnstyledButton, Text, Group } from '@mantine/core';
import { IconArrowLeft } from '@tabler/icons-react';

function labelFromPath(path: string): string | null {
  if (path.startsWith('/tag/')) {
    const tag = decodeURIComponent(path.replace('/tag/', ''));
    return `#${tag}`;
  }
  if (path === '/' || path === '/home') return 'Home';
  if (path.startsWith('/user/')) return 'Profile';
  return null;
}

export default function BackButton() {
  const router = useRouter();
  const [label, setLabel] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    const prev = sessionStorage.getItem(`previousPath:${window.location.pathname}`);
    if (prev) {
      setLabel(labelFromPath(prev));
    } else {
      setLabel(undefined);
    }
  }, []);

  // undefined = still loading, don't render yet
  if (label === undefined) return null;

  return (
    <UnstyledButton
      onClick={() => router.back()}
      style={{ marginBottom: '1rem' }}
    >
      <Group gap={6}>
        <IconArrowLeft size={18} color="#324e93" />
        <Text size="sm" fw={600} c="#324e93">
          {label ? `Back to ${label}` : 'Back'}
        </Text>
      </Group>
    </UnstyledButton>
  );
}
