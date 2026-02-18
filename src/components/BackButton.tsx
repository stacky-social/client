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

// 'unchecked' = haven't read sessionStorage yet, 'none' = checked but no previous path
type BackButtonState = 'unchecked' | 'none' | { label: string | null };

export default function BackButton() {
  const router = useRouter();
  const [state, setState] = useState<BackButtonState>('unchecked');

  useEffect(() => {
    const prev = sessionStorage.getItem(`previousPath:${window.location.pathname}`);
    if (prev) {
      setState({ label: labelFromPath(prev) });
    } else {
      setState('none');
    }
  }, []);

  // Haven't checked yet or no previous path — don't render
  if (state === 'unchecked' || state === 'none') return null;

  const displayLabel = state.label;

  return (
    <UnstyledButton
      onClick={() => router.back()}
      style={{ marginBottom: '1rem' }}
    >
      <Group gap={6}>
        <IconArrowLeft size={18} color="#324e93" />
        <Text size="sm" fw={600} c="#324e93">
          {displayLabel ? `Back to ${displayLabel}` : 'Back'}
        </Text>
      </Group>
    </UnstyledButton>
  );
}
