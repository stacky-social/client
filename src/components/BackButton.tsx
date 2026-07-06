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
type BackButtonState = 'unchecked' | 'none' | { label: string | null; path: string };

export default function BackButton() {
  const router = useRouter();
  const [state, setState] = useState<BackButtonState>('unchecked');

  useEffect(() => {
    const prev = sessionStorage.getItem(`previousPath:${window.location.pathname}`);
    if (prev) {
      setState({ label: labelFromPath(prev), path: prev });
    } else {
      setState('none');
    }
  }, []);

  // Haven't checked yet or no previous path — don't render
  if (state === 'unchecked' || state === 'none') return null;

  const displayLabel = state.label;
  const previousPath = state.path;

  // On a cold deep-link there is no in-app history, so router.back() is a
  // silent no-op — or, with an external referrer, exits the SPA. Only go back
  // when the previous history entry is ours; otherwise push the recorded
  // previous path (F-25).
  const handleBack = () => {
    if (
      typeof window !== 'undefined' &&
      window.history.length > 1 &&
      document.referrer.startsWith(window.location.origin)
    ) {
      router.back();
    } else if (previousPath) {
      router.push(previousPath);
    } else {
      router.push('/ChineseEVs');
    }
  };

  return (
    <UnstyledButton
      onClick={handleBack}
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
